/**
 * Audit.gs
 * Every sensitive action is logged here. Logging failures never block the
 * business operation itself (a failed log write shouldn't stop a sale) but
 * we still surface it to the developer log for investigation.
 */
function logAudit(userId, action, module, recordId, oldValue, newValue, reason) {
  try {
    appendRow(SHEET.AUDIT_LOGS, {
      LogID: nextId('LOG'), UserID: userId, Action: action, Module: module,
      RecordID: recordId, OldValue: String(oldValue || ''), NewValue: String(newValue || ''),
      Reason: reason || '', DateTime: nowIso()
    });
  } catch (e) {
    Logger.log('AUDIT LOG FAILED: ' + e.message);
  }
}

function getAuditLogs(session, filters) {
  requirePermission(session, 'finance.view');
  let logs = readAll(SHEET.AUDIT_LOGS);
  if (filters && filters.module) logs = logs.filter(function (l) { return l.Module === filters.module; });
  if (filters && filters.userId) logs = logs.filter(function (l) { return l.UserID === filters.userId; });
  logs.sort(function (a, b) { return new Date(b.DateTime) - new Date(a.DateTime); });
  return ok(logs.slice(0, 300));
}
