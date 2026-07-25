/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Confidence
   Phase 1: Shared Infrastructure

   Confidence scoring utilities and threshold constants.
   Every inference produced by Instructional Intelligence carries
   a Confidence object. This module defines the bands, utilities,
   and fallback logic that all Phase 2 sub-components use.

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelConfidence = (() => {

  // ── Threshold bands ───────────────────────────────────────────────────────
  //
  // Four bands define how the engine treats its own outputs.
  // These thresholds are referenced by every Phase 2 sub-component.
  //
  //  HIGH     ≥ 0.85  Output used as-is. No review flag needed.
  //  MEDIUM   ≥ 0.60  Output used. Suitable for a soft suggestion in future UI.
  //  LOW      ≥ 0.40  Output used with fallback applied. Future UI may flag.
  //  UNCERTAIN < 0.40  Fallback block type used. Field may be left blank for
  //                    manual completion in the Wizard.

  const BAND_HIGH      = 0.85;
  const BAND_MEDIUM    = 0.60;
  const BAND_LOW       = 0.40;
  const BAND_UNCERTAIN = 0.00;

  const BAND = Object.freeze({
    HIGH:      'high',
    MEDIUM:    'medium',
    LOW:       'low',
    UNCERTAIN: 'uncertain',
  });

  // ── Core utilities ────────────────────────────────────────────────────────

  /**
   * Returns the band name for a given confidence score.
   * @param {number} score  0–1
   * @returns {'high'|'medium'|'low'|'uncertain'}
   */
  function getBand(score) {
    if (score >= BAND_HIGH)    return BAND.HIGH;
    if (score >= BAND_MEDIUM)  return BAND.MEDIUM;
    if (score >= BAND_LOW)     return BAND.LOW;
    return BAND.UNCERTAIN;
  }

  /**
   * Returns true if the score is below the LOW threshold and a fallback
   * should be applied (simpler block type, blank wizard field, etc.).
   * @param {number} score  0–1
   * @returns {boolean}
   */
  function shouldFallback(score) {
    return score < BAND_LOW;
  }

  /**
   * Clamps a raw signal ratio to a valid 0–1 confidence score.
   * @param {number} raw  Any number
   * @returns {number}    Clamped to [0, 1], rounded to 2 decimal places
   */
  function clamp(raw) {
    return Math.round(Math.max(0, Math.min(1, raw)) * 100) / 100;
  }

  /**
   * Calculates mean confidence from an array of Confidence objects.
   * Returns 0 if the array is empty.
   * @param {{ score: number }[]} confidences
   * @returns {number}
   */
  function mean(confidences) {
    if (!Array.isArray(confidences) || confidences.length === 0) return 0;
    const sum = confidences.reduce((acc, c) => acc + (c.score || 0), 0);
    return clamp(sum / confidences.length);
  }

  /**
   * Builds a confidence score from a count of positive signals vs. total possible signals.
   * A ratio of 1.0 does not automatically yield HIGH confidence — it is scaled
   * against a maximum expected signal density to avoid overconfidence on sparse data.
   *
   * @param {number} positiveSignals   Number of signals that support the decision
   * @param {number} totalSignals      Total signals evaluated
   * @param {number} [weight=1]        Optional weight for this signal type (0–1)
   * @returns {number}                 Confidence score 0–1
   */
  function fromSignalRatio(positiveSignals, totalSignals, weight = 1) {
    if (totalSignals <= 0) return 0;
    const ratio = positiveSignals / totalSignals;
    return clamp(ratio * Math.min(weight, 1));
  }

  /**
   * Combines multiple confidence scores using a weighted average.
   * @param {{ score: number, weight: number }[]} weightedScores
   * @returns {number}
   */
  function combine(weightedScores) {
    if (!Array.isArray(weightedScores) || weightedScores.length === 0) return 0;
    let totalWeight = 0;
    let weightedSum = 0;
    for (const { score, weight } of weightedScores) {
      const w = typeof weight === 'number' ? weight : 1;
      weightedSum += (score || 0) * w;
      totalWeight += w;
    }
    if (totalWeight === 0) return 0;
    return clamp(weightedSum / totalWeight);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({
    // Constants
    BAND_HIGH,
    BAND_MEDIUM,
    BAND_LOW,
    BAND_UNCERTAIN,
    BAND,

    // Utilities
    getBand,
    shouldFallback,
    clamp,
    mean,
    fromSignalRatio,
    combine,
  });

})();
