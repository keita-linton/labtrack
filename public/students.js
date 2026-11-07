// public/students.js — class list (search / filter / sort / paginate) and
// the student detail view: grade labs, change lab status, take attendance.

const state = { page: 1, pageSize: 10, totalPages: 1, cohorts: [] };
let detailStudentId = null;

function fillCohortSelects() {
  const options = state.cohorts.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  document.getElementById('filter-cohort').innerHTML = `<option value="">All cohorts</option>${options}`;
  document.getElementById('student-cohort').innerHTML = `<option value="">No cohort</option>${options}`;
}

async function loadStudents() {
  const errorEl = document.getElementById('page-error');
  try {
    clearError(errorEl);
    const params = new URLSearchParams({
      search: document.getElementById('filter-search').value.trim(),
      cohort: document.getElementById('filter-cohort').value,
      sort: document.getElementById('filter-sort').value,
      order: document.getElementById('filter-order').value,
      page: String(state.page),
      pageSize: String(state.pageSize),
    });
    const data = await api(`/api/students?${params}`);
    state.totalPages = data.totalPages;
    state.page = data.page;
    const rows = document.getElementById('student-rows');
    if (data.students.length === 0) {
      rows.innerHTML = '<tr><td colspan="6" class="muted">No students match these filters.</td></tr>';
    } else {
      rows.innerHTML = data.students.map((s) => `
        <tr>
          <td><strong>${esc(s.name)}</strong><br><span class="muted">${esc(s.email)}</span></td>
          <td>${esc(s.cohort)}</td>
          <td>${progressBar(s.progress.percent)}<span class="muted">${s.progress.complete}/${s.progress.total} — ${s.progress.percent}%</span></td>
          <td>${s.avgScore === null ? '—' : s.avgScore}</td>
          <td>${s.attendance.rate === null ? '—' : `${s.attendance.rate}%`}</td>
          <td><button type="button" class="secondary small" data-view="${esc(s.id)}">View</button></td>
        </tr>`).join('');
    }
    document.getElementById('pagination-info').textContent =
      `Page ${data.page} of ${data.totalPages} — ${data.total} student${data.total === 1 ? '' : 's'}`;
    document.getElementById('prev-page').disabled = data.page <= 1;
    document.getElementById('next-page').disabled = data.page >= data.totalPages;
    rows.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.dataset.view));
    });
  } catch (err) {
    showError(errorEl, `Could not load students: ${err.message}`);
  }
}

async function openDetail(studentId) {
  detailStudentId = studentId;
  const card = document.getElementById('detail-card');
  const body = document.getElementById('detail-body');
  card.hidden = false;
  body.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const [student, labs, attendance] = await Promise.all([
      api(`/api/students/${encodeURIComponent(studentId)}`),
      api(`/api/labs?studentId=${encodeURIComponent(studentId)}`),
      api(`/api/attendance?studentId=${encodeURIComponent(studentId)}`),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    body.innerHTML = `
      <h3>${esc(student.name)}</h3>
      <p class="muted">${esc(student.email)} · ${esc(student.cohort || 'No cohort')} · ${student.progress.complete}/${student.progress.total} labs complete (${student.progress.percent}%) · Avg score: ${student.avgScore === null ? '—' : student.avgScore} · Attendance: ${student.attendance.rate === null ? '—' : student.attendance.rate + '%'}</p>

      <h3>Labs &amp; grades</h3>
      ${labs.length === 0 ? '<p class="muted">No labs assigned yet — assign some from the Labs &amp; Curriculum page.</p>' : `
      <div class="table-wrap"><table>
        <thead><tr><th>Lab</th><th>Status</th><th>Score / 100</th><th></th></tr></thead>
        <tbody>
          ${labs.map((lab) => `
            <tr>
              <td>${esc(lab.title)}${lab.module_name ? `<br><span class="muted">${esc(lab.module_name)}</span>` : ''}</td>
              <td>
                <select data-lab-status="${esc(lab.id)}" aria-label="Status for ${esc(lab.title)}">
                  ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${v === lab.status ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
              </td>
              <td><input type="number" min="0" max="100" step="1" style="min-width:5rem" value="${lab.score === null ? '' : lab.score}" data-lab-score="${esc(lab.id)}" aria-label="Score for ${esc(lab.title)}" placeholder="—"></td>
              <td><button type="button" class="danger" data-lab-delete="${esc(lab.id)}">Remove</button></td>
            </tr>`).join('')}
        </tbody>
      </table></div>
      <p><button type="button" class="small" id="save-grades-btn">Save grades &amp; statuses</button></p>`}

      <h3>Attendance</h3>
      <form class="form-row" id="attendance-form">
        <label>
          Session date
          <input type="date" id="attendance-date" value="${today}" required>
        </label>
        <label>
          Status
          <select id="attendance-status">
            ${Object.entries(ATTENDANCE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </label>
        <button type="submit">Mark attendance</button>
      </form>
      ${attendance.length === 0 ? '<p class="muted">No attendance recorded yet.</p>' : `
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Status</th><th>Note</th></tr></thead>
        <tbody>
          ${attendance.map((a) => `<tr><td>${esc(a.session_date)}</td><td>${attendanceBadge(a.status)}</td><td>${esc(a.note)}</td></tr>`).join('')}
        </tbody>
      </table></div>`}

      <p style="margin-top:1rem"><button type="button" class="danger" id="delete-student-btn">Remove student</button></p>`;

    body.querySelectorAll('[data-lab-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this lab?')) return;
        try {
          await api(`/api/labs/${encodeURIComponent(btn.dataset.labDelete)}`, { method: 'DELETE' });
          toast('Lab removed.');
          await openDetail(studentId);
          await loadStudents();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    const saveBtn = document.getElementById('save-grades-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          const updates = [];
          body.querySelectorAll('[data-lab-status]').forEach((sel) => {
            const scoreInput = body.querySelector(`[data-lab-score="${sel.dataset.labStatus}"]`);
            const score = scoreInput.value === '' ? null : Number(scoreInput.value);
            updates.push(api(`/api/labs/${encodeURIComponent(sel.dataset.labStatus)}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: sel.value, score }),
            }));
          });
          await Promise.all(updates);
          toast('Grades and statuses saved.');
          await openDetail(studentId);
          await loadStudents();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

    document.getElementById('attendance-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api('/api/attendance', {
          method: 'POST',
          body: JSON.stringify({
            studentId,
            date: document.getElementById('attendance-date').value,
            status: document.getElementById('attendance-status').value,
          }),
        });
        toast('Attendance recorded.');
        await openDetail(studentId);
        await loadStudents();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('delete-student-btn').addEventListener('click', async () => {
      if (!confirm(`Remove ${student.name} and all of their labs and attendance?`)) return;
      try {
        await api(`/api/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
        document.getElementById('detail-card').hidden = true;
        detailStudentId = null;
        toast('Student removed.');
        await loadStudents();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } catch (err) {
    body.innerHTML = `<p class="error">Could not load this student: ${esc(err.message)}</p>`;
  }
}

document.getElementById('filter-form').addEventListener('submit', (event) => {
  event.preventDefault();
  state.page = 1;
  loadStudents();
});

document.getElementById('prev-page').addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    loadStudents();
  }
});

document.getElementById('next-page').addEventListener('click', () => {
  if (state.page < state.totalPages) {
    state.page += 1;
    loadStudents();
  }
});

document.getElementById('add-student-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById('form-error');
  try {
    clearError(errorEl);
    await api('/api/students', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('student-name').value.trim(),
        email: document.getElementById('student-email').value.trim(),
        cohortId: document.getElementById('student-cohort').value || null,
      }),
    });
    event.target.reset();
    toast('Student added.');
    state.page = 1;
    await loadStudents();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

(async () => {
  await initNav();
  try {
    state.cohorts = await api('/api/settings/cohorts');
  } catch (err) {
    showError(document.getElementById('page-error'), `Could not load cohorts: ${err.message}`);
  }
  fillCohortSelects();
  await loadStudents();
  // Deep link from the Dashboard's at-risk table: ?student=<id>
  const linked = new URLSearchParams(window.location.search).get('student');
  if (linked) openDetail(linked);
})();
