/**
 * Alerts.gs
 * Rule-based alerts: low stock, out of stock, and simple fraud/anomaly
 * flags. Deliberately rule-based and explainable — no black-box scoring.
 */
function raiseAlert(type, message, severity, refId) {
  appendRow(SHEET.ALERTS, {
    AlertID: nextId('ALRT'), Type: type, Message: message, Severity: severity,
    Status: 'OPEN', DateTime: nowIso(), RefID: refId || ''
  });
}

function checkReorderLevel(product) {
  const stock = Number(product.CurrentStock);
  const reorder = Number(product.ReorderPoint);
  if (stock <= reorder) {
    const msg = product.Name + ' is at ' + stock + ' ' + product.Unit +
      ' (reorder point ' + reorder + '). Suggested reorder qty: ' + product.ReorderQty + '.';
    raiseAlert(stock <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK', msg, stock <= 0 ? 'HIGH' : 'MEDIUM', product.ProductID);
  }
}

/** Called after a discount is applied at POS. Flags discounts beyond a configurable ceiling. */
function checkDiscountAnomaly(session, discountPercent, saleId) {
  const maxAllowed = Number(getSetting('MAX_DISCOUNT_PERCENT') || 20);
  if (discountPercent > maxAllowed && PERMISSIONS['refunds.approve'].indexOf(session.role) === -1) {
    raiseAlert('LARGE_DISCOUNT',
      session.name + ' applied a ' + discountPercent + '% discount on sale ' + saleId +
      ', above the ' + maxAllowed + '% threshold.', 'MEDIUM', saleId);
  }
}

/** Called after a manual stock adjustment. Flags adjustments without a normal reference. */
function checkAdjustmentAnomaly(session, product, qtyChanged, reference) {
  const threshold = Number(getSetting('LARGE_ADJUSTMENT_QTY') || 20);
  if (Math.abs(qtyChanged) >= threshold) {
    raiseAlert('LARGE_STOCK_ADJUSTMENT',
      'Unusual stock adjustment: ' + Math.abs(qtyChanged) + ' units of ' + product.Name +
      ' changed by ' + session.name + ' (ref: ' + (reference || 'none') + ').', 'HIGH', product.ProductID);
  }
}

function getAlerts(session, status) {
  let alerts = readAll(SHEET.ALERTS);
  if (status) alerts = alerts.filter(function (a) { return a.Status === status; });
  alerts.sort(function (a, b) { return new Date(b.DateTime) - new Date(a.DateTime); });
  return ok(alerts.slice(0, 100));
}

function resolveAlert(session, alertId) {
  const found = findById(SHEET.ALERTS, 'AlertID', alertId);
  if (!found) throw new Error('Alert not found.');
  updateRow(SHEET.ALERTS, found.row, { Status: 'RESOLVED' });
  return ok({ resolved: true });
}

function getSetting(key) {
  const rows = readAll(SHEET.SETTINGS);
  const row = rows.find(function (r) { return r.Key === key; });
  return row ? row.Value : null;
}
