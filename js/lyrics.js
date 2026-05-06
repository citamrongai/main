/* ================================================
   lyrics.js — Lyrics formatter logic
   Media Operations Portal
   ================================================ */

/* Active toggle settings */
const formatSettings = {
  sections: true,   // auto-detect VERSE / CHORUS / BRIDGE …
  slides:   true,   // split into presentation slides (max 4 lines each)
  caps:     true,   // capitalise first letter of each line
  clean:    false,  // strip punctuation
  numbers:  false,  // prepend slide numbers
};

/* Keywords that mark a section header */
const SECTION_KEYWORDS = [
  'verse', 'chorus', 'bridge', 'pre-chorus', 'prechorus',
  'intro', 'outro', 'tag', 'hook', 'instrumental',
  'refrain', 'break', 'interlude',
];

/* ---- Toggle a control button on/off ---- */
function toggleCtrl(key, btn) {
  formatSettings[key] = !formatSettings[key];
  btn.classList.toggle('active-ctrl', formatSettings[key]);
}

/* ---- Returns "CHORUS", "VERSE 1" etc. if line is a section label ---- */
function detectSection(line) {
  const lower = line.trim().toLowerCase();
  for (const kw of SECTION_KEYWORDS) {
    if (lower.startsWith(kw)) return line.trim().toUpperCase();
  }
  return null;
}

/* ---- Main format function ---- */
function formatLyrics() {
  const raw = document.getElementById('lyrics-input').value;
  if (!raw.trim()) { showToast('No lyrics to format!'); return; }

  const lines  = raw.split('\n');
  const slides = [];
  let current  = { section: null, lines: [] };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Blank line → push current block as a slide
    if (!trimmed) {
      if (current.lines.length > 0) {
        slides.push({ ...current, lines: [...current.lines] });
        current = { section: current.section, lines: [] };
      }
      continue;
    }

    // Section header detection
    const secLabel = formatSettings.sections ? detectSection(trimmed) : null;
    if (secLabel) {
      if (current.lines.length > 0) {
        slides.push({ ...current, lines: [...current.lines] });
        current = { section: null, lines: [] };
      }
      current.section = secLabel;
      continue;
    }

    // Apply per-line transforms
    let line = trimmed;
    if (formatSettings.caps)  line = line.charAt(0).toUpperCase() + line.slice(1);
    if (formatSettings.clean) line = line.replace(/[.,;:!?'"]/g, '');

    // Auto-split into slides at 4 lines
    if (formatSettings.slides && current.lines.length >= 4) {
      slides.push({ ...current, lines: [...current.lines] });
      current = { section: current.section, lines: [] };
    }

    current.lines.push(line);
  }

  // Flush remainder
  if (current.lines.length > 0) slides.push(current);

  // ---- Render into output panel ----
  const out = document.getElementById('lyrics-output');
  out.innerHTML = '';

  if (slides.length === 0) {
    out.innerHTML = '<span style="color:var(--text-muted);font-size:12px;letter-spacing:2px;">Nothing to display — check your input.</span>';
    return;
  }

  slides.forEach((slide, idx) => {
    const div = document.createElement('div');
    div.className = 'slide-block';

    let html = '';
    if (formatSettings.numbers) {
      html += `<div class="slide-num">SLIDE ${idx + 1}</div>`;
    }
    if (slide.section) {
      html += `<div class="section-tag">${slide.section}</div>`;
    }
    html += slide.lines.join('\n');
    div.innerHTML = html + '<br>';
    out.appendChild(div);
  });

  showToast('Lyrics formatted!');
}

/* ---- Copy formatted output to clipboard ---- */
function copyOutput() {
  const text = document.getElementById('lyrics-output').innerText;
  if (!text.trim() || text.includes('Formatted lyrics')) {
    showToast('Nothing to copy!');
    return;
  }
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!'));
}

/* ---- Download as plain text file ---- */
function downloadOutput() {
  const text = document.getElementById('lyrics-output').innerText;
  if (!text.trim() || text.includes('Formatted lyrics')) {
    showToast('Nothing to download!');
    return;
  }
  const blob = new Blob([text], { type: 'text/plain' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'formatted_lyrics.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Downloaded!');
}

/* ---- Clear both panels ---- */
function clearAll() {
  document.getElementById('lyrics-input').value = '';
  document.getElementById('lyrics-output').innerHTML =
    '<span style="color:var(--text-muted);font-size:12px;letter-spacing:2px;">Formatted lyrics will appear here...</span>';
}
