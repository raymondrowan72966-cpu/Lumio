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
  // continues) never gate a Continue block.
  const BLOCKING_STRATEGIES = ['interacted', 'assessed'];

  function isBlockCompletable(type) {
    const cap = BlockCapabilities.COMPLETION[type];
    return !!cap && BLOCKING_STRATEGIES.includes(cap.strategy);
  }

  function progressKey(lessonId, index) {
    return lessonId + ':' + index;
  }

  function getBlockProgress(ctx, index) {
    const progress = ctx.progress;
    if (!progress.blockProgress) progress.blockProgress = {};
    const key = progressKey(ctx.lessonId, index);
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
      const ans = ctx.progress.kcAnswers[progressKey(ctx.lessonId, index)];
      return !!(ans && ans.submitted);
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
      case 'flashcard_stack':
        return (bp.flipped || []).length >= itemCount(block, d);
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
  };
})();
