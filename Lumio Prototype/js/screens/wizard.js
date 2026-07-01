/* ============================================================
   COURSE CREATION WIZARD
   ============================================================ */

const WIZARD_STEPS = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'audience', label: 'Audience' },
  { key: 'duration', label: 'Duration' },
  { key: 'objectives', label: 'Objectives' },
  { key: 'image', label: 'Hero Image' },
  { key: 'theme', label: 'Theme Designer' },
  { key: 'review', label: 'Review' },
];

function renderWizard() {
  if (!LumioState.wizard) startWizard('Course');
  const w = LumioState.wizard;

  if (w.step === 'blueprint') { renderBlueprintScreen(); return; }

  const stepIdx = w.step;
  const stepKey = WIZARD_STEPS[stepIdx].key;

  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="min-height:100vh; background:var(--surface-50); display:flex; flex-direction:column; position:relative; overflow:hidden;">
      ${ambientBlobs([
        ['var(--pastel-lavender)', '420px', '420px', '-140px', '-100px', null, null],
        ['var(--pastel-cyan)', '320px', '320px', null, '-80px', '-100px', null],
      ])}

      <!-- Top bar -->
      <div class="flex items-center justify-between" style="padding:18px 32px; position:relative; z-index:1;">
        <div class="flex items-center gap-12">
          <img src="assets/lumio-logo-transparent.png" alt="Lumio" id="wizard-logo" style="width:56px; height:56px; border-radius:0; object-fit:contain; display:block; cursor:pointer;" />
          <span class="pill pill-indigo">${w.type === 'Microlearning' ? 'New Microlearning' : 'New Course'}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="exit-wizard">Save &amp; Exit</button>
      </div>

      <!-- Progress -->
      <div style="padding:0 32px; position:relative; z-index:1;">
        <div style="height:6px; background:var(--border); border-radius:99px; overflow:hidden;">
          <div style="height:100%; width:${((stepIdx+1)/WIZARD_STEPS.length)*100}%; background:var(--gradient-primary); transition:width .3s ease-out;"></div>
        </div>
        <div class="flex justify-between mt-8 text-sm text-muted">
          <span>Step ${stepIdx+1} of ${WIZARD_STEPS.length}</span>
          <span>${WIZARD_STEPS[stepIdx].label}</span>
        </div>
      </div>

      <!-- Content -->
      <div style="flex:1; display:flex; align-items:center; justify-content:center; padding:32px; position:relative; z-index:1;">
        <div style="max-width:640px; width:100%;" class="fade-in" id="wizard-step-content">
          ${wizardStepContent(stepKey, w)}
        </div>
      </div>

      <!-- Nav buttons -->
      <div class="flex justify-between items-center" style="padding:24px 32px; position:relative; z-index:1;">
        <button class="btn btn-secondary" id="wiz-back" ${stepIdx===0?'disabled style="visibility:hidden;"':''}>← Back</button>
        <button class="btn btn-primary btn-lg" id="wiz-next">${stepIdx === WIZARD_STEPS.length-1 ? '✨ Create Course' : 'Continue →'}</button>
      </div>
    </div>
  `;

  bindWizardEvents(stepKey);

  // Hero Image Persistence defect class, wizard instance: resolveMediaSrc()
  // is a synchronous cache-only lookup, and this step's preview never
  // warmed the cache for a hero set on a PRIOR visit (Back/Continue/reload/
  // logout-login restoring LumioState.wizard) — only a same-session fresh
  // upload happened to work, because readHeroImageFile() already calls
  // AssetStore.resolveUrl() before invoking its callback. Same fix pattern
  // as courseLanding.js/projects.js: warm the cache, re-render once if it
  // changed anything.
  if (stepKey === 'image' && w.heroImage && w.heroImage.src) {
    AssetStore.preloadBlocks([], [w.heroImage.src]).then(count => {
      if (count > 0) renderWizard();
    });
  }

  document.getElementById('wizard-logo').addEventListener('click', () => {
    if (LumioState.wizard) {
      confirmLeaveModal('You have a course draft in progress. Your progress will be saved, but the wizard will close.', () => {
        toast('Draft saved — find it in your Projects', '💾');
        navigate('#/welcome');
      });
    } else {
      navigate('#/welcome');
    }
  });
  document.getElementById('exit-wizard').addEventListener('click', () => {
    toast('Draft saved — find it in your Projects', '💾');
    navigate('#/projects');
  });
  document.getElementById('wiz-back').addEventListener('click', () => {
    if (stepIdx > 0) { w.step = stepIdx - 1; renderWizard(); }
  });
  document.getElementById('wiz-next').addEventListener('click', () => {
    if (!validateStep(stepKey, w)) return;
    if (stepIdx === WIZARD_STEPS.length - 1) {
      finalizeCourseToBlueprint();
    } else {
      w.step = stepIdx + 1;
      renderWizard();
    }
  });
}

function tipPanel(html) {
  return `
    <div class="ai-card mt-24">
      <div class="ai-spark">💡</div>
      <div>
        <strong style="font-size:13px; color:var(--ink-900);">Why we're asking</strong>
        <p class="text-sm mt-8">${html}</p>
      </div>
    </div>
  `;
}

function wizardStepContent(stepKey, w) {
  switch (stepKey) {
    case 'title':
      return `
        <h1 style="font-size:28px; text-align:center;">What's your course called?</h1>
        <p class="text-center text-muted mt-8">You can change this anytime.</p>
        <div class="field mt-32">
          <input class="input" id="w-title" style="font-size:20px; padding:18px; text-align:center;" placeholder="e.g. New Hire Onboarding" value="${w.title || ''}" />
        </div>
        ${tipPanel('A clear, benefit-oriented title helps learners know what they\'ll gain — try "[Skill] for [Audience]" rather than "[Topic] Training."')}
      `;
    case 'description':
      return `
        <h1 style="font-size:28px; text-align:center;">Give learners a quick preview</h1>
        <p class="text-center text-muted mt-8">A short description appears on your project card and course landing page.</p>
        <div class="field mt-32">
          <label>Short description</label>
          <textarea class="textarea" id="w-description" rows="4" placeholder="Describe what this course covers and why it matters...">${w.description || ''}</textarea>
          <span class="hint" id="char-count">${(w.description||'').length} / 160 characters</span>
        </div>
        <button class="btn btn-secondary" id="w-gen-desc">✨ Generate with AI</button>
        ${tipPanel('Write this for the learner, not for yourself — what\'s in it for them? Focus on the benefit, not just the topic.')}
      `;
    case 'audience':
      return `
        <h1 style="font-size:28px; text-align:center;">Who is this for?</h1>
        <p class="text-center text-muted mt-8">Knowing your audience shapes tone, pacing, and content choices.</p>
        <div class="mt-32">
          <div class="field">
            <label>Who are they?</label>
            <input class="input" id="w-aud-role" placeholder="e.g. New employees, all departments" value="${w.audRole || ''}" />
          </div>
          <div class="field">
            <label>What do they already know about this topic?</label>
            <select class="input" id="w-aud-prior">
              <option value="none" ${w.audPrior==='none'?'selected':''}>Nothing — this is brand new to them</option>
              <option value="some" ${w.audPrior==='some'?'selected':''}>Some familiarity</option>
              <option value="experienced" ${w.audPrior==='experienced'?'selected':''}>Experienced — this is a refresher</option>
            </select>
          </div>
          <div class="field">
            <label>Why are they taking this?</label>
            <select class="input" id="w-aud-motivation">
              <option value="required" ${w.audMotivation==='required'?'selected':''}>It's required for their role</option>
              <option value="self-directed" ${w.audMotivation==='self-directed'?'selected':''}>They chose it themselves</option>
              <option value="curiosity" ${w.audMotivation==='curiosity'?'selected':''}>General interest / curiosity</option>
            </select>
          </div>
        </div>
        ${tipPanel('Knowing your audience\'s starting point is the first step in instructional design — it shapes everything from tone to pacing, and helps Lumio give you better suggestions later.')}
      `;
    case 'duration':
      const durations = ['5-15 min', '15-30 min', '30-60 min', '60+ min'];
      return `
        <h1 style="font-size:28px; text-align:center;">How long should this take learners?</h1>
        <p class="text-center text-muted mt-8">This is your target — Lumio will track your actual content length as you build.</p>
        <div class="flex gap-12 mt-32" style="justify-content:center; flex-wrap:wrap;">
          ${durations.map(d => `
            <button class="btn ${w.duration===d ? 'btn-primary' : 'btn-secondary'} duration-opt" data-d="${d}" style="min-width:120px;">${d}</button>
          `).join('')}
        </div>
        ${tipPanel('Shorter, focused sessions improve retention. If you\'re not sure, start smaller — Lumio will let you know if your content runs long, and suggest where to trim or split.')}
      `;
    case 'objectives':
      return `
        <h1 style="font-size:28px; text-align:center;">What will learners be able to do?</h1>
        <p class="text-center text-muted mt-8">Aim for 3-5 clear, measurable objectives.</p>
        <div class="mt-24" id="objectives-list">
          ${(w.objectives||[]).map((o, i) => objectiveRow(o, i)).join('')}
        </div>
        <div class="flex gap-12 mt-16">
          <button class="btn btn-secondary btn-sm" id="add-objective">+ Add objective</button>
          <button class="btn btn-secondary btn-sm" id="ai-suggest-objectives">✨ Suggest objectives from my description</button>
        </div>
        ${tipPanel('Try the formula: "By the end of this course, learners will be able to <strong>[verb]</strong> [content] [condition]." Avoid vague verbs like "understand" or "know" — they\'re hard to measure. Pick a verb from the list to see Lumio\'s suggestions.')}
      `;
    case 'image':
      return `
        <h1 style="font-size:28px; text-align:center;">Add a hero image</h1>
        <p class="text-center text-muted mt-8">This appears at the top of your course landing page. You can change it anytime in Course Settings.</p>
        <div class="mt-32" style="max-width:480px; margin:0 auto;">
          <input type="file" id="wiz-hero-file" accept="${heroFileAccept()}" style="display:none" />
          <div class="card" style="overflow:hidden; ${w.heroImage && w.heroImage.src ? '' : 'display:flex; align-items:center; justify-content:center; height:160px; background:var(--surface-50);'}">
            ${w.heroImage && w.heroImage.src
              ? `<img src="${AssetStore.resolveMediaSrc(w.heroImage.src)}" alt="" style="width:100%; height:200px; object-fit:cover; display:block;" />`
              : `<div style="text-align:center; padding:20px;"><div style="font-size:32px;">🖼️</div><p class="text-sm text-muted mt-8">No image selected — a themed gradient will be used by default.</p></div>`}
          </div>
          <div class="flex gap-12 mt-16" style="justify-content:center;">
            <button class="btn btn-secondary" id="wiz-hero-upload">${w.heroImage && w.heroImage.src ? '🔄 Replace Image' : '📤 Upload Image'}</button>
            ${w.heroImage && w.heroImage.src ? `<button class="btn btn-ghost" id="wiz-hero-remove">🗑️ Remove Image</button>` : ''}
          </div>
          <div class="text-sm text-muted mt-16 text-center">Supported formats: PNG, JPG, JPEG, WEBP · Max size ${_formatUploadLimit(UPLOAD_LIMITS.image)}.</div>
          <div id="wiz-hero-error" class="text-sm mt-8 text-center text-destructive" style="display:none;"></div>
        </div>
      `;
    case 'theme':
      return renderThemeDesignerStep(w);
    case 'review':
      const o = w.objectives || [];
      return `
        <h1 style="font-size:28px; text-align:center;">Review your course</h1>
        <p class="text-center text-muted mt-8">Click any section to make changes.</p>
        <div class="flex-col gap-12 mt-24">
          ${reviewRow('Title', w.title, 0)}
          ${reviewRow('Description', w.description, 1)}
          ${reviewRow('Audience', `${w.audRole || '—'} · ${w.audPrior || 'none'} prior knowledge`, 2)}
          ${reviewRow('Duration target', w.duration, 3)}
          ${reviewRow('Objectives', o.map(x=>x.verb+' '+x.text).join('; ') || '—', 4)}
          ${reviewRow('Hero image', w.heroImage && w.heroImage.src ? (w.heroImage.fileName || 'Uploaded image') : 'Default branded cover', 5)}
          ${reviewRow('Theme', themeSummary(w), 6)}
        </div>
      `;
    default: return '';
  }
}

/* ---------------- THEME DESIGNER (Wizard Step 7) ---------------- */
function ensureThemeDesign(w) {
  if (!w.themeDesign) {
    w.themeDesign = defaultThemeDesign();
  }
  return w.themeDesign;
}

// Sprint 3C: a guaranteed-SOLID companion to each Page Background preset.
// --theme-bg-style itself is sometimes a gradient (Aurora Mesh, Soft
// Gradient), which is invalid as a border-color — browsers silently drop an
// invalid border-color, which would leave the outer card border unstyled
// rather than matching the theme. Each entry here is the same surface tone
// the preset already uses (or its nearest solid anchor for the two gradient
// presets), so the outer block border can blend into the page background
// for every preset without introducing a second background system.
const THEME_BG_SOLID_MAP = {
  white: '#FFFFFF',
  'light-grey': '#F1F1F4',
  flat: 'var(--surface-50)',
  mesh: 'var(--surface-50)',
  'soft-gradient': 'var(--surface-0)',
};
function themeVarStyle(td) {
  const font = LumioData.themeDesigner.fontFamilies.find(f => f.id === td.fontId) || LumioData.themeDesigner.fontFamilies[0];
  const size = LumioData.themeDesigner.fontSizes.find(f => f.id === td.fontSizeId) || LumioData.themeDesigner.fontSizes[1];
  const btn = LumioData.themeDesigner.buttonStyles.find(b => b.id === td.buttonStyleId) || LumioData.themeDesigner.buttonStyles[0];
  const radius = LumioData.themeDesigner.cornerRadii.find(r => r.id === td.radiusId) || LumioData.themeDesigner.cornerRadii[1];
  const bg = LumioData.themeDesigner.backgroundStyles.find(b => b.id === td.bgStyleId) || LumioData.themeDesigner.backgroundStyles[0];
  const bgSolid = THEME_BG_SOLID_MAP[bg.id] || 'var(--surface-50)';
  return `--theme-primary:${td.primary}; --theme-secondary:${td.secondary}; --theme-accent:${td.accent};
          --theme-font-display:${font.display}; --theme-font-body:${font.body}; --theme-font-size:${size.value};
          --theme-button-style:${btn.value}; --theme-radius:${radius.value};
          --theme-bg-style:${bg.value}; --theme-bg-solid:${bgSolid};`;
}

function renderThemeDesignerStep(w) {
  const td = ensureThemeDesign(w);
  const TD = LumioData.themeDesigner;
  return `
    <h1 style="font-size:28px; text-align:center;">Design your theme</h1>
    <p class="text-center text-muted mt-8">Sets the look of your course landing page and lessons. You can change this anytime in Course Settings.</p>

    <div class="mt-32" style="display:grid; grid-template-columns:1.1fr 1fr; gap:28px; align-items:start;">
      <div>
        <div class="prop-section">
          <div class="prop-section-title">Color Palette</div>
          <div class="swatch-wheel mb-16">
            ${TD.presetPalettes.map(p => `
              <div class="swatch ${td.primary===p.primary && td.secondary===p.secondary && td.accent===p.accent ? 'selected':''}"
                   data-palette='${JSON.stringify(p)}'
                   style="background:linear-gradient(135deg, ${p.primary}, ${p.secondary} 55%, ${p.accent});"
                   title="${p.name}"></div>
            `).join('')}
          </div>
          <div class="flex-col gap-8">
            <div class="color-input-row">
              <input type="color" id="td-primary" value="${td.primary}" />
              <span class="text-sm">Primary Colour</span>
            </div>
            <div class="color-input-row">
              <input type="color" id="td-secondary" value="${td.secondary}" />
              <span class="text-sm">Secondary Colour</span>
            </div>
            <div class="color-input-row">
              <input type="color" id="td-accent" value="${td.accent}" />
              <span class="text-sm">Accent Colour</span>
            </div>
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Typography</div>
          <div class="field">
            <label>Font Family</label>
            <select class="input" id="td-font">
              ${TD.fontFamilies.map(f => `<option value="${f.id}" ${td.fontId===f.id?'selected':''}>${f.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Font Size</label>
            <div class="seg-control" id="td-fontsize">
              ${TD.fontSizes.map(s => `<button data-val="${s.id}" class="${td.fontSizeId===s.id?'active':''}">${s.label}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Buttons &amp; Shape</div>
          <div class="field">
            <label>Button Style</label>
            <div class="seg-control" id="td-buttonstyle">
              ${TD.buttonStyles.map(s => `<button data-val="${s.id}" class="${td.buttonStyleId===s.id?'active':''}">${s.label}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Corner Radius</label>
            <div class="seg-control" id="td-radius">
              ${TD.cornerRadii.map(s => `<button data-val="${s.id}" class="${td.radiusId===s.id?'active':''}">${s.label}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="prop-section">
          <div class="prop-section-title">Background</div>
          <div class="seg-control" id="td-bgstyle">
            ${TD.backgroundStyles.map(s => `<button data-val="${s.id}" class="${td.bgStyleId===s.id?'active':''}">${s.label}</button>`).join('')}
          </div>
        </div>
      </div>

      <div style="position:sticky; top:20px;">
        <div class="prop-section-title mb-8">Live Preview</div>
        <div class="theme-preview-card" id="theme-preview" style="${themeVarStyle(td)}">
          <div class="tp-hero">
            <span class="pill" style="background:rgba(255,255,255,0.2); color:#fff;">${LumioState.wizard.type === 'Microlearning' ? 'Microlearning' : 'Course'}</span>
            <h3 class="mt-8">${w.title || 'Your Course Title'}</h3>
            <p class="text-sm mt-8" style="color:rgba(255,255,255,0.85);">${(w.description || 'A short description of your course appears here.').slice(0,120)}</p>
            <div class="tp-btn">Start Course →</div>
          </div>
          <div class="tp-body">
            <p class="text-sm text-muted">Lesson text and content will use this theme's fonts, colours, and corner radius throughout your course.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function themeSummary(w) {
  const td = ensureThemeDesign(w);
  const font = LumioData.themeDesigner.fontFamilies.find(f => f.id === td.fontId);
  return `Custom theme · ${font ? font.label : ''} · ${LumioData.themeDesigner.buttonStyles.find(b=>b.id===td.buttonStyleId)?.label} buttons`;
}

function reviewRow(label, value, jumpStep) {
  return `
    <div class="card card-pad flex justify-between items-start gap-16 review-row" data-jump="${jumpStep}" style="cursor:pointer;">
      <div style="min-width:0;">
        <div class="text-sm text-muted">${label}</div>
        <div style="font-weight:600; color:var(--ink-900); margin-top:4px; font-size:14px;">${value || '—'}</div>
      </div>
      <span class="text-muted">✏️</span>
    </div>
  `;
}

function objectiveRow(o, i) {
  const verbOptions = Object.entries(LumioData.bloomVerbs).map(([level, verbs]) =>
    `<optgroup label="${level}">${verbs.map(v => `<option ${o.verb===v?'selected':''}>${v}</option>`).join('')}</optgroup>`
  ).join('');

  const isVague = LumioData.vagueVerbs.some(v => (o.text||'').toLowerCase().includes(v));

  return `
    <div class="card card-pad mb-12 objective-row" data-i="${i}">
      <div class="flex gap-12 items-start">
        <span class="pill pill-indigo" style="margin-top:10px;">By the end, learners will be able to</span>
      </div>
      <div class="flex gap-8 mt-12">
        <select class="input obj-verb" data-i="${i}" style="width:160px;">${verbOptions}</select>
        <input class="input obj-text" data-i="${i}" placeholder="...identify the five steps of our return process" value="${(o.text||'').replace(/"/g,'&quot;')}" style="flex:1;" />
        <button class="btn-icon danger obj-remove" data-i="${i}" title="Remove">✕</button>
      </div>
      ${isVague ? `<div class="text-sm mt-8" style="color:var(--orange);">⚠️ Consider a more measurable verb than "${LumioData.vagueVerbs.find(v=>(o.text||'').toLowerCase().includes(v))}" — try one from the dropdown.</div>` : ''}
    </div>
  `;
}

/* ---------------- VALIDATION ---------------- */
function validateStep(stepKey, w) {
  if (stepKey === 'title' && !(w.title||'').trim()) {
    toast('Please give your course a title', '⚠️'); return false;
  }
  if (stepKey === 'objectives' && (w.objectives||[]).length === 0) {
    toast('Add at least one learning objective', '⚠️'); return false;
  }
  return true;
}

/* ---------------- EVENT BINDING ---------------- */
function bindWizardEvents(stepKey) {
  const w = LumioState.wizard;
  const root = document.getElementById('wizard-step-content');

  if (stepKey === 'title') {
    root.querySelector('#w-title').addEventListener('input', e => w.title = e.target.value);
  }

  if (stepKey === 'description') {
    const ta = root.querySelector('#w-description');
    ta.addEventListener('input', e => {
      w.description = e.target.value;
      root.querySelector('#char-count').textContent = `${e.target.value.length} / 160 characters`;
    });
    root.querySelector('#w-gen-desc').addEventListener('click', () => {
      w.description = LumioData.ai.generateDescription(w.title || 'this topic');
      renderWizard();
    });
  }

  if (stepKey === 'audience') {
    root.querySelector('#w-aud-role').addEventListener('input', e => w.audRole = e.target.value);
    root.querySelector('#w-aud-prior').addEventListener('change', e => w.audPrior = e.target.value);
    root.querySelector('#w-aud-motivation').addEventListener('change', e => w.audMotivation = e.target.value);
  }

  if (stepKey === 'duration') {
    root.querySelectorAll('.duration-opt').forEach(btn => {
      btn.addEventListener('click', () => { w.duration = btn.dataset.d; renderWizard(); });
    });
  }

  if (stepKey === 'objectives') {
    root.querySelectorAll('.obj-verb').forEach(sel => sel.addEventListener('change', e => {
      w.objectives[+e.target.dataset.i].verb = e.target.value;
    }));
    root.querySelectorAll('.obj-text').forEach(inp => inp.addEventListener('input', e => {
      w.objectives[+e.target.dataset.i].text = e.target.value;
    }));
    root.querySelectorAll('.obj-remove').forEach(btn => btn.addEventListener('click', e => {
      w.objectives.splice(+e.target.dataset.i, 1); renderWizard();
    }));
    root.querySelector('#add-objective').addEventListener('click', () => {
      w.objectives = w.objectives || [];
      if (w.objectives.length >= 6) { toast('Consider keeping it to 5-6 objectives — more may spread your course too thin', '⚠️'); }
      w.objectives.push({ verb: 'Identify', text: '' });
      renderWizard();
    });
    root.querySelector('#ai-suggest-objectives').addEventListener('click', () => {
      w.objectives = LumioData.ai.suggestObjectives(w.title || 'this course', w.audRole || '');
      renderWizard();
      toast('Suggested 3 objectives — feel free to edit them', '✨');
    });
  }

  if (stepKey === 'image') {
    root.querySelector('#wiz-hero-upload').addEventListener('click', () => root.querySelector('#wiz-hero-file').click());
    root.querySelector('#wiz-hero-file').addEventListener('change', e => {
      const file = e.target.files[0];
      readHeroImageFile(file, (result, error) => {
        const errEl = root.querySelector('#wiz-hero-error');
        if (error) {
          errEl.textContent = error;
          errEl.style.display = 'block';
          return;
        }
        errEl.style.display = 'none';
        w.heroImage = { src: result.src, fileName: result.fileName, mimeType: result.mimeType };
        renderWizard();
      });
      e.target.value = '';
    });
    root.querySelector('#wiz-hero-remove')?.addEventListener('click', () => {
      w.heroImage = null;
      renderWizard();
    });
  }

  if (stepKey === 'theme') {
    const td = ensureThemeDesign(w);
    const preview = root.querySelector('#theme-preview');
    const refreshPreview = () => { preview.setAttribute('style', themeVarStyle(td)); };

    root.querySelectorAll('.swatch').forEach(sw => sw.addEventListener('click', () => {
      const p = JSON.parse(sw.dataset.palette);
      td.primary = p.primary; td.secondary = p.secondary; td.accent = p.accent;
      renderWizard();
    }));
    root.querySelector('#td-primary').addEventListener('input', e => { td.primary = e.target.value; refreshPreview(); });
    root.querySelector('#td-secondary').addEventListener('input', e => { td.secondary = e.target.value; refreshPreview(); });
    root.querySelector('#td-accent').addEventListener('input', e => { td.accent = e.target.value; refreshPreview(); });
    root.querySelector('#td-font').addEventListener('change', e => { td.fontId = e.target.value; refreshPreview(); });

    function bindSeg(id, prop) {
      root.querySelectorAll(`#${id} button`).forEach(btn => btn.addEventListener('click', () => {
        td[prop] = btn.dataset.val;
        root.querySelectorAll(`#${id} button`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        refreshPreview();
      }));
    }
    bindSeg('td-fontsize', 'fontSizeId');
    bindSeg('td-buttonstyle', 'buttonStyleId');
    bindSeg('td-radius', 'radiusId');
    bindSeg('td-bgstyle', 'bgStyleId');
  }

  if (stepKey === 'review') {
    root.querySelectorAll('.review-row').forEach(row => row.addEventListener('click', () => {
      w.step = +row.dataset.jump; renderWizard();
    }));
  }
}

/* ---------------- BLUEPRINT GENERATION ---------------- */
function finalizeCourseToBlueprint() {
  const w = LumioState.wizard;
  w.step = 'blueprint';
  w.blueprintLoading = true;
  const bp = LumioData.ai.blueprintFromObjectives(w.objectives);
  bp.lessons = bp.lessons.map(l => ({...l, accepted: true}));
  bp.assessments = bp.assessments.map(a => ({...a, accepted: true}));
  w.blueprint = bp;
  renderWizard();
  setTimeout(() => {
    w.blueprintLoading = false;
    renderBlueprintScreen();
  }, 1400);
}

function renderBlueprintScreen() {
  const w = LumioState.wizard;
  const app = document.getElementById('app');
  const bp = w.blueprint;

  app.innerHTML = `
    <div style="min-height:100vh; background:var(--surface-50); position:relative; overflow:hidden; padding:48px 24px;">
      <div class="mesh-bg"></div>
      ${ambientBlobs([
        ['var(--pastel-lavender)', '420px', '420px', '-140px', '-100px', null, null],
        ['var(--pastel-cyan)', '320px', '320px', null, '-80px', '-100px', null],
      ])}
      <div style="max-width:760px; width:100%; margin:0 auto; position:relative; z-index:1;" class="fade-in">
        ${w.blueprintLoading ? `
          <div class="text-center" style="padding-top:80px;">
            <div class="ai-spark" style="margin:0 auto 20px; width:48px; height:48px; font-size:22px;">✨</div>
            <h2 style="font-size:22px;">Lumio is sketching your course...</h2>
            <p class="text-muted mt-8">Mapping your objectives to lessons, assessments, and interactions</p>
            <div class="card mt-24" style="height:14px; overflow:hidden;"><div class="shimmer" style="height:100%;"></div></div>
            <div class="card mt-12" style="height:14px; overflow:hidden;"><div class="shimmer" style="height:100%;"></div></div>
            <div class="card mt-12" style="height:14px; overflow:hidden; width:70%;"><div class="shimmer" style="height:100%;"></div></div>
          </div>
        ` : `
          <div class="text-center mb-32">
            <span class="pill pill-cyan">✨ AI Course Blueprint</span>
            <h2 style="font-size:26px; margin-top:12px;">Here's your AI-generated course plan</h2>
            <p class="text-muted mt-8">
              Review and adjust below — uncheck anything you'd like to skip. Everything is editable later.
            </p>
          </div>

          <div class="card glass-card card-pad mb-24">
            <div class="flex items-center justify-between mb-16">
              <h3 style="font-size:15px;">🎯 Learning Objectives</h3>
              <span class="pill pill-indigo">⏱ ${bp.estimatedDuration}</span>
            </div>
            <div class="flex-col gap-8">
              ${w.objectives.map((o,i) => `<div class="text-sm"><strong>${i+1}.</strong> ${o.verb} ${o.text}</div>`).join('')}
            </div>
          </div>

          <div class="card card-pad mb-24">
            <h3 style="font-size:15px; margin-bottom:16px;">📚 Suggested Lessons</h3>
            <div class="flex-col gap-12">
              ${bp.lessons.map((b, i) => `
                <div class="acc-item" style="border:1px solid var(--border);">
                  <div class="flex items-center gap-12" style="padding:12px 16px;">
                    <input type="checkbox" class="bp-check" data-group="lessons" data-i="${i}" ${b.accepted ? 'checked' : ''} style="width:18px; height:18px;" />
                    <div style="flex:1;">
                      <div style="font-weight:600; font-size:14px; color:var(--ink-900);">${b.title}</div>
                      <div class="text-sm text-muted mt-8">
                        Addresses Objective ${b.objectiveIndex+1} · ~${b.duration} · 🧩 ${bp.interactions[i] ? bp.interactions[i].type : 'Interaction'}
                      </div>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card card-pad mb-24">
            <h3 style="font-size:15px; margin-bottom:16px;">✅ Suggested Assessments &amp; Knowledge Checks</h3>
            <div class="flex-col gap-12">
              ${bp.assessments.map((a, i) => `
                <div class="acc-item" style="border:1px solid var(--border);">
                  <div class="flex items-center gap-12" style="padding:12px 16px;">
                    <input type="checkbox" class="bp-check" data-group="assessments" data-i="${i}" ${a.accepted ? 'checked' : ''} style="width:18px; height:18px;" />
                    <div style="flex:1;">
                      <div style="font-weight:600; font-size:14px; color:var(--ink-900);">${a.title}</div>
                      <div class="text-sm text-muted mt-8">${a.type} · Aligned to Objective ${a.objectiveIndex+1}</div>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card card-pad mb-24">
            <h3 style="font-size:15px; margin-bottom:16px;">🔄 Suggested Learning Flow</h3>
            <div class="flex items-center gap-8" style="flex-wrap:wrap;">
              ${bp.lessons.map((b, i) => `
                <span class="pill pill-indigo">🎯 Obj ${b.objectiveIndex+1}</span>
                <span class="text-muted">→</span>
                <span class="pill pill-cyan">📘 Lesson ${i+1}</span>
                <span class="text-muted">→</span>
                <span class="pill pill-magenta">🧩 ${bp.interactions[i] ? bp.interactions[i].type : 'Activity'}</span>
                <span class="text-muted">→</span>
                <span class="pill pill-teal">✅ Check ${i+1}</span>
                ${i < bp.lessons.length - 1 ? '<span class="text-muted" style="margin:0 8px;">|</span>' : ''}
              `).join('')}
            </div>
          </div>

          <div class="flex gap-12 mt-32" style="justify-content:center;">
            <button class="btn btn-secondary btn-lg" id="bp-skip">Skip — start blank</button>
            <button class="btn btn-primary btn-lg" id="bp-build">Looks good — build my course</button>
          </div>
        `}
      </div>
    </div>
  `;

  if (!w.blueprintLoading) {
    app.querySelectorAll('.bp-check').forEach(cb => cb.addEventListener('change', e => {
      bp[e.target.dataset.group][+e.target.dataset.i].accepted = e.target.checked;
    }));
    app.querySelector('#bp-skip').addEventListener('click', () => createCourseFromWizard({ lessons: [], assessments: [] }));
    app.querySelector('#bp-build').addEventListener('click', () => {
      createCourseFromWizard({
        lessons: bp.lessons.filter(b => b.accepted),
        assessments: bp.assessments.filter(a => a.accepted),
      });
    });
  }
}

function createCourseFromWizard(blueprint) {
  const w = LumioState.wizard;
  const id = 'c' + Date.now();

  const audienceStr = `${w.audRole || 'General audience'} · ${
    {none:'no prior knowledge', some:'some familiarity', experienced:'experienced / refresher'}[w.audPrior] || 'no prior knowledge'
  } · ${
    {required:'required for their role', 'self-directed':'self-directed', curiosity:'general interest'}[w.audMotivation] || 'self-directed'
  }`;

  const course = {
    id,
    title: w.title,
    description: w.description || LumioData.ai.generateDescription(w.title),
    audience: audienceStr,
    duration: w.duration,
    objectives: w.objectives,
    learnerOutcomes: LumioData.ai.rewriteOutcomes(w.objectives),
    theme: w.theme,
    themeDesign: ensureThemeDesign(w),
    landingLayout: 'A',
    heroSettings: defaultHeroSettings(),
    heroImage: w.heroImage ? Object.assign(defaultHeroImage(), w.heroImage) : defaultHeroImage(),
    lessons: blueprint.lessons.map(b => ({ id: generateUniqueId('l'), title: b.title, objectiveIndex: b.objectiveIndex, duration: b.duration })),
    assessments: blueprint.assessments.map((a, i) => ({ id: generateUniqueId('a'), title: a.title, type: a.type, objectives: [a.objectiveIndex] })),
  };
  LumioState.courses[id] = course;

  // create matching project entry
  LumioState.projects.unshift({
    id, title: course.title, type: w.type === 'Microlearning' ? 'Microlearning' : 'Course',
    folder: null, modified: 'Edited just now', status: 'draft',
    thumb: Math.floor(Math.random()*LumioData.thumbGradients.length),
    health: 60,
    lastAccessed: Date.now(),
    ownerId: getCurrentUser()?.id,
    sharedWith: [],
    sharedScope: null,
    sharedPermission: 'view',
    reviewStatus: null, reviewedBy: null, reviewedAt: null, reviewComments: null, submittedBy: null, submittedAt: null,
  });

  // seed empty lesson content for created lessons
  course.lessons.forEach(l => { LumioState.lessons[l.id] = []; });

  LumioState.currentCourseId = id;
  LumioState.wizard = null;
  toast('Course created!', '🎉');
  navigate('#/course/' + id);
}
