/* ============================================================
   BLOCK FAMILIES
   Maps every block type to one of 9 families, and defines
   per-family default capability profiles. Pure data — consumed
   by js/blocks/capabilities.js (no rendering logic here).
   ============================================================ */

const BlockFamilies = {
  // ----------------------------------------------------------
  // Block type -> family
  // ----------------------------------------------------------
  FAMILY_OF: {
    // Text (10)
    paragraph: 'text',
    heading_paragraph: 'text',
    heading: 'text',
    list_numbered: 'text',
    list_checkbox: 'text',
    list_bullet: 'text',
    quote1: 'text',
    quote2: 'text',
    quote3: 'text',
    quote4: 'text',

    // Media (10)
    image: 'media',
    image_text: 'media',
    text_on_image: 'media',
    audio: 'media',
    video: 'media',
    file: 'media',
    chart_bar: 'media',
    chart_line: 'media',
    chart_pie: 'media',
    quote_image: 'media',

    // Callout (6)
    stmt_info: 'callout',
    stmt_tip: 'callout',
    stmt_success: 'callout',
    stmt_warning: 'callout',
    stmt_error: 'callout',
    stmt_note: 'callout',

    // Layout (8)
    columns: 'layout',
    table: 'layout',
    carousel: 'layout',
    column_grid: 'layout',
    quote_carousel: 'layout',
    numbered_divider: 'layout',
    line_divider: 'layout',
    continue: 'layout',
    spacer: 'layout',

    // Interactive (4)
    accordion: 'interactive',
    tabs: 'interactive',
    labelled_graphic: 'interactive',
    process: 'interactive',

    // Flashcards (2)
    flashcard_grid: 'flashcards',
    flashcard_stack: 'flashcards',

    // Assessment (5)
    kc_multiple_choice: 'assessment',
    kc_multiple_response: 'assessment',
    kc_matching: 'assessment',
    kc_fill_gap: 'assessment',
    kc_ordering: 'assessment',

    // Scenario (1)
    scenario: 'scenario',

    // Action (1)
    button: 'action',
  },

  // ----------------------------------------------------------
  // Per-family default capability profiles.
  // These are merged with per-type overrides in capabilities.js.
  // category: drives DesignSystem wrapper styling (document/callout/interactive)
  // behaviourPrimitives: which BehaviourRuntime primitives apply by default
  // decorative: accessibility default (true = not announced to AT)
  // completion: default completion strategy for CompletionEngine
  // ----------------------------------------------------------
  FAMILY_DEFAULTS: {
    text: {
      category: 'document',
      behaviourPrimitives: [],
      decorative: false,
      completion: 'viewed',
    },
    media: {
      category: 'document',
      behaviourPrimitives: ['media'],
      decorative: false,
      completion: 'viewed',
    },
    callout: {
      category: 'callout',
      behaviourPrimitives: [],
      decorative: false,
      completion: 'viewed',
    },
    layout: {
      category: 'document',
      behaviourPrimitives: [],
      decorative: true,
      completion: 'none',
    },
    interactive: {
      category: 'interactive',
      behaviourPrimitives: ['toggle', 'reveal'],
      decorative: false,
      completion: 'interacted',
    },
    flashcards: {
      category: 'interactive',
      behaviourPrimitives: ['flip'],
      decorative: false,
      completion: 'interacted',
    },
    assessment: {
      category: 'interactive',
      behaviourPrimitives: ['click'],
      decorative: false,
      completion: 'assessed',
    },
    scenario: {
      category: 'interactive',
      behaviourPrimitives: ['click'],
      decorative: false,
      completion: 'interacted',
    },
    action: {
      category: 'interactive',
      behaviourPrimitives: ['click'],
      decorative: true,
      completion: 'none',
    },
  },
};
