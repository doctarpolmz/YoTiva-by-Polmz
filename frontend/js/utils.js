/* utils.js — formatting and small UI helpers shared across views */

const CURRENCY = 'UGX';

function fmtMoney(n) {
  const v = Number(n || 0);
  return CURRENCY + ' ' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
