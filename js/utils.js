/* ================================================
   utils.js — Shared utilities
   Media Operations Portal
   ================================================ */

/* ---- Toast notification ---- */
function showToast(message) {
  // Remove any existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className   = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Auto-remove after animation completes (~2.6 s)
  setTimeout(() => toast.remove(), 2600);
}

/* ---- Tab switching ---- */
function switchTab(tabId, clickedBtn) {
  // Hide all tab panels
  document.querySelectorAll('.tab-content').forEach(panel => {
    panel.classList.remove('active');
  });

  // Deactivate all nav buttons
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected panel and mark button active
  const panel = document.getElementById('tab-' + tabId);
  if (panel) panel.classList.add('active');
  if (clickedBtn) clickedBtn.classList.add('active');
}
