// js/auth.js

// 1. Set your Admin Passcode credentials
const ADMIN_CREDENTIALS = {
    username: "admin",
    password: "password123" 
};

// 2. Check if Admin is currently logged in
function isAdminLoggedIn() {
    return localStorage.getItem('isAdminLoggedIn') === 'true';
}

// 3. Admin login action
function loginAdmin(username, password) {
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        localStorage.setItem('isAdminLoggedIn', 'true');
        return true;
    }
    return false;
}

// 4. Admin logout action
function logoutAdmin() {
    localStorage.removeItem('isAdminLoggedIn');
    window.location.reload();
}

// NO AUTOMATIC REDIRECTS HERE!
// Anyone can view the site by default.
