/* dashboard.js */
const Dashboard = {
  render: function (container) {
    container.innerHTML = '<div class="empty-state">Loading dashboard...</div>';
    Api.call('getDashboard', {}).then(function (d) {
      container.innerHTML = '';
      container.appendChild(Dashboard.buildKpis(d));
      container.appendChild(Dashboard.buildInsights(d));

      const cols = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;' }, [
        Dashboard.buildLowStock(d),
        Dashboard.buildTopSelling(d)
      ]);
      container.appendChild(cols);
      container.appendChild(Dashboard.buildRecentTransactions(d));
    }).catch(function (err) {
      container.innerHTML = '';
      container.appendChild(el('div', { class: 'empty-state' }, [friendlyError(err)]));
    });
  },

  buildKpis: function (d) {
    const cards = [
      { label: "Today's Sales", value: fmtMoney(d.todayRevenue), view: 'sales' },
      { label: "Today's Profit", value: fmtMoney(d.todayProfit), view: 'reports' },
      { label: "Today's Expenses", value: fmtMoney(d.todayExpenses), view: 'expenses' },
      { label: 'Transactions Today', value: d.todayTransactions, view: 'sales' },
      { label: 'Products Sold Today', value: d.productsSoldToday, view: 'sales' },
      { label: 'Inventory Value', value: fmtMoney(d.inventoryValue), view: 'inventory' },
      { label: 'Low Stock', value: d.lowStockCount, view: 'inventory', tone: d.lowStockCount > 0 ? 'warning' : '' },
      { label: 'Out of Stock', value: d.outOfStockCount, view: 'inventory', tone: d.outOfStockCount > 0 ? 'danger' : '' },
      { label: 'Receivables', value: fmtMoney(d.receivables), view: 'customers' },
      { label: 'Payables', value: fmtMoney(d.payables), view: 'suppliers' },
      { label: 'Cash Position', value: fmtMoney(d.cashPosition), view: 'reports' }
    ];
    const grid = el('div', { class: 'kpi-grid' });
    cards.forEach(function (c) {
      grid.appendChild(el('div', { class: 'kpi-card', onclick: function () { App.navigate(c.view); } }, [
        el('div', { class: 'kpi-label' }, [c.label]),
        el('div', { class: 'kpi-value' + (c.tone ? ' ' + c.tone : '') }, [String(c.value)])
      ]));
    });
    return grid;
  },

  buildInsights: function (d) {
    if (!d.insights || !d.insights.length) return el('div', {});
    const panel = el('div', { class: 'panel' }, [el('h3', {}, ['Business Insights'])]);
    d.insights.forEach(function (msg) {
      panel.appendChild(el('div', { style: 'padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13.5px;' }, [msg]));
    });
    return panel;
  },

  buildLowStock: function (d) {
    const panel = el('div', { class: 'panel' }, [el('h3', {}, ['Low Stock'])]);
    if (!d.lowStockItems.length) {
      panel.appendChild(el('div', { class: 'empty-state' }, ['No low-stock products.']));
      return panel;
    }
    const table = el('table', {}, [
      el('thead', {}, [el('tr', {}, [el('th', {}, ['Product']), el('th', {}, ['Stock']), el('th', {}, ['Reorder At'])])])
    ]);
    const tbody = el('tbody', {});
    d.lowStockItems.forEach(function (p) {
      tbody.appendChild(el('tr', {}, [el('td', {}, [p.name]), el('td', {}, [String(p.stock)]), el('td', {}, [String(p.reorderPoint)])]));
    });
    table.appendChild(tbody);
    panel.appendChild(el('div', { class: 'table-wrap' }, [table]));
    return panel;
  },

  buildTopSelling: function (d) {
    const panel = el('div', { class: 'panel' }, [el('h3', {}, ['Top Selling (30 days)'])]);
    if (!d.topSelling.length) {
      panel.appendChild(el('div', { class: 'empty-state' }, ['No sales yet.']));
      return panel;
    }
    const table = el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', {}, ['Product']), el('th', {}, ['Qty']), el('th', {}, ['Profit'])])])]);
    const tbody = el('tbody', {});
    d.topSelling.forEach(function (p) {
      tbody.appendChild(el('tr', {}, [el('td', {}, [p.name]), el('td', {}, [String(p.qty)]), el('td', { class: 'num' }, [fmtMoney(p.profit)])]));
    });
    table.appendChild(tbody);
    panel.appendChild(el('div', { class: 'table-wrap' }, [table]));
    return panel;
  },

  buildRecentTransactions: function (d) {
    const panel = el('div', { class: 'panel' }, [el('h3', {}, ['Recent Transactions'])]);
    if (!d.recentTransactions.length) {
      panel.appendChild(el('div', { class: 'empty-state' }, ['No sales recorded today.']));
      return panel;
    }
    const table = el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', {}, ['Sale']), el('th', {}, ['Time']), el('th', {}, ['Total']), el('th', {}, ['Payment'])])])]);
    const tbody = el('tbody', {});
    d.recentTransactions.forEach(function (s) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [s.SaleID]), el('td', {}, [fmtDate(s.DateTime)]),
        el('td', { class: 'num' }, [fmtMoney(s.Total)]), el('td', {}, [s.PaymentMethod])
      ]));
    });
    table.appendChild(tbody);
    panel.appendChild(el('div', { class: 'table-wrap' }, [table]));
    return panel;
  }
};
