/* utils.js — formatting and small UI helpers shared across views */

const CURRENCY = 'UGX';
const CURRENCY_LOCALE = 'en-UG';
const moneyFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: 'currency', currency: CURRENCY, currencyDisplay: 'code',
  minimumFractionDigits: 0, maximumFractionDigits: 2
});

function fmtMoney(n) {
  return moneyFormatter.format(Number(n || 0));
}

/** Maps a Purchase Order status to the same semantic badge tone used
 *  by the editable status select (see .po-status rules in styles.css). */
function poStatusBadgeClass(status) {
  const tones = {
    ORDERED: 'badge-info', APPROVED: 'badge-info',
    IN_TRANSIT: 'badge-warning', SHIPPED: 'badge-warning', PARTIALLY_RECEIVED: 'badge-warning',
    RECEIVED: 'badge-success', CLOSED: 'badge-success',
    REJECTED: 'badge-danger', CANCELLED: 'badge-danger', BACKORDERED: 'badge-danger'
  };
  return 'badge ' + (tones[status] || 'badge-info');
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (k) {
    if (k === 'class') node.className = attrs[k];
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else node.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function (c) {
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function toast(message, type) {
  const host = document.getElementById('toastHost');
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = message;
  host.appendChild(t);
  setTimeout(function () { t.remove(); }, 4200);
}

/** Turns a raw error message into something a cashier understands.
 *  Backend errors are already human-worded (see Utils.gs / module throws),
 *  this is the last line of defense for anything unexpected. */
function friendlyError(err) {
  const msg = (err && err.message) || String(err);
  if (/fetch|network/i.test(msg)) return 'Connection problem. Check your internet and try again.';
  return msg;
}

function openModal(contentNode) {
  const backdrop = el('div', { class: 'modal-backdrop', onclick: function (e) { if (e.target === backdrop) closeModal(); } });
  const modal = el('div', { class: 'modal' }, [contentNode]);
  backdrop.appendChild(modal);
  backdrop.id = 'activeModal';
  document.body.appendChild(backdrop);
}
function closeModal() {
  const m = document.getElementById('activeModal');
  if (m) m.remove();
}

function debounce(fn, ms) {
  let t;
  return function () {
    clearTimeout(t);
    const args = arguments;
    t = setTimeout(function () { fn.apply(null, args); }, ms);
  };
}

/** Placeholder rows shown while a view's first data fetch is in flight,
 *  standing in for a bare "Loading..." string to reduce perceived latency. */
function skeletonTable(cols, rows) {
  const wrap = el('div', { class: 'skeleton-table' });
  for (let i = 0; i < (rows || 5); i++) {
    const row = el('div', { class: 'skeleton-row' });
    for (let c = 0; c < (cols || 4); c++) {
      row.appendChild(el('div', { class: 'skeleton-cell' + (c === (cols || 4) - 1 ? ' short' : '') }, []));
    }
    wrap.appendChild(row);
  }
  return wrap;
}

/** Exports an array of flat objects as a downloadable CSV file. */
function exportCSV(rows, filename) {
  if (!rows || !rows.length) { toast('Nothing to export yet.', 'error'); return; }
  const headers = Object.keys(rows[0]);
  const escapeCell = function (v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(',')].concat(
    rows.map(function (r) { return headers.map(function (h) { return escapeCell(r[h]); }).join(','); })
  );
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename || 'export.csv' }, []);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
