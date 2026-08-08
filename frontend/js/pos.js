/* pos.js */
const POS = {
  cart: [],
  products: [],
  customerId: '',

  render: function (container) {
    this.cart = [];
    container.innerHTML = '';
    const layout = el('div', { class: 'pos-layout' });

    const catalog = el('div', { class: 'pos-catalog' });
    const searchRow = el('div', { class: 'pos-search-row' }, [
      el('input', { type: 'search', placeholder: 'Search name, SKU, or scan barcode...', id: 'posSearch' })
    ]);
    const grid = el('div', { class: 'product-grid', id: 'posGrid' });
    catalog.appendChild(searchRow);
    catalog.appendChild(grid);

    const cart = el('div', { class: 'pos-cart' });
    cart.appendChild(el('h3', {}, ['Current Sale']));
    cart.appendChild(el('div', { class: 'cart-items', id: 'cartItems' }, [
      el('div', { class: 'empty-state' }, ['Cart is empty. Tap a product to add it.'])
    ]));
    cart.appendChild(this.buildTotalsBlock());

    layout.appendChild(catalog);
    layout.appendChild(cart);
    container.appendChild(layout);

    document.getElementById('posSearch').addEventListener('input', debounce(function (e) {
      POS.loadProducts(e.target.value);
    }, 250));
    document.getElementById('posSearch').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') POS.scanExact(e.target.value);
    });

    this.loadProducts('');
  },

  loadProducts: function (search) {
    Api.call('listProducts', { filters: { search: search } }).then(function (products) {
      POS.products = products;
      POS.renderGrid(products);
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  /** Exact barcode/SKU match on Enter — simulates a barcode scanner "return" key. */
  scanExact: function (code) {
    if (!code) return;
    Api.call('getProductByCode', { code: code }).then(function (p) {
      POS.addToCart(p);
      document.getElementById('posSearch').value = '';
      POS.loadProducts('');
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  renderGrid: function (products) {
    const grid = document.getElementById('posGrid');
    grid.innerHTML = '';
    if (!products.length) {
      grid.appendChild(el('div', { class: 'empty-state' }, ['No products found.']));
      return;
    }
    products.forEach(function (p) {
      const tile = el('button', { class: 'product-tile', onclick: function () { POS.addToCart(p); } }, [
        el('div', { class: 'p-name' }, [p.Name]),
        el('div', { class: 'p-price' }, [fmtMoney(p.SellingPrice)]),
        el('div', { class: 'p-stock' }, [p.CurrentStock + ' ' + p.Unit + ' in stock'])
      ]);
      if (Number(p.CurrentStock) <= 0) tile.style.opacity = '0.45';
      grid.appendChild(tile);
    });
  },

  addToCart: function (product) {
    if (Number(product.CurrentStock) <= 0) { toast(product.Name + ' is out of stock.', 'error'); return; }
    const existing = this.cart.find(function (l) { return l.productId === product.ProductID; });
    if (existing) {
      if (existing.qty + 1 > Number(product.CurrentStock)) { toast('Not enough stock available.', 'error'); return; }
      existing.qty += 1;
    } else {
      this.cart.push({ productId: product.ProductID, name: product.Name, unitPrice: Number(product.SellingPrice), qty: 1, maxStock: Number(product.CurrentStock), discount: 0 });
    }
    this.renderCart();
  },

  changeQty: function (productId, delta) {
    const line = this.cart.find(function (l) { return l.productId === productId; });
    if (!line) return;
    const newQty = line.qty + delta;
    if (newQty <= 0) { this.cart = this.cart.filter(function (l) { return l.productId !== productId; }); }
    else if (newQty > line.maxStock) { toast('Only ' + line.maxStock + ' available.', 'error'); return; }
    else { line.qty = newQty; }
    this.renderCart();
  },

  renderCart: function () {
    const host = document.getElementById('cartItems');
    host.innerHTML = '';
    if (!this.cart.length) {
      host.appendChild(el('div', { class: 'empty-state' }, ['Cart is empty. Tap a product to add it.']));
    } else {
      this.cart.forEach(function (line) {
        host.appendChild(el('div', { class: 'cart-line' }, [
          el('div', { class: 'name' }, [line.name, el('div', { class: 'p-stock' }, [fmtMoney(line.unitPrice) + ' each'])]),
          el('div', { class: 'qty-controls' }, [
            el('button', { class: 'qty-btn', onclick: function () { POS.changeQty(line.productId, -1); } }, ['-']),
            el('span', {}, [String(line.qty)]),
            el('button', { class: 'qty-btn', onclick: function () { POS.changeQty(line.productId, 1); } }, ['+'])
          ]),
          el('div', { class: 'mono' }, [fmtMoney(line.qty * line.unitPrice - line.discount)])
        ]));
      });
    }
    this.updateTotals();
  },

  buildTotalsBlock: function () {
    const block = el('div', { class: 'cart-totals' }, [
      el('div', { class: 'row' }, [el('span', {}, ['Subtotal']), el('span', { id: 'posSubtotal', class: 'mono' }, [fmtMoney(0)])]),
      el('div', { class: 'row' }, [el('span', {}, ['Total']), el('span', { id: 'posTotal', class: 'mono total' }, [fmtMoney(0)])]),
      el('button', { class: 'btn btn-primary btn-block', style: 'margin-top:12px;', onclick: function () { POS.openCheckout(); } }, ['Charge']),
      el('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:6px;', onclick: function () { POS.cart = []; POS.renderCart(); } }, ['Clear Sale'])
    ]);
    return block;
  },

  updateTotals: function () {
    const subtotal = this.cart.reduce(function (s, l) { return s + l.qty * l.unitPrice - l.discount; }, 0);
    const subEl = document.getElementById('posSubtotal');
    const totEl = document.getElementById('posTotal');
    if (subEl) subEl.textContent = fmtMoney(subtotal);
    if (totEl) totEl.textContent = fmtMoney(subtotal);
  },

  openCheckout: function () {
    if (!this.cart.length) { toast('Add at least one product first.', 'error'); return; }
    const subtotal = this.cart.reduce(function (s, l) { return s + l.qty * l.unitPrice - l.discount; }, 0);

    const content = el('div', {}, [
      el('div', { class: 'modal-header' }, [el('h2', {}, ['Checkout']), el('button', { class: 'icon-btn', onclick: closeModal }, ['\u00d7'])]),
      el('label', { class: 'field' }, [el('span', {}, ['Customer (optional, required for credit)']), el('select', { id: 'ckCustomer' }, [el('option', { value: '' }, ['Select customer'])])]),
      el('label', { class: 'field' }, [el('span', {}, ['Discount']), el('input', { type: 'number', id: 'ckDiscount', value: '0', min: '0', step: '0.01' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Sale Notes']), el('input', { id: 'ckNotes', placeholder: 'Optional order note' })]),
      el('div', { class: 'row', style: 'display:flex;justify-content:space-between;font-size:16px;font-weight:700;margin-bottom:16px;' }, [
        el('span', {}, ['Subtotal']), el('span', { class: 'mono' }, [fmtMoney(subtotal)])
      ]),
      el('label', { class: 'field' }, [el('span', {}, ['Payment Method']),
        el('select', { id: 'ckMethod' }, [
          el('option', { value: 'CASH' }, ['Cash']), el('option', { value: 'MOBILE_MONEY' }, ['Mobile Money']),
          el('option', { value: 'CARD' }, ['Card']), el('option', { value: 'BANK' }, ['Bank Transfer']),
          el('option', { value: 'CREDIT' }, ['Credit (pay later)'])
        ])]),
      el('label', { class: 'field' }, [el('span', {}, ['Amount Received']),
        el('input', { type: 'number', id: 'ckAmountPaid', value: subtotal, min: '0', step: '0.01' })]),
      el('div', { id: 'ckChange', class: 'kpi-sub', style: 'margin-bottom:12px;' }, ['Change: ' + fmtMoney(0)]),
      el('button', { class: 'btn btn-primary btn-block', onclick: function () { POS.submitSale(subtotal); } }, ['Complete Sale'])
    ]);
    openModal(content);

    Api.call('listCustomers', {}).then(function (customers) {
      const select = document.getElementById('ckCustomer');
      select.innerHTML = '';
      select.appendChild(el('option', { value: '' }, ['Select customer']));
      customers.forEach(function (c) {
        select.appendChild(el('option', { value: c.CustomerID }, [c.Name + ' (' + c.Phone + ')']));
      });
    }).catch(function (err) { toast(friendlyError(err), 'error'); });

    function updateChange() {
      const discount = Number(document.getElementById('ckDiscount').value || 0);
      const due = Math.max(0, subtotal - discount);
      const paid = Number(document.getElementById('ckAmountPaid').value || 0);
      document.getElementById('ckChange').textContent = 'Change: ' + fmtMoney(Math.max(0, paid - due));
    }

    document.getElementById('ckAmountPaid').addEventListener('input', updateChange);
    document.getElementById('ckDiscount').addEventListener('input', updateChange);
  },

  submitSale: function (subtotal) {
    const method = document.getElementById('ckMethod').value;
    const amountPaid = Number(document.getElementById('ckAmountPaid').value || 0);
    const discount = Number(document.getElementById('ckDiscount').value || 0);
    const customerId = document.getElementById('ckCustomer').value || undefined;
    const notes = document.getElementById('ckNotes').value;

    const payload = {
      items: this.cart.map(function (l) { return { productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount }; }),
      paymentMethod: method,
      amountPaid: amountPaid,
      discount: discount,
      customerId: customerId,
      notes: notes
    };

    Api.call('completeSale', payload).then(function (result) {
      closeModal();
      toast('Sale completed: ' + result.saleId, 'success');
      POS.showReceipt(result);
      POS.cart = [];
      POS.renderCart();
      POS.loadProducts('');
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  showReceipt: function (result) {
    const receipt = el('div', { class: 'receipt' }, [
      el('div', { class: 'receipt-center' }, [el('div', { style: 'font-weight:700;' }, ['Your Business Name']), el('div', {}, ['Kampala, Uganda'])]),
      el('hr'),
      el('div', {}, ['Transaction: ' + result.saleId]),
      el('div', {}, ['Date: ' + new Date().toLocaleString()]),
      el('hr'),
      el('div', { class: 'r-row' }, [el('span', {}, ['Subtotal']), el('span', {}, [fmtMoney(result.subtotal)])]),
      el('div', { class: 'r-row' }, [el('span', {}, ['Discount']), el('span', {}, [fmtMoney(result.discount)])]),
      el('div', { class: 'r-row' }, [el('span', {}, ['Tax']), el('span', {}, [fmtMoney(result.tax)])]),
      el('hr'),
      el('div', { class: 'r-row r-total' }, [el('span', {}, ['TOTAL']), el('span', {}, [fmtMoney(result.total)])]),
      el('div', { class: 'r-row' }, [el('span', {}, ['Paid']), el('span', {}, [fmtMoney(result.amountPaid)])]),
      el('div', { class: 'r-row' }, [el('span', {}, ['Change']), el('span', {}, [fmtMoney(result.change)])]),
      el('hr'),
      el('div', { class: 'receipt-center' }, ['Thank you for your business!'])
    ]);
    const wrapper = el('div', {}, [
      el('div', { class: 'modal-header' }, [el('h2', {}, ['Receipt']), el('button', { class: 'icon-btn', onclick: closeModal }, ['\u00d7'])]),
      receipt,
      el('button', { class: 'btn btn-primary btn-block', style: 'margin-top:12px;', onclick: function () { window.print(); } }, ['Print Receipt'])
    ]);
    openModal(wrapper);
  }
};
