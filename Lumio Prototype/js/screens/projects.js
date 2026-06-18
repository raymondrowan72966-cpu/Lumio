/* ============================================================
   PROJECTS PAGE
   ============================================================ */

const TYPE_BADGE = {
  Course: 'pill-indigo',
  Microlearning: 'pill-orange',
};
const STATUS_BADGE = {
  Draft: 'pill-grey',
  'In Review': 'pill-cyan',
  Published: 'pill-teal',
};

const FOLDER_COLORS = {
  purple: 'var(--violet)',
  orange: 'var(--orange)',
  green:  'var(--teal)',
  teal:   'var(--cyan)',
  pink:   'var(--magenta)',
  // Legacy values from pre-v10 saves
  indigo:   'var(--violet)',
  magenta:  'var(--magenta)',
};

function folderColorVar(color) {
  return FOLDER_COLORS[color] || 'var(--violet)';
}

function renderProjects() {
  const isOwner = isWorkspaceOwner();
  const isTeamFolder = LumioState.currentFolder === '__team__';
  const folder = isTeamFolder ? null : LumioState.folders.find(f => f.id === LumioState.currentFolder);

  let projects = LumioState.projects.filter(p => {
    if (p.deleted) return false;
    // Item 3: admins see only their own projects (owners see all).
    if (!isOwner && p.ownerId && p.ownerId !== LumioState.currentUser.id) return false;
    // Item 4: Team Projects virtual folder.
    if (isTeamFolder) {
      const uid = LumioState.currentUser.id;
      return p.sharedScope === 'team' || (Array.isArray(p.sharedWith) && p.sharedWith.includes(uid));
    }
    if (LumioState.currentFolder && p.folder !== LumioState.currentFolder) return false;
    if (LumioState.typeFilter !== 'All' && p.type !== LumioState.typeFilter) return false;
    if (LumioState.searchQuery && !projectDisplayTitle(p).toLowerCase().includes(LumioState.searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

  const recent = LumioState.projects
    .filter(p => !p.deleted)
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
    .slice(0, 4);

  const content = `
    <header class="app-topbar">
      <div>
        <h2 style="font-size:20px;">${folder ? folder.name : 'All Projects'}</h2>
        <p class="text-sm text-muted">${projects.length} project${projects.length === 1 ? '' : 's'}</p>
      </div>
      <div class="flex items-center gap-12">
        <div class="input-icon-wrap" style="width:240px;">
          <span class="icon">🔍</span>
          <input class="input" id="search-input" placeholder="Search projects..." value="${LumioState.searchQuery}" />
        </div>
        <select class="input" id="type-filter" style="width:160px;">
          <option ${LumioState.typeFilter==='All'?'selected':''}>All</option>
          <option ${LumioState.typeFilter==='Course'?'selected':''}>Course</option>
          <option ${LumioState.typeFilter==='Microlearning'?'selected':''}>Microlearning</option>
        </select>
        <button class="btn btn-ghost" id="import-project-btn" title="Import .lumio backup file">⬆ Import</button>
        <input type="file" id="import-file-input" accept=".lumio" style="display:none;">
        <button class="btn btn-primary" id="create-new-btn">+ Create New</button>
      </div>
    </header>
    <main class="app-content">
      ${ambientBlobs([
        ['var(--pastel-cyan)', '320px', '320px', '-100px', '-80px', null, null],
      ])}
      <div style="position:relative; z-index:1;">

        ${!LumioState.currentFolder && !LumioState.searchQuery ? `
        <h3 class="mb-16" style="font-size:15px;">Continue Working</h3>
        <div style="display:flex; gap:16px; overflow-x:auto; padding-bottom:8px;" class="mb-32">
          ${recent.map(p => continueCard(p)).join('')}
        </div>

        <div class="flex items-center justify-between mb-16">
          <h3 style="font-size:15px;">Folders</h3>
          <button class="btn btn-ghost btn-sm" id="new-folder-btn">+ New Folder</button>
        </div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;" class="mb-32">
          ${teamProjectsChip()}
          ${LumioState.folders.map(f => folderChip(f)).join('')}
        </div>
        ` : `
        <button class="btn btn-ghost btn-sm mb-16" id="back-to-all">← All Projects</button>
        `}

        <h3 class="mb-16" style="font-size:15px;">${folder ? folder.name : (LumioState.searchQuery ? 'Search Results' : `All Projects (${LumioState.projects.filter(p => !p.deleted).length})`)}</h3>
        <div id="projects-grid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:20px;">
          ${projects.length ? projects.map(p => projectCard(p)).join('') : emptyState()}
        </div>
      </div>
    </main>
  `;
  renderShell('projects', content, { largeLogo: true });
  bindProjectsEvents();
}

function continueCard(p) {
  const thumb = cardThumbMedia(p);
  return `
    <div class="card card-premium fade-in" style="min-width:220px; max-width:220px; flex-shrink:0; cursor:pointer; overflow:hidden;" data-open="${p.id}">
      <div style="height:90px; background:${thumb.bg}; position:relative;">
        ${thumb.img}
        <span class="pill ${TYPE_BADGE[p.type]}" style="position:absolute; top:8px; left:8px; z-index:1;">${p.type}</span>
      </div>
      <div style="padding:12px 14px;">
        <div style="font-size:13px; font-weight:600; color:var(--ink-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${projectDisplayTitle(p)}</div>
        <div class="text-sm text-muted" style="font-size:12px;">${relativeEditedLabel(p.lastAccessed)}</div>
      </div>
    </div>
  `;
}

function teamProjectsChip() {
  const uid = LumioState.currentUser.id;
  const count = LumioState.projects.filter(p => !p.deleted && (
    p.sharedScope === 'team' || (Array.isArray(p.sharedWith) && p.sharedWith.includes(uid))
  )).length;
  if (count === 0) return '';
  const active = LumioState.currentFolder === '__team__';
  return `
    <div class="pill" style="background:${active ? 'var(--violet)' : 'var(--surface-0)'}; border:1px solid ${active ? 'var(--violet)' : 'var(--border)'}; cursor:pointer; padding:10px 16px; gap:10px;" data-folder="__team__">
      <span style="font-size:14px;">👥</span>
      <span style="color:${active ? '#fff' : 'var(--ink-900)'}; font-weight:600;">Team Projects</span>
      <span style="color:${active ? 'rgba(255,255,255,0.7)' : 'var(--ink-400)'};">${count}</span>
    </div>
  `;
}


function folderChip(f) {
  const colorVar = folderColorVar(f.color);
  const count = LumioState.projects.filter(p => p.folder === f.id && !p.deleted).length;
  const active = LumioState.currentFolder === f.id;
  return `
    <div class="pill" style="background:${active ? colorVar : 'var(--surface-0)'}; border:1px solid ${active ? colorVar : 'var(--border)'}; cursor:pointer; padding:10px 16px; gap:10px;" data-folder="${f.id}">
      <span style="width:8px; height:8px; border-radius:50%; background:${active ? '#fff' : colorVar}; display:inline-block;"></span>
      <span style="color:${active ? '#fff' : 'var(--ink-900)'}; font-weight:600;">${f.name}</span>
      <span style="color:${active ? 'rgba(255,255,255,0.7)' : 'var(--ink-400)'};">${count}</span>
      <span class="folder-menu-btn" data-folder-menu="${f.id}" style="margin-left:4px; color:${active ? 'rgba(255,255,255,0.7)' : 'var(--ink-400)'}; padding:0 2px;">⋯</span>
    </div>
  `;
}

function projectCard(p) {
  const thumb = cardThumbMedia(p);
  return `
    <div class="card card-premium fade-in project-card" style="overflow:hidden; position:relative;" data-id="${p.id}">
      <div class="thumb" data-open="${p.id}" style="height:140px; background:${thumb.bg}; position:relative; cursor:pointer; display:flex; align-items:center; justify-content:center; overflow:hidden;">
        ${thumb.img}
        ${thumb.heroSrc ? '' : '<div class="mesh-bg" style="opacity:0.35;"></div>'}
        <span class="pill ${TYPE_BADGE[p.type]}" style="position:absolute; top:10px; left:10px; z-index:1;">${p.type}</span>
        <span class="pill ${STATUS_BADGE[p.status]}" style="position:absolute; top:10px; right:10px; z-index:1;">${p.status}</span>
        ${thumb.heroSrc ? '' : `<span style="font-size:38px; opacity:0.55; position:relative; z-index:1;">${p.type === 'Course' ? '📘' : '⚡'}</span>`}
        <button class="btn-icon dup-icon" data-dup="${p.id}" title="Duplicate"
          style="position:absolute; bottom:10px; right:10px; opacity:0; transition:opacity .15s; background:rgba(255,255,255,0.9); z-index:1;">⧉</button>
      </div>
      <div style="padding:14px 16px;">
        <div class="flex justify-between items-start gap-8">
          <div style="min-width:0; cursor:pointer;" data-open="${p.id}">
            <div style="font-size:14px; font-weight:600; color:var(--ink-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${projectDisplayTitle(p)}">${projectDisplayTitle(p)}</div>
            <div class="text-sm text-muted mt-8">${p.type} · ${relativeEditedLabel(p.lastAccessed)}</div>
          </div>
          <button class="btn-icon" data-menu="${p.id}" title="More">⋯</button>
        </div>
        <div class="mt-16" style="display:flex; align-items:center; gap:8px;">
          <div style="flex:1; height:6px; background:var(--border); border-radius:99px; overflow:hidden;">
            <div style="width:${p.health}%; height:100%; background:${p.health >= 80 ? 'var(--teal)' : p.health >= 60 ? 'var(--orange)' : 'var(--magenta)'};"></div>
          </div>
          <span class="text-sm text-muted" title="Lumio Health Score — based on objective alignment, content variety & accessibility">${p.health}</span>
        </div>
      </div>
    </div>
    <style>.project-card:hover .dup-icon{opacity:1 !important;}</style>
  `;
}

function emptyState() {
  if (LumioState.searchQuery) {
    return `
      <div class="text-center" style="grid-column:1/-1; padding:60px 20px;">
        <div style="font-size:40px;">🔍</div>
        <h3 class="mt-16" style="font-size:16px;">No projects match "${LumioState.searchQuery}"</h3>
        <p class="text-sm text-muted mt-8">Try a different search term or clear your filters.</p>
      </div>`;
  }
  return `
    <div class="text-center" style="grid-column:1/-1; padding:60px 20px;">
      <div style="font-size:48px;">🎨</div>
      <h3 class="mt-16" style="font-size:18px;">This space is empty — for now</h3>
      <p class="text-sm text-muted mt-8" style="max-width:380px; margin:8px auto 0;">
        Create your first project, or drag existing projects here to organize your workspace.
      </p>
      <button class="btn btn-primary mt-24" id="empty-create-btn">+ Create New</button>
    </div>`;
}

/* ---------------- RECENT ---------------- */
const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function renderRecent() {
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const recent = LumioState.projects
    .filter(p => !p.deleted && p.lastAccessed && p.lastAccessed >= cutoff)
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

  const content = `
    <header class="app-topbar">
      <div>
        <h2 style="font-size:20px;">Recent</h2>
        <p class="text-sm text-muted">${recent.length} project${recent.length === 1 ? '' : 's'}</p>
      </div>
    </header>
    <main class="app-content">
      ${ambientBlobs([
        ['var(--pastel-cyan)', '320px', '320px', '-100px', '-80px', null, null],
      ])}
      <div style="position:relative; z-index:1;">
        <div id="projects-grid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:20px;">
          ${recent.length ? recent.map(p => projectCard(p)).join('') : emptyRecentState()}
        </div>
      </div>
    </main>
  `;
  renderShell('recent', content, { largeLogo: true });
  bindProjectsEvents();
}

function emptyRecentState() {
  return `
    <div class="text-center" style="grid-column:1/-1; padding:60px 20px;">
      <div style="font-size:48px;">⏱️</div>
      <h3 class="mt-16" style="font-size:18px;">Nothing opened recently</h3>
      <p class="text-sm text-muted mt-8" style="max-width:380px; margin:8px auto 0;">
        Projects you open will show up here, most recent first.
      </p>
    </div>`;
}

/* ---------------- TRASH ---------------- */
function renderTrash() {
  const trashed = LumioState.projects
    .filter(p => p.deleted)
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

  const content = `
    <header class="app-topbar">
      <div>
        <h2 style="font-size:20px;">Trash</h2>
        <p class="text-sm text-muted">${trashed.length} project${trashed.length === 1 ? '' : 's'}</p>
      </div>
    </header>
    <main class="app-content">
      ${ambientBlobs([
        ['var(--pastel-cyan)', '320px', '320px', '-100px', '-80px', null, null],
      ])}
      <div style="position:relative; z-index:1;">
        <div id="trash-grid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:20px;">
          ${trashed.length ? trashed.map(p => trashCard(p)).join('') : emptyTrashState()}
        </div>
      </div>
    </main>
  `;
  renderShell('trash', content, { largeLogo: true });
  bindTrashEvents();
}

function trashCard(p) {
  const thumb = cardThumbMedia(p);
  return `
    <div class="card card-premium fade-in project-card" style="overflow:hidden; position:relative;" data-id="${p.id}">
      <div class="thumb" style="height:140px; background:${thumb.bg}; position:relative; overflow:hidden; opacity:0.6;">
        ${thumb.img}
        ${thumb.heroSrc ? '' : '<div class="mesh-bg" style="opacity:0.35;"></div>'}
        <span class="pill ${TYPE_BADGE[p.type]}" style="position:absolute; top:10px; left:10px; z-index:1;">${p.type}</span>
        ${thumb.heroSrc ? '' : `<span style="font-size:38px; opacity:0.55; position:relative; z-index:1; display:flex; align-items:center; justify-content:center; height:100%;">${p.type === 'Course' ? '📘' : '⚡'}</span>`}
      </div>
      <div style="padding:14px 16px;">
        <div style="font-size:14px; font-weight:600; color:var(--ink-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${projectDisplayTitle(p)}">${projectDisplayTitle(p)}</div>
        <div class="text-sm text-muted mt-8">${p.type} · ${relativeEditedLabel(p.lastAccessed)}</div>
        <div class="flex gap-12 mt-16">
          <button class="btn btn-secondary btn-sm restore-btn" data-restore="${p.id}" style="flex:1;">↩️ Restore</button>
          <button class="btn btn-secondary btn-sm delete-forever-btn" data-delete-forever="${p.id}" style="flex:1; color:#E5484D;">🗑️ Delete Forever</button>
        </div>
      </div>
    </div>
  `;
}

function emptyTrashState() {
  return `
    <div class="text-center" style="grid-column:1/-1; padding:60px 20px;">
      <div style="font-size:48px;">🗑️</div>
      <h3 class="mt-16" style="font-size:18px;">Trash is empty</h3>
      <p class="text-sm text-muted mt-8" style="max-width:380px; margin:8px auto 0;">
        Deleted projects will appear here and can be restored.
      </p>
    </div>`;
}

function bindTrashEvents() {
  const app = document.getElementById('app');
  app.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      restoreProject(btn.dataset.restore);
    });
  });
  app.querySelectorAll('[data-delete-forever]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteForever(btn.dataset.deleteForever);
    });
  });
}

function restoreProject(id) {
  const p = LumioState.projects.find(x => x.id === id);
  if (!p) return;
  p.deleted = false;
  p.deletedAt = null;
  renderTrash();
  toast(`Restored "${projectDisplayTitle(p)}"`, '↩️');
}

function confirmDeleteForever(id) {
  const p = LumioState.projects.find(x => x.id === id);
  if (!p) return;
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:420px; padding:28px;">
        <h3 style="font-size:18px;">Delete Permanently?</h3>
        <p class="text-sm text-muted mt-8">This project will be permanently removed and cannot be restored.</p>
        <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="cancel-del">Cancel</button>
          <button class="btn" style="background:#E5484D; color:#fff; border-radius:var(--r-pill); padding:12px 22px; font-weight:600; border:none;" id="confirm-del">Delete Forever</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelector('#cancel-del').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirm-del').addEventListener('click', () => {
    deleteProjectForever(id);
    overlay.remove();
    renderTrash();
    toast(`"${projectDisplayTitle(p)}" permanently deleted`, '🗑️');
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function deleteProjectForever(id) {
  const course = LumioState.courses[id];
  if (course && Array.isArray(course.lessons)) {
    course.lessons.forEach(l => { delete LumioState.lessons[l.id]; });
  }
  delete LumioState.courses[id];
  if (LumioState.learnerProgress) delete LumioState.learnerProgress[id];
  if (LumioState.currentCourseId === id) LumioState.currentCourseId = null;
  LumioState.projects = LumioState.projects.filter(x => x.id !== id);
}

/* ---------------- EVENT BINDING ---------------- */
function bindProjectsEvents() {
  const app = document.getElementById('app');

  app.querySelector('#search-input')?.addEventListener('input', (e) => {
    LumioState.searchQuery = e.target.value;
    const cursorPos = e.target.selectionStart;
    renderProjects();
    const newInput = document.getElementById('search-input');
    if (newInput) {
      newInput.focus();
      newInput.setSelectionRange(cursorPos, cursorPos);
    }
  });
  app.querySelector('#type-filter')?.addEventListener('change', (e) => {
    LumioState.typeFilter = e.target.value;
    renderProjects();
  });
  app.querySelector('#create-new-btn')?.addEventListener('click', openCreateNewModal);
  app.querySelector('#empty-create-btn')?.addEventListener('click', openCreateNewModal);
  app.querySelector('#new-folder-btn')?.addEventListener('click', () => openNewFolderModal());
  app.querySelector('#all-projects-chip')?.addEventListener('click', () => {
    LumioState.currentFolder = null; renderProjects();
  });
  app.querySelector('#import-project-btn')?.addEventListener('click', openImportModal);
  app.querySelector('#import-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importProject(file);
    e.target.value = '';
  });
  app.querySelector('#back-to-all')?.addEventListener('click', () => {
    LumioState.currentFolder = null; LumioState.searchQuery = ''; renderProjects();
  });

  app.querySelectorAll('[data-folder]').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.dataset.folderMenu) return;
      LumioState.currentFolder = chip.dataset.folder || null;
      LumioState.searchQuery = '';
      renderProjects();
    });
  });
  app.querySelectorAll('[data-folder-menu]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFolderMenu(btn, btn.dataset.folderMenu);
    });
  });

  app.querySelectorAll('[data-open]').forEach(elx => {
    elx.addEventListener('click', () => openProject(elx.dataset.open));
  });
  app.querySelectorAll('[data-dup]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      duplicateProject(btn.dataset.dup);
    });
  });
  app.querySelectorAll('[data-menu]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openProjectMenu(btn, btn.dataset.menu);
    });
  });
}

function openProject(id) {
  const p = LumioState.projects.find(x => x.id === id);
  if (!p) return;
  p.lastAccessed = Date.now();
  if (p.type === 'Microlearning') {
    toast('Microlearning editor uses the same Builder — opening course view for this prototype', '⚡');
  }
  // ensure a course object exists for this project
  if (!LumioState.courses[id]) {
    const tmpl = cloneCourseTemplate(id);
    tmpl.title = projectDisplayTitle(p);
    LumioState.courses[id] = tmpl;
  }
  LumioState.currentCourseId = id;
  navigate('#/course/' + id);
}

/* ---------------- POPOVER MENUS ---------------- */
function closePopovers() {
  document.querySelectorAll('.popover-menu').forEach(m => m.remove());
}
document.addEventListener('click', closePopovers);

function popoverAt(btn, itemsHtml) {
  closePopovers();
  const rect = btn.getBoundingClientRect();
  const menu = el(`<div class="popover-menu card" style="position:fixed; z-index:300; min-width:190px; padding:6px; top:${rect.bottom + 6}px; left:${Math.min(rect.left, window.innerWidth - 210)}px;">${itemsHtml}</div>`);
  document.body.appendChild(menu);
  menu.addEventListener('click', (e) => e.stopPropagation());
  return menu;
}

function menuItem(label, icon, danger) {
  return `<div class="menu-item" style="padding:9px 12px; border-radius:var(--r-sm); font-size:13px; cursor:pointer; display:flex; align-items:center; gap:10px; color:${danger ? '#E5484D' : 'var(--ink-700)'};"
    onmouseover="this.style.background='${danger ? '#FEECEC' : 'var(--pastel-lavender)'}'" onmouseout="this.style.background='transparent'">
    <span>${icon}</span><span>${label}</span></div>`;
}

function openProjectMenu(btn, id) {
  const p = LumioState.projects.find(x => x.id === id);
  const folderOptions = LumioState.folders.map(f => `<div class="menu-item move-to" data-folder="${f.id}" style="padding:9px 12px 9px 30px; border-radius:var(--r-sm); font-size:13px; cursor:pointer;"
      onmouseover="this.style.background='var(--pastel-lavender)'" onmouseout="this.style.background='transparent'">${f.name}</div>`).join('')
    + `<div class="menu-item move-to" data-folder="" style="padding:9px 12px 9px 30px; border-radius:var(--r-sm); font-size:13px; cursor:pointer;"
      onmouseover="this.style.background='var(--pastel-lavender)'" onmouseout="this.style.background='transparent'">Uncategorized</div>`;

  const menu = popoverAt(btn, `
    <div data-action="rename">${menuItem('Rename', '✏️')}</div>
    <div data-action="duplicate">${menuItem('Duplicate', '⧉')}</div>
    <div data-action="share">${menuItem('Share', '🔗')}</div>
    <div class="move-parent" style="padding:9px 12px; border-radius:var(--r-sm); font-size:13px; cursor:pointer; display:flex; align-items:center; gap:10px;"
      onmouseover="this.style.background='var(--pastel-lavender)'" onmouseout="this.style.background='transparent'">
      <span>📁</span><span>Move to...</span>
    </div>
    <div class="move-options" style="display:none;">${folderOptions}</div>
    <div data-action="preview">${menuItem('Open Learner Preview', '👁️')}</div>
    <div data-action="export">${menuItem('Export Backup (.lumio)', '📦')}</div>
    <div style="height:1px; background:var(--border); margin:4px 0;"></div>
    <div data-action="delete">${menuItem('Delete', '🗑️', true)}</div>
  `);

  menu.querySelector('.move-parent').addEventListener('click', () => {
    const opts = menu.querySelector('.move-options');
    opts.style.display = opts.style.display === 'none' ? 'block' : 'none';
  });
  menu.querySelectorAll('.move-to').forEach(opt => {
    opt.addEventListener('click', () => {
      p.folder = opt.dataset.folder || null;
      closePopovers();
      renderProjects();
      toast(`Moved "${projectDisplayTitle(p)}" to ${opt.dataset.folder ? LumioState.folders.find(f=>f.id===opt.dataset.folder).name : 'Uncategorized'}`, '📁');
    });
  });
  menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
    closePopovers();
    renameProjectInline(id);
  });
  menu.querySelector('[data-action="duplicate"]').addEventListener('click', () => {
    closePopovers();
    duplicateProject(id);
  });
  menu.querySelector('[data-action="preview"]').addEventListener('click', () => {
    closePopovers();
    openLearnerPreviewFor(id, '#/projects');
  });
  menu.querySelector('[data-action="export"]').addEventListener('click', () => {
    closePopovers();
    exportProject(id);
  });
  menu.querySelector('[data-action="share"]').addEventListener('click', () => {
    closePopovers();
    openShareModal(id);
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    closePopovers();
    confirmDeleteProject(id);
  });
}

function renameProjectInline(id) {
  const p = LumioState.projects.find(x => x.id === id);
  const newName = promptModal('Rename project', projectDisplayTitle(p));
  newName.then(name => {
    if (name && name.trim()) {
      p.title = name.trim();
      const course = LumioState.courses[id];
      if (course) course.title = name.trim();
      renderProjects();
      toast('Project renamed', '✏️');
    }
  });
}

function duplicateProject(id) {
  const p = LumioState.projects.find(x => x.id === id);
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = 'p' + Date.now();
  copy.title = projectDisplayTitle(p) + ' (Copy)';
  copy.lastAccessed = Date.now();
  copy.deleted = false;
  copy.deletedAt = null;
  const idx = LumioState.projects.findIndex(x => x.id === id);
  LumioState.projects.splice(idx + 1, 0, copy);
  renderProjects();
  toast(`Duplicated "${projectDisplayTitle(p)}"`, '⧉');
}

function confirmDeleteProject(id) {
  const p = LumioState.projects.find(x => x.id === id);
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:420px; padding:28px;">
        <h3 style="font-size:18px;">Delete "${projectDisplayTitle(p)}"?</h3>
        <p class="text-sm text-muted mt-8">This will move the project to Trash. You can restore it within 30 days.</p>
        <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="cancel-del">Cancel</button>
          <button class="btn" style="background:#E5484D; color:#fff; border-radius:var(--r-pill); padding:12px 22px; font-weight:600; border:none;" id="confirm-del">Delete</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelector('#cancel-del').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirm-del').addEventListener('click', () => {
    p.deleted = true;
    p.deletedAt = Date.now();
    overlay.remove();
    renderProjects();
    toast('Moved to Trash · Undo', '🗑️');
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

/* ---------------- FOLDER MANAGEMENT ---------------- */
function openFolderMenu(btn, folderId) {
  const f = LumioState.folders.find(x => x.id === folderId);
  const menu = popoverAt(btn, `
    <div data-action="edit">${menuItem('Edit Folder', '✏️')}</div>
    <div data-action="delete">${menuItem('Delete Folder', '🗑️', true)}</div>
  `);
  menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
    closePopovers();
    openNewFolderModal(f);
  });
  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    closePopovers();
    confirmDeleteFolder(folderId);
  });
}

function confirmDeleteFolder(folderId) {
  const f = LumioState.folders.find(x => x.id === folderId);
  const count = LumioState.projects.filter(p => p.folder === folderId).length;
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:440px; padding:28px;">
        <h3 style="font-size:18px;">Delete "${f.name}" folder?</h3>
        <p class="text-sm text-muted mt-8">
          ${count > 0 ? `${count} project${count===1?'':'s'} inside will move to <strong>Uncategorized</strong> — they will not be deleted.` : 'This folder is empty.'}
        </p>
        <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="cancel-del">Cancel</button>
          <button class="btn" style="background:#E5484D; color:#fff; border-radius:var(--r-pill); padding:12px 22px; font-weight:600; border:none;" id="confirm-del">Delete Folder</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelector('#cancel-del').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirm-del').addEventListener('click', () => {
    LumioState.projects.forEach(p => { if (p.folder === folderId) p.folder = null; });
    LumioState.folders = LumioState.folders.filter(x => x.id !== folderId);
    if (LumioState.currentFolder === folderId) LumioState.currentFolder = null;
    overlay.remove();
    renderProjects();
    toast('Folder deleted', '🗑️');
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

const FOLDER_COLOR_OPTIONS = [
  { value: 'purple', label: 'Purple', css: 'var(--violet)' },
  { value: 'orange', label: 'Orange', css: 'var(--orange)' },
  { value: 'green',  label: 'Green',  css: 'var(--teal)' },
  { value: 'teal',   label: 'Teal',   css: 'var(--cyan)' },
  { value: 'pink',   label: 'Pink',   css: 'var(--magenta)' },
];

function colorSwatchesHtml(selectedColor) {
  return FOLDER_COLOR_OPTIONS.map(c => `
    <button type="button" class="folder-color-swatch" data-color="${c.value}" title="${c.label}"
      style="width:28px; height:28px; border-radius:50%; background:${c.css}; border:3px solid ${selectedColor === c.value ? '#fff' : 'transparent'};
             box-shadow:${selectedColor === c.value ? `0 0 0 2px ${c.css}` : 'none'}; cursor:pointer; transition:all .12s;"></button>
  `).join('');
}

function openNewFolderModal(existingFolder) {
  const isEdit = !!existingFolder;
  let selectedColor = isEdit ? (existingFolder.color || 'purple') : 'purple';
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:400px; padding:28px;">
        <h3 style="font-size:16px; margin-bottom:16px;">${isEdit ? 'Edit Folder' : 'New Folder'}</h3>
        <input class="input" id="folder-name-input" value="${(isEdit ? existingFolder.name : 'Untitled Folder').replace(/"/g,'&quot;')}" placeholder="Folder name" />
        <div style="margin-top:16px;">
          <div class="text-sm text-muted mb-8">Colour</div>
          <div style="display:flex; gap:10px; align-items:center;" id="folder-color-swatches">
            ${colorSwatchesHtml(selectedColor)}
          </div>
        </div>
        <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="folder-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="folder-modal-save">${isEdit ? 'Save' : 'Create Folder'}</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#folder-name-input');
  input.focus(); input.select();

  overlay.querySelector('#folder-color-swatches').addEventListener('click', (e) => {
    const swatch = e.target.closest('[data-color]');
    if (!swatch) return;
    selectedColor = swatch.dataset.color;
    overlay.querySelector('#folder-color-swatches').innerHTML = colorSwatchesHtml(selectedColor);
  });

  const save = () => {
    const name = input.value.trim();
    if (!name) return;
    if (isEdit) {
      existingFolder.name = name;
      existingFolder.color = selectedColor;
      toast('Folder updated', '✏️');
    } else {
      LumioState.folders.push({ id: 'f' + Date.now(), name, color: selectedColor, icon: '📁' });
      toast('Folder created', '📁');
    }
    overlay.remove();
    renderProjects();
  };

  overlay.querySelector('#folder-modal-save').addEventListener('click', save);
  overlay.querySelector('#folder-modal-cancel').addEventListener('click', () => overlay.remove());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

/* ---------------- GENERIC PROMPT MODAL ---------------- */
function promptModal(title, value) {
  return new Promise((resolve) => {
    const overlay = el(`
      <div class="overlay">
        <div class="modal" style="width:400px; padding:28px;">
          <h3 style="font-size:16px; margin-bottom:16px;">${title}</h3>
          <input class="input" id="prompt-input" value="${value.replace(/"/g,'&quot;')}" />
          <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
            <button class="btn btn-ghost" id="prompt-cancel">Cancel</button>
            <button class="btn btn-primary" id="prompt-ok">Save</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#prompt-input');
    input.focus();
    input.select();
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#prompt-cancel').addEventListener('click', () => close(null));
    overlay.querySelector('#prompt-ok').addEventListener('click', () => close(input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') close(input.value); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
  });
}

/* ---------------- CREATE NEW MODAL ---------------- */
function openCreateNewModal() {
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:640px; padding:36px;">
        <h2 style="font-size:22px;">What would you like to create?</h2>
        <p class="text-sm text-muted mt-8 mb-24">Choose a format, or let Lumio help you decide.</p>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:16px;">
          <div class="card card-pad create-option" data-type="Course" style="cursor:pointer; text-align:center;">
            <div style="font-size:32px;">📘</div>
            <h3 style="font-size:15px; margin-top:12px;">Course</h3>
            <p class="text-sm text-muted mt-8">Structured, multi-lesson experiences — best for 30+ minutes across multiple topics.</p>
          </div>
          <div class="card card-pad create-option" data-type="Microlearning" style="cursor:pointer; text-align:center;">
            <div style="font-size:32px;">⚡</div>
            <h3 style="font-size:15px; margin-top:12px;">Microlearning</h3>
            <p class="text-sm text-muted mt-8">Short, focused content on a single topic — best for 3-10 minutes.</p>
          </div>
          <div class="card card-pad create-option" data-type="ai" style="cursor:pointer; text-align:center; border:1px solid rgba(124,58,237,0.25); background:linear-gradient(135deg, rgba(124,58,237,0.04), rgba(6,182,212,0.04));">
            <div class="ai-spark" style="margin:0 auto;">✨</div>
            <h3 style="font-size:15px; margin-top:12px;">Help Me Decide</h3>
            <p class="text-sm text-muted mt-8">Answer 2 quick questions and Lumio will recommend the best format.</p>
          </div>
        </div>
        <div class="flex justify-end mt-24">
          <button class="btn btn-ghost" id="cancel-create">Cancel</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.create-option').forEach(opt => {
    opt.addEventListener('mouseover', () => opt.style.boxShadow = 'var(--shadow-md)');
    opt.addEventListener('mouseout', () => opt.style.boxShadow = '');
    opt.addEventListener('click', () => {
      overlay.remove();
      if (opt.dataset.type === 'ai') {
        openHelpMeDecide();
      } else {
        startWizard(opt.dataset.type);
      }
    });
  });
  overlay.querySelector('#cancel-create').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function openHelpMeDecide() {
  let step = 0;
  const answers = {};
  const questions = LumioData.decideQuestions;
  const overlay = el(`<div class="overlay"><div class="modal" style="width:520px; padding:36px;" id="hmd-content"></div></div>`);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  function renderStep() {
    const content = overlay.querySelector('#hmd-content');
    if (step < questions.length) {
      const q = questions[step];
      content.innerHTML = `
        <div class="flex gap-6 mb-16">
          ${questions.map((_, i) => `<div style="height:4px; flex:1; border-radius:var(--r-pill); background:${i <= step ? 'var(--gradient-primary)' : 'var(--border)'};"></div>`).join('')}
        </div>
        <div class="ai-spark mb-16">✨</div>
        <h2 style="font-size:20px;">${q.label}</h2>
        <p class="text-sm text-muted mt-8 mb-24">Step ${step + 1} of ${questions.length} — Lumio uses this to recommend Course or Microlearning.</p>
        <div class="flex-col gap-12">
          ${q.options.map(opt => `<button class="btn btn-secondary w-full" data-val="${opt.value}" style="justify-content:flex-start; padding:16px;">${opt.label}</button>`).join('')}
        </div>
      `;
      content.querySelectorAll('[data-val]').forEach(b => b.addEventListener('click', () => {
        answers[q.id] = b.dataset.val; step++; renderStep();
      }));
    } else {
      const rec = LumioData.ai.formatRecommendation(answers);
      content.innerHTML = `
        <div class="ai-spark mb-16">✨</div>
        <h2 style="font-size:20px;">Lumio recommends: <span class="gradient-text">${rec.format}</span></h2>
        <p class="text-sm mt-16" style="line-height:1.7;">${rec.rationale}</p>
        <div class="flex gap-12 mt-32" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="hmd-cancel">Cancel</button>
          <button class="btn btn-primary" id="hmd-go">Start with ${rec.format} →</button>
        </div>
      `;
      content.querySelector('#hmd-cancel').addEventListener('click', () => overlay.remove());
      content.querySelector('#hmd-go').addEventListener('click', () => {
        overlay.remove();
        startWizard(rec.format);
      });
    }
  }
  renderStep();
}

/* ---------------- IMPORT MODAL (Issue 13) ---------------- */
function openImportModal() {
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:480px; padding:28px;">
        <h3 style="font-size:16px; margin-bottom:4px;">Import Project</h3>
        <p class="text-sm text-muted mb-20">Restore a Lumio project from a backup file.</p>

        <div style="margin-bottom:20px; padding:16px; border-radius:var(--r-md); background:var(--surface-0); border:1px solid var(--border);">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400); margin-bottom:10px;">Supported Format</div>
          <div class="flex items-center gap-10" style="margin-bottom:4px;">
            <span style="color:var(--teal); font-weight:700; font-size:15px;">✓</span>
            <span style="font-size:14px; font-weight:600;">.lumio</span>
            <span class="text-sm text-muted">— Lumio project backup</span>
          </div>
        </div>

        <div style="margin-bottom:24px; padding:16px; border-radius:var(--r-md); background:rgba(229,72,77,0.04); border:1px solid rgba(229,72,77,0.15);">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400); margin-bottom:10px;">Not Supported</div>
          ${[
            ['Rise 360 exports', '.zip'],
            ['Storyline exports', '.story / .zip'],
            ['SCORM packages', '.zip'],
            ['xAPI packages', '.zip'],
            ['HTML packages', '.zip'],
          ].map(([label, ext]) => `
            <div class="flex items-center gap-10" style="margin-bottom:6px;">
              <span style="color:#E5484D; font-weight:700; font-size:15px;">✗</span>
              <span style="font-size:13px;">${label}</span>
              <span class="text-sm text-muted">${ext}</span>
            </div>`).join('')}
        </div>

        <div class="flex gap-12" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="import-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="import-modal-choose">Choose .lumio File</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelector('#import-modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#import-modal-choose').addEventListener('click', () => {
    overlay.remove();
    document.querySelector('#import-file-input')?.click();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

/* ---------------- SHARE MODAL (Item 5) ---------------- */
function openShareModal(id) {
  const p = LumioState.projects.find(x => x.id === id);
  if (!p) return;

  const currentScope = p.sharedScope || null;
  const currentPermission = p.sharedPermission || 'view';
  const currentSharedWith = Array.isArray(p.sharedWith) ? p.sharedWith : [];

  const otherUsers = [
    ...LumioState.adminUsers,
    ...(LumioState.currentUser ? [LumioState.currentUser] : []),
  ].filter(u => u.id !== LumioState.currentUser.id);

  const userOptions = otherUsers.map(u =>
    `<option value="${u.id}" ${currentSharedWith.includes(u.id) ? 'selected' : ''}>${u.firstName} ${u.lastName} (${u.email})</option>`
  ).join('');

  const scopeTeam = currentScope === 'team';
  const scopeIndividual = currentScope === 'individual' || (currentSharedWith.length > 0 && currentScope !== 'team');

  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:480px; padding:28px;">
        <h3 style="font-size:16px; margin-bottom:4px;">Share "${projectDisplayTitle(p)}"</h3>
        <p class="text-sm text-muted mb-20">Control who can access this project.</p>

        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
          <label style="display:flex; align-items:flex-start; gap:12px; cursor:pointer; padding:14px; border-radius:var(--r-md); border:2px solid ${scopeTeam ? 'var(--violet)' : 'var(--border)'}; background:${scopeTeam ? 'rgba(124,58,237,0.04)' : 'var(--surface-0)'};" id="scope-team-label">
            <input type="radio" name="share-scope" value="team" ${scopeTeam ? 'checked' : ''} style="margin-top:2px;">
            <div>
              <div style="font-weight:600; font-size:13px;">👥 Share with Team</div>
              <div class="text-sm text-muted mt-4">Visible to all workspace members.</div>
            </div>
          </label>
          <label style="display:flex; align-items:flex-start; gap:12px; cursor:pointer; padding:14px; border-radius:var(--r-md); border:2px solid ${scopeIndividual ? 'var(--violet)' : 'var(--border)'}; background:${scopeIndividual ? 'rgba(124,58,237,0.04)' : 'var(--surface-0)'};" id="scope-individual-label">
            <input type="radio" name="share-scope" value="individual" ${scopeIndividual ? 'checked' : ''} style="margin-top:2px;">
            <div style="flex:1;">
              <div style="font-weight:600; font-size:13px;">👤 Share with Individual</div>
              <div class="text-sm text-muted mt-4">Visible only to you and the selected person.</div>
              <div id="individual-picker" style="margin-top:12px; display:${scopeIndividual ? 'block' : 'none'};">
                ${otherUsers.length > 0 ? `
                  <select class="input" id="share-user-select" style="width:100%; margin-bottom:10px;">
                    <option value="">Select a person…</option>
                    ${userOptions}
                  </select>
                ` : '<p class="text-sm text-muted">No other workspace members yet.</p>'}
              </div>
            </div>
          </label>
        </div>

        <div style="margin-bottom:20px;">
          <div class="text-sm text-muted mb-8">Permission</div>
          <div style="display:flex; gap:8px;">
            ${['view','comment','edit'].map(perm => `
              <label style="flex:1; text-align:center; cursor:pointer; padding:10px 8px; border-radius:var(--r-md); border:2px solid ${currentPermission===perm ? 'var(--violet)' : 'var(--border)'}; background:${currentPermission===perm ? 'rgba(124,58,237,0.06)' : 'var(--surface-0)'}; font-size:13px; font-weight:${currentPermission===perm ? '600' : '400'};" class="perm-label" data-perm="${perm}">
                <input type="radio" name="share-perm" value="${perm}" ${currentPermission===perm ? 'checked' : ''} style="display:none;">
                ${{ view:'👁️ View', comment:'💬 Comment', edit:'✏️ Edit' }[perm]}
              </label>
            `).join('')}
          </div>
        </div>

        <div class="flex gap-12" style="justify-content:space-between; align-items:center;">
          <button class="btn btn-ghost btn-sm" id="share-remove" style="color:#E5484D; ${currentScope ? '' : 'visibility:hidden;'}">Remove sharing</button>
          <div class="flex gap-12">
            <button class="btn btn-ghost" id="share-cancel">Cancel</button>
            <button class="btn btn-primary" id="share-save">Save</button>
          </div>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);

  // Highlight scope options on change
  overlay.querySelectorAll('[name="share-scope"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isTeam = radio.value === 'team';
      const isIndiv = radio.value === 'individual';
      overlay.querySelector('#scope-team-label').style.borderColor = isTeam ? 'var(--violet)' : 'var(--border)';
      overlay.querySelector('#scope-team-label').style.background = isTeam ? 'rgba(124,58,237,0.04)' : 'var(--surface-0)';
      overlay.querySelector('#scope-individual-label').style.borderColor = isIndiv ? 'var(--violet)' : 'var(--border)';
      overlay.querySelector('#scope-individual-label').style.background = isIndiv ? 'rgba(124,58,237,0.04)' : 'var(--surface-0)';
      overlay.querySelector('#individual-picker').style.display = isIndiv ? 'block' : 'none';
    });
  });

  // Highlight permission labels on change
  overlay.querySelectorAll('.perm-label').forEach(lbl => {
    lbl.addEventListener('click', () => {
      overlay.querySelectorAll('.perm-label').forEach(l => {
        const active = l.dataset.perm === lbl.dataset.perm;
        l.style.borderColor = active ? 'var(--violet)' : 'var(--border)';
        l.style.background = active ? 'rgba(124,58,237,0.06)' : 'var(--surface-0)';
        l.style.fontWeight = active ? '600' : '400';
      });
    });
  });

  overlay.querySelector('#share-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#share-remove').addEventListener('click', () => {
    p.sharedScope = null;
    p.sharedWith = [];
    p.sharedPermission = 'view';
    overlay.remove();
    renderProjects();
    toast('Sharing removed', '🔒');
  });
  overlay.querySelector('#share-save').addEventListener('click', () => {
    const scope = overlay.querySelector('[name="share-scope"]:checked')?.value || null;
    const perm = overlay.querySelector('[name="share-perm"]:checked')?.value || 'view';
    const userSel = overlay.querySelector('#share-user-select');

    if (scope === 'team') {
      p.sharedScope = 'team';
      p.sharedWith = [];
    } else if (scope === 'individual') {
      const uid = userSel ? userSel.value : '';
      if (!uid) { toast('Please select a person to share with', '⚠️'); return; }
      p.sharedScope = 'individual';
      p.sharedWith = [uid];
    } else {
      toast('Please select a sharing option', '⚠️'); return;
    }
    p.sharedPermission = perm;
    overlay.remove();
    renderProjects();
    toast(`"${projectDisplayTitle(p)}" shared`, '🔗');
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function startWizard(type) {
  LumioState.wizard = {
    type: type,
    step: 0,
    title: '',
    description: '',
    audience: '',
    duration: '15-30',
    objectives: [],
    heroImage: null,
    theme: 't1',
  };
  navigate('#/wizard');
}
