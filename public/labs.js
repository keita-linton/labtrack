// public/labs.js — curriculum templates grouped by module, assignment to
// a student or a whole cohort, and the assigned-lab table with grading.

let modules = [];
let students = [];

function fillSelects() {
  const moduleOptions = modules.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  document.getElementById('template-module').innerHTML = moduleOptions;
  document.getElementById('lab-filter-module').innerHTML = `<option value="">All modules</option>${moduleOptions}`;
  const studentOptions = students.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  document.getElementById('lab-filter-student').innerHTML = `<option value="">All students</option>${studentOptions}`;
}

async function loadModules() {
  const errorEl = document.getElementById('page-error');
  try {
    clearError(errorEl);
    modules = await api('/api/labs/modules');
    const listEl = document.getElementById('modules-list');
    listEl.innerHTML = modules.map((m) => `
      <section style="margin-bottom:1rem">
        <h3>${esc(m.name)} <span class="muted">— ${esc(m.description)}</span></h3>
        ${m.templates.length === 0 ? '<p class="muted">No templates yet.</p>' : `
        <ul class="clean-list">
          ${m.templates.map((t) => `
            <li>
              <strong>${esc(t.title)}</strong>
              <span class="muted">${esc(t.description)}</span>
              <span style="margin-left:auto; display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap">
                <select data-assign-student="${esc(t.id)}" aria-label="Assign ${esc(t.title)} to a student">
                  <option value="">Assign to student…</option>
                  ${students.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}
                </select>
                <select data-assign-cohort="${esc(t.id)}" aria-label="Assign ${esc(t.title)} to a cohort">
                  <option value="">Assign to cohort…</option>
                  <option value="__all__">All students</option>
                </select>
                <button type="button" class="danger" data-template-delete="${esc(t.id)}">Remove</button>
              </span>
            </li>`).join('')}
        </ul>`}
      </section>`).join('');

    // Cohort options are filled once cohorts load (see init below).
    fillCohortAssignOptions();

    listEl.querySelectorAll('[data-assign-student]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        if (!sel.value) return;
        try {
          const result = await api('/api/labs/assign', {
            method: 'POST',
            body: JSON.stringify({ templateId: sel.dataset.assignStudent, studentId: sel.value }),
          });
          toast(result.created ? `Assigned to ${result.created} student.` : 'Already assigned — skipped.');
          await loadLabs();
        } catch (err) {
          toast(err.message, 'error');
        }
        sel.value = '';
      });
    });

    listEl.querySelectorAll('[data-assign-cohort]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        if (!sel.value) return;
        try {
          const body = { templateId: sel.dataset.assignCohort };
          if (sel.value === '__all__') {
            // Assign to every cohort one at a time.
            let created = 0;
            let skipped = 0;
            const cohorts = await api('/api/settings/cohorts');
            for (const c of cohorts) {
              const r = await api('/api/labs/assign', { method: 'POST', body: JSON.stringify({ ...body, cohortId: c.id }) });
              created += r.created;
              skipped += r.skipped;
            }
            toast(`Assigned: ${created} new, ${skipped} already assigned.`);
          } else {
            const result = await api('/api/labs/assign', {
              method: 'POST',
              body: JSON.stringify({ ...body, cohortId: sel.value }),
            });
            toast(`Assigned: ${result.created} new, ${result.skipped} already assigned.`);
          }
          await loadLabs();
        } catch (err) {
          toast(err.message, 'error');
        }
        sel.value = '';
      });
    });

    listEl.querySelectorAll('[data-template-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this template? Assigned labs keep their titles.')) return;
        try {
          await api(`/api/labs/templates/${encodeURIComponent(btn.dataset.templateDelete)}`, { method: 'DELETE' });
          toast('Template removed.');
          await loadModules();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    showError(errorEl, `Could not load the curriculum: ${err.message}`);
  }
}

let cohortOptionsHtml = '';
function fillCohortAssignOptions() {
  document.querySelectorAll('[data-assign-cohort]').forEach((sel) => {
    sel.innerHTML = `<option value="">Assign to cohort…</option><option value="__all__">All students</option>${cohortOptionsHtml}`;
  });
}

async function loadLabs() {
  const errorEl = document.getElementById('page-error');
  try {
    clearError(errorEl);
    const params = new URLSearchParams({
      studentId: document.getElementById('lab-filter-student').value,
      moduleId: document.getElementById('lab-filter-module').value,
      status: document.getElementById('lab-filter-status').value,
      search: document.getElementById('lab-filter-search').value.trim(),
    });
    const [labs, allStudents] = await Promise.all([
      api(`/api/labs?${params}`),
      api('/api/students?pageSize=100'),
    ]);
    const nameById = Object.fromEntries(allStudents.students.map((s) => [s.id, s.name]));
    const rows = document.getElementById('lab-rows');
    if (labs.length === 0) {
      rows.innerHTML = '<tr><td colspan="5" class="muted">No labs match these filters.</td></tr>';
    } else {
      rows.innerHTML = labs.map((lab) => `
        <tr>
          <td>${esc(lab.title)}${lab.module_name ? `<br><span class="muted">${esc(lab.module_name)}</span>` : ''}</td>
          <td>${esc(nameById[lab.student_id] || '—')}</td>
          <td>
            <select data-lab-status="${esc(lab.id)}" aria-label="Status for ${esc(lab.title)}">
              ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${v === lab.status ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </td>
          <td><input type="number" min="0" max="100" step="1" style="min-width:5rem" value="${lab.score === null ? '' : lab.score}" data-lab-score="${esc(lab.id)}" aria-label="Score for ${esc(lab.title)}" placeholder="—"></td>
          <td><button type="button" class="danger" data-lab-delete="${esc(lab.id)}">Remove</button></td>
        </tr>`).join('');
    }
    rows.querySelectorAll('[data-lab-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this lab?')) return;
        try {
          await api(`/api/labs/${encodeURIComponent(btn.dataset.labDelete)}`, { method: 'DELETE' });
          toast('Lab removed.');
          await loadLabs();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    showError(errorEl, `Could not load labs: ${err.message}`);
  }
}

document.getElementById('lab-filter-form').addEventListener('submit', (event) => {
  event.preventDefault();
  loadLabs();
});

document.getElementById('save-labs-btn').addEventListener('click', async () => {
  const rows = document.getElementById('lab-rows');
  try {
    const updates = [];
    rows.querySelectorAll('[data-lab-status]').forEach((sel) => {
      const scoreInput = rows.querySelector(`[data-lab-score="${sel.dataset.labStatus}"]`);
      const score = scoreInput.value === '' ? null : Number(scoreInput.value);
      updates.push(api(`/api/labs/${encodeURIComponent(sel.dataset.labStatus)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: sel.value, score }),
      }));
    });
    await Promise.all(updates);
    toast('Statuses and scores saved.');
    await loadLabs();
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('add-template-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/labs/templates', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: document.getElementById('template-module').value,
        title: document.getElementById('template-title').value.trim(),
        description: document.getElementById('template-description').value.trim(),
      }),
    });
    event.target.reset();
    toast('Template added.');
    await loadModules();
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('add-module-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/labs/modules', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('module-name').value.trim(),
        description: document.getElementById('module-description').value.trim(),
      }),
    });
    event.target.reset();
    toast('Module added.');
    await loadModules();
    fillSelects();
  } catch (err) {
    toast(err.message, 'error');
  }
});

(async () => {
  await initNav();
  try {
    const [allStudents, cohorts] = await Promise.all([
      api('/api/students?pageSize=100'),
      api('/api/settings/cohorts'),
    ]);
    students = allStudents.students;
    cohortOptionsHtml = cohorts.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  } catch (err) {
    showError(document.getElementById('page-error'), `Could not load students: ${err.message}`);
  }
  fillSelects();
  await loadModules();
  await loadLabs();
})();
