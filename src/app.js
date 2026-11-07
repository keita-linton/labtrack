// src/app.js — LabTrack v2 application factory.
//
// Wiring only: creates the Express app, mounts the API routers, guards the
// pages behind the instructor login, serves the static front-end, and ends
// with the JSON/HTML error handlers. All data lives in src/db.js, all
// auth in src/auth.js, all endpoints in src/routes/.
//
// createApp({ dbPath, seedFile }) — tests pass a temp database + seed file;
// production defaults to labtrack.db + the v1 data.json seed.

const express = require('express');
const path = require('node:path');
const { initDb, createStore } = require('./db');
const { hashPassword, getSessionUser, requireAuth } = require('./auth');
const { authRoutes } = require('./routes/auth');
const { studentRoutes } = require('./routes/students');
const { labRoutes } = require('./routes/labs');
const { attendanceRoutes } = require('./routes/attendance');
const { analyticsRoutes } = require('./routes/analytics');
const { settingsRoutes } = require('./routes/settings');
const { exportRoutes } = require('./routes/export');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DEFAULT_DB = path.join(__dirname, '..', 'labtrack.db');
const DEFAULT_SEED = path.join(__dirname, '..', 'data.json');

// Files anyone may load without logging in (the login page and its assets).
const PUBLIC_FILES = new Set(['/login.html', '/login.js', '/styles.css', '/404.html', '/favicon.ico']);

function createApp({ dbPath = DEFAULT_DB, seedFile = DEFAULT_SEED } = {}) {
  const db = initDb(dbPath, { seedFile, hashPassword });
  const store = createStore(db);
  const app = express();

  app.use(express.json());

  // Login / logout / who-am-I are public; everything else under /api
  // requires a session (401 JSON when missing or expired).
  app.use('/api/auth', authRoutes(store));
  app.use('/api', requireAuth(store, { api: true }));
  app.use('/api/students', studentRoutes(store));
  app.use('/api/labs', labRoutes(store));
  app.use('/api/attendance', attendanceRoutes(store));
  app.use('/api/analytics', analyticsRoutes(store));
  app.use('/api/settings', settingsRoutes(store));
  app.use('/api/export', exportRoutes(store));

  // Unknown /api route -> JSON 404 (keeps the API consistent for the front-end).
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

  // Pages: the login page is public; every other page needs a session and
  // redirects to /login.html when there is none.
  app.use((req, res, next) => {
    if (PUBLIC_FILES.has(req.path) || req.path.startsWith('/api/')) return next();
    const user = getSessionUser(req, store);
    if (!user) return res.redirect('/login.html');
    req.user = user;
    return next();
  });

  app.use(express.static(PUBLIC_DIR));

  // Unknown page -> the 404 page.
  app.use((req, res) => {
    res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
  });

  // Malformed JSON bodies and anything else -> JSON 500, never a stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    console.error(err);
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'Internal server error.' });
    }
    res.status(500).sendFile(path.join(PUBLIC_DIR, '404.html'));
  });

  // Lets tests close the database file when they finish.
  app.locals.closeDb = () => db.close();

  return app;
}

module.exports = { createApp };
