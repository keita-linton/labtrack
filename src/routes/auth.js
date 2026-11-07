// src/routes/auth.js — login, logout, who-am-I, change password.

const express = require('express');
const {
  verifyPassword,
  hashPassword,
  newSalt,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
} = require('../auth');

function authRoutes(store) {
  const router = express.Router();

  // POST /api/auth/login — { username, password } -> sets the session cookie.
  router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const user = store.users.getByUsername(username.trim());
    if (!user || !verifyPassword(password, user)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    const session = store.sessions.create(user.id);
    setSessionCookie(res, session.id);
    res.json({ user: { id: user.id, username: user.username } });
  });

  // POST /api/auth/logout — deletes the session, clears the cookie.
  router.post('/logout', (req, res) => {
    const token = (req.headers.cookie || '')
      .split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith('labtrack_session='));
    if (token) store.sessions.delete(token.split('=')[1]);
    clearSessionCookie(res);
    res.status(204).end();
  });

  // GET /api/auth/me — the logged-in instructor, or 401.
  router.get('/me', (req, res) => {
    const user = getSessionUser(req, store);
    if (!user) return res.status(401).json({ error: 'Authentication required. Please log in.' });
    res.json({ user });
  });

  // POST /api/auth/change-password — { currentPassword, newPassword }.
  router.post('/change-password', (req, res) => {
    const user = getSessionUser(req, store);
    if (!user) return res.status(401).json({ error: 'Authentication required. Please log in.' });
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Current and new passwords are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const full = store.users.getById(user.id);
    if (!full || !verifyPassword(currentPassword, full)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const salt = newSalt();
    store.users.updatePassword(user.id, hashPassword(newPassword, salt), salt);
    res.json({ message: 'Password updated.' });
  });

  return router;
}

module.exports = { authRoutes };
