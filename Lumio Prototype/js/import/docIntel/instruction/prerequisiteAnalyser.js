/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Prerequisite Analyser
   Phase 4: Instructional Intelligence

   Analyses the CanonicalKnowledgeModel to infer prior knowledge
   requirements for the audience profile.

   Two signals are used:
     1. Early definitions — Definitions and Concepts appearing in
        the first 30% of the KO list are treated as foundational
        vocabulary the document assumes the learner may need.
     2. Explicit prior-knowledge language — phrases like
        "as you know", "building on", "familiarity with" in
        any KO's text content.

   Output: { prerequisites, priorKnowledgeStatement, confidence, rationale, sourceKoIds }

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelPrerequisiteAnalyser = (() => {

  const T  = DocIntelObjectTypes.TYPES;
  const RT = DocIntelRationale.TYPES;

  // Text patterns that explicitly signal assumed prior knowledge
  const PRIOR_LANG_RE = /(?:as you (?:know|should know|may know|already know)|building on (?:your|the)|prior to this|with an understanding of|familiarity with|previous experience|it is assumed|prerequisite|before (?:starting|beginning|taking) this)/i;

  // MAX prerequisite terms to surface (avoids overwhelming the audience profile)
  const MAX_PREREQUISITES = 5;

  // ── Term extraction ───────────────────────────────────────────────────────
  // Attempts to pull the defined term from a Definition KO's content string.
  // Handles patterns like: "X is a...", "X refers to...", "X: definition..."

  function _extractTerm(content) {
    if (typeof content !== 'string') return null;
    const m = content.match(/^([^,.:;(]{1,60}?)\s+(?:is|are|refers?\s+to|means?|(?:is|are)\s+defined\s+as)\s/i);
    if (m) return m[1].trim();
    // Colon-style: "Term: explanation"
    const c = content.match(/^([A-Z][^:]{1,40}):\s/);
    if (c && c[1].split(/\s+/).length <= 5) return c[1].trim();
    return null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Analyses the CKM for prerequisite knowledge signals.
   *
   * @param {CanonicalKnowledgeModel} ckm
   * @param {AnalysisResult}          analysis
   * @returns {{ prerequisites: string[], priorKnowledgeStatement: string, confidence: Confidence, rationale: DecisionRationale, sourceKoIds: string[] }}
   */
  function analyse(ckm, analysis) {
    const threshold = Math.ceil(ckm.objects.length * 0.30);
    const earlyKOs  = ckm.objects.slice(0, threshold);

    // Signal 1: early definitions — candidate prerequisite vocabulary
    const prerequisites = [];
    for (const ko of earlyKOs) {
      if (ko.type !== T.DEFINITION && ko.type !== T.CONCEPT) continue;
      const term = _extractTerm(typeof ko.content === 'string' ? ko.content : '');
      if (term && term.length > 2) prerequisites.push(term);
      if (prerequisites.length >= MAX_PREREQUISITES) break;
    }

    // Signal 2: explicit prior-knowledge language
    const priorLangIds = [];
    for (const ko of ckm.objects) {
      if (typeof ko.content === 'string' && PRIOR_LANG_RE.test(ko.content)) {
        priorLangIds.push(ko.id);
      }
    }
    const hasExplicitPrior = priorLangIds.length > 0;

    // Build the statement
    let priorKnowledgeStatement;
    if (prerequisites.length && hasExplicitPrior) {
      priorKnowledgeStatement = `Familiarity with: ${prerequisites.join(', ')}. Explicit prior-knowledge references detected.`;
    } else if (prerequisites.length) {
      priorKnowledgeStatement = `Familiarity with: ${prerequisites.join(', ')}`;
    } else if (hasExplicitPrior) {
      priorKnowledgeStatement = 'Prior knowledge assumed — explicit references detected in document content';
    } else {
      priorKnowledgeStatement = 'No specific prerequisites identified';
    }

    const signalCount = (prerequisites.length > 0 ? 1 : 0) + (hasExplicitPrior ? 1 : 0);
    const confidence  = DocIntelModels.createConfidence(
      DocIntelConfidence.fromSignalRatio(signalCount, 2, 1.0),
      signalCount > 0 ? `${signalCount} prerequisite signal(s) detected` : 'no-prerequisite-signals',
    );

    const rationale = DocIntelRationale.create(
      RT.AUDIENCE,
      priorKnowledgeStatement,
      [
        prerequisites.length ? 'early-definition-terms' : 'no-early-definitions',
        hasExplicitPrior     ? 'explicit-prior-language' : 'no-prior-language',
      ],
      priorLangIds.slice(0, 3),
    );

    return { prerequisites, priorKnowledgeStatement, confidence, rationale, sourceKoIds: priorLangIds };
  }

  return Object.freeze({ analyse });

})();
