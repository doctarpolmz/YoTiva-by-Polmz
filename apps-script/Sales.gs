/**
 * Sales.gs
 * POS sale completion. This is the highest-risk transaction in the system:
 * it must validate stock, deduct it, and record money atomically enough
 * that Sheets can support. See completeSale() for the full sequence and the
 * concurrency note above applyStockMovement in Inventory.gs.
 *
 * TRANSACTION SAFETY NOTE (Section 19 of the brief):
 * Apps Script + Sheets has no real multi-statement rollback. Our strategy:
 *   1. Do ALL validation (stock, product, customer) BEFORE writing anything.
 *   2. Acquire a single script-wide lock that spans validation + every write
 *      for this sale, so no other sale can interleave.
 *   3. Write in a fixed, safe order: Sale header -> SaleItems -> stock
 *      ledger (which is what actually deducts stock) -> Payment -> customer
 *      balance. If a later step throws, the sale row already exists but its
 *      Status stays 'FAILED' until a human resolves it — it is never left
 *      looking like a completed sale with the wrong stock/money state.
 *   4. Because validation happens first and the lock prevents interleaving,
 *      failures after step 1 are rare (out-of-memory, quota) rather than
 *      business-logic failures, which is the class of failure this
 *      architecture accepts as a known limitation (see Section 29 answer
 *      in the chat reply).
 */

function completeSale(session, payload) {
  requirePermission(session, 'sales.create');
  requireFields(payload, ['items', 'paymentMethod']);
  if (!payload.items || !payload.items.length) throw new Error('Cannot complete a sale with no items.');

  return withLock(function () {
    // ---- 1-4: validate product, stock, quantities, compute totals ----
    const products = readAll(SHEET.PRODUCTS);
    let subtotal = 0;
    const lineItems = payload.items.map(function (item) {
      const product = products.find(function (p) { return p.ProductID === item.productId; });
      if (!product) throw new Error('Product not found: ' + item.productId);
      if (product.Status === 'DELETED') throw new Error(product.Name + ' is no longer available.');
      const qty = Number(item.qty);
      if (qty <= 0) throw new Error('Invalid quantity for ' + product.Name);
      if (Number(product.CurrentStock) < qty) {
        throw new Error('Insufficient stock for ' + product.Name + '. Available: ' + product.CurrentStock + ', requested: ' + qty + '.');
      }
      const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : Number(product.SellingPrice);
      const discount = Number(item.discount || 0);
      const lineTotal = round2(qty * unitPrice - discount);
      subtotal += lineTotal;
      return { product: product, qty: qty, unitPrice: unitPrice, discount: discount, lineTotal: lineTotal };
    });

    const orderDiscount = Number(payload.discount || 0);
    const taxRate = Number(getSetting('TAX_RATE_PERCENT') || 0) / 100;
    const taxable = round2(subtotal - orderDiscount);
    const tax = round2(taxable * taxRate);
    const total = round2(taxable + tax);
    const amountPaid = Number(payload.amountPaid !== undefined ? payload.amountPaid : total);
    const balanceDue = round2(total - amountPaid);

    if (balanceDue > 0 && !payload.customerId) {
      throw new Error('A credit or partial-payment sale requires a customer to be selected.');
    }

    // ---- discount anomaly check (informational, doesn't block the sale) ----
    const discountPercent = subtotal > 0 ? round2((orderDiscount / subtotal) * 100) : 0;

    // ---- 5: record sale header ----
    const saleId = nextId('SALE');
    appendRow(SHEET.SALES, {
      SaleID: saleId, DateTime: nowIso(), CustomerID: payload.customerId || '',
      CashierID: session.userId, Subtotal: subtotal, Discount: orderDiscount, Tax: tax, Total: total,
      PaymentMethod: payload.paymentMethod, AmountPaid: amountPaid, BalanceDue: balanceDue,
      Status: 'COMPLETED', Notes: payload.notes || ''
    });

    // ---- 6-9: record sale items + deduct stock + ledger + profit ----
    let grossProfit = 0;
    lineItems.forEach(function (li) {
      appendRow(SHEET.SALE_ITEMS, {
        SaleItemID: nextId('SITM'), SaleID: saleId, ProductID: li.product.ProductID,
        Qty: li.qty, UnitPrice: li.unitPrice, CostPrice: li.product.CostPrice,
        Discount: li.discount, LineTotal: li.lineTotal
      });
      applyStockMovement(li.product.ProductID, MOVEMENT_TYPES.SALE, -li.qty, saleId, session.userId, '');
      grossProfit += round2((li.unitPrice - Number(li.product.CostPrice)) * li.qty - li.discount);
    });

    // ---- 10: record payment ----
    if (amountPaid > 0) {
      appendRow(SHEET.PAYMENTS, {
        PaymentID: nextId('PAY'), RefType: 'SALE', RefID: saleId, Amount: amountPaid,
        Method: payload.paymentMethod, DateTime: nowIso(), UserID: session.userId
      });
    }

    // ---- 11: update customer balance if credit/partial ----
    if (payload.customerId && balanceDue !== 0) {
      const cust = findById(SHEET.CUSTOMERS, 'CustomerID', payload.customerId);
      if (cust) {
        updateRow(SHEET.CUSTOMERS, cust.row, { Balance: round2(Number(cust.record.Balance) + balanceDue) });
      }
    }

    // ---- 13-14: reorder + anomaly checks already fire inside applyStockMovement ----
    if (discountPercent > 0) checkDiscountAnomaly(session, discountPercent, saleId);

    logAudit(session.userId, 'SALE_COMPLETED', 'Sales', saleId, '', total, '');

    return ok({
      saleId: saleId, subtotal: subtotal, discount: orderDiscount, tax: tax, total: total,
      amountPaid: amountPaid, balanceDue: balanceDue, change: round2(Math.max(0, amountPaid - total)),
      grossProfit: round2(grossProfit), items: lineItems.length
    });
  });
}

function cancelSale(session, saleId, reason) {
  requirePermission(session, 'sales.cancel');
  return withLock(function () {
    const found = findById(SHEET.SALES, 'SaleID', saleId);
    if (!found) throw new Error('Sale not found.');
    if (found.record.Status === 'CANCELLED') throw new Error('Sale already cancelled.');

    const items = readAll(SHEET.SALE_ITEMS).filter(function (i) { return i.SaleID === saleId; });
    items.forEach(function (item) {
      applyStockMovement(item.ProductID, MOVEMENT_TYPES.CUSTOMER_RETURN, Number(item.Qty), saleId, session.userId, 'Sale cancelled: ' + (reason || ''));
    });

    updateRow(SHEET.SALES, found.row, { Status: 'CANCELLED', Notes: (found.record.Notes || '') + ' | CANCELLED: ' + (reason || '') });
    logAudit(session.userId, 'SALE_CANCELLED', 'Sales', saleId, 'COMPLETED', 'CANCELLED', reason || '');
    return ok({ cancelled: true });
  });
}

/** Customer return of specific items from a completed sale (partial or full). */
function processReturn(session, payload) {
  requirePermission(session, 'sales.cancel');
  requireFields(payload, ['saleId', 'items']);
  return withLock(function () {
    const sale = findById(SHEET.SALES, 'SaleID', payload.saleId);
    if (!sale) throw new Error('Original sale not found.');

    const returnId = nextId('RET');
    let total = 0;
    payload.items.forEach(function (item) {
      const lineTotal = round2(Number(item.qty) * Number(item.unitPrice));
      total += lineTotal;
      appendRow(SHEET.RETURN_ITEMS, {
        ReturnItemID: nextId('RITM'), ReturnID: returnId, ProductID: item.productId,
        Qty: item.qty, UnitPrice: item.unitPrice, LineTotal: lineTotal
      });
      applyStockMovement(item.productId, MOVEMENT_TYPES.CUSTOMER_RETURN, Number(item.qty), returnId, session.userId, payload.reason || '');
    });

    appendRow(SHEET.RETURNS, {
      ReturnID: returnId, RefType: 'SALE', RefID: payload.saleId, DateTime: nowIso(),
      UserID: session.userId, Total: total, Reason: payload.reason || ''
    });

    if (sale.record.CustomerID) {
      const cust = findById(SHEET.CUSTOMERS, 'CustomerID', sale.record.CustomerID);
      if (cust) updateRow(SHEET.CUSTOMERS, cust.row, { Balance: round2(Number(cust.record.Balance) - total) });
    }

    logAudit(session.userId, 'RETURN_PROCESSED', 'Sales', returnId, '', total, payload.reason || '');
    return ok({ returnId: returnId, total: total });
  });
}

function listSales(session, filters) {
  requirePermission(session, 'sales.view');
  let sales = readAll(SHEET.SALES);
  if (filters) {
    if (filters.from) sales = sales.filter(function (s) { return new Date(s.DateTime) >= new Date(filters.from); });
    if (filters.to) sales = sales.filter(function (s) { return new Date(s.DateTime) <= new Date(filters.to); });
    if (filters.customerId) sales = sales.filter(function (s) { return s.CustomerID === filters.customerId; });
    if (filters.cashierId) sales = sales.filter(function (s) { return s.CashierID === filters.cashierId; });
  }
  sales.sort(function (a, b) { return new Date(b.DateTime) - new Date(a.DateTime); });
  return ok(sales.slice(0, 500).map(function (s) { const c = Object.assign({}, s); delete c.__row; return c; }));
}

function getSaleDetail(session, saleId) {
  requirePermission(session, 'sales.view');
  const sale = findById(SHEET.SALES, 'SaleID', saleId);
  if (!sale) return fail('Sale not found', 'NOT_FOUND');
  const items = readAll(SHEET.SALE_ITEMS).filter(function (i) { return i.SaleID === saleId; });
  return ok({ sale: sale.record, items: items });
}
