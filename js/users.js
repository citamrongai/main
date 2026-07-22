// js/users.js

// Simple Admin credentials check
const ADMIN_CREDENTIALS = {
    username: "CITAM",
    password: "P@sscode13" // Replace with your preferred passcode
};

function isAdminLoggedIn() {
    return localStorage.getItem('isAdminLoggedIn') === 'true';
}

function loginAdmin(username, password) {
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        localStorage.setItem('isAdminLoggedIn', 'true');
        return true;
    }
    return false;
}

function logoutAdmin() {
    localStorage.setItem('isAdminLoggedIn', 'false');
}
