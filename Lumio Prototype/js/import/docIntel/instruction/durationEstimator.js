/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Duration Estimator
   Phase 4: Instructional Intelligence

   Estimates the total learner time and per-lesson duration for
   the course material encoded in the CanonicalKnowledgeModel.

   Formula:
     Reading time:     wordCount / 130 words-per-minute
     Practice time:    procedureCount × 3 minutes
     Assessment time:  (questionCount + checklistCount) × 1.5 minutes
     Total:            reading + practice + assessment (min 5 min)
     Per-lesson:       total / lessonCount (min 5 min)

   All totals are rounded up to the nearest 5-minute increment.

   Output: { totalMinutes, perLessonMinutes, breakdown, confidence, rationale }

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelDurationEstimator = (() => {

  const T  = DocIntelObjectTypes.TYPES;
  const RT = DocIntelRationale.TYPES;

  // ── Constants ─────────────────────────────────────────────────────────────

  const WORDS_PER_MINUTE          = 130;  // average e-learning reading rate
  const MINUTES_PER_PROCEDURE     = 3;    // reading + hands-on practice per procedure
  const MINUTES_PER_ASSESS_ITEM   = 1.5;  // per knowledge-check or checklist
  const ROUND_INCREMENT           = 5;    // round all outputs up to nearest 5 min
  const MIN_DURATION_MINUTES      = 5;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _roundUp(minutes) {
    return Math.max(MIN_DURATION_MINUTES, Math.ceil(minutes / ROUND_INCREMENT) * ROUND_INCREMENT);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Estimates learner duration from the CKM, analysis, and lesson count.
   *
   * @param {CanonicalKnowledgeModel} ckm
   * @param {AnalysisResult}          analysis
   * @param {number}                  lessonCount  Number of lessons (from topic groups)
   * @returns {{ totalMinutes: number, perLessonMinutes: number, breakdown: object, confidence: Confidence, rationale: DecisionRationale }}
   */
  function estimate(ckm, analysis, lessonCount) {
    const wordCount       = ckm.metadata.estimatedWordCount || 0;
    const profile         = analysis.contentProfile;
    const procedureCount  = profile[T.PROCEDURE]  || 0;
    const questionCount   = (profile[T.QUESTION]  || 0) + (profile[T.CHECKLIST] || 0);

    const readingMinutes    = wordCount   / WORDS_PER_MINUTE;
    const practiceMinutes   = procedureCount * MINUTES_PER_PROCEDURE;
    const assessmentMinutes = questionCount  * MINUTES_PER_ASSESS_ITEM;
    const rawTotal          = readingMinutes + practiceMinutes + assessmentMinutes;

    const totalMinutes    = _roundUp(rawTotal);
    const lCount          = Math.max(1, lessonCount || analysis.topicGroups.length || 1);
    const perLessonMinutes = _roundUp(totalMinutes / lCount);

    const breakdown = Object.freeze({
      readingMinutes:    Math.round(readingMinutes),
      practiceMinutes:   Math.round(practiceMinutes),
      assessmentMinutes: Math.round(assessmentMinutes),
    });

    // Confidence is higher when word count is available (better reading-time basis)
    const confidence = DocIntelModels.createConfidence(
      wordCount > 0 ? 0.68 : 0.38,
      wordCount > 0 ? 'word-count-basis' : 'no-word-count-structure-only',
    );

    const signals = [];
    if (wordCount)       signals.push(`${wordCount} words → ~${Math.round(readingMinutes)} min reading`);
    if (procedureCount)  signals.push(`${procedureCount} procedure(s) → ~${Math.round(practiceMinutes)} min practice`);
    if (questionCount)   signals.push(`${questionCount} assessment item(s) → ~${Math.round(assessmentMinutes)} min`);

    const rationale = DocIntelRationale.create(
      RT.DURATION,
      `Total duration estimated at ${totalMinutes} min (${perLessonMinutes} min per lesson across ${lCount} lesson(s)). ` +
      (signals.length ? signals.join('. ') + '.' : 'Estimation based on document structure only.'),
      signals,
      [],
    );

    return { totalMinutes, perLessonMinutes, breakdown, confidence, rationale };
  }

  return Object.freeze({ estimate });

})();
