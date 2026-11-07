// src/routes/students.js — student CRUD + list with search/filter/sort/pagination.

const express = require('express');
const { validateStudentInput } = require('../validate');

function studentRoutes(store) {
  const router = express.Router();

  // GET /api/students?search=&cohort=&sort=name|progress|score&order=asc|desc&page=&pageSize=
  router.get('/', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const sort = ['name', 'progress', 'score'].includes(req.query.sort) ? req.query.sort : 'name';
    const order = req.query.order === 'desc' ? 'desc' : 'asc';
    res.json(
      store.students.list({
        search: req.query.search || '',
        cohortId: req.query.cohort || '',
        sort,
        order,
        page,
        pageSize,
      })
    );
  });

  // POST /api/students — { name, email?, cohortId? }
  router.post('/', (req, res) => {
    const error = validateStudentInput(req.body);
    if (error) return res.status(400).json({ error });
    if (req.body.cohortId && !store.cohorts.get(req.body.cohortId)) {
      return res.status(400).json({ error: 'cohortId does not match an existing cohort.' });
    }
    const student = store.students.create({
      name: req.body.name.trim(),
      email: req.body.email ? req.body.email.trim() : '',
      cohortId: req.body.cohortId || null,
    });
    res.status(201).json(student);
  });

  // GET /api/students/:id — student with progress, average score, attendance.
  router.get('/:id', (req, res) => {
    const student = store.students.get(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json(student);
  });

  // PATCH /api/students/:id — update name / email / cohortId.
  router.patch('/:id', (req, res) => {
    const error = validateStudentInput(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    if (req.body.cohortId && !store.cohorts.get(req.body.cohortId)) {
      return res.status(400).json({ error: 'cohortId does not match an existing cohort.' });
    }
    const student = store.students.update(req.params.id, {
      name: req.body.name !== undefined ? req.body.name.trim() : undefined,
      email: req.body.email !== undefined ? req.body.email.trim() : undefined,
      cohortId: req.body.cohortId,
    });
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json(student);
  });

  // DELETE /api/students/:id — removes the student, their labs and attendance.
  router.delete('/:id', (req, res) => {
    const changed = store.students.delete(req.params.id);
    if (!changed) return res.status(404).json({ error: 'Student not found.' });
    res.status(204).end();
  });

  // GET /api/students/:id/progress — { studentId, total, complete, percent }.
  router.get('/:id/progress', (req, res) => {
    const student = store.students.get(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json({ studentId: student.id, ...student.progress });
  });

  return router;
}

module.exports = { studentRoutes };
