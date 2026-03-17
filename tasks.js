// ─── TASKS PAGE ───────────────────────────────────────────────────────────────
function renderTasks() {
  const filter = window.taskFilter || 'all';
  const view   = window.taskView   || 'list';
  const filtered = tasks.filter(t => {
    if (filter === 'active')   return !t.done;
    if (filter === 'done')     return t.done;
    if (filter === 'buddy')    return t.assignee === 'Buddy';
    return true;
  });

  return `
    <p class="greeting">Tasks</p>
    <p class="subgreeting">${tasks.filter(t=>!t.done).length} remaining · ${tasks.filter(t=>t.done).length} completed</p>

    <div class="tasks-toolbar">
      <div class="filter-tabs">
        ${['all','active','done','buddy'].map(f => `
          <button class="filter-tab ${filter===f?'active':''}" onclick="setFilter('${f}')">${f.charAt(0).toUpperCase()+f.slice(1)}</button>
        `).join('')}
      </div>
      <div class="view-toggle">
        <button class="view-btn ${view==='list'?'active':''}" onclick="setView('list')" title="List view">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="2" rx="1" fill="currentColor"/><rect x="1" y="6" width="12" height="2" rx="1" fill="currentColor"/><rect x="1" y="10" width="12" height="2" rx="1" fill="currentColor"/></svg>
        </button>
        <button class="view-btn ${view==='board'?'active':''}" onclick="setView('board')" title="Board view">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="5.25" y="1" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="1" width="3.5" height="12" rx="1" fill="currentColor"/></svg>
        </button>
      </div>
      <button class="btn btn-primary" onclick="openModal()" style="margin-left:auto">+ Add task</button>
    </div>

    ${view === 'list' ? renderListView(filtered) : renderBoardView(filtered)}
  `;
}

function renderListView(filtered) {
  if (!filtered.length) return `<div class="empty-state">No tasks here yet.</div>`;
  return `
    <div class="panel" style="padding:0;overflow:hidden">
      ${filtered.map((t,i) => `
        <div class="task-row ${t.done?'task-row-done':''}" id="trow-${t.id}">
          <div class="task-check ${t.done?'done':''}" onclick="toggleTask(${t.id})"></div>
          <div class="task-row-body">
            <span class="task-row-name ${t.done?'done':''}">${t.name}</span>
            <div class="task-row-meta">
              <span class="tag tag-${t.quad}">${quadLabel[t.quad]}</span>
              <span class="meta-pill">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="1.5" width="9" height="8.5" rx="1" stroke="currentColor" stroke-width="1"/><path d="M1 4h9M3.5 1v1.5M7.5 1v1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
                ${t.due}
              </span>
              <span class="meta-pill">
                <div class="avatar-xs ${t.assignee==='Buddy'?'av-buddy':'av-you'}">${t.assignee==='Buddy'?'BU':t.assignee==='Both'?'B2':'YO'}</div>
                ${t.assignee}
              </span>
            </div>
          </div>
          <button class="task-delete" onclick="deleteTask(${t.id})">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2L11 11M11 2L2 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderBoardView(filtered) {
  const cols = [
    { key:'q1', label:'Urgent & Important', color:'#fce8e8', tc:'#a32d2d' },
    { key:'q2', label:'Important',          color:'#e6eefc', tc:'#1a4fa0' },
    { key:'q3', label:'Urgent',             color:'#fef4e0', tc:'#7a4a08' },
    { key:'q4', label:'Later',              color:'var(--bg-2)', tc:'var(--text-3)' },
  ];
  return `
    <div class="board-grid">
      ${cols.map(col => {
        const colTasks = filtered.filter(t => t.quad === col.key);
        return `
          <div class="board-col">
            <div class="board-col-header" style="background:${col.color};color:${col.tc}">
              <span>${col.label}</span>
              <span class="board-count">${colTasks.length}</span>
            </div>
            <div class="board-col-body">
              ${colTasks.length ? colTasks.map(t => `
                <div class="board-card ${t.done?'board-card-done':''}">
                  <div class="board-card-top">
                    <div class="task-check ${t.done?'done':''}" style="margin-top:2px" onclick="toggleTask(${t.id})"></div>
                    <span class="board-card-name ${t.done?'done':''}">${t.name}</span>
                    <button class="task-delete" onclick="deleteTask(${t.id})">
                      <svg width="12" height="12" viewBox="0 0 13 13" fill="none"><path d="M2 2L11 11M11 2L2 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
                    </button>
                  </div>
                  <div class="board-card-meta">
                    <span class="meta-pill">
                      <svg width="10" height="10" viewBox="0 0 11 11" fill="none"><rect x="1" y="1.5" width="9" height="8.5" rx="1" stroke="currentColor" stroke-width="1"/><path d="M1 4h9M3.5 1v1.5M7.5 1v1.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
                      ${t.due}
                    </span>
                    <div class="avatar-xs ${t.assignee==='Buddy'?'av-buddy':'av-you'}" style="margin-left:auto">${t.assignee==='Buddy'?'BU':t.assignee==='Both'?'B2':'YO'}</div>
                  </div>
                </div>
              `).join('') : `<div class="board-empty">No tasks</div>`}
              <button class="board-add" onclick="openModalWithQuad('${col.key}')">+ Add</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ─── MATRIX PAGE ──────────────────────────────────────────────────────────────
function renderMatrix() {
  const quads = [
    { key:'q1', label:'Do First',    sub:'Urgent & Important',     color:'#fce8e8', tc:'#a32d2d', icon:'🔥' },
    { key:'q2', label:'Schedule',    sub:'Important, Not Urgent',  color:'#e6eefc', tc:'#1a4fa0', icon:'📅' },
    { key:'q3', label:'Delegate',    sub:'Urgent, Not Important',  color:'#fef4e0', tc:'#7a4a08', icon:'👋' },
    { key:'q4', label:'Eliminate',   sub:'Not Urgent or Important',color:'var(--bg-2)', tc:'var(--text-3)', icon:'🗑' },
  ];

  return `
    <p class="greeting">Priority Matrix</p>
    <p class="subgreeting">Eisenhower method — focus on what actually matters</p>

    <div class="matrix-axis-wrap">
      <div class="matrix-y-label">
        <span>IMPORTANT</span>
        <div class="matrix-arrow matrix-arrow-v"></div>
      </div>
      <div class="matrix-main">
        <div class="matrix-x-label">
          <div class="matrix-arrow matrix-arrow-h"></div>
          <span>URGENT</span>
        </div>
        <div class="matrix-grid">
          ${quads.map(q => {
            const qtasks = tasks.filter(t => t.quad === q.key && !t.done);
            return `
              <div class="matrix-quad" style="--qc:${q.color};--qt:${q.tc}">
                <div class="matrix-quad-header">
                  <span class="matrix-quad-icon">${q.icon}</span>
                  <div>
                    <div class="matrix-quad-label">${q.label}</div>
                    <div class="matrix-quad-sub">${q.sub}</div>
                  </div>
                  <span class="matrix-count">${qtasks.length}</span>
                </div>
                <div class="matrix-quad-tasks">
                  ${qtasks.slice(0,5).map(t => `
                    <div class="matrix-task">
                      <div class="task-check ${t.done?'done':''}" style="width:14px;height:14px;flex-shrink:0" onclick="toggleTask(${t.id}); renderPage('matrix')"></div>
                      <span class="matrix-task-name">${t.name}</span>
                      <span class="matrix-task-due">${t.due}</span>
                    </div>
                  `).join('') || `<div class="matrix-empty">All clear</div>`}
                  ${qtasks.length > 5 ? `<div class="matrix-more">+${qtasks.length-5} more</div>` : ''}
                </div>
                <button class="matrix-add-btn" onclick="openModalWithQuad('${q.key}')">+ Add task</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function setFilter(f) { window.taskFilter = f; renderPage('tasks'); }
function setView(v)   { window.taskView = v;   renderPage('tasks'); }

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderPage(currentPage);
}

function openModalWithQuad(quad) {
  openModal();
  setTimeout(() => {
    const sel = document.getElementById('task-quad');
    if (sel) sel.value = quad;
  }, 50);
}
