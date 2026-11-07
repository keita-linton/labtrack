// public/login.js — instructor login form. Posts to /api/auth/login;
// on success the server sets the session cookie and we go to the dashboard.

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById('login-error');
  clearError(errorEl);
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    window.location.href = '/index.html';
  } catch (err) {
    showError(errorEl, err.message);
  }
});
