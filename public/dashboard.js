// public/dashboard.js — class overview: totals, at-risk students,
// completion by module, recent lab activity.

async function loadDashboard() {
  const errorEl = document.getElementById('page-error');
  try {
    clearError(errorEl);
    const [overview, modules] = await Promise.all([
      api('/api/analytics/overview'),
      api('/api/analytics/modules'),
    ]);

    const t = overview.totals;
    document.getElementById('stat-students').textContent = t.students;
    document.getElementById('stat-labs').textContent = t.labs;
    document.getElementById('stat-labs-sub').textContent = `${t.completeLabs} complete`;
    document.getElementById('stat-completion').textContent = `${t.completionPercent}%`;
    document.getElementById('stat-score').textContent = t.avgScore === null ? '—' : t.avgScore;
    document.getElementById('stat-score-sub').textContent = `Pass mark: ${overview.passMark}`;
    document.getElementById('stat-attendance').textContent = t.attendanceRate === null ? '—' : `${t.attendanceRate}%`;
    document.getElementById('stat-atrisk').textContent = t.atRiskCount;
    document.getElementById('stat-atrisk-sub').textContent =
      `Progress under ${overview.atRiskProgress}% or score under ${overview.passMark}`;

    const atRiskEl = document.getElementById('atrisk-list');
    if (overview.atRisk.length === 0) {
      atRiskEl.innerHTML = '<p class="muted">No students at risk right now.</p>';
    } else {
      atRiskEl.innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Student</th><th>Progress</th><th>Avg score</th><th></th></tr></thead>
          <tbody>
            ${overview.atRisk.map((s) => `
              <tr>
                <td><strong>${esc(s.name)}</strong><br><span class="muted">${esc(s.cohort)}</span></td>
                <td>${progressBar(s.progress.percent)}<span class="muted">${s.progress.complete}/${s.progress.total} labs — ${s.progress.percent}%</span></td>
                <td>${s.avgScore === null ? '—' : s.avgScore}</td>
                <td><a class="btn secondary small" href="students.html?student=${encodeURIComponent(s.id)}">View</a></td>
              </tr>`).join('')}
          </tbody>
        </table></div>`;
    }

    const barsEl = document.getElementById('module-bars');
    barsEl.innerHTML = modules.map((m) => `
      <div class="bar-row">
        <span class="bar-label">${esc(m.name)}</span>
        ${progressBar(m.percent)}
        <span class="bar-value">${m.complete}/${m.total} · ${m.percent}%</span>
      </div>`).join('');

    const activityEl = document.getElementById('activity-list');
    if (overview.recentActivity.length === 0) {
      activityEl.innerHTML = '<li class="muted">No lab activity yet.</li>';
    } else {
      activityEl.innerHTML = overview.recentActivity.map((l) => `
        <li>
          <strong>${esc(l.student_name)}</strong> — ${esc(l.title)}
          ${statusBadge(l.status)}
          <span class="muted">${new Date(l.updated_at).toLocaleString()}</span>
        </li>`).join('');
    }
  } catch (err) {
    showError(errorEl, `Could not load the dashboard: ${err.message}`);
  }
}

initNav();
loadDashboard();
