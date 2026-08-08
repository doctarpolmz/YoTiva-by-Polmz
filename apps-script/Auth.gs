/**
 * Auth.gs
 * Authentication (session tokens via CacheService) and authorization
 * (server-side permission checks). The frontend never decides what a user
 * can do — it only reflects what this file allows.
 */

const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hour shift

function hashPassword_(password, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + salt);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function login(email, password) {
  const users = readAll(SHEET.USERS);
  const user = users.find(function (u) { return String(u.Email).toLowerCase() === String(email).toLowerCase(); });
  if (!user || user.Status !== 'ACTIVE') return fail('Invalid email or password.', 'AUTH_FAILED');

  const hash = hashPassword_(password, user.Salt);
  if (hash !== user.PasswordHash) return fail('Invalid email or password.', 'AUTH_FAILED');

  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put('session_' + token, JSON.stringify({
    userId: user.UserID, name: user.Name, role: user.Role, email: user.Email
  }), SESSION_TTL_SECONDS);

  logAudit(user.UserID, 'LOGIN', 'Auth', user.UserID, '', '', 'User logged in');
  return ok({ token: token, name: user.Name, role: user.Role, userId: user.UserID });
}

function logout(token) {
  CacheService.getScriptCache().remove('session_' + token);
  return ok({ loggedOut: true });
}

/** Resolves a session token to a user, or throws. Every API handler calls this first. */
function requireSession(token) {
  if (!token) throw new Error('Not authenticated.');
  const raw = CacheService.getScriptCache().get('session_' + token);
  if (!raw) throw new Error('Session expired. Please log in again.');
  return JSON.parse(raw);
}

/** Throws if the session's role lacks the given permission. */
function requirePermission(session, permissionKey) {
  const allowedRoles = PERMISSIONS[permissionKey];
  if (!allowedRoles) throw new Error('Unknown permission: ' + permissionKey);
  if (allowedRoles.indexOf(session.role) === -1) {
    throw new Error('You do not have permission to perform this action (' + permissionKey + ').');
  }
}

/** Creates a user. Only OWNER can call (enforced by caller via requirePermission). */
function createUser(session, payload) {
  requirePermission(session, 'users.manage');
  requireFields(payload, ['name', 'email', 'password', 'role']);
  if (!ROLES[payload.role]) throw new Error('Invalid role.');

  const existing = readAll(SHEET.USERS).find(function (u) {
    return String(u.Email).toLowerCase() === String(payload.email).toLowerCase();
  });
  if (existing) throw new Error('A user with this email already exists.');

  const salt = Utilities.getUuid();
  const id = nextId('USER');
  appendRow(SHEET.USERS, {
    UserID: id, Name: payload.name, Email: payload.email,
    PasswordHash: hashPassword_(payload.password, salt), Salt: salt,
    Role: payload.role, Status: 'ACTIVE', CreatedAt: nowIso()
  });
  logAudit(session.userId, 'USER_CREATED', 'Users', id, '', payload.role, 'New user created');
  return ok({ userId: id });
}
