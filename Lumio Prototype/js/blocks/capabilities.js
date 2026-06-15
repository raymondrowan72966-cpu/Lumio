/* ============================================================
   BLOCK CAPABILITIES
   Builds the shared per-type capability maps by merging each
   block's family defaults (js/blocks/families.js) with a small
   set of per-type overrides for flagged exception blocks.
   Pure data — consumed by schema.js, designSystem.js,
   behaviourRuntime.js, accessibility.js, aiAssist.js,
   analytics.js, completionEngine.js.
   ============================================================ */

const BlockCapabilities = (function () {
  const { FAMILY_OF, FAMILY_DEFAULTS } = BlockFamilies;
  const TYPES = Object.keys(FAMILY_OF);

  function build(overridesByType, pick) {
    const map = {};
    TYPES.forEach((type) => {
      const family = FAMILY_OF[type];
      const base = pick(FAMILY_DEFAULTS[family]);
      const override = (overridesByType && overridesByType[type]) || {};
      map[type] = Object.assign({}, base, override);
    });
    return map;
  }

  // ----------------------------------------------------------
  // DESIGN — wrapper styling category for DesignSystem
  // ----------------------------------------------------------
  const DESIGN_CAPABILITIES = build({
    text_on_image: { category: 'overlay' },
    quote_image: { category: 'overlay' },
    line_divider: { category: 'minimal' },
    numbered_divider: { category: 'minimal' },
    continue: { category: 'minimal' },
    spacer: { category: 'minimal' },
    // These types keep the Media/Layout family's 'document' category
    // (they are document-flow content, not overlays/minimal dividers),
    // but their current wrapper treatment is 'card', not the category's
    // default 'cardless' treatment. Treatment is overridden independently
    // of category so DesignSystem.resolveBlockStyle can resolve each axis
    // separately without drifting the category assignment.
    chart_bar: { treatment: 'card' },
    chart_line: { treatment: 'card' },
    chart_pie: { treatment: 'card' },
    // Statement (callout) blocks render as flat document content with a
    // type-coloured surface rather than a separate elevated card —
    // treatment overridden independently of the 'callout' category.
    stmt_info: { treatment: 'cardless' },
    stmt_tip: { treatment: 'cardless' },
    stmt_success: { treatment: 'cardless' },
    stmt_warning: { treatment: 'cardless' },
    stmt_error: { treatment: 'cardless' },
    stmt_note: { treatment: 'cardless' },
    // Button renders as a single inline CTA with its own styling — no
    // outer card chrome. Flashcards render their own per-card "card" faces,
    // so the outer wrapper stays cardless to avoid a double card frame.
    button: { treatment: 'cardless' },
    flashcard_grid: { treatment: 'cardless' },
    flashcard_stack: { treatment: 'cardless' },
  }, (defaults) => ({ category: defaults.category }));

  // ----------------------------------------------------------
  // BEHAVIOUR — which BehaviourRuntime primitives apply
  // ----------------------------------------------------------
  const BEHAVIOUR_CAPABILITIES = build({
    continue: { primitives: ['click'] },
    list_checkbox: { primitives: ['toggle'] },
    kc_matching: { primitives: ['reorder'] },
    kc_ordering: { primitives: ['reorder'] },
    kc_multiple_choice: { primitives: ['click'] },
    kc_multiple_response: { primitives: ['toggle'] },
    kc_fill_gap: { primitives: ['click'] },
    video: { primitives: ['media'] },
    audio: { primitives: ['media'] },
    carousel: { primitives: ['click'] },
    quote_carousel: { primitives: ['click'] },
  }, (defaults) => ({ primitives: defaults.behaviourPrimitives.slice() }));

  // ----------------------------------------------------------
  // ACCESSIBILITY — decorative flag + contrast-check eligibility
  // ----------------------------------------------------------
  const ACCESSIBILITY_CAPABILITIES = build({
    text_on_image: { decorative: false, contrastCheck: true },
    quote_image: { decorative: false, contrastCheck: true },
    line_divider: { decorative: true, contrastCheck: false },
    numbered_divider: { decorative: true, contrastCheck: false },
    continue: { decorative: false, contrastCheck: false },
    spacer: { decorative: true, contrastCheck: false },
  }, (defaults) => ({ decorative: defaults.decorative, contrastCheck: false }));

  // ----------------------------------------------------------
  // AI ASSIST — available assist actions per family
  // ----------------------------------------------------------
  const FAMILY_AI_ACTIONS = {
    text: ['rewrite', 'simplify', 'expand'],
    media: ['generate-alt-text'],
    callout: ['rewrite', 'simplify'],
    layout: [],
    interactive: ['rewrite', 'generate-content'],
    flashcards: ['generate-content'],
    assessment: ['generate-distractors', 'rewrite'],
    scenario: ['generate-content'],
    action: [],
  };
  const AI_CAPABILITIES = build({
    image: { assistActions: ['generate-alt-text', 'generate-image'] },
    image_text: { assistActions: ['generate-alt-text', 'generate-image', 'rewrite'] },
    text_on_image: { assistActions: ['generate-alt-text', 'generate-image'] },
    quote_image: { assistActions: ['generate-alt-text', 'generate-image'] },
  }, (defaults) => ({ assistActions: FAMILY_AI_ACTIONS[Object.keys(FAMILY_DEFAULTS).find(f => FAMILY_DEFAULTS[f] === defaults)].slice() }));

  // ----------------------------------------------------------
  // ANALYTICS — which event types this block type can emit
  // ----------------------------------------------------------
  const FAMILY_ANALYTICS_EVENTS = {
    text: ['Viewed'],
    media: ['Viewed', 'Played', 'Downloaded'],
    callout: ['Viewed'],
    layout: [],
    interactive: ['Viewed', 'Clicked', 'Expanded'],
    flashcards: ['Viewed', 'Flipped'],
    assessment: ['Attempted', 'Answered', 'Passed', 'Failed'],
    scenario: ['Viewed', 'ChoiceSelected', 'BranchEntered'],
    action: ['Clicked', 'Navigated'],
  };
  const ANALYTICS_CAPABILITIES = build(null, (defaults) => {
    const family = Object.keys(FAMILY_DEFAULTS).find(f => FAMILY_DEFAULTS[f] === defaults);
    return { events: FAMILY_ANALYTICS_EVENTS[family].slice() };
  });

  // ----------------------------------------------------------
  // MEDIA — whether this block type holds a MediaRef, and its kind
  // ----------------------------------------------------------
  const MEDIA_CAPABILITIES = build({
    image: { hasMedia: true, kind: 'image' },
    image_text: { hasMedia: true, kind: 'image' },
    text_on_image: { hasMedia: true, kind: 'image' },
    quote_image: { hasMedia: true, kind: 'image' },
    video: { hasMedia: true, kind: 'video' },
    audio: { hasMedia: true, kind: 'audio' },
    file: { hasMedia: true, kind: 'file' },
    carousel: { hasMedia: true, kind: 'image' },
    column_grid: { hasMedia: true, kind: 'image' },
    chart_bar: { hasMedia: false, kind: 'chart' },
    chart_line: { hasMedia: false, kind: 'chart' },
    chart_pie: { hasMedia: false, kind: 'chart' },
  }, () => ({ hasMedia: false, kind: null }));

  // ----------------------------------------------------------
  // COMPLETION — default completion strategy
  // ----------------------------------------------------------
  const COMPLETION_CAPABILITIES = build({
    continue: { strategy: 'none' },
    spacer: { strategy: 'none' },
    list_checkbox: { strategy: 'interacted' },
    // Carousel/Quote Carousel default to the 'layout' family's 'none'
    // strategy, but the spec requires Continue to be able to gate on
    // "every slide/quote visited" — override to 'interacted'.
    carousel: { strategy: 'interacted' },
    quote_carousel: { strategy: 'interacted' },
  }, (defaults) => ({ strategy: defaults.completion }));

  return {
    DESIGN: DESIGN_CAPABILITIES,
    BEHAVIOUR: BEHAVIOUR_CAPABILITIES,
    ACCESSIBILITY: ACCESSIBILITY_CAPABILITIES,
    AI: AI_CAPABILITIES,
    ANALYTICS: ANALYTICS_CAPABILITIES,
    MEDIA: MEDIA_CAPABILITIES,
    COMPLETION: COMPLETION_CAPABILITIES,
  };
})();
