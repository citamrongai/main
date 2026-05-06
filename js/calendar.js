/* ================================================
   calendar.js — Booking calendar logic
   Media Operations Portal
   ================================================ */

/* ---- State ---- */
let bookings      = JSON.parse(localStorage.getItem('mo_bookings') || '[]');
let selectedDate  = null;
let selectedDocket = null;

const now = new Date();
let calYear  = now.getFullYear();
let calMonth = now.getMonth();

const MONTHS = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER',
];
const DAY_NAMES = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

/* ---- Helpers ---- */
function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function todayStr() { return dateStr(now); }

/* ---- Render the calendar grid ---- */
function renderCalendar() {
  document.getElementById('cal-month-label').textContent =
    `${MONTHS[calMonth]} ${calYear}`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Day name headers
  DAY_NAMES.forEach(name => {
    const el = document.createElement('div');
    el.className = 'cal-day-name';
    el.textContent = name;
    grid.appendChild(el);
  });

  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate();
  const today        = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Empty cells before day 1
  for (let i = 0; i < firstWeekday; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const ds      = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayDate = new Date(calYear, calMonth, d);
    const el      = document.createElement('div');

    el.className  = 'cal-day';
    el.textContent = d;

    if (ds === todayStr())    el.classList.add('today');
    if (dayDate < today)      el.classList.add('past');
    if (ds === selectedDate)  el.classList.add('selected');
    if (bookings.some(b => b.date === ds)) el.classList.add('has-booking');

    if (dayDate >= today) {
      el.addEventListener('click', () => selectDate(ds, dayDate));
    }

    grid.appendChild(el);
  }
}

/* ---- Change calendar month ---- */
function changeMonth(dir) {
  calMonth += dir;
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  renderCalendar();
}

/* ---- Select a date ---- */
function selectDate(ds, dateObj) {
  selectedDate  = ds;
  selectedDocket = null;

  // Clear docket selection
  document.querySelectorAll('.docket-pill').forEach(p => p.classList.remove('selected-pill'));

  renderCalendar();

  // Human-readable label
  const fmt = dateObj.toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  document.getElementById('selected-date-display').textContent = fmt;
  document.getElementById('no-date-msg').style.display         = 'none';
  document.getElementById('booking-form-area').style.display   = 'block';
}

/* ---- Select a docket pill ---- */
function selectDocket(btn, docket) {
  document.querySelectorAll('.docket-pill').forEach(p => p.classList.remove('selected-pill'));
  btn.classList.add('selected-pill');
  selectedDocket = docket;
}

/* ---- Add a new booking ---- */
function addBooking() {
  const name    = document.getElementById('book-name').value.trim();
  const service = document.getElementById('book-service').value;
  const notes   = document.getElementById('book-notes').value.trim();

  if (!name)          { showToast('Please enter your name!');        return; }
  if (!service)       { showToast('Please select a service time!');  return; }
  if (!selectedDocket){ showToast('Please select a docket!');        return; }

  const booking = {
    id:       Date.now(),
    date:     selectedDate,
    name,
    service,
    docket:   selectedDocket,
    notes,
    bookedBy: currentUser ? currentUser.name : 'Unknown',
  };

  bookings.push(booking);
  saveBookings();
  renderCalendar();
  renderAllBookings();

  // Reset form fields
  document.getElementById('book-name').value    = '';
  document.getElementById('book-service').value = '';
  document.getElementById('book-notes').value   = '';
  document.querySelectorAll('.docket-pill').forEach(p => p.classList.remove('selected-pill'));
  selectedDocket = null;

  showToast('Booking confirmed!');
}

/* ---- Delete a booking by ID ---- */
function deleteBooking(id) {
  bookings = bookings.filter(b => b.id !== id);
  saveBookings();
  renderCalendar();
  renderAllBookings();
  showToast('Booking removed.');
}

/* ---- Persist to localStorage ---- */
function saveBookings() {
  localStorage.setItem('mo_bookings', JSON.stringify(bookings));
}

/* ---- Render upcoming bookings list ---- */
function renderAllBookings() {
  const container = document.getElementById('all-bookings-list');
  const upcoming  = bookings
    .filter(b => b.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date));

  const countEl = document.getElementById('booking-count');
  if (countEl) countEl.textContent = `(${upcoming.length} upcoming)`;

  if (!upcoming.length) {
    container.innerHTML = '<div class="empty-bookings">No upcoming bookings yet</div>';
    return;
  }

  container.innerHTML = upcoming.map(b => {
    const parts = b.date.split('-');
    const d     = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    const df    = d.toLocaleDateString('en-KE', { weekday:'short', day:'numeric', month:'short' });

    return `
      <div class="booking-item">
        <div class="booking-info">
          <h4>${b.name}
            <span style="color:var(--text-muted);font-weight:400;font-size:13px;">
              / ${b.service}
            </span>
          </h4>
          <p>${b.notes || 'No notes'}</p>
        </div>
        <div class="booking-meta">
          <div class="booking-date">${df}</div>
          <div class="docket-badge">${b.docket}</div>
        </div>
        <button class="btn-delete" onclick="deleteBooking(${b.id})" title="Remove booking">✕</button>
      </div>
    `;
  }).join('');
}
