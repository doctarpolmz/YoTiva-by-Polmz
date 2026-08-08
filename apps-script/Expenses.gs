/**
 * Expenses.gs
 */
function recordExpense(session, payload) {
  requirePermission(session, 'expenses.manage');
  requireFields(payload, ['category', 'amount', 'paymentMethod']);
  const id = nextId('EXP');
  appendRow(SHEET.EXPENSES, {
    ExpenseID: id, Category: payload.category, Amount: Number(payload.amount),
    Description: payload.description || '', DateTime: nowIso(),
    PaymentMethod: payload.paymentMethod, UserID: session.userId
  });
  logAudit(session.userId, 'EXPENSE_RECORDED', 'Expenses', id, '', payload.amount, payload.category);
  return ok({ expenseId: id });
}

function listExpenses(session, filters) {
  requirePermission(session, 'finance.view');
  let rows = readAll(SHEET.EXPENSES);
  if (filters) {
    if (filters.from) rows = rows.filter(function (r) { return new Date(r.DateTime) >= new Date(filters.from); });
    if (filters.to) rows = rows.filter(function (r) { return new Date(r.DateTime) <= new Date(filters.to); });
    if (filters.category) rows = rows.filter(function (r) { return r.Category === filters.category; });
  }
  rows.sort(function (a, b) { return new Date(b.DateTime) - new Date(a.DateTime); });
  return ok(rows.map(function (r) { const c = Object.assign({}, r); delete c.__row; return c; }));
}
