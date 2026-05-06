/* ================================================
   auth.js — Login / logout logic
   Media Operations Portal
   ================================================ */

let currentUser = null;

function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;

  const user = USERS.find(u => u.username === username && u.password === password);

  if (user) {
    currentUser = user;
    document.getElementById('current-user-display').textContent = user.name;

    // Hide login, show app
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    // Initialise modules
    renderCalendar();
    renderAllBookings();
  } else {
    const err = document.getElementById('login-error');
    err.style.display = 'block';
    // Re-trigger animation on repeated wrong attempts
    err.style.animation = 'none';
    requestAnimationFrame(() => { err.style.animation = ''; });
  }
}

function logout() {
  currentUser = null;

  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app').style.display = 'none';

  // Clear fields
  document.getElementById('login-user').value  = '';
  document.getElementById('login-pass').value  = '';
  document.getElementById('login-error').style.display = 'none';

  // Reset tabs back to Lyrics
  switchTab('lyrics', document.querySelector('.nav-tab'));
}

/* ---- Keyboard shortcuts ---- */
document.addEventListener('DOMContentLoaded', () => {
  ['login-user', 'login-pass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
});
