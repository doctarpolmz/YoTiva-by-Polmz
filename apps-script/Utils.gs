/**
 * Utils.gs
 * Shared low-level helpers used by every module: safe sheet access, ID
 * generation, consistent API responses, and locking.
 */

// ---------- Response envelope (every API call returns this shape) ----------
function ok(data) {
  return { success: true, data: data, error: null };
}
function fail(message, code) {
  return { success: false, data: null, error: { message: message, code: code || 'ERROR' } };
}

// ---------- Sheet access ----------
function sheet(name) {
  const ss = getSS();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name + '. Run Setup.gs first.');
  return sh;
}

/** Read all data rows of a sheet as an array of objects keyed by SCHEMA header. */
function readAll(sheetName) {
  const sh = sheet(sheetName);
  const lastRow = sh.getLastRow();
  const cols = SCHEMA[sheetName].length;
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  const headers = SCHEMA[sheetName];
  return values.map(function (row, i) {
    const obj = {};
    headers.forEach(function (h, idx) { obj[h] = row[idx]; });
    obj.__row = i + 2; // physical row, for internal use only — never exposed as an ID
    return obj;
  });
}

/** Find one row by an ID column. Returns {row, record} or null. */
function findById(sheetName, idColumn, idValue) {
  const all = readAll(sheetName);
  for (let i = 0; i < all.length; i++) {
    if (all[i][idColumn] === idValue) return { row: all[i].__row, record: all[i] };
  }
  return null;
}

function appendRow(sheetName, obj) {
  const sh = sheet(sheetName);
  const headers = SCHEMA[sheetName];
  const row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sh.appendRow(row);
  return sh.getLastRow();
}

function updateRow(sheetName, rowNum, obj) {
  const sh = sheet(sheetName);
  const headers = SCHEMA[sheetName];
  const current = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  const merged = headers.map(function (h, idx) {
    return obj[h] !== undefined ? obj[h] : current[idx];
  });
  sh.getRange(rowNum, 1, 1, headers.length).setValues([merged]);
}

// ---------- ID generation (sequential, human-readable, never a row number) ----------
function nextId(prefix) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'SEQ_' + prefix;
    const current = Number(props.getProperty(key) || '0') + 1;
    props.setProperty(key, String(current));
    return prefix + '-' + String(current).padStart(6, '0');
  } finally {
    lock.releaseLock();
  }
}

// ---------- Locking helper for transactional sections ----------
function withLock(fn) {
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(15000);
  if (!gotLock) throw new Error('System is busy processing another transaction. Please try again.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function nowIso() {
  return new Date().toISOString();
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function requireFields(obj, fields) {
  const missing = fields.filter(function (f) { return obj[f] === undefined || obj[f] === null || obj[f] === ''; });
  if (missing.length) throw new Error('Missing required field(s): ' + missing.join(', '));
}
