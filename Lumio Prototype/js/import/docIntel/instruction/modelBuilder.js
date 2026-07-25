/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Instruction Model Builder
   Phase 4: Instructional Intelligence

   Orchestrates all Phase 4 sub-components to assemble the
   final InstructionalModel from a CanonicalKnowledgeModel.

   Pipeline:
     1. DocIntelAnalyser            → AnalysisResult
     2. DocIntelObjectiveSynthesiser→ IMObjective[]
     3. DocIntelPrerequisiteAnalyser→ prerequisite data
     4. DocIntelDifficultyEstimator → difficulty level
     5. DocIntelDurationEstimator   → duration estimates
     6. Lesson assembly             → IMLessonPlan[]
     7. Assessment generation       → IMAssessment[]
     8. InstructionalModel assembly

   Audience role is inferred from domain.
   Motivation is inferred from dominant content types.
   One assessment is generated per lesson that contains
   assessable knowledge objects.

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelInstructionModelBuilder = (() => {

  const T  = DocIntelObjectTypes.TYPES;
  const RT = DocIntelRationale.TYPES;

  // ── Audience role inference ───────────────────────────────────────────────

  const DOMAIN_ROLES = Object.freeze({
    safety:     'operations worker or field technician',
    compliance: 'employee or regulated professional',
    technology: 'user or IT professional',
    healthcare:  'healthcare professional or clinician',
    business:   'business professional or team member',
    operations: 'operations team member',
    generic:    'learner',
  });

  // ── Motivation inference ──────────────────────────────────────────────────

  function _inferMotivation(analysis) {
    const p = analysis.contentProfile;
    const ruleWarning = (p[T.RULE] || 0) + (p[T.WARNING] || 0);
    const procedural  = p[T.PROCEDURE] || 0;
    const definitional = (p[T.DEFINITION] || 0) + (p[T.CONCEPT] || 0);

    if (ruleWarning > 2)   return 'complete mandatory compliance or safety training';
    if (procedural  > 2)   return 'develop hands-on procedural skills';
    if (definitional > 4)  return 'build foundational knowledge and conceptual understanding';
    return 'develop professional knowledge and capability';
  }

  // ── Subject builder ───────────────────────────────────────────────────────

  function _buildSubject(ckm, analysis, koIndex) {
    // Title: from first Heading KO
    const firstHeading = ckm.objects.find(o => o.type === T.HEADING);
    const titleSource  = firstHeading
      ? DocIntelTraceability.propagate(firstHeading.source)
      : DocIntelTraceability.nullRef();
    const titleConf    = DocIntelModels.createConfidence(
      firstHeading ? 0.80 : 0.40,
      firstHeading ? 'first-heading-used-as-title' : 'no-heading-found',
    );
    const titleRationale = DocIntelRationale.create(
      RT.DOMAIN,
      firstHeading
        ? `Title "${analysis.titleCandidate}" taken from the first heading in the document.`
        : 'No heading found — title could not be reliably inferred from document structure.',
      [firstHeading ? 'first-heading' : 'no-heading'],
      firstHeading ? [firstHeading.id] : [],
    );

    // Domain
    const domainConf = DocIntelModels.createConfidence(
      analysis.domainSignals.length > 0
        ? DocIntelConfidence.fromSignalRatio(analysis.domainSignals.length, 6, 1.0)
        : 0.35,
      analysis.domainSignals.length > 0
        ? `domain-vocabulary-matched: ${analysis.domain}`
        : 'no-domain-vocabulary-matched',
    );
    const domainRationale = DocIntelRationale.create(
      RT.DOMAIN,
      `Domain inferred as "${analysis.domain}". Matched vocabulary: ${analysis.domainSignals.join(', ') || 'none'}.`,
      analysis.domainSignals,
      [],
    );

    // Summary: first Topic or Concept KO text
    const summaryKO    = ckm.objects.find(o => o.type === T.TOPIC || o.type === T.CONCEPT);
    const summaryRaw   = summaryKO && typeof summaryKO.content === 'string' ? summaryKO.content : '';
    const summaryText  = summaryRaw.length > 300 ? summaryRaw.slice(0, 297) + '…' : summaryRaw;
    const summarySource = summaryKO
      ? DocIntelTraceability.propagate(summaryKO.source)
      : DocIntelTraceability.nullRef();

    return {
      titleCandidate:   analysis.titleCandidate,
      source:           titleSource,
      confidence:       titleConf,
      rationale:        titleRationale,
      domain:           analysis.domain,
      domainConfidence: domainConf,
      domainRationale:  domainRationale,
      summary:          summaryText,
      summarySource,
    };
  }

  // ── Audience builder ──────────────────────────────────────────────────────

  function _buildAudience(ckm, analysis, prerequisites) {
    const role       = DOMAIN_ROLES[analysis.domain] || 'learner';
    const motivation = _inferMotivation(analysis);

    const roleConf = DocIntelModels.createConfidence(
      analysis.domainSignals.length > 0 ? 0.58 : 0.35,
      analysis.domainSignals.length > 0 ? 'domain-based-role-inference' : 'default-generic-role',
    );
    const roleRationale = DocIntelRationale.create(
      RT.AUDIENCE,
      `Audience role "${role}" inferred from domain "${analysis.domain}".`,
      [analysis.domain, ...analysis.domainSignals.slice(0, 3)],
      [],
    );

    const motivConf = DocIntelModels.createConfidence(0.55, 'content-type-motivation-inference');
    const motivRationale = DocIntelRationale.create(
      RT.AUDIENCE,
      `Learner motivation inferred as "${motivation}" from dominant content-type profile.`,
      Object.entries(analysis.contentProfile)
        .filter(([, v]) => v > 0)
        .slice(0, 5)
        .map(([k, v]) => `${k}×${v}`),
      [],
    );

    return {
      role,
      roleSource:           DocIntelTraceability.nullRef(),
      roleConfidence:       roleConf,
      roleRationale,
      priorKnowledge:       prerequisites.priorKnowledgeStatement,
      priorConfidence:      prerequisites.confidence,
      priorRationale:       prerequisites.rationale,
      motivation,
      motivationConfidence: motivConf,
      motivationRationale:  motivRationale,
    };
  }

  // ── Lesson builder ────────────────────────────────────────────────────────

  function _buildLessons(ckm, analysis, objectives, duration, koIndex) {
    return analysis.topicGroups.map((group, i) => {
      const objectiveIndex = i;

      const allKoIds  = group.headingId ? [group.headingId, ...group.koIds] : group.koIds;
      const groupKOs  = allKoIds.map(id => koIndex.get(id)).filter(Boolean);

      // Block suggestions for content KOs (skip Heading and Step — structural)
      const contentKOs      = groupKOs.filter(ko => ko.type !== T.HEADING && ko.type !== T.STEP);
      const blockSuggestions = DocIntelBlockRecommender.recommendAll(contentKOs, objectiveIndex);

      const headingKO = group.headingId ? koIndex.get(group.headingId) : null;
      const source    = headingKO
        ? DocIntelTraceability.propagate(headingKO.source)
        : DocIntelTraceability.nullRef();

      const confidence = DocIntelModels.createConfidence(
        group.headingId ? 0.75 : 0.50,
        group.headingId ? 'heading-bounded-lesson' : 'content-cluster-lesson',
      );

      const rationale = DocIntelRationale.create(
        RT.LESSON_BOUNDARY,
        `Lesson "${group.headingText}" bounded by ${group.headingId ? 'an explicit heading' : 'a content cluster'}. ` +
        `Contains ${groupKOs.length} knowledge object(s) and ${blockSuggestions.length} block suggestion(s).`,
        [group.headingId ? 'explicit-heading-boundary' : 'content-cluster-boundary', `${groupKOs.length}-knowledge-objects`],
        allKoIds.slice(0, 5),
      );

      const sequenceRationale = DocIntelRationale.create(
        RT.LESSON_SEQUENCE,
        i === 0
          ? 'This lesson appears first as it introduces the foundational context of the document.'
          : `This lesson follows lesson ${i + 1} in document order, building on the prior content group.`,
        [i === 0 ? 'foundational-first' : 'document-order-sequence'],
        allKoIds.slice(0, 3),
      );

      return {
        title:              group.headingText,
        objectiveIndex,
        estimatedMinutes:   duration.perLessonMinutes,
        knowledgeObjectIds: allKoIds,
        blockSuggestions,
        source,
        confidence,
        rationale,
        sequenceRationale,
      };
    });
  }

  // ── Assessment builder ────────────────────────────────────────────────────

  function _buildAssessments(ckm, analysis, lessons, koIndex) {
    const assessments  = [];
    const assessable   = DocIntelObjectTypes.ASSESSABLE; // frozen Set

    for (const lesson of lessons) {
      const assessableKOs = lesson.knowledgeObjectIds
        .map(id => koIndex.get(id))
        .filter(ko => ko && assessable.has(ko.type));

      if (!assessableKOs.length) continue;

      // Assessment type: practicalExercise if procedures present, else reflection for concept-heavy, else knowledgeCheck
      const hasProcedure   = assessableKOs.some(ko => ko.type === T.PROCEDURE);
      const hasQuestion    = assessableKOs.some(ko => ko.type === T.QUESTION);
      const conceptHeavy   = assessableKOs.filter(ko => ko.type === T.CONCEPT || ko.type === T.DEFINITION).length > 2;

      let assessType = 'knowledgeCheck';
      if (hasProcedure) assessType = 'practicalExercise';
      else if (conceptHeavy && !hasQuestion) assessType = 'reflection';

      const koIds    = assessableKOs.map(ko => ko.id);
      const source   = DocIntelTraceability.propagate(assessableKOs[0].source);
      const confidence = DocIntelModels.createConfidence(
        DocIntelConfidence.fromSignalRatio(assessableKOs.length, Math.max(4, lesson.knowledgeObjectIds.length), 1.0),
        `${assessableKOs.length} assessable KO(s) in lesson "${lesson.title}"`,
      );
      const rationale = DocIntelRationale.create(
        RT.ASSESSMENT,
        `Assessment type "${assessType}" recommended for lesson "${lesson.title}". ` +
        `${assessableKOs.length} assessable knowledge object(s) detected ` +
        `(${hasProcedure ? 'includes Procedure' : hasQuestion ? 'includes Question' : 'concept-heavy'}).`,
        [assessType, `${assessableKOs.length}-assessable-objects`],
        koIds.slice(0, 5),
      );

      assessments.push({
        title:              `Check Your Understanding: ${lesson.title}`,
        type:               assessType,
        objectiveIndex:     lesson.objectiveIndex,
        knowledgeObjectIds: koIds,
        source,
        confidence,
        rationale,
      });
    }

    return assessments;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Builds an InstructionalModel from a CanonicalKnowledgeModel.
   *
   * @param {CanonicalKnowledgeModel} ckm
   * @returns {InstructionalModel}
   * @throws {Error} if ckm is not a valid CanonicalKnowledgeModel
   */
  function build(ckm) {
    if (!ckm || !Array.isArray(ckm.objects)) {
      throw new Error('DocIntelInstructionModelBuilder: expected a CanonicalKnowledgeModel with objects[]');
    }
    if (!['docx', 'pdf', 'pptx'].includes(ckm.sourceFormat)) {
      throw new Error(`DocIntelInstructionModelBuilder: unknown sourceFormat "${ckm.sourceFormat}"`);
    }

    // KO index for O(1) lookup by ID
    const koIndex = new Map(ckm.objects.map(ko => [ko.id, ko]));

    // ── Sub-component pipeline ────────────────────────────────────────────
    const analysis      = DocIntelAnalyser.analyse(ckm);
    const objectives    = DocIntelObjectiveSynthesiser.synthesise(ckm, analysis);
    const prerequisites = DocIntelPrerequisiteAnalyser.analyse(ckm, analysis);
    const difficulty    = DocIntelDifficultyEstimator.estimate(ckm, analysis);
    const duration      = DocIntelDurationEstimator.estimate(ckm, analysis, objectives.length);

    // ── InstructionalModel assembly ───────────────────────────────────────
    const model = DocIntelModels.createInstructionalModel();

    Object.assign(model.subject,  _buildSubject(ckm, analysis, koIndex));
    Object.assign(model.audience, _buildAudience(ckm, analysis, prerequisites));

    model.objectives  = objectives;
    model.lessons     = _buildLessons(ckm, analysis, objectives, duration, koIndex);
    model.assessments = _buildAssessments(ckm, analysis, model.lessons, koIndex);

    model.duration.estimated  = `${duration.totalMinutes} minutes`;
    model.duration.confidence = duration.confidence;
    model.duration.rationale  = duration.rationale;

    // Overall confidence: mean of subject, domain, audience role, duration, and all objectives.
    // DocIntelConfidence.mean() expects Confidence objects ({score, basis, fallbackApplied}),
    // not raw score numbers — pass the Confidence objects directly.
    const confObjects = [
      model.subject.confidence,
      model.subject.domainConfidence,
      model.audience.roleConfidence,
      duration.confidence,
      ...objectives.map(o => o.confidence),
    ];
    model.overallConfidence = DocIntelConfidence.mean(confObjects);

    return model;
  }

  return Object.freeze({ build });

})();
