/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Rationale
   Phase 1: Shared Infrastructure

   DecisionRationale construction utilities and decision type constants.
   Every decision produced by Instructional Intelligence carries a
   DecisionRationale that explains WHY the decision was made.

   Rationale is distinct from Confidence:
     Confidence answers "how certain is the engine?"
     Rationale  answers "why did the engine decide this?"

   Rationale is always written in the language an instructional
   designer would use to justify a design choice. It references
   knowledge object types and structural signals, not internal IDs.

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelRationale = (() => {

  // ── Decision type constants ────────────────────────────────────────────────
  //
  // Every DecisionRationale carries exactly one decisionType.
  // This enum covers all decisions produced by Phase 2 sub-components.

  const TYPES = Object.freeze({
    LESSON_BOUNDARY:  'lesson-boundary',   // Why this content was grouped as a lesson
    LESSON_SEQUENCE:  'lesson-sequence',   // Why this lesson appears in this position
    OBJECTIVE:        'objective',         // Why this learning objective was derived
    BLOCK:            'block',             // Why this Lumio block type was recommended
    ASSESSMENT:       'assessment',        // Why an assessment was suggested here
    AUDIENCE:         'audience',          // Why this audience profile was inferred
    DOMAIN:           'domain',            // Why this domain classification was chosen
    DURATION:         'duration',          // Why this duration estimate was produced
  });

  const VALID_TYPES = new Set(Object.values(TYPES));

  // ── Construction ──────────────────────────────────────────────────────────

  /**
   * Creates a DecisionRationale.
   *
   * @param {string}   decisionType           One of the TYPES constants above
   * @param {string}   text                   Human-readable explanation in instructional design language.
   *                                          Must name the signals observed and why they led to this decision.
   * @param {string[]} signals                List of knowledge object types or structural patterns observed
   *                                          (e.g. ['Procedure', 'Warning', 'H2 heading boundary'])
   * @param {string[]} knowledgeObjectIds     IDs of the knowledge objects that triggered this decision
   * @param {string[]} [alternativesConsidered=[]]
   *                                          Alternatives the engine evaluated and rejected.
   *                                          Each entry should be a short phrase naming the alternative
   *                                          and why it was rejected (e.g. 'Tabs block — insufficient
   *                                          side-by-side comparison structure detected').
   * @returns {DecisionRationale}
   */
  function create(decisionType, text, signals, knowledgeObjectIds, alternativesConsidered = []) {
    if (!VALID_TYPES.has(decisionType))
      throw new Error(`DocIntelRationale: unknown decision type "${decisionType}". Valid types: ${[...VALID_TYPES].join(', ')}`);
    if (!text || typeof text !== 'string' || text.trim() === '')
      throw new Error(`DocIntelRationale: rationale text must be a non-empty string`);

    return {
      decisionType,
      text:                   text.trim(),
      signals:                Array.isArray(signals)                ? [...signals]                : [],
      knowledgeObjectIds:     Array.isArray(knowledgeObjectIds)     ? [...knowledgeObjectIds]     : [],
      alternativesConsidered: Array.isArray(alternativesConsidered) ? [...alternativesConsidered] : [],
    };
  }

  /**
   * Creates a rationale that records a fallback decision — used when confidence
   * was below threshold and a simpler alternative was applied.
   *
   * @param {string}   decisionType
   * @param {string}   appliedFallback     Name of the fallback that was used
   * @param {string}   originalCandidate   What the engine would have chosen at higher confidence
   * @param {number}   score               The confidence score that triggered the fallback
   * @param {string[]} knowledgeObjectIds
   * @returns {DecisionRationale}
   */
  function createFallback(decisionType, appliedFallback, originalCandidate, score, knowledgeObjectIds) {
    const text = `Confidence below threshold (${Math.round(score * 100)}%). ` +
      `Fell back to "${appliedFallback}". ` +
      `Original candidate "${originalCandidate}" was not used due to insufficient signal strength.`;
    return create(
      decisionType,
      text,
      ['confidence-fallback'],
      knowledgeObjectIds,
      [`${originalCandidate} — confidence ${Math.round(score * 100)}% below threshold`],
    );
  }

  /**
   * Formats a DecisionRationale as a single human-readable string for debugging.
   * @param {DecisionRationale} rationale
   * @returns {string}
   */
  function format(rationale) {
    if (!rationale) return '[no rationale]';
    const signals = rationale.signals && rationale.signals.length
      ? ` Signals: ${rationale.signals.join(', ')}.`
      : '';
    return `[${rationale.decisionType}] ${rationale.text}${signals}`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({
    TYPES,
    create,
    createFallback,
    format,
  });

})();
