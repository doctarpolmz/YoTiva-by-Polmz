/**
 * Customers.gs
 * Customer CRM: profile, balance (receivables), statement of transactions.
 */
function listCustomers(session, filters) {
  let rows = readAll(SHEET.CUSTOMERS).filter(function (c) { return c.Status !== 'DELETED'; });
  if (filters && filters.search) {
    const q = String(filters.search).toLowerCase();
    rows = rows.filter(function (c) {
      return String(c.Name).toLowerCase().indexOf(q) !== -1 || String(c.Phone).indexOf(q) !== -1;
    });
  }
  return ok(rows.map(function (c) { const x = Object.assign({}, c); delete x.__row; return x; }));
}

function createCustomer(session, payload) {
  requireFields(payload, ['name', 'phone']);
  const id = nextId('CUST');
  appendRow(SHEET.CUSTOMERS, {
    CustomerID: id, Name: payload.name, Phone: payload.phone, Email: payload.email || '',
    Address: payload.address || '', Type: payload.type || 'REGULAR', Balance: 0,
    Status: 'ACTIVE', CreatedAt: nowIso()
  });
  logAudit(session.userId, 'CUSTOMER_CREATED', 'Customers', id, '', payload.name, '');
  return ok({ customerId: id });
}

function recordCustomerPayment(session, payload) {
  requireFields(payload, ['customerId', 'amount', 'method']);
  return withLock(function () {
    const cust = findById(SHEET.CUSTOMERS, 'CustomerID', payload.customerId);
    if (!cust) throw new Error('Customer not found.');
    const newBalance = round2(Number(cust.record.Balance) - Number(payload.amount));
    updateRow(SHEET.CUSTOMERS, cust.row, { Balance: newBalance });
    appendRow(SHEET.PAYMENTS, {
      PaymentID: nextId('PAY'), RefType: 'CUSTOMER', RefID: payload.customerId, Amount: payload.amount,
      Method: payload.method, DateTime: nowIso(), UserID: session.userId
    });
    logAudit(session.userId, 'CUSTOMER_PAYMENT', 'Customers', payload.customerId, '', payload.amount, '');
    return ok({ newBalance: newBalance });
  });
}

/** Full statement: every sale + payment for a customer, chronological. */
function getCustomerStatement(session, customerId) {
  const sales = readAll(SHEET.SALES).filter(function (s) { return s.CustomerID === customerId; });
  const payments = readAll(SHEET.PAYMENTS).filter(function (p) { return p.RefType === 'CUSTOMER' && p.RefID === customerId; });
  const entries = sales.map(function (s) {
    return { date: s.DateTime, type: 'SALE', ref: s.SaleID, amount: s.Total, balanceDue: s.BalanceDue };
  }).concat(payments.map(function (p) {
    return { date: p.DateTime, type: 'PAYMENT', ref: p.PaymentID, amount: -p.Amount };
  }));
  entries.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  return ok(entries);
}

function getReceivablesReport(session) {
  requirePermission(session, 'finance.view');
  const customers = readAll(SHEET.CUSTOMERS).filter(function (c) { return Number(c.Balance) > 0; });
  return ok(customers.map(function (c) {
    return { CustomerID: c.CustomerID, Name: c.Name, Phone: c.Phone, Balance: c.Balance };
  }).sort(function (a, b) { return b.Balance - a.Balance; }));
}
