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
};

function getCourseAndLesson(lessonId) {
  let course = null, lesson = null;
  for (const c of Object.values(LumioState.courses)) {
    const l = c.lessons.find(x => x.id === lessonId);
    if (l) { course = c; lesson = l; break; }
  }
  return { course, lesson };
}

function renderLessonBuilder(lessonId) {
  LumioState.currentLessonId = lessonId;
  if (!LumioState.lessons[lessonId]) LumioState.lessons[lessonId] = [];
  const { course, lesson } = getCourseAndLesson(lessonId);
  const blocks = LumioState.lessons[lessonId];

  const prevScroll = document.getElementById('lesson-canvas-wrap')?.scrollTop || 0;
  const prevLibraryScroll = document.getElementById('block-library-scroll')?.scrollTop || 0;

  applyThemeVars(course);

  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="height:100vh; display:flex; flex-direction:column; overflow:hidden; font-family:var(--theme-font-body, var(--font-body));">
      ${renderBuilderTopbar(course, lesson)}
      <div style="flex:1; display:flex; min-height:0;">
        ${renderBlockLibrary(lesson, course)}
        <div style="flex:1; min-width:0; overflow-y:auto; background:var(--theme-bg-style, var(--surface-50)); position:relative;" id="lesson-canvas-wrap">
          ${ambientBlobs([['var(--pastel-lavender)', '300px', '300px', '-80px', '-60px', null, null]])}
          <div style="max-width:720px; margin:0 auto; padding:40px 24px 200px; position:relative; z-index:1;" id="lesson-canvas">
            ${renderCanvasBlocks(blocks)}
          </div>
        </div>
        ${renderRightPanel(blocks, course, lesson)}
      </div>
    </div>
    ${BuilderUI.aiOpen ? renderAIPanel(lesson, blocks) : ''}
  `;

  bindBuilderEvents(course, lesson, blocks);

  const wrap = document.getElementById('lesson-canvas-wrap');
  if (wrap) wrap.scrollTop = prevScroll;
  const libraryScroll = document.getElementById('block-library-scroll');
  if (libraryScroll) libraryScroll.scrollTop = prevLibraryScroll;
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
      .editable-text { outline:none; cursor:text; border-radius:4px; transition:box-shadow .12s; }
      .editable-text:hover { box-shadow:0 0 0 1px var(--border); }
      .editable-text:focus { box-shadow:0 0 0 2px var(--theme-primary, var(--indigo)); }
      .editable-text[data-placeholder]:empty:before { content: attr(data-placeholder); color: var(--ink-400); }
    </style>
  `;
  return html;
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
function dropZone(index) {
  return `<div class="drop-zone" data-drop-index="${index}" style="height:10px; margin:2px 0; border-radius:6px; transition:all .12s;"></div>`;
}

/* Permanent, always-visible drop target below the last block, so authors
   can drop a new block at the end of the lesson without having to target
   the thin inter-block drop zones. */
function endOfCanvasDropZone(index) {
  return `<div class="drop-zone end-of-canvas-drop" data-drop-index="${index}" style="margin-top:16px; min-height:36px; border:2px dashed transparent; border-radius:10px; background:transparent; transition:all .12s;"></div>`;
}

function renderCanvasBlocks(blocks) {
  if (blocks.length === 0) {
    return `
      <div class="card card-pad text-center fade-in" style="padding:60px 30px; border:2px dashed var(--border);" id="empty-canvas-drop">
        <div style="font-size:40px;">🎨</div>
        <h3 class="mt-16" style="font-size:16px;">Start with a block</h3>
        <p class="text-sm text-muted mt-8" style="max-width:380px; margin:8px auto 0;">
          Drag a block from the library, or let Lumio draft a starting point for this lesson.
        </p>
        <button class="btn btn-primary mt-24" id="ai-draft-lesson">✨ Draft this lesson with AI</button>
      </div>
    `;
  }

  let html = dropZone(0);
  blocks.forEach((block, i) => {
    html += renderBlockWrapper(block, i, blocks.length);
    html += dropZone(i + 1);
  });
  html += endOfCanvasDropZone(blocks.length);
  return html;
}

const RADIUS_MAP = { sharp: '4px', soft: 'var(--r-lg)', round: 'var(--r-xl)' };

const TEXT_BG_MAP = { light: '#ffffff', grey: '#f1f1f4', dark: 'var(--ink-900)' };
const TEXT_COLOR_MAP = { black: '#1a1a1a', white: '#ffffff', grey: '#8a8a94' };

/* Default icon + accent colour per Statement type. Background/border inherit the theme by default. */
const STATEMENT_DEFAULTS = {
  stmt_info:    { icon: 'ℹ️', label: 'Information', iconColor: '#6366F1' },
  stmt_tip:     { icon: '💡', label: 'Tip',          iconColor: '#F59E0B' },
  stmt_success: { icon: '✅', label: 'Success',      iconColor: '#22C55E' },
  stmt_warning: { icon: '⚠️', label: 'Warning',      iconColor: '#F59E0B' },
  stmt_error:   { icon: '⛔', label: 'Error',        iconColor: '#EF4444' },
  stmt_note:    { icon: '📝', label: 'Note',         iconColor: '#8A8A94' },
};

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
    style += `background-image:url(${ds.bgImage}); background-size:${fit}; background-position:center; background-repeat:no-repeat;`;
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
    style += `background-image:url(${ds.bgImage}); background-size:${fit}; background-position:center; background-repeat:no-repeat;`;
  } else {
    style += `background:color-mix(in srgb, var(--theme-primary, #7C3AED) 6%, var(--surface-0, #ffffff));`;
  }
  if (ds.borderOn) {
    const bw = ds.borderWidth ?? 1;
    const bc = ds.borderColor || 'color-mix(in srgb, var(--theme-primary, #7C3AED) 30%, transparent)';
    style += `border:${bw}px solid ${bc};`;
  }
  return style;
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
    content.style.cssText = `padding:22px; ${alignStyle} ${textBlockExtraStyle(block)}`;
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
    content.style.cssText = `padding:22px; ${alignStyle} ${statementBlockExtraStyle(block)}`;
  }
  wrapper.querySelectorAll('.editable-text').forEach(elx => {
    elx.style.cssText = `flex:1; line-height:1.6; ${textTypographyStyle(ds, 15)}`;
  });
  const iconEl = wrapper.querySelector('.stmt-icon-display');
  if (iconEl) {
    iconEl.style.fontSize = `${ds.iconSize ?? 20}px`;
    iconEl.style.color = ds.iconColor || (STATEMENT_DEFAULTS[block.type] || {}).iconColor || 'inherit';
  }
}

/* Dispatch to the right live-preview updater based on block category. */
function applyLivePreview(block, index) {
  if (blockCategory(block.type) === 'Statements') applyStatementStylesToDom(block, index);
  else applyBlockStylesToDom(block, index);
}

function renderBlockWrapper(block, index, total) {
  const isExpanded = BuilderUI.expandedBlocks.has(index);
  const isSelected = BuilderUI.selected === index;
  const ds = block.design || {};
  const bgStyle = ds.bg && ds.bg !== 'transparent' ? `background:${ds.bg};` : '';
  const alignStyle = ds.align ? `text-align:${ds.align};` : '';
  const radiusStyle = ds.radius ? `border-radius:${RADIUS_MAP[ds.radius] || 'var(--theme-radius, var(--r-lg))'};` : 'border-radius:var(--theme-radius, var(--r-lg));';
  const moveButtons = `
        <button class="btn-icon move-up-btn" data-index="${index}" title="Move up" ${index===0?'disabled':''} style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none; opacity:${index===0?'0.4':'1'};">↑</button>
        <button class="btn-icon move-down-btn" data-index="${index}" title="Move down" ${index===total-1?'disabled':''} style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none; opacity:${index===total-1?'0.4':'1'};">↓</button>`;
  return `
    <div class="canvas-block ${isSelected ? 'selected' : ''}" data-index="${index}" style="
      position:relative; ${radiusStyle} border:2px solid ${isSelected ? 'var(--theme-primary, var(--indigo))' : 'transparent'};
      margin-bottom:4px; transition:border-color .12s; ${bgStyle || 'background:var(--surface-0);'}
      box-shadow:${isSelected ? 'var(--shadow-md)' : 'var(--shadow-soft)'};">
      <div class="block-toolbar" style="position:absolute; top:-14px; left:14px; display:${isExpanded ? 'flex':'none'}; gap:4px; z-index:5;">
        <span class="drag-handle" draggable="true" data-index="${index}" title="Drag to reorder"
          style="background:var(--ink-900); color:#fff; border-radius:6px; padding:2px 8px; font-size:11px; cursor:grab;">⠿ ${blockLabel(block.type)}</span>
        <button class="btn-icon ai-rewrite-btn" data-index="${index}" title="AI rewrite" style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none;">✨</button>
        <button class="btn-icon dup-block-btn" data-index="${index}" title="Duplicate" style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none;">⧉</button>
        <button class="btn-icon del-block-btn" data-index="${index}" title="Delete" style="width:26px; height:26px; background:var(--ink-900); color:#fff; border:none;">✕</button>${moveButtons}
      </div>
      <div class="block-content-area" style="padding:22px; ${alignStyle} ${textBlockExtraStyle(block)}${statementBlockExtraStyle(block)}">
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

const COLUMN_BG_LIST = ['var(--pastel-lavender)', 'var(--pastel-cyan)', 'var(--pastel-pink)', 'var(--pastel-peach)'];
const DEFAULT_COLUMNS = ['Column 1 content...', 'Column 2 content...'];
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
      return `<h2 class="editable-text" data-role="heading" data-field="heading" ${ce} data-placeholder="Heading" style="${textTypographyStyle(ds, 22)}">${escapeHtml(d.heading)}</h2>`;
    case 'heading_paragraph':
      return `<h2 class="editable-text" data-role="heading" data-field="heading" ${ce} data-placeholder="Heading" style="${textTypographyStyle(ds, 22)}">${escapeHtml(d.heading)}</h2>
        <div class="editable-text mt-12" data-role="body" data-field="body" ${ce} data-placeholder="Paragraph text..." style="line-height:1.7; ${textTypographyStyle(ds, 15)}">${escapeHtml(d.body)}</div>`;
    case 'paragraph':
      return `<div class="editable-text" data-role="body" data-field="body" ${ce} data-placeholder="Write your paragraph content here..." style="line-height:1.7; ${textTypographyStyle(ds, 15)}">${escapeHtml(d.body)}</div>`;
    case 'columns': {
      const cols = d.cols || DEFAULT_COLUMNS;
      return `<div style="display:grid; grid-template-columns:repeat(${cols.length},1fr); gap:16px;">
        ${cols.map((c, i) => `<div class="card card-pad" style="background:${COLUMN_BG_LIST[i % COLUMN_BG_LIST.length]}; border:none;"><div class="editable-text text-sm" data-role="body" data-field="col" data-col="${i}" ${ce} data-placeholder="Column ${i + 1} content..." style="${textTypographyStyle(ds, 14)}">${escapeHtml(c)}</div></div>`).join('')}
      </div>`;
    }
    case 'table': {
      const rows = d.rows || DEFAULT_TABLE_ROWS;
      return `<table style="width:100%; border-collapse:collapse; font-size:13px;">
        ${rows.map((row, ri) => `<tr ${ri === 0 ? 'style="background:var(--pastel-lavender);"' : ''}>${row.map((cell, ci) => {
          const tag = ri === 0 ? 'th' : 'td';
          return `<${tag} style="padding:8px; text-align:left; border:1px solid var(--border);"><div class="editable-text" data-role="cell" data-field="cell" data-row="${ri}" data-col="${ci}" ${ce} style="${textTypographyStyle(ds, 13)}">${escapeHtml(cell)}</div></${tag}>`;
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
        <div class="editable-text" data-role="body" data-field="text" ${ce} data-placeholder="${def.label || 'Statement'} text..." style="flex:1; line-height:1.6; ${textTypographyStyle(ds, 15)}">${escapeHtml(d.text || `${def.label || 'Statement'}: Add your message here.`)}</div>
      </div>`;
    }

    case 'quote1': case 'quote2': case 'quote3': case 'quote4':
      return `<blockquote style="border-left:4px solid var(--indigo); padding-left:16px; font-style:italic; color:var(--ink-700);">
        "${d.text || 'Great onboarding isn’t a single day — it’s the first chapter of a much longer story.'}"
        <footer class="text-sm text-muted mt-8" style="font-style:normal;">— ${d.author || 'Lumio Team'}</footer>
      </blockquote>`;
    case 'quote_image':
      return `<div style="background:var(--gradient-primary); border-radius:var(--r-md); padding:40px; text-align:center; color:#fff;">
        <p style="font-size:18px; font-style:italic;">"${d.text || 'Progress over perfection.'}"</p>
        <p class="text-sm mt-12">— ${d.author || 'Company Values'}</p>
      </div>`;
    case 'quote_carousel':
      return `<div class="flex gap-12" style="overflow-x:auto;">
        ${['“Curiosity over certainty.”','“Clarity over cleverness.”','“People over process.”'].map(q => `
          <div class="card card-pad" style="min-width:200px; background:var(--pastel-lavender); border:none;"><p class="text-sm">${q}</p></div>
        `).join('')}
      </div>`;

    case 'list_numbered':
      return `<h3 style="font-size:15px; margin-bottom:10px;">${d.heading || 'Steps'}</h3><ol style="padding-left:20px; line-height:1.9;">${(d.items || ['Log in to the HR portal','Complete your profile','Review your benefits']).map(i=>`<li>${i}</li>`).join('')}</ol>`;
    case 'list_checkbox':
      return `<h3 style="font-size:15px; margin-bottom:10px;">${d.heading || 'Checklist'}</h3>${(d.items || ['Set up your email','Join the team chat','Schedule 1:1 with manager']).map(i=>`<label class="flex items-center gap-8 mt-8" style="font-size:14px;"><input type="checkbox"/> ${i}</label>`).join('')}`;
    case 'list_bullet':
      return `<h3 style="font-size:15px; margin-bottom:10px;">${d.heading || 'Key Points'}</h3><ul style="padding-left:20px; line-height:1.9;">${(d.items || ['Curiosity over certainty','Clarity over cleverness','Progress over perfection']).map(i=>`<li>${i}</li>`).join('')}</ul>`;

    case 'image':
      return imagePlaceholder(d.label || 'Image placeholder', 160);
    case 'image_text':
      return `<div style="display:grid; grid-template-columns:1fr 1.2fr; gap:20px; align-items:center;">
        ${imagePlaceholder(d.imageLabel || 'Image placeholder', 140)}
        <div><h3 style="font-size:16px;">${d.heading || 'Heading'}</h3><p class="text-sm mt-8" style="line-height:1.7;">${d.body || 'Supporting paragraph text goes here.'}</p></div>
      </div>`;
    case 'text_on_image':
      return `<div style="background:var(--gradient-warm); border-radius:var(--r-md); padding:40px; color:#fff; text-align:center;">
        <h3 style="font-size:18px; color:#fff;">${d.heading || 'Bold headline on image'}</h3>
        <p class="text-sm mt-8">${d.body || 'Supporting text overlaid on a background image.'}</p>
      </div>`;

    case 'carousel':
      return `<div class="flex gap-12" style="overflow-x:auto;">${[1,2,3].map(n=>imagePlaceholder('Slide '+n, 120, 180)).join('')}</div>`;
    case 'column_grid':
      return `<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">${[1,2,3].map(n=>imagePlaceholder('Item '+n, 90)).join('')}</div>`;

    case 'audio':
      return `<div class="card card-pad flex items-center gap-12" style="background:var(--pastel-cyan); border:none;"><span style="font-size:22px;">🔊</span><div style="flex:1;"><div style="font-weight:600; font-size:13px;">${d.title || 'Welcome message from our CEO'}</div><div style="height:6px; background:#fff; border-radius:99px; margin-top:8px;"><div style="width:35%; height:100%; background:var(--cyan); border-radius:99px;"></div></div></div><span class="text-sm text-muted">2:14</span></div>`;
    case 'video':
      return `<div style="background:var(--ink-900); border-radius:var(--r-md); height:200px; display:flex; align-items:center; justify-content:center; color:#fff; position:relative;">
        <span style="font-size:40px;">▶</span>
        <span class="text-sm" style="position:absolute; bottom:10px; left:14px; opacity:0.8;">${d.title || 'Welcome video — 1:32'}</span>
      </div>`;
    case 'file':
      return `<div class="card card-pad flex items-center gap-12" style="border:1px dashed var(--border);"><span style="font-size:22px;">📎</span><div><div style="font-weight:600; font-size:13px;">${d.filename || 'Employee-Handbook.pdf'}</div><div class="text-sm text-muted">${d.filesize || '2.4 MB'}</div></div></div>`;

    case 'accordion':
      return `<h3 style="font-size:15px; margin-bottom:10px;">${d.heading || 'Accordion'}</h3>
        ${(d.items || [{title:'Section 1', content:'Details...'},{title:'Section 2', content:'Details...'}]).map((item,i) => `
          <div class="card" style="margin-bottom:8px; overflow:hidden;">
            <div class="flex justify-between items-center" style="padding:12px 16px; font-weight:600; font-size:13px; background:${i===0?'var(--pastel-lavender)':'var(--surface-0)'};">
              ${item.title} <span>${i===0?'▾':'▸'}</span>
            </div>
            ${i===0 ? `<div style="padding:12px 16px;" class="text-sm">${item.content}</div>` : ''}
          </div>
        `).join('')}`;
    case 'tabs':
      return `<div class="tabs" style="border-bottom:1px solid var(--border);">
          ${(d.tabs || ['Overview','Details','FAQ']).map((t,i)=>`<div class="tab ${i===0?'active':''}">${t}</div>`).join('')}
        </div>
        <div class="text-sm mt-12">${d.content || 'Tab content appears here. Switch tabs to reveal more.'}</div>`;
    case 'labelled_graphic':
      return `<div style="background:var(--pastel-lavender); border-radius:var(--r-md); height:220px; position:relative; display:flex; align-items:center; justify-content:center;">
        <span style="font-size:32px;">🗺️</span>
        ${[['20%','30%','1'],['55%','55%','2'],['75%','25%','3']].map(([l,t,n])=>`
          <span style="position:absolute; left:${l}; top:${t}; width:24px; height:24px; border-radius:50%; background:var(--gradient-primary); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; box-shadow:var(--shadow-soft);">${n}</span>
        `).join('')}
      </div>`;
    case 'process':
      return `<h3 style="font-size:15px; margin-bottom:14px;">${d.heading || 'Process'}</h3>
        <div class="flex items-center gap-8" style="overflow-x:auto;">
          ${(d.steps || ['Submit Request','Manager Review','HR Approval','Access Granted']).map((s,i,arr)=>`
            <div class="card card-pad" style="min-width:130px; text-align:center; background:${i===0?'var(--pastel-lavender)':'var(--surface-0)'};">
              <div class="pill pill-indigo" style="margin-bottom:6px;">Step ${i+1}</div>
              <div class="text-sm" style="font-weight:600;">${s}</div>
            </div>
            ${i<arr.length-1 ? '<span style="color:var(--ink-400);">→</span>' : ''}
          `).join('')}
        </div>`;
    case 'scenario':
      return `<div class="card card-pad" style="background:var(--pastel-cyan); border:none;">
        <div class="pill pill-cyan mb-8">🌳 Branching Scenario</div>
        <p style="font-weight:600; font-size:14px;">${d.prompt || 'A customer calls upset about a delayed shipment. How do you respond?'}</p>
        <div class="flex-col gap-8 mt-12">
          ${(d.choices || ['Apologize and offer a solution','Explain that it is not your department','Transfer the call immediately']).map(c => `
            <div class="card card-pad" style="background:var(--surface-0); font-size:13px; cursor:pointer;">→ ${c}</div>
          `).join('')}
        </div>
      </div>`;
    case 'flashcard_grid':
      return `<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">
        ${(d.cards || ['Mission','Vision','Values']).map(c => `
          <div class="card card-pad" style="text-align:center; background:var(--gradient-primary); color:#fff; height:80px; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:13px;">${c}</div>
        `).join('')}
      </div>`;
    case 'flashcard_stack':
      return `<div style="position:relative; height:120px;">
        <div class="card" style="position:absolute; top:8px; left:8px; right:-8px; bottom:-8px; background:var(--pastel-lavender);"></div>
        <div class="card card-pad" style="position:relative; height:120px; display:flex; align-items:center; justify-content:center; text-align:center;">
          <div><div style="font-weight:600;">${d.front || 'What does HR stand for?'}</div><div class="text-sm text-muted mt-8">Click to flip</div></div>
        </div>
      </div>`;
    case 'button':
      return `<div style="text-align:center;"><button class="btn btn-primary">${d.label || 'View Resource →'}</button></div>`;

    case 'chart_bar':
      return chartPreview('bar');
    case 'chart_line':
      return chartPreview('line');
    case 'chart_pie':
      return `<div style="display:flex; align-items:center; gap:24px;">
        <div style="width:120px; height:120px; border-radius:50%; background:conic-gradient(var(--indigo) 0% 40%, var(--cyan) 40% 70%, var(--orange) 70% 100%);"></div>
        <div class="text-sm">
          <div class="flex items-center gap-8"><span style="width:10px;height:10px;border-radius:50%;background:var(--indigo);display:inline-block;"></span> Engineering — 40%</div>
          <div class="flex items-center gap-8 mt-8"><span style="width:10px;height:10px;border-radius:50%;background:var(--cyan);display:inline-block;"></span> Sales — 30%</div>
          <div class="flex items-center gap-8 mt-8"><span style="width:10px;height:10px;border-radius:50%;background:var(--orange);display:inline-block;"></span> Support — 30%</div>
        </div>
      </div>`;

    case 'continue':
      return `<div style="text-align:center; padding:8px 0;"><button class="btn btn-secondary">${d.label || 'Continue'} ▾</button>
        <p class="text-sm text-muted mt-8">Content below stays hidden until the learner clicks Continue.</p></div>`;
    case 'numbered_divider':
      return `<div class="flex items-center gap-12"><div style="width:32px; height:32px; border-radius:50%; background:var(--gradient-primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700;">${d.number || '2'}</div><div style="flex:1; height:1px; background:var(--border);"></div></div>`;
    case 'line_divider':
      return `<div style="height:1px; background:var(--border);"></div>`;

    case 'kc_multiple_choice':
      return knowledgeCheckMC(d);
    case 'kc_multiple_response':
      return `<div class="pill pill-teal mb-8">✅ Knowledge Check · Select all that apply</div>
        <p style="font-weight:600;">${d.question || 'Which of these are core company values? (Select all that apply)'}</p>
        <div class="flex-col gap-8 mt-12">${(d.options || ['Curiosity','Clarity','Speed at all costs','People over process']).map(o=>`<label class="flex items-center gap-8 text-sm"><input type="checkbox"/> ${o}</label>`).join('')}</div>`;
    case 'kc_matching':
      return `<div class="pill pill-teal mb-8">✅ Knowledge Check · Matching</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="flex-col gap-8">${(d.left || ['Onboarding','Benefits','IT Support']).map(l=>`<div class="card card-pad text-sm">${l}</div>`).join('')}</div>
          <div class="flex-col gap-8">${(d.right || ['Day 1 checklist','Health & retirement','Help desk ticket']).map(r=>`<div class="card card-pad text-sm" style="background:var(--pastel-lavender); border:none;">${r}</div>`).join('')}</div>
        </div>`;
    case 'kc_fill_gap':
      return `<div class="pill pill-teal mb-8">✅ Knowledge Check · Fill the Gap</div>
        <p style="font-size:15px; line-height:2;">${d.text || 'Our core values are Curiosity, Clarity, ____, and People over process.'}</p>`;
    case 'kc_ordering':
      return `<div class="pill pill-teal mb-8">✅ Knowledge Check · Put in order</div>
        <div class="flex-col gap-8 mt-8">${(d.items || ['Receive offer letter','Complete paperwork','Attend orientation','Meet your team']).map((i,idx)=>`<div class="card card-pad flex items-center gap-12 text-sm"><span class="pill pill-grey">${idx+1}</span>${i}</div>`).join('')}</div>`;

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

function chartPreview(kind) {
  if (kind === 'bar') {
    return `<div class="flex items-end gap-12" style="height:140px;">
      ${[60,90,40,75,55].map(h => `<div style="flex:1; background:var(--gradient-primary); height:${h}%; border-radius:6px 6px 0 0;"></div>`).join('')}
    </div>`;
  }
  return `<svg viewBox="0 0 300 100" style="width:100%; height:120px;"><polyline points="0,80 60,50 120,60 180,20 240,35 300,10" fill="none" stroke="var(--indigo)" stroke-width="3"/></svg>`;
}

function knowledgeCheckMC(d) {
  const options = d.options || ['Curiosity over certainty','Clarity over cleverness','Speed over quality','Process over people'];
  const correct = d.correct ?? 1;
  return `
    <div class="pill pill-teal mb-8">✅ Knowledge Check · Multiple Choice</div>
    <p style="font-weight:600; font-size:14px;">${d.question || 'Which of the following best reflects one of our core values?'}</p>
    <div class="flex-col gap-8 mt-12">
      ${options.map((o,i) => `
        <label class="flex items-center gap-8 card card-pad text-sm" style="cursor:pointer; ${i===correct ? 'border-color:var(--teal);' : ''}">
          <input type="radio" name="kc-${Math.random()}" /> ${o} ${i===correct ? '<span style="margin-left:auto; color:var(--teal);">✓ Correct</span>' : ''}
        </label>
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
      <div style="width:300px; flex-shrink:0; border-left:1px solid var(--border); background:var(--surface-0); overflow-y:auto; padding:20px;">
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
      <div style="padding:18px; flex:1; overflow-y:auto;">
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
      return `
        <p class="text-sm text-muted">Click directly on a cell in the canvas to edit its text.</p>
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Rows &amp; Columns</div>
          <div class="flex gap-8" style="flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="table-row-add">+ Row</button>
            <button class="btn btn-secondary btn-sm" id="table-row-del">– Row</button>
            <button class="btn btn-secondary btn-sm" id="table-col-add">+ Column</button>
            <button class="btn btn-secondary btn-sm" id="table-col-del">– Column</button>
          </div>
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
        <button class="btn-icon text-fmt-btn" data-fmt="bold" style="width:32px; height:32px; font-weight:700; ${ds.bold ? 'background:var(--indigo); color:#fff;' : ''}">B</button>
        <button class="btn-icon text-fmt-btn" data-fmt="italic" style="width:32px; height:32px; font-style:italic; ${ds.italic ? 'background:var(--indigo); color:#fff;' : ''}">I</button>
        <button class="btn-icon text-fmt-btn" data-fmt="underline" style="width:32px; height:32px; text-decoration:underline; ${ds.underline ? 'background:var(--indigo); color:#fff;' : ''}">U</button>
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
        <input type="file" accept="image/*" class="input mt-8 text-bg-image-upload" />
        ${ds.bgImage ? `<img src="${ds.bgImage}" style="max-width:100%; height:60px; object-fit:cover; border-radius:var(--r-sm); margin-top:8px;" />` : ''}
        <p class="text-sm text-muted mt-8 mb-8">Image Fit</p>
        ${segControl('design-bgfit', 'bgFit', [{ id: 'cover', label: 'Cover' }, { id: 'contain', label: 'Contain' }, { id: 'stretch', label: 'Stretch' }], ds.bgFit || 'cover')}
      ` : ''}
    </div>
    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Advanced</div>
      <p class="text-sm text-muted">Block ID: block-${index + 1}</p>
    </div>
  `;
}

/* ============================================================
   STATEMENT BLOCK SETTINGS PANEL (Content / Icon / Typography / Spacing / Background / Border)
   ============================================================ */
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
        <button class="btn-icon text-fmt-btn" data-fmt="bold" style="width:32px; height:32px; font-weight:700; ${ds.bold ? 'background:var(--indigo); color:#fff;' : ''}">B</button>
        <button class="btn-icon text-fmt-btn" data-fmt="italic" style="width:32px; height:32px; font-style:italic; ${ds.italic ? 'background:var(--indigo); color:#fff;' : ''}">I</button>
        <button class="btn-icon text-fmt-btn" data-fmt="underline" style="width:32px; height:32px; text-decoration:underline; ${ds.underline ? 'background:var(--indigo); color:#fff;' : ''}">U</button>
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
        <input type="file" accept="image/*" class="input mt-8 text-bg-image-upload" />
        ${ds.bgImage ? `<img src="${ds.bgImage}" style="max-width:100%; height:60px; object-fit:cover; border-radius:var(--r-sm); margin-top:8px;" />` : ''}
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

function renderRightTabContent(block, index, course) {
  const d = block.data || {};
  if (blockCategory(block.type) === 'Text') {
    return renderTextBlockPanel(block, index);
  }
  if (blockCategory(block.type) === 'Statements') {
    return renderStatementBlockPanel(block, index);
  }
  if (BuilderUI.rightTab === 'design') {
    block.design = block.design || {};
    const ds = block.design;
    return `
      <div class="prop-section">
        <div class="prop-section-title">Background</div>
        <div class="flex gap-8">
          ${['transparent','var(--pastel-lavender)','var(--pastel-cyan)','var(--pastel-pink)','var(--pastel-peach)'].map(c => `
            <div class="design-swatch ${(ds.bg===c || (!ds.bg && c==='transparent')) ? 'selected':''}" data-color="${c}"
              style="width:28px; height:28px; border-radius:8px; background:${c==='transparent'?'#fff':c};
              border:${(ds.bg===c || (!ds.bg && c==='transparent')) ? '2px solid var(--indigo)' : '1px solid var(--border)'}; cursor:pointer;"></div>
          `).join('')}
        </div>
      </div>
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
      extra = `
        <div class="field">
          <label>Feedback</label>
          <select class="input"><option>Show correct answer after attempt</option><option>Show feedback only at end</option><option>No feedback</option></select>
        </div>
        <div class="field">
          <label class="flex items-center gap-8"><input type="checkbox" checked /> Allow retry</label>
        </div>
        <p class="text-sm text-muted">This is an in-lesson, ungraded Knowledge Check. For scored assessments, add an Assessment from the course outline.</p>
      `;
    } else if (block.type === 'accordion') {
      extra = `<div class="field"><label class="flex items-center gap-8"><input type="checkbox"/> Expand first item by default</label></div>`;
    } else if (block.type === 'continue') {
      extra = `<div class="field"><label>Button label</label><input class="input" id="cont-label" value="${d.label || 'Continue'}" /></div>`;
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
      return contentFields([
        ['Heading', 'heading', d.heading, 'input'],
        ['Body text', 'body', d.body, 'textarea'],
      ]) + aiActions();
    case 'paragraph':
      return contentFields([['Body text', 'body', d.body, 'textarea']]) + aiActions();
    case 'image_text':
      return contentFields([
        ['Image alt text', 'imageLabel', d.imageLabel, 'input'],
        ['Heading', 'heading', d.heading, 'input'],
        ['Body text', 'body', d.body, 'textarea'],
      ]) + aiActions(true);
    case 'image':
      return contentFields([['Alt text', 'label', d.label, 'input']]) + aiActions(true) + `<button class="btn btn-secondary w-full mt-8">📤 Replace image</button>`;
    case 'quote1': case 'quote2': case 'quote3': case 'quote4': case 'quote_image':
      return contentFields([['Quote', 'text', d.text, 'textarea'], ['Attribution', 'author', d.author, 'input']]) + aiActions();
    case 'list_numbered': case 'list_checkbox': case 'list_bullet':
      return contentFields([['Heading', 'heading', d.heading, 'input']]) +
        `<div class="field"><label>Items (one per line)</label><textarea class="textarea content-field" data-field="items" rows="5">${(d.items||[]).join('\n')}</textarea></div>` + aiActions();
    case 'kc_multiple_choice':
      return contentFields([['Question', 'question', d.question, 'textarea']]) +
        `<div class="field"><label>Options (one per line)</label><textarea class="textarea content-field" data-field="options" rows="4">${(d.options||[]).join('\n')}</textarea></div>
         <div class="field"><label>Correct option (number)</label><input class="input content-field" data-field="correct" type="number" min="1" value="${(d.correct ?? 1)+1}"/></div>` +
        `<button class="btn btn-secondary w-full mt-8" id="ai-gen-kc">✨ Regenerate from lesson content</button>`;
    case 'continue':
      return `<p class="text-sm text-muted">This divider pauses content below until the learner clicks Continue — great for pacing and reducing cognitive load.</p>`;
    default:
      return `<p class="text-sm text-muted">Edit the ${blockLabel(block.type)} block's content directly on the canvas, or use AI to generate a draft.</p>` + aiActions();
  }
}

function segControl(id, prop, options, current) {
  return `<div class="seg-control" data-prop="${prop}" id="${id}">
    ${options.map(o => `<button data-val="${o.id}" class="${current===o.id?'active':''}">${o.label}</button>`).join('')}
  </div>`;
}

function blockTypeDesignFields(block, ds) {
  const cat = blockCategory(block.type);
  switch (cat) {
    case 'Text':
      return `
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Text Size</div>
          ${segControl('design-textsize', 'textSize', [{id:'sm',label:'Small'},{id:'md',label:'Medium'},{id:'lg',label:'Large'}], ds.textSize || 'md')}
        </div>`;
    case 'Quotes':
      return `
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Style Variant</div>
          ${segControl('design-variant', 'accent', [{id:'lavender',label:'Lavender'},{id:'cyan',label:'Cyan'},{id:'pink',label:'Pink'},{id:'peach',label:'Peach'}], ds.accent || 'lavender')}
        </div>`;
    case 'Images': case 'Gallery':
      return `
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Image Fit</div>
          ${segControl('design-fit', 'imageFit', [{id:'cover',label:'Cover'},{id:'contain',label:'Contain'}], ds.imageFit || 'cover')}
        </div>`;
    case 'Multimedia':
      if (block.type === 'file') {
        return `
          <div class="prop-section" style="border-bottom:none;">
            <div class="prop-section-title">Display Style</div>
            ${segControl('design-attach', 'attachStyle', [{id:'card',label:'Card'},{id:'inline',label:'Inline Link'}], ds.attachStyle || 'card')}
          </div>`;
      }
      return `
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Player Style</div>
          ${segControl('design-player', 'playerStyle', [{id:'minimal',label:'Minimal'},{id:'card',label:'Card'}], ds.playerStyle || 'card')}
        </div>`;
    case 'Interactive':
      return `
        <div class="prop-section" style="border-bottom:none;">
          <div class="prop-section-title">Animation</div>
          ${segControl('design-anim', 'animation', [{id:'fade',label:'Fade'},{id:'slide',label:'Slide'},{id:'none',label:'None'}], ds.animation || 'fade')}
        </div>`;
    default:
      return '';
  }
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
    <div style="position:fixed; top:0; right:0; bottom:0; width:340px; background:var(--surface-0); border-left:1px solid var(--border); box-shadow:var(--shadow-md); z-index:60; display:flex; flex-direction:column;" class="fade-in">
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
    openLearnerPreviewFor(course.id, '#/lesson/' + lessonId, lessonId);
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

  // Click to add: clicking a block tile inserts it at the end of the lesson
  app.querySelectorAll('.block-tile').forEach(tile => tile.addEventListener('click', () => {
    insertBlockAndFocus(tile.dataset.blockId, blocks, lesson, blocks.length);
  }));

  // AI draft lesson (empty canvas)
  app.querySelector('#ai-draft-lesson')?.addEventListener('click', () => aiDraftLesson(lesson, blocks));

  // Block selection / expansion
  app.querySelectorAll('.canvas-block').forEach(b => b.addEventListener('click', (e) => {
    if (e.target.closest('.block-toolbar')) return;
    const idx = parseInt(b.dataset.index);
    const editableTarget = e.target.closest('.editable-text[contenteditable="true"]');

    // If the block is already selected/expanded, let a click on its text
    // place the cursor natively — don't re-render and lose focus.
    if (editableTarget && BuilderUI.selected === idx && BuilderUI.expandedBlocks.has(idx)) {
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
    blocks.splice(i+1, 0, JSON.parse(JSON.stringify(blocks[i])));
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
    if (field === 'items') {
      block.data[field] = e.target.value.split('\n').filter(x=>x.trim());
    } else if (field === 'correct') {
      block.data[field] = parseInt(e.target.value) - 1;
    } else {
      block.data[field] = e.target.value;
    }
    flashSaveStatus();
  }));

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

  // Text blocks — universal inline (contenteditable) editing
  app.querySelectorAll('.editable-text[contenteditable="true"]').forEach(elx => elx.addEventListener('input', () => {
    const block = blocks[BuilderUI.selected];
    if (!block) return;
    block.data = block.data || {};
    const field = elx.dataset.field;
    const text = elx.innerText.replace(/\n+$/, '');
    if (field === 'col') {
      const cols = block.data.cols || (block.data.cols = DEFAULT_COLUMNS.slice());
      cols[parseInt(elx.dataset.col)] = text;
    } else if (field === 'cell') {
      const rows = block.data.rows || (block.data.rows = DEFAULT_TABLE_ROWS.map(r => r.slice()));
      const r = parseInt(elx.dataset.row), c = parseInt(elx.dataset.col);
      if (rows[r]) rows[r][c] = text;
    } else {
      block.data[field] = text;
    }
  }));

  // Text blocks — Typography / Spacing sliders (live preview, no full re-render mid-drag)
  app.querySelectorAll('.design-range').forEach(r => {
    r.addEventListener('input', () => {
      const block = blocks[BuilderUI.selected];
      if (!block) return;
      block.design = block.design || {};
      block.design[r.dataset.prop] = parseInt(r.value);
      const out = r.parentElement.querySelector('.range-val');
      if (out) out.textContent = r.value + 'px';
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
  app.querySelector('.text-bg-image-upload')?.addEventListener('change', (e) => {
    const block = blocks[BuilderUI.selected];
    const file = e.target.files && e.target.files[0];
    if (!block || !file) return;
    const reader = new FileReader();
    reader.onload = () => {
      block.design = block.design || {};
      block.design.bgImage = reader.result;
      renderLessonBuilder(lesson.id);
      flashSaveStatus();
    };
    reader.readAsDataURL(file);
  });

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
    blocks.push({ type: 'kc_multiple_choice', data: {} });
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
  blocks.splice(targetIndex, 0, { type: blockId, data: {} });
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
      { type: 'heading_paragraph', data: { heading: 'Lesson Introduction', body: 'A short overview that sets up what learners are about to explore and why it matters.' } },
      { type: 'image_text', data: { heading: 'Key Concept', body: 'An explanation of the core idea, paired with a supporting visual.', imageLabel: 'Supporting image' } },
      { type: 'stmt_tip', data: { text: '“A short, memorable statement that reinforces the key takeaway.”' } },
      { type: 'kc_multiple_choice', data: {} }
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
      { type: 'heading_paragraph', data: { heading: 'Lesson Introduction', body: 'A short overview that sets up what learners are about to explore.' } },
      { type: 'image_text', data: { heading: 'Key Concept', body: 'An explanation paired with a supporting visual.', imageLabel: 'Supporting image' } },
      { type: 'stmt_tip', data: { text: '“A short, memorable statement that reinforces the key takeaway.”' } },
      { type: 'kc_multiple_choice', data: {} }
    );
  }
  if (key === 'suggest a knowledge check') {
    blocks.push({ type: 'kc_multiple_choice', data: {} });
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

  // Drop zones (between/above/below blocks)
  app.querySelectorAll('.drop-zone:not(.end-of-canvas-drop)').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.style.background = 'var(--pastel-lavender)';
      zone.style.height = '36px';
    });
    zone.addEventListener('dragleave', () => {
      zone.style.background = 'transparent';
      zone.style.height = '10px';
    });
    zone.addEventListener('drop', (e) => {
      zone.style.background = 'transparent';
      zone.style.height = '10px';
      handleLibraryOrCanvasDrop(e, parseInt(zone.dataset.dropIndex), blocks, lesson);
    });
  });

  // End-of-canvas drop zone — hidden by default, only shown while a block
  // is being dragged, so the canvas ends cleanly after the final block.
  const endZone = app.querySelector('.end-of-canvas-drop');
  if (endZone) {
    document.addEventListener('dragstart', () => {
      endZone.style.borderColor = 'var(--border)';
    });
    document.addEventListener('dragend', () => {
      endZone.style.borderColor = 'transparent';
      endZone.style.background = 'transparent';
    });
    endZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      endZone.style.borderColor = 'var(--indigo)';
      endZone.style.background = 'var(--pastel-lavender)';
    });
    endZone.addEventListener('dragleave', () => {
      endZone.style.borderColor = 'var(--border)';
      endZone.style.background = 'transparent';
    });
    endZone.addEventListener('drop', (e) => {
      endZone.style.borderColor = 'transparent';
      endZone.style.background = 'transparent';
      handleLibraryOrCanvasDrop(e, parseInt(endZone.dataset.dropIndex), blocks, lesson);
    });
  }

  // Empty canvas drop
  const emptyDrop = app.querySelector('#empty-canvas-drop');
  if (emptyDrop) {
    emptyDrop.addEventListener('dragover', (e) => { e.preventDefault(); emptyDrop.style.borderColor = 'var(--indigo)'; });
    emptyDrop.addEventListener('dragleave', () => { emptyDrop.style.borderColor = 'var(--border)'; });
    emptyDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
      if (data.source === 'library') {
        insertBlockAndFocus(data.blockId, blocks, lesson, blocks.length);
      }
    });
  }

  // Unused canvas space below the last block also resolves to "add to end"
  const canvas = app.querySelector('#lesson-canvas');
  if (canvas && blocks.length > 0) {
    canvas.addEventListener('dragover', (e) => {
      if (e.target === canvas) e.preventDefault();
    });
    canvas.addEventListener('drop', (e) => {
      if (e.target !== canvas) return;
      handleLibraryOrCanvasDrop(e, blocks.length, blocks, lesson);
    });
  }
}
