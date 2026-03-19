// ─── FOCUS STATE ─────────────────────────────────────────────────────────────
const focusState = {
  workMin: 25, breakMin: 5,
  sessions: JSON.parse(localStorage.getItem('fs_sessions') || '[]'),
  streak: parseInt(localStorage.getItem('fs_streak') || '0'),
  lastDate: localStorage.getItem('fs_last_date') || '',
  currentGoal: '',
  sound: 'none',
  soundPlaying: false,
};

const SOUNDS = {
  none:       { label: 'Silent',      src: null },
  rain:       { label: 'Rain',        src: 'https://cdn.jsdelivr.net/gh/anars/blank-audio@master/250-milliseconds-of-silence.mp3' },
  whitenoise: { label: 'White noise', src: null },
  lofi:       { label: 'Lo-fi',       src: null },
};

function saveSessions() {
  localStorage.setItem('fs_sessions', JSON.stringify(focusState.sessions));
}

function checkStreak() {
  const today = new Date().toDateString();
  if (focusState.lastDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (focusState.lastDate === yesterday) {
      focusState.streak++;
    } else if (focusState.lastDate !== today) {
      focusState.streak = 1;
    }
    focusState.lastDate = today;
    localStorage.setItem('fs_streak', focusState.streak);
    localStorage.setItem('fs_last_date', today);
  }
}

function completeSession(type) {
  if (type === 'work') {
    checkStreak();
    const session = {
      goal:     focusState.currentGoal || 'Focus session',
      duration: focusState.workMin,
      date:     new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      day:      new Date().toDateString(),
    };
    focusState.sessions.unshift(session);
    if (focusState.sessions.length > 20) focusState.sessions.pop();
    saveSessions();
    if (isSignedIn()) saveSessionToDB(session);
  }
  renderPage('focus');
}

// ─── FOCUS PAGE RENDER ────────────────────────────────────────────────────────
function renderFocus() {
  const todaySessions = focusState.sessions.filter(
    s => s.day === new Date().toDateString()
  );
  const totalMinToday = todaySessions.reduce((a, s) => a + s.duration, 0);
  const circ = 2 * Math.PI * 54;
  const pct  = pomoRemaining / (pomoDuration);
  const offset = circ * (1 - pct);

  return `
    <div class="focus-layout">

      <!-- LEFT: TIMER -->
      <div class="focus-left">
        <div class="focus-mode-tabs">
          <button class="focus-mode-btn ${pomoSession==='Work'?'active':''}"
            onclick="switchMode('work')">Work</button>
          <button class="focus-mode-btn ${pomoSession==='Break'?'active':''}"
            onclick="switchMode('break')">Break</button>
        </div>

        <div class="focus-ring-wrap">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="54" fill="none" stroke="var(--border-2)" stroke-width="7"/>
            <circle id="focus-ring-fill" cx="80" cy="80" r="54" fill="none"
              stroke="var(--accent)" stroke-width="7" stroke-linecap="round"
              transform="rotate(-90 80 80)"
              style="stroke-dasharray:${circ};stroke-dashoffset:${offset};transition:stroke-dashoffset 1s linear"/>
          </svg>
          <div class="focus-ring-center">
            <div class="focus-time" id="focus-time">${fmtTime(pomoRemaining)}</div>
            <div class="focus-session-label">${pomoSession} session</div>
          </div>
        </div>

        <div class="focus-goal-wrap">
          <input class="focus-goal-input" id="focus-goal-input"
            type="text" placeholder="What are you working on?"
            value="${focusState.currentGoal}"
            oninput="focusState.currentGoal = this.value"/>
        </div>

        <div class="focus-controls">
          <button class="focus-ctrl-btn" onclick="resetFocus()" title="Reset">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8a5 5 0 1 0 1-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M3 4v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="focus-play-btn" id="focus-play-btn" onclick="toggleFocusPomo()">
            ${pomoRunning ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="5" y="4" width="4" height="12" rx="1.5" fill="currentColor"/><rect x="11" y="4" width="4" height="12" rx="1.5" fill="currentColor"/></svg>`
                         : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M6 4l11 6-11 6V4z" fill="currentColor"/></svg>`}
          </button>
          <button class="focus-ctrl-btn" onclick="skipSession()" title="Skip">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 4l7 4-7 4V4z" fill="currentColor"/>
              <rect x="11" y="4" width="2" height="8" rx="1" fill="currentColor"/>
            </svg>
          </button>
        </div>

        <div class="focus-custom">
          <div class="custom-row">
            <span class="custom-label">Work</span>
            <div class="custom-stepper">
              <button onclick="adjustTime('work',-5)">−</button>
              <span id="work-min-label">${focusState.workMin}m</span>
              <button onclick="adjustTime('work',5)">+</button>
            </div>
          </div>
          <div class="custom-row">
            <span class="custom-label">Break</span>
            <div class="custom-stepper">
              <button onclick="adjustTime('break',-5)">−</button>
              <span id="break-min-label">${focusState.breakMin}m</span>
              <button onclick="adjustTime('break',5)">+</button>
            </div>
          </div>
        </div>

        <!-- AMBIENT SOUND -->
        <div class="sound-panel">
          <div class="sound-label">Ambient sound</div>
          <div class="sound-btns">
            ${Object.entries(SOUNDS).map(([key, s]) => `
              <button class="sound-btn ${focusState.sound===key?'active':''}"
                onclick="setSound('${key}')">${s.label}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- RIGHT: STATS + HISTORY -->
      <div class="focus-right">

        <div class="focus-stats-grid">
          <div class="stat-card">
            <div class="stat-label">Sessions today</div>
            <div class="stat-value">${todaySessions.length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Minutes today</div>
            <div class="stat-value">${totalMinToday}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Streak</div>
            <div class="stat-value">${focusState.streak}d</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">This week</div>
            <div class="stat-value">${focusState.sessions.length}</div>
          </div>
        </div>

        <div class="panel" style="margin-top:14px">
          <div class="panel-header">
            <span class="panel-title">Session history</span>
            ${focusState.sessions.length ? `<button class="panel-action" onclick="clearSessions()">Clear</button>` : ''}
          </div>
          ${focusState.sessions.length === 0
            ? `<div class="empty-state" style="padding:24px 0">No sessions yet — start your first one!</div>`
            : focusState.sessions.map(s => `
              <div class="session-row">
                <div class="session-dot"></div>
                <div class="session-body">
                  <div class="session-goal">${s.goal}</div>
                  <div class="session-meta">${s.duration} min · ${s.date}</div>
                </div>
              </div>
            `).join('')
          }
        </div>

        <!-- BUDDY STATUS -->
        <div class="panel" style="margin-top:14px">
          <div class="panel-header"><span class="panel-title">Buddy's focus</span></div>
          <div class="buddy-focus-row">
            <div class="avatar av-buddy" style="width:32px;height:32px;font-size:12px">BU</div>
            <div>
              <div style="font-size:13px;font-weight:500;color:var(--text)">Buddy</div>
              <div style="font-size:12px;color:var(--text-3)">Not in a session</div>
            </div>
            <div style="margin-left:auto;font-size:12px;color:var(--text-3)">Invite to focus →</div>
          </div>
        </div>

      </div>
    </div>
  `;
}

// ─── FOCUS CONTROLS ───────────────────────────────────────────────────────────
function toggleFocusPomo() {
  pomoRunning = !pomoRunning;
  if (pomoRunning) {
    broadcastFocusStatus(true, focusState.currentGoal);
    pomoInterval = setInterval(() => {
      if (pomoRemaining > 0) {
        pomoRemaining--;
        updateFocusRing();
      } else {
        clearInterval(pomoInterval);
        pomoRunning = false;
        const type = pomoSession === 'Work' ? 'work' : 'break';
        completeSession(type);
        pomoSession = pomoSession === 'Work' ? 'Break' : 'Work';
        pomoDuration = pomoSession === 'Work' ? focusState.workMin * 60 : focusState.breakMin * 60;
        pomoRemaining = pomoDuration;
      }
    }, 1000);
  } else {
    clearInterval(pomoInterval);
    broadcastFocusStatus(false);
  }
  updateFocusPlayBtn();
}

function updateFocusRing() {
  const circ = 2 * Math.PI * 54;
  const pct = pomoRemaining / pomoDuration;
  const el = document.getElementById('focus-ring-fill');
  const tl = document.getElementById('focus-time');
  if (el) { el.style.strokeDasharray = circ; el.style.strokeDashoffset = circ * (1 - pct); }
  if (tl) tl.textContent = fmtTime(pomoRemaining);
  // also update home ring if cached
  updateRing();
}

function updateFocusPlayBtn() {
  const btn = document.getElementById('focus-play-btn');
  if (!btn) return;
  btn.innerHTML = pomoRunning
    ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="5" y="4" width="4" height="12" rx="1.5" fill="currentColor"/><rect x="11" y="4" width="4" height="12" rx="1.5" fill="currentColor"/></svg>`
    : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M6 4l11 6-11 6V4z" fill="currentColor"/></svg>`;
}

function resetFocus() {
  clearInterval(pomoInterval); pomoRunning = false;
  pomoDuration = pomoSession === 'Work' ? focusState.workMin * 60 : focusState.breakMin * 60;
  pomoRemaining = pomoDuration;
  updateFocusRing(); updateFocusPlayBtn();
}

function skipSession() {
  clearInterval(pomoInterval); pomoRunning = false;
  pomoSession = pomoSession === 'Work' ? 'Break' : 'Work';
  pomoDuration = pomoSession === 'Work' ? focusState.workMin * 60 : focusState.breakMin * 60;
  pomoRemaining = pomoDuration;
  renderPage('focus');
}

function switchMode(mode) {
  clearInterval(pomoInterval); pomoRunning = false;
  pomoSession = mode === 'work' ? 'Work' : 'Break';
  pomoDuration = mode === 'work' ? focusState.workMin * 60 : focusState.breakMin * 60;
  pomoRemaining = pomoDuration;
  renderPage('focus');
}

function adjustTime(type, delta) {
  if (type === 'work') {
    focusState.workMin = Math.max(5, Math.min(90, focusState.workMin + delta));
    const el = document.getElementById('work-min-label');
    if (el) el.textContent = focusState.workMin + 'm';
    if (pomoSession === 'Work' && !pomoRunning) {
      pomoDuration = focusState.workMin * 60;
      pomoRemaining = pomoDuration;
      updateFocusRing();
    }
  } else {
    focusState.breakMin = Math.max(1, Math.min(30, focusState.breakMin + delta));
    const el = document.getElementById('break-min-label');
    if (el) el.textContent = focusState.breakMin + 'm';
    if (pomoSession === 'Break' && !pomoRunning) {
      pomoDuration = focusState.breakMin * 60;
      pomoRemaining = pomoDuration;
      updateFocusRing();
    }
  }
}

function setSound(key) {
  focusState.sound = key;
  document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

function clearSessions() {
  focusState.sessions = [];
  saveSessions();
  renderPage('focus');
}
