/**
 * Reports.gs
 * All aggregation happens server-side in one pass over already-loaded data,
 * so the frontend gets one compact JSON payload instead of raw rows to
 * crunch (Section 18: minimize API calls / avoid client-side heavy lifting
 * against Sheets data).
 */

function getDashboard(session) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sales = readAll(SHEET.SALES).filter(function (s) { return s.Status === 'COMPLETED'; });
  const saleItems = readAll(SHEET.SALE_ITEMS);
  const products = readAll(SHEET.PRODUCTS).filter(function (p) { return p.Status !== 'DELETED'; });
  const expenses = readAll(SHEET.EXPENSES);
  const customers = readAll(SHEET.CUSTOMERS);
  const purchases = readAll(SHEET.PURCHASES);

  const todaySales = sales.filter(function (s) { return new Date(s.DateTime) >= today; });
  const todaySaleIds = {};
  todaySales.forEach(function (s) { todaySaleIds[s.SaleID] = true; });
  const todayItems = saleItems.filter(function (i) { return todaySaleIds[i.SaleID]; });

  const todayRevenue = round2(todaySales.reduce(function (sum, s) { return sum + Number(s.Total); }, 0));
  const todayCOGS = round2(todayItems.reduce(function (sum, i) { return sum + Number(i.CostPrice) * Number(i.Qty); }, 0));
  const todayProfit = round2(todayRevenue - todayCOGS);
  const todayExpenses = round2(expenses.filter(function (e) { return new Date(e.DateTime) >= today; })
    .reduce(function (sum, e) { return sum + Number(e.Amount); }, 0));

  const productsSoldToday = todayItems.reduce(function (sum, i) { return sum + Number(i.Qty); }, 0);

  const inventoryValue = round2(products.reduce(function (sum, p) { return sum + Number(p.CostPrice) * Number(p.CurrentStock); }, 0));
  const lowStock = products.filter(function (p) { return Number(p.CurrentStock) > 0 && Number(p.CurrentStock) <= Number(p.ReorderPoint); });
  const outOfStock = products.filter(function (p) { return Number(p.CurrentStock) <= 0; });

  const receivables = round2(customers.reduce(function (sum, c) { return sum + Math.max(0, Number(c.Balance)); }, 0));
  const payables = round2(purchases.reduce(function (sum, p) { return sum + Number(p.BalanceDue); }, 0));

  // 7-day sales trend
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - i);
    const nextDay = new Date(day); nextDay.setDate(day.getDate() + 1);
    const daySales = sales.filter(function (s) { const d = new Date(s.DateTime); return d >= day && d < nextDay; });
    const dayIds = {}; daySales.forEach(function (s) { dayIds[s.SaleID] = true; });
    const dayItems = saleItems.filter(function (it) { return dayIds[it.SaleID]; });
    const revenue = round2(daySales.reduce(function (s, x) { return s + Number(x.Total); }, 0));
    const cogs = round2(dayItems.reduce(function (s, x) { return s + Number(x.CostPrice) * Number(x.Qty); }, 0));
    trend.push({ date: day.toISOString().slice(0, 10), revenue: revenue, profit: round2(revenue - cogs) });
  }

  // top-selling & most profitable (last 30 days)
  const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30);
  const recentIds = {}; sales.filter(function (s) { return new Date(s.DateTime) >= cutoff30; }).forEach(function (s) { recentIds[s.SaleID] = true; });
  const recentItems = saleItems.filter(function (i) { return recentIds[i.SaleID]; });
  const byProduct = {};
  recentItems.forEach(function (i) {
    if (!byProduct[i.ProductID]) byProduct[i.ProductID] = { qty: 0, profit: 0 };
    byProduct[i.ProductID].qty += Number(i.Qty);
    byProduct[i.ProductID].profit += round2((Number(i.UnitPrice) - Number(i.CostPrice)) * Number(i.Qty) - Number(i.Discount));
  });
  const productNames = {}; products.forEach(function (p) { productNames[p.ProductID] = p.Name; });
  const topSelling = Object.keys(byProduct).map(function (id) {
    return { productId: id, name: productNames[id] || id, qty: byProduct[id].qty, profit: round2(byProduct[id].profit) };
  }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);
  const mostProfitable = Object.keys(byProduct).map(function (id) {
    return { productId: id, name: productNames[id] || id, qty: byProduct[id].qty, profit: round2(byProduct[id].profit) };
  }).sort(function (a, b) { return b.profit - a.profit; }).slice(0, 5);

  const recentTransactions = sales.slice(-8).reverse();
  const alerts = readAll(SHEET.ALERTS).filter(function (a) { return a.Status === 'OPEN'; }).slice(-10).reverse();

  return ok({
    todayRevenue: todayRevenue, todayProfit: todayProfit, todayExpenses: todayExpenses,
    todayTransactions: todaySales.length, productsSoldToday: productsSoldToday,
    inventoryValue: inventoryValue, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length,
    lowStockItems: lowStock.slice(0, 10).map(function (p) { return { name: p.Name, stock: p.CurrentStock, reorderPoint: p.ReorderPoint }; }),
    receivables: receivables, payables: payables,
    cashPosition: round2(todayRevenue - todayExpenses),
    trend: trend, topSelling: topSelling, mostProfitable: mostProfitable,
    recentTransactions: recentTransactions.map(function (s) { const c = Object.assign({}, s); delete c.__row; return c; }),
    alerts: alerts,
    insights: generateInsights_(trend, byProduct, products)
  });
}

/** Plain, data-grounded observations — no generic filler. */
function generateInsights_(trend, byProduct, products) {
  const insights = [];
  if (trend.length >= 2) {
    const thisWeek = trend.reduce(function (s, d) { return s + d.revenue; }, 0);
    const half = Math.floor(trend.length / 2);
    const recent = trend.slice(half).reduce(function (s, d) { return s + d.revenue; }, 0);
    const earlier = trend.slice(0, half).reduce(function (s, d) { return s + d.revenue; }, 0);
    if (earlier > 0) {
      const change = round2(((recent - earlier) / earlier) * 100);
      if (Math.abs(change) >= 10) {
        insights.push('Sales in the latter half of this period are ' + (change > 0 ? 'up' : 'down') + ' ' + Math.abs(change) + '% versus the earlier half.');
      }
    }
  }
  // high inventory value, low recent sales
  const highValueLowSales = products
    .map(function (p) { return { p: p, value: Number(p.CostPrice) * Number(p.CurrentStock), sold: (byProduct[p.ProductID] || { qty: 0 }).qty }; })
    .filter(function (x) { return x.value > 0; })
    .sort(function (a, b) { return b.value - a.value; })
    .slice(0, 3)
    .filter(function (x) { return x.sold === 0; });
  highValueLowSales.forEach(function (x) {
    insights.push(x.p.Name + ' holds significant inventory value but has not sold in the last 30 days.');
  });
  return insights;
}

function getReport(session, reportType, filters) {
  requirePermission(session, 'reports.export');
  switch (reportType) {
    case 'SALES_BY_PRODUCT': return ok(salesByProduct_(filters));
    case 'SALES_BY_CATEGORY': return ok(salesByCategory_(filters));
    case 'INVENTORY_VALUATION': return ok(inventoryValuation_());
    case 'PROFITABILITY': return ok(profitability_(filters));
    default: throw new Error('Unknown report type: ' + reportType);
  }
}

function salesByProduct_(filters) {
  const items = readAll(SHEET.SALE_ITEMS);
  const products = readAll(SHEET.PRODUCTS);
  const grouped = {};
  items.forEach(function (i) {
    if (!grouped[i.ProductID]) grouped[i.ProductID] = { qty: 0, revenue: 0, profit: 0 };
    grouped[i.ProductID].qty += Number(i.Qty);
    grouped[i.ProductID].revenue += Number(i.LineTotal);
    grouped[i.ProductID].profit += round2((Number(i.UnitPrice) - Number(i.CostPrice)) * Number(i.Qty) - Number(i.Discount));
  });
  return Object.keys(grouped).map(function (id) {
    const p = products.find(function (x) { return x.ProductID === id; });
    return { productId: id, name: p ? p.Name : id, qty: grouped[id].qty, revenue: round2(grouped[id].revenue), profit: round2(grouped[id].profit) };
  }).sort(function (a, b) { return b.revenue - a.revenue; });
}

function salesByCategory_() {
  const items = readAll(SHEET.SALE_ITEMS);
  const products = readAll(SHEET.PRODUCTS);
  const catByProduct = {}; products.forEach(function (p) { catByProduct[p.ProductID] = p.Category; });
  const grouped = {};
  items.forEach(function (i) {
    const cat = catByProduct[i.ProductID] || 'Uncategorized';
    grouped[cat] = round2((grouped[cat] || 0) + Number(i.LineTotal));
  });
  return Object.keys(grouped).map(function (c) { return { category: c, revenue: grouped[c] }; }).sort(function (a, b) { return b.revenue - a.revenue; });
}

function inventoryValuation_() {
  const products = readAll(SHEET.PRODUCTS).filter(function (p) { return p.Status !== 'DELETED'; });
  return products.map(function (p) {
    return { productId: p.ProductID, name: p.Name, stock: p.CurrentStock, costPrice: p.CostPrice, value: round2(Number(p.CostPrice) * Number(p.CurrentStock)) };
  }).sort(function (a, b) { return b.value - a.value; });
}

function profitability_() {
  return salesByProduct_().map(function (r) {
    return Object.assign({}, r, { marginPercent: r.revenue > 0 ? round2((r.profit / r.revenue) * 100) : 0 });
  }).sort(function (a, b) { return b.profit - a.profit; });
}
