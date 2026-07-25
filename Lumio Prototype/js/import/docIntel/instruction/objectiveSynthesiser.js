/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Objective Synthesiser
   Phase 4: Instructional Intelligence

   Synthesises learning objectives from a CanonicalKnowledgeModel
   and the AnalysisResult produced by the CKM Analyser.

   One objective is produced per topic group (lesson-level section).
   The Bloom's taxonomy action verb is selected based on the
   dominant KnowledgeObjectType in each group.

   Bloom's verb selection by dominant type:
     PROCEDURE  → "Perform"    (application level)
     RULE       → "Apply"      (application/evaluation)
     WARNING    → "Identify"   (comprehension/analysis)
     DEFINITION → "Define"     (knowledge/comprehension)
     CONCEPT    → "Explain"    (comprehension)
     TABLE      → "Interpret"  (analysis)
     CHECKLIST  → "Complete"   (application)
     QUESTION   → "Recall"     (knowledge)
     EXAMPLE    → "Apply"      (application)
     Default    → "Describe"   (comprehension fallback)

   Output: IMObjective[]

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelObjectiveSynthesiser = (() => {

  const T  = DocIntelObjectTypes.TYPES;
  const RT = DocIntelRationale.TYPES;

  // ── Bloom's verb table ────────────────────────────────────────────────────
  // Keyed by dominant KO type. First verb is always used (determinism).
  // Verb is always in imperative form (as written in a learning objective).

  // All verbs here are drawn exclusively from LumioData.bloomVerbs so that
  // objectives round-trip correctly through the wizard's Bloom's verb selector.
  const BLOOM_VERBS = Object.freeze({
    [T.PROCEDURE]:  'Demonstrate', // Apply level — was 'Perform' (not in bloomVerbs)
    [T.RULE]:       'Identify',    // Remember level — was 'Apply' (not in bloomVerbs)
    [T.WARNING]:    'Identify',    // Remember level ✓
    [T.DEFINITION]: 'Define',      // Remember level ✓
    [T.CONCEPT]:    'Explain',     // Understand level ✓
    [T.TABLE]:      'Compare',     // Analyze level — was 'Interpret' (not in bloomVerbs)
    [T.CHECKLIST]:  'Demonstrate', // Apply level — was 'Complete' (not in bloomVerbs)
    [T.QUESTION]:   'Recall',      // Remember level ✓
    [T.EXAMPLE]:    'Demonstrate', // Apply level — was 'Apply' (not in bloomVerbs)
    [T.SUMMARY]:    'Summarize',   // Understand level — was 'Summarise' (British spelling)
    [T.REFERENCE]:  'Identify',    // Remember level — was 'Locate' (not in bloomVerbs)
    [T.IMAGE]:      'Describe',    // Understand level ✓
    [T.NOTE]:       'Describe',    // Understand level — was 'Recognise' (not in bloomVerbs)
    [T.TOPIC]:      'Describe',    // Understand level ✓
  });

  const DEFAULT_VERB = 'Describe';

  // ── Dominant type detection ───────────────────────────────────────────────
  // Returns the most frequent non-structural KO type in the group.

  function _dominantType(koIds, koIndex) {
    const counts = {};
    for (const id of koIds) {
      const ko = koIndex.get(id);
      if (!ko || ko.type === T.HEADING || ko.type === T.STEP) continue;
      counts[ko.type] = (counts[ko.type] || 0) + 1;
    }
    const entries = Object.entries(counts);
    if (!entries.length) return T.TOPIC;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  // ── Confidence derivation ─────────────────────────────────────────────────

  function _objectiveConfidence(group) {
    // Higher confidence when a clear heading bounds the objective
    if (group.headingId && group.koIds.length >= 3) return 0.78;
    if (group.headingId) return 0.68;
    return 0.50;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Synthesises one IMObjective per topic group.
   *
   * @param {CanonicalKnowledgeModel} ckm
   * @param {AnalysisResult}          analysis
   * @returns {IMObjective[]}
   */
  function synthesise(ckm, analysis) {
    const koIndex = new Map(ckm.objects.map(ko => [ko.id, ko]));

    return analysis.topicGroups.map((group, lessonIndex) => {
      const allKoIds   = group.headingId ? [group.headingId, ...group.koIds] : group.koIds;
      const dominant   = _dominantType(group.koIds, koIndex);
      const verb       = BLOOM_VERBS[dominant] || DEFAULT_VERB;
      const topicText  = group.headingText || `Module ${lessonIndex + 1}`;

      // Objective text is the topic portion only — the verb is stored separately.
      // Together they read: "${verb} ${text}" e.g. "Describe workplace safety training".
      const text = `${topicText.charAt(0).toLowerCase()}${topicText.slice(1)}`;

      const headingKO = group.headingId ? koIndex.get(group.headingId) : null;
      const source    = headingKO
        ? DocIntelTraceability.propagate(headingKO.source)
        : DocIntelTraceability.nullRef();

      const confidence = DocIntelModels.createConfidence(
        _objectiveConfidence(group),
        group.headingId ? 'heading-bounded-objective' : 'content-cluster-objective',
      );

      const rationale = DocIntelRationale.create(
        RT.OBJECTIVE,
        `Objective derived from "${topicText}". Dominant content type: ${dominant}. ` +
        `Bloom's verb "${verb}" selected for ${dominant}-type content.`,
        [dominant, group.headingId ? 'explicit-heading' : 'no-heading'],
        allKoIds.slice(0, 5),
      );

      return { verb, text, lessonIndex, source, confidence, rationale };
    });
  }

  return Object.freeze({ synthesise });

})();
