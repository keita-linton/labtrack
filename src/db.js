// src/db.js — LabTrack data layer (SQLite via Node's built-in node:sqlite).
//
// This is the v2 replacement for the v1 JSON-file store (db.js). One SQLite
// file (labtrack.db) holds everything: users, cohorts, students, diploma
// modules, lab templates, per-student labs (with grades), attendance and
// sessions. No database server, no native modules — node:sqlite ships with
// Node 22.5+ and the only npm dependency in the whole project is Express.
//
// Data model
//   users          { id, username, password_hash, password_salt, created_at }
//   cohorts        { id, name, created_at }
//   students       { id, name, email, cohort_id -> cohorts, created_at }
//   modules        { id, name, description, sort_order }
//   lab_templates  { id, module_id -> modules, title, description, sort_order }
//   labs           { id, student_id -> students, template_id -> lab_templates,
//                    title, status, score (0-100, null = ungraded),
//                    max_score, created_at, updated_at }
//   attendance     { id, student_id -> students, session_date, status, note }
//                  status: present | absent | late | excused
//   sessions       { id, user_id -> users, expires_at, created_at }
//   settings       { key, value }
//
// First run: the schema is created and the database is seeded from
// data.json (the v1 seed file — same 5 fictional students, 17 labs),
// plus the diploma modules/templates, a default instructor login and
// default settings. Seeding only happens when the tables are empty, so
// re-running the server never wipes real data.
//
// Every function in this module is synchronous (DatabaseSync) — the HTTP
// layer stays thin and the tests can use throwaway database files.

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const VALID_STATUSES = ['not-started', 'in-progress', 'complete'];
const VALID_ATTENDANCE = ['present', 'absent', 'late', 'excused'];

// Diploma modules and the lab templates that ship with them. The templates
// cover the full-stack diploma the posting teaches; instructors can add
// more from the Labs page.
const MODULE_SEED = [
  {
    id: 'mod-html-css',
    name: 'HTML & CSS',
    description: 'Semantic markup, layout, responsive design.',
    templates: [
      { id: 'tpl-html-basics', title: 'HTML & CSS Basics', description: 'Build a semantic, accessible page from a mockup.' },
      { id: 'tpl-css-layout', title: 'CSS Layout & Flexbox', description: 'Recreate a two-column layout with Flexbox and Grid.' },
      { id: 'tpl-responsive', title: 'Responsive Design', description: 'Make a page adapt cleanly from mobile to desktop.' },
    ],
  },
  {
    id: 'mod-javascript',
    name: 'JavaScript',
    description: 'Language fundamentals, DOM, async code.',
    templates: [
      { id: 'tpl-js-fundamentals', title: 'JavaScript Fundamentals', description: 'Variables, functions, arrays and objects.' },
      { id: 'tpl-dom', title: 'DOM Manipulation', description: 'Build an interactive list that renders from state.' },
      { id: 'tpl-async', title: 'Async JavaScript', description: 'Fetch data from an API and render it with error handling.' },
    ],
  },
  {
    id: 'mod-react',
    name: 'React & TypeScript',
    description: 'Components, state, props, typed code.',
    templates: [
      { id: 'tpl-react-components', title: 'React Components', description: 'Rebuild a vanilla-JS screen as React components.' },
      { id: 'tpl-react-state', title: 'State & Props', description: 'Lift state up and pass data down through props.' },
    ],
  },
  {
    id: 'mod-node-express',
    name: 'Node & Express',
    description: 'Servers, routing, middleware, JSON APIs.',
    templates: [
      { id: 'tpl-node-express', title: 'Node & Express API', description: 'Build a REST API with routing and validation.' },
      { id: 'tpl-middleware', title: 'Middleware & Errors', description: 'Add logging, auth checks and a JSON error handler.' },
    ],
  },
  {
    id: 'mod-databases',
    name: 'Databases (SQL / NoSQL)',
    description: 'Relational design, queries, document stores.',
    templates: [
      { id: 'tpl-sql', title: 'SQL Queries', description: 'Design tables and write SELECTs with JOINs and aggregates.' },
      { id: 'tpl-nosql', title: 'NoSQL Documents', description: 'Model the same data as documents and compare trade-offs.' },
    ],
  },
  {
    id: 'mod-git',
    name: 'Git & GitHub',
    description: 'Version control, branching, pull requests.',
    templates: [
      { id: 'tpl-git', title: 'Git & GitHub Workflow', description: 'Branch, commit, push and open a pull request.' },
      { id: 'tpl-merge', title: 'Merging & Conflicts', description: 'Resolve a merge conflict and review a teammate’s PR.' },
    ],
  },
  {
    id: 'mod-rest-testing',
    name: 'REST APIs & Testing',
    description: 'API design, status codes, automated tests.',
    templates: [
      { id: 'tpl-rest-testing', title: 'REST API Testing', description: 'Write API tests covering happy paths and 400/404s.' },
      { id: 'tpl-api-design', title: 'API Design', description: 'Design a resource API: routes, codes and error bodies.' },
    ],
  },
  {
    id: 'mod-deployment',
    name: 'Deployment',
    description: 'Shipping a Node app: env vars, hosts, monitoring.',
    templates: [
      { id: 'tpl-deployment', title: 'Deployment Basics', description: 'Deploy a Node app with environment config.' },
      { id: 'tpl-ci', title: 'CI & Health Checks', description: 'Add a test step and a health endpoint to a deploy pipeline.' },
    ],
  },
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  cohort_id TEXT REFERENCES cohorts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lab_templates (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS labs (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES lab_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not-started',
  score INTEGER,
  max_score INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_date TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (student_id, session_date)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_labs_student ON labs(student_id);
CREATE INDEX IF NOT EXISTS idx_labs_template ON labs(template_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`;

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Setup: open (or create) the database, build the schema, seed on first run.
// `seedFile` is the v1 data.json path; tests pass their own seed file.
// `hashPassword` is injected from auth.js to avoid a circular require — the
// default instructor account is only created when the users table is empty.
// ---------------------------------------------------------------------------

function initDb(dbPath, { seedFile = null, hashPassword = null } = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount === 0 && typeof hashPassword === 'function') {
    const salt = require('node:crypto').randomBytes(16).toString('hex');
    const hash = hashPassword(process.env.LABTRACK_PASSWORD || 'instructor123', salt);
    db.prepare(
      'INSERT INTO users (id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), 'instructor', hash, salt, nowIso());
  }

  const moduleCount = db.prepare('SELECT COUNT(*) AS n FROM modules').get().n;
  if (moduleCount === 0) {
    const insertModule = db.prepare(
      'INSERT INTO modules (id, name, description, sort_order) VALUES (?, ?, ?, ?)'
    );
    const insertTemplate = db.prepare(
      'INSERT INTO lab_templates (id, module_id, title, description, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    MODULE_SEED.forEach((mod, i) => {
      insertModule.run(mod.id, mod.name, mod.description, i);
      mod.templates.forEach((tpl, j) => {
        insertTemplate.run(tpl.id, mod.id, tpl.title, tpl.description, j);
      });
    });
  }

  const settingCount = db.prepare('SELECT COUNT(*) AS n FROM settings').get().n;
  if (settingCount === 0) {
    const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    put.run('pass_mark', '60');
    put.run('at_risk_progress', '50');
  }

  const studentCount = db.prepare('SELECT COUNT(*) AS n FROM students').get().n;
  if (studentCount === 0 && seedFile && fs.existsSync(seedFile)) {
    seedStudentsFromFile(db, seedFile);
    seedAttendance(db);
  }

  return db;
}

// Migrate the v1 seed file: cohort strings become cohort rows, lab titles
// are matched to templates of the same name so progress carries over.
function seedStudentsFromFile(db, seedFile) {
  const raw = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  if (!Array.isArray(raw.students) || !Array.isArray(raw.labs)) return;

  const cohortByName = new Map();
  const insertCohort = db.prepare(
    'INSERT INTO cohorts (id, name, created_at) VALUES (?, ?, ?)'
  );
  const insertStudent = db.prepare(
    'INSERT INTO students (id, name, email, cohort_id, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertLab = db.prepare(
    `INSERT INTO labs (id, student_id, template_id, title, status, score, max_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 100, ?, ?)`
  );
  const templateByTitle = new Map(
    db.prepare('SELECT id, title FROM lab_templates').all().map((t) => [t.title, t.id])
  );

  for (const s of raw.students) {
    let cohortId = null;
    if (s.cohort) {
      if (!cohortByName.has(s.cohort)) {
        cohortId = randomUUID();
        cohortByName.set(s.cohort, cohortId);
        insertCohort.run(cohortId, s.cohort, nowIso());
      } else {
        cohortId = cohortByName.get(s.cohort);
      }
    }
    insertStudent.run(s.id, s.name, s.email || '', cohortId, nowIso());
  }
  for (const lab of raw.labs) {
    insertLab.run(
      lab.id,
      lab.studentId,
      templateByTitle.get(lab.title) || null,
      lab.title,
      lab.status || 'not-started',
      nowIso(),
      nowIso()
    );
  }
}

// A few past sessions so attendance has something real to show on day one.
// Fall 2026 students were mostly present; Noah missed one session, Liam
// was late once. (Fictional seed data, same as the students.)
function seedAttendance(db) {
  const sessions = [
    { date: '2026-10-28', absent: ['stu-noah-tremblay'], late: [] },
    { date: '2026-11-04', absent: [], late: ['stu-liam-okafor'] },
    { date: '2026-11-06', absent: [], late: [] },
  ];
  const students = db.prepare('SELECT id FROM students').all().map((s) => s.id);
  const insert = db.prepare(
    'INSERT INTO attendance (id, student_id, session_date, status, note) VALUES (?, ?, ?, ?, ?)'
  );
  for (const session of sessions) {
    for (const studentId of students) {
      const status = session.absent.includes(studentId)
        ? 'absent'
        : session.late.includes(studentId)
          ? 'late'
          : 'present';
      insert.run(randomUUID(), studentId, session.date, status, '');
    }
  }
}

// ---------------------------------------------------------------------------
// Progress / score helpers — computed from labs so they can never drift.
// ---------------------------------------------------------------------------

function progressForLabs(labs) {
  const total = labs.length;
  const complete = labs.filter((l) => l.status === 'complete').length;
  return {
    total,
    complete,
    percent: total === 0 ? 0 : Math.round((complete / total) * 100),
  };
}

function avgScoreForLabs(labs) {
  const scored = labs.filter((l) => l.score !== null && l.score !== undefined);
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, l) => acc + l.score, 0);
  return Math.round((sum / scored.length) * 10) / 10;
}

function withStats(student, labs) {
  return {
    ...student,
    progress: progressForLabs(labs),
    avgScore: avgScoreForLabs(labs),
  };
}

// ---------------------------------------------------------------------------
// Data access — one object per resource area, all taking the open DatabaseSync.
// ---------------------------------------------------------------------------

function createStore(db) {
  const cohorts = {
    list() {
      return db.prepare('SELECT * FROM cohorts ORDER BY name ASC').all();
    },
    get(id) {
      return db.prepare('SELECT * FROM cohorts WHERE id = ?').get(id) || null;
    },
    create(name) {
      const id = randomUUID();
      db.prepare('INSERT INTO cohorts (id, name, created_at) VALUES (?, ?, ?)').run(id, name, nowIso());
      return cohorts.get(id);
    },
    delete(id) {
      return db.prepare('DELETE FROM cohorts WHERE id = ?').run(id).changes;
    },
  };

  const students = {
    // Search / filter / sort / paginate. Sort keys: name, progress, score.
    list({ search = '', cohortId = '', sort = 'name', order = 'asc', page = 1, pageSize = 10 } = {}) {
      let rows = db.prepare(
        `SELECT s.*, c.name AS cohort_name FROM students s
         LEFT JOIN cohorts c ON c.id = s.cohort_id`
      ).all();
      if (cohortId) rows = rows.filter((s) => s.cohort_id === cohortId);
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q) ||
            (s.cohort_name || '').toLowerCase().includes(q)
        );
      }
      const allLabs = db.prepare('SELECT * FROM labs').all();
      const withStatsRows = rows.map((s) => {
        const { cohort_name, ...rest } = s;
        return { ...withStats(rest, allLabs.filter((l) => l.student_id === s.id)), cohort: cohort_name || '' };
      });
      const dir = order === 'desc' ? -1 : 1;
      withStatsRows.sort((a, b) => {
        if (sort === 'progress') return (a.progress.percent - b.progress.percent) * dir;
        if (sort === 'score') return ((a.avgScore ?? -1) - (b.avgScore ?? -1)) * dir;
        return a.name.localeCompare(b.name) * dir;
      });
      const total = withStatsRows.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(Math.max(1, page), totalPages);
      const start = (safePage - 1) * pageSize;
      return {
        students: withStatsRows.slice(start, start + pageSize),
        total,
        page: safePage,
        pageSize,
        totalPages,
      };
    },
    get(id) {
      const row = db.prepare(
        `SELECT s.*, c.name AS cohort_name FROM students s
         LEFT JOIN cohorts c ON c.id = s.cohort_id WHERE s.id = ?`
      ).get(id);
      if (!row) return null;
      const { cohort_name, ...rest } = row;
      const labs = db.prepare('SELECT * FROM labs WHERE student_id = ?').all(id);
      const att = attendance.summary(id);
      return { ...withStats(rest, labs), cohort: cohort_name || '', attendance: att };
    },
    create({ name, email = '', cohortId = null }) {
      const id = randomUUID();
      db.prepare('INSERT INTO students (id, name, email, cohort_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
        id, name, email, cohortId || null, nowIso()
      );
      return students.get(id);
    },
    update(id, fields) {
      const current = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
      if (!current) return null;
      const next = {
        name: fields.name !== undefined ? fields.name : current.name,
        email: fields.email !== undefined ? fields.email : current.email,
        cohort_id: fields.cohortId !== undefined ? fields.cohortId || null : current.cohort_id,
      };
      db.prepare('UPDATE students SET name = ?, email = ?, cohort_id = ? WHERE id = ?').run(
        next.name, next.email, next.cohort_id, id
      );
      return students.get(id);
    },
    delete(id) {
      return db.prepare('DELETE FROM students WHERE id = ?').run(id).changes;
    },
  };

  const modules = {
    list() {
      const mods = db.prepare('SELECT * FROM modules ORDER BY sort_order ASC').all();
      return mods.map((m) => ({
        ...m,
        templates: db.prepare(
          'SELECT * FROM lab_templates WHERE module_id = ? ORDER BY sort_order ASC'
        ).all(m.id),
      }));
    },
    get(id) {
      return db.prepare('SELECT * FROM modules WHERE id = ?').get(id) || null;
    },
    create({ name, description = '' }) {
      const id = randomUUID();
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM modules').get().n;
      db.prepare('INSERT INTO modules (id, name, description, sort_order) VALUES (?, ?, ?, ?)').run(
        id, name, description, order
      );
      return modules.get(id);
    },
    delete(id) {
      return db.prepare('DELETE FROM modules WHERE id = ?').run(id).changes;
    },
  };

  const templates = {
    list(moduleId = '') {
      if (moduleId) {
        return db.prepare(
          `SELECT t.*, m.name AS module_name FROM lab_templates t
           JOIN modules m ON m.id = t.module_id
           WHERE t.module_id = ? ORDER BY t.sort_order ASC`
        ).all(moduleId);
      }
      return db.prepare(
        `SELECT t.*, m.name AS module_name FROM lab_templates t
         JOIN modules m ON m.id = t.module_id
         ORDER BY m.sort_order ASC, t.sort_order ASC`
      ).all();
    },
    get(id) {
      return db.prepare(
        `SELECT t.*, m.name AS module_name FROM lab_templates t
         JOIN modules m ON m.id = t.module_id WHERE t.id = ?`
      ).get(id) || null;
    },
    create({ moduleId, title, description = '' }) {
      const id = randomUUID();
      const order = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM lab_templates WHERE module_id = ?'
      ).get(moduleId).n;
      db.prepare(
        'INSERT INTO lab_templates (id, module_id, title, description, sort_order) VALUES (?, ?, ?, ?, ?)'
      ).run(id, moduleId, title, description, order);
      return templates.get(id);
    },
    delete(id) {
      return db.prepare('DELETE FROM lab_templates WHERE id = ?').run(id).changes;
    },
  };

  const labs = {
    list({ studentId = '', status = '', moduleId = '', search = '' } = {}) {
      let rows = db.prepare(
        `SELECT l.*, m.name AS module_name FROM labs l
         LEFT JOIN lab_templates t ON t.id = l.template_id
         LEFT JOIN modules m ON m.id = t.module_id
         ORDER BY l.created_at ASC`
      ).all();
      if (studentId) rows = rows.filter((l) => l.student_id === studentId);
      if (status) rows = rows.filter((l) => l.status === status);
      if (moduleId) {
        rows = rows.filter((l) => {
          const tpl = l.template_id
            ? db.prepare('SELECT module_id FROM lab_templates WHERE id = ?').get(l.template_id)
            : null;
          return tpl && tpl.module_id === moduleId;
        });
      }
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter((l) => l.title.toLowerCase().includes(q));
      }
      return rows;
    },
    get(id) {
      return db.prepare(
        `SELECT l.*, m.name AS module_name FROM labs l
         LEFT JOIN lab_templates t ON t.id = l.template_id
         LEFT JOIN modules m ON m.id = t.module_id WHERE l.id = ?`
      ).get(id) || null;
    },
    create({ studentId, templateId = null, title, status = 'not-started', score = null }) {
      const id = randomUUID();
      const ts = nowIso();
      db.prepare(
        `INSERT INTO labs (id, student_id, template_id, title, status, score, max_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 100, ?, ?)`
      ).run(id, studentId, templateId, title, status, score, ts, ts);
      return labs.get(id);
    },
    update(id, fields) {
      const current = labs.get(id);
      if (!current) return null;
      const next = {
        title: fields.title !== undefined ? fields.title : current.title,
        status: fields.status !== undefined ? fields.status : current.status,
        score: fields.score !== undefined ? fields.score : current.score,
      };
      db.prepare('UPDATE labs SET title = ?, status = ?, score = ?, updated_at = ? WHERE id = ?').run(
        next.title, next.status, next.score, nowIso(), id
      );
      return labs.get(id);
    },
    delete(id) {
      return db.prepare('DELETE FROM labs WHERE id = ?').run(id).changes;
    },
    // Assign a template to one student (or a whole cohort). Labs that already
    // exist for that template + student are skipped, never duplicated.
    assign(templateId, { studentId = null, cohortId = null } = {}) {
      const template = templates.get(templateId);
      if (!template) return null;
      let targets = [];
      if (studentId) {
        const s = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
        if (s) targets = [s.id];
      } else if (cohortId) {
        targets = db.prepare('SELECT id FROM students WHERE cohort_id = ?').all(cohortId).map((s) => s.id);
      }
      let created = 0;
      let skipped = 0;
      for (const sid of targets) {
        const exists = db.prepare(
          'SELECT id FROM labs WHERE student_id = ? AND template_id = ?'
        ).get(sid, templateId);
        if (exists) {
          skipped += 1;
          continue;
        }
        labs.create({ studentId: sid, templateId, title: template.title });
        created += 1;
      }
      return { created, skipped, total: targets.length };
    },
  };

  const attendance = {
    list({ studentId = '', date = '', from = '', to = '' } = {}) {
      let rows = db.prepare(
        `SELECT a.*, s.name AS student_name FROM attendance a
         JOIN students s ON s.id = a.student_id ORDER BY a.session_date DESC, s.name ASC`
      ).all();
      if (studentId) rows = rows.filter((r) => r.student_id === studentId);
      if (date) rows = rows.filter((r) => r.session_date === date);
      if (from) rows = rows.filter((r) => r.session_date >= from);
      if (to) rows = rows.filter((r) => r.session_date <= to);
      return rows;
    },
    // Upsert: one record per student per date.
    mark({ studentId, sessionDate, status, note = '' }) {
      const existing = db.prepare(
        'SELECT id FROM attendance WHERE student_id = ? AND session_date = ?'
      ).get(studentId, sessionDate);
      if (existing) {
        db.prepare('UPDATE attendance SET status = ?, note = ? WHERE id = ?').run(
          status, note, existing.id
        );
        return db.prepare('SELECT * FROM attendance WHERE id = ?').get(existing.id);
      }
      const id = randomUUID();
      db.prepare(
        'INSERT INTO attendance (id, student_id, session_date, status, note) VALUES (?, ?, ?, ?, ?)'
      ).run(id, studentId, sessionDate, status, note);
      return db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
    },
    summary(studentId) {
      const rows = db.prepare('SELECT status FROM attendance WHERE student_id = ?').all(studentId);
      const total = rows.length;
      const present = rows.filter((r) => r.status === 'present' || r.status === 'late').length;
      const counts = { present: 0, absent: 0, late: 0, excused: 0 };
      rows.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status] += 1; });
      return {
        total,
        present,
        ...counts,
        rate: total === 0 ? null : Math.round((present / total) * 100),
      };
    },
    sessionDates() {
      return db.prepare(
        'SELECT DISTINCT session_date FROM attendance ORDER BY session_date DESC'
      ).all().map((r) => r.session_date);
    },
  };

  const analytics = {
    overview() {
      const allStudents = db.prepare('SELECT * FROM students').all();
      const allLabs = db.prepare('SELECT * FROM labs').all();
      const cohortName = Object.fromEntries(
        db.prepare('SELECT id, name FROM cohorts').all().map((c) => [c.id, c.name])
      );
      const passMark = Number(settings.get('pass_mark') ?? 60);
      const atRiskProgress = Number(settings.get('at_risk_progress') ?? 50);
      const perStudent = allStudents.map((s) => {
        const sLabs = allLabs.filter((l) => l.student_id === s.id);
        return {
          ...withStats(s, sLabs),
          cohort: cohortName[s.cohort_id] || '',
          attendance: attendance.summary(s.id),
        };
      });
      const totalLabs = allLabs.length;
      const completeLabs = allLabs.filter((l) => l.status === 'complete').length;
      const scored = allLabs.filter((l) => l.score !== null && l.score !== undefined);
      const avgScore = scored.length
        ? Math.round((scored.reduce((a, l) => a + l.score, 0) / scored.length) * 10) / 10
        : null;
      const attRows = db.prepare('SELECT status FROM attendance').all();
      const attPresent = attRows.filter((r) => r.status === 'present' || r.status === 'late').length;
      const atRisk = perStudent.filter(
        (s) =>
          s.progress.percent < atRiskProgress ||
          (s.avgScore !== null && s.avgScore < passMark)
      );
      const recent = db.prepare(
        `SELECT l.*, s.name AS student_name FROM labs l
         JOIN students s ON s.id = l.student_id
         ORDER BY l.updated_at DESC LIMIT 6`
      ).all();
      return {
        totals: {
          students: allStudents.length,
          labs: totalLabs,
          completeLabs,
          completionPercent: totalLabs === 0 ? 0 : Math.round((completeLabs / totalLabs) * 100),
          avgScore,
          attendanceRate: attRows.length === 0 ? null : Math.round((attPresent / attRows.length) * 100),
          atRiskCount: atRisk.length,
        },
        atRisk: atRisk.map((s) => ({
          id: s.id,
          name: s.name,
          cohort: s.cohort || '',
          progress: s.progress,
          avgScore: s.avgScore,
        })),
        recentActivity: recent,
        passMark,
        atRiskProgress,
      };
    },
    byStudent() {
      const allStudents = db.prepare('SELECT * FROM students').all();
      const allLabs = db.prepare('SELECT * FROM labs').all();
      const cohortName = Object.fromEntries(
        db.prepare('SELECT id, name FROM cohorts').all().map((c) => [c.id, c.name])
      );
      return allStudents
        .map((s) => {
          const sLabs = allLabs.filter((l) => l.student_id === s.id);
          return {
            ...withStats(s, sLabs),
            cohort: cohortName[s.cohort_id] || '',
            attendance: attendance.summary(s.id),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    byModule() {
      const mods = modules.list();
      return mods.map((m) => {
        const templateIds = new Set(m.templates.map((t) => t.id));
        const modLabs = db.prepare('SELECT * FROM labs').all().filter((l) => templateIds.has(l.template_id));
        const complete = modLabs.filter((l) => l.status === 'complete').length;
        return {
          id: m.id,
          name: m.name,
          total: modLabs.length,
          complete,
          percent: modLabs.length === 0 ? 0 : Math.round((complete / modLabs.length) * 100),
          avgScore: avgScoreForLabs(modLabs),
        };
      });
    },
  };

  const settings = {
    get(key) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? row.value : null;
    },
    all() {
      const rows = db.prepare('SELECT key, value FROM settings').all();
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    set(key, value) {
      db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run(key, String(value));
      return settings.get(key);
    },
  };

  const users = {
    getByUsername(username) {
      return db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null;
    },
    getById(id) {
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
    },
    updatePassword(id, hash, salt) {
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, id);
    },
  };

  const sessions = {
    create(userId) {
      const id = require('node:crypto').randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
      ).run(id, userId, expiresAt, nowIso());
      return { id, expiresAt };
    },
    get(id) {
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
      if (!row) return null;
      if (new Date(row.expires_at).getTime() < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
        return null;
      }
      return row;
    },
    delete(id) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    },
  };

  return { cohorts, students, modules, templates, labs, attendance, analytics, settings, users, sessions };
}

module.exports = {
  initDb,
  createStore,
  VALID_STATUSES,
  VALID_ATTENDANCE,
  MODULE_SEED,
};
