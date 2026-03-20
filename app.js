// ─── STATE ───────────────────────────────────────────────────────────────────
// Clear old example tasks that were seeded before backend was added
const _storedTasks = JSON.parse(localStorage.getItem('fs_tasks') || '[]');
const _exampleIds = [1, 2, 3, 4, 5];
const _hasOnlyExamples = _storedTasks.length && _storedTasks.every(t => _exampleIds.includes(t.id));
if (_hasOnlyExamples) localStorage.removeItem('fs_tasks');

let tasks = JSON.parse(localStorage.getItem('fs_tasks') || '[]');

const quadLabel = { q1: "Urgent & Important", q2: "Important", q3: "Urgent", q4: "Later" };

// ─── POMODORO STATE ───────────────────────────────────────────────────────────
let pomoDuration = 25 * 60;
let pomoRemaining = pomoDuration;
let pomoRunning = false;
let pomoInterval = null;
let pomoSession = "Work";

function saveTasks() {
  localStorage.setItem('fs_tasks', JSON.stringify(tasks));
  if (isSignedIn()) syncTasksToDB();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function fmtTime(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── POMODORO ─────────────────────────────────────────────────────────────────
function updateRing() {
  const pct = pomoRemaining / pomoDuration;
  const r = 42;
  const circ = 2 * Math.PI * r;
  const el = document.getElementById('ring-fill');
  const tl = document.getElementById('ring-time-label');
  if (el) { el.style.strokeDasharray = circ; el.style.strokeDashoffset = circ * (1 - pct); }
  if (tl) tl.textContent = fmtTime(pomoRemaining);
}

function togglePomo() {
  pomoRunning = !pomoRunning;
  const btn = document.getElementById('pomo-run-btn');
  if (pomoRunning) {
    if (btn) btn.textContent = 'Pause';
    pomoInterval = setInterval(() => {
      if (pomoRemaining > 0) { pomoRemaining--; updateRing(); }
      else {
        pomoRunning = false; clearInterval(pomoInterval);
        if (btn) btn.textContent = 'Start';
        pomoSession = pomoSession === 'Work' ? 'Break' : 'Work';
        pomoDuration = pomoSession === 'Work' ? (focusState?.workMin||25)*60 : (focusState?.breakMin||5)*60;
        pomoRemaining = pomoDuration;
        updateRing();
      }
    }, 1000);
  } else {
    clearInterval(pomoInterval);
    if (btn) btn.textContent = 'Start';
  }
}

function resetPomo() {
  clearInterval(pomoInterval); pomoRunning = false;
  pomoSession = 'Work'; pomoDuration = 25 * 60; pomoRemaining = pomoDuration;
  updateRing();
  const btn = document.getElementById('pomo-run-btn');
  if (btn) btn.textContent = 'Start';
}

// ─── TASK TOGGLE ──────────────────────────────────────────────────────────────
function toggleTask(id) {
  const t = tasks.find(x => x.id === id);
  if (t) { t.done = !t.done; saveTasks(); renderPage(currentPage); }
}

// ─── LANDING SCREEN (signed out) ─────────────────────────────────────────────
function renderLandingScreen() {
  return `
    <div class="landing-wrap">
      <div class="landing-hero">
        <div class="landing-logo">
          <div class="logo-icon" style="width:52px;height:52px;border-radius:14px">
            <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" fill="white"/>
              <circle cx="3" cy="4" r="1.5" fill="white" opacity="0.6"/>
              <circle cx="13" cy="4" r="1.5" fill="white" opacity="0.6"/>
              <circle cx="3" cy="12" r="1.5" fill="white" opacity="0.4"/>
              <circle cx="13" cy="12" r="1.5" fill="white" opacity="0.4"/>
            </svg>
          </div>
        </div>
        <h1 class="landing-title">FlowSpace</h1>
        <p class="landing-sub">Productivity, focus and journaling — built for you and your buddy.</p>
        <div class="landing-actions">
          <button class="btn btn-primary landing-btn" onclick="setPage('tasks')">Sign in to get started</button>
        </div>
      </div>

      <div class="landing-features">
        ${[
          { icon: '☑', title: 'Tasks & Matrix', desc: 'Eisenhower priority matrix with drag & drop' },
          { icon: '◎', title: 'Pomodoro Focus', desc: 'Focus sessions with streak tracking' },
          { icon: '◻', title: 'Daily Journal', desc: 'Mood, goals, health and more — every day' },
          { icon: '▦', title: 'Google Calendar', desc: 'Your events synced right inside the app' },
          { icon: '◈', title: 'Shared Space', desc: 'See your buddy\'s progress in real time' },
          { icon: '⟳', title: 'Real-time sync', desc: 'Everything stays in sync between you both' },
        ].map(f => `
          <div class="landing-feature-card">
            <div class="landing-feature-icon">${f.icon}</div>
            <div class="landing-feature-title">${f.title}</div>
            <div class="landing-feature-desc">${f.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── PAGES ────────────────────────────────────────────────────────────────────
function renderHome() {
  if (!isSignedIn()) return renderLandingScreen();

  const done         = tasks.filter(t => t.done).length;
  const total        = tasks.length;
  const pct          = total ? Math.round(done / total * 100) : 0;
  const circ         = 2 * Math.PI * 42;
  const offset       = circ * (1 - pomoRemaining / pomoDuration);
  const myName = cleanName(authState.profile?.name || authState.user?.email?.split('@')[0] || 'You');

  // real focus stats
  const today        = new Date().toDateString();
  const todaySess    = focusState.sessions.filter(s => s.day === today);
  const todayMins    = todaySess.reduce((a, s) => a + (s.duration || 0), 0);

  // real journal streak
  const journalStreak = calcJournalStreak();

  // real recent journal entries
  const recentJournals = Object.keys(journalState.entries)
    .filter(hasContent).sort((a,b) => b.localeCompare(a)).slice(0,2);

  // real activity from focus sessions (all users)
  const recentActivity = focusState.sessions.slice(0, 3).map(s => ({
    name:   s.userName || myName,
    action: `completed a ${s.duration}min focus session — "${s.goal}"`,
    time:   s.date,
    isMe:   s.userId === authState.user?.id,
  }));

  return `
    <p class="greeting">${getGreeting()}, ${myName.split(' ')[0]}</p>
    <p class="subgreeting">${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })} · ${done} of ${total} tasks done</p>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Tasks today</div>
        <div class="stat-value">${done}/${total}</div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Focus today</div>
        <div class="stat-value">${todaySess.length}</div>
        <div class="stat-sub">${todayMins} min total</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Journal streak</div>
        <div class="stat-value">${journalStreak}d</div>
        <div class="stat-sub">${journalStreak > 0 ? 'Keep it up!' : 'Start today'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pending tasks</div>
        <div class="stat-value">${tasks.filter(t=>!t.done && t.quad==='q1').length}</div>
        <div class="stat-sub">Urgent & important</div>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Today's tasks</span>
          <button class="panel-action" onclick="setPage('tasks')">See all →</button>
        </div>
        ${tasks.filter(t=>!t.done).slice(0,4).map(t => `
          <div class="task-item">
            <div class="task-check ${t.done?'done':''}" onclick="toggleTask(${t.id})"></div>
            <div class="task-body">
              <div class="task-name ${t.done?'done':''}">${t.name}<span class="tag tag-${t.quad}">${quadLabel[t.quad]}</span></div>
              <div class="task-meta">${t.due} · ${t.assignee}</div>
            </div>
          </div>
        `).join('') || `<div class="empty-state" style="padding:16px 0">All caught up! 🎉</div>`}
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Pomodoro</span>
          <span class="panel-action">${pomoSession} session</span>
        </div>
        <div class="pomo-ring">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle class="ring-bg" cx="48" cy="48" r="42"/>
            <circle id="ring-fill" class="ring-fill" cx="48" cy="48" r="42"
              style="stroke-dasharray:${circ};stroke-dashoffset:${offset}"/>
          </svg>
          <div class="ring-time" id="ring-time-label">${fmtTime(pomoRemaining)}</div>
        </div>
        <div class="ring-label">${focusState.workMin}min work · ${focusState.breakMin}min break</div>
        <div class="pomo-btns">
          <button class="btn" onclick="resetPomo()">Reset</button>
          <button class="btn btn-primary" id="pomo-run-btn" onclick="togglePomo()">${pomoRunning ? 'Pause' : 'Start'}</button>
        </div>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Activity feed</span>
        </div>
        ${recentActivity.length ? recentActivity.map(a => `
          <div class="activity-item">
            <div class="avatar ${a.isMe ? 'av-you' : 'av-buddy'}">${a.name.slice(0,2).toUpperCase()}</div>
            <div class="activity-text"><strong style="font-weight:500">${a.name}</strong> ${a.action}</div>
            <div class="activity-time">${a.time}</div>
          </div>
        `).join('') : `<div class="empty-state" style="padding:16px 0">No activity yet — start a focus session!</div>`}
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Recent journal</span>
          <button class="panel-action" onclick="setPage('journal')">All entries →</button>
        </div>
        ${recentJournals.length ? recentJournals.map(dateStr => {
          const e = journalState.entries[dateStr];
          const preview = Object.values(e.sections||{}).find(v=>v?.trim()) || '';
          const d = new Date(dateStr+'T12:00:00');
          return `
            <div class="journal-card" onclick="setPage('journal')">
              <div class="journal-date">${d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
              <div class="journal-snippet">${preview.slice(0,100)}${preview.length>100?'…':''}</div>
            </div>
          `;
        }).join('') : `<div class="empty-state" style="padding:16px 0">No journal entries yet.</div>`}
      </div>
    </div>

    ${renderTodayEventsWidget()}
  `;
}

function renderPlaceholder(name, icon) {
  return `
    <div class="placeholder">
      <div class="placeholder-icon">${icon}</div>
      <p class="placeholder-title">${name}</p>
      <p class="placeholder-sub">This section is coming in the next phase of FlowSpace. We're building it out step by step.</p>
      <button class="btn btn-primary" style="margin-top:4px">Coming soon</button>
    </div>
  `;
}

const pages = {
  home:     { title: null,              render: renderHome },
  tasks:    { title: 'Tasks',           render: renderTasks },
  matrix:   { title: 'Priority Matrix', render: renderMatrix },
  focus:    { title: 'Focus',           render: renderFocus },
  journal:  { title: 'Journal',         render: renderJournal },
  calendar: { title: 'Calendar',        render: renderCalendar },
  shared:   { title: 'Shared',          render: renderShared },
};

let currentPage = 'home';

function renderPage(name) {
  const page = pages[name];
  const content = document.getElementById('page-content');
  const title   = document.getElementById('topbar-title');

  // show auth screen if not signed in (except home shows landing)
  if (!isSignedIn() && name !== 'home') {
    if (content) content.innerHTML = renderAuthScreen();
    if (title) title.textContent = 'Sign in';
    return;
  }

  if (title) title.textContent = (!isSignedIn() && name === 'home') ? 'FlowSpace' : (page.title || getGreeting());

  // handle async render functions
  const result = page.render();
  if (result && typeof result.then === 'function') {
    // show loading spinner while data fetches
    if (content) content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:40vh;gap:10px;color:var(--text-3)">
        <div class="loading-spinner"></div>
        Loading...
      </div>`;
    result.then(html => {
      if (content) content.innerHTML = html;
      if (name === 'home') updateRing();
      updateSidebarUser();
    });
  } else {
    if (content) content.innerHTML = result;
    if (name === 'home') updateRing();
    updateSidebarUser();
  }
}

function updateSidebarUser() {
  const authFooter  = document.getElementById('sidebar-footer-auth');
  const guestFooter = document.getElementById('sidebar-footer-guest');
  if (!authFooter || !guestFooter) return;

  if (isSignedIn()) {
    authFooter.style.display  = '';
    guestFooter.style.display = 'none';
    // set your name + initials
    const name = cleanName(authState.profile?.name || authState.user?.email?.split('@')[0] || 'You');
    const nameEl = document.getElementById('sidebar-your-name');
    const avatarEl = document.getElementById('sidebar-your-avatar');
    if (nameEl) {
      nameEl.textContent = name;
      nameEl.title = 'Click to change name';
      nameEl.style.cursor = 'pointer';
      nameEl.onclick = promptRename;
    }
    if (avatarEl) avatarEl.textContent = name.slice(0,2).toUpperCase();
    // load buddy
    loadBuddyProfiles().then(buddies => {
      const buddyNameEl = document.getElementById('sidebar-buddy-name');
      const buddyRow    = document.getElementById('sidebar-buddy-row');
      if (buddies.length && buddyNameEl) {
        buddyNameEl.textContent = buddies[0].name || 'Buddy';
        if (buddyRow) buddyRow.style.display = '';
      } else if (buddyRow) {
        buddyRow.style.display = 'none';
      }
    });
  } else {
    authFooter.style.display  = 'none';
    guestFooter.style.display = '';
  }
}

function setPage(name) {
  currentPage = name;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === name);
  });
  renderPage(name);
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
let collapsed = false;
function toggleSidebar() {
  collapsed = !collapsed;
  const sb  = document.getElementById('sidebar');
  const btn = document.getElementById('collapse-btn');
  const icon = document.getElementById('collapse-icon');
  sb.classList.toggle('collapsed', collapsed);
  btn.style.left = collapsed ? '45px' : 'calc(var(--sidebar-w) - 11px)';
  icon.innerHTML = collapsed
    ? '<path d="M5 2L9 6L5 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<path d="M7 2L3 6L7 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal() { document.getElementById('modal-overlay').classList.add('open'); document.getElementById('task-input').focus(); }
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-title').textContent = 'New task';
  const saveBtn = document.getElementById('save-task-btn');
  if (saveBtn) { saveBtn.textContent = 'Save task'; saveBtn.onclick = saveTask; }
}

function saveTask() {
  const name     = document.getElementById('task-input').value.trim();
  const quad     = document.getElementById('task-quad').value;
  const due      = document.getElementById('task-due').value.trim() || 'No due date';
  const assignee = document.getElementById('task-assignee')?.value || 'You';
  if (!name) return;
  tasks.push({ id: Date.now(), name, done: false, quad, due, assignee });
  saveTasks();
  closeModal();
  document.getElementById('task-input').value = '';
  document.getElementById('task-due').value = '';
  renderPage(currentPage);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Topbar date
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Nav clicks
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => setPage(btn.dataset.page));
  });

  // Topbar buttons
  document.getElementById('add-task-btn').addEventListener('click', openModal);
  document.getElementById('focus-btn').addEventListener('click', () => setPage('focus'));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('save-task-btn').addEventListener('click', saveTask);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Enter to save task
  document.getElementById('task-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveTask();
  });

  renderPage('home');
  updateSidebarUser();
  initGoogle();
  initAuth().then(() => {
    if (isSignedIn()) { renderPage(currentPage); updateSidebarUser(); }
  });
});
