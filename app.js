// ─── STATE ───────────────────────────────────────────────────────────────────
let tasks = JSON.parse(localStorage.getItem('fs_tasks') || '[]');
if (!tasks.length) {
  tasks = [
    { id: 1, name: "Finish project proposal", done: false, quad: "q1", due: "Today", assignee: "You" },
    { id: 2, name: "Review buddy's PR", done: false, quad: "q2", due: "Tomorrow", assignee: "You" },
    { id: 3, name: "Weekly check-in call", done: true, quad: "q1", due: "Today", assignee: "Both" },
    { id: 4, name: "Update documentation", done: false, quad: "q3", due: "Friday", assignee: "Buddy" },
    { id: 5, name: "Organize shared folder", done: false, quad: "q4", due: "Next week", assignee: "You" },
  ];
  saveTasks();
}

const activity = [
  { av: "BU", name: "Buddy", action: "completed 'Research competitors'", time: "12m ago" },
  { av: "YO", name: "You", action: "added 3 tasks to Matrix", time: "1h ago" },
  { av: "BU", name: "Buddy", action: "started a Focus session", time: "2h ago" },
];

const journals = [
  { date: "Mon, Mar 17", snippet: "Made good progress on the proposal today. Feeling focused after the morning Pomodoro sessions..." },
  { date: "Sun, Mar 16", snippet: "Reflected on last week's goals. Most tasks completed — need to prioritize documentation more..." },
];

const quadLabel = { q1: "Urgent & Important", q2: "Important", q3: "Urgent", q4: "Later" };

// ─── POMODORO STATE ───────────────────────────────────────────────────────────
let pomoDuration = 25 * 60;
let pomoRemaining = pomoDuration;
let pomoRunning = false;
let pomoInterval = null;
let pomoSession = "Work";

function saveTasks() {
  localStorage.setItem('fs_tasks', JSON.stringify(tasks));
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

// ─── PAGES ────────────────────────────────────────────────────────────────────
function renderHome() {
  const done = tasks.filter(t => t.done).length;
  const pct = Math.round(done / tasks.length * 100);
  const circ = 2 * Math.PI * 42;
  const offset = circ * (1 - pomoRemaining / pomoDuration);

  return `
    <p class="greeting">${getGreeting()}</p>
    <p class="subgreeting">${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })} · ${done} of ${tasks.length} tasks done</p>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Tasks today</div>
        <div class="stat-value">${done}/${tasks.length}</div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Focus sessions</div>
        <div class="stat-value">3</div>
        <div class="stat-sub">75 min today</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Buddy's tasks</div>
        <div class="stat-value">2/5</div>
        <div class="stat-sub">On track</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Journal streak</div>
        <div class="stat-value">6d</div>
        <div class="stat-sub">Keep it up</div>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Today's tasks</span>
          <button class="panel-action" onclick="setPage('tasks')">See all →</button>
        </div>
        ${tasks.slice(0, 4).map(t => `
          <div class="task-item">
            <div class="task-check ${t.done ? 'done' : ''}" onclick="toggleTask(${t.id})"></div>
            <div class="task-body">
              <div class="task-name ${t.done ? 'done' : ''}">${t.name}<span class="tag tag-${t.quad}">${quadLabel[t.quad]}</span></div>
              <div class="task-meta">${t.due} · ${t.assignee}</div>
            </div>
          </div>
        `).join('')}
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
        <div class="ring-label">25 min work · 5 min break</div>
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
          <button class="panel-action" onclick="setPage('shared')">Shared board →</button>
        </div>
        ${activity.map(a => `
          <div class="activity-item">
            <div class="avatar ${a.av === 'YO' ? 'av-you' : 'av-buddy'}">${a.av}</div>
            <div class="activity-text"><strong style="font-weight:500">${a.name}</strong> ${a.action}</div>
            <div class="activity-time">${a.time}</div>
          </div>
        `).join('')}
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Recent journal</span>
          <button class="panel-action" onclick="setPage('journal')">All entries →</button>
        </div>
        ${journals.map(j => `
          <div class="journal-card">
            <div class="journal-date">${j.date}</div>
            <div class="journal-snippet">${j.snippet}</div>
          </div>
        `).join('')}
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
  shared:   { title: 'Shared',          render: () => renderPlaceholder('Shared Space', '◈') },
};

let currentPage = 'home';

function renderPage(name) {
  const page = pages[name];
  const content = document.getElementById('page-content');
  const title   = document.getElementById('topbar-title');
  if (content) content.innerHTML = page.render();
  if (title) title.textContent = page.title || getGreeting();
  if (name === 'home') updateRing();
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
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

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
  initGoogle();
});
