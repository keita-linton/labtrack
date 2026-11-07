// src/auth.js — instructor login: password hashing + session auth.
//
// Passwords are hashed with scrypt (Node's built-in crypto) and a random
// 16-byte salt per user — no auth libraries, no extra dependencies.
// Sessions are random 32-byte tokens stored in the sessions table with a
// 24-hour expiry, carried in an HttpOnly cookie named labtrack_session.
//
// Default demo login (seeded on first run, changeable in Settings):
//   username: instructor
//   password: instructor123   (or $LABTRACK_PASSWORD when set)

const crypto = require('node:crypto');

const SESSION_COOKIE = 'labtrack_session';
const SESSION_MAX_AGE = 24 * 60 * 60; // seconds

function hashPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function verifyPassword(password, user) {
  const hash = hashPassword(password, user.password_salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(user.password_hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const [key, ...rest] = part.trim().split('=');
    if (key) out[key] = decodeURIComponent(rest.join('='));
  });
  return out;
}

// Resolve the logged-in user from the session cookie, or null.
function getSessionUser(req, store) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = store.sessions.get(token);
  if (!session) return null;
  const user = store.users.getById(session.user_id);
  return user ? { id: user.id, username: user.username } : null;
}

// Middleware: API routes reply 401 JSON; page requests redirect to /login.
// `api: true` forces the 401 form (used for the /api mount, where Express
// strips the mount prefix from req.path).
function requireAuth(store, { api = false } = {}) {
  return (req, res, next) => {
    const user = getSessionUser(req, store);
    if (user) {
      req.user = user;
      return next();
    }
    if (api || req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    return res.redirect('/login.html');
  };
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  );
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  newSalt,
  verifyPassword,
  parseCookies,
  getSessionUser,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
};
