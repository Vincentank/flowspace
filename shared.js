// ─── SHARED STATE ─────────────────────────────────────────────────────────────
const sharedState = {
  tasks:      [],
  goals:      [],
  messages:   [],
  members:    [],
  liveStatus: {},
  tab:        'tasks',
};

let sharedChannel = null;

// ─── LOAD ─────────────────────────────────────────────────────────────────────
async function loadSharedData() {
  if (!isSignedIn() || !sb) return;
  await Promise.all([
    loadSharedTasks(),
    loadSharedGoals(),
    loadMessages(),
    loadMembers(),
  ]);
}

async function loadSharedTasks() {
  const { data } = await sb.from('shared_tasks')
    .select('*, profiles(name)')
    .order('created_at', { ascending: true });
  sharedState.tasks = data || [];
}

async function loadSharedGoals() {
  const { data } = await sb.from('shared_goals')
    .select('*, profiles(name)')
    .order('created_at', { ascending: true });
  sharedState.goals = data || [];
}

async function loadMessages() {
  const { data } = await sb.from('messages')
    .select('*, profiles(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  sharedState.messages = (data || []).reverse();
}

async function loadMembers() {
  const { data } = await sb.from('profiles').select('*');
  sharedState.members = (data || []).map(m => ({
    ...m,
    name: cleanName(m.name || m.id?.slice(0, 8) || 'User'),
  }));
}

// ─── REALTIME SHARED ──────────────────────────────────────────────────────────
function subscribeShared() {
  if (!sb || sharedChannel) return;
  sharedChannel = sb.channel('shared-board')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_tasks' }, async () => {
      await loadSharedTasks();
      if (currentPage === 'shared' && sharedState.tab === 'tasks') refreshSharedSection('tasks');
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_goals' }, async () => {
      await loadSharedGoals();
      if (currentPage === 'shared' && sharedState.tab === 'goals') refreshSharedSection('goals');
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
      await loadMessages();
      if (currentPage === 'shared' && sharedState.tab === 'chat') {
        refreshSharedSection('chat');
      } else if (payload.new.user_id !== authState.user?.id) {
        const sender = sharedState.members.find(m => m.id === payload.new.user_id);
        showToast(`💬 ${sender?.name || 'Buddy'}: ${payload.new.content.slice(0, 40)}`);
      }
    })
    .on('broadcast', { event: 'focus_status' }, (payload) => {
      sharedState.liveStatus[payload.payload.userId] = payload.payload;
      if (currentPage === 'shared' && sharedState.tab === 'live') refreshSharedSection('live');
    })
    .subscribe();
}

function unsubscribeShared() {
  if (sharedChannel) { sb?.removeChannel(sharedChannel); sharedChannel = null; }
}

function refreshSharedSection(section) {
  const el = document.getElementById(`shared-section-${section}`);
  if (!el) return;
  const renderers = {
    tasks: renderSharedTasks,
    goals: renderSharedGoals,
    chat:  renderChat,
    live:  renderLiveFocus,
    board: renderLeaderboard,
  };
  if (renderers[section]) el.innerHTML = renderers[section]();
  if (section === 'chat') scrollChatToBottom();
}

// broadcast focus status — works even if shared tab hasn't been opened
function broadcastFocusStatus(focusing, goal = '') {
  // init shared channel in background if not yet open
  if (!sharedChannel && sb && isSignedIn()) subscribeShared();
  if (!sharedChannel) return;
  try {
    sharedChannel.send({
      type: 'broadcast', event: 'focus_status',
      payload: {
        userId:   authState.user?.id,
        name:     cleanName(authState.profile?.name || ''),
        focusing, goal,
        since:    Date.now(),
      },
    });
  } catch(e) { /* silent fail if channel not ready */ }
}

// ─── SHARED TASKS ─────────────────────────────────────────────────────────────
async function addSharedTask(name, quad, due) {
  if (!name.trim() || !sb) return;
  await sb.from('shared_tasks').insert({
    user_id: authState.user.id,
    name: name.trim(), quad, due: due || 'No due date',
  });
}

async function toggleSharedTask(id, currentDone) {
  if (!sb) return;
  // currentDone comes from HTML as string, parse it
  const isDone = currentDone === true || currentDone === 'true';
  await sb.from('shared_tasks').update({ done: !isDone }).eq('id', id);
}

async function deleteSharedTask(id) {
  if (!sb) return;
  await sb.from('shared_tasks').delete().eq('id', id);
}

function renderSharedTasks() {
  const taskList = sharedState.tasks;
  return `
    <div class="shared-add-row">
      <input class="modal-input" id="stask-input" placeholder="Add a shared task..." style="flex:1"
        onkeydown="if(event.key==='Enter') submitSharedTask()"/>
      <select class="modal-select" id="stask-quad">
        <option value="q1">Urgent & Important</option>
        <option value="q2">Important</option>
        <option value="q3">Urgent</option>
        <option value="q4">Later</option>
      </select>
      <button class="btn btn-primary" onclick="submitSharedTask()">Add</button>
    </div>
    <div style="margin-top:12px">
      ${taskList.length === 0
        ? `<div class="empty-state">No shared tasks yet — add one above!</div>`
        : taskList.map(t => `
          <div class="task-row ${t.done ? 'task-row-done' : ''}">
            <div class="task-check ${t.done ? 'done' : ''}" onclick="toggleSharedTask(${t.id}, ${t.done})"></div>
            <div class="task-row-body">
              <span class="task-row-name ${t.done ? 'done' : ''}">${t.name}</span>
              <div class="task-row-meta">
                <span class="tag tag-${t.quad}">${quadLabel[t.quad]}</span>
                <span class="meta-pill">${t.due}</span>
                <span class="meta-pill">
                  <div class="avatar-xs" style="background:${memberColor(t.user_id)};color:#fff">${(t.profiles?.name||'?').slice(0,2).toUpperCase()}</div>
                  ${cleanName(t.profiles?.name || 'Unknown')}
                </span>
              </div>
            </div>
            ${t.user_id === authState.user?.id ? `
              <button class="task-delete" onclick="deleteSharedTask(${t.id})">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2L11 11M11 2L2 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
              </button>` : ''}
          </div>
        `).join('')}
    </div>
  `;
}

async function submitSharedTask() {
  const name = document.getElementById('stask-input')?.value.trim();
  const quad = document.getElementById('stask-quad')?.value || 'q4';
  if (!name) return;
  document.getElementById('stask-input').value = '';
  await addSharedTask(name, quad, 'No due date');
}

// ─── SHARED GOALS ─────────────────────────────────────────────────────────────
async function addSharedGoal(title, target, unit) {
  if (!sb) return;
  await sb.from('shared_goals').insert({
    user_id: authState.user.id,
    title: title.trim(), target: parseInt(target) || 100, unit: unit || '%',
  });
}

async function updateGoalProgress(id, current, delta) {
  if (!sb) return;
  const newVal = Math.max(0, Math.min(Number(current) + delta, 9999));
  await sb.from('shared_goals').update({ progress: newVal }).eq('id', id);
}

async function deleteSharedGoal(id) {
  if (!sb) return;
  await sb.from('shared_goals').delete().eq('id', id);
}

function renderSharedGoals() {
  const goals = sharedState.goals;
  return `
    <div class="shared-add-row">
      <input class="modal-input" id="sgoal-input" placeholder="Goal title..." style="flex:1"
        onkeydown="if(event.key==='Enter') submitSharedGoal()"/>
      <input class="modal-input" id="sgoal-target" type="number" placeholder="Target" style="width:80px"/>
      <input class="modal-input" id="sgoal-unit" placeholder="unit" style="width:70px"/>
      <button class="btn btn-primary" onclick="submitSharedGoal()">Add</button>
    </div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
      ${goals.length === 0
        ? `<div class="empty-state">No shared goals yet — add one above!</div>`
        : goals.map(g => {
            const pct = Math.min(Math.round((g.progress / g.target) * 100), 100);
            return `
              <div class="goal-card">
                <div class="goal-card-header">
                  <div style="flex:1">
                    <div class="goal-title">${g.title}</div>
                    <div class="goal-meta">${g.progress} / ${g.target} ${g.unit} · by ${cleanName(g.profiles?.name || 'Unknown')}</div>
                  </div>
                  <div class="goal-pct">${pct}%</div>
                  ${g.user_id === authState.user?.id ? `
                    <button class="task-delete" onclick="deleteSharedGoal(${g.id})" style="opacity:1;margin-left:8px">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2L11 11M11 2L2 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                    </button>` : ''}
                </div>
                <div class="progress-wrap" style="margin:8px 0 10px">
                  <div class="progress-bar" style="width:${pct}%;background:${pct>=100?'#22c55e':'var(--accent)'}"></div>
                </div>
                <div class="goal-btns">
                  <button class="btn" onclick="updateGoalProgress(${g.id}, ${g.progress}, -10)">− 10</button>
                  <button class="btn" onclick="updateGoalProgress(${g.id}, ${g.progress}, -1)">− 1</button>
                  <button class="btn btn-primary" onclick="updateGoalProgress(${g.id}, ${g.progress}, 1)">+ 1</button>
                  <button class="btn btn-primary" onclick="updateGoalProgress(${g.id}, ${g.progress}, 10)">+ 10</button>
                </div>
              </div>
            `;
          }).join('')}
    </div>
  `;
}

async function submitSharedGoal() {
  const title  = document.getElementById('sgoal-input')?.value.trim();
  const target = document.getElementById('sgoal-target')?.value || '100';
  const unit   = document.getElementById('sgoal-unit')?.value.trim() || '%';
  if (!title) return;
  document.getElementById('sgoal-input').value = '';
  document.getElementById('sgoal-target').value = '';
  document.getElementById('sgoal-unit').value = '';
  await addSharedGoal(title, target, unit);
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
async function sendMessage(content) {
  if (!content.trim() || !sb) return;
  await sb.from('messages').insert({
    user_id: authState.user.id,
    content: content.trim(),
  });
}

function renderChat() {
  const msgs = sharedState.messages;
  return `
    <div class="chat-messages" id="chat-messages">
      ${msgs.length === 0
        ? `<div class="empty-state" style="padding:24px">No messages yet — say hi!</div>`
        : msgs.map(m => {
            const isMe = m.user_id === authState.user?.id;
            const time = new Date(m.created_at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
            const name = cleanName(m.profiles?.name || 'Unknown');
            return `
              <div class="chat-msg ${isMe ? 'chat-msg-me' : ''}">
                ${!isMe ? `<div class="chat-avatar" style="background:${memberColor(m.user_id)}">${name.slice(0,2).toUpperCase()}</div>` : ''}
                <div class="chat-bubble-wrap">
                  ${!isMe ? `<div class="chat-name">${name}</div>` : ''}
                  <div class="chat-bubble ${isMe ? 'chat-bubble-me' : ''}">${escapeHtml(m.content)}</div>
                  <div class="chat-time">${time}</div>
                </div>
              </div>
            `;
          }).join('')}
    </div>
    <div class="chat-input-row">
      <input class="modal-input" id="chat-input" placeholder="Message..."
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitChat()}"/>
      <button class="btn btn-primary" onclick="submitChat()">Send</button>
    </div>
  `;
}

async function submitChat() {
  const input = document.getElementById('chat-input');
  if (!input?.value.trim()) return;
  const content = input.value;
  input.value = '';
  await sendMessage(content);
}

function scrollChatToBottom() {
  setTimeout(() => {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── LIVE FOCUS ───────────────────────────────────────────────────────────────
function renderLiveFocus() {
  const myStatus = {
    userId:   authState.user?.id,
    name:     cleanName(authState.profile?.name || ''),
    focusing: pomoRunning && pomoSession === 'Work',
    goal:     focusState.currentGoal || '',
    isMe:     true,
  };
  const others = Object.values(sharedState.liveStatus)
    .filter(s => s.userId !== authState.user?.id);
  const allStatuses = [myStatus, ...others];

  return `
    <div style="display:flex;flex-direction:column;gap:2px">
      ${allStatuses.map(s => `
        <div class="live-focus-row">
          <div class="live-avatar" style="background:${s.isMe ? 'var(--accent)' : memberColor(s.userId)};color:${s.isMe?'var(--accent-text)':'#fff'}">
            ${(s.name||'?').slice(0,2).toUpperCase()}
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:500;color:var(--text)">${s.name}${s.isMe?' (you)':''}</div>
            <div style="font-size:12px;color:var(--text-3)">${s.focusing
              ? `Focusing${s.goal ? ` — ${s.goal}` : ''}`
              : 'Not focusing'}</div>
          </div>
          <div class="live-status-dot" style="background:${s.focusing ? '#22c55e' : 'var(--border-2)'}"></div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────
function renderLeaderboard() {
  const stats = sharedState.members.map(m => {
    // count done shared tasks per user
    const doneTasks  = sharedState.tasks.filter(t => t.user_id === m.id && t.done).length;
    // for current user use local session data; for others it's 0 until we have cross-user session storage
    const mySessions = m.id === authState.user?.id ? focusState.sessions : [];
    const focusMins  = mySessions.reduce((a,s) => a + (s.duration||0), 0);
    const journalDays = m.id === authState.user?.id
      ? Object.keys(journalState.entries).filter(d => hasContent(d)).length : 0;
    const score = (doneTasks * 10) + (mySessions.length * 5) + focusMins + (journalDays * 8);
    return { ...m, doneTasks, focusMins, sessions: mySessions.length, journalDays, score };
  }).sort((a,b) => b.score - a.score);

  if (!stats.length) return `<div class="empty-state">No members found.</div>`;

  return `
    <div style="display:flex;flex-direction:column;gap:8px">
      ${stats.map((m, i) => `
        <div class="leaderboard-row ${m.id === authState.user?.id ? 'leaderboard-me' : ''}">
          <div class="leaderboard-rank">${['🥇','🥈','🥉'][i] || `#${i+1}`}</div>
          <div class="leaderboard-avatar" style="background:${m.id===authState.user?.id?'var(--accent)':memberColor(m.id)};color:${m.id===authState.user?.id?'var(--accent-text)':'#fff'}">
            ${(m.name||'?').slice(0,2).toUpperCase()}
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:500;color:var(--text)">${m.name}</div>
            <div style="font-size:11.5px;color:var(--text-3)">${m.doneTasks} tasks · ${m.sessions} sessions · ${m.focusMins}min focused</div>
          </div>
          <div class="leaderboard-score">${m.score}pts</div>
        </div>
      `).join('')}
    </div>
    <p style="font-size:11px;color:var(--text-3);margin-top:12px;text-align:center">Tasks×10 + sessions×5 + focus mins + journal days×8</p>
  `;
}

// ─── MEMBER COLOR ─────────────────────────────────────────────────────────────
const COLOR_POOL = ['#4b3dbf','#0f6e56','#854f0b','#a32d2d','#1a4fa0','#3b6d11'];
function memberColor(userId) {
  if (!userId) return '#888';
  const idx = [...userId].reduce((a,c) => a + c.charCodeAt(0), 0) % COLOR_POOL.length;
  return COLOR_POOL[idx];
}

// ─── MAIN RENDER ──────────────────────────────────────────────────────────────
async function renderShared() {
  if (!isSignedIn()) return renderAuthScreen();
  await loadSharedData();
  subscribeShared();

  const tab  = sharedState.tab;
  const tabs = [
    { key: 'tasks', label: 'Shared tasks' },
    { key: 'goals', label: 'Goals' },
    { key: 'live',  label: 'Live focus' },
    { key: 'board', label: 'Leaderboard' },
    { key: 'chat',  label: 'Chat' },
  ];

  // only render the active tab section upfront, rest rendered on switch
  const sectionContent = {
    tasks: renderSharedTasks(),
    goals: renderSharedGoals(),
    live:  renderLiveFocus(),
    board: renderLeaderboard(),
    chat:  renderChat(),
  };

  return `
    <p class="greeting">Shared Space</p>
    <p class="subgreeting">${sharedState.members.length} member${sharedState.members.length !== 1 ? 's' : ''} · real-time sync</p>

    <div class="shared-tabs">
      ${tabs.map(t => `
        <button class="shared-tab ${tab === t.key ? 'active' : ''}" data-tab="${t.key}"
          onclick="switchSharedTab('${t.key}')">${t.label}</button>
      `).join('')}
    </div>

    <div class="panel" style="margin-top:14px">
      ${tabs.map(t => `
        <div id="shared-section-${t.key}" style="display:${tab===t.key?'':'none'}">
          ${tab === t.key ? sectionContent[t.key] : ''}
        </div>
      `).join('')}
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-header"><span class="panel-title">Members</span></div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
        ${sharedState.members.map(m => `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:0.5px solid var(--border)">
            <div class="avatar" style="background:${memberColor(m.id)};color:#fff;width:28px;height:28px;font-size:11px;flex-shrink:0">
              ${(m.name||'?').slice(0,2).toUpperCase()}
            </div>
            <span style="font-size:13px;color:var(--text)">${m.name}${m.id===authState.user?.id?' (you)':''}</span>
          </div>
        `).join('')}
        <button class="btn" style="margin-top:8px;width:100%;justify-content:center" onclick="copyInviteLink()">
          Copy invite link
        </button>
      </div>
    </div>
  `;
}

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────
function switchSharedTab(tab) {
  sharedState.tab = tab;
  // update tab button styles
  document.querySelectorAll('.shared-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  // hide all sections, show selected
  ['tasks','goals','live','board','chat'].forEach(t => {
    const el = document.getElementById(`shared-section-${t}`);
    if (!el) return;
    if (t === tab) {
      el.style.display = '';
      // render content if empty
      if (!el.innerHTML.trim()) el.innerHTML = {
        tasks: renderSharedTasks,
        goals: renderSharedGoals,
        live:  renderLiveFocus,
        board: renderLeaderboard,
        chat:  renderChat,
      }[t]();
    } else {
      el.style.display = 'none';
    }
  });
  if (tab === 'chat') scrollChatToBottom();
}

function copyInviteLink() {
  navigator.clipboard.writeText(window.location.origin)
    .then(() => showToast('Invite link copied!'));
}

