/**
 * Purchases.gs
 * Purchase Order -> Receive Goods workflow. Receiving is what actually
 * moves stock (not the order itself), and supports partial receiving.
 */

function createPurchaseOrder(session, payload) {
  requirePermission(session, 'purchases.manage');
  requireFields(payload, ['supplierId', 'items']);

  const purchaseId = nextId('PO');
  let total = 0;
  payload.items.forEach(function (item) { total += Number(item.qtyOrdered) * Number(item.unitCost); });

  appendRow(SHEET.PURCHASES, {
    PurchaseID: purchaseId, DateTime: nowIso(), SupplierID: payload.supplierId, UserID: session.userId,
    Total: round2(total), AmountPaid: 0, BalanceDue: round2(total), Status: 'ORDERED'
  });
  payload.items.forEach(function (item) {
    appendRow(SHEET.PURCHASE_ITEMS, {
      PurchaseItemID: nextId('POI'), PurchaseID: purchaseId, ProductID: item.productId,
      QtyOrdered: item.qtyOrdered, QtyReceived: 0, UnitCost: item.unitCost,
      LineTotal: round2(item.qtyOrdered * item.unitCost)
    });
  });
  logAudit(session.userId, 'PURCHASE_ORDER_CREATED', 'Purchases', purchaseId, '', round2(total), '');
  return ok({ purchaseId: purchaseId, total: round2(total) });
}

/** Receive some or all items on a PO. Increases stock only for the qty received now. */
function receivePurchase(session, payload) {
  requirePermission(session, 'purchases.manage');
  requireFields(payload, ['purchaseId', 'items']);

  return withLock(function () {
    const purchase = findById(SHEET.PURCHASES, 'PurchaseID', payload.purchaseId);
    if (!purchase) throw new Error('Purchase order not found.');

    const allItems = readAll(SHEET.PURCHASE_ITEMS).filter(function (i) { return i.PurchaseID === payload.purchaseId; });

    payload.items.forEach(function (recv) {
      const lineFound = allItems.find(function (i) { return i.ProductID === recv.productId; });
      if (!lineFound) throw new Error('Item ' + recv.productId + ' is not part of this purchase order.');
      const qtyNow = Number(recv.qtyReceived);
      if (qtyNow <= 0) return;
      const remaining = Number(lineFound.QtyOrdered) - Number(lineFound.QtyReceived);
      if (qtyNow > remaining) throw new Error('Cannot receive more than ordered for ' + recv.productId + '. Remaining: ' + remaining);

      applyStockMovement(recv.productId, MOVEMENT_TYPES.PURCHASE, qtyNow, payload.purchaseId, session.userId, '');

      const itemRow = findLedgerAwareRow_(SHEET.PURCHASE_ITEMS, lineFound);
      updateRow(SHEET.PURCHASE_ITEMS, itemRow, { QtyReceived: Number(lineFound.QtyReceived) + qtyNow });
    });

    const refreshed = readAll(SHEET.PURCHASE_ITEMS).filter(function (i) { return i.PurchaseID === payload.purchaseId; });
    const fullyReceived = refreshed.every(function (i) { return Number(i.QtyReceived) >= Number(i.QtyOrdered); });
    const partiallyReceived = refreshed.some(function (i) { return Number(i.QtyReceived) > 0; });

    updateRow(SHEET.PURCHASES, purchase.row, {
      Status: fullyReceived ? 'RECEIVED' : (partiallyReceived ? 'PARTIALLY_RECEIVED' : purchase.record.Status)
    });

    // supplier payable increases by the value of goods received (already reflected in Purchases.Total at order time)
    const supplier = findById(SHEET.SUPPLIERS, 'SupplierID', purchase.record.SupplierID);
    if (supplier && purchase.record.Status !== 'RECEIVED') {
      // balance already tracked at order time via Total/AmountPaid on the purchase record; supplier.Balance is a rollup, recalculated in Suppliers.gs
    }

    logAudit(session.userId, 'PURCHASE_RECEIVED', 'Purchases', payload.purchaseId, '', fullyReceived ? 'FULL' : 'PARTIAL', '');
    return ok({ status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' });
  });
}

function findLedgerAwareRow_(sheetName, record) {
  return record.__row;
}

function recordSupplierPayment(session, payload) {
  requirePermission(session, 'purchases.manage');
  requireFields(payload, ['purchaseId', 'amount', 'method']);
  return withLock(function () {
    const purchase = findById(SHEET.PURCHASES, 'PurchaseID', payload.purchaseId);
    if (!purchase) throw new Error('Purchase not found.');
    const amount = Number(payload.amount);
    const newPaid = round2(Number(purchase.record.AmountPaid) + amount);
    const newBalance = round2(Number(purchase.record.Total) - newPaid);
    updateRow(SHEET.PURCHASES, purchase.row, { AmountPaid: newPaid, BalanceDue: newBalance });

    appendRow(SHEET.PAYMENTS, {
      PaymentID: nextId('PAY'), RefType: 'PURCHASE', RefID: payload.purchaseId, Amount: amount,
      Method: payload.method, DateTime: nowIso(), UserID: session.userId
    });
    logAudit(session.userId, 'SUPPLIER_PAYMENT', 'Purchases', payload.purchaseId, '', amount, '');
    return ok({ newBalance: newBalance });
  });
}

function updatePurchaseStatus(session, payload) {
  requirePermission(session, 'purchases.manage');
  requireFields(payload, ['purchaseId', 'status']);

  const allowed = ['ORDERED', 'APPROVED', 'REJECTED', 'CANCELLED', 'IN_TRANSIT', 'SHIPPED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'BACKORDERED', 'CLOSED'];
  const status = String(payload.status).toUpperCase();
  if (allowed.indexOf(status) === -1) throw new Error('Invalid status: ' + payload.status);

  const found = findById(SHEET.PURCHASES, 'PurchaseID', payload.purchaseId);
  if (!found) throw new Error('Purchase order not found: ' + payload.purchaseId);

  updateRow(SHEET.PURCHASES, found.row, { Status: status, UpdatedAt: nowIso() });
  logAudit(session.userId, 'PURCHASE_STATUS_UPDATED', 'Purchases', payload.purchaseId, '', status, '');
  return ok({ status: status });
}

function listPurchases(session, filters) {
  requirePermission(session, 'purchases.manage');
  let rows = readAll(SHEET.PURCHASES);
  if (filters && filters.supplierId) rows = rows.filter(function (r) { return r.SupplierID === filters.supplierId; });
  rows.sort(function (a, b) { return new Date(b.DateTime) - new Date(a.DateTime); });
  return ok(rows.map(function (r) { const c = Object.assign({}, r); delete c.__row; return c; }));
}
