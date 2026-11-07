# LabTrack — Student Lab Progress Tracker

A full-stack teaching demo for a software development instructor: manage
students, assign labs from a diploma curriculum, grade their work, take
attendance, and see class analytics. Built as a portfolio piece for a
Software Development Instructor role — it is the kind of system students
would build (and then extend) across a full-stack diploma.

**Author:** Keita Linton — Microsoft Instructor at Career City College
(since June 2026), IT support background.

## What it does

- **Instructor login** — session-based auth; passwords hashed with scrypt.
  Every page and API route is protected except the login page.
- **Dashboard** — class totals, completion %, average score, attendance
  rate, at-risk students, completion by module, recent activity.
- **Students** — search, filter by cohort, sort by name / progress / score,
  paginated list; per-student detail with lab grading and attendance.
- **Labs & Curriculum** — lab templates organised by diploma module;
  assign a template to one student or a whole cohort (duplicates skipped);
  grade labs with a 0–100 score as well as a status.
- **Analytics** — per-student performance, grade distribution, completion
  by module.
- **Attendance** — mark present / absent / late / excused per session date;
  attendance rate per student and for the class.
- **Settings** — manage cohorts, set the pass mark and at-risk threshold,
  change the instructor password.
- **CSV export** — progress report and attendance report downloads.
- **Premium theme** — deep-navy gradient header, indigo accent, warm
  neutrals, soft shadows, tighter type hierarchy; a light/dark toggle in
  the header, persisted in localStorage, built purely on CSS variables.

## Stack

| Layer | Technology |
| --- | --- |
| Front-end | Plain HTML, CSS, JavaScript (no build step, no framework); five pages sharing one design system, light/dark theme via CSS variables |
| Back-end | Node.js + Express |
| Data | SQLite via Node's built-in `node:sqlite` — a real relational database, no server, no native modules |
| Auth | scrypt password hashing + random session tokens in the database, HttpOnly cookie |
| Tests | Node's built-in test runner (`node:test`), no extra dependencies |

## Run it

```bash
npm install
npm start
```

Open <http://localhost:3000>. You will be redirected to the login page.
Use `PORT=4000 npm start` to run on a different port.

Demo login (seeded on first run; change it in Settings):

- username: `instructor`
- password: `instructor123`

Set `LABTRACK_PASSWORD` before the first run to seed a different
password. The database file is `labtrack.db` in the project root — delete
it to reset to the seed data (5 fictional students, 17 labs, 3 past
attendance sessions, 8 diploma modules with 18 lab templates).

## Test it

```bash
npm test
```

Tests start the real server on a random port against a throwaway SQLite
file, log in as the demo instructor, and cover auth (401s, login, password
change), students (CRUD, search, sort, pagination), labs and grading,
template assignment, attendance, analytics, CSV export and settings.

## API

Base URL: `http://localhost:3000/api`. Every route except
`POST /api/auth/login` requires the session cookie; without it the API
replies `401 {"error": "Authentication required. Please log in."}`.

### Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/auth/login` | Log in — `{ username, password }`, sets the session cookie |
| POST | `/auth/logout` | Log out — deletes the session, clears the cookie |
| GET | `/auth/me` | The logged-in instructor |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` (min 8 chars) |

### Students

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/students?search=&cohort=&sort=name\|progress\|score&order=asc\|desc&page=&pageSize=` | Paginated list, each with `progress` and `avgScore` |
| POST | `/students` | Create — `{ name, email?, cohortId? }` |
| GET | `/students/:id` | One student with progress, average score and attendance |
| PATCH | `/students/:id` | Update name / email / cohortId |
| DELETE | `/students/:id` | Delete a student and all their labs and attendance |
| GET | `/students/:id/progress` | `{ studentId, total, complete, percent }` |

### Labs, templates & modules

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/labs?studentId=&status=&moduleId=&search=` | Lab instances, with `module_name` |
| POST | `/labs` | Create — `{ studentId, templateId? \| title, status?, score? }` |
| POST | `/labs/assign` | Assign a template — `{ templateId, studentId? \| cohortId? }`; returns `{ created, skipped, total }` |
| GET | `/labs/:id` | One lab |
| PATCH | `/labs/:id` | Update title / status / score (`null` clears the score) |
| DELETE | `/labs/:id` | Delete a lab |
| GET | `/labs/modules` | Modules with their templates nested |
| POST | `/labs/modules` | Create a module — `{ name, description? }` |
| DELETE | `/labs/modules/:id` | Delete a module and its templates |
| GET | `/labs/templates?moduleId=` | Lab templates |
| POST | `/labs/templates` | Create — `{ moduleId, title, description? }` |
| DELETE | `/labs/templates/:id` | Delete a template |

Lab `status` is `not-started`, `in-progress` or `complete`. `score` is a
whole number 0–100, or `null` for ungraded.

### Attendance

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/attendance?studentId=&date=&from=&to=` | Attendance records |
| GET | `/attendance/dates` | Session dates on record, newest first |
| GET | `/attendance/summary?studentId=` | Totals and attendance rate for one student |
| POST | `/attendance` | Mark — `{ studentId, date, status, note? }`; re-marking the same date updates it |

Attendance `status` is `present`, `absent`, `late` or `excused`.

### Analytics

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/analytics/overview` | Totals, at-risk students, recent activity |
| GET | `/analytics/students` | Per-student progress, average score, attendance |
| GET | `/analytics/modules` | Completion and average score per module |

### Settings & cohorts

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/settings` | `{ pass_mark, at_risk_progress }` |
| PATCH | `/settings` | Update either threshold (0–100) |
| GET | `/settings/cohorts` | List cohorts |
| POST | `/settings/cohorts` | Create — `{ name }` |
| DELETE | `/settings/cohorts/:id` | Delete a cohort (students keep their records) |

### Export

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/export/progress.csv` | Per-student progress report (CSV download) |
| GET | `/export/attendance.csv` | Attendance report (CSV download) |

Errors are always JSON: `{ "error": "message" }` — `400` for bad input,
`401` without a session, `404` for a missing record, `500` for anything
unexpected. Unknown pages serve a 404 page.

### Example

```bash
# Log in and save the session cookie
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "instructor", "password": "instructor123"}'

# Add a student
curl -b cookies.txt -X POST http://localhost:3000/api/students \
  -H 'Content-Type: application/json' \
  -d '{"name": "Jordan Lee", "email": "jordan.lee@example.com"}'

# Assign a template to that student (use the id from the response above)
curl -b cookies.txt -X POST http://localhost:3000/api/labs/assign \
  -H 'Content-Type: application/json' \
  -d '{"templateId": "tpl-react-components", "studentId": "<id>"}'

# Grade the lab (list labs to find its id first)
curl -b cookies.txt -X PATCH http://localhost:3000/api/labs/<lab-id> \
  -H 'Content-Type: application/json' \
  -d '{"status": "complete", "score": 88}'

# Mark attendance
curl -b cookies.txt -X POST http://localhost:3000/api/attendance \
  -H 'Content-Type: application/json' \
  -d '{"studentId": "<id>", "date": "2026-11-07", "status": "present"}'

# Download the progress report
curl -b cookies.txt -O http://localhost:3000/api/export/progress.csv
```

## Project structure

```
labtrack/
├── server.js             # Entry point: builds the app, starts listening
├── src/
│   ├── app.js            # App factory: middleware, auth guards, route mounting
│   ├── db.js             # SQLite schema, seeding, all data access
│   ├── auth.js           # scrypt hashing, session tokens, auth middleware
│   ├── validate.js       # Input validation for every write endpoint
│   └── routes/
│       ├── auth.js       # Login, logout, who-am-I, change password
│       ├── students.js   # Student CRUD + search/filter/sort/pagination
│       ├── labs.js       # Labs, templates, modules, assignment
│       ├── attendance.js # Attendance register
│       ├── analytics.js  # Overview / per-student / per-module
│       ├── settings.js   # Cohorts and grading thresholds
│       └── export.js     # CSV downloads
├── public/
│   ├── app.js            # Shared helpers: API wrapper, nav, toasts
│   ├── styles.css        # One design system for all pages
│   ├── login.html/js     # Instructor login
│   ├── index.html        # Dashboard (+ dashboard.js)
│   ├── students.html/js  # Class list + student detail
│   ├── labs.html/js      # Curriculum templates + assigned labs
│   ├── analytics.html/js # Class analytics
│   ├── settings.html/js  # Cohorts, grading, password, exports
│   └── 404.html          # Not-found page
├── tests/
│   └── api.test.js       # API tests (node:test + global fetch)
├── data.json             # v1 seed source: 5 fictional students, 17 labs
├── labtrack.db           # SQLite database (created on first run, git-ignored)
├── package.json
└── .gitignore
```

## How this maps to the diploma curriculum

| Diploma topic | Where it shows up in LabTrack v2 |
| --- | --- |
| HTML / CSS / JavaScript | `public/` — five pages sharing one design system and one helper module; every line readable, no framework |
| React / TypeScript | The front-end follows the same ideas React teaches: each page renders from state fetched from the API, and every change re-fetches and re-renders. A natural next step is rebuilding a page as React components |
| Node.js / Express | `src/app.js` + `src/routes/` — routing, middleware, static serving, JSON APIs |
| SQL | `src/db.js` — real relational schema (tables, foreign keys, joins, aggregates), `node:sqlite` |
| Git / GitHub | The project is structured to be committed as-is: `.gitignore` for `node_modules` and the database, no secrets, small focused files |
| REST APIs | The full `/api` surface — resource routes, query-string filtering/sorting/pagination, status codes (200/201/204/400/401/404), JSON error bodies |
| Testing | `tests/api.test.js` — auth flows, happy paths, validation failures, 404s, CSV content, run with `npm test` |
| Deployment | One `npm start` command, `PORT` env var, no build step — deployable as-is to any Node host (Render, Railway, a VPS); the database is a single file |

## What changed from v1

- **Data:** JSON file replaced by SQLite (`node:sqlite`, built into Node 22+). Students now belong to cohort rows, labs link to curriculum templates, and the same 5 fictional students / 17 labs were migrated in.
- **Auth:** new — instructor login page, scrypt-hashed passwords, session tokens in the database, HttpOnly cookie; every page and API route is protected.
- **Pages:** one page became five (Dashboard, Students, Labs & Curriculum, Analytics, Settings) plus login and a 404 page, sharing one design system.
- **Features:** grading (0–100 per lab), attendance per session, template assignment to a student or a whole cohort, search/filter/sort/pagination, CSV exports, configurable pass mark and at-risk threshold.
- **Code:** routes split out of one big `server.js` into `src/routes/` per resource, with the data layer (`src/db.js`), auth (`src/auth.js`) and validation (`src/validate.js`) kept separate.

## How I would teach with it

I would open the first week with this app running and ask students to break
it: add a student with no name, a lab for a student who does not exist, a
score of 150, a request with no login cookie. Each failure is a real HTTP
status code they can see in the browser's Network tab — validation stops
being abstract once they watch a `400` or a `401` come back with a message
they wrote.

From there, each diploma module extends the same codebase instead of
starting a new toy project: the front-end module rebuilds a page in React,
the database module adds a new table and a JOIN, the testing module adds
front-end tests, the auth module adds roles, and the deployment module
ships it. Students leave with one system they understand end to end, not
five disconnected exercises.
