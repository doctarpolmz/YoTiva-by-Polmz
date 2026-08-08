/* app.js — app shell wiring and views not broken into their own file */
const App = {
  init: function () {
    Auth.init();

    document.querySelectorAll('.nav-item, .bnav-item').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        App.navigate(link.dataset.view);
      });
    });

    document.getElementById('mobileMenuBtn').addEventListener('click', function () {
      document.querySelector('.sidebar').classList.toggle('open');
    });

    document.getElementById('globalSearch').addEventListener('input', debounce(function (e) {
      App.globalSearch(e.target.value);
    }, 300));
  },

  updateNavPermissions: function () {
    const viewPermissions = {
      dashboard: Auth.user && ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT'].indexOf(Auth.user.role) !== -1,
      pos: Auth.can('sales.create'),
      inventory: Auth.can('inventory.view'),
      sales: Auth.can('sales.view'),
      purchases: Auth.can('purchases.manage'),
      customers: Auth.user && ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT'].indexOf(Auth.user.role) !== -1,
      suppliers: Auth.user && ['OWNER', 'MANAGER', 'STOREKEEPER', 'ACCOUNTANT'].indexOf(Auth.user.role) !== -1,
      expenses: Auth.can('expenses.manage'),
      reports: Auth.can('reports.export'),
      alerts: Auth.user && ['OWNER', 'MANAGER', 'STOREKEEPER', 'ACCOUNTANT'].indexOf(Auth.user.role) !== -1
    };

    document.querySelectorAll('.nav-item, .bnav-item').forEach(function (link) {
      const view = link.dataset.view;
      link.hidden = viewPermissions[view] === false || viewPermissions[view] === undefined;
    });

    const activeSidebarItem = document.querySelector('.nav-item.active');
    if (activeSidebarItem && activeSidebarItem.hidden) {
      const firstVisible = Array.from(document.querySelectorAll('.nav-item')).find(function (n) { return !n.hidden; });
      if (firstVisible) {
        App.navigate(firstVisible.dataset.view);
      } else {
        document.getElementById('mainContent').innerHTML = '<div class="empty-state">No pages available for your role.</div>';
      }
    }
  },

  navigate: function (view) {
    if (!Auth.user) {
      Auth.showLogin();
      return;
    }

    const targetLink = Array.from(document.querySelectorAll('.nav-item, .bnav-item')).find(function (n) {
      return n.dataset.view === view && !n.hidden;
    });
    if (!targetLink) {
      const firstVisible = Array.from(document.querySelectorAll('.nav-item')).find(function (n) { return !n.hidden; });
      view = firstVisible ? firstVisible.dataset.view : 'dashboard';
    }

    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.view === view); });
    document.querySelectorAll('.bnav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.view === view); });
    document.querySelector('.sidebar').classList.remove('open');

    const titles = { dashboard: 'Dashboard', pos: 'Point of Sale', inventory: 'Inventory', sales: 'Sales',
      purchases: 'Purchasing', customers: 'Customers', suppliers: 'Suppliers', expenses: 'Expenses',
      reports: 'Reports', alerts: 'Alerts' };
    document.getElementById('topbarTitle').textContent = titles[view] || view;

    const main = document.getElementById('mainContent');
    switch (view) {
      case 'dashboard': Dashboard.render(main); break;
      case 'pos': POS.render(main); break;
      case 'inventory': Inventory.render(main); break;
      case 'sales': Views.sales(main); break;
      case 'purchases': Views.purchases(main); break;
      case 'customers': Views.customers(main); break;
      case 'suppliers': Views.suppliers(main); break;
      case 'expenses': Views.expenses(main); break;
      case 'reports': Views.reports(main); break;
      case 'alerts': Views.alerts(main); break;
      default: main.innerHTML = '<div class="empty-state">Not found.</div>';
    }
  },

  globalSearch: function (q) {
    if (!q) return;
    Api.call('listProducts', { filters: { search: q } }).then(function (products) {
      if (products.length) { App.navigate('inventory'); }
    }).catch(function () {});
  }
};

/* Lightweight remaining views — same panel/table pattern as Inventory/Dashboard. */
const Views = {
  sales: function (container) {
    container.innerHTML = '';
    const panel = el('div', { class: 'panel' }, [el('h2', {}, ['Sales History'])]);
    const wrap = el('div', { class: 'table-wrap', id: 'salesWrap' }, [skeletonTable(5)]);
    panel.appendChild(wrap);
    container.appendChild(panel);
    Api.call('listSales', {}).then(function (sales) {
      wrap.innerHTML = '';
      if (!sales.length) { wrap.appendChild(el('div', { class: 'empty-state' }, ['No sales recorded yet.'])); return; }
      const table = el('table', {}, [el('thead', {}, [el('tr', {}, [
        el('th', {}, ['Sale']), el('th', {}, ['Date']), el('th', {}, ['Total']), el('th', {}, ['Payment']), el('th', {}, ['Status'])
      ])])]);
      const tbody = el('tbody', {});
      sales.forEach(function (s) {
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [s.SaleID]), el('td', {}, [fmtDate(s.DateTime)]), el('td', { class: 'num' }, [fmtMoney(s.Total)]),
          el('td', {}, [s.PaymentMethod]),
          el('td', {}, [el('span', { class: 'badge ' + (s.Status === 'COMPLETED' ? 'badge-success' : 'badge-danger') }, [s.Status])])
        ]));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }).catch(function (err) { wrap.innerHTML = ''; wrap.appendChild(el('div', { class: 'empty-state' }, [friendlyError(err)])); });
  },

  purchases: function (container) {
    container.innerHTML = '';
    const panel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-header' }, [
        el('h2', {}, ['Purchase Orders']),
        Auth.can('purchases.manage') ? el('button', { class: 'btn btn-primary', onclick: Views.openPurchaseOrderModal }, ['+ New Purchase Order']) : ''
      ])
    ]);
    const wrap = el('div', { class: 'table-wrap', id: 'poWrap' }, [skeletonTable(5)]);
    panel.appendChild(wrap);
    container.appendChild(panel);
    Api.call('listPurchases', {}).then(function (rows) {
      wrap.innerHTML = '';
      if (!rows.length) { wrap.appendChild(el('div', { class: 'empty-state' }, ['No purchase orders yet.'])); return; }
      const table = el('table', {}, [el('thead', {}, [el('tr', {}, [
        el('th', {}, ['PO']), el('th', {}, ['Date']), el('th', {}, ['Total']), el('th', {}, ['Balance Due']), el('th', {}, ['Status'])
      ])])]);
      const tbody = el('tbody', {});
      rows.forEach(function (p) {
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [p.PurchaseID]), el('td', {}, [fmtDate(p.DateTime)]),
          el('td', { class: 'num' }, [fmtMoney(p.Total)]), el('td', { class: 'num' }, [fmtMoney(p.BalanceDue)]),
          (Auth.can('purchases.manage')
            ? el('td', {}, [
              (function () {
                const statuses = ['ORDERED','APPROVED','REJECTED','CANCELLED','IN_TRANSIT','SHIPPED','PARTIALLY_RECEIVED','RECEIVED','BACKORDERED','CLOSED'];
                const select = el('select', { class: 'po-status', 'data-po': p.PurchaseID, 'data-status': p.Status }, []);
                statuses.forEach(function (s) {
                  const option = el('option', { value: s }, [s.replace(/_/g, ' ')]);
                  if (s === p.Status) option.selected = true;
                  select.appendChild(option);
                });
                select.addEventListener('change', function (e) { Views.changePurchaseStatus(p.PurchaseID, e.target.value, select); });
                return select;
              })()
            ])
            : el('td', {}, [el('span', { class: poStatusBadgeClass(p.Status) }, [p.Status])])
          )
        ]));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }).catch(function (err) { wrap.innerHTML = ''; wrap.appendChild(el('div', { class: 'empty-state' }, [friendlyError(err)])); });
  },

  openPurchaseOrderModal: function () {
    const content = el('div', {}, [
      el('div', { class: 'modal-header' }, [el('h2', {}, ['New Purchase Order']), el('button', { class: 'icon-btn', onclick: closeModal }, ['×'])]),
      el('label', { class: 'field' }, [el('span', {}, ['Supplier']), el('select', { id: 'poSupplier' }, [el('option', { value: '' }, ['Loading suppliers...'])])]),
      el('label', { class: 'field' }, [el('span', {}, ['Product']), el('select', { id: 'poProduct' }, [el('option', { value: '' }, ['Loading products...'])])]),
      el('label', { class: 'field' }, [el('span', {}, ['Quantity']), el('input', { id: 'poQty', type: 'number', value: '1', min: '1', inputmode: 'numeric', enterkeyhint: 'done' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Unit Cost']), el('input', { id: 'poCost', type: 'number', step: '0.01', value: '0', inputmode: 'decimal', enterkeyhint: 'done' })]),
      el('button', { class: 'btn btn-primary btn-block', onclick: Views.submitPurchaseOrder }, ['Create Purchase Order'])
    ]);
    openModal(content);

    Api.call('listSuppliers', {}).then(function (suppliers) {
      const supplierSelect = document.getElementById('poSupplier');
      supplierSelect.innerHTML = '';
      if (!suppliers.length) {
        supplierSelect.appendChild(el('option', { value: '' }, ['No suppliers available']));
        return;
      }
      supplierSelect.appendChild(el('option', { value: '' }, ['Select supplier']));
      suppliers.forEach(function (s) {
        supplierSelect.appendChild(el('option', { value: s.SupplierID }, [s.Name + ' (' + (s.Phone || 'no phone') + ')']));
      });
    }).catch(function (err) { toast(friendlyError(err), 'error'); });

    Api.call('listProducts', { filters: { search: '' } }).then(function (products) {
      const productSelect = document.getElementById('poProduct');
      productSelect.innerHTML = '';
      if (!products.length) {
        productSelect.appendChild(el('option', { value: '' }, ['No products available']));
        return;
      }
      productSelect.appendChild(el('option', { value: '' }, ['Select product']));
      products.forEach(function (p) {
        productSelect.appendChild(el('option', { value: p.ProductID }, [p.Name + ' — ' + p.SKU]));
      });
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  submitPurchaseOrder: function () {
    const supplierId = document.getElementById('poSupplier').value;
    const productId = document.getElementById('poProduct').value;
    const qty = Number(document.getElementById('poQty').value || 0);
    const unitCost = Number(document.getElementById('poCost').value || 0);

    if (!supplierId || !productId || qty <= 0 || unitCost <= 0) {
      toast('Please choose a supplier, product, quantity and cost.', 'error');
      return;
    }

    Api.call('createPurchaseOrder', {
      supplierId: supplierId,
      items: [{ productId: productId, qtyOrdered: qty, unitCost: unitCost }]
    }).then(function () {
      closeModal();
      toast('Purchase order created.', 'success');
      Views.purchases(document.getElementById('mainContent'));
    }).catch(function (err) {
      toast(friendlyError(err), 'error');
    });
  },

  changePurchaseStatus: function (purchaseId, status, select) {
    Api.call('updatePurchaseStatus', { purchaseId: purchaseId, status: status }).then(function (res) {
      toast('Purchase status updated: ' + res.status, 'success');
      if (select) {
        select.dataset.status = res.status;
        Array.from(select.options).forEach(function (opt) { opt.selected = opt.value === res.status; });
      }
      Views.purchases(document.getElementById('mainContent'));
    }).catch(function (err) {
      toast(friendlyError(err), 'error');
    });
  },

  customers: function (container) {
    const cfg = {
      title: 'Customers', listAction: 'listCustomers', createAction: 'createCustomer',
      columns: [['Name', 'Name'], ['Phone', 'Phone'], ['Balance', 'Balance']],
      formFields: [
        ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email (optional)'],
        ['address', 'Address (optional)'], ['type', 'Customer Type', { type: 'select', options: [['REGULAR', 'Regular'], ['WHOLESALE', 'Wholesale']] }]
      ],
      moneyCols: ['Balance']
    };
    container.innerHTML = '';
    const panel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-header' }, [
        el('h2', {}, ['Customers']),
        el('div', { class: 'btn-group' }, [
          el('button', { class: 'btn btn-primary', onclick: function () { Views.openCreateModal(cfg); } }, ['+ New Customer']),
          Auth.can('finance.view') ? el('button', { class: 'btn btn-ghost', onclick: Views.openCustomerPaymentModal }, ['Record Payment']) : ''
        ])
      ])
    ]);
    const wrap = el('div', { class: 'table-wrap', id: 'genWrap' }, [skeletonTable(3)]);
    panel.appendChild(wrap);
    container.appendChild(panel);
    Views.loadSimpleList(cfg);
  },

  suppliers: function (container) {
    const cfg = {
      title: 'Suppliers', listAction: 'listSuppliers', createAction: 'createSupplier',
      columns: [['Name', 'Name'], ['Phone', 'Phone'], ['Balance', 'Balance']],
      formFields: [
        ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email (optional)'],
        ['address', 'Address (optional)']
      ],
      moneyCols: ['Balance']
    };
    container.innerHTML = '';
    const panel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-header' }, [
        el('h2', {}, ['Suppliers']),
        el('div', { class: 'btn-group' }, [
          el('button', { class: 'btn btn-primary', onclick: function () { Views.openCreateModal(cfg); } }, ['+ New Supplier']),
          Auth.can('purchases.manage') ? el('button', { class: 'btn btn-ghost', onclick: Views.openSupplierPaymentModal }, ['Record Payment']) : ''
        ])
      ])
    ]);
    const wrap = el('div', { class: 'table-wrap', id: 'genWrap' }, [skeletonTable(3)]);
    panel.appendChild(wrap);
    container.appendChild(panel);
    Views.loadSimpleList(cfg);
  },

  expenses: function (container) {
    container.innerHTML = '';
    const panel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-header' }, [el('h2', {}, ['Expenses']),
        Auth.can('expenses.manage') ? el('button', { class: 'btn btn-primary', onclick: Views.newExpense }, ['+ Record Expense']) : '']),
    ]);
    const wrap = el('div', { class: 'table-wrap', id: 'expWrap' }, [skeletonTable(4)]);
    panel.appendChild(wrap);
    container.appendChild(panel);
    Views.loadExpenses();
  },

  loadExpenses: function () {
    const wrap = document.getElementById('expWrap');
    Api.call('listExpenses', {}).then(function (rows) {
      wrap.innerHTML = '';
      if (!rows.length) { wrap.appendChild(el('div', { class: 'empty-state' }, ['No expenses recorded yet.'])); return; }
      const table = el('table', {}, [el('thead', {}, [el('tr', {}, [
        el('th', {}, ['Category']), el('th', {}, ['Amount']), el('th', {}, ['Date']), el('th', {}, ['Description'])
      ])])]);
      const tbody = el('tbody', {});
      rows.forEach(function (e) {
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [e.Category]), el('td', { class: 'num' }, [fmtMoney(e.Amount)]),
          el('td', {}, [fmtDate(e.DateTime)]), el('td', {}, [e.Description])
        ]));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }).catch(function (err) { wrap.innerHTML = ''; wrap.appendChild(el('div', { class: 'empty-state' }, [friendlyError(err)])); });
  },

  newExpense: function () {
    const content = el('div', {}, [
      el('div', { class: 'modal-header' }, [el('h2', {}, ['Record Expense']), el('button', { class: 'icon-btn', onclick: closeModal }, ['\u00d7'])]),
      el('label', { class: 'field' }, [el('span', {}, ['Category']), el('input', { id: 'expCat' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Amount']), el('input', { id: 'expAmt', type: 'number', step: '0.01', inputmode: 'decimal', enterkeyhint: 'done' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Payment Method']),
        el('select', { id: 'expMethod' }, [el('option', {}, ['CASH']), el('option', {}, ['MOBILE_MONEY']), el('option', {}, ['BANK'])])]),
      el('label', { class: 'field' }, [el('span', {}, ['Description']), el('input', { id: 'expDesc' })]),
      el('button', { class: 'btn btn-primary btn-block', onclick: function () {
        Api.call('recordExpense', {
          category: document.getElementById('expCat').value, amount: document.getElementById('expAmt').value,
          paymentMethod: document.getElementById('expMethod').value, description: document.getElementById('expDesc').value
        }).then(function () { closeModal(); toast('Expense recorded.', 'success'); Views.loadExpenses(); })
          .catch(function (err) { toast(friendlyError(err), 'error'); });
      } }, ['Save Expense'])
    ]);
    openModal(content);
  },

  openCustomerPaymentModal: function () {
    const content = el('div', {}, [
      el('div', { class: 'modal-header' }, [el('h2', {}, ['Record Customer Payment']), el('button', { class: 'icon-btn', onclick: closeModal }, ['×'])]),
      el('label', { class: 'field' }, [el('span', {}, ['Customer']), el('select', { id: 'custPayCustomer' }, [el('option', { value: '' }, ['Loading customers...'])])]),
      el('label', { class: 'field' }, [el('span', {}, ['Amount']), el('input', { id: 'custPayAmount', type: 'number', step: '0.01', value: '0', inputmode: 'decimal', enterkeyhint: 'done' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Payment Method']),
        el('select', { id: 'custPayMethod' }, [el('option', {}, ['CASH']), el('option', {}, ['MOBILE_MONEY']), el('option', {}, ['BANK']), el('option', {}, ['CARD'])])]),
      el('button', { class: 'btn btn-primary btn-block', onclick: Views.submitCustomerPayment }, ['Save Payment'])
    ]);
    openModal(content);

    Api.call('listCustomers', {}).then(function (customers) {
      const select = document.getElementById('custPayCustomer');
      select.innerHTML = '';
      if (!customers.length) {
        select.appendChild(el('option', { value: '' }, ['No customers available']));
        return;
      }
      select.appendChild(el('option', { value: '' }, ['Select customer']));
      customers.forEach(function (c) {
        select.appendChild(el('option', { value: c.CustomerID }, [c.Name + ' (' + c.Phone + ')']));
      });
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  submitCustomerPayment: function () {
    const customerId = document.getElementById('custPayCustomer').value;
    const amount = Number(document.getElementById('custPayAmount').value || 0);
    const method = document.getElementById('custPayMethod').value;
    if (!customerId || amount <= 0) {
      toast('Choose a customer and enter a valid payment amount.', 'error');
      return;
    }
    Api.call('recordCustomerPayment', { customerId: customerId, amount: amount, method: method })
      .then(function () { closeModal(); toast('Payment recorded.', 'success'); Views.customers(document.getElementById('mainContent')); })
      .catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  openSupplierPaymentModal: function () {
    const content = el('div', {}, [
      el('div', { class: 'modal-header' }, [el('h2', {}, ['Record Supplier Payment']), el('button', { class: 'icon-btn', onclick: closeModal }, ['×'])]),
      el('label', { class: 'field' }, [el('span', {}, ['Supplier']), el('select', { id: 'supPaySupplier' }, [el('option', { value: '' }, ['Loading suppliers...'])])]),
      el('label', { class: 'field' }, [el('span', {}, ['Purchase ID']), el('input', { id: 'supPayPurchaseId' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Amount']), el('input', { id: 'supPayAmount', type: 'number', step: '0.01', value: '0', inputmode: 'decimal', enterkeyhint: 'done' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Payment Method']),
        el('select', { id: 'supPayMethod' }, [el('option', {}, ['CASH']), el('option', {}, ['MOBILE_MONEY']), el('option', {}, ['BANK']), el('option', {}, ['CARD'])])]),
      el('button', { class: 'btn btn-primary btn-block', onclick: Views.submitSupplierPayment }, ['Save Payment'])
    ]);
    openModal(content);

    Api.call('listSuppliers', {}).then(function (suppliers) {
      const select = document.getElementById('supPaySupplier');
      select.innerHTML = '';
      if (!suppliers.length) {
        select.appendChild(el('option', { value: '' }, ['No suppliers available']));
        return;
      }
      select.appendChild(el('option', { value: '' }, ['Select supplier']));
      suppliers.forEach(function (s) {
        select.appendChild(el('option', { value: s.SupplierID }, [s.Name + ' (' + s.Phone + ')']));
      });
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  submitSupplierPayment: function () {
    const purchaseId = document.getElementById('supPayPurchaseId').value.trim();
    const amount = Number(document.getElementById('supPayAmount').value || 0);
    const method = document.getElementById('supPayMethod').value;
    if (!purchaseId || amount <= 0) {
      toast('Enter a purchase ID and a valid payment amount.', 'error');
      return;
    }
    Api.call('recordSupplierPayment', { purchaseId: purchaseId, amount: amount, method: method })
      .then(function () { closeModal(); toast('Payment recorded.', 'success'); Views.suppliers(document.getElementById('mainContent')); })
      .catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  reports: function (container) {
    container.innerHTML = '';
    const panel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-header' }, [
        el('h2', {}, ['Reports Center']),
        el('button', { class: 'btn btn-ghost btn-sm', id: 'reportExportBtn', onclick: Views.exportCurrentReport }, ['Export CSV'])
      ])
    ]);
    const buttons = el('div', { class: 'report-actions' });
    [['SALES_BY_PRODUCT', 'Sales by Product'], ['SALES_BY_CATEGORY', 'Sales by Category'],
      ['INVENTORY_VALUATION', 'Inventory Valuation'], ['PROFITABILITY', 'Profitability']].forEach(function (r) {
      buttons.appendChild(el('button', { class: 'btn', onclick: function () { Views.loadReport(r[0]); } }, [r[1]]));
    });
    panel.appendChild(buttons);
    panel.appendChild(el('div', { class: 'table-wrap', id: 'reportWrap' }, [el('div', { class: 'empty-state' }, ['Choose a report above.'])]));
    container.appendChild(panel);
    Views.currentReport = { type: null, rows: [] };
  },

  loadReport: function (type) {
    const wrap = document.getElementById('reportWrap');
    wrap.innerHTML = '';
    wrap.appendChild(skeletonTable(4));
    Api.call('getReport', { reportType: type }).then(function (rows) {
      Views.currentReport = { type: type, rows: rows };
      wrap.innerHTML = '';
      if (!rows.length) { wrap.appendChild(el('div', { class: 'empty-state' }, ['No data for this report yet.'])); return; }
      const keys = Object.keys(rows[0]);
      const table = el('table', {}, [el('thead', {}, [el('tr', {}, keys.map(function (k) { return el('th', {}, [k]); }))])]);
      const tbody = el('tbody', {});
      rows.forEach(function (r) {
        tbody.appendChild(el('tr', {}, keys.map(function (k) {
          const isMoney = /revenue|profit|value|cost/i.test(k);
          return el('td', { class: isMoney ? 'num' : '' }, [isMoney ? fmtMoney(r[k]) : String(r[k])]);
        })));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }).catch(function (err) { wrap.innerHTML = ''; wrap.appendChild(el('div', { class: 'empty-state' }, [friendlyError(err)])); });
  },

  exportCurrentReport: function () {
    const current = Views.currentReport;
    if (!current || !current.type) { toast('Choose a report first.', 'error'); return; }
    exportCSV(current.rows, current.type.toLowerCase() + '.csv');
  },

  alerts: function (container) {
    container.innerHTML = '';
    const panel = el('div', { class: 'panel' }, [el('h2', {}, ['Alerts Center'])]);
    const wrap = el('div', { id: 'alertsWrap' }, [skeletonTable(2, 4)]);
    panel.appendChild(wrap);
    container.appendChild(panel);
    Api.call('getAlerts', { status: 'OPEN' }).then(function (rows) {
      wrap.innerHTML = '';
      if (!rows.length) { wrap.appendChild(el('div', { class: 'empty-state' }, ['No open alerts. Everything looks normal.'])); return; }
      rows.forEach(function (a) {
        const tone = a.Severity === 'HIGH' ? 'badge-danger' : a.Severity === 'MEDIUM' ? 'badge-warning' : 'badge-info';
        wrap.appendChild(el('div', { class: 'alert-row' }, [
          el('div', { class: 'alert-message' }, [el('span', { class: 'badge alert-badge ' + tone }, [a.Severity]), a.Message]),
          el('button', { class: 'btn btn-sm btn-ghost', onclick: function () {
            Api.call('resolveAlert', { alertId: a.AlertID }).then(function () { Views.alerts(document.getElementById('mainContent')); });
          } }, ['Resolve'])
        ]));
      });
    }).catch(function (err) { wrap.innerHTML = ''; wrap.appendChild(el('div', { class: 'empty-state' }, [friendlyError(err)])); });
  },

  /** Generic list + create-modal pattern reused by Customers and Suppliers. */
  simpleListWithCreate: function (container, cfg) {
    container.innerHTML = '';
    const panel = el('div', { class: 'panel' }, [
      el('div', { class: 'panel-header' }, [el('h2', {}, [cfg.title]),
        el('button', { class: 'btn btn-primary', onclick: function () { Views.openCreateModal(cfg); } }, ['+ New ' + cfg.title.slice(0, -1)])])
    ]);
    const wrap = el('div', { class: 'table-wrap', id: 'genWrap' }, [skeletonTable(3)]);
    panel.appendChild(wrap);
    container.appendChild(panel);
    Views.loadSimpleList(cfg);
  },

  loadSimpleList: function (cfg) {
    const wrap = document.getElementById('genWrap');
    Api.call(cfg.listAction, {}).then(function (rows) {
      wrap.innerHTML = '';
      if (!rows.length) { wrap.appendChild(el('div', { class: 'empty-state' }, ['No ' + cfg.title.toLowerCase() + ' found.'])); return; }
      const table = el('table', {}, [el('thead', {}, [el('tr', {}, cfg.columns.map(function (c) { return el('th', {}, [c[0]]); }))])]);
      const tbody = el('tbody', {});
      rows.forEach(function (r) {
        tbody.appendChild(el('tr', {}, cfg.columns.map(function (c) {
          const isMoney = cfg.moneyCols.indexOf(c[1]) !== -1;
          return el('td', { class: isMoney ? 'num' : '' }, [isMoney ? fmtMoney(r[c[1]]) : String(r[c[1]] || '-')]);
        })));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }).catch(function (err) { wrap.innerHTML = ''; wrap.appendChild(el('div', { class: 'empty-state' }, [friendlyError(err)])); });
  },

  openCreateModal: function (cfg) {
    const fields = cfg.formFields.map(function (f) {      if (f[2] && f[2].type === 'select') {
        const select = el('select', { id: 'gf_' + f[0] }, []);
        f[2].options.forEach(function (opt) {
          select.appendChild(el('option', { value: opt[0] }, [opt[1]]));
        });
        return el('label', { class: 'field' }, [el('span', {}, [f[1]]), select]);
      }      return el('label', { class: 'field' }, [el('span', {}, [f[1]]), el('input', { id: 'gf_' + f[0] })]);
    });
    const content = el('div', {}, [
      el('div', { class: 'modal-header' }, [el('h2', {}, ['New ' + cfg.title.slice(0, -1)]), el('button', { class: 'icon-btn', onclick: closeModal }, ['\u00d7'])]),
      ...fields,
      el('button', { class: 'btn btn-primary btn-block', onclick: function () {
        const payload = {};
        cfg.formFields.forEach(function (f) { payload[f[0]] = document.getElementById('gf_' + f[0]).value; });
        Api.call(cfg.createAction, payload).then(function () {
          closeModal(); toast('Saved.', 'success'); Views.loadSimpleList(cfg);
        }).catch(function (err) { toast(friendlyError(err), 'error'); });
      } }, ['Save'])
    ]);
    openModal(content);
  }
};

document.addEventListener('DOMContentLoaded', function () { App.init(); });
