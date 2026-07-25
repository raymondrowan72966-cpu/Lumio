/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Lesson Composer
   Phase 11: Learning Experience Composition

   Post-processes BlockSuggestion arrays from the Phase 4
   BlockRecommender to compose multi-block instructional
   sequences for each lesson.

   Rather than mapping 1 KO → 1 block (blockRecommender),
   the composer asks "How should this concept be taught?"
   and expands high-value block types into pedagogically richer
   sequences:

     PROCEDURE:  stmt_info context preamble → process steps
     DEFINITION: heading_paragraph exposition → flashcard_stack recall
     LESSON:     closing kc_multiple_choice when assessable content present

   Adjacent-duplicate guards prevent double preambles:
   - stmt_info preamble is skipped when the preceding block is
     already a stmt_info (i.e. a RULE KO serves as the preamble)
   - heading_paragraph is skipped when the preceding block is
     already heading_paragraph

   All synthesized context blocks inherit the source KO's
   traceability fields and carry a lower confidence score (0.70–0.75)
   to distinguish them from KO-mapped blocks.

   The lesson-closing KC is injected only when ALL of these hold:
     • composed block count >= 3
     • at least one assessable block type is present
       (process, stmt_info, stmt_warning, flashcard_stack)
     • no kc_multiple_choice is already in the lesson

   Dependencies (global IIFE modules, loaded before this file):
     - DocIntelModels       (models.js)
     - DocIntelTraceability (traceability.js)
     - DocIntelRationale    (rationale.js)

   No imports from any existing Lumio subsystem.
   No UI. No side effects beyond transforming suggestion arrays.
   ============================================================ */

const DocIntelLessonComposer = (() => {

  const RT = DocIntelRationale.TYPES;

  // ── Block types that carry assessable instructional weight ────────────────
  // A lesson must contain at least one of these for a closing KC to be added.

  const ASSESSABLE_BLOCK_TYPES = Object.freeze(new Set([
    'process', 'stmt_info', 'stmt_warning', 'flashcard_stack',
  ]));

  // ── Synthesized-block factory ─────────────────────────────────────────────
  // Creates a companion BlockSuggestion that extends a source suggestion.
  // Inherits source, knowledgeObjectId, and objectiveIndex from the parent.
  // Lower confidence (0.72) marks the block as composed, not KO-derived.

  function _makeSynthesized(blockType, content, sourceSuggestion, rationaleText) {
    const confidence = DocIntelModels.createConfidence(
      0.72,
      `composition: ${sourceSuggestion.blockType} → added ${blockType}`,
    );
    const rationale = DocIntelRationale.create(
      RT.BLOCK,
      rationaleText,
      ['composition', blockType, `← ${sourceSuggestion.blockType}`],
      [sourceSuggestion.knowledgeObjectId],
    );
    return DocIntelModels.createBlockSuggestion(
      blockType,
      content,
      sourceSuggestion.knowledgeObjectId,
      sourceSuggestion.objectiveIndex,
      sourceSuggestion.source,
      confidence,
      rationale,
    );
  }

  // ── Procedure composition ─────────────────────────────────────────────────
  // PROCEDURE → [stmt_info (why/context), process (how/steps)]
  // Skips the preamble if the preceding block is already stmt_info to avoid
  // duplicating context when a RULE KO immediately precedes the procedure.

  function _expandProcess(suggestion, lessonTitle, expandedSoFar) {
    const prev = expandedSoFar.length > 0 ? expandedSoFar[expandedSoFar.length - 1] : null;
    if (prev && prev.blockType === 'stmt_info') {
      return [suggestion]; // RULE already provides the context preamble
    }

    const c = suggestion.content;
    const title = (c && typeof c === 'object' && typeof c.title === 'string')
      ? c.title.trim()
      : '';

    const preambleText = title
      ? `Follow these steps to ${title.toLowerCase()}.`
      : lessonTitle
        ? `Follow these steps to complete: ${lessonTitle}`
        : 'Follow these steps carefully.';

    const preamble = _makeSynthesized(
      'stmt_info',
      preambleText,
      suggestion,
      'A procedure preamble establishes context before the step-by-step sequence, helping learners understand what they will achieve by completing the steps.',
    );

    return [preamble, suggestion];
  }

  // ── Definition composition ────────────────────────────────────────────────
  // DEFINITION → [heading_paragraph (exposition), flashcard_stack (recall)]
  // Gives the learner a reading-mode exposure to the definition before the
  // active-recall flashcard. Skips the exposition block when the preceding
  // block is already heading_paragraph.

  function _expandFlashcardStack(suggestion, expandedSoFar) {
    const prev = expandedSoFar.length > 0 ? expandedSoFar[expandedSoFar.length - 1] : null;
    if (prev && prev.blockType === 'heading_paragraph') {
      return [suggestion]; // CONCEPT heading_paragraph already provides exposition
    }

    const expo = _makeSynthesized(
      'heading_paragraph',
      suggestion.content, // same string — _dataHeadingParagraph splits "Term: Definition"
      suggestion,
      'A definition is first presented in reading mode (heading_paragraph) for exposition, then in recall mode (flashcard_stack) so the learner actively retrieves the term and its meaning.',
    );

    return [expo, suggestion];
  }

  // ── Lesson-closing KC ─────────────────────────────────────────────────────
  // Appends a kc_multiple_choice when the lesson has assessable content,
  // at least 3 blocks total, and no existing knowledge check.
  // The question text is derived from the lesson objective or title.

  function _buildClosingKC(composed, lessonTitle, objective) {
    if (composed.length < 3) return null;
    if (!composed.some(s => ASSESSABLE_BLOCK_TYPES.has(s.blockType))) return null;
    if (composed.some(s => s.blockType === 'kc_multiple_choice')) return null;

    const questionText = (objective && typeof objective.text === 'string' && objective.text.trim())
      ? `Which of the following best describes the correct approach to: ${objective.text}?`
      : `Which of the following statements about "${lessonTitle || 'this topic'}" is correct?`;

    // Inherit traceability from the last assessable block in the lesson.
    const anchor = composed.slice().reverse().find(s => ASSESSABLE_BLOCK_TYPES.has(s.blockType));

    const confidence = DocIntelModels.createConfidence(
      0.70,
      'composition: lesson-closing KC — assessable content present, no existing KC',
    );
    const rationale = DocIntelRationale.create(
      RT.BLOCK,
      'A knowledge check is added at lesson close to verify recall of assessable content before the learner progresses to the next lesson.',
      ['composition', 'lesson-closing-KC', 'assessable-content'],
      [anchor.knowledgeObjectId],
    );

    return DocIntelModels.createBlockSuggestion(
      'kc_multiple_choice',
      questionText,
      anchor.knowledgeObjectId,
      anchor.objectiveIndex,
      anchor.source,
      confidence,
      rationale,
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Composes a flat array of BlockSuggestions for a single lesson,
   * expanding KO-mapped suggestions into multi-block instructional
   * sequences where the learning experience warrants it.
   *
   * Non-destructive: the input suggestions array is not mutated.
   *
   * @param {BlockSuggestion[]} suggestions  From DocIntelBlockRecommender.recommendAll()
   * @param {string}            lessonTitle  Section heading text for this lesson
   * @param {{ verb: string, text: string }|null} objective  Lesson objective, or null
   * @returns {BlockSuggestion[]}
   */
  function compose(suggestions, lessonTitle, objective) {
    if (!Array.isArray(suggestions) || suggestions.length === 0) return [];

    const title = typeof lessonTitle === 'string' ? lessonTitle.trim() : '';
    const obj   = (objective && typeof objective.text === 'string') ? objective : null;

    const expanded = [];

    for (const s of suggestions) {
      let sequence;
      switch (s.blockType) {
        case 'process':
          sequence = _expandProcess(s, title, expanded);
          break;
        case 'flashcard_stack':
          sequence = _expandFlashcardStack(s, expanded);
          break;
        default:
          sequence = [s];
      }
      for (const b of sequence) expanded.push(b);
    }

    const closingKC = _buildClosingKC(expanded, title, obj);
    if (closingKC) {
      // A Continue divider before the KC gives learners a natural pause point.
      const continueBlock = _makeSynthesized(
        'continue',
        'Continue',
        closingKC,
        'A Continue divider is added before the knowledge check to give learners a deliberate pause before the assessment.',
      );
      expanded.push(continueBlock);
      expanded.push(closingKC);
    }

    return expanded;
  }

  return Object.freeze({ compose });

})();
