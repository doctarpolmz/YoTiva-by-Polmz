/**
 * Config.gs
 * Central configuration: sheet names, column schemas, roles, and constants.
 * Nothing in this file talks to Sheets directly — it's pure config so every
 * other module (and a future non-Sheets backend) can share the same contract.
 */

const SHEET = {
  SETTINGS: 'Settings',
  USERS: 'Users',
  PRODUCTS: 'Products',
  CATEGORIES: 'Categories',
  CUSTOMERS: 'Customers',
  SUPPLIERS: 'Suppliers',
  SALES: 'Sales',
  SALE_ITEMS: 'SaleItems',
  PURCHASES: 'Purchases',
  PURCHASE_ITEMS: 'PurchaseItems',
  INVENTORY_LEDGER: 'InventoryLedger',
  PAYMENTS: 'Payments',
  EXPENSES: 'Expenses',
  RETURNS: 'Returns',
  RETURN_ITEMS: 'ReturnItems',
  AUDIT_LOGS: 'AuditLogs',
  ALERTS: 'Alerts'
};

// Column order = physical column order in the sheet. Keep in sync with SETUP.gs.
const SCHEMA = {
  Settings: ['Key', 'Value'],
  Users: ['UserID', 'Name', 'Email', 'PasswordHash', 'Salt', 'Role', 'Status', 'CreatedAt'],
  Products: ['ProductID', 'SKU', 'Barcode', 'Name', 'Description', 'Category', 'Brand', 'Unit',
    'CostPrice', 'SellingPrice', 'CurrentStock', 'MinStock', 'ReorderPoint', 'ReorderQty',
    'SupplierID', 'Location', 'Status', 'CreatedAt', 'UpdatedAt'],
  Categories: ['CategoryID', 'Name'],
  Customers: ['CustomerID', 'Name', 'Phone', 'Email', 'Address', 'Type', 'Balance', 'Status', 'CreatedAt'],
  Suppliers: ['SupplierID', 'Name', 'Phone', 'Email', 'Address', 'Balance', 'Status', 'CreatedAt'],
  Sales: ['SaleID', 'DateTime', 'CustomerID', 'CashierID', 'Subtotal', 'Discount', 'Tax', 'Total',
    'PaymentMethod', 'AmountPaid', 'BalanceDue', 'Status', 'Notes'],
  SaleItems: ['SaleItemID', 'SaleID', 'ProductID', 'Qty', 'UnitPrice', 'CostPrice', 'Discount', 'LineTotal'],
  Purchases: ['PurchaseID', 'DateTime', 'SupplierID', 'UserID', 'Total', 'AmountPaid', 'BalanceDue', 'Status'],
  PurchaseItems: ['PurchaseItemID', 'PurchaseID', 'ProductID', 'QtyOrdered', 'QtyReceived', 'UnitCost', 'LineTotal'],
  InventoryLedger: ['LedgerID', 'ProductID', 'MovementType', 'Qty', 'PrevBalance', 'NewBalance',
    'Reference', 'UserID', 'DateTime', 'Notes'],
  Payments: ['PaymentID', 'RefType', 'RefID', 'Amount', 'Method', 'DateTime', 'UserID'],
  Expenses: ['ExpenseID', 'Category', 'Amount', 'Description', 'DateTime', 'PaymentMethod', 'UserID'],
  Returns: ['ReturnID', 'RefType', 'RefID', 'DateTime', 'UserID', 'Total', 'Reason'],
  ReturnItems: ['ReturnItemID', 'ReturnID', 'ProductID', 'Qty', 'UnitPrice', 'LineTotal'],
  AuditLogs: ['LogID', 'UserID', 'Action', 'Module', 'RecordID', 'OldValue', 'NewValue', 'Reason', 'DateTime'],
  Alerts: ['AlertID', 'Type', 'Message', 'Severity', 'Status', 'DateTime', 'RefID']
};

const ROLES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CASHIER: 'CASHIER',
  STOREKEEPER: 'STOREKEEPER',
  ACCOUNTANT: 'ACCOUNTANT'
};

// Permission matrix. Checked server-side in Auth.gs — the frontend hiding a
// button is a UX nicety only, never the security boundary.
const PERMISSIONS = {
  'sales.create':        [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER],
  'sales.view':          [ROLES.OWNER, ROLES.MANAGER, ROLES.CASHIER, ROLES.ACCOUNTANT],
  'sales.cancel':        [ROLES.OWNER, ROLES.MANAGER],
  'refunds.approve':     [ROLES.OWNER, ROLES.MANAGER],
  'products.edit':       [ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER],
  'products.editPrice':  [ROLES.OWNER, ROLES.MANAGER],
  'products.delete':     [ROLES.OWNER],
  'inventory.adjust':    [ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER],
  'inventory.view':      [ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER, ROLES.ACCOUNTANT],
  'finance.view':        [ROLES.OWNER, ROLES.MANAGER, ROLES.ACCOUNTANT],
  'users.manage':        [ROLES.OWNER],
  'reports.export':      [ROLES.OWNER, ROLES.MANAGER, ROLES.ACCOUNTANT],
  'purchases.manage':    [ROLES.OWNER, ROLES.MANAGER, ROLES.STOREKEEPER],
  'expenses.manage':     [ROLES.OWNER, ROLES.MANAGER, ROLES.ACCOUNTANT]
};

const MOVEMENT_TYPES = {
  OPENING: 'OPENING_STOCK', SALE: 'SALE', PURCHASE: 'PURCHASE',
  CUSTOMER_RETURN: 'CUSTOMER_RETURN', SUPPLIER_RETURN: 'SUPPLIER_RETURN',
  DAMAGE: 'DAMAGE', LOSS: 'LOSS', THEFT: 'THEFT', TRANSFER: 'TRANSFER',
  ADJUSTMENT: 'ADJUSTMENT', COUNT_VARIANCE: 'COUNT_VARIANCE'
};

function getSS() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
