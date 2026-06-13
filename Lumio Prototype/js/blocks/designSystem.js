/* ============================================================
   DESIGN SYSTEM
   Resolves a block's design category (from BlockCapabilities.DESIGN)
   and the wrapper rendering treatment that category implies.
   Architecture-only in Phase 1 Step 6 — not yet consumed by any
   render path. No rendering logic is changed here or elsewhere.
   ============================================================ */

const DesignSystem = (function () {
  // Maps a design category to a wrapper rendering treatment.
  // 'cardless' = renders as page content with no card chrome
  //              (background/border/shadow) — selection shown via outline.
  // 'card'     = renders inside a bordered/background card.
  const CATEGORY_TREATMENT = {
    document: 'cardless',
    overlay: 'cardless',
    minimal: 'cardless',
    callout: 'card',
    interactive: 'card',
  };

  function CATEGORY_OF(type) {
    const entry = BlockCapabilities.DESIGN[type];
    return entry ? entry.category : 'document';
  }

  function resolveBlockStyle(block) {
    const entry = BlockCapabilities.DESIGN[block.type];
    const category = CATEGORY_OF(block.type);
    // Treatment resolves independently of category: a per-type override
    // (e.g. audio/video/file/charts/table) takes precedence over the
    // category's default treatment.
    const treatment = (entry && entry.treatment) || CATEGORY_TREATMENT[category] || 'card';
    return { category, treatment };
  }

  return {
    CATEGORY_OF,
    resolveBlockStyle,
    CATEGORY_TREATMENT,
  };
})();
