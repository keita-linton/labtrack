// src/routes/attendance.js — per-session attendance register.

const express = require('express');
const { validateAttendanceInput } = require('../validate');

function attendanceRoutes(store) {
  const router = express.Router();

  // GET /api/attendance?studentId=&date=&from=&to=
  router.get('/', (req, res) => {
    res.json(
      store.attendance.list({
        studentId: req.query.studentId || '',
        date: req.query.date || '',
        from: req.query.from || '',
        to: req.query.to || '',
      })
    );
  });

  // GET /api/attendance/dates — session dates on record, newest first.
  router.get('/dates', (req, res) => {
    res.json(store.attendance.sessionDates());
  });

  // GET /api/attendance/summary?studentId= — totals + attendance rate.
  router.get('/summary', (req, res) => {
    if (!req.query.studentId) {
      return res.status(400).json({ error: 'studentId is required.' });
    }
    if (!store.students.get(req.query.studentId)) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    res.json(store.attendance.summary(req.query.studentId));
  });

  // POST /api/attendance — { studentId, date, status, note? }
  // One record per student per date; re-marking the same date updates it.
  router.post('/', (req, res) => {
    const error = validateAttendanceInput(req.body);
    if (error) return res.status(400).json({ error });
    if (!store.students.get(req.body.studentId)) {
      return res.status(400).json({ error: 'studentId does not match an existing student.' });
    }
    const record = store.attendance.mark({
      studentId: req.body.studentId,
      sessionDate: req.body.date,
      status: req.body.status,
      note: req.body.note || '',
    });
    res.status(201).json(record);
  });

  return router;
}

module.exports = { attendanceRoutes };
