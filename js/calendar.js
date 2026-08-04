/* ================================================
   calendar.js — Booking Calendar & Roster Engine
   Media Operations Portal
   ================================================
   - Interactive month calendar (admin creates events)
   - Volunteer booking with phone validation + slot limits
   - Roster progress + Wednesday finalization deadline
   - "Urgent Fill Needed" banner (Thu/Fri/Sat)
   - EmailJS dispatch + mailto: fallback
   All data persists to localStorage (key: worshipEvents).
   ================================================ */

/* ---------------- Email configuration ----------------
   To enable automated email dispatch:
   1. Create an EmailJS account and add a service + template.
   2. Replace the three YOUR_* placeholders below.
   3. Update the emailjs.init() key in index.html.
   4. Host The_Crew_Logo.jpeg at a public URL and set
      CREW_LOGO_URL below (a "TC" monogram is shown until then).
   5. In your EmailJS template, render the BRANDED HTML the app
      builds (black background + logo + message) by pasting this
      as the WHOLE template body:

        {{{roster_html}}}

      (triple braces = unescaped HTML; the app sends the complete
      branded design in the `roster_html` variable). The template
      must contain the variables: to_email, subject, roster_html.

   The roster finalize email and the 1-day-before reminders all
   share this one template. Until configured, the app falls back
   to a mailto: link that opens the admin's email client with a
   plain-text copy of the same message.
   ------------------------------------------------------ */
const ROSTER_EMAIL      = "emmanuellalampaaa@gmail.com";
const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";   // e.g. "AbCdEf123"
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";   // e.g. "service_abc123"
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID"; // e.g. "template_xyz789"

/* Brand logo used inside the HTML emails. Email clients cannot load
   local files, so host The_Crew_Logo.jpeg somewhere public (your
   church site, a CDN, or a raw GitHub link) and paste the https URL
   here. Until set, emails show a styled "TC" monogram instead. */
const CREW_LOGO_URL = "YOUR_LOGO_URL"; // e.g. "https://example.com/images/the-crew-logo.jpeg"

/* ---------------- Role & slot rules ----------------
   type: 'split'           → 1 person per service (1st & 2nd)
         'both'            → 1 person covering BOTH services
         'both_multiple'   → up to `max` people covering BOTH
   --------------------------------------------------- */
const ROLE_CONFIG = {
  photography: { name: "Photography",             type: 'split',         services: ['service1', 'service2'] },
  cam1:        { name: "Videography · Camera 1",  type: 'split',         services: ['service1', 'service2'] },
  cam2:        { name: "Videography · Camera 2",  type: 'both' },
  director:    { name: "Director",                type: 'both' },
  livestream:  { name: "Livestream",              type: 'both' },
  projection:  { name: "Projection",              type: 'split',         services: ['service1', 'service2'] },
  stage:       { name: "Stage Management",        type: 'both' },
  sound:       { name: "Sound",                   type: 'both' },
  social:      { name: "Social Media",            type: 'both_multiple', max: 2 },
};

const EVENTS_KEY = 'worshipEvents';
const PHONE_REGEX = /^(07|01)\d{8}$/;          // exactly 10 digits, starts 07 or 01
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // simple email format check
const REMINDER_DAYS_BEFORE = 1;                // reminder emails go out 1 day before the service

/* ---------------- State ---------------- */
let events = loadEvents();
let currentMonth = new Date(); // calendar view month
let selectedDate = null;       // YYYY-MM-DD
let editingEvent = null;       // event being edited (admin modal)

/* ---------------- DOM refs ---------------- */
const $ = id => document.getElementById(id);
const els = {
  calendarGrid:  $('calendar-grid'),
  monthLabel:    $('month-label'),
  urgentBanner:  $('urgent-banner'),
  urgentText:    $('urgent-text'),
  dateInfoBar:   $('date-info-bar'),
  rosterPanel:   $('roster-panel'),
  bookingPanel:  $('booking-panel'),
  emptyPanel:    $('empty-panel'),
  adminAddBtn:   $('admin-add-event-btn'),
  adminControls: $('admin-controls'),
  // modals
  userModal:     $('user-login-modal'),
  eventModal:    $('event-modal'),
  eventForm:     $('event-form'),
  bookingForm:   $('booking-form'),
  // login
  loginError:    $('login-error'),
  loginUser:     $('login-username'),
  loginPass:     $('login-password'),
  loginBtn:      $('login-btn'),
  logoutBtn:     $('logout-btn'),
  userBadge:     $('user-badge'),
};

/* =====================================================
   Persistence
   ===================================================== */
function loadEvents() {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY)) || []; }
  catch { return []; }
}
function saveEvents() {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

/* Seed a couple of upcoming weekend events so the app is
   demonstrable on first run (only when storage is empty). */
function seedSampleEvents() {
  if (localStorage.getItem(EVENTS_KEY) !== null) return;
  const today = new Date();
  const samples = [];
  for (let i = 0; i < 2; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + ((7 - today.getDay()) % 7) + 1 + i * 7); // this Sat, next Sat
    samples.push(createEvent(toDateStr(d)));
  }
  if (samples.length) { events = samples; saveEvents(); }
}

/* =====================================================
   Event model
   ===================================================== */
function createEvent(dateStr) {
  const roster = {};
  Object.keys(ROLE_CONFIG).forEach(key => {
    const cfg = ROLE_CONFIG[key];
    if (cfg.type === 'split')        roster[key] = { service1: null, service2: null };
    else if (cfg.type === 'both')    roster[key] = { both: null };
    else                             roster[key] = { both: [] };
  });
  return { id: 'evt_' + Date.now() + Math.random().toString(36).slice(2, 7), date: dateStr, roster, finalized: false, finalizedAt: null };
}

function getEventByDate(dateStr)  { return events.find(e => e.date === dateStr); }
function getEventById(id)         { return events.find(e => e.id === id); }
function isUpcoming(ev)           { return ev.date >= toDateStr(new Date()); }

/* =====================================================
   Slot logic
   ===================================================== */
function slotValue(event, roleKey, service) {
  const slot = event.roster[roleKey];
  if (ROLE_CONFIG[roleKey].type === 'split') return slot[service] || null;
  if (ROLE_CONFIG[roleKey].type === 'both')  return slot.both || null;
  return null;
}

function isSlotOpen(event, roleKey, service) {
  const cfg = ROLE_CONFIG[roleKey];
  if (cfg.type === 'split') return !event.roster[roleKey][service];
  if (cfg.type === 'both')  return !event.roster[roleKey].both;
  return event.roster[roleKey].both.length < cfg.max; // both_multiple
}

function openSlotCount(event, roleKey) {
  const cfg = ROLE_CONFIG[roleKey];
  if (cfg.type === 'split') {
    return cfg.services.filter(s => isSlotOpen(event, roleKey, s)).length;
  }
  if (cfg.type === 'both') return isSlotOpen(event, roleKey) ? 1 : 0;
  return Math.max(0, cfg.max - event.roster[roleKey].both.length);
}

function filledSlotCount(event) {
  let filled = 0;
  Object.keys(ROLE_CONFIG).forEach(key => {
    const cfg = ROLE_CONFIG[key];
    if (cfg.type === 'split') {
      filled += cfg.services.filter(s => event.roster[key][s]).length;
    } else if (cfg.type === 'both') {
      filled += event.roster[key].both ? 1 : 0;
    } else {
      filled += event.roster[key].both.length;
    }
  });
  return filled;
}

function totalSlotCount() {
  let total = 0;
  Object.keys(ROLE_CONFIG).forEach(key => {
    const cfg = ROLE_CONFIG[key];
    total += cfg.type === 'split' ? cfg.services.length : (cfg.type === 'both' ? 1 : cfg.max);
  });
  return total;
}

function isRosterFull(event) {
  return Object.keys(ROLE_CONFIG).every(key => openSlotCount(event, key) === 0);
}

/* =====================================================
   Calendar grid rendering
   ===================================================== */
function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  els.monthLabel.textContent = currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();

  const firstDay = new Date(year, month, 1).getDay();      // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toDateStr(new Date());

  els.calendarGrid.innerHTML = '';
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  dayNames.forEach(n => {
    const d = document.createElement('div');
    d.className = 'cal-day-name';
    d.textContent = n;
    els.calendarGrid.appendChild(d);
  });

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    els.calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = day;

    if (dateStr < todayStr) {
      cell.classList.add('past');
    } else {
      const ev = getEventByDate(dateStr);
      if (ev) {
        cell.classList.add('has-booking');
        cell.classList.add(ev.finalized ? 'event-finalized' : 'event-open');
        cell.title = `Service ${dateStr} — ${filledSlotCount(ev)}/${totalSlotCount()} slots filled`;
      }
      if (dateStr === todayStr) cell.classList.add('today');
      if (dateStr === selectedDate) cell.classList.add('selected');
      cell.addEventListener('click', () => {
        selectedDate = dateStr;
        renderCalendar();
        renderDatePanel();
      });
    }
    els.calendarGrid.appendChild(cell);
  }
  updateUrgentBanner();
  checkRemindersDue();
  renderDatePanel();
}

/* =====================================================
   Selected-date panel (roster + booking + admin)
   ===================================================== */
function renderDatePanel() {
  const user = getCurrentUser();
  const ev = selectedDate ? getEventByDate(selectedDate) : null;

  if (!selectedDate) {
    els.dateInfoBar.classList.add('hidden');
    els.rosterPanel.classList.add('hidden');
    els.bookingPanel.classList.add('hidden');
    els.emptyPanel.classList.remove('hidden');
    return;
  }

  els.dateInfoBar.classList.remove('hidden');
  els.emptyPanel.classList.add('hidden');
  els.dateInfoBar.innerHTML = `<strong>${formatDateLong(selectedDate)}</strong>${ev ? ` — <span class="status-chip ${ev.finalized ? 'chip-final' : 'chip-live'}">${ev.finalized ? 'Roster FINALIZED' : 'Accepting availability'}</span>` : ' — <span class="status-chip chip-live">No service scheduled</span>'}`;

  if (!ev) {
    els.rosterPanel.classList.add('hidden');
    els.bookingPanel.classList.add('hidden');
    $('no-event-panel').classList.remove('hidden');
    $('no-event-user-msg').innerHTML = user && user.isAdmin
      ? 'Admins can schedule a service using <strong>+ Add Service Event</strong> below the calendar.'
      : 'No media service is scheduled for this date yet.';
    return;
  }
  $('no-event-panel').classList.add('hidden');

  renderRoster(ev);
  renderBookingForm(ev);
}

function renderRoster(ev) {
  els.rosterPanel.classList.remove('hidden');
  const user = getCurrentUser();

  // Progress
  const filled = filledSlotCount(ev);
  const total = totalSlotCount();
  const pct = Math.round((filled / total) * 100);
  const bar = $('progress-fill');
  bar.style.width = pct + '%';
  $('progress-label').textContent = `${filled} / ${total} core slots filled`;
  $('roster-percent').textContent = pct + '%';
  const statusText = $('roster-status-text');
  if (ev.finalized) { statusText.textContent = 'Roster finalized'; statusText.className = 'roster-status is-final'; }
  else if (pct === 100) { statusText.textContent = 'Roster complete — awaiting finalize'; statusText.className = 'roster-status is-full'; }
  else if (pct >= 50) { statusText.textContent = 'More than halfway there'; statusText.className = 'roster-status is-half'; }
  else { statusText.textContent = 'Slots still open'; statusText.className = 'roster-status'; }

  // Deadline chip
  $('deadline-chip').textContent = 'Finalize by ' + deadlineLabel(ev.date);
  $('deadline-chip').className = 'deadline-chip ' + (isPastDeadline(ev.date) ? 'deadline-passed' : '');

  // Reminder chip
  const remChip = $('reminder-chip');
  remChip.textContent = reminderStatusLabel(ev);
  remChip.className = 'reminder-chip' + (reminderDueFor(ev) && !ev.remindersSentAt ? ' reminder-due' : '');

  // Slot grid
  const slotGrid = $('roster-slots');
  slotGrid.innerHTML = '';
  Object.entries(ROLE_CONFIG).forEach(([roleKey, cfg]) => {
    const row = document.createElement('div');
    row.className = 'roster-role-row';

    const head = document.createElement('div');
    head.className = 'roster-role-head';
    head.innerHTML = `<span class="roster-role-name">${cfg.name}</span><span class="roster-role-count">${openSlotCount(ev, roleKey) === 0 ? 'FULL' : openSlotCount(ev, roleKey) + ' open'}</span>`;

    const slotsWrap = document.createElement('div');
    slotsWrap.className = 'roster-slots';

    if (cfg.type === 'split') {
      cfg.services.forEach(service => {
        slotsWrap.appendChild(slotChip(ev, roleKey, service, user));
      });
    } else if (cfg.type === 'both') {
      slotsWrap.appendChild(slotChip(ev, roleKey, 'both', user));
    } else {
      for (let i = 0; i < cfg.max; i++) {
        slotsWrap.appendChild(slotChip(ev, roleKey, 'both', user, i));
      }
    }

    row.appendChild(head);
    row.appendChild(slotsWrap);
    slotGrid.appendChild(row);
  });

  // Admin action bar
  const adminBar = $('roster-admin-bar');
  if (user && user.isAdmin) {
    adminBar.classList.remove('hidden');
    $('finalize-btn').disabled = ev.finalized;
    $('finalize-btn').textContent = ev.finalized ? 'Roster Already Sent' : 'Finalize & Send Roster';
    const remBtn = $('send-reminders-btn');
    remBtn.disabled = reminderRecipients(ev).length === 0;
    remBtn.title = remBtn.disabled ? 'No volunteers with an email to remind yet' : 'Email every booked volunteer + the admin';
    $('edit-event-btn').onclick = () => openEventModal(ev);
    $('delete-event-btn').onclick = () => {
      if (confirm(`Delete the service on ${formatDateLong(ev.date)} and its roster?`)) {
        events = events.filter(e => e.id !== ev.id);
        saveEvents();
        selectedDate = null;
        renderCalendar();
      }
    };
    $('finalize-btn').onclick = () => finalizeAndEmail(ev);
    $('send-reminders-btn').onclick = () => sendReminders(ev, false);
    $('copy-roster-btn').onclick = () => {
      navigator.clipboard.writeText(buildRosterText(ev))
        .then(() => showToast('Roster copied to clipboard'))
        .catch(() => showToast('Could not copy'));
    };
  } else {
    adminBar.classList.add('hidden');
  }
}

/* One slot chip inside the roster grid */
function slotChip(ev, roleKey, service, user, socialIdx) {
  const cfg = ROLE_CONFIG[roleKey];
  const chip = document.createElement('div');
  chip.className = 'slot-chip';

  const isSocial = cfg.type === 'both_multiple';
  const volunteer = isSocial ? (ev.roster[roleKey].both[socialIdx] || null) : slotValue(ev, roleKey, service);

  const label = document.createElement('div');
  label.className = 'slot-chip-label';
  label.textContent = cfg.type === 'split'
    ? (service === 'service1' ? '1st Service' : '2nd Service')
    : (isSocial ? `Member ${socialIdx + 1}` : 'Both Services');

  chip.appendChild(label);

  if (volunteer) {
    const info = document.createElement('div');
    info.className = 'slot-chip-filled';
    info.innerHTML = `<strong>${escapeHtml(volunteer.name)}</strong><span>${escapeHtml(volunteer.phone)}</span>${volunteer.email ? `<span class="slot-chip-mail">${escapeHtml(volunteer.email)}</span>` : ''}`;
    chip.appendChild(info);

    if (user && (user.isAdmin || (volunteer.username && volunteer.username === user.username))) {
      const rm = document.createElement('button');
      rm.className = 'slot-chip-remove';
      rm.title = user.isAdmin ? 'Remove from roster' : 'Cancel my slot';
      rm.textContent = '×';
      rm.onclick = () => removeVolunteer(ev, roleKey, service, socialIdx, volunteer);
      chip.appendChild(rm);
    }
    chip.classList.add('is-filled');
  } else {
    const open = document.createElement('div');
    open.className = 'slot-chip-open';
    open.textContent = 'OPEN';
    chip.appendChild(open);
    chip.classList.add('is-open');
  }
  return chip;
}

function removeVolunteer(ev, roleKey, service, socialIdx, volunteer) {
  const cfg = ROLE_CONFIG[roleKey];
  if (cfg.type === 'split') {
    ev.roster[roleKey][service] = null;
  } else if (cfg.type === 'both') {
    ev.roster[roleKey].both = null;
  } else {
    ev.roster[roleKey].both.splice(socialIdx, 1);
  }
  ev.finalized = false; // changes invalidate a sent roster
  saveEvents();
  renderCalendar();
  showToast(`Removed ${volunteer.name} from ${cfg.name}`);
}

/* =====================================================
   Booking form (normal users)
   ===================================================== */
function renderBookingForm(ev) {
  const user = getCurrentUser();
  const form = els.bookingForm;
  form.reset();
  $('booking-error-phone').classList.add('hidden');
  $('booking-error-email').classList.add('hidden');
  $('booking-error-role').classList.add('hidden');

  // Guard rails
  if (!user) {
    els.bookingPanel.classList.add('hidden');
    return;
  }
  if (user.isAdmin) {
    els.bookingPanel.classList.add('hidden');
    return;
  }
  if (ev.finalized) {
    els.bookingPanel.classList.remove('hidden');
    $('booking-panel-title').textContent = 'Roster finalized';
    $('booking-panel-sub').textContent = 'This roster has been finalized and sent. Availability is now closed.';
    form.classList.add('hidden');
    return;
  }
  if (isRosterFull(ev)) {
    els.bookingPanel.classList.remove('hidden');
    $('booking-panel-title').textContent = 'All slots filled';
    $('booking-panel-sub').textContent = 'Thank you! Every core role is covered for this date.';
    form.classList.add('hidden');
    return;
  }

  els.bookingPanel.classList.remove('hidden');
  form.classList.remove('hidden');
  $('booking-panel-title').textContent = 'Register your availability';
  $('booking-panel-sub').textContent = `Service: ${formatDateLong(ev.date)}`;
  $('booking-event-id').value = ev.id;

  // Pre-fill the volunteer's details
  $('bk-name').value = user.name || '';
  $('bk-phone').value = '';
  $('bk-phone').placeholder = '07XXXXXXXX or 01XXXXXXXX';
  $('bk-email').value = '';
  $('bk-email').placeholder = 'you@example.com';

  // Role select — only roles with an open slot are selectable; filled ones show as disabled
  const roleSelect = $('bk-role');
  roleSelect.innerHTML = '<option value="">— Select a role —</option>';
  Object.entries(ROLE_CONFIG).forEach(([roleKey, cfg]) => {
    const open = openSlotCount(ev, roleKey);
    const opt = document.createElement('option');
    opt.value = roleKey;
    opt.textContent = `${cfg.name} · ${open === 0 ? 'FULL' : open + (cfg.type === 'split' ? ' slot(s) open' : cfg.type === 'both' ? ' slot open (both services)' : ' slot(s) open (both services)')}`;
    opt.disabled = open === 0;
    roleSelect.appendChild(opt);
  });

  // Service select — hidden for roles that cover both services
  const svcWrap = $('bk-service-wrap');
  const svcNote = $('bk-service-note');
  svcWrap.classList.add('hidden');
  svcNote.classList.add('hidden');
  $('bk-service').innerHTML = '<option value="">— Select service —</option>';

  roleSelect.onchange = () => populateServiceOptions(ev);
}

function populateServiceOptions(ev) {
  const roleKey = $('bk-role').value;
  const cfg = ROLE_CONFIG[roleKey];
  const svcWrap = $('bk-service-wrap');
  const svcNote = $('bk-service-note');
  const svcSelect = $('bk-service');
  const err = $('booking-error-role');

  err.classList.add('hidden');
  svcSelect.innerHTML = '<option value="">— Select service —</option>';

  if (!roleKey) { svcWrap.classList.add('hidden'); svcNote.classList.add('hidden'); return; }

  if (cfg.type === 'split') {
    svcWrap.classList.remove('hidden');
    svcNote.classList.add('hidden');
    cfg.services.forEach(service => {
      const open = isSlotOpen(ev, roleKey, service);
      const opt = document.createElement('option');
      opt.value = service;
      opt.textContent = (service === 'service1' ? '1st Service' : '2nd Service') + (open ? '' : ' — FULL');
      opt.disabled = !open;
      svcSelect.appendChild(opt);
    });
  } else {
    // 'both' & 'both_multiple' — the single available option covers both services
    svcWrap.classList.add('hidden');
    svcNote.classList.remove('hidden');
    svcNote.textContent = cfg.type === 'both_multiple'
      ? `Covers BOTH services — ${cfg.max - ev.roster[roleKey].both.length} of ${cfg.max} member slot(s) still open.`
      : 'This role covers BOTH services (1st & 2nd) with a single volunteer.';
  }
}

/* Phone validation + submission */
function handleBookingSubmit(e) {
  e.preventDefault();

  const name = $('bk-name').value.trim();
  const phone = $('bk-phone').value.trim();
  const email = $('bk-email').value.trim();
  const roleKey = $('bk-role').value;
  const cfg = ROLE_CONFIG[roleKey];
  const errPhone = $('booking-error-phone');
  const errEmail = $('booking-error-email');
  const errRole = $('booking-error-role');
  const ev = evForBooking();
  if (!ev) return; // defensive: event vanished

  let valid = true;

  // 1) Phone — exactly 10 digits, starts 07 or 01
  if (!PHONE_REGEX.test(phone)) {
    errPhone.classList.remove('hidden');
    valid = false;
  } else {
    errPhone.classList.add('hidden');
  }

  // 2) Email — required for service reminders
  if (!EMAIL_REGEX.test(email)) {
    errEmail.classList.remove('hidden');
    valid = false;
  } else {
    errEmail.classList.add('hidden');
  }

  // 3) Role + service
  let service = null;
  if (!roleKey) {
    errRole.classList.remove('hidden');
    errRole.textContent = 'Please select a serving role.';
    valid = false;
  } else {
    errRole.classList.add('hidden');
    if (cfg.type === 'split') {
      service = $('bk-service').value;
      if (!service) {
        errRole.classList.remove('hidden');
        errRole.textContent = 'Please select 1st or 2nd Service.';
        valid = false;
      } else if (!isSlotOpen(ev, roleKey, service)) {
        errRole.classList.remove('hidden');
        errRole.textContent = 'That slot was just taken — please choose another.';
        valid = false;
      }
    }
  }

  if (!valid || !roleKey) return;
  const user = getCurrentUser();
  const volunteer = { name, phone, email, username: user ? user.username : null };

  if (cfg.type === 'split') {
    ev.roster[roleKey][service] = volunteer;
  } else if (cfg.type === 'both') {
    ev.roster[roleKey].both = volunteer;
  } else {
    if (!isSlotOpen(ev, roleKey)) { showToast('Sorry — all slots for this role just filled.'); renderCalendar(); return; }
    ev.roster[roleKey].both.push(volunteer);
  }

  saveEvents();
  renderCalendar();
  showToast(`Slot confirmed — ${cfg.name}${cfg.type === 'split' ? (service === 'service1' ? ' (1st Service)' : ' (2nd Service)') : ' (Both Services)'}`);

  // 3) Auto-dispatch when the roster hits 100%
  if (isRosterFull(ev) && !ev.finalized) {
    finalizeAndEmail(ev);
  }
}

function evForBooking() {
  return getEventById($('booking-event-id').value);
}

/* =====================================================
   Admin — event modal (add / edit)
   ===================================================== */
function openEventModal(ev) {
  editingEvent = ev || null;
  $('event-modal-title').textContent = ev ? 'Edit Service Event' : 'Add Service Event';
  $('event-date-input').value = ev ? ev.date : toDateStr(new Date());
  $('event-date-input').min = toDateStr(new Date());
  $('event-date-error').classList.add('hidden');
  els.eventModal.classList.remove('hidden');
}

function handleEventSubmit(e) {
  e.preventDefault();
  const dateStr = $('event-date-input').value;
  const errEl = $('event-date-error');
  if (!dateStr) { errEl.textContent = 'Please choose a date.'; errEl.classList.remove('hidden'); return; }

  const existing = getEventByDate(dateStr);
  if (editingEvent) {
    if (existing && existing.id !== editingEvent.id) {
      errEl.textContent = 'An event already exists on that date — pick another.';
      errEl.classList.remove('hidden');
      return;
    }
    editingEvent.date = dateStr;
    saveEvents();
    selectedDate = dateStr;
    showToast('Event updated');
  } else {
    if (existing) {
      errEl.textContent = 'An event already exists on that date — select it instead.';
      errEl.classList.remove('hidden');
      return;
    }
    const ev = createEvent(dateStr);
    events.push(ev);
    saveEvents();
    selectedDate = dateStr;
    showToast('Service event created');
  }
  els.eventModal.classList.add('hidden');
  renderCalendar();
}

/* =====================================================
   Deadline logic — finalize by Wednesday
   ===================================================== */
function deadlineDate(dateStr) {
  const d = parseDate(dateStr);
  const dow = d.getDay();            // 0 Sun … 6 Sat
  const sinceWed = (dow + 4) % 7;    // Wed=3 → 0
  d.setDate(d.getDate() - sinceWed);
  return d;
}

function isPastDeadline(dateStr) {
  return deadlineDate(dateStr) < stripTime(new Date());
}

function deadlineLabel(dateStr) {
  const d = deadlineDate(dateStr);
  const passed = isPastDeadline(dateStr);
  if (passed) return 'WEDNESDAY ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase() + ' — PASSED';
  const days = Math.ceil((d - stripTime(new Date())) / 86400000);
  return 'WEDNESDAY ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase() + (days === 0 ? ' — TODAY' : ` — ${days} day${days === 1 ? '' : 's'} left`);
}

/* "Urgent Fill Needed" — Thu / Fri / Sat with open slots on upcoming events */
function updateUrgentBanner() {
  const day = new Date().getDay();
  const isDeadlineWindow = day === 4 || day === 5 || day === 6; // Thu, Fri, Sat
  const upcoming = events.filter(isUpcoming);
  const open = upcoming.filter(ev => !isRosterFull(ev) && !ev.finalized);

  if (isDeadlineWindow && open.length > 0) {
    const openSlots = open.reduce((n, ev) => n + (totalSlotCount() - filledSlotCount(ev)), 0);
    const dates = open.map(ev => formatDateShort(ev.date)).join(', ');
    els.urgentText.innerHTML = `<span class="urgent-strong">${openSlots} slot${openSlots === 1 ? '' : 's'} still open</span> across ${open.length} upcoming service${open.length === 1 ? '' : 's'} (${dates}). The Wednesday deadline has passed — please step in!`;
    els.urgentBanner.classList.remove('hidden');
  } else {
    els.urgentBanner.classList.add('hidden');
  }
}

/* =====================================================
   Reminder emails (1 day before service)
   ===================================================== */
function emailConfigured() {
  return typeof emailjs !== 'undefined'
    && !EMAILJS_PUBLIC_KEY.startsWith('YOUR_')
    && !EMAILJS_SERVICE_ID.startsWith('YOUR_')
    && !EMAILJS_TEMPLATE_ID.startsWith('YOUR_');
}

/* Every unique volunteer on this event who supplied an email,
   with the role(s) they hold. Deduped by email address. */
function reminderRecipients(ev) {
  const seen = new Map();
  const add = (v, label) => {
    if (!v || !v.email) return;
    const key = v.email.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, { name: v.name, email: v.email.trim(), phone: v.phone, roles: [] });
    seen.get(key).roles.push(label);
  };

  Object.entries(ROLE_CONFIG).forEach(([roleKey, cfg]) => {
    if (cfg.type === 'split') {
      cfg.services.forEach(service => {
        const v = ev.roster[roleKey][service];
        if (v) add(v, cfg.name + ' · ' + (service === 'service1' ? '1st Service' : '2nd Service'));
      });
    } else if (cfg.type === 'both') {
      const v = ev.roster[roleKey].both;
      if (v) add(v, cfg.name + ' · Both Services');
    } else {
      ev.roster[roleKey].both.forEach((v, i) => {
        if (v) add(v, cfg.name + ' · Both Services · Member ' + (i + 1));
      });
    }
  });
  return Array.from(seen.values());
}

/* Reminder is due when the service is within REMINDER_DAYS_BEFORE
   (or overdue but not yet passed) and it hasn't been sent already. */
function reminderDueFor(ev) {
  if (!isUpcoming(ev) || ev.remindersSentAt) return false;
  const days = Math.round((parseDate(ev.date) - stripTime(new Date())) / 86400000);
  return days >= 0 && days <= REMINDER_DAYS_BEFORE;
}

function reminderStatusLabel(ev) {
  const count = reminderRecipients(ev).length;
  if (ev.remindersSentAt) {
    const d = new Date(ev.remindersSentAt);
    return 'Reminder sent ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + count + ' recipient(s)';
  }
  if (count === 0) return 'No emails collected yet';
  if (reminderDueFor(ev)) return 'Reminder DUE — send now';
  const days = Math.round((parseDate(ev.date) - stripTime(new Date())) / 86400000) - REMINDER_DAYS_BEFORE;
  return 'Reminder in ' + days + ' day' + (days === 1 ? '' : 's');
}

function buildReminderText(ev, rec) {
  const line = '─'.repeat(44);
  return `${line}\n` +
    `SERVING REMINDER — MEDIA OPERATIONS PORTAL\n` +
    `${line}\n\n` +
    `Hi ${rec.name},\n\n` +
    `This is a reminder that you are scheduled to serve at the upcoming service:\n\n` +
    `  Date  : ${formatDateLong(ev.date)}\n` +
    `  Role  : ${rec.roles.join(', ')}\n\n` +
    `Please arrive early and ready. Thank you for serving!\n` +
    `${line}\n`;
}

/* =====================================================
   Branded HTML emails (black background, logo, message)
   These are sent via EmailJS as the `roster_html` param.
   The mailto: fallback stays plain text (mail clients
   don't render HTML in mailto: bodies).
   ===================================================== */
function emailLogo() {
  if (CREW_LOGO_URL && !CREW_LOGO_URL.startsWith('YOUR_')) {
    return `<img src="${escapeHtml(CREW_LOGO_URL)}" alt="The Crew" width="84" height="84" style="display:block;margin:0 auto;border-radius:6px;" />`;
  }
  // Monogram fallback so the mail looks complete before a logo is hosted.
  // (line-height centering, not flexbox — Outlook desktop doesn't support flex.)
  return `<div style="width:84px;height:84px;margin:0 auto;background:#FFFFFF;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:bold;letter-spacing:2px;color:#0A0A0A;line-height:84px;text-align:center;">TC</div>`;
}

/* Full branded HTML document: black background, logo, title,
   the message to convey, and the content card. Inline styles
   only (email-safe).
   NOTE: messageHtml and contentHtml are injected as raw HTML —
   callers MUST escape any user-supplied values with escapeHtml(). */
function emailShell(title, messageHtml, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#0A0A0A;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111111;border:1px solid #2e2e2e;">
      <tr><td align="center" style="padding:34px 32px 6px;">
        ${emailLogo()}
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;letter-spacing:5px;color:#FFFFFF;text-transform:uppercase;margin-top:14px;">Media Operations Portal</div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:3px;color:#888888;text-transform:uppercase;margin-top:4px;">Worship Media Crew</div>
      </td></tr>
      <tr><td style="padding:18px 32px 0;"><div style="border-top:1px solid #2e2e2e;"></div></td></tr>
      <tr><td align="center" style="padding:26px 32px 4px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;letter-spacing:4px;color:#FFFFFF;text-transform:uppercase;font-weight:bold;">${escapeHtml(title)}</div>
        ${messageHtml ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#BBBBBB;margin-top:10px;">${messageHtml}</div>` : ''}
      </td></tr>
      <tr><td style="padding:20px 32px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1A1A1A;border:1px solid #2e2e2e;border-left:3px solid #FFFFFF;">
          <tr><td style="padding:20px 22px;font-family:Consolas,'Courier New',monospace;font-size:13px;line-height:1.75;color:#F5F5F5;">${contentHtml}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px;">
        <div style="border-top:1px solid #2e2e2e;padding-top:18px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;color:#888888;text-transform:uppercase;">The Crew &middot; Serving with excellence &middot; Colossians 3:23</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* Roster email: black background + logo + finalized-roster message. */
function buildRosterHTML(ev) {
  const message = ev.finalized
    ? `The master roster for <strong style="color:#FFFFFF;">${escapeHtml(formatDateLong(ev.date))}</strong> has been finalized. Here is the full serving schedule.`
    : `The roster for <strong style="color:#FFFFFF;">${escapeHtml(formatDateLong(ev.date))}</strong> — ${filledSlotCount(ev)} of ${totalSlotCount()} core slots filled.`;
  return emailShell('Master Roster', message, `<span style="white-space:pre-wrap;">${escapeHtml(buildRosterText(ev))}</span>`);
}

/* Individual volunteer reminder email. */
function buildReminderHTML(ev, rec) {
  const roles = rec.roles.map(r => `<li style="color:#F5F5F5;margin-bottom:4px;">${escapeHtml(r)}</li>`).join('');
  const message = `Hi <strong style="color:#FFFFFF;">${escapeHtml(rec.name)}</strong>, this is your reminder — you are scheduled to serve at the upcoming service.`;
  const content = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#BBBBBB;line-height:1.7;">
    <div style="color:#888888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">Service date</div>
    <div style="color:#FFFFFF;font-size:16px;margin-bottom:14px;">${escapeHtml(formatDateLong(ev.date))}</div>
    <div style="color:#888888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">Your role(s)</div>
    <ul style="margin:0;padding-left:18px;">${roles}</ul>
  </div>`;
  return emailShell('Serving Reminder', message, content);
}

/* Admin summary email for reminders. */
function buildReminderAdminHTML(ev, recs) {
  const rows = recs.map((r, i) => `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #2e2e2e;color:#F5F5F5;font-family:Arial,Helvetica,sans-serif;font-size:13px;">${i + 1}. ${escapeHtml(r.name)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #2e2e2e;color:#888888;font-family:Consolas,monospace;font-size:12px;">${escapeHtml(r.email)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #2e2e2e;color:#BBBBBB;font-family:Arial,Helvetica,sans-serif;font-size:12px;">${escapeHtml(r.roles.join('; '))}</td>
  </tr>`).join('');
  const content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr style="background:#222222;">
      <th align="left" style="padding:8px 12px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;">Volunteer</th>
      <th align="left" style="padding:8px 12px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;">Email</th>
      <th align="left" style="padding:8px 12px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;">Role</th>
    </tr>
    ${rows}
  </table>`;
  const message = `Reminder summary for <strong style="color:#FFFFFF;">${escapeHtml(formatDateLong(ev.date))}</strong> — ${recs.length} volunteer(s) have been emailed.`;
  return emailShell('Reminder Summary', message, content);
}

function buildReminderAdminText(ev, recs) {
  const line = '─'.repeat(44);
  let out = `${line}\n`;
  out += `SERVICE REMINDER SUMMARY — MEDIA OPERATIONS PORTAL\n`;
  out += `${line}\n`;
  out += `Date : ${formatDateLong(ev.date)}\n`;
  out += `${line}\n\n`;
  recs.forEach((r, i) => {
    out += `${i + 1}. ${r.name} — ${r.email} (${r.phone})\n`;
    out += `   Roles: ${r.roles.join('; ')}\n\n`;
  });
  out += `${line}\n`;
  return out;
}

/* Send reminders for one event. When EmailJS is configured each
   volunteer (plus the admin) gets an email. Otherwise it falls
   back to a single mailto: draft to the admin listing everyone. */
function sendReminders(ev, isAuto) {
  const recs = reminderRecipients(ev);
  if (recs.length === 0) { showToast('No volunteers with an email to remind.'); return; }

  const subject = `Serving Reminder — ${formatDateLong(ev.date)}`;
  const body = buildReminderAdminText(ev, recs);

  if (!emailConfigured()) {
    // No EmailJS keys: only a manual dispatch can open the mail client.
    showToast(isAuto ? 'EmailJS not configured — reminders due (use Send Reminder Emails)' : 'EmailJS not configured — opening reminder draft');
    if (!isAuto) openMailtoFallback(subject + ' — ' + recs.length + ' volunteer(s)', body);
    return;
  }

  // Mark as sent immediately (prevents duplicate dispatches on re-render).
  ev.remindersSentAt = new Date().toISOString();
  saveEvents();
  renderCalendar();

  const sends = recs.map(rec =>
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:       rec.email,
      subject:        subject,
      roster_details: buildReminderText(ev, rec),
      roster_html:    buildReminderHTML(ev, rec),
    })
  );
  sends.push(emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email:       ROSTER_EMAIL,
    subject:        subject + ' — Summary',
    roster_details: body,
    roster_html:    buildReminderAdminHTML(ev, recs),
  }));

  Promise.allSettled(sends).then(results => {
    const failedCount = results.filter(r => r.status === 'rejected').length;
    if (failedCount === results.length) {
      // Nothing went through — revert the sent-mark so it stays due.
      // (No re-render here: the 5-minute auto-check and next natural
      // render will retry, without risk of a send loop.)
      delete ev.remindersSentAt;
      saveEvents();
      if (!isAuto) openMailtoFallback(subject + ' — ' + recs.length + ' volunteer(s)', body);
      showToast('Email send failed — ' + (isAuto ? 'open the roster panel to retry manually' : 'opening reminder draft instead'));
    } else if (failedCount > 0) {
      showToast(`Reminders sent (${results.length - failedCount}/${recs.length + 1} delivered)`);
    } else {
      showToast(`Reminders sent to ${recs.length} volunteer(s) + admin`);
    }
  });
}

/* Auto-dispatch: runs on load and every few minutes while the app is open. */
function checkRemindersDue() {
  const due = events.filter(ev => reminderDueFor(ev));
  if (due.length === 0) return;
  if (emailConfigured()) {
    due.forEach(ev => sendReminders(ev, true));
  } else if (!sessionStorage.getItem('mop_reminder_nag')) {
    sessionStorage.setItem('mop_reminder_nag', '1');
    showToast('Service reminders are due — configure EmailJS or use Send Reminder Emails');
  }
}

/* =====================================================
   Finalize & email
   ===================================================== */
function buildRosterText(ev) {
  const line = '─'.repeat(44);
  let out = `${line}\n`;
  out += `MEDIA OPERATIONS PORTAL — MASTER ROSTER\n`;
  out += `${line}\n`;
  out += `Date      : ${formatDateLong(ev.date)}\n`;
  out += `Deadline  : ${deadlineLabel(ev.date)}\n`;
  out += `Status    : ${ev.finalized ? 'FINALIZED' : (isRosterFull(ev) ? 'COMPLETE — 100%' : 'IN PROGRESS')}\n`;
  out += `${line}\n\n`;

  Object.entries(ROLE_CONFIG).forEach(([roleKey, cfg]) => {
    out += `[${cfg.name.toUpperCase()}]\n`;
    if (cfg.type === 'split') {
      cfg.services.forEach(service => {
        const v = ev.roster[roleKey][service];
        out += `  ${service === 'service1' ? '1st Service' : '2nd Service'} : ${v ? v.name + ' — ' + v.phone + (v.email ? ' (' + v.email + ')' : '') : 'OPEN'}\n`;
      });
    } else if (cfg.type === 'both') {
      const v = ev.roster[roleKey].both;
      out += `  Both Services : ${v ? v.name + ' — ' + v.phone + (v.email ? ' (' + v.email + ')' : '') : 'OPEN'}\n`;
    } else {
      for (let i = 0; i < cfg.max; i++) {
        const v = ev.roster[roleKey].both[i];
        out += `  Member ${i + 1}      : ${v ? v.name + ' — ' + v.phone + (v.email ? ' (' + v.email + ')' : '') : 'OPEN'}\n`;
      }
    }
    out += '\n';
  });

  out += `${line}\n`;
  out += `Filled ${filledSlotCount(ev)} / ${totalSlotCount()} core slots\n`;
  out += `${line}\n`;
  return out;
}

function finalizeAndEmail(ev) {
  const rosterText = buildRosterText(ev);
  ev.finalized = true;
  ev.finalizedAt = new Date().toISOString();
  saveEvents();
  renderCalendar();

  const subject = `Finalized Worship Roster — ${formatDateLong(ev.date)}`;

  if (emailConfigured()) {
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:        ROSTER_EMAIL,
      subject:         subject,
      roster_details:  rosterText,
      roster_html:     buildRosterHTML(ev),
    }).then(() => {
      showToast('Roster emailed to ' + ROSTER_EMAIL);
    }).catch(() => {
      openMailtoFallback(subject, rosterText);
    });
  } else {
    showToast('EmailJS not configured — opening your email client');
    openMailtoFallback(subject, rosterText);
  }
}

function openMailtoFallback(subject, bodyText) {
  const url = `mailto:${ROSTER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
  window.open(url, '_blank');
}

/* =====================================================
   Login / logout UI (header)
   ===================================================== */
function renderHeaderUser() {
  const user = getCurrentUser();
  if (user) {
    els.userBadge.innerHTML = `Signed in as <span>${escapeHtml(user.name)}</span>${user.isAdmin ? ' · ADMIN' : ''}`;
    els.userBadge.classList.remove('hidden');
    els.loginBtn.classList.add('hidden');
    els.logoutBtn.classList.remove('hidden');
  } else {
    els.userBadge.classList.add('hidden');
    els.loginBtn.classList.remove('hidden');
    els.logoutBtn.classList.add('hidden');
  }
  if (els.adminControls) {
    els.adminControls.classList.toggle('hidden', !user || !user.isAdmin);
  }
}

function openLoginModal() {
  $('login-error').classList.add('hidden');
  els.userModal.classList.remove('hidden');
  setTimeout(() => els.loginUser.focus(), 50);
}

/* =====================================================
   Init
   ===================================================== */
function initCalendar() {
  seedSampleEvents();

  // Month navigation
  $('prev-month').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCalendar(); });
  $('next-month').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCalendar(); });

  // Admin add event
  $('admin-add-event-btn').addEventListener('click', () => openEventModal(null));

  // Auto-check reminders while the app is open (every 5 minutes)
  setInterval(checkRemindersDue, 5 * 60 * 1000);

  // Modals
  $('close-login-modal').addEventListener('click', () => els.userModal.classList.add('hidden'));
  $('close-event-modal').addEventListener('click', () => els.eventModal.classList.add('hidden'));
  els.eventForm.addEventListener('submit', handleEventSubmit);
  els.bookingForm.addEventListener('submit', handleBookingSubmit);

  // Header auth
  els.loginBtn.addEventListener('click', openLoginModal);
  els.logoutBtn.addEventListener('click', () => {
    logoutUser();
    renderHeaderUser();
    renderCalendar(); // re-render panels (admin controls / booking form)
    showToast('Signed out');
  });
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = loginUser(els.loginUser.value, els.loginPass.value);
    if (!user) {
      $('login-error').classList.remove('hidden');
      return;
    }
    els.userModal.classList.add('hidden');
    els.loginUser.value = '';
    els.loginPass.value = '';
    renderHeaderUser();
    renderCalendar();
    showToast(user.isAdmin ? 'Signed in as Administrator' : `Welcome, ${user.name}`);
  });

  // Escape closes any modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      els.userModal.classList.add('hidden');
      els.eventModal.classList.add('hidden');
    }
  });

  renderHeaderUser();
  renderCalendar();
}

/* =====================================================
   Date helpers
   ===================================================== */
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function formatDateLong(dateStr) {
  return parseDate(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function formatDateShort(dateStr) {
  return parseDate(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('DOMContentLoaded', initCalendar);
