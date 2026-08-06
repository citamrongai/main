/* ================================================
   email.js — Email dispatch (EmailJS + mailto fallback)
   Media Operations Portal
   ================================================
   - EmailJS configuration (public key, service, template)
   - Branded black-background HTML emails (The Crew logo)
   - Roster finalize dispatch to the admin (ROSTER_EMAIL)
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
   3. The keys below are already filled in — emailjs.init() runs
      automatically from this file (js/email.js). The Crew logo is
      hosted on ibb.co (CREW_LOGO_URL) so mail clients can render it.
   Emails are sent ONLY to the admin (ROSTER_EMAIL). Until EmailJS
   is reachable, the app falls back to a mailto: link that opens the
   admin's email client with a plain-text copy of the same message.
   ------------------------------------------------------ */
const ROSTER_EMAIL       = "emmanuellalampaaa@gmail.com";
const EMAILJS_PUBLIC_KEY = "ieSV0jy_necloh4kq";    // e.g. "AbCdEf123"
const EMAILJS_SERVICE_ID = "service_w0y0tb9";  // EmailJS service connected to a sending account
const EMAILJS_TEMPLATE_ID = "template_xb1qij1"; // Template whose entire body is {{{roster_html}}}

/* Brand logo used inside the HTML emails. Hosted on ibb.co so email
   clients (which cannot load local files) can render it. */
const CREW_LOGO_URL = "https://i.ibb.co/BH1Ln5Z5/the-crew-logo.jpeg"; // e.g. "https://example.com/images/the-crew-logo.jpeg"

/* Initialise EmailJS once (no-op until a real key is provided). */
(function initEmailJS() {
  if (EMAILJS_PUBLIC_KEY && EMAILJS_PUBLIC_KEY.indexOf('YOUR_') !== 0 && typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }
})();

/* True once every EmailJS placeholder has been replaced with a real key. */
function emailConfigured() {
  return typeof emailjs !== 'undefined'
    && !!EMAILJS_PUBLIC_KEY && EMAILJS_PUBLIC_KEY.indexOf('YOUR_') !== 0
    && !!EMAILJS_SERVICE_ID && EMAILJS_SERVICE_ID.indexOf('YOUR_') !== 0
    && !!EMAILJS_TEMPLATE_ID && EMAILJS_TEMPLATE_ID.indexOf('YOUR_') !== 0;
}

/* =====================================================
   Branded HTML emails (black background, logo, message)
   These are sent via EmailJS as the `roster_html` param.
   The mailto: fallback stays plain text (mail clients
   don't render HTML in mailto: bodies).
   ===================================================== */
function emailLogo() {
  // Use the public ibb.co logo URL; fall back to it even if the
  // CREW_LOGO_URL placeholder is ever reset.
  const src = (CREW_LOGO_URL && !CREW_LOGO_URL.startsWith('YOUR_'))
    ? CREW_LOGO_URL
    : 'https://i.ibb.co/BH1Ln5Z5/the-crew-logo.jpeg';
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

/* =====================================================
   Finalize & email — sends the roster to the admin only.
   ===================================================== */
function finalizeAndEmail(ev, isAuto) {
  const rosterText = buildRosterText(ev);
  const subject = `Finalized Worship Roster — ${formatDateLong(ev.date)}`;

  const undoFinalize = () => {
    ev.finalized = false;
    ev.finalizedAt = null;
    saveEvents();
    renderCalendar();
    showToast('Roster is complete, but no email was sent (EmailJS not configured) — an admin can still finalize & send from the roster panel.');
  };

  ev.finalized = true;
  ev.finalizedAt = new Date().toISOString();
  saveEvents();
  renderCalendar();

  if (emailConfigured()) {
    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email:        ROSTER_EMAIL,
      subject:         subject,
      roster_details:  rosterText,
      roster_html:     buildRosterHTML(ev),
    }).then(() => {
      showToast('Roster emailed to ' + ROSTER_EMAIL);
    }).catch(() => {
      // Auto-dispatch (triggered by a volunteer's booking) must not pop
      // open the volunteer's mail client — revert so the admin can send.
      if (isAuto) undoFinalize();
      else openMailtoFallback(subject, rosterText);
    });
  } else if (isAuto) {
    undoFinalize();
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
   In-app email preview (admin)
   Renders buildRosterHTML() in a modal iframe so the
   sender sees exactly what the receiver will get.
   ===================================================== */
function openEmailPreview(ev) {
  const frame  = document.getElementById('email-preview-frame');
  const toEl   = document.getElementById('email-preview-to');
  const subEl  = document.getElementById('email-preview-subject');
  if (frame) frame.srcdoc = buildRosterHTML(ev);
  if (toEl)   toEl.textContent = 'To: ' + ROSTER_EMAIL;
  if (subEl)  subEl.textContent = 'Subject: ' + (ev.finalized ? 'Finalized Worship Roster' : 'Worship Roster') + ' — ' + formatDateLong(ev.date);
  const modal = document.getElementById('email-preview-modal');
  if (modal) modal.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  const close = document.getElementById('close-email-preview-modal');
  if (close) close.addEventListener('click', () => {
    document.getElementById('email-preview-modal').classList.add('hidden');
  });

  const copy = document.getElementById('email-preview-copy');
  if (copy) copy.addEventListener('click', () => {
    const frame = document.getElementById('email-preview-frame');
    const html = frame ? frame.srcdoc : '';
    if (!html) { showToast('Nothing to copy yet'); return; }
    if (!navigator.clipboard) { showToast('Clipboard not available — copy from the preview instead'); return; }
    navigator.clipboard.writeText(html)
      .then(() => showToast('Email HTML copied — paste it into your email client'))
      .catch(() => showToast('Could not copy'));
  });
});
