// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://tojhthgimlwlxibskkbm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OlgdWZiMI5O7sHNa7BjG4A_uKW609xt';

// Load Supabase SDK dynamically
let sb = null;

async function initSupabase() {
  if (sb) return sb;
  await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return sb;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── AUTH STATE ───────────────────────────────────────────────────────────────
const authState = {
  user:    null,
  profile: null,
  loading: false,
  initialized: false,
};

async function initAuth() {
  const client = await initSupabase();

  // check existing session
  const { data: { session } } = await client.auth.getSession();
  if (session?.user) {
    authState.user = session.user;
    await loadProfile(session.user.id);
    await syncAllFromDB();
    subscribeRealtime();
  }
  authState.initialized = true;

  // listen for auth changes
  client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      authState.user = session.user;
      await loadProfile(session.user.id);
      await syncAllFromDB();
      subscribeRealtime();
      renderPage(currentPage);
    }
    if (event === 'SIGNED_OUT') {
      authState.user    = null;
      authState.profile = null;
      unsubscribeRealtime();
      renderPage(currentPage);
    }
  });
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
async function loadProfile(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (data) {
    authState.profile = data;
  } else {
    // create profile on first sign in
    const name = authState.user.email?.split('@')[0] || 'User';
    const { data: newProfile } = await sb.from('profiles')
      .insert({ id: userId, name })
      .select().single();
    authState.profile = newProfile;
  }
}

async function updateProfileName(name) {
  if (!authState.user) return;
  await sb.from('profiles').update({ name }).eq('id', authState.user.id);
  authState.profile.name = name;
}

// ─── SIGN IN / OUT ────────────────────────────────────────────────────────────
async function signInWithEmail(email, password) {
  const client = await initSupabase();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function signUpWithEmail(email, password, name) {
  const client = await initSupabase();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) {
    await sb.from('profiles').upsert({ id: data.user.id, name: name || email.split('@')[0] });
  }
}

async function signOut() {
  const client = await initSupabase();
  await client.auth.signOut();
}

// ─── SYNC: TASKS ──────────────────────────────────────────────────────────────
async function syncTasksToDB() {
  if (!authState.user) return;
  // upsert all tasks for this user
  const rows = tasks.map((t, i) => ({
    id:        typeof t.id === 'number' && t.id < 1e12 ? undefined : t.dbId,
    user_id:   authState.user.id,
    name:      t.name,
    done:      t.done,
    quad:      t.quad,
    due:       t.due,
    assignee:  t.assignee,
    position:  i,
  }));
  await sb.from('tasks').upsert(rows, { onConflict: 'id' });
}

async function loadTasksFromDB() {
  if (!authState.user) return;
  const { data } = await sb.from('tasks')
    .select('*')
    .order('position', { ascending: true });
  if (data?.length) {
    tasks = data.map(r => ({
      id:       r.id,
      dbId:     r.id,
      name:     r.name,
      done:     r.done,
      quad:     r.quad,
      due:      r.due,
      assignee: r.assignee,
    }));
    saveTasks();
  }
}

// ─── SYNC: FOCUS SESSIONS ─────────────────────────────────────────────────────
async function saveSessionToDB(session) {
  if (!authState.user) return;
  await sb.from('focus_sessions').insert({
    user_id:  authState.user.id,
    goal:     session.goal,
    duration: session.duration,
  });
}

async function loadSessionsFromDB() {
  if (!authState.user) return;
  const { data } = await sb.from('focus_sessions')
    .select('*, profiles(name)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (data) {
    focusState.sessions = data.map(r => ({
      goal:     r.goal,
      duration: r.duration,
      date:     new Date(r.created_at).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }),
      day:      new Date(r.created_at).toDateString(),
      userName: r.profiles?.name || 'Unknown',
      userId:   r.user_id,
    }));
    saveSessions();
  }
}

// ─── SYNC: JOURNAL ────────────────────────────────────────────────────────────
async function saveJournalEntryToDB(dateStr) {
  if (!authState.user) return;
  const entry = journalState.entries[dateStr];
  if (!entry) return;
  await sb.from('journal_entries').upsert({
    user_id:  authState.user.id,
    date:     dateStr,
    mood:     entry.mood,
    tags:     entry.tags,
    sections: entry.sections,
  }, { onConflict: 'user_id,date' });
}

async function loadJournalFromDB() {
  if (!authState.user) return;
  const { data } = await sb.from('journal_entries')
    .select('*')
    .eq('user_id', authState.user.id);
  if (data) {
    data.forEach(r => {
      journalState.entries[r.date] = {
        mood:     r.mood,
        tags:     r.tags || [],
        sections: r.sections || {},
        photos:   journalState.entries[r.date]?.photos || [],
      };
    });
    saveJournal();
  }
}

// ─── SYNC ALL ─────────────────────────────────────────────────────────────────
async function syncAllFromDB() {
  await Promise.all([
    loadTasksFromDB(),
    loadSessionsFromDB(),
    loadJournalFromDB(),
  ]);
}

// ─── REALTIME SUBSCRIPTIONS ───────────────────────────────────────────────────
let realtimeChannel = null;

function subscribeRealtime() {
  if (!sb || realtimeChannel) return;
  realtimeChannel = sb.channel('flowspace-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
      loadTasksFromDB().then(() => {
        if (currentPage === 'tasks' || currentPage === 'matrix' || currentPage === 'home') {
          renderPage(currentPage);
        }
      });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'focus_sessions' }, (payload) => {
      loadSessionsFromDB().then(() => {
        if (currentPage === 'focus') renderPage('focus');
        showToast(`${payload.new.user_id === authState.user?.id ? 'You' : 'Buddy'} started a focus session`);
      });
    })
    .subscribe();
}

function unsubscribeRealtime() {
  if (realtimeChannel) {
    sb?.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

// ─── TOAST NOTIFICATION ───────────────────────────────────────────────────────
function showToast(msg) {
  const existing = document.querySelector('.fs-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'fs-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('fs-toast-show'), 10);
  setTimeout(() => { t.classList.remove('fs-toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── BUDDY STATUS ─────────────────────────────────────────────────────────────
async function loadBuddyProfiles() {
  if (!authState.user) return [];
  const { data } = await sb.from('profiles')
    .select('*')
    .neq('id', authState.user.id);
  return data || [];
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function renderAuthScreen() {
  return `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">
          <div class="logo-icon" style="width:40px;height:40px;border-radius:12px">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" fill="white"/>
              <circle cx="3" cy="4" r="1.5" fill="white" opacity="0.6"/>
              <circle cx="13" cy="4" r="1.5" fill="white" opacity="0.6"/>
              <circle cx="3" cy="12" r="1.5" fill="white" opacity="0.4"/>
              <circle cx="13" cy="12" r="1.5" fill="white" opacity="0.4"/>
            </svg>
          </div>
          <span style="font-size:20px;font-weight:500;color:var(--text)">FlowSpace</span>
        </div>
        <p style="font-size:13.5px;color:var(--text-2);margin-bottom:24px;text-align:center">Sign in to sync with your buddy</p>

        <div id="auth-error" style="display:none;font-size:12.5px;color:#a32d2d;background:#fce8e8;padding:8px 12px;border-radius:var(--radius);margin-bottom:12px"></div>

        <div id="auth-tabs" style="display:flex;gap:4px;background:var(--bg-2);border-radius:var(--radius);padding:3px;margin-bottom:20px">
          <button class="auth-tab active" id="tab-signin" onclick="switchAuthTab('signin')">Sign in</button>
          <button class="auth-tab" id="tab-signup" onclick="switchAuthTab('signup')">Create account</button>
        </div>

        <div id="auth-signin">
          <input class="modal-input" id="signin-email" type="email" placeholder="Email" style="margin-bottom:8px"/>
          <input class="modal-input" id="signin-password" type="password" placeholder="Password" style="margin-bottom:16px"
            onkeydown="if(event.key==='Enter') handleSignIn()"/>
          <button class="btn btn-primary" onclick="handleSignIn()" style="width:100%;justify-content:center">Sign in</button>
        </div>

        <div id="auth-signup" style="display:none">
          <input class="modal-input" id="signup-name" type="text" placeholder="Your name" style="margin-bottom:8px"/>
          <input class="modal-input" id="signup-email" type="email" placeholder="Email" style="margin-bottom:8px"/>
          <input class="modal-input" id="signup-password" type="password" placeholder="Password (min 6 chars)" style="margin-bottom:16px"
            onkeydown="if(event.key==='Enter') handleSignUp()"/>
          <button class="btn btn-primary" onclick="handleSignUp()" style="width:100%;justify-content:center">Create account</button>
        </div>

        <p style="font-size:12px;color:var(--text-3);text-align:center;margin-top:16px">
          Share your account email with your buddy so they can join FlowSpace
        </p>
      </div>
    </div>
  `;
}

function switchAuthTab(tab) {
  document.getElementById('auth-signin').style.display = tab === 'signin' ? '' : 'none';
  document.getElementById('auth-signup').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
}

async function handleSignIn() {
  const email    = document.getElementById('signin-email')?.value.trim();
  const password = document.getElementById('signin-password')?.value;
  const errEl    = document.getElementById('auth-error');
  if (!email || !password) { showAuthError('Please fill in all fields.'); return; }
  try {
    await signInWithEmail(email, password);
  } catch(e) {
    showAuthError(e.message);
  }
}

async function handleSignUp() {
  const name     = document.getElementById('signup-name')?.value.trim();
  const email    = document.getElementById('signup-email')?.value.trim();
  const password = document.getElementById('signup-password')?.value;
  if (!email || !password) { showAuthError('Please fill in all fields.'); return; }
  try {
    await signUpWithEmail(email, password, name);
    showAuthError('Check your email to confirm your account, then sign in!', true);
    switchAuthTab('signin');
  } catch(e) {
    showAuthError(e.message);
  }
}

function showAuthError(msg, success = false) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.style.display = 'block';
  el.style.background = success ? '#e1f5ee' : '#fce8e8';
  el.style.color = success ? '#0f6e56' : '#a32d2d';
  el.textContent = msg;
}

function isSignedIn() { return !!authState.user; }
