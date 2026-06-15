/* ============================================================
   LUMIO PROTOTYPE — APP SHELL, ROUTER, STATE
   ============================================================ */

const LumioState = {
  projects: JSON.parse(JSON.stringify(LumioData.projects)),
  folders: JSON.parse(JSON.stringify(LumioData.folders)),
  currentFolder: null, // null = All Projects
  searchQuery: '',
  typeFilter: 'All',

  // wizard draft
  wizard: null,

  // courses created (id -> course object)
  // c1 is the default "scratch" course used by the Course Wizard; p1/p2/p7
  // are the pre-populated client demonstration courses (see
  // LumioData.demoCourses) so opening those projects shows full content
  // instead of a generic clone of courseTemplate.
  courses: {
    c1: JSON.parse(JSON.stringify(LumioData.courseTemplate)),
    p1: JSON.parse(JSON.stringify(LumioData.demoCourses.p1)),
    p2: JSON.parse(JSON.stringify(LumioData.demoCourses.p2)),
    p7: JSON.parse(JSON.stringify(LumioData.demoCourses.p7)),
  },

  // lessons content store (lessonId -> blocks array)
  lessons: {
    l1: JSON.parse(JSON.stringify(LumioData.sampleLessonBlocks)),
    l2: JSON.parse(JSON.stringify(LumioData.demoLessons.l2)),
    l3: JSON.parse(JSON.stringify(LumioData.demoLessons.l3)),
    ws1: JSON.parse(JSON.stringify(LumioData.demoLessons.ws1)),
    ws2: JSON.parse(JSON.stringify(LumioData.demoLessons.ws2)),
    ws3: JSON.parse(JSON.stringify(LumioData.demoLessons.ws3)),
    f1a: JSON.parse(JSON.stringify(LumioData.demoLessons.f1a)),
    f1b: JSON.parse(JSON.stringify(LumioData.demoLessons.f1b)),
    f1c: JSON.parse(JSON.stringify(LumioData.demoLessons.f1c)),
  },

  currentCourseId: 'c1',
  currentLessonId: 'l1',

  // learner preview runtime state
  learnerProgress: {}, // courseId -> { completedLessons, kcAnswers, score }
  learnerPreview: null, // { returnTo } — set when entering preview, used by Exit Preview

  // signed-in user profile + account security
  currentUser: {
    id: 'u-owner',
    firstName: 'Jordan',
    lastName: 'Reyes',
    email: 'jordan@lumio.app',
    avatar: null, // data URL, or null for initials avatar
    role: 'owner', // 'owner' | 'admin'
    dateJoined: Date.now() - 120 * 24 * 3600 * 1000,
    lastLogin: Date.now(),
    password: 'lumio123', // prototype-only stand-in for a hashed password
    status: 'active', // 'active' | 'disabled'
  },

  // workspace system info (Workspace Owner only)
  workspace: {
    systemInfo: {
      platformVersion: '1.0.0',
      buildNumber: '2026.06.15',
      databaseVersion: 'Prototype (local storage)',
      installationDate: Date.now() - 180 * 24 * 3600 * 1000,
      licenseInfo: 'Unlicensed (prototype)', // future-ready: license key/plan details
    },
  },

  // other workspace members managed alongside the signed-in user (any role)
  adminUsers: [
    {
      id: 'u-admin1',
      firstName: 'Taylor',
      lastName: 'Brooks',
      email: 'taylor@lumio.app',
      avatar: null,
      role: 'admin',
      status: 'active', // 'active' | 'disabled'
    },
  ],

  // pending workspace invitations
  invitations: [],
};

/* ---------------- ROLES & PERMISSIONS ---------------- */
const ROLE_LABELS = { owner: 'Owner', admin: 'Admin' };

function isWorkspaceOwner() {
  return LumioState.currentUser.role === 'owner';
}
function canAccessWorkspaceSettings() { return isWorkspaceOwner(); }
function canManageUsers() { return isWorkspaceOwner(); }
function canInviteAdministrators() { return isWorkspaceOwner(); }

// Returns every workspace member (the signed-in user plus all other users),
// used for rendering the Users tab and for the multi-owner safeguard checks.
function allWorkspaceUsers() {
  return [LumioState.currentUser, ...LumioState.adminUsers];
}

// Counts how many workspace members currently hold the Owner role. Used to
// guard against removing, demoting, or disabling the last remaining Owner.
function workspaceOwnerCount() {
  return allWorkspaceUsers().filter(u => u.role === 'owner').length;
}

// Returns the initials + display name + avatar for the signed-in user,
// used everywhere the current user's identity is shown (sidebar, profile).
function currentUserDisplayName() {
  const u = LumioState.currentUser;
  return `${u.firstName} ${u.lastName}`.trim();
}
function currentUserInitials() {
  const u = LumioState.currentUser;
  return ((u.firstName[0] || '') + (u.lastName[0] || '')).toUpperCase();
}

// Renders the shared avatar badge: an uploaded photo if present, otherwise
// initials on the gradient badge. Used in the sidebar and Profile page.
function avatarHtml(user, size) {
  const sizeStyle = size ? `width:${size}px; height:${size}px; font-size:${Math.round(size * 0.38)}px;` : '';
  if (user.avatar) {
    return `<div class="avatar" style="${sizeStyle} background:none; padding:0; overflow:hidden;">
      <img src="${user.avatar}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:50%; display:block;" />
    </div>`;
  }
  const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase();
  return `<div class="avatar" style="${sizeStyle}">${initials}</div>`;
}

// Formats a timestamp as "June 15, 2026" for read-only account fields.
function formatDateLong(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ---------------- ID GENERATION ---------------- */
// Generates a globally-unique id with the given prefix (e.g. 'l' for lessons,
// 'a' for assessments, 'c'/'p' for courses/projects). Combines a timestamp,
// random suffix, and incrementing counter so ids never collide even when
// generated in rapid succession (e.g. mapping over several blueprint items
// in the same millisecond).
let __lumioIdCounter = 0;
function generateUniqueId(prefix) {
  __lumioIdCounter += 1;
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + __lumioIdCounter.toString(36);
}

/* ---------------- PERSISTENCE ---------------- */
const LUMIO_STORAGE_KEY = 'lumio.state';
const LUMIO_STATE_VERSION = 7;

// Keys of LumioState that should be persisted/restored across sessions.
const LUMIO_PERSISTED_KEYS = [
  'projects', 'folders', 'currentFolder', 'searchQuery', 'typeFilter',
  'wizard', 'courses', 'lessons', 'currentCourseId', 'currentLessonId',
  'learnerProgress', 'learnerPreview',
  'currentUser', 'workspace', 'adminUsers', 'invitations',
];

function saveLumioState() {
  try {
    const snapshot = {};
    LUMIO_PERSISTED_KEYS.forEach(key => { snapshot[key] = LumioState[key]; });
    const record = {
      version: LUMIO_STATE_VERSION,
      savedAt: Date.now(),
      hash: location.hash,
      state: snapshot,
    };
    localStorage.setItem(LUMIO_STORAGE_KEY, JSON.stringify(record));
  } catch (e) {
    console.warn('Lumio: could not save state', e);
  }
}

// Migrates an older saved record's `state` payload up to LUMIO_STATE_VERSION.
function migrateLumioState(record) {
  let state = record.state || {};
  let version = record.version || 0;

  if (version < 2) {
    // v2 introduces Projects/Recent/Trash separation: projects gain
    // `lastAccessed` (for Recent sorting) and `deleted`/`deletedAt` (for Trash).
    (state.projects || []).forEach((p, i) => {
      if (p.lastAccessed === undefined) p.lastAccessed = Date.now() - i * 3600 * 1000;
      if (p.deleted === undefined) p.deleted = false;
      if (p.deletedAt === undefined) p.deletedAt = null;
    });
    version = 2;
  }

  if (version < 3) {
    // v3 introduces the real Hero Image system: heroImage gains src/fileName/
    // mimeType/displayMode/posX/posY/scale, and heroSettings gains a structured
    // overlay object plus titlePosition/textAlign/textColor. Old `textPosition`
    // (a combined left/center/right/top/bottom value) is migrated into the new
    // titlePosition + textAlign fields.
    Object.values(state.courses || {}).forEach(course => {
      const oldTextPosition = course.heroSettings && course.heroSettings.textPosition;
      ensureHeroDefaults(course);
      if (oldTextPosition) {
        if (['top', 'center', 'bottom'].includes(oldTextPosition)) {
          course.heroSettings.titlePosition = oldTextPosition;
        } else if (['left', 'right'].includes(oldTextPosition)) {
          course.heroSettings.textAlign = oldTextPosition;
        }
      }
      delete course.heroSettings.textPosition;
      delete course.heroSettings.position;
    });
    version = 3;
  }

  if (version < 4) {
    // v4 fixes a data-integrity issue: courses cloned from courseTemplate
    // reused the same lesson ids (l1/l2/l3) and assessment id (a1), so
    // getCourseAndLesson() could resolve content from the wrong course once
    // more than one course existed. Walk all courses in order, and the first
    // time an id is seen it's left untouched; any later course that reuses
    // an already-seen lesson/assessment id gets a freshly generated unique
    // id. Lesson content, completed-lesson progress, and knowledge-check
    // answers are carried over to the new id so nothing is lost.
    const seenLessonIds = new Set();
    const seenAssessmentIds = new Set();

    Object.values(state.courses || {}).forEach(course => {
      const lessonIdRemap = {};

      (course.lessons || []).forEach(lesson => {
        if (seenLessonIds.has(lesson.id)) {
          const oldId = lesson.id;
          const newId = generateUniqueId('l');
          lessonIdRemap[oldId] = newId;
          if (state.lessons && Object.prototype.hasOwnProperty.call(state.lessons, oldId)) {
            state.lessons[newId] = JSON.parse(JSON.stringify(state.lessons[oldId]));
          }
          lesson.id = newId;
        }
        seenLessonIds.add(lesson.id);
      });

      (course.assessments || []).forEach(a => {
        if (seenAssessmentIds.has(a.id)) {
          a.id = generateUniqueId('a');
        }
        seenAssessmentIds.add(a.id);
      });

      const progress = state.learnerProgress && state.learnerProgress[course.id];
      if (progress && Object.keys(lessonIdRemap).length) {
        if (Array.isArray(progress.completedLessons)) {
          progress.completedLessons = progress.completedLessons.map(id => lessonIdRemap[id] || id);
        }
        if (progress.kcAnswers) {
          const remappedAnswers = {};
          Object.entries(progress.kcAnswers).forEach(([key, val]) => {
            const sepIndex = key.indexOf(':');
            const lessonId = sepIndex === -1 ? key : key.slice(0, sepIndex);
            const rest = sepIndex === -1 ? '' : key.slice(sepIndex);
            const newLessonId = lessonIdRemap[lessonId] || lessonId;
            remappedAnswers[newLessonId + rest] = val;
          });
          progress.kcAnswers = remappedAnswers;
        }
      }
    });

    version = 4;
  }

  if (version < 5) {
    // v5 introduces the User Profile / Workspace Settings system: a real
    // currentUser profile, workspace identity/branding/system info, and
    // administrator/invitation records. Existing saved states predate these
    // keys, so backfill them from the LumioState defaults set above.
    if (!state.currentUser) state.currentUser = JSON.parse(JSON.stringify(LumioState.currentUser));
    if (!state.workspace) state.workspace = JSON.parse(JSON.stringify(LumioState.workspace));
    if (!state.adminUsers) state.adminUsers = JSON.parse(JSON.stringify(LumioState.adminUsers));
    if (!state.invitations) state.invitations = JSON.parse(JSON.stringify(LumioState.invitations));
    version = 5;
  }

  if (version < 6) {
    // v6 trims Workspace Settings down to an administrative area: drops the
    // branding/white-label fields (workspace name, company name, logo,
    // primary/secondary color, favicon, login background) and adds
    // licenseInfo to systemInfo.
    const w = state.workspace || {};
    delete w.name;
    delete w.companyName;
    delete w.logo;
    delete w.branding;
    if (!w.systemInfo) w.systemInfo = JSON.parse(JSON.stringify(LumioState.workspace.systemInfo));
    if (w.systemInfo.licenseInfo === undefined) w.systemInfo.licenseInfo = LumioState.workspace.systemInfo.licenseInfo;
    state.workspace = w;
    version = 6;
  }

  if (version < 7) {
    // v7 introduces the multi-owner permission model: any workspace member
    // (including the signed-in user) can hold the Owner or Admin role, and
    // the signed-in user gains a `status` field so they participate in the
    // "last remaining Owner" safeguard checks alongside other members.
    if (state.currentUser && state.currentUser.status === undefined) {
      state.currentUser.status = 'active';
    }
    (state.invitations || []).forEach(inv => {
      if (inv.role !== 'owner' && inv.role !== 'admin') inv.role = 'admin';
    });
    version = 7;
  }

  return state;
}

function loadLumioState() {
  let restoredHash = null;
  try {
    const raw = localStorage.getItem(LUMIO_STORAGE_KEY);
    if (!raw) return restoredHash;

    const record = JSON.parse(raw);
    if (!record || typeof record !== 'object' || !record.state) return restoredHash;

    const state = migrateLumioState(record);
    LUMIO_PERSISTED_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(state, key)) {
        LumioState[key] = state[key];
      }
    });

    if (typeof record.hash === 'string' && record.hash.startsWith('#/')) {
      restoredHash = record.hash;
    }
  } catch (e) {
    console.warn('Lumio: could not load saved state, starting fresh', e);
  }
  return restoredHash;
}

// Renders a human-readable "Edited X ago" label derived directly from a
// `lastAccessed` timestamp, so the displayed label can never drift out of
// sync with the value used for sorting/filtering Continue Working, All
// Projects, and Recent.
function relativeEditedLabel(ts) {
  if (!ts) return 'Edited recently';
  const diff = Date.now() - ts;
  const minute = 60 * 1000, hour = 60 * minute, day = 24 * hour, week = 7 * day;
  if (diff < minute) return 'Edited just now';
  if (diff < hour) { const n = Math.round(diff / minute); return `Edited ${n} minute${n === 1 ? '' : 's'} ago`; }
  if (diff < day) { const n = Math.round(diff / hour); return `Edited ${n} hour${n === 1 ? '' : 's'} ago`; }
  if (diff < 2 * day) return 'Edited yesterday';
  if (diff < week) { const n = Math.round(diff / day); return `Edited ${n} days ago`; }
  if (diff < 2 * week) return 'Edited 1 week ago';
  if (diff < 4 * week) { const n = Math.round(diff / week); return `Edited ${n} weeks ago`; }
  const n = Math.round(diff / (30 * day));
  return `Edited ${n} month${n === 1 ? '' : 's'} ago`;
}

// Bumps the active project's `lastAccessed`/`modified` whenever the user is
// on its Course Landing or Lesson Builder (incl. Assessment editing, which
// uses the same canvas) screen and something changes — covers Course
// Details, Landing Page, Hero Image, Lesson, and Assessment edits so
// Continue Working always reflects the most recently touched project.
function touchCurrentProject() {
  const parts = (location.hash || '').replace('#/', '').split('/');
  let courseId = null;
  if (parts[0] === 'course' && parts[1]) courseId = parts[1];
  else if (parts[0] === 'lesson') courseId = LumioState.currentCourseId;
  if (!courseId) return;
  const p = LumioState.projects.find(x => x.id === courseId);
  if (!p) return;
  p.lastAccessed = Date.now();
}

let lumioSaveTimer = null;
function scheduleLumioSave() {
  touchCurrentProject();
  if (lumioSaveTimer) clearTimeout(lumioSaveTimer);
  lumioSaveTimer = setTimeout(saveLumioState, 400);
}

/* ---------------- ROUTER ---------------- */
function navigate(hash) {
  if (location.hash === hash) { render(); }
  else { location.hash = hash; }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  const restoredHash = loadLumioState();
  if (restoredHash) location.hash = restoredHash;
  if (!location.hash) location.hash = '#/login';
  render();
  BlockMigration.validateAllLessons();

  // Re-render mutates #app's contents; treat that as a signal that state may
  // have changed and persist it (covers project/lesson/theme/assessment edits
  // made via any screen, without needing per-action save calls).
  new MutationObserver(scheduleLumioSave)
    .observe(document.getElementById('app'), { childList: true, subtree: false });

  // Catches edits to inputs/textareas/selects that update state without
  // triggering a re-render (e.g. lesson content fields, title inputs).
  document.addEventListener('input', scheduleLumioSave, true);
  document.addEventListener('change', scheduleLumioSave, true);
});

window.addEventListener('beforeunload', saveLumioState);

/* ---------------- HELPERS ---------------- */
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Keeps the Projects-list entry for a course in sync with edits made on the
// Course Landing / Course Details page (title, last-edited timestamp), so
// Project cards and Continue Working reflect changes immediately.
function syncProjectFromCourse(courseId) {
  const p = LumioState.projects.find(x => x.id === courseId);
  if (!p) return;
  const course = LumioState.courses[courseId];
  if (course && course.title) p.title = course.title;
  p.lastAccessed = Date.now();
}

// Single source of truth for a project's display title: if a course object
// exists for this project, its title wins (Course Landing / Course Details
// is the canonical editor for the title). Falls back to project.title for
// projects that have never been opened (no course object created yet).
function projectDisplayTitle(p) {
  const course = LumioState.courses && LumioState.courses[p.id];
  return (course && course.title) || p.title;
}

// Generic "leave this page?" confirmation modal. Calls onConfirm() if the
// user confirms; does nothing (just closes) on cancel.
function confirmLeaveModal(message, onConfirm) {
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:420px; max-width:90vw; padding:24px;">
        <h3 style="font-size:16px;">Leave this page?</h3>
        <p class="text-sm text-muted mt-8">${message}</p>
        <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" id="confirm-leave-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="confirm-leave-go">Leave</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelector('#confirm-leave-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#confirm-leave-go').addEventListener('click', () => { overlay.remove(); onConfirm(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function toast(msg, icon) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = el(`<div class="toast">${icon ? `<span>${icon}</span>` : ''}<span>${msg}</span></div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// Applies a course's theme CSS variables to the #app root so that global
// styles (.btn, .card, nav, tabs, headings, etc.) inherit them via the
// cascade. Pass null/undefined to clear theme overrides on non-course pages.
function applyThemeVars(course) {
  const app = document.getElementById('app');
  if (course) {
    ensureCourseDesign(course);
    app.setAttribute('style', themeVarStyle(course.themeDesign));
  } else {
    app.removeAttribute('style');
  }
}

function ambientBlobs(colors) {
  colors = colors || [
    ['var(--pastel-lavender)', '420px', '420px', '-120px', '-100px'],
    ['var(--pastel-cyan)', '360px', '360px', 'auto', '-80px', '0', 'auto'],
    ['var(--pastel-pink)', '300px', '300px', '60%', 'auto', 'auto', '10%'],
  ];
  let html = '<div class="ambient-bg">';
  colors.forEach(c => {
    html += `<div class="blob" style="background:${c[0]};width:${c[1]};height:${c[2]};
      ${c[3] ? `top:${c[3]};` : ''}${c[4] ? `right:${c[4]};` : ''}${c[5] ? `bottom:${c[5]};` : ''}${c[6] ? `left:${c[6]};` : ''}"></div>`;
  });
  html += '</div>';
  return html;
}

/* ---------------- APP SHELL ---------------- */
const NAV_ITEMS = [
  { id: 'projects', label: 'Projects', icon: '🗂️', hash: '#/projects' },
  { id: 'hub', label: 'ID Academy', icon: '🎓', hash: '#/hub' },
];

function renderShell(activeId, contentHtml, opts = {}) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-shell">
      <aside class="app-sidebar">
        <div class="sidebar-logo" data-nav="#/welcome" style="${opts.largeLogo ? 'justify-content:center; padding:24px 10px;' : ''} cursor:pointer;">
          ${opts.largeLogo
            ? `<img src="assets/lumio-logo-transparent.png" alt="Lumio" style="width:140px; height:auto; border-radius:0; object-fit:contain; display:block;" />`
            : `<img src="assets/lumio-logo-transparent.png" alt="Lumio" /><span>Lumio</span>`}
        </div>
        ${NAV_ITEMS.map(item => `
          <div class="nav-item ${item.id === activeId ? 'active' : ''}" data-nav="${item.hash}">
            <span class="ic">${item.icon}</span>
            <span>${item.label}</span>
          </div>
        `).join('')}
        <div class="nav-section-label">Workspace</div>
        <div class="nav-item ${activeId === 'recent' ? 'active' : ''}" data-nav="#/recent">
          <span class="ic">⏱️</span><span>Recent</span>
        </div>
        <div class="nav-item ${activeId === 'trash' ? 'active' : ''}" data-nav="#/trash">
          <span class="ic">🗑️</span><span>Trash</span>
        </div>
        ${canAccessWorkspaceSettings() ? `
        <div class="nav-item ${activeId === 'workspace-settings' ? 'active' : ''}" data-nav="#/workspace-settings">
          <span class="ic">⚙️</span><span>Workspace Settings</span>
        </div>
        ` : ''}
        <div style="flex:1"></div>
        <div class="nav-item" data-nav="#/login">
          <span class="ic">↩️</span><span>Sign out</span>
        </div>
        <div class="nav-item ${activeId === 'profile' ? 'active' : ''}" data-nav="#/profile" style="border-top:1px solid var(--border); margin-top:8px; border-radius:0;">
          ${avatarHtml(LumioState.currentUser)}
          <div style="font-size:13px; min-width:0;">
            <div style="font-weight:600; color:var(--ink-900); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${currentUserDisplayName()}</div>
            <div class="text-muted" style="font-size:12px;">${ROLE_LABELS[LumioState.currentUser.role]}</div>
          </div>
        </div>
      </aside>
      <div class="app-main">
        ${contentHtml}
      </div>
    </div>
  `;
  app.querySelectorAll('[data-nav]').forEach(elx => {
    elx.addEventListener('click', () => {
      // Close any open modal (e.g. Course Settings) before navigating away.
      document.querySelectorAll('.overlay').forEach(o => o.remove());
      navigate(elx.dataset.nav);
    });
  });
}

/* ---------------- MAIN RENDER DISPATCH ---------------- */
function render() {
  const hash = location.hash || '#/login';
  const parts = hash.replace('#/', '').split('/');
  const [path, param] = parts;

  // Clear any course-theme CSS variables left over from a previous screen;
  // themed screens (course/lesson/learner) re-apply their own via applyThemeVars().
  if (path !== 'course' && path !== 'lesson' && path !== 'learner') {
    document.getElementById('app')?.removeAttribute('style');
  }

  switch (path) {
    case 'login':
      renderLogin();
      break;
    case 'welcome':
      renderWelcome();
      break;
    case 'hub':
      renderHub();
      break;
    case 'projects':
      renderProjects();
      break;
    case 'recent':
      renderRecent();
      break;
    case 'trash':
      renderTrash();
      break;
    case 'profile':
      renderProfile();
      break;
    case 'workspace-settings':
      renderWorkspaceSettings();
      break;
    case 'accept-invite':
      renderAcceptInvite(param);
      break;
    case 'wizard':
      renderWizard();
      break;
    case 'course':
      renderCourseLanding(param || LumioState.currentCourseId);
      break;
    case 'lesson':
      renderLessonBuilder(param || LumioState.currentLessonId);
      break;
    case 'learner':
      renderLearnerPreview(param || LumioState.currentCourseId, parts[2] || null);
      break;
    default:
      renderLogin();
  }
}

/* ---------------- COURSE TEMPLATE CLONING ---------------- */
// Deep-clones LumioData.courseTemplate for a new course, regenerating lesson
// and assessment IDs so multiple courses don't share IDs (which would make
// getCourseAndLesson resolve to the wrong course). Also seeds LumioState.lessons
// for each new lesson ID, carrying over the sample content for the first lesson.
function cloneCourseTemplate(newId) {
  const tmpl = JSON.parse(JSON.stringify(LumioData.courseTemplate));

  tmpl.lessons.forEach(lesson => {
    const oldId = lesson.id;
    const newLessonId = generateUniqueId('l');
    lesson.id = newLessonId;
    LumioState.lessons[newLessonId] = (oldId === 'l1')
      ? JSON.parse(JSON.stringify(LumioData.sampleLessonBlocks))
      : [];
  });

  tmpl.assessments.forEach(a => { a.id = generateUniqueId('a'); });

  tmpl.id = newId;
  return tmpl;
}

/* ---------------- LEARNER PREVIEW ENTRY ---------------- */
// Opens the learner runtime for a course, remembering where to return to
// when the learner exits preview (Projects, Course Landing, or Lesson Builder).
function openLearnerPreviewFor(courseId, returnTo, lessonId) {
  if (!LumioState.courses[courseId]) {
    const tmpl = cloneCourseTemplate(courseId);
    const project = LumioState.projects.find(p => p.id === courseId);
    if (project) tmpl.title = project.title;
    LumioState.courses[courseId] = tmpl;
  }
  LumioState.learnerPreview = { returnTo: returnTo || '#/projects' };
  navigate('#/learner/' + courseId + (lessonId ? '/' + lessonId : ''));
}
