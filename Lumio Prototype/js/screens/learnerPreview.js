/* ============================================================
   LEARNER PREVIEW RUNTIME
   A dedicated, learner-facing experience: course overview, lesson
   playback with Previous/Next navigation, progress tracking, and
   interactive knowledge checks. No authoring tools are shown here.
   ============================================================ */

/* ============================================================
   VIDEO EMBED RELIABILITY — YouTube embedding-disabled detection.
   A YouTube embed that the publisher has blocked doesn't fail to load —
   the iframe loads fine and renders YOUTUBE'S OWN "Video unavailable"
   page inside it, which our code has no visibility into via onerror. The
   only reliable signal is the YouTube IFrame Player API's onError event
   (codes 101/150 = embedding disabled). This loads that API once, attaches
   a player to every YouTube embed on the page, and swaps the iframe for
   the sibling fallback card (rendered by videoEmbedFallbackCard() in
   lessonBuilder.js, present in the DOM but hidden) the moment that fires —
   so a blocked video degrades to a professional "Watch on YouTube" card
   instead of looking like the course itself is broken. Runs in Preview and,
   since publish.js bundles this file verbatim, in Published HTML/SCORM/xAPI too.
   ============================================================ */
let _ytApiLoadPromise = null;
function _loadYouTubeIframeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (_ytApiLoadPromise) return _ytApiLoadPromise;
  _ytApiLoadPromise = new Promise((resolve) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prevCallback) prevCallback(); resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return _ytApiLoadPromise;
}
function bindVideoEmbedFallbacks(app) {
  const wraps = app.querySelectorAll('.lumio-video-embed-wrap[data-embed-type="youtube"]');
  if (!wraps.length) return;
  _loadYouTubeIframeApi().then(() => {
    wraps.forEach(wrap => {
      const iframe = wrap.querySelector('iframe');
      const fallback = wrap.nextElementSibling;
      if (!iframe || !fallback || !fallback.classList.contains('lumio-video-fallback')) return;
      try {
        new YT.Player(iframe, {
          events: {
            onError: () => { wrap.style.display = 'none'; fallback.style.display = 'block'; },
          },
        });
      } catch (e) { /* YT API unavailable (offline SCORM runtime, etc.) — embed stays as-is */ }
    });
  });
}

// Transient per-view UI state (not persisted) for accordions, tabs,
// flashcards and "Continue" reveals within the learner runtime.
const LearnerUI = {
  revealedContinues: {}, // lessonId -> Set<blockIndex>
  carouselIndex: {},     // "lessonId:blockIndex" -> active slide index
  quoteCarouselIndex: {}, // "lessonId:blockIndex" -> active quote index
  listChecked: {},       // "lessonId:blockIndex" -> Set<itemIndex> of checked checkbox-list items
  previewDevice: 'desktop', // 'desktop' | 'tablet' | 'mobile' — preview-only, not persisted
  fullScreen: false,         // full-screen learner preview — preview-only, not persisted
  activeCtx: null,        // the { courseId, lessonId, progress } of the currently-rendered lesson —
                          // read by the global lumioXxx interaction handlers to record completion progress
};

function ensureLearnerProgress(courseId) {
  if (!LumioState.learnerProgress) LumioState.learnerProgress = {};
  if (!LumioState.learnerProgress[courseId]) {
    LumioState.learnerProgress[courseId] = {
      completedLessons: [],
      kcAnswers: {},
      score: { correct: 0, total: 0 },
      blockProgress: {},
      courseStatus: 'not_started',     // 'not_started' | 'in_progress' | 'completed'
      courseCompletedAt: null,
      lessonCompletedAt: {},            // lessonId -> Unix timestamp
      lastLessonId: null,
      lastBlockIndex: 0,
      lastAccessedAt: null,
    };
  }
  const p = LumioState.learnerProgress[courseId];
  if (!p.blockProgress) p.blockProgress = {};
  if (p.courseStatus === undefined) p.courseStatus = p.completedLessons.length ? 'in_progress' : 'not_started';
  if (p.courseCompletedAt === undefined) p.courseCompletedAt = null;
  if (p.lessonCompletedAt === undefined) p.lessonCompletedAt = {};
  if (p.lastLessonId === undefined) p.lastLessonId = null;
  if (p.lastBlockIndex === undefined) p.lastBlockIndex = 0;
  if (p.lastAccessedAt === undefined) p.lastAccessedAt = null;
  return p;
}

// Records "where the learner currently is" in both the cross-course `resume`
// pointer and the per-course progress record, then schedules a save. Called
// on lesson entry and on scroll settle (debounced) — never estimated, always
// from the actual rendered block index.
function recordResume(courseId, lessonId, blockIndex, scrollY) {
  ensureLearnerProfile();
  const progress = ensureLearnerProgress(courseId);
  const now = Date.now();

  LumioState.resume = { courseId, lessonId, blockIndex, scrollY, timestamp: now };
  progress.lastLessonId = lessonId;
  progress.lastBlockIndex = blockIndex;
  progress.lastAccessedAt = now;

  scheduleLumioSave();
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function exitLearnerPreview() {
  if (LearnerUI._scrollHandler) { window.removeEventListener('scroll', LearnerUI._scrollHandler); LearnerUI._scrollHandler = null; }
  if (LearnerUI._headerResizeObserver) { LearnerUI._headerResizeObserver.disconnect(); LearnerUI._headerResizeObserver = null; }
  if (LearnerUI._viewedObserver) { LearnerUI._viewedObserver.disconnect(); LearnerUI._viewedObserver = null; }
  const returnTo = (LumioState.learnerPreview && LumioState.learnerPreview.returnTo) || '#/projects';
  LumioState.learnerPreview = null;
  navigate(returnTo);
}

/* ---------------- ROUTER ENTRY ---------------- */
function renderLearnerPreview(courseId, lessonId) {
  const course = LumioState.courses[courseId];
  if (!course) { navigate('#/projects'); return; }
  LumioState.currentCourseId = courseId;
  ensureCourseDesign(course);
  applyThemeVars(course);

  if (lessonId) renderLearnerLesson(course, lessonId);
  else renderLearnerCourseOverview(course);
}

/* ---------------- SHARED SHELL ---------------- */
function progressBarHtml(course, progress) {
  const pct = course.lessons.length
    ? Math.round((progress.completedLessons.length / course.lessons.length) * 100)
    : 0;
  return `
    <div class="flex items-center gap-8" style="min-width:150px;">
      <div style="flex:1; height:8px; background:var(--border); border-radius:99px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:var(--theme-accent, var(--teal));"></div>
      </div>
      <span class="text-sm text-muted">${pct}%</span>
    </div>`;
}

/* SVG mini-donut for lesson progress state.
   r=8 gives circumference ≈ 50.3 — arc length = pct * 50.3 */
function lessonDonut(state) {
  const C = 50.27; // 2π × 8
  const color = state === 'complete' ? 'var(--teal)' : state === 'started' ? 'var(--theme-primary, var(--indigo))' : 'var(--border)';
  const fill = state === 'complete' ? C : state === 'started' ? C * 0.4 : 0;
  return `<svg width="20" height="20" viewBox="0 0 20 20" style="flex-shrink:0;" aria-hidden="true">
    <circle cx="10" cy="10" r="8" fill="none" stroke="var(--border)" stroke-width="2.5"/>
    ${fill > 0 ? `<circle cx="10" cy="10" r="8" fill="none" stroke="${color}" stroke-width="2.5"
      stroke-dasharray="${fill} ${C}" stroke-dashoffset="${C * 0.25}" stroke-linecap="round"/>` : ''}
    ${state === 'complete' ? `<circle cx="10" cy="10" r="4" fill="${color}"/>` : ''}
  </svg>`;
}

/* sticky=true → sidebar uses position:sticky so browser-scroll desktop mode works correctly
   mobileDrawer=true → sidebar renders as an off-screen overlay drawer (for mobile device frame) */
function courseNavSidebar(course, progress, activeLessonId, sticky = false, mobileDrawer = false) {
  const locked = activeLessonId === null && progress.completedLessons.length === 0;
  const pct = course.lessons.length
    ? Math.round((progress.completedLessons.length / course.lessons.length) * 100) : 0;
  // A lesson is "started" if it has any blockProgress entries but isn't completed.
  const startedIds = new Set(
    Object.keys(progress.blockProgress || {}).map(k => k.split(':')[0])
      .filter(id => !progress.completedLessons.includes(id))
  );
  // height (not just max-height) is required: max-height only caps overflow,
  // it never forces the box to fill — a flex column item's height is
  // intrinsic to its content otherwise. Without an explicit height, a course
  // with few lessons leaves the aside shorter than the viewport, and the
  // page background (not the sidebar's --surface-0) shows through below it.
  const stickyStyle = sticky
    ? `align-self:flex-start; position:sticky; top:57px; height:calc(100vh - 57px); max-height:calc(100vh - 57px);`
    : ``;
  const drawerStyle = mobileDrawer
    ? `position:absolute; top:0; left:0; bottom:0; z-index:200; transform:translateX(-100%); transition:transform 0.25s ease; box-shadow:var(--elevation-2);`
    : ``;
  return `
    <aside ${mobileDrawer ? 'id="lp-mobile-sidebar"' : ''} style="width:260px; flex-shrink:0; border-right:1px solid var(--border); background:var(--surface-0); overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:0; ${stickyStyle}${drawerStyle}">
      <div style="margin-bottom:16px;">
        <div class="flex items-center justify-between" style="margin-bottom:6px;">
          <span style="font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400);">Course Progress</span>
          <span class="text-sm" style="font-weight:600; color:var(--ink-700);">${pct}%</span>
        </div>
        <div style="height:6px; background:var(--border); border-radius:99px; overflow:hidden;">
          <div style="width:${pct}%; height:100%; background:var(--theme-accent, var(--teal)); border-radius:99px; transition:width .3s;"></div>
        </div>
      </div>
      <h4 style="font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400); margin-bottom:8px;">Lessons</h4>
      <div class="flex-col gap-8">
        ${course.lessons.length ? course.lessons.map((l, li) => {
          const isComplete = progress.completedLessons.includes(l.id);
          const isStarted = !isComplete && startedIds.has(l.id);
          // Sequential lock: lesson li is reachable only once every PRIOR
          // lesson is complete — closes the sidebar bypass where a learner
          // could jump straight to lesson 3 without finishing 1/2. Same
          // rule, same single source of truth (progress.completedLessons),
          // as the assessment lock just below.
          const sequentiallyLocked = li > 0 && !course.lessons.slice(0, li).every(prev => progress.completedLessons.includes(prev.id));
          const lessonLocked = locked || sequentiallyLocked;
          const state = lessonLocked ? 'locked' : isComplete ? 'complete' : isStarted ? 'started' : 'not-started';
          return `
          <div class="lp-nav-lesson ${l.id === activeLessonId ? 'selected' : ''} ${lessonLocked ? 'locked' : ''}" data-lesson="${l.id}" data-locked="${lessonLocked}"
            style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:var(--r-md); background:var(--surface-0); border:1px solid ${l.id === activeLessonId ? 'var(--theme-primary, var(--indigo))' : 'var(--border)'}; box-shadow:none; ${lessonLocked ? 'opacity:0.55; cursor:not-allowed;' : 'cursor:pointer;'}">
            ${lessonLocked ? `<span style="font-size:14px;">🔒</span>` : lessonDonut(state)}
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${l.title}</div>
              <div class="text-sm text-muted">${l.duration || ''}</div>
            </div>
          </div>`;
        }).join('') : `<p class="text-sm text-muted">No lessons yet.</p>`}
      </div>
      ${course.assessments.length ? `
      <h4 style="font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400); margin:20px 0 8px;">Assessments</h4>
      <div class="flex-col gap-8">
        ${course.assessments.map(a => {
          const allLessonsDone = course.lessons.length === 0 || course.lessons.every(l => progress.completedLessons.includes(l.id));
          const assessmentLocked = locked || !allLessonsDone;
          const isActive = a.id === activeLessonId;
          return `
          <div class="lp-nav-assessment ${isActive ? 'selected' : ''} ${assessmentLocked ? 'locked' : ''}" data-lesson="${a.id}" data-locked="${assessmentLocked}"
            style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:var(--r-md); background:var(--surface-0); border:1px solid ${isActive ? 'var(--theme-primary, var(--indigo))' : 'var(--border)'}; box-shadow:none; ${assessmentLocked ? 'opacity:0.55; cursor:not-allowed;' : 'cursor:pointer;'}">
            <span>${assessmentLocked ? '🔒' : '📝'}</span>
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.title}</div>
              <div class="text-sm text-muted">${a.type || 'Quiz'}</div>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}
    </aside>`;
}

const LEARNER_DEVICE_FRAMES = {
  desktop: { width: '1080px', label: '🖥️ Desktop' },
  tablet:  { width: '768px',  label: '📱 Tablet' },
  mobile:  { width: '390px',  label: '📲 Mobile' },
};

function learnerDeviceFrameStyle(device) {
  const frame = LEARNER_DEVICE_FRAMES[device] || LEARNER_DEVICE_FRAMES.desktop;
  // Desktop: capped reading width, no device chrome.
  // Tablet/Mobile: simulated device frame with border + shadow.
  if (device === 'desktop') {
    return `width:100%; max-width:${frame.width}; height:100%; margin:0 auto;`;
  }
  return `width:100%; max-width:${frame.width}; height:100%; margin:0 auto; border:1px solid var(--border); border-radius:16px; overflow:hidden; box-shadow:var(--elevation-2); background:var(--theme-bg-style, var(--surface-0));`;
}

function learnerDeviceSwitcherHtml(device) {
  return `
    <div class="seg-control" id="lp-device-switch" style="flex:0 0 auto; width:auto;">
      ${Object.entries(LEARNER_DEVICE_FRAMES).map(([key, f]) => `<button data-val="${key}" class="${device === key ? 'active' : ''}" title="${f.label}" style="flex:0 0 auto; padding:8px 10px; white-space:nowrap;">${f.label}</button>`).join('')}
    </div>`;
}

/* ---------- LEARNER SHELL ----------
   Desktop (no device frame): browser window owns vertical scroll.
     - Outer div: min-height:100vh, no overflow:hidden
     - Header: position:sticky top:0
     - Sidebar: position:sticky top:57px (courseNavSidebar sticky=true)
     - <main>: normal block flow, no overflow constraints
   Tablet/Mobile (device frame): single in-frame scroll.
     - Outer div: height:100vh overflow:hidden
     - Frame wrapper: overflow:hidden (not auto — removes second scrollbar)
     - <main>: height:100% overflow-y:auto (sole scroll owner)
   Overview (isOverview:true): no sidebar on any device mode.

   Published mode (LearnerUI.publishedMode=true): no authoring controls,
   no device frames. Single CSS-responsive layout — browser determines breakpoint.
*/

// Wires the mobile sidebar drawer: toggle button, backdrop tap-to-close.
// Nav item clicks navigate away (causing a full re-render) so no explicit close needed there.
function wireMobileSidebar(app) {
  const sidebar = app.querySelector('#lp-mobile-sidebar');
  const backdrop = app.querySelector('#lp-sidebar-backdrop');
  const toggle = app.querySelector('#lp-menu-toggle');
  if (!sidebar) return;

  const open = () => { sidebar.style.transform = 'translateX(0)'; if (backdrop) backdrop.style.display = 'block'; };
  const close = () => { sidebar.style.transform = 'translateX(-100%)'; if (backdrop) backdrop.style.display = 'none'; };

  toggle?.addEventListener('click', open);
  backdrop?.addEventListener('click', close);
}

/* ---------- PRODUCTION SHELL (published packages) ----------
   Used when LearnerUI.publishedMode is true. No authoring controls.
   CSS media query drives sidebar: sticky on wide viewports, drawer on narrow. */
function learnerShellProduction(course, bodyHtml, opts = {}) {
  const progress = ensureLearnerProgress(course.id);
  const app = document.getElementById('app');
  const activeLessonId = opts.activeLessonId || null;
  const isOverview = !!(opts.isOverview);

  // Same-lesson scroll restoration (KC answers, Continue reveals, etc.)
  const sameLesson = activeLessonId !== null && LearnerUI.lastLessonId === activeLessonId;
  const prevScrollY = (sameLesson) ? window.scrollY : 0;
  LearnerUI.lastLessonId = activeLessonId;

  // Single sidebar rendered as drawer (gets id="lp-mobile-sidebar"); CSS makes it
  // sticky on wide viewports and an off-screen drawer on narrow ones.
  const sidebarHtml = isOverview ? '' : courseNavSidebar(course, progress, activeLessonId, false, true);

  const prodHeader = `
    <header style="position:sticky; top:0; z-index:50; padding:12px 20px; border-bottom:1px solid var(--border); background:var(--surface-0); display:flex; align-items:center; gap:12px; flex-shrink:0;">
      ${!isOverview ? `<button class="btn btn-ghost btn-sm" id="lp-menu-toggle" style="display:none;" aria-label="Open navigation">☰</button>` : ''}
      ${opts.showReturn ? `<button class="btn btn-ghost btn-sm" id="lp-return">← Back</button>` : ''}
      <strong style="font-size:14px; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${course.title}</strong>
      ${progressBarHtml(course, progress)}
    </header>`;

  app.innerHTML = `
    <div class="lumio-learner-root" style="min-height:100vh; ${themeVarStyle(course.themeDesign)}">
      ${prodHeader}
      <div style="display:flex; position:relative;">
        ${!isOverview ? `<div id="lp-sidebar-backdrop" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:199;"></div>` : ''}
        ${sidebarHtml}
        <main style="flex:1; min-width:0; display:flex; flex-direction:column; container-type:inline-size;">${bodyHtml}</main>
      </div>
    </div>
    <style>
      /* Wide viewport: sidebar is sticky beside content */
      @media (min-width: 769px) {
        #lp-mobile-sidebar {
          position: sticky !important;
          transform: none !important;
          box-shadow: none !important;
          transition: none !important;
          z-index: auto !important;
          top: 0;
          align-self: flex-start;
        }
      }
      /* Narrow viewport: sidebar becomes an off-screen drawer, hamburger visible */
      @media (max-width: 768px) {
        #lp-menu-toggle { display: flex !important; }
        #lp-mobile-sidebar { position: fixed !important; top: 0; bottom: 0; z-index: 200; }
      }
    </style>
    ${sharedLayoutStyles()}
  `;

  app.querySelector('#lp-return')?.addEventListener('click', () => navigate('#/learner/' + course.id));
  app.querySelectorAll('.lp-nav-lesson, .lp-nav-assessment').forEach(elx => {
    if (elx.classList.contains('locked')) return;
    elx.addEventListener('click', () => {
      if (elx.dataset.locked === 'true') return;
      navigate('#/learner/' + course.id + '/' + elx.dataset.lesson);
    });
  });
  if (!isOverview) wireMobileSidebar(app);

  // Sync sticky sidebar top offset to actual header height on wide viewports
  requestAnimationFrame(() => {
    const hdr = app.querySelector('header');
    const sidebar = app.querySelector('#lp-mobile-sidebar');
    if (hdr && sidebar && window.innerWidth >= 769) {
      const h = hdr.offsetHeight;
      sidebar.style.top = h + 'px';
      sidebar.style.maxHeight = `calc(100vh - ${h}px)`;
    }
  });

  if (sameLesson && prevScrollY > 0) {
    requestAnimationFrame(() => window.scrollTo(0, prevScrollY));
  }
}

function learnerShell(course, bodyHtml, opts = {}) {
  if (LearnerUI.publishedMode) {
    learnerShellProduction(course, bodyHtml, opts);
    return;
  }

  const progress = ensureLearnerProgress(course.id);
  const app = document.getElementById('app');
  const device = LearnerUI.previewDevice || 'desktop';
  const isDesktop = device === 'desktop';
  const isMobile = device === 'mobile';
  const frameStyle = learnerDeviceFrameStyle(device);
  const reRender = () => renderLearnerPreview(course.id, opts.activeLessonId || null);
  const isOverview = !!(opts.isOverview);

  // Preserve scroll across same-lesson re-renders (KC answers, Continue reveals, etc.)
  const activeLessonId = opts.activeLessonId || null;
  const sameLesson = activeLessonId !== null && LearnerUI.lastLessonId === activeLessonId;
  // Capture before innerHTML wipe
  const prevScrollEl = (!isDesktop && sameLesson) ? (app.querySelector('main')?.scrollTop || 0) : 0;
  const prevScrollY  = (isDesktop && sameLesson) ? window.scrollY : 0;
  LearnerUI.lastLessonId = activeLessonId;

  const headerHtml = `
    <header id="lp-header" class="flex items-center justify-between" style="position:sticky; top:0; z-index:50; padding:12px 20px; border-bottom:1px solid var(--border); background:var(--surface-0); flex-shrink:0; gap:16px; flex-wrap:wrap;">
      <div class="flex items-center gap-12" style="min-width:0;">
        <img src="assets/lumio-logo-transparent.png" alt="Lumio" id="lp-logo" style="width:28px; height:28px; border-radius:0; object-fit:contain; display:block; cursor:pointer; flex-shrink:0;" />
        ${opts.showReturn ? `<button class="btn btn-ghost btn-sm" id="lp-return">← Return to Course</button>` : ''}
        <strong style="font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${course.title}</strong>
        <span class="pill pill-indigo">👁️ Learner Preview</span>
      </div>
      <div class="flex items-center gap-16" style="flex-wrap:wrap;">
        ${learnerDeviceSwitcherHtml(device)}
        <button class="btn btn-secondary btn-sm" id="lp-fullscreen">⛶ Full Screen Preview</button>
        ${progressBarHtml(course, progress)}
        <button class="btn btn-secondary btn-sm" id="lp-exit">✕ Exit Preview</button>
      </div>
    </header>`;

  const sidebarHtml = isOverview ? '' : isMobile
    ? courseNavSidebar(course, progress, activeLessonId, false, true)
    : courseNavSidebar(course, progress, activeLessonId, isDesktop);

  if (LearnerUI.fullScreen) {
    if (isDesktop) {
      // Fullscreen desktop: page scroll, sticky mini-header
      app.innerHTML = `
        <div class="lumio-learner-root" style="min-height:100vh; ${themeVarStyle(course.themeDesign)}">
          <div id="lp-header" style="position:sticky; top:0; z-index:50; display:flex; align-items:center; justify-content:flex-end; padding:10px 16px; border-bottom:1px solid var(--border); background:var(--surface-0);">
            <button class="btn btn-secondary btn-sm" id="lp-fullscreen-exit">✕ Exit Full Screen</button>
          </div>
          <div style="display:flex;">
            ${sidebarHtml}
            <main style="flex:1; min-width:0; display:flex; flex-direction:column; container-type:inline-size;">${bodyHtml}</main>
          </div>
        </div>
        ${sharedLayoutStyles()}
      `;
    } else if (isMobile) {
      // Fullscreen mobile: drawer sidebar overlaying device frame
      const mobileMenuBtn = !isOverview ? `<button class="btn btn-secondary btn-sm" id="lp-menu-toggle">☰ Lessons</button>` : '';
      const mobileBodyHtml = !isOverview ? `
        <div id="lp-mobile-bar" style="position:sticky; top:0; z-index:100; background:var(--surface-0); border-bottom:1px solid var(--border); padding:8px 16px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
          ${mobileMenuBtn}
          ${progressBarHtml(course, progress)}
        </div>${bodyHtml}` : bodyHtml;
      app.innerHTML = `
        <div style="height:100vh; display:flex; flex-direction:column; overflow:hidden; background:var(--surface-0); ${themeVarStyle(course.themeDesign)}">
          <div style="display:flex; align-items:center; justify-content:flex-end; padding:10px 16px; flex-shrink:0; border-bottom:1px solid var(--border);">
            <button class="btn btn-secondary btn-sm" id="lp-fullscreen-exit">✕ Exit Full Screen</button>
          </div>
          <div style="flex:1; position:relative; overflow:hidden; display:flex; justify-content:center;">
            ${sidebarHtml}
            <div id="lp-sidebar-backdrop" style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.4); z-index:199;"></div>
            <div style="${frameStyle}">
              <main style="height:100%; overflow-y:auto; display:flex; flex-direction:column; container-type:inline-size;">${mobileBodyHtml}</main>
            </div>
          </div>
        </div>
        ${sharedLayoutStyles()}
      `;
    } else {
      // Fullscreen tablet: sidebar in flex row beside device frame
      app.innerHTML = `
        <div style="height:100vh; display:flex; flex-direction:column; overflow:hidden; background:var(--surface-0); ${themeVarStyle(course.themeDesign)}">
          <div style="display:flex; align-items:center; justify-content:flex-end; padding:10px 16px; flex-shrink:0; border-bottom:1px solid var(--border);">
            <button class="btn btn-secondary btn-sm" id="lp-fullscreen-exit">✕ Exit Full Screen</button>
          </div>
          <div style="flex:1; display:flex; min-height:0;">
            ${sidebarHtml}
            <div style="flex:1; overflow:hidden; display:flex; justify-content:center; padding:0 0 24px;">
              <div style="${frameStyle}">
                <main style="height:100%; overflow-y:auto; display:flex; flex-direction:column; container-type:inline-size;">${bodyHtml}</main>
              </div>
            </div>
          </div>
        </div>
        ${sharedLayoutStyles()}
      `;
    }
    app.querySelector('#lp-fullscreen-exit').addEventListener('click', () => { LearnerUI.fullScreen = false; reRender(); });
    app.querySelectorAll('.lp-nav-lesson, .lp-nav-assessment').forEach(elx => {
      if (elx.classList.contains('locked')) return;
      elx.addEventListener('click', () => {
        // Defense in depth — re-check the gate from the element's own
        // data-locked attribute rather than trusting only "was a listener
        // attached", same pattern as the Next button's click handler.
        if (elx.dataset.locked === 'true') return;
        navigate('#/learner/' + course.id + '/' + elx.dataset.lesson);
      });
    });
    if (isMobile && !isOverview) wireMobileSidebar(app);
  } else if (isDesktop) {
    // Normal desktop: browser-level scroll, sticky header + sticky sidebar
    app.innerHTML = `
      <div class="lumio-learner-root" style="min-height:100vh; ${themeVarStyle(course.themeDesign)}">
        ${headerHtml}
        <div style="display:flex;">
          ${sidebarHtml}
          <main style="flex:1; min-width:0; display:flex; flex-direction:column; container-type:inline-size;">${bodyHtml}</main>
        </div>
      </div>
      ${sharedLayoutStyles()}
    `;
    app.querySelector('#lp-logo').addEventListener('click', () => navigate('#/learner/' + course.id));
    app.querySelector('#lp-exit').addEventListener('click', exitLearnerPreview);
    app.querySelector('#lp-return')?.addEventListener('click', () => navigate('#/learner/' + course.id));
    app.querySelector('#lp-fullscreen').addEventListener('click', () => { LearnerUI.fullScreen = true; reRender(); });
    app.querySelectorAll('#lp-device-switch button').forEach(btn => btn.addEventListener('click', () => {
      LearnerUI.previewDevice = btn.dataset.val;
      reRender();
    }));
    app.querySelectorAll('.lp-nav-lesson, .lp-nav-assessment').forEach(elx => {
      if (elx.classList.contains('locked')) return;
      elx.addEventListener('click', () => {
        // Defense in depth — re-check the gate from the element's own
        // data-locked attribute rather than trusting only "was a listener
        // attached", same pattern as the Next button's click handler.
        if (elx.dataset.locked === 'true') return;
        navigate('#/learner/' + course.id + '/' + elx.dataset.lesson);
      });
    });
  } else if (isMobile) {
    // Normal mobile: drawer sidebar overlaying device frame, ☰ Lessons button in-frame
    const mobileBodyHtml = !isOverview ? `
      <div id="lp-mobile-bar" style="position:sticky; top:0; z-index:100; background:var(--surface-0); border-bottom:1px solid var(--border); padding:8px 16px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
        <button class="btn btn-secondary btn-sm" id="lp-menu-toggle">☰ Lessons</button>
        ${progressBarHtml(course, progress)}
      </div>${bodyHtml}` : bodyHtml;
    app.innerHTML = `
      <div style="height:100vh; display:flex; flex-direction:column; overflow:hidden; ${themeVarStyle(course.themeDesign)}">
        ${headerHtml}
        <div style="flex:1; position:relative; overflow:hidden; display:flex; justify-content:center; background:var(--surface-0);">
          ${sidebarHtml}
          <div id="lp-sidebar-backdrop" style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.4); z-index:199;"></div>
          <div style="${frameStyle}">
            <main style="height:100%; overflow-y:auto; display:flex; flex-direction:column; container-type:inline-size;">${mobileBodyHtml}</main>
          </div>
        </div>
      </div>
      ${sharedLayoutStyles()}
    `;
    app.querySelector('#lp-logo').addEventListener('click', () => navigate('#/learner/' + course.id));
    app.querySelector('#lp-exit').addEventListener('click', exitLearnerPreview);
    app.querySelector('#lp-return')?.addEventListener('click', () => navigate('#/learner/' + course.id));
    app.querySelector('#lp-fullscreen').addEventListener('click', () => { LearnerUI.fullScreen = true; reRender(); });
    app.querySelectorAll('#lp-device-switch button').forEach(btn => btn.addEventListener('click', () => {
      LearnerUI.previewDevice = btn.dataset.val;
      reRender();
    }));
    app.querySelectorAll('.lp-nav-lesson, .lp-nav-assessment').forEach(elx => {
      if (elx.classList.contains('locked')) return;
      elx.addEventListener('click', () => {
        // Defense in depth — re-check the gate from the element's own
        // data-locked attribute rather than trusting only "was a listener
        // attached", same pattern as the Next button's click handler.
        if (elx.dataset.locked === 'true') return;
        navigate('#/learner/' + course.id + '/' + elx.dataset.lesson);
      });
    });
    if (!isOverview) wireMobileSidebar(app);
    // Restore in-frame scroll for same-lesson re-renders
    if (sameLesson) {
      const main = app.querySelector('main');
      if (main) main.scrollTop = prevScrollEl;
    }
  } else {
    // Normal tablet: sidebar in flex row beside device frame
    app.innerHTML = `
      <div style="height:100vh; display:flex; flex-direction:column; overflow:hidden; ${themeVarStyle(course.themeDesign)}">
        ${headerHtml}
        <div style="flex:1; display:flex; min-height:0;">
          ${sidebarHtml}
          <div style="flex:1; overflow:hidden; display:flex; justify-content:center; background:var(--surface-0);">
            <div style="${frameStyle}">
              <main style="height:100%; overflow-y:auto; display:flex; flex-direction:column; container-type:inline-size;">${bodyHtml}</main>
            </div>
          </div>
        </div>
      </div>
      ${sharedLayoutStyles()}
    `;
    app.querySelector('#lp-logo').addEventListener('click', () => navigate('#/learner/' + course.id));
    app.querySelector('#lp-exit').addEventListener('click', exitLearnerPreview);
    app.querySelector('#lp-return')?.addEventListener('click', () => navigate('#/learner/' + course.id));
    app.querySelector('#lp-fullscreen').addEventListener('click', () => { LearnerUI.fullScreen = true; reRender(); });
    app.querySelectorAll('#lp-device-switch button').forEach(btn => btn.addEventListener('click', () => {
      LearnerUI.previewDevice = btn.dataset.val;
      reRender();
    }));
    app.querySelectorAll('.lp-nav-lesson, .lp-nav-assessment').forEach(elx => {
      if (elx.classList.contains('locked')) return;
      elx.addEventListener('click', () => {
        // Defense in depth — re-check the gate from the element's own
        // data-locked attribute rather than trusting only "was a listener
        // attached", same pattern as the Next button's click handler.
        if (elx.dataset.locked === 'true') return;
        navigate('#/learner/' + course.id + '/' + elx.dataset.lesson);
      });
    });
    // Restore in-frame scroll for same-lesson re-renders
    if (sameLesson) {
      const main = app.querySelector('main');
      if (main) main.scrollTop = prevScrollEl;
    }
  }

  // Restore browser scroll for same-lesson re-renders on desktop
  if (isDesktop && sameLesson && prevScrollY > 0) {
    requestAnimationFrame(() => window.scrollTo(0, prevScrollY));
  }

  // Keep the sticky sidebar's top/max-height in sync with the header's actual
  // height (header can wrap to two lines, change with theme font size, etc.).
  // A one-shot requestAnimationFrame fix only catches the height at that one
  // instant — if the header changes size afterward (font load, wrap, resize)
  // the sidebar silently falls out of sync and stops reaching the bottom of
  // the viewport. A ResizeObserver keeps it correct for the life of this render.
  if (LearnerUI._headerResizeObserver) { LearnerUI._headerResizeObserver.disconnect(); LearnerUI._headerResizeObserver = null; }
  if (isDesktop && !isOverview) {
    const hdr = app.querySelector('#lp-header');
    const aside = app.querySelector('aside');
    if (hdr && aside) {
      const syncSidebarOffset = () => {
        const h = hdr.offsetHeight;
        aside.style.top = h + 'px';
        aside.style.height = `calc(100vh - ${h}px)`;
        aside.style.maxHeight = `calc(100vh - ${h}px)`;
      };
      syncSidebarOffset();
      const observer = new ResizeObserver(syncSidebarOffset);
      observer.observe(hdr);
      LearnerUI._headerResizeObserver = observer;
    }
  }
}

/* ---------------- COURSE OVERVIEW ---------------- */
function renderLearnerCourseOverview(course) {
  const progress = ensureLearnerProgress(course.id);
  const firstIncomplete = course.lessons.find(l => !progress.completedLessons.includes(l.id));
  const hasProgress = progress.completedLessons.length > 0;
  const startLabel = !hasProgress ? 'Start Course' : (firstIncomplete ? 'Continue Course' : 'Restart Course');

  // Continue Course resume priority: 1) resume.lessonId (if it points at this
  // course), 2) progress.lastLessonId, 3) first incomplete lesson, 4) first lesson.
  const resumeLessonId = (LumioState.resume && LumioState.resume.courseId === course.id) ? LumioState.resume.lessonId : null;
  const resumeLesson = (resumeLessonId && course.lessons.find(l => l.id === resumeLessonId))
    || (progress.lastLessonId && course.lessons.find(l => l.id === progress.lastLessonId))
    || null;
  // Resume position only applies while there's still an incomplete lesson
  // ("Continue Course"); a fully-complete course restarts from lesson 1.
  const startLesson = (firstIncomplete && resumeLesson) || firstIncomplete || course.lessons[0];

  const totalMinutes = estimateCourseDuration(course);
  const navTips = LumioData.ai.navigationTips(course.lessons.length, course.assessments.length, totalMinutes + ' min');

  const body = `
    <div style="max-width:900px; margin:0 auto; padding:56px 40px 80px; width:100%;">
      ${renderHeroSection(course, {
        editable: false,
        ctaId: 'lp-start',
        ctaLabel: course.lessons.length ? startLabel + ' →' : 'No lessons yet',
        ctaDisabled: !course.lessons.length,
      })}

      ${renderObjectivesSection(course, false)}

      ${renderCourseStructureSection(course)}

      ${renderNavTipsSection(course, navTips)}
    </div>
  `;

  learnerShell(course, body, { activeLessonId: null, isOverview: true });

  // Hydrate hero/thumbnail refs so cardThumbMedia() resolves on re-render.
  const _heroRef = (course.heroImage || {}).src;
  const _thumbRef = (course.thumbnailImage || {}).src;
  const _overviewRefs = [_heroRef, _thumbRef].filter(Boolean);
  AssetStore.preloadBlocks([], _overviewRefs).then(count => {
    if (count > 0) renderLearnerCourseOverview(course);
  });

  document.getElementById('lp-start')?.addEventListener('click', () => {
    if (!course.lessons.length) return;
    navigate('#/learner/' + course.id + '/' + startLesson.id);
  });
}

/* ---------------- LESSON PLAYBACK ---------------- */
function renderLearnerLesson(course, lessonId) {
  const progress = ensureLearnerProgress(course.id);
  ensureLearnerProfile();
  if (progress.courseStatus === 'not_started') progress.courseStatus = 'in_progress';

  // Check if this is an assessment (not a regular lesson).
  const assessmentIdx = (course.assessments || []).findIndex(a => a.id === lessonId);
  const isAssessment = assessmentIdx !== -1;

  const lessonIdx = isAssessment ? -1 : course.lessons.findIndex(l => l.id === lessonId);
  if (!isAssessment && lessonIdx === -1) { navigate('#/learner/' + course.id); return; }

  // Gating root-cause fix: the sidebar already hides/disables locked
  // assessment links, but that's just one entry point — direct URL hash
  // navigation, browser back/forward, and the Continue-Working/course
  // overview cards all reach this function too. Enforcing the lock HERE,
  // where every entry point converges, is the only way to guarantee no
  // bypass path exists. An assessment is reachable only once every lesson
  // in the course has been marked complete.
  if (isAssessment) {
    const allLessonsDone = course.lessons.length === 0 || course.lessons.every(l => progress.completedLessons.includes(l.id));
    if (!allLessonsDone) {
      const firstIncomplete = course.lessons.find(l => !progress.completedLessons.includes(l.id));
      navigate('#/learner/' + course.id + (firstIncomplete ? '/' + firstIncomplete.id : ''));
      return;
    }
  } else {
    // Same enforcement for sequential LESSON locking — a lesson is
    // reachable only once every prior lesson is complete. Without this,
    // jumping straight to lesson 3's URL/sidebar entry/Continue-Working
    // card skipped lessons 1-2 entirely.
    const priorLessons = course.lessons.slice(0, lessonIdx);
    const allPriorDone = priorLessons.every(l => progress.completedLessons.includes(l.id));
    if (!allPriorDone) {
      const firstIncomplete = priorLessons.find(l => !progress.completedLessons.includes(l.id));
      navigate('#/learner/' + course.id + (firstIncomplete ? '/' + firstIncomplete.id : ''));
      return;
    }
  }

  const lesson = isAssessment ? course.assessments[assessmentIdx] : course.lessons[lessonIdx];
  const blocks = LumioState.lessons[lessonId] || [];
  // ctx.blocks must be set BEFORE any CompletionEngine call (isLessonReadyForNext
  // below runs immediately) — CompletionEngine.resolveBlockKey() falls back to
  // the raw array index when ctx.blocks is missing, instead of the block's
  // stable id, silently writing/reading progress under the WRONG key
  // (lessonId:0 instead of lessonId:<blockId>). That stale, permanently-empty
  // index-keyed entry is what isLessonReadyForNext's first call was reading
  // from — so a real interaction recorded under the correct id-keyed entry
  // (by renderLearnerBlocks/bindLearnerBlockEvents, which set ctx.blocks
  // before any block ever interacts) was never seen by the lesson-wide
  // Next-button gate computed here.
  const ctx = { courseId: course.id, lessonId, progress, blocks };
  LearnerUI.activeCtx = ctx;

  const isLastLesson = !isAssessment && lessonIdx === course.lessons.length - 1;
  const hasAssessments = (course.assessments || []).length > 0;
  // After last lesson, go to first assessment if one exists; otherwise finish course.
  const nextAfterLastLesson = isLastLesson && hasAssessments ? course.assessments[0].id : null;
  const isLastAssessment = isAssessment && assessmentIdx === course.assessments.length - 1;
  const nextLabel = isAssessment
    ? (isLastAssessment ? 'Finish Course ✓' : 'Next Assessment →')
    : (isLastLesson ? (hasAssessments ? 'Take Assessment →' : 'Finish Course ✓') : 'Next →');

  const prevId = isAssessment
    ? (assessmentIdx > 0 ? course.assessments[assessmentIdx - 1].id : (course.lessons.length ? course.lessons[course.lessons.length - 1].id : null))
    : (lessonIdx > 0 ? course.lessons[lessonIdx - 1].id : null);

  // Next is disabled until every required block in THIS lesson is complete —
  // a lesson-wide gate, separate from (and additional to) any Continue-block
  // gating the author has configured within the lesson itself.
  const revealedForLesson = LearnerUI.revealedContinues[lessonId] || new Set();
  const nextDisabled = !CompletionEngine.isLessonReadyForNext(blocks, ctx, revealedForLesson);

  const body = `
    <div style="max-width:1100px; margin:0 auto; padding:40px 40px 40px; width:100%; flex:1;">
      <div class="flex items-center justify-between mb-16" style="padding:0 22px;">
        <h2 style="font-size:calc(var(--theme-font-size, 16px) + 4px); font-family:var(--theme-font-display, var(--font-display));">${lesson.title}</h2>
        ${lesson.duration ? `<span class="pill pill-grey">${lesson.duration}</span>` : ''}
        ${isAssessment ? '<span class="pill pill-cyan">Assessment</span>' : ''}
      </div>
      ${renderLearnerBlocks(blocks, ctx)}
    </div>
    <div style="position:sticky; bottom:0; background:var(--surface-0); border-top:1px solid var(--border); padding:14px 24px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; min-height:72px; box-sizing:border-box;">
      <button class="btn btn-secondary" id="lp-prev" ${!prevId ? 'disabled' : ''}>← Previous</button>
      <button class="btn btn-primary" id="lp-next" ${nextDisabled ? 'disabled title="Complete all required content above to continue"' : ''}>${nextLabel}</button>
    </div>
  `;

  learnerShell(course, body, { activeLessonId: lessonId, showReturn: true });
  bindLearnerBlockEvents(course, blocks, ctx);

  // Hydrate URL cache for asset:// refs in lesson blocks, then re-render if any were cold.
  AssetStore.preloadBlocks(blocks).then(count => {
    if (count > 0) renderLearnerLesson(course, lessonId);
  });

  // Resume restoration: if we just navigated to the exact lesson the learner
  // was last on, restore their scroll/block position once render has settled.
  // Only ever fires once per navigation (consumes the pending flag), and never
  // on the initial 0,0 navigate() scroll reset for unrelated lessons.
  const isResumeTarget = LumioState.resume && LumioState.resume.courseId === course.id && LumioState.resume.lessonId === lessonId;
  if (isResumeTarget && LumioState.resume.scrollY) {
    const targetY = LumioState.resume.scrollY;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, targetY)));
  }

  // Block-level bookmarking: track the actual rendered block closest to the
  // top of the viewport as the learner scrolls (debounced), using the real
  // data-lp-index DOM positions — never estimated.
  if (LearnerUI._scrollHandler) window.removeEventListener('scroll', LearnerUI._scrollHandler);
  let resumeScrollTimer = null;
  function captureScrollPosition() {
    const nodes = document.querySelectorAll(`[data-lp-lesson="${lessonId}"][data-lp-index]`);
    let closestIndex = 0;
    let closestDist = Infinity;
    nodes.forEach(node => {
      const dist = Math.abs(node.getBoundingClientRect().top);
      if (dist < closestDist) { closestDist = dist; closestIndex = parseInt(node.dataset.lpIndex, 10); }
    });
    recordResume(course.id, lessonId, closestIndex, window.scrollY);
  }
  LearnerUI._scrollHandler = () => {
    if (resumeScrollTimer) clearTimeout(resumeScrollTimer);
    resumeScrollTimer = setTimeout(captureScrollPosition, 400);
  };
  window.addEventListener('scroll', LearnerUI._scrollHandler, { passive: true });
  // Record the entry position immediately so a resume exists even if the
  // learner never scrolls (e.g. a short lesson).
  recordResume(course.id, lessonId, 0, window.scrollY);

  document.getElementById('lp-prev')?.addEventListener('click', () => {
    if (prevId) navigate('#/learner/' + course.id + '/' + prevId);
  });
  document.getElementById('lp-next')?.addEventListener('click', () => {
    // Defense in depth: re-check the gate inside the handler itself rather
    // than trusting only the HTML `disabled` attribute set at render time —
    // closes any bypass via devtools/programmatic dispatch, matching the
    // "single source of truth, no bypass path" requirement.
    if (!CompletionEngine.isLessonReadyForNext(blocks, ctx, LearnerUI.revealedContinues[lessonId] || new Set())) return;
    if (!isAssessment && !progress.completedLessons.includes(lessonId)) {
      progress.completedLessons.push(lessonId);
      progress.lessonCompletedAt[lessonId] = Date.now();
    }
    if (isAssessment) {
      recordAssessmentAttempt(lesson, lessonId, blocks, progress, course.id);
      if (isLastAssessment) {
        progress.courseStatus = 'completed';
        progress.courseCompletedAt = Date.now();
        scheduleLumioSave();
        navigate('#/learner/' + course.id);
        setTimeout(() => toast('🎉 Course complete!', '🎉'), 50);
      } else {
        navigate('#/learner/' + course.id + '/' + course.assessments[assessmentIdx + 1].id);
      }
    } else if (isLastLesson) {
      if (nextAfterLastLesson) {
        navigate('#/learner/' + course.id + '/' + nextAfterLastLesson);
      } else {
        progress.courseStatus = 'completed';
        progress.courseCompletedAt = Date.now();
        scheduleLumioSave();
        navigate('#/learner/' + course.id);
        setTimeout(() => toast('🎉 Course complete!', '🎉'), 50);
      }
    } else {
      navigate('#/learner/' + course.id + '/' + course.lessons[lessonIdx + 1].id);
    }
  });
}

/* ---------------- BLOCK RENDERING ---------------- */
function renderLearnerBlocks(blocks, ctx) {
  if (!blocks.length) {
    return `
      <div style="padding:60px 30px; background:var(--surface-0); border:1px solid var(--border); border-radius:var(--r-lg); box-shadow:none; text-align:center;">
        <div style="font-size:40px;">📭</div>
        <h3 class="mt-16" style="font-size:16px;">This lesson has no content yet</h3>
      </div>`;
  }

  const revealed = LearnerUI.revealedContinues[ctx.lessonId] || new Set();
  ctx.blocks = blocks;
  let html = '';
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const ds = block.design || {};
    const alignStyle = ds.align ? `text-align:${ds.align};` : '';
    const extraStyle = `${alignStyle} ${textBlockExtraStyle(block)}${statementBlockExtraStyle(block)}${quoteBlockExtraStyle(block)}${listBlockExtraStyle(block)}`;
    const { treatment } = DesignSystem.resolveBlockStyle(block);
    const nextBlock = blocks[i + 1] || null;
    const flowMargin = (treatment === 'cardless') ? cardlessFlowMargin(block, nextBlock) : FLOW_SPACING;
    let wrapperStyle;
    if (treatment === 'cardless') {
      // Cardless: flat page content, no card chrome. Same spacing logic as builder.
      wrapperStyle = `background:transparent; box-shadow:none; border:none; border-radius:0; margin-bottom:${flowMargin}; padding:3px 22px; ${extraStyle}`;
    } else {
      // Card-treatment: white background, 1px border, NO shadow (Preview = Published rule).
      // Sprint 3C fix: this border was hardcoded to var(--border) (flat
      // system grey) regardless of the course's selected Page Background —
      // root cause of the "grey box on a white page" report, shared by
      // every 'card'-treatment block (Tabs, Accordion, Process, Labelled
      // Graphic, Scenario, Knowledge Checks, Charts). Single source of truth:
      // DesignSystem.resolveBlockStyle()'s 'card' branch, fixed once here.
      // --theme-bg-solid (set per-course in themeVarStyle, wizard.js) is a
      // guaranteed-solid colour even for the two gradient Page Background
      // presets, so the border can blend into ANY selected background.
      const bgStyle = ds.bg && ds.bg !== 'transparent' ? `background:${ds.bg};` : 'background:var(--surface-0);';
      const radiusStyle = ds.radius ? `border-radius:${RADIUS_MAP[ds.radius] || 'var(--theme-radius, var(--r-lg))'};` : 'border-radius:var(--theme-radius, var(--r-lg));';
      wrapperStyle = `${bgStyle} ${radiusStyle} box-shadow:none; border:1px solid var(--theme-bg-solid, var(--border)); margin-bottom:${FLOW_SPACING}; padding:3px 22px; ${extraStyle}`;
    }
    html += `<div data-lp-lesson="${ctx.lessonId}" data-lp-index="${i}" style="${wrapperStyle}">${renderLearnerBlock(block, i, ctx)}</div>`;
    if (block.type === 'continue' && !revealed.has(i)) break;
  }
  return html;
}

function renderLearnerBlock(block, index, ctx) {
  switch (block.type) {
    case 'continue': return learnerContinueBlock(block, index, ctx);
    case 'kc_multiple_choice': return learnerKcMultipleChoice(block, index, ctx);
    case 'kc_multiple_response': return learnerKcMultipleResponse(block, index, ctx);
    case 'kc_matching': return learnerKcMatching(block, index, ctx);
    case 'kc_ordering': return learnerKcOrdering(block, index, ctx);
    case 'kc_fill_gap': return learnerKcFillGap(block, index, ctx);
    case 'file': return learnerFileBlock(block, index, ctx);
    case 'video': return learnerVideoBlock(block, index, ctx);
    case 'audio': return learnerAudioBlock(block, index, ctx);
    case 'carousel': return learnerCarouselBlock(block, index, ctx);
    case 'quote_carousel': return learnerQuoteCarouselBlock(block, index, ctx);
    case 'list_checkbox': return learnerListCheckboxBlock(block, index, ctx);
    case 'accordion': {
      const settings = block.settings || {};
      if (settings.expandFirst !== false) CompletionEngine.markOpened(ctx, index, 0);
      return renderBlockContent(block, false);
    }
    case 'tabs': {
      const d = block.data || {};
      const items = d.items || [];
      let active = (block.settings || {}).defaultTab || 0;
      if (active < 0 || active >= items.length) active = 0;
      CompletionEngine.markVisited(ctx, index, active);
      return renderBlockContent(block, false);
    }
    case 'process': {
      CompletionEngine.markVisited(ctx, index, 0);
      return renderBlockContent(block, false);
    }
    case 'scenario': {
      const d = block.data || {};
      const scenes = d.scenes || [];
      if (scenes.length && !(scenes[0].choices && scenes[0].choices.length)) {
        CompletionEngine.markCompleted(ctx, index);
      }
      return renderBlockContent(block, false);
    }
    default: return renderBlockContent(block, false);
  }
}

/* Re-evaluates the lock state of any not-yet-revealed Continue buttons for
   this lesson in place (no full re-render), so completing an interactive
   block above immediately enables/hides-hint-on a dependent Continue button
   without disrupting the interaction the learner just performed (e.g. an
   accordion's open animation). */
function refreshContinueLocks(ctx) {
  const blocks = ctx.blocks || LumioState.lessons[ctx.lessonId] || [];
  const revealed = LearnerUI.revealedContinues[ctx.lessonId] || new Set();
  document.querySelectorAll(`.lp-continue[data-lesson="${ctx.lessonId}"]`).forEach(btn => {
    const index = parseInt(btn.dataset.index, 10);
    if (revealed.has(index)) return;
    const locked = CompletionEngine.isContinueLocked(blocks, index, ctx);
    btn.disabled = locked;
    btn.style.opacity = locked ? '0.5' : '';
    btn.style.cursor = locked ? 'not-allowed' : '';
    const hintEl = btn.parentElement.querySelector('.lumio-continue-hint');
    if (hintEl) hintEl.style.display = locked ? '' : 'none';
  });
}

/* Re-evaluates the Next button's disabled state in place (no full
   re-render) — used by signals that arrive asynchronously and wouldn't
   otherwise trigger a re-render: a block scrolling into view, or a video/
   audio element firing 'ended'. Click-driven interactions (Continue,
   accordions, KC submission, etc.) already trigger a full rerender(),
   which recomputes the same disabled state inline in the footer template. */
function refreshNextButtonState(ctx) {
  const btn = document.getElementById('lp-next');
  if (!btn) return;
  const blocks = ctx.blocks || LumioState.lessons[ctx.lessonId] || [];
  const revealed = LearnerUI.revealedContinues[ctx.lessonId] || new Set();
  const disabled = !CompletionEngine.isLessonReadyForNext(blocks, ctx, revealed);
  btn.disabled = disabled;
  btn.title = disabled ? 'Complete all required content above to continue' : '';
}

/* ---- Continue (progression gate) ---- */
function learnerContinueBlock(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const revealed = (LearnerUI.revealedContinues[ctx.lessonId] || new Set()).has(index);
  const locked = !revealed && CompletionEngine.isContinueLocked(ctx.blocks || [], index, ctx);
  const srOnlyStyle = 'position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;';
  const align = ds.align || 'center';
  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
  return `
    <div style="${continueWrapperStyle(ds)} display:flex; flex-direction:column; align-items:${justifyMap[align] || 'center'}; gap:8px;">
      ${revealed
        ? `<span class="pill pill-grey">✓ Continued</span>`
        : `<button class="btn lumio-continue-btn lp-continue" data-lesson="${ctx.lessonId}" data-index="${index}" style="${continueButtonStyle(ds)} ${locked ? 'opacity:0.5; cursor:not-allowed;' : ''}" ${locked ? 'disabled' : ''}>${richTextOut(d.label || 'Continue')}</button>`}
      ${locked && d.hint ? `<p class="text-sm text-muted lumio-continue-hint" style="text-align:${align}; margin:0;">${escapeHtml(d.hint)}</p>` : ''}
      <span aria-live="polite" style="${srOnlyStyle}">${revealed ? 'Additional content revealed below.' : ''}</span>
    </div>`;
}

/* ---- File / Video / Audio ----
   All three use the shared renderBlockContent renderer so Builder and Preview
   stay in parity — Preview is the only mode where autoplay/loop settings apply. */
function learnerFileBlock(block, index, ctx) {
  return renderBlockContent(block, false);
}

function learnerVideoBlock(block, index, ctx) {
  const d = block.data || {};
  const html = renderBlockContent(block, false);
  // Direct/uploaded video renders a real <video> element (class
  // block-video-el) — its 'ended' event reliably marks the block watched
  // (wired in bindLearnerBlockEvents). A YouTube/Vimeo embed renders an
  // <iframe>; there is no postMessage/IFrame Player API integration today,
  // so there is no reliable in-page signal for "watched" — rather than
  // assume one, a manual control is offered instead.
  const embed = !d.src && d.url ? parseVideoEmbedUrl(d.url) : null;
  const needsManualMark = !d.src && embed && (embed.type === 'youtube' || embed.type === 'vimeo');
  if (!needsManualMark) return html;
  const watched = !!(ctx.progress.blockProgress && ctx.progress.blockProgress[ctx.lessonId + ':' + index] && ctx.progress.blockProgress[ctx.lessonId + ':' + index].watched);
  return `${html}
    <div class="mt-8" style="text-align:center;">
      <button class="btn btn-secondary btn-sm lp-mark-watched" data-block-index="${index}" ${watched ? 'disabled' : ''}>${watched ? '✓ Marked as watched' : 'Mark video as watched'}</button>
    </div>`;
}

function learnerAudioBlock(block, index, ctx) {
  return renderBlockContent(block, false);
}

/* ---- Carousel ---- */
function learnerCarouselBlock(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const slides = normalizeCarouselItems(d);
  const key = ctx.lessonId + ':' + index;
  const active = ((LearnerUI.carouselIndex[key] || 0) % slides.length + slides.length) % slides.length;
  CompletionEngine.markVisited(ctx, index, active);
  const slide = slides[active];
  const fitMap = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none' };
  // Sprint 3D-B/C remaining-work fix: this dedicated learner renderer had
  // hardcoded image radius and no Border/Padding at all — diverged from the
  // Builder's carousel case (lessonBuilder.js renderBlockContent), which now
  // reads ds.imageRadius/panelBorder/paddingTop. Brought into parity here.
  const carRadius = IMAGE_RADIUS_MAP[ds.imageRadius || 'soft'];
  const carBorder = interactiveBorderStyle(ds);
  let slideHtml;
  if (!slide.src) {
    slideHtml = `<div style="text-align:center; min-height:120px; display:flex; align-items:center; justify-content:center; background:var(--pastel-lavender); border-radius:${carRadius}; box-shadow:none; border:none; padding:24px;">
        <span style="font-weight:600; font-size:14px;">${escapeHtml(slide.title || slide.description || `Slide ${active + 1}`)}</span>
      </div>`;
  } else if ((slide.imageFit || 'cover') === 'full') {
    const rSrc = AssetStore.resolveMediaSrc(slide.src);
    slideHtml = `<div class="image-zoom-trigger" data-zoom-src="${rSrc}" data-zoom-alt="" style="position:relative; width:100%; aspect-ratio:16/9; border-radius:${carRadius}; border:${carBorder}; overflow:hidden; cursor:zoom-in;"><img src="${rSrc}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block;" /></div>`;
  } else {
    const of = fitMap[slide.imageFit] || 'cover';
    const rSrc = AssetStore.resolveMediaSrc(slide.src);
    slideHtml = `<img src="${rSrc}" alt="" class="image-zoom-trigger" data-zoom-src="${rSrc}" data-zoom-alt="" style="width:100%; aspect-ratio:16/9; height:auto; object-fit:${of}; ${of === 'none' ? 'background:var(--surface-50);' : ''} border-radius:${carRadius}; border:${carBorder}; display:block; cursor:zoom-in;" />`;
  }
  const textHtml = `${slide.title ? `<div class="text-sm mt-8" style="font-weight:600; text-align:center;">${escapeHtml(slide.title)}</div>` : ''}${slide.description ? `<div class="text-sm text-muted mt-4" style="text-align:center;">${escapeHtml(slide.description)}</div>` : ''}`;
  return `
    <div style="${interactiveSpacingStyle(ds)}">
      ${slideHtml}
      ${textHtml}
      <div class="flex items-center justify-between mt-8">
        <button class="btn btn-secondary btn-sm lp-carousel-prev" data-key="${key}" ${slides.length<2?'disabled':''} aria-label="Previous slide">← Prev</button>
        <div class="flex gap-8" role="group" aria-label="Slide indicators">
          ${slides.map((_,i)=>`<span style="width:8px; height:8px; border-radius:50%; display:inline-block; background:${i===active?'var(--indigo)':'var(--border)'};"></span>`).join('')}
        </div>
        <button class="btn btn-secondary btn-sm lp-carousel-next" data-key="${key}" ${slides.length<2?'disabled':''} aria-label="Next slide">Next →</button>
      </div>
    </div>`;
}

/* ---- Quote Carousel ---- */
function learnerQuoteCarouselBlock(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const quotes = normalizeQuoteItems(d);
  const key = ctx.lessonId + ':' + index;
  const active = ((LearnerUI.quoteCarouselIndex[key] || 0) % quotes.length + quotes.length) % quotes.length;
  CompletionEngine.markVisited(ctx, index, active);
  const q = quotes[active];
  // Remediation Sprint 1, Phase 2: this learner-runtime renderer is a
  // SEPARATE code path from the Builder canvas's renderBlockContent — it
  // must independently adopt the same Architecture A migration
  // (quoteCardBgStyle) or the dedicated renderer would silently diverge
  // from the Builder again, exactly as happened with the old accent system.
  const cardBgStyleStr = quoteCardBgStyle(ds);
  // Sprint 1 Final Validation finding: same missing text-colour contrast
  // switch as the Builder renderer — fixed in both independently, since
  // this is the dedicated learner-runtime code path.
  const qcTextColor = archATextColor(ds);
  return `
    <div>
      <div style="min-height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; ${cardBgStyleStr} border-radius:var(--r-md); box-shadow:none; padding:20px 24px; color:${qcTextColor};">
        ${q.avatar ? `<img src="${AssetStore.resolveMediaSrc(q.avatar)}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover; margin-bottom:8px;" />` : ''}
        <p class="text-sm" style="color:${qcTextColor};${q.textAlign ? ` text-align:${q.textAlign};` : ''}">${richTextOut(q.text || '')}</p>
        ${q.author ? `<p class="text-sm mt-8" style="color:${qcTextColor}; opacity:0.7;${q.authorAlign ? ` text-align:${q.authorAlign};` : ''}">${richTextOut(q.author)}</p>` : ''}
      </div>
      <div class="flex items-center justify-between mt-8">
        <button class="btn btn-secondary btn-sm lp-quote-prev" data-key="${key}" ${quotes.length<2?'disabled':''} aria-label="Previous quote">← Prev</button>
        <div class="flex gap-8" role="group" aria-label="Quote indicators">
          ${quotes.map((_,i)=>`<span style="width:8px; height:8px; border-radius:50%; display:inline-block; background:${i===active?'var(--indigo)':'var(--border)'};"></span>`).join('')}
        </div>
        <button class="btn btn-secondary btn-sm lp-quote-next" data-key="${key}" ${quotes.length<2?'disabled':''} aria-label="Next quote">Next →</button>
      </div>
    </div>`;
}

/* ---- Checkbox list (interactive — learners can tick/untick; state persists for the session) ---- */
function learnerListCheckboxBlock(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const def = LIST_DEFAULTS[block.type];
  const items = normalizeListItems(d, def.items);
  const key = ctx.lessonId + ':' + index;
  if (!LearnerUI.listChecked[key]) {
    // Seeded ONLY from persisted learner runtime state (blockProgress),
    // never from item.checked — that field is authored content (e.g. set
    // by clicking a checkbox in the Builder canvas) and must never
    // determine a learner's starting state. A fresh Preview/Export/SCORM
    // launch always begins unchecked; a returning learner's own prior
    // ticks are restored from CompletionEngine's persisted record.
    LearnerUI.listChecked[key] = new Set(CompletionEngine.getChecklistChecked(ctx, index));
  }
  const checkedSet = LearnerUI.listChecked[key];
  const indent = ds.indent ?? 20;
  const itemsHtml = renderListItemsHtml(block, ds, items, false, { checkedSet, key });
  return `<h3 style="font-size:15px; margin-bottom:10px;">${richTextOut(d.heading != null ? d.heading : def.heading)}</h3>
    <div class="list-items-wrap" role="list" style="padding-left:${indent}px;">${itemsHtml}</div>`;
}

/* ---- Knowledge Checks ---- */

// Normalise KC block.settings with safe defaults so the rest of the engine
// can read from a single object without null-checking every field.
function normalizeKcSettings(s) {
  s = s || {};
  return {
    maxAttempts:         s.maxAttempts ?? 0,           // 0 = unlimited
    allowRetry:          s.allowRetry !== false,        // default true
    lockAfterFinalAttempt: s.lockAfterFinalAttempt !== false, // default true — preserves existing behaviour
    requireCorrectAnswer: !!(s.requireCorrectAnswer),
    completionRule:      s.completionRule  || 'submitted',
    showCorrectAnswer:   s.showCorrectAnswer || 'immediately',
    passingMode:         s.passingMode || 'all_correct',
    passingPercentage:   s.passingPercentage ?? 80,
    correctFeedback:     s.correctFeedback   ?? 'Correct! Well done.',
    incorrectFeedback:   s.incorrectFeedback ?? 'Not quite. Please try again.',
  };
}

// Determine whether to reveal the correct-answer highlights right now.
function shouldRevealCorrect(ans, settings) {
  if (!ans || !ans.submitted) return false;
  switch (settings.showCorrectAnswer) {
    case 'after_final': return !!(ans.locked);
    case 'never':       return false;
    default:            return true; // 'immediately'
  }
}

// Attempt counter shown above the submit button (pre-submission).
function kcAttemptNote(ans, settings) {
  if (!settings.maxAttempts) return '';
  const n = (ans && ans.attempts) || 0;
  return `<div class="text-xs text-muted mt-8">Attempt ${n + 1} of ${settings.maxAttempts}</div>`;
}

// Feedback + optional retry button shown after submission.
function kcPostSubmitFooter(ans, settings, key) {
  const locked      = !!(ans && ans.locked);
  const attempts    = (ans && ans.attempts) || 0;
  const maxAttempts = settings.maxAttempts;
  const lastCorrect = ans && ans.lastCorrect;
  const canRetry    = !locked && settings.allowRetry;

  const feedbackText  = lastCorrect === true  ? settings.correctFeedback
                      : lastCorrect === false ? settings.incorrectFeedback
                      : 'Response recorded.';
  const feedbackColor = lastCorrect === true  ? 'var(--teal)'
                      : lastCorrect === false ? 'var(--color-destructive)'
                      : 'var(--ink-700)';
  const prefix        = lastCorrect === true ? '✓ ' : lastCorrect === false ? '✕ ' : '';
  const attemptLine   = maxAttempts > 0
    ? `<div class="text-xs text-muted mb-4">Attempt ${attempts} of ${maxAttempts}</div>`
    : '';
  return `
    <div class="mt-12">
      ${attemptLine}
      <div class="text-sm" style="font-weight:600; color:${feedbackColor};">${prefix}${escapeHtml(feedbackText)}</div>
      ${canRetry ? `<button class="btn btn-secondary btn-sm mt-8 lp-kc-retry" data-kc-key="${key}">Try Again</button>` : ''}
    </div>`;
}

// Sprint 3D-C, Phase 7 fix: Knowledge Checks have a dedicated learner-runtime
// renderer (this file), separate from the Builder's shared renderBlockContent
// — a Builder-only Border/Padding fix there does not reach here. Each
// learnerKc* function below now wraps its markup the same way the Builder's
// case 'kc_*' does (interactiveBorderStyle/interactiveSpacingStyle, shared
// with Accordion/Tabs/Process/Flashcards), so the two renderers stay in sync.
function learnerKcWrap(ds, html) {
  return `<div style="${interactiveSpacingStyle(ds)} border:${interactiveBorderStyle(ds)}; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'};">${html}</div>`;
}

function learnerKcMultipleChoice(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const options = normalizeKcOptions(d);
  const correct = d.correct ?? 0;
  const key = ctx.lessonId + ':' + (block.id || index);
  const ans = ctx.progress.kcAnswers[key];
  const settings = normalizeKcSettings(block.settings);
  const submitted = !!(ans && ans.submitted);
  const reveal = shouldRevealCorrect(ans, settings);
  const canSubmit = ans && ans.selected !== undefined;
  return learnerKcWrap(ds, `
    <div class="pill pill-teal mb-8 kc-badge"${kcBadgeStyle(ds)}>✅ Knowledge Check · Multiple Choice</div>
    <fieldset style="border:none; margin:0; padding:0;">
      <legend style="font-weight:600; font-size:14px; padding:0; width:100%;">${d.question || 'Which of the following is correct?'}</legend>
      <div class="flex-col gap-8 mt-12">
        ${options.map((o, i) => {
          const isSelected = ans && ans.selected === i;
          const isCorrect  = reveal && i === correct;
          const isWrong    = reveal && isSelected && i !== correct;
          const cls = `kc-option${isCorrect ? ' correct' : ''}${isWrong ? ' wrong' : ''}${isSelected && !reveal ? ' selected' : ''}`;
          return `
          <label class="${cls}" style="cursor:${submitted ? 'default' : 'pointer'};">
            <input type="radio" name="kc-${key}" data-kc-key="${key}" data-i="${i}"
              ${isSelected ? 'checked' : ''} ${submitted ? 'disabled' : ''} />
            <span style="flex:1;">${escapeHtml(o)}</span>
            ${isCorrect ? '<span style="color:var(--teal); font-size:12px; font-weight:600;">✓ Correct</span>' : ''}
            ${isWrong   ? '<span class="text-destructive" style="font-size:12px; font-weight:600;">✕ Your answer</span>' : ''}
          </label>`;
        }).join('')}
      </div>
    </fieldset>
    ${!submitted
      ? `${kcAttemptNote(ans, settings)}<button class="btn btn-primary btn-sm mt-12 lp-kc-submit" data-kc-key="${key}" data-kc-type="mc" ${canSubmit ? '' : 'disabled'}>Check Answer</button>`
      : kcPostSubmitFooter(ans, settings, key)}
  `);
}

function learnerKcMultipleResponse(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const options = normalizeKcOptions(d);
  const key = ctx.lessonId + ':' + (block.id || index);
  const ans = ctx.progress.kcAnswers[key] || { selected: [] };
  const settings = normalizeKcSettings(block.settings);
  const submitted = ans.submitted;
  const hasCorrect = Array.isArray(d.correct);
  const reveal = shouldRevealCorrect(ans, settings);
  return learnerKcWrap(ds, `
    <div class="pill pill-teal mb-8 kc-badge"${kcBadgeStyle(ds)}>✅ Knowledge Check · Select all that apply</div>
    <fieldset style="border:none; margin:0; padding:0;">
      <legend style="font-weight:600; padding:0; width:100%;">${d.question || 'Select all that apply.'}</legend>
      <div class="flex-col gap-8 mt-12">
        ${options.map((o, i) => {
          const isSelected = (ans.selected || []).includes(i);
          const isCorrect  = reveal && hasCorrect && d.correct.includes(i);
          const isWrong    = reveal && isSelected && hasCorrect && !d.correct.includes(i);
          const cls = `kc-option${isCorrect ? ' correct' : ''}${isWrong ? ' wrong' : ''}${isSelected && !reveal ? ' selected' : ''}`;
          return `
          <label class="${cls}" style="cursor:${submitted ? 'default' : 'pointer'};">
            <input type="checkbox" data-kc-key="${key}" data-i="${i}"
              ${isSelected ? 'checked' : ''} ${submitted ? 'disabled' : ''} />
            <span style="flex:1;">${escapeHtml(o)}</span>
            ${isCorrect ? '<span style="color:var(--teal); font-size:12px; font-weight:600;">✓</span>' : ''}
          </label>`;
        }).join('')}
      </div>
    </fieldset>
    ${!submitted
      ? `${kcAttemptNote(ans, settings)}<button class="btn btn-primary btn-sm mt-12 lp-kc-submit" data-kc-key="${key}" data-kc-type="response" ${(ans.selected || []).length ? '' : 'disabled'}>Check Answer</button>`
      : kcPostSubmitFooter(ans, settings, key)}
  `);
}

function learnerKcMatching(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const left  = normalizeKcLeft(d);
  const right = normalizeKcRight(d);
  const key = ctx.lessonId + ':' + (block.id || index);
  const ans = ctx.progress.kcAnswers[key] || { pairs: {}, selectedLeft: null };
  const pairs = ans.pairs || {};
  const settings = normalizeKcSettings(block.settings);
  const submitted = ans.submitted;
  const locked    = !!(ans.locked);
  const reveal    = shouldRevealCorrect(ans, settings);
  return learnerKcWrap(ds, `
    <div class="pill pill-teal mb-8 kc-badge"${kcBadgeStyle(ds)}>✅ Knowledge Check · Matching</div>
    <p class="text-sm text-muted mb-8">Tap an item on the left, then its match on the right.</p>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="flex-col gap-8">
        ${left.map((l, i) => {
          const matchedTo  = Object.prototype.hasOwnProperty.call(pairs, i) ? right[pairs[i]] || '' : '';
          const isCorrect  = reveal && pairs[i] === i;
          const isWrong    = reveal && Object.prototype.hasOwnProperty.call(pairs, i) && pairs[i] !== i;
          const label      = matchedTo ? `${l}, matched with ${matchedTo}` : `${l}${ans.selectedLeft === i ? ', selected' : ''}`;
          return `
          <div class="kc-option lp-match-left${ans.selectedLeft === i ? ' selected' : ''}${isCorrect ? ' correct' : ''}${isWrong ? ' wrong' : ''}" data-kc-key="${key}" data-i="${i}"
            role="button" tabindex="${locked ? '-1' : '0'}" aria-pressed="${ans.selectedLeft === i}" aria-label="${escapeHtml(label)}"
            style="cursor:${locked ? 'default' : 'pointer'};">
            ${escapeHtml(l)}${matchedTo ? ` → ${escapeHtml(matchedTo)}` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="flex-col gap-8">
        ${right.map((r, i) => `
          <div class="kc-option lp-match-right" data-kc-key="${key}" data-i="${i}"
            role="button" tabindex="${locked ? '-1' : '0'}" aria-label="${escapeHtml(r)}"
            style="cursor:${locked ? 'default' : 'pointer'}; background:var(--pastel-lavender); border-color:transparent;">${escapeHtml(r)}</div>
        `).join('')}
      </div>
    </div>
    ${!submitted
      ? `${kcAttemptNote(ans, settings)}<button class="btn btn-primary btn-sm mt-12 lp-match-submit" data-kc-key="${key}" ${Object.keys(pairs).length === left.length ? '' : 'disabled'}>Check Matches</button>`
      : kcPostSubmitFooter(ans, settings, key)}
  `);
}

function learnerKcOrdering(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const items = normalizeKcItems(d);
  const key = ctx.lessonId + ':' + (block.id || index);
  let ans = ctx.progress.kcAnswers[key];
  if (!ans || !ans.order) {
    ans = { ...(ans || {}), order: shuffleArray(items.map((_, i) => i)) };
    ctx.progress.kcAnswers[key] = ans;
  }
  const order = ans.order;
  const settings = normalizeKcSettings(block.settings);
  const submitted = ans.submitted;
  const reveal    = shouldRevealCorrect(ans, settings);
  return learnerKcWrap(ds, `
    <div class="pill pill-teal mb-8 kc-badge"${kcBadgeStyle(ds)}>✅ Knowledge Check · Put in order</div>
    <p class="text-sm text-muted mb-8">Use the arrows to arrange these in the correct order.</p>
    <div class="flex-col gap-8 mt-8">
      ${order.map((itemIdx, pos) => {
        const inCorrectPos = reveal && itemIdx === pos;
        const inWrongPos   = reveal && itemIdx !== pos;
        return `
        <div class="kc-option${inCorrectPos ? ' correct' : ''}${inWrongPos ? ' wrong' : ''}" style="gap:10px;">
          <span class="pill pill-grey" style="flex-shrink:0;">${pos + 1}</span>
          <span style="flex:1;">${escapeHtml(items[itemIdx])}</span>
          ${!submitted ? `
            <button class="btn-icon lp-order-up"   data-kc-key="${key}" data-block-index="${index}" data-i="${pos}" ${pos === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-icon lp-order-down" data-kc-key="${key}" data-block-index="${index}" data-i="${pos}" ${pos === order.length - 1 ? 'disabled' : ''}>↓</button>
          ` : ''}
          ${inCorrectPos ? '<span style="color:var(--teal); font-size:12px; font-weight:600;">✓</span>' : ''}
          ${inWrongPos   ? '<span class="text-destructive" style="font-size:12px; font-weight:600;">✕</span>'   : ''}
        </div>`;
      }).join('')}
    </div>
    ${!submitted
      ? `${kcAttemptNote(ans, settings)}<button class="btn btn-primary btn-sm mt-12 lp-order-submit" data-kc-key="${key}">Check Order</button>`
      : kcPostSubmitFooter(ans, settings, key)}
  `);
}

function learnerKcFillGap(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const key = ctx.lessonId + ':' + (block.id || index);
  const ans = ctx.progress.kcAnswers[key] || {};
  const text = d.text || 'Complete this sentence: ____.';
  const settings = normalizeKcSettings(block.settings);
  const submitted = ans.submitted;
  const reveal    = shouldRevealCorrect(ans, settings);
  return learnerKcWrap(ds, `
    <div class="pill pill-teal mb-8 kc-badge"${kcBadgeStyle(ds)}>✅ Knowledge Check · Fill the Gap</div>
    <p style="font-size:15px; line-height:2;">${text}</p>
    <input class="input lp-kc-fillgap-input" data-kc-key="${key}" placeholder="Type your answer..."
      value="${(ans.response || '').replace(/"/g, '&quot;')}" ${submitted ? 'disabled' : ''} />
    ${reveal && ans.lastCorrect === false
      ? (() => {
          const firstAccepted = (Array.isArray(d.answers) && d.answers[0])
            ? d.answers[0]
            : (d.answer || '').split('|')[0].trim();
          return firstAccepted ? `<div class="text-xs text-muted mt-4">Accepted answer: ${escapeHtml(firstAccepted)}</div>` : '';
        })()
      : ''}
    ${!submitted
      ? `${kcAttemptNote(ans, settings)}<button class="btn btn-primary btn-sm mt-12 lp-kc-fillgap-submit" data-kc-key="${key}">Submit</button>`
      : kcPostSubmitFooter(ans, settings, key)}
  `);
}

/* ---------------- SCORING ---------------- */
function computeKcScore(type, ans, d) {
  if (type === 'mc') {
    const c = ans.selected === (d.correct ?? 0);
    return { correct: c, score: c ? 1 : 0, total: 1 };
  }
  if (type === 'response') {
    if (!Array.isArray(d.correct)) return { correct: null, score: 0, total: 0 };
    const sel = new Set(ans.selected || []);
    const exp = new Set(d.correct);
    const matching = d.correct.filter(i => sel.has(i)).length;
    const c = sel.size === exp.size && [...sel].every(x => exp.has(x));
    return { correct: c, score: matching, total: d.correct.length };
  }
  if (type === 'ordering') {
    const order = ans.order || (d.items || []).map((_, i) => i);
    const c = order.every((v, i) => v === i);
    return { correct: c, score: order.filter((v, i) => v === i).length, total: order.length };
  }
  if (type === 'matching') {
    const left = d.left || [];
    const pairs = ans.pairs || {};
    const c = left.every((_, i) => pairs[i] === i);
    return { correct: c, score: left.filter((_, i) => pairs[i] === i).length, total: left.length };
  }
  if (type === 'fill_gap') {
    let accepted = [];
    if (Array.isArray(d.answers) && d.answers.length) {
      accepted = d.answers.map(a => (a || '').trim()).filter(Boolean);
    } else {
      accepted = (d.answer || '').split('|').map(s => s.trim()).filter(Boolean);
    }
    if (!accepted.length) return { correct: null, score: 0, total: 0 };
    const response = (ans.response || '').trim();
    const norm = d.caseSensitive ? response : response.toLowerCase();
    const normAcc = accepted.map(a => d.caseSensitive ? a : a.toLowerCase());
    const c = normAcc.includes(norm);
    return { correct: c, score: c ? 1 : 0, total: 1 };
  }
  return { correct: null, score: 0, total: 0 };
}

function isKcPassed(scoreResult, settings) {
  if (scoreResult.correct === null) return false;
  if (settings.passingMode === 'percentage') {
    if (!scoreResult.total) return false;
    return (scoreResult.score / scoreResult.total) * 100 >= (settings.passingPercentage || 80);
  }
  return scoreResult.correct === true; // all_correct
}

function submitKc(ctx, key, type, blocks) {
  const ans = ctx.progress.kcAnswers[key] || {};
  if (ans.locked) return;
  // key's suffix is normally a stable block id ("blk_xxx"); a purely
  // numeric suffix only occurs for stale, not-yet-migrated keys (shouldn't
  // happen post-boot-migration, but resolved by index as a safe fallback
  // rather than failing outright).
  const suffix = key.slice(key.indexOf(':') + 1);
  const blockIndex = blocks.findIndex(b => b.id === suffix);
  const block = (blockIndex !== -1 ? blocks[blockIndex] : blocks[parseInt(suffix, 10)]) || {};
  const d = block.data || {};
  const settings = normalizeKcSettings(block.settings);

  const scoreResult = computeKcScore(type, ans, d);
  const passed = isKcPassed(scoreResult, settings);

  // Count this block in the score totals exactly once (first submission).
  if (!ans.attempts) {
    if (scoreResult.correct !== null) ctx.progress.score.total++;
  }
  if (passed && !ans.passed) {
    if (scoreResult.correct !== null) ctx.progress.score.correct++;
  }

  ans.attempts = (ans.attempts || 0) + 1;
  ans.submitted = true;
  ans.lastCorrect = scoreResult.correct;
  ans.partialScore = { score: scoreResult.score, total: scoreResult.total };
  if (passed) ans.passed = true;

  // Lock when passed, retry is disabled, or max attempts reached (the
  // last condition only applies if Lock After Final Attempt is enabled —
  // when disabled, an exhausted learner sees their final result but the
  // block does not lock itself; only Allow Retry / passing still apply).
  const maxAttempts = settings.maxAttempts;
  const exhausted = maxAttempts > 0 && ans.attempts >= maxAttempts && settings.lockAfterFinalAttempt;
  if (passed || !settings.allowRetry || exhausted) {
    ans.locked = true;
  }

  ctx.progress.kcAnswers[key] = ans;

  // Append (never overwrite) a new interaction history entry — this is the
  // record kcAnswers itself can no longer provide once a retake happens.
  recordInteraction(ctx, blockIndex, type, ans, scoreResult, d, block);
}

/* ---------------- INTERACTION HISTORY ---------------- */

// Maps Lumio's internal KC type tags onto the requested SCORM/xAPI-facing
// vocabulary (multiple_choice, true_false, reflection, matching, fill_in).
// 'ordering' has no clean match in that vocabulary — kept literal rather
// than forced into a misleading bucket; a future adapter can decide how to
// represent it for a given LMS/xAPI profile.
function _mapInteractionType(rawType, d) {
  if (rawType === 'mc') {
    const opts = normalizeKcOptions(d).map(o => (o || '').trim().toLowerCase());
    if (opts.length === 2 && opts.includes('true') && opts.includes('false')) return 'true_false';
    return 'multiple_choice';
  }
  if (rawType === 'response') return 'multiple_choice';
  if (rawType === 'matching') return 'matching';
  if (rawType === 'fill_gap') return 'fill_in';
  return rawType; // 'ordering', or any future type, passes through as-is
}

// Snapshots the learner's actual response in a stable, human-readable shape
// (not the internal ans.* indices alone) so history remains meaningful even
// if block content is edited later.
function _snapshotResponse(rawType, ans, d) {
  if (rawType === 'mc') {
    const opts = normalizeKcOptions(d);
    return opts[ans.selected] ?? ans.selected ?? null;
  }
  if (rawType === 'response') {
    const opts = normalizeKcOptions(d);
    return (ans.selected || []).map(i => opts[i] ?? i);
  }
  if (rawType === 'matching') {
    const left = normalizeKcLeft(d), right = normalizeKcRight(d);
    const pairs = ans.pairs || {};
    return left.map((l, i) => ({ left: l, right: right[pairs[i]] ?? null }));
  }
  if (rawType === 'ordering') {
    const items = normalizeKcItems(d);
    return (ans.order || []).map(i => items[i]);
  }
  if (rawType === 'fill_gap') return ans.response ?? '';
  return null;
}

function _snapshotCorrectResponse(rawType, d) {
  if (rawType === 'mc') {
    const opts = normalizeKcOptions(d);
    return opts[d.correct ?? 0] ?? null;
  }
  if (rawType === 'response') {
    const opts = normalizeKcOptions(d);
    return Array.isArray(d.correct) ? d.correct.map(i => opts[i] ?? i) : [];
  }
  if (rawType === 'matching') {
    const left = normalizeKcLeft(d), right = normalizeKcRight(d);
    return left.map((l, i) => ({ left: l, right: right[i] ?? null }));
  }
  if (rawType === 'ordering') return normalizeKcItems(d);
  if (rawType === 'fill_gap') {
    const answers = normalizeKcAnswers(d);
    return answers[0] || '';
  }
  return null;
}

// Appends one entry to LumioState.interactionHistory[courseId][lessonId][blockId].
// blockId is the block's own stable id (Entity Identity Hardening Sprint) —
// previously this was "lessonId:index", which both duplicated the lessonId
// already present one level up AND broke under reordering. `block` is the
// resolved block object (or null if somehow not found, falling back to the
// raw index so this never throws).
function recordInteraction(ctx, blockIndex, rawType, ans, scoreResult, d, block) {
  if (!LumioState.interactionHistory) LumioState.interactionHistory = {};
  const byCourse = LumioState.interactionHistory;
  if (!byCourse[ctx.courseId]) byCourse[ctx.courseId] = {};
  if (!byCourse[ctx.courseId][ctx.lessonId]) byCourse[ctx.courseId][ctx.lessonId] = {};
  const blockId = (block && block.id) || blockIndex;
  const history = byCourse[ctx.courseId][ctx.lessonId][blockId] || (byCourse[ctx.courseId][ctx.lessonId][blockId] = []);

  const result = scoreResult.correct === null ? 'ungraded'
    : scoreResult.correct === true ? 'correct'
    : (scoreResult.score > 0 && scoreResult.score < scoreResult.total) ? 'partial'
    : 'incorrect';

  history.push({
    timestamp: Date.now(),
    attemptNumber: history.length + 1,
    interactionType: _mapInteractionType(rawType, d),
    learnerResponse: _snapshotResponse(rawType, ans, d),
    correctResponse: _snapshotCorrectResponse(rawType, d),
    result,
    score: { raw: scoreResult.score, max: scoreResult.total },
  });

  scheduleLumioSave();
}

// Reads assessment-level settings (Passing Score, Attempts Allowed, Show
// Score, Show Answers, Lock After Pass) configured via the "Assessment
// Settings" menu in courseLanding.js. Additive/backward-compatible: an
// assessment with no settings yet behaves exactly as before this sprint
// (unlimited attempts, every-KC-passed determines pass/fail).
function normalizeAssessmentSettings(a) {
  const s = (a && a.settings) || {};
  return {
    passingScore:    s.passingScore ?? null,   // percentage threshold, or null = "every KC must pass" (legacy behaviour)
    attemptsAllowed: s.attemptsAllowed ?? 0,    // 0 = unlimited
    showScore:       s.showScore !== false,
    showAnswers:     s.showAnswers !== false,
    lockAfterPass:   !!s.lockAfterPass,
  };
}

// Whether the assessment itself (not an individual KC block within it) is
// locked from further attempts, per its own settings.
function isAssessmentLocked(assessment, history) {
  const s = normalizeAssessmentSettings(assessment);
  const list = history || [];
  if (s.attemptsAllowed > 0 && list.length >= s.attemptsAllowed) return true;
  if (s.lockAfterPass && list.some(h => h.passed)) return true;
  return false;
}

// Appends one entry to LumioState.assessmentAttempts[courseId][assessmentId],
// summarizing every KC block in that assessment's blocks at the moment the
// learner leaves it (clicks Next/Finish) — the natural "submission" event
// for an assessment. Namespaced under courseId (Entity Identity Hardening
// Sprint) — previously a flat assessmentAttempts[assessmentId], which meant
// two different courses both using assessment id "a1" would silently merge
// their attempt histories into one array (confirmed risk in the audit).
function recordAssessmentAttempt(assessment, lessonId, blocks, progress, courseId) {
  const assessmentId = assessment.id;
  if (!LumioState.assessmentAttempts) LumioState.assessmentAttempts = {};
  if (!LumioState.assessmentAttempts[courseId]) LumioState.assessmentAttempts[courseId] = {};
  const byCourse = LumioState.assessmentAttempts[courseId];
  const history = byCourse[assessmentId] || (byCourse[assessmentId] = []);
  if (isAssessmentLocked(assessment, history)) return; // already exhausted/passed-and-locked — don't record a phantom extra attempt

  const settings = normalizeAssessmentSettings(assessment);
  let score = 0, maxScore = 0, allKcPassed = true, anyKc = false;
  const answers = [];
  blocks.forEach((block, i) => {
    if (!block.type || !block.type.startsWith('kc_')) return;
    anyKc = true;
    const key = lessonId + ':' + (block.id || i);
    const ans = progress.kcAnswers[key];
    const partial = ans && ans.partialScore;
    if (partial) { score += partial.score || 0; maxScore += partial.total || 0; }
    if (!ans || !ans.passed) allKcPassed = false;
    answers.push({ blockIndex: i, type: block.type, response: ans ? (ans.selected ?? ans.response ?? ans.order ?? ans.pairs ?? null) : null, passed: !!(ans && ans.passed) });
  });
  if (!anyKc) return; // nothing to record for an assessment with no KC blocks

  // Passing Score (percentage) takes priority when configured; otherwise
  // fall back to the original "every KC block individually passed" rule.
  const passed = settings.passingScore !== null
    ? (maxScore > 0 && (score / maxScore) * 100 >= settings.passingScore)
    : allKcPassed;

  history.push({
    attemptNumber: history.length + 1,
    timestamp: Date.now(),
    score,
    maxScore,
    passed,
    answers,
  });

  scheduleLumioSave();
}

/* ---------------- EVENT BINDING ---------------- */
function bindLearnerBlockEvents(course, blocks, ctx) {
  const app = document.getElementById('app');
  const rerender = () => renderLearnerLesson(course, ctx.lessonId);

  // "Viewed" tracking for the Next-button gate — paragraphs, images,
  // quotes, statements, etc. (any block whose completion strategy is
  // 'viewed', excluding video/audio which use real media events below).
  // A block counts as viewed once any part of it has been visible in the
  // viewport — a single intersection is sufficient and verifiable; no
  // dwell-time or visibility-percentage threshold is assumed here, since
  // there is no existing product definition of "read" beyond "seen".
  if (LearnerUI._viewedObserver) { LearnerUI._viewedObserver.disconnect(); LearnerUI._viewedObserver = null; }
  const viewedObserver = new IntersectionObserver((entries) => {
    let changed = false;
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const index = parseInt(entry.target.dataset.lpIndex, 10);
      const block = blocks[index];
      if (!block) return;
      const cap = BlockCapabilities.COMPLETION[block.type];
      if (!cap || cap.strategy !== 'viewed' || block.type === 'video' || block.type === 'audio') return;
      CompletionEngine.markViewed(ctx, index);
      viewedObserver.unobserve(entry.target);
      changed = true;
    });
    if (changed) refreshNextButtonState(ctx);
  }, { threshold: 0.1 });
  app.querySelectorAll(`[data-lp-lesson="${ctx.lessonId}"][data-lp-index]`).forEach(node => {
    const index = parseInt(node.dataset.lpIndex, 10);
    const block = blocks[index];
    if (!block) return;
    const cap = BlockCapabilities.COMPLETION[block.type];
    if (cap && cap.strategy === 'viewed' && block.type !== 'video' && block.type !== 'audio') {
      viewedObserver.observe(node);
    }
  });
  LearnerUI._viewedObserver = viewedObserver;

  // Video — direct/uploaded files render a real <video> element; its
  // 'ended' event is a reliable, verifiable completion signal.
  app.querySelectorAll('.block-video-el').forEach(videoEl => {
    const wrapper = videoEl.closest('[data-lp-index]');
    if (!wrapper) return;
    const index = parseInt(wrapper.dataset.lpIndex, 10);
    videoEl.addEventListener('ended', () => {
      CompletionEngine.markWatched(ctx, index);
      refreshNextButtonState(ctx);
    });
    // Real playback-position tracking for the 'watched_50/75/100' rules —
    // only meaningful for direct/uploaded video, where duration/currentTime
    // are genuine browser-reported values, not an estimate.
    videoEl.addEventListener('timeupdate', () => {
      if (!videoEl.duration) return;
      CompletionEngine.markProgressPercent(ctx, index, 'watchedPercent', (videoEl.currentTime / videoEl.duration) * 100);
      refreshNextButtonState(ctx);
    });
  });
  bindVideoEmbedFallbacks(app);
  // YouTube/Vimeo embeds have no reliable in-page "ended" signal — the
  // manual fallback rendered in learnerVideoBlock() is handled here.
  app.querySelectorAll('.lp-mark-watched').forEach(btn => btn.addEventListener('click', () => {
    const index = parseInt(btn.dataset.blockIndex, 10);
    CompletionEngine.markWatched(ctx, index);
    rerender();
  }));

  // Audio — always a real <audio> element; 'ended' is reliable.
  app.querySelectorAll('.block-audio-el').forEach(audioEl => {
    const wrapper = audioEl.closest('[data-lp-index]');
    if (!wrapper) return;
    const index = parseInt(wrapper.dataset.lpIndex, 10);
    audioEl.addEventListener('ended', () => {
      CompletionEngine.markPlayed(ctx, index);
      refreshNextButtonState(ctx);
    });
    audioEl.addEventListener('timeupdate', () => {
      if (!audioEl.duration) return;
      CompletionEngine.markProgressPercent(ctx, index, 'playedPercent', (audioEl.currentTime / audioEl.duration) * 100);
      refreshNextButtonState(ctx);
    });
  });

  // Continue-only learning-flow enhancement: after the next section
  // unlocks, bring it into view — but only if it isn't already fully
  // visible, and positioned ~100px below the viewport top rather than
  // hard against the edge. Reuses the same native `behavior:'smooth'`
  // scroll already used by the Button block's anchor-jump feature
  // (lessonBuilder.js); the only new logic is the visibility check and
  // fixed offset, which that feature didn't need.
  // Root cause of inconsistent Continue auto-scroll: this measured
  // target.getBoundingClientRect() synchronously, right after rerender().
  // For text-only next-blocks that's already laid out correctly — but an
  // <img> (or anything else that resolves its size asynchronously) hadn't
  // necessarily finished decoding yet at that exact instant, so the
  // measured rect.top reflected a smaller, pre-expansion layout. The scroll
  // target locked in from that stale measurement, and once the image
  // finished loading a moment later and the page grew taller, the already-
  // completed scroll no longer pointed at the right place — confirmed live
  // by measuring the same target after settling and finding it almost
  // entirely below the viewport. Waiting for any not-yet-loaded images
  // inside the target (with a timeout safety net so a broken image can
  // never hang the scroll indefinitely) before measuring fixes this at the
  // source, without changing the scrolling mechanism itself.
  function scrollContinueTargetIntoView(lessonId, nextIndex) {
    const target = document.querySelector(`[data-lp-lesson="${lessonId}"][data-lp-index="${nextIndex}"]`);
    if (!target) return;
    let settled = false;
    const doScroll = () => {
      if (settled) return;
      settled = true;
      requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (fullyVisible) return;
        window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - 100), behavior: 'smooth' });
      });
    };
    const pendingImages = Array.from(target.querySelectorAll('img')).filter(img => !img.complete);
    if (pendingImages.length === 0) { doScroll(); return; }
    let remaining = pendingImages.length;
    const onImageSettle = () => { remaining--; if (remaining <= 0) doScroll(); };
    pendingImages.forEach(img => {
      img.addEventListener('load', onImageSettle, { once: true });
      img.addEventListener('error', onImageSettle, { once: true });
    });
    setTimeout(doScroll, 1500); // never block the scroll on a slow/broken image
  }

  // Continue
  app.querySelectorAll('.lp-continue').forEach(btn => btn.addEventListener('click', () => {
    if (btn.disabled) return;
    const lessonId = btn.dataset.lesson, idx = parseInt(btn.dataset.index, 10);
    if (CompletionEngine.isContinueLocked(blocks, idx, ctx)) return;
    if (!LearnerUI.revealedContinues[lessonId]) LearnerUI.revealedContinues[lessonId] = new Set();
    LearnerUI.revealedContinues[lessonId].add(idx);
    rerender();
    scrollContinueTargetIntoView(lessonId, idx + 1);
  }));

  // Keydown helper: runs `fn` only for Enter/Space, preventing the page
  // scroll Space would otherwise trigger and avoiding a duplicate
  // activation if the browser also synthesizes a click for the keypress.
  const onActivateKey = (e, fn) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    fn();
  };

  // KC multiple choice
  app.querySelectorAll('input[type="radio"][data-kc-key]').forEach(input => input.addEventListener('change', () => {
    const key = input.dataset.kcKey, i = parseInt(input.dataset.i, 10);
    ctx.progress.kcAnswers[key] = { ...(ctx.progress.kcAnswers[key] || {}), selected: i };
    rerender();
  }));

  // KC multiple response checkboxes
  app.querySelectorAll('input[type="checkbox"][data-kc-key]').forEach(input => input.addEventListener('change', () => {
    const key = input.dataset.kcKey, i = parseInt(input.dataset.i, 10);
    const ans = ctx.progress.kcAnswers[key] || { selected: [] };
    const sel = new Set(ans.selected || []);
    if (input.checked) sel.add(i); else sel.delete(i);
    ans.selected = [...sel];
    ctx.progress.kcAnswers[key] = ans;
    rerender();
  }));

  // KC submit (multiple choice / multiple response)
  app.querySelectorAll('.lp-kc-submit').forEach(btn => btn.addEventListener('click', () => {
    submitKc(ctx, btn.dataset.kcKey, btn.dataset.kcType, blocks);
    scheduleLumioSave();
    rerender();
  }));

  // KC retry — clear submission state so the learner can attempt again
  app.querySelectorAll('.lp-kc-retry').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.kcKey;
    const blockIndex = parseInt(key.split(':')[1], 10);
    const ans = ctx.progress.kcAnswers[key];
    if (!ans || ans.locked) return;
    // Clear per-attempt selection state; preserve attempts/passed/locked/partialScore
    delete ans.selected;
    delete ans.pairs;
    ans.selectedLeft = null;
    delete ans.response;
    ans.submitted = false;
    ans.lastCorrect = null;
    // Re-shuffle ordering items for variety
    const b = blocks[blockIndex];
    if (b && b.type === 'kc_ordering') {
      const itemCount = ((b.data || {}).items || []).length;
      ans.order = shuffleArray(Array.from({ length: itemCount }, (_, i) => i));
    }
    ctx.progress.kcAnswers[key] = ans;
    scheduleLumioSave();
    rerender();
  }));

  // KC fill gap
  app.querySelectorAll('.lp-kc-fillgap-input').forEach(input => input.addEventListener('input', () => {
    const key = input.dataset.kcKey;
    ctx.progress.kcAnswers[key] = { ...(ctx.progress.kcAnswers[key] || {}), response: input.value };
  }));
  app.querySelectorAll('.lp-kc-fillgap-submit').forEach(btn => btn.addEventListener('click', () => {
    submitKc(ctx, btn.dataset.kcKey, 'fill_gap', blocks);
    scheduleLumioSave();
    rerender();
  }));

  // KC ordering
  app.querySelectorAll('.lp-order-up, .lp-order-down').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.kcKey;
    const i = parseInt(btn.dataset.i, 10);
    const ans = ctx.progress.kcAnswers[key];
    if (!ans || !ans.order) return;
    const dir = btn.classList.contains('lp-order-up') ? -1 : 1;
    const j = i + dir;
    if (j < 0 || j >= ans.order.length) return;
    [ans.order[i], ans.order[j]] = [ans.order[j], ans.order[i]];
    rerender();
  }));
  app.querySelectorAll('.lp-order-submit').forEach(btn => btn.addEventListener('click', () => {
    submitKc(ctx, btn.dataset.kcKey, 'ordering', blocks);
    scheduleLumioSave();
    rerender();
  }));

  // KC matching
  const handleMatchClick = (elx) => {
    const key = elx.dataset.kcKey, i = parseInt(elx.dataset.i, 10);
    const ans = ctx.progress.kcAnswers[key] || { pairs: {}, selectedLeft: null };
    if (ans.locked) return;
    if (elx.classList.contains('lp-match-left')) {
      ans.selectedLeft = i;
    } else if (ans.selectedLeft !== null && ans.selectedLeft !== undefined) {
      ans.pairs = ans.pairs || {};
      ans.pairs[ans.selectedLeft] = i;
      ans.selectedLeft = null;
    }
    ctx.progress.kcAnswers[key] = ans;
    rerender();
  };
  app.querySelectorAll('.lp-match-left, .lp-match-right').forEach(elx => {
    elx.addEventListener('click', () => handleMatchClick(elx));
    elx.addEventListener('keydown', (e) => onActivateKey(e, () => handleMatchClick(elx)));
  });
  app.querySelectorAll('.lp-match-submit').forEach(btn => btn.addEventListener('click', () => {
    submitKc(ctx, btn.dataset.kcKey, 'matching', blocks);
    scheduleLumioSave();
    rerender();
  }));

  // Carousel nav
  const markCarouselVisited = (key, items) => {
    const blockIndex = parseInt(key.split(':')[1], 10);
    const active = ((LearnerUI.carouselIndex[key] || 0) % items.length + items.length) % items.length;
    CompletionEngine.markVisited(ctx, blockIndex, active);
  };
  app.querySelectorAll('.lp-carousel-prev').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    LearnerUI.carouselIndex[key] = (LearnerUI.carouselIndex[key] || 0) - 1;
    markCarouselVisited(key, normalizeCarouselItems((blocks[parseInt(key.split(':')[1], 10)] || {}).data || {}));
    rerender();
  }));
  app.querySelectorAll('.lp-carousel-next').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    LearnerUI.carouselIndex[key] = (LearnerUI.carouselIndex[key] || 0) + 1;
    markCarouselVisited(key, normalizeCarouselItems((blocks[parseInt(key.split(':')[1], 10)] || {}).data || {}));
    rerender();
  }));

  // Quote carousel nav
  const markQuoteVisited = (key, quotes) => {
    const blockIndex = parseInt(key.split(':')[1], 10);
    const active = ((LearnerUI.quoteCarouselIndex[key] || 0) % quotes.length + quotes.length) % quotes.length;
    CompletionEngine.markVisited(ctx, blockIndex, active);
  };
  app.querySelectorAll('.lp-quote-prev').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    LearnerUI.quoteCarouselIndex[key] = (LearnerUI.quoteCarouselIndex[key] || 0) - 1;
    markQuoteVisited(key, normalizeQuoteItems((blocks[parseInt(key.split(':')[1], 10)] || {}).data || {}));
    rerender();
  }));
  app.querySelectorAll('.lp-quote-next').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    LearnerUI.quoteCarouselIndex[key] = (LearnerUI.quoteCarouselIndex[key] || 0) + 1;
    markQuoteVisited(key, normalizeQuoteItems((blocks[parseInt(key.split(':')[1], 10)] || {}).data || {}));
    rerender();
  }));

  // Checkbox list — learner ticks/unticks items. Persisted via
  // CompletionEngine.setChecklistItem into the same blockProgress record
  // every other interactive block uses (learnerProgress.blockProgress),
  // so a returning learner's ticks survive a reload — never written to
  // block.data, which stays authored-content-only.
  const toggleListChecked = (key, i) => {
    const blockIndex = parseInt(key.split(':')[1], 10);
    const set = LearnerUI.listChecked[key] || new Set();
    const nowChecked = !set.has(i);
    if (nowChecked) set.add(i); else set.delete(i);
    LearnerUI.listChecked[key] = set;
    CompletionEngine.setChecklistItem(ctx, blockIndex, i, nowChecked);
    CompletionEngine.markCompleted(ctx, blockIndex);
    rerender();
  };
  app.querySelectorAll('.list-checkbox-marker[data-key]').forEach(marker => {
    const key = marker.dataset.key, i = parseInt(marker.dataset.itemindex, 10);
    if (!key) return;
    marker.addEventListener('click', () => toggleListChecked(key, i));
    marker.addEventListener('keydown', (e) => onActivateKey(e, () => toggleListChecked(key, i)));
  });

  app.querySelectorAll('.image-zoom-trigger').forEach(img => img.addEventListener('click', (e) => {
    e.stopPropagation();
    openImageLightbox(img.dataset.zoomSrc, img.dataset.zoomAlt);
  }));
}
