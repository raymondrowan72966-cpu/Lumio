/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Instructional Intelligence Entry Point
   Phase 4: Instructional Intelligence

   Public entry point for the Instructional Intelligence Engine.
   Transforms a CanonicalKnowledgeModel into an InstructionalModel.

   Usage:
     const instructionalModel = DocIntelInstruction.analyse(ckm);

   The returned InstructionalModel contains:
     - subject:     title candidate, domain, summary
     - audience:    role, prior knowledge, motivation
     - objectives:  one per lesson group (Bloom's verb + text)
     - lessons:     one per section (block suggestions, KO IDs, duration)
     - assessments: one per lesson with assessable content
     - duration:    total and per-lesson time estimates
     - overallConfidence: mean confidence across all decisions

   This module delegates all reasoning to the sub-components.
   It exposes no internals — only the analyse() entry point.

   Dependencies (global IIFE modules):
     - DocIntelModels           (models.js)
     - DocIntelConfidence       (confidence.js)
     - DocIntelRationale        (rationale.js)
     - DocIntelTraceability     (traceability.js)
     - DocIntelObjectTypes      (knowledge/objectTypes.js)
     - DocIntelAnalyser         (instruction/analyser.js)
     - DocIntelObjectiveSynthesiser (instruction/objectiveSynthesiser.js)
     - DocIntelPrerequisiteAnalyser (instruction/prerequisiteAnalyser.js)
     - DocIntelDifficultyEstimator  (instruction/difficultyEstimator.js)
     - DocIntelDurationEstimator    (instruction/durationEstimator.js)
     - DocIntelBlockRecommender     (instruction/blockRecommender.js)
     - DocIntelInstructionModelBuilder (instruction/modelBuilder.js)

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelInstruction = (() => {

  /**
   * Transforms a CanonicalKnowledgeModel into an InstructionalModel.
   *
   * @param {CanonicalKnowledgeModel} ckm  Output of the Knowledge Modeller
   * @returns {InstructionalModel}
   * @throws {Error} if ckm is invalid
   */
  function analyse(ckm) {
    return DocIntelInstructionModelBuilder.build(ckm);
  }

  return Object.freeze({ analyse });

})();
