// src/routes/export.js — CSV downloads for progress and attendance reports.

const express = require('express');

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach((row) => lines.push(row.map(csvCell).join(',')));
  return lines.join('\r\n') + '\r\n';
}

function exportRoutes(store) {
  const router = express.Router();

  // GET /api/export/progress.csv — one row per student: cohort, labs,
  // completion, average score, attendance rate.
  router.get('/progress.csv', (req, res) => {
    const rows = store.analytics.byStudent().map((s) => [
      s.name,
      s.email,
      s.cohort || '',
      s.progress.total,
      s.progress.complete,
      `${s.progress.percent}%`,
      s.avgScore === null ? '' : s.avgScore,
      s.attendance.rate === null ? '' : `${s.attendance.rate}%`,
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="labtrack-progress.csv"');
    res.send(
      toCsv(
        ['Student', 'Email', 'Cohort', 'Labs assigned', 'Labs complete', 'Completion', 'Average score', 'Attendance'],
        rows
      )
    );
  });

  // GET /api/export/attendance.csv — one row per attendance record.
  router.get('/attendance.csv', (req, res) => {
    const rows = store.attendance.list({}).map((r) => [
      r.session_date,
      r.student_name,
      r.status,
      r.note || '',
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="labtrack-attendance.csv"');
    res.send(toCsv(['Date', 'Student', 'Status', 'Note'], rows));
  });

  return router;
}

module.exports = { exportRoutes };
