// public/analytics.js — class averages, grade distribution, completion
// by module and the per-student performance table.

function barRow(label, percent, valueText) {
  return `<div class="bar-row">
    <span class="bar-label">${esc(label)}</span>
    ${progressBar(percent)}
    <span class="bar-value">${esc(valueText)}</span>
  </div>`;
}

async function loadAnalytics() {
  const errorEl = document.getElementById('page-error');
  try {
    clearError(errorEl);
    const [overview, byStudent, byModule] = await Promise.all([
      api('/api/analytics/overview'),
      api('/api/analytics/students'),
      api('/api/analytics/modules'),
    ]);

    const scored = byStudent.filter((s) => s.avgScore !== null);
    const avgProgress = byStudent.length === 0
      ? 0
      : Math.round(byStudent.reduce((a, s) => a + s.progress.percent, 0) / byStudent.length);
    const avgScore = scored.length === 0
      ? null
      : Math.round((scored.reduce((a, s) => a + s.avgScore, 0) / scored.length) * 10) / 10;
    const top = [...byStudent].sort(
      (a, b) => (b.progress.percent + (b.avgScore || 0)) - (a.progress.percent + (a.avgScore || 0))
    )[0];

    document.getElementById('stat-avg-progress').textContent = `${avgProgress}%`;
    document.getElementById('stat-avg-score').textContent = avgScore === null ? '—' : avgScore;
    document.getElementById('stat-attendance').textContent =
      overview.totals.attendanceRate === null ? '—' : `${overview.totals.attendanceRate}%`;
    document.getElementById('stat-top').textContent = top ? top.name : '—';
    document.getElementById('stat-top-sub').textContent = top
      ? `${top.progress.percent}% complete · avg ${top.avgScore === null ? '—' : top.avgScore}`
      : '';

    document.getElementById('module-bars').innerHTML = byModule.map((m) => barRow(
      m.name, m.percent, `${m.complete}/${m.total} · ${m.percent}%`
    )).join('');

    const bands = [
      { label: '90–100', test: (s) => s >= 90 },
      { label: '80–89', test: (s) => s >= 80 && s < 90 },
      { label: '70–79', test: (s) => s >= 70 && s < 80 },
      { label: '60–69', test: (s) => s >= 60 && s < 70 },
      { label: 'Below 60', test: (s) => s < 60 },
    ];
    const total = Math.max(1, scored.length);
    document.getElementById('grade-bars').innerHTML = scored.length === 0
      ? '<p class="muted">No graded labs yet — scores appear once labs are graded.</p>'
      : bands.map((b) => {
        const count = scored.filter((s) => b.test(s.avgScore)).length;
        return barRow(b.label, Math.round((count / total) * 100), `${count} student${count === 1 ? '' : 's'}`);
      }).join('');

    const rows = document.getElementById('student-rows');
    rows.innerHTML = byStudent.map((s) => `
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${esc(s.cohort || '')}</td>
        <td>${s.progress.complete}/${s.progress.total}</td>
        <td>${progressBar(s.progress.percent)}<span class="muted">${s.progress.percent}%</span></td>
        <td>${s.avgScore === null ? '—' : s.avgScore}</td>
        <td>${s.attendance.rate === null ? '—' : `${s.attendance.rate}%`}</td>
      </tr>`).join('');
  } catch (err) {
    showError(errorEl, `Could not load analytics: ${err.message}`);
  }
}

initNav();
loadAnalytics();
