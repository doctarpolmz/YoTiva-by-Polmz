/**
 * API.gs
 * Single entry point. The frontend always POSTs { action, token, payload }
 * as JSON. doGet exists only to serve the web app HTML shell (see
 * frontend/index.html being inlined via HtmlService, OR to just show a
 * "backend is running" message if you're hosting the frontend elsewhere).
 *
 * All actions that are not 'login' require a valid session token, checked
 * here in one place so no handler can forget to authenticate.
 */

const PUBLIC_ACTIONS = ['login'];

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify(ok({ status: 'Backend is running' })))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond_(fail('Invalid request body.', 'BAD_REQUEST'));
  }

  const action = body.action;
  const token = body.token;
  const payload = body.payload || {};

  try {
    let session = null;
    if (PUBLIC_ACTIONS.indexOf(action) === -1) {
      session = requireSession(token);
    }
    const result = route_(action, session, payload);
    return respond_(result);
  } catch (err) {
    Logger.log('API ERROR [' + action + ']: ' + err.message + '\n' + err.stack);
    return respond_(fail(err.message || 'Something went wrong. Please try again.', 'ERROR'));
  }
}

function route_(action, session, payload) {
  switch (action) {
    // Auth
    case 'login': return login(payload.email, payload.password);
    case 'logout': return logout(payload.token);
    case 'createUser': return createUser(session, payload);

    // Dashboard / Reports
    case 'getDashboard': return getDashboard(session);
    case 'getReport': return getReport(session, payload.reportType, payload.filters);
    case 'getAuditLogs': return getAuditLogs(session, payload.filters);
    case 'getAlerts': return getAlerts(session, payload.status);
    case 'resolveAlert': return resolveAlert(session, payload.alertId);

    // Products / Inventory
    case 'listProducts': return listProducts(session, payload.filters);
    case 'getProductByCode': return getProductByCode(session, payload.code);
    case 'createProduct': return createProduct(session, payload);
    case 'updateProduct': return updateProduct(session, payload);
    case 'deleteProduct': return deleteProduct(session, payload.productId);
    case 'getInventoryLedger': return getInventoryLedger(session, payload.productId, payload.limit);
    case 'adjustStock': return adjustStock(session, payload);
    case 'submitStockCount': return submitStockCount(session, payload);
    case 'getDeadStock': return getDeadStock(session, payload.days);

    // Sales / POS
    case 'completeSale': return completeSale(session, payload);
    case 'cancelSale': return cancelSale(session, payload.saleId, payload.reason);
    case 'processReturn': return processReturn(session, payload);
    case 'listSales': return listSales(session, payload.filters);
    case 'getSaleDetail': return getSaleDetail(session, payload.saleId);

    // Purchases / Suppliers
    case 'createPurchaseOrder': return createPurchaseOrder(session, payload);
    case 'receivePurchase': return receivePurchase(session, payload);
    case 'updatePurchaseStatus': return updatePurchaseStatus(session, payload);
    case 'recordSupplierPayment': return recordSupplierPayment(session, payload);
    case 'listPurchases': return listPurchases(session, payload.filters);
    case 'listSuppliers': return listSuppliers(session);
    case 'createSupplier': return createSupplier(session, payload);
    case 'getPayablesReport': return getPayablesReport(session);

    // Customers
    case 'listCustomers': return listCustomers(session, payload.filters);
    case 'createCustomer': return createCustomer(session, payload);
    case 'recordCustomerPayment': return recordCustomerPayment(session, payload);
    case 'getCustomerStatement': return getCustomerStatement(session, payload.customerId);
    case 'getReceivablesReport': return getReceivablesReport(session);

    // Expenses
    case 'recordExpense': return recordExpense(session, payload);
    case 'listExpenses': return listExpenses(session, payload.filters);

    default:
      throw new Error('Unknown action: ' + action);
  }
}

function respond_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
