/* ================================================
   users.js — Simulated authentication & session
   Media Operations Portal
   ================================================
   Accounts are pre-populated. Admin accounts carry
   isAdmin: true, which unlocks roster management.
   Sessions live in localStorage so the app needs
   no backend.
   ================================================ */

const USERS = [
  { username: "admin", password: "P@sscode13", name: "Emmanuel L.",   isAdmin: true  },
  { username: "jane",  password: "crew123",    name: "Jane Doe",      isAdmin: false },
  { username: "david", password: "crew123",    name: "David Otieno",  isAdmin: false },
  { username: "faith", password: "crew123",    name: "Faith Wanjiku", isAdmin: false },
];

const SESSION_KEY = 'mopSession';

/* ---- Lookup helpers ---- */
function findUser(username) {
  return USERS.find(u => u.username.toLowerCase() === String(username).trim().toLowerCase());
}

/* ---- Login: returns the user object on success, null on failure ---- */
function loginUser(username, password) {
  const user = findUser(username);
  if (!user || user.password !== password) return null;

  const session = {
    username: user.username,
    name:     user.name,
    isAdmin:  user.isAdmin,
    loginAt:  Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

/* ---- Logout ---- */
function logoutUser() {
  localStorage.removeItem(SESSION_KEY);
}

/* ---- Current session ---- */
function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function isLoggedIn() {
  return !!getCurrentUser();
}

function isAdminLoggedIn() {
  const u = getCurrentUser();
  return !!(u && u.isAdmin);
}
