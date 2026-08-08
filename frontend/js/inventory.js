/* inventory.js */
const Inventory = {
  render: function (container) {
    container.innerHTML = '';
    const panel = el('div', { class: 'panel' });
    const header = el('div', { class: 'panel-header' }, [
      el('h2', {}, ['Inventory']),
      Auth.can('products.edit')
        ? el('button', { class: 'btn btn-primary', onclick: function () { Inventory.openProductForm(); } }, ['+ New Product'])
        : el('span', {})
    ]);
    panel.appendChild(header);
    panel.appendChild(el('div', { id: 'invTableWrap', class: 'table-wrap' }, [skeletonTable(7)]));
    container.appendChild(panel);
    this.load();
  },

  load: function () {
    Api.call('listProducts', {}).then(function (products) {
      const wrap = document.getElementById('invTableWrap');
      wrap.innerHTML = '';
      if (!products.length) {
        wrap.appendChild(el('div', { class: 'empty-state' }, ['No products yet. Add your first product to get started.']));
        return;
      }
      const table = el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, ['Product']), el('th', {}, ['SKU']), el('th', {}, ['Stock']),
          el('th', {}, ['Cost']), el('th', {}, ['Price']), el('th', {}, ['Status']), el('th', {}, [''])
        ])])
      ]);
      const tbody = el('tbody', {});
      products.forEach(function (p) {
        const low = Number(p.CurrentStock) <= Number(p.ReorderPoint);
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [p.Name]),
          el('td', {}, [p.SKU]),
          el('td', {}, [el('span', { class: 'badge ' + (low ? (Number(p.CurrentStock) <= 0 ? 'badge-danger' : 'badge-warning') : 'badge-success') }, [String(p.CurrentStock) + ' ' + p.Unit])]),
          el('td', { class: 'num' }, [fmtMoney(p.CostPrice)]),
          el('td', { class: 'num' }, [fmtMoney(p.SellingPrice)]),
          el('td', {}, [p.Status]),
          el('td', {}, [
            Auth.can('inventory.adjust')
              ? el('button', { class: 'btn btn-sm btn-ghost', onclick: function () { Inventory.openAdjustForm(p); } }, ['Adjust'])
              : ''
          ])
        ]));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  openProductForm: function () {
    const content = el('div', {}, [
      el('div', { class: 'modal-header' }, [el('h2', {}, ['New Product']), el('button', { class: 'icon-btn', onclick: closeModal }, ['\u00d7'])]),
      el('label', { class: 'field' }, [el('span', {}, ['Name']), el('input', { id: 'pfName' })]),
      el('label', { class: 'field' }, [el('span', {}, ['SKU']), el('input', { id: 'pfSku' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Barcode (optional)']), el('input', { id: 'pfBarcode' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Description']), el('input', { id: 'pfDescription' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Category']), el('input', { id: 'pfCategory', placeholder: 'Uncategorized' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Brand']), el('input', { id: 'pfBrand' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Supplier']), el('select', { id: 'pfSupplier' }, [el('option', { value: '' }, ['None'])])]),
      el('label', { class: 'field' }, [el('span', {}, ['Location']), el('input', { id: 'pfLocation' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Unit (e.g. pcs, kg, box)']), el('input', { id: 'pfUnit', value: 'pcs' })]),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px;' }, [
        el('label', { class: 'field' }, [el('span', {}, ['Cost Price']), el('input', { id: 'pfCost', type: 'number', step: '0.01' })]),
        el('label', { class: 'field' }, [el('span', {}, ['Selling Price']), el('input', { id: 'pfPrice', type: 'number', step: '0.01' })])
      ]),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px;' }, [
        el('label', { class: 'field' }, [el('span', {}, ['Opening Stock']), el('input', { id: 'pfOpening', type: 'number', value: '0' })]),
        el('label', { class: 'field' }, [el('span', {}, ['Min Stock']), el('input', { id: 'pfMinStock', type: 'number', value: '0' })])
      ]),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px;' }, [
        el('label', { class: 'field' }, [el('span', {}, ['Reorder Point']), el('input', { id: 'pfReorder', type: 'number', value: '5' })]),
        el('label', { class: 'field' }, [el('span', {}, ['Reorder Quantity']), el('input', { id: 'pfReorderQty', type: 'number', value: '0' })])
      ]),
      el('button', { class: 'btn btn-primary btn-block', onclick: Inventory.submitProduct }, ['Save Product'])
    ]);
    openModal(content);

    Api.call('listSuppliers', {}).then(function (suppliers) {
      const supplierSelect = document.getElementById('pfSupplier');
      supplierSelect.innerHTML = '';
      supplierSelect.appendChild(el('option', { value: '' }, ['None']));
      suppliers.forEach(function (s) {
        supplierSelect.appendChild(el('option', { value: s.SupplierID }, [s.Name + ' (' + (s.Phone || '-') + ')']));
      });
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  submitProduct: function () {
    const payload = {
      name: document.getElementById('pfName').value,
      sku: document.getElementById('pfSku').value,
      barcode: document.getElementById('pfBarcode').value,
      description: document.getElementById('pfDescription').value,
      category: document.getElementById('pfCategory').value,
      brand: document.getElementById('pfBrand').value,
      supplierId: document.getElementById('pfSupplier').value,
      location: document.getElementById('pfLocation').value,
      unit: document.getElementById('pfUnit').value,
      costPrice: document.getElementById('pfCost').value,
      sellingPrice: document.getElementById('pfPrice').value,
      openingStock: document.getElementById('pfOpening').value,
      minStock: document.getElementById('pfMinStock').value,
      reorderPoint: document.getElementById('pfReorder').value,
      reorderQty: document.getElementById('pfReorderQty').value
    };
    Api.call('createProduct', payload).then(function () {
      closeModal(); toast('Product created.', 'success'); Inventory.load();
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  },

  openAdjustForm: function (product) {
    const content = el('div', {}, [
      el('div', { class: 'modal-header' }, [el('h2', {}, ['Adjust Stock: ' + product.Name]), el('button', { class: 'icon-btn', onclick: closeModal }, ['\u00d7'])]),
      el('label', { class: 'field' }, [el('span', {}, ['Movement Type']),
        el('select', { id: 'adjType' }, [
          el('option', { value: 'DAMAGE' }, ['Damage']), el('option', { value: 'LOSS' }, ['Loss']),
          el('option', { value: 'THEFT' }, ['Theft']), el('option', { value: 'ADJUSTMENT' }, ['General Adjustment'])
        ])]),
      el('label', { class: 'field' }, [el('span', {}, ['Quantity change (negative to reduce)']), el('input', { id: 'adjQty', type: 'number', value: '-1' })]),
      el('label', { class: 'field' }, [el('span', {}, ['Reason']), el('input', { id: 'adjReason' })]),
      el('button', { class: 'btn btn-primary btn-block', onclick: function () { Inventory.submitAdjust(product.ProductID); } }, ['Apply Adjustment'])
    ]);
    openModal(content);
  },

  submitAdjust: function (productId) {
    const payload = {
      productId: productId,
      movementType: document.getElementById('adjType').value,
      qtyDelta: document.getElementById('adjQty').value,
      reason: document.getElementById('adjReason').value
    };
    Api.call('adjustStock', payload).then(function () {
      closeModal(); toast('Stock adjusted.', 'success'); Inventory.load();
    }).catch(function (err) { toast(friendlyError(err), 'error'); });
  }
};
