/* ============================================================
   LANDING PAGE SECTION STYLING
   Shared helpers for the styleable Course Landing / Learner
   Preview sections: Learning Objectives, Navigation Tips and
   Course Structure. Settings are stored on course.landingStyles
   and applied live in both Course Landing and Learner Preview.
   ============================================================ */

const LANDING_SECTION_DEFAULTS = {
  objectives: {
    headingText: "By the end of this course, you will be able to:",
    headingFont: '', headingFontSize: 16, headingColor: '', headingAlign: 'center', headingWeight: '600',
    textFont: '', textFontSize: 14, textColor: '', bold: false, italic: false, underline: false, textAlign: 'left',
    bg: '', border: '', radius: '',
  },
  navTips: {
    headingText: 'Navigation Tips',
    headingFont: '', headingFontSize: 13, headingColor: '', headingAlign: 'left', headingWeight: '700',
    textFont: '', textFontSize: 14, textColor: '', bold: false, italic: false, underline: false, textAlign: 'left',
    bg: '', border: '', radius: '', iconColor: '',
  },
  courseStructure: {
    headingText: 'This course covers the following:',
    headingFont: '', headingFontSize: 16, headingColor: '', headingAlign: 'center', headingWeight: '600',
    textFont: '', textFontSize: 14, textColor: '', bold: false, italic: false, underline: false, textAlign: 'left',
    bg: '', border: '', radius: '',
  },
};

const LANDING_SECTION_LABELS = {
  objectives: 'Learning Objectives',
  navTips: 'Navigation Tips',
  courseStructure: 'Course Structure',
};

const LANDING_FONT_OPTIONS = [
  { id: '', label: 'Theme Default' },
  { id: "'Poppins', sans-serif", label: 'Poppins' },
  { id: "'Inter', sans-serif", label: 'Inter' },
  { id: "Georgia, serif", label: 'Georgia' },
  { id: "'Courier New', monospace", label: 'Courier New' },
];

function ensureLandingStyles(course) {
  if (!course.landingStyles) course.landingStyles = {};
  Object.keys(LANDING_SECTION_DEFAULTS).forEach(k => {
    if (!course.landingStyles[k]) course.landingStyles[k] = {};
    const target = course.landingStyles[k];
    Object.keys(LANDING_SECTION_DEFAULTS[k]).forEach(prop => {
      if (!(prop in target)) target[prop] = LANDING_SECTION_DEFAULTS[k][prop];
    });
  });
  return course.landingStyles;
}

function landingPanelStyle(style) {
  const bg = style.bg || 'var(--surface-0)';
  const border = style.border || 'var(--border)';
  const radius = style.radius || 'var(--theme-radius, var(--r-xl))';
  return `background:${bg}; border:1px solid ${border}; border-radius:${radius};`;
}

function landingNavTipsPanelStyle(style) {
  const bg = style.bg || 'linear-gradient(135deg, color-mix(in srgb, var(--theme-primary, #7C3AED) 8%, transparent), color-mix(in srgb, var(--theme-accent, #06B6D4) 8%, transparent))';
  const border = style.border || 'color-mix(in srgb, var(--theme-primary, #7C3AED) 22%, transparent)';
  const radius = style.radius || 'var(--r-lg)';
  return `background:${bg}; border:1px solid ${border}; border-radius:${radius};`;
}

function landingNavTipsIconStyle(style) {
  return `background:${style.iconColor || 'var(--theme-accent, var(--cyan))'};`;
}

function landingHeadingStyle(style, fallbackFont) {
  return `font-family:${style.headingFont || fallbackFont || 'var(--theme-font-display, var(--font-display))'}; font-size:${style.headingFontSize}px; color:${style.headingColor || 'var(--ink-900)'}; text-align:${style.headingAlign}; font-weight:${style.headingWeight};`;
}

function landingTextStyle(style) {
  return `font-family:${style.textFont || 'inherit'}; font-size:${style.textFontSize}px; color:${style.textColor || 'inherit'}; text-align:${style.textAlign}; font-weight:${style.bold ? '700' : '400'}; font-style:${style.italic ? 'italic' : 'normal'}; text-decoration:${style.underline ? 'underline' : 'none'};`;
}

/* ---------------- SECTION RENDERERS ---------------- */

function renderObjectivesSection(course, editable) {
  ensureLandingStyles(course);
  const style = course.landingStyles.objectives;
  const heading = style.headingText || LANDING_SECTION_DEFAULTS.objectives.headingText;
  return `
    <div class="card card-pad mt-24 fade-in" style="${landingPanelStyle(style)}">
      <h3 style="${landingHeadingStyle(style)}">${heading}</h3>
      <div class="flex-col gap-12 mt-16">
        ${(course.learnerOutcomes || []).map(o => `
          <div class="flex items-start gap-12">
            <span style="color:var(--theme-accent, var(--teal)); font-size:18px;">✓</span>
            <span style="${landingTextStyle(style)}">${o}</span>
          </div>
        `).join('')}
      </div>
      ${editable ? `<p class="text-sm text-muted mt-16 text-center">Generated from your learning objectives — <a href="#" id="edit-objectives">edit objectives</a></p>` : ''}
    </div>`;
}

function renderCourseStructureSection(course) {
  ensureLandingStyles(course);
  const style = course.landingStyles.courseStructure;
  const heading = style.headingText || LANDING_SECTION_DEFAULTS.courseStructure.headingText;
  const items = [];
  course.lessons.forEach((l, i) => items.push(`Lesson ${i + 1}: ${l.title}`));
  course.assessments.forEach(a => items.push(`Assessment: ${a.title}`));
  return `
    <div class="card card-pad mt-24 fade-in" style="${landingPanelStyle(style)}">
      <h3 style="${landingHeadingStyle(style)}">${heading}</h3>
      <div class="flex-col gap-8 mt-16">
        ${items.length ? items.map(t => `<div style="${landingTextStyle(style)}">${t}</div>`).join('') : '<p class="text-sm text-muted">No lessons or assessments yet.</p>'}
      </div>
    </div>`;
}

function renderNavTipsSection(course, navTips) {
  ensureLandingStyles(course);
  const style = course.landingStyles.navTips;
  const heading = style.headingText || LANDING_SECTION_DEFAULTS.navTips.headingText;
  return `
    <div class="ai-card mt-24 fade-in" style="${landingNavTipsPanelStyle(style)}">
      <div class="ai-spark" style="${landingNavTipsIconStyle(style)}">🧭</div>
      <div>
        <strong style="${landingHeadingStyle(style)}">${heading}</strong>
        <p class="text-sm mt-8" style="${landingTextStyle(style)}">${navTips}</p>
      </div>
    </div>`;
}

/* ---------------- COURSE SETTINGS TAB ---------------- */

function renderLandingSectionSettings(course, body, SettingsUI, renderBody) {
  ensureLandingStyles(course);
  if (!SettingsUI.landingSection) SettingsUI.landingSection = 'objectives';
  const sectionKey = SettingsUI.landingSection;
  const style = course.landingStyles[sectionKey];

  body.innerHTML = `
    <div class="prop-section">
      <div class="prop-section-title">Section</div>
      <div class="seg-control" id="ls-section-tabs">
        ${Object.entries(LANDING_SECTION_LABELS).map(([k, l]) => `<button data-val="${k}" class="${sectionKey === k ? 'active' : ''}">${l}</button>`).join('')}
      </div>
      <p class="text-sm text-muted mt-8">Changes apply immediately to Course Landing and Learner Preview, and are saved with this course.</p>
    </div>

    <div class="prop-section">
      <div class="prop-section-title">Heading</div>
      <div class="field">
        <label>Heading Text</label>
        <input class="input" id="ls-heading-text" value="${(style.headingText || '').replace(/"/g, '&quot;')}" />
      </div>
      <div class="field">
        <label>Font Family</label>
        <select class="input" id="ls-heading-font">
          ${LANDING_FONT_OPTIONS.map(f => `<option value="${f.id}" ${style.headingFont === f.id ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Font Size — ${style.headingFontSize}px</label>
        <input type="range" id="ls-heading-size" min="12" max="32" step="1" value="${style.headingFontSize}" style="width:100%;" />
      </div>
      <div class="field">
        <label>Font Colour</label>
        <div class="color-input-row">
          <input type="color" id="ls-heading-color" value="${style.headingColor || '#1a1a2e'}" />
          <button class="btn btn-ghost btn-sm" id="ls-heading-color-reset">Use theme default</button>
        </div>
      </div>
      <div class="field">
        <label>Alignment</label>
        <div class="seg-control" id="ls-heading-align">
          ${['left', 'center', 'right'].map(v => `<button data-val="${v}" class="${style.headingAlign === v ? 'active' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>Font Weight</label>
        <div class="seg-control" id="ls-heading-weight">
          ${[['400', 'Normal'], ['600', 'Semibold'], ['700', 'Bold']].map(([v, l]) => `<button data-val="${v}" class="${style.headingWeight === v ? 'active' : ''}">${l}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="prop-section">
      <div class="prop-section-title">${sectionKey === 'navTips' ? 'Tip Text' : 'Body Text'}</div>
      <div class="field">
        <label>Font Family</label>
        <select class="input" id="ls-text-font">
          ${LANDING_FONT_OPTIONS.map(f => `<option value="${f.id}" ${style.textFont === f.id ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Font Size — ${style.textFontSize}px</label>
        <input type="range" id="ls-text-size" min="10" max="24" step="1" value="${style.textFontSize}" style="width:100%;" />
      </div>
      <div class="field">
        <label>Font Colour</label>
        <div class="color-input-row">
          <input type="color" id="ls-text-color" value="${style.textColor || '#1a1a2e'}" />
          <button class="btn btn-ghost btn-sm" id="ls-text-color-reset">Use theme default</button>
        </div>
      </div>
      <div class="field">
        <label>Formatting</label>
        <div class="flex gap-12">
          <label class="flex items-center gap-8" style="cursor:pointer;"><input type="checkbox" id="ls-text-bold" ${style.bold ? 'checked' : ''}/> Bold</label>
          <label class="flex items-center gap-8" style="cursor:pointer;"><input type="checkbox" id="ls-text-italic" ${style.italic ? 'checked' : ''}/> Italic</label>
          <label class="flex items-center gap-8" style="cursor:pointer;"><input type="checkbox" id="ls-text-underline" ${style.underline ? 'checked' : ''}/> Underline</label>
        </div>
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>Alignment</label>
        <div class="seg-control" id="ls-text-align">
          ${['left', 'center', 'right'].map(v => `<button data-val="${v}" class="${style.textAlign === v ? 'active' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="prop-section" style="border-bottom:none;">
      <div class="prop-section-title">Panel Appearance</div>
      <div class="field">
        <label>Background Colour</label>
        <div class="color-input-row">
          <input type="color" id="ls-bg-color" value="${style.bg && style.bg.startsWith('#') ? style.bg : '#ffffff'}" />
          <button class="btn btn-ghost btn-sm" id="ls-bg-reset">Use theme default</button>
        </div>
      </div>
      <div class="field">
        <label>Border Colour</label>
        <div class="color-input-row">
          <input type="color" id="ls-border-color" value="${style.border && style.border.startsWith('#') ? style.border : '#e5e7eb'}" />
          <button class="btn btn-ghost btn-sm" id="ls-border-reset">Use theme default</button>
        </div>
      </div>
      <div class="field" ${sectionKey === 'navTips' ? '' : 'style="margin-bottom:0;"'}>
        <label>Border Radius — ${parseInt(style.radius) || 12}px</label>
        <input type="range" id="ls-radius" min="0" max="32" step="1" value="${parseInt(style.radius) || 12}" style="width:100%;" />
      </div>
      ${sectionKey === 'navTips' ? `
      <div class="field" style="margin-bottom:0;">
        <label>Icon Colour</label>
        <div class="color-input-row">
          <input type="color" id="ls-icon-color" value="${style.iconColor || '#06B6D4'}" />
          <button class="btn btn-ghost btn-sm" id="ls-icon-reset">Use theme default</button>
        </div>
      </div>` : ''}
    </div>
  `;

  const refresh = () => renderCourseLanding(course.id);

  body.querySelectorAll('#ls-section-tabs button').forEach(btn => btn.addEventListener('click', () => {
    SettingsUI.landingSection = btn.dataset.val;
    renderBody();
  }));

  body.querySelector('#ls-heading-text').addEventListener('input', e => { style.headingText = e.target.value; refresh(); });
  body.querySelector('#ls-heading-font').addEventListener('change', e => { style.headingFont = e.target.value; refresh(); });
  body.querySelector('#ls-heading-size').addEventListener('input', e => {
    style.headingFontSize = parseInt(e.target.value, 10);
    body.querySelector('#ls-heading-size').closest('.field').querySelector('label').textContent = `Font Size — ${style.headingFontSize}px`;
    refresh();
  });
  body.querySelector('#ls-heading-color').addEventListener('input', e => { style.headingColor = e.target.value; refresh(); });
  body.querySelector('#ls-heading-color-reset').addEventListener('click', () => { style.headingColor = ''; renderBody(); refresh(); });
  body.querySelectorAll('#ls-heading-align button').forEach(btn => btn.addEventListener('click', () => { style.headingAlign = btn.dataset.val; renderBody(); refresh(); }));
  body.querySelectorAll('#ls-heading-weight button').forEach(btn => btn.addEventListener('click', () => { style.headingWeight = btn.dataset.val; renderBody(); refresh(); }));

  body.querySelector('#ls-text-font').addEventListener('change', e => { style.textFont = e.target.value; refresh(); });
  body.querySelector('#ls-text-size').addEventListener('input', e => {
    style.textFontSize = parseInt(e.target.value, 10);
    body.querySelector('#ls-text-size').closest('.field').querySelector('label').textContent = `Font Size — ${style.textFontSize}px`;
    refresh();
  });
  body.querySelector('#ls-text-color').addEventListener('input', e => { style.textColor = e.target.value; refresh(); });
  body.querySelector('#ls-text-color-reset').addEventListener('click', () => { style.textColor = ''; renderBody(); refresh(); });
  body.querySelector('#ls-text-bold').addEventListener('change', e => { style.bold = e.target.checked; refresh(); });
  body.querySelector('#ls-text-italic').addEventListener('change', e => { style.italic = e.target.checked; refresh(); });
  body.querySelector('#ls-text-underline').addEventListener('change', e => { style.underline = e.target.checked; refresh(); });
  body.querySelectorAll('#ls-text-align button').forEach(btn => btn.addEventListener('click', () => { style.textAlign = btn.dataset.val; renderBody(); refresh(); }));

  body.querySelector('#ls-bg-color').addEventListener('input', e => { style.bg = e.target.value; refresh(); });
  body.querySelector('#ls-bg-reset').addEventListener('click', () => { style.bg = ''; renderBody(); refresh(); });
  body.querySelector('#ls-border-color').addEventListener('input', e => { style.border = e.target.value; refresh(); });
  body.querySelector('#ls-border-reset').addEventListener('click', () => { style.border = ''; renderBody(); refresh(); });
  body.querySelector('#ls-radius').addEventListener('input', e => {
    style.radius = e.target.value + 'px';
    body.querySelector('#ls-radius').closest('.field').querySelector('label').textContent = `Border Radius — ${e.target.value}px`;
    refresh();
  });
  body.querySelector('#ls-icon-color')?.addEventListener('input', e => { style.iconColor = e.target.value; refresh(); });
  body.querySelector('#ls-icon-reset')?.addEventListener('click', () => { style.iconColor = ''; renderBody(); refresh(); });
}
