/* ============================================================
   LEARNER PREVIEW RUNTIME
   A dedicated, learner-facing experience: course overview, lesson
   playback with Previous/Next navigation, progress tracking, and
   interactive knowledge checks. No authoring tools are shown here.
   ============================================================ */

// Transient per-view UI state (not persisted) for accordions, tabs,
// flashcards and "Continue" reveals within the learner runtime.
const LearnerUI = {
  revealedContinues: {}, // lessonId -> Set<blockIndex>
  accordionOpen: {},     // "lessonId:blockIndex" -> Set<itemIndex>
  activeTabs: {},        // "lessonId:blockIndex" -> tabIndex
  flipped: {},           // "lessonId:blockIndex" -> Set<cardIndex> | bool
  previewDevice: 'desktop', // 'desktop' | 'tablet' | 'mobile' — preview-only, not persisted
  fullScreen: false,         // full-screen learner preview — preview-only, not persisted
};

function ensureLearnerProgress(courseId) {
  if (!LumioState.learnerProgress) LumioState.learnerProgress = {};
  if (!LumioState.learnerProgress[courseId]) {
    LumioState.learnerProgress[courseId] = {
      completedLessons: [],
      kcAnswers: {},
      score: { correct: 0, total: 0 },
    };
  }
  return LumioState.learnerProgress[courseId];
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

function courseNavSidebar(course, progress, activeLessonId) {
  // Before the learner clicks "Start Course" (no progress yet, and not
  // currently inside a lesson), the lesson/assessment list is visible so
  // they can preview the course structure, but is not yet navigable.
  const locked = activeLessonId === null && progress.completedLessons.length === 0;
  return `
    <aside style="width:260px; flex-shrink:0; border-right:1px solid var(--border); background:var(--surface-0); overflow-y:auto; padding:16px;">
      <h4 style="font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400); margin-bottom:12px;">Lessons</h4>
      <div class="flex-col gap-8">
        ${course.lessons.length ? course.lessons.map(l => `
          <div class="card card-pad lp-nav-lesson ${l.id === activeLessonId ? 'selected' : ''} ${locked ? 'locked' : ''}" data-lesson="${l.id}"
            style="display:flex; align-items:center; gap:10px; ${locked ? 'opacity:0.55; cursor:not-allowed;' : 'cursor:pointer;'} ${l.id === activeLessonId ? 'border-color:var(--theme-primary, var(--indigo));' : ''}">
            <span>${locked ? '🔒' : (progress.completedLessons.includes(l.id) ? '✅' : '⬜')}</span>
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${l.title}</div>
              <div class="text-sm text-muted">${l.duration || ''}</div>
            </div>
          </div>
        `).join('') : `<p class="text-sm text-muted">No lessons yet.</p>`}
      </div>
      ${course.assessments.length ? `
      <h4 style="font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-400); margin:20px 0 12px;">Assessments</h4>
      <div class="flex-col gap-8">
        ${course.assessments.map(a => `
          <div class="card card-pad" style="opacity:${locked ? '0.55' : '0.7'}; display:flex; align-items:center; gap:10px;">
            <span>${locked ? '🔒' : '📝'}</span>
            <div style="flex:1; min-width:0;">
              <div style="font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${a.title}</div>
              <div class="text-sm text-muted">${a.type || 'Quiz'}</div>
            </div>
          </div>
        `).join('')}
      </div>` : ''}
    </aside>`;
}

const LEARNER_DEVICE_FRAMES = {
  desktop: { width: null, label: '🖥️ Desktop' },
  tablet: { width: '768px', label: '📱 Tablet' },
  mobile: { width: '390px', label: '📲 Mobile' },
};

function learnerDeviceFrameStyle(device) {
  const frame = LEARNER_DEVICE_FRAMES[device] || LEARNER_DEVICE_FRAMES.desktop;
  if (!frame.width) return 'width:100%; height:100%;';
  return `width:100%; max-width:${frame.width}; height:100%; margin:0 auto; border:1px solid var(--border); border-radius:16px; overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.08); background:var(--theme-bg-style, var(--surface-50));`;
}

function learnerDeviceSwitcherHtml(device) {
  return `
    <div class="seg-control" id="lp-device-switch" style="flex:0 0 auto; width:auto;">
      ${Object.entries(LEARNER_DEVICE_FRAMES).map(([key, f]) => `<button data-val="${key}" class="${device === key ? 'active' : ''}" title="${f.label}" style="flex:0 0 auto; padding:8px 10px; white-space:nowrap;">${f.label}</button>`).join('')}
    </div>`;
}

function learnerShell(course, bodyHtml, opts = {}) {
  const progress = ensureLearnerProgress(course.id);
  const app = document.getElementById('app');
  const device = LearnerUI.previewDevice || 'desktop';
  const frameStyle = learnerDeviceFrameStyle(device);
  const reRender = () => renderLearnerPreview(course.id, opts.activeLessonId || null);

  if (LearnerUI.fullScreen) {
    app.innerHTML = `
      <div style="height:100vh; display:flex; flex-direction:column; overflow:hidden; background:var(--surface-100); ${themeVarStyle(course.themeDesign)}">
        <div class="flex items-center justify-end" style="padding:10px 16px; flex-shrink:0;">
          <button class="btn btn-secondary btn-sm" id="lp-fullscreen-exit">✕ Exit Full Screen Preview</button>
        </div>
        <div style="flex:1; overflow:auto; display:flex; justify-content:center; padding:0 0 24px;">
          <div style="${frameStyle}">
            <main style="height:100%; overflow-y:auto; display:flex; flex-direction:column;">${bodyHtml}</main>
          </div>
        </div>
      </div>
    `;
    app.querySelector('#lp-fullscreen-exit').addEventListener('click', () => { LearnerUI.fullScreen = false; reRender(); });
    return;
  }

  app.innerHTML = `
    <div style="height:100vh; display:flex; flex-direction:column; overflow:hidden; ${themeVarStyle(course.themeDesign)}">
      <header class="flex items-center justify-between" style="padding:12px 20px; border-bottom:1px solid var(--border); background:var(--surface-0); flex-shrink:0; gap:16px; flex-wrap:wrap;">
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
      </header>
      <div style="flex:1; display:flex; min-height:0;">
        ${courseNavSidebar(course, progress, opts.activeLessonId || null)}
        <div style="flex:1; overflow:auto; display:flex; justify-content:center; background:var(--surface-50);">
          <div style="${frameStyle}">
            <main style="height:100%; overflow-y:auto; display:flex; flex-direction:column;">${bodyHtml}</main>
          </div>
        </div>
      </div>
    </div>
  `;
  app.querySelector('#lp-logo').addEventListener('click', () => navigate('#/learner/' + course.id));
  app.querySelector('#lp-exit').addEventListener('click', exitLearnerPreview);
  app.querySelector('#lp-return')?.addEventListener('click', () => navigate('#/learner/' + course.id));
  app.querySelector('#lp-fullscreen').addEventListener('click', () => { LearnerUI.fullScreen = true; reRender(); });
  app.querySelectorAll('#lp-device-switch button').forEach(btn => btn.addEventListener('click', () => {
    LearnerUI.previewDevice = btn.dataset.val;
    reRender();
  }));
  app.querySelectorAll('.lp-nav-lesson').forEach(elx => {
    if (elx.classList.contains('locked')) return;
    elx.addEventListener('click', () => navigate('#/learner/' + course.id + '/' + elx.dataset.lesson));
  });
}

/* ---------------- COURSE OVERVIEW ---------------- */
function renderLearnerCourseOverview(course) {
  const progress = ensureLearnerProgress(course.id);
  const firstIncomplete = course.lessons.find(l => !progress.completedLessons.includes(l.id));
  const hasProgress = progress.completedLessons.length > 0;
  const startLabel = !hasProgress ? 'Start Course' : (firstIncomplete ? 'Continue Course' : 'Restart Course');
  const startLesson = firstIncomplete || course.lessons[0];

  const totalMinutes = estimateCourseDuration(course);
  const navTips = LumioData.ai.navigationTips(course.lessons.length, course.assessments.length, totalMinutes + ' min');

  const body = `
    <div style="max-width:760px; margin:0 auto; padding:40px 24px 80px; width:100%;">
      ${renderHeroSection(course, {
        editable: false,
        ctaId: 'lp-start',
        ctaLabel: course.lessons.length ? startLabel + ' →' : 'No lessons yet',
        ctaDisabled: !course.lessons.length,
      })}

      ${renderObjectivesSection(course, false)}

      ${renderCourseStructureSection(course)}

      ${renderNavTipsSection(course, navTips)}

      ${progress.score.total > 0 ? `
      <div class="card card-pad mt-24 fade-in" style="text-align:center;">
        <h3 style="font-size:15px;">Knowledge Check Score</h3>
        <p class="text-sm text-muted mt-8">${progress.score.correct} / ${progress.score.total} correct so far</p>
      </div>` : ''}
    </div>
  `;

  learnerShell(course, body, { activeLessonId: null });

  document.getElementById('lp-start')?.addEventListener('click', () => {
    if (!course.lessons.length) return;
    navigate('#/learner/' + course.id + '/' + startLesson.id);
  });
}

/* ---------------- LESSON PLAYBACK ---------------- */
function renderLearnerLesson(course, lessonId) {
  const progress = ensureLearnerProgress(course.id);
  const lessonIdx = course.lessons.findIndex(l => l.id === lessonId);
  if (lessonIdx === -1) { navigate('#/learner/' + course.id); return; }

  const lesson = course.lessons[lessonIdx];
  const blocks = LumioState.lessons[lessonId] || [];
  const ctx = { courseId: course.id, lessonId, progress };
  const isLast = lessonIdx === course.lessons.length - 1;

  const body = `
    <div style="max-width:720px; margin:0 auto; padding:40px 24px 40px; width:100%; flex:1;">
      <div class="flex items-center justify-between mb-16">
        <h2 style="font-size:calc(var(--theme-font-size, 16px) + 4px); font-family:var(--theme-font-display, var(--font-display));">${lesson.title}</h2>
        ${lesson.duration ? `<span class="pill pill-grey">${lesson.duration}</span>` : ''}
      </div>
      ${renderLearnerBlocks(blocks, ctx)}
    </div>
    <div style="position:sticky; bottom:0; background:var(--surface-0); border-top:1px solid var(--border); padding:14px 24px; display:flex; justify-content:space-between; align-items:center;">
      <button class="btn btn-secondary" id="lp-prev" ${lessonIdx === 0 ? 'disabled' : ''}>← Previous</button>
      <button class="btn btn-primary" id="lp-next">${isLast ? 'Finish Course ✓' : 'Next →'}</button>
    </div>
  `;

  learnerShell(course, body, { activeLessonId: lessonId, showReturn: true });
  bindLearnerBlockEvents(course, blocks, ctx);

  document.getElementById('lp-prev')?.addEventListener('click', () => {
    if (lessonIdx > 0) navigate('#/learner/' + course.id + '/' + course.lessons[lessonIdx - 1].id);
  });
  document.getElementById('lp-next')?.addEventListener('click', () => {
    if (!progress.completedLessons.includes(lessonId)) progress.completedLessons.push(lessonId);
    if (isLast) {
      navigate('#/learner/' + course.id);
      setTimeout(() => toast('🎉 Course complete!', '🎉'), 50);
    } else {
      navigate('#/learner/' + course.id + '/' + course.lessons[lessonIdx + 1].id);
    }
  });
}

/* ---------------- BLOCK RENDERING ---------------- */
function renderLearnerBlocks(blocks, ctx) {
  if (!blocks.length) {
    return `
      <div class="card card-pad text-center" style="padding:60px 30px;">
        <div style="font-size:40px;">📭</div>
        <h3 class="mt-16" style="font-size:16px;">This lesson has no content yet</h3>
      </div>`;
  }

  const revealed = LearnerUI.revealedContinues[ctx.lessonId] || new Set();
  let html = '';
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const ds = block.design || {};
    const bgStyle = ds.bg && ds.bg !== 'transparent' ? `background:${ds.bg};` : 'background:var(--surface-0);';
    const alignStyle = ds.align ? `text-align:${ds.align};` : '';
    const radiusStyle = ds.radius ? `border-radius:${RADIUS_MAP[ds.radius] || 'var(--theme-radius, var(--r-lg))'};` : 'border-radius:var(--theme-radius, var(--r-lg));';
    html += `<div style="${bgStyle} ${radiusStyle} box-shadow:var(--shadow-soft); margin-bottom:16px; padding:22px; ${alignStyle} ${textBlockExtraStyle(block)}${statementBlockExtraStyle(block)}">${renderLearnerBlock(block, i, ctx)}</div>`;
    if (block.type === 'continue' && !revealed.has(i)) break;
  }
  return html;
}

function renderLearnerBlock(block, index, ctx) {
  switch (block.type) {
    case 'continue': return learnerContinueBlock(block, index, ctx);
    case 'accordion': return learnerAccordionBlock(block, index, ctx);
    case 'tabs': return learnerTabsBlock(block, index, ctx);
    case 'flashcard_grid': return learnerFlashcardGrid(block, index, ctx);
    case 'flashcard_stack': return learnerFlashcardStack(block, index, ctx);
    case 'kc_multiple_choice': return learnerKcMultipleChoice(block, index, ctx);
    case 'kc_multiple_response': return learnerKcMultipleResponse(block, index, ctx);
    case 'kc_matching': return learnerKcMatching(block, index, ctx);
    case 'kc_ordering': return learnerKcOrdering(block, index, ctx);
    case 'kc_fill_gap': return learnerKcFillGap(block, index, ctx);
    default: return renderBlockContent(block, false);
  }
}

/* ---- Continue (progressive reveal) ---- */
function learnerContinueBlock(block, index, ctx) {
  const d = block.data || {};
  const revealed = (LearnerUI.revealedContinues[ctx.lessonId] || new Set()).has(index);
  return `
    <div style="text-align:center; padding:8px 0;">
      ${revealed
        ? `<span class="pill pill-grey">✓ Continued</span>`
        : `<button class="btn btn-secondary lp-continue" data-lesson="${ctx.lessonId}" data-index="${index}">${d.label || 'Continue'} ▾</button>`}
    </div>`;
}

/* ---- Accordion ---- */
function learnerAccordionBlock(block, index, ctx) {
  const d = block.data || {};
  const items = d.items || [{ title: 'Section 1', content: 'Details...' }, { title: 'Section 2', content: 'Details...' }];
  const key = ctx.lessonId + ':' + index;
  const open = LearnerUI.accordionOpen[key] || new Set([0]);
  return `
    <h3 style="font-size:15px; margin-bottom:10px;">${d.heading || 'Accordion'}</h3>
    ${items.map((item, i) => `
      <div class="card lp-accordion-item" data-key="${key}" data-i="${i}" style="margin-bottom:8px; overflow:hidden; cursor:pointer;">
        <div class="flex justify-between items-center" style="padding:12px 16px; font-weight:600; font-size:13px; background:${open.has(i) ? 'var(--pastel-lavender)' : 'var(--surface-0)'};">
          ${item.title} <span>${open.has(i) ? '▾' : '▸'}</span>
        </div>
        ${open.has(i) ? `<div style="padding:12px 16px;" class="text-sm">${item.content}</div>` : ''}
      </div>
    `).join('')}`;
}

/* ---- Tabs ---- */
function learnerTabsBlock(block, index, ctx) {
  const d = block.data || {};
  const tabs = d.tabs || ['Overview', 'Details', 'FAQ'];
  const key = ctx.lessonId + ':' + index;
  const active = LearnerUI.activeTabs[key] ?? 0;
  return `
    <div class="tabs" style="border-bottom:1px solid var(--border);">
      ${tabs.map((t, i) => `<div class="tab lp-tab ${i === active ? 'active' : ''}" data-key="${key}" data-i="${i}" style="cursor:pointer;">${t}</div>`).join('')}
    </div>
    <div class="text-sm mt-12">${(d.contents && d.contents[active]) || d.content || 'Tab content appears here.'}</div>`;
}

/* ---- Flashcards ---- */
function learnerFlashcardGrid(block, index, ctx) {
  const d = block.data || {};
  const cards = d.cards || ['Mission', 'Vision', 'Values'];
  const key = ctx.lessonId + ':' + index;
  const flipped = LearnerUI.flipped[key] || new Set();
  return `
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">
      ${cards.map((c, i) => `
        <div class="card card-pad lp-flip" data-key="${key}" data-i="${i}"
          style="text-align:center; cursor:pointer; height:80px; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:13px;
          ${flipped.has(i) ? 'background:var(--pastel-lavender); color:var(--ink-900);' : 'background:linear-gradient(90deg, var(--theme-primary, #7C3AED) 0%, var(--theme-secondary, #4F46E5) 55%, var(--theme-accent, #06B6D4) 100%); color:#fff;'}">
          ${flipped.has(i) ? 'Click to flip back' : c}
        </div>
      `).join('')}
    </div>`;
}

function learnerFlashcardStack(block, index, ctx) {
  const d = block.data || {};
  const key = ctx.lessonId + ':' + index;
  const flipped = !!LearnerUI.flipped[key];
  return `
    <div style="position:relative; height:120px;">
      <div class="card" style="position:absolute; top:8px; left:8px; right:-8px; bottom:-8px; background:var(--pastel-lavender);"></div>
      <div class="card card-pad lp-flip-stack" data-key="${key}" style="position:relative; height:120px; display:flex; align-items:center; justify-content:center; text-align:center; cursor:pointer;">
        <div>
          <div style="font-weight:600;">${flipped ? (d.back || 'Human Resources') : (d.front || 'What does HR stand for?')}</div>
          <div class="text-sm text-muted mt-8">Click to flip ${flipped ? 'back' : ''}</div>
        </div>
      </div>
    </div>`;
}

/* ---- Knowledge Checks ---- */
function learnerKcMultipleChoice(block, index, ctx) {
  const d = block.data || {};
  const options = d.options || ['Curiosity over certainty', 'Clarity over cleverness', 'Speed over quality', 'Process over people'];
  const correct = d.correct ?? 1;
  const key = ctx.lessonId + ':' + index;
  const ans = ctx.progress.kcAnswers[key];
  const submitted = ans && ans.submitted;
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Multiple Choice</div>
    <p style="font-weight:600; font-size:14px;">${d.question || 'Which of the following best reflects one of our core values?'}</p>
    <div class="flex-col gap-8 mt-12">
      ${options.map((o, i) => `
        <label class="flex items-center gap-8 card card-pad text-sm" style="cursor:${submitted ? 'default' : 'pointer'};
          ${submitted && i === correct ? 'border-color:var(--teal);' : ''}
          ${submitted && ans.selected === i && i !== correct ? 'border-color:#E5484D;' : ''}">
          <input type="radio" name="kc-${key}" data-kc-key="${key}" data-i="${i}" ${ans && ans.selected === i ? 'checked' : ''} ${submitted ? 'disabled' : ''} /> ${o}
          ${submitted && i === correct ? '<span style="margin-left:auto; color:var(--teal);">✓ Correct</span>' : ''}
          ${submitted && ans.selected === i && i !== correct ? '<span style="margin-left:auto; color:#E5484D;">✕ Your answer</span>' : ''}
        </label>
      `).join('')}
    </div>
    ${!submitted
      ? `<button class="btn btn-primary btn-sm mt-12 lp-kc-submit" data-kc-key="${key}" data-kc-type="mc" ${ans && ans.selected !== undefined ? '' : 'disabled'}>Check Answer</button>`
      : `<div class="text-sm mt-12" style="font-weight:600; color:${ans.correct ? 'var(--teal)' : '#E5484D'};">${ans.correct ? '✓ Correct!' : '✕ Not quite — the correct answer is highlighted above.'}</div>`}
  `;
}

function learnerKcMultipleResponse(block, index, ctx) {
  const d = block.data || {};
  const options = d.options || ['Curiosity', 'Clarity', 'Speed at all costs', 'People over process'];
  const key = ctx.lessonId + ':' + index;
  const ans = ctx.progress.kcAnswers[key] || { selected: [] };
  const submitted = ans.submitted;
  const hasCorrect = Array.isArray(d.correct);
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Select all that apply</div>
    <p style="font-weight:600;">${d.question || 'Which of these are core company values? (Select all that apply)'}</p>
    <div class="flex-col gap-8 mt-12">
      ${options.map((o, i) => `
        <label class="flex items-center gap-8 text-sm card card-pad" style="cursor:${submitted ? 'default' : 'pointer'};
          ${submitted && hasCorrect && d.correct.includes(i) ? 'border-color:var(--teal);' : ''}">
          <input type="checkbox" data-kc-key="${key}" data-i="${i}" ${(ans.selected || []).includes(i) ? 'checked' : ''} ${submitted ? 'disabled' : ''} /> ${o}
          ${submitted && hasCorrect && d.correct.includes(i) ? '<span style="margin-left:auto; color:var(--teal);">✓</span>' : ''}
        </label>
      `).join('')}
    </div>
    ${!submitted
      ? `<button class="btn btn-primary btn-sm mt-12 lp-kc-submit" data-kc-key="${key}" data-kc-type="response" ${(ans.selected || []).length ? '' : 'disabled'}>Check Answer</button>`
      : (hasCorrect
          ? `<div class="text-sm mt-12" style="font-weight:600; color:${ans.correct ? 'var(--teal)' : '#E5484D'};">${ans.correct ? '✓ Correct!' : '✕ Not quite — correct options are highlighted above.'}</div>`
          : `<div class="text-sm mt-12 text-muted">Response recorded.</div>`)}
  `;
}

function learnerKcMatching(block, index, ctx) {
  const d = block.data || {};
  const left = d.left || ['Onboarding', 'Benefits', 'IT Support'];
  const right = d.right || ['Day 1 checklist', 'Health & retirement', 'Help desk ticket'];
  const key = ctx.lessonId + ':' + index;
  const ans = ctx.progress.kcAnswers[key] || { pairs: {}, selectedLeft: null };
  const pairs = ans.pairs || {};
  const submitted = ans.submitted;
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Matching</div>
    <p class="text-sm text-muted mb-8">Tap an item on the left, then its match on the right.</p>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="flex-col gap-8">
        ${left.map((l, i) => `
          <div class="card card-pad text-sm lp-match-left" data-kc-key="${key}" data-i="${i}"
            style="cursor:${submitted ? 'default' : 'pointer'}; ${ans.selectedLeft === i ? 'border-color:var(--theme-primary, var(--indigo));' : ''}">
            ${l}${Object.prototype.hasOwnProperty.call(pairs, i) ? ` → ${right[pairs[i]] || ''}` : ''}
          </div>
        `).join('')}
      </div>
      <div class="flex-col gap-8">
        ${right.map((r, i) => `
          <div class="card card-pad text-sm lp-match-right" data-kc-key="${key}" data-i="${i}"
            style="cursor:${submitted ? 'default' : 'pointer'}; background:var(--pastel-lavender); border:none;">${r}</div>
        `).join('')}
      </div>
    </div>
    ${!submitted
      ? `<button class="btn btn-primary btn-sm mt-12 lp-match-submit" data-kc-key="${key}" ${Object.keys(pairs).length === left.length ? '' : 'disabled'}>Check Matches</button>`
      : `<div class="text-sm mt-12" style="font-weight:600; color:${ans.correct ? 'var(--teal)' : '#E5484D'};">${ans.correct ? '✓ All matched correctly!' : '✕ Some matches are incorrect.'}</div>`}
  `;
}

function learnerKcOrdering(block, index, ctx) {
  const d = block.data || {};
  const items = d.items || ['Receive offer letter', 'Complete paperwork', 'Attend orientation', 'Meet your team'];
  const key = ctx.lessonId + ':' + index;
  let ans = ctx.progress.kcAnswers[key];
  if (!ans || !ans.order) {
    ans = { ...(ans || {}), order: shuffleArray(items.map((_, i) => i)) };
    ctx.progress.kcAnswers[key] = ans;
  }
  const order = ans.order;
  const submitted = ans.submitted;
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Put in order</div>
    <p class="text-sm text-muted mb-8">Use the arrows to arrange these in the correct order.</p>
    <div class="flex-col gap-8 mt-8">
      ${order.map((itemIdx, pos) => `
        <div class="card card-pad flex items-center gap-12 text-sm">
          <span class="pill pill-grey">${pos + 1}</span>
          <span style="flex:1;">${items[itemIdx]}</span>
          ${!submitted ? `
            <button class="btn-icon lp-order-up" data-kc-key="${key}" data-block-index="${index}" data-i="${pos}" ${pos === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-icon lp-order-down" data-kc-key="${key}" data-block-index="${index}" data-i="${pos}" ${pos === order.length - 1 ? 'disabled' : ''}>↓</button>
          ` : ''}
        </div>
      `).join('')}
    </div>
    ${!submitted
      ? `<button class="btn btn-primary btn-sm mt-12 lp-order-submit" data-kc-key="${key}">Check Order</button>`
      : `<div class="text-sm mt-12" style="font-weight:600; color:${ans.correct ? 'var(--teal)' : '#E5484D'};">${ans.correct ? '✓ Correct order!' : '✕ Not quite the right order.'}</div>`}
  `;
}

function learnerKcFillGap(block, index, ctx) {
  const d = block.data || {};
  const key = ctx.lessonId + ':' + index;
  const ans = ctx.progress.kcAnswers[key] || {};
  const text = d.text || 'Our core values are Curiosity, Clarity, ____, and People over process.';
  const submitted = ans.submitted;
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Fill the Gap</div>
    <p style="font-size:15px; line-height:2;">${text}</p>
    <input class="input lp-kc-fillgap-input" data-kc-key="${key}" placeholder="Type your answer..." value="${(ans.response || '').replace(/"/g, '&quot;')}" ${submitted ? 'disabled' : ''} />
    ${!submitted
      ? `<button class="btn btn-primary btn-sm mt-12 lp-kc-fillgap-submit" data-kc-key="${key}">Submit</button>`
      : `<div class="text-sm mt-12 text-muted">Response recorded.</div>`}
  `;
}

/* ---------------- SCORING ---------------- */
function submitKc(ctx, key, type, blocks) {
  const ans = ctx.progress.kcAnswers[key] || {};
  if (ans.submitted) return;
  const blockIndex = parseInt(key.split(':')[1], 10);
  const d = (blocks[blockIndex] && blocks[blockIndex].data) || {};
  let correct = null;

  if (type === 'mc') {
    correct = ans.selected === (d.correct ?? 1);
  } else if (type === 'response') {
    if (Array.isArray(d.correct)) {
      const sel = new Set(ans.selected || []);
      const exp = new Set(d.correct);
      correct = sel.size === exp.size && [...sel].every(x => exp.has(x));
    }
  } else if (type === 'ordering') {
    const order = ans.order || (d.items || []).map((_, i) => i);
    correct = order.every((v, i) => v === i);
  } else if (type === 'matching') {
    const left = d.left || [];
    const pairs = ans.pairs || {};
    correct = left.every((_, i) => pairs[i] === i);
  }

  ans.submitted = true;
  ans.correct = correct;
  if (correct !== null) {
    ctx.progress.score.total++;
    if (correct) ctx.progress.score.correct++;
  }
  ctx.progress.kcAnswers[key] = ans;
}

/* ---------------- EVENT BINDING ---------------- */
function bindLearnerBlockEvents(course, blocks, ctx) {
  const app = document.getElementById('app');
  const rerender = () => renderLearnerLesson(course, ctx.lessonId);

  // Continue
  app.querySelectorAll('.lp-continue').forEach(btn => btn.addEventListener('click', () => {
    const lessonId = btn.dataset.lesson, idx = parseInt(btn.dataset.index, 10);
    if (!LearnerUI.revealedContinues[lessonId]) LearnerUI.revealedContinues[lessonId] = new Set();
    LearnerUI.revealedContinues[lessonId].add(idx);
    rerender();
  }));

  // Accordion
  app.querySelectorAll('.lp-accordion-item').forEach(itemEl => itemEl.addEventListener('click', () => {
    const key = itemEl.dataset.key, i = parseInt(itemEl.dataset.i, 10);
    const set = LearnerUI.accordionOpen[key] || new Set();
    if (set.has(i)) set.delete(i); else set.add(i);
    LearnerUI.accordionOpen[key] = set;
    rerender();
  }));

  // Tabs
  app.querySelectorAll('.lp-tab').forEach(tabEl => tabEl.addEventListener('click', () => {
    LearnerUI.activeTabs[tabEl.dataset.key] = parseInt(tabEl.dataset.i, 10);
    rerender();
  }));

  // Flashcard grid
  app.querySelectorAll('.lp-flip').forEach(cardEl => cardEl.addEventListener('click', () => {
    const key = cardEl.dataset.key, i = parseInt(cardEl.dataset.i, 10);
    const set = LearnerUI.flipped[key] || new Set();
    if (set.has(i)) set.delete(i); else set.add(i);
    LearnerUI.flipped[key] = set;
    rerender();
  }));

  // Flashcard stack
  app.querySelectorAll('.lp-flip-stack').forEach(cardEl => cardEl.addEventListener('click', () => {
    const key = cardEl.dataset.key;
    LearnerUI.flipped[key] = !LearnerUI.flipped[key];
    rerender();
  }));

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
    rerender();
  }));

  // KC fill gap
  app.querySelectorAll('.lp-kc-fillgap-input').forEach(input => input.addEventListener('input', () => {
    const key = input.dataset.kcKey;
    ctx.progress.kcAnswers[key] = { ...(ctx.progress.kcAnswers[key] || {}), response: input.value };
  }));
  app.querySelectorAll('.lp-kc-fillgap-submit').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.kcKey;
    const ans = ctx.progress.kcAnswers[key] || {};
    ans.submitted = true;
    ctx.progress.kcAnswers[key] = ans;
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
    rerender();
  }));

  // KC matching
  app.querySelectorAll('.lp-match-left, .lp-match-right').forEach(elx => elx.addEventListener('click', () => {
    const key = elx.dataset.kcKey, i = parseInt(elx.dataset.i, 10);
    const ans = ctx.progress.kcAnswers[key] || { pairs: {}, selectedLeft: null };
    if (ans.submitted) return;
    if (elx.classList.contains('lp-match-left')) {
      ans.selectedLeft = i;
    } else if (ans.selectedLeft !== null && ans.selectedLeft !== undefined) {
      ans.pairs = ans.pairs || {};
      ans.pairs[ans.selectedLeft] = i;
      ans.selectedLeft = null;
    }
    ctx.progress.kcAnswers[key] = ans;
    rerender();
  }));
  app.querySelectorAll('.lp-match-submit').forEach(btn => btn.addEventListener('click', () => {
    submitKc(ctx, btn.dataset.kcKey, 'matching', blocks);
    rerender();
  }));
}
