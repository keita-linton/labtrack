// tests/api.test.js — automated API tests for LabTrack v2.
//
// Uses Node's built-in test runner (node:test) and the global fetch — no
// extra test dependencies. Run with:  npm test
//
// The suite starts the real server against a throwaway SQLite file seeded
// from a temp copy of the v1 seed data, so tests never touch labtrack.db.
// It logs in first (demo instructor account) and carries the session
// cookie, exactly like the front-end does.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

const SEED = {
  students: [
    { id: 'stu-test-1', name: 'Test One', email: 'one@example.com', cohort: 'Fall 2026' },
    { id: 'stu-test-2', name: 'Test Two', email: '', cohort: '' },
  ],
  labs: [
    { id: 'lab-test-1', studentId: 'stu-test-1', title: 'HTML & CSS Basics', status: 'complete' },
    { id: 'lab-test-2', studentId: 'stu-test-1', title: 'JavaScript Fundamentals', status: 'in-progress' },
  ],
};

let app;
let server;
let baseUrl;
let tmpDb;
let tmpSeed;
let cookie = '';

before(async () => {
  const stamp = Date.now();
  tmpDb = path.join(os.tmpdir(), `labtrack-test-${stamp}.db`);
  tmpSeed = path.join(os.tmpdir(), `labtrack-test-${stamp}.json`);
  fs.writeFileSync(tmpSeed, JSON.stringify(SEED), 'utf8');

  app = createApp({ dbPath: tmpDb, seedFile: tmpSeed });
  await new Promise((resolve) => {
    server = app.listen(0, resolve); // port 0 = any free port
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Log in as the demo instructor and keep the session cookie.
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'instructor', password: 'instructor123' }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.ok(setCookie && setCookie.includes('labtrack_session='));
  cookie = setCookie.split(';')[0];
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  app.locals.closeDb();
  fs.rmSync(tmpDb, { force: true });
  fs.rmSync(tmpSeed, { force: true });
});

async function req(pathname, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (cookie && !options.anonymous) headers.Cookie = cookie;
  const res = await fetch(`${baseUrl}${pathname}`, { ...options, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

describe('auth', () => {
  it('rejects a protected API route without a session (401)', async () => {
    const { status, body } = await req('/api/students', { anonymous: true });
    assert.equal(status, 401);
    assert.match(body.error, /log in/i);
  });

  it('rejects a wrong password (401)', async () => {
    const { status } = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'instructor', password: 'nope-wrong' }),
    });
    assert.equal(status, 401);
  });

  it('rejects an unknown username (401)', async () => {
    const { status } = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'nobody', password: 'instructor123' }),
    });
    assert.equal(status, 401);
  });

  it('reports the logged-in instructor via /api/auth/me', async () => {
    const { status, body } = await req('/api/auth/me');
    assert.equal(status, 200);
    assert.equal(body.user.username, 'instructor');
  });

  it('serves the login page without a session, and redirects the dashboard to it', async () => {
    const loginPage = await fetch(`${baseUrl}/login.html`);
    assert.equal(loginPage.status, 200);
    const dashboard = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    assert.equal(dashboard.status, 302);
    assert.equal(dashboard.headers.get('location'), '/login.html');
  });

  it('changes the password and back again', async () => {
    const changed = await req('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'instructor123', newPassword: 'temporary-pass-9' }),
    });
    assert.equal(changed.status, 200);

    const relogin = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'instructor', password: 'temporary-pass-9' }),
    });
    assert.equal(relogin.status, 200);
    cookie = relogin.headers.get('set-cookie').split(';')[0];

    const restored = await req('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'temporary-pass-9', newPassword: 'instructor123' }),
    });
    assert.equal(restored.status, 200);
  });
});

describe('students', () => {
  it('lists seeded students with a progress summary', async () => {
    const { status, body } = await req('/api/students');
    assert.equal(status, 200);
    assert.equal(body.total, 2);
    const one = body.students.find((s) => s.id === 'stu-test-1');
    assert.deepEqual(one.progress, { total: 2, complete: 1, percent: 50 });
    assert.equal(one.cohort, 'Fall 2026');
  });

  it('searches by name', async () => {
    const { status, body } = await req('/api/students?search=Test%20One');
    assert.equal(status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.students[0].name, 'Test One');
  });

  it('paginates (pageSize=1 gives 2 pages)', async () => {
    const { status, body } = await req('/api/students?pageSize=1&page=1');
    assert.equal(status, 200);
    assert.equal(body.students.length, 1);
    assert.equal(body.totalPages, 2);
    assert.equal(body.page, 1);
  });

  it('sorts by progress descending', async () => {
    const { status, body } = await req('/api/students?sort=progress&order=desc');
    assert.equal(status, 200);
    assert.equal(body.students[0].id, 'stu-test-1');
  });

  it('creates a student and returns 201', async () => {
    const { status, body } = await req('/api/students', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Three', email: 'three@example.com', cohort: '' }),
    });
    assert.equal(status, 201);
    assert.equal(body.name, 'Test Three');
    assert.equal(body.progress.percent, 0);
    assert.ok(body.id);
  });

  it('rejects a student with no name (400)', async () => {
    const { status, body } = await req('/api/students', {
      method: 'POST',
      body: JSON.stringify({ name: '   ', email: 'x@example.com' }),
    });
    assert.equal(status, 400);
    assert.match(body.error, /name/i);
  });

  it('rejects an invalid email (400)', async () => {
    const { status, body } = await req('/api/students', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bad Email', email: 'not-an-email' }),
    });
    assert.equal(status, 400);
    assert.match(body.error, /email/i);
  });

  it('returns 404 for an unknown student', async () => {
    const { status, body } = await req('/api/students/no-such-id');
    assert.equal(status, 404);
    assert.match(body.error, /not found/i);
  });

  it('updates a student with PATCH', async () => {
    const { status, body } = await req('/api/students/stu-test-2', {
      method: 'PATCH',
      body: JSON.stringify({ cohort: '' }),
    });
    assert.equal(status, 200);
    assert.equal(body.name, 'Test Two'); // untouched fields stay put
  });
});

describe('labs and grading', () => {
  let createdLabId;

  it('lists labs filtered by student', async () => {
    const { status, body } = await req('/api/labs?studentId=stu-test-1');
    assert.equal(status, 200);
    assert.equal(body.length, 2);
    assert.ok(body.every((lab) => lab.student_id === 'stu-test-1'));
  });

  it('lists the seeded modules and templates', async () => {
    const modules = await req('/api/labs/modules');
    assert.equal(modules.status, 200);
    assert.equal(modules.body.length, 8);
    const templates = await req('/api/labs/templates');
    assert.equal(templates.status, 200);
    assert.ok(templates.body.length >= 17);
  });

  it('creates a lab from a template (title comes from the template)', async () => {
    const { status, body } = await req('/api/labs', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'stu-test-1', templateId: 'tpl-css-layout' }),
    });
    assert.equal(status, 201);
    assert.equal(body.title, 'CSS Layout & Flexbox');
    assert.equal(body.status, 'not-started');
    assert.equal(body.score, null);
    createdLabId = body.id;
  });

  it('rejects a lab for an unknown student (400)', async () => {
    const { status, body } = await req('/api/labs', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'ghost', title: 'React Components' }),
    });
    assert.equal(status, 400);
    assert.match(body.error, /studentId/i);
  });

  it('rejects a score above 100 (400)', async () => {
    const { status, body } = await req('/api/labs', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'stu-test-1', title: 'Bad Score', score: 150 }),
    });
    assert.equal(status, 400);
    assert.match(body.error, /score/i);
  });

  it('grades a lab and the student average follows', async () => {
    const patched = await req(`/api/labs/${createdLabId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'complete', score: 88 }),
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.score, 88);

    const student = await req('/api/students/stu-test-1');
    assert.equal(student.status, 200);
    assert.equal(student.body.avgScore, 88);
    assert.equal(student.body.progress.percent, 67);
  });

  it('clears a score back to null', async () => {
    const patched = await req(`/api/labs/${createdLabId}`, {
      method: 'PATCH',
      body: JSON.stringify({ score: null }),
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.score, null);
  });

  it('assigns a template to a student, then skips the duplicate', async () => {
    const first = await req('/api/labs/assign', {
      method: 'POST',
      body: JSON.stringify({ templateId: 'tpl-async', studentId: 'stu-test-2' }),
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.created, 1);
    const second = await req('/api/labs/assign', {
      method: 'POST',
      body: JSON.stringify({ templateId: 'tpl-async', studentId: 'stu-test-2' }),
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.created, 0);
    assert.equal(second.body.skipped, 1);
  });

  it('deletes a lab (204) and it stays gone', async () => {
    const deleted = await req(`/api/labs/${createdLabId}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    const gone = await req(`/api/labs/${createdLabId}`);
    assert.equal(gone.status, 404);
  });
});

describe('attendance', () => {
  it('marks attendance and re-marking the same date updates it', async () => {
    const first = await req('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'stu-test-1', date: '2026-11-07', status: 'present' }),
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.status, 'present');

    const again = await req('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'stu-test-1', date: '2026-11-07', status: 'late', note: 'Bus was late' }),
    });
    assert.equal(again.status, 201);
    assert.equal(again.body.status, 'late');
    assert.equal(again.body.id, first.body.id); // same record, updated

    const summary = await req('/api/attendance/summary?studentId=stu-test-1');
    assert.equal(summary.status, 200);
    // 3 seeded sessions (Oct 28, Nov 4, Nov 6) + the one just marked.
    assert.equal(summary.body.total, 4);
    assert.equal(summary.body.late, 1); // the re-marked Nov 7 record
  });

  it('rejects an invalid attendance status (400)', async () => {
    const { status, body } = await req('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'stu-test-1', date: '2026-11-07', status: 'maybe' }),
    });
    assert.equal(status, 400);
    assert.match(body.error, /status/i);
  });

  it('rejects a bad date format (400)', async () => {
    const { status } = await req('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ studentId: 'stu-test-1', date: 'Nov 7', status: 'present' }),
    });
    assert.equal(status, 400);
  });
});

describe('analytics and export', () => {
  it('returns an overview with totals and at-risk students', async () => {
    const { status, body } = await req('/api/analytics/overview');
    assert.equal(status, 200);
    assert.ok(body.totals.students >= 2);
    assert.ok(Array.isArray(body.atRisk));
    assert.ok(Array.isArray(body.recentActivity));
    assert.equal(typeof body.totals.completionPercent, 'number');
  });

  it('returns per-student analytics', async () => {
    const { status, body } = await req('/api/analytics/students');
    assert.equal(status, 200);
    const one = body.find((s) => s.id === 'stu-test-1');
    assert.ok(one);
    assert.equal(one.progress.total, 2);
  });

  it('returns per-module analytics', async () => {
    const { status, body } = await req('/api/analytics/modules');
    assert.equal(status, 200);
    assert.equal(body.length, 8);
    assert.ok(body.every((m) => typeof m.percent === 'number'));
  });

  it('exports a progress CSV containing the seeded students', async () => {
    const res = await fetch(`${baseUrl}/api/export/progress.csv`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const text = await res.text();
    assert.match(text, /Student,Email,Cohort/);
    assert.match(text, /Test One/);
  });

  it('exports an attendance CSV', async () => {
    const res = await fetch(`${baseUrl}/api/export/attendance.csv`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /Date,Student,Status/);
    assert.match(text, /2026-11-07/);
  });
});

describe('settings and cohorts', () => {
  it('reads and updates grading settings', async () => {
    const before = await req('/api/settings');
    assert.equal(before.status, 200);
    assert.equal(before.body.pass_mark, 60);

    const updated = await req('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ pass_mark: 70 }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.pass_mark, 70);

    const restored = await req('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ pass_mark: 60 }),
    });
    assert.equal(restored.body.pass_mark, 60);
  });

  it('creates, rejects a duplicate, and deletes a cohort', async () => {
    const created = await req('/api/settings/cohorts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Spring 2027' }),
    });
    assert.equal(created.status, 201);

    const dup = await req('/api/settings/cohorts', {
      method: 'POST',
      body: JSON.stringify({ name: 'spring 2027' }),
    });
    assert.equal(dup.status, 400);

    const deleted = await req(`/api/settings/cohorts/${created.body.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
  });
});

describe('deleting a student', () => {
  it('removes the student, their labs and their attendance', async () => {
    const deleted = await req('/api/students/stu-test-2', { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    const gone = await req('/api/students/stu-test-2');
    assert.equal(gone.status, 404);
    const labs = await req('/api/labs?studentId=stu-test-2');
    assert.equal(labs.body.length, 0);
  });
});
