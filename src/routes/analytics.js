// src/routes/analytics.js — dashboard overview and analytics aggregates.

const express = require('express');

function analyticsRoutes(store) {
  const router = express.Router();

  // GET /api/analytics/overview — totals, at-risk students, recent activity.
  router.get('/overview', (req, res) => {
    res.json(store.analytics.overview());
  });

  // GET /api/analytics/students — per-student progress, average score, attendance.
  router.get('/students', (req, res) => {
    res.json(store.analytics.byStudent());
  });

  // GET /api/analytics/modules — completion and average score per module.
  router.get('/modules', (req, res) => {
    res.json(store.analytics.byModule());
  });

  return router;
}

module.exports = { analyticsRoutes };
