/* ============================================================
   COURSE LANDING PAGE
   ============================================================ */

function ensureCourseDesign(course) {
  if (!course.themeDesign) {
    course.themeDesign = defaultThemeDesign();
  }
  if (!course.landingLayout) course.landingLayout = 'A';
  if (!course.language) course.language = 'English';
  if (!course.publishHistory) course.publishHistory = [];
  if (!course.publishVersion) course.publishVersion = '1.0';
  ensureHeroDefaults(course);
  ensureThumbnailDefaults(course);
  ensureLandingStyles(course);
  return course;
}

function renderCourseLanding(courseId) {
  const course = LumioState.courses[courseId];
  if (!course) { navigate('#/projects'); return; }
  LumioState.currentCourseId = courseId;

  const project = LumioState.projects.find(p => p.id === courseId);
  const viewOnly = isProjectViewOnly(project);

  if (!course.mode) course.mode = 'edit'; // 'edit' | 'preview'
  if (viewOnly) course.mode = 'preview'; // view-only users never get the editing surface
  ensureCourseDesign(course);
  applyThemeVars(course);
  const theme = LumioData.themes.find(t => t.id === course.theme) || LumioData.themes[0];

  const totalMinutes = estimateCourseDuration(course);
  const navTips = LumioData.ai.navigationTips(course.lessons.length, course.assessments.length, totalMinutes + ' min');
  const statusBadge = project
    ? `<span class="pill ${STATUS_BADGE[project.status] || 'pill-grey'}">${PROJECT_STATUS_LABELS[project.status] || project.status}</span>`
    : '';

  const content = `
    <header class="app-topbar">
      <div class="flex items-center gap-12">
        <button class="btn btn-ghost btn-sm" id="back-projects">← Projects</button>
        <h2 style="font-size:18px;">${course.title}</h2>
        ${statusBadge}
        ${viewOnly ? `<span class="pill pill-grey" title="You have view-only access to this project">👁️ View Only</span>` : ''}
      </div>
      <div class="flex items-center gap-12">
        ${!viewOnly ? `
        <div class="tabs" style="border-bottom:none;">
          <div class="tab ${course.mode==='edit'?'active':''}" data-mode="edit">✏️ Editing</div>
          <div class="tab ${course.mode==='preview'?'active':''}" data-mode="preview">👁️ Preview as Learner</div>
        </div>
        <button class="btn btn-secondary btn-sm" id="course-settings">⚙️ Settings</button>
        ${canPublishProjectStatus(project) ? `<button class="btn btn-primary btn-sm" id="course-publish">🚀 Publish</button>` : `<button class="btn btn-secondary btn-sm" disabled title="This project must be Approved before it can be published.">🚀 Publish</button>`}
        ` : `<span class="text-sm text-muted">👁️ Preview as Learner</span>`}
      </div>
    </header>
    <main class="app-content">
      ${ambientBlobs([
        ['var(--pastel-lavender)', '380px', '380px', '-100px', null, null, '40%'],
      ])}
      <div style="position:relative; z-index:1; max-width:760px; margin:0 auto; ${themeVarStyle(course.themeDesign)}">

        <!-- Review Status (Phase 5: creator visibility) -->
        ${project ? renderReviewStatusSection(project) : ''}

        <!-- Hero -->
        ${renderHeroSection(course)}

        <!-- Outcomes / Learning Objectives -->
        ${renderObjectivesSection(course, course.mode === 'edit')}

        <!-- Course Structure -->
        ${renderCourseStructureSection(course)}

        <!-- Navigation Tips -->
        ${renderNavTipsSection(course, navTips)}

        ${course.mode === 'edit' && !viewOnly ? renderAddContent(course, totalMinutes) : ''}

      </div>
    </main>
  `;
  renderShell('projects', content, { largeLogo: true });
  bindCourseLandingEvents(course, viewOnly);

  // Issue 1 fix (Account Persistence & Invitation System Correction
  // Sprint): the hero/thumbnail image asset cache was never warmed on this
  // screen — AssetStore.resolveMediaSrc() returns '' for any asset:// ref
  // not yet in its in-memory URL cache, and nothing populated that cache
  // for hero/thumbnail refs specifically (learnerPreview.js's course
  // overview already did this; this builder screen never did), so a hero
  // image correctly saved to course.heroImage.src rendered blank on every
  // fresh page load until something else incidentally warmed the cache.
  const _heroRef = (course.heroImage || {}).src;
  const _thumbRef = (course.thumbnailImage || {}).src;
  const _heroRefs = [_heroRef, _thumbRef].filter(Boolean);
  if (_heroRefs.length) {
    AssetStore.preloadBlocks([], _heroRefs).then(count => {
      if (count > 0) renderCourseLanding(courseId);
    });
  }
}

// Governance & Review Workflow Hardening Sprint, Phase 5: project owners
// must see status/reviewer/review date/comments without digging into
// Workspace Settings (which they may not even have access to as an
// Administrator). Shown for every status except plain 'draft' (nothing to
// report yet) — most prominent for 'rejected', where the comment is the
// whole point.
function renderReviewStatusSection(project) {
  if (project.status === 'draft' && !project.reviewedBy) return '';
  const reviewer = project.reviewedBy ? getWorkspaceUser(project.reviewedBy) : null;
  const reviewerName = reviewer ? `${reviewer.firstName} ${reviewer.lastName || ''}`.trim() : null;
  const isRejected = project.status === 'rejected';
  const history = Array.isArray(project.reviewHistory) ? project.reviewHistory.slice().reverse() : [];

  return `
    <div class="card card-pad mb-24" style="${isRejected ? 'border:1px solid #E5484D; background:#FEECEC;' : ''}">
      <div class="flex items-center justify-between mb-8">
        <div class="prop-section-title" style="margin:0;">Review Status</div>
        <span class="pill ${STATUS_BADGE[project.status] || 'pill-grey'}">${PROJECT_STATUS_LABELS[project.status] || project.status}</span>
      </div>
      ${reviewerName ? `
        <p class="text-sm" style="margin:0 0 4px;"><strong>${isRejected ? 'Rejected by' : 'Reviewed by'}:</strong> ${escapeHtml(reviewerName)}</p>
        <p class="text-sm text-muted" style="margin:0 0 8px;"><strong>${isRejected ? 'Rejected on' : 'Reviewed on'}:</strong> ${formatDateLong(project.reviewedAt)}</p>
      ` : ''}
      ${project.reviewComments ? `<div class="text-sm" style="padding:10px 12px; background:${isRejected ? 'rgba(255,255,255,0.6)' : 'var(--surface-50)'}; border-radius:var(--r-sm); margin-bottom:8px;">"${escapeHtml(project.reviewComments)}"</div>` : ''}
      ${history.length ? `
        <details>
          <summary class="text-sm text-muted" style="cursor:pointer;">Review history (${history.length})</summary>
          <div class="flex-col gap-8 mt-8">
            ${history.map(h => `
              <div class="text-sm" style="padding:8px 0; border-bottom:1px solid var(--border);">
                <strong>${escapeHtml(h.action)}</strong> by ${escapeHtml(h.userName || 'Unknown')} — ${formatDateLong(h.date)}
                ${h.comment ? `<div class="text-muted mt-4">"${escapeHtml(h.comment)}"</div>` : ''}
              </div>
            `).join('')}
          </div>
        </details>
      ` : ''}
    </div>`;
}

function renderHeroSection(course, opts = {}) {
  const hs = course.heroSettings;
  const heightPx = heroHeightPx(hs.height);
  const radius = hs.roundedCorners ? 'var(--theme-radius, var(--r-xl))' : '0px';
  const layout = course.landingLayout || 'A';
  const editable = opts.editable !== undefined ? opts.editable : course.mode === 'edit';
  const editBtnLabel = '⚙️ Edit Landing Page';

  const ctaId = opts.ctaId || 'start-course';
  const ctaLabel = opts.ctaLabel || (course.mode==='preview' ? 'Start Course →' : 'Preview Course →');
  const ctaBtn = `<button class="btn btn-lg" id="${ctaId}" ${opts.ctaDisabled ? 'disabled' : ''} style="border-radius:var(--theme-button-style, var(--r-pill)); background:var(--theme-accent, var(--cyan)); color:#fff; border:none; font-weight:600;">${ctaLabel}</button>`;

  const titleBlock = (align, onDark) => `
    <div style="text-align:${align};">
      <h1 style="font-size:calc(var(--theme-font-size, 16px) + 14px); font-family:var(--theme-font-display, var(--font-display)); ${onDark?'color:#fff;':''}">${course.title}</h1>
      <p class="mt-16" style="max-width:520px; font-family:var(--theme-font-body, var(--font-body)); font-size:var(--theme-font-size, 16px); ${align==='center'?'margin-left:auto; margin-right:auto;':''} ${onDark?'color:rgba(255,255,255,0.9);':'color:var(--ink-700);'}">${course.description}</p>
      <div class="mt-24">${ctaBtn}</div>
    </div>`;

  if (layout === 'E') {
    return `
      <div class="card fade-in card-pad" style="padding:48px; border-radius:${radius};">
        ${titleBlock('center', false)}
      </div>`;
  }
  if (layout === 'B') {
    return `
      <div class="card fade-in" style="overflow:hidden; border-radius:${radius}; display:grid; grid-template-columns:1fr 1fr; align-items:stretch;">
        <div class="card-pad" style="padding:40px; display:flex; flex-direction:column; justify-content:center;">
          ${titleBlock('left', false)}
        </div>
        ${renderHeroMedia(course, Math.max(heightPx, 260), { editable, editBtnLabel })}
      </div>
      <style>@media (max-width:680px){ .card[style*="grid-template-columns:1fr 1fr"]{ grid-template-columns:1fr !important; } }</style>`;
  }
  if (layout === 'D') {
    return `
      <div class="card fade-in" style="overflow:hidden; border-radius:${radius}; display:grid; grid-template-columns:1fr 1fr; align-items:stretch; min-height:280px;">
        ${renderHeroMedia(course, 280, { editable, editBtnLabel })}
        <div class="card-pad" style="padding:40px; display:flex; flex-direction:column; justify-content:center;">
          ${titleBlock('left', false)}
        </div>
      </div>`;
  }
  if (layout === 'C') {
    const textColor = heroTextColor(course);
    const overlayContent = renderHeroTitleOverlay(course, `
      <p class="mt-16" style="max-width:520px; font-family:var(--theme-font-body, var(--font-body)); font-size:var(--theme-font-size, 16px); color:${textColor}; opacity:0.9;">${course.description}</p>
      <div class="mt-24">${ctaBtn}</div>
    `);
    return `
      <div class="card fade-in" style="overflow:hidden; border-radius:${radius}; position:relative;">
        ${renderHeroMedia(course, Math.max(heightPx, 260), { editable, editBtnLabel, content: overlayContent })}
      </div>`;
  }
  // A — Centered (default)
  return `
    <div class="card fade-in" style="overflow:hidden; text-align:center; border-radius:${radius};">
      ${renderHeroMedia(course, heightPx, { editable, editBtnLabel })}
      <div class="card-pad" style="padding:36px;">
        ${titleBlock('center', false)}
      </div>
    </div>`;
}

function estimateCourseDuration(course) {
  const parseMin = s => {
    const m = (s||'').match(/\d+/g);
    return m ? parseInt(m[0]) : 8;
  };
  let total = course.lessons.reduce((sum, l) => sum + parseMin(l.duration), 0);
  total += course.assessments.length * 5;
  return total || 0;
}

function renderAddContent(course, totalMinutes) {
  const target = course.duration || '15-30 min';
  const targetMax = parseInt((target.match(/\d+/g) || [60])[1] || (target.match(/\d+/g) || [60])[0]);
  const overTarget = totalMinutes > targetMax;

  return `
    <div class="flex items-center justify-between mt-32 mb-16">
      <h3 style="font-size:16px;">Course Content</h3>
      <div class="text-sm ${overTarget ? '' : 'text-muted'}" style="${overTarget ? 'color:var(--orange); font-weight:600;' : ''}">
        ${totalMinutes} min built · target ${target}
        ${overTarget ? ' ⚠️ over target' : ''}
      </div>
    </div>

    ${overTarget ? `
      <div class="ai-card mb-16">
        <div class="ai-spark">✨</div>
        <div>
          <strong style="font-size:13px; color:var(--ink-900);">Lumio Tip</strong>
          <p class="text-sm mt-8">Your course is running longer than your ${target} target. Consider splitting "${course.lessons[course.lessons.length-1]?.title}" into a separate lesson, or trimming content — shorter sessions improve retention.</p>
        </div>
      </div>
    ` : ''}

    <div class="flex-col gap-12 fade-in">
      ${course.lessons.map((l, i) => contentCard(l, i, 'lesson', course)).join('')}
      ${course.assessments.map((a, i) => contentCard(a, i, 'assessment', course)).join('')}
    </div>

    <div class="flex gap-12 mt-16">
      <button class="btn btn-secondary" id="insert-lesson">+ Insert Lesson</button>
      <button class="btn btn-secondary" id="insert-assessment">+ Insert Assessment</button>
    </div>
  `;
}

function contentCard(item, index, kind, course) {
  const isLesson = kind === 'lesson';
  const objIdx = isLesson ? item.objectiveIndex : (item.objectives || [])[0];
  const obj = course.objectives[objIdx];
  return `
    <div class="card card-pad flex items-center gap-12 content-card" data-kind="${kind}" data-id="${item.id}" data-index="${index}" style="cursor:pointer; border-left:4px solid ${isLesson ? 'var(--pillar-design)' : 'var(--pillar-success)'};">
      ${isLesson ? `<span class="content-drag-handle" draggable="true" data-index="${index}" title="Drag to reorder" style="cursor:grab; font-size:16px; color:var(--ink-400); padding:4px; flex-shrink:0;">☰</span>` : ''}
      <div style="font-size:22px;">${isLesson ? '📄' : '✅'}</div>
      <div style="flex:1; min-width:0;">
        ${isLesson
          ? `<div class="content-title-edit" contenteditable="true" spellcheck="false" data-id="${item.id}" style="font-weight:600; font-size:14px; color:var(--ink-900); outline:none; cursor:text; border-radius:4px; padding:2px 4px; margin:-2px -4px; display:inline-block; max-width:100%;">${item.title}</div>`
          : `<div style="font-weight:600; font-size:14px; color:var(--ink-900);">${item.title}</div>`}
        <div class="text-sm text-muted mt-8">
          ${isLesson ? `Lesson · ~${item.duration}` : `${item.type || 'Quiz'} · Assessment`}
          ${obj ? ` · Aligned to: "${obj.verb} ${obj.text}"` : (isLesson ? '' : ' · ⚠️ Not yet aligned to an objective')}
        </div>
      </div>
      <span class="content-menu-btn" data-kind="${kind}" data-id="${item.id}" title="More options" style="flex-shrink:0; color:var(--ink-400); padding:4px 8px; font-size:18px; line-height:1; cursor:pointer; border-radius:var(--r-sm);">⋮</span>
      <span class="text-muted">→</span>
    </div>
  `;
}

/* ---------------- COURSE CONTENT: lesson/assessment action menu ---------------- */
function openContentMenu(btn, course, kind, id) {
  const isLesson = kind === 'lesson';
  const list = isLesson ? course.lessons : course.assessments;
  const idx = list.findIndex(x => x.id === id);

  const menu = popoverAt(btn, `
    <div data-action="edit">${menuItem(isLesson ? 'Edit Lesson' : 'Edit Assessment', '✏️')}</div>
    <div data-action="duplicate">${menuItem(isLesson ? 'Duplicate Lesson' : 'Duplicate Assessment', '⧉')}</div>
    ${isLesson ? `
      <div data-action="up" style="${idx <= 0 ? 'opacity:0.4; pointer-events:none;' : ''}">${menuItem('Move Up', '↑')}</div>
      <div data-action="down" style="${idx >= list.length - 1 ? 'opacity:0.4; pointer-events:none;' : ''}">${menuItem('Move Down', '↓')}</div>
    ` : `<div data-action="assessment-settings">${menuItem('Assessment Settings', '⚙️')}</div>`}
    <div style="height:1px; background:var(--border); margin:4px 0;"></div>
    <div data-action="delete">${menuItem(isLesson ? 'Delete Lesson' : 'Delete Assessment', '🗑️', true)}</div>
  `);

  menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
    closePopovers();
    LumioState.currentLessonId = id;
    if (!LumioState.lessons[id]) LumioState.lessons[id] = [];
    navigate('#/lesson/' + id);
  });

  menu.querySelector('[data-action="duplicate"]').addEventListener('click', () => {
    closePopovers();
    const original = list[idx];
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = generateUniqueId(isLesson ? 'l' : 'a');
    copy.title = original.title + ' (Copy)';
    list.splice(idx + 1, 0, copy);
    if (isLesson) {
      LumioState.lessons[copy.id] = JSON.parse(JSON.stringify(LumioState.lessons[original.id] || []));
    }
    syncProjectFromCourse(course.id);
    renderCourseLanding(course.id);
    toast(`${isLesson ? 'Lesson' : 'Assessment'} duplicated`, '⧉');
  });

  if (isLesson) {
    menu.querySelector('[data-action="up"]')?.addEventListener('click', () => {
      if (idx <= 0) return;
      closePopovers();
      [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
      syncProjectFromCourse(course.id);
      renderCourseLanding(course.id);
    });
    menu.querySelector('[data-action="down"]')?.addEventListener('click', () => {
      if (idx >= list.length - 1) return;
      closePopovers();
      [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
      syncProjectFromCourse(course.id);
      renderCourseLanding(course.id);
    });
  }

  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    closePopovers();
    confirmDeleteContentItem(course, kind, id);
  });

  menu.querySelector('[data-action="assessment-settings"]')?.addEventListener('click', () => {
    closePopovers();
    openAssessmentSettingsModal(course, list[idx]);
  });
}

// normalizeAssessmentSettings() is defined once, in learnerPreview.js
// (single source of truth — both this settings modal and the runtime
// enforcement in recordAssessmentAttempt()/isAssessmentLocked() read the
// same defaults). Note its default passingScore is null (legacy "every KC
// must pass" behaviour) until an author explicitly sets one here.
function openAssessmentSettingsModal(course, assessment) {
  const s = normalizeAssessmentSettings(assessment);
  const attVal = s.attemptsAllowed === 0 ? 'unlimited' : [1, 2, 3, 5].includes(s.attemptsAllowed) ? String(s.attemptsAllowed) : 'custom';
  const isCustom = attVal === 'custom';

  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:440px; padding:28px;">
        <h3 style="font-size:18px;">Assessment Settings</h3>
        <p class="text-sm text-muted mt-4">"${escapeHtml(assessment.title)}"</p>

        <div class="field mt-16">
          <label>Passing Score (%)</label>
          <input class="input" id="as-passing-score" type="number" min="0" max="100" value="${s.passingScore ?? 80}" />
          <p class="text-xs text-muted mt-4">${s.passingScore === null ? 'Not set yet — currently requires every knowledge check to pass individually.' : ''}</p>
        </div>

        <div class="field">
          <label>Attempts Allowed</label>
          <div style="display:flex; gap:8px; align-items:center;">
            <select class="input" id="as-attempts" style="flex:1;">
              <option value="unlimited" ${attVal === 'unlimited' ? 'selected' : ''}>Unlimited</option>
              <option value="1" ${attVal === '1' ? 'selected' : ''}>1</option>
              <option value="2" ${attVal === '2' ? 'selected' : ''}>2</option>
              <option value="3" ${attVal === '3' ? 'selected' : ''}>3</option>
              <option value="5" ${attVal === '5' ? 'selected' : ''}>5</option>
              <option value="custom" ${isCustom ? 'selected' : ''}>Custom</option>
            </select>
            <input type="number" class="input" id="as-attempts-custom" style="width:72px; ${isCustom ? '' : 'display:none;'}" min="1" max="99" value="${isCustom ? s.attemptsAllowed : 5}" />
          </div>
        </div>

        <div class="field">
          <label class="flex items-center gap-8"><input type="checkbox" id="as-show-score" ${s.showScore ? 'checked' : ''} /> Show Score</label>
        </div>
        <div class="field">
          <label class="flex items-center gap-8"><input type="checkbox" id="as-show-answers" ${s.showAnswers ? 'checked' : ''} /> Show Answers</label>
        </div>
        <div class="field">
          <label class="flex items-center gap-8"><input type="checkbox" id="as-lock-after-pass" ${s.lockAfterPass ? 'checked' : ''} /> Lock After Pass</label>
        </div>

        <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="as-cancel">Cancel</button>
          <button class="btn btn-primary" id="as-save">Save Settings</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);

  const attSel = overlay.querySelector('#as-attempts');
  const attCustom = overlay.querySelector('#as-attempts-custom');
  attSel.addEventListener('change', () => { attCustom.style.display = attSel.value === 'custom' ? '' : 'none'; });

  overlay.querySelector('#as-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#as-save').addEventListener('click', () => {
    const attemptsAllowed = attSel.value === 'unlimited' ? 0
      : attSel.value === 'custom' ? (parseInt(attCustom.value, 10) || 5)
      : parseInt(attSel.value, 10);
    assessment.settings = {
      passingScore: Math.max(0, Math.min(100, parseInt(overlay.querySelector('#as-passing-score').value, 10) || 0)),
      attemptsAllowed,
      showScore: overlay.querySelector('#as-show-score').checked,
      showAnswers: overlay.querySelector('#as-show-answers').checked,
      lockAfterPass: overlay.querySelector('#as-lock-after-pass').checked,
    };
    scheduleLumioSave();
    overlay.remove();
    toast('Assessment settings saved', '⚙️');
  });
}

function confirmDeleteContentItem(course, kind, id) {
  const isLesson = kind === 'lesson';
  const list = isLesson ? course.lessons : course.assessments;
  const item = list.find(x => x.id === id);
  if (!item) return;

  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:420px; padding:28px;">
        <h3 style="font-size:18px;">Delete "${item.title}"?</h3>
        <p class="text-sm text-muted mt-8">This will remove this ${isLesson ? 'lesson' : 'assessment'} from the course. This cannot be undone.</p>
        <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="cancel-del-content">Cancel</button>
          <button class="btn btn-danger" id="confirm-del-content">Delete</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelector('#cancel-del-content').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#confirm-del-content').addEventListener('click', () => {
    const i = list.findIndex(x => x.id === id);
    if (i !== -1) list.splice(i, 1);
    if (isLesson) delete LumioState.lessons[id];
    overlay.remove();
    syncProjectFromCourse(course.id);
    renderCourseLanding(course.id);
    toast(`${isLesson ? 'Lesson' : 'Assessment'} deleted`, '🗑️');
  });
}

function bindCourseLandingEvents(course, viewOnly) {
  const app = document.getElementById('app');
  app.querySelector('#back-projects').addEventListener('click', () => navigate('#/projects'));

  app.querySelectorAll('[data-mode]').forEach(t => t.addEventListener('click', () => {
    if (t.dataset.mode === 'preview') {
      openLearnerPreviewFor(course.id, '#/course/' + course.id);
      return;
    }
    course.mode = t.dataset.mode;
    renderCourseLanding(course.id);
  }));

  app.querySelector('#course-settings')?.addEventListener('click', () => openCourseSettings(course));
  app.querySelector('#course-publish')?.addEventListener('click', () => openPublishModal(course));
  app.querySelector('#change-hero')?.addEventListener('click', () => openCourseSettings(course, 'hero'));
  app.querySelector('#start-course')?.addEventListener('click', () => {
    if (course.lessons.length === 0) {
      toast('Add a lesson to preview the learner experience', '📄');
    } else {
      openLearnerPreviewFor(course.id, '#/course/' + course.id);
    }
  });
  app.querySelector('#edit-objectives')?.addEventListener('click', (e) => {
    e.preventDefault();
    openCourseSettings(course, 'details');
  });

  app.querySelectorAll('.content-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.content-drag-handle, .content-title-edit, .content-menu-btn')) return;
      LumioState.currentLessonId = card.dataset.id;
      if (!LumioState.lessons[card.dataset.id]) LumioState.lessons[card.dataset.id] = [];
      navigate('#/lesson/' + card.dataset.id);
    });
  });

  // ---- Inline lesson title renaming ----
  app.querySelectorAll('.content-title-edit').forEach(titleEl => {
    titleEl.addEventListener('click', e => e.stopPropagation());
    titleEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    });
    titleEl.addEventListener('blur', () => {
      const lesson = course.lessons.find(l => l.id === titleEl.dataset.id);
      if (!lesson) return;
      const newTitle = titleEl.textContent.replace(/\s+/g, ' ').trim();
      if (newTitle && newTitle !== lesson.title) {
        lesson.title = newTitle;
        syncProjectFromCourse(course.id);
        renderCourseLanding(course.id);
        toast('Lesson renamed', '✏️');
      } else {
        titleEl.textContent = lesson.title;
      }
    });
  });

  // ---- Lesson/assessment action menus ----
  app.querySelectorAll('.content-menu-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openContentMenu(btn, course, btn.dataset.kind, btn.dataset.id);
    });
  });

  // ---- Drag-and-drop lesson reordering ----
  app.querySelectorAll('.content-drag-handle').forEach(handle => {
    handle.addEventListener('dragstart', e => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', handle.dataset.index);
      handle.closest('.content-card')?.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => {
      handle.closest('.content-card')?.classList.remove('dragging');
    });
  });
  app.querySelectorAll('.content-card[data-kind="lesson"]').forEach(card => {
    card.addEventListener('dragover', e => { e.preventDefault(); });
    card.addEventListener('drop', e => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIndex = parseInt(card.dataset.index, 10);
      if (isNaN(fromIndex) || isNaN(toIndex) || fromIndex === toIndex) return;
      const [moved] = course.lessons.splice(fromIndex, 1);
      course.lessons.splice(toIndex, 0, moved);
      syncProjectFromCourse(course.id);
      renderCourseLanding(course.id);
      toast('Lesson order updated', '☰');
    });
  });

  app.querySelector('#insert-lesson')?.addEventListener('click', () => insertLesson(course));
  app.querySelector('#insert-assessment')?.addEventListener('click', () => insertAssessment(course));
}

function insertLesson(course) {
  const id = generateUniqueId('l');
  const newLesson = { id, title: 'Untitled Lesson', objectiveIndex: null, duration: '5 min' };
  course.lessons.push(newLesson);
  LumioState.lessons[id] = [];
  renderCourseLanding(course.id);

  // prompt for title + objective mapping
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:480px; padding:28px;">
        <h3 style="font-size:18px;">New Lesson</h3>
        <div class="field mt-16">
          <label>Lesson title</label>
          <input class="input" id="new-lesson-title" placeholder="e.g. Setting Up Your Workspace" value="Untitled Lesson" />
        </div>
        <div class="field">
          <label>Which objective does this lesson support?</label>
          <select class="input" id="new-lesson-obj">
            <option value="">— Not linked yet —</option>
            ${course.objectives.map((o,i) => `<option value="${i}">Objective ${i+1}: ${o.verb} ${o.text}</option>`).join('')}
          </select>
          <span class="hint">Courses stay focused when every lesson supports a goal.</span>
        </div>
        <div class="flex gap-12 mt-16" style="justify-content:flex-end;">
          <button class="btn btn-primary" id="save-new-lesson">Open in Lesson Builder →</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  overlay.querySelector('#save-new-lesson').addEventListener('click', () => {
    const title = overlay.querySelector('#new-lesson-title').value.trim() || 'Untitled Lesson';
    const objVal = overlay.querySelector('#new-lesson-obj').value;
    newLesson.title = title;
    newLesson.objectiveIndex = objVal === '' ? null : parseInt(objVal);
    overlay.remove();
    LumioState.currentLessonId = id;
    navigate('#/lesson/' + id);
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function insertAssessment(course) {
  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:560px; padding:28px;">
        <h3 style="font-size:18px;">Insert Assessment</h3>
        <p class="text-sm text-muted mt-8 mb-16">Choose a type. This is a formal, scored assessment — different from an in-lesson Knowledge Check.</p>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">
          <div class="card card-pad assess-type" data-type="Quiz" style="cursor:pointer; text-align:center;">
            <div style="font-size:24px;">📝</div>
            <div style="font-size:13px; font-weight:600; margin-top:8px;">Quiz</div>
          </div>
          <div class="card card-pad assess-type" data-type="Scenario" style="cursor:pointer; text-align:center;">
            <div style="font-size:24px;">🌳</div>
            <div style="font-size:13px; font-weight:600; margin-top:8px;">Scenario</div>
          </div>
          <div class="card card-pad assess-type" data-type="Reflection" style="cursor:pointer; text-align:center;">
            <div style="font-size:24px;">💭</div>
            <div style="font-size:13px; font-weight:600; margin-top:8px;">Reflection</div>
          </div>
        </div>
        <div class="field mt-16">
          <label>Title</label>
          <input class="input" id="assess-title" value="${course.title} Knowledge Check" />
        </div>
        <div class="field">
          <label>Which objective(s) should this measure?</label>
          <div class="flex-col gap-8">
            ${course.objectives.map((o,i) => `
              <label class="flex items-center gap-8" style="font-size:13px;">
                <input type="checkbox" class="assess-obj" value="${i}" />
                Objective ${i+1}: ${o.verb} ${o.text}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="flex gap-12 mt-16" style="justify-content:flex-end;">
          <button class="btn btn-ghost" id="cancel-assess">Cancel</button>
          <button class="btn btn-primary" id="save-assess">Add Assessment</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  let selectedType = 'Quiz';
  overlay.querySelectorAll('.assess-type').forEach(t => {
    t.addEventListener('click', () => {
      overlay.querySelectorAll('.assess-type').forEach(x => x.style.border = '1px solid var(--border)');
      t.style.border = '2px solid var(--indigo)';
      selectedType = t.dataset.type;
    });
  });
  overlay.querySelector('.assess-type').click();

  overlay.querySelector('#cancel-assess').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#save-assess').addEventListener('click', () => {
    const title = overlay.querySelector('#assess-title').value.trim() || 'Untitled Assessment';
    const objs = [...overlay.querySelectorAll('.assess-obj:checked')].map(c => parseInt(c.value));
    const taughtObjectives = new Set(course.lessons.map(l => l.objectiveIndex).filter(x => x !== null));
    const untaught = objs.filter(o => !taughtObjectives.has(o));

    course.assessments.push({ id: generateUniqueId('a'), title, type: selectedType, objectives: objs });
    overlay.remove();
    renderCourseLanding(course.id);
    toast('Assessment added', '✅');

    if (untaught.length) {
      setTimeout(() => {
        toast(`⚠️ Objective ${untaught.map(o=>o+1).join(', ')} isn't taught by any lesson yet — learners may be tested on something they haven't seen.`, '⚠️');
      }, 600);
    }
  });
}

function layoutThumbFrame(layoutId) {
  const grad = 'linear-gradient(135deg, var(--violet), var(--cyan))';
  const text = 'background: var(--pastel-lavender);';
  switch (layoutId) {
    case 'B':
      return `<div class="lt-frame"><div class="lt-block" style="flex:1; ${text}"></div><div class="lt-block" style="flex:1; background:${grad};"></div></div>`;
    case 'C':
      return `<div class="lt-frame"><div class="lt-block" style="flex:1; background:${grad}; display:flex; align-items:flex-end; padding:6px;"><div style="width:50%; height:8px; ${text} border-radius:2px;"></div></div></div>`;
    case 'D':
      return `<div class="lt-frame" style="gap:0;"><div class="lt-block" style="flex:1; background:${grad}; border-radius:0;"></div><div class="lt-block" style="flex:1; ${text} border-radius:0;"></div></div>`;
    case 'E':
      return `<div class="lt-frame" style="flex-direction:column; align-items:center; justify-content:center; gap:6px;"><div class="lt-block" style="width:60%; height:8px; ${text}"></div><div class="lt-block" style="width:40%; height:8px; ${text}"></div></div>`;
    default: // A
      return `<div class="lt-frame" style="flex-direction:column; gap:6px;"><div class="lt-block" style="flex:1; background:${grad};"></div><div class="lt-block" style="height:14px; ${text}"></div></div>`;
  }
}

/* ============================================================
   PUBLISH MODAL (Issue 12 — architecture preparation)
   Publish is a separate workflow from Export Backup (.lumio).
   Output formats listed here are future-planned; none generate output yet.
   ============================================================ */
/* ============================================================
   PUBLISH MODAL
   Architecture foundation — package generation not yet implemented.
   Sprint 3A: UI, readiness validation, course summary, history model.
   ============================================================ */

const PUBLISH_FORMATS = [
  { id: 'scorm12',      label: 'SCORM 1.2',                  icon: '📦', desc: 'Compatible with most Learning Management Systems.' },
  { id: 'scorm2004_2',  label: 'SCORM 2004 (2nd Edition)',    icon: '📦', desc: 'SCORM 2004 with improved sequencing support.' },
  { id: 'scorm2004_3',  label: 'SCORM 2004 (3rd Edition)',    icon: '📦', desc: 'SCORM 2004 with enhanced navigation controls.' },
  { id: 'scorm2004_4',  label: 'SCORM 2004 (4th Edition)',    icon: '📦', desc: 'Latest SCORM 2004 with advanced sequencing and branching.' },
  { id: 'xapi',         label: 'xAPI (Tin Can)',              icon: '🧩', desc: 'Rich learning data tracking via a Learning Record Store (LRS).' },
  { id: 'html',         label: 'HTML Web Package',            icon: '🌐', desc: 'Self-contained web package — host on any web server.' },
  { id: 'pdf',          label: 'PDF Document',                icon: '📄', desc: 'Print-ready document export for offline reference.' },
];

function getCourseReadinessIssues(course) {
  const issues = [];
  if (!course.title || !course.title.trim()) issues.push('Course title is missing');
  if (!course.description || !course.description.trim()) issues.push('Course description is missing');
  if (!course.lessons || course.lessons.length === 0) issues.push('At least one lesson is required');
  return issues;
}

function openPublishModal(course) {
  ensureCourseDesign(course); // ensures publishHistory, publishVersion, language
  const issues = getCourseReadinessIssues(course);
  const isReady = issues.length === 0;
  const totalMinutes = estimateCourseDuration(course);
  let activeTab = 'publish';

  function buildModalHtml() {
    const readinessBanner = !isReady ? `
      <div style="background:var(--pastel-warning, #fff8e1); border:1px solid var(--orange); border-radius:var(--r-md); padding:14px 16px; margin-bottom:20px;">
        <div style="font-size:13px; font-weight:600; color:var(--orange); margin-bottom:6px;">⚠️ Course is not ready for publishing</div>
        <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px;">
          ${issues.map(i => `<li class="text-sm" style="color:var(--ink-700);">${i}</li>`).join('')}
        </ul>
      </div>` : '';

    const summaryPanel = `
      <div style="background:var(--surface-1, var(--surface-0)); border:1px solid var(--border); border-radius:var(--r-md); padding:16px 18px; margin-bottom:20px;">
        <div style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400); margin-bottom:10px;">Course Summary</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 24px;">
          <div><span class="text-sm text-muted">Title</span><div style="font-size:13px; font-weight:600; color:var(--ink-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${course.title || '—'}</div></div>
          <div><span class="text-sm text-muted">Language</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${course.language || 'English'}</div></div>
          <div><span class="text-sm text-muted">Lessons</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${course.lessons.length}</div></div>
          <div><span class="text-sm text-muted">Assessments</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${course.assessments.length}</div></div>
          <div><span class="text-sm text-muted">Estimated Duration</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${totalMinutes > 0 ? totalMinutes + ' min' : '—'}</div></div>
          <div><span class="text-sm text-muted">Version</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${course.publishVersion}</div></div>
        </div>
      </div>`;

    // SCORM 1.2 Export Implementation Sprint / Sprint 7C: 'scorm12' and
    // 'scorm2004_4' are real, implemented formats alongside 'html' —
    // every other format id in PUBLISH_FORMATS (SCORM 2004 2nd/3rd
    // Edition, xAPI, PDF) remains "Coming Soon" — see Sprint 7A's
    // recommendation against implementing 2004 2nd/3rd Edition.
    const IMPLEMENTED_FORMATS = ['html', 'scorm12', 'scorm2004_2', 'scorm2004_3', 'scorm2004_4', 'xapi', 'pdf'];
    const formatsHtml = PUBLISH_FORMATS.map(f => `
      <div style="display:flex; align-items:center; gap:14px; padding:13px 16px; border-radius:var(--r-md); border:1px solid var(--border); background:var(--surface-0); ${!isReady ? 'opacity:0.5;' : ''}">
        <span style="font-size:22px; flex-shrink:0;">${f.icon}</span>
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; font-weight:600; color:var(--ink-900);">${f.label}</div>
          <div class="text-sm text-muted">${f.desc}</div>
        </div>
        ${IMPLEMENTED_FORMATS.includes(f.id) && isReady
          ? `<button class="btn btn-primary btn-sm" data-publish-format="${f.id}" style="font-size:12px; white-space:nowrap;">Publish</button>`
          : `<span class="pill pill-grey" style="font-size:11px; flex-shrink:0;">Coming Soon</span>`}
      </div>`).join('');

    const historyRows = course.publishHistory.length === 0
      ? `<tr><td colspan="4" style="text-align:center; padding:32px 0; color:var(--ink-400); font-size:13px;">No publish history yet.</td></tr>`
      : course.publishHistory.map(h => `
        <tr>
          <td style="padding:10px 12px; font-size:13px;">${new Date(h.date).toLocaleDateString()}</td>
          <td style="padding:10px 12px; font-size:13px;">${h.format}</td>
          <td style="padding:10px 12px; font-size:13px;">v${h.version}</td>
          <td style="padding:10px 12px; font-size:13px;"><span class="pill pill-${h.status === 'success' ? 'teal' : 'grey'}">${h.status}</span></td>
        </tr>`).join('');

    const publishTabContent = `
      ${readinessBanner}
      ${summaryPanel}
      <div id="publish-asset-panel" style="margin-bottom:20px;"><div class="text-sm text-muted" style="padding:4px 0;">Analyzing assets…</div></div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${formatsHtml}
      </div>`;

    const historyTabContent = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              <th style="text-align:left; padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-400); font-weight:600;">Date</th>
              <th style="text-align:left; padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-400); font-weight:600;">Format</th>
              <th style="text-align:left; padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-400); font-weight:600;">Version</th>
              <th style="text-align:left; padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-400); font-weight:600;">Status</th>
            </tr>
          </thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>`;

    return `
      <div class="overlay" id="publish-overlay">
        <div class="modal" style="width:600px; max-width:95vw; max-height:88vh; display:flex; flex-direction:column; padding:0;">
          <div class="flex items-center justify-between" style="padding:22px 28px 0; flex-shrink:0;">
            <div>
              <h3 style="font-size:18px;">🚀 Publish Course</h3>
              <p class="text-sm text-muted mt-4">Choose a delivery format. Publishing is separate from project backups (.lumio).</p>
            </div>
            <button class="btn-icon" id="publish-close" style="font-size:18px; color:var(--ink-400); align-self:flex-start;">✕</button>
          </div>
          <div class="tabs" style="padding:0 28px; margin-top:16px; flex-shrink:0;">
            <div class="tab ${activeTab === 'publish' ? 'active' : ''}" data-tab="publish">Publish</div>
            <div class="tab ${activeTab === 'history' ? 'active' : ''}" data-tab="history">History${course.publishHistory.length ? ` (${course.publishHistory.length})` : ''}</div>
          </div>
          <div style="flex:1; overflow-y:auto; padding:20px 28px 24px;" id="publish-tab-body">
            ${activeTab === 'publish' ? publishTabContent : historyTabContent}
          </div>
          <div style="padding:16px 28px; border-top:1px solid var(--border); flex-shrink:0; display:flex; justify-content:flex-end;">
            <button class="btn btn-ghost" id="publish-close-btn">Close</button>
          </div>
        </div>
      </div>`;
  }

  // Async: scan asset refs and populate the Package Contents panel.
  async function loadAssetPanel() {
    const panel = overlay.querySelector('#publish-asset-panel');
    if (!panel) return;
    const lessonData = {};
    (course.lessons || []).forEach(l => { if (LumioState.lessons[l.id]) lessonData[l.id] = LumioState.lessons[l.id]; });
    (course.assessments || []).forEach(a => { if (LumioState.lessons[a.id]) lessonData[a.id] = LumioState.lessons[a.id]; });
    const analysis = await analyzePublishAssets(course, lessonData);
    if (!overlay.isConnected) return;
    if (analysis.entries.length === 0) { panel.innerHTML = ''; return; }
    const sizeRow = (icon, label, items) => {
      if (!items.length) return '';
      const sz = items.reduce((s, a) => s + (a.size || 0), 0);
      return `<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid var(--border);">
        <span class="text-sm" style="color:var(--ink-700);">${icon} ${label}</span>
        <span class="text-sm" style="font-weight:600; color:var(--ink-900);">${items.length} file${items.length !== 1 ? 's' : ''} · ${formatFileSize(sz)}</span>
      </div>`;
    };
    const warningsHtml = analysis.warnings.length ? `
      <div style="margin-top:10px; padding:10px 12px; background:rgba(229,72,77,0.06); border:1px solid rgba(229,72,77,0.18); border-radius:var(--r-sm);">
        <div style="font-size:12px; font-weight:700; color:#E5484D; margin-bottom:4px;">⚠️ Large Asset Warnings</div>
        ${analysis.warnings.map(w => `<div class="text-sm" style="color:var(--ink-700); margin-top:3px;">${w}</div>`).join('')}
      </div>` : '';
    panel.innerHTML = `
      <div style="background:var(--surface-1, var(--surface-0)); border:1px solid var(--border); border-radius:var(--r-md); padding:14px 18px;">
        <div style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400); margin-bottom:8px;">Package Contents</div>
        ${sizeRow('🖼️', 'Images', analysis.images)}
        ${sizeRow('🎵', 'Audio', analysis.audio)}
        ${sizeRow('🎬', 'Video', analysis.video)}
        ${sizeRow('📎', 'Documents', analysis.docs)}
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0 0;">
          <span class="text-sm" style="font-weight:600; color:var(--ink-700);">Estimated raw size</span>
          <span class="text-sm" style="font-weight:700; color:var(--ink-900);">~${formatFileSize(analysis.totalSize)}</span>
        </div>
        ${warningsHtml}
      </div>`;
  }

  const overlay = el(buildModalHtml());
  document.body.appendChild(overlay);
  loadAssetPanel();

  const close = () => overlay.remove();
  overlay.querySelector('#publish-close').addEventListener('click', close);
  overlay.querySelector('#publish-close-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      overlay.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
      const body = overlay.querySelector('#publish-tab-body');
      const totalMinutesInner = estimateCourseDuration(course);
      const summaryPanelInner = `
        <div style="background:var(--surface-1, var(--surface-0)); border:1px solid var(--border); border-radius:var(--r-md); padding:16px 18px; margin-bottom:20px;">
          <div style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400); margin-bottom:10px;">Course Summary</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 24px;">
            <div><span class="text-sm text-muted">Title</span><div style="font-size:13px; font-weight:600; color:var(--ink-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${course.title || '—'}</div></div>
            <div><span class="text-sm text-muted">Language</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${course.language || 'English'}</div></div>
            <div><span class="text-sm text-muted">Lessons</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${course.lessons.length}</div></div>
            <div><span class="text-sm text-muted">Assessments</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${course.assessments.length}</div></div>
            <div><span class="text-sm text-muted">Estimated Duration</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${totalMinutesInner > 0 ? totalMinutesInner + ' min' : '—'}</div></div>
            <div><span class="text-sm text-muted">Version</span><div style="font-size:13px; font-weight:600; color:var(--ink-900);">${course.publishVersion}</div></div>
          </div>
        </div>`;
      if (activeTab === 'publish') {
        const readinessBannerInner = !isReady ? `
          <div style="background:var(--pastel-warning, #fff8e1); border:1px solid var(--orange); border-radius:var(--r-md); padding:14px 16px; margin-bottom:20px;">
            <div style="font-size:13px; font-weight:600; color:var(--orange); margin-bottom:6px;">⚠️ Course is not ready for publishing</div>
            <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px;">
              ${issues.map(i => `<li class="text-sm" style="color:var(--ink-700);">${i}</li>`).join('')}
            </ul>
          </div>` : '';
        body.innerHTML = readinessBannerInner + summaryPanelInner +
          `<div id="publish-asset-panel" style="margin-bottom:20px;"><div class="text-sm text-muted" style="padding:4px 0;">Analyzing assets…</div></div>` +
          `<div style="display:flex; flex-direction:column; gap:8px;">${PUBLISH_FORMATS.map(f => `
          <div style="display:flex; align-items:center; gap:14px; padding:13px 16px; border-radius:var(--r-md); border:1px solid var(--border); background:var(--surface-0); ${!isReady ? 'opacity:0.5;' : ''}">
            <span style="font-size:22px; flex-shrink:0;">${f.icon}</span>
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; font-weight:600; color:var(--ink-900);">${f.label}</div>
              <div class="text-sm text-muted">${f.desc}</div>
            </div>
            ${f.id === 'html' && isReady
              ? `<button class="btn btn-primary btn-sm" data-publish-html style="font-size:12px; white-space:nowrap;">Publish</button>`
              : `<span class="pill pill-grey" style="font-size:11px; flex-shrink:0;">Coming Soon</span>`}
          </div>`).join('')}</div>`;
        loadAssetPanel();
      } else {
        const rows = course.publishHistory.length === 0
          ? `<tr><td colspan="4" style="text-align:center; padding:32px 0; color:var(--ink-400); font-size:13px;">No publish history yet.</td></tr>`
          : course.publishHistory.map(h => `
            <tr>
              <td style="padding:10px 12px; font-size:13px;">${new Date(h.date).toLocaleDateString()}</td>
              <td style="padding:10px 12px; font-size:13px;">${h.format}</td>
              <td style="padding:10px 12px; font-size:13px;">v${h.version}</td>
              <td style="padding:10px 12px; font-size:13px;"><span class="pill pill-${h.status === 'success' ? 'teal' : 'grey'}">${h.status}</span></td>
            </tr>`).join('');
        body.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse;"><thead><tr style="border-bottom:1px solid var(--border);"><th style="text-align:left; padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-400); font-weight:600;">Date</th><th style="text-align:left; padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-400); font-weight:600;">Format</th><th style="text-align:left; padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-400); font-weight:600;">Version</th><th style="text-align:left; padding:8px 12px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-400); font-weight:600;">Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      }
    });
  });

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-publish-format]');
    if (!btn) return;
    if (btn.dataset.publishFormat === 'html') publishHtmlPackage(course, btn);
    else if (btn.dataset.publishFormat === 'scorm12') publishScormPackage(course, btn);
    else if (btn.dataset.publishFormat === 'scorm2004_2') publishScorm2004_2ndPackage(course, btn);
    else if (btn.dataset.publishFormat === 'scorm2004_3') publishScorm2004_3rdPackage(course, btn);
    else if (btn.dataset.publishFormat === 'scorm2004_4') publishScorm2004Package(course, btn);
    else if (btn.dataset.publishFormat === 'xapi') publishXapiPackage(course, btn);
    else if (btn.dataset.publishFormat === 'pdf') publishPdfPackage(course, btn);
  });
}

/* ============================================================
   COURSE SETTINGS PANEL
   ============================================================ */
function openCourseSettings(course, initialTab) {
  ensureCourseDesign(course);
  const td = course.themeDesign;
  const TD = LumioData.themeDesigner;
  const SettingsUI = { tab: initialTab || 'theme' };

  const overlay = el(`
    <div class="overlay">
      <div class="modal" style="width:780px; max-width:95vw; max-height:88vh; display:flex; flex-direction:column; padding:0;">
        <div class="flex items-center justify-between" style="padding:24px 28px; border-bottom:1px solid var(--border);">
          <div>
            <h3 style="font-size:18px;">⚙️ Course Settings</h3>
            <p class="text-sm text-muted mt-8">Theme, hero image and layout — editable any time.</p>
          </div>
          <button class="btn btn-ghost btn-sm" id="cs-close">✕</button>
        </div>
        <div class="tabs" id="cs-tabs" style="padding:0 28px;">
          <div class="tab ${SettingsUI.tab==='details'?'active':''}" data-tab="details">📝 Course Details</div>
          <div class="tab ${SettingsUI.tab==='theme'?'active':''}" data-tab="theme">🎨 Theme</div>
          <div class="tab ${SettingsUI.tab==='layout'?'active':''}" data-tab="layout">📐 Layout</div>
          <div class="tab ${SettingsUI.tab==='hero'?'active':''}" data-tab="hero">🖼️ Hero Image</div>
          <div class="tab ${SettingsUI.tab==='landing'?'active':''}" data-tab="landing">🧩 Landing Sections</div>
        </div>
        <div id="cs-body" style="padding:24px 28px; overflow-y:auto; flex:1;"></div>
        <div class="flex gap-12" style="padding:18px 28px; border-top:1px solid var(--border); justify-content:flex-end;">
          <button class="btn btn-primary" id="cs-done">Done</button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);

  function renderBody() {
    const body = overlay.querySelector('#cs-body');
    if (SettingsUI.tab === 'details') {
      body.innerHTML = `
        <div class="prop-section">
          <div class="prop-section-title">Course Title</div>
          <div class="field">
            <input class="input" id="cs-title" value="${course.title.replace(/"/g, '&quot;')}" />
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Course Description</div>
          <div class="field">
            <textarea class="input" id="cs-description" rows="4" style="resize:vertical;">${course.description || ''}</textarea>
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Audience</div>
          <div class="field">
            <input class="input" id="cs-audience" value="${(course.audience || '').replace(/"/g, '&quot;')}" />
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Estimated Duration</div>
          <div class="field">
            <input class="input" id="cs-duration" value="${(course.duration || '').replace(/"/g, '&quot;')}" />
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Learning Objectives</div>
          <p class="text-sm text-muted mb-16">Shown to learners as "What you'll be able to do" on Course Landing and in Learner Preview.</p>
          <div class="flex-col gap-8" id="cs-objectives-list">
            ${(course.learnerOutcomes || []).map((o, i) => `
              <div class="flex gap-8 items-start cs-objective-row" data-i="${i}">
                <textarea class="input cs-objective-text" data-i="${i}" rows="1" style="flex:1; resize:vertical;">${(o || '').replace(/</g, '&lt;')}</textarea>
                <button class="btn-icon cs-objective-up" data-i="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn-icon cs-objective-down" data-i="${i}" title="Move down" ${i === (course.learnerOutcomes.length - 1) ? 'disabled' : ''}>↓</button>
                <button class="btn-icon cs-objective-remove" data-i="${i}" title="Remove" style="color:#E5484D;">✕</button>
              </div>
            `).join('') || '<p class="text-sm text-muted">No objectives yet — add one below.</p>'}
          </div>
          <button class="btn btn-secondary btn-sm mt-12" id="cs-objective-add">+ Add objective</button>
        </div>

        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Course Thumbnail</div>
          <p class="text-sm text-muted mb-16">Used on Projects, Recent, search results and folder cards. This is separate from the Hero Image shown on Course Landing and Learner Preview.</p>
          <div class="flex items-center gap-16 mb-16">
            <div style="width:120px; height:72px; border-radius:8px; overflow:hidden; position:relative; flex-shrink:0; background:${LumioData.thumbGradients[0]}; border:1px solid var(--border);">
              ${course.thumbnailImage.src
                ? `<img src="${AssetStore.resolveMediaSrc(course.thumbnailImage.src)}" alt="" style="width:100%; height:100%; object-fit:cover;" />`
                : `<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:22px; opacity:0.85;">📘</div>`}
            </div>
            <div style="flex:1; min-width:0;">
              ${course.thumbnailImage.src
                ? `<div class="text-sm" style="font-weight:600; color:var(--ink-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${course.thumbnailImage.fileName || 'Uploaded image'}</div><div class="text-sm text-muted mt-8">${course.thumbnailImage.mimeType || ''}</div>`
                : `<div class="text-sm text-muted">No thumbnail uploaded — project cards use the default artwork.</div>`}
            </div>
          </div>
          <input type="file" id="cs-thumb-file" accept="${heroFileAccept()}" style="display:none" />
          <div class="flex gap-12" style="flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="cs-thumb-upload">${course.thumbnailImage.src ? '🔄 Replace Thumbnail' : '📤 Upload Thumbnail'}</button>
            ${course.thumbnailImage.src ? `<button class="btn btn-secondary btn-sm" id="cs-thumb-remove" style="color:#E5484D;">🗑️ Remove Thumbnail</button>` : ''}
            <button class="btn btn-ghost btn-sm" id="cs-thumb-reset">↩️ Restore Default Thumbnail</button>
          </div>
          <div class="text-sm text-muted mt-8">Supported formats: PNG, JPG, JPEG, WEBP · Max size 2MB.</div>
          <div id="cs-thumb-error" class="text-sm mt-8" style="color:#E5484D; display:none;"></div>
        </div>
      `;

      body.querySelector('#cs-title').addEventListener('input', e => {
        course.title = e.target.value;
        syncProjectFromCourse(course.id);
        renderCourseLanding(course.id);
      });
      body.querySelector('#cs-description').addEventListener('input', e => {
        course.description = e.target.value;
        syncProjectFromCourse(course.id);
        renderCourseLanding(course.id);
      });
      body.querySelector('#cs-audience').addEventListener('input', e => {
        course.audience = e.target.value;
        syncProjectFromCourse(course.id);
      });
      body.querySelector('#cs-duration').addEventListener('input', e => {
        course.duration = e.target.value;
        syncProjectFromCourse(course.id);
        renderCourseLanding(course.id);
      });

      // ---- Learning Objectives ("What you'll be able to do") management ----
      if (!Array.isArray(course.learnerOutcomes)) course.learnerOutcomes = [];
      body.querySelectorAll('.cs-objective-text').forEach(textarea => {
        textarea.addEventListener('input', e => {
          const i = +e.target.dataset.i;
          course.learnerOutcomes[i] = e.target.value;
          syncProjectFromCourse(course.id);
          renderCourseLanding(course.id);
        });
      });
      body.querySelectorAll('.cs-objective-up').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = +btn.dataset.i;
          if (i <= 0) return;
          const arr = course.learnerOutcomes;
          [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
          syncProjectFromCourse(course.id);
          renderBody();
          renderCourseLanding(course.id);
        });
      });
      body.querySelectorAll('.cs-objective-down').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = +btn.dataset.i;
          const arr = course.learnerOutcomes;
          if (i >= arr.length - 1) return;
          [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
          syncProjectFromCourse(course.id);
          renderBody();
          renderCourseLanding(course.id);
        });
      });
      body.querySelectorAll('.cs-objective-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = +btn.dataset.i;
          course.learnerOutcomes.splice(i, 1);
          syncProjectFromCourse(course.id);
          renderBody();
          renderCourseLanding(course.id);
        });
      });
      body.querySelector('#cs-objective-add').addEventListener('click', () => {
        course.learnerOutcomes.push('');
        syncProjectFromCourse(course.id);
        renderBody();
        renderCourseLanding(course.id);
        const rows = body.querySelectorAll('.cs-objective-text');
        rows[rows.length - 1]?.focus();
      });

      // ---- Course Thumbnail management ----
      const ti = course.thumbnailImage;
      body.querySelector('#cs-thumb-upload').addEventListener('click', () => body.querySelector('#cs-thumb-file').click());
      body.querySelector('#cs-thumb-file').addEventListener('change', e => {
        const file = e.target.files[0];
        readHeroImageFile(file, (result, error) => {
          const errEl = body.querySelector('#cs-thumb-error');
          if (error) {
            errEl.textContent = error;
            errEl.style.display = 'block';
            toast(error, '⚠️');
            return;
          }
          errEl.style.display = 'none';
          ti.src = result.src;
          ti.fileName = result.fileName;
          ti.mimeType = result.mimeType;
          syncProjectFromCourse(course.id);
          renderBody();
          toast('Course thumbnail updated', '🖼️');
        });
        e.target.value = '';
      });
      body.querySelector('#cs-thumb-remove')?.addEventListener('click', () => {
        ti.src = null;
        ti.fileName = null;
        ti.mimeType = null;
        syncProjectFromCourse(course.id);
        renderBody();
        toast('Course thumbnail removed', '🗑️');
      });
      body.querySelector('#cs-thumb-reset').addEventListener('click', () => {
        course.thumbnailImage = defaultThumbnailImage();
        syncProjectFromCourse(course.id);
        renderBody();
        toast('Course thumbnail reset to default', '↩️');
      });
    }

    if (SettingsUI.tab === 'theme') {
      body.innerHTML = `
        <div class="prop-section">
          <div class="prop-section-title">Color Palette</div>
          <div class="swatch-wheel mb-16" style="max-width:320px;">
            ${TD.presetPalettes.map(p => `
              <div class="swatch ${td.primary===p.primary && td.secondary===p.secondary && td.accent===p.accent ? 'selected':''}"
                   data-palette='${JSON.stringify(p)}'
                   style="background:linear-gradient(135deg, ${p.primary}, ${p.secondary} 55%, ${p.accent});"
                   title="${p.name}"></div>
            `).join('')}
          </div>
          <div class="flex-col gap-8">
            <div class="color-input-row">
              <input type="color" id="cs-primary" value="${td.primary}" />
              <span class="text-sm">Primary Colour</span>
            </div>
            <div class="color-input-row">
              <input type="color" id="cs-secondary" value="${td.secondary}" />
              <span class="text-sm">Secondary Colour</span>
            </div>
            <div class="color-input-row">
              <input type="color" id="cs-accent" value="${td.accent}" />
              <span class="text-sm">Accent Colour</span>
            </div>
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Typography</div>
          <div class="field">
            <label>Font Family</label>
            <select class="input" id="cs-font">
              ${TD.fontFamilies.map(f => `<option value="${f.id}" ${td.fontId===f.id?'selected':''}>${f.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Font Size</label>
            <div class="seg-control" id="cs-fontsize">
              ${TD.fontSizes.map(s => `<button data-val="${s.id}" class="${td.fontSizeId===s.id?'active':''}">${s.label}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Buttons &amp; Shape</div>
          <div class="field">
            <label>Button Style</label>
            <div class="seg-control" id="cs-buttonstyle">
              ${TD.buttonStyles.map(s => `<button data-val="${s.id}" class="${td.buttonStyleId===s.id?'active':''}">${s.label}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Corner Radius</label>
            <div class="seg-control" id="cs-radius">
              ${TD.cornerRadii.map(s => `<button data-val="${s.id}" class="${td.radiusId===s.id?'active':''}">${s.label}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Page Background</div>
          <div class="field">
            <div class="seg-control" id="cs-bgstyle">
              ${TD.backgroundStyles.map(s => `<button data-val="${s.id}" class="${td.bgStyleId===s.id?'active':''}">${s.label}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="theme-preview-card mt-16" style="${themeVarStyle(td)}">
          <div class="tp-hero"></div>
          <div class="tp-body">
            <h4 style="font-family:var(--theme-font-display);">${course.title}</h4>
            <p class="text-sm mt-8" style="font-family:var(--theme-font-body);">Live preview of your course theme.</p>
            <button class="tp-btn mt-16" style="border-radius:var(--theme-button-style); background:var(--theme-accent); color:#fff; border:none;">Start Course →</button>
          </div>
        </div>
      `;

      const refreshPreview = () => {
        renderCourseLanding(course.id);
      };

      body.querySelectorAll('.swatch').forEach(sw => sw.addEventListener('click', () => {
        const p = JSON.parse(sw.dataset.palette);
        td.primary = p.primary; td.secondary = p.secondary; td.accent = p.accent;
        renderBody();
        refreshPreview();
      }));
      body.querySelector('#cs-primary').addEventListener('input', e => { td.primary = e.target.value; refreshPreviewCard(); refreshPreview(); });
      body.querySelector('#cs-secondary').addEventListener('input', e => { td.secondary = e.target.value; refreshPreviewCard(); refreshPreview(); });
      body.querySelector('#cs-accent').addEventListener('input', e => { td.accent = e.target.value; refreshPreviewCard(); refreshPreview(); });
      body.querySelector('#cs-font').addEventListener('change', e => { td.fontId = e.target.value; refreshPreviewCard(); refreshPreview(); });

      function refreshPreviewCard() {
        const card = body.querySelector('.theme-preview-card');
        if (card) card.setAttribute('style', themeVarStyle(td));
      }

      function bindSeg(id, prop) {
        body.querySelectorAll(`#${id} button`).forEach(btn => btn.addEventListener('click', () => {
          td[prop] = btn.dataset.val;
          body.querySelectorAll(`#${id} button`).forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          refreshPreviewCard();
          refreshPreview();
        }));
      }
      bindSeg('cs-fontsize', 'fontSizeId');
      bindSeg('cs-buttonstyle', 'buttonStyleId');
      bindSeg('cs-radius', 'radiusId');
      bindSeg('cs-bgstyle', 'bgStyleId');
    }

    if (SettingsUI.tab === 'layout') {
      body.innerHTML = `
        <p class="text-sm text-muted mb-16">Choose how your course landing page presents its hero and title.</p>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
          ${LumioData.landingLayouts.map(l => `
            <div class="layout-thumb ${course.landingLayout===l.id?'selected':''}" data-layout="${l.id}" style="padding:14px;">
              ${layoutThumbFrame(l.id)}
              <div style="font-weight:600; font-size:13px; margin-top:10px;">${l.icon} ${l.name}</div>
              <div class="text-sm text-muted mt-8">${l.description}</div>
            </div>
          `).join('')}
        </div>
      `;
      body.querySelectorAll('[data-layout]').forEach(card => card.addEventListener('click', () => {
        course.landingLayout = card.dataset.layout;
        renderBody();
        renderCourseLanding(course.id);
      }));
    }

    if (SettingsUI.tab === 'hero') {
      const hi = course.heroImage;
      const hs = course.heroSettings;
      const hasImage = !!hi.src;
      const textColorPreset = ['auto', 'light', 'dark'].includes(hs.textColor) ? hs.textColor : 'custom';

      body.innerHTML = `
        <div class="prop-section">
          <div class="prop-section-title">Hero Image</div>
          <div class="flex items-center gap-16 mb-16">
            <div style="width:120px; height:72px; border-radius:8px; overflow:hidden; position:relative; flex-shrink:0; background:${heroFallbackGradient(course)}; border:1px solid var(--border);">
              ${hasImage
                ? `<img src="${AssetStore.resolveMediaSrc(hi.src)}" alt="" style="width:100%; height:100%; object-fit:cover;" />`
                : `<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:22px; opacity:0.85;">🧠✨</div>`}
            </div>
            <div style="flex:1; min-width:0;">
              ${hasImage
                ? `<div class="text-sm" style="font-weight:600; color:var(--ink-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${hi.fileName || 'Uploaded image'}</div><div class="text-sm text-muted mt-8">${hi.mimeType || ''}</div>`
                : `<div class="text-sm text-muted">No image uploaded — your theme's gradient is used as a placeholder.</div>`}
            </div>
          </div>
          <input type="file" id="cs-hero-file" accept="${heroFileAccept()}" style="display:none" />
          <div class="flex gap-12" style="flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="cs-hero-upload">${hasImage ? '🔄 Replace Image' : '📤 Upload Image'}</button>
            ${hasImage ? `<button class="btn btn-secondary btn-sm" id="cs-hero-remove" style="color:#E5484D;">🗑️ Remove Image</button>` : ''}
            <button class="btn btn-ghost btn-sm" id="cs-hero-reset">↩️ Restore Default Image</button>
          </div>
          <div class="text-sm text-muted mt-8">Supported formats: PNG, JPG, JPEG, WEBP · Max size 2MB.</div>
          <div id="cs-hero-error" class="text-sm mt-8" style="color:#E5484D; display:none;"></div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Hero Height</div>
          <div class="seg-control" id="cs-height">
            ${HERO_HEIGHT_PRESETS.map(p => `<button data-val="${p.id}" class="${hs.height===p.id?'active':''}">${p.label}</button>`).join('')}
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Display Mode</div>
          <div class="seg-control" id="cs-display-mode">
            ${[['cover','Cover'],['contain','Contain'],['fill','Fill']].map(([v,l]) => `<button data-val="${v}" class="${hi.displayMode===v?'active':''}">${l}</button>`).join('')}
          </div>
          <div class="text-sm text-muted mt-8">Controls how the image fills the hero area once an image is uploaded.</div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Position &amp; Focal Point</div>
          <div class="field">
            <label>Horizontal</label>
            <div class="seg-control" id="cs-posx">
              ${['left','center','right'].map(v => `<button data-val="${v}" class="${hi.posX===v?'active':''}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}
            </div>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>Vertical</label>
            <div class="seg-control" id="cs-posy">
              ${['top','center','bottom'].map(v => `<button data-val="${v}" class="${hi.posY===v?'active':''}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}
            </div>
          </div>
          <div class="text-sm text-muted mt-8">Keeps the important part of your image visible when it's cropped or scaled.</div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Scale — ${hi.scale || 100}%</div>
          <input type="range" id="cs-scale" min="50" max="150" step="25" value="${hi.scale || 100}" style="width:100%;" />
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Overlay</div>
          <div class="seg-control" id="cs-overlay-mode">
            ${[['none','None'],['light','Light'],['dark','Dark'],['theme','Theme Colour']].map(([v,l]) => `<button data-val="${v}" class="${hs.overlay.mode===v?'active':''}">${l}</button>`).join('')}
          </div>
          <div class="mt-16">
            <div class="text-sm text-muted mb-8">Opacity — ${Math.round(hs.overlay.opacity*100)}%</div>
            <input type="range" id="cs-overlay-opacity" min="0" max="0.8" step="0.05" value="${hs.overlay.opacity}" style="width:100%;" ${hs.overlay.mode==='none'?'disabled':''} />
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Rounded Corners</div>
          <label class="flex items-center gap-8" style="cursor:pointer;">
            <input type="checkbox" id="cs-rounded" ${hs.roundedCorners?'checked':''}/> Round the hero image corners
          </label>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Title Position</div>
          <div class="seg-control" id="cs-title-pos">
            ${['top','center','bottom'].map(v => `<button data-val="${v}" class="${hs.titlePosition===v?'active':''}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Text Alignment</div>
          <div class="seg-control" id="cs-text-align">
            ${['left','center','right'].map(v => `<button data-val="${v}" class="${hs.textAlign===v?'active':''}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('')}
          </div>
        </div>

        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Text Colour</div>
          <div class="seg-control" id="cs-text-color">
            ${[['auto','Auto'],['light','Light'],['dark','Dark'],['custom','Custom']].map(([v,l]) => `<button data-val="${v}" class="${textColorPreset===v?'active':''}">${l}</button>`).join('')}
          </div>
          ${textColorPreset === 'custom' ? `
            <div class="color-input-row mt-16">
              <input type="color" id="cs-text-color-custom" value="${hs.textColor}" />
              <span class="text-sm">Custom Colour</span>
            </div>` : ''}
        </div>
      `;

      // ---- Image management ----
      body.querySelector('#cs-hero-upload').addEventListener('click', () => body.querySelector('#cs-hero-file').click());
      body.querySelector('#cs-hero-file').addEventListener('change', e => {
        const file = e.target.files[0];
        readHeroImageFile(file, (result, error) => {
          const errEl = body.querySelector('#cs-hero-error');
          if (error) {
            errEl.textContent = error;
            errEl.style.display = 'block';
            toast(error, '⚠️');
            return;
          }
          errEl.style.display = 'none';
          hi.src = result.src;
          hi.fileName = result.fileName;
          hi.mimeType = result.mimeType;
          hi._thumbSrc = result._thumbSrc || null;
          renderBody();
          renderCourseLanding(course.id);
          toast('Hero image updated', '🖼️');
        });
        e.target.value = '';
      });
      body.querySelector('#cs-hero-remove')?.addEventListener('click', () => {
        hi.src = null;
        hi.fileName = null;
        hi.mimeType = null;
        renderBody();
        renderCourseLanding(course.id);
        toast('Hero image removed', '🗑️');
      });
      body.querySelector('#cs-hero-reset').addEventListener('click', () => {
        course.heroImage = defaultHeroImage();
        renderBody();
        renderCourseLanding(course.id);
        toast('Hero image reset to default', '↩️');
      });

      // ---- Scale ----
      body.querySelector('#cs-scale').addEventListener('input', e => {
        hi.scale = parseInt(e.target.value, 10);
        const title = body.querySelector('#cs-scale').closest('.prop-section').querySelector('.prop-section-title');
        title.textContent = `Scale — ${hi.scale}%`;
        renderCourseLanding(course.id);
      });

      // ---- Overlay opacity ----
      body.querySelector('#cs-overlay-opacity').addEventListener('input', e => {
        hs.overlay.opacity = parseFloat(e.target.value);
        const label = body.querySelector('#cs-overlay-opacity').previousElementSibling;
        label.textContent = `Opacity — ${Math.round(hs.overlay.opacity*100)}%`;
        renderCourseLanding(course.id);
      });

      // ---- Rounded corners ----
      body.querySelector('#cs-rounded').addEventListener('change', e => { hs.roundedCorners = e.target.checked; renderCourseLanding(course.id); });

      // ---- Custom text colour ----
      body.querySelector('#cs-text-color-custom')?.addEventListener('input', e => {
        hs.textColor = e.target.value;
        renderCourseLanding(course.id);
      });

      function bindSeg(id, setter, opts = {}) {
        body.querySelectorAll(`#${id} button`).forEach(btn => btn.addEventListener('click', () => {
          setter(btn.dataset.val);
          renderCourseLanding(course.id);
          if (opts.refreshBody) renderBody();
          else {
            body.querySelectorAll(`#${id} button`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          }
        }));
      }
      bindSeg('cs-height', v => hs.height = v);
      bindSeg('cs-display-mode', v => hi.displayMode = v);
      bindSeg('cs-posx', v => hi.posX = v);
      bindSeg('cs-posy', v => hi.posY = v);
      bindSeg('cs-overlay-mode', v => hs.overlay.mode = v, { refreshBody: true });
      bindSeg('cs-title-pos', v => hs.titlePosition = v);
      bindSeg('cs-text-align', v => hs.textAlign = v);
      bindSeg('cs-text-color', v => {
        hs.textColor = v === 'custom'
          ? (textColorPreset === 'custom' ? hs.textColor : '#ffffff')
          : v;
      }, { refreshBody: true });
    }

    if (SettingsUI.tab === 'landing') {
      renderLandingSectionSettings(course, body, SettingsUI, renderBody);
    }
  }

  overlay.querySelectorAll('#cs-tabs .tab').forEach(t => t.addEventListener('click', () => {
    overlay.querySelectorAll('#cs-tabs .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    SettingsUI.tab = t.dataset.tab;
    renderBody();
  }));

  overlay.querySelector('#cs-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#cs-done').addEventListener('click', () => {
    overlay.remove();
    renderCourseLanding(course.id);
    toast('Course settings saved', '✅');
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  renderBody();
}
