// js/calendar.js

const ROLE_CONFIG = {
    photography: { name: "Photography", type: "split" },
    cam1:        { name: "Videography - Camera 1", type: "split" },
    cam2:        { name: "Videography - Camera 2", type: "both" },
    director:    { name: "Director", type: "both" },
    livestream:  { name: "Livestream", type: "both" },
    projection:  { name: "Projection", type: "split" },
    stage:       { name: "Stage Management", type: "both", max: 1 },
    sound:       { name: "Sound", type: "both", max: 1},
    social:      { name: "Social Media", type: "both_multiple", max: 2 }
};

let events = JSON.parse(localStorage.getItem('worshipEvents')) || [];
let selectedEventId = null;

// DOM Elements
const adminControls = document.getElementById('admin-controls');
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const calendarGrid = document.getElementById('calendar-grid');
const urgentBanner = document.getElementById('urgent-banner');

const bookingModal = document.getElementById('booking-modal');
const bookingForm = document.getElementById('booking-form');
const roleSelect = document.getElementById('role-select');
const serviceSelect = document.getElementById('service-select');

const adminModal = document.getElementById('admin-modal');
const adminLoginForm = document.getElementById('admin-login-form');

document.addEventListener('DOMContentLoaded', () => {
    updateAdminUI();
    renderCalendar();
    checkThursdayDeadline();
    setupEventListeners();
});

function setupEventListeners() {
    // Admin Modal toggle
    adminLoginBtn.addEventListener('click', () => adminModal.classList.remove('hidden'));
    document.getElementById('close-admin-modal').addEventListener('click', () => adminModal.classList.add('hidden'));
    document.getElementById('close-booking-modal').addEventListener('click', () => bookingModal.classList.add('hidden'));

    // Admin Auth Form
    adminLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const u = document.getElementById('admin-username').value;
        const p = document.getElementById('admin-password').value;
        if (loginAdmin(u, p)) {
            adminModal.classList.add('hidden');
            updateAdminUI();
        } else {
            document.getElementById('login-error').classList.remove('hidden');
        }
    });

    adminLogoutBtn.addEventListener('click', () => {
        logoutAdmin();
        updateAdminUI();
    });

    document.getElementById('add-event-btn').addEventListener('click', handleAddEvent);
    document.getElementById('finalize-roster-btn').addEventListener('click', handleFinalizeAndEmail);
}

function updateAdminUI() {
    if (isAdminLoggedIn()) {
        adminControls.classList.remove('hidden');
        adminLoginBtn.classList.add('hidden');
    } else {
        adminControls.classList.add('hidden');
        adminLoginBtn.classList.remove('hidden');
    }
}

function handleAddEvent() {
    const dateStr = prompt("Enter Service Date (YYYY-MM-DD):");
    if (!dateStr) return;

    const newEvent = { id: "evt_" + Date.now(), date: dateStr, roster: {} };

    Object.keys(ROLE_CONFIG).forEach(key => {
        const type = ROLE_CONFIG[key].type;
        if (type === 'split') newEvent.roster[key] = { service1: null, service2: null };
        else if (type === 'both') newEvent.roster[key] = { both: null };
        else if (type === 'both_multiple') newEvent.roster[key] = { both: [] };
    });

    events.push(newEvent);
    saveEvents();
    renderCalendar();
}

function renderCalendar() {
    calendarGrid.innerHTML = '';
    if (events.length === 0) {
        calendarGrid.innerHTML = '<p>No service events scheduled yet.</p>';
        return;
    }

    events.forEach(ev => {
        const full = isRosterFull(ev);
        const card = document.createElement('div');
        card.className = 'event-card';
        card.innerHTML = `
            <h3>${ev.date}</h3>
            <p><strong>Status:</strong> ${full ? 'Roster Complete' : 'Open Slots Available'}</p>
        `;
        card.addEventListener('click', () => openBookingModal(ev));
        calendarGrid.appendChild(card);
    });
}

function openBookingModal(ev) {
    selectedEventId = ev.id;
    populateRoleOptions(ev);
    bookingModal.classList.remove('hidden');
}

function populateRoleOptions(ev) {
    roleSelect.innerHTML = '<option value="">-- Select a Role --</option>';
    serviceSelect.innerHTML = '<option value="">-- Select Service --</option>';
    serviceSelect.disabled = true;

    Object.entries(ROLE_CONFIG).forEach(([key, config]) => {
        const slot = ev.roster[key];
        let hasSpace = false;

        if (config.type === 'split') {
            if (!slot.service1 || !slot.service2) hasSpace = true;
        } else if (config.type === 'both') {
            if (!slot.both) hasSpace = true;
        } else if (config.type === 'both_multiple') {
            if (slot.both.length < config.max) hasSpace = true;
        }

        if (hasSpace) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = config.name;
            roleSelect.appendChild(opt);
        }
    });
}

roleSelect.addEventListener('change', (e) => {
    const roleKey = e.target.value;
    const ev = events.find(item => item.id === selectedEventId);
    serviceSelect.innerHTML = '<option value="">-- Select Service --</option>';

    if (!roleKey) {
        serviceSelect.disabled = true;
        return;
    }

    serviceSelect.disabled = false;
    const config = ROLE_CONFIG[roleKey];
    const slot = ev.roster[roleKey];

    if (config.type === 'split') {
        if (!slot.service1) serviceSelect.insertAdjacentHTML('beforeend', '<option value="service1">1st Service</option>');
        if (!slot.service2) serviceSelect.insertAdjacentHTML('beforeend', '<option value="service2">2nd Service</option>');
    } else {
        serviceSelect.insertAdjacentHTML('beforeend', '<option value="both">Both Services</option>');
    }
});

// Submit Availability
bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const nameValue = document.getElementById('user-name').value.trim();
    const phoneValue = document.getElementById('user-phone').value.trim();
    const phoneError = document.getElementById('phone-error');
    const kenyaPhoneRegex = /^(07|01)\d{8}$/;

    if (!kenyaPhoneRegex.test(phoneValue)) {
        phoneError.classList.remove('hidden');
        return;
    }
    phoneError.classList.add('hidden');

    const roleKey = roleSelect.value;
    const serviceKey = serviceSelect.value;
    const ev = events.find(item => item.id === selectedEventId);
    const config = ROLE_CONFIG[roleKey];
    const volunteer = { name: nameValue, phone: phoneValue };

    if (config.type === 'both_multiple') {
        ev.roster[roleKey].both.push(volunteer);
    } else {
        ev.roster[roleKey][serviceKey] = volunteer;
    }

    saveEvents();
    bookingModal.classList.add('hidden');
    bookingForm.reset();
    renderCalendar();
    alert('Thank you! Your availability has been registered.');
});

function isRosterFull(ev) {
    return Object.entries(ROLE_CONFIG).every(([key, config]) => {
        const slot = ev.roster[key];
        if (config.type === 'split') return slot.service1 && slot.service2;
        if (config.type === 'both') return slot.both;
        if (config.type === 'both_multiple') return slot.both && slot.both.length === config.max;
        return false;
    });
}

function checkThursdayDeadline() {
    const currentDay = new Date().getDay(); 
    if (currentDay >= 4 || currentDay === 0) {
        const hasOpenSlots = events.some(ev => !isRosterFull(ev));
        if (hasOpenSlots) urgentBanner.classList.remove('hidden');
    }
}

function saveEvents() {
    localStorage.setItem('worshipEvents', JSON.stringify(events));
}

function handleFinalizeAndEmail() {
    if (events.length === 0) return alert("No service events available.");
    
    const ev = events[0]; 
    let rosterText = `MASTER ROSTER FOR SERVICE: ${ev.date}\n====================================\n\n`;

    Object.entries(ROLE_CONFIG).forEach(([key, config]) => {
        rosterText += `[${config.name.toUpperCase()}]\n`;
        const slot = ev.roster[key];

        if (config.type === 'split') {
            rosterText += `  - 1st Service: ${slot.service1 ? slot.service1.name + ' (' + slot.service1.phone + ')' : 'VACANT'}\n`;
            rosterText += `  - 2nd Service: ${slot.service2 ? slot.service2.name + ' (' + slot.service2.phone + ')' : 'VACANT'}\n`;
        } else if (config.type === 'both') {
            rosterText += `  - Both Services: ${slot.both ? slot.both.name + ' (' + slot.both.phone + ')' : 'VACANT'}\n`;
        } else if (config.type === 'both_multiple') {
            const p1 = slot.both[0] ? `${slot.both[0].name} (${slot.both[0].phone})` : 'VACANT';
            const p2 = slot.both[1] ? `${slot.both[1].name} (${slot.both[1].phone})` : 'VACANT';
            rosterText += `  - Volunteer 1: ${p1}\n  - Volunteer 2: ${p2}\n`;
        }
        rosterText += '\n';
    });

    if (typeof emailjs !== 'undefined') {
        emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", {
            to_email: "emmanuellalampaaa@gmail.com",
            roster_date: ev.date,
            roster_details: rosterText
        }).then(() => {
            alert("Roster finalized and sent to emmanuellalampaaa@gmail.com!");
        }).catch(() => {
            openMailtoFallback(ev.date, rosterText);
        });
    } else {
        openMailtoFallback(ev.date, rosterText);
    }
}

function openMailtoFallback(dateStr, bodyText) {
    const mailtoUrl = `mailto:emmanuellalampaaa@gmail.com?subject=${encodeURIComponent("Finalized Worship Roster - " + dateStr)}&body=${encodeURIComponent(bodyText)}`;
    window.location.href = mailtoUrl;
}
