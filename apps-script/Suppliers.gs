/**
 * Suppliers.gs
 */
function listSuppliers(session) {
  const rows = readAll(SHEET.SUPPLIERS).filter(function (s) { return s.Status !== 'DELETED'; });
  return ok(rows.map(function (s) { const x = Object.assign({}, s); delete x.__row; return x; }));
}

function createSupplier(session, payload) {
  requirePermission(session, 'purchases.manage');
  requireFields(payload, ['name', 'phone']);
  const id = nextId('SUP');
  appendRow(SHEET.SUPPLIERS, {
    SupplierID: id, Name: payload.name, Phone: payload.phone, Email: payload.email || '',
    Address: payload.address || '', Balance: 0, Status: 'ACTIVE', CreatedAt: nowIso()
  });
  logAudit(session.userId, 'SUPPLIER_CREATED', 'Suppliers', id, '', payload.name, '');
  return ok({ supplierId: id });
}

function getPayablesReport(session) {
  requirePermission(session, 'finance.view');
  const purchases = readAll(SHEET.PURCHASES).filter(function (p) { return Number(p.BalanceDue) > 0; });
  const suppliers = readAll(SHEET.SUPPLIERS);
  const bySupplier = {};
  purchases.forEach(function (p) {
    bySupplier[p.SupplierID] = round2((bySupplier[p.SupplierID] || 0) + Number(p.BalanceDue));
  });
  return ok(Object.keys(bySupplier).map(function (supId) {
    const sup = suppliers.find(function (s) { return s.SupplierID === supId; });
    return { SupplierID: supId, Name: sup ? sup.Name : supId, Balance: bySupplier[supId] };
  }).sort(function (a, b) { return b.Balance - a.Balance; }));
}
