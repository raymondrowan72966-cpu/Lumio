/* ============================================================
   COURSE THEME ENGINE — Architectural Validation Harness

   Permanently protects the Course Theme background contract:

     The selected Course Theme background colour is the single
     source of truth for every course surface:
       • Course Landing Page   (.course-landing-root)
       • Lesson Builder canvas (#lesson-canvas-wrap)
       • Full Preview          (.lumio-learner-root)
       • Published Course      (export — inline themeVarStyle)

   NOT loaded in index.html. Load on demand in the browser console:

     const s = document.createElement('script');
     s.src = 'js/courseTheme.validate.js';
     document.head.appendChild(s);
     s.onload = () => {
       const r = CourseThemeValidate.run();
       console.log(r.summary);
       if (r.failures.length) console.error(r.failures);
     };

   No side effects. Read-only inspection of live globals.
   ============================================================ */

const CourseThemeValidate = (() => {

  function _assert(name, condition, detail) {
    return { name, pass: Boolean(condition), detail: detail != null ? String(detail) : '' };
  }

  // ── Contract 1: applyThemeVars selector ─────────────────────────────────
  //
  // applyThemeVars() (app.js) injects Course Theme CSS custom properties via
  // a <style id="__lumio-course-theme"> tag. The selector MUST cover every
  // element that renders the course background.
  //
  // CRITICAL — #lesson-canvas-wrap must be in the selector:
  //   The Lesson Builder canvas background is set on #lesson-canvas-wrap
  //   (background:var(--theme-bg-style)). #lesson-canvas is a child of
  //   #lesson-canvas-wrap. CSS custom properties inherit downward only, so
  //   if #lesson-canvas-wrap is absent from the selector it never receives
  //   --theme-bg-style and falls back to the Platform Theme surface colour.
  //
  // Regression: removing #lesson-canvas-wrap from this selector causes the
  // Builder canvas to display the Platform Theme colour (e.g. pink) instead
  // of the Course Theme background. This assertion will catch that change
  // immediately.

  function _validateApplyThemeVars() {
    const R = [];
    R.push(_assert('applyThemeVars is defined', typeof applyThemeVars === 'function'));
    if (typeof applyThemeVars !== 'function') return R;

    const src = applyThemeVars.toString();
    R.push(_assert(
      'CRITICAL: applyThemeVars selector includes #lesson-canvas-wrap',
      src.includes('#lesson-canvas-wrap'),
      'Removing this causes the Builder canvas to fall back to the Platform Theme colour'
    ));
    R.push(_assert('applyThemeVars selector includes #lesson-canvas',
      src.includes('#lesson-canvas')));
    R.push(_assert('applyThemeVars selector includes .lumio-learner-root',
      src.includes('.lumio-learner-root')));
    R.push(_assert('applyThemeVars selector includes .course-landing-root',
      src.includes('.course-landing-root')));
    R.push(_assert('applyThemeVars writes to __lumio-course-theme style sheet',
      src.includes('__lumio-course-theme')));
    R.push(_assert('applyThemeVars calls themeVarStyle',
      src.includes('themeVarStyle')));
    return R;
  }

  // ── Contract 2: themeVarStyle CSS variable output ────────────────────────
  //
  // themeVarStyle() (wizard.js) generates the inline CSS variable string
  // consumed by every course surface. It MUST emit --theme-bg-style so that
  // all four surfaces receive the correct background from the same source.

  function _validateThemeVarStyle() {
    const R = [];
    R.push(_assert('themeVarStyle is defined', typeof themeVarStyle === 'function'));
    if (typeof themeVarStyle !== 'function') return R;

    const src = themeVarStyle.toString();
    R.push(_assert('themeVarStyle emits --theme-bg-style', src.includes('--theme-bg-style')));
    R.push(_assert('themeVarStyle emits --theme-bg-solid', src.includes('--theme-bg-solid')));
    R.push(_assert('themeVarStyle emits --theme-primary',  src.includes('--theme-primary')));
    R.push(_assert('themeVarStyle reads bgStyleId from themeDesign',
      src.includes('bgStyleId')));
    return R;
  }

  // ── Contract 3: backgroundStyles data model ──────────────────────────────
  //
  // Each background style option must have id, label, and value.
  // value becomes --theme-bg-style; it must never be absent or empty.
  // The 'white' option is the default and must resolve to #FFFFFF.

  function _validateBackgroundStylesData() {
    const R = [];
    if (typeof LumioData === 'undefined') {
      R.push(_assert('LumioData available', false, 'LumioData is not loaded'));
      return R;
    }

    const bs = LumioData?.themeDesigner?.backgroundStyles;
    R.push(_assert('LumioData.themeDesigner.backgroundStyles is array',
      Array.isArray(bs), typeof bs));
    if (!Array.isArray(bs)) return R;

    R.push(_assert('backgroundStyles.length > 0', bs.length > 0, bs.length));
    R.push(_assert('backgroundStyles: all entries have id',
      bs.every(s => typeof s.id === 'string' && s.id)));
    R.push(_assert('backgroundStyles: all entries have label',
      bs.every(s => typeof s.label === 'string' && s.label)));
    R.push(_assert('backgroundStyles: all entries have value (becomes --theme-bg-style)',
      bs.every(s => typeof s.value === 'string' && s.value),
      bs.filter(s => !s.value).map(s => s.id).join(',') || ''));

    const white = bs.find(s => s.id === 'white');
    R.push(_assert('backgroundStyles: white style exists', white != null));
    R.push(_assert('backgroundStyles: white value is #FFFFFF',
      white?.value === '#FFFFFF', white?.value));

    return R;
  }

  // ── Contract 4: THEME_BG_SOLID_MAP coverage ─────────────────────────────
  //
  // THEME_BG_SOLID_MAP (wizard.js) maps background style IDs to solid
  // fallback colours used for --theme-bg-solid. Every background style ID
  // in backgroundStyles must be covered, otherwise --theme-bg-solid falls
  // back to var(--surface-50) which may be incorrect for that style.

  function _validateBgSolidMap() {
    const R = [];
    R.push(_assert('THEME_BG_SOLID_MAP is defined',
      typeof THEME_BG_SOLID_MAP !== 'undefined'));
    if (typeof THEME_BG_SOLID_MAP === 'undefined') return R;

    R.push(_assert('THEME_BG_SOLID_MAP.white === #FFFFFF',
      THEME_BG_SOLID_MAP.white === '#FFFFFF', THEME_BG_SOLID_MAP.white));
    R.push(_assert('THEME_BG_SOLID_MAP has light-grey',    'light-grey'    in THEME_BG_SOLID_MAP));
    R.push(_assert('THEME_BG_SOLID_MAP has soft-gradient', 'soft-gradient' in THEME_BG_SOLID_MAP));
    R.push(_assert('THEME_BG_SOLID_MAP has mesh',          'mesh'          in THEME_BG_SOLID_MAP));
    R.push(_assert('THEME_BG_SOLID_MAP has flat',          'flat'          in THEME_BG_SOLID_MAP));

    // Every backgroundStyles id must have a THEME_BG_SOLID_MAP entry
    if (typeof LumioData !== 'undefined') {
      const bs = LumioData?.themeDesigner?.backgroundStyles || [];
      const missing = bs.filter(s => !(s.id in THEME_BG_SOLID_MAP)).map(s => s.id);
      R.push(_assert('THEME_BG_SOLID_MAP covers all backgroundStyles ids',
        missing.length === 0, missing.join(', ') || ''));
    }
    return R;
  }

  // ── Contract 5: themeVarStyle round-trip ────────────────────────────────
  //
  // For every background style option, calling themeVarStyle() must produce
  // a CSS string that includes --theme-bg-style with a non-empty value.
  // This confirms the data pipeline from bgStyleId selection → CSS variable
  // is intact for all options the user can choose.

  function _validateThemeVarStyleRoundTrip() {
    const R = [];
    if (typeof themeVarStyle !== 'function' || typeof LumioData === 'undefined') {
      R.push(_assert('themeVarStyle round-trip: prerequisites available', false));
      return R;
    }

    const TD = LumioData.themeDesigner;
    const base = {
      primary:       '#1c4584',
      secondary:     '#3c4648',
      accent:        '#a5a983',
      fontId:        TD.fontFamilies[0].id,
      fontSizeId:    TD.fontSizes[1].id,
      buttonStyleId: TD.buttonStyles[0].id,
      radiusId:      TD.cornerRadii[0].id,
    };

    for (const bgStyle of TD.backgroundStyles) {
      const td = Object.assign({}, base, { bgStyleId: bgStyle.id });
      let output;
      try {
        output = themeVarStyle(td);
      } catch (e) {
        R.push(_assert(`themeVarStyle(${bgStyle.id}) does not throw`, false, e.message));
        continue;
      }
      R.push(_assert(`themeVarStyle(${bgStyle.id}) emits --theme-bg-style`,
        typeof output === 'string' && output.includes('--theme-bg-style:'),
        output ? output.substring(0, 60) : '(no output)'));
    }

    // White specifically must resolve to the literal #FFFFFF
    const whiteOutput = themeVarStyle(Object.assign({}, base, { bgStyleId: 'white' }));
    R.push(_assert('themeVarStyle(white) --theme-bg-style value is #FFFFFF',
      whiteOutput.includes('--theme-bg-style:#FFFFFF'), whiteOutput.substring(0, 80)));

    return R;
  }

  // ── Contract 6: runtime DOM (when Lesson Builder is active) ──────────────
  //
  // When #lesson-canvas-wrap is in the DOM (Lesson Builder is rendered),
  // --theme-bg-style must be defined on it. An empty or absent value means
  // the Course Theme background is not reaching the Builder canvas.
  //
  // Run this check from the Lesson Builder screen for full coverage.

  function _validateRuntimeDOM() {
    const R = [];
    const wrap  = document.getElementById('lesson-canvas-wrap');
    const sheet = document.getElementById('__lumio-course-theme');

    if (!wrap) {
      // Not a failure — the Builder just isn't open. Record as skipped.
      R.push(_assert(
        'RUNTIME DOM: Lesson Builder not active (open Builder and re-run for canvas validation)',
        true, 'skipped — navigate to a lesson then re-run'));
      return R;
    }

    R.push(_assert('RUNTIME DOM: #lesson-canvas-wrap present', true));

    const themeVar = getComputedStyle(wrap).getPropertyValue('--theme-bg-style').trim();
    R.push(_assert('RUNTIME DOM: --theme-bg-style is set on #lesson-canvas-wrap',
      themeVar !== '', themeVar || '(empty — Course Theme not reaching Builder canvas)'));

    R.push(_assert('RUNTIME DOM: __lumio-course-theme style sheet present',
      sheet != null));
    if (sheet) {
      R.push(_assert('RUNTIME DOM: __lumio-course-theme selector includes #lesson-canvas-wrap',
        sheet.textContent.includes('#lesson-canvas-wrap'),
        sheet.textContent.substring(0, 120)));
    }

    return R;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Runs the full Course Theme architectural contract validation suite.
   * Call from any page state; runtime DOM checks auto-skip when the
   * Lesson Builder is not active.
   *
   * @returns {{ stages, summary, failures, error }}
   */
  function run() {
    const report = {
      stages:   {},
      summary:  { total: 0, passed: 0, failed: 0 },
      failures: [],
      error:    null,
    };

    try {
      report.stages.applyThemeVars    = _validateApplyThemeVars();
      report.stages.themeVarStyle     = _validateThemeVarStyle();
      report.stages.backgroundData    = _validateBackgroundStylesData();
      report.stages.bgSolidMap        = _validateBgSolidMap();
      report.stages.themeVarRoundTrip = _validateThemeVarStyleRoundTrip();
      report.stages.runtimeDOM        = _validateRuntimeDOM();

      for (const [stageName, checks] of Object.entries(report.stages)) {
        for (const r of checks) {
          report.summary.total++;
          if (r.pass) report.summary.passed++;
          else        report.summary.failed++;
          if (!r.pass) {
            report.failures.push(
              `[${stageName}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`
            );
          }
        }
      }
    } catch (e) {
      report.error = e.message + '\n' + (e.stack || '');
    }

    return report;
  }

  return Object.freeze({ run });

})();
