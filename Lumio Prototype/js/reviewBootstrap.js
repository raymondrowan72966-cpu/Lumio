(async function () {
  const pathMatch = window.location.pathname.match(/\/review\/([0-9a-f-]{36})/i);
  const reviewId  = pathMatch ? pathMatch[1] : null;

  const app = document.getElementById('app');

  function showError(message) {
    app.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--surface-0,#f9f9f9);">
        <div style="text-align:center;max-width:480px;padding:40px 24px;font-family:system-ui,sans-serif;">
          <div style="font-size:48px;margin-bottom:16px;">👁</div>
          <h1 style="font-size:22px;font-weight:700;color:var(--ink-900,#111);margin-bottom:8px;">Review Not Available</h1>
          <p style="color:var(--ink-500,#666);font-size:15px;line-height:1.6;">${message}</p>
        </div>
      </div>`;
  }

  function showLoading() {
    app.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--surface-0,#f9f9f9);">
        <div style="text-align:center;font-family:system-ui,sans-serif;color:var(--ink-400,#888);">
          <div style="font-size:32px;margin-bottom:12px;">👁</div>
          <p style="font-size:14px;margin:0;">Loading review…</p>
        </div>
      </div>`;
  }

  if (!reviewId) {
    showError('This review link is not valid. Please check the URL and try again.');
    return;
  }

  showLoading();

  let snapshot, assetMap;
  try {
    const res = await fetch('/api/review/' + reviewId, {
      method: 'GET',
      credentials: 'omit',
    });

    if (res.status === 404) {
      showError('This review link does not exist. It may have been deleted or the URL may be incorrect.');
      return;
    }
    if (res.status === 410) {
      showError('This review link has been revoked or has expired. Please contact the course author for a new link.');
      return;
    }
    if (!res.ok) {
      showError('An error occurred loading this review. Please try again later.');
      return;
    }

    const json = await res.json();
    snapshot = json.data.snapshot;
    assetMap = json.data.assetMap || {};
  } catch {
    showError('Could not load this review. Please check your internet connection and try again.');
    return;
  }

  // Populate the AssetStore stub with review-specific asset URLs.
  AssetStore._assetMap = assetMap;

  const { course, lessons } = snapshot;

  // Build course.lessons as the metadata array learnerPreview.js expects.
  course.lessons = lessons.map(function(l) {
    return { id: l.id, title: l.title, position: l.position, kind: l.kind || 'standard', duration: l.duration || null };
  });
  if (!course.assessments) course.assessments = [];

  // Populate LumioState for the learner preview runtime.
  LumioState.courses[course.id] = course;

  // LumioState.lessons is a map of lessonId → blocks array.
  lessons.forEach(function(l) {
    LumioState.lessons[l.id] = l.blocks || [];
  });

  // Clean-slate progress — no completions tracked for a reviewer.
  LumioState.learnerProgress[course.id] = {
    completedLessons: [],
    kcAnswers: {},
    score: { correct: 0, total: 0 },
    blockProgress: {},
    revealedContinues: {},
    courseStatus: 'not_started',
    courseCompletedAt: null,
    lessonCompletedAt: {},
    lastLessonId: null,
    lastBlockIndex: 0,
    lastAccessedAt: null,
  };

  // Published mode suppresses builder controls inside learnerPreview.js.
  LearnerUI.publishedMode = true;
  LearnerUI.fullScreen    = true;

  renderLearnerPreview(course.id);

  _injectReviewBanner();

  function _injectReviewBanner() {
    const existing = document.getElementById('lumio-review-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'lumio-review-banner';
    Object.assign(banner.style, {
      position: 'fixed', top: '0', left: '0', right: '0', zIndex: '9999',
      background: '#1a1a2e', color: '#fff', fontFamily: 'system-ui,sans-serif',
      fontSize: '12px', fontWeight: '500', letterSpacing: '.02em',
      padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,.25)',
    });

    banner.innerHTML = `
      <span style="opacity:.6;flex-shrink:0;">👁</span>
      <span style="flex:1;line-height:1.4;">
        <strong>View-Only Review</strong> &mdash; This is a frozen snapshot. Content cannot be edited from this link.
      </span>
      <button id="lumio-review-banner-dismiss"
        style="background:rgba(255,255,255,.15);border:none;border-radius:4px;color:#fff;padding:4px 10px;font-size:11px;cursor:pointer;flex-shrink:0;white-space:nowrap;">
        Dismiss
      </button>`;

    document.body.insertBefore(banner, document.body.firstChild);

    document.getElementById('lumio-review-banner-dismiss').addEventListener('click', function() {
      banner.remove();
      var appEl = document.getElementById('app');
      if (appEl) appEl.style.paddingTop = '';
    });

    var appEl = document.getElementById('app');
    if (appEl) appEl.style.paddingTop = (banner.offsetHeight || 37) + 'px';
  }
})();
