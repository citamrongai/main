/* ================================================
   email.js — Email dispatch (EmailJS + mailto fallback)
   Media Operations Portal
   ================================================
   - EmailJS configuration (public key, service, template)
   - Branded black-background HTML emails (The Crew logo)
   - Roster finalize dispatch + 1-day-before reminders
   Falls back to a mailto: draft when EmailJS is not
   configured, so the app still works out of the box.
   ================================================ */

/* ---------------- Email configuration ----------------
   1. Create a free account at emailjs.com
   2. Add a service + an email template whose ENTIRE body is:
        {{{roster_html}}}
      (triple braces = unescaped HTML; the app sends the complete
      branded design in the `roster_html` variable). The template
      must contain the variables: to_email, subject, roster_html.
   3. Replace the three YOUR_* values below — emailjs.init() runs
      automatically from this file (js/email.js).
   The roster finalize email and the 1-day-before reminders all
   share this one template. Until configured, the app falls back
   to a mailto: link that opens the admin's email client with a
   plain-text copy of the same message.
   ------------------------------------------------------ */
const ROSTER_EMAIL       = "emmanuellalampaaa@gmail.com";
const EMAILJS_PUBLIC_KEY = "ieSV0jy_necloh4kq";    // e.g. "AbCdEf123"
const EMAILJS_SERVICE_ID = "service_apeheyq";    // e.g. "service_abc123"
const EMAILJS_TEMPLATE_ID = "template_77mnbi9";  // e.g. "template_xyz789"

/* Brand logo used inside the HTML emails. Email clients cannot load
   local files, so host The_Crew_Logo.jpeg somewhere public (your
   church site, a CDN, or a raw GitHub link) and paste the https URL
   here. Until then, the app uses the local The_Crew_Logo.jpeg file,
   which renders wherever the site files are served from. */
const CREW_LOGO_URL = "https://i.ibb.co/BH1Ln5Z5/the-crew-logo.jpeg"; // e.g. "https://example.com/images/the-crew-logo.jpeg"

const REMINDER_DAYS_BEFORE = 1; // reminder emails go out 1 day before the service

/* Initialise EmailJS once (no-op until a real key is provided). */
(function initEmailJS() {
  if (EMAILJS_PUBLIC_KEY && EMAILJS_PUBLIC_KEY.indexOf('YOUR_') !== 0 && typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }
})();

/* True once every EmailJS placeholder has been replaced with a real key. */
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
  // Prefer the public logo URL when configured; otherwise point at the
  // local The_Crew_Logo.jpeg shipped with the app.
  const src = (CREW_LOGO_URL && !CREW_LOGO_URL.startsWith('YOUR_'))
    ? CREW_LOGO_URL
    : 'The_Crew_Logo.jpeg';
  return `<img src="${escapeHtml(src)}" alt="The Crew" width="84" height="84" style="display:block;margin:0 auto;border-radius:6px;" />`;
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
