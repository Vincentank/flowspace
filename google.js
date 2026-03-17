// ─── GOOGLE INTEGRATION ───────────────────────────────────────────────────────
// Replace this with your actual Google OAuth Client ID from Google Cloud Console
const GOOGLE_CLIENT_ID = '357500213785-l0dljkqp43d7uur1gge4ml2c5vd630a8.apps.googleusercontent.com';
const REDIRECT_URI = 'https://flowspace-delta.vercel.app';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

const googleState = {
  accessToken: localStorage.getItem('fs_google_token') || null,
  tokenExpiry: parseInt(localStorage.getItem('fs_google_expiry') || '0'),
  calendarEvents: [],
  todayEvents: [],
  photos: {},
  connected: false,
  loading: false,
};

function isGoogleConnected() {
  return googleState.accessToken && Date.now() < googleState.tokenExpiry;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function connectGoogle() {
  if (GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
    alert('Please add your Google Client ID to google.js first.');
    return;
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    state: 'google_auth',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function disconnectGoogle() {
  googleState.accessToken = null;
  googleState.tokenExpiry = 0;
  googleState.calendarEvents = [];
  googleState.todayEvents = [];
  googleState.photos = {};
  googleState.connected = false;
  localStorage.removeItem('fs_google_token');
  localStorage.removeItem('fs_google_expiry');
  renderPage(currentPage);
}

function handleGoogleCallback() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  const expiresIn = params.get('expires_in');
  const state = params.get('state');
  if (token && state === 'google_auth') {
    googleState.accessToken = token;
    googleState.tokenExpiry = Date.now() + parseInt(expiresIn) * 1000;
    localStorage.setItem('fs_google_token', token);
    localStorage.setItem('fs_google_expiry', googleState.tokenExpiry);
    window.history.replaceState(null, '', window.location.pathname);
    googleState.connected = true;
    loadGoogleData();
  }
}

// ─── FETCH HELPERS ────────────────────────────────────────────────────────────
async function gFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${googleState.accessToken}` }
  });
  if (!res.ok) {
    if (res.status === 401) disconnectGoogle();
    throw new Error(`Google API error: ${res.status}`);
  }
  return res.json();
}

// ─── LOAD ALL DATA ────────────────────────────────────────────────────────────
async function loadGoogleData() {
  if (!isGoogleConnected()) return;
  googleState.loading = true;
  try {
    await fetchCalendarEvents();
  } catch (e) {
    console.error('Google load error:', e);
  }
  googleState.loading = false;
  if (currentPage === 'home' || currentPage === 'calendar' || currentPage === 'journal') {
    renderPage(currentPage);
  }
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
async function fetchCalendarEvents(daysAhead = 30) {
  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 86400000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  const data = await gFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`
  );
  googleState.calendarEvents = (data.items || []).map(e => ({
    id: e.id,
    title: e.summary || 'Untitled event',
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: !e.start?.dateTime,
    color: e.colorId ? gcalColor(e.colorId) : '#1a1a1a',
    location: e.location || '',
    description: e.description || '',
  }));
  // filter today
  const todayStr = fmtDateKey(new Date());
  googleState.todayEvents = googleState.calendarEvents.filter(e =>
    (e.start || '').startsWith(todayStr)
  );
}

async function fetchEventsForDate(dateStr) {
  if (!isGoogleConnected()) return [];
  const start = new Date(dateStr + 'T00:00:00');
  const end   = new Date(dateStr + 'T23:59:59');
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  });
  try {
    const data = await gFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`
    );
    return (data.items || []).map(e => ({
      id: e.id,
      title: e.summary || 'Untitled event',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      allDay: !e.start?.dateTime,
      color: e.colorId ? gcalColor(e.colorId) : '#1a1a1a',
    }));
  } catch { return []; }
}

function gcalColor(id) {
  const map = { '1':'#a4bdfc','2':'#7ae7bf','3':'#dbadff','4':'#ff887c',
                '5':'#fbd75b','6':'#ffb878','7':'#46d6db','8':'#e1e1e1',
                '9':'#5484ed','10':'#51b749','11':'#dc2127' };
  return map[id] || '#1a1a1a';
}

function fmtEventTime(isoStr) {
  if (!isoStr || !isoStr.includes('T')) return 'All day';
  return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── GOOGLE PHOTOS PICKER API ─────────────────────────────────────────────────
// Stores picker-selected photos per journal entry date
// pickerPhotos[dateStr] = [{ id, url, thumb, filename }, ...]

function loadPickerAPI() {
  return new Promise((resolve) => {
    if (window.google?.picker) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      gapi.load('picker', resolve);
    };
    document.head.appendChild(script);
  });
}

async function openGooglePhotosPicker(dateStr) {
  if (!isGoogleConnected()) {
    alert('Please connect Google first.');
    return;
  }
  await loadPickerAPI();

  const picker = new google.picker.PickerBuilder()
    .addView(new google.picker.PhotosView()
      .setType(google.picker.PhotosView.Type.PHOTO_ALBUMS))
    .addView(google.picker.ViewId.PHOTOS)
    .setOAuthToken(googleState.accessToken)
    .setCallback((data) => handlePickerCallback(data, dateStr))
    .setTitle('Select photos for this day')
    .build();
  picker.setVisible(true);
}

function handlePickerCallback(data, dateStr) {
  if (data.action !== google.picker.Action.PICKED) return;
  const entry = getEntry(dateStr);
  entry.photos = entry.photos || [];

  data.docs.forEach(doc => {
    // Picker returns a URL we can use directly
    const url = doc.url || doc[google.picker.Document.URL];
    const thumb = doc.thumbnailUrl || url;
    const name = doc.name || doc[google.picker.Document.NAME] || 'photo';
    // avoid duplicates
    if (!entry.photos.find(p => p.id === doc.id)) {
      entry.photos.push({ id: doc.id, url, thumb, filename: name, source: 'google' });
    }
  });

  saveJournal();
  renderPage('journal');
  setTimeout(() => afterJournalEntryRender(dateStr), 50);
}

// ─── CALENDAR PAGE ────────────────────────────────────────────────────────────
function renderCalendar() {
  if (!isGoogleConnected()) {
    return renderGoogleConnect('Calendar', 'See your Google Calendar events alongside your tasks.');
  }

  const today = new Date();
  const month = journalState?.calMonth !== undefined ? journalState.calMonth : today.getMonth();
  const year  = journalState?.calYear  !== undefined ? journalState.calYear  : today.getFullYear();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayKey  = fmtDateKey(today);

  // group events by date
  const byDate = {};
  googleState.calendarEvents.forEach(e => {
    const key = (e.start || '').slice(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(e);
  });

  let cells = '';
  for (let i = 0; i < firstDay.getDay(); i++) cells += `<div class="gcal-cell gcal-blank"></div>`;
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === todayKey;
    const dayEvents = byDate[dateStr] || [];
    cells += `
      <div class="gcal-cell ${isToday ? 'gcal-today' : ''}">
        <span class="gcal-day-num ${isToday ? 'gcal-today-num' : ''}">${d}</span>
        ${dayEvents.slice(0, 3).map(e => `
          <div class="gcal-event-pill" style="border-left:3px solid ${e.color}">
            <span class="gcal-event-time">${fmtEventTime(e.start)}</span>
            <span class="gcal-event-title">${e.title}</span>
          </div>
        `).join('')}
        ${dayEvents.length > 3 ? `<div class="gcal-more">+${dayEvents.length-3}</div>` : ''}
      </div>
    `;
  }

  // upcoming list
  const upcoming = googleState.calendarEvents.slice(0, 8);

  return `
    <p class="greeting">Calendar</p>
    <p class="subgreeting">${googleState.calendarEvents.length} upcoming events from Google Calendar</p>

    <div class="gcal-layout">
      <div class="gcal-main panel">
        <div class="cal-header">
          <button class="cal-nav" onclick="shiftCalMonth(-1)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
          <span class="cal-month-label">${monthName}</span>
          <button class="cal-nav" onclick="shiftCalMonth(1)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2L10 7L5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="cal-dow">
          ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-dow-label">${d}</div>`).join('')}
        </div>
        <div class="gcal-grid">${cells}</div>
      </div>

      <div class="gcal-sidebar">
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Upcoming</span>
            <button class="panel-action" onclick="loadGoogleData()">Refresh</button>
          </div>
          ${upcoming.length === 0
            ? `<div class="empty-state">No upcoming events</div>`
            : upcoming.map(e => `
              <div class="upcoming-event">
                <div class="upcoming-dot" style="background:${e.color}"></div>
                <div class="upcoming-body">
                  <div class="upcoming-title">${e.title}</div>
                  <div class="upcoming-time">${fmtEventTime(e.start)} ${e.allDay ? '· All day' : ''}</div>
                  ${e.location ? `<div class="upcoming-loc">${e.location}</div>` : ''}
                </div>
              </div>
            `).join('')
          }
        </div>

        <div class="panel" style="margin-top:12px">
          <div class="panel-header"><span class="panel-title">Connected account</span></div>
          <div style="font-size:13px;color:var(--text-2);margin-bottom:10px">Google Calendar is linked.</div>
          <button class="btn" style="width:100%;justify-content:center" onclick="disconnectGoogle()">Disconnect</button>
        </div>
      </div>
    </div>
  `;
}

let calPageMonth, calPageYear;
function shiftCalMonth(delta) {
  const today = new Date();
  let m = calPageMonth !== undefined ? calPageMonth : today.getMonth();
  let y = calPageYear  !== undefined ? calPageYear  : today.getFullYear();
  m += delta; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
  calPageMonth = m; calPageYear = y;
  renderPage('calendar');
}

// ─── GOOGLE CONNECT SCREEN ────────────────────────────────────────────────────
function renderGoogleConnect(feature, desc) {
  return `
    <div class="placeholder">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--bg-2);border:0.5px solid var(--border);display:flex;align-items:center;justify-content:center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      </div>
      <p class="placeholder-title">Connect Google ${feature}</p>
      <p class="placeholder-sub">${desc}</p>
      <button class="btn btn-primary" style="margin-top:4px" onclick="connectGoogle()">Connect with Google</button>
    </div>
  `;
}

// ─── HOME DASHBOARD EVENTS WIDGET ─────────────────────────────────────────────
function renderTodayEventsWidget() {
  if (!isGoogleConnected()) {
    return `
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Today's events</span></div>
        <div style="padding:12px 0;text-align:center">
          <p style="font-size:13px;color:var(--text-3);margin-bottom:10px">Connect Google Calendar to see your events here</p>
          <button class="btn" onclick="connectGoogle()">Connect Google</button>
        </div>
      </div>
    `;
  }
  const events = googleState.todayEvents;
  return `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Today's events</span>
        <span class="panel-action">${events.length} events</span>
      </div>
      ${events.length === 0
        ? `<div class="empty-state" style="padding:16px 0">No events today</div>`
        : events.map(e => `
          <div class="upcoming-event">
            <div class="upcoming-dot" style="background:${e.color}"></div>
            <div class="upcoming-body">
              <div class="upcoming-title">${e.title}</div>
              <div class="upcoming-time">${fmtEventTime(e.start)}${e.allDay ? ' · All day' : ''}</div>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;
}

// ─── JOURNAL ENTRY GOOGLE SECTIONS ────────────────────────────────────────────
async function loadJournalGoogleData(dateStr) {
  if (!isGoogleConnected()) return;
  await fetchEventsForDate(dateStr);
  if (journalState.openDate === dateStr) {
    updateJournalGoogleSections(dateStr);
  }
}

function updateJournalGoogleSections(dateStr) {
  const evEl = document.getElementById('journal-gcal-events');
  const phEl = document.getElementById('journal-gphotos');
  if (evEl) evEl.innerHTML = renderJournalEvents(dateStr);
  if (phEl) phEl.innerHTML = renderJournalPhotos(dateStr);
}

function renderJournalEvents(dateStr) {
  if (!isGoogleConnected()) return `<p style="font-size:13px;color:var(--text-3)">Connect Google Calendar to see events.</p>`;
  const events = googleState.calendarEvents.filter(e => (e.start||'').startsWith(dateStr));
  if (!events.length) return `<p style="font-size:13px;color:var(--text-3)">No events on this day.</p>`;
  return events.map(e => `
    <div class="upcoming-event">
      <div class="upcoming-dot" style="background:${e.color}"></div>
      <div class="upcoming-body">
        <div class="upcoming-title">${e.title}</div>
        <div class="upcoming-time">${fmtEventTime(e.start)}</div>
      </div>
    </div>
  `).join('');
}

function renderJournalPhotos(dateStr) {
  const entry = getEntry(dateStr);
  const photos = entry.photos || [];
  const googleConnected = isGoogleConnected();
  return `
    <div class="photo-grid" id="photo-grid-${dateStr}">
      ${photos.map((p, i) => `
        <div class="photo-thumb">
          <img src="${p.thumb || p.url || p}" alt="${p.filename || 'photo'}" loading="lazy"/>
          <button class="photo-remove" onclick="removePhoto('${dateStr}', ${i})">×</button>
        </div>
      `).join('')}

      <!-- Manual upload from device -->
      <label class="photo-add-btn" title="Upload from device">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <input type="file" accept="image/*" multiple style="display:none"
          onchange="handlePhotos('${dateStr}', this)"/>
      </label>

      <!-- Google Photos Picker -->
      ${googleConnected ? `
        <button class="photo-add-btn photo-google-btn" title="Pick from Google Photos"
          onclick="openGooglePhotosPicker('${dateStr}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </button>
      ` : `
        <button class="photo-add-btn photo-google-btn" title="Connect Google to pick photos"
          onclick="connectGoogle()" style="opacity:0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </button>
      `}
    </div>
    <p style="font-size:11px;color:var(--text-3);margin-top:8px">
      + from device &nbsp;·&nbsp; G pick from Google Photos
    </p>
  `;
}

// ─── INIT: handle OAuth callback on page load ─────────────────────────────────
function initGoogle() {
  handleGoogleCallback();
  if (isGoogleConnected()) {
    googleState.connected = true;
    loadGoogleData();
  }
}
