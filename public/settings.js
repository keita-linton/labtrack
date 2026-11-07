// public/settings.js — cohorts, grading thresholds and password change.

function flashSuccess(message) {
  const el = document.getElementById('page-success');
  el.textContent = message;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

async function loadCohorts() {
  const errorEl = document.getElementById('page-error');
  try {
    clearError(errorEl);
    const cohorts = await api('/api/settings/cohorts');
    const listEl = document.getElementById('cohort-list');
    listEl.innerHTML = cohorts.length === 0
      ? '<li class="muted">No cohorts yet.</li>'
      : cohorts.map((c) => `
        <li>
          <strong>${esc(c.name)}</strong>
          <button type="button" class="danger" style="margin-left:auto" data-cohort-delete="${esc(c.id)}">Remove</button>
        </li>`).join('');
    listEl.querySelectorAll('[data-cohort-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this cohort? Students in it keep their records, with no cohort assigned.')) return;
        try {
          await api(`/api/settings/cohorts/${encodeURIComponent(btn.dataset.cohortDelete)}`, { method: 'DELETE' });
          toast('Cohort removed.');
          await loadCohorts();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    showError(errorEl, `Could not load cohorts: ${err.message}`);
  }
}

async function loadGrading() {
  const settings = await api('/api/settings');
  document.getElementById('pass-mark').value = settings.pass_mark;
  document.getElementById('at-risk-progress').value = settings.at_risk_progress;
}

document.getElementById('add-cohort-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/settings/cohorts', {
      method: 'POST',
      body: JSON.stringify({ name: document.getElementById('cohort-name').value.trim() }),
    });
    event.target.reset();
    flashSuccess('Cohort added.');
    await loadCohorts();
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('grading-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        pass_mark: Number(document.getElementById('pass-mark').value),
        at_risk_progress: Number(document.getElementById('at-risk-progress').value),
      }),
    });
    flashSuccess('Grading settings saved.');
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: document.getElementById('current-password').value,
        newPassword: document.getElementById('new-password').value,
      }),
    });
    event.target.reset();
    flashSuccess('Password changed.');
  } catch (err) {
    toast(err.message, 'error');
  }
});

(async () => {
  await initNav();
  await loadCohorts();
  await loadGrading();
})();
