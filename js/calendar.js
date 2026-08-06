/* ================================================
   calendar.js — Booking Calendar & Roster Engine
   Media Operations Portal
   ================================================
   - Interactive month calendar (admin creates events)
   - Volunteer booking with phone validation + slot limits
   - Roster progress + Wednesday finalization deadline
   - "Urgent Fill Needed" banner (Thu/Fri/Sat)
   - EmailJS dispatch lives in js/email.js (mailto: fallback)
   All data persists to localStorage (key: worshipEvents).
   ================================================ */

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
  try {
    const raw = JSON.parse(localStorage.getItem(EVENTS_KEY)) || [];
    const repaired = raw.map(normalizeEventRoster);
    // Persist the repairs so stale events are fixed permanently, not just in memory.
    if (JSON.stringify(repaired) !== JSON.stringify(raw)) {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(repaired));
    }
    return repaired;
  }
  catch { return []; }
}
function saveEvents() {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

/* Repair events saved by older app versions (or edited by hand): if a
   roster slot is missing or has the wrong shape, booking that role
   silently fails. This rebuilds every slot from ROLE_CONFIG on load. */
function normalizeEventRoster(ev) {
  if (!ev.roster || typeof ev.roster !== 'object') ev.roster = {};
  Object.keys(ROLE_CONFIG).forEach(key => {
    const cfg = ROLE_CONFIG[key];
    const slot = ev.roster[key];
    if (cfg.type === 'split') {
      ev.roster[key] = {
        service1: (slot && slot.service1) || null,
        service2: (slot && slot.service2) || null,
      };
    } else if (cfg.type === 'both') {
      let both = null;
      if (slot && slot.both !== undefined) {
        both = Array.isArray(slot.both) ? (slot.both[0] || null) : slot.both;
      }
      ev.roster[key] = { both };
    } else {
      ev.roster[key] = { both: Array.isArray(slot && slot.both) ? slot.both.slice(0, cfg.max) : [] };
    }
  });
  return ev;
}

/* Seed a couple of upcoming weekend events so the app is
   demonstrable on first run (only when storage is empty). */
function seedSampleEvents() {
  if (localStorage.getItem(EVENTS_KEY) !== null) return;
  const today = new Date();
  const samples = [];
  let daysUntilSat = (6 - today.getDay() + 7) % 7;
  if (daysUntilSat === 0) daysUntilSat = 7; // today is Saturday → next Saturday
  for (let i = 0; i < 2; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + daysUntilSat + i * 7); // this Sat, next Sat
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
    $('edit-event-btn').onclick = () => openEventModal(ev);
    $('delete-event-btn').onclick = () => {
      if (confirm(`Delete the service on ${formatDateLong(ev.date)} and its roster?`)) {
        events = events.filter(e => e.id !== ev.id);
        saveEvents();
        selectedDate = null;
        renderCalendar();
      }
    };
    $('preview-email-btn').onclick = () => openEmailPreview(ev);
    $('finalize-btn').onclick = () => finalizeAndEmail(ev);
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
    info.innerHTML = `<strong>${escapeHtml(volunteer.name)}</strong><span>${escapeHtml(volunteer.phone)}</span>`;
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

  if (!roleKey) { svcWrap.classList.add('hidden'); svcNote.classList.add('hidden'); svcSelect.disabled = true; return; }

  if (cfg.type === 'split') {
    svcWrap.classList.remove('hidden');
    svcNote.classList.add('hidden');
    svcSelect.disabled = false; // active — required service choice applies
    cfg.services.forEach(service => {
      const open = isSlotOpen(ev, roleKey, service);
      const opt = document.createElement('option');
      opt.value = service;
      opt.textContent = (service === 'service1' ? '1st Service' : '2nd Service') + (open ? '' : ' — FULL');
      opt.disabled = !open;
      svcSelect.appendChild(opt);
    });
  } else {
    // 'both' & 'both_multiple' — the single available option covers both services.
    // Disable the select so its empty `required` state can't silently block the
    // form's native validation (CSS-hidden fields still participate in it).
    svcWrap.classList.add('hidden');
    svcNote.classList.remove('hidden');
    svcSelect.disabled = true;
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
  const roleKey = $('bk-role').value;
  const cfg = ROLE_CONFIG[roleKey];
  const errPhone = $('booking-error-phone');
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

  // 2) Role + service
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
  const volunteer = { name, phone, username: user ? user.username : null };

  if (cfg.type === 'split') {
    ev.roster[roleKey][service] = volunteer;
  } else if (cfg.type === 'both') {
    if (!isSlotOpen(ev, roleKey)) { showToast('Sorry — all slots for this role just filled.'); renderCalendar(); return; }
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
    finalizeAndEmail(ev, true); // auto → never pops the mail client on the volunteer's machine
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
        out += `  ${service === 'service1' ? '1st Service' : '2nd Service'} : ${v ? v.name + ' — ' + v.phone : 'OPEN'}\n`;
      });
    } else if (cfg.type === 'both') {
      const v = ev.roster[roleKey].both;
      out += `  Both Services : ${v ? v.name + ' — ' + v.phone : 'OPEN'}\n`;
    } else {
      for (let i = 0; i < cfg.max; i++) {
        const v = ev.roster[roleKey].both[i];
        out += `  Member ${i + 1}      : ${v ? v.name + ' — ' + v.phone : 'OPEN'}\n`;
      }
    }
    out += '\n';
  });

  out += `${line}\n`;
  out += `Filled ${filledSlotCount(ev)} / ${totalSlotCount()} core slots\n`;
  out += `${line}\n`;
  return out;
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
  $('prev-month').addEventListener('click', () => { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1); renderCalendar(); });
  $('next-month').addEventListener('click', () => { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1); renderCalendar(); });

  // Admin add event
  $('admin-add-event-btn').addEventListener('click', () => openEventModal(null));

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
      const ep = $('email-preview-modal');
      if (ep) ep.classList.add('hidden');
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
