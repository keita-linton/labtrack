// public/app.js — shared front-end helpers for every LabTrack v2 page.
//
//   api(path, options)  fetch wrapper: JSON in/out, 401 -> back to /login
//   esc(text)           HTML-escape user content before inserting it
//   toast(msg, kind)    small bottom-right notification
//   initNav()           highlights the current page, wires logout, shows
//                       the logged-in instructor's name
//
// Every page loads this file first, then its own page script.

const STATUS_LABELS = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'complete': 'Complete',
};

const ATTENDANCE_LABELS = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Session expired. Please log in again.');
  }
  if (res.status === 204) return null;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((body && body.error) || `Request failed (${res.status})`);
  }
  return body;
}

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}

function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function clearError(el) {
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

function progressBar(percent) {
  const cls = percent < 50 ? 'low' : percent < 80 ? 'mid' : '';
  return `<div class="progress-bar"><div class="progress-fill ${cls}" style="width:${percent}%"></div></div>`;
}

function statusBadge(status) {
  return `<span class="badge ${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span>`;
}

function attendanceBadge(status) {
  return `<span class="badge ${esc(status)}">${esc(ATTENDANCE_LABELS[status] || status)}</span>`;
}

async function initNav() {
  // Highlight the nav link for this page.
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) a.classList.add('active');
  });

  // Show who is logged in; wire the logout button.
  try {
    const { user } = await api('/api/auth/me');
    const nameEl = document.getElementById('nav-username');
    if (nameEl) nameEl.textContent = user.username;
  } catch (err) {
    // api() already redirected on 401; anything else is not fatal here.
  }
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch (err) {
        // Even if logout fails server-side, leave the page.
      }
      window.location.href = '/login.html';
    });
  }
}

// --- Light / dark theme -----------------------------------------------------
// The choice lives in localStorage ('labtrack-theme'). A one-line script in
// each page's <head> applies the stored theme before the CSS loads, so the
// page never flashes the wrong theme; this only wires the toggle button.
// The theme itself is pure CSS variables: [data-theme="dark"] in styles.css
// overrides the :root palette, no selector is rewritten for dark mode.

const THEME_KEY = 'labtrack-theme';

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function syncThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const dark = currentTheme() === 'dark';
  btn.textContent = dark ? '☀' : '☾';
  btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  btn.title = btn.getAttribute('aria-label');
}

function initTheme() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  syncThemeToggle();
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (err) {
      // Private mode etc. — the toggle still works for this page load.
    }
    syncThemeToggle();
  });
}

// app.js loads at the end of <body> on every page, so the button (if the
// page has one) is already in the DOM when this runs.
initTheme();
