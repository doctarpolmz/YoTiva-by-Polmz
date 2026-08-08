/**
 * Inventory.gs
 * Stock is NEVER overwritten directly. Every change goes through
 * applyStockMovement(), which reads current balance, computes the new
 * balance, writes a ledger row, and updates the product's CurrentStock in
 * the same locked operation. This is what prevents two cashiers selling the
 * last unit at once (see Sales.gs for how the lock spans the whole sale).
 */

/**
 * Applies one inventory movement. MUST be called from within withLock() by
 * the caller (Sales.gs / Purchases.gs) when it's part of a larger
 * transaction, so the lock covers the read-check-write as a single unit.
 */
function applyStockMovement(productId, movementType, qtyDelta, reference, userId, notes) {
  const found = findById(SHEET.PRODUCTS, 'ProductID', productId);
  if (!found) throw new Error('Product not found: ' + productId);
  const product = found.record;

  const prevBalance = Number(product.CurrentStock);
  const newBalance = round2(prevBalance + qtyDelta);

  if (newBalance < 0) {
    throw new Error('Insufficient stock for ' + product.Name + '. Available: ' + prevBalance + ', requested: ' + Math.abs(qtyDelta) + '.');
  }

  updateRow(SHEET.PRODUCTS, found.row, { CurrentStock: newBalance, UpdatedAt: nowIso() });

  appendRow(SHEET.INVENTORY_LEDGER, {
    LedgerID: nextId('LEDG'), ProductID: productId, MovementType: movementType,
    Qty: qtyDelta, PrevBalance: prevBalance, NewBalance: newBalance,
    Reference: reference || '', UserID: userId, DateTime: nowIso(), Notes: notes || ''
  });

  const updatedProduct = Object.assign({}, product, { CurrentStock: newBalance });
  checkReorderLevel(updatedProduct);
  return { prevBalance: prevBalance, newBalance: newBalance };
}

function getInventoryLedger(session, productId, limit) {
  requirePermission(session, 'inventory.view');
  let rows = readAll(SHEET.INVENTORY_LEDGER);
  if (productId) rows = rows.filter(function (r) { return r.ProductID === productId; });
  rows.sort(function (a, b) { return new Date(b.DateTime) - new Date(a.DateTime); });
  return ok(rows.slice(0, limit || 200));
}

/** Manual stock adjustment (damage, loss, theft, count variance, etc). */
function adjustStock(session, payload) {
  requirePermission(session, 'inventory.adjust');
  requireFields(payload, ['productId', 'qtyDelta', 'movementType']);
  const validTypes = [MOVEMENT_TYPES.DAMAGE, MOVEMENT_TYPES.LOSS, MOVEMENT_TYPES.THEFT,
    MOVEMENT_TYPES.ADJUSTMENT, MOVEMENT_TYPES.COUNT_VARIANCE, MOVEMENT_TYPES.OPENING];
  if (validTypes.indexOf(payload.movementType) === -1) throw new Error('Invalid movement type for manual adjustment.');

  return withLock(function () {
    const found = findById(SHEET.PRODUCTS, 'ProductID', payload.productId);
    if (!found) throw new Error('Product not found.');

    const result = applyStockMovement(payload.productId, payload.movementType,
      Number(payload.qtyDelta), payload.reference || 'MANUAL', session.userId, payload.reason);

    checkAdjustmentAnomaly(session, found.record, Number(payload.qtyDelta), payload.reference);
    logAudit(session.userId, 'STOCK_ADJUSTED', 'Inventory', payload.productId,
      result.prevBalance, result.newBalance, payload.reason || '');
    return ok(result);
  });
}

/** Stocktake: compares system qty to counted qty and posts a variance movement. */
function submitStockCount(session, payload) {
  requirePermission(session, 'inventory.adjust');
  requireFields(payload, ['productId', 'countedQty']);
  return withLock(function () {
    const found = findById(SHEET.PRODUCTS, 'ProductID', payload.productId);
    if (!found) throw new Error('Product not found.');
    const systemQty = Number(found.record.CurrentStock);
    const counted = Number(payload.countedQty);
    const variance = round2(counted - systemQty);

    if (variance === 0) return ok({ variance: 0, message: 'No variance found.' });

    // Significant variances require an explicit reason (a lightweight
    // stand-in for a manager-authorization step — see Section 6 notes below).
    const threshold = Number(getSetting('SIGNIFICANT_VARIANCE_QTY') || 10);
    if (Math.abs(variance) >= threshold && !payload.reason) {
      throw new Error('This variance (' + variance + ') is significant and requires a reason before it can be posted.');
    }

    const result = applyStockMovement(payload.productId, MOVEMENT_TYPES.COUNT_VARIANCE,
      variance, 'STOCKCOUNT', session.userId, payload.reason || '');
    logAudit(session.userId, 'STOCK_COUNT_VARIANCE', 'Inventory', payload.productId,
      systemQty, counted, payload.reason || '');
    return ok({ variance: variance, prevBalance: result.prevBalance, newBalance: result.newBalance });
  });
}

/** Dead stock: products with no SALE movement in N days that still carry stock. */
function getDeadStock(session, days) {
  requirePermission(session, 'inventory.view');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days || 60));

  const products = readAll(SHEET.PRODUCTS).filter(function (p) { return Number(p.CurrentStock) > 0; });
  const ledger = readAll(SHEET.INVENTORY_LEDGER).filter(function (l) { return l.MovementType === MOVEMENT_TYPES.SALE; });

  const lastSaleByProduct = {};
  ledger.forEach(function (l) {
    const d = new Date(l.DateTime);
    if (!lastSaleByProduct[l.ProductID] || d > lastSaleByProduct[l.ProductID]) lastSaleByProduct[l.ProductID] = d;
  });

  const dead = products.filter(function (p) {
    const last = lastSaleByProduct[p.ProductID];
    return !last || last < cutoff;
  }).map(function (p) {
    return {
      ProductID: p.ProductID, Name: p.Name, CurrentStock: p.CurrentStock,
      InventoryValue: round2(Number(p.CurrentStock) * Number(p.CostPrice)),
      LastSold: lastSaleByProduct[p.ProductID] ? lastSaleByProduct[p.ProductID].toISOString() : 'Never'
    };
  });
  return ok(dead);
}
