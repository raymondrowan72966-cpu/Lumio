/* ============================================================
   COMPLETION ENGINE
   Reusable "isCompleted()" system for interactive blocks, used by
   the Continue block to gate progression. Per-block progress is
   stored in LumioState.learnerProgress[courseId].blockProgress,
   keyed by "lessonId:blockIndex", so it persists across reloads.
   Pure logic — consumed by learnerPreview.js (lock/unlock) and the
   global lumioXxx interaction handlers in lessonBuilder.js (which
   record visited/opened/flipped progress as the learner interacts).
   ============================================================ */

const CompletionEngine = (function () {
  // Only these completion strategies represent a block the learner can
  // actually "complete" — text/media/callout ("viewed") and layout/action
  // ("none") blocks (paragraphs, images, quotes, dividers, spacers, buttons,
  // continues) never gate a Continue block. This list intentionally stays
  // unchanged from its original scope (Continue-block gating only) — the
  // Next-button lesson-wide gate added below uses its own, separate
  // strategy list (NEXT_BLOCKING_STRATEGIES) so existing Continue-block
  // behaviour across the app is not retroactively altered.
  const BLOCKING_STRATEGIES = ['interacted', 'assessed'];

  function isBlockCompletable(type) {
    const cap = BlockCapabilities.COMPLETION[type];
    return !!cap && BLOCKING_STRATEGIES.includes(cap.strategy);
  }

  function progressKey(lessonId, blockIdOrIndex) {
    return lessonId + ':' + blockIdOrIndex;
  }

  // Resolves the STABLE storage key for the block currently at `index` in
  // ctx.blocks. Callers always pass a live array index (correct and cheap
  // to obtain at call time, since that's how they found the block to
  // interact with) — this function is the single place that translates
  // "block currently at this position" into "this block's permanent id",
  // so completion/progress survives reordering even though every caller
  // still thinks and speaks in terms of index. Falls back to the raw index
  // if ctx.blocks isn't populated or the block has no id yet (should not
  // happen post-migration, but never throws either way).
  function resolveBlockKey(ctx, index) {
    const block = ctx.blocks && ctx.blocks[index];
    return (block && block.id) || index;
  }

  function getBlockProgress(ctx, index) {
    const progress = ctx.progress;
    if (!progress.blockProgress) progress.blockProgress = {};
    const key = progressKey(ctx.lessonId, resolveBlockKey(ctx, index));
    if (!progress.blockProgress[key]) progress.blockProgress[key] = {};
    return progress.blockProgress[key];
  }

  function itemCount(block, d) {
    switch (block.type) {
      case 'accordion':
      case 'tabs':
      case 'process':
        return normalizeItemList(d, 'items', () => [{}, {}]).length;
      case 'labelled_graphic':
        return normalizeItemList(d, 'hotspots', () => [{}, {}, {}]).length;
      case 'carousel':
        return normalizeCarouselItems(d).length;
      case 'quote_carousel':
        return normalizeQuoteItems(d).length;
      case 'flashcard_grid':
      case 'flashcard_stack':
        return normalizeFlashcardItems(d).length;
      default:
        return 0;
    }
  }

  function isBlockCompleted(block, index, ctx) {
    const cap = BlockCapabilities.COMPLETION[block.type];
    if (!cap || !BLOCKING_STRATEGIES.includes(cap.strategy)) return true;
    const d = block.data || {};

    if (cap.strategy === 'assessed') {
      const ans = ctx.progress.kcAnswers[progressKey(ctx.lessonId, block.id || index)];
      if (!ans || (ans.attempts || 0) === 0) return false;
      const s = block.settings || {};
      // 'passed' completionRule or requireCorrectAnswer → must have passed at least once
      if (s.requireCorrectAnswer || s.completionRule === 'passed') return !!(ans.passed);
      return true; // completionRule 'submitted': any attempt completes the block
    }

    // strategy === 'interacted'
    const bp = getBlockProgress(ctx, index);
    switch (block.type) {
      case 'accordion':
      case 'labelled_graphic':
        return (bp.opened || []).length >= itemCount(block, d);
      case 'tabs':
      case 'process':
      case 'carousel':
      case 'quote_carousel':
        return (bp.visited || []).length >= itemCount(block, d);
      case 'flashcard_grid':
      case 'flashcard_stack': {
        const rule = (block.settings || {}).completionRule || 'all_cards';
        const flipped = (bp.flipped || []).length;
        return rule === 'any_card' ? flipped >= 1 : flipped >= itemCount(block, d);
      }
      case 'scenario':
      case 'list_checkbox':
      default:
        return !!bp.completed;
    }
  }

  function markVisited(ctx, index, itemIndex) {
    const bp = getBlockProgress(ctx, index);
    if (!bp.visited) bp.visited = [];
    if (!bp.visited.includes(itemIndex)) bp.visited.push(itemIndex);
  }

  function markOpened(ctx, index, itemIndex) {
    const bp = getBlockProgress(ctx, index);
    if (!bp.opened) bp.opened = [];
    if (!bp.opened.includes(itemIndex)) bp.opened.push(itemIndex);
  }

  function markFlipped(ctx, index, itemIndex) {
    const bp = getBlockProgress(ctx, index);
    if (!bp.flipped) bp.flipped = [];
    if (!bp.flipped.includes(itemIndex)) bp.flipped.push(itemIndex);
  }

  function markCompleted(ctx, index) {
    getBlockProgress(ctx, index).completed = true;
  }

  // Checklist (list_checkbox) per-item learner state. Stored in the same
  // blockProgress record as every other "interacted" strategy — never in
  // block.data, which is authored content and must stay author-only.
  function setChecklistItem(ctx, index, itemIndex, checked) {
    const bp = getBlockProgress(ctx, index);
    if (!bp.checkedItems) bp.checkedItems = [];
    const has = bp.checkedItems.includes(itemIndex);
    if (checked && !has) bp.checkedItems.push(itemIndex);
    else if (!checked && has) bp.checkedItems = bp.checkedItems.filter(i => i !== itemIndex);
  }
  function getChecklistChecked(ctx, index) {
    return getBlockProgress(ctx, index).checkedItems || [];
  }

  function markViewed(ctx, index) {
    getBlockProgress(ctx, index).viewed = true;
  }
  function markWatched(ctx, index) {
    getBlockProgress(ctx, index).watched = true;
  }
  function markPlayed(ctx, index) {
    getBlockProgress(ctx, index).played = true;
  }
  // Records the highest percentage of a video/audio element's duration
  // reached so far (monotonic — never decreases), via real timeupdate
  // events. Used by the 'watched_50/75/100' and 'played_50/75/100' rules.
  function markProgressPercent(ctx, index, field, percent) {
    const bp = getBlockProgress(ctx, index);
    bp[field] = Math.max(bp[field] || 0, Math.min(100, percent));
  }

  /* ============================================================
     COMPLETION RULES — per-type, author-selectable
     ============================================================ */

  // Every valid rule value per block type, in display order. A type with
  // exactly one entry has no real choice — the Design Panel hides its
  // dropdown and the engine always applies that single rule. A type with
  // no entry here cannot be marked Required at all (capability mismatch),
  // even if the author tries — isRequiredForNext() refuses it below.
  const RULE_OPTIONS_BY_TYPE = {
    // 'viewed' family — text/image/callout: only one verifiable signal.
    paragraph: ['viewed'], heading_paragraph: ['viewed'], heading: ['viewed'],
    list_numbered: ['viewed'], list_bullet: ['viewed'],
    quote1: ['viewed'], quote2: ['viewed'], quote3: ['viewed'], quote4: ['viewed'],
    image: ['viewed'], image_text: ['viewed'], text_on_image: ['viewed'],
    quote_image: ['viewed'], file: ['viewed'],
    chart_bar: ['viewed'], chart_line: ['viewed'], chart_pie: ['viewed'],
    stmt_info: ['viewed'], stmt_tip: ['viewed'], stmt_success: ['viewed'],
    stmt_warning: ['viewed'], stmt_error: ['viewed'], stmt_note: ['viewed'],
    // Media with real playback position — percentage thresholds are
    // verifiable via timeupdate for direct/uploaded files. NOTE: for
    // YouTube/Vimeo iframe embeds there is no in-page playback-position
    // signal at all (see isNextRequirementMet) — only 'viewed' (the
    // manual mark-watched affordance) is meaningful for those; the
    // percentage rules are offered in the panel but will not auto-track
    // for embeds, so the manual control always satisfies any rule chosen.
    video: ['viewed', 'watched_50', 'watched_75', 'watched_100'],
    audio: ['played', 'played_50', 'played_75', 'played_100'],
    // Interactive item-list blocks — any vs all.
    accordion: ['any_panel', 'all_panels'],
    tabs: ['any_tab', 'all_tabs'],
    carousel: ['any_slide', 'all_slides'],
    quote_carousel: ['any_slide', 'all_slides'],
    process: ['any_step', 'all_steps'],
    labelled_graphic: ['any_hotspot', 'all_hotspots'],
    flashcard_grid: ['any_card', 'all_cards'],
    flashcard_stack: ['any_card', 'all_cards'],
    list_checkbox: ['interacted'],
    scenario: ['interacted'],
    // Action / assessment.
    continue: ['click'],
    kc_multiple_choice: ['submitted', 'correct'],
    kc_multiple_response: ['submitted', 'correct'],
    kc_matching: ['submitted', 'correct'],
    kc_fill_gap: ['submitted', 'correct'],
    kc_ordering: ['submitted', 'correct'],
  };
  const DEFAULT_RULE_BY_TYPE = {}; // first option is always the default for each type
  Object.keys(RULE_OPTIONS_BY_TYPE).forEach(t => { DEFAULT_RULE_BY_TYPE[t] = RULE_OPTIONS_BY_TYPE[t][0]; });

  function ruleOptionsFor(type) {
    return RULE_OPTIONS_BY_TYPE[type] || [];
  }

  function effectiveRule(block) {
    const options = ruleOptionsFor(block.type);
    const chosen = block.settings && block.settings.completionRuleType;
    return (chosen && options.includes(chosen)) ? chosen : (DEFAULT_RULE_BY_TYPE[block.type] || null);
  }

  /* ============================================================
     NEXT-BUTTON LESSON-WIDE GATE
     A separate, additive system from Continue-block gating above —
     deliberately kept apart so existing Continue-block behaviour
     (which never treated "viewed" blocks as blocking) is unaffected.
     The Next button requires only blocks the AUTHOR has explicitly
     marked "Required for Lesson Completion" (default: Optional —
     see migration note in app.js/lessonBuilder.js for existing projects).
     ============================================================ */

  // Whether this block type CAN ever be marked required (has at least one
  // verifiable rule). Does not check the author's actual toggle — see
  // isRequiredForNext for that.
  function isRequirable(type) {
    return ruleOptionsFor(type).length > 0;
  }

  // Whether this specific block is required for the Next-button gate.
  // Failed Acceptance Criteria Correction Sprint: interactive/assessed
  // content (knowledge checks, accordions, scenarios, etc. — anything
  // BLOCKING_STRATEGIES already treats as completable for Continue-block
  // gating) is REQUIRED BY DEFAULT — an author has to explicitly opt OUT
  // (`completionRequired: false`) to let the Next button skip it. This is
  // the single source of truth the Next button, the assessment-launch
  // gate, and the learner sidebar all read from; "no required block left
  // incomplete" is the one rule, checked in one place, regardless of
  // entry point. Purely 'viewed' content (paragraphs, images, statements)
  // stays optional by default, as before — an author has to opt IN
  // (`completionRequired: true`) for a viewed block to gate Next, since
  // requiring every paragraph to be "viewed" by default would make nearly
  // all existing lesson content block progression.
  function isRequiredForNext(block) {
    if (!block || !isRequirable(block.type)) return false;
    const explicit = block.settings && block.settings.completionRequired;
    if (explicit === true) return true;
    if (explicit === false) return false;
    const cap = BlockCapabilities.COMPLETION[block.type];
    return !!(cap && BLOCKING_STRATEGIES.includes(cap.strategy));
  }

  function itemRuleCount(rule, opened, all) {
    return rule && rule.startsWith('any') ? Math.min(1, opened.length) >= 1 : opened.length >= all;
  }

  // Whether a single required block (excluding 'continue', handled by the
  // caller since it needs the per-lesson "revealed" set from
  // learnerPreview.js's LearnerUI) currently satisfies its selected rule.
  function isNextRequirementMet(block, index, ctx) {
    const cap = BlockCapabilities.COMPLETION[block.type];
    if (!cap) return true;
    const rule = effectiveRule(block);
    const bp = getBlockProgress(ctx, index);
    const d = block.data || {};

    if (block.type === 'video') {
      if (rule === 'viewed') return !!bp.watched;
      const pct = { watched_50: 50, watched_75: 75, watched_100: 100 }[rule] || 100;
      return (bp.watchedPercent || 0) >= pct || !!bp.watched; // manual mark-watched always satisfies, per embed limitation noted above
    }
    if (block.type === 'audio') {
      if (rule === 'played') return !!bp.played;
      const pct = { played_50: 50, played_75: 75, played_100: 100 }[rule] || 100;
      return (bp.playedPercent || 0) >= pct || !!bp.played;
    }
    if (cap.strategy === 'viewed') return !!bp.viewed;

    if (['accordion', 'tabs', 'carousel', 'quote_carousel', 'process', 'labelled_graphic'].includes(block.type)) {
      const list = block.type === 'accordion' || block.type === 'labelled_graphic' ? (bp.opened || []) : (bp.visited || []);
      return itemRuleCount(rule, list, itemCount(block, d));
    }
    if (block.type === 'flashcard_grid' || block.type === 'flashcard_stack') {
      return itemRuleCount(rule, bp.flipped || [], itemCount(block, d));
    }
    if (cap.strategy === 'assessed') {
      // Sprint 2, Phase 1 fix: this used to branch on `rule` (effectiveRule(),
      // backed by block.settings.completionRuleType) — a completely separate
      // field from the one the KC "Assessment Rules" panel actually exposes
      // and writes (requireCorrectAnswer / completionRule === 'passed').
      // Author-visible toggles like "Require Correct Answer to Complete" had
      // zero effect on the Next/Finish-Course button because this check
      // never read them — only isBlockCompleted (the Continue-block gate)
      // did. Both gates now read the same fields, so a single setting
      // change affects both consistently.
      return isBlockCompleted(block, index, ctx);
    }
    return isBlockCompleted(block, index, ctx);
  }

  // Full lesson check. `revealedContinues` is the Set<blockIndex> of
  // continue blocks the learner has clicked in this lesson (caller-owned
  // UI state, e.g. LearnerUI.revealedContinues[lessonId]).
  function isLessonReadyForNext(blocks, ctx, revealedContinues) {
    const revealed = revealedContinues || new Set();
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!isRequiredForNext(block)) continue;
      if (block.type === 'continue') {
        if (!revealed.has(i)) return false;
        continue;
      }
      if (!isNextRequirementMet(block, i, ctx)) return false;
    }
    return true;
  }

  // Whether the Continue block at `index` should be locked (disabled).
  function isContinueLocked(blocks, index, ctx) {
    const d = (blocks[index] && blocks[index].data) || {};
    const mode = d.completionType || 'none';
    if (mode === 'none') return false;

    if (mode === 'directly_above') {
      const prev = blocks[index - 1];
      if (!prev || !isBlockCompletable(prev.type)) return false;
      return !isBlockCompleted(prev, index - 1, ctx);
    }

    if (mode === 'all_above') {
      for (let i = 0; i < index; i++) {
        const b = blocks[i];
        if (!isBlockCompletable(b.type)) continue;
        if (!isBlockCompleted(b, i, ctx)) return true;
      }
      return false;
    }

    return false;
  }

  return {
    isBlockCompletable,
    isBlockCompleted,
    isContinueLocked,
    markVisited,
    markOpened,
    markFlipped,
    markCompleted,
    setChecklistItem,
    getChecklistChecked,
    markViewed,
    markWatched,
    markPlayed,
    markProgressPercent,
    isRequiredForNext,
    isNextRequirementMet,
    isLessonReadyForNext,
    isRequirable,
    ruleOptionsFor,
    effectiveRule,
  };
})();
