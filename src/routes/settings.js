// src/routes/settings.js — cohorts and app settings (grading scale, thresholds).

const express = require('express');
const { validateSettingsInput } = require('../validate');

function settingsRoutes(store) {
  const router = express.Router();

  // GET /api/settings — { pass_mark, at_risk_progress }
  router.get('/', (req, res) => {
    const all = store.settings.all();
    res.json({
      pass_mark: Number(all.pass_mark ?? 60),
      at_risk_progress: Number(all.at_risk_progress ?? 50),
    });
  });

  // PATCH /api/settings — { pass_mark?, at_risk_progress? }
  router.patch('/', (req, res) => {
    const error = validateSettingsInput(req.body);
    if (error) return res.status(400).json({ error });
    if (req.body.pass_mark !== undefined) store.settings.set('pass_mark', req.body.pass_mark);
    if (req.body.at_risk_progress !== undefined) {
      store.settings.set('at_risk_progress', req.body.at_risk_progress);
    }
    const all = store.settings.all();
    res.json({
      pass_mark: Number(all.pass_mark ?? 60),
      at_risk_progress: Number(all.at_risk_progress ?? 50),
    });
  });

  // GET /api/settings/cohorts
  router.get('/cohorts', (req, res) => {
    res.json(store.cohorts.list());
  });

  // POST /api/settings/cohorts — { name }
  router.post('/cohorts', (req, res) => {
    const { name } = req.body || {};
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Cohort name is required.' });
    }
    if (store.cohorts.list().some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(400).json({ error: 'A cohort with that name already exists.' });
    }
    res.status(201).json(store.cohorts.create(name.trim()));
  });

  // DELETE /api/settings/cohorts/:id — students in it keep their records,
  // their cohort is cleared.
  router.delete('/cohorts/:id', (req, res) => {
    const changed = store.cohorts.delete(req.params.id);
    if (!changed) return res.status(404).json({ error: 'Cohort not found.' });
    res.status(204).end();
  });

  return router;
}

module.exports = { settingsRoutes };
