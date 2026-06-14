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
  carouselIndex: {},     // "lessonId:blockIndex" -> active slide index
  quoteCarouselIndex: {}, // "lessonId:blockIndex" -> active quote index
  listChecked: {},       // "lessonId:blockIndex" -> Set<itemIndex> of checked checkbox-list items
  scenarioAnswers: {},   // "lessonId:blockIndex" -> selected choice index
  activeHotspot: {},     // "lessonId:blockIndex" -> active hotspot index | null
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
  return `width:100%; max-width:${frame.width}; height:100%; margin:0 auto; border:1px solid var(--border); border-radius:16px; overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.08); background:var(--theme-bg-style, var(--surface-0));`;
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

  // Only restore scroll position when re-rendering the same lesson (e.g.
  // after a Continue click, KC answer, flashcard flip, etc.). Navigating to
  // a different lesson, or entering/exiting Preview, should reset scroll.
  const activeLessonId = opts.activeLessonId || null;
  const sameLesson = activeLessonId !== null && LearnerUI.lastLessonId === activeLessonId;
  const prevScroll = sameLesson ? (app.querySelector('main')?.scrollTop || 0) : 0;
  LearnerUI.lastLessonId = activeLessonId;

  if (LearnerUI.fullScreen) {
    app.innerHTML = `
      <div style="height:100vh; display:flex; flex-direction:column; overflow:hidden; background:var(--surface-0); ${themeVarStyle(course.themeDesign)}">
        <div class="flex items-center justify-end" style="padding:10px 16px; flex-shrink:0;">
          <button class="btn btn-secondary btn-sm" id="lp-fullscreen-exit">✕ Exit Full Screen Preview</button>
        </div>
        <div style="flex:1; overflow:auto; display:flex; justify-content:center; padding:0 0 24px;">
          <div style="${frameStyle}">
            <main style="height:100%; overflow-y:auto; display:flex; flex-direction:column; container-type:inline-size;">${bodyHtml}</main>
          </div>
        </div>
      </div>
      ${canvasStyles()}
    `;
    app.querySelector('#lp-fullscreen-exit').addEventListener('click', () => { LearnerUI.fullScreen = false; reRender(); });
    if (sameLesson) {
      const main = app.querySelector('main');
      if (main) main.scrollTop = prevScroll;
    }
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
        <div style="flex:1; overflow:auto; display:flex; justify-content:center; background:var(--surface-0);">
          <div style="${frameStyle}">
            <main style="height:100%; overflow-y:auto; display:flex; flex-direction:column; container-type:inline-size;">${bodyHtml}</main>
          </div>
        </div>
      </div>
    </div>
    ${canvasStyles()}
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

  if (sameLesson) {
    const main = app.querySelector('main');
    if (main) main.scrollTop = prevScroll;
  }
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
    const alignStyle = ds.align ? `text-align:${ds.align};` : '';
    const extraStyle = `${alignStyle} ${textBlockExtraStyle(block)}${statementBlockExtraStyle(block)}${quoteBlockExtraStyle(block)}${listBlockExtraStyle(block)}`;
    const { treatment } = DesignSystem.resolveBlockStyle(block);
    let wrapperStyle;
    if (treatment === 'cardless') {
      // Match the Builder canvas: cardless blocks render as flat page
      // content with no card chrome, only spacing between blocks.
      wrapperStyle = `background:transparent; box-shadow:none; border-radius:0; margin-bottom:16px; padding:22px; ${extraStyle}`;
    } else {
      const bgStyle = ds.bg && ds.bg !== 'transparent' ? `background:${ds.bg};` : 'background:var(--surface-0);';
      const radiusStyle = ds.radius ? `border-radius:${RADIUS_MAP[ds.radius] || 'var(--theme-radius, var(--r-lg))'};` : 'border-radius:var(--theme-radius, var(--r-lg));';
      wrapperStyle = `${bgStyle} ${radiusStyle} box-shadow:var(--shadow-soft); margin-bottom:16px; padding:22px; ${extraStyle}`;
    }
    html += `<div style="${wrapperStyle}">${renderLearnerBlock(block, i, ctx)}</div>`;
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
    case 'button': return learnerButtonBlock(block, index, ctx);
    case 'file': return learnerFileBlock(block, index, ctx);
    case 'video': return learnerVideoBlock(block, index, ctx);
    case 'audio': return learnerAudioBlock(block, index, ctx);
    case 'carousel': return learnerCarouselBlock(block, index, ctx);
    case 'quote_carousel': return learnerQuoteCarouselBlock(block, index, ctx);
    case 'scenario': return learnerScenarioBlock(block, index, ctx);
    case 'labelled_graphic': return learnerLabelledGraphicBlock(block, index, ctx);
    case 'list_checkbox': return learnerListCheckboxBlock(block, index, ctx);
    default: return renderBlockContent(block, false);
  }
}

/* ---- Continue (progressive reveal) ---- */
function learnerContinueBlock(block, index, ctx) {
  const d = block.data || {};
  const revealed = (LearnerUI.revealedContinues[ctx.lessonId] || new Set()).has(index);
  const srOnlyStyle = 'position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;';
  return `
    <div style="text-align:center; padding:8px 0; position:relative;">
      ${revealed
        ? `<span class="pill pill-grey">✓ Continued</span>`
        : `<button class="btn btn-secondary lp-continue" data-lesson="${ctx.lessonId}" data-index="${index}">${d.label || 'Continue'} ▾</button>`}
      <span aria-live="polite" style="${srOnlyStyle}">${revealed ? 'Additional content revealed below.' : ''}</span>
    </div>`;
}

/* ---- Button ---- */
function learnerButtonBlock(block, index, ctx) {
  const d = block.data || {};
  const label = d.label || 'View Resource →';
  if (d.url) {
    return `<div style="text-align:center;"><a class="btn btn-primary" href="${escapeHtml(d.url)}" ${d.newTab ? 'target="_blank" rel="noopener"' : ''}>${escapeHtml(label)}</a></div>`;
  }
  return `<div style="text-align:center;"><button class="btn btn-primary" disabled title="No link set for this button">${escapeHtml(label)}</button></div>`;
}

/* ---- File ---- */
/* ---- File / Video / Audio ----
   All three use the shared renderBlockContent renderer so Builder and Preview
   stay in parity — Preview is the only mode where autoplay/loop settings apply. */
function learnerFileBlock(block, index, ctx) {
  return renderBlockContent(block, false);
}

function learnerVideoBlock(block, index, ctx) {
  return renderBlockContent(block, false);
}

function learnerAudioBlock(block, index, ctx) {
  return renderBlockContent(block, false);
}

/* ---- Carousel ---- */
function learnerCarouselBlock(block, index, ctx) {
  const d = block.data || {};
  const slides = normalizeCarouselItems(d);
  const key = ctx.lessonId + ':' + index;
  const active = ((LearnerUI.carouselIndex[key] || 0) % slides.length + slides.length) % slides.length;
  const slide = slides[active];
  const slideHtml = slide.src
    ? `<img src="${slide.src}" alt="" class="image-zoom-trigger" data-zoom-src="${slide.src}" data-zoom-alt="" style="width:100%; height:200px; object-fit:cover; border-radius:var(--r-md); display:block; cursor:zoom-in;" />`
    : `<div class="card card-pad" style="text-align:center; min-height:120px; display:flex; align-items:center; justify-content:center; background:var(--pastel-lavender);">
        <span style="font-weight:600; font-size:14px;">${escapeHtml(slide.caption || `Slide ${active + 1}`)}</span>
      </div>`;
  const captionHtml = (slide.src && slide.caption) ? `<div class="text-sm mt-8" style="text-align:center;">${richTextOut(slide.caption)}</div>` : '';
  return `
    <div>
      ${slideHtml}
      ${captionHtml}
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
  const quotes = (d.quotes && d.quotes.length) ? d.quotes : DEFAULT_QUOTES;
  const key = ctx.lessonId + ':' + index;
  const active = ((LearnerUI.quoteCarouselIndex[key] || 0) % quotes.length + quotes.length) % quotes.length;
  const q = quotes[active];
  return `
    <div>
      <div class="card card-pad" style="min-height:100px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; background:var(--pastel-lavender);">
        ${q.avatar ? `<img src="${q.avatar}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover; margin-bottom:8px;" />` : ''}
        <p class="text-sm"${q.textAlign ? ` style="text-align:${q.textAlign};"` : ''}>${richTextOut(q.text || '')}</p>
        ${q.author ? `<p class="text-sm text-muted mt-8"${q.authorAlign ? ` style="text-align:${q.authorAlign};"` : ''}>${richTextOut(q.author)}</p>` : ''}
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

/* ---- Scenario ---- */
function learnerScenarioBlock(block, index, ctx) {
  const d = block.data || {};
  const rawChoices = (d.choices && d.choices.length) ? d.choices : ['Apologize and offer a solution', 'Explain that it is not your department', 'Transfer the call immediately'];
  const choices = rawChoices.map(c => typeof c === 'string' ? { text: c, feedback: '' } : c);
  const key = ctx.lessonId + ':' + index;
  const selected = LearnerUI.scenarioAnswers[key];
  return `
    <div class="card card-pad" style="background:var(--pastel-cyan); border:none;">
      <div class="pill pill-cyan mb-8">🌳 Branching Scenario</div>
      <p style="font-weight:600; font-size:14px;">${escapeHtml(d.prompt || 'A customer calls upset about a delayed shipment. How do you respond?')}</p>
      <div class="flex-col gap-8 mt-12">
        ${choices.map((c, i) => `
          <div class="card card-pad lp-scenario-choice" data-key="${key}" data-i="${i}" role="button" tabindex="0"
            aria-pressed="${selected===i}"
            style="background:${selected===i?'var(--pastel-lavender)':'var(--surface-0)'}; font-size:13px; cursor:${selected===undefined?'pointer':'default'};">
            → ${escapeHtml(c.text)}
            ${selected===i && c.feedback ? `<div class="text-sm mt-8" style="font-weight:600;">${escapeHtml(c.feedback)}</div>` : ''}
          </div>
        `).join('')}
      </div>
      ${selected !== undefined ? `<p class="text-sm text-muted mt-12">You chose: "${escapeHtml(choices[selected].text)}"</p>` : ''}
    </div>`;
}

/* ---- Labelled Graphic ---- */
function learnerLabelledGraphicBlock(block, index, ctx) {
  const d = block.data || {};
  const key = ctx.lessonId + ':' + index;
  const hsPositions = [['20%','30%'],['55%','55%'],['75%','25%'],['35%','75%'],['85%','70%'],['10%','65%']];
  const hotspots = (d.hotspots && d.hotspots.length) ? d.hotspots : [{label:'1',description:''},{label:'2',description:''},{label:'3',description:''}];
  const active = LearnerUI.activeHotspot[key];
  return `
    <div style="${d.imageUrl ? `background-image:url('${escapeHtml(d.imageUrl)}'); background-size:cover; background-position:center;` : 'background:var(--pastel-lavender);'} border-radius:var(--r-md); height:220px; position:relative; display:flex; align-items:center; justify-content:center;">
      ${!d.imageUrl ? '<span style="font-size:32px;">🗺️</span>' : ''}
      ${hotspots.map((h, i) => `
        <button class="lp-hotspot" data-key="${key}" data-i="${i}" aria-pressed="${active===i}" aria-label="${escapeHtml(h.label || `Hotspot ${i+1}`)}"
          style="position:absolute; left:${hsPositions[i % hsPositions.length][0]}; top:${hsPositions[i % hsPositions.length][1]}; width:26px; height:26px; border-radius:50%; background:var(--gradient-primary); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; box-shadow:var(--shadow-soft); border:${active===i?'2px solid #fff':'none'}; cursor:pointer;">${i+1}</button>
      `).join('')}
    </div>
    ${active != null ? `<div class="card card-pad mt-12"><div style="font-weight:600;">${escapeHtml(hotspots[active].label || `Hotspot ${active+1}`)}</div>${hotspots[active].description ? `<div class="text-sm text-muted mt-4">${escapeHtml(hotspots[active].description)}</div>` : ''}</div>` : ''}
  `;
}

/* ---- Accordion ---- */
function learnerAccordionBlock(block, index, ctx) {
  const d = block.data || {};
  const items = d.items || [{ title: 'Section 1', content: 'Details...' }, { title: 'Section 2', content: 'Details...' }];
  const key = ctx.lessonId + ':' + index;
  const open = LearnerUI.accordionOpen[key] || new Set([0]);
  const idBase = `lp-accordion-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;
  return `
    <h3 style="font-size:15px; margin-bottom:10px;">${d.heading || 'Accordion'}</h3>
    ${items.map((item, i) => {
      const headerId = `${idBase}-header-${i}`;
      const panelId = `${idBase}-panel-${i}`;
      return `
      <div class="card lp-accordion-item" data-key="${key}" data-i="${i}" id="${headerId}"
        role="button" tabindex="0" aria-expanded="${open.has(i)}" aria-controls="${panelId}"
        style="margin-bottom:8px; overflow:hidden; cursor:pointer;">
        <div class="flex justify-between items-center" style="padding:12px 16px; font-weight:600; font-size:13px; background:${open.has(i) ? 'var(--pastel-lavender)' : 'var(--surface-0)'};">
          ${item.title} <span aria-hidden="true">${open.has(i) ? '▾' : '▸'}</span>
        </div>
        ${open.has(i) ? `<div id="${panelId}" role="region" aria-labelledby="${headerId}" style="padding:12px 16px;" class="text-sm">${item.content}</div>` : ''}
      </div>
    `;
    }).join('')}`;
}

/* ---- Checkbox list (interactive — learners can tick/untick; state persists for the session) ---- */
function learnerListCheckboxBlock(block, index, ctx) {
  const d = block.data || {};
  const ds = block.design || {};
  const def = LIST_DEFAULTS[block.type];
  const items = normalizeListItems(d, def.items);
  const key = ctx.lessonId + ':' + index;
  if (!LearnerUI.listChecked[key]) {
    LearnerUI.listChecked[key] = new Set(items.map((it, i) => i).filter(i => items[i].checked));
  }
  const checkedSet = LearnerUI.listChecked[key];
  const indent = ds.indent ?? 20;
  const itemsHtml = renderListItemsHtml(block, ds, items, false, { checkedSet, key });
  return `<h3 style="font-size:15px; margin-bottom:10px;">${richTextOut(d.heading != null ? d.heading : def.heading)}</h3>
    <div class="list-items-wrap" role="list" style="padding-left:${indent}px;">${itemsHtml}</div>`;
}

/* ---- Tabs ---- */
function learnerTabsBlock(block, index, ctx) {
  const d = block.data || {};
  const tabs = d.tabs || ['Overview', 'Details', 'FAQ'];
  const key = ctx.lessonId + ':' + index;
  const active = LearnerUI.activeTabs[key] ?? 0;
  const idBase = `lp-tabs-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const panelId = `${idBase}-panel`;
  return `
    <div class="tabs" role="tablist" style="border-bottom:1px solid var(--border);">
      ${tabs.map((t, i) => `<div class="tab lp-tab ${i === active ? 'active' : ''}" data-key="${key}" data-i="${i}" id="${idBase}-tab-${i}"
        role="tab" aria-selected="${i === active}" aria-controls="${panelId}" tabindex="0" style="cursor:pointer;">${t}</div>`).join('')}
    </div>
    <div class="text-sm mt-12" id="${panelId}" role="tabpanel" aria-labelledby="${idBase}-tab-${active}">${(d.contents && d.contents[active]) || d.content || 'Tab content appears here.'}</div>`;
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
          role="button" tabindex="0" aria-pressed="${flipped.has(i)}"
          aria-label="${flipped.has(i) ? `Flashcard back: ${escapeHtml(c)}. Press to flip back to front.` : `Flashcard front: ${escapeHtml(c)}. Press to flip.`}"
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
      <div class="card card-pad lp-flip-stack" data-key="${key}"
        role="button" tabindex="0" aria-pressed="${flipped}"
        aria-label="${flipped ? `Showing answer: ${escapeHtml(d.back || 'Human Resources')}. Press to flip back to question.` : `Showing question: ${escapeHtml(d.front || 'What does HR stand for?')}. Press to flip to answer.`}"
        style="position:relative; height:120px; display:flex; align-items:center; justify-content:center; text-align:center; cursor:pointer;">
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
    <fieldset style="border:none; margin:0; padding:0;">
      <legend style="font-weight:600; font-size:14px; padding:0; width:100%;">${d.question || 'Which of the following best reflects one of our core values?'}</legend>
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
    </fieldset>
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
    <fieldset style="border:none; margin:0; padding:0;">
      <legend style="font-weight:600; padding:0; width:100%;">${d.question || 'Which of these are core company values? (Select all that apply)'}</legend>
      <div class="flex-col gap-8 mt-12">
        ${options.map((o, i) => `
          <label class="flex items-center gap-8 text-sm card card-pad" style="cursor:${submitted ? 'default' : 'pointer'};
            ${submitted && hasCorrect && d.correct.includes(i) ? 'border-color:var(--teal);' : ''}">
            <input type="checkbox" data-kc-key="${key}" data-i="${i}" ${(ans.selected || []).includes(i) ? 'checked' : ''} ${submitted ? 'disabled' : ''} /> ${o}
            ${submitted && hasCorrect && d.correct.includes(i) ? '<span style="margin-left:auto; color:var(--teal);">✓</span>' : ''}
          </label>
        `).join('')}
      </div>
    </fieldset>
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
        ${left.map((l, i) => {
          const matchedTo = Object.prototype.hasOwnProperty.call(pairs, i) ? right[pairs[i]] || '' : '';
          const label = matchedTo ? `${l}, matched with ${matchedTo}` : `${l}${ans.selectedLeft === i ? ', selected' : ''}`;
          return `
          <div class="card card-pad text-sm lp-match-left" data-kc-key="${key}" data-i="${i}"
            role="button" tabindex="${submitted ? '-1' : '0'}" aria-pressed="${ans.selectedLeft === i}" aria-label="${escapeHtml(label)}"
            style="cursor:${submitted ? 'default' : 'pointer'}; ${ans.selectedLeft === i ? 'border-color:var(--theme-primary, var(--indigo));' : ''}">
            ${l}${matchedTo ? ` → ${matchedTo}` : ''}
          </div>
        `;
        }).join('')}
      </div>
      <div class="flex-col gap-8">
        ${right.map((r, i) => `
          <div class="card card-pad text-sm lp-match-right" data-kc-key="${key}" data-i="${i}"
            role="button" tabindex="${submitted ? '-1' : '0'}" aria-label="${escapeHtml(r)}"
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
      : (ans.correct === null
          ? `<div class="text-sm mt-12 text-muted">Response recorded.</div>`
          : `<div class="text-sm mt-12" style="font-weight:600; color:${ans.correct ? 'var(--teal)' : '#E5484D'};">${ans.correct ? '✓ Correct!' : `✕ Not quite — accepted answer: ${(d.answer||'').split('|')[0].trim()}`}</div>`)}
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
  } else if (type === 'fill_gap') {
    const accepted = (d.answer || '').split('|').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (accepted.length) {
      correct = accepted.includes((ans.response || '').trim().toLowerCase());
    }
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

  // Keydown helper: runs `fn` only for Enter/Space, preventing the page
  // scroll Space would otherwise trigger and avoiding a duplicate
  // activation if the browser also synthesizes a click for the keypress.
  const onActivateKey = (e, fn) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    e.preventDefault();
    fn();
  };

  // Accordion
  const toggleAccordionItem = (key, i) => {
    const set = LearnerUI.accordionOpen[key] || new Set();
    if (set.has(i)) set.delete(i); else set.add(i);
    LearnerUI.accordionOpen[key] = set;
    rerender();
  };
  app.querySelectorAll('.lp-accordion-item').forEach(itemEl => {
    const key = itemEl.dataset.key, i = parseInt(itemEl.dataset.i, 10);
    itemEl.addEventListener('click', () => toggleAccordionItem(key, i));
    itemEl.addEventListener('keydown', (e) => onActivateKey(e, () => toggleAccordionItem(key, i)));
  });

  // Tabs
  const selectTab = (key, i) => {
    LearnerUI.activeTabs[key] = i;
    rerender();
  };
  app.querySelectorAll('.lp-tab').forEach(tabEl => {
    const key = tabEl.dataset.key, i = parseInt(tabEl.dataset.i, 10);
    tabEl.addEventListener('click', () => selectTab(key, i));
    tabEl.addEventListener('keydown', (e) => onActivateKey(e, () => selectTab(key, i)));
  });

  // Flashcard grid
  const flipGridCard = (key, i) => {
    const set = LearnerUI.flipped[key] || new Set();
    if (set.has(i)) set.delete(i); else set.add(i);
    LearnerUI.flipped[key] = set;
    rerender();
  };
  app.querySelectorAll('.lp-flip').forEach(cardEl => {
    const key = cardEl.dataset.key, i = parseInt(cardEl.dataset.i, 10);
    cardEl.addEventListener('click', () => flipGridCard(key, i));
    cardEl.addEventListener('keydown', (e) => onActivateKey(e, () => flipGridCard(key, i)));
  });

  // Flashcard stack
  const flipStackCard = (key) => {
    LearnerUI.flipped[key] = !LearnerUI.flipped[key];
    rerender();
  };
  app.querySelectorAll('.lp-flip-stack').forEach(cardEl => {
    const key = cardEl.dataset.key;
    cardEl.addEventListener('click', () => flipStackCard(key));
    cardEl.addEventListener('keydown', (e) => onActivateKey(e, () => flipStackCard(key)));
  });

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
    submitKc(ctx, btn.dataset.kcKey, 'fill_gap', blocks);
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
  const handleMatchClick = (elx) => {
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
  };
  app.querySelectorAll('.lp-match-left, .lp-match-right').forEach(elx => {
    elx.addEventListener('click', () => handleMatchClick(elx));
    elx.addEventListener('keydown', (e) => onActivateKey(e, () => handleMatchClick(elx)));
  });
  app.querySelectorAll('.lp-match-submit').forEach(btn => btn.addEventListener('click', () => {
    submitKc(ctx, btn.dataset.kcKey, 'matching', blocks);
    rerender();
  }));

  // Carousel nav
  app.querySelectorAll('.lp-carousel-prev').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    LearnerUI.carouselIndex[key] = (LearnerUI.carouselIndex[key] || 0) - 1;
    rerender();
  }));
  app.querySelectorAll('.lp-carousel-next').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    LearnerUI.carouselIndex[key] = (LearnerUI.carouselIndex[key] || 0) + 1;
    rerender();
  }));

  // Quote carousel nav
  app.querySelectorAll('.lp-quote-prev').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    LearnerUI.quoteCarouselIndex[key] = (LearnerUI.quoteCarouselIndex[key] || 0) - 1;
    rerender();
  }));
  app.querySelectorAll('.lp-quote-next').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    LearnerUI.quoteCarouselIndex[key] = (LearnerUI.quoteCarouselIndex[key] || 0) + 1;
    rerender();
  }));

  // Scenario choice selection
  const selectScenarioChoice = (key, i) => {
    if (LearnerUI.scenarioAnswers[key] !== undefined) return;
    LearnerUI.scenarioAnswers[key] = i;
    rerender();
  };
  app.querySelectorAll('.lp-scenario-choice').forEach(elx => {
    const key = elx.dataset.key, i = parseInt(elx.dataset.i, 10);
    elx.addEventListener('click', () => selectScenarioChoice(key, i));
    elx.addEventListener('keydown', (e) => onActivateKey(e, () => selectScenarioChoice(key, i)));
  });

  // Labelled graphic hotspots
  app.querySelectorAll('.lp-hotspot').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.key, i = parseInt(btn.dataset.i, 10);
    LearnerUI.activeHotspot[key] = LearnerUI.activeHotspot[key] === i ? null : i;
    rerender();
  }));

  // Checkbox list — learner ticks/unticks items (session-only state)
  const toggleListChecked = (key, i) => {
    const set = LearnerUI.listChecked[key] || new Set();
    if (set.has(i)) set.delete(i); else set.add(i);
    LearnerUI.listChecked[key] = set;
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
