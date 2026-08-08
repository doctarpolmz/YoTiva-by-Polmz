/**
 * Products.gs
 * Product catalog CRUD. Stock fields are read-only here — CurrentStock is
 * only ever changed via Inventory.gs's applyStockMovement().
 */

function listProducts(session, filters) {
  let products = readAll(SHEET.PRODUCTS).filter(function (p) { return p.Status !== 'DELETED'; });
  if (filters) {
    if (filters.category) products = products.filter(function (p) { return p.Category === filters.category; });
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      products = products.filter(function (p) {
        return String(p.Name).toLowerCase().indexOf(q) !== -1 ||
          String(p.SKU).toLowerCase().indexOf(q) !== -1 ||
          String(p.Barcode).toLowerCase().indexOf(q) !== -1;
      });
    }
    if (filters.lowStock) products = products.filter(function (p) { return Number(p.CurrentStock) <= Number(p.ReorderPoint); });
  }
  return ok(products.map(stripInternal_));
}

function getProductByCode(session, code) {
  const products = readAll(SHEET.PRODUCTS);
  const match = products.find(function (p) {
    return p.Barcode === code || p.SKU === code || p.ProductID === code;
  });
  return match ? ok(stripInternal_(match)) : fail('Product not found for code: ' + code, 'NOT_FOUND');
}

function createProduct(session, payload) {
  requirePermission(session, 'products.edit');
  requireFields(payload, ['name', 'sku', 'costPrice', 'sellingPrice', 'unit']);

  const dup = readAll(SHEET.PRODUCTS).find(function (p) { return p.SKU === payload.sku; });
  if (dup) throw new Error('A product with SKU "' + payload.sku + '" already exists.');

  const id = nextId('PROD');
  const openingStock = Number(payload.openingStock || 0);
  appendRow(SHEET.PRODUCTS, {
    ProductID: id, SKU: payload.sku, Barcode: payload.barcode || '', Name: payload.name,
    Description: payload.description || '', Category: payload.category || 'Uncategorized',
    Brand: payload.brand || '', Unit: payload.unit,
    CostPrice: Number(payload.costPrice), SellingPrice: Number(payload.sellingPrice),
    CurrentStock: 0, MinStock: Number(payload.minStock || 0),
    ReorderPoint: Number(payload.reorderPoint || 0), ReorderQty: Number(payload.reorderQty || 0),
    SupplierID: payload.supplierId || '', Location: payload.location || '',
    Status: 'ACTIVE', CreatedAt: nowIso(), UpdatedAt: nowIso()
  });

  if (openingStock > 0) {
    applyStockMovement(id, MOVEMENT_TYPES.OPENING, openingStock, 'OPENING', session.userId, 'Opening stock on creation');
  }
  logAudit(session.userId, 'PRODUCT_CREATED', 'Products', id, '', payload.name, '');
  return ok({ productId: id });
}

function updateProduct(session, payload) {
  requirePermission(session, 'products.edit');
  requireFields(payload, ['productId']);
  const found = findById(SHEET.PRODUCTS, 'ProductID', payload.productId);
  if (!found) throw new Error('Product not found.');

  const priceChanged = (payload.sellingPrice !== undefined && Number(payload.sellingPrice) !== Number(found.record.SellingPrice));
  if (priceChanged) requirePermission(session, 'products.editPrice');

  const updates = { UpdatedAt: nowIso() };
  ['name', 'description', 'category', 'brand', 'unit', 'minStock', 'reorderPoint', 'reorderQty', 'location', 'barcode']
    .forEach(function (f) {
      const col = f.charAt(0).toUpperCase() + f.slice(1);
      if (payload[f] !== undefined) updates[col] = payload[f];
    });
  if (payload.costPrice !== undefined) updates.CostPrice = Number(payload.costPrice);
  if (priceChanged) updates.SellingPrice = Number(payload.sellingPrice);

  updateRow(SHEET.PRODUCTS, found.row, updates);
  logAudit(session.userId, 'PRODUCT_UPDATED', 'Products', payload.productId,
    JSON.stringify({ price: found.record.SellingPrice }), JSON.stringify({ price: updates.SellingPrice }), '');
  return ok({ updated: true });
}

/** Soft delete — business records are never physically removed. */
function deleteProduct(session, productId) {
  requirePermission(session, 'products.delete');
  const found = findById(SHEET.PRODUCTS, 'ProductID', productId);
  if (!found) throw new Error('Product not found.');
  updateRow(SHEET.PRODUCTS, found.row, { Status: 'DELETED', UpdatedAt: nowIso() });
  logAudit(session.userId, 'PRODUCT_DELETED', 'Products', productId, 'ACTIVE', 'DELETED', '');
  return ok({ deleted: true });
}

function stripInternal_(record) {
  const copy = Object.assign({}, record);
  delete copy.__row;
  return copy;
}
