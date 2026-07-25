/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Block Recommender
   Phase 4: Instructional Intelligence

   Maps each KnowledgeObjectType to an appropriate Lumio block type,
   producing BlockSuggestion objects that are consumed by the
   ContentSeeder in Phase 9.

   Block types used here are the canonical identifiers from
   js/blocks/families.js — verified against the live Lumio codebase:

     paragraph, heading_paragraph, list_numbered, list_checkbox
     table, image, accordion
     stmt_info, stmt_note, stmt_warning
     flashcard_stack
     kc_multiple_choice

   Structural types (HEADING, STEP) do not generate standalone blocks
   and return null from recommend().

   Output per KO: BlockSuggestion | null
   All decisions carry source, confidence, and rationale.

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelBlockRecommender = (() => {

  const T  = DocIntelObjectTypes.TYPES;
  const RT = DocIntelRationale.TYPES;

  // ── Block type mapping ────────────────────────────────────────────────────
  // Each entry: { blockType: string, confidence: number }
  // null → structural KO; no standalone block generated

  const BLOCK_MAP = Object.freeze({
    [T.TOPIC]:      { blockType: 'paragraph',          confidence: 0.82 },
    [T.CONCEPT]:    { blockType: 'heading_paragraph',  confidence: 0.78 },
    [T.DEFINITION]: { blockType: 'flashcard_stack',    confidence: 0.84 },
    [T.RULE]:       { blockType: 'stmt_info',          confidence: 0.80 },
    [T.PROCEDURE]:  { blockType: 'process',            confidence: 0.88 },
    [T.STEP]:       null,   // Embedded inside Procedure — no standalone block
    [T.WARNING]:    { blockType: 'stmt_warning',       confidence: 0.90 },
    [T.EXAMPLE]:    { blockType: 'stmt_tip',           confidence: 0.78 },
    [T.REFERENCE]:  { blockType: 'stmt_note',          confidence: 0.75 },
    [T.TABLE]:      { blockType: 'table',              confidence: 0.93 },
    [T.IMAGE]:      { blockType: 'image',              confidence: 0.95 },
    [T.QUESTION]:   { blockType: 'kc_multiple_choice', confidence: 0.80 },
    [T.CHECKLIST]:  { blockType: 'list_checkbox',      confidence: 0.87 },
    [T.NOTE]:       { blockType: 'stmt_note',          confidence: 0.88 },
    [T.SUMMARY]:    { blockType: 'list_bullet',        confidence: 0.80 },
    [T.HEADING]:    null,   // Structural only — no content block
  });

  // ── Block recommendation rationale ────────────────────────────────────────

  const RATIONALE_TEXT = Object.freeze({
    [T.TOPIC]:      'Narrative prose maps to a paragraph block to preserve reading flow.',
    [T.CONCEPT]:    'Concept content maps to heading_paragraph to pair the concept name with its explanation.',
    [T.DEFINITION]: 'Definition content maps to flashcard_stack to reinforce term-meaning pairs through active recall.',
    [T.RULE]:       'Rule content maps to stmt_info to draw attention to mandatory behaviour with a clear visual affordance.',
    [T.PROCEDURE]:  'Sequential procedure maps to process block to guide learners through steps interactively, supporting engagement and retention.',
    [T.WARNING]:    'Warning content maps to stmt_warning to maximise learner attention to safety-critical information.',
    [T.EXAMPLE]:    'Example content maps to stmt_tip to highlight practical examples with a distinct visual affordance that draws learner attention.',
    [T.REFERENCE]:  'Reference content maps to stmt_note as a supplementary informational aside, visually distinct from core instructional content.',
    [T.TABLE]:      'Table content maps directly to a table block, preserving the row-column comparison structure.',
    [T.IMAGE]:      'Image content maps directly to an image block.',
    [T.QUESTION]:   'Question content maps to kc_multiple_choice as the most common knowledge-verification format.',
    [T.CHECKLIST]:  'Checklist content maps to list_checkbox to enable interactive self-verification by the learner.',
    [T.NOTE]:       'Note content maps to stmt_note as a supplementary informational aside.',
    [T.SUMMARY]:    'Summary content maps to list_bullet to present key takeaways as scannable points, reducing cognitive load at lesson close.',
  });

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Recommends a Lumio block for a single KnowledgeObject.
   * Returns null for HEADING and STEP types — structural KOs do not
   * generate standalone learner-facing blocks.
   *
   * @param {KnowledgeObject} ko
   * @param {number}          objectiveIndex  Index into InstructionalModel.objectives[]
   * @returns {BlockSuggestion|null}
   */
  function recommend(ko, objectiveIndex) {
    const mapping = BLOCK_MAP[ko.type];
    if (!mapping) return null;

    const source     = DocIntelTraceability.propagate(ko.source);
    const confidence = DocIntelModels.createConfidence(
      mapping.confidence,
      `type-mapping: ${ko.type} → ${mapping.blockType}`,
    );
    const rationale = DocIntelRationale.create(
      RT.BLOCK,
      RATIONALE_TEXT[ko.type] || `${ko.type} mapped to ${mapping.blockType}.`,
      [ko.type, `→ ${mapping.blockType}`],
      [ko.id],
    );

    return DocIntelModels.createBlockSuggestion(
      mapping.blockType,
      ko.content,
      ko.id,
      objectiveIndex,
      source,
      confidence,
      rationale,
    );
  }

  /**
   * Recommends blocks for an array of KnowledgeObjects.
   * Null results (HEADING, STEP) are excluded from the output.
   *
   * @param {KnowledgeObject[]} kos
   * @param {number}            objectiveIndex
   * @returns {BlockSuggestion[]}
   */
  function recommendAll(kos, objectiveIndex) {
    const suggestions = [];
    for (const ko of kos) {
      const s = recommend(ko, objectiveIndex);
      if (s) suggestions.push(s);
    }
    return suggestions;
  }

  return Object.freeze({ recommend, recommendAll });

})();
