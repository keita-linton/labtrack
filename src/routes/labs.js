// src/routes/labs.js — per-student labs (with grades), lab templates & modules.
//
// NOTE on route order: the fixed paths (/modules, /templates, /assign)
// are registered BEFORE /:id, or Express would treat "modules" as a lab id.

const express = require('express');
const { validateLabInput, validateTemplateInput } = require('../validate');

function labRoutes(store) {
  const router = express.Router();

  // --- Lab instances -------------------------------------------------------

  // GET /api/labs?studentId=&status=&moduleId=&search=
  router.get('/', (req, res) => {
    res.json(
      store.labs.list({
        studentId: req.query.studentId || '',
        status: req.query.status || '',
        moduleId: req.query.moduleId || '',
        search: req.query.search || '',
      })
    );
  });

  // POST /api/labs — { studentId, templateId? | title, status?, score? }
  // With a templateId the title comes from the template.
  router.post('/', (req, res) => {
    const body = req.body || {};
    let title = body.title;
    if (body.templateId) {
      const template = store.templates.get(body.templateId);
      if (!template) return res.status(400).json({ error: 'templateId does not match an existing template.' });
      title = title || template.title;
    }
    const error = validateLabInput({ ...body, title });
    if (error) return res.status(400).json({ error });
    if (!store.students.get(body.studentId)) {
      return res.status(400).json({ error: 'studentId does not match an existing student.' });
    }
    const lab = store.labs.create({
      studentId: body.studentId,
      templateId: body.templateId || null,
      title: title.trim(),
      status: body.status || 'not-started',
      score: body.score !== undefined ? body.score : null,
    });
    res.status(201).json(lab);
  });

  // POST /api/labs/assign — { templateId, studentId? | cohortId? }
  // Assigns a template to one student or a whole cohort, skipping labs
  // that already exist for that template + student.
  router.post('/assign', (req, res) => {
    const { templateId, studentId, cohortId } = req.body || {};
    if (typeof templateId !== 'string' || !templateId) {
      return res.status(400).json({ error: 'templateId is required.' });
    }
    if (studentId && !store.students.get(studentId)) {
      return res.status(400).json({ error: 'studentId does not match an existing student.' });
    }
    if (cohortId && !store.cohorts.get(cohortId)) {
      return res.status(400).json({ error: 'cohortId does not match an existing cohort.' });
    }
    const result = store.labs.assign(templateId, { studentId, cohortId });
    if (!result) return res.status(404).json({ error: 'Template not found.' });
    res.status(201).json(result);
  });

  // --- Modules & templates -------------------------------------------------

  // GET /api/labs/modules — modules with their templates nested.
  router.get('/modules', (req, res) => {
    res.json(store.modules.list());
  });

  // POST /api/labs/modules — { name, description? }
  router.post('/modules', (req, res) => {
    const { name, description } = req.body || {};
    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Module name is required.' });
    }
    res.status(201).json(store.modules.create({ name: name.trim(), description: description || '' }));
  });

  // DELETE /api/labs/modules/:id — also removes its templates.
  router.delete('/modules/:id', (req, res) => {
    const changed = store.modules.delete(req.params.id);
    if (!changed) return res.status(404).json({ error: 'Module not found.' });
    res.status(204).end();
  });

  // GET /api/labs/templates?moduleId=
  router.get('/templates', (req, res) => {
    res.json(store.templates.list(req.query.moduleId || ''));
  });

  // POST /api/labs/templates — { moduleId, title, description? }
  router.post('/templates', (req, res) => {
    const error = validateTemplateInput(req.body);
    if (error) return res.status(400).json({ error });
    if (!store.modules.get(req.body.moduleId)) {
      return res.status(400).json({ error: 'moduleId does not match an existing module.' });
    }
    const template = store.templates.create({
      moduleId: req.body.moduleId,
      title: req.body.title.trim(),
      description: req.body.description || '',
    });
    res.status(201).json(template);
  });

  // DELETE /api/labs/templates/:id
  router.delete('/templates/:id', (req, res) => {
    const changed = store.templates.delete(req.params.id);
    if (!changed) return res.status(404).json({ error: 'Template not found.' });
    res.status(204).end();
  });

  // --- Single lab (kept after the fixed paths above) -----------------------

  // GET /api/labs/:id
  router.get('/:id', (req, res) => {
    const lab = store.labs.get(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab not found.' });
    res.json(lab);
  });

  // PATCH /api/labs/:id — update title / status / score (null clears the score).
  router.patch('/:id', (req, res) => {
    const error = validateLabInput(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    const lab = store.labs.update(req.params.id, {
      title: req.body.title !== undefined ? req.body.title.trim() : undefined,
      status: req.body.status,
      score: req.body.score,
    });
    if (!lab) return res.status(404).json({ error: 'Lab not found.' });
    res.json(lab);
  });

  // DELETE /api/labs/:id
  router.delete('/:id', (req, res) => {
    const changed = store.labs.delete(req.params.id);
    if (!changed) return res.status(404).json({ error: 'Lab not found.' });
    res.status(204).end();
  });

  return router;
}

module.exports = { labRoutes };
