// ─── JOURNAL STATE ────────────────────────────────────────────────────────────
const journalState = {
  entries: JSON.parse(localStorage.getItem('fs_journal') || '{}'),
  view: 'calendar', // 'calendar' | 'entry'
  openDate: null,
};

const SECTIONS = [
  { key: 'general',  label: 'General',       icon: '◎' },
  { key: 'work',     label: 'Work / Study',   icon: '◈' },
  { key: 'health',   label: 'Health',         icon: '♡' },
  { key: 'exercise', label: 'Exercise',       icon: '◷' },
  { key: 'food',     label: 'Food',           icon: '◻' },
  { key: 'goals',    label: 'Goals',          icon: '◆' },
];

const MOODS = [
  { val: 5, emoji: '😄', label: 'Great' },
  { val: 4, emoji: '🙂', label: 'Good' },
  { val: 3, emoji: '😐', label: 'Okay' },
  { val: 2, emoji: '😔', label: 'Low' },
  { val: 1, emoji: '😞', label: 'Rough' },
];

const TAG_OPTIONS = ['work', 'personal', 'health', 'ideas', 'goals', 'travel', 'gratitude'];

function saveJournal() {
  localStorage.setItem('fs_journal', JSON.stringify(journalState.entries));
}

function getEntry(dateStr) {
  if (!journalState.entries[dateStr]) {
    journalState.entries[dateStr] = {
      mood: null, tags: [],
      sections: { general: '', work: '', health: '', exercise: '', food: '', goals: '' },
      photos: [],
      created: dateStr,
    };
  }
  return journalState.entries[dateStr];
}

function hasContent(dateStr) {
  const e = journalState.entries[dateStr];
  if (!e) return false;
  return e.mood || e.tags.length || Object.values(e.sections).some(v => v.trim());
}

function fmtDateKey(date) {
  return date.toISOString().split('T')[0];
}

function fmtDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── JOURNAL RENDER ───────────────────────────────────────────────────────────
function renderJournal() {
  if (journalState.view === 'entry' && journalState.openDate) {
    return renderJournalEntry(journalState.openDate);
  }
  return renderJournalCalendar();
}

function renderJournalCalendar() {
  const today = new Date();
  const year  = today.getFullYear();
  const month = journalState.calMonth !== undefined ? journalState.calMonth : today.getMonth();
  const calYear = journalState.calYear !== undefined ? journalState.calYear : year;

  const firstDay = new Date(calYear, month, 1);
  const lastDay  = new Date(calYear, month + 1, 0);
  const startDow = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const todayKey = fmtDateKey(today);
  const filledDays = Object.keys(journalState.entries).filter(k => hasContent(k));
  const streak = calcJournalStreak();

  let calCells = '';
  let dayCount = 1;
  // blank cells before first day
  for (let i = 0; i < startDow; i++) calCells += `<div class="cal-cell cal-blank"></div>`;
  // day cells
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${calYear}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayKey;
    const isFuture = new Date(dateStr + 'T12:00:00') > today;
    const filled = hasContent(dateStr);
    const entry = journalState.entries[dateStr];
    const moodEmoji = entry?.mood ? MOODS.find(m => m.val === entry.mood)?.emoji : '';
    calCells += `
      <div class="cal-cell ${isToday?'cal-today':''} ${isFuture?'cal-future':''} ${filled?'cal-filled':''}"
        onclick="${isFuture ? '' : `openJournalEntry('${dateStr}')`}">
        <span class="cal-day-num">${d}</span>
        ${moodEmoji ? `<span class="cal-mood-dot">${moodEmoji}</span>` : filled ? `<span class="cal-dot"></span>` : ''}
      </div>
    `;
  }

  // recent entries list
  const recent = Object.keys(journalState.entries)
    .filter(hasContent)
    .sort((a,b) => b.localeCompare(a))
    .slice(0, 5);

  return `
    <div class="journal-layout">
      <div class="journal-left">
        <p class="greeting">Journal</p>
        <p class="subgreeting">${filledDays.length} entries · ${streak}d streak</p>

        <div class="panel" style="margin-bottom:16px">
          <div class="cal-header">
            <button class="cal-nav" onclick="shiftMonth(-1)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <span class="cal-month-label">${monthName}</span>
            <button class="cal-nav" onclick="shiftMonth(1)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2L10 7L5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="cal-dow">
            ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>`<div class="cal-dow-label">${d}</div>`).join('')}
          </div>
          <div class="cal-grid">${calCells}</div>
        </div>

        <button class="btn btn-primary" style="width:100%;justify-content:center"
          onclick="openJournalEntry('${todayKey}')">
          + Write today's entry
        </button>
      </div>

      <div class="journal-right">
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Recent entries</span>
          </div>
          ${recent.length === 0
            ? `<div class="empty-state">No entries yet — click a day to start writing.</div>`
            : recent.map(dateStr => {
                const e = journalState.entries[dateStr];
                const mood = e.mood ? MOODS.find(m => m.val === e.mood) : null;
                const preview = Object.values(e.sections).find(v => v.trim()) || '';
                return `
                  <div class="journal-entry-row" onclick="openJournalEntry('${dateStr}')">
                    <div class="journal-entry-left">
                      <div class="journal-entry-date">${fmtDisplayDate(dateStr)}</div>
                      ${mood ? `<span class="journal-mood-badge">${mood.emoji} ${mood.label}</span>` : ''}
                      ${e.tags.length ? `<div class="journal-tags">${e.tags.map(t=>`<span class="journal-tag">${t}</span>`).join('')}</div>` : ''}
                      ${preview ? `<div class="journal-entry-preview">${preview.slice(0,120)}${preview.length>120?'…':''}</div>` : ''}
                    </div>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;color:var(--text-3)"><path d="M5 2L10 7L5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                  </div>
                `;
              }).join('')
          }
        </div>

        <div class="panel" style="margin-top:14px">
          <div class="panel-header"><span class="panel-title">Mood this week</span></div>
          <div class="mood-week-row">
            ${getLast7Days().map(({dateStr, label}) => {
              const e = journalState.entries[dateStr];
              const mood = e?.mood ? MOODS.find(m => m.val === e.mood) : null;
              return `
                <div class="mood-day-col" onclick="openJournalEntry('${dateStr}')">
                  <span class="mood-day-emoji">${mood ? mood.emoji : '·'}</span>
                  <span class="mood-day-label">${label}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderJournalEntry(dateStr) {
  const entry = getEntry(dateStr);
  const displayDate = fmtDisplayDate(dateStr);

  return `
    <div class="entry-layout">
      <div class="entry-topbar">
        <button class="btn" onclick="closeJournalEntry()">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          Back
        </button>
        <span class="entry-date-label">${displayDate}</span>
        <button class="btn btn-primary" onclick="saveEntryNow()">Save</button>
      </div>

      <!-- MOOD -->
      <div class="panel entry-panel">
        <div class="entry-section-title">Mood</div>
        <div class="mood-picker">
          ${MOODS.map(m => `
            <button class="mood-btn ${entry.mood === m.val ? 'active' : ''}"
              onclick="setMood('${dateStr}', ${m.val})">
              <span class="mood-emoji">${m.emoji}</span>
              <span class="mood-label-sm">${m.label}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- TAGS -->
      <div class="panel entry-panel">
        <div class="entry-section-title">Tags</div>
        <div class="tag-picker">
          ${TAG_OPTIONS.map(t => `
            <button class="tag-option ${entry.tags.includes(t) ? 'active' : ''}"
              onclick="toggleTag('${dateStr}', '${t}')">
              ${t}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- SECTIONS -->
      ${SECTIONS.map(s => `
        <div class="panel entry-panel">
          <div class="entry-section-title">${s.icon} ${s.label}</div>
          <textarea
            class="entry-textarea"
            id="section-${s.key}"
            placeholder="Write about your ${s.label.toLowerCase()} today..."
            oninput="autoResize(this)"
          >${entry.sections[s.key] || ''}</textarea>
        </div>
      `).join('')}

      <!-- PHOTOS -->
      <div class="panel entry-panel">
        <div class="entry-section-title">Photos</div>
        <div class="photo-grid" id="photo-grid-${dateStr}">
          ${(entry.photos||[]).map((p,i) => `
            <div class="photo-thumb">
              <img src="${p}" alt="photo"/>
              <button class="photo-remove" onclick="removePhoto('${dateStr}', ${i})">×</button>
            </div>
          `).join('')}
          <label class="photo-add-btn">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <input type="file" accept="image/*" multiple style="display:none"
              onchange="handlePhotos('${dateStr}', this)"/>
          </label>
        </div>
      </div>

    </div>
  `;
}

// ─── JOURNAL ACTIONS ──────────────────────────────────────────────────────────
function openJournalEntry(dateStr) {
  journalState.view = 'entry';
  journalState.openDate = dateStr;
  getEntry(dateStr); // ensure exists
  renderPage('journal');
}

function closeJournalEntry() {
  saveEntryNow();
  journalState.view = 'calendar';
  journalState.openDate = null;
  renderPage('journal');
}

function saveEntryNow() {
  if (!journalState.openDate) return;
  const dateStr = journalState.openDate;
  const entry = getEntry(dateStr);
  SECTIONS.forEach(s => {
    const el = document.getElementById('section-' + s.key);
    if (el) entry.sections[s.key] = el.value;
  });
  saveJournal();
}

function setMood(dateStr, val) {
  const entry = getEntry(dateStr);
  entry.mood = entry.mood === val ? null : val;
  saveJournal();
  // re-render just mood picker
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
  if (entry.mood !== null) {
    const btns = document.querySelectorAll('.mood-btn');
    btns.forEach((b, i) => { if (MOODS[i].val === entry.mood) b.classList.add('active'); });
  }
}

function toggleTag(dateStr, tag) {
  const entry = getEntry(dateStr);
  const idx = entry.tags.indexOf(tag);
  if (idx >= 0) entry.tags.splice(idx, 1);
  else entry.tags.push(tag);
  saveJournal();
  document.querySelectorAll('.tag-option').forEach(b => {
    b.classList.toggle('active', entry.tags.includes(b.textContent.trim()));
  });
}

function handlePhotos(dateStr, input) {
  const entry = getEntry(dateStr);
  const files = Array.from(input.files);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      entry.photos = entry.photos || [];
      entry.photos.push(e.target.result);
      saveJournal();
      renderPage('journal');
    };
    reader.readAsDataURL(file);
  });
}

function removePhoto(dateStr, idx) {
  const entry = getEntry(dateStr);
  entry.photos.splice(idx, 1);
  saveJournal();
  renderPage('journal');
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function shiftMonth(delta) {
  const today = new Date();
  let m = journalState.calMonth !== undefined ? journalState.calMonth : today.getMonth();
  let y = journalState.calYear  !== undefined ? journalState.calYear  : today.getFullYear();
  m += delta;
  if (m < 0)  { m = 11; y--; }
  if (m > 11) { m = 0;  y++; }
  journalState.calMonth = m;
  journalState.calYear  = y;
  renderPage('journal');
}

function calcJournalStreak() {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = fmtDateKey(d);
    if (hasContent(key)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({
      dateStr: fmtDateKey(d),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0,2),
    });
  }
  return days;
}
