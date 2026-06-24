/* ============================================================
   LESSON BUILDER
   ============================================================ */

const BuilderUI = {
  selected: null,       // index of selected block (drives right panel)
  expandedBlocks: new Set(), // indices of blocks showing their toolbar/expanded state
  allowMultipleExpanded: false,
  leftCollapsed: false,
  rightCollapsed: false,
  showInsights: true,
  aiOpen: false,
  rightTab: 'content',
  expanded: {},
  dragIndex: null,
  insertZoneIndex: null, // drop-index of the active "insertion zone", or null
  // Stabilisation fix (nested-item builder render defect): which item(s)
  // are expanded/active per nested-item block, keyed by the block's STABLE
  // id (never a positional index — survives reorder). Without this, every
  // re-render (e.g. after a media-picker upload) recomputed "open" purely
  // from position (item 0 only), silently re-collapsing whatever the
  // author had open and hiding the very image they just attached. Read by
  // accordion/tabs/process/labelled_graphic render branches below, written
  // by lumioAccordionToggle/lumioTabSwitch/lumioProcessNav/lumioHotspotToggle.
  openItemState: {},
};

// Resolves the course + lesson/assessment object for a given lessonId.
// `preferredCourseId` (when supplied) is checked FIRST and, if it actually
// contains the lesson, resolved unambiguously without ever scanning other
// courses — this is how a real lesson-id collision (e.g. the historical
// c1/p1 case) gets resolved correctly even if it ever recurred, since the
// caller's own known context wins over a blind first-match scan.
// Callers that already know which course they're working in (e.g.
// courseLanding.js, which sets LumioState.currentCourseId on every course
// page load before any lesson link can be clicked) should rely on that —
// this function falls back to LumioState.currentCourseId automatically,
// and only falls all the way back to scanning every course (logging a
// warning, since at that point the result is genuinely ambiguous) if
// neither the explicit param nor the current course actually contains it.
function getCourseAndLesson(lessonId, preferredCourseId) {
  function findIn(course) {
    if (!course) return null;
    return course.lessons.find(x => x.id === lessonId)
      || (course.assessments || []).find(x => x.id === lessonId);
  }

  const hintedId = preferredCourseId || LumioState.currentCourseId;
  if (hintedId && LumioState.courses[hintedId]) {
    const hinted = findIn(LumioState.courses[hintedId]);
    if (hinted) return { course: LumioState.courses[hintedId], lesson: hinted };
  }

  let course = null, lesson = null;
  for (const c of Object.values(LumioState.courses)) {
    const l = findIn(c);
    if (l) { course = c; lesson = l; break; }
  }
  if (course && hintedId && course.id !== hintedId) {
    console.warn(`[Lumio] getCourseAndLesson("${lessonId}") resolved to course "${course.id}" via full scan — the hinted course "${hintedId}" did not contain this lesson. If two courses share this lesson id, this result may be ambiguous.`);
  }
  return { course, lesson };
}

function renderLessonBuilder(lessonId) {
  LumioState.currentLessonId = lessonId;
  if (!LumioState.lessons[lessonId]) LumioState.lessons[lessonId] = [];
  const { course, lesson } = getCourseAndLesson(lessonId);

  // Entry protection: a view-only user never reaches the editable canvas at
  // all — blocking entry entirely is safer and more complete than trying to
  // disable every individual control (contenteditable text, block toolbars,
  // drag handles, settings panels, publish actions) one by one.
  const project = LumioState.projects.find(p => p.id === course.id);
  if (isProjectViewOnly(project)) {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; text-align:center; padding:40px;">
        <div style="font-size:40px;">👁️</div>
        <h2 style="font-size:20px;">View Only Access</h2>
        <p class="text-sm text-muted" style="max-width:420px;">You have view-only access to this project and cannot edit its content. Ask the project owner for edit access if you need to make changes.</p>
        <button class="btn btn-primary" id="view-only-return">← Return to Course</button>
      </div>
    `;
    app.querySelector('#view-only-return').addEventListener('click', () => navigate('#/course/' + course.id));
    return;
  }

  const blocks = LumioState.lessons[lessonId];

  const prevScroll = document.getElementById('lesson-canvas-wrap')?.scrollTop || 0;
  const prevLibraryScroll = document.getElementById('block-library-scroll')?.scrollTop || 0;
  // Sprint 3, Phase 10 fix: the right Design/Settings panel had no scroll-
  // position capture at all (unlike the canvas and block library just
  // above, which already did this correctly) — every property change
  // calls renderLessonBuilder(), which rebuilds the whole #app subtree
  // including this panel, silently resetting it to scrollTop 0. On a long
  // panel (Statement blocks, colour-heavy panels) that made every single
  // edit jump the panel back to the top.
  const prevRightScroll = document.getElementById('right-panel-scroll')?.scrollTop || 0;

  applyThemeVars(course);

  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="height:100vh; display:flex; flex-direction:column; overflow:hidden; font-family:var(--theme-font-body, var(--font-body));">
      ${renderBuilderTopbar(course, lesson)}
      <div style="flex:1; display:flex; min-height:0;">
        ${renderBlockLibrary(lesson, course)}
        <div style="flex:1; min-width:0; overflow-y:auto; background:var(--surface-0); position:relative;" id="lesson-canvas-wrap">
          <div style="max-width:860px; margin:0 auto; padding:40px 24px 200px; position:relative; z-index:1; container-type:inline-size;" id="lesson-canvas">
            ${renderCanvasBlocks(blocks)}
          </div>
        </div>
        ${renderRightPanel(blocks, course, lesson)}
      </div>
    </div>
    ${BuilderUI.aiOpen ? renderAIPanel(lesson, blocks) : ''}
    ${canvasStyles()}
  `;

  bindBuilderEvents(course, lesson, blocks);

  const wrap = document.getElementById('lesson-canvas-wrap');
  if (wrap) wrap.scrollTop = prevScroll;
  const libraryScroll = document.getElementById('block-library-scroll');
  if (libraryScroll) libraryScroll.scrollTop = prevLibraryScroll;
  const rightScroll = document.getElementById('right-panel-scroll');
  if (rightScroll) rightScroll.scrollTop = prevRightScroll;

  // Hydrate URL cache for any asset:// refs in this lesson, then re-render
  // once if new URLs were resolved (handles cold-start page reload).
  const _avatarRef = (getCurrentUser() || {}).avatar;
  AssetStore.preloadBlocks(blocks, _avatarRef ? [_avatarRef] : []).then(count => {
    if (count > 0) renderLessonBuilder(lessonId);
  });
}

/* ============================================================
   TOP BAR
   ============================================================ */
function renderBuilderTopbar(course, lesson) {
  return `
    <div class="flex items-center justify-between" style="padding:12px 20px; border-bottom:1px solid var(--border); background:var(--surface-0); flex-shrink:0;">
      <div class="flex items-center gap-12" style="min-width:0;">
        <img src="assets/lumio-logo-transparent.png" alt="Lumio" id="builder-logo" style="width:28px; height:28px; border-radius:0; object-fit:contain; display:block; cursor:pointer; flex-shrink:0;" />
        <button class="btn btn-ghost btn-sm" id="back-to-course">← ${course ? course.title : 'Course'}</button>
        <span class="text-muted">/</span>
        <input id="lesson-name-input" class="input" value="${lesson ? lesson.title : 'Untitled Lesson'}" style="border:none; font-family:var(--font-display); font-weight:600; font-size:15px; color:var(--ink-900); width:260px; padding:6px 8px;" />
      </div>
      <div class="flex items-center gap-12">
        <span class="text-sm text-muted" id="save-status">Saved ✓</span>
        <button class="btn btn-secondary btn-sm" id="preview-lesson">👁️ Preview</button>
        <button class="btn ${BuilderUI.aiOpen ? 'btn-primary' : 'btn-secondary'} btn-sm" id="toggle-ai" style="${!BuilderUI.aiOpen ? 'background:linear-gradient(135deg, rgba(124,58,237,0.08), rgba(6,182,212,0.08)); border-color:rgba(124,58,237,0.25);' : ''}">✨ AI Assistant</button>
      </div>
    </div>
  `;
}

/* ============================================================
   LEFT SIDEBAR — BLOCK LIBRARY
   ============================================================ */
function recommendedBlocks(lesson, course) {
  const objIdx = lesson ? lesson.objectiveIndex : null;
  const obj = (course && objIdx !== null && objIdx !== undefined) ? course.objectives[objIdx] : null;
  const verb = obj ? obj.verb : null;
  const applyVerbs = ['Demonstrate','Use','Solve','Implement','Compare','Differentiate','Organize','Examine','Justify','Critique','Assess','Recommend','Design','Develop','Construct','Compose'];

  let ids;
  if (verb && applyVerbs.includes(verb)) {
    ids = ['scenario', 'process', 'kc_ordering', 'flashcard_grid'];
  } else {
    ids = ['heading_paragraph', 'stmt_tip', 'accordion', 'kc_multiple_choice'];
  }
  const all = LumioData.blockLibrary.flatMap(c => c.blocks.map(b => ({...b, category: c.category})));
  return ids.map(id => all.find(b => b.id === id)).filter(Boolean);
}

function renderBlockLibrary(lesson, course) {
  if (BuilderUI.leftCollapsed) {
    return `
      <div style="width:48px; flex-shrink:0; border-right:1px solid var(--border); background:var(--surface-0); display:flex; flex-direction:column; align-items:center; padding:12px 0; gap:10px;">
        <button class="btn-icon" id="expand-library" title="Expand library">»</button>
      </div>
    `;
  }

  const rec = recommendedBlocks(lesson, course);

  let html = `
    <div style="width:260px; flex-shrink:0; border-right:1px solid var(--border); background:var(--surface-0); display:flex; flex-direction:column; min-height:0;">
      <div style="padding:14px; border-bottom:1px solid var(--border);" class="flex items-center gap-8">
        <div class="input-icon-wrap" style="flex:1;">
          <span class="icon">🔍</span>
          <input class="input" id="block-search" placeholder="Search blocks..." />
        </div>
        <button class="btn-icon" id="collapse-library" title="Collapse">«</button>
      </div>
      <div style="flex:1; overflow-y:auto; padding:8px 10px;" id="block-library-scroll">
        <div class="block-category" data-cat="Recommended">
          <div class="cat-header" data-cat="Recommended">
            <span>✨ Recommended for this lesson</span>
            <span class="caret">${BuilderUI.expanded['Recommended'] ? '▾' : '▸'}</span>
          </div>
          <div class="cat-body ${BuilderUI.expanded['Recommended'] ? 'expanded' : ''}">
            ${rec.map(b => blockTile(b)).join('')}
          </div>
        </div>
  `;

  LumioData.blockLibrary.filter(c => c.category !== 'Recommended').forEach(cat => {
    const expanded = !!BuilderUI.expanded[cat.category];
    html += `
        <div class="block-category" data-cat="${cat.category}">
          <div class="cat-header" data-cat="${cat.category}">
            <span>${cat.icon} ${cat.category}</span>
            <span class="caret">${expanded ? '▾' : '▸'}</span>
          </div>
          <div class="cat-body ${expanded ? 'expanded' : ''}">
            ${cat.blocks.map(b => blockTile(b)).join('')}
          </div>
        </div>
    `;
  });

  html += `
      </div>
    </div>
  `;
  return html;
}

/* Canvas + library styling shared across the lesson builder. Rendered once
   per build (regardless of whether the block library is expanded or
   collapsed) so canvas affordances like the insertion-point "+" buttons
   keep their correct hover-only appearance in both states. */
function canvasStyles() {
  return `
    <style>
      .cat-header { display:flex; align-items:center; justify-content:space-between; padding:10px 8px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-400); cursor:pointer; border-radius:var(--r-sm); }
      .cat-header:hover { background:var(--pastel-lavender); }
      .cat-body {
        display:grid; grid-template-columns:repeat(2,1fr); gap:0 8px; padding:0 4px;
        max-height:0; opacity:0; overflow:hidden;
        transition: max-height .25s ease, opacity .2s ease, padding .25s ease;
      }
      .cat-body.expanded { max-height:600px; opacity:1; padding:6px 4px 14px; gap:8px; }
      .block-tile { display:flex; flex-direction:column; align-items:center; gap:6px; padding:10px 6px; border-radius:var(--r-md); border:1px solid var(--border); background:var(--surface-0); cursor:grab; font-size:11px; text-align:center; color:var(--ink-700); transition:all .12s; }
      .block-tile:hover { border-color:var(--indigo); background:var(--pastel-lavender); transform:translateY(-1px); }
      .block-tile .tile-icon { font-size:18px; }
      .editable-text { outline:none; border-radius:4px; transition:background-color .12s; }
      /* Hover/focus affordances are builder-only — scoped to .canvas-block so
         they never fire inside the learner preview even though canvasStyles()
         is shared for the @container quote-layout queries below. */
      .canvas-block .editable-text { cursor:text; }
      .canvas-block .editable-text:hover { background:rgba(20,20,30,0.025); }
      /* Sprint 5A, Phase 6/7 fix: a focus-time background tint covering the
         WHOLE contenteditable element (not just the selected range) read as
         a permanent grey overlay the instant you clicked in to edit — it
         visually competed with the real (smaller) text-selection highlight
         underneath, making "I selected only the word X" look like "the
         whole line is highlighted". Removed; :hover (pre-edit affordance,
         gone once focus/typing starts) is kept. */
      .editable-text[data-placeholder]:empty:before { content: attr(data-placeholder); color: var(--ink-400); }

      /* Document-style insertion points — single reusable component used
         between blocks, at the end of the lesson, and as the drag/drop
         target. A generous 40px hit area keeps placement forgiving while
         the visible line stays a thin 2px rule at rest. */
      .drop-zone { position:relative; min-height:40px; margin:0; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background-color .15s; }
      .drop-zone-line { position:absolute; left:0; right:0; top:50%; height:2px; background:transparent; border-radius:2px; transform:translateY(-50%); transition:background-color .15s, height .15s, box-shadow .15s; }
      .drop-zone-add {
        position:relative; z-index:2; width:24px; height:24px; border-radius:50%;
        border:1px solid var(--border); background:var(--surface-0); color:var(--ink-400);
        font-size:15px; line-height:1; display:flex; align-items:center; justify-content:center;
        cursor:pointer; opacity:0; transition:opacity .15s, color .15s, border-color .15s, background-color .15s, transform .15s;
      }
      .drop-zone:hover .drop-zone-add,
      .drop-zone-add:focus-visible { opacity:1; }
      .drop-zone:hover .drop-zone-line { background:var(--border); }
      .drop-zone-add:hover, .drop-zone-add:focus-visible {
        border-color:var(--theme-primary, var(--indigo)); color:var(--theme-primary, var(--indigo)); background:var(--pastel-lavender);
      }
      /* While a block is being dragged, faintly reveal every insertion line so placement stays obvious */
      #lesson-canvas.dragging-block .drop-zone-line { background:var(--border); }
      #lesson-canvas.dragging-block .drop-zone-add { opacity:0; }
      /* Magnetic highlight — the zone under the dragged item lights up,
         the line thickens with a soft glow, and the "+" pops in slightly
         enlarged so the drop target feels alive without needing pixel-perfect aim. */
      .drop-zone.drag-active { background:color-mix(in srgb, var(--theme-primary, var(--indigo)) 5%, transparent); }
      .drop-zone.drag-active .drop-zone-line {
        background:var(--theme-primary, var(--indigo)); height:3px;
        box-shadow:0 0 0 4px color-mix(in srgb, var(--theme-primary, var(--indigo)) 12%, transparent);
      }
      .drop-zone.drag-active .drop-zone-add {
        opacity:1; transform:scale(1.15);
        border-color:var(--theme-primary, var(--indigo)); color:var(--theme-primary, var(--indigo)); background:var(--pastel-lavender);
      }

      /* Active insertion zone — lightweight placeholder shown after clicking "+" */
      .insertion-zone { height:auto; margin:8px 0; }
      .insertion-zone-box {
        width:100%; padding:14px 16px; border-radius:var(--r-md);
        border:1.5px dashed var(--theme-primary, var(--indigo)); background:var(--pastel-lavender);
        text-align:center; transition:border-color .12s, background-color .12s;
      }
      .insertion-zone.drag-active .insertion-zone-box {
        border-style:solid; border-width:2px;
        background:color-mix(in srgb, var(--theme-primary, var(--indigo)) 12%, var(--pastel-lavender));
      }
      .insertion-zone-title { font-size:13px; font-weight:600; color:var(--theme-primary, var(--indigo)); }
      .insertion-zone-title-drop { display:none; }
      .insertion-zone.drag-active .insertion-zone-title-default { display:none; }
      .insertion-zone.drag-active .insertion-zone-title-drop { display:inline; }
      .insertion-zone-hint { font-size:11px; color:var(--ink-400); margin-top:2px; }

      /* Empty-lesson insertion prompt */
      .empty-canvas { position:relative; text-align:center; padding:28px 24px; }
      .empty-canvas-line { position:absolute; left:0; right:0; top:24px; height:0; border-top:1px dashed var(--border); }
      .empty-canvas-add { position:relative; opacity:1; width:28px; height:28px; font-size:16px; margin:0 auto; }
      .empty-canvas.drag-active .empty-canvas-line { border-top-style:solid; border-color:var(--theme-primary, var(--indigo)); }

      /* Quote Style 3 & 4 — stack to a centred column on narrow viewports.
         Uses a container query (against #lesson-canvas / <main>, which have
         container-type:inline-size) so this responds to the Learner Preview
         device frame width, not just the browser viewport. */
      @container (max-width: 480px) {
        .quote3-layout, .quote4-layout { flex-direction:column; align-items:center; text-align:center; }
        .quote4-layout { padding:18px; }
        .quote4-layout > div:last-child { border-left:none; border-top:3px solid var(--theme-primary, var(--indigo)); padding-left:0; padding-top:12px; text-align:center; }
      }
    </style>
  `;
}

/* Styles shared by both the builder canvas AND the learner preview.
   Only layout/responsive rules live here — no authoring affordances. */
function sharedLayoutStyles() {
  return `
    <style>
      @container (max-width: 480px) {
        .quote3-layout, .quote4-layout { flex-direction:column; align-items:center; text-align:center; }
        .quote4-layout { padding:18px; }
        .quote4-layout > div:last-child { border-left:none; border-top:3px solid var(--theme-primary, var(--indigo)); padding-left:0; padding-top:12px; text-align:center; }
      }
    </style>
  `;
}

function blockTile(b) {
  return `<div class="block-tile" draggable="true" data-block-id="${b.id}" data-block-name="${b.name}">
    <span class="tile-icon">${b.icon}</span>
    <span>${b.name}</span>
  </div>`;
}

/* ============================================================
   CANVAS
   ============================================================ */
/* Document-style insertion point: a thin line that highlights on hover/drag,
   plus a small centered "+" control for click-to-insert. Always present in
   the DOM (for drag/drop targeting) but visually near-invisible at rest. */
/* Active insertion zone — replaces a drop-zone's line/"+" affordance with a
   lightweight placeholder while a "+" click is pending block selection. */
function insertionZoneBoxHtml(index) {
  return `
    <div class="insertion-zone-box">
      <div class="insertion-zone-title">
        <span class="insertion-zone-title-default">Insert Block Here</span>
        <span class="insertion-zone-title-drop">Drop Block Here</span>
      </div>
      <div class="insertion-zone-hint">Select a block from the library or drag a block here</div>
      <button class="btn btn-ghost btn-sm mt-8 insertion-zone-cancel" data-drop-index="${index}">Cancel</button>
    </div>
  `;
}

function insertionZoneHtml(index, extraClass) {
  return `
    <div class="drop-zone insertion-zone${extraClass ? ' ' + extraClass : ''}" data-drop-index="${index}">
      ${insertionZoneBoxHtml(index)}
    </div>
  `;
}

/* The single insertion-target component — used between blocks, at the end
   of the lesson, and (via dragover) as the drag/drop target. Exactly one of
   these renders per gap, so there is never more than one insertion line or
   "+" button at any position, including the end of the lesson. */
function dropZone(index, ariaLabel) {
  if (BuilderUI.insertZoneIndex === index) return insertionZoneHtml(index);
  return `
    <div class="drop-zone" data-drop-index="${index}">
      <div class="drop-zone-line"></div>
      <button class="drop-zone-add" data-drop-index="${index}" title="Insert block" aria-label="${ariaLabel || 'Insert block here'}">+</button>
    </div>
  `;
}

function renderCanvasBlocks(blocks) {
  if (blocks.length === 0) {
    if (BuilderUI.insertZoneIndex === 0) {
      return `
        <div class="empty-canvas fade-in insertion-zone" id="empty-canvas-drop" data-drop-index="0">
          ${insertionZoneBoxHtml(0)}
        </div>
      `;
    }
    return `
      <div class="empty-canvas fade-in" id="empty-canvas-drop">
        <div class="empty-canvas-line"></div>
        <button class="drop-zone-add empty-canvas-add" data-drop-index="0" title="Insert block" aria-label="Insert your first block">+</button>
        <p class="text-sm text-muted mt-12">Drag a block from the library, click + to add one, or let Lumio draft a starting point.</p>
        <button class="btn btn-secondary btn-sm mt-12" id="ai-draft-lesson">✨ Draft this lesson with AI</button>
      </div>
    `;
  }

  let html = dropZone(0);
  blocks.forEach((block, i) => {
    html += renderBlockWrapper(block, i, blocks.length, blocks[i + 1]);
    // Only render a between-blocks zone after non-final blocks — the final
    // gap is rendered once, below, as the single end-of-lesson zone.
    if (i < blocks.length - 1) html += dropZone(i + 1);
  });
  html += dropZone(blocks.length, 'Insert block at end of lesson');
  return html;
}

const RADIUS_MAP = { sharp: '4px', soft: 'var(--r-lg)', round: 'var(--r-xl)' };

// Icon glyphs available for Labelled Graphic hotspot markers (Marker Style: Icons).
const MARKER_ICONS = {
  'icon-plus': '+', 'icon-check': '✓', 'icon-info': 'i', 'icon-question': '?',
  'icon-cross': '✕', 'icon-heart': '♥', 'icon-target': '◎',
  'icon-arrow-left': '←', 'icon-arrow-right': '→', 'icon-arrow-up': '↑', 'icon-arrow-down': '↓',
  'icon-arrow-upleft': '↖', 'icon-arrow-upright': '↗', 'icon-arrow-downright': '↘', 'icon-arrow-downleft': '↙',
};
const MARKER_SIZE_MAP = { sm: 20, md: 28, lg: 38 };
const IMAGE_RADIUS_MAP = { sharp: '4px', soft: 'var(--r-md)', round: 'var(--r-xl)' };

/* Lazily migrates legacy string[]/{src,caption} carousel items to {src, title, description, imageFit} objects, in place. */
function normalizeCarouselItems(d) {
  const source = (d.items && d.items.length) ? d.items : ['Slide 1', 'Slide 2', 'Slide 3'];
  d.items = source.map(it => typeof it === 'string'
    ? { src: null, title: '', description: it, imageFit: 'cover' }
    : { src: (it && it.src) || null, title: (it && it.title) || '', description: (it && it.description) || (it && it.caption) || '', imageFit: (it && it.imageFit) || 'cover' });
  return d.items;
}

/* Lazily migrates quote_carousel quotes to {text, author, avatar} objects, in place. */
function normalizeQuoteItems(d) {
  if (!d.quotes || !d.quotes.length) d.quotes = DEFAULT_QUOTES.map(q => Object.assign({}, q));
  d.quotes = d.quotes.map(q => Object.assign({ text: '', author: '', avatar: null }, q));
  return d.quotes;
}

/* Lazily migrates column_grid items to {title, description, imageUrl} objects, in place. */
function normalizeColumnGridItems(d) {
  const source = (d.items && d.items.length) ? d.items : [{ title: 'Item 1' }, { title: 'Item 2' }, { title: 'Item 3' }];
  d.items = source.map(it => it || {});
  return d.items;
}

/* Lazily migrates Flashcard Grid/Stack items to {front:{text,image}, back:{text,image}} objects, in place. */
function normalizeFlashcardItems(d) {
  const source = (d.items && d.items.length) ? d.items : [
    { front: { text: 'What does HR stand for?' }, back: { text: 'Human Resources' } },
    { front: { text: 'Front of card' }, back: { text: 'Back of card' } },
  ];
  d.items = source.map(it => ({
    front: Object.assign({ text: '', image: null, imageFit: 'cover' }, (it && it.front) || {}),
    back: Object.assign({ text: '', image: null, imageFit: 'cover' }, (it && it.back) || {}),
  }));
  return d.items;
}

/* Renders one face (front or back) of a flashcard — learner-facing content only:
   optional image (per imageFit), text, and a Flip Icon (top right). No editing
   chrome is ever rendered on the card surface — card management lives in the
   Content panel. */
function flashcardFaceContent(face, i, faceName, ce, editable) {
  const fit = face.imageFit || 'cover';
  const hasImage = !!face.image;
  const flipIcon = `<div class="flip-card-flipicon">↻</div>`;
  const showText = !!face.text || editable;
  const placeholder = faceName === 'back' ? 'Back text' : 'Front text';
  if (hasImage && fit === 'full') {
    return `
      <img src="${AssetStore.resolveMediaSrc(face.image)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" />
      ${showText ? `<div class="editable-text" data-role="body" data-field="flashcardText" data-col="${i}" data-face="${faceName}" data-richtext="true" ${ce} data-placeholder="${placeholder}" style="position:relative; z-index:1; background:rgba(0,0,0,0.35); color:#fff; padding:8px 12px; border-radius:var(--r-sm); font-weight:600; font-size:14px; max-width:90%;">${richTextOut(face.text || '')}</div>` : ''}
      ${flipIcon}
    `;
  }
  const fitMap = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none' };
  const objectFit = fitMap[fit] || 'cover';
  return `
    ${hasImage ? `<img src="${AssetStore.resolveMediaSrc(face.image)}" alt="" style="max-width:100%; ${face.text ? 'max-height:70px; margin-bottom:8px;' : 'flex:1; height:100%;'} ${objectFit === 'none' ? 'object-fit:none; object-position:center;' : `object-fit:${objectFit};`} border-radius:var(--r-sm);" />` : ''}
    ${showText ? `<div class="editable-text" data-role="body" data-field="flashcardText" data-col="${i}" data-face="${faceName}" data-richtext="true" ${ce} data-placeholder="${placeholder}" style="font-weight:600; font-size:14px;">${richTextOut(face.text || '')}</div>` : ''}
    ${flipIcon}
  `;
}

/* Flashcard Stack navigation — advances to the previous/next card within the
   same .flashcard-stack-wrap, toggling visibility and updating the progress
   label. Self-contained DOM manipulation (no re-render) so it works
   identically in the Builder canvas and Learner Preview. */
function lumioFcsNav(btn, delta) {
  const wrap = btn.closest('.flashcard-stack-wrap');
  if (!wrap) return;
  const cards = Array.from(wrap.querySelectorAll('.fcs-card'));
  const cur = cards.findIndex(c => c.style.display !== 'none');
  if (cur === -1) return;
  const next = (cur + delta + cards.length) % cards.length;
  cards[cur].style.display = 'none';
  cards[next].style.display = 'flex';
  const progress = wrap.querySelector('.fcs-progress');
  if (progress) progress.textContent = `${next + 1} / ${cards.length}`;
}

/* Records completion progress for the interactive block ancestor of `el`,
   but only inside Learner Preview (LearnerUI.activeCtx is set there and
   left null on the Builder canvas, where progress isn't tracked). `kind` is
   'visited' | 'opened' | 'flipped' | 'completed', matching the CompletionEngine
   API; `itemIndex` is ignored for 'completed'. */
function lumioRecordProgress(el, kind, itemIndex) {
  if (typeof LearnerUI === 'undefined' || !LearnerUI.activeCtx) return;
  const wrap = el.closest('[data-lp-index]');
  if (!wrap) return;
  const index = parseInt(wrap.dataset.lpIndex, 10);
  const ctx = LearnerUI.activeCtx;
  if (kind === 'visited') CompletionEngine.markVisited(ctx, index, itemIndex);
  else if (kind === 'opened') CompletionEngine.markOpened(ctx, index, itemIndex);
  else if (kind === 'flipped') CompletionEngine.markFlipped(ctx, index, itemIndex);
  else if (kind === 'completed') CompletionEngine.markCompleted(ctx, index);
  refreshContinueLocks(ctx);
  if (typeof refreshNextButtonState === 'function') refreshNextButtonState(ctx);
}

/* Full-size image lightbox — a Learner Preview-only interaction, opened by
   clicking any .image-zoom-trigger image (see learnerPreview.js). */
function openImageLightbox(src, alt) {
  if (!src) return;
  const overlay = el('<div class="overlay"></div>');
  overlay.innerHTML = `
    <div class="modal" style="background:transparent; box-shadow:none; padding:0; max-width:90vw; max-height:90vh;">
      <img src="${src}" alt="${escapeHtml(alt || '')}" style="display:block; max-width:90vw; max-height:90vh; border-radius:var(--r-md); box-shadow:var(--shadow-md);" />
    </div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.addEventListener('keydown', function onKeydown(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKeydown); }
  });
  document.body.appendChild(overlay);
}

const TEXT_BG_MAP = { light: '#ffffff', grey: '#f1f1f4', dark: 'var(--ink-900)' };
const TEXT_COLOR_MAP = { black: '#1a1a1a', white: '#ffffff', grey: '#8a8a94' };
const QUOTE_ACCENT_BG_MAP = { lavender: 'var(--pastel-lavender)', cyan: 'var(--pastel-cyan)', pink: 'var(--pastel-pink)', peach: 'var(--pastel-peach)' };

// Remediation Sprint 1, Workstream 2: Quote 1-4 previously had a "Style
// Variant" control (lavender/cyan/pink/peach) that was a second, redundant
// background-colour picker — duplicating the generic Background swatch
// shown above it in the same panel for every block — and for quote1/2/3 it
// did nothing at all (they render no card/box). This adopts the same
// Theme/Light/Grey/Dark/Custom/Image architecture already used by
// Statements and Text blocks (see statementBlockExtraStyle), so quote
// background is governed by exactly one control, platform-wide.
function quoteCardBgStyle(ds) {
  let style = '';
  if (ds.bgType === 'light') style += `background:${TEXT_BG_MAP.light};`;
  else if (ds.bgType === 'grey') style += `background:${TEXT_BG_MAP.grey};`;
  else if (ds.bgType === 'dark') style += `background:${TEXT_BG_MAP.dark};`;
  else if (ds.bgType === 'custom') style += `background:${ds.bgColor || '#ffffff'};`;
  else if (ds.bgType === 'image' && ds.bgImage) {
    const fit = ds.bgFit === 'contain' ? 'contain' : ds.bgFit === 'stretch' ? '100% 100%' : 'cover';
    style += `background-image:url(${AssetStore.resolveMediaSrc(ds.bgImage)}); background-size:${fit}; background-position:center; background-repeat:no-repeat;`;
  } else { // theme (default)
    style += `background:color-mix(in srgb, var(--theme-primary, #7C3AED) 6%, var(--surface-0, #ffffff));`;
  }
  return style;
}
// Remediation Sprint 1, Phase 2: text-colour contrast switch for Architecture
// A, parallel to surfaceTextColor() for the old per-block bgStyle systems —
// used by every block migrated onto bgType (Accordion/Tabs/Process/Labelled
// Graphic/Quote Carousel), not just Quotes, despite the function's name.
function archATextColor(ds) {
  return ds && ds.bgType === 'dark' ? '#ffffff' : 'var(--ink-900)';
}
function quoteCardBgFields(ds) {
  return `
    <div class="prop-section">
      <div class="prop-section-title">Background</div>
      <p class="text-sm text-muted mb-8">By default, this block inherits your course theme colours.</p>
      ${segControl('design-bgtype', 'bgType', [{ id: 'theme', label: 'Theme' }, { id: 'light', label: 'Light' }, { id: 'grey', label: 'Grey' }, { id: 'dark', label: 'Dark' }, { id: 'custom', label: 'Custom' }, { id: 'image', label: 'Image' }], ds.bgType || 'theme')}
      ${ds.bgType === 'custom' ? `<input type="color" class="input mt-8 text-bg-custom-color" value="${ds.bgColor || '#ffffff'}" style="width:48px; height:32px; padding:2px; cursor:pointer;" />` : ''}
      ${ds.bgType === 'image' ? `
        ${mediaPickerImageField(ds, 'bgImage', 'Background Image', 'Background Image', false, 'design')}
        <p class="text-sm text-muted mt-8 mb-8">Image Fit</p>
        ${segControl('design-bgfit', 'bgFit', [{ id: 'cover', label: 'Cover' }, { id: 'contain', label: 'Contain' }, { id: 'stretch', label: 'Stretch' }], ds.bgFit || 'cover')}
      ` : ''}
    </div>`;
}

/* Default icon + accent colour per Statement type. Background/border inherit the theme by default. */
const STATEMENT_DEFAULTS = {
  stmt_info:    { icon: 'ℹ️', label: 'Information', iconColor: '#6366F1' },
  stmt_tip:     { icon: '💡', label: 'Tip',          iconColor: '#F59E0B' },
  stmt_success: { icon: '✅', label: 'Success',      iconColor: '#22C55E' },
  stmt_warning: { icon: '⚠️', label: 'Warning',      iconColor: '#F59E0B' },
  stmt_error:   { icon: '⛔', label: 'Error',        iconColor: '#EF4444' },
  stmt_note:    { icon: '📝', label: 'Note',         iconColor: '#8A8A94' },
};

/* Default heading + seed items per List type (used when a block has no content yet). */
const LIST_DEFAULTS = {
  list_numbered: { heading: 'Steps', items: ['Log in to the HR portal', 'Complete your profile', 'Review your benefits'] },
  list_checkbox: { heading: 'Checklist', items: ['Set up your email', 'Join the team chat', 'Schedule 1:1 with manager'] },
  list_bullet:   { heading: 'Key Points', items: ['Curiosity over certainty', 'Clarity over cleverness', 'Progress over perfection'] },
};

const BULLET_GLYPHS = { disc: '●', circle: '○', square: '■', dash: '–', arrow: '→', check: '✓' };
const BULLET_SIZE_MAP = { sm: 10, md: 14, lg: 18 };
const CHECKBOX_SIZE_MAP = { sm: 14, md: 18, lg: 24 };

/* Converts a 1-based number to alphabetic (1->A, 26->Z, 27->AA, ...). */
function numberToAlpha(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* Converts a 1-based number to an uppercase Roman numeral. */
function numberToRoman(n) {
  const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let res = '';
  for (const [val, sym] of map) {
    while (n >= val) { res += sym; n -= val; }
  }
  return res;
}

/* Auto-numbering display for a 1-based position, per the list's Number Style. */
function listNumberMarker(style, n) {
  if (style === 'alpha') return numberToAlpha(n);
  if (style === 'roman') return numberToRoman(n);
  return String(n);
}

/* Lazily migrates legacy string[] items to {text, checked?, override?, textAlign?} objects,
   in place, so existing lessons keep their content. Falls back to per-type defaults. */
function normalizeListItems(d, defaultItems) {
  const source = (d.items && d.items.length) ? d.items : (defaultItems || []);
  d.items = source.map(it => typeof it === 'string' ? { text: it } : (it || {}));
  return d.items;
}

/* Wrapper-level style additions for List blocks: top/bottom padding only. */
function listBlockExtraStyle(block) {
  if (blockCategory(block.type) !== 'Lists') return '';
  const ds = block.design || {};
  return `padding-top:${ds.paddingTop ?? 4}px; padding-bottom:${ds.paddingBottom ?? 4}px;`;
}

/* Renders the marker/control for a single checkbox-list item. */
function renderCheckboxMarker(ds, checked, i, key) {
  const style = ds.checkboxStyle || 'square';
  const size = CHECKBOX_SIZE_MAP[ds.checkboxSize || 'md'];
  const borderColor = ds.checkboxBorderColor || 'var(--border)';
  const tickColor = ds.checkboxTickColor || 'var(--theme-primary, var(--indigo))';
  let boxStyle, inner;
  if (style === 'checkmark') {
    boxStyle = 'border:none; background:transparent;';
    inner = checked
      ? `<span style="color:${tickColor}; font-size:${size}px; line-height:1;">✓</span>`
      : `<span style="color:${borderColor}; font-size:${size}px; line-height:1; opacity:0.5;">☐</span>`;
  } else {
    const radius = style === 'circle' ? '50%' : '4px';
    const filled = style === 'filled';
    boxStyle = `border:2px solid ${borderColor}; border-radius:${radius}; background:${(checked && filled) ? tickColor : 'transparent'};`;
    inner = checked ? `<span style="color:${filled ? '#fff' : tickColor}; font-size:${Math.round(size * 0.7)}px; line-height:1;">✓</span>` : '';
  }
  return `<span class="list-checkbox-marker" data-itemindex="${i}" data-key="${key || ''}" role="checkbox" aria-checked="${checked}" tabindex="0"
    style="flex-shrink:0; width:${size}px; height:${size}px; ${boxStyle} display:flex; align-items:center; justify-content:center; cursor:pointer; margin-top:2px;">${inner}</span>`;
}

/* Renders the item rows for a List block (numbered/checkbox/bullet), shared by the
   Builder canvas and the Learner Preview. `opts.checkedSet` (Learner Preview only)
   overrides each item's checked state with the learner's session-local toggles. */
function renderListItemsHtml(block, ds, items, editable, opts) {
  opts = opts || {};
  const isNumbered = block.type === 'list_numbered';
  const isBullet = block.type === 'list_bullet';
  const isCheckbox = block.type === 'list_checkbox';
  return items.map((item, i) => {
    let marker = '';
    if (isNumbered) {
      const override = (item.override || '').trim();
      const display = override || listNumberMarker(ds.numberStyle || 'decimal', i + 1);
      marker = `<span class="list-marker" style="min-width:24px; font-weight:600; flex-shrink:0; line-height:1.7;">${escapeHtml(display)}</span>
        ${editable ? `<input class="list-number-override" data-itemindex="${i}" placeholder="Auto" title="Custom number/label for this item" value="${escapeHtml(item.override || '')}" style="width:64px; font-size:11px; padding:2px 4px; margin-right:6px; border:1px solid var(--border); border-radius:4px; flex-shrink:0;" />` : ''}`;
    } else if (isBullet) {
      const glyph = BULLET_GLYPHS[ds.bulletStyle || 'disc'];
      const size = BULLET_SIZE_MAP[ds.bulletSize || 'md'];
      marker = `<span class="list-marker" style="flex-shrink:0; min-width:20px; font-size:${size}px; line-height:1.7; color:${ds.bulletColor || 'currentColor'};">${glyph}</span>`;
    } else if (isCheckbox) {
      const checked = opts.checkedSet ? opts.checkedSet.has(i) : !!item.checked;
      marker = renderCheckboxMarker(ds, checked, i, opts.key);
    }
    const controls = editable ? `<div class="flex gap-4 list-item-controls" style="flex-shrink:0;">
        <button class="btn-icon btn-icon-xs btn-icon-dark list-item-move-up" data-itemindex="${i}" title="Move item up" aria-label="Move item up" ${i === 0 ? 'disabled' : ''} style="opacity:${i === 0 ? '0.4' : '1'};">↑</button>
        <button class="btn-icon btn-icon-xs btn-icon-dark list-item-move-down" data-itemindex="${i}" title="Move item down" aria-label="Move item down" ${i === items.length - 1 ? 'disabled' : ''} style="opacity:${i === items.length - 1 ? '0.4' : '1'};">↓</button>
        <button class="btn-icon list-item-remove" data-itemindex="${i}" title="Remove item" aria-label="Remove item" ${items.length <= 1 ? 'disabled' : ''} style="width:22px; height:22px; background:rgba(0,0,0,0.08); border:none; border-radius:4px; opacity:${items.length <= 1 ? '0.4' : '1'};">×</button>
      </div>` : '';
    return `<div class="list-item-row flex items-start gap-4" data-itemindex="${i}" role="listitem" style="margin-bottom:8px;">
      ${marker}
      <div class="editable-text list-item-text" data-role="body" data-field="listItem" data-col="${i}" data-richtext="true" ${editable ? 'contenteditable="true"' : ''} data-placeholder="List item" style="flex:1; line-height:1.7; font-size:15px;${item.textAlign ? ` text-align:${item.textAlign};` : ''}">${richTextOut(item.text || '')}</div>
      ${controls}
    </div>`;
  }).join('');
}

/* Wrapper-level style additions for Text blocks: custom padding + background. */
function textBlockExtraStyle(block) {
  if (blockCategory(block.type) !== 'Text') return '';
  const ds = block.design || {};
  let style = '';
  if (ds.paddingTop !== undefined) style += `padding-top:${ds.paddingTop}px;`;
  if (ds.paddingBottom !== undefined) style += `padding-bottom:${ds.paddingBottom}px;`;
  if (ds.bgType === 'light') style += `background:${TEXT_BG_MAP.light};`;
  else if (ds.bgType === 'grey') style += `background:${TEXT_BG_MAP.grey};`;
  else if (ds.bgType === 'dark') style += `background:${TEXT_BG_MAP.dark};`;
  else if (ds.bgType === 'custom') style += `background:${ds.bgColor || '#ffffff'};`;
  else if (ds.bgType === 'image' && ds.bgImage) {
    const fit = ds.bgFit === 'contain' ? 'contain' : ds.bgFit === 'stretch' ? '100% 100%' : 'cover';
    style += `background-image:url(${AssetStore.resolveMediaSrc(ds.bgImage)}); background-size:${fit}; background-position:center; background-repeat:no-repeat;`;
  }
  return style;
}

/* Wrapper-level style additions for Statement blocks: 4-way padding, background (theme-inherited
   by default) and border. */
function statementBlockExtraStyle(block) {
  if (blockCategory(block.type) !== 'Statements') return '';
  const ds = block.design || {};
  let style = `padding-top:${ds.paddingTop ?? 18}px; padding-bottom:${ds.paddingBottom ?? 18}px; padding-left:${ds.paddingLeft ?? 18}px; padding-right:${ds.paddingRight ?? 18}px;`;
  if (ds.bgType === 'light') style += `background:${TEXT_BG_MAP.light};`;
  else if (ds.bgType === 'grey') style += `background:${TEXT_BG_MAP.grey};`;
  else if (ds.bgType === 'dark') style += `background:${TEXT_BG_MAP.dark};`;
  else if (ds.bgType === 'custom') style += `background:${ds.bgColor || '#ffffff'};`;
  else if (ds.bgType === 'image' && ds.bgImage) {
    const fit = ds.bgFit === 'contain' ? 'contain' : ds.bgFit === 'stretch' ? '100% 100%' : 'cover';
    style += `background-image:url(${AssetStore.resolveMediaSrc(ds.bgImage)}); background-size:${fit}; background-position:center; background-repeat:no-repeat;`;
  } else {
    style += `background:color-mix(in srgb, var(--theme-primary, #7C3AED) 6%, var(--surface-0, #ffffff));`;
  }
  if (ds.borderOn) {
    const bw = ds.borderWidth ?? 1;
    const bc = ds.borderColor || 'color-mix(in srgb, var(--theme-primary, #7C3AED) 30%, transparent)';
    style += `border:${bw}px solid ${bc};`;
  }
  style += `border-radius:${RADIUS_MAP[ds.radius] || 'var(--theme-radius, var(--r-lg))'};`;
  return style;
}

/* Wrapper-level style additions for Quote blocks: top/bottom padding only
   (left/right padding and content width are inherited from the page layout). */
function quoteBlockExtraStyle(block) {
  if (blockCategory(block.type) !== 'Quotes') return '';
  const ds = block.design || {};
  return `padding-top:${ds.paddingTop ?? 22}px; padding-bottom:${ds.paddingBottom ?? 22}px;`;
}

/* Typography style for an individual editable text element within a Text block. */
function textTypographyStyle(ds, defaultSize) {
  ds = ds || {};
  let style = `font-size:${ds.fontSize || defaultSize}px;`;
  if (ds.fontColor) {
    style += `color:${TEXT_COLOR_MAP[ds.fontColor] || ds.fontColor};`;
  } else if (ds.bgType === 'dark') {
    style += `color:#ffffff;`;
  }
  if (ds.bold) style += `font-weight:700;`;
  if (ds.italic) style += `font-style:italic;`;
  if (ds.underline) style += `text-decoration:underline;`;
  if (ds.fontFamily && ds.fontFamily !== 'theme') style += `font-family:${ds.fontFamily};`;
  return style;
}

/* Re-apply Typography/Spacing/Background styles directly to the DOM for live preview
   without a full re-render (which would break slider drags and contenteditable focus). */
function applyBlockStylesToDom(block, index) {
  const wrapper = document.querySelector(`.canvas-block[data-index="${index}"]`);
  if (!wrapper) return;
  const ds = block.design || {};
  const content = wrapper.querySelector('.block-content-area');
  if (content) {
    const alignStyle = ds.align ? `text-align:${ds.align};` : '';
    content.style.cssText = `padding:3px 22px; ${alignStyle} ${textBlockExtraStyle(block)}`;
  }
  wrapper.querySelectorAll('.editable-text').forEach(elx => {
    const role = elx.dataset.role || 'body';
    elx.style.cssText = textTypographyStyle(ds, role === 'heading' ? 22 : (role === 'cell' ? 13 : 15));
  });
}

/* Re-apply Statement block styles directly to the DOM for live preview during slider/colour drags. */
function applyStatementStylesToDom(block, index) {
  const wrapper = document.querySelector(`.canvas-block[data-index="${index}"]`);
  if (!wrapper) return;
  const ds = block.design || {};
  const content = wrapper.querySelector('.block-content-area');
  if (content) {
    const alignStyle = ds.align ? `text-align:${ds.align};` : '';
    content.style.cssText = `padding:3px 22px; ${alignStyle} ${statementBlockExtraStyle(block)}`;
  }
  const data = block.data || {};
  wrapper.querySelectorAll('.editable-text').forEach(elx => {
    if (elx.dataset.role === 'title') {
      elx.style.cssText = `font-weight:700; margin-bottom:4px; ${textTypographyStyle(ds, 15)}${data.titleAlign ? `text-align:${data.titleAlign};` : ''}`;
    } else {
      elx.style.cssText = `line-height:1.6; ${textTypographyStyle(ds, 15)}${data.textAlign ? `text-align:${data.textAlign};` : ''}`;
    }
  });
  const iconEl = wrapper.querySelector('.stmt-icon-display');
  if (iconEl) {
    iconEl.style.fontSize = `${ds.iconSize ?? 20}px`;
    iconEl.style.color = ds.iconColor || (STATEMENT_DEFAULTS[block.type] || {}).iconColor || 'inherit';
  }
}

/* Re-apply Quote block padding directly to the DOM for live preview during slider drags. */
function applyQuoteStylesToDom(block, index) {
  const wrapper = document.querySelector(`.canvas-block[data-index="${index}"]`);
  if (!wrapper) return;
  const ds = block.design || {};
  const content = wrapper.querySelector('.block-content-area');
  if (content) {
    const alignStyle = ds.align ? `text-align:${ds.align};` : '';
    content.style.cssText = `padding:3px 22px; ${alignStyle} ${quoteBlockExtraStyle(block)}`;
  }
  if (block.type === 'quote_image') {
    const overlay = wrapper.querySelector('.quote-image-overlay');
    if (overlay) {
      const overlayOpacity = ds.overlayOpacity ?? 35;
      overlay.style.background = `rgba(0,0,0,${(overlayOpacity / 100).toFixed(2)})`;
    }
    wrapper.querySelectorAll('.editable-text[data-field="text"], .editable-text[data-field="author"]').forEach(elx => {
      elx.style.color = TEXT_COLOR_MAP[ds.fontColor] || ds.fontColor || '#fff';
    });
  }
}

/* Re-apply List block padding/indent/colour directly to the DOM for live preview during slider/colour drags. */
function applyListStylesToDom(block, index) {
  const wrapper = document.querySelector(`.canvas-block[data-index="${index}"]`);
  if (!wrapper) return;
  const ds = block.design || {};
  const content = wrapper.querySelector('.block-content-area');
  if (content) content.style.cssText = `padding:3px 22px; ${listBlockExtraStyle(block)}`;
  const itemsWrap = wrapper.querySelector('.list-items-wrap');
  if (itemsWrap) itemsWrap.style.paddingLeft = `${ds.indent ?? 20}px`;
  const addBtn = wrapper.querySelector('.list-item-add');
  if (addBtn) addBtn.style.marginLeft = `${ds.indent ?? 20}px`;

  if (block.type === 'list_bullet') {
    wrapper.querySelectorAll('.list-marker').forEach(m => { m.style.color = ds.bulletColor || 'currentColor'; });
  } else if (block.type === 'list_checkbox') {
    const style = ds.checkboxStyle || 'square';
    const borderColor = ds.checkboxBorderColor || 'var(--border)';
    const tickColor = ds.checkboxTickColor || 'var(--theme-primary, var(--indigo))';
    const filled = style === 'filled';
    wrapper.querySelectorAll('.list-checkbox-marker').forEach(m => {
      const checked = m.getAttribute('aria-checked') === 'true';
      const tickSpan = m.querySelector('span');
      if (style === 'checkmark') {
        m.style.border = 'none';
        m.style.background = 'transparent';
        if (tickSpan) tickSpan.style.color = checked ? tickColor : borderColor;
      } else {
        m.style.borderColor = borderColor;
        m.style.background = (checked && filled) ? tickColor : 'transparent';
        if (tickSpan) tickSpan.style.color = filled ? '#fff' : tickColor;
      }
    });
  }
}

/* Dispatch to the right live-preview updater based on block category. */
function applyLivePreview(block, index) {
  if (blockCategory(block.type) === 'Statements') applyStatementStylesToDom(block, index);
  else if (blockCategory(block.type) === 'Quotes') applyQuoteStylesToDom(block, index);
  else if (blockCategory(block.type) === 'Lists') applyListStylesToDom(block, index);
  // Workstream 1 follow-up fix: Carousel/Column Grid (category 'Gallery')
  // were unreachable dead code in the branch below — this Images/Gallery
  // check runs first and caught them, routing to applyImageStylesToDom,
  // which only ever patches text_on_image's overlay opacity and silently
  // does nothing for every other type, including Image/Image&Text/Carousel/
  // Column Grid's own padding/border sliders (same root cause class as the
  // Interactive/KC/Button fix above — wrong/no DOM layer updated). Only
  // text_on_image still gets the original targeted opacity-only patch
  // (cheap, avoids rebuilding the background-image div on every drag tick);
  // every other Images/Gallery type now gets the full live rebuild.
  else if (block.type === 'text_on_image') applyImageStylesToDom(block, index);
  else if (blockCategory(block.type) === 'Images' || blockCategory(block.type) === 'Gallery') refreshGenericCanvas(block, index);
  else if (block.type === 'audio') applyAudioStylesToDom(block, index);
  // Workstream 1 root cause fix: Charts/Dividers already used refreshGenericCanvas
  // (a full renderBlockContent rebuild) for live slider drags. Every other
  // category that adopted the interactiveSpacingStyle/interactiveBorderStyle
  // pattern this sprint (Interactive, Flashcards, Knowledge Checks, Button/
  // Continue) — i.e. anything whose Design panel includes
  // interactiveBorderPaddingFields — was instead falling through to
  // applyBlockStylesToDom, which only ever touches the outer .block-content-
  // area's unrelated fixed inset (3px 22px) and the editable-text typography;
  // it has no knowledge of each block's own inner padding/border element, so
  // dragging Top/Bottom Padding or toggling Border never updated the canvas
  // until some unrelated action (e.g. a checkbox, which DOES force a full
  // renderLessonBuilder) happened to trigger a real re-render. Routing these
  // through the same full-rebuild path Charts/Dividers already used fixes it.
  // Sprint 2, Workstream 1/2 fix: Video and File Attachment had fully
  // working padding controls and renderers (confirmed via Sprint 2 audit)
  // but were simply never added when this dispatcher fix was first made —
  // an omission, not a new defect class. Same fix, same reuse.
  else if (['Interactive', 'Knowledge Checks'].includes(blockCategory(block.type)) || block.type === 'flashcard_grid' || block.type === 'flashcard_stack' || block.type === 'button' || block.type === 'continue' || block.type === 'video' || block.type === 'file') refreshGenericCanvas(block, index);
  else if (blockCategory(block.type) === 'Charts' || blockCategory(block.type) === 'Dividers') refreshGenericCanvas(block, index);
  else applyBlockStylesToDom(block, index);
}

/* Re-render a block's canvas preview in place (without rebuilding the
   right-hand panel) so dataset/style edits reflect live on the canvas. */
function refreshGenericCanvas(block, index) {
  const wrapper = document.querySelector(`.canvas-block[data-index="${index}"]`);
  if (!wrapper) return;
  const content = wrapper.querySelector('.block-content-area');
  if (!content) return;
  content.innerHTML = renderBlockContent(block, true);
  const blocks = LumioState.lessons[LumioState.currentLessonId];
  content.querySelectorAll('.editable-text[contenteditable="true"]').forEach(elx => bindEditableTextField(elx, blocks));
}

/* Re-apply Audio block padding directly to the DOM for live preview during slider drags. */
function applyAudioStylesToDom(block, index) {
  const wrapper = document.querySelector(`.canvas-block[data-index="${index}"]`);
  if (!wrapper) return;
  const ds = block.design || {};
  const outer = wrapper.querySelector('.block-content-area > div');
  if (outer) {
    outer.style.paddingTop = `${ds.paddingTop ?? 22}px`;
    outer.style.paddingBottom = `${ds.paddingBottom ?? 22}px`;
  }
}

/* Re-apply Image/Gallery block overlay opacity directly to the DOM for live preview during slider drags. */
function applyImageStylesToDom(block, index) {
  if (block.type !== 'text_on_image') return;
  const wrapper = document.querySelector(`.canvas-block[data-index="${index}"]`);
  if (!wrapper) return;
  const ds = block.design || {};
  const overlay = wrapper.querySelector('.text-on-image-overlay');
  if (overlay) {
    const overlayOpacity = ds.overlayOpacity ?? 40;
    overlay.style.background = `rgba(0,0,0,${(overlayOpacity / 100).toFixed(2)})`;
  }
}

/* Block types that render directly on the canvas as page content, without
   card chrome (background/border-radius/shadow/border). Selection is shown
   via an outline instead of a permanent border. */
const CARDLESS_BLOCK_TYPES = new Set([
  // Headings
  'heading', 'heading_paragraph',
  // Paragraphs
  'paragraph',
  // Quotes
  'quote1', 'quote2', 'quote3', 'quote4', 'quote_image', 'quote_carousel',
  // Lists
  'list_numbered', 'list_checkbox', 'list_bullet',
  // Images
  'image', 'image_text', 'text_on_image',
  // Gallery
  'carousel', 'column_grid',
  // Multimedia
  'audio', 'video', 'file',
  // Dividers
  'continue', 'numbered_divider', 'line_divider',
  // Knowledge Checks — flow inline like Heading & Paragraph
  'kc_multiple_choice', 'kc_multiple_response', 'kc_matching', 'kc_fill_gap', 'kc_ordering',
]);

/* Document-flow vertical rhythm for cardless blocks. */
// FLOW_SPACING / FLOW_SPACING_TIGHT are defined globally in app.js so both
// the builder and learner preview reference the same spacing tokens.

const HEADING_BLOCK_TYPES = new Set(['heading', 'heading_paragraph']);
const LIST_BLOCK_TYPES = new Set(['list_numbered', 'list_checkbox', 'list_bullet']);

/* Margin-bottom for a cardless block, based on its relationship to the next block:
   - heading -> paragraph stays visually connected (tight)
   - a list following heading/paragraph content stays grouped with it (tight)
   - everything else uses the standard document rhythm */
function cardlessFlowMargin(block, nextBlock) {
  if (nextBlock && CARDLESS_BLOCK_TYPES.has(nextBlock.type)) {
    if (HEADING_BLOCK_TYPES.has(block.type) && nextBlock.type === 'paragraph') return FLOW_SPACING_TIGHT;
    if (LIST_BLOCK_TYPES.has(nextBlock.type) && (HEADING_BLOCK_TYPES.has(block.type) || block.type === 'paragraph')) return FLOW_SPACING_TIGHT;
  }
  return FLOW_SPACING;
}

function renderBlockWrapper(block, index, total, nextBlock) {
  const isExpanded = BuilderUI.expandedBlocks.has(index);
  const isSelected = BuilderUI.selected === index;
  const ds = block.design || {};
  const bgStyle = ds.bg && ds.bg !== 'transparent' ? `background:${ds.bg};` : '';
  const alignStyle = ds.align ? `text-align:${ds.align};` : '';
  const radiusStyle = ds.radius ? `border-radius:${RADIUS_MAP[ds.radius] || 'var(--theme-radius, var(--r-lg))'};` : 'border-radius:var(--theme-radius, var(--r-lg));';
  const moveButtons = `
        <button class="btn-icon move-up-btn" data-index="${index}" title="Move up" aria-label="Move block up" ${index===0?'disabled':''} style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none; box-shadow:none; opacity:${index===0?'0.4':'1'};">↑</button>
        <button class="btn-icon move-down-btn" data-index="${index}" title="Move down" aria-label="Move block down" ${index===total-1?'disabled':''} style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none; box-shadow:none; opacity:${index===total-1?'0.4':'1'};">↓</button>`;
  const { treatment } = DesignSystem.resolveBlockStyle(block);
  // Pure visual dividers carry no content for assistive technology to announce.
  const DECORATIVE_DIVIDER_TYPES = new Set(['line_divider', 'numbered_divider']);
  const ariaHidden = (AccessibilityRuntime.ACCESSIBILITY_OF(block.type).decorative && DECORATIVE_DIVIDER_TYPES.has(block.type))
    ? ' aria-hidden="true"' : '';
  // 'columns' keeps its fixed 4px margin (does not inherit cardlessFlowMargin's
  // heading/list grouping rules), exactly as before this refactor.
  const cardlessMargin = block.type === 'columns' ? '4px' : cardlessFlowMargin(block, nextBlock);
  // Text-authoring blocks (Heading, Paragraph, Heading & Paragraph, Columns) use a
  // subtle, low-contrast selection indicator so canvas editing feels inline/native
  // rather than boxed — matching the Rise-style "minimal selection" requirement.
  const isTextAuthoringBlock = ['heading', 'paragraph', 'heading_paragraph', 'columns', 'table', 'stmt_info', 'stmt_tip', 'stmt_success', 'stmt_warning', 'stmt_error', 'stmt_note', 'quote1', 'quote2', 'quote3', 'quote4', 'quote_image', 'quote_carousel', 'list_numbered', 'list_checkbox', 'list_bullet', 'image', 'image_text', 'text_on_image', 'carousel', 'column_grid', 'audio', 'video', 'file', 'kc_multiple_choice', 'kc_multiple_response', 'kc_matching', 'kc_fill_gap', 'kc_ordering'].includes(block.type);
  // Selection is a subtle neutral indicator (Notion/Figma-style focus ring),
  // not an accent-coloured frame — kept consistent across card and cardless blocks.
  const SELECTION_OUTLINE_COLOR = 'rgba(20,20,30,0.14)';
  const cardlessSelectionStyle = isTextAuthoringBlock
    ? `outline:1px solid ${isSelected ? SELECTION_OUTLINE_COLOR : 'transparent'}; outline-offset:6px; border-radius:4px; transition:outline-color .12s;`
    : `outline:2px solid ${isSelected ? SELECTION_OUTLINE_COLOR : 'transparent'}; outline-offset:2px; transition:outline-color .12s;`;
  // Toolbar floats ABOVE the block boundary — overflow:visible lets it escape
  // the wrapper without needing any padding-top reserve inside the content area.
  const wrapperStyle = treatment === 'cardless'
    ? `position:relative; overflow:visible; border-radius:0; margin-bottom:${cardlessMargin};
       ${cardlessSelectionStyle}
       background:transparent; box-shadow:none;`
    : `position:relative; overflow:visible; ${radiusStyle} border:1px solid ${isSelected ? SELECTION_OUTLINE_COLOR : 'transparent'};
       margin-bottom:${FLOW_SPACING}; transition:border-color .12s; ${bgStyle || 'background:transparent;'}
       box-shadow:none;`;
  return `
    <div class="canvas-block ${isSelected ? 'selected' : ''}" data-index="${index}" data-block-id="${block.id || ''}" style="${wrapperStyle}"${ariaHidden}>
      <div class="block-toolbar" style="position:absolute; top:-34px; left:0; display:${isExpanded ? 'flex':'none'}; gap:4px; z-index:10;">
        <span class="drag-handle" draggable="true" data-index="${index}" title="Drag to reorder"
          style="background:var(--ink-900); color:#fff; border-radius:6px; padding:2px 8px; font-size:11px; cursor:grab;">⠿ ${blockLabel(block.type)}</span>
        <button class="btn-icon ai-rewrite-btn" data-index="${index}" title="AI rewrite" aria-label="AI rewrite this block" style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none; box-shadow:none;">✨</button>
        <button class="btn-icon dup-block-btn" data-index="${index}" title="Duplicate" aria-label="Duplicate block" style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none; box-shadow:none;">⧉</button>
        <button class="btn-icon del-block-btn" data-index="${index}" title="Delete" aria-label="Delete block" style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none; box-shadow:none;">✕</button>${moveButtons}
      </div>
      <div class="block-content-area" style="padding:3px 22px; ${alignStyle} ${textBlockExtraStyle(block)}${statementBlockExtraStyle(block)}${quoteBlockExtraStyle(block)}${listBlockExtraStyle(block)}">
        ${renderBlockContent(block, true)}
      </div>
    </div>
  `;
}

function blockLabel(type) {
  const all = LumioData.blockLibrary.flatMap(c => c.blocks);
  const found = all.find(b => b.id === type);
  return found ? found.name : type;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================================
   INLINE RICH TEXT EDITING (Heading & Paragraph block only)
   Stores sanitized HTML (bold/italic/underline/color/size) in
   block.data.heading / block.data.body instead of plain text.
   ============================================================ */

const RICH_TEXT_ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'BR']);

/* Whitelist-based sanitizer: strips all tags/attributes except the small
   set of inline formatting elements the toolbar produces. */
function sanitizeRichHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html == null ? '' : String(html);
  (function clean(node) {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === 1) {
        if (!RICH_TEXT_ALLOWED_TAGS.has(child.tagName)) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          return;
        }
        [...child.attributes].forEach(attr => {
          if (child.tagName === 'SPAN' && attr.name === 'style') {
            const ALLOWED_STYLE_PROPS = new Set(['color', 'font-size', 'font-weight', 'font-style', 'text-decoration']);
            const kept = attr.value.split(';')
              .map(decl => decl.split(':').map(s => s.trim()))
              .filter(([prop, val]) => val && ALLOWED_STYLE_PROPS.has(prop))
              .map(([prop, val]) => `${prop}:${val}`)
              .join(';');
            if (kept) child.setAttribute('style', kept); else child.removeAttribute('style');
          } else {
            child.removeAttribute(attr.name);
          }
        });
        clean(child);
      } else if (child.nodeType !== 3) {
        node.removeChild(child);
      }
    });
  })(tmp);
  return tmp.innerHTML;
}

/* Renders a heading/body field value. Legacy plain-text values pass through
   sanitizeRichHtml unchanged (no tags to strip); values containing inline
   formatting markup from the rich-text editor are preserved. */
function richTextOut(value) {
  if (value == null || value === '') return '';
  return sanitizeRichHtml(value);
}

/* execCommand (with styleWithCSS) can still emit legacy <font> tags for
   fontSize/foreColor — convert those to sanitizer-safe <span style="..."> */
function normalizeLegacyFontTags(root, pendingFontSize) {
  root.querySelectorAll('font').forEach(f => {
    const span = document.createElement('span');
    const styles = [];
    if (f.color) styles.push(`color:${f.color}`);
    if (f.getAttribute('size') === '7' && pendingFontSize) styles.push(`font-size:${pendingFontSize}`);
    if (styles.length) span.setAttribute('style', styles.join(';'));
    while (f.firstChild) span.appendChild(f.firstChild);
    f.replaceWith(span);
  });
}

/* Shared floating formatting toolbar — appears when text is selected inside
   a heading/body field of a Heading & Paragraph block. */
const RichTextToolbar = {
  el: null,
  activeField: null, // { block, elx }
  savedRange: null,
  pendingFontSize: null,
};

function ensureRichTextToolbar() {
  if (RichTextToolbar.el) return RichTextToolbar.el;

  const el = document.createElement('div');
  el.id = 'rt-toolbar';
  el.className = 'rt-toolbar';
  el.innerHTML = `
    <button type="button" class="rt-btn" data-cmd="bold" title="Bold"><b>B</b></button>
    <button type="button" class="rt-btn" data-cmd="italic" title="Italic"><i>I</i></button>
    <button type="button" class="rt-btn" data-cmd="underline" title="Underline"><u>U</u></button>
    <span class="rt-sep"></span>
    <select class="rt-size" title="Font size">
      <option value="">Size</option>
      <option value="12px">12</option>
      <option value="14px">14</option>
      <option value="16px">16</option>
      <option value="18px">18</option>
      <option value="20px">20</option>
      <option value="24px">24</option>
      <option value="28px">28</option>
      <option value="32px">32</option>
      <option value="40px">40</option>
    </select>
    <input type="color" class="rt-color" title="Font colour" value="#000000" />
    <span class="rt-sep"></span>
    <button type="button" class="rt-btn" data-cmd="align" data-val="left" title="Align left">⟸</button>
    <button type="button" class="rt-btn" data-cmd="align" data-val="center" title="Align centre">≡</button>
    <button type="button" class="rt-btn" data-cmd="align" data-val="right" title="Align right">⟹</button>
  `;
  document.body.appendChild(el);
  RichTextToolbar.el = el;

  const restoreSelection = () => {
    const active = RichTextToolbar.activeField;
    if (!active || !RichTextToolbar.savedRange) return null;
    active.elx.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(RichTextToolbar.savedRange);
    return active;
  };

  const applyAndSync = (fn) => {
    const active = restoreSelection();
    if (!active) return;
    fn(active);
    normalizeLegacyFontTags(active.elx, RichTextToolbar.pendingFontSize);
    RichTextToolbar.pendingFontSize = null;
    syncRichTextField(active.block, active.elx);
    const sel = window.getSelection();
    if (sel.rangeCount) RichTextToolbar.savedRange = sel.getRangeAt(0).cloneRange();
    positionRichTextToolbar();
  };

  el.querySelectorAll('.rt-btn[data-cmd]').forEach(btn => btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    if (cmd === 'align') {
      applyAndSync((active) => {
        active.elx.style.textAlign = btn.dataset.val;
        if (active.elx.dataset.field === 'col') {
          const colAlign = active.block.data.colAlign || (active.block.data.colAlign = []);
          colAlign[parseInt(active.elx.dataset.col)] = btn.dataset.val;
        } else if (active.elx.dataset.field === 'cell') {
          const cellAlign = active.block.data.cellAlign || (active.block.data.cellAlign = []);
          const r = parseInt(active.elx.dataset.row), c = parseInt(active.elx.dataset.col);
          cellAlign[r] = cellAlign[r] || [];
          cellAlign[r][c] = btn.dataset.val;
        } else if (active.elx.dataset.field === 'quoteText' || active.elx.dataset.field === 'quoteAuthor') {
          const quotes = active.block.data.quotes || (active.block.data.quotes = DEFAULT_QUOTES.map(q => Object.assign({}, q)));
          const i = parseInt(active.elx.dataset.col);
          quotes[i] = quotes[i] || {};
          quotes[i][active.elx.dataset.field === 'quoteText' ? 'textAlign' : 'authorAlign'] = btn.dataset.val;
        } else if (active.elx.dataset.field === 'listItem') {
          const items = active.block.data.items || (active.block.data.items = normalizeListItems(active.block.data, (LIST_DEFAULTS[active.block.type] || {}).items));
          const i = parseInt(active.elx.dataset.col);
          items[i] = items[i] || {};
          items[i].textAlign = btn.dataset.val;
        } else {
          active.block.data[active.elx.dataset.field + 'Align'] = btn.dataset.val;
        }
      });
    } else {
      applyAndSync(() => document.execCommand(cmd, false, null));
    }
  }));

  el.querySelector('.rt-size').addEventListener('change', (e) => {
    const size = e.target.value;
    e.target.value = '';
    if (!size) return;
    RichTextToolbar.pendingFontSize = size;
    applyAndSync(() => document.execCommand('fontSize', false, '7'));
  });

  el.querySelector('.rt-color').addEventListener('input', (e) => {
    applyAndSync(() => document.execCommand('foreColor', false, e.target.value));
  });

  // Keep the contenteditable selection alive when interacting with the toolbar.
  el.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') e.preventDefault();
  });

  // The toolbar is anchored to the active block's container, so it must
  // re-position (without moving the selection) whenever the page scrolls
  // or resizes while it's visible.
  const reposition = () => {
    if (el.style.display === 'flex') positionRichTextToolbar();
  };
  document.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  // Drive the toolbar's visibility from the selection itself rather than
  // mouseup/keyup landing inside a specific element. This is what makes
  // "select 100% of the text" work: a full selection's mouseup commonly
  // lands just outside the .editable-text element's box, so mouseup/keyup
  // handlers on that element never fire — but selectionchange always does.
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const anchor = sel.anchorNode;
    const container = anchor && anchor.nodeType === 3 ? anchor.parentElement : anchor;
    const elx = container && container.closest ? container.closest('.editable-text[data-richtext="true"]') : null;

    if (!elx || sel.isCollapsed) {
      // Don't hide while the user is interacting with the toolbar itself
      // (e.g. the colour picker or size dropdown can shift focus/selection).
      if (!(RichTextToolbar.el && RichTextToolbar.el.contains(document.activeElement))) {
        hideRichTextToolbar();
      }
      return;
    }

    const blockEl = elx.closest('.canvas-block');
    const blocks = LumioState.lessons[LumioState.currentLessonId];
    const idx = blockEl ? parseInt(blockEl.dataset.index) : NaN;
    const block = blocks && !isNaN(idx) ? blocks[idx] : null;
    if (!block) return;

    RichTextToolbar.activeField = { block, elx };
    positionRichTextToolbar();
  });

  return el;
}

function syncRichTextField(block, elx) {
  block.data = block.data || {};
  if (elx.dataset.field === 'col') {
    const cols = block.data.cols || (block.data.cols = DEFAULT_COLUMNS.slice());
    cols[parseInt(elx.dataset.col)] = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'cell') {
    const rows = block.data.rows || (block.data.rows = DEFAULT_TABLE_ROWS.map(r => r.slice()));
    const r = parseInt(elx.dataset.row), c = parseInt(elx.dataset.col);
    if (rows[r]) rows[r][c] = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'quoteText' || elx.dataset.field === 'quoteAuthor') {
    const quotes = block.data.quotes || (block.data.quotes = DEFAULT_QUOTES.map(q => Object.assign({}, q)));
    const i = parseInt(elx.dataset.col);
    quotes[i] = quotes[i] || {};
    quotes[i][elx.dataset.field === 'quoteText' ? 'text' : 'author'] = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'listItem') {
    const items = block.data.items || (block.data.items = normalizeListItems(block.data, (LIST_DEFAULTS[block.type] || {}).items));
    const i = parseInt(elx.dataset.col);
    items[i] = items[i] || {};
    items[i].text = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'gridItemTitle' || elx.dataset.field === 'gridItemDesc') {
    const items = normalizeColumnGridItems(block.data);
    const i = parseInt(elx.dataset.col);
    items[i][elx.dataset.field === 'gridItemTitle' ? 'title' : 'description'] = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'flashcardText') {
    const items = normalizeFlashcardItems(block.data);
    const i = parseInt(elx.dataset.col);
    const face = elx.dataset.face === 'back' ? 'back' : 'front';
    items[i][face].text = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'itemTitle' || elx.dataset.field === 'itemBody' || elx.dataset.field === 'carouselSlideTitle' || elx.dataset.field === 'carouselSlideDesc') {
    const listKey = elx.dataset.list || 'items';
    const items = block.data[listKey] || (block.data[listKey] = []);
    const i = parseInt(elx.dataset.iindex, 10);
    if (!items[i]) return;
    const propMap = { itemTitle: 'title', itemBody: 'body', carouselSlideTitle: 'title', carouselSlideDesc: 'description' };
    items[i][propMap[elx.dataset.field]] = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'sceneDialogue') {
    const scenes = block.data.scenes || [];
    const i = parseInt(elx.dataset.iindex, 10);
    if (scenes[i]) scenes[i].dialogue = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'kcQuestion') {
    block.data.question = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'kcGapText') {
    block.data.text = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'kcOption') {
    const opts = block.data.options || (block.data.options = normalizeKcOptions(block.data).slice());
    const i = parseInt(elx.dataset.col, 10);
    opts[i] = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'kcPairLeft') {
    const left = block.data.left || (block.data.left = normalizeKcLeft(block.data).slice());
    const i = parseInt(elx.dataset.col, 10);
    left[i] = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'kcPairRight') {
    const right = block.data.right || (block.data.right = normalizeKcRight(block.data).slice());
    const i = parseInt(elx.dataset.col, 10);
    right[i] = sanitizeRichHtml(elx.innerHTML);
  } else if (elx.dataset.field === 'kcItem') {
    const items = block.data.items || (block.data.items = normalizeKcItems(block.data).slice());
    const i = parseInt(elx.dataset.col, 10);
    items[i] = sanitizeRichHtml(elx.innerHTML);
  } else {
    block.data[elx.dataset.field] = sanitizeRichHtml(elx.innerHTML);
  }
}

/* Wire universal inline-editing behaviour (input sync + rich-text toolbar)
   onto a single .editable-text[contenteditable="true"] element. Used both
   for the bulk binding pass over the whole canvas and for elements created
   later by targeted re-renders (e.g. refreshGenericCanvas). */
function bindEditableTextField(elx, blocks) {
  elx.addEventListener('input', () => {
    const idx = parseInt(elx.closest('.canvas-block').dataset.index, 10);
    const block = blocks[idx];
    if (!block) return;
    block.data = block.data || {};
    const field = elx.dataset.field;
    if (elx.dataset.richtext === 'true') {
      syncRichTextField(block, elx);
      return;
    }
    const text = elx.innerText.replace(/\n+$/, '');
    if (field === 'col') {
      const cols = block.data.cols || (block.data.cols = DEFAULT_COLUMNS.slice());
      cols[parseInt(elx.dataset.col)] = text;
    } else if (field === 'cell') {
      const rows = block.data.rows || (block.data.rows = DEFAULT_TABLE_ROWS.map(r => r.slice()));
      const r = parseInt(elx.dataset.row), c = parseInt(elx.dataset.col);
      if (rows[r]) rows[r][c] = text;
    } else if (field === 'kcOption') {
      const opts = block.data.options || (block.data.options = normalizeKcOptions(block.data).slice());
      opts[parseInt(elx.dataset.col, 10)] = text;
    } else if (field === 'kcPairLeft') {
      const left = block.data.left || (block.data.left = normalizeKcLeft(block.data).slice());
      left[parseInt(elx.dataset.col, 10)] = text;
    } else if (field === 'kcPairRight') {
      const right = block.data.right || (block.data.right = normalizeKcRight(block.data).slice());
      right[parseInt(elx.dataset.col, 10)] = text;
    } else if (field === 'kcItem') {
      const items = block.data.items || (block.data.items = normalizeKcItems(block.data).slice());
      items[parseInt(elx.dataset.col, 10)] = text;
    } else {
      block.data[field] = text;
    }
  });

  if (elx.dataset.richtext === 'true') {
    const idx = parseInt(elx.closest('.canvas-block').dataset.index, 10);
    const block = blocks[idx];
    const showToolbar = () => {
      RichTextToolbar.activeField = { block, elx };
      positionRichTextToolbar();
    };
    elx.addEventListener('mouseup', () => setTimeout(showToolbar, 0));
    elx.addEventListener('keyup', () => setTimeout(showToolbar, 0));
    elx.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== elx && !RichTextToolbar.el.contains(document.activeElement)) {
          hideRichTextToolbar();
        }
      }, 0);
    });
  }
}

/* Toolbar position is anchored to the active block's container — fixed below
   it, horizontally centred — never to the text selection/caret. This keeps
   the toolbar stable while selecting text anywhere within the block. */
function positionRichTextToolbar() {
  const toolbar = RichTextToolbar.el;
  if (!toolbar) return;
  const active = RichTextToolbar.activeField;
  if (!active) { hideRichTextToolbar(); return; }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hideRichTextToolbar(); return; }
  RichTextToolbar.savedRange = sel.getRangeAt(0).cloneRange();
  const blockEl = active.elx.closest('.canvas-block');
  if (!blockEl) { hideRichTextToolbar(); return; }
  // Workstream 4 fix: this anchored to the whole .canvas-block's bottom
  // edge, not the actual selection — on any multi-row/tall block (Table,
  // Accordion, Tabs, Quote Carousel, Process, Flashcard Grid) selecting
  // text near the top placed the toolbar far below the selection (measured:
  // a top-row table selection at y~185-201 produced a toolbar at y~320-360,
  // a 120px+ gap), which is exactly the reported "editing is difficult on
  // some blocks" — the toolbar wasn't where the user was looking. Anchoring
  // to the selection's own bounding rect (falling back to the block's rect
  // only if the selection has no visible rect, e.g. a fully-collapsed
  // range) fixes it for every block uniformly, matching how short blocks
  // like Paragraph already happened to look correct (their block rect and
  // selection rect are nearly the same there, masking the bug).
  const selRect = sel.getRangeAt(0).getBoundingClientRect();
  const rect = (selRect.width || selRect.height) ? selRect : blockEl.getBoundingClientRect();
  toolbar.style.display = 'flex';
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - toolbar.offsetWidth / 2, window.innerWidth - toolbar.offsetWidth - 8));
  let top = rect.bottom + 8;
  if (top + toolbar.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - toolbar.offsetHeight - 8); // flip above if no room below
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

function hideRichTextToolbar() {
  if (RichTextToolbar.el) RichTextToolbar.el.style.display = 'none';
}

const DEFAULT_COLUMNS = ['Column 1 content...', 'Column 2 content...'];
const DEFAULT_QUOTES = [
  { text: 'Curiosity over certainty.' },
  { text: 'Clarity over cleverness.' },
  { text: 'People over process.' },
];
const DEFAULT_TABLE_ROWS = [
  ['Step', 'Owner', 'Timeline'],
  ['Submit form', 'Employee', 'Day 1'],
  ['Review & approve', 'Manager', 'Day 2'],
];

function renderBlockContent(block, editable) {
  const d = block.data || {};
  const ds = block.design || {};
  const ce = editable ? 'contenteditable="true"' : '';
  switch (block.type) {
    case 'heading':
      return `<h2 class="editable-text" data-role="heading" data-field="heading" data-richtext="true" ${ce} data-placeholder="Heading" style="${textTypographyStyle(ds, 22)}${d.headingAlign ? `text-align:${d.headingAlign};` : ''}">${richTextOut(d.heading)}</h2>`;
    case 'heading_paragraph':
      return `<h2 class="editable-text" data-role="heading" data-field="heading" data-richtext="true" ${ce} data-placeholder="Heading" style="${textTypographyStyle(ds, 22)}${d.headingAlign ? `text-align:${d.headingAlign};` : ''}">${richTextOut(d.heading)}</h2>
        <div class="editable-text mt-12" data-role="body" data-field="body" data-richtext="true" ${ce} data-placeholder="Paragraph text..." style="line-height:1.7; ${textTypographyStyle(ds, 15)}${d.bodyAlign ? `text-align:${d.bodyAlign};` : ''}">${richTextOut(d.body)}</div>`;
    case 'paragraph':
      return `<div class="editable-text" data-role="body" data-field="body" data-richtext="true" ${ce} data-placeholder="Write your paragraph content here..." style="line-height:1.7; ${textTypographyStyle(ds, 15)}${d.bodyAlign ? `text-align:${d.bodyAlign};` : ''}">${richTextOut(d.body)}</div>`;
    case 'columns': {
      const cols = d.cols || DEFAULT_COLUMNS;
      const colAlign = d.colAlign || [];
      return `<div style="display:grid; grid-template-columns:repeat(${cols.length},1fr); gap:16px;">
        ${cols.map((c, i) => `<div style="${i > 0 ? 'border-left:1px solid var(--border); padding-left:16px;' : ''}"><div class="editable-text text-sm" data-role="body" data-field="col" data-col="${i}" data-richtext="true" ${ce} data-placeholder="Column ${i + 1} content..." style="${textTypographyStyle(ds, 14)}${colAlign[i] ? `text-align:${colAlign[i]};` : ''}">${richTextOut(c)}</div></div>`).join('')}
      </div>`;
    }
    case 'table': {
      const rows = d.rows || DEFAULT_TABLE_ROWS;
      const cellAlign = d.cellAlign || [];
      const colWidths = d.colWidths || [];
      const headerBg = ds.tableHeaderBg || 'var(--pastel-lavender)';
      const headerTextColor = ds.tableHeaderTextColor || '';
      const borderColor = ds.tableBorderColor || 'var(--border)';
      const bodyFill = ds.tableBodyFill || '';
      // Table Block Controls Sprint, Phase 6 root cause: the table block
      // already shows the generic "Typography > Text Alignment" control
      // (ds.align, data-prop="align") — the same one every Text-category
      // block has — but the table renderer never read ds.align at all, so
      // setting it to Center visibly did nothing. The fix is to make the
      // table actually consume the control that was already there, not to
      // invent a second, differently-named one. A cell's own cellAlign
      // (set via the floating per-cell rich-text toolbar) still overrides
      // this table-wide default.
      const tableAlign = ds.align || 'left';
      const colCount = rows[0] ? rows[0].length : 0;
      const colGroup = colWidths.length ? `<colgroup>${Array.from({length: colCount}, (_, i) => `<col style="${colWidths[i] ? `width:${colWidths[i]}%;` : ''}" />`).join('')}</colgroup>` : '';
      return `<table style="width:100%; border-collapse:collapse; font-size:13px; table-layout:${colWidths.length ? 'fixed' : 'auto'};">
        ${colGroup}
        ${rows.map((row, ri) => `<tr style="background:${ri === 0 ? headerBg : (bodyFill || 'transparent')};">${row.map((cell, ci) => {
          const tag = ri === 0 ? 'th' : 'td';
          const align = (cellAlign[ri] || [])[ci] || tableAlign;
          return `<${tag} style="padding:8px; text-align:${align}; border:1px solid ${borderColor}; overflow-wrap:break-word;${ri === 0 && headerTextColor ? ` color:${headerTextColor};` : ''}"><div class="editable-text" data-role="cell" data-field="cell" data-row="${ri}" data-col="${ci}" data-richtext="true" ${ce} style="${textTypographyStyle(ds, 13)}text-align:${align};">${richTextOut(cell)}</div></${tag}>`;
        }).join('')}</tr>`).join('')}
      </table>`;
    }

    case 'stmt_info': case 'stmt_tip': case 'stmt_success': case 'stmt_warning': case 'stmt_error': case 'stmt_note': {
      const def = STATEMENT_DEFAULTS[block.type] || {};
      const icon = ds.iconRemoved ? '' : (ds.icon !== undefined ? ds.icon : def.icon);
      const iconSize = ds.iconSize ?? 20;
      const iconColor = ds.iconColor || def.iconColor || 'inherit';
      return `<div class="flex gap-12" style="align-items:flex-start;">
        ${icon ? `<span class="stmt-icon-display" style="font-size:${iconSize}px; line-height:1.4; color:${iconColor}; flex-shrink:0;">${escapeHtml(icon)}</span>` : ''}
        <div style="flex:1; min-width:0;">
          <div class="editable-text" data-role="title" data-field="title" data-richtext="true" ${ce} data-placeholder="${def.label || 'Statement'}" style="font-weight:700; margin-bottom:4px; ${textTypographyStyle(ds, 15)}${d.titleAlign ? `text-align:${d.titleAlign};` : ''}">${richTextOut(d.title != null ? d.title : (def.label || 'Statement'))}</div>
          <div class="editable-text" data-role="body" data-field="text" data-richtext="true" ${ce} data-placeholder="Add your message here..." style="line-height:1.6; ${textTypographyStyle(ds, 15)}${d.textAlign ? `text-align:${d.textAlign};` : ''}">${richTextOut(d.text || 'Add your message here.')}</div>
        </div>
      </div>`;
    }

    case 'quote1': {
      // Elegant/simple testimonial — small circular avatar centred above, quote centred, author centred below.
      const textStyle = `${textTypographyStyle(ds, 16)}${d.textAlign ? `text-align:${d.textAlign};` : 'text-align:center;'}`;
      const authorStyle = `${textTypographyStyle(ds, 13)}${d.authorAlign ? `text-align:${d.authorAlign};` : 'text-align:center;'}`;
      const cardStyle = `text-align:center; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'}; padding-top:${ds.paddingTop ?? 0}px; padding-bottom:${ds.paddingBottom ?? 0}px; ${quoteCardBgStyle(ds)}`;
      return `<div style="${cardStyle}">
        ${d.avatar ? `<img src="${AssetStore.resolveMediaSrc(d.avatar)}" alt="" style="width:48px; height:48px; border-radius:50%; object-fit:cover; margin:0 auto 12px; display:block;" />` : ''}
        <div class="editable-text" data-role="body" data-field="text" data-richtext="true" ${ce} data-placeholder="Quote text..." style="font-style:italic; color:var(--ink-700); ${textStyle}">${richTextOut(d.text || 'Great onboarding isn’t a single day — it’s the first chapter of a much longer story.')}</div>
        <div class="editable-text text-sm text-muted mt-8" data-role="author" data-field="author" data-richtext="true" ${ce} data-placeholder="Attribution" style="${authorStyle}">${richTextOut(d.author || 'Lumio Team')}</div>
      </div>`;
    }
    case 'quote2': {
      // Avatar centred above, large quote typography, author highlighted in theme/accent colour.
      const textStyle = `${textTypographyStyle(ds, 22)}${d.textAlign ? `text-align:${d.textAlign};` : 'text-align:center;'}`;
      const authorStyle = `${textTypographyStyle(ds, 14)}${d.authorAlign ? `text-align:${d.authorAlign};` : 'text-align:center;'}`;
      const cardStyle = `text-align:center; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'}; padding-top:${ds.paddingTop ?? 0}px; padding-bottom:${ds.paddingBottom ?? 0}px; ${quoteCardBgStyle(ds)}`;
      return `<div style="${cardStyle}">
        ${d.avatar ? `<img src="${AssetStore.resolveMediaSrc(d.avatar)}" alt="" style="width:48px; height:48px; border-radius:50%; object-fit:cover; margin:0 auto 14px; display:block;" />` : ''}
        <div class="editable-text" data-role="body" data-field="text" data-richtext="true" ${ce} data-placeholder="Quote text..." style="font-weight:600; line-height:1.4; ${textStyle}">${richTextOut(d.text || 'Great onboarding isn’t a single day — it’s the first chapter of a much longer story.')}</div>
        <div class="editable-text mt-12" data-role="author" data-field="author" data-richtext="true" ${ce} data-placeholder="Attribution" style="font-weight:600; color:var(--theme-primary, var(--indigo)); ${authorStyle}">${richTextOut(d.author || 'Lumio Team')}</div>
      </div>`;
    }
    case 'quote3': {
      // Avatar left, quote and author right — horizontal layout, stacks on mobile.
      const textStyle = `${textTypographyStyle(ds, 16)}${d.textAlign ? `text-align:${d.textAlign};` : ''}`;
      const authorStyle = `${textTypographyStyle(ds, 13)}${d.authorAlign ? `text-align:${d.authorAlign};` : ''}`;
      const cardStyle = `display:flex; gap:16px; align-items:flex-start; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'}; padding-top:${ds.paddingTop ?? 0}px; padding-bottom:${ds.paddingBottom ?? 0}px; ${quoteCardBgStyle(ds)}`;
      return `<div class="quote3-layout" style="${cardStyle}">
        ${d.avatar ? `<img src="${AssetStore.resolveMediaSrc(d.avatar)}" alt="" style="width:56px; height:56px; border-radius:50%; object-fit:cover; flex-shrink:0;" />` : ''}
        <div style="flex:1; min-width:0;">
          <div class="editable-text" data-role="body" data-field="text" data-richtext="true" ${ce} data-placeholder="Quote text..." style="font-style:italic; color:var(--ink-700); ${textStyle}">${richTextOut(d.text || 'Great onboarding isn’t a single day — it’s the first chapter of a much longer story.')}</div>
          <div class="editable-text text-sm text-muted mt-8" data-role="author" data-field="author" data-richtext="true" ${ce} data-placeholder="Attribution" style="${authorStyle}">${richTextOut(d.author || 'Lumio Team')}</div>
        </div>
      </div>`;
    }
    case 'quote4': {
      // Editorial/testimonial style — avatar offset beside quote in a themed card, distinct hierarchy from quote3.
      // Remediation Sprint 1: previously hardcoded to QUOTE_ACCENT_BG_MAP[ds.accent]
      // (the removed duplicate "Style Variant" control) — now uses the same
      // Theme/Light/Grey/Dark/Custom/Image Background system as quote1-3.
      const textStyle = `${textTypographyStyle(ds, 17)}${d.textAlign ? `text-align:${d.textAlign};` : ''}`;
      const authorStyle = `${textTypographyStyle(ds, 13)}${d.authorAlign ? `text-align:${d.authorAlign};` : 'text-align:center;'}`;
      const cardStyle = `display:flex; gap:20px; align-items:center; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'}; padding-top:${24 + (ds.paddingTop ?? 0)}px; padding-bottom:${24 + (ds.paddingBottom ?? 0)}px; padding-left:24px; padding-right:24px; ${quoteCardBgStyle(ds)}`;
      return `<div class="quote4-layout" style="${cardStyle}">
        <div style="flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:8px; width:80px;">
          ${d.avatar ? `<img src="${AssetStore.resolveMediaSrc(d.avatar)}" alt="" style="width:64px; height:64px; border-radius:50%; object-fit:cover;" />` : ''}
          <div class="editable-text text-sm text-muted" data-role="author" data-field="author" data-richtext="true" ${ce} data-placeholder="Attribution" style="${authorStyle}">${richTextOut(d.author || 'Lumio Team')}</div>
        </div>
        <div style="flex:1; min-width:0; border-left:3px solid var(--theme-primary, var(--indigo)); padding-left:16px;">
          <div class="editable-text" data-role="body" data-field="text" data-richtext="true" ${ce} data-placeholder="Quote text..." style="font-weight:500; line-height:1.5; ${textStyle}">${richTextOut(d.text || 'Great onboarding isn’t a single day — it’s the first chapter of a much longer story.')}</div>
        </div>
      </div>`;
    }
    case 'quote_image': {
      const bgStyle = d.background ? `background-image:url('${AssetStore.resolveMediaSrc(d.background)}'); background-size:cover; background-position:center;` : 'background:var(--gradient-primary)';
      const overlayOpacity = ds.overlayOpacity ?? 35;
      const overlay = d.background ? `<div class="quote-image-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,${(overlayOpacity / 100).toFixed(2)}); border-radius:var(--r-md);"></div>` : '';
      return `<div style="${bgStyle} border-radius:var(--r-md); padding:40px; text-align:center; color:#fff; position:relative; overflow:hidden;">
        ${overlay}
        <div style="position:relative; z-index:1;">
          <div class="editable-text" data-role="body" data-field="text" data-richtext="true" ${ce} data-placeholder="Quote text..." style="font-style:italic; ${textTypographyStyle(ds, 18)}${d.textAlign ? `text-align:${d.textAlign};` : 'text-align:center;'}">${richTextOut(d.text || 'Progress over perfection.')}</div>
          <div class="flex items-center gap-8 mt-12" style="justify-content:center;">
            ${d.avatar ? `<img src="${AssetStore.resolveMediaSrc(d.avatar)}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover; flex-shrink:0;" />` : ''}
            <div class="editable-text text-sm" data-role="author" data-field="author" data-richtext="true" ${ce} data-placeholder="Attribution" style="${textTypographyStyle(ds, 13)}${d.authorAlign ? `text-align:${d.authorAlign};` : ''}">${richTextOut(d.author || 'Company Values')}</div>
          </div>
        </div>
      </div>`;
    }
    case 'quote_carousel': {
      const quotes = normalizeQuoteItems(d);
      // Remediation Sprint 1, Phase 2: migrated off the "Style Variant"
      // (ds.accent → QUOTE_ACCENT_BG_MAP) + partial ds.bgType-custom hybrid
      // (Sprint 3B) onto the same single Architecture A system Quote 1-4 use
      // (quoteCardBgStyle) — eliminates the duplicate control entirely
      // rather than papering over it with a second override.
      const cardBgStyleStr = quoteCardBgStyle(ds);
      // "Card Alignment" (component alignment) — separate from each quote's
      // own text/author alignment, which only ever affected the TEXT inside
      // a card, never how the row of cards is positioned within the block.
      const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
      const cardAlign = justifyMap[ds.cardAlign] || 'flex-start';
      // Sprint 1 Final Validation, Workstream 1 finding: the Architecture A
      // migration moved the background but not the text colour — on a Dark
      // background, quoteText/quoteAuthor still used .text-sm/.text-muted's
      // fixed dark ink colour, rendering near-illegible dark-on-dark text.
      // Caught via real HTML export computed-style check (qcTextColor
      // rgb(58,54,85) on rgb(31,27,58) background), not assumed. Accordion/
      // Tabs/Process already correctly apply archATextColor; Quote Carousel
      // did not.
      const qcTextColor = archATextColor(ds);
      return `<div class="flex gap-12" style="overflow-x:auto; align-items:flex-start; justify-content:${cardAlign};">
        ${quotes.map((q, i) => `
          <div class="card card-pad" style="min-width:200px; ${cardBgStyleStr} border:none; color:${qcTextColor};">
            ${q.avatar ? `<img src="${AssetStore.resolveMediaSrc(q.avatar)}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover; margin:0 auto 8px; display:block;" />` : ''}
            <div class="editable-text text-sm" data-role="body" data-field="quoteText" data-col="${i}" data-richtext="true" ${ce} data-placeholder="Quote text..." style="color:${qcTextColor}; ${textTypographyStyle(ds, 14)}${q.textAlign ? `text-align:${q.textAlign};` : ''}">${richTextOut(q.text || '')}</div>
            <div class="editable-text text-sm mt-8" data-role="author" data-field="quoteAuthor" data-col="${i}" data-richtext="true" ${ce} data-placeholder="Attribution" style="color:${qcTextColor}; opacity:0.7; ${textTypographyStyle(ds, 13)}${q.authorAlign ? `text-align:${q.authorAlign};` : ''}">${q.author ? richTextOut(q.author) : ''}</div>
          </div>
        `).join('')}
      </div>`;
    }

    case 'list_numbered': case 'list_checkbox': case 'list_bullet': {
      const def = LIST_DEFAULTS[block.type];
      const items = normalizeListItems(d, def.items);
      const indent = ds.indent ?? 20;
      const itemsHtml = renderListItemsHtml(block, ds, items, editable, {});
      return `<h3 class="editable-text" data-role="heading" data-field="heading" data-richtext="true" ${ce} data-placeholder="${def.heading}" style="font-size:15px; margin-bottom:10px;">${richTextOut(d.heading != null ? d.heading : def.heading)}</h3>
        <div class="list-items-wrap" role="list" style="padding-left:${indent}px;">${itemsHtml}</div>
        ${editable ? `<button class="btn btn-secondary btn-sm list-item-add mt-8" style="margin-left:${indent}px;">+ Add Item</button>` : ''}`;
    }

    case 'image': {
      const layout = ds.layout || 'centered';
      const radius = IMAGE_RADIUS_MAP[ds.imageRadius || 'soft'];
      const src = AssetStore.resolveMediaSrc(d.src);
      const alt = d.alt || d.label || '';
      let imgStyle;
      if (layout === 'full') imgStyle = 'width:100%; height:auto;';
      else if (layout === 'banner') imgStyle = 'width:100%; height:260px; object-fit:cover;';
      else imgStyle = 'max-width:480px; width:100%; height:auto; margin:0 auto;';
      imgStyle += ` display:block; border-radius:${radius}; border:${interactiveBorderStyle(ds)};`;
      const imgHtml = src
        ? `<img src="${src}" alt="${escapeHtml(alt)}" class="${editable ? 'block-image' : 'image-zoom-trigger'}" data-zoom-src="${src}" data-zoom-alt="${escapeHtml(alt)}" style="${imgStyle} cursor:${editable ? 'pointer' : 'zoom-in'};" />`
        : `<div style="${layout === 'centered' ? 'max-width:480px; margin:0 auto;' : ''}">${imagePlaceholder(d.label || 'Image placeholder', layout === 'banner' ? 200 : 160)}</div>`;
      const showCaption = editable || d.caption;
      const captionHtml = showCaption
        ? `<div class="editable-text text-sm text-muted mt-8" data-role="caption" data-field="caption" data-richtext="true" ${ce} data-placeholder="Add a caption (optional)" style="text-align:center;">${richTextOut(d.caption || '')}</div>`
        : '';
      return `<div style="${interactiveSpacingStyle(ds)}">${imgHtml}${captionHtml}</div>`;
    }
    case 'image_text': {
      const pos = ds.imagePosition || 'left';
      const sizeMap = { sm: ['0.8fr', '1.6fr'], md: ['1fr', '1.2fr'], lg: ['1.4fr', '1fr'] };
      const cols = sizeMap[ds.imageSize || 'md'];
      const gridCols = pos === 'right' ? `${cols[1]} ${cols[0]}` : `${cols[0]} ${cols[1]}`;
      const src = AssetStore.resolveMediaSrc(d.src);
      const alt = d.alt || d.imageLabel || '';
      const itRadius = IMAGE_RADIUS_MAP[ds.imageRadius || 'soft'];
      const imageBlock = src
        ? `<img src="${src}" alt="${escapeHtml(alt)}" class="${editable ? 'block-image' : 'image-zoom-trigger'}" data-zoom-src="${src}" data-zoom-alt="${escapeHtml(alt)}" style="width:100%; height:100%; min-height:140px; object-fit:cover; border-radius:${itRadius}; border:${interactiveBorderStyle(ds)}; display:block; cursor:${editable ? 'pointer' : 'zoom-in'};" />`
        : imagePlaceholder(alt || 'Image placeholder', 140);
      const textBlock = `<div>
        <h3 class="editable-text" data-role="heading" data-field="heading" data-richtext="true" ${ce} data-placeholder="Heading" style="${textTypographyStyle(ds, 16)}">${richTextOut(d.heading || '')}</h3>
        <div class="editable-text text-sm mt-8" data-role="body" data-field="body" data-richtext="true" ${ce} data-placeholder="Supporting paragraph text goes here." style="line-height:1.7; ${textTypographyStyle(ds, 14)}">${richTextOut(d.body || '')}</div>
      </div>`;
      return `<div class="image-text-layout" style="${interactiveSpacingStyle(ds)} display:grid; grid-template-columns:${gridCols}; gap:20px; align-items:center;">
        ${pos === 'right' ? `${textBlock}${imageBlock}` : `${imageBlock}${textBlock}`}
      </div>`;
    }
    case 'text_on_image': {
      const src = AssetStore.resolveMediaSrc(d.src || d.imageUrl);
      const overlayOpacity = ds.overlayOpacity ?? 40;
      const textColor = ds.textColor === 'dark' ? '#1a1a1a' : '#ffffff';
      const position = ds.textPosition || 'center';
      const justifyMap = { top: 'flex-start', center: 'center', bottom: 'flex-end' };
      const toiRadius = IMAGE_RADIUS_MAP[ds.imageRadius || 'soft'];
      const bgStyle = (d.src || d.imageUrl) ? `background-image:url('${src}'); background-size:cover; background-position:center;` : 'background:var(--gradient-warm);';
      return `<div style="${interactiveSpacingStyle(ds)} ${bgStyle} border-radius:${toiRadius}; border:${interactiveBorderStyle(ds)}; min-height:320px; position:relative; overflow:hidden; display:flex; align-items:${justifyMap[position] || 'center'}; justify-content:center;">
        ${src ? `<div class="text-on-image-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,${(overlayOpacity / 100).toFixed(2)});"></div>` : ''}
        <div style="position:relative; z-index:1; padding:32px; text-align:center; max-width:520px;">
          <h3 class="editable-text" data-role="heading" data-field="heading" data-richtext="true" ${ce} data-placeholder="Bold headline on image" style="color:${textColor}; ${textTypographyStyle(ds, 20)}">${richTextOut(d.heading || '')}</h3>
          <div class="editable-text mt-8" data-role="body" data-field="body" data-richtext="true" ${ce} data-placeholder="Supporting text overlaid on a background image." style="color:${textColor}; ${textTypographyStyle(ds, 15)}">${richTextOut(d.body || '')}</div>
        </div>
      </div>`;
    }

    case 'carousel': {
      const items = normalizeCarouselItems(d);
      const fitMap = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none' };
      const carRadius = IMAGE_RADIUS_MAP[ds.imageRadius || 'soft'];
      const carBorder = interactiveBorderStyle(ds);
      return `<div class="flex gap-12" style="${interactiveSpacingStyle(ds)} overflow-x:auto; align-items:flex-start;">
        ${items.map((item, i) => {
          const fit = item.imageFit || 'cover';
          const rSrc = item.src ? AssetStore.resolveMediaSrc(item.src) : null;
          let imageHtml;
          if (!item.src) {
            imageHtml = imagePlaceholder(item.title || item.description || `Slide ${i + 1}`, 160);
          } else if (fit === 'full') {
            imageHtml = `<div class="${editable ? '' : 'image-zoom-trigger'}" data-zoom-src="${rSrc}" data-zoom-alt="" style="position:relative; width:100%; aspect-ratio:16/9; border-radius:${carRadius}; border:${carBorder}; overflow:hidden; cursor:${editable ? 'default' : 'zoom-in'};"><img src="${rSrc}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block;" /></div>`;
          } else {
            const of = fitMap[fit] || 'cover';
            imageHtml = `<img src="${rSrc}" alt="" class="${editable ? '' : 'image-zoom-trigger'}" data-zoom-src="${rSrc}" data-zoom-alt="" style="width:100%; aspect-ratio:16/9; height:auto; object-fit:${of}; ${of === 'none' ? 'background:var(--surface-50);' : ''} border-radius:${carRadius}; border:${carBorder}; display:block; cursor:${editable ? 'default' : 'zoom-in'};" />`;
          }
          return `
          <div class="card card-pad" style="min-width:180px; max-width:220px; border:${carBorder};">
            ${imageHtml}
            ${(item.title || editable) ? `<div class="editable-text text-sm mt-8" data-role="title" data-field="carouselSlideTitle" data-list="items" data-iindex="${i}" data-richtext="true" ${ce} data-placeholder="Slide title" style="font-weight:600;">${richTextOut(item.title || '')}</div>` : ''}
            ${(item.description || editable) ? `<div class="editable-text text-sm text-muted mt-4" data-role="body" data-field="carouselSlideDesc" data-list="items" data-iindex="${i}" data-richtext="true" ${ce} data-placeholder="Slide description">${richTextOut(item.description || '')}</div>` : ''}
          </div>
        `;
        }).join('')}
      </div>`;
    }
    case 'column_grid': {
      const items = normalizeColumnGridItems(d);
      const columns = Math.max(2, Math.min(6, ds.columns || 3));
      const cgRadius = IMAGE_RADIUS_MAP[ds.imageRadius || 'soft'];
      const cgBorder = interactiveBorderStyle(ds);
      return `<div style="${interactiveSpacingStyle(ds)} display:grid; grid-template-columns:repeat(${columns},1fr); gap:12px;">
        ${items.map((item, i) => `
          <div class="card card-pad text-center" style="position:relative; border:${cgBorder};">
            ${editable ? `<button class="btn-icon grid-item-remove" data-gindex="${i}" title="Remove item" aria-label="Remove item" ${items.length <= 1 ? 'disabled' : ''} style="position:absolute; top:4px; right:4px; width:22px; height:22px; line-height:1; background:rgba(0,0,0,0.08); border:none; border-radius:50%; cursor:pointer; font-size:13px; opacity:${items.length <= 1 ? '0.4' : '1'};">×</button>` : ''}
            ${item.imageUrl
              ? `<img src="${AssetStore.resolveMediaSrc(item.imageUrl)}" alt="" class="${editable ? 'block-image' : 'image-zoom-trigger'}" data-zoom-src="${AssetStore.resolveMediaSrc(item.imageUrl)}" data-zoom-alt="${escapeHtml(item.title || '')}" data-gindex="${i}" style="width:100%; aspect-ratio:16/9; height:auto; object-fit:cover; border-radius:${cgRadius}; border:${cgBorder}; display:block; cursor:${editable ? 'pointer' : 'zoom-in'};"/>`
              : imagePlaceholder(item.title || 'Item', 150)}
            <div class="editable-text mt-8" data-role="body" data-field="gridItemTitle" data-col="${i}" data-richtext="true" ${ce} data-placeholder="Item title" style="font-weight:600; font-size:13px;">${richTextOut(item.title || '')}</div>
            <div class="editable-text text-sm text-muted mt-4" data-role="body" data-field="gridItemDesc" data-col="${i}" data-richtext="true" ${ce} data-placeholder="Description (optional)">${richTextOut(item.description || '')}</div>
            ${editable ? `<div class="flex items-center justify-center gap-8 mt-8">
              <button class="btn btn-secondary btn-sm grid-item-image-trigger" data-gindex="${i}">${item.imageUrl ? '🔄 Replace' : '📤 Upload'}</button>
              ${item.imageUrl ? `<button class="btn btn-ghost btn-sm grid-item-image-remove" data-gindex="${i}" style="color:#E5484D;">🗑️</button>` : ''}
            </div>` : ''}
          </div>
        `).join('')}
        ${editable ? `<button class="btn btn-secondary btn-sm grid-item-add" style="grid-column:1/-1;">+ Add Item</button>` : ''}
      </div>`;
    }

    case 'audio': {
      const audioSettings = block.settings || {};
      const widthMap = { small: '320px', medium: '480px', large: '640px', full: '100%' };
      const audioWidth = widthMap[ds.width] || widthMap.medium;
      const audioRadius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      const paddingTop = ds.paddingTop ?? 22;
      const paddingBottom = ds.paddingBottom ?? 22;
      const allowDownload = audioSettings.allowDownload !== false;
      const showSpeed = audioSettings.showPlaybackSpeed !== false;
      const loop = !!audioSettings.loop;
      const autoplay = !editable && !!audioSettings.autoplay;
      const src = AssetStore.resolveMediaSrc(d.src);

      const innerContent = src
        ? `<audio class="block-audio-el" controls ${loop ? 'loop' : ''} ${autoplay ? 'autoplay' : ''} ${!allowDownload ? 'controlslist="nodownload"' : ''} style="width:100%; display:block; border-radius:${audioRadius};" src="${src}"></audio>
          ${showSpeed ? playbackSpeedSelector('block-audio-el') : ''}`
        : `<div class="flex items-center gap-12"><span style="font-size:22px;">🔊</span><div class="text-sm text-muted">${editable ? 'No audio uploaded — use the Content tab to upload an audio file.' : 'Audio unavailable.'}</div></div>`;

      const showCaption = editable || d.caption;
      const captionHtml = showCaption
        ? `<div class="editable-text text-sm text-muted mt-8" data-role="caption" data-field="caption" data-richtext="true" ${ce} data-placeholder="Add a caption (optional)" style="text-align:center;">${richTextOut(d.caption || '')}</div>`
        : '';

      const transcriptHtml = d.transcript
        ? `<details class="audio-transcript mt-12">
            <summary style="cursor:pointer; font-weight:600; font-size:13px;">Transcript</summary>
            <div class="text-sm mt-8" style="white-space:pre-wrap; line-height:1.6;">${escapeHtml(d.transcript)}</div>
          </details>`
        : '';

      return `<div style="padding-top:${paddingTop}px; padding-bottom:${paddingBottom}px;">
        <div class="media-frame" style="max-width:${audioWidth}; margin:0 auto;">
          ${innerContent}
        </div>
        <div style="max-width:${audioWidth}; margin:0 auto;">
          ${captionHtml}
          ${transcriptHtml}
        </div>
      </div>`;
    }
    case 'video': {
      const videoSettings = block.settings || {};
      const videoWidthMap = { small: '320px', medium: '480px', large: '640px', full: '100%' };
      const videoWidth = videoWidthMap[ds.width] || videoWidthMap.medium;
      const videoRadius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      const videoPaddingTop = ds.paddingTop ?? 22;
      const videoPaddingBottom = ds.paddingBottom ?? 22;
      const videoAllowDownload = videoSettings.allowDownload !== false;
      const videoShowSpeed = videoSettings.showPlaybackSpeed !== false;
      const videoLoop = !!videoSettings.loop;
      const videoAutoplay = !editable && !!videoSettings.autoplay;

      // Priority rule: an uploaded file always wins over the embed/URL field.
      const uploadedSrc = d.src;
      const embed = !uploadedSrc && d.url ? parseVideoEmbedUrl(d.url) : null;
      const trackHtml = d.subtitles ? `<track kind="subtitles" src="${subtitlesToVttDataUrl(d.subtitles)}" srclang="en" label="English" default>` : '';

      let videoInner;
      if (uploadedSrc || (embed && embed.type === 'mp4')) {
        const videoSrc = uploadedSrc ? AssetStore.resolveMediaSrc(uploadedSrc) : embed.embedUrl;
        videoInner = `<video class="block-video-el" controls ${videoLoop ? 'loop' : ''} ${videoAutoplay ? 'autoplay muted' : ''} ${!videoAllowDownload ? 'controlslist="nodownload"' : ''} style="width:100%; display:block; background:#000; border-radius:${videoRadius};" src="${videoSrc}">${trackHtml}</video>
          ${videoShowSpeed ? playbackSpeedSelector('block-video-el') : ''}`;
      } else if (embed && (embed.type === 'youtube' || embed.type === 'vimeo')) {
        const autoplayParam = videoAutoplay ? (embed.type === 'youtube' ? '?autoplay=1&mute=1' : '?autoplay=1&muted=1') : '';
        // Linked Video delivery mode: author has explicitly chosen not to
        // embed at all (e.g. for videos they know block embedding) — go
        // straight to the fallback card, no iframe attempted.
        const linkedMode = videoSettings.deliveryMode === 'linked';
        const fallbackCard = videoEmbedFallbackCard(embed, d);
        if (linkedMode) {
          videoInner = fallbackCard;
        } else {
          // Embed first; for YouTube, a real embedding-disabled error (the
          // "Video unavailable" case) is only detectable via the IFrame
          // Player API's onError event at runtime — bindVideoEmbedFallbacks()
          // (learnerPreview.js, also bundled into publish.js) swaps the
          // iframe for the sibling fallback card on that event. The iframe
          // and its fallback both exist in markup; only one is visible at a time.
          videoInner = `<div class="lumio-video-embed-wrap" data-embed-type="${embed.type}" style="position:relative; width:100%; padding-top:56.25%; background:#000; border-radius:${videoRadius}; overflow:hidden;">
            <iframe id="ytembed-${block.id}" class="lumio-video-iframe" src="${embed.embedUrl}${autoplayParam}" title="Video" style="position:absolute; inset:0; width:100%; height:100%; border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
          </div>
          <div class="lumio-video-fallback" style="display:none;">${fallbackCard}</div>`;
        }
      } else {
        videoInner = `<div class="flex items-center gap-12"><span style="font-size:22px;">🎬</span><div class="text-sm text-muted">${editable ? 'No video uploaded — use the Content tab to upload a video file or add an embed URL.' : 'Video unavailable.'}</div></div>`;
      }

      const videoShowCaption = editable || d.caption;
      const videoCaptionHtml = videoShowCaption
        ? `<div class="editable-text text-sm text-muted mt-8" data-role="caption" data-field="caption" data-richtext="true" ${ce} data-placeholder="Add a caption (optional)" style="text-align:center;">${richTextOut(d.caption || '')}</div>`
        : '';

      const videoTranscriptHtml = d.transcript
        ? `<details class="audio-transcript mt-12">
            <summary style="cursor:pointer; font-weight:600; font-size:13px;">Transcript</summary>
            <div class="text-sm mt-8" style="white-space:pre-wrap; line-height:1.6;">${escapeHtml(d.transcript)}</div>
          </details>`
        : '';

      return `<div style="padding-top:${videoPaddingTop}px; padding-bottom:${videoPaddingBottom}px;">
        <div class="media-frame" style="max-width:${videoWidth}; margin:0 auto;">
          ${videoInner}
        </div>
        <div style="max-width:${videoWidth}; margin:0 auto;">
          ${videoCaptionHtml}
          ${videoTranscriptHtml}
        </div>
      </div>`;
    }
    case 'file': {
      const filePaddingTop = ds.paddingTop ?? 8;
      const filePaddingBottom = ds.paddingBottom ?? 8;
      const fileSrc = d.src;
      const fileName = d.srcFileName;
      const fileSize = formatFileSize(d.srcFileSize);

      const fileRow = fileName
        ? `<div class="flex items-center gap-12">
            <span style="font-size:22px;">📎</span>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(fileName)}</div>
              <div class="text-sm text-muted">${escapeHtml(fileSize)}</div>
            </div>
            ${fileSrc ? `<a href="${AssetStore.resolveMediaSrc(fileSrc)}" download="${escapeHtml(fileName)}" class="btn btn-secondary btn-sm">Download</a>` : ''}
          </div>`
        : `<div class="flex items-center gap-12">
            <span style="font-size:22px;">📎</span>
            <div class="text-sm text-muted">${editable ? 'No file uploaded — use the Content tab to upload an attachment.' : 'Attachment unavailable.'}</div>
          </div>`;

      return `<div style="padding-top:${filePaddingTop}px; padding-bottom:${filePaddingBottom}px;">${fileRow}</div>`;
    }

    case 'accordion': {
      const items = normalizeItemList(d, 'items', () => [
        { title: 'Section 1', body: 'Details about section 1...' },
        { title: 'Section 2', body: 'Details about section 2...' },
      ]);
      const settings = block.settings || {};
      const single = settings.openMode !== 'multiple';
      const expandFirst = settings.expandFirst !== false;
      const animate = settings.animation !== false;
      const headingTag = ds.headingLevel || 'h4';
      const radius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      const rowSpacing = ds.rowSpacing ?? 8;
      const variant = ds.variant || 'default';
      // Remediation Sprint 1, Phase 2: migrated from surfaceBg/surfaceTextColor
      // (the old Light/Gray/Theme/Dark/Black bgStyle system) onto Architecture
      // A (quoteCardBgStyle/archATextColor) — same Theme/Light/Grey/Dark/
      // Custom/Image options Statements and Quotes already use.
      const textColor = archATextColor(ds);
      const markerStyle = ds.markerStyle || 'none';
      const rowStyle = variant === 'minimal'
        ? `background:transparent; border-bottom:1px solid color-mix(in srgb, var(--theme-primary, var(--indigo)) 14%, var(--border)); border-radius:0;`
        : variant === 'boxed'
          ? `${quoteCardBgStyle(ds)} color:${textColor}; border-radius:${radius}; box-shadow:${editable ? 'var(--elevation-1)' : 'none'}; border:${interactiveBorderStyle(ds)};`
          : `${quoteCardBgStyle(ds)} color:${textColor}; border-radius:${radius};`;
      // Editable canvas only: which rows are open persists across
      // re-renders (keyed by stable block.id), so attaching media to a
      // collapsed-by-default row doesn't immediately hide it again.
      // Preview/published output keeps the original expandFirst-only rule.
      let openRows = editable ? BuilderUI.openItemState[block.id] : null;
      if (editable && !openRows) {
        openRows = new Set(expandFirst ? [0] : []);
        BuilderUI.openItemState[block.id] = openRows;
      }
      return `<div class="lumio-accordion" style="${interactiveSpacingStyle(ds)} display:flex; flex-direction:column; gap:${rowSpacing}px;">
        ${items.map((item, i) => {
          const open = editable ? openRows.has(i) : (expandFirst && i === 0);
          return `<div class="lumio-accordion-row ${open ? 'open' : ''}">
            <div class="lumio-accordion-header" tabindex="0" role="button" aria-expanded="${open}" style="${rowStyle}" onclick="if(${open?'true':'false'} && event.target.closest('.editable-text[contenteditable=true]')) return; lumioAccordionToggle(this, ${single}, ${animate})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault(); lumioAccordionToggle(this, ${single}, ${animate});}">
              <span class="lumio-accordion-title">${markerStyle === 'number' ? `<span class="lumio-accordion-marker">${i + 1}.</span>` : ''}<${headingTag} class="editable-text" data-role="title" data-field="itemTitle" data-list="items" data-iindex="${i}" data-richtext="true" ${ce} data-placeholder="Section title" style="margin:0; font-size:15px;">${richTextOut(item.title || '')}</${headingTag}></span>
              <span class="lumio-accordion-chevron" data-style="${ds.chevronStyle || 'chevron'}"></span>
            </div>
            <div class="lumio-accordion-body" style="max-height:${open ? 'none' : '0px'};">
              <div class="lumio-accordion-body-inner">
                ${itemImageHtml(item, 200)}
                <div class="editable-text text-sm" data-role="body" data-field="itemBody" data-list="items" data-iindex="${i}" data-richtext="true" ${ce} data-placeholder="Section body content...">${richTextOut(item.body || '')}</div>
                ${itemMediaExtrasHtml(item)}
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }
    case 'tabs': {
      const items = normalizeItemList(d, 'items', () => [
        { title: 'Overview', body: 'Overview content...' },
        { title: 'Details', body: 'Details content...' },
        { title: 'FAQ', body: 'FAQ content...' },
      ]);
      const settings = block.settings || {};
      // Builder-only: prefer the persisted active tab (see lumioTabSwitch)
      // over the author's default so re-renders don't jump back to tab 0.
      const persistedActive = editable ? BuilderUI.openItemState[block.id] : undefined;
      let active = typeof persistedActive === 'number' ? persistedActive : (settings.defaultTab || 0);
      if (active < 0 || active >= items.length) active = 0;
      const radius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      const alignMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
      // Remediation Sprint 1, Phase 2: migrated onto Architecture A.
      const textColor = archATextColor(ds);
      const tabStyle = ds.tabStyle || 'underline';
      const animate = settings.animation !== false;
      return `<div class="lumio-tabs" data-tabstyle="${tabStyle}" data-animate="${animate ? '1' : '0'}" style="${interactiveSpacingStyle(ds)}">
        <div class="lumio-tabs-strip" role="tablist" style="justify-content:${alignMap[ds.align] || 'flex-start'};">
          ${items.map((item, i) => `<button class="lumio-tab-btn ${i === active ? 'active' : ''}" role="tab" aria-selected="${i === active}" onclick="if(${i}===${active} && event.target.closest('.editable-text[contenteditable=true]')) return; lumioTabSwitch(this, ${i})"><span class="editable-text" data-role="title" data-field="itemTitle" data-list="items" data-iindex="${i}" data-richtext="true" ${ce} data-placeholder="Tab ${i + 1}">${richTextOut(item.title || (editable ? '' : 'Tab ' + (i + 1)))}</span></button>`).join('')}
        </div>
        <div class="lumio-tabs-panels" style="${quoteCardBgStyle(ds)} color:${textColor}; border-radius:${radius}; border:${interactiveBorderStyle(ds)};">
          ${items.map((item, i) => `<div class="lumio-tab-panel ${i === active ? 'active' : ''}" role="tabpanel">
            ${itemImageHtml(item, 220)}
            <div class="editable-text text-sm" data-role="body" data-field="itemBody" data-list="items" data-iindex="${i}" data-richtext="true" ${ce} data-placeholder="Tab content...">${richTextOut(item.body || '')}</div>
            ${itemMediaExtrasHtml(item)}
          </div>`).join('')}
        </div>
      </div>`;
    }
    case 'labelled_graphic': {
      const hotspots = normalizeItemList(d, 'hotspots', () => [
        { title: 'Hotspot 1', body: 'Description for hotspot 1', x: 25, y: 30 },
        { title: 'Hotspot 2', body: 'Description for hotspot 2', x: 60, y: 55 },
        { title: 'Hotspot 3', body: 'Description for hotspot 3', x: 80, y: 25 },
      ]);
      const settings = block.settings || {};
      const animate = settings.hotspotAnimation !== false;
      const radius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      const imgWidth = ds.imageWidth ?? 100;
      const markerColor = ds.markerColor || '#7C3AED';
      const markerBorderColor = ds.markerBorderColor || '#ffffff';
      const markerSize = MARKER_SIZE_MAP[ds.markerSize] || MARKER_SIZE_MAP.md;
      const markerStyle = ds.markerStyle || 'numbers';
      const markerGlyph = (i) => markerStyle === 'numbers' ? String(i + 1) : (MARKER_ICONS[markerStyle] || String(i + 1));
      const visitedStyle = ds.visitedStyle || 'filled';
      // Remediation Sprint 1, Phase 2: migrated onto Architecture A.
      const bgStyleStr = quoteCardBgStyle(ds);
      const fitMap = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none' };
      const objectFit = fitMap[ds.imageFit] || 'cover';
      return `<div class="lumio-labelled-graphic" data-autoclose="${settings.autoClose !== false ? '1' : '0'}" data-visitedstyle="${visitedStyle}" style="width:${imgWidth}%; max-width:100%; margin:0 auto; ${interactiveSpacingStyle(ds)}">
        <div class="lumio-lg-imagewrap" style="position:relative; border-radius:${radius}; overflow:hidden; ${bgStyleStr} border:${interactiveBorderStyle(ds)}; ${d.image ? '' : 'min-height:240px; display:flex; align-items:center; justify-content:center;'}">
          ${d.image ? `<img src="${AssetStore.resolveMediaSrc(d.image)}" alt="" style="width:100%; display:block; object-fit:${objectFit}; ${objectFit === 'none' ? 'height:320px;' : ''}" />` : `<span style="font-size:32px;">🗺️</span>`}
          ${hotspots.map((h, i) => `<button class="lumio-hotspot ${animate ? 'pulse' : ''}" data-glyph="${escapeHtml(markerGlyph(i))}" style="left:${h.x ?? 50}%; top:${h.y ?? 50}%; width:${markerSize}px; height:${markerSize}px; background:${markerColor}; border-color:${markerBorderColor};" data-hindex="${i}"
              onmousedown="lumioHotspotDragStart(event, ${i})" ontouchstart="lumioHotspotDragStart(event, ${i})"
              onclick="event.stopPropagation(); lumioHotspotToggle(this, ${i})" aria-label="${escapeHtml(h.title || 'Hotspot ' + (i + 1))}">${markerGlyph(i)}</button>`).join('')}
          ${hotspots.map((h, i) => `<div class="lumio-hotspot-panel" data-hindex="${i}" style="display:none;" onclick="event.stopPropagation();">
              <button class="lumio-hotspot-close" onclick="event.stopPropagation(); lumioHotspotToggle(this.parentElement.parentElement.querySelector('.lumio-hotspot[data-hindex=\\'${i}\\']'), ${i})">×</button>
              <h4 style="margin:0 0 6px;">${escapeHtml(h.title || '')}</h4>
              ${itemImageHtml(h, 140)}
              <div class="text-sm">${richTextOut(h.body)}</div>
              ${itemMediaExtrasHtml(h)}
              ${hotspots.length > 1 ? `<div class="lumio-hotspot-nav">
                <button class="btn btn-secondary btn-sm lumio-hotspot-prev" onclick="event.stopPropagation(); lumioHotspotPanelNav(this, -1)">← Prev</button>
                <span class="lumio-hotspot-counter">${i + 1} of ${hotspots.length}</span>
                <button class="btn btn-secondary btn-sm lumio-hotspot-next" onclick="event.stopPropagation(); lumioHotspotPanelNav(this, 1)">Next →</button>
              </div>` : ''}
            </div>`).join('')}
        </div>
      </div>`;
    }
    case 'process': {
      const items = normalizeItemList(d, 'items', () => [
        { title: 'Step 1', body: 'Description of step 1' },
        { title: 'Step 2', body: 'Description of step 2' },
        { title: 'Step 3', body: 'Description of step 3' },
      ]);
      const settings = block.settings || {};
      const showNumbers = settings.showStepNumbers !== false;
      const headingTag = ds.headingLevel || 'h4';
      const radius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      // Remediation Sprint 1, Phase 2: migrated onto Architecture A.
      const textColor = archATextColor(ds);
      const indicatorStyle = ds.indicatorStyle || 'dots';
      const swipe = settings.enableSwipe !== false;
      // Builder-only: prefer the persisted current step (see
      // lumioProcessGoto) so re-renders don't jump back to step 0.
      const persistedStep = editable ? BuilderUI.openItemState[block.id] : undefined;
      const currentStep = (typeof persistedStep === 'number' && persistedStep < items.length) ? persistedStep : 0;
      return `<div class="lumio-process" data-current="${currentStep}" data-swipe="${swipe ? '1' : '0'}" tabindex="0" style="${interactiveSpacingStyle(ds)}"
          onkeydown="if(event.key==='ArrowLeft')lumioProcessNav(this,-1); if(event.key==='ArrowRight')lumioProcessNav(this,1);"
          ontouchstart="lumioProcessTouchStart(event,this)" ontouchend="lumioProcessTouchEnd(event,this)">
        <div class="lumio-process-panel" style="${quoteCardBgStyle(ds)} color:${textColor}; border-radius:${radius}; border:${interactiveBorderStyle(ds)};">
          ${items.map((item, i) => `<div class="lumio-process-step ${i === currentStep ? 'active' : ''}" data-step="${i}">
            ${itemImageHtml(item, 200)}
            ${showNumbers ? `<div class="lumio-process-stepnum">Step ${i + 1}</div>` : ''}
            <${headingTag} class="editable-text" data-role="title" data-field="itemTitle" data-list="items" data-iindex="${i}" data-richtext="true" ${ce} data-placeholder="Step ${i + 1}" style="margin:4px 0 6px;">${richTextOut(item.title || (editable ? '' : 'Step ' + (i + 1)))}</${headingTag}>
            <div class="editable-text text-sm" data-role="body" data-field="itemBody" data-list="items" data-iindex="${i}" data-richtext="true" ${ce} data-placeholder="Step description...">${richTextOut(item.body || '')}</div>
            ${itemMediaExtrasHtml(item)}
          </div>`).join('')}
        </div>
        <div class="lumio-process-nav flex items-center justify-between mt-12">
          <button class="btn btn-secondary btn-sm lumio-process-prev" ${items.length <= 1 ? 'disabled' : ''} onclick="event.stopPropagation(); lumioProcessNav(this.closest('.lumio-process'), -1)" disabled>← Back</button>
          <div class="lumio-process-indicators flex items-center gap-6" data-style="${indicatorStyle}">
            ${items.map((item, i) => `<span class="lumio-process-dot ${i === 0 ? 'active' : ''}" data-step="${i}" onclick="event.stopPropagation(); lumioProcessGoto(this.closest('.lumio-process'), ${i})">${indicatorStyle === 'numbers' ? (i + 1) : ''}</span>`).join('')}
          </div>
          <button class="btn btn-secondary btn-sm lumio-process-next" ${items.length <= 1 ? 'disabled' : ''} onclick="event.stopPropagation(); lumioProcessNav(this.closest('.lumio-process'), 1)">Next →</button>
        </div>
      </div>`;
    }
    case 'scenario': {
      const scenes = normalizeItemList(d, 'scenes', () => [
        {
          title: 'Scene 1', dialogue: 'A customer calls upset about a delayed shipment. How do you respond?',
          characterName: '', backgroundImage: null, backgroundVideo: null, backgroundAudio: null, characterImage: null,
          choices: [
            { text: 'Apologize and offer a solution', feedback: 'Great choice — this de-escalates the situation.', nextScene: 1, correctPath: true },
            { text: 'Explain that it is not your department', feedback: 'This may frustrate the customer further. Try again.', nextScene: 0, correctPath: false },
          ],
        },
        { title: 'Scene 2', dialogue: 'The customer feels heard and asks what happens next.', characterName: '', backgroundImage: null, backgroundVideo: null, backgroundAudio: null, characterImage: null, choices: [] },
      ]);
      const settings = block.settings || {};
      const radius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      const overlay = ds.overlayOpacity ?? 40;
      const charPlacement = ds.characterPlacement || 'left';
      const bg = surfaceBg(Object.assign({}, ds, { bgStyle: ds.bgStyle || 'theme' }));
      const dialogueStyle = ds.dialoguePanelStyle || 'card';
      const completionMessage = settings.completionMessage || 'Scenario complete!';
      return `<div class="lumio-scenario" data-scoring="${settings.enableScoring ? '1' : '0'}" data-completion="${escapeHtml(completionMessage)}" data-correct="0" data-total="0" data-current="0" style="border-radius:${radius}; overflow:hidden; border:${interactiveBorderStyle(ds)}; ${interactiveSpacingStyle(ds)}">
        ${scenes.map((scene, i) => `<div class="lumio-scenario-scene ${i === 0 ? 'active' : ''}" data-scene="${i}">
          <div class="lumio-scenario-bg" style="${scene.backgroundImage ? `background-image:url('${AssetStore.resolveMediaSrc(scene.backgroundImage)}'); background-size:cover; background-position:center;` : `background:${bg};`}">
            ${scene.backgroundVideo ? `<video class="lumio-scenario-bgvideo" autoplay muted loop playsinline src="${AssetStore.resolveMediaSrc(scene.backgroundVideo)}"></video>` : ''}
            <div class="lumio-scenario-overlay" style="background:rgba(0,0,0,${overlay / 100});"></div>
            ${scene.characterImage && charPlacement !== 'none' ? `<img class="lumio-scenario-character pos-${charPlacement}" src="${AssetStore.resolveMediaSrc(scene.characterImage)}" alt="${escapeHtml(scene.characterName || '')}" />` : ''}
            <div class="lumio-scenario-content">
              ${scene.backgroundAudio ? `<div class="media-frame" style="margin-bottom:8px;"><audio class="block-audio-el" controls style="width:100%; display:block;" src="${AssetStore.resolveMediaSrc(scene.backgroundAudio)}"></audio></div>` : ''}
              <div class="lumio-scenario-dialogue" data-style="${dialogueStyle}">
                ${scene.characterName ? `<div class="lumio-scenario-character-name">${escapeHtml(scene.characterName)}</div>` : ''}
                <div class="editable-text lumio-scenario-dialogue-text" data-role="body" data-field="sceneDialogue" data-list="scenes" data-iindex="${i}" data-richtext="true" ${ce} data-placeholder="Dialogue text...">${richTextOut(scene.dialogue || '')}</div>
                ${(scene.choices && scene.choices.length) ? `
                  <div class="lumio-scenario-choices">
                    ${scene.choices.map((c) => `<button class="lumio-scenario-choice" data-feedback="${escapeHtml(c.feedback || '')}" data-next="${c.nextScene ?? ''}" data-correct="${c.correctPath ? '1' : '0'}" onclick="event.stopPropagation(); lumioScenarioChoice(this)">${escapeHtml(c.text || '')}</button>`).join('')}
                  </div>
                  <div class="lumio-scenario-feedback" style="display:none;"></div>` : `
                  <div class="lumio-scenario-feedback" style="display:block;"><p class="lumio-scenario-final-msg">${escapeHtml(completionMessage)}</p></div>`}
              </div>
            </div>
          </div>
        </div>`).join('')}
      </div>`;
    }
    case 'flashcard_grid': {
      const items = normalizeFlashcardItems(d);
      const flipHint = ds.flipHint !== false;
      const sizeMap = { sm: 140, md: 180, lg: 220 };
      const cardH = sizeMap[ds.cardSize] || sizeMap.md;
      const cols = ds.cardSize === 'lg' ? 2 : 3;
      const radius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
      // Sprint 3E, Phase 1 root cause: the existing outer Background swatch
      // control (ds.bg) and Alignment control (ds.align) were never read
      // by this renderer at all — ds.align is now consumed (justify-content
      // below); ds.bg is applied to the back face (the front face keeps its
      // deliberate themed gradient + white text, which a light pastel
      // background would make unreadable — back face has no such
      // constraint, so it's the correct place for a user-chosen background
      // to actually show up). flashcardSpacingStyle mirrors the
      // divider-family Top/Bottom Padding pattern.
      const backBg = (ds.bg && ds.bg !== 'transparent') ? ds.bg : 'var(--surface-0)';
      const borderStyle = ds.cardBorder === true ? `1px solid ${ds.cardBorderColor || 'var(--border)'}` : 'none';
      return `<div style="${flashcardSpacingStyle(ds)} display:flex; justify-content:${justifyMap[ds.align] || 'flex-start'};">
        <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:12px; width:100%;">
          ${items.map((item, i) => `
            <div>
              <div class="flip-card" onclick="if(!event.target.closest('.editable-text[contenteditable=true]')){ event.stopPropagation(); this.classList.toggle('flipped'); lumioRecordProgress(this, 'flipped', ${i}); }" style="height:${cardH}px; cursor:pointer;">
                <div class="flip-card-inner">
                  <div class="flip-card-face flip-card-front" style="background:var(--gradient-primary); color:#fff; border-radius:${radius}; border:${borderStyle};">
                    ${flashcardFaceContent(item.front, i, 'front', ce, editable)}
                  </div>
                  <div class="flip-card-face flip-card-back" style="background:${backBg}; border-radius:${radius}; border:${borderStyle};">
                    ${flashcardFaceContent(item.back, i, 'back', ce, editable)}
                  </div>
                </div>
              </div>
              ${flipHint ? `<div class="text-sm text-muted text-center mt-4">↻ Click to flip</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
    }
    case 'flashcard_stack': {
      const items = normalizeFlashcardItems(d);
      const flipHint = ds.flipHint !== false;
      const radius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
      const backBg = (ds.bg && ds.bg !== 'transparent') ? ds.bg : 'var(--surface-0)';
      const borderStyle = ds.cardBorder === true ? `1px solid ${ds.cardBorderColor || 'var(--border)'}` : 'none';
      return `<div style="${flashcardSpacingStyle(ds)} display:flex; justify-content:${justifyMap[ds.align] || 'flex-start'};">
        <div class="flashcard-stack-wrap" tabindex="0" style="outline:none; width:min(480px, 100%);" onkeydown="if(event.key==='ArrowLeft')lumioFcsNav(this.querySelector('.fcs-prev'),-1); if(event.key==='ArrowRight')lumioFcsNav(this.querySelector('.fcs-next'),1);">
          ${items.map((item, i) => `
            <div class="fcs-card" data-findex="${i}" style="display:${i===0?'flex':'none'}; flex-direction:column;">
              <div class="flip-card" onclick="if(!event.target.closest('.editable-text[contenteditable=true]')){ event.stopPropagation(); this.classList.toggle('flipped'); lumioRecordProgress(this, 'flipped', ${i}); }" style="height:220px; cursor:pointer;">
                <div class="flip-card-inner">
                  <div class="flip-card-face flip-card-front" style="background:var(--gradient-primary); color:#fff; border-radius:${radius}; border:${borderStyle};">
                    ${flashcardFaceContent(item.front, i, 'front', ce, editable)}
                  </div>
                  <div class="flip-card-face flip-card-back" style="background:${backBg}; border-radius:${radius}; border:${borderStyle};">
                    ${flashcardFaceContent(item.back, i, 'back', ce, editable)}
                  </div>
                </div>
              </div>
              ${flipHint ? `<div class="text-sm text-muted text-center mt-4">↻ Click to flip</div>` : ''}
            </div>
          `).join('')}
          <div class="flex items-center justify-between mt-12">
            <button class="btn btn-secondary btn-sm fcs-prev" onclick="event.stopPropagation(); lumioFcsNav(this,-1)">← Prev</button>
            <span class="text-sm text-muted fcs-progress">1 / ${items.length}</span>
            <button class="btn btn-secondary btn-sm fcs-next" onclick="event.stopPropagation(); lumioFcsNav(this,1)">Next →</button>
          </div>
        </div>
      </div>`;
    }
    case 'button': {
      const align = ds.align || 'center';
      const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
      const sizeMap = { sm: { pad: '8px 18px', font: '13px' }, md: { pad: '12px 24px', font: '14px' }, lg: { pad: '16px 32px', font: '16px' } };
      const sz = sizeMap[ds.btnSize] || sizeMap.md;
      const radius = RADIUS_MAP[ds.radius] || 'var(--r-lg)';
      const colorPreset = ds.colorPreset || 'theme';
      const bg = colorPreset === 'custom' ? (ds.btnBgColor || '#7C3AED') : 'var(--gradient-primary)';
      const textColor = colorPreset === 'custom' ? (ds.btnTextColor || '#ffffff') : '#ffffff';
      const shadow = (editable && ds.shadow !== false) ? 'box-shadow:var(--elevation-1);' : '';
      const widthStyle = ds.btnWidth === 'full' ? 'width:100%;' : '';
      const label = escapeHtml(d.label || 'Button');
      const icon = d.icon ? `${escapeHtml(d.icon)} ` : '';
      const btnStyle = `padding:${sz.pad}; font-size:${sz.font}; border-radius:${radius}; ${widthStyle} background:${bg}; color:${textColor}; ${shadow} border:${interactiveBorderStyle(ds)}; font-weight:600; text-decoration:none; cursor:pointer;`;
      let inner;
      if (editable) {
        inner = `<span class="lumio-cta-btn" style="${btnStyle} pointer-events:none;">${icon}${label}</span>`;
      } else if (d.destType === 'file' && d.file) {
        inner = `<a href="${d.file}" download="${escapeHtml(d.fileFileName || 'download')}" class="lumio-cta-btn" style="${btnStyle}">${icon}${label}</a>`;
      } else if (d.destType === 'anchor') {
        inner = `<a href="#" class="lumio-cta-btn" style="${btnStyle}" onclick="document.querySelector('.canvas-block[data-index=\\"${d.anchorIndex || 0}\\"], [data-lp-index=\\"${d.anchorIndex || 0}\\"]')?.scrollIntoView({behavior:'smooth'}); return false;">${icon}${label}</a>`;
      } else if (d.destType === 'nextLesson') {
        inner = `<a href="#" class="lumio-cta-btn" style="${btnStyle}" onclick="document.getElementById('lp-next')?.click(); return false;">${icon}${label}</a>`;
      } else if (d.url) {
        inner = `<a href="${escapeHtml(d.url)}" class="lumio-cta-btn" style="${btnStyle}" ${d.newTab ? 'target="_blank" rel="noopener"' : ''}>${icon}${label}</a>`;
      } else {
        inner = `<span class="lumio-cta-btn" style="${btnStyle} opacity:0.7;">${icon}${label}</span>`;
      }
      return `<div style="${interactiveSpacingStyle(ds)} display:flex; justify-content:${justifyMap[align] || 'center'};">${inner}</div>`;
    }

    case 'chart_bar':
      return renderBarChart(block, editable);
    case 'chart_line':
      return renderLineChart(block, editable);
    case 'chart_pie':
      return renderPieChart(block, editable);

    case 'continue': {
      const btnStyle = continueButtonStyle(ds);
      const align = ds.align || 'center';
      const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
      return `<div style="${continueWrapperStyle(ds)} display:flex; justify-content:${justifyMap[align] || 'center'};">
        <button class="btn lumio-continue-btn" style="${btnStyle}"><span class="editable-text" data-field="label" data-richtext="true" ${ce} data-placeholder="Continue" style="display:inline-block;">${richTextOut(d.label || 'Continue')}</span> ▾</button>
      </div>`;
    }
    case 'numbered_divider': {
      const shapeRadiusMap = { circle: '50%', square: '4px', rounded: '10px' };
      const markerSize = ds.markerSize ?? 32;
      const fontSize = ds.fontSize ?? 14;
      const lineColor = ds.lineColor || 'var(--border)';
      const lineStyle = ds.lineStyle || 'solid';
      const lineThickness = ds.lineThickness ?? 1;
      return `<div class="flex items-center gap-12" style="${dividerSpacingStyle(ds)}">
        <div style="width:${markerSize}px; height:${markerSize}px; min-width:${markerSize}px; border-radius:${shapeRadiusMap[ds.markerShape] || '50%'}; background:${ds.markerFill || 'var(--gradient-primary)'}; color:${ds.markerTextColor || '#fff'}; border:${ds.markerBorderColor ? `2px solid ${ds.markerBorderColor}` : 'none'}; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:${fontSize}px; flex-shrink:0; overflow:hidden;">
          <span class="editable-text" data-field="marker" data-richtext="true" ${ce} data-placeholder="1" style="text-align:center; line-height:1.1;">${richTextOut(d.marker || '1')}</span>
        </div>
        <div style="flex:1; height:${lineThickness}px; background:${lineStyle === 'none' ? 'transparent' : lineColor}; border-top:${lineStyle !== 'solid' && lineStyle !== 'none' ? `${lineThickness}px ${lineStyle} ${lineColor}` : 'none'}; ${lineStyle !== 'solid' && lineStyle !== 'none' ? 'background:transparent; height:0;' : ''}"></div>
      </div>`;
    }
    case 'line_divider': {
      const lineColor = ds.lineColor || 'var(--border)';
      const thickness = ds.thickness ?? 1;
      const style = ds.lineStyle || 'solid';
      const width = ds.width ?? 100;
      const alignMap = { left: 'flex-start', center: 'center', right: 'flex-end', full: 'stretch' };
      const isFull = (ds.align || 'full') === 'full';
      return `<div style="${dividerSpacingStyle(ds)} display:flex; justify-content:${alignMap[ds.align || 'full'] || 'center'};">
        <div style="width:${isFull ? '100%' : width + '%'}; ${style === 'solid' ? `height:${thickness}px; background:${lineColor};` : `height:0; border-top:${thickness}px ${style} ${lineColor};`}"></div>
      </div>`;
    }
    case 'spacer': {
      const heightMap = { xs: 16, sm: 32, md: 64, lg: 120, xl: 200 };
      const preset = ds.heightPreset || 'md';
      const h = preset === 'custom' ? (ds.customHeight ?? 64) : (heightMap[preset] ?? 64);
      return `<div style="${dividerSpacingStyle(ds)} height:${h}px; width:100%; ${editable ? 'background:repeating-linear-gradient(45deg, var(--surface-50), var(--surface-50) 10px, transparent 10px, transparent 20px); border-radius:var(--r-sm);' : ''}"></div>`;
    }

    case 'kc_multiple_choice':
      return `<div style="${interactiveSpacingStyle(ds)} border:${interactiveBorderStyle(ds)}; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'};">${knowledgeCheckMC(d, editable)}</div>`;
    case 'kc_multiple_response':
      return `<div style="${interactiveSpacingStyle(ds)} border:${interactiveBorderStyle(ds)}; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'};">${knowledgeCheckMR(d, editable)}</div>`;
    case 'kc_matching':
      return `<div style="${interactiveSpacingStyle(ds)} border:${interactiveBorderStyle(ds)}; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'};">${knowledgeCheckMatching(d, editable)}</div>`;
    case 'kc_fill_gap':
      return `<div style="${interactiveSpacingStyle(ds)} border:${interactiveBorderStyle(ds)}; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'};">${knowledgeCheckFillGap(d, editable)}</div>`;
    case 'kc_ordering':
      return `<div style="${interactiveSpacingStyle(ds)} border:${interactiveBorderStyle(ds)}; border-radius:${RADIUS_MAP[ds.radius] || 'var(--r-lg)'};">${knowledgeCheckOrdering(d, editable)}</div>`;

    default:
      return `<div class="text-center" style="padding:24px; color:var(--ink-400);">
        <div style="font-size:24px;">${blockIconFor(block.type)}</div>
        <p class="text-sm mt-8">${blockLabel(block.type)} block — configure in the panel on the right.</p>
      </div>`;
  }
}

function blockIconFor(type) {
  const all = LumioData.blockLibrary.flatMap(c => c.blocks);
  const found = all.find(b => b.id === type);
  return found ? found.icon : '◻';
}

function imagePlaceholder(label, height, width) {
  return `<div style="background:linear-gradient(135deg, var(--pastel-lavender), var(--pastel-cyan)); border-radius:var(--r-md); height:${height}px; ${width?`width:${width}px; flex-shrink:0;`:''} display:flex; align-items:center; justify-content:center; flex-direction:column; gap:6px; color:var(--ink-400); border:1px dashed var(--border);">
    <span style="font-size:24px;">🖼️</span><span class="text-sm">${label}</span>
  </div>`;
}

/* Classifies a video URL as a YouTube/Vimeo embed or a direct/MP4 source.
   Returns { type: 'youtube'|'vimeo'|'mp4', embedUrl }. */
function parseVideoEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { type: 'youtube', embedUrl: `https://www.youtube.com/embed/${yt[1]}`, id: yt[1], watchUrl: `https://www.youtube.com/watch?v=${yt[1]}`, thumbnailUrl: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { type: 'vimeo', embedUrl: `https://player.vimeo.com/video/${vimeo[1]}`, id: vimeo[1], watchUrl: `https://vimeo.com/${vimeo[1]}`, thumbnailUrl: null };
  return { type: 'mp4', embedUrl: url };
}

// Video Embed Reliability fix: a professional fallback shown either when the
// author explicitly picks "Linked Video" delivery, or at runtime when a
// YouTube embed reports embedding-disabled (see bindVideoEmbedFallbacks in
// learnerPreview.js) — replaces the bare "Video unavailable" text that made
// a perfectly fine course look broken.
function videoEmbedFallbackCard(embed, d) {
  const title = escapeHtml(d.caption || 'Video');
  const thumb = embed.thumbnailUrl
    ? `<div style="width:100%; aspect-ratio:16/9; background:#000 url('${embed.thumbnailUrl}') center/cover; border-radius:var(--r-lg) var(--r-lg) 0 0; position:relative;"><span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:48px; color:#fff; opacity:0.9; text-shadow:0 2px 8px rgba(0,0,0,0.5);">▶</span></div>`
    : `<div style="width:100%; aspect-ratio:16/9; background:var(--ink-900); border-radius:var(--r-lg) var(--r-lg) 0 0; display:flex; align-items:center; justify-content:center; font-size:48px;">🎬</div>`;
  return `<div class="card" style="overflow:hidden; max-width:560px; margin:0 auto;">
    ${thumb}
    <div style="padding:16px; text-align:center;">
      <div style="font-weight:600; margin-bottom:10px;">${title}</div>
      <a href="${embed.watchUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">▶ Watch Video</a>
    </div>
  </div>`;
}

/* Converts SRT subtitle text to WebVTT (passes WebVTT text through unchanged). */
function srtToVtt(text) {
  const trimmed = (text || '').replace(/\r+/g, '').trim();
  if (/^WEBVTT/i.test(trimmed)) return trimmed;
  return `WEBVTT\n\n${trimmed.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
}

/* Encodes subtitle/transcript text (VTT or SRT) as a data: URL for a <track> element. */
function subtitlesToVttDataUrl(text) {
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(srtToVtt(text))}`;
}

/* Playback-speed selector — sets .playbackRate on the sibling <video>/<audio> element. */
function playbackSpeedSelector(elClass) {
  return `<div class="flex items-center gap-8 mt-8">
    <span class="text-sm text-muted">Speed</span>
    <select class="input" style="width:auto; padding:4px 8px; font-size:13px;" onchange="this.closest('.media-frame').querySelector('.${elClass}').playbackRate=parseFloat(this.value)">
      <option value="0.75">0.75x</option>
      <option value="1" selected>1x</option>
      <option value="1.25">1.25x</option>
      <option value="1.5">1.5x</option>
      <option value="2">2x</option>
    </select>
  </div>`;
}

/* ============================================================
   CHARTS — Bar, Line, Pie. Shared data model: block.data = {
   title, xLabel, yLabel, items:[{label,value,color}] }. Design
   (block.design) covers color mode, background style/image,
   heading level, padding, and per-type extras (line style,
   thickness, points; pie segment colors). Settings
   (block.settings) covers grid lines, values, axis labels,
   legend, percentages/labels (pie) and animation.
   ============================================================ */

const CHART_PALETTE = ['#7C3AED', '#06B6D4', '#F97316', '#14B8A6', '#EC4899', '#84CC16', '#6366F1', '#F43F5E'];
const CHART_BG_MAP = {
  light: 'var(--surface-0)',
  gray: 'var(--surface-50)',
  theme: 'var(--pastel-lavender)',
  tint: 'var(--pastel-cyan)',
  dark: '#1F1B3A',
  black: '#000000',
};

/* Ensures block.data.items exists with { label, value, color } objects, seeding
   sensible sample data for a freshly-added chart. Mutates and returns the array. */
function normalizeChartItems(d, kind) {
  if (!d.items || !d.items.length) {
    d.items = kind === 'pie'
      ? [{ label: 'Engineering', value: 40, color: '' }, { label: 'Sales', value: 30, color: '' }, { label: 'Support', value: 30, color: '' }]
      : [{ label: 'Mon', value: 60 }, { label: 'Tue', value: 90 }, { label: 'Wed', value: 40 }, { label: 'Thu', value: 75 }, { label: 'Fri', value: 55 }];
  } else {
    d.items = d.items.map(it => ({ label: (it && it.label) || '', value: Number(it && it.value) || 0, color: (it && it.color) || '' }));
  }
  return d.items;
}

function formatChartValue(v) {
  v = Number(v) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/* Resolves the single-series accent colour for Bar/Line charts (Theme vs Custom Color). */
function chartAccentColor(ds) {
  return (ds.colorMode === 'custom' && ds.customColor) ? ds.customColor : '#7C3AED';
}

/* Resolves a Pie segment's colour: per-segment override > custom palette (tinted) > theme palette. */
function chartPieColor(ds, item, i) {
  if (item.color) return item.color;
  if (ds.colorMode === 'custom' && ds.customColor) {
    return `color-mix(in srgb, ${ds.customColor} ${Math.max(25, 100 - i * 16)}%, white)`;
  }
  return CHART_PALETTE[i % CHART_PALETTE.length];
}

function chartTitleHtml(d, ds, editable) {
  const tag = ['h3', 'h4', 'h5'].includes(ds.headingLevel) ? ds.headingLevel : 'h4';
  const sizeMap = { h3: '20px', h4: '16px', h5: '14px' };
  if (!editable) {
    if (!d.title) return '';
    return `<${tag} class="lumio-chart-title" style="font-size:${sizeMap[tag]};">${richTextOut(d.title)}</${tag}>`;
  }
  return `<${tag} class="lumio-chart-title editable-text" data-field="title" data-richtext="true" contenteditable="true" data-placeholder="Chart title" style="font-size:${sizeMap[tag]};">${richTextOut(d.title || '')}</${tag}>`;
}

/* Outer wrapper style for all 3 chart types: Background Style preset (incl.
   Image Background) + Padding, shared across Bar/Line/Pie Design tabs. */
function chartWrapperStyle(ds) {
  const dark = ds.bgStyle === 'dark' || ds.bgStyle === 'black';
  let style = `padding:${ds.padding ?? 20}px; border-radius:var(--theme-radius, var(--r-lg)); color:${dark ? '#ffffff' : 'var(--ink-900)'}; box-sizing:border-box;`;
  if (ds.bgStyle === 'image' && ds.bgImage) {
    style += `background-image:url('${ds.bgImage}'); background-size:cover; background-position:center;`;
  } else {
    style += `background:${CHART_BG_MAP[ds.bgStyle] || 'var(--surface-0)'};`;
  }
  return style;
}

/* Smoothed line path (Catmull-Rom -> cubic Bézier) for the Line chart's "Smoothed Line" option. */
function catmullRomPath(pts) {
  if (pts.length < 2) return '';
  let path = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return path;
}

function renderBarChart(block, editable) {
  const d = block.data || (block.data = {});
  const ds = block.design || {};
  const s = block.settings || {};
  const items = normalizeChartItems(d, 'bar');
  const showGrid = s.showGridLines !== false;
  const showValues = s.showValues !== false;
  const showAxis = s.showAxisLabels !== false;
  const showLegend = !!s.showLegend;
  const animate = s.animation !== false;
  const accent = chartAccentColor(ds);
  const max = Math.max(...items.map(it => Number(it.value) || 0), 1);
  const niceMax = max * 1.15;
  const W = 600, H = 260;
  const padL = showAxis && d.yLabel ? 44 : 28;
  const padB = showAxis ? 34 : 14;
  const padT = showValues ? 26 : 12;
  const padR = 12;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = items.length;
  const slot = plotW / n;
  const barW = Math.max(slot * 0.5, 6);
  const gridLines = showGrid ? [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = padT + plotH * (1 - f);
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="${f === 0 ? '0' : '4 4'}"/>`;
  }).join('') : '';
  const bars = items.map((it, i) => {
    const v = Number(it.value) || 0;
    const bh = Math.max(plotH * (v / niceMax), 1);
    const x = padL + i * slot + (slot - barW) / 2;
    const y = padT + plotH - bh;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${accent}" class="lumio-chart-bar ${animate ? 'animate' : ''}" style="${animate ? `animation-delay:${(i * 0.05).toFixed(2)}s;` : ''}"/>
      ${showValues ? `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="currentColor">${formatChartValue(v)}</text>` : ''}`;
  }).join('');
  const xLabels = showAxis ? items.map((it, i) => {
    const x = padL + i * slot + slot / 2;
    return `<text x="${x}" y="${H - 12}" text-anchor="middle" font-size="11" fill="currentColor">${escapeHtml(it.label || '')}</text>`;
  }).join('') : '';
  const yAxisLabel = showAxis && d.yLabel ? `<text x="14" y="${padT + plotH / 2}" text-anchor="middle" font-size="11" fill="currentColor" transform="rotate(-90 14 ${padT + plotH / 2})">${escapeHtml(d.yLabel)}</text>` : '';
  const xAxisLabel = showAxis && d.xLabel ? `<div class="lumio-chart-axis-label">${escapeHtml(d.xLabel)}</div>` : '';
  const legend = showLegend ? `<div class="lumio-chart-legend mt-12"><div class="lumio-chart-legend-item"><span class="lumio-chart-legend-swatch" style="background:${accent}; border-radius:3px;"></span>${escapeHtml(d.title || 'Series 1')}</div></div>` : '';
  return `<div class="lumio-chart-wrap" style="${chartWrapperStyle(ds)}">
    ${chartTitleHtml(d, ds, editable)}
    <svg class="lumio-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${gridLines}${bars}${xLabels}${yAxisLabel}
    </svg>
    ${xAxisLabel}${legend}
  </div>`;
}

function renderLineChart(block, editable) {
  const d = block.data || (block.data = {});
  const ds = block.design || {};
  const s = block.settings || {};
  const items = normalizeChartItems(d, 'line');
  const showGrid = s.showGridLines !== false;
  const showValues = s.showValues !== false;
  const showAxis = s.showAxisLabels !== false;
  const showLegend = !!s.showLegend;
  const animate = s.animation !== false;
  const lineColor = ds.lineColor || chartAccentColor(ds);
  const thickness = ds.lineThickness || 3;
  const smooth = ds.lineStyle === 'smooth';
  const showPoints = ds.showPoints !== false;
  const max = Math.max(...items.map(it => Number(it.value) || 0), 1);
  const niceMax = max * 1.15;
  const W = 600, H = 260;
  const padL = showAxis && d.yLabel ? 44 : 28;
  const padB = showAxis ? 34 : 14;
  const padT = showValues ? 26 : 12;
  const padR = 16;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = items.length;
  const pts = items.map((it, i) => ({
    x: n > 1 ? padL + (i / (n - 1)) * plotW : padL + plotW / 2,
    y: padT + plotH * (1 - (Number(it.value) || 0) / niceMax),
    v: Number(it.value) || 0,
    label: it.label,
  }));
  const gridLines = showGrid ? [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = padT + plotH * (1 - f);
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="${f === 0 ? '0' : '4 4'}"/>`;
  }).join('') : '';
  const path = (smooth && pts.length > 2) ? catmullRomPath(pts) : ('M' + pts.map(p => `${p.x},${p.y}`).join(' L '));
  const lineEl = `<path d="${path}" fill="none" stroke="${lineColor}" stroke-width="${thickness}" stroke-linecap="round" stroke-linejoin="round" class="lumio-chart-line ${animate ? 'animate' : ''}" style="${animate ? '--lumio-line-length:1400; stroke-dasharray:1400;' : ''}"/>`;
  const points = showPoints ? pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${lineColor}" stroke="var(--surface-0)" stroke-width="1.5" class="lumio-chart-point ${animate ? 'animate' : ''}"/>`).join('') : '';
  const values = showValues ? pts.map(p => `<text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="11" fill="currentColor">${formatChartValue(p.v)}</text>`).join('') : '';
  const xLabels = showAxis ? pts.map(p => `<text x="${p.x}" y="${H - 12}" text-anchor="middle" font-size="11" fill="currentColor">${escapeHtml(p.label || '')}</text>`).join('') : '';
  const yAxisLabel = showAxis && d.yLabel ? `<text x="14" y="${padT + plotH / 2}" text-anchor="middle" font-size="11" fill="currentColor" transform="rotate(-90 14 ${padT + plotH / 2})">${escapeHtml(d.yLabel)}</text>` : '';
  const xAxisLabel = showAxis && d.xLabel ? `<div class="lumio-chart-axis-label">${escapeHtml(d.xLabel)}</div>` : '';
  const legend = showLegend ? `<div class="lumio-chart-legend mt-12"><div class="lumio-chart-legend-item"><span class="lumio-chart-legend-swatch" style="background:${lineColor}; border-radius:2px; width:14px; height:4px;"></span>${escapeHtml(d.title || 'Series 1')}</div></div>` : '';
  return `<div class="lumio-chart-wrap" style="${chartWrapperStyle(ds)}">
    ${chartTitleHtml(d, ds, editable)}
    <svg class="lumio-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${gridLines}${lineEl}${points}${values}${xLabels}${yAxisLabel}
    </svg>
    ${xAxisLabel}${legend}
  </div>`;
}

function renderPieChart(block, editable) {
  const d = block.data || (block.data = {});
  const ds = block.design || {};
  const s = block.settings || {};
  const items = normalizeChartItems(d, 'pie');
  const showLegend = s.showLegend !== false;
  const showValues = !!s.showValues;
  const showPercentages = s.showPercentages !== false;
  const showLabels = s.showLabels !== false;
  const animate = s.animation !== false;
  const total = items.reduce((sum, it) => sum + (Number(it.value) || 0), 0) || 1;
  const colors = items.map((it, i) => chartPieColor(ds, it, i));
  let acc = 0;
  const gradient = items.map((it, i) => {
    const start = acc / total * 360;
    acc += Number(it.value) || 0;
    const end = acc / total * 360;
    return `${colors[i]} ${start}deg ${end}deg`;
  }).join(', ');
  const legendItems = items.map((it, i) => {
    const pct = Math.round((Number(it.value) || 0) / total * 100);
    const bits = [];
    if (showLabels) bits.push(escapeHtml(it.label || ''));
    if (showPercentages) bits.push(`${pct}%`);
    if (showValues) bits.push(formatChartValue(it.value));
    return `<div class="lumio-chart-legend-item"><span class="lumio-chart-legend-swatch" style="background:${colors[i]};"></span>${bits.join(' — ') || '&nbsp;'}</div>`;
  }).join('');
  return `<div class="lumio-chart-wrap" style="${chartWrapperStyle(ds)}">
    ${chartTitleHtml(d, ds, editable)}
    <div class="lumio-chart-pie-row">
      <div class="lumio-chart-pie-circle lumio-chart-pie ${animate ? 'animate' : ''}" style="background:conic-gradient(${gradient});"></div>
      ${showLegend ? `<div class="lumio-chart-legend">${legendItems}</div>` : ''}
    </div>
  </div>`;
}

function knowledgeCheckMC(d, editable) {
  const options = normalizeKcOptions(d);
  const ce = editable ? 'contenteditable="true"' : '';
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Multiple Choice</div>
    <div class="editable-text" data-field="kcQuestion" data-richtext="true" ${ce}
      data-placeholder="Enter your question…"
      style="font-weight:600; font-size:14px; min-height:1.4em; outline:none;"
    >${richTextOut(d.question || '')}</div>
    <div class="flex-col gap-6 mt-12">
      ${options.map((o, i) => `
        <div class="flex items-center gap-8 text-sm" style="padding:10px 12px; border:1px solid var(--border); border-radius:var(--r-md);">
          <span style="width:14px; height:14px; border-radius:50%; border:1.5px solid var(--ink-300); flex-shrink:0; display:inline-block;"></span>
          <span class="editable-text" data-field="kcOption" data-col="${i}" ${ce}
            data-placeholder="Option…" style="flex:1; outline:none;"
          >${richTextOut(o || '')}</span>
        </div>
      `).join('')}
    </div>
    ${editable ? '<p class="text-xs text-muted mt-8">Mark the correct answer in the Content panel →</p>' : ''}
  `;
}

function knowledgeCheckMR(d, editable) {
  const options = normalizeKcOptions(d);
  const ce = editable ? 'contenteditable="true"' : '';
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Select all that apply</div>
    <div class="editable-text" data-field="kcQuestion" data-richtext="true" ${ce}
      data-placeholder="Enter your question…"
      style="font-weight:600; font-size:14px; min-height:1.4em; outline:none;"
    >${richTextOut(d.question || '')}</div>
    <div class="flex-col gap-6 mt-12">
      ${options.map((o, i) => `
        <div class="flex items-center gap-8 text-sm" style="padding:10px 12px; border:1px solid var(--border); border-radius:var(--r-md);">
          <span style="width:14px; height:14px; border-radius:3px; border:1.5px solid var(--ink-300); flex-shrink:0; display:inline-block;"></span>
          <span class="editable-text" data-field="kcOption" data-col="${i}" ${ce}
            data-placeholder="Option…" style="flex:1; outline:none;"
          >${richTextOut(o || '')}</span>
        </div>
      `).join('')}
    </div>
    ${editable ? '<p class="text-xs text-muted mt-8">Check correct answers in the Content panel →</p>' : ''}
  `;
}

function knowledgeCheckMatching(d, editable) {
  const left = normalizeKcLeft(d);
  const right = normalizeKcRight(d);
  const ce = editable ? 'contenteditable="true"' : '';
  const rowBase = 'padding:10px 12px; border:1px solid var(--border); border-radius:var(--r-md); font-size:13px; outline:none;';
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Matching</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
      <div class="flex-col gap-6">
        ${left.map((l, i) => `
          <div class="editable-text" data-field="kcPairLeft" data-col="${i}" ${ce}
            data-placeholder="Item…" style="${rowBase}"
          >${richTextOut(l || '')}</div>
        `).join('')}
      </div>
      <div class="flex-col gap-6">
        ${right.map((r, i) => `
          <div class="editable-text" data-field="kcPairRight" data-col="${i}" ${ce}
            data-placeholder="Match…" style="${rowBase} background:var(--pastel-lavender); border-color:transparent;"
          >${richTextOut(r || '')}</div>
        `).join('')}
      </div>
    </div>
    ${editable ? '<p class="text-xs text-muted mt-8">Each left item matches the right item on the same row.</p>' : ''}
  `;
}

function knowledgeCheckFillGap(d, editable) {
  const answers = normalizeKcAnswers(d);
  const ce = editable ? 'contenteditable="true"' : '';
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Fill the Gap</div>
    <div class="editable-text" data-field="kcGapText" data-richtext="true" ${ce}
      data-placeholder="Enter the sentence with ____ marking the gap…"
      style="font-size:15px; line-height:2; min-height:1.4em; outline:none;"
    >${richTextOut(d.text || '')}</div>
    <div class="text-xs text-muted mt-4">Accepted: ${answers.filter(Boolean).map(a => `<strong>${escapeHtml(a)}</strong>`).join(', ') || (editable ? '<em>Add accepted answers in the Content panel →</em>' : '—')}</div>
  `;
}

function knowledgeCheckOrdering(d, editable) {
  const items = normalizeKcItems(d);
  const ce = editable ? 'contenteditable="true"' : '';
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Put in order</div>
    <div class="flex-col gap-6 mt-8">
      ${items.map((item, i) => `
        <div class="flex items-center gap-10 text-sm" style="padding:10px 12px; border:1px solid var(--border); border-radius:var(--r-md);">
          <span class="pill pill-grey" style="flex-shrink:0;">${i + 1}</span>
          <span class="editable-text" data-field="kcItem" data-col="${i}" ${ce}
            data-placeholder="Step…" style="flex:1; outline:none;"
          >${richTextOut(item || '')}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/* ============================================================
   RIGHT PANEL
   ============================================================ */
function renderRightPanel(blocks, course, lesson) {
  if (BuilderUI.rightCollapsed) {
    return `
      <div style="width:48px; flex-shrink:0; border-left:1px solid var(--border); background:var(--surface-0); display:flex; flex-direction:column; align-items:center; padding:12px 0; gap:10px;">
        <button class="btn-icon" id="expand-right" title="Expand panel">«</button>
      </div>
    `;
  }

  const block = BuilderUI.selected !== null ? blocks[BuilderUI.selected] : null;

  if (!block) {
    return `
      <div style="width:300px; flex-shrink:0; border-left:1px solid var(--border); background:var(--surface-0); overflow-y:auto; padding:20px;" id="right-panel-scroll">
        <div class="flex items-center justify-between">
          <h3 style="font-size:14px;">Lesson Insights</h3>
          <button class="btn-icon" id="collapse-right" title="Collapse panel">»</button>
        </div>
        <label class="flex items-center gap-8 text-sm mt-12" style="cursor:pointer;">
          <input type="checkbox" id="toggle-insights" ${BuilderUI.showInsights ? 'checked' : ''}/> Show Lesson Insights
        </label>
        ${BuilderUI.showInsights ? lessonInsights(blocks, course, lesson) : `<p class="text-sm text-muted mt-16">Insights are hidden. Toggle them on anytime.</p>`}
        <div class="prop-section" style="border-top:1px solid var(--border); margin-top:20px; padding-top:16px; border-bottom:none;">
          <div class="prop-section-title">Block Behaviour</div>
          <label class="flex items-center gap-8 text-sm" style="cursor:pointer;">
            <input type="checkbox" id="toggle-multi-expand" ${BuilderUI.allowMultipleExpanded ? 'checked' : ''}/> Allow Multiple Expanded Blocks
          </label>
          <p class="text-sm text-muted mt-8">When off, selecting a block collapses the toolbar on any other block.</p>
        </div>
      </div>
    `;
  }

  return `
    <div style="width:320px; flex-shrink:0; border-left:1px solid var(--border); background:var(--surface-0); overflow-y:auto; display:flex; flex-direction:column;">
      <div class="flex items-center justify-between" style="padding:8px 16px 0;">
        <div class="tabs" style="border-bottom:none;">
          <div class="tab ${BuilderUI.rightTab==='content'?'active':''}" data-rtab="content">Content</div>
          <div class="tab ${BuilderUI.rightTab==='design'?'active':''}" data-rtab="design">Design</div>
          <div class="tab ${BuilderUI.rightTab==='settings'?'active':''}" data-rtab="settings">Settings</div>
        </div>
        <button class="btn-icon" id="collapse-right" title="Collapse panel">»</button>
      </div>
      <div style="padding:18px; flex:1; overflow-y:auto;" id="right-panel-scroll">
        ${renderRightTabContent(block, BuilderUI.selected, course)}
      </div>
    </div>
  `;
}

function lessonInsights(blocks, course, lesson) {
  const variety = new Set(blocks.map(b => blockCategory(b.type))).size;
  const kcCount = blocks.filter(b => b.type.startsWith('kc_')).length;
  const imgCount = blocks.filter(b => ['image','image_text','text_on_image','carousel'].includes(b.type)).length;
  const wordEstimate = blocks.length * 35;
  const obj = lesson && lesson.objectiveIndex !== null && course ? course.objectives[lesson.objectiveIndex] : null;

  return `
    <div class="card card-pad mt-16" style="background:var(--pastel-lavender); border:none;">
      <div class="flex justify-between items-center"><span class="text-sm" style="font-weight:600;">Content Variety</span><span class="text-sm">${variety} types</span></div>
      <div style="height:6px; background:#fff; border-radius:99px; margin-top:8px; overflow:hidden;"><div style="width:${Math.min(variety*20,100)}%; height:100%; background:var(--gradient-primary);"></div></div>
    </div>
    <div class="card card-pad mt-12">
      <div class="flex justify-between items-center text-sm"><span>🎯 Objective</span></div>
      <p class="text-sm mt-8">${obj ? `${obj.verb} ${obj.text}` : 'Not linked to an objective yet'}</p>
      ${!obj ? `<button class="btn btn-secondary btn-sm mt-8 w-full" id="link-objective">Link an objective</button>` : ''}
    </div>
    <div class="card card-pad mt-12">
      <div class="text-sm flex justify-between"><span>📖 Estimated read time</span><span>~${Math.max(1,Math.round(wordEstimate/130))} min</span></div>
      <div class="text-sm flex justify-between mt-8"><span>✅ Knowledge checks</span><span>${kcCount}</span></div>
      <div class="text-sm flex justify-between mt-8"><span>🖼️ Visual blocks</span><span>${imgCount}</span></div>
    </div>
    ${blocks.length > 0 && imgCount === 0 ? `
    <div class="ai-card mt-12">
      <div class="ai-spark">💡</div>
      <div><p class="text-sm">This lesson is text-heavy. Consider adding an Image, Statement, or Knowledge Check to break it up.</p></div>
    </div>` : ''}
    ${kcCount === 0 && blocks.length > 2 ? `
    <div class="ai-card mt-12">
      <div class="ai-spark">✨</div>
      <div><p class="text-sm">No knowledge check yet. <a href="#" id="ai-add-kc">Generate one from this lesson</a>.</p></div>
    </div>` : ''}
  `;
}

function blockCategory(type) {
  for (const cat of LumioData.blockLibrary) {
    if (cat.blocks.find(b => b.id === type)) return cat.category;
  }
  return 'Other';
}

/* ============================================================
   TEXT BLOCK SETTINGS PANEL (Content / Typography / Spacing / Background / Advanced)
   ============================================================ */
function renderTextBlockPanel(block, index) {
  block.design = block.design || {};
  const ds = block.design;
  const d = block.data || {};

  if (BuilderUI.rightTab === 'settings') {
    return `
      <div class="field">
        <label>Block ID</label>
        <input class="input" value="block-${index + 1}" disabled style="opacity:0.6;" />
      </div>
      <p class="text-sm text-muted">No additional settings for this block.</p>
    `;
  }

  if (BuilderUI.rightTab === 'content') {
    if (block.type === 'columns') {
      const count = Math.max(2, Math.min(4, (d.cols || ['', '']).length));
      return `
        <p class="text-sm text-muted">Click directly on a column in the canvas to edit its text.</p>
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Number of Columns</div>
          <div class="seg-control" id="text-colcount">
            ${[2, 3, 4].map(n => `<button data-count="${n}" class="${count === n ? 'active' : ''}">${n}</button>`).join('')}
          </div>
        </div>
      `;
    }
    if (block.type === 'table') {
      const rows = d.rows || DEFAULT_TABLE_ROWS;
      const colCount = rows[0] ? rows[0].length : 0;
      const colWidths = d.colWidths || [];
      return `
        <p class="text-sm text-muted">Click directly on a cell in the canvas to edit its text.</p>
        <div class="prop-section">
          <div class="prop-section-title">Rows &amp; Columns</div>
          <div class="flex gap-8" style="flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="table-row-add">+ Row</button>
            <button class="btn btn-secondary btn-sm" id="table-row-del">– Row</button>
            <button class="btn btn-secondary btn-sm" id="table-col-add">+ Column</button>
            <button class="btn btn-secondary btn-sm" id="table-col-del">– Column</button>
          </div>
        </div>
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Column Width</div>
          <p class="text-xs text-muted mb-8">Percent of table width per column. Leave blank for automatic sizing.</p>
          ${Array.from({length: colCount}, (_, i) => `
            <div class="flex items-center gap-8 mb-8">
              <label class="text-sm" style="width:64px; flex-shrink:0;">Col ${i + 1}</label>
              <input type="number" class="input table-col-width" data-col="${i}" min="5" max="90" placeholder="auto" value="${colWidths[i] || ''}" style="width:80px;" />
              <span class="text-sm text-muted">%</span>
            </div>
          `).join('')}
          ${colWidths.some(w => w) ? `<button class="btn btn-ghost btn-sm" id="table-col-width-reset">Reset to automatic</button>` : ''}
        </div>
      `;
    }
    return `<p class="text-sm text-muted">Click directly on the text in the canvas to edit it.</p>`;
  }

  // DESIGN TAB — Typography / Spacing / Background / Advanced
  const fontSizeDefault = (block.type === 'heading' || block.type === 'heading_paragraph') ? 22 : 15;
  const fontColorOptions = [
    { id: 'theme', label: 'Theme' },
    { id: 'black', label: 'Black' },
    { id: 'white', label: 'White' },
    { id: 'grey', label: 'Grey' },
  ];
  const activeFontColor = (!ds.fontColor || ds.fontColor === 'theme') ? 'theme' : (TEXT_COLOR_MAP[ds.fontColor] ? ds.fontColor : 'custom');

  return `
    <div class="prop-section">
      <div class="prop-section-title">Typography</div>
      <p class="text-sm text-muted mb-8">Text Alignment</p>
      ${segControl('design-align', 'align', [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Center' }, { id: 'right', label: 'Right' }], ds.align || 'left')}
      <p class="text-sm text-muted mb-8 mt-12">Font Size</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="fontSize" min="10" max="48" value="${ds.fontSize || fontSizeDefault}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.fontSize || fontSizeDefault}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Font Colour</p>
      <div class="flex gap-8 items-center">
        ${fontColorOptions.map(o => `<div class="text-color-swatch ${activeFontColor === o.id ? 'selected' : ''}" data-color="${o.id}" title="${o.label}"
          style="width:26px; height:26px; border-radius:6px; cursor:pointer; background:${o.id === 'theme' ? 'var(--gradient-primary)' : o.id === 'white' ? '#fff' : TEXT_COLOR_MAP[o.id]};
          border:${activeFontColor === o.id ? '2px solid var(--indigo)' : '1px solid var(--border)'};"></div>`).join('')}
        <input type="color" class="text-color-custom" title="Custom colour" value="${activeFontColor === 'custom' ? ds.fontColor : '#000000'}"
          style="width:26px; height:26px; padding:0; border:${activeFontColor === 'custom' ? '2px solid var(--indigo)' : '1px solid var(--border)'}; border-radius:6px; cursor:pointer;" />
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Text Formatting</p>
      <div class="flex gap-8">
        <button class="btn-icon text-fmt-btn ${ds.bold ? 'active' : ''}" data-fmt="bold" aria-pressed="${!!ds.bold}" style="font-weight:700;">B</button>
        <button class="btn-icon text-fmt-btn ${ds.italic ? 'active' : ''}" data-fmt="italic" aria-pressed="${!!ds.italic}" style="font-style:italic;">I</button>
        <button class="btn-icon text-fmt-btn ${ds.underline ? 'active' : ''}" data-fmt="underline" aria-pressed="${!!ds.underline}" style="text-decoration:underline;">U</button>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Theme Font</p>
      <label class="flex items-center gap-8 text-sm" style="cursor:pointer;">
        <input type="checkbox" class="theme-font-toggle" ${(!ds.fontFamily || ds.fontFamily === 'theme') ? 'checked' : ''}/> Use theme font by default
      </label>
      ${(ds.fontFamily && ds.fontFamily !== 'theme') ? `<input class="input mt-8 font-family-input" placeholder="e.g. Georgia, serif" value="${escapeHtml(ds.fontFamily)}" />` : ''}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Spacing</div>
      <p class="text-sm text-muted mb-8">Top Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingTop" min="0" max="100" value="${ds.paddingTop ?? 22}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 22}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="100" value="${ds.paddingBottom ?? 22}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 22}px</span>
      </div>
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Background</div>
      ${segControl('design-bgtype', 'bgType', [{ id: 'light', label: 'Light' }, { id: 'grey', label: 'Grey' }, { id: 'dark', label: 'Dark' }, { id: 'custom', label: 'Custom' }, { id: 'image', label: 'Image' }], ds.bgType || 'light')}
      ${ds.bgType === 'custom' ? `<input type="color" class="input mt-8 text-bg-custom-color" value="${ds.bgColor || '#ffffff'}" style="width:48px; height:32px; padding:2px; cursor:pointer;" />` : ''}
      ${ds.bgType === 'image' ? `
        ${mediaPickerImageField(ds, 'bgImage', 'Background Image', 'Background Image', false, 'design')}
        <p class="text-sm text-muted mt-8 mb-8">Image Fit</p>
        ${segControl('design-bgfit', 'bgFit', [{ id: 'cover', label: 'Cover' }, { id: 'contain', label: 'Contain' }, { id: 'stretch', label: 'Stretch' }], ds.bgFit || 'cover')}
      ` : ''}
    </div>
    ${block.type === 'table' ? `
    <div class="prop-section">
      <div class="prop-section-title">Table Style</div>
      <p class="text-sm text-muted mb-8">Header Background</p>
      <div class="flex items-center gap-8 mb-12">
        <input type="color" class="design-color-input" data-prop="tableHeaderBg" value="${ds.tableHeaderBg || '#E4E1F9'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
        <button class="btn btn-secondary btn-sm table-style-reset" data-prop="tableHeaderBg">Reset</button>
      </div>
      <p class="text-sm text-muted mb-8">Header Text Colour</p>
      <div class="flex items-center gap-8 mb-12">
        <input type="color" class="design-color-input" data-prop="tableHeaderTextColor" value="${ds.tableHeaderTextColor || '#1A1A2E'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
        <button class="btn btn-secondary btn-sm table-style-reset" data-prop="tableHeaderTextColor">Reset</button>
      </div>
      <p class="text-sm text-muted mb-8">Border Colour</p>
      <div class="flex items-center gap-8 mb-12">
        <input type="color" class="design-color-input" data-prop="tableBorderColor" value="${ds.tableBorderColor || '#E2E4EA'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
        <button class="btn btn-secondary btn-sm table-style-reset" data-prop="tableBorderColor">Reset</button>
      </div>
      <p class="text-sm text-muted mb-8">Body Fill Colour</p>
      <label class="flex items-center gap-8 text-sm mb-8" style="cursor:pointer;">
        <input type="checkbox" class="table-bodyfill-toggle" ${ds.tableBodyFill ? 'checked' : ''}/> Use custom body fill
      </label>
      ${ds.tableBodyFill ? `
      <div class="flex items-center gap-8">
        <input type="color" class="design-color-input" data-prop="tableBodyFill" value="${ds.tableBodyFill}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
        <button class="btn btn-secondary btn-sm table-style-reset" data-prop="tableBodyFill">Reset</button>
      </div>` : ''}
    </div>
    ` : ''}
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Advanced</div>
      <p class="text-sm text-muted">Block ID: block-${index + 1}</p>
    </div>
  `;
}

/* ============================================================
   STATEMENT BLOCK SETTINGS PANEL (Content / Icon / Typography / Spacing / Background / Border)
   ============================================================ */
// Remediation Sprint 1, Workstream 2: dedicated panel for Quote 1-4, mirroring
// renderStatementBlockPanel's structure so the same Theme/Light/Grey/Dark/
// Custom/Image Background architecture is used consistently, instead of the
// removed "Style Variant" (lavender/cyan/pink/peach) control that duplicated
// the generic Background swatch panel and did nothing for quote1/2/3.
function renderQuoteCardBlockPanel(block, index) {
  block.design = block.design || {};
  const ds = block.design;

  if (BuilderUI.rightTab === 'settings') {
    return `
      <div class="field">
        <label>Block ID</label>
        <input class="input" value="block-${index + 1}" disabled style="opacity:0.6;" />
      </div>
      <p class="text-sm text-muted">No additional settings for this block.</p>
    `;
  }

  if (BuilderUI.rightTab === 'content') {
    return `<p class="text-sm text-muted">Click directly on the quote text or attribution in the canvas to edit it. Select text to format it (bold, italic, underline, size, colour, alignment).</p>` +
      quoteAvatarOnlyFields(block) + aiActions();
  }

  return `
    <div class="prop-section">
      <div class="prop-section-title">Corner Radius</div>
      ${segControl('design-radius', 'radius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.radius || 'soft')}
    </div>
    ${quoteCardBgFields(ds)}
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Spacing</div>
      <p class="text-sm text-muted mb-8">Top Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingTop" min="0" max="100" value="${ds.paddingTop ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 0}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="100" value="${ds.paddingBottom ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 0}px</span>
      </div>
    </div>`;
}

function renderStatementBlockPanel(block, index) {
  block.design = block.design || {};
  const ds = block.design;
  const def = STATEMENT_DEFAULTS[block.type] || {};

  if (BuilderUI.rightTab === 'settings') {
    return `
      <div class="field">
        <label>Block ID</label>
        <input class="input" value="block-${index + 1}" disabled style="opacity:0.6;" />
      </div>
      <p class="text-sm text-muted">No additional settings for this block.</p>
    `;
  }

  if (BuilderUI.rightTab === 'content') {
    return `<p class="text-sm text-muted">Click directly on the text in the canvas to edit it.</p>`;
  }

  // DESIGN TAB — Icon / Typography / Spacing / Background / Border
  const fontColorOptions = [
    { id: 'theme', label: 'Theme' },
    { id: 'black', label: 'Black' },
    { id: 'white', label: 'White' },
    { id: 'grey', label: 'Grey' },
  ];
  const activeFontColor = (!ds.fontColor || ds.fontColor === 'theme') ? 'theme' : (TEXT_COLOR_MAP[ds.fontColor] ? ds.fontColor : 'custom');
  const iconRemoved = !!ds.iconRemoved;
  const currentIcon = ds.icon !== undefined ? ds.icon : (def.icon || '');

  return `
    <div class="prop-section">
      <div class="prop-section-title">Icon</div>
      <label class="flex items-center gap-8 text-sm mb-8" style="cursor:pointer;">
        <input type="checkbox" class="stmt-icon-remove-toggle" ${iconRemoved ? 'checked' : ''}/> Remove icon
      </label>
      ${!iconRemoved ? `
      <div class="flex items-center gap-8 mb-8">
        <input class="input stmt-icon-input" value="${escapeHtml(currentIcon)}" style="width:60px; text-align:center; font-size:18px;" maxlength="4" />
        <button class="btn btn-secondary btn-sm stmt-icon-restore-btn">Restore default</button>
      </div>
      <p class="text-sm text-muted mb-8">Icon Size</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="iconSize" min="12" max="48" value="${ds.iconSize ?? 20}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.iconSize ?? 20}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Icon Colour</p>
      <input type="color" class="input stmt-icon-color" value="${ds.iconColor || def.iconColor || '#6366F1'}" style="width:48px; height:32px; padding:2px; cursor:pointer;" />
      ` : ''}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Typography</div>
      <p class="text-sm text-muted mb-8">Text Alignment</p>
      ${segControl('design-align', 'align', [{ id: 'left', label: 'Left' }, { id: 'center', label: 'Center' }, { id: 'right', label: 'Right' }], ds.align || 'left')}
      <p class="text-sm text-muted mb-8 mt-12">Font Size</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="fontSize" min="10" max="48" value="${ds.fontSize || 15}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.fontSize || 15}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Font Colour</p>
      <div class="flex gap-8 items-center">
        ${fontColorOptions.map(o => `<div class="text-color-swatch ${activeFontColor === o.id ? 'selected' : ''}" data-color="${o.id}" title="${o.label}"
          style="width:26px; height:26px; border-radius:6px; cursor:pointer; background:${o.id === 'theme' ? 'var(--gradient-primary)' : o.id === 'white' ? '#fff' : TEXT_COLOR_MAP[o.id]};
          border:${activeFontColor === o.id ? '2px solid var(--indigo)' : '1px solid var(--border)'};"></div>`).join('')}
        <input type="color" class="text-color-custom" title="Custom colour" value="${activeFontColor === 'custom' ? ds.fontColor : '#000000'}"
          style="width:26px; height:26px; padding:0; border:${activeFontColor === 'custom' ? '2px solid var(--indigo)' : '1px solid var(--border)'}; border-radius:6px; cursor:pointer;" />
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Text Formatting</p>
      <div class="flex gap-8">
        <button class="btn-icon text-fmt-btn ${ds.bold ? 'active' : ''}" data-fmt="bold" aria-pressed="${!!ds.bold}" style="font-weight:700;">B</button>
        <button class="btn-icon text-fmt-btn ${ds.italic ? 'active' : ''}" data-fmt="italic" aria-pressed="${!!ds.italic}" style="font-style:italic;">I</button>
        <button class="btn-icon text-fmt-btn ${ds.underline ? 'active' : ''}" data-fmt="underline" aria-pressed="${!!ds.underline}" style="text-decoration:underline;">U</button>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Theme Font</p>
      <label class="flex items-center gap-8 text-sm" style="cursor:pointer;">
        <input type="checkbox" class="theme-font-toggle" ${(!ds.fontFamily || ds.fontFamily === 'theme') ? 'checked' : ''}/> Use theme font by default
      </label>
      ${(ds.fontFamily && ds.fontFamily !== 'theme') ? `<input class="input mt-8 font-family-input" placeholder="e.g. Georgia, serif" value="${escapeHtml(ds.fontFamily)}" />` : ''}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Spacing</div>
      <p class="text-sm text-muted mb-8">Top Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingTop" min="0" max="100" value="${ds.paddingTop ?? 18}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 18}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="100" value="${ds.paddingBottom ?? 18}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 18}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Left Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingLeft" min="0" max="100" value="${ds.paddingLeft ?? 18}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingLeft ?? 18}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Right Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingRight" min="0" max="100" value="${ds.paddingRight ?? 18}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingRight ?? 18}px</span>
      </div>
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Background</div>
      <p class="text-sm text-muted mb-8">By default, Statements inherit your course theme colours.</p>
      ${segControl('design-bgtype', 'bgType', [{ id: 'theme', label: 'Theme' }, { id: 'light', label: 'Light' }, { id: 'grey', label: 'Grey' }, { id: 'dark', label: 'Dark' }, { id: 'custom', label: 'Custom' }, { id: 'image', label: 'Image' }], ds.bgType || 'theme')}
      ${ds.bgType === 'custom' ? `<input type="color" class="input mt-8 text-bg-custom-color" value="${ds.bgColor || '#ffffff'}" style="width:48px; height:32px; padding:2px; cursor:pointer;" />` : ''}
      ${ds.bgType === 'image' ? `
        ${mediaPickerImageField(ds, 'bgImage', 'Background Image', 'Background Image', false, 'design')}
        <p class="text-sm text-muted mt-8 mb-8">Image Fit</p>
        ${segControl('design-bgfit', 'bgFit', [{ id: 'cover', label: 'Cover' }, { id: 'contain', label: 'Contain' }, { id: 'stretch', label: 'Stretch' }], ds.bgFit || 'cover')}
      ` : ''}
    </div>
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Border</div>
      <label class="flex items-center gap-8 text-sm mb-8" style="cursor:pointer;">
        <input type="checkbox" class="stmt-border-toggle" ${ds.borderOn ? 'checked' : ''}/> Show border
      </label>
      ${ds.borderOn ? `
        <p class="text-sm text-muted mb-8">Border Colour</p>
        <input type="color" class="input stmt-border-color" value="${(ds.borderColor && ds.borderColor.startsWith('#')) ? ds.borderColor : '#7C3AED'}" style="width:48px; height:32px; padding:2px; cursor:pointer;" />
        <p class="text-sm text-muted mb-8 mt-12">Border Thickness</p>
        <div class="flex items-center gap-8">
          <input type="range" class="design-range" data-prop="borderWidth" min="1" max="8" value="${ds.borderWidth ?? 1}" style="flex:1;" />
          <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.borderWidth ?? 1}px</span>
        </div>
      ` : ''}
      <p class="text-sm text-muted mb-8 mt-12">Border Radius</p>
      ${segControl('design-radius', 'radius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.radius || 'soft')}
    </div>
  `;
}

/* ============================================================
   LIST BLOCK SETTINGS PANEL (Content / Spacing / Indent / per-type style)
   ============================================================ */
function renderListBlockPanel(block, index) {
  block.design = block.design || {};
  const ds = block.design;

  if (BuilderUI.rightTab === 'settings') {
    return `
      <div class="field">
        <label>Block ID</label>
        <input class="input" value="block-${index + 1}" disabled style="opacity:0.6;" />
      </div>
      <p class="text-sm text-muted">No additional settings for this block.</p>
    `;
  }

  if (BuilderUI.rightTab === 'content') {
    return `<p class="text-sm text-muted">Click directly on the heading or list items in the canvas to edit them. Select text to format it (bold, italic, underline, colour, alignment). Use the + Add Item button, and the arrow / × controls on each item, to manage the list structure.</p>` + aiActions();
  }

  // DESIGN TAB — Spacing / Indent / per-type style options
  let typeFields = '';
  if (block.type === 'list_numbered') {
    typeFields = `
      <div class="prop-section" style="border-bottom:none;">
        <div class="prop-section-title">Number Style</div>
        ${segControl('design-numberstyle', 'numberStyle', [{id:'decimal',label:'1, 2, 3'},{id:'alpha',label:'A, B, C'},{id:'roman',label:'I, II, III'}], ds.numberStyle || 'decimal')}
        <p class="text-sm text-muted mt-12">Click into the small field beside any item to give it a custom number or label (e.g. "10" or "Step 1"). Leave it blank to use automatic numbering.</p>
      </div>`;
  } else if (block.type === 'list_bullet') {
    typeFields = `
      <div class="prop-section">
        <div class="prop-section-title">Bullet Style</div>
        ${segControl('design-bulletstyle', 'bulletStyle', [{id:'disc',label:'● Solid'},{id:'circle',label:'○ Hollow'},{id:'square',label:'■ Square'},{id:'dash',label:'– Dash'},{id:'arrow',label:'→ Arrow'},{id:'check',label:'✓ Check'}], ds.bulletStyle || 'disc')}
      </div>
      <div class="prop-section">
        <div class="prop-section-title">Bullet Size</div>
        ${segControl('design-bulletsize', 'bulletSize', [{id:'sm',label:'Small'},{id:'md',label:'Medium'},{id:'lg',label:'Large'}], ds.bulletSize || 'md')}
      </div>
      <div class="prop-section" style="border-bottom:none;">
        <div class="prop-section-title">Bullet Colour</div>
        <input type="color" class="input list-bullet-color" value="${(ds.bulletColor && ds.bulletColor.startsWith('#')) ? ds.bulletColor : '#1a1a1a'}" style="width:48px; height:32px; padding:2px; cursor:pointer;" />
      </div>`;
  } else if (block.type === 'list_checkbox') {
    typeFields = `
      <div class="prop-section">
        <div class="prop-section-title">Checkbox Style</div>
        ${segControl('design-checkboxstyle', 'checkboxStyle', [{id:'square',label:'Square'},{id:'filled',label:'Filled'},{id:'checkmark',label:'Checkmark'},{id:'circle',label:'Circle'}], ds.checkboxStyle || 'square')}
      </div>
      <div class="prop-section">
        <div class="prop-section-title">Checkbox Size</div>
        ${segControl('design-checkboxsize', 'checkboxSize', [{id:'sm',label:'Small'},{id:'md',label:'Medium'},{id:'lg',label:'Large'}], ds.checkboxSize || 'md')}
      </div>
      <div class="prop-section" style="border-bottom:none;">
        <div class="prop-section-title">Checkbox Colours</div>
        <p class="text-sm text-muted mb-8">Border Colour</p>
        <input type="color" class="input list-checkbox-border-color" value="${(ds.checkboxBorderColor && ds.checkboxBorderColor.startsWith('#')) ? ds.checkboxBorderColor : '#c4c4cc'}" style="width:48px; height:32px; padding:2px; cursor:pointer;" />
        <p class="text-sm text-muted mb-8 mt-12">Tick Colour</p>
        <input type="color" class="input list-checkbox-tick-color" value="${(ds.checkboxTickColor && ds.checkboxTickColor.startsWith('#')) ? ds.checkboxTickColor : '#7C3AED'}" style="width:48px; height:32px; padding:2px; cursor:pointer;" />
      </div>`;
  }

  return `
    <div class="prop-section">
      <div class="prop-section-title">Spacing</div>
      <p class="text-sm text-muted mb-8">Top Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingTop" min="0" max="60" value="${ds.paddingTop ?? 4}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 4}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="60" value="${ds.paddingBottom ?? 4}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 4}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Indent</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="indent" min="0" max="60" value="${ds.indent ?? 20}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.indent ?? 20}px</span>
      </div>
    </div>
    ${typeFields}
  `;
}

/* ============================================================
   IMAGE & GALLERY BLOCK SETTINGS PANEL (Image, Image & Text,
   Text on Image, Carousel, Column Grid)
   ============================================================ */
function renderImageFamilyPanel(block, index) {
  block.design = block.design || {};
  const ds = block.design;
  const d = block.data || {};

  if (BuilderUI.rightTab === 'settings') {
    return `
      <div class="field">
        <label>Block ID</label>
        <input class="input" value="block-${index + 1}" disabled style="opacity:0.6;" />
      </div>
      <p class="text-sm text-muted">No additional settings for this block.</p>
    `;
  }

  if (BuilderUI.rightTab === 'content') {
    switch (block.type) {
      case 'image':
        return mediaPickerImageField(d, 'src', 'Image', 'Image') +
          contentFields([['Alt text', 'alt', d.alt || d.label || '', 'input']]) +
          `<p class="text-sm text-muted mt-8">Click directly on the caption in the canvas to edit it.</p>` + aiActions(true);
      case 'image_text':
        return mediaPickerImageField(d, 'src', 'Image', 'Image') +
          contentFields([['Image alt text', 'alt', d.alt || d.imageLabel || '', 'input']]) +
          `<p class="text-sm text-muted mt-8">Click directly on the heading or body text in the canvas to edit them.</p>` + aiActions(true);
      case 'text_on_image':
        return mediaPickerImageField(d, 'src', 'Background Image', 'Background Image') +
          `<p class="text-sm text-muted mt-8">Click directly on the heading or body text in the canvas to edit them.</p>` + aiActions(true);
      case 'carousel':
        return galleryCarouselContentPanel(block, d);
      case 'column_grid':
        return `<p class="text-sm text-muted">Use the controls on each item to upload an image and edit its title/description. Use + Add Item to add more.</p>` + aiActions();
      default:
        return `<p class="text-sm text-muted">Edit the ${blockLabel(block.type)} block's content directly on the canvas.</p>` + aiActions();
    }
  }

  // DESIGN TAB
  switch (block.type) {
    case 'image':
      return `
        <div class="prop-section">
          <div class="prop-section-title">Layout</div>
          ${segControl('design-imglayout', 'layout', [{id:'centered',label:'Centered'},{id:'full',label:'Full Width'},{id:'banner',label:'Banner'}], ds.layout || 'centered')}
        </div>
        <div class="prop-section">
          <div class="prop-section-title">Corner Radius</div>
          ${segControl('design-imgradius', 'imageRadius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.imageRadius || 'soft')}
        </div>
        ${interactiveBorderPaddingFields(ds)}`;
    case 'image_text':
      return `
        <div class="prop-section">
          <div class="prop-section-title">Image Position</div>
          ${segControl('design-imgpos', 'imagePosition', [{id:'left',label:'Left'},{id:'right',label:'Right'}], ds.imagePosition || 'left')}
        </div>
        <div class="prop-section">
          <div class="prop-section-title">Image Size</div>
          ${segControl('design-imgsize', 'imageSize', [{id:'sm',label:'Small'},{id:'md',label:'Medium'},{id:'lg',label:'Large'}], ds.imageSize || 'md')}
        </div>
        <div class="prop-section">
          <div class="prop-section-title">Corner Radius</div>
          ${segControl('design-imgradius', 'imageRadius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.imageRadius || 'soft')}
        </div>
        ${interactiveBorderPaddingFields(ds)}
        <p class="text-sm text-muted mt-16">On narrow screens, the image and text stack vertically.</p>`;
    case 'text_on_image': {
      const activeTextColor = ds.textColor === 'dark' ? 'dark' : 'light';
      return `
        <div class="prop-section">
          <div class="prop-section-title">Overlay Darkness</div>
          <div class="flex items-center gap-8">
            <input type="range" class="design-range" data-prop="overlayOpacity" data-suffix="%" min="0" max="80" value="${ds.overlayOpacity ?? 40}" style="flex:1;" />
            <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.overlayOpacity ?? 40}%</span>
          </div>
        </div>
        <div class="prop-section">
          <div class="prop-section-title">Text Colour</div>
          ${segControl('design-textcolor', 'textColor', [{id:'light',label:'Light'},{id:'dark',label:'Dark'}], activeTextColor)}
        </div>
        <div class="prop-section">
          <div class="prop-section-title">Text Position</div>
          ${segControl('design-textpos', 'textPosition', [{id:'top',label:'Top'},{id:'center',label:'Center'},{id:'bottom',label:'Bottom'}], ds.textPosition || 'center')}
        </div>
        <div class="prop-section">
          <div class="prop-section-title">Corner Radius</div>
          ${segControl('design-imgradius', 'imageRadius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.imageRadius || 'soft')}
        </div>
        ${interactiveBorderPaddingFields(ds)}
        <p class="text-sm text-muted mt-16">Increase overlay darkness or switch to dark text to keep content readable over bright images.</p>`;
    }
    case 'carousel':
      return `
        <div class="prop-section">
          <div class="prop-section-title">Image Corner Radius</div>
          ${segControl('design-imgradius', 'imageRadius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.imageRadius || 'soft')}
        </div>
        ${interactiveBorderPaddingFields(ds)}
        <p class="text-sm text-muted mt-16">Use the Content tab to manage slides — add images, titles, descriptions and reorder.</p>`;
    case 'column_grid':
      return `
        <div class="prop-section">
          <div class="prop-section-title">Columns</div>
          ${segControl('design-gridcols', 'columns', [2,3,4,5,6].map(n => ({id:String(n), label:String(n)})), String(ds.columns || 3))}
        </div>
        <div class="prop-section">
          <div class="prop-section-title">Image Corner Radius</div>
          ${segControl('design-imgradius', 'imageRadius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.imageRadius || 'soft')}
        </div>
        ${interactiveBorderPaddingFields(ds)}
        <p class="text-sm text-muted mt-16">Manage items directly on the canvas — upload images and edit titles/descriptions using the controls on each item.</p>`;
    default:
      return '';
  }
}

/* Wraps renderRightTabContentInner so every block type's Settings tab gets
   the same "Completion" section appended, regardless of which dedicated
   per-type panel function produced the rest of the tab. Single insertion
   point — avoids touching every individual panel function (text/statement/
   list/image/chart/divider/audio/video/file each have their own, plus the
   generic accordion/tabs/flashcard/scenario/fallback branch further down). */
function renderRightTabContent(block, index, course) {
  const inner = renderRightTabContentInner(block, index, course);
  if (BuilderUI.rightTab !== 'settings' || !CompletionEngine.isRequirable(block.type)) return inner;
  return inner + completionRequirementPanel(block);
}

// Renders the "Completion" Design Panel section: a Required toggle, plus a
// Rule dropdown — hidden entirely when the type has only one valid rule
// (nothing to choose), per the Phase 4 spec ("If a block type has only one
// valid rule: Hide the dropdown").
function completionRequirementPanel(block) {
  const s = block.settings || {};
  const required = s.completionRequired === true;
  const options = CompletionEngine.ruleOptionsFor(block.type);
  // Sprint 2, Phase 1 fix: assessment blocks (Knowledge Checks) already have
  // a dedicated, more specific "Assessment Rules" panel (kcSettingsPanel)
  // with its own Completion Rule / Require Correct Answer / Passing
  // Requirement controls. Showing this generic Rule dropdown ALONGSIDE it
  // used to be actively misleading — both looked like they controlled
  // completion, but only the KC panel's fields actually fed scoring, while
  // this dropdown (completionRuleType) was the only one read by the
  // Next-button gate. Both checks now read the same fields (see
  // completionEngine.js isNextRequirementMet), so this dropdown is fully
  // redundant for assessed blocks — hide it instead of leaving a second,
  // confusing control that visually implies it does something it doesn't.
  const cap = BlockCapabilities.COMPLETION[block.type];
  if (cap && cap.strategy === 'assessed') {
    const required = (block.settings || {}).completionRequired === true;
    return `
      <div class="prop-section-title mt-16">Completion</div>
      <div class="field">
        <label class="flex items-center gap-8">
          <input type="checkbox" class="settings-field" data-field="completionRequired" ${required ? 'checked' : ''} />
          Required for Lesson Completion
        </label>
        <p class="text-xs text-muted mt-4">Pass/submit behaviour is configured in Assessment Rules above.</p>
      </div>
    `;
  }
  const currentRule = CompletionEngine.effectiveRule(block);
  const RULE_LABELS = {
    viewed: 'Viewed', watched_50: 'Watched 50%', watched_75: 'Watched 75%', watched_100: 'Watched 100%',
    played: 'Played', played_50: 'Played 50%', played_75: 'Played 75%', played_100: 'Played 100%',
    any_panel: 'Open Any Panel', all_panels: 'Open All Panels',
    any_tab: 'View Any Tab', all_tabs: 'View All Tabs',
    any_slide: 'View Any Slide', all_slides: 'View All Slides',
    any_step: 'View Any Step', all_steps: 'View All Steps',
    any_hotspot: 'Open Any Hotspot', all_hotspots: 'Open All Hotspots',
    any_card: 'Flip Any Card', all_cards: 'Flip All Cards',
    interacted: 'Interacted', click: 'Click Continue',
    submitted: 'Submitted', correct: 'Correct',
  };
  // Reuses the existing generic .settings-field / .settings-select-str
  // handlers (both already write block.settings[data-field] on the
  // currently-selected block and re-render) — no new event wiring needed.
  // The Rule dropdown's visibility recomputes correctly on the next render
  // since it's driven by `required`, read fresh from block.settings each time.
  return `
    <div class="prop-section-title mt-16">Completion</div>
    <div class="field">
      <label class="flex items-center gap-8">
        <input type="checkbox" class="settings-field" data-field="completionRequired" ${required ? 'checked' : ''} />
        Required for Lesson Completion
      </label>
    </div>
    ${options.length > 1 ? `
    <div class="field" style="${required ? '' : 'display:none;'}">
      <label>Rule</label>
      <select class="input settings-select-str" data-field="completionRuleType">
        ${options.map(o => `<option value="${o}" ${o === currentRule ? 'selected' : ''}>${RULE_LABELS[o] || o}</option>`).join('')}
      </select>
    </div>` : ''}
  `;
}

function renderRightTabContentInner(block, index, course) {
  const d = block.data || {};
  if (blockCategory(block.type) === 'Text') {
    return renderTextBlockPanel(block, index);
  }
  if (blockCategory(block.type) === 'Statements') {
    return renderStatementBlockPanel(block, index);
  }
  if (blockCategory(block.type) === 'Lists') {
    return renderListBlockPanel(block, index);
  }
  if (['quote1', 'quote2', 'quote3', 'quote4'].includes(block.type)) {
    return renderQuoteCardBlockPanel(block, index);
  }
  if (blockCategory(block.type) === 'Images' || blockCategory(block.type) === 'Gallery') {
    return renderImageFamilyPanel(block, index);
  }
  if (blockCategory(block.type) === 'Charts') {
    return renderChartBlockPanel(block, index);
  }
  if (blockCategory(block.type) === 'Dividers') {
    return renderDividerBlockPanel(block, index);
  }
  if (block.type === 'audio') {
    return renderAudioBlockPanel(block, index);
  }
  if (block.type === 'video') {
    return renderVideoBlockPanel(block, index);
  }
  if (block.type === 'file') {
    return renderFileBlockPanel(block, index);
  }
  if (BuilderUI.rightTab === 'design') {
    block.design = block.design || {};
    const ds = block.design;
    // Remediation Sprint 1, Phase 1 root cause: this generic "Background"
    // swatch (ds.bg) was shown for every block reaching this fallback panel,
    // but only Flashcard Grid/Stack ever reads ds.bg — for Accordion, Tabs,
    // Process, Scenario, Labelled Graphic, Button, and all 5 Knowledge Check
    // types, it rendered a control that visibly did nothing (each of those
    // either has its own separate background system further down via
    // blockTypeDesignFields, or no background concept at all). Confirmed via
    // direct read of every consuming renderer — not assumed. Removing the
    // dead control for everything except the one type that actually
    // consumes it; no renderer, persistence, Preview, or export behaviour
    // changes for any block, since ds.bg was never read by them.
    const showLegacyBgSwatch = block.type === 'flashcard_grid' || block.type === 'flashcard_stack';
    return `
      ${showLegacyBgSwatch ? `
      <div class="prop-section">
        <div class="prop-section-title">Background</div>
        <div class="flex gap-8">
          ${['transparent','var(--pastel-lavender)','var(--pastel-cyan)','var(--pastel-pink)','var(--pastel-peach)'].map(c => `
            <div class="design-swatch ${(ds.bg===c || (!ds.bg && c==='transparent')) ? 'selected':''}" data-color="${c}"
              style="width:28px; height:28px; border-radius:8px; background:${c==='transparent'?'#fff':c};
              border:${(ds.bg===c || (!ds.bg && c==='transparent')) ? '2px solid var(--indigo)' : '1px solid var(--border)'}; cursor:pointer;"></div>
          `).join('')}
        </div>
      </div>` : ''}
      <div class="prop-section">
        <div class="prop-section-title">Alignment</div>
        ${segControl('design-align', 'align', [{id:'left',label:'Left'},{id:'center',label:'Center'},{id:'right',label:'Right'}], ds.align || 'left')}
      </div>
      <div class="prop-section">
        <div class="prop-section-title">Corner Radius</div>
        ${segControl('design-radius', 'radius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.radius || 'soft')}
      </div>
      ${blockTypeDesignFields(block, ds)}
      <p class="text-sm text-muted mt-16">Design options are constrained to your course theme to keep every lesson visually consistent.</p>
    `;
  }
  if (BuilderUI.rightTab === 'settings') {
    let extra = '';
    if (block.type.startsWith('kc_')) {
      extra = kcSettingsPanel(block);
    } else if (block.type === 'accordion') {
      const s = block.settings || {};
      extra = `
        <div class="field">
          <label>Open behaviour</label>
          ${segControlSettings('settings-openmode', 'openMode', [{id:'single',label:'Single Open'},{id:'multiple',label:'Multiple Open'}], s.openMode === 'multiple' ? 'multiple' : 'single')}
        </div>
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="expandFirst" ${s.expandFirst !== false ? 'checked' : ''}/> Expand first item by default</label></div>
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="animation" ${s.animation !== false ? 'checked' : ''}/> Animate expand/collapse</label></div>`;
    } else if (block.type === 'tabs') {
      const s = block.settings || {};
      const items = block.data.items || [];
      extra = `
        <div class="field"><label>Default Active Tab</label>
          <select class="input settings-select" data-field="defaultTab">
            ${items.map((it,i)=>`<option value="${i}" ${(s.defaultTab||0)===i?'selected':''}>${i+1}. ${escapeHtml(it.title||'Tab '+(i+1))}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="animation" ${s.animation !== false ? 'checked' : ''}/> Animate tab switch</label></div>`;
    } else if (block.type === 'labelled_graphic') {
      const s = block.settings || {};
      extra = `
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="hotspotAnimation" ${s.hotspotAnimation !== false ? 'checked' : ''}/> Animate hotspot markers (pulse)</label></div>
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="autoClose" ${s.autoClose !== false ? 'checked' : ''}/> Auto-close previous hotspot</label></div>`;
    } else if (block.type === 'process') {
      const s = block.settings || {};
      extra = `
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="showStepNumbers" ${s.showStepNumbers !== false ? 'checked' : ''}/> Show step numbers</label></div>
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="customStepLabels" ${s.customStepLabels ? 'checked' : ''}/> Use custom step titles as labels</label></div>
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="enableSwipe" ${s.enableSwipe !== false ? 'checked' : ''}/> Enable swipe navigation</label></div>`;
    } else if (block.type === 'scenario') {
      const s = block.settings || {};
      extra = `
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="enableScoring" ${s.enableScoring ? 'checked' : ''}/> Enable scoring</label></div>
        <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="trackCorrect" ${s.trackCorrect ? 'checked' : ''}/> Track correct choices</label></div>
        <div class="field"><label>Completion Message</label><input class="input settings-text" data-field="completionMessage" value="${escapeHtml(s.completionMessage || 'Scenario complete!')}" /></div>
        <div class="field"><label>Completion Behaviour</label>
          ${segControlSettings('settings-completionbehaviour', 'completionBehaviour', [{id:'message',label:'Show Message'},{id:'restart',label:'Allow Restart'}], s.completionBehaviour || 'message')}
        </div>`;
    } else {
      extra = `<p class="text-sm text-muted">No additional settings for this block.</p>`;
    }
    return `
      <div class="field">
        <label>Block ID</label>
        <input class="input" value="block-${index+1}" disabled style="opacity:0.6;" />
      </div>
      ${extra}
    `;
  }

  // CONTENT TAB
  switch (block.type) {
    case 'heading_paragraph':
      return `<p class="text-sm text-muted">Click directly into the heading or paragraph on the canvas to edit the text. Select text to format it (bold, italic, underline, size, colour, alignment).</p>` + aiActions();
    case 'paragraph':
      return contentFields([['Body text', 'body', d.body, 'textarea']]) + aiActions();
    case 'process':
      return processContentPanel(block, d);
    case 'labelled_graphic':
      return labelledGraphicContentPanel(block, d);
    case 'quote1': case 'quote2': case 'quote3': case 'quote4':
      return `<p class="text-sm text-muted">Click directly on the quote text or attribution in the canvas to edit it. Select text to format it (bold, italic, underline, size, colour, alignment).</p>` +
        quoteAvatarOnlyFields(block) + aiActions();
    case 'quote_image':
      return `<p class="text-sm text-muted">Click directly on the quote text or attribution in the canvas to edit it. Select text to format it (bold, italic, underline, size, colour, alignment).</p>` +
        quoteImageUploadFields(block) + aiActions();
    case 'quote_carousel':
      return quoteCarouselContentPanel(block, d);
    case 'kc_multiple_choice':
      return kcMcContentPanel(block, d);
    case 'accordion':
      return accordionContentPanel(block, d);
    case 'tabs':
      return tabsContentPanel(block, d);
    case 'flashcard_grid': case 'flashcard_stack':
      return flashcardContentPanel(block, d);
    case 'kc_multiple_response':
      return kcMrContentPanel(block, d);
    case 'kc_matching':
      return kcMatchingContentPanel(block, d);
    case 'kc_fill_gap':
      return kcFillGapContentPanel(block, d);
    case 'kc_ordering':
      return kcOrderingContentPanel(block, d);
    case 'button': {
      const destType = d.destType || 'url';
      const lessonBlocks = LumioState.lessons[LumioState.currentLessonId] || [];
      let destFields = '';
      if (destType === 'url') {
        destFields = contentFields([['Link URL', 'url', d.url, 'input']]) +
          `<div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="content-field" data-field="newTab" ${d.newTab ? 'checked' : ''}/> Open link in new tab</label></div>`;
      } else if (destType === 'anchor') {
        destFields = `<div class="field"><label>Jump to block</label>
          <select class="input content-field" data-field="anchorIndex">
            ${lessonBlocks.map((b,i) => `<option value="${i}" ${(d.anchorIndex ?? 0) === i ? 'selected' : ''}>${i+1}. ${blockLabel(b.type)}</option>`).join('')}
          </select></div>`;
      } else if (destType === 'file') {
        destFields = mediaPickerFileField(d, 'file', 'Download File', 'Download File');
      } else if (destType === 'nextLesson') {
        destFields = `<p class="text-sm text-muted">This button takes the learner to the next lesson in the course.</p>`;
      }
      return contentFields([['Button label', 'label', d.label, 'input']]) +
        `<div class="field"><label>Destination</label>
          <select class="input content-field" data-field="destType">
            <option value="url" ${destType==='url'?'selected':''}>External URL</option>
            <option value="anchor" ${destType==='anchor'?'selected':''}>Jump to Block (this lesson)</option>
            <option value="file" ${destType==='file'?'selected':''}>File Download</option>
            <option value="nextLesson" ${destType==='nextLesson'?'selected':''}>Next Lesson</option>
          </select>
        </div>` +
        destFields +
        contentFields([['Icon (emoji, optional)', 'icon', d.icon, 'input']]);
    }
    case 'scenario':
      return scenarioContentPanel(block, d);
    default:
      return `<p class="text-sm text-muted">Edit the ${blockLabel(block.type)} block's content directly on the canvas, or use AI to generate a draft.</p>` + aiActions();
  }
}

/* ============================================================
   CHARTS — dedicated right-panel (Content / Design / Settings),
   dispatched early from renderRightTabContent for the 'Charts'
   category so the generic Background/Alignment/Corner-Radius
   sections never apply to chart blocks.
   ============================================================ */
function renderChartBlockPanel(block, index) {
  const d = block.data || (block.data = {});
  const ds = block.design || (block.design = {});
  const s = block.settings || (block.settings = {});
  const isPie = block.type === 'chart_pie';
  const isLine = block.type === 'chart_line';
  if (BuilderUI.rightTab === 'design') return chartDesignPanel(block, d, ds, isPie, isLine);
  if (BuilderUI.rightTab === 'settings') return chartSettingsPanel(block, s, isPie);
  return chartContentPanel(block, d, isPie);
}

function chartContentPanel(block, d, isPie) {
  const items = normalizeChartItems(d, isPie ? 'pie' : 'other');
  const labelHeading = isPie ? 'Segment Label' : 'Label';
  const valueHeading = isPie ? 'Segment Value' : 'Value';
  const rows = items.map((it, i) => `
    <div class="chart-row mb-8 pb-8" data-iindex="${i}" style="border-bottom:1px solid var(--border);">
      <input class="input chart-field mb-8" data-field="label" data-iindex="${i}" value="${escapeHtml(it.label || '')}" placeholder="${labelHeading}" style="width:100%;" />
      <div class="flex gap-8 items-center">
        <input class="input chart-field" type="number" data-field="value" data-iindex="${i}" value="${it.value}" placeholder="${valueHeading}" style="flex:1;" />
        <div class="flex gap-4">
          <button class="btn-icon chart-row-up" data-iindex="${i}" title="Move up" aria-label="Move row up">↑</button>
          <button class="btn-icon chart-row-down" data-iindex="${i}" title="Move down" aria-label="Move row down">↓</button>
          <button class="btn-icon chart-row-duplicate" data-iindex="${i}" title="Duplicate" aria-label="Duplicate row">⧉</button>
          <button class="btn-icon chart-row-remove" data-iindex="${i}" title="Delete" aria-label="Delete row">🗑️</button>
        </div>
      </div>
    </div>`).join('');
  return `
    <div class="prop-section">
      <div class="prop-section-title">Chart Title</div>
      <input class="input chart-field" data-field="title" value="${escapeHtml(d.title || '')}" placeholder="Chart title" />
    </div>
    ${isPie ? '' : `
    <div class="prop-section">
      <div class="prop-section-title">X-Axis Label</div>
      <input class="input chart-field" data-field="xLabel" value="${escapeHtml(d.xLabel || '')}" placeholder="X-axis label" />
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Y-Axis Label</div>
      <input class="input chart-field" data-field="yLabel" value="${escapeHtml(d.yLabel || '')}" placeholder="Y-axis label" />
    </div>`}
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">${isPie ? 'Segments' : 'Data'}</div>
      ${rows}
      <button class="btn btn-secondary btn-sm chart-row-add">+ ${isPie ? 'Add Segment' : 'Add Row'}</button>
    </div>
  `;
}

function chartDesignPanel(block, d, ds, isPie, isLine) {
  const items = normalizeChartItems(d, isPie ? 'pie' : 'other');
  const colorMode = ds.colorMode === 'custom' ? 'custom' : 'theme';
  const bgStyles = [
    { id: 'light', label: 'Light' },
    { id: 'gray', label: 'Grey' },
    { id: 'theme', label: 'Theme' },
    { id: 'tint', label: 'Tint' },
    { id: 'dark', label: 'Dark' },
    { id: 'black', label: 'Black' },
  ];
  return `
    <div class="prop-section">
      <div class="prop-section-title">Colour</div>
      ${segControl('design-colormode', 'colorMode', [{ id: 'theme', label: 'Theme Color' }, { id: 'custom', label: 'Custom Color' }], colorMode)}
      ${colorMode === 'custom' ? `<div class="flex items-center gap-12 mt-8">
        <input type="color" class="design-color-input" data-prop="customColor" value="${ds.customColor || '#7C3AED'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
        <span class="text-sm text-muted">Custom colour</span>
      </div>` : ''}
    </div>
    ${isLine ? `
    <div class="prop-section">
      <div class="prop-section-title">Line</div>
      <div class="flex items-center gap-12 mb-8">
        <input type="color" class="design-color-input" data-prop="lineColor" value="${ds.lineColor || chartAccentColor(ds)}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
        <span class="text-sm text-muted">Line colour</span>
      </div>
      <label>Line Thickness</label>
      <div class="flex items-center gap-8 mb-8">
        <input type="range" class="design-range" data-prop="lineThickness" min="1" max="6" value="${ds.lineThickness || 3}" style="flex:1;" />
        <span class="range-val text-sm text-muted">${ds.lineThickness || 3}px</span>
      </div>
      ${segControl('design-linestyle', 'lineStyle', [{ id: 'straight', label: 'Straight Line' }, { id: 'smooth', label: 'Smoothed Line' }], ds.lineStyle === 'smooth' ? 'smooth' : 'straight')}
      <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="design-checkbox" data-prop="showPoints" ${ds.showPoints !== false ? 'checked' : ''}/> Show data points</label>
    </div>` : ''}
    ${isPie ? `
    <div class="prop-section">
      <div class="prop-section-title">Segment Colours</div>
      <p class="text-sm text-muted mb-8">Override individual segment colours. Leave default to use the theme/custom palette above.</p>
      ${items.map((it, i) => `
        <div class="flex items-center gap-12 mb-8">
          <input type="color" class="chart-segment-color" data-iindex="${i}" value="${(it.color || chartPieColor(ds, it, i)).startsWith('#') ? (it.color || '#7C3AED') : '#7C3AED'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
          <span class="text-sm">${escapeHtml(it.label || `Segment ${i + 1}`)}</span>
          ${it.color ? `<button class="btn btn-ghost btn-sm chart-segment-color-reset" data-iindex="${i}" style="color:#E5484D;">Reset</button>` : ''}
        </div>`).join('')}
    </div>` : ''}
    <div class="prop-section">
      <div class="prop-section-title">Background Style</div>
      ${segControl('design-bgstyle', 'bgStyle', bgStyles, (ds.bgStyle && ds.bgStyle !== 'image') ? ds.bgStyle : 'light')}
      <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="chart-bg-image-toggle" ${ds.bgStyle === 'image' ? 'checked' : ''}/> Use image background</label>
      ${ds.bgStyle === 'image' ? `
        <div class="flex items-center gap-12 mt-8" style="flex-wrap:wrap; row-gap:8px;">
          <div class="media-thumb" style="width:64px; height:48px; border-radius:var(--r-sm); overflow:hidden; background:var(--surface-50); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${ds.bgImage ? `<img src="${ds.bgImage}" style="width:100%; height:100%; object-fit:cover;" />` : `<span style="font-size:18px; opacity:0.5;">🖼️</span>`}
          </div>
          <button class="btn btn-secondary btn-sm chart-bg-image-trigger">${ds.bgImage ? '🔄 Replace Image' : '📤 Upload Image'}</button>
          ${ds.bgImage ? `<button class="btn btn-ghost btn-sm chart-bg-image-remove" style="color:#E5484D;">🗑️ Remove</button>` : ''}
        </div>` : ''}
    </div>
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Layout</div>
      <label>Heading Level</label>
      ${segControl('design-headinglevel', 'headingLevel', [{ id: 'h3', label: 'H3' }, { id: 'h4', label: 'H4' }, { id: 'h5', label: 'H5' }], ['h3','h4','h5'].includes(ds.headingLevel) ? ds.headingLevel : 'h4')}
      <label class="mt-8">Padding</label>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="padding" min="0" max="60" value="${ds.padding ?? 20}" style="flex:1;" />
        <span class="range-val text-sm text-muted">${ds.padding ?? 20}px</span>
      </div>
    </div>
  `;
}

function chartSettingsPanel(block, s, isPie) {
  if (isPie) {
    return `
      <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="showLegend" ${s.showLegend !== false ? 'checked' : ''}/> Show legend</label></div>
      <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="showValues" ${s.showValues ? 'checked' : ''}/> Show values</label></div>
      <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="showPercentages" ${s.showPercentages !== false ? 'checked' : ''}/> Show percentages</label></div>
      <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="showLabels" ${s.showLabels !== false ? 'checked' : ''}/> Show segment labels</label></div>
      <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="animation" ${s.animation !== false ? 'checked' : ''}/> Animation</label></div>
    `;
  }
  return `
    <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="showGridLines" ${s.showGridLines !== false ? 'checked' : ''}/> Show grid lines</label></div>
    <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="showValues" ${s.showValues !== false ? 'checked' : ''}/> Show values</label></div>
    <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="showAxisLabels" ${s.showAxisLabels !== false ? 'checked' : ''}/> Show axis labels</label></div>
    <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="showLegend" ${s.showLegend ? 'checked' : ''}/> Show legend</label></div>
    <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="animation" ${s.animation !== false ? 'checked' : ''}/> Animation</label></div>
  `;
}

/* ============================================================
   DIVIDERS — Continue / Numbered Divider / Line Divider / Spacer
   dedicated right-panel (Content / Design / Settings), dispatched
   early from renderRightTabContent for the 'Dividers' category.
   ============================================================ */

/* ============================================================
   KC NORMALIZER HELPERS
   ============================================================ */
// normalizeKcOptions / normalizeKcLeft / normalizeKcRight / normalizeKcItems /
// normalizeKcAnswers are defined in app.js (loaded first) so they are
// available to both lessonBuilder.js and learnerPreview.js globally.

/* ============================================================
   KC CONTENT PANEL FUNCTIONS (Rise-style authoring UI)
   ============================================================ */
function kcMcContentPanel(block, d) {
  const opts = normalizeKcOptions(d);
  const correct = d.correct ?? 0;
  return `
    <div class="field">
      <label>Question</label>
      <textarea class="textarea content-field" data-field="question" rows="3">${escapeHtml(d.question || '')}</textarea>
    </div>
    <div class="prop-section-title" style="margin-top:12px;">Answer Choices</div>
    <p class="text-xs text-muted mb-8">Select the radio button to mark the correct answer.</p>
    <div class="flex-col gap-6" id="kc-mc-answers">
      ${opts.map((o, i) => `
        <div class="flex items-center gap-8" data-i="${i}">
          <input type="radio" class="kc-correct-radio" name="kc-mc-correct" data-i="${i}" ${i === correct ? 'checked' : ''} title="Mark as correct" />
          <input class="input kc-answer-text" data-i="${i}" value="${escapeHtml(o)}" placeholder="Answer option…" style="flex:1; font-size:13px;" />
          <button class="btn-icon kc-answer-delete" data-i="${i}" title="Remove" ${opts.length <= 2 ? 'disabled' : ''}>✕</button>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-secondary btn-sm w-full mt-8 kc-answer-add">+ Add Answer</button>
  `;
}

function kcMrContentPanel(block, d) {
  const opts = normalizeKcOptions(d);
  const correct = Array.isArray(d.correct) ? d.correct : [];
  return `
    <div class="field">
      <label>Question</label>
      <textarea class="textarea content-field" data-field="question" rows="3">${escapeHtml(d.question || '')}</textarea>
    </div>
    <div class="prop-section-title" style="margin-top:12px;">Answer Choices</div>
    <p class="text-xs text-muted mb-8">Check all answers that are correct.</p>
    <div class="flex-col gap-6" id="kc-mr-answers">
      ${opts.map((o, i) => `
        <div class="flex items-center gap-8" data-i="${i}">
          <input type="checkbox" class="kc-correct-check" data-i="${i}" ${correct.includes(i) ? 'checked' : ''} title="Mark as correct" />
          <input class="input kc-answer-text" data-i="${i}" value="${escapeHtml(o)}" placeholder="Answer option…" style="flex:1; font-size:13px;" />
          <button class="btn-icon kc-answer-delete" data-i="${i}" title="Remove" ${opts.length <= 2 ? 'disabled' : ''}>✕</button>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-secondary btn-sm w-full mt-8 kc-answer-add">+ Add Answer</button>
  `;
}

function kcMatchingContentPanel(block, d) {
  const left = normalizeKcLeft(d);
  const right = normalizeKcRight(d);
  const count = Math.max(left.length, right.length);
  const rows = Array.from({ length: count }, (_, i) => ({ l: left[i] || '', r: right[i] || '' }));
  return `
    <div style="display:grid; grid-template-columns:1fr 1fr 28px; gap:6px; align-items:center; margin-bottom:6px;">
      <span class="text-xs text-muted" style="font-weight:600; padding-left:2px;">CHOICE</span>
      <span class="text-xs text-muted" style="font-weight:600; padding-left:2px;">MATCH</span>
      <span></span>
    </div>
    <div class="flex-col gap-6" id="kc-pairs">
      ${rows.map((row, i) => `
        <div style="display:grid; grid-template-columns:1fr 1fr 28px; gap:6px; align-items:center;" data-i="${i}">
          <input class="input kc-pair-left" data-i="${i}" value="${escapeHtml(row.l)}" placeholder="Choice…" style="font-size:13px;" />
          <input class="input kc-pair-right" data-i="${i}" value="${escapeHtml(row.r)}" placeholder="Match…" style="font-size:13px;" />
          <button class="btn-icon kc-pair-delete" data-i="${i}" title="Remove" ${rows.length <= 2 ? 'disabled' : ''}>✕</button>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-secondary btn-sm w-full mt-8 kc-pair-add">+ Add Pair</button>
    <p class="text-xs text-muted mt-8">Each Choice is the correct match for the item on the same row.</p>
  `;
}

function kcFillGapContentPanel(block, d) {
  const answers = normalizeKcAnswers(d);
  return `
    <div class="field">
      <label>Sentence with blank (use ____ for the gap)</label>
      <textarea class="textarea content-field" data-field="text" rows="3">${escapeHtml(d.text || '')}</textarea>
    </div>
    <div class="prop-section-title" style="margin-top:12px;">Acceptable Answers</div>
    <div class="flex-col gap-6" id="kc-accepted">
      ${answers.map((a, i) => `
        <div class="flex items-center gap-8" data-i="${i}">
          <input class="input kc-accepted-text" data-i="${i}" value="${escapeHtml(a)}" placeholder="Acceptable answer…" style="flex:1; font-size:13px;" />
          <button class="btn-icon kc-accepted-delete" data-i="${i}" title="Remove" ${answers.length <= 1 ? 'disabled' : ''}>✕</button>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-secondary btn-sm w-full mt-8 kc-accepted-add">+ Add Acceptable Answer</button>
    <div class="field mt-8">
      <label class="flex items-center gap-8" style="cursor:pointer; font-size:13px;">
        <input type="checkbox" class="kc-case-sensitive" ${d.caseSensitive ? 'checked' : ''} />
        Case-sensitive matching
      </label>
    </div>
  `;
}

function kcOrderingContentPanel(block, d) {
  const items = normalizeKcItems(d);
  return `
    <div class="prop-section-title">Items in Correct Order</div>
    <div class="flex-col gap-6" id="kc-items">
      ${items.map((item, i) => `
        <div class="flex items-center gap-6" data-i="${i}">
          <span class="pill pill-grey" style="flex-shrink:0; min-width:22px; text-align:center; font-size:11px;">${i + 1}</span>
          <input class="input kc-item-text" data-i="${i}" value="${escapeHtml(item)}" placeholder="Item…" style="flex:1; font-size:13px;" />
          <button class="btn-icon kc-item-up"   data-i="${i}" title="Move up"   ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-icon kc-item-down" data-i="${i}" title="Move down" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-icon kc-item-delete" data-i="${i}" title="Remove" ${items.length <= 2 ? 'disabled' : ''}>✕</button>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-secondary btn-sm w-full mt-8 kc-item-add">+ Add Item</button>
    <p class="text-xs text-muted mt-8">Learners see these items in a shuffled order and must rearrange them into the correct sequence.</p>
  `;
}

/* ============================================================
   KC SETTINGS PANEL — Assessment Rules for all kc_* block types.
   ============================================================ */
function kcSettingsPanel(block) {
  const s = block.settings || {};
  const maxAttempts = s.maxAttempts ?? 0;
  const FIXED_ATTEMPT_OPTIONS = [1, 2, 3, 5];
  const attVal = maxAttempts === 0 ? 'unlimited' : FIXED_ATTEMPT_OPTIONS.includes(maxAttempts) ? String(maxAttempts) : 'custom';
  const isCustom = attVal === 'custom';
  const showCA  = s.showCorrectAnswer  || 'immediately';
  const compRule = s.completionRule    || 'submitted';
  const passMode = s.passingMode       || 'all_correct';
  return `
    <div class="prop-section-title">Assessment Rules</div>

    <div class="field">
      <label>Attempts Allowed</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <select class="input settings-kc-attempts" data-field="maxAttempts" style="flex:1;">
          <option value="unlimited" ${attVal === 'unlimited' ? 'selected' : ''}>Unlimited</option>
          <option value="1"  ${attVal === '1'  ? 'selected' : ''}>1</option>
          <option value="2"  ${attVal === '2'  ? 'selected' : ''}>2</option>
          <option value="3"  ${attVal === '3'  ? 'selected' : ''}>3</option>
          <option value="5"  ${attVal === '5'  ? 'selected' : ''}>5</option>
          <option value="custom" ${attVal === 'custom' ? 'selected' : ''}>Custom</option>
        </select>
        <input type="number" class="input settings-num" id="kc-custom-attempts" data-field="maxAttempts"
          style="width:72px; ${isCustom ? '' : 'display:none;'}" min="1" max="99"
          value="${isCustom ? maxAttempts : 5}" />
      </div>
    </div>

    <div class="field">
      <label class="flex items-center gap-8">
        <input type="checkbox" class="settings-field" data-field="allowRetry"
          ${s.allowRetry !== false ? 'checked' : ''} />
        Allow Retry
      </label>
    </div>

    <div class="field">
      <label class="flex items-center gap-8">
        <input type="checkbox" class="settings-field" data-field="lockAfterFinalAttempt"
          ${s.lockAfterFinalAttempt !== false ? 'checked' : ''} />
        Lock After Final Attempt
      </label>
      <p class="text-xs text-muted mt-4">When on, the block locks once Attempts Allowed is reached. When off, learners can keep trying past the limit (Allow Retry must also be on).</p>
    </div>

    <div class="field">
      <label class="flex items-center gap-8">
        <input type="checkbox" class="settings-field" data-field="requireCorrectAnswer"
          ${s.requireCorrectAnswer ? 'checked' : ''} />
        Require Correct Answer to Complete
      </label>
    </div>

    <div class="field">
      <label>Show Correct Answer</label>
      <select class="input settings-select-str" data-field="showCorrectAnswer">
        <option value="immediately" ${showCA === 'immediately' ? 'selected' : ''}>Immediately</option>
        <option value="after_final" ${showCA === 'after_final' ? 'selected' : ''}>After Final Attempt</option>
        <option value="never"       ${showCA === 'never'       ? 'selected' : ''}>Never</option>
      </select>
    </div>

    <div class="field">
      <label>Completion Rule</label>
      <select class="input settings-select-str" data-field="completionRule">
        <option value="submitted" ${compRule === 'submitted' ? 'selected' : ''}>Submitted</option>
        <option value="passed"    ${compRule === 'passed'    ? 'selected' : ''}>Passed</option>
      </select>
    </div>

    <div class="field">
      <label>Passing Requirement</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <select class="input settings-select-str" data-field="passingMode" style="flex:1;">
          <option value="all_correct" ${passMode === 'all_correct' ? 'selected' : ''}>All Correct</option>
          <option value="percentage"  ${passMode === 'percentage'  ? 'selected' : ''}>Percentage</option>
        </select>
        <div id="kc-pct-wrap" style="display:${passMode === 'percentage' ? 'flex' : 'none'}; align-items:center; gap:4px;">
          <input type="number" class="input settings-num" data-field="passingPercentage"
            style="width:64px;" min="1" max="100" value="${s.passingPercentage ?? 80}" />
          <span class="text-sm text-muted">%</span>
        </div>
      </div>
    </div>

    <div class="prop-section-title" style="margin-top:16px;">Feedback</div>

    <div class="field">
      <label>Correct Feedback</label>
      <input class="input settings-text" data-field="correctFeedback"
        value="${escapeHtml(s.correctFeedback ?? 'Correct! Well done.')}" />
    </div>
    <div class="field">
      <label>Incorrect Feedback</label>
      <input class="input settings-text" data-field="incorrectFeedback"
        value="${escapeHtml(s.incorrectFeedback ?? 'Not quite. Please try again.')}" />
    </div>
    <p class="text-sm text-muted mt-8">This is an in-lesson Knowledge Check. Configure passing thresholds and feedback above.</p>
  `;
}

function renderDividerBlockPanel(block, index) {
  block.data = block.data || {};
  block.design = block.design || {};
  block.settings = block.settings || {};
  if (BuilderUI.rightTab === 'design') return dividerDesignPanel(block);
  if (BuilderUI.rightTab === 'settings') return dividerSettingsPanel(block);
  return dividerContentPanel(block);
}

function dividerContentPanel(block) {
  const d = block.data;
  switch (block.type) {
    case 'continue': {
      const completionType = d.completionType || 'none';
      return `
        <div class="prop-section">
          <div class="prop-section-title">Label</div>
          <input class="input divider-field" data-field="label" value="${escapeHtml(d.label || 'Continue')}" placeholder="Continue" />
          <p class="text-sm text-muted mt-4">You can also edit this directly on the canvas.</p>
        </div>
        <div class="prop-section">
          <div class="prop-section-title">Hint Text</div>
          <textarea class="textarea divider-field" data-field="hint" rows="2" placeholder="Complete the section above to continue">${escapeHtml(d.hint || '')}</textarea>
          <p class="text-sm text-muted mt-4">Shown to the learner only while the button is locked.</p>
        </div>
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Completion Type</div>
          <select class="input divider-field" data-field="completionType">
            <option value="none" ${completionType === 'none' ? 'selected' : ''}>None — Always Show Button</option>
            <option value="directly_above" ${completionType === 'directly_above' ? 'selected' : ''}>Complete Block Directly Above</option>
            <option value="all_above" ${completionType === 'all_above' ? 'selected' : ''}>Complete All Blocks Above</option>
          </select>
        </div>`;
    }
    case 'numbered_divider':
      return `
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Marker Text</div>
          <input class="input divider-field" data-field="marker" value="${escapeHtml(d.marker || '1')}" placeholder="1, A, STEP 1..." />
          <p class="text-sm text-muted mt-4">You can also edit this directly on the canvas.</p>
        </div>`;
    case 'line_divider':
      return `<p class="text-sm text-muted">This block has no content options — use the Design tab to style the line.</p>`;
    case 'spacer':
      return `<p class="text-sm text-muted">This block has no content options — use the Design tab to set its height.</p>`;
    default:
      return '';
  }
}

// Account Management Finalization Sprint, Phase 7: Top/Bottom Padding for
// Divider-family blocks (Continue, Numbered Divider, Line Divider, Spacer)
// — these never had any padding controls at all (unlike Text-category
// blocks, which already have their own Spacing section). Applied on the
// block's own inner wrapper, layered on top of the shared .block-content-
// area padding — same pattern Text/Statement/Quote blocks already use.
function dividerSpacingStyle(ds) {
  return `padding-top:${ds.paddingTop ?? 0}px; padding-bottom:${ds.paddingBottom ?? 0}px; padding-left:${ds.paddingLeft ?? 0}px; padding-right:${ds.paddingRight ?? 0}px;`;
}
function dividerSpacingFields(ds) {
  return `
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Spacing</div>
      <p class="text-sm text-muted mb-8">Top Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingTop" min="0" max="120" value="${ds.paddingTop ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 0}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="120" value="${ds.paddingBottom ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 0}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Left Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingLeft" min="0" max="120" value="${ds.paddingLeft ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingLeft ?? 0}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Right Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingRight" min="0" max="120" value="${ds.paddingRight ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingRight ?? 0}px</span>
      </div>
    </div>`;
}

function dividerDesignPanel(block) {
  const ds = block.design;
  switch (block.type) {
    case 'continue': return continueDesignFields(ds);
    case 'numbered_divider': return numberedDividerDesignFields(ds);
    case 'line_divider': return lineDividerDesignFields(ds);
    case 'spacer': return spacerDesignFields(ds);
    default: return '';
  }
}

function dividerSettingsPanel(block) {
  const s = block.settings;
  if (block.type === 'continue') {
    return `
      <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="animation" ${s.animation !== false ? 'checked' : ''}/> Enable animation</label></div>
      <div class="field"><label class="flex items-center gap-8"><input type="checkbox" class="settings-field" data-field="completionTracking" ${s.completionTracking !== false ? 'checked' : ''}/> Enable completion tracking</label></div>`;
  }
  return `<p class="text-sm text-muted">No additional settings for this block.</p>`;
}

function colorSwatchInput(prop, value, label) {
  return `<div class="flex items-center gap-12 mb-8">
    <input type="color" class="design-color-input" data-prop="${prop}" value="${value}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
    <span class="text-sm text-muted">${label}</span>
  </div>`;
}

function lineDividerDesignFields(ds) {
  return `
    <div class="prop-section">
      <div class="prop-section-title">Line</div>
      ${colorSwatchInput('lineColor', (ds.lineColor || '').startsWith('#') ? ds.lineColor : '#D9D9E3', 'Line colour')}
      <label>Thickness</label>
      <div class="flex items-center gap-8 mb-8">
        <input type="range" class="design-range" data-prop="thickness" min="1" max="12" value="${ds.thickness ?? 1}" style="flex:1;" />
        <span class="range-val text-sm text-muted">${ds.thickness ?? 1}px</span>
      </div>
      <label>Style</label>
      ${segControl('design-linedivider-style', 'lineStyle', [{id:'solid',label:'Solid'},{id:'dashed',label:'Dashed'},{id:'dotted',label:'Dotted'}], ds.lineStyle || 'solid')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Layout</div>
      <label>Width</label>
      <div class="flex items-center gap-8 mb-8">
        <input type="range" class="design-range" data-prop="width" data-suffix="%" min="10" max="100" value="${ds.width ?? 100}" style="flex:1;" />
        <span class="range-val text-sm text-muted">${ds.width ?? 100}%</span>
      </div>
      <label class="mt-8">Alignment</label>
      ${segControl('design-linedivider-align', 'align', [{id:'left',label:'Left'},{id:'center',label:'Center'},{id:'right',label:'Right'},{id:'full',label:'Full Width'}], ds.align || 'full')}
    </div>
    ${dividerSpacingFields(ds)}`;
}

function numberedDividerDesignFields(ds) {
  return `
    <div class="prop-section">
      <div class="prop-section-title">Line</div>
      ${colorSwatchInput('lineColor', (ds.lineColor || '').startsWith('#') ? ds.lineColor : '#D9D9E3', 'Line colour')}
      <label>Thickness</label>
      <div class="flex items-center gap-8 mb-8">
        <input type="range" class="design-range" data-prop="lineThickness" min="1" max="12" value="${ds.lineThickness ?? 1}" style="flex:1;" />
        <span class="range-val text-sm text-muted">${ds.lineThickness ?? 1}px</span>
      </div>
      <label>Style</label>
      ${segControl('design-numdivider-linestyle', 'lineStyle', [{id:'solid',label:'Solid'},{id:'dashed',label:'Dashed'},{id:'dotted',label:'Dotted'}], ds.lineStyle || 'solid')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Marker</div>
      ${colorSwatchInput('markerFill', (ds.markerFill || '').startsWith('#') ? ds.markerFill : '#7C3AED', 'Fill colour')}
      ${colorSwatchInput('markerBorderColor', ds.markerBorderColor || '#ffffff', 'Border colour')}
      ${colorSwatchInput('markerTextColor', ds.markerTextColor || '#ffffff', 'Text colour')}
      <label>Shape</label>
      ${segControl('design-numdivider-shape', 'markerShape', [{id:'circle',label:'Circle'},{id:'square',label:'Square'},{id:'rounded',label:'Rounded Square'}], ds.markerShape || 'circle')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Size</div>
      <label>Marker Size</label>
      <div class="flex items-center gap-8 mb-8">
        <input type="range" class="design-range" data-prop="markerSize" min="20" max="64" value="${ds.markerSize ?? 32}" style="flex:1;" />
        <span class="range-val text-sm text-muted">${ds.markerSize ?? 32}px</span>
      </div>
      <label>Font Size</label>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="fontSize" min="10" max="28" value="${ds.fontSize ?? 14}" style="flex:1;" />
        <span class="range-val text-sm text-muted">${ds.fontSize ?? 14}px</span>
      </div>
    </div>
    ${dividerSpacingFields(ds)}`;
}

function spacerDesignFields(ds) {
  const preset = ds.heightPreset || 'md';
  return `
    <div class="prop-section">
      <div class="prop-section-title">Height</div>
      ${segControl('design-spacer-height', 'heightPreset', [{id:'xs',label:'XS'},{id:'sm',label:'S'},{id:'md',label:'M'},{id:'lg',label:'L'},{id:'xl',label:'XL'},{id:'custom',label:'Custom'}], preset)}
      ${preset === 'custom' ? `
        <div class="flex items-center gap-8 mt-12">
          <input type="range" class="design-range" data-prop="customHeight" min="0" max="400" value="${ds.customHeight ?? 64}" style="flex:1;" />
          <span class="range-val text-sm text-muted">${ds.customHeight ?? 64}px</span>
        </div>` : ''}
    </div>
    ${dividerSpacingFields(ds)}`;
}

function continueDesignFields(ds) {
  const bgStyles = [
    { id: 'theme', label: 'Theme' },
    { id: 'tint', label: 'Theme Tint' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'black', label: 'Black' },
    { id: 'custom', label: 'Custom' },
  ];
  const bgStyle = (ds.bgStyle && ds.bgStyle !== 'image') ? ds.bgStyle : 'theme';
  return `
    <div class="prop-section">
      <div class="prop-section-title">Background</div>
      ${segControl('design-continue-bg', 'bgStyle', bgStyles, bgStyle)}
      ${bgStyle === 'custom' ? colorSwatchInput('customBg', ds.customBg || '#ffffff', 'Custom background colour') : ''}
      <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="continue-bg-image-toggle" ${ds.bgStyle === 'image' ? 'checked' : ''}/> Use background image</label>
      ${ds.bgStyle === 'image' ? `
        <div class="flex items-center gap-12 mt-8" style="flex-wrap:wrap; row-gap:8px;">
          <div class="media-thumb" style="width:64px; height:48px; border-radius:var(--r-sm); overflow:hidden; background:var(--surface-50); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${ds.bgImage ? `<img src="${ds.bgImage}" style="width:100%; height:100%; object-fit:cover;" />` : `<span style="font-size:18px; opacity:0.5;">🖼️</span>`}
          </div>
          <button class="btn btn-secondary btn-sm continue-bg-image-trigger">${ds.bgImage ? '🔄 Replace Image' : '📤 Upload Image'}</button>
          ${ds.bgImage ? `<button class="btn btn-ghost btn-sm continue-bg-image-remove" style="color:#E5484D;">🗑️ Remove</button>` : ''}
        </div>` : ''}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Button Size</div>
      <label>Width</label>
      ${segControl('design-continue-width', 'btnWidth', [{id:'auto',label:'Auto'},{id:'full',label:'Full Width'}], ds.btnWidth || 'auto')}
      <label class="mt-8">Height</label>
      <div class="flex items-center gap-8 mb-8">
        <input type="range" class="design-range" data-prop="btnHeight" min="32" max="80" value="${ds.btnHeight ?? 44}" style="flex:1;" />
        <span class="range-val text-sm text-muted">${ds.btnHeight ?? 44}px</span>
      </div>
      <label>Radius</label>
      ${segControl('design-continue-radius', 'btnRadius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.btnRadius || 'soft')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Button Colour</div>
      ${colorSwatchInput('btnFillColor', ds.btnFillColor || '#7C3AED', 'Fill colour')}
      ${colorSwatchInput('btnTextColor', ds.btnTextColor || '#ffffff', 'Text colour')}
      <label class="flex items-center gap-8"><input type="checkbox" class="design-checkbox" data-prop="btnBorder" ${ds.btnBorder ? 'checked' : ''}/> Show border</label>
      ${ds.btnBorder ? colorSwatchInput('btnBorderColor', ds.btnBorderColor || '#000000', 'Border colour') : ''}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Alignment</div>
      ${segControl('design-continue-align', 'align', [{id:'left',label:'Left'},{id:'center',label:'Center'},{id:'right',label:'Right'}], ds.align || 'center')}
    </div>
    ${dividerSpacingFields(ds)}`;
}

function segControl(id, prop, options, current) {
  return `<div class="seg-control" data-prop="${prop}" id="${id}">
    ${options.map(o => `<button data-val="${o.id}" class="${current===o.id?'active':''}">${o.label}</button>`).join('')}
  </div>`;
}

/* Segmented control bound to block.settings (Settings tab) rather than
   block.design — e.g. Accordion's Single/Multiple Open. */
function segControlSettings(id, prop, options, current) {
  return `<div class="seg-control" data-sprop="${prop}" id="${id}">
    ${options.map(o => `<button data-val="${o.id}" class="${current===o.id?'active':''}">${o.label}</button>`).join('')}
  </div>`;
}

/* Avatar + background image upload controls for the Quote on Image block (Content tab). */
function quoteImageUploadFields(block) {
  const d = block.data || {};
  return `
    ${mediaPickerAvatarField(d, 'avatar', 'Avatar Image', 'Avatar')}
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Background Image</div>
      <div class="flex items-center gap-12 mt-8">
        <div class="media-thumb" style="width:48px; height:36px; border-radius:var(--r-sm); overflow:hidden; background:var(--surface-50); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${d.background ? `<img src="${AssetStore.resolveMediaSrc(d.background)}" style="width:100%; height:100%; object-fit:cover;" />` : `<span style="font-size:18px; opacity:0.5;">🖼️</span>`}
        </div>
        <button class="btn btn-secondary btn-sm media-picker-trigger" data-target="background" data-title="Background Image">${d.background ? '🔄 Replace Background' : '📤 Upload Background'}</button>
        ${d.background ? `<button class="btn btn-ghost btn-sm media-picker-remove" data-target="background" style="color:#E5484D;">🗑️ Remove</button>` : ''}
      </div>
    </div>`;
}

/* Generic avatar field using the shared Media Picker (thumbnail + Upload/Replace + Remove). */
function mediaPickerAvatarField(d, target, title, label, noBorder) {
  return `
    <div class="prop-section" ${noBorder ? 'style="border-bottom:none;"' : ''}>
      <div class="prop-section-title">${label}</div>
      <div class="flex items-center gap-12 mt-8">
        <div class="media-thumb" style="width:48px; height:48px; border-radius:50%; overflow:hidden; background:var(--surface-50); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${d[target] ? `<img src="${AssetStore.resolveMediaSrc(d[target])}" style="width:100%; height:100%; object-fit:cover;" />` : `<span style="font-size:18px; opacity:0.5;">🖼️</span>`}
        </div>
        <button class="btn btn-secondary btn-sm media-picker-trigger" data-target="${target}" data-title="${title}">${d[target] ? `🔄 Replace ${label}` : `📤 Upload ${label}`}</button>
        ${d[target] ? `<button class="btn btn-ghost btn-sm media-picker-remove" data-target="${target}" style="color:#E5484D;">🗑️ Remove</button>` : ''}
      </div>
    </div>`;
}

/* Avatar-only upload section for Quote Style 1-4 (no background image; Content tab). */
function quoteAvatarOnlyFields(block) {
  const d = block.data || {};
  return `
    ${mediaPickerAvatarField(d, 'avatar', 'Avatar Image', 'Avatar', true)}`;
}

/* Generic rectangular image field using the shared Media Picker — for
   Image, Image & Text, and Text on Image blocks. */
function mediaPickerImageField(d, target, title, label, noBorder, namespace) {
  const ns = namespace || 'data';
  return `
    <div class="prop-section" ${noBorder ? 'style="border-bottom:none;"' : ''}>
      <div class="prop-section-title">${label}</div>
      <div class="flex items-center gap-12 mt-8" style="flex-wrap:wrap; row-gap:8px;">
        <div class="media-thumb" style="width:64px; height:48px; border-radius:var(--r-sm); overflow:hidden; background:var(--surface-50); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${d[target] ? `<img src="${AssetStore.resolveMediaSrc(d[target])}" style="width:100%; height:100%; object-fit:cover;" />` : `<span style="font-size:18px; opacity:0.5;">🖼️</span>`}
        </div>
        <div class="flex items-center gap-8" style="flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm media-picker-trigger" data-target="${target}" data-title="${title}" data-namespace="${ns}">${d[target] ? `🔄 Replace ${label}` : `📤 Upload ${label}`}</button>
          ${d[target] ? `<button class="btn btn-ghost btn-sm media-picker-remove" data-target="${target}" data-namespace="${ns}" style="color:#E5484D;">🗑️ Remove</button>` : ''}
        </div>
      </div>
    </div>`;
}

/* Audio file field using the shared Media Picker — Upload/Replace/Remove. */
function mediaPickerAudioField(d, target, title, label) {
  const fileName = d[target + 'FileName'];
  return `
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">${label}</div>
      <div class="flex items-center gap-12 mt-8" style="flex-wrap:wrap; row-gap:8px;">
        <div class="media-thumb" style="width:48px; height:48px; border-radius:var(--r-sm); overflow:hidden; background:var(--surface-50); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <span style="font-size:20px;">🎵</span>
        </div>
        <div style="flex:1; min-width:80px;">
          ${d[target]
            ? `<div class="text-sm" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(fileName || 'Audio file')}</div>`
            : `<div class="text-sm text-muted">No audio uploaded</div>`}
        </div>
        <div class="flex items-center gap-8" style="flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm media-picker-trigger" data-target="${target}" data-kind="audio" data-title="${title}">${d[target] ? '🔄 Replace Audio' : '📤 Upload Audio'}</button>
          ${d[target] ? `<button class="btn btn-ghost btn-sm media-picker-remove" data-target="${target}" style="color:#E5484D;">🗑️ Remove Audio</button>` : ''}
        </div>
      </div>
      <p class="text-sm text-muted mt-8">Supported formats: MP3, WAV, M4A, OGG · Max size 100MB.</p>
    </div>`;
}

/* Video file field using the shared Media Picker — Upload/Replace/Remove. */
function mediaPickerVideoField(d, target, title, label) {
  const fileName = d[target + 'FileName'];
  const fileSize = d[target + 'FileSize'];
  return `
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">${label}</div>
      <div class="flex items-center gap-12 mt-8" style="flex-wrap:wrap; row-gap:8px;">
        <div class="media-thumb" style="width:64px; height:48px; border-radius:var(--r-sm); overflow:hidden; background:var(--surface-50); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${d[target] ? `<video src="${d[target]}" style="width:100%; height:100%; object-fit:cover;" muted></video>` : `<span style="font-size:20px; opacity:0.5;">🎬</span>`}
        </div>
        <div style="flex:1; min-width:80px;">
          ${d[target]
            ? `<div class="text-sm" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(fileName || 'Video file')}</div>
               <div class="text-sm text-muted">${formatFileSize(fileSize)}</div>`
            : `<div class="text-sm text-muted">No video uploaded</div>`}
        </div>
        <div class="flex items-center gap-8" style="flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm media-picker-trigger" data-target="${target}" data-kind="video" data-title="${title}">${d[target] ? '🔄 Replace' : '📤 Upload Video'}</button>
          ${d[target] ? `<button class="btn btn-ghost btn-sm media-picker-remove" data-target="${target}" style="color:#E5484D;">🗑️ Remove</button>` : ''}
        </div>
      </div>
      <p class="text-sm text-muted mt-8">Supported formats: MP4, WEBM, MOV · Max size 500MB.</p>
    </div>`;
}

/* File attachment field using the shared Media Picker — Upload/Replace/Remove. */
function mediaPickerFileField(d, target, title, label) {
  const fileName = d[target + 'FileName'];
  const fileSize = d[target + 'FileSize'];
  return `
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">${label}</div>
      <div class="flex items-center gap-12 mt-8" style="flex-wrap:wrap; row-gap:8px;">
        <div class="media-thumb" style="width:48px; height:48px; border-radius:var(--r-sm); overflow:hidden; background:var(--surface-50); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <span style="font-size:20px;">📎</span>
        </div>
        <div style="flex:1; min-width:80px;">
          ${d[target]
            ? `<div class="text-sm" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(fileName || 'Attachment')}</div>
               <div class="text-sm text-muted">${formatFileSize(fileSize)}</div>`
            : `<div class="text-sm text-muted">No file uploaded</div>`}
        </div>
        <div class="flex items-center gap-8" style="flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm media-picker-trigger" data-target="${target}" data-kind="file" data-title="${title}">${d[target] ? '🔄 Replace' : '📤 Upload Attachment'}</button>
          ${d[target] ? `<button class="btn btn-ghost btn-sm media-picker-remove" data-target="${target}" style="color:#E5484D;">🗑️ Remove</button>` : ''}
        </div>
      </div>
      <p class="text-sm text-muted mt-8">Supported formats: PDF, DOCX, PPTX, XLSX, CSV, TXT, ZIP · Max size 100MB.</p>
    </div>`;
}

/* Audio block — Content / Design / Settings panels. */
function renderAudioBlockPanel(block, index) {
  block.design = block.design || {};
  block.settings = block.settings || {};
  const ds = block.design;
  const s = block.settings;
  const d = block.data || {};

  if (BuilderUI.rightTab === 'settings') {
    return `
      <div class="field">
        <label>Block ID</label>
        <input class="input" value="block-${index + 1}" disabled style="opacity:0.6;" />
      </div>
      <div class="prop-section">
        <div class="prop-section-title">Playback</div>
        <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="settings-field" data-field="autoplay" ${s.autoplay ? 'checked' : ''}/> Autoplay</label>
        <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="settings-field" data-field="loop" ${s.loop ? 'checked' : ''}/> Loop</label>
      </div>
      <div class="prop-section" style="border-bottom:none;">
        <div class="prop-section-title">Controls</div>
        <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="settings-field" data-field="allowDownload" ${s.allowDownload === false ? '' : 'checked'}/> Allow Download</label>
        <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="settings-field" data-field="showPlaybackSpeed" ${s.showPlaybackSpeed === false ? '' : 'checked'}/> Show Playback Speed</label>
        <p class="text-sm text-muted mt-8">When enabled, learners can choose a playback speed: 0.75x, 1x, 1.25x, 1.5x, 2x.</p>
      </div>
    `;
  }

  if (BuilderUI.rightTab === 'design') {
    return `
      <div class="prop-section">
        <div class="prop-section-title">Width</div>
        ${segControl('design-audiowidth', 'width', [{id:'small',label:'Small'},{id:'medium',label:'Medium'},{id:'large',label:'Large'},{id:'full',label:'Full Width'}], ds.width || 'medium')}
      </div>
      <div class="prop-section">
        <div class="prop-section-title">Corner Radius</div>
        ${segControl('design-audioradius', 'radius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.radius || 'soft')}
      </div>
      <div class="prop-section" style="border-bottom:none;">
        <div class="prop-section-title">Spacing</div>
        <p class="text-sm text-muted mb-8">Top Padding</p>
        <div class="flex items-center gap-8">
          <input type="range" class="design-range" data-prop="paddingTop" min="0" max="100" value="${ds.paddingTop ?? 22}" style="flex:1;" />
          <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 22}px</span>
        </div>
        <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
        <div class="flex items-center gap-8">
          <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="100" value="${ds.paddingBottom ?? 22}" style="flex:1;" />
          <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 22}px</span>
        </div>
      </div>
    `;
  }

  // CONTENT TAB
  return `
    ${mediaPickerAudioField(d, 'src', 'Audio File', 'Audio File')}
    <p class="text-sm text-muted mt-8">Click directly on the caption below the audio player on the canvas to edit it.</p>
    <div class="field mt-12">
      <label>Transcript</label>
      <textarea class="textarea content-field" data-field="transcript" rows="6" placeholder="Add a plain-text transcript (optional)">${d.transcript || ''}</textarea>
    </div>
  `;
}

/* Video block — Content / Design / Settings panels. */
function renderVideoBlockPanel(block, index) {
  block.design = block.design || {};
  block.settings = block.settings || {};
  const ds = block.design;
  const s = block.settings;
  const d = block.data || {};

  if (BuilderUI.rightTab === 'settings') {
    return `
      <div class="field">
        <label>Block ID</label>
        <input class="input" value="block-${index + 1}" disabled style="opacity:0.6;" />
      </div>
      <div class="prop-section">
        <div class="prop-section-title">Delivery</div>
        <select class="input settings-select-str" data-field="deliveryMode">
          <option value="embed" ${s.deliveryMode === 'linked' ? '' : 'selected'}>Embedded Video</option>
          <option value="linked" ${s.deliveryMode === 'linked' ? 'selected' : ''}>External Linked Video</option>
        </select>
        <p class="text-sm text-muted mt-8">Embedded plays in the lesson. Linked shows a thumbnail card with a "Watch Video" button — use this for videos you know the publisher has blocked from embedding. Embedded YouTube videos also fall back to this card automatically if YouTube reports the embed is blocked.</p>
      </div>
      <div class="prop-section">
        <div class="prop-section-title">Playback</div>
        <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="settings-field" data-field="autoplay" ${s.autoplay ? 'checked' : ''}/> Autoplay</label>
        <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="settings-field" data-field="loop" ${s.loop ? 'checked' : ''}/> Loop</label>
      </div>
      <div class="prop-section" style="border-bottom:none;">
        <div class="prop-section-title">Controls</div>
        <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="settings-field" data-field="allowDownload" ${s.allowDownload === false ? '' : 'checked'}/> Allow Download</label>
        <label class="flex items-center gap-8 mt-8"><input type="checkbox" class="settings-field" data-field="showPlaybackSpeed" ${s.showPlaybackSpeed === false ? '' : 'checked'}/> Show Playback Speed</label>
        <p class="text-sm text-muted mt-8">When enabled, learners can choose a playback speed: 0.75x, 1x, 1.25x, 1.5x, 2x.</p>
      </div>
    `;
  }

  if (BuilderUI.rightTab === 'design') {
    return `
      <div class="prop-section">
        <div class="prop-section-title">Width</div>
        ${segControl('design-videowidth', 'width', [{id:'small',label:'Small'},{id:'medium',label:'Medium'},{id:'large',label:'Large'},{id:'full',label:'Full Width'}], ds.width || 'medium')}
      </div>
      <div class="prop-section">
        <div class="prop-section-title">Corner Radius</div>
        ${segControl('design-videoradius', 'radius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.radius || 'soft')}
      </div>
      <div class="prop-section" style="border-bottom:none;">
        <div class="prop-section-title">Spacing</div>
        <p class="text-sm text-muted mb-8">Top Padding</p>
        <div class="flex items-center gap-8">
          <input type="range" class="design-range" data-prop="paddingTop" min="0" max="100" value="${ds.paddingTop ?? 22}" style="flex:1;" />
          <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 22}px</span>
        </div>
        <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
        <div class="flex items-center gap-8">
          <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="100" value="${ds.paddingBottom ?? 22}" style="flex:1;" />
          <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 22}px</span>
        </div>
      </div>
    `;
  }

  // CONTENT TAB
  return `
    ${mediaPickerVideoField(d, 'src', 'Video File', 'Video File')}
    <p class="text-sm text-muted mt-8">Click directly on the caption below the video player on the canvas to edit it.</p>
    <div class="field mt-12">
      <label>Transcript</label>
      <textarea class="textarea content-field" data-field="transcript" rows="6" placeholder="Add a plain-text transcript (optional)">${d.transcript || ''}</textarea>
    </div>
    <div class="prop-section mt-16" style="border-top:1px solid var(--border); padding-top:16px;">
      <div class="prop-section-title">Embed URL (optional)</div>
      <p class="text-sm text-muted mb-8">YouTube, Vimeo, or a direct MP4 link. Used only if no video file is uploaded above.</p>
      <input class="input content-field" data-field="url" value="${d.url || ''}" placeholder="https://youtube.com/... or https://example.com/video.mp4" />
    </div>
    <div class="prop-section mt-16" style="border-bottom:none; border-top:1px solid var(--border); padding-top:16px;">
      <div class="prop-section-title">Subtitles / Captions (optional)</div>
      <p class="text-sm text-muted mb-8">Upload a VTT or SRT file, or paste subtitle/transcript text below. Adds a CC button to the video player.</p>
      <div class="flex items-center gap-8" style="flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" id="subtitle-upload-trigger">${d.subtitles ? '🔄 Replace Subtitles File' : '📤 Upload Subtitles (VTT/SRT)'}</button>
        ${d.subtitles ? `<button class="btn btn-ghost btn-sm" id="subtitle-remove" style="color:#E5484D;">🗑️ Remove</button>` : ''}
        <input type="file" id="subtitle-file-input" accept=".vtt,.srt,text/vtt" style="display:none" />
      </div>
      <textarea class="textarea content-field mt-8" data-field="subtitles" rows="5" placeholder="Or paste WebVTT / SRT subtitle text here">${escapeHtml(d.subtitles || '')}</textarea>
    </div>
  `;
}

/* File Attachment block — Content / Design / Settings panels. */
function renderFileBlockPanel(block, index) {
  block.design = block.design || {};
  const ds = block.design;
  const d = block.data || {};

  if (BuilderUI.rightTab === 'settings') {
    return `
      <div class="field">
        <label>Block ID</label>
        <input class="input" value="block-${index + 1}" disabled style="opacity:0.6;" />
      </div>
      <p class="text-sm text-muted">No additional settings for this block.</p>
    `;
  }

  if (BuilderUI.rightTab === 'design') {
    return `
      <div class="prop-section">
        <div class="prop-section-title">Corner Radius</div>
        ${segControl('design-fileradius', 'radius', [{id:'sharp',label:'Sharp'},{id:'soft',label:'Soft'},{id:'round',label:'Round'}], ds.radius || 'soft')}
      </div>
      <div class="prop-section" style="border-bottom:none;">
        <div class="prop-section-title">Spacing</div>
        <p class="text-sm text-muted mb-8">Top Padding</p>
        <div class="flex items-center gap-8">
          <input type="range" class="design-range" data-prop="paddingTop" min="0" max="100" value="${ds.paddingTop ?? 8}" style="flex:1;" />
          <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 8}px</span>
        </div>
        <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
        <div class="flex items-center gap-8">
          <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="100" value="${ds.paddingBottom ?? 8}" style="flex:1;" />
          <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 8}px</span>
        </div>
      </div>
    `;
  }

  // CONTENT TAB
  return mediaPickerFileField(d, 'src', 'Attachment File', 'Attachment File');
}

function blockTypeDesignFields(block, ds) {
  const cat = blockCategory(block.type);
  switch (cat) {
    case 'Knowledge Checks':
      return interactiveBorderPaddingFields(ds);
    case 'Text':
      return `
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Text Size</div>
          ${segControl('design-textsize', 'textSize', [{id:'sm',label:'Small'},{id:'md',label:'Medium'},{id:'lg',label:'Large'}], ds.textSize || 'md')}
        </div>`;
    case 'Quotes': {
      const quoteFontColorOptions = [
        { id: 'theme', label: 'Theme' },
        { id: 'black', label: 'Black' },
        { id: 'white', label: 'White' },
        { id: 'grey', label: 'Grey' },
      ];
      const activeQuoteFontColor = (!ds.fontColor || ds.fontColor === 'theme') ? 'theme' : (TEXT_COLOR_MAP[ds.fontColor] ? ds.fontColor : 'custom');
      return `
        ${block.type === 'quote_carousel' ? quoteCardBgFields(ds) : ''}
        ${block.type === 'quote_carousel' ? `
        <div class="prop-section">
          <div class="prop-section-title">Card Alignment</div>
          <p class="text-xs text-muted mb-8">How the row of cards sits within the block — separate from each quote's own text alignment.</p>
          ${segControl('design-cardalign', 'cardAlign', [{id:'left',label:'Left'},{id:'center',label:'Center'},{id:'right',label:'Right'}], ds.cardAlign || 'left')}
        </div>` : ''}
        ${block.type === 'quote_image' ? `
        <div class="prop-section">
          <div class="prop-section-title">Text Colour</div>
          <div class="flex gap-8 items-center">
            ${quoteFontColorOptions.map(o => `<div class="text-color-swatch ${activeQuoteFontColor === o.id ? 'selected' : ''}" data-color="${o.id}" title="${o.label}"
              style="width:26px; height:26px; border-radius:6px; cursor:pointer; background:${o.id === 'theme' ? 'var(--gradient-primary)' : o.id === 'white' ? '#fff' : TEXT_COLOR_MAP[o.id]};
              border:${activeQuoteFontColor === o.id ? '2px solid var(--indigo)' : '1px solid var(--border)'};"></div>`).join('')}
            <input type="color" class="text-color-custom" title="Custom colour" value="${activeQuoteFontColor === 'custom' ? ds.fontColor : '#000000'}"
              style="width:26px; height:26px; padding:0; border:${activeQuoteFontColor === 'custom' ? '2px solid var(--indigo)' : '1px solid var(--border)'}; border-radius:6px; cursor:pointer;" />
          </div>
        </div>
        <div class="prop-section">
          <div class="prop-section-title">Overlay</div>
          <p class="text-sm text-muted mb-8">Overlay Darkness</p>
          <div class="flex items-center gap-8">
            <input type="range" class="design-range" data-prop="overlayOpacity" data-suffix="%" min="0" max="80" value="${ds.overlayOpacity ?? 35}" style="flex:1;" />
            <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.overlayOpacity ?? 35}%</span>
          </div>
        </div>
        ` : ''}
        <div class="prop-section">
          <div class="prop-section-title">Spacing</div>
          <p class="text-sm text-muted mb-8">Top Padding</p>
          <div class="flex items-center gap-8">
            <input type="range" class="design-range" data-prop="paddingTop" min="0" max="100" value="${ds.paddingTop ?? 22}" style="flex:1;" />
            <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 22}px</span>
          </div>
          <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
          <div class="flex items-center gap-8">
            <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="100" value="${ds.paddingBottom ?? 22}" style="flex:1;" />
            <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 22}px</span>
          </div>
        </div>`;
    }
    case 'Interactive':
      if (block.type === 'button') return buttonDesignFields(ds);
      if (block.type === 'flashcard_grid' || block.type === 'flashcard_stack') return flashcardDesignFields(block, ds);
      if (block.type === 'accordion') return accordionDesignFields(block, ds);
      if (block.type === 'tabs') return tabsDesignFields(block, ds);
      if (block.type === 'labelled_graphic') return labelledGraphicDesignFields(block, ds);
      if (block.type === 'process') return processDesignFields(block, ds);
      if (block.type === 'scenario') return scenarioDesignFields(block, ds);
      return `
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Animation</div>
          ${segControl('design-anim', 'animation', [{id:'fade',label:'Fade'},{id:'slide',label:'Slide'},{id:'none',label:'None'}], ds.animation || 'fade')}
        </div>`;
    default:
      return '';
  }
}

/* Button block — Format (Size/Width) + Style (Color/Shadow) design-tab fields.
   Alignment and Corner Radius are already covered by the global Design-tab
   sections rendered above blockTypeDesignFields. */
function buttonDesignFields(ds) {
  const colorPreset = ds.colorPreset || 'theme';
  return `
    <div class="prop-section">
      <div class="prop-section-title">Size</div>
      ${segControl('design-btnsize', 'btnSize', [{id:'sm',label:'Small'},{id:'md',label:'Medium'},{id:'lg',label:'Large'}], ds.btnSize || 'md')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Width</div>
      ${segControl('design-btnwidth', 'btnWidth', [{id:'auto',label:'Auto'},{id:'full',label:'Full Width'}], ds.btnWidth || 'auto')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Color</div>
      ${segControl('design-colorpreset', 'colorPreset', [{id:'theme',label:'Theme'},{id:'custom',label:'Custom'}], colorPreset)}
      ${colorPreset === 'custom' ? `
        <div class="flex items-center gap-12 mt-12">
          <label class="text-sm" style="min-width:90px;">Background</label>
          <input type="color" class="design-color-input" data-prop="btnBgColor" value="${ds.btnBgColor || '#7C3AED'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
        </div>
        <div class="flex items-center gap-12 mt-8">
          <label class="text-sm" style="min-width:90px;">Text</label>
          <input type="color" class="design-color-input" data-prop="btnTextColor" value="${ds.btnTextColor || '#ffffff'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
        </div>` : ''}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Shadow</div>
      <label class="flex items-center gap-8"><input type="checkbox" class="design-checkbox" data-prop="shadow" ${ds.shadow !== false ? 'checked' : ''}/> Drop shadow</label>
    </div>
    ${interactiveBorderPaddingFields(ds)}`;
}

/* Flashcard Grid / Flashcard Stack — Content tab: per-card management
   (add/duplicate/delete/reorder) and per-face text, image, and image-fit
   controls. This is the only place card content can be edited — the card
   surface itself stays clean (Rise philosophy), matching Accordion/Tabs/
   Process item management. */
function flashcardContentPanel(block, d) {
  const items = normalizeFlashcardItems(d);
  const fitOptions = [
    { id: 'cover', label: 'Cover' },
    { id: 'contain', label: 'Contain' },
    { id: 'stretch', label: 'Stretch' },
    { id: 'center', label: 'Center' },
    { id: 'full', label: 'Full Card' },
  ];
  const iconBtn = (cls, findex, title, disabled, label) =>
    `<button class="btn-icon ${cls}" data-findex="${findex}" title="${title}" aria-label="${title}" ${disabled ? 'disabled' : ''} style="width:22px; height:22px; background:var(--ink-900); color:#fff; border:none; box-shadow:none; border-radius:4px; opacity:${disabled ? '0.4' : '1'};">${label}</button>`;
  return items.map((item, i) => `
    <div class="prop-section">
      <div class="flex items-center justify-between mb-8">
        <div class="prop-section-title" style="margin:0;">Card ${i + 1}</div>
        <div class="flex gap-4">
          ${iconBtn('flashcard-move-up', i, 'Move up', i === 0, '↑')}
          ${iconBtn('flashcard-move-down', i, 'Move down', i === items.length - 1, '↓')}
          ${iconBtn('flashcard-duplicate', i, 'Duplicate card', false, '⧉')}
          ${iconBtn('flashcard-remove', i, 'Delete card', items.length <= 1, '×')}
        </div>
      </div>
      ${['front', 'back'].map(face => `
        <div class="field">
          <label>${face === 'front' ? 'Front' : 'Back'}</label>
          <p class="text-sm text-muted mb-4">Click directly on the ${face} text on the canvas to edit it.</p>
          <div class="flex items-center gap-8 mt-4">
            <button class="btn btn-secondary btn-sm flashcard-face-image-trigger" data-findex="${i}" data-face="${face}">${item[face].image ? '🔄 Change Image' : '📤 Add Image'}</button>
            ${item[face].image ? `<button class="btn btn-ghost btn-sm flashcard-face-image-remove" data-findex="${i}" data-face="${face}" style="color:#E5484D;">Remove image</button>` : ''}
          </div>
          ${item[face].image ? `
            <p class="text-sm text-muted mb-4 mt-8">Image layout</p>
            <div class="seg-control flashcard-fit-control" data-findex="${i}" data-face="${face}">
              ${fitOptions.map(o => `<button data-val="${o.id}" class="${(item[face].imageFit || 'cover') === o.id ? 'active' : ''}">${o.label}</button>`).join('')}
            </div>` : ''}
        </div>
      `).join('')}
    </div>
  `).join('') + `<button class="btn btn-secondary w-full mt-8 flashcard-add">+ Add Card</button>` + aiActions();
}

/* Flashcard Grid / Flashcard Stack — Format design-tab fields. */
// Sprint 3E, Phase 1/2/6 fix: shared by Flashcard Grid and Stack — same
// padding pattern used for the Divider family (lineDividerDesignFields etc).
function flashcardSpacingStyle(ds) {
  return `padding-top:${ds.paddingTop ?? 0}px; padding-bottom:${ds.paddingBottom ?? 0}px;`;
}

// Sprint 3D-A fix: shared by Accordion/Tabs/Process/Labelled Graphic/
// Scenario — none of these exposed a Border on/off or Padding control at
// all (Accordion's "boxed" variant had a hardcoded, undisable border;
// Tabs/Process/Labelled Graphic's panel surfaces had background+radius but
// no border option whatsoever). Same benchmark pattern as Flashcards.
// Sprint 3F, Phase 1 fix: this defaulted to BORDER ON (panelBorder===false
// was the only way to turn it off) — since every pre-existing block has
// panelBorder===undefined, every block this control was added to started
// showing an unrequested border by default, in Builder AND Preview. Default
// is now OFF; an author must explicitly enable it.
function interactiveBorderStyle(ds) {
  return ds.panelBorder === true ? `1px solid ${ds.panelBorderColor || 'var(--border)'}` : 'none';
}
function interactiveSpacingStyle(ds) {
  return `padding-top:${ds.paddingTop ?? 0}px; padding-bottom:${ds.paddingBottom ?? 0}px;`;
}
function interactiveBorderPaddingFields(ds) {
  return `
    <div class="prop-section">
      <div class="prop-section-title">Border</div>
      <label class="flex items-center gap-8 mb-8"><input type="checkbox" class="design-checkbox" data-prop="panelBorder" ${ds.panelBorder === true ? 'checked' : ''}/> Show border</label>
      ${ds.panelBorder === true ? `<input type="color" class="design-color-input" data-prop="panelBorderColor" value="${ds.panelBorderColor || '#E2E4EA'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />` : ''}
    </div>
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Spacing</div>
      <p class="text-sm text-muted mb-8">Top Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingTop" min="0" max="100" value="${ds.paddingTop ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 0}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="100" value="${ds.paddingBottom ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 0}px</span>
      </div>
    </div>`;
}

function flashcardDesignFields(block, ds) {
  // Sprint 3E, Phase 1/2 root cause: the OUTER generic Interactive-category
  // panel (renderRightTabContentInner, shown for every block in this
  // category before this function runs) already renders a real, working
  // Background swatch picker (ds.bg) and Alignment/Corner Radius segControls
  // (ds.align/ds.radius) — these are the controls an author actually sees
  // and tries first. This function used to add a SECOND, differently-styled
  // Alignment section and never read ds.bg at all in the renderer, which is
  // exactly "Alignment does not function correctly" / "Background colour
  // does not function correctly": the visible control they used had no
  // effect, while a redundant second one (in an earlier draft of this fix)
  // would have silently done nothing useful either. Fix: make the card
  // faces actually consume ds.bg instead of adding parallel controls.
  const borderField = `
    <div class="prop-section">
      <div class="prop-section-title">Border</div>
      <label class="flex items-center gap-8 mb-8"><input type="checkbox" class="design-checkbox" data-prop="cardBorder" ${ds.cardBorder === true ? 'checked' : ''}/> Show card border</label>
      ${ds.cardBorder === true ? `<input type="color" class="design-color-input" data-prop="cardBorderColor" value="${ds.cardBorderColor || '#E2E4EA'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />` : ''}
    </div>`;
  const spacingField = `
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Spacing</div>
      <p class="text-sm text-muted mb-8">Top Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingTop" min="0" max="100" value="${ds.paddingTop ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingTop ?? 0}px</span>
      </div>
      <p class="text-sm text-muted mb-8 mt-12">Bottom Padding</p>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="paddingBottom" min="0" max="100" value="${ds.paddingBottom ?? 0}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.paddingBottom ?? 0}px</span>
      </div>
    </div>`;
  const flipHintField = `
    <div class="prop-section">
      <div class="prop-section-title">Flip Hint</div>
      <label class="flex items-center gap-8"><input type="checkbox" class="design-checkbox" data-prop="flipHint" ${ds.flipHint !== false ? 'checked' : ''}/> Show "Click to flip" hint</label>
    </div>`;
  const sizeField = block.type === 'flashcard_grid' ? `
    <div class="prop-section">
      <div class="prop-section-title">Card Size</div>
      ${segControl('design-cardsize', 'cardSize', [{id:'sm',label:'Small'},{id:'md',label:'Medium'},{id:'lg',label:'Large'}], ds.cardSize || 'md')}
    </div>` : '';
  return sizeField + borderField + flipHintField + spacingField;
}

/* ============================================================
   SHARED ITEM-LIST INFRASTRUCTURE — used by Accordion, Tabs,
   Process, Labelled Graphic (hotspots) and Scenario (scenes/
   choices). Items are plain objects on block.data[<listKey>].
   All media reuses the existing Media Picker / playback systems
   (Golden Rule 9); image rendering supports Full Area / Cover /
   Contain / Stretch / Center (Golden Rule 10).
   ============================================================ */

const ITEM_FIT_OPTIONS = [
  { id: 'cover', label: 'Cover' },
  { id: 'contain', label: 'Contain' },
  { id: 'stretch', label: 'Stretch' },
  { id: 'center', label: 'Center' },
  { id: 'full', label: 'Full Area' },
];

const SURFACE_BG_MAP = {
  light: 'var(--surface-0)',
  gray: 'var(--surface-50)',
  theme: 'var(--pastel-lavender)',
  tint: 'var(--pastel-cyan)',
  dark: '#1F1B3A',
  black: '#000000',
};
function surfaceBg(ds) { return SURFACE_BG_MAP[ds && ds.bgStyle] || 'var(--surface-0)'; }
function surfaceTextColor(ds) { return (ds && (ds.bgStyle === 'dark' || ds.bgStyle === 'black')) ? '#ffffff' : 'var(--ink-900)'; }

/* Continue block — outer surface (Theme/Tint/Light/Dark/Black/Custom/Image presets). */
function continueWrapperStyle(ds) {
  const radius = RADIUS_MAP[ds.radius] || RADIUS_MAP.soft;
  // Sprint 2, Workstream 3 fix: the Design panel's Top/Bottom/Left/Right
  // Padding sliders (ds.paddingTop/Bottom/Left/Right) were never read here
  // at all — completely dead controls. Per the approved remediation, author
  // padding is ADDITIVE on top of the existing background-aware base inset
  // (not a replacement), so every existing Continue block with default
  // (unset) padding renders pixel-identical to before this fix.
  const extraTop = ds.paddingTop ?? 0;
  const extraBottom = ds.paddingBottom ?? 0;
  const extraLeft = ds.paddingLeft ?? 0;
  const extraRight = ds.paddingRight ?? 0;
  let baseTop, baseBottom, baseLeft, baseRight, bgPart = '';
  if (ds.bgStyle === 'image' && ds.bgImage) {
    bgPart = `background:url('${AssetStore.resolveMediaSrc(ds.bgImage)}') center/cover;`;
    baseTop = baseBottom = baseLeft = baseRight = 16;
  } else if (ds.bgStyle === 'custom') {
    bgPart = `background:${ds.customBg || 'transparent'};`;
    baseTop = baseBottom = baseLeft = baseRight = 16;
  } else if (ds.bgStyle && ds.bgStyle !== 'theme') {
    bgPart = `background:${surfaceBg(ds)}; color:${surfaceTextColor(ds)};`;
    baseTop = baseBottom = baseLeft = baseRight = 16;
  } else {
    baseTop = baseBottom = 8;
    baseLeft = baseRight = 0;
  }
  return `${bgPart} border-radius:${radius}; padding-top:${baseTop + extraTop}px; padding-bottom:${baseBottom + extraBottom}px; padding-left:${baseLeft + extraLeft}px; padding-right:${baseRight + extraRight}px;`;
}

/* Continue block — button styling (Width/Height/Radius/Fill/Text/Border). */
function continueButtonStyle(ds) {
  const widthStyle = ds.btnWidth === 'full' ? 'width:100%;' : '';
  const height = ds.btnHeight ?? 44;
  const radius = RADIUS_MAP[ds.btnRadius] || RADIUS_MAP.soft;
  const fill = ds.btnFillColor || 'var(--theme-primary, var(--indigo))';
  const textColor = ds.btnTextColor || '#ffffff';
  const border = ds.btnBorder ? `2px solid ${ds.btnBorderColor || '#000000'}` : 'none';
  return `${widthStyle} min-height:${height}px; border-radius:${radius}; background:${fill}; color:${textColor}; border:${border}; padding:0 28px; font-weight:600; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; gap:6px;`;
}

function normalizeItemList(d, key, factory) {
  if (!d[key] || !d[key].length) d[key] = factory();
  return d[key];
}

/* Default shape for a brand-new item appended to a given list. */
function defaultListItem(blockType, listKey) {
  if (blockType === 'labelled_graphic' && listKey === 'hotspots') {
    return { title: 'New Hotspot', body: '', x: 50, y: 50 };
  }
  if (blockType === 'scenario' && listKey === 'scenes') {
    return { title: 'New Scene', dialogue: '', characterName: '', choices: [] };
  }
  if (blockType === 'quote_carousel' && listKey === 'quotes') {
    return { text: 'New quote', author: '', avatar: null };
  }
  if (blockType === 'carousel' && listKey === 'items') {
    return { src: null, title: '', description: '', imageFit: 'cover' };
  }
  return { title: '', body: '' };
}

/* Renders an item's image per its imageFit setting — Full Area fills the
   given height as a cropped backdrop; Cover/Contain/Stretch/Center map to
   object-fit. Used on the learner-facing canvas (Builder + Preview alike). */
function itemImageHtml(item, h) {
  if (!item.image) return '';
  const fit = item.imageFit || 'cover';
  const src = AssetStore.resolveMediaSrc(item.image);
  if (fit === 'full') {
    return `<div style="position:relative; width:100%; aspect-ratio:16/9; border-radius:var(--r-md); overflow:hidden; margin-bottom:10px;"><img src="${src}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block;" /></div>`;
  }
  const fitMap = { cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none' };
  const of = fitMap[fit] || 'cover';
  return `<img src="${src}" alt="" style="width:100%; aspect-ratio:16/9; height:auto; object-fit:${of}; ${of === 'none' ? 'background:var(--surface-50);' : ''} border-radius:var(--r-md); display:block; margin-bottom:10px;" />`;
}

/* Renders an item's video/audio/attachment using the same controls/markup
   conventions as the Audio/Video/File blocks (playback speed, transcript,
   download) — no new media systems (Golden Rule 9). */
function itemMediaExtrasHtml(item) {
  let html = '';
  if (item.video) {
    const embed = parseVideoEmbedUrl(item.video);
    if (!embed || embed.type === 'mp4') {
      html += `<div class="media-frame" style="margin-bottom:10px;"><video class="block-video-el" controls playsinline style="width:100%; border-radius:var(--r-md); background:#000; display:block;" src="${AssetStore.resolveMediaSrc(item.video)}"></video>${playbackSpeedSelector('block-video-el')}</div>`;
    } else {
      html += `<div class="media-frame" style="margin-bottom:10px;"><iframe src="${embed.embedUrl}" style="width:100%; aspect-ratio:16/9; border:0; border-radius:var(--r-md);" allowfullscreen></iframe></div>`;
    }
  }
  if (item.audio) {
    html += `<div class="media-frame" style="margin-bottom:10px;"><audio class="block-audio-el" controls style="width:100%; display:block;" src="${AssetStore.resolveMediaSrc(item.audio)}"></audio>${playbackSpeedSelector('block-audio-el')}${item.audioTranscript ? `<details class="mt-8"><summary class="text-sm text-muted" style="cursor:pointer;">Transcript</summary><div class="text-sm mt-4">${escapeHtml(item.audioTranscript)}</div></details>` : ''}</div>`;
  }
  if (item.file) {
    html += `<div class="flex items-center gap-12" style="margin-bottom:10px; padding:10px 12px; background:var(--surface-50); border-radius:var(--r-md);"><span style="font-size:20px;">📎</span><div style="flex:1; min-width:0; font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.fileFileName || 'Attachment')}</div><a href="${AssetStore.resolveMediaSrc(item.file)}" download="${escapeHtml(item.fileFileName || 'download')}" class="btn btn-secondary btn-sm">Download</a></div>`;
  }
  return html;
}

/* Content-panel media controls for a list item — Add/Change/Remove for
   Image/Video/Audio/Attachment via the existing Media Picker, plus an
   image-fit selector and an audio transcript field. */
function itemMediaContentFields(item, listKey, i) {
  return `
    <div class="flex items-center gap-8 mt-4" style="flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm lumio-item-media-trigger" data-list="${listKey}" data-iindex="${i}" data-field="image" data-kind="image" data-title="Image">${item.image ? '🔄 Change Image' : '📤 Add Image'}</button>
      ${item.image ? `<button class="btn btn-ghost btn-sm lumio-item-media-remove" data-list="${listKey}" data-iindex="${i}" data-field="image" style="color:#E5484D;">Remove image</button>` : ''}
      <button class="btn btn-secondary btn-sm lumio-item-media-trigger" data-list="${listKey}" data-iindex="${i}" data-field="video" data-kind="video" data-title="Video">${item.video ? '🔄 Change Video' : '📤 Add Video'}</button>
      ${item.video ? `<button class="btn btn-ghost btn-sm lumio-item-media-remove" data-list="${listKey}" data-iindex="${i}" data-field="video" style="color:#E5484D;">Remove video</button>` : ''}
      <button class="btn btn-secondary btn-sm lumio-item-media-trigger" data-list="${listKey}" data-iindex="${i}" data-field="audio" data-kind="audio" data-title="Audio">${item.audio ? '🔄 Change Audio' : '📤 Add Audio'}</button>
      ${item.audio ? `<button class="btn btn-ghost btn-sm lumio-item-media-remove" data-list="${listKey}" data-iindex="${i}" data-field="audio" style="color:#E5484D;">Remove audio</button>` : ''}
      <button class="btn btn-secondary btn-sm lumio-item-media-trigger" data-list="${listKey}" data-iindex="${i}" data-field="file" data-kind="file" data-title="Attachment">${item.file ? '🔄 Change File' : '📤 Add Attachment'}</button>
      ${item.file ? `<button class="btn btn-ghost btn-sm lumio-item-media-remove" data-list="${listKey}" data-iindex="${i}" data-field="file" style="color:#E5484D;">Remove file</button>` : ''}
    </div>
    ${item.audio ? `<div class="field mt-8"><label>Audio Transcript</label><textarea class="textarea lumio-item-text" rows="2" data-list="${listKey}" data-iindex="${i}" data-field="audioTranscript">${escapeHtml(item.audioTranscript || '')}</textarea></div>` : ''}
    ${item.image ? `<div class="mt-8"><p class="text-sm text-muted mb-4">Image layout</p><div class="seg-control lumio-item-fit-control" data-list="${listKey}" data-iindex="${i}">${ITEM_FIT_OPTIONS.map(o => `<button data-val="${o.id}" class="${(item.imageFit || 'cover') === o.id ? 'active' : ''}">${o.label}</button>`).join('')}</div></div>` : ''}
  `;
}

/* Move-up/move-down/duplicate/delete toolbar for a list item. */
function itemManageToolbar(listKey, i, count) {
  const iconBtn = (cls, title, disabled, label) =>
    `<button class="btn-icon ${cls}" data-list="${listKey}" data-iindex="${i}" title="${title}" aria-label="${title}" ${disabled ? 'disabled' : ''} style="width:22px; height:22px; background:var(--ink-900); color:#fff; border:none; box-shadow:none; border-radius:4px; opacity:${disabled ? '0.4' : '1'};">${label}</button>`;
  return `<div class="flex gap-4">
    ${iconBtn('lumio-item-move-up', 'Move up', i === 0, '↑')}
    ${iconBtn('lumio-item-move-down', 'Move down', i === count - 1, '↓')}
    ${iconBtn('lumio-item-duplicate', 'Duplicate', false, '⧉')}
    ${iconBtn('lumio-item-remove', 'Delete', count <= 1, '×')}
  </div>`;
}

/* Generic Content-panel list editor — Title + rich body + media, with
   Add/Duplicate/Delete/Reorder. Used by Accordion, Tabs, Process and the
   Labelled Graphic hotspot list. */
function itemListContentPanel(block, d, listKey, itemLabel, factory, opts) {
  opts = opts || {};
  const items = normalizeItemList(d, listKey, factory);
  return items.map((item, i) => `
    <div class="prop-section">
      <div class="flex items-center justify-between mb-8">
        <div class="prop-section-title" style="margin:0;" title="${escapeHtml(item.title || '')}">${item.title ? escapeHtml(item.title) : `${itemLabel} ${i + 1}`}</div>
        ${itemManageToolbar(listKey, i, items.length)}
      </div>
      ${opts.canvasEditable
        ? `<p class="text-sm text-muted mb-8">Click directly on the ${(opts.titleLabel || 'title').toLowerCase()} or ${(opts.bodyLabel || 'content').toLowerCase()} in the canvas to edit them.</p>`
        : `<div class="field"><label>Title</label><input class="input lumio-item-text" data-list="${listKey}" data-iindex="${i}" data-field="title" value="${escapeHtml(item.title || '')}" /></div>
      <div class="field"><label>${opts.bodyLabel || 'Content'}</label><textarea class="textarea lumio-item-text" rows="3" data-list="${listKey}" data-iindex="${i}" data-field="body">${escapeHtml(item.body || '')}</textarea></div>`}
      ${itemMediaContentFields(item, listKey, i)}
    </div>
  `).join('') + `<button class="btn btn-secondary w-full mt-8 lumio-item-add" data-list="${listKey}">+ Add ${itemLabel}</button>` + aiActions();
}

/* ============================================================
   QUOTE CAROUSEL — per-quote Content panel (avatar management,
   reorder/duplicate/delete/add). Quote text and attribution remain
   inline-editable on the canvas.
   ============================================================ */

function quoteCarouselContentPanel(block, d) {
  const quotes = normalizeQuoteItems(d);
  return quotes.map((q, i) => `
    <div class="prop-section">
      <div class="flex items-center justify-between mb-8">
        <div class="prop-section-title" style="margin:0;">Quote ${i + 1}</div>
        ${itemManageToolbar('quotes', i, quotes.length)}
      </div>
      <p class="text-sm text-muted mb-8">Click directly on the quote text or attribution in the canvas to edit them.</p>
      <div class="flex items-center gap-12">
        <div class="media-thumb" style="width:48px; height:48px; border-radius:50%; overflow:hidden; background:var(--surface-50); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          ${q.avatar ? `<img src="${q.avatar}" style="width:100%; height:100%; object-fit:cover;" />` : `<span style="font-size:18px; opacity:0.5;">🖼️</span>`}
        </div>
        <button class="btn btn-secondary btn-sm lumio-item-media-trigger" data-list="quotes" data-iindex="${i}" data-field="avatar" data-kind="image" data-title="Avatar Image">${q.avatar ? '🔄 Change Image' : '📤 Add Image'}</button>
        ${q.avatar ? `<button class="btn btn-ghost btn-sm lumio-item-media-remove" data-list="quotes" data-iindex="${i}" data-field="avatar" style="color:#E5484D;">Remove image</button>` : ''}
      </div>
    </div>
  `).join('') + `<button class="btn btn-secondary w-full mt-8 lumio-item-add" data-list="quotes">+ Add Quote</button>` + aiActions();
}

/* ============================================================
   GALLERY CAROUSEL — per-slide Content panel (title, description,
   image with layout selector, reorder/duplicate/delete/add).
   ============================================================ */

function galleryCarouselContentPanel(block, d) {
  const items = normalizeCarouselItems(d);
  return items.map((item, i) => `
    <div class="prop-section">
      <div class="flex items-center justify-between mb-8">
        <div class="prop-section-title" style="margin:0;" title="${escapeHtml(item.title || '')}">${item.title ? escapeHtml(item.title) : `Slide ${i + 1}`}</div>
        ${itemManageToolbar('items', i, items.length)}
      </div>
      <p class="text-sm text-muted mb-8">Click directly on the slide title or description in the canvas to edit them.</p>
      <div class="flex items-center gap-8 mt-4" style="flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm lumio-item-media-trigger" data-list="items" data-iindex="${i}" data-field="src" data-kind="image" data-title="Image">${item.src ? '🔄 Change Image' : '📤 Add Image'}</button>
        ${item.src ? `<button class="btn btn-ghost btn-sm lumio-item-media-remove" data-list="items" data-iindex="${i}" data-field="src" style="color:#E5484D;">Remove image</button>` : ''}
      </div>
      ${item.src ? `<div class="mt-8"><p class="text-sm text-muted mb-4">Image layout</p><div class="seg-control lumio-item-fit-control" data-list="items" data-iindex="${i}">${ITEM_FIT_OPTIONS.map(o => `<button data-val="${o.id}" class="${(item.imageFit || 'cover') === o.id ? 'active' : ''}">${o.label}</button>`).join('')}</div></div>` : ''}
    </div>
  `).join('') + `<button class="btn btn-secondary w-full mt-8 lumio-item-add" data-list="items">+ Add Slide</button>` + aiActions();
}

/* ============================================================
   ACCORDION
   ============================================================ */

function accordionContentPanel(block, d) {
  return itemListContentPanel(block, d, 'items', 'Item', () => [
    { title: 'Section 1', body: 'Details about section 1...' },
    { title: 'Section 2', body: 'Details about section 2...' },
  ], { bodyLabel: 'Body', titleLabel: 'Title', canvasEditable: true });
}

function accordionDesignFields(block, ds) {
  return `
    <div class="prop-section">
      <div class="prop-section-title">Heading Level</div>
      ${segControl('design-headinglevel', 'headingLevel', [{id:'h3',label:'H3'},{id:'h4',label:'H4'},{id:'h5',label:'H5'}], ds.headingLevel || 'h4')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Theme Variant</div>
      ${segControl('design-variant', 'variant', [{id:'default',label:'Default'},{id:'boxed',label:'Boxed'},{id:'minimal',label:'Minimal'}], ds.variant || 'default')}
    </div>
    ${quoteCardBgFields(ds)}
    <div class="prop-section">
      <div class="prop-section-title">Marker Style</div>
      ${segControl('design-markerstyle', 'markerStyle', [{id:'none',label:'None'},{id:'number',label:'Numbered'}], ds.markerStyle || 'none')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Chevron Style</div>
      ${segControl('design-chevronstyle', 'chevronStyle', [{id:'chevron',label:'Chevron'},{id:'plusminus',label:'+ / −'},{id:'arrow',label:'Arrow'}], ds.chevronStyle || 'chevron')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Row Spacing</div>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="rowSpacing" min="0" max="24" value="${ds.rowSpacing ?? 8}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.rowSpacing ?? 8}px</span>
      </div>
    </div>
    ${interactiveBorderPaddingFields(ds)}`;
}

/* ============================================================
   TABS
   ============================================================ */

function tabsContentPanel(block, d) {
  return itemListContentPanel(block, d, 'items', 'Tab', () => [
    { title: 'Overview', body: 'Overview content...' },
    { title: 'Details', body: 'Details content...' },
    { title: 'FAQ', body: 'FAQ content...' },
  ], { bodyLabel: 'Body', titleLabel: 'Tab title', canvasEditable: true });
}

function tabsDesignFields(block, ds) {
  return `
    <div class="prop-section">
      <div class="prop-section-title">Theme Variant</div>
      ${segControl('design-variant', 'variant', [{id:'default',label:'Default'},{id:'boxed',label:'Boxed'},{id:'minimal',label:'Minimal'}], ds.variant || 'default')}
    </div>
    ${quoteCardBgFields(ds)}
    <div class="prop-section">
      <div class="prop-section-title">Tab Style</div>
      ${segControl('design-tabstyle', 'tabStyle', [{id:'underline',label:'Underline'},{id:'pill',label:'Pill'},{id:'boxed',label:'Boxed'}], ds.tabStyle || 'underline')}
    </div>
    ${interactiveBorderPaddingFields(ds)}`;
}

/* ============================================================
   PROCESS
   ============================================================ */

function processContentPanel(block, d) {
  return itemListContentPanel(block, d, 'items', 'Step', () => [
    { title: 'Step 1', body: 'Description of step 1' },
    { title: 'Step 2', body: 'Description of step 2' },
    { title: 'Step 3', body: 'Description of step 3' },
  ], { bodyLabel: 'Description', titleLabel: 'Step title', canvasEditable: true });
}

function processDesignFields(block, ds) {
  return `
    <div class="prop-section">
      <div class="prop-section-title">Heading Level</div>
      ${segControl('design-headinglevel', 'headingLevel', [{id:'h3',label:'H3'},{id:'h4',label:'H4'},{id:'h5',label:'H5'}], ds.headingLevel || 'h4')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Theme Variant</div>
      ${segControl('design-variant', 'variant', [{id:'default',label:'Default'},{id:'boxed',label:'Boxed'},{id:'minimal',label:'Minimal'}], ds.variant || 'default')}
    </div>
    ${quoteCardBgFields(ds)}
    <div class="prop-section">
      <div class="prop-section-title">Indicator Style</div>
      ${segControl('design-indicatorstyle', 'indicatorStyle', [{id:'dots',label:'Dots'},{id:'numbers',label:'Numbers'}], ds.indicatorStyle || 'dots')}
    </div>
    ${interactiveBorderPaddingFields(ds)}`;
}

/* ============================================================
   LABELLED GRAPHIC
   ============================================================ */

function labelledGraphicContentPanel(block, d) {
  const imageField = `
    <div class="prop-section">
      <div class="prop-section-title">Primary Image</div>
      <div class="flex items-center gap-8" style="flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm lumio-lg-image-trigger">${d.image ? '🔄 Change Image' : '📤 Add Image'}</button>
        ${d.image ? `<button class="btn btn-ghost btn-sm lumio-lg-image-remove" style="color:#E5484D;">Remove image</button>` : ''}
      </div>
      <p class="text-sm text-muted mt-8">Drag the numbered markers directly on the canvas to position each hotspot.</p>
    </div>`;
  return imageField + itemListContentPanel(block, d, 'hotspots', 'Hotspot', () => [
    { title: 'Hotspot 1', body: 'Description for hotspot 1', x: 25, y: 30 },
    { title: 'Hotspot 2', body: 'Description for hotspot 2', x: 60, y: 55 },
    { title: 'Hotspot 3', body: 'Description for hotspot 3', x: 80, y: 25 },
  ], { bodyLabel: 'Body' });
}

function labelledGraphicDesignFields(block, ds) {
  return `
    <div class="prop-section">
      <div class="prop-section-title">Image Width</div>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="imageWidth" data-suffix="%" min="40" max="100" value="${ds.imageWidth ?? 100}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.imageWidth ?? 100}%</span>
      </div>
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Image Fit</div>
      ${segControl('design-imagefit', 'imageFit', [{id:'cover',label:'Cover'},{id:'contain',label:'Contain'},{id:'stretch',label:'Stretch'},{id:'center',label:'Center'}], ds.imageFit || 'cover')}
    </div>
    ${quoteCardBgFields(ds)}
    <div class="prop-section">
      <div class="prop-section-title">Marker Style</div>
      <select class="input design-select" data-prop="markerStyle">
        <option value="numbers" ${(ds.markerStyle || 'numbers') === 'numbers' ? 'selected' : ''}>Numbers (1, 2, 3…)</option>
        <optgroup label="Icons">
          ${Object.entries(MARKER_ICONS).map(([id, glyph]) => `<option value="${id}" ${ds.markerStyle === id ? 'selected' : ''}>${glyph}</option>`).join('')}
        </optgroup>
      </select>
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Marker Color</div>
      <input type="color" class="design-color-input" data-prop="markerColor" value="${ds.markerColor || '#7C3AED'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Marker Border Color</div>
      <input type="color" class="design-color-input" data-prop="markerBorderColor" value="${ds.markerBorderColor || '#ffffff'}" style="width:32px; height:32px; padding:0; border:1px solid var(--border); border-radius:6px; cursor:pointer;" />
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Marker Size</div>
      ${segControl('design-markersize', 'markerSize', [{id:'sm',label:'Small'},{id:'md',label:'Medium'},{id:'lg',label:'Large'}], ds.markerSize || 'md')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Visited State Style</div>
      ${segControl('design-visitedstyle', 'visitedStyle', [{id:'filled',label:'Filled'},{id:'checkmark',label:'Checkmark'},{id:'theme',label:'Theme Fill'}], ds.visitedStyle || 'filled')}
    </div>
    ${interactiveBorderPaddingFields(ds)}`;
}

/* ============================================================
   SCENARIO
   ============================================================ */

function scenarioContentPanel(block, d) {
  const scenes = normalizeItemList(d, 'scenes', () => [
    {
      title: 'Scene 1', dialogue: 'A customer calls upset about a delayed shipment. How do you respond?',
      characterName: '', backgroundImage: null, backgroundVideo: null, backgroundAudio: null, characterImage: null,
      choices: [
        { text: 'Apologize and offer a solution', feedback: 'Great choice — this de-escalates the situation.', nextScene: 1, correctPath: true },
        { text: 'Explain that it is not your department', feedback: 'This may frustrate the customer further. Try again.', nextScene: 0, correctPath: false },
      ],
    },
    { title: 'Scene 2', dialogue: 'The customer feels heard and asks what happens next.', characterName: '', backgroundImage: null, backgroundVideo: null, backgroundAudio: null, characterImage: null, choices: [] },
  ]);
  const iconBtn = (cls, sindex, title, disabled, label, cindex) =>
    `<button class="btn-icon ${cls}" data-sindex="${sindex}" ${cindex !== undefined ? `data-cindex="${cindex}"` : ''} title="${title}" aria-label="${title}" ${disabled ? 'disabled' : ''} style="width:22px; height:22px; background:var(--ink-900); color:#fff; border:none; box-shadow:none; border-radius:4px; opacity:${disabled ? '0.4' : '1'};">${label}</button>`;
  const mediaBtn = (sindex, field, kind, title, current) => `
    <button class="btn btn-secondary btn-sm lumio-scene-media-trigger" data-sindex="${sindex}" data-field="${field}" data-kind="${kind}" data-title="${title}">${current ? `🔄 Change ${title}` : `📤 Add ${title}`}</button>
    ${current ? `<button class="btn btn-ghost btn-sm lumio-scene-media-remove" data-sindex="${sindex}" data-field="${field}" style="color:#E5484D;">Remove</button>` : ''}`;
  return scenes.map((scene, i) => `
    <div class="prop-section">
      <div class="flex items-center justify-between mb-8">
        <div class="prop-section-title" style="margin:0;">Scene ${i + 1}</div>
        <div class="flex gap-4">
          ${iconBtn('lumio-scene-move-up', i, 'Move up', i === 0, '↑')}
          ${iconBtn('lumio-scene-move-down', i, 'Move down', i === scenes.length - 1, '↓')}
          ${iconBtn('lumio-scene-duplicate', i, 'Duplicate', false, '⧉')}
          ${iconBtn('lumio-scene-remove', i, 'Delete', scenes.length <= 1, '×')}
        </div>
      </div>
      <div class="field"><label>Scene Title (internal)</label><input class="input lumio-scene-text" data-sindex="${i}" data-field="title" value="${escapeHtml(scene.title || '')}" /></div>
      <div class="field"><label>Character Name</label><input class="input lumio-scene-text" data-sindex="${i}" data-field="characterName" value="${escapeHtml(scene.characterName || '')}" /></div>
      <p class="text-sm text-muted mb-8">Click directly on the dialogue text in the canvas to edit it.</p>
      <div class="flex items-center gap-8 mt-4" style="flex-wrap:wrap;">
        ${mediaBtn(i, 'backgroundImage', 'image', 'Background Image', scene.backgroundImage)}
        ${mediaBtn(i, 'backgroundVideo', 'video', 'Background Video', scene.backgroundVideo)}
        ${mediaBtn(i, 'backgroundAudio', 'audio', 'Background Audio', scene.backgroundAudio)}
        ${mediaBtn(i, 'characterImage', 'image', 'Character Image', scene.characterImage)}
      </div>
      <div class="mt-12" style="border-top:1px solid var(--border); padding-top:10px;">
        <div class="flex items-center justify-between mb-8"><strong class="text-sm">Choices</strong>
          <button class="btn btn-secondary btn-sm lumio-choice-add" data-sindex="${i}">+ Add Choice</button>
        </div>
        ${(scene.choices || []).map((c, ci) => `
          <div class="mb-8" style="padding:8px; background:var(--surface-50); border-radius:8px;">
            <div class="flex items-center justify-between mb-4">
              <span class="text-sm text-muted">Choice ${ci + 1}</span>
              <div class="flex gap-4">
                ${iconBtn('lumio-choice-move-up', i, 'Move up', ci === 0, '↑', ci)}
                ${iconBtn('lumio-choice-move-down', i, 'Move down', ci === scene.choices.length - 1, '↓', ci)}
                ${iconBtn('lumio-choice-remove', i, 'Delete', false, '×', ci)}
              </div>
            </div>
            <div class="field"><label>Choice Text</label><input class="input lumio-choice-text" data-sindex="${i}" data-cindex="${ci}" data-field="text" value="${escapeHtml(c.text || '')}" /></div>
            <div class="field"><label>Feedback Text</label><textarea class="textarea lumio-choice-text" rows="2" data-sindex="${i}" data-cindex="${ci}" data-field="feedback">${escapeHtml(c.feedback || '')}</textarea></div>
            <div class="field"><label>Next Scene</label>
              <select class="input lumio-choice-select" data-sindex="${i}" data-cindex="${ci}" data-field="nextScene">
                <option value="">End scenario</option>
                ${scenes.map((s2, si) => `<option value="${si}" ${c.nextScene === si ? 'selected' : ''}>${si + 1}. ${escapeHtml(s2.title || 'Scene ' + (si + 1))}</option>`).join('')}
              </select>
            </div>
            <label class="flex items-center gap-8"><input type="checkbox" class="lumio-choice-checkbox" data-sindex="${i}" data-cindex="${ci}" data-field="correctPath" ${c.correctPath ? 'checked' : ''}/> Correct path</label>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('') + `<button class="btn btn-secondary w-full mt-8 lumio-scene-add">+ Add Scene</button>` + aiActions();
}

function scenarioDesignFields(block, ds) {
  return `
    <div class="prop-section">
      <div class="prop-section-title">Theme Variant</div>
      ${segControl('design-variant', 'variant', [{id:'default',label:'Default'},{id:'boxed',label:'Boxed'},{id:'minimal',label:'Minimal'}], ds.variant || 'default')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Background Style</div>
      ${segControl('design-bgstyle', 'bgStyle', [{id:'theme',label:'Theme'},{id:'tint',label:'Theme Tint'},{id:'dark',label:'Dark'},{id:'black',label:'Black'}], ds.bgStyle || 'theme')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Overlay Opacity</div>
      <div class="flex items-center gap-8">
        <input type="range" class="design-range" data-prop="overlayOpacity" data-suffix="%" min="0" max="80" value="${ds.overlayOpacity ?? 40}" style="flex:1;" />
        <span class="text-sm range-val" style="min-width:36px; text-align:right;">${ds.overlayOpacity ?? 40}%</span>
      </div>
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Dialogue Panel Style</div>
      ${segControl('design-dialoguestyle', 'dialoguePanelStyle', [{id:'card',label:'Card'},{id:'banner',label:'Banner'},{id:'minimal',label:'Minimal'}], ds.dialoguePanelStyle || 'card')}
    </div>
    <div class="prop-section">
      <div class="prop-section-title">Character Placement</div>
      ${segControl('design-charplacement', 'characterPlacement', [{id:'left',label:'Left'},{id:'right',label:'Right'},{id:'center',label:'Center'},{id:'none',label:'None'}], ds.characterPlacement || 'left')}
    </div>
    ${interactiveBorderPaddingFields(ds)}`;
}

/* ============================================================
   INTERACTION RUNTIME — Accordion/Tabs/Process/Labelled Graphic/
   Scenario all use plain DOM manipulation for their learner-facing
   interactions (no re-render), so Builder and Preview behave
   identically and editor state is never disturbed.
   ============================================================ */

/* Accordion — expand/collapse a row, honouring Single/Multiple-open mode
   and the Animation toggle. */
function lumioAccordionToggle(header, single, animate) {
  const row = header.parentElement;
  const wrap = row.closest('.lumio-accordion');
  const body = row.querySelector('.lumio-accordion-body');
  const willOpen = !row.classList.contains('open');
  const canvasBlock = row.closest('.canvas-block');
  const blockId = canvasBlock && canvasBlock.dataset.blockId;
  const rowIndex = Array.from(wrap.children).indexOf(row);
  // Builder-only: mirror open/closed state into BuilderUI.openItemState so
  // the NEXT full re-render (e.g. triggered by attaching an image via the
  // media picker) doesn't silently re-collapse this row — see the
  // 'accordion' render case and BuilderUI.openItemState's definition.
  if (blockId && BuilderUI.openItemState[blockId]) {
    if (single && willOpen) BuilderUI.openItemState[blockId].clear();
    if (willOpen) BuilderUI.openItemState[blockId].add(rowIndex);
    else BuilderUI.openItemState[blockId].delete(rowIndex);
  }
  if (single && willOpen) {
    wrap.querySelectorAll('.lumio-accordion-row.open').forEach(r => {
      if (r === row) return;
      r.classList.remove('open');
      r.querySelector('.lumio-accordion-header').setAttribute('aria-expanded', 'false');
      const b = r.querySelector('.lumio-accordion-body');
      if (animate) {
        b.style.maxHeight = b.scrollHeight + 'px';
        requestAnimationFrame(() => { b.style.maxHeight = '0px'; });
      } else {
        b.style.maxHeight = '0px';
      }
    });
  }
  if (willOpen) {
    row.classList.add('open');
    header.setAttribute('aria-expanded', 'true');
    body.style.maxHeight = animate ? (body.scrollHeight + 'px') : 'none';
    lumioRecordProgress(row, 'opened', rowIndex);
  } else {
    row.classList.remove('open');
    header.setAttribute('aria-expanded', 'false');
    if (animate) {
      body.style.maxHeight = body.scrollHeight + 'px';
      requestAnimationFrame(() => { body.style.maxHeight = '0px'; });
    } else {
      body.style.maxHeight = '0px';
    }
  }
}

/* Tabs — switch the active tab + panel. */
function lumioTabSwitch(btn, i) {
  const wrap = btn.closest('.lumio-tabs');
  wrap.querySelectorAll('.lumio-tab-btn').forEach((b, idx) => {
    b.classList.toggle('active', idx === i);
    b.setAttribute('aria-selected', idx === i ? 'true' : 'false');
  });
  wrap.querySelectorAll('.lumio-tab-panel').forEach((p, idx) => p.classList.toggle('active', idx === i));
  lumioRecordProgress(wrap, 'visited', i);
  // Builder-only: persist which tab is active so re-rendering after a
  // media-picker upload doesn't snap back to the default tab and hide it.
  const canvasBlock = wrap.closest('.canvas-block');
  const blockId = canvasBlock && canvasBlock.dataset.blockId;
  if (blockId) BuilderUI.openItemState[blockId] = i;
}

/* Process — jump to / step through a given step, updating indicators and
   enabling/disabling the Back/Next buttons at the ends. */
function lumioProcessGoto(wrap, idx) {
  const steps = wrap.querySelectorAll('.lumio-process-step');
  const dots = wrap.querySelectorAll('.lumio-process-dot');
  if (idx < 0 || idx >= steps.length) return;
  steps.forEach((s, i) => s.classList.toggle('active', i === idx));
  dots.forEach((dd, i) => dd.classList.toggle('active', i === idx));
  wrap.dataset.current = String(idx);
  const prev = wrap.querySelector('.lumio-process-prev');
  const next = wrap.querySelector('.lumio-process-next');
  if (prev) prev.disabled = idx === 0;
  if (next) next.disabled = idx === steps.length - 1;
  lumioRecordProgress(wrap, 'visited', idx);
  // Builder-only: persist current step so re-rendering after a media-picker
  // upload doesn't snap back to step 0 and hide it.
  const canvasBlock = wrap.closest('.canvas-block');
  const blockId = canvasBlock && canvasBlock.dataset.blockId;
  if (blockId) BuilderUI.openItemState[blockId] = idx;
}
function lumioProcessNav(wrap, dir) {
  const current = parseInt(wrap.dataset.current || '0', 10);
  lumioProcessGoto(wrap, current + dir);
}
function lumioProcessTouchStart(e, wrap) {
  wrap._touchX = (e.touches ? e.touches[0].clientX : e.clientX);
}
function lumioProcessTouchEnd(e, wrap) {
  if (wrap.dataset.swipe === '0') return;
  const endX = (e.changedTouches ? e.changedTouches[0].clientX : e.clientX);
  const dx = endX - (wrap._touchX == null ? endX : wrap._touchX);
  if (Math.abs(dx) > 40) lumioProcessNav(wrap, dx < 0 ? 1 : -1);
}

/* Labelled Graphic — open a hotspot's info panel, honouring "Auto Close
   Previous". */
// Mark a hotspot marker as visited: stop its pulse animation and, for the
// "Checkmark" visited style, swap its glyph for a permanent checkmark.
function lumioHotspotMarkVisited(marker) {
  lumioRecordProgress(marker, 'opened', parseInt(marker.dataset.hindex, 10));
  if (marker.classList.contains('visited')) return;
  marker.classList.add('visited', 'pulse-off');
  const wrap = marker.closest('.lumio-labelled-graphic');
  if (wrap && wrap.dataset.visitedstyle === 'checkmark') marker.textContent = '✓';
}

function lumioHotspotOpen(wrap, i) {
  const panel = wrap.querySelector(`.lumio-hotspot-panel[data-hindex="${i}"]`);
  const marker = wrap.querySelector(`.lumio-hotspot[data-hindex="${i}"]`);
  if (!panel || !marker) return;
  const autoClose = wrap.dataset.autoclose !== '0';
  if (autoClose) {
    wrap.querySelectorAll('.lumio-hotspot-panel').forEach(p => { if (p !== panel) p.style.display = 'none'; });
    wrap.querySelectorAll('.lumio-hotspot').forEach(b => { if (b !== marker) b.classList.remove('active'); });
  }
  panel.style.display = 'block';
  marker.classList.add('active');
  lumioHotspotMarkVisited(marker);
}

function lumioHotspotClose(wrap, i) {
  const panel = wrap.querySelector(`.lumio-hotspot-panel[data-hindex="${i}"]`);
  const marker = wrap.querySelector(`.lumio-hotspot[data-hindex="${i}"]`);
  if (panel) panel.style.display = 'none';
  if (marker) marker.classList.remove('active');
}

function lumioHotspotToggle(btn, i) {
  if (btn._suppressClick) { btn._suppressClick = false; return; }
  const wrap = btn.closest('.lumio-labelled-graphic');
  const panel = wrap.querySelector(`.lumio-hotspot-panel[data-hindex="${i}"]`);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  if (isOpen) lumioHotspotClose(wrap, i);
  else lumioHotspotOpen(wrap, i);
}

// Hotspot panel Prev/Next — move to the adjacent hotspot in Content-panel order.
function lumioHotspotPanelNav(btn, dir) {
  const panel = btn.closest('.lumio-hotspot-panel');
  const wrap = btn.closest('.lumio-labelled-graphic');
  if (!panel || !wrap) return;
  const total = wrap.querySelectorAll('.lumio-hotspot-panel').length;
  const current = parseInt(panel.dataset.hindex, 10);
  const next = (current + dir + total) % total;
  lumioHotspotClose(wrap, current);
  lumioHotspotOpen(wrap, next);
}

/* Labelled Graphic (Builder only) — drag a hotspot marker to reposition it.
   Coordinates are stored as percentages of the image wrapper so positioning
   stays correct as the image scales (responsive). Persists into
   block.data.hotspots[i].x/y on drop, then re-renders + autosaves. */
function lumioHotspotDragStart(ev, hindex) {
  ev.preventDefault();
  ev.stopPropagation();
  const marker = ev.currentTarget;
  const wrap = marker.closest('.lumio-lg-imagewrap');
  const canvasBlock = marker.closest('.canvas-block');
  if (!wrap || !canvasBlock) return;
  const blockIndex = parseInt(canvasBlock.dataset.index, 10);
  const rect = wrap.getBoundingClientRect();
  const startX = ev.touches ? ev.touches[0].clientX : ev.clientX;
  const startY = ev.touches ? ev.touches[0].clientY : ev.clientY;
  let moved = false;
  function move(e) {
    const point = e.touches ? e.touches[0] : e;
    if (Math.abs(point.clientX - startX) > 3 || Math.abs(point.clientY - startY) > 3) moved = true;
    let x = ((point.clientX - rect.left) / rect.width) * 100;
    let y = ((point.clientY - rect.top) / rect.height) * 100;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    marker.style.left = x + '%';
    marker.style.top = y + '%';
    marker.dataset.pendingX = String(x);
    marker.dataset.pendingY = String(y);
  }
  function up() {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', up);
    if (!moved) {
      marker._suppressClick = false;
      lumioHotspotToggle(marker, hindex);
      return;
    }
    marker._suppressClick = true;
    const x = parseFloat(marker.dataset.pendingX);
    const y = parseFloat(marker.dataset.pendingY);
    if (!isNaN(x) && !isNaN(y)) {
      const blocksArr = LumioState.lessons[LumioState.currentLessonId];
      const block = blocksArr && blocksArr[blockIndex];
      const hs = block && block.data.hotspots && block.data.hotspots[hindex];
      if (hs) {
        hs.x = Math.round(x * 10) / 10;
        hs.y = Math.round(y * 10) / 10;
        renderLessonBuilder(LumioState.currentLessonId);
        flashSaveStatus();
      }
    }
  }
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', up);
}

/* Scenario — handle a choice click: show feedback, optionally track
   scoring, then advance to the linked next scene (or show the completion
   message if this is a terminal choice). */
function lumioScenarioChoice(btn) {
  const sceneEl = btn.closest('.lumio-scenario-scene');
  const wrap = btn.closest('.lumio-scenario');
  const choicesWrap = sceneEl.querySelector('.lumio-scenario-choices');
  const feedbackEl = sceneEl.querySelector('.lumio-scenario-feedback');
  if (wrap.dataset.scoring === '1') {
    wrap.dataset.total = String((parseInt(wrap.dataset.total || '0', 10)) + 1);
    if (btn.dataset.correct === '1') wrap.dataset.correct = String((parseInt(wrap.dataset.correct || '0', 10)) + 1);
  }
  const feedback = btn.dataset.feedback || '';
  const next = btn.dataset.next;
  let html = feedback ? `<p>${escapeHtml(feedback)}</p>` : '';
  if (next !== '' && next != null) {
    html += `<button class="btn btn-primary btn-sm lumio-scenario-continue">Continue</button>`;
  } else {
    html += `<p class="lumio-scenario-final-msg">${escapeHtml(wrap.dataset.completion || 'Scenario complete!')}</p>`;
    lumioRecordProgress(wrap, 'completed');
  }
  feedbackEl.innerHTML = html;
  feedbackEl.style.display = 'block';
  choicesWrap.style.display = 'none';
  const cont = feedbackEl.querySelector('.lumio-scenario-continue');
  if (cont) cont.addEventListener('click', (e) => {
    e.stopPropagation();
    lumioScenarioGoto(wrap, parseInt(next, 10));
  });
}
function lumioScenarioGoto(wrap, idx) {
  const scenes = wrap.querySelectorAll('.lumio-scenario-scene');
  if (idx < 0 || idx >= scenes.length) return;
  scenes.forEach((s, i) => s.classList.toggle('active', i === idx));
  wrap.dataset.current = String(idx);
}

function contentFields(fields) {
  return fields.map(([label, key, val, type]) => `
    <div class="field">
      <label>${label}</label>
      ${type === 'textarea'
        ? `<textarea class="textarea content-field" data-field="${key}" rows="3">${val || ''}</textarea>`
        : `<input class="input content-field" data-field="${key}" value="${(val||'').toString().replace(/"/g,'&quot;')}" />`}
    </div>
  `).join('');
}

function aiActions(includeImage) {
  return `
    <div class="flex gap-8 mt-8" style="flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm ai-action" data-action="rewrite">✨ Rewrite</button>
      <button class="btn btn-secondary btn-sm ai-action" data-action="simplify">Simplify</button>
      <button class="btn btn-secondary btn-sm ai-action" data-action="shorten">Shorten</button>
      ${includeImage ? `<button class="btn btn-secondary btn-sm ai-action" data-action="alt">Generate alt text</button>` : ''}
    </div>
  `;
}

/* ============================================================
   AI ASSISTANT PANEL
   ============================================================ */
function renderAIPanel(lesson, blocks) {
  const messages = BuilderUI.chatMessages || (BuilderUI.chatMessages = [
    { from: 'ai', text: LumioData.ai.assistantReplies.default }
  ]);
  return `
    <div style="position:fixed; top:0; right:0; bottom:0; width:340px; background:var(--surface-0); border-left:1px solid var(--border); box-shadow:var(--elevation-2); z-index:60; display:flex; flex-direction:column;" class="fade-in">
      <div class="flex items-center justify-between" style="padding:14px 16px; border-bottom:1px solid var(--border);">
        <div class="flex items-center gap-8"><div class="ai-spark">✨</div><strong style="font-size:14px;">Lumio AI Assistant</strong></div>
        <button class="btn-icon" id="close-ai">✕</button>
      </div>
      <div style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px;" id="chat-log">
        ${messages.map(m => `
          <div style="align-self:${m.from==='ai'?'flex-start':'flex-end'}; max-width:85%;">
            <div class="card card-pad" style="font-size:13px; background:${m.from==='ai' ? 'var(--pastel-lavender)' : 'var(--surface-0)'}; border:${m.from==='ai'?'none':'1px solid var(--border)'};">${m.text}</div>
          </div>
        `).join('')}
      </div>
      <div style="padding:12px; border-top:1px solid var(--border);">
        <div class="flex gap-8 mb-8" style="flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm chat-suggestion" data-msg="draft this lesson">Draft this lesson</button>
          <button class="btn btn-secondary btn-sm chat-suggestion" data-msg="suggest a knowledge check">Suggest a knowledge check</button>
          <button class="btn btn-secondary btn-sm chat-suggestion" data-msg="how am i doing">How am I doing?</button>
        </div>
        <div class="input-icon-wrap">
          <span class="icon">✨</span>
          <input class="input" id="chat-input" placeholder="Ask Lumio AI..." />
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   EVENT BINDING
   ============================================================ */
function bindBuilderEvents(course, lesson, blocks) {
  const app = document.getElementById('app');

  // Inline rich-text toolbar (Heading & Paragraph block only) — the toolbar
  // element lives on document.body and persists across re-renders; hide it
  // here since the contenteditable element it was attached to is stale.
  ensureRichTextToolbar();
  hideRichTextToolbar();
  RichTextToolbar.activeField = null;

  // Top bar
  app.querySelector('#builder-logo').addEventListener('click', () => {
    const status = document.getElementById('save-status');
    if (status && status.textContent === 'Saving...') {
      confirmLeaveModal('Your latest changes are still saving. Leaving now may discard them.', () => navigate('#/welcome'));
    } else {
      navigate('#/welcome');
    }
  });
  app.querySelector('#back-to-course').addEventListener('click', () => {
    if (course) navigate('#/course/' + course.id); else navigate('#/projects');
  });
  app.querySelector('#lesson-name-input').addEventListener('input', (e) => {
    if (lesson) lesson.title = e.target.value;
    flashSaveStatus();
  });
  app.querySelector('#preview-lesson').addEventListener('click', () => {
    if (!course) {
      toast('Link this lesson to a course to preview it', '👁️');
      return;
    }
    openLearnerPreviewFor(course.id, '#/lesson/' + lesson.id, lesson.id);
  });
  app.querySelector('#toggle-ai').addEventListener('click', () => {
    BuilderUI.aiOpen = !BuilderUI.aiOpen;
    renderLessonBuilder(lesson.id);
  });

  // Library collapse/expand
  app.querySelector('#collapse-library')?.addEventListener('click', () => { BuilderUI.leftCollapsed = true; renderLessonBuilder(lesson.id); });
  app.querySelector('#expand-library')?.addEventListener('click', () => { BuilderUI.leftCollapsed = false; renderLessonBuilder(lesson.id); });

  // Right panel collapse/expand
  app.querySelector('#collapse-right')?.addEventListener('click', () => { BuilderUI.rightCollapsed = true; renderLessonBuilder(lesson.id); });
  app.querySelector('#expand-right')?.addEventListener('click', () => { BuilderUI.rightCollapsed = false; renderLessonBuilder(lesson.id); });

  // Lesson Insights toggle
  app.querySelector('#toggle-insights')?.addEventListener('change', (e) => {
    BuilderUI.showInsights = e.target.checked;
    renderLessonBuilder(lesson.id);
  });

  // Allow Multiple Expanded Blocks toggle
  app.querySelector('#toggle-multi-expand')?.addEventListener('change', (e) => {
    BuilderUI.allowMultipleExpanded = e.target.checked;
    if (!BuilderUI.allowMultipleExpanded && BuilderUI.expandedBlocks.size > 1) {
      const last = BuilderUI.selected !== null ? BuilderUI.selected : [...BuilderUI.expandedBlocks][0];
      BuilderUI.expandedBlocks = new Set(last !== null ? [last] : []);
    }
    renderLessonBuilder(lesson.id);
  });

  // Category collapse/expand — accordion: only one category open at a time
  app.querySelectorAll('.cat-header').forEach(h => h.addEventListener('click', () => {
    const cat = h.dataset.cat;
    const wasExpanded = !!BuilderUI.expanded[cat];
    BuilderUI.expanded = {};
    if (!wasExpanded) BuilderUI.expanded[cat] = true;
    renderLessonBuilder(lesson.id);
  }));

  // Block search (simple highlight/filter)
  app.querySelector('#block-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    app.querySelectorAll('.block-tile').forEach(t => {
      t.style.display = t.dataset.blockName.toLowerCase().includes(q) ? '' : 'none';
    });
    if (q) {
      app.querySelectorAll('.cat-body').forEach(b => b.classList.add('expanded'));
      app.querySelectorAll('.cat-header .caret').forEach(c => c.textContent = '▾');
    }
  });

  // Click to add: if an insertion zone is active, the clicked block is
  // inserted there; otherwise it's appended to the end of the lesson.
  app.querySelectorAll('.block-tile').forEach(tile => tile.addEventListener('click', () => {
    const targetIndex = BuilderUI.insertZoneIndex !== null ? BuilderUI.insertZoneIndex : blocks.length;
    BuilderUI.insertZoneIndex = null;
    insertBlockAndFocus(tile.dataset.blockId, blocks, lesson, targetIndex);
  }));

  // AI draft lesson (empty canvas)
  app.querySelector('#ai-draft-lesson')?.addEventListener('click', () => aiDraftLesson(lesson, blocks));

  // Block selection / expansion
  app.querySelectorAll('.canvas-block').forEach(b => b.addEventListener('click', (e) => {
    if (e.target.closest('.block-toolbar')) return;

    // Selecting 100% of a text field's content often releases the mouse just
    // outside the .editable-text element (in the surrounding padding), so
    // e.target won't be inside it even though a real selection was made.
    // Re-rendering the block here would wipe that live selection before the
    // Rich Text Toolbar can appear — bail out and let the selection stand.
    const activeSelection = window.getSelection();
    if (activeSelection && !activeSelection.isCollapsed
        && activeSelection.anchorNode && b.contains(activeSelection.anchorNode)
        && activeSelection.focusNode && b.contains(activeSelection.focusNode)) {
      return;
    }

    const idx = parseInt(b.dataset.index);
    const editableTarget = e.target.closest('.editable-text[contenteditable="true"]');
    // Failed Acceptance Criteria Correction Sprint (Issue 4): every
    // nested-item block's own interaction control (tab buttons, accordion
    // headers, process nav/dots, hotspot markers/panels) has its own
    // dedicated inline onclick handler that already ran during bubbling.
    // Without this check, this delegated block-selection handler treated
    // that same click as "click an already-selected block again" and
    // toggled it CLOSED — collapsing the block (and its toolbar/right
    // panel) the instant the author tried to switch tabs/accordion items,
    // making every tab past the first effectively unreachable.
    const interactiveControlTarget = e.target.closest(
      '.lumio-tab-btn, .lumio-accordion-header, .lumio-process-nav, .lumio-process-dot, .lumio-hotspot, .lumio-hotspot-panel'
    );

    // Clicking a block while an insertion zone is active cancels the zone.
    if (BuilderUI.insertZoneIndex !== null) {
      BuilderUI.insertZoneIndex = null;
    }

    // If the block is already selected/expanded, let a click on its text
    // place the cursor natively — don't re-render and lose focus.
    if (editableTarget && BuilderUI.selected === idx && BuilderUI.expandedBlocks.has(idx)) {
      return;
    }
    // Same idea for interactive controls: if the block is already selected,
    // its own handler (lumioTabSwitch/lumioAccordionToggle/etc.) is the
    // sole effect of this click — don't also toggle the block's selection.
    if (interactiveControlTarget && BuilderUI.selected === idx && BuilderUI.expandedBlocks.has(idx)) {
      return;
    }

    const clickX = e.clientX, clickY = e.clientY;
    if (BuilderUI.allowMultipleExpanded) {
      if (BuilderUI.expandedBlocks.has(idx)) BuilderUI.expandedBlocks.delete(idx);
      else BuilderUI.expandedBlocks.add(idx);
    } else {
      BuilderUI.expandedBlocks = BuilderUI.expandedBlocks.has(idx) && BuilderUI.expandedBlocks.size === 1 ? new Set() : new Set([idx]);
    }
    BuilderUI.selected = BuilderUI.expandedBlocks.has(idx) ? idx : null;
    BuilderUI.rightTab = 'content';
    renderLessonBuilder(lesson.id);

    // First click on a text block: select it and drop the cursor right
    // where the user clicked, so typing can start immediately.
    if (editableTarget && BuilderUI.selected === idx) {
      placeCaretAtPoint(clickX, clickY);
    }
  }));

  // Clicking empty canvas whitespace (not on a block) clears the current selection.
  const canvasWrap = document.getElementById('lesson-canvas-wrap');
  if (canvasWrap) {
    canvasWrap.addEventListener('click', (e) => {
      if (e.target.closest('.canvas-block')) return;
      if (e.target.closest('.insertion-zone')) return;
      if (BuilderUI.selected === null && BuilderUI.expandedBlocks.size === 0 && BuilderUI.insertZoneIndex === null) return;
      BuilderUI.selected = null;
      BuilderUI.expandedBlocks = new Set();
      BuilderUI.insertZoneIndex = null;
      renderLessonBuilder(lesson.id);
    });
  }

  // ESC deselects the currently selected block and cancels any active insertion zone.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (BuilderUI.selected === null && BuilderUI.expandedBlocks.size === 0 && BuilderUI.insertZoneIndex === null) return;
    BuilderUI.selected = null;
    BuilderUI.expandedBlocks = new Set();
    BuilderUI.insertZoneIndex = null;
    renderLessonBuilder(lesson.id);
  });

  // Explicit Cancel button on an active insertion zone — closes it without inserting a block.
  app.querySelectorAll('.insertion-zone-cancel').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    BuilderUI.insertZoneIndex = null;
    renderLessonBuilder(lesson.id);
  }));

  // Click anywhere outside the active insertion zone (including outside the
  // canvas, e.g. the block library or right panel) closes it without inserting.
  if (BuilderUI._insertZoneOutsideHandler) {
    document.removeEventListener('click', BuilderUI._insertZoneOutsideHandler);
    BuilderUI._insertZoneOutsideHandler = null;
  }
  if (BuilderUI.insertZoneIndex !== null) {
    BuilderUI._insertZoneOutsideHandler = (e) => {
      if (BuilderUI.insertZoneIndex === null) return;
      if (e.target.closest('.insertion-zone')) return;
      if (e.target.closest('.drop-zone-add')) return;
      if (e.target.closest('.block-tile')) return;
      BuilderUI.insertZoneIndex = null;
      renderLessonBuilder(lesson.id);
    };
    document.addEventListener('click', BuilderUI._insertZoneOutsideHandler);
  }

  // Block toolbar actions
  app.querySelectorAll('.del-block-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    blocks.splice(parseInt(btn.dataset.index), 1);
    BuilderUI.selected = null;
    BuilderUI.expandedBlocks = new Set();
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.dup-block-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const i = parseInt(btn.dataset.index);
    const copy = JSON.parse(JSON.stringify(blocks[i]));
    copy.id = generateBlockId(); // duplicates must NEVER share the original's id
    blocks.splice(i+1, 0, copy);
    BuilderUI.selected = null;
    BuilderUI.expandedBlocks = new Set();
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.ai-rewrite-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toast('✨ Lumio rewrote this block for clarity', '✨');
  }));

  // Right panel tabs
  app.querySelectorAll('[data-rtab]').forEach(t => t.addEventListener('click', () => {
    BuilderUI.rightTab = t.dataset.rtab;
    renderLessonBuilder(lesson.id);
  }));

  // Content field editing
  app.querySelectorAll('.content-field').forEach(f => f.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    const field = e.target.dataset.field;
    if (e.target.type === 'checkbox') {
      block.data[field] = e.target.checked;
    } else if (field === 'items' || field === 'cards' || field === 'options' || field === 'left' || field === 'right') {
      block.data[field] = e.target.value.split('\n').filter(x=>x.trim());
    } else if (field === 'correctMulti') {
      block.data.correct = e.target.value.split(',').map(s=>parseInt(s.trim(),10)-1).filter(n=>!isNaN(n) && n>=0);
    } else if (field === 'accordionItems') {
      block.data.items = e.target.value.split('\n').filter(x=>x.trim()).map(line => {
        const [title, content] = line.split('::').map(s => s.trim());
        return { title, content };
      });
    } else if (field === 'tabsData') {
      const lines = e.target.value.split('\n').filter(x=>x.trim());
      block.data.tabs = lines.map(line => line.split('::')[0].trim());
      block.data.contents = lines.map(line => (line.split('::')[1] || '').trim());
    } else if (field === 'correct') {
      block.data[field] = parseInt(e.target.value) - 1;
    } else if (field === 'quotes') {
      block.data[field] = e.target.value.split('\n').filter(x=>x.trim()).map(line => {
        const [text, author] = line.split('|').map(s => s.trim());
        return { text, author };
      });
    } else if (field === 'choices') {
      block.data[field] = e.target.value.split('\n').filter(x=>x.trim()).map(line => {
        const [text, feedback] = line.split('::').map(s => s.trim());
        return { text, feedback };
      });
    } else if (field === 'columnItems') {
      block.data.items = e.target.value.split('\n').filter(x=>x.trim()).map(line => {
        const [title, description, imageUrl] = line.split('::').map(s => (s||'').trim());
        return { title, description, imageUrl: imageUrl || undefined };
      });
    } else if (field === 'processSteps') {
      block.data.steps = e.target.value.split('\n').filter(x=>x.trim()).map(line => {
        const [title, description] = line.split('::').map(s => s.trim());
        return description ? { title, description } : title;
      });
    } else if (field === 'destType') {
      block.data.destType = e.target.value;
      renderLessonBuilder(lesson.id);
    } else if (field === 'anchorIndex') {
      block.data.anchorIndex = parseInt(e.target.value, 10) || 0;
    } else if (field === 'hotspots') {
      block.data.hotspots = e.target.value.split('\n').filter(x=>x.trim()).map(line => {
        const [label, description] = line.split('::').map(s => (s||'').trim());
        return { label, description };
      });
    } else {
      block.data[field] = e.target.value;
    }
    flashSaveStatus();
  }));

  // Charts — Content panel: title / axis labels / dataset row label & value
  app.querySelectorAll('.chart-field').forEach(f => f.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.data = block.data || {};
    const field = f.dataset.field;
    const iindex = f.dataset.iindex;
    if (iindex !== undefined && iindex !== '') {
      const items = normalizeChartItems(block.data, block.type === 'chart_pie' ? 'pie' : 'other');
      const item = items[parseInt(iindex)];
      if (!item) return;
      if (field === 'value') item.value = parseFloat(e.target.value) || 0;
      else item.label = e.target.value;
    } else {
      block.data[field] = e.target.value;
    }
    applyLivePreview(block, BuilderUI.selected);
  }));
  app.querySelectorAll('.chart-field').forEach(f => f.addEventListener('change', () => flashSaveStatus()));

  // Dividers — Content panel: Continue label/hint/completion type, Numbered Divider marker
  app.querySelectorAll('.divider-field').forEach(f => f.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.data = block.data || {};
    block.data[f.dataset.field] = e.target.value;
    applyLivePreview(block, BuilderUI.selected);
  }));
  app.querySelectorAll('.divider-field').forEach(f => f.addEventListener('change', () => flashSaveStatus()));

  // Continue block — Design panel: background image toggle + upload
  app.querySelector('.continue-bg-image-toggle')?.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.bgStyle = e.target.checked ? 'image' : 'theme';
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('.continue-bg-image-trigger')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    openMediaPicker({
      title: 'Background Image',
      currentSrc: block.design.bgImage,
      onInsert: (result) => {
        block.design.bgImage = result.src;
        block.design.bgStyle = 'image';
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
      onRemove: () => {
        delete block.design.bgImage;
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
    });
  });
  app.querySelector('.continue-bg-image-remove')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    delete block.design.bgImage;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });

  // Charts — Content panel: dataset row add / duplicate / remove / reorder
  app.querySelectorAll('.chart-row-add').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeChartItems(block.data, block.type === 'chart_pie' ? 'pie' : 'other');
    items.push({ label: '', value: 0, color: '' });
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.chart-row-duplicate').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeChartItems(block.data, block.type === 'chart_pie' ? 'pie' : 'other');
    const i = parseInt(btn.dataset.iindex);
    items.splice(i + 1, 0, JSON.parse(JSON.stringify(items[i])));
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.chart-row-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeChartItems(block.data, block.type === 'chart_pie' ? 'pie' : 'other');
    if (items.length <= 1) return;
    items.splice(parseInt(btn.dataset.iindex), 1);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.chart-row-up').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeChartItems(block.data, block.type === 'chart_pie' ? 'pie' : 'other');
    const i = parseInt(btn.dataset.iindex);
    if (i <= 0) return;
    [items[i - 1], items[i]] = [items[i], items[i - 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.chart-row-down').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeChartItems(block.data, block.type === 'chart_pie' ? 'pie' : 'other');
    const i = parseInt(btn.dataset.iindex);
    if (i >= items.length - 1) return;
    [items[i + 1], items[i]] = [items[i], items[i + 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Charts — Design panel: per-segment colour overrides (Pie)
  app.querySelectorAll('.chart-segment-color').forEach(inp => inp.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeChartItems(block.data, 'pie');
    const item = items[parseInt(inp.dataset.iindex)];
    if (!item) return;
    item.color = e.target.value;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.chart-segment-color-reset').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeChartItems(block.data, 'pie');
    const item = items[parseInt(btn.dataset.iindex)];
    if (!item) return;
    item.color = '';
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Charts — Design panel: image background toggle + upload
  app.querySelector('.chart-bg-image-toggle')?.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.bgStyle = e.target.checked ? 'image' : 'light';
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('.chart-bg-image-trigger')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    openMediaPicker({
      title: 'Background Image',
      currentSrc: block.design.bgImage,
      onInsert: (result) => {
        block.design.bgImage = result.src;
        block.design.bgStyle = 'image';
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
      onRemove: () => {
        delete block.design.bgImage;
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
    });
  });
  app.querySelector('.chart-bg-image-remove')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    delete block.design.bgImage;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });

  // Design tab — background swatches
  app.querySelectorAll('.design-swatch').forEach(sw => sw.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    block.design = block.design || {};
    block.design.bg = sw.dataset.color;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Design tab — segmented controls (alignment, radius, and per-type options)
  app.querySelectorAll('.seg-control[data-prop]').forEach(seg => {
    seg.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      const block = blocks[BuilderUI.selected];
      if (!block) return;
      block.design = block.design || {};
      block.design[seg.dataset.prop] = btn.dataset.val;
      renderLessonBuilder(lesson.id);
      flashSaveStatus();
    }));
  });

  // Design tab — custom colour pickers (e.g. Button custom background/text colour)
  app.querySelectorAll('.design-color-input[data-prop]').forEach(inp => inp.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design[inp.dataset.prop] = inp.value;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Table block — header/border/body-fill colour resets and the body-fill toggle.
  app.querySelectorAll('.table-style-reset').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block || !block.design) return;
    delete block.design[btn.dataset.prop];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.table-bodyfill-toggle').forEach(cb => cb.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    if (cb.checked) block.design.tableBodyFill = block.design.tableBodyFill || '#FFFFFF';
    else delete block.design.tableBodyFill;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Design tab — dropdowns stored on block.design (e.g. Marker Style)
  app.querySelectorAll('.design-select[data-prop]').forEach(sel => sel.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design[sel.dataset.prop] = sel.value;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Design tab — boolean toggles stored on block.design (e.g. Shadow, Flip Hint)
  app.querySelectorAll('.design-checkbox[data-prop]').forEach(cb => cb.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design[cb.dataset.prop] = cb.checked;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Text blocks — Move Up / Move Down
  app.querySelectorAll('.move-up-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const i = parseInt(btn.dataset.index);
    if (i <= 0) return;
    [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
    BuilderUI.selected = i - 1;
    BuilderUI.expandedBlocks = new Set([i - 1]);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.move-down-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const i = parseInt(btn.dataset.index);
    if (i >= blocks.length - 1) return;
    [blocks[i], blocks[i + 1]] = [blocks[i + 1], blocks[i]];
    BuilderUI.selected = i + 1;
    BuilderUI.expandedBlocks = new Set([i + 1]);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Text blocks — universal inline (contenteditable) editing, plus the
  // rich-text formatting toolbar for fields that support it.
  app.querySelectorAll('.editable-text[contenteditable="true"]').forEach(elx => bindEditableTextField(elx, blocks));

  // List blocks — on-canvas item management (add / remove / reorder)
  app.querySelectorAll('.list-item-add').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[parseInt(btn.closest('.canvas-block').dataset.index)];
    const items = normalizeListItems(block.data, (LIST_DEFAULTS[block.type] || {}).items);
    const newItem = { text: '' };
    if (block.type === 'list_checkbox') newItem.checked = false;
    items.push(newItem);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.list-item-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[parseInt(btn.closest('.canvas-block').dataset.index)];
    const items = normalizeListItems(block.data, (LIST_DEFAULTS[block.type] || {}).items);
    if (items.length <= 1) return;
    items.splice(parseInt(btn.dataset.itemindex), 1);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.list-item-move-up').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[parseInt(btn.closest('.canvas-block').dataset.index)];
    const items = normalizeListItems(block.data, (LIST_DEFAULTS[block.type] || {}).items);
    const i = parseInt(btn.dataset.itemindex);
    if (i <= 0) return;
    [items[i - 1], items[i]] = [items[i], items[i - 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.list-item-move-down').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[parseInt(btn.closest('.canvas-block').dataset.index)];
    const items = normalizeListItems(block.data, (LIST_DEFAULTS[block.type] || {}).items);
    const i = parseInt(btn.dataset.itemindex);
    if (i >= items.length - 1) return;
    [items[i + 1], items[i]] = [items[i], items[i + 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Numbered list — manual number/label override per item (live update, no re-render so focus is kept)
  app.querySelectorAll('.list-number-override').forEach(input => input.addEventListener('input', (e) => {
    const wrapper = e.target.closest('.canvas-block');
    const block = blocks[parseInt(wrapper.dataset.index)];
    const items = normalizeListItems(block.data, (LIST_DEFAULTS[block.type] || {}).items);
    const i = parseInt(e.target.dataset.itemindex);
    items[i] = items[i] || {};
    items[i].override = e.target.value;
    const row = e.target.closest('.list-item-row');
    const marker = row ? row.querySelector('.list-marker') : null;
    if (marker) {
      const override = e.target.value.trim();
      marker.textContent = override || listNumberMarker((block.design || {}).numberStyle || 'decimal', i + 1);
    }
    flashSaveStatus();
  }));

  // Checkbox list — toggle an item's default (authored) checked state on canvas
  app.querySelectorAll('.list-checkbox-marker').forEach(marker => {
    const toggle = (e) => {
      e.stopPropagation();
      const wrapper = marker.closest('.canvas-block');
      const block = blocks[parseInt(wrapper.dataset.index)];
      const items = normalizeListItems(block.data, (LIST_DEFAULTS[block.type] || {}).items);
      const i = parseInt(marker.dataset.itemindex);
      items[i] = items[i] || {};
      items[i].checked = !items[i].checked;
      renderLessonBuilder(lesson.id);
      flashSaveStatus();
    };
    marker.addEventListener('click', toggle);
    marker.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
  });

  // List blocks — Bullet / Checkbox colour pickers (live preview on input, full re-render on change)
  app.querySelectorAll('.list-bullet-color, .list-checkbox-border-color, .list-checkbox-tick-color').forEach(input => {
    const prop = input.classList.contains('list-bullet-color') ? 'bulletColor'
      : input.classList.contains('list-checkbox-border-color') ? 'checkboxBorderColor'
      : 'checkboxTickColor';
    input.addEventListener('input', (e) => {
      const block = blocks[BuilderUI.selected];
      if (!block) return;
      block.design = block.design || {};
      block.design[prop] = e.target.value;
      applyListStylesToDom(block, BuilderUI.selected);
    });
    input.addEventListener('change', () => {
      renderLessonBuilder(lesson.id);
      flashSaveStatus();
    });
  });

  // Text blocks — Typography / Spacing sliders (live preview, no full re-render mid-drag)
  app.querySelectorAll('.design-range').forEach(r => {
    r.addEventListener('input', () => {
      const block = blocks[BuilderUI.selected];
      if (!block) return;
      block.design = block.design || {};
      block.design[r.dataset.prop] = parseInt(r.value);
      const out = r.parentElement.querySelector('.range-val');
      if (out) out.textContent = r.value + (r.dataset.suffix || 'px');
      applyLivePreview(block, BuilderUI.selected);
    });
    r.addEventListener('change', () => flashSaveStatus());
  });

  // Text blocks — Bold / Italic / Underline
  app.querySelectorAll('.text-fmt-btn').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design[btn.dataset.fmt] = !block.design[btn.dataset.fmt];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Text blocks — Font colour
  app.querySelectorAll('.text-color-swatch').forEach(sw => sw.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    if (sw.dataset.color === 'theme') delete block.design.fontColor;
    else block.design.fontColor = sw.dataset.color;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelector('.text-color-custom')?.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.fontColor = e.target.value;
    applyLivePreview(block, BuilderUI.selected);
  });
  app.querySelector('.text-color-custom')?.addEventListener('change', () => {
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });

  // Text blocks — Theme font toggle / custom font family override
  app.querySelector('.theme-font-toggle')?.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    if (e.target.checked) delete block.design.fontFamily;
    else block.design.fontFamily = 'Georgia, serif';
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('.font-family-input')?.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.fontFamily = e.target.value || 'theme';
    applyLivePreview(block, BuilderUI.selected);
  });

  // Text blocks — Background: custom colour & image fill
  app.querySelector('.text-bg-custom-color')?.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.bgColor = e.target.value;
    applyLivePreview(block, BuilderUI.selected);
  });
  app.querySelector('.text-bg-custom-color')?.addEventListener('change', () => {
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });

  // Media Picker — generic image field triggers (e.g. Quote avatars, Quote on Image background)
  app.querySelectorAll('.media-picker-trigger').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const target = btn.dataset.target;
    const kind = btn.dataset.kind || 'image';
    const useDesign = btn.dataset.namespace === 'design';
    const store = useDesign ? (block.design || (block.design = {})) : (block.data || (block.data = {}));
    openMediaPicker({
      title: btn.dataset.title || 'Image',
      kind,
      currentSrc: store[target],
      currentFileName: store[target + 'FileName'],
      onInsert: (result) => {
        store[target] = result.src;
        if (kind === 'audio' || kind === 'video' || kind === 'file') {
          store[target + 'FileName'] = result.fileName;
          store[target + 'MimeType'] = result.mimeType;
          store[target + 'FileSize'] = result.size;
        }
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
      onRemove: () => {
        delete store[target];
        delete store[target + 'FileName'];
        delete store[target + 'MimeType'];
        delete store[target + 'FileSize'];
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
    });
  }));
  app.querySelectorAll('.media-picker-remove').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const target = btn.dataset.target;
    const useDesign = btn.dataset.namespace === 'design';
    const store = useDesign ? (block.design || {}) : (block.data || {});
    delete store[target];
    delete store[target + 'FileName'];
    delete store[target + 'MimeType'];
    delete store[target + 'FileSize'];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Video — subtitle/caption file upload (VTT/SRT), read as text and stored on block.data.subtitles
  app.querySelector('#subtitle-upload-trigger')?.addEventListener('click', () => {
    app.querySelector('#subtitle-file-input')?.click();
  });
  app.querySelector('#subtitle-file-input')?.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    const file = e.target.files && e.target.files[0];
    if (!block || !file) return;
    if (!/\.(vtt|srt)$/i.test(file.name)) {
      toast('Please upload a VTT or SRT subtitle file.', '⚠️');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      block.data = block.data || {};
      block.data.subtitles = reader.result;
      renderLessonBuilder(lesson.id);
      flashSaveStatus();
    };
    reader.readAsText(file);
  });
  app.querySelector('#subtitle-remove')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block || !block.data) return;
    delete block.data.subtitles;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });

  // Settings tab — boolean toggles stored on block.settings (e.g. Audio Autoplay/Loop/Download/Speed)
  app.querySelectorAll('.settings-field').forEach(cb => cb.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.settings = block.settings || {};
    block.settings[cb.dataset.field] = cb.checked;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Settings tab — select inputs stored on block.settings (e.g. Tabs Default Active Tab)
  app.querySelectorAll('.settings-select').forEach(sel => sel.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.settings = block.settings || {};
    block.settings[sel.dataset.field] = parseInt(sel.value, 10) || 0;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Settings tab — text inputs stored on block.settings (e.g. Scenario Completion Message)
  app.querySelectorAll('.settings-text').forEach(inp => inp.addEventListener('input', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.settings = block.settings || {};
    block.settings[inp.dataset.field] = inp.value;
    flashSaveStatus();
  }));

  /* ---- KC authoring handlers ---- */

  // MC / MR: mark correct (radio for MC, checkbox for MR)
  app.querySelectorAll('.kc-correct-radio').forEach(r => r.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    block.data.correct = parseInt(r.dataset.i, 10);
    flashSaveStatus();
  }));
  app.querySelectorAll('.kc-correct-check').forEach(cb => cb.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    const i = parseInt(cb.dataset.i, 10);
    const s = new Set(Array.isArray(block.data.correct) ? block.data.correct : []);
    if (cb.checked) s.add(i); else s.delete(i);
    block.data.correct = [...s].sort((a, b) => a - b);
    flashSaveStatus();
  }));

  // MC / MR: answer text
  app.querySelectorAll('.kc-answer-text').forEach(inp => inp.addEventListener('input', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    if (!Array.isArray(block.data.options)) block.data.options = [];
    block.data.options[parseInt(inp.dataset.i, 10)] = inp.value;
    flashSaveStatus();
  }));

  // MC / MR: add answer
  app.querySelector('.kc-answer-add')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    if (!Array.isArray(block.data.options)) block.data.options = normalizeKcOptions(block.data);
    block.data.options.push('');
    renderLessonBuilder(lesson.id); flashSaveStatus();
  });

  // MC / MR: delete answer
  app.querySelectorAll('.kc-answer-delete').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    const i = parseInt(btn.dataset.i, 10);
    const opts = block.data.options || [];
    if (opts.length <= 2) return;
    opts.splice(i, 1);
    if (block.type === 'kc_multiple_choice') {
      const c = block.data.correct ?? 0;
      block.data.correct = c === i ? 0 : c > i ? c - 1 : c;
    } else if (block.type === 'kc_multiple_response') {
      block.data.correct = (block.data.correct || []).filter(c => c !== i).map(c => c > i ? c - 1 : c);
    }
    renderLessonBuilder(lesson.id); flashSaveStatus();
  }));

  // Matching: pair text
  app.querySelectorAll('.kc-pair-left').forEach(inp => inp.addEventListener('input', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    if (!Array.isArray(block.data.left)) block.data.left = [];
    block.data.left[parseInt(inp.dataset.i, 10)] = inp.value;
    flashSaveStatus();
  }));
  app.querySelectorAll('.kc-pair-right').forEach(inp => inp.addEventListener('input', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    if (!Array.isArray(block.data.right)) block.data.right = [];
    block.data.right[parseInt(inp.dataset.i, 10)] = inp.value;
    flashSaveStatus();
  }));

  // Matching: add pair
  app.querySelector('.kc-pair-add')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    block.data.left  = normalizeKcLeft(block.data);
    block.data.right = normalizeKcRight(block.data);
    block.data.left.push(''); block.data.right.push('');
    renderLessonBuilder(lesson.id); flashSaveStatus();
  });

  // Matching: delete pair
  app.querySelectorAll('.kc-pair-delete').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    const i = parseInt(btn.dataset.i, 10);
    const left  = block.data.left  || [];
    const right = block.data.right || [];
    if (Math.max(left.length, right.length) <= 2) return;
    left.splice(i, 1); right.splice(i, 1);
    block.data.left = left; block.data.right = right;
    renderLessonBuilder(lesson.id); flashSaveStatus();
  }));

  // Fill Gap: accepted answer text
  app.querySelectorAll('.kc-accepted-text').forEach(inp => inp.addEventListener('input', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    if (!Array.isArray(block.data.answers)) block.data.answers = normalizeKcAnswers(block.data);
    block.data.answers[parseInt(inp.dataset.i, 10)] = inp.value;
    flashSaveStatus();
  }));

  // Fill Gap: add accepted answer
  app.querySelector('.kc-accepted-add')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    if (!Array.isArray(block.data.answers)) block.data.answers = normalizeKcAnswers(block.data);
    block.data.answers.push('');
    renderLessonBuilder(lesson.id); flashSaveStatus();
  });

  // Fill Gap: delete accepted answer
  app.querySelectorAll('.kc-accepted-delete').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    if (!Array.isArray(block.data.answers)) block.data.answers = normalizeKcAnswers(block.data);
    if (block.data.answers.length <= 1) return;
    block.data.answers.splice(parseInt(btn.dataset.i, 10), 1);
    renderLessonBuilder(lesson.id); flashSaveStatus();
  }));

  // Fill Gap: case sensitive
  app.querySelector('.kc-case-sensitive')?.addEventListener('change', e => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    block.data.caseSensitive = e.target.checked;
    flashSaveStatus();
  });

  // Ordering: item text
  app.querySelectorAll('.kc-item-text').forEach(inp => inp.addEventListener('input', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    if (!Array.isArray(block.data.items)) block.data.items = [];
    block.data.items[parseInt(inp.dataset.i, 10)] = inp.value;
    flashSaveStatus();
  }));

  // Ordering: add item
  app.querySelector('.kc-item-add')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    if (!Array.isArray(block.data.items)) block.data.items = normalizeKcItems(block.data);
    block.data.items.push('');
    renderLessonBuilder(lesson.id); flashSaveStatus();
  });

  // Ordering: delete item
  app.querySelectorAll('.kc-item-delete').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    const items = block.data.items || [];
    if (items.length <= 2) return;
    items.splice(parseInt(btn.dataset.i, 10), 1);
    renderLessonBuilder(lesson.id); flashSaveStatus();
  }));

  // Ordering: move up/down
  app.querySelectorAll('.kc-item-up').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    const i = parseInt(btn.dataset.i, 10); if (i === 0) return;
    const items = block.data.items || [];
    [items[i - 1], items[i]] = [items[i], items[i - 1]];
    renderLessonBuilder(lesson.id); flashSaveStatus();
  }));
  app.querySelectorAll('.kc-item-down').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected]; if (!block) return;
    const items = block.data.items || [];
    const i = parseInt(btn.dataset.i, 10);
    if (i >= items.length - 1) return;
    [items[i], items[i + 1]] = [items[i + 1], items[i]];
    renderLessonBuilder(lesson.id); flashSaveStatus();
  }));

  // Settings tab — string-valued selects (KC showCorrectAnswer, completionRule, passingMode)
  app.querySelectorAll('.settings-select-str').forEach(sel => sel.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.settings = block.settings || {};
    block.settings[sel.dataset.field] = sel.value;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Settings tab — KC attempts select (maps named options to numeric maxAttempts)
  app.querySelectorAll('.settings-kc-attempts').forEach(sel => sel.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.settings = block.settings || {};
    const customInput = app.querySelector('#kc-custom-attempts');
    if (sel.value === 'unlimited') {
      block.settings.maxAttempts = 0;
      if (customInput) customInput.style.display = 'none';
    } else if (sel.value === 'custom') {
      block.settings.maxAttempts = parseInt(customInput && customInput.value || '5', 10) || 5;
      if (customInput) customInput.style.display = '';
    } else {
      block.settings.maxAttempts = parseInt(sel.value, 10);
      if (customInput) customInput.style.display = 'none';
    }
    flashSaveStatus();
  }));

  // Settings tab — numeric inputs (KC passingPercentage, custom attempts)
  app.querySelectorAll('.settings-num').forEach(inp => inp.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.settings = block.settings || {};
    block.settings[inp.dataset.field] = parseInt(inp.value, 10) || 0;
    flashSaveStatus();
  }));

  // Settings tab — segmented controls stored on block.settings (e.g. Accordion Open Mode)
  app.querySelectorAll('.seg-control[data-sprop]').forEach(seg => {
    seg.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      const block = blocks[BuilderUI.selected];
      if (!block) return;
      block.settings = block.settings || {};
      block.settings[seg.dataset.sprop] = btn.dataset.val;
      renderLessonBuilder(lesson.id);
      flashSaveStatus();
    }));
  });

  /* ============================================================
     SHARED ITEM-LIST HANDLERS — Accordion / Tabs / Process /
     Labelled Graphic hotspots. Resolve the active block via
     BuilderUI.selected and the item list via data-list.
     ============================================================ */

  // Item text fields (title / body / audio transcript)
  app.querySelectorAll('.lumio-item-text').forEach(el => el.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = block.data[el.dataset.list] || [];
    const item = items[parseInt(el.dataset.iindex, 10)];
    if (!item) return;
    item[el.dataset.field] = e.target.value;
    flashSaveStatus();
  }));

  // Item media — add/replace via Media Picker
  app.querySelectorAll('.lumio-item-media-trigger').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = block.data[btn.dataset.list] || [];
    const item = items[parseInt(btn.dataset.iindex, 10)];
    if (!item) return;
    const field = btn.dataset.field;
    const kind = btn.dataset.kind;
    openMediaPicker({
      title: btn.dataset.title,
      kind,
      currentSrc: item[field],
      currentFileName: item[field + 'FileName'],
      onInsert: (result) => {
        item[field] = result.src;
        if (kind !== 'image') {
          item[field + 'FileName'] = result.fileName;
          item[field + 'MimeType'] = result.mimeType;
          item[field + 'FileSize'] = result.size;
        }
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
      onRemove: () => {
        delete item[field];
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
    });
  }));

  // Item media — remove
  app.querySelectorAll('.lumio-item-media-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = block.data[btn.dataset.list] || [];
    const item = items[parseInt(btn.dataset.iindex, 10)];
    if (!item) return;
    const field = btn.dataset.field;
    delete item[field];
    delete item[field + 'FileName'];
    delete item[field + 'MimeType'];
    delete item[field + 'FileSize'];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Item image — layout / fit selector
  app.querySelectorAll('.lumio-item-fit-control').forEach(seg => {
    seg.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      const block = blocks[BuilderUI.selected];
      if (!block) return;
      const items = block.data[seg.dataset.list] || [];
      const item = items[parseInt(seg.dataset.iindex, 10)];
      if (!item) return;
      item.imageFit = btn.dataset.val;
      renderLessonBuilder(lesson.id);
      flashSaveStatus();
    }));
  });

  // Item list — add / duplicate / remove / reorder
  app.querySelectorAll('.lumio-item-add').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const listKey = btn.dataset.list;
    const items = block.data[listKey] || (block.data[listKey] = []);
    items.push(defaultListItem(block.type, listKey));
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-item-duplicate').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = block.data[btn.dataset.list] || [];
    const i = parseInt(btn.dataset.iindex, 10);
    items.splice(i + 1, 0, JSON.parse(JSON.stringify(items[i])));
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-item-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = block.data[btn.dataset.list] || [];
    if (items.length <= 1) return;
    items.splice(parseInt(btn.dataset.iindex, 10), 1);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-item-move-up').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = block.data[btn.dataset.list] || [];
    const i = parseInt(btn.dataset.iindex, 10);
    if (i <= 0) return;
    [items[i - 1], items[i]] = [items[i], items[i - 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-item-move-down').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = block.data[btn.dataset.list] || [];
    const i = parseInt(btn.dataset.iindex, 10);
    if (i >= items.length - 1) return;
    [items[i + 1], items[i]] = [items[i], items[i + 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Labelled Graphic — primary image via Media Picker
  app.querySelectorAll('.lumio-lg-image-trigger').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    openMediaPicker({
      title: 'Primary Image',
      kind: 'image',
      currentSrc: block.data.image,
      onInsert: (result) => {
        block.data.image = result.src;
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
      onRemove: () => {
        delete block.data.image;
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
    });
  }));
  app.querySelectorAll('.lumio-lg-image-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    delete block.data.image;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  /* ============================================================
     SCENARIO HANDLERS — scenes and per-scene choices
     ============================================================ */

  app.querySelectorAll('.lumio-scene-text').forEach(el => el.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scenes = block.data.scenes || [];
    const scene = scenes[parseInt(el.dataset.sindex, 10)];
    if (!scene) return;
    scene[el.dataset.field] = e.target.value;
    flashSaveStatus();
  }));

  app.querySelectorAll('.lumio-scene-media-trigger').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scenes = block.data.scenes || [];
    const scene = scenes[parseInt(btn.dataset.sindex, 10)];
    if (!scene) return;
    const field = btn.dataset.field;
    openMediaPicker({
      title: btn.dataset.title,
      kind: btn.dataset.kind,
      currentSrc: scene[field],
      onInsert: (result) => {
        scene[field] = result.src;
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
      onRemove: () => {
        delete scene[field];
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
    });
  }));
  app.querySelectorAll('.lumio-scene-media-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scenes = block.data.scenes || [];
    const scene = scenes[parseInt(btn.dataset.sindex, 10)];
    if (!scene) return;
    delete scene[btn.dataset.field];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  app.querySelectorAll('.lumio-scene-add').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scenes = block.data.scenes || (block.data.scenes = []);
    scenes.push(defaultListItem('scenario', 'scenes'));
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-scene-duplicate').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scenes = block.data.scenes || [];
    const i = parseInt(btn.dataset.sindex, 10);
    scenes.splice(i + 1, 0, JSON.parse(JSON.stringify(scenes[i])));
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-scene-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scenes = block.data.scenes || [];
    if (scenes.length <= 1) return;
    scenes.splice(parseInt(btn.dataset.sindex, 10), 1);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-scene-move-up').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scenes = block.data.scenes || [];
    const i = parseInt(btn.dataset.sindex, 10);
    if (i <= 0) return;
    [scenes[i - 1], scenes[i]] = [scenes[i], scenes[i - 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-scene-move-down').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scenes = block.data.scenes || [];
    const i = parseInt(btn.dataset.sindex, 10);
    if (i >= scenes.length - 1) return;
    [scenes[i + 1], scenes[i]] = [scenes[i], scenes[i + 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Choices — text/select/checkbox fields
  app.querySelectorAll('.lumio-choice-text').forEach(el => el.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scene = (block.data.scenes || [])[parseInt(el.dataset.sindex, 10)];
    if (!scene) return;
    const choice = (scene.choices || [])[parseInt(el.dataset.cindex, 10)];
    if (!choice) return;
    choice[el.dataset.field] = e.target.value;
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-choice-select').forEach(el => el.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scene = (block.data.scenes || [])[parseInt(el.dataset.sindex, 10)];
    if (!scene) return;
    const choice = (scene.choices || [])[parseInt(el.dataset.cindex, 10)];
    if (!choice) return;
    choice[el.dataset.field] = e.target.value === '' ? null : parseInt(e.target.value, 10);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-choice-checkbox').forEach(el => el.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scene = (block.data.scenes || [])[parseInt(el.dataset.sindex, 10)];
    if (!scene) return;
    const choice = (scene.choices || [])[parseInt(el.dataset.cindex, 10)];
    if (!choice) return;
    choice[el.dataset.field] = e.target.checked;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-choice-add').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scene = (block.data.scenes || [])[parseInt(btn.dataset.sindex, 10)];
    if (!scene) return;
    scene.choices = scene.choices || [];
    scene.choices.push({ text: 'New choice', feedback: '', nextScene: null, correctPath: false });
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-choice-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scene = (block.data.scenes || [])[parseInt(btn.dataset.sindex, 10)];
    if (!scene) return;
    scene.choices.splice(parseInt(btn.dataset.cindex, 10), 1);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-choice-move-up').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scene = (block.data.scenes || [])[parseInt(btn.dataset.sindex, 10)];
    if (!scene) return;
    const ci = parseInt(btn.dataset.cindex, 10);
    if (ci <= 0) return;
    [scene.choices[ci - 1], scene.choices[ci]] = [scene.choices[ci], scene.choices[ci - 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.lumio-choice-move-down').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const scene = (block.data.scenes || [])[parseInt(btn.dataset.sindex, 10)];
    if (!scene) return;
    const ci = parseInt(btn.dataset.cindex, 10);
    if (ci >= scene.choices.length - 1) return;
    [scene.choices[ci + 1], scene.choices[ci]] = [scene.choices[ci], scene.choices[ci + 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Builder image interaction — image lightbox is a Preview-only feature.
  // First click selects the block (handled by the .canvas-block handler below);
  // a second click while already selected jumps to the Design tab; double-click
  // opens the Replace Image picker.
  app.querySelectorAll('.block-image').forEach(img => img.addEventListener('click', (e) => {
    const blockEl = img.closest('.canvas-block');
    const idx = parseInt(blockEl.dataset.index);
    if (BuilderUI.selected === idx && BuilderUI.expandedBlocks.has(idx)) {
      e.stopPropagation();
      if (BuilderUI.rightTab !== 'design') {
        BuilderUI.rightTab = 'design';
        renderLessonBuilder(lesson.id);
      }
    }
  }));
  app.querySelectorAll('.block-image').forEach(img => img.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const blockEl = img.closest('.canvas-block');
    const idx = parseInt(blockEl.dataset.index);
    const block = blocks[idx];
    if (!block) return;
    block.data = block.data || {};
    let currentSrc, onInsert, onRemove;
    if (img.dataset.cindex != null) {
      const items = normalizeCarouselItems(block.data);
      const i = parseInt(img.dataset.cindex);
      currentSrc = items[i].src;
      onInsert = (result) => { items[i].src = result.src; renderLessonBuilder(lesson.id); flashSaveStatus(); };
      onRemove = () => { items[i].src = null; renderLessonBuilder(lesson.id); flashSaveStatus(); };
    } else if (img.dataset.gindex != null) {
      const items = normalizeColumnGridItems(block.data);
      const i = parseInt(img.dataset.gindex);
      currentSrc = items[i].imageUrl;
      onInsert = (result) => { items[i].imageUrl = result.src; renderLessonBuilder(lesson.id); flashSaveStatus(); };
      onRemove = () => { delete items[i].imageUrl; renderLessonBuilder(lesson.id); flashSaveStatus(); };
    } else {
      currentSrc = block.data.src;
      onInsert = (result) => { block.data.src = result.src; renderLessonBuilder(lesson.id); flashSaveStatus(); };
      onRemove = () => { delete block.data.src; renderLessonBuilder(lesson.id); flashSaveStatus(); };
    }
    openMediaPicker({ title: 'Replace Image', currentSrc, onInsert, onRemove });
  }));

  // Column Grid — per-item image via Media Picker
  app.querySelectorAll('.grid-item-image-trigger').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[parseInt(btn.closest('.canvas-block').dataset.index)];
    if (!block) return;
    const items = normalizeColumnGridItems(block.data);
    const i = parseInt(btn.dataset.gindex);
    openMediaPicker({
      title: 'Item Image',
      currentSrc: items[i].imageUrl,
      onInsert: (result) => {
        items[i].imageUrl = result.src;
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
      onRemove: () => {
        delete items[i].imageUrl;
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
    });
  }));
  app.querySelectorAll('.grid-item-image-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[parseInt(btn.closest('.canvas-block').dataset.index)];
    if (!block) return;
    const items = normalizeColumnGridItems(block.data);
    delete items[parseInt(btn.dataset.gindex)].imageUrl;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Column Grid — add / remove items
  app.querySelectorAll('.grid-item-add').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[parseInt(btn.closest('.canvas-block').dataset.index)];
    if (!block) return;
    const items = normalizeColumnGridItems(block.data);
    items.push({ title: '', description: '' });
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.grid-item-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[parseInt(btn.closest('.canvas-block').dataset.index)];
    if (!block) return;
    const items = normalizeColumnGridItems(block.data);
    if (items.length <= 1) return;
    items.splice(parseInt(btn.dataset.gindex), 1);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Flashcards — Content panel: per-face text
  app.querySelectorAll('.flashcard-face-text').forEach(ta => ta.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeFlashcardItems(block.data);
    const i = parseInt(ta.dataset.findex);
    const face = ta.dataset.face === 'back' ? 'back' : 'front';
    items[i][face].text = e.target.value;
    flashSaveStatus();
  }));

  // Flashcards — Content panel: per-face image via Media Picker
  app.querySelectorAll('.flashcard-face-image-trigger').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeFlashcardItems(block.data);
    const i = parseInt(btn.dataset.findex);
    const face = btn.dataset.face === 'back' ? 'back' : 'front';
    openMediaPicker({
      title: face === 'front' ? 'Front Image' : 'Back Image',
      currentSrc: items[i][face].image,
      onInsert: (result) => {
        items[i][face].image = result.src;
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
      onRemove: () => {
        items[i][face].image = null;
        renderLessonBuilder(lesson.id);
        flashSaveStatus();
      },
    });
  }));
  app.querySelectorAll('.flashcard-face-image-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeFlashcardItems(block.data);
    const face = btn.dataset.face === 'back' ? 'back' : 'front';
    items[parseInt(btn.dataset.findex)][face].image = null;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Flashcards — Content panel: per-face image layout (fit) selector
  app.querySelectorAll('.flashcard-fit-control').forEach(seg => {
    seg.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      const block = blocks[BuilderUI.selected];
      if (!block) return;
      const items = normalizeFlashcardItems(block.data);
      const i = parseInt(seg.dataset.findex);
      const face = seg.dataset.face === 'back' ? 'back' : 'front';
      items[i][face].imageFit = btn.dataset.val;
      renderLessonBuilder(lesson.id);
      flashSaveStatus();
    }));
  });

  // Flashcards — Content panel: add / duplicate / remove / reorder cards
  app.querySelectorAll('.flashcard-add').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeFlashcardItems(block.data);
    items.push({ front: { text: '', image: null, imageFit: 'cover' }, back: { text: '', image: null, imageFit: 'cover' } });
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.flashcard-duplicate').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeFlashcardItems(block.data);
    const i = parseInt(btn.dataset.findex);
    items.splice(i + 1, 0, JSON.parse(JSON.stringify(items[i])));
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.flashcard-remove').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeFlashcardItems(block.data);
    if (items.length <= 1) return;
    items.splice(parseInt(btn.dataset.findex), 1);
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.flashcard-move-up').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeFlashcardItems(block.data);
    const i = parseInt(btn.dataset.findex);
    if (i <= 0) return;
    [items[i - 1], items[i]] = [items[i], items[i - 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelectorAll('.flashcard-move-down').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const items = normalizeFlashcardItems(block.data);
    const i = parseInt(btn.dataset.findex);
    if (i >= items.length - 1) return;
    [items[i + 1], items[i]] = [items[i], items[i + 1]];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Statement blocks — icon controls
  app.querySelector('.stmt-icon-remove-toggle')?.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.iconRemoved = e.target.checked;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('.stmt-icon-input')?.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.icon = e.target.value;
    const wrapper = document.querySelector(`.canvas-block[data-index="${BuilderUI.selected}"]`);
    const iconEl = wrapper?.querySelector('.stmt-icon-display');
    if (iconEl) iconEl.textContent = e.target.value;
  });
  app.querySelector('.stmt-icon-input')?.addEventListener('change', () => {
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('.stmt-icon-restore-btn')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    delete block.design.icon;
    block.design.iconRemoved = false;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('.stmt-icon-color')?.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.iconColor = e.target.value;
    applyStatementStylesToDom(block, BuilderUI.selected);
  });
  app.querySelector('.stmt-icon-color')?.addEventListener('change', () => {
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });

  // Statement blocks — border controls
  app.querySelector('.stmt-border-toggle')?.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.borderOn = e.target.checked;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('.stmt-border-color')?.addEventListener('input', (e) => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.design = block.design || {};
    block.design.borderColor = e.target.value;
    applyStatementStylesToDom(block, BuilderUI.selected);
  });
  app.querySelector('.stmt-border-color')?.addEventListener('change', () => {
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });

  // Columns — number of columns
  app.querySelector('#text-colcount')?.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    const count = parseInt(btn.dataset.count);
    block.data = block.data || {};
    const cols = block.data.cols || (block.data.cols = DEFAULT_COLUMNS.slice());
    while (cols.length < count) cols.push(`Column ${cols.length + 1} content...`);
    while (cols.length > count) cols.pop();
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));

  // Table — rows & columns structure
  app.querySelector('#table-row-add')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.data = block.data || {};
    const rows = block.data.rows || (block.data.rows = DEFAULT_TABLE_ROWS.map(r => r.slice()));
    rows.push(rows[0].map(() => ''));
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('#table-row-del')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.data = block.data || {};
    const rows = block.data.rows || (block.data.rows = DEFAULT_TABLE_ROWS.map(r => r.slice()));
    if (rows.length > 2) rows.pop();
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('#table-col-add')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.data = block.data || {};
    const rows = block.data.rows || (block.data.rows = DEFAULT_TABLE_ROWS.map(r => r.slice()));
    rows.forEach((row, i) => row.push(i === 0 ? `Column ${row.length + 1}` : ''));
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });
  app.querySelector('#table-col-del')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.data = block.data || {};
    const rows = block.data.rows || (block.data.rows = DEFAULT_TABLE_ROWS.map(r => r.slice()));
    if (rows[0].length > 1) rows.forEach(row => row.pop());
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });

  // Table Block Controls Sprint, Phase 7: per-column width (percent).
  app.querySelectorAll('.table-col-width').forEach(inp => inp.addEventListener('change', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.data = block.data || {};
    const colWidths = block.data.colWidths || (block.data.colWidths = []);
    const i = parseInt(inp.dataset.col, 10);
    const val = parseInt(inp.value, 10);
    colWidths[i] = (val > 0) ? val : null;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }));
  app.querySelector('#table-col-width-reset')?.addEventListener('click', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.data = block.data || {};
    block.data.colWidths = [];
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  });

  // AI actions in right panel
  app.querySelectorAll('.ai-action').forEach(btn => btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const labels = { rewrite: 'Rewrote for clarity', simplify: 'Simplified language', shorten: 'Shortened text', alt: 'Generated alt text' };
    toast('✨ ' + labels[action], '✨');
  }));
  app.querySelector('#ai-gen-kc')?.addEventListener('click', () => {
    toast('✨ Generated a new question from this lesson\'s content', '✨');
  });
  app.querySelector('#ai-add-kc')?.addEventListener('click', (e) => {
    e.preventDefault();
    blocks.push({ id: generateBlockId(), type: 'kc_multiple_choice', data: {} });
    renderLessonBuilder(lesson.id);
    toast('✨ Added a knowledge check based on this lesson', '✨');
  });
  app.querySelector('#link-objective')?.addEventListener('click', () => {
    if (!course) return;
    const overlay = el(`
      <div class="overlay"><div class="modal" style="width:420px; padding:24px;">
        <h3 style="font-size:16px;">Link to an objective</h3>
        <select class="input mt-16" id="obj-select">
          ${course.objectives.map((o,i)=>`<option value="${i}">Objective ${i+1}: ${o.verb} ${o.text}</option>`).join('')}
        </select>
        <div class="flex justify-end gap-12 mt-16"><button class="btn btn-ghost" id="cancel-link">Cancel</button><button class="btn btn-primary" id="save-link">Link</button></div>
      </div></div>
    `);
    document.body.appendChild(overlay);
    overlay.querySelector('#cancel-link').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target===overlay) overlay.remove(); });
    overlay.querySelector('#save-link').addEventListener('click', () => {
      lesson.objectiveIndex = parseInt(overlay.querySelector('#obj-select').value);
      overlay.remove();
      renderLessonBuilder(lesson.id);
    });
  });

  // Drag and drop
  bindDragAndDrop(lesson, blocks);

  // AI Assistant panel
  if (BuilderUI.aiOpen) {
    app.querySelector('#close-ai').addEventListener('click', () => { BuilderUI.aiOpen = false; renderLessonBuilder(lesson.id); });
    app.querySelectorAll('.chat-suggestion').forEach(b => b.addEventListener('click', () => sendChatMessage(b.dataset.msg, lesson, blocks)));
    const chatInput = app.querySelector('#chat-input');
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && chatInput.value.trim()) {
        sendChatMessage(chatInput.value.trim(), lesson, blocks);
      }
    });
  }
}

/* Places the text cursor inside an .editable-text element at the given
   viewport coordinates, so a single click both selects a text block and
   starts editing — no second click needed. */
function placeCaretAtPoint(x, y) {
  let range;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  }
  if (!range) return;
  const container = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
  const target = container && container.closest ? container.closest('.editable-text') : null;
  if (!target) return;
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  target.focus();
}

/* Shared drop handler used by every canvas drop target (inter-block
   drop zones, the end-of-canvas zone, and the blank canvas area).
   Inserts a new block from the library, or reorders an existing block,
   at targetIndex. */
function handleLibraryOrCanvasDrop(e, targetIndex, blocks, lesson) {
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
  if (data.source === 'library') {
    insertBlockAndFocus(data.blockId, blocks, lesson, targetIndex);
  } else if (data.source === 'canvas') {
    const fromIndex = data.index;
    const [moved] = blocks.splice(fromIndex, 1);
    const adjustedTarget = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
    blocks.splice(adjustedTarget, 0, moved);
    BuilderUI.selected = adjustedTarget;
    renderLessonBuilder(lesson.id);
    flashSaveStatus();
  }
}

/* Inserts a new block (from the block library) at targetIndex, selects it,
   expands its toolbar/settings panel, and places the cursor inside its
   first editable field so authoring can begin immediately. */
function insertBlockAndFocus(blockId, blocks, lesson, targetIndex) {
  blocks.splice(targetIndex, 0, { id: generateBlockId(), type: blockId, data: {} });
  BuilderUI.selected = targetIndex;
  BuilderUI.expandedBlocks = new Set([targetIndex]);
  BuilderUI.rightTab = 'content';
  renderLessonBuilder(lesson.id);
  flashSaveStatus();
  focusFirstEditable(targetIndex);
}

/* Focuses the first editable text field inside the block at index and
   collapses the cursor to its start. No-op for blocks with no editable text. */
function focusFirstEditable(index) {
  const wrapper = document.querySelector(`.canvas-block[data-index="${index}"]`);
  if (!wrapper) return;
  const target = wrapper.querySelector('.editable-text[contenteditable="true"]');
  if (!target) return;
  target.focus();
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function flashSaveStatus() {
  const status = document.getElementById('save-status');
  if (!status) return;
  status.textContent = 'Saving...';
  clearTimeout(window._saveTimeout);
  window._saveTimeout = setTimeout(() => { if (status) status.textContent = 'Saved ✓'; }, 600);
}

function aiDraftLesson(lesson, blocks) {
  const wrap = document.getElementById('lesson-canvas');
  wrap.innerHTML = `
    <div class="text-center" style="padding:60px;">
      <div class="ai-spark" style="margin:0 auto 16px; width:40px; height:40px;">✨</div>
      <p class="text-muted">Lumio is drafting your lesson...</p>
    </div>`;
  setTimeout(() => {
    blocks.push(
      { id: generateBlockId(), type: 'heading_paragraph', data: { heading: 'Lesson Introduction', body: 'A short overview that sets up what learners are about to explore and why it matters.' } },
      { id: generateBlockId(), type: 'image_text', data: { heading: 'Key Concept', body: 'An explanation of the core idea, paired with a supporting visual.', imageLabel: 'Supporting image' } },
      { id: generateBlockId(), type: 'stmt_tip', data: { text: '“A short, memorable statement that reinforces the key takeaway.”' } },
      { id: generateBlockId(), type: 'kc_multiple_choice', data: LumioAI.generateKnowledgeCheckBlockData(lesson.title) }
    );
    renderLessonBuilder(lesson.id);
    toast('✨ Drafted a starting structure — feel free to edit any block', '✨');
  }, 1100);
}

function sendChatMessage(text, lesson, blocks) {
  BuilderUI.chatMessages.push({ from: 'user', text });
  const key = text.toLowerCase().trim();
  const reply = LumioData.ai.assistantReplies[key] || LumioData.ai.assistantReplies.default;
  BuilderUI.chatMessages.push({ from: 'ai', text: reply });

  if (key === 'draft this lesson' && blocks.length === 0) {
    blocks.push(
      { id: generateBlockId(), type: 'heading_paragraph', data: { heading: 'Lesson Introduction', body: 'A short overview that sets up what learners are about to explore.' } },
      { id: generateBlockId(), type: 'image_text', data: { heading: 'Key Concept', body: 'An explanation paired with a supporting visual.', imageLabel: 'Supporting image' } },
      { id: generateBlockId(), type: 'stmt_tip', data: { text: '“A short, memorable statement that reinforces the key takeaway.”' } },
      { id: generateBlockId(), type: 'kc_multiple_choice', data: LumioAI.generateKnowledgeCheckBlockData(lesson.title) }
    );
  }
  if (key === 'suggest a knowledge check') {
    blocks.push({ id: generateBlockId(), type: 'kc_multiple_choice', data: LumioAI.generateKnowledgeCheckBlockData(lesson.title) });
  }

  renderLessonBuilder(lesson.id);
}

/* ============================================================
   DRAG AND DROP
   ============================================================ */
function bindDragAndDrop(lesson, blocks) {
  const app = document.getElementById('app');

  // From library
  app.querySelectorAll('.block-tile').forEach(tile => {
    tile.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'library', blockId: tile.dataset.blockId }));
    });
  });

  // Reorder handles
  app.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'canvas', index: parseInt(handle.dataset.index) }));
    });
  });

  // Drop zones (between/above/below blocks, and end-of-canvas) — thin
  // insertion lines that highlight on dragover. When an insertion zone is
  // active, BuilderUI.insertZoneIndex is the SOLE insertion target: every
  // drop anywhere on the canvas resolves to that index, and only the
  // insertion zone itself shows drag-over feedback.
  app.querySelectorAll('.drop-zone').forEach(zone => {
    const isInsertionZone = zone.classList.contains('insertion-zone');
    let dragDepth = 0;
    zone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      if (isInsertionZone || BuilderUI.insertZoneIndex === null) zone.classList.add('drag-active');
    });
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (isInsertionZone || BuilderUI.insertZoneIndex === null) zone.classList.add('drag-active');
    });
    zone.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) zone.classList.remove('drag-active');
    });
    zone.addEventListener('drop', (e) => {
      e.stopPropagation();
      dragDepth = 0;
      zone.classList.remove('drag-active');
      const targetIndex = BuilderUI.insertZoneIndex !== null ? BuilderUI.insertZoneIndex : parseInt(zone.dataset.dropIndex);
      BuilderUI.insertZoneIndex = null;
      handleLibraryOrCanvasDrop(e, targetIndex, blocks, lesson);
    });
  });

  // While any block is being dragged, faintly reveal every insertion line
  // so placement options stay obvious without a permanent heavy outline.
  const canvasEl = app.querySelector('#lesson-canvas');
  if (canvasEl) {
    document.addEventListener('dragstart', () => canvasEl.classList.add('dragging-block'));
    document.addEventListener('dragend', () => canvasEl.classList.remove('dragging-block'));
  }

  // Click "+" on an insertion line to open an insertion zone at that
  // position — only one zone may be active at a time.
  app.querySelectorAll('.drop-zone-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      BuilderUI.insertZoneIndex = parseInt(btn.dataset.dropIndex);
      renderLessonBuilder(lesson.id);
    });
  });

  // Empty canvas drop
  const emptyDrop = app.querySelector('#empty-canvas-drop');
  if (emptyDrop) {
    let emptyDragDepth = 0;
    emptyDrop.addEventListener('dragenter', (e) => {
      e.preventDefault();
      emptyDragDepth++;
      emptyDrop.classList.add('drag-active');
    });
    emptyDrop.addEventListener('dragover', (e) => { e.preventDefault(); emptyDrop.classList.add('drag-active'); });
    emptyDrop.addEventListener('dragleave', () => {
      emptyDragDepth = Math.max(0, emptyDragDepth - 1);
      if (emptyDragDepth === 0) emptyDrop.classList.remove('drag-active');
    });
    emptyDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      emptyDragDepth = 0;
      emptyDrop.classList.remove('drag-active');
      const targetIndex = BuilderUI.insertZoneIndex !== null ? BuilderUI.insertZoneIndex : blocks.length;
      BuilderUI.insertZoneIndex = null;
      const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
      if (data.source === 'library') {
        insertBlockAndFocus(data.blockId, blocks, lesson, targetIndex);
      }
    });
  }

  // Catch-all: a block dragged anywhere over the lesson content region —
  // not just onto a drop-zone — can be dropped. Drop-zones (and the
  // empty-canvas placeholder) call stopPropagation() when they handle a
  // drop themselves, so this only fires for drops elsewhere in the canvas
  // (over a block, in the margins above/below/beside content, empty space
  // at the bottom, etc.) and appends to the end of the lesson (or to the
  // active insertion zone, if one exists). Bound on the scrollable wrap
  // (not just #lesson-canvas) so the *entire* visible content area accepts
  // drops, even where #lesson-canvas's own box doesn't reach — the drag is
  // only cancelled if released outside this region entirely.
  const canvasWrap = app.querySelector('#lesson-canvas-wrap');
  if (canvasWrap) {
    canvasWrap.addEventListener('dragover', (e) => e.preventDefault());
    canvasWrap.addEventListener('drop', (e) => {
      const targetIndex = BuilderUI.insertZoneIndex !== null ? BuilderUI.insertZoneIndex : blocks.length;
      BuilderUI.insertZoneIndex = null;
      handleLibraryOrCanvasDrop(e, targetIndex, blocks, lesson);
    });
  }
}
