/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Difficulty Estimator
   Phase 4: Instructional Intelligence

   Estimates the instructional difficulty level of the course
   material encoded in the CanonicalKnowledgeModel.

   Difficulty is scored 0–1 from weighted complexity signals:

     Procedures  (weight 35%) — hands-on procedural complexity
     Rules       (weight 25%) — compliance/policy burden
     Warnings    (weight 15%) — safety/critical-consequence load
     Step density(weight 15%) — average steps per procedure
     Concept density (weight 10%) — ratio of definitional content

   Bands:
     < 0.40  → "foundational"
     0.40–0.70 → "intermediate"
     ≥ 0.70  → "advanced"

   Output: { level, score, confidence, rationale }

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelDifficultyEstimator = (() => {

  const T  = DocIntelObjectTypes.TYPES;
  const RT = DocIntelRationale.TYPES;

  // ── Band thresholds ───────────────────────────────────────────────────────

  const BANDS = Object.freeze({
    foundational: 0.40,   // score < BANDS.foundational
    intermediate:  0.70,  // score < BANDS.intermediate
    // advanced: score >= BANDS.intermediate
  });

  function _levelFromScore(score) {
    if (score < BANDS.foundational) return 'foundational';
    if (score < BANDS.intermediate)  return 'intermediate';
    return 'advanced';
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Estimates instructional difficulty from the CKM and AnalysisResult.
   *
   * @param {CanonicalKnowledgeModel} ckm
   * @param {AnalysisResult}          analysis
   * @returns {{ level: string, score: number, confidence: Confidence, rationale: DecisionRationale }}
   */
  function estimate(ckm, analysis) {
    const profile = analysis.contentProfile;

    const procedureCount  = profile[T.PROCEDURE]  || 0;
    const ruleCount       = profile[T.RULE]        || 0;
    const warningCount    = profile[T.WARNING]     || 0;
    const stepCount       = profile[T.STEP]        || 0;
    const definitionCount = profile[T.DEFINITION]  || 0;
    const conceptCount    = profile[T.CONCEPT]     || 0;
    const totalKOs        = Math.max(1, ckm.objects.length);

    // Each signal normalised to 0–1 before applying weight
    const procedureSignal  = Math.min(1, procedureCount / 6);    // saturates at 6 procedures
    const ruleSignal       = Math.min(1, ruleCount / 10);        // saturates at 10 rules
    const warningSignal    = Math.min(1, warningCount / 6);      // saturates at 6 warnings
    const stepDensity      = procedureCount > 0
      ? Math.min(1, stepCount / (procedureCount * 5))            // avg steps / expected max (5 per proc)
      : 0;
    const conceptDensity   = Math.min(1, (definitionCount + conceptCount) / (totalKOs * 0.5));

    const rawScore = (procedureSignal  * 0.35) +
                     (ruleSignal       * 0.25) +
                     (warningSignal    * 0.15) +
                     (stepDensity      * 0.15) +
                     (conceptDensity   * 0.10);

    const score = DocIntelConfidence.clamp(rawScore);
    const level = _levelFromScore(score);

    // Signals for rationale
    const signals = [];
    if (procedureCount)  signals.push(`${procedureCount} procedure(s)`);
    if (ruleCount)       signals.push(`${ruleCount} rule(s)`);
    if (warningCount)    signals.push(`${warningCount} warning(s)`);
    if (stepCount)       signals.push(`${stepCount} step(s)`);
    if (definitionCount + conceptCount) signals.push(`${definitionCount + conceptCount} definitional KO(s)`);

    const confidence = DocIntelModels.createConfidence(
      DocIntelConfidence.fromSignalRatio(signals.length, 5, 1.0),
      signals.length
        ? `${signals.length} complexity signal(s) present`
        : 'no-complexity-signals-detected',
    );

    const rationale = DocIntelRationale.create(
      RT.DOMAIN,
      `Difficulty estimated as "${level}" (score ${Math.round(score * 100)}%). ` +
      (signals.length ? `Complexity signals: ${signals.join(', ')}.` : 'No complexity signals — defaulting to foundational.'),
      signals,
      [],
    );

    return { level, score, confidence, rationale };
  }

  return Object.freeze({ estimate });

})();
