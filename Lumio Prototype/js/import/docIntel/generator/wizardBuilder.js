/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Wizard Builder
   Phase 5: Course Generator

   Maps an InstructionalModel to a LumioState.wizard state object
   that is structurally identical to one produced by the Manual
   Wizard (startWizard + finalizeCourseToBlueprint).

   All downstream systems — Blueprint Engine, Builder, Publish
   Engine, Commit Pipeline — receive a wizard state they cannot
   distinguish from a manually authored one.

   Mapping summary:
     im.subject.titleCandidate  → wizard.title
     im.subject.summary         → wizard.description
     im.audience.role           → wizard.audRole
     im.audience.priorKnowledge → wizard.audPrior  (banded)
     im.audience.motivation     → wizard.audMotivation (banded)
     im.duration.estimated      → wizard.duration  (banded)
     im.objectives[]            → wizard.objectives[]
     im.lessons[]               → wizard.blueprint.lessons[]
     im.assessments[]           → wizard.blueprint.assessments[]

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelWizardBuilder = (() => {

  // ── Duration band mapping ─────────────────────────────────────────────────
  // The Manual Wizard presents four fixed bands. Parse the estimated minutes
  // string produced by DocIntelDurationEstimator and map to the nearest band.

  // Band boundaries: the label "15-30 min" starts at 15, so 15 min maps
  // to '15-30 min', not '5-15 min'. Upper bounds are exclusive of the next
  // band's named start: <15 → 5-15, <30 → 15-30, <60 → 30-60, else 60+.
  const DURATION_BANDS = Object.freeze([
    { maxMinutes: 14,       band: '5-15 min'  },
    { maxMinutes: 29,       band: '15-30 min' },
    { maxMinutes: 59,       band: '30-60 min' },
    { maxMinutes: Infinity, band: '60+ min'   },
  ]);

  function _mapDuration(estimatedStr) {
    const m = String(estimatedStr || '').match(/\d+/);
    const minutes = m ? parseInt(m[0], 10) : 30;
    const entry = DURATION_BANDS.find(b => minutes <= b.maxMinutes);
    return entry ? entry.band : '30-60 min';
  }

  // ── Prior knowledge mapping ───────────────────────────────────────────────
  // The Manual Wizard offers three prior-knowledge bands.
  // The priorKnowledgeStatement produced by DocIntelPrerequisiteAnalyser is
  // free text — we classify it by keyword pattern.

  function _mapPriorKnowledge(statement) {
    const s = String(statement || '').toLowerCase();
    if (/experienc|advanced|proficient|practitioner/.test(s)) return 'experienced';
    if (/some|familiar|basic|foundation|introduct|prior knowledge of/.test(s)) return 'some';
    return 'none';
  }

  // ── Motivation mapping ────────────────────────────────────────────────────
  // The Manual Wizard offers three motivation options.
  // The motivation string from DocIntelInstructionModelBuilder is free text.

  function _mapMotivation(motivation) {
    const s = String(motivation || '').toLowerCase();
    if (/mandatory|compliance|safety training|required/.test(s)) return 'required';
    if (/self.directed|self directed|chose/.test(s)) return 'self-directed';
    return 'self-directed';
  }

  // ── Assessment type mapping ───────────────────────────────────────────────
  // DocIntel produces camelCase internal types; the wizard uses human-readable
  // strings that are displayed directly in the Blueprint Screen and stored on
  // the course assessment object.

  function _mapAssessmentType(type) {
    switch (type) {
      case 'practicalExercise': return 'Practical Exercise';
      case 'reflection':        return 'Reflection';
      case 'knowledgeCheck':
      default:                  return 'Knowledge Check';
    }
  }

  // ── Interaction type ──────────────────────────────────────────────────────
  // blueprint.interactions[] is parallel to blueprint.lessons[].
  // The Blueprint Screen displays interactions[i].type alongside each lesson.
  // We derive the interaction type from the assessment aligned to this lesson.

  function _interactionForLesson(lesson, assessments) {
    const assessment = assessments.find(a => a.objectiveIndex === lesson.objectiveIndex);
    return { type: assessment ? _mapAssessmentType(assessment.type) : 'Knowledge Check' };
  }

  // ── Objective mapping ─────────────────────────────────────────────────────

  function _mapObjective(o) {
    return {
      verb: o.verb || 'Identify',
      text: o.text || '',
    };
  }

  // ── Lesson mapping ────────────────────────────────────────────────────────

  function _mapLesson(l) {
    return {
      title:             l.title || 'Untitled Lesson',
      objectiveIndex:    l.objectiveIndex,
      duration:          `${l.estimatedMinutes} min`,
      accepted:          true,
      _blockSuggestions: l.blockSuggestions || [],
    };
  }

  // ── Assessment mapping ────────────────────────────────────────────────────

  function _mapAssessment(a) {
    return {
      title:          a.title,
      type:           _mapAssessmentType(a.type),
      objectiveIndex: a.objectiveIndex,
      accepted:       true,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Builds a wizard state object from an InstructionalModel.
   *
   * The returned object is structurally identical to the state produced by
   * startWizard() + finalizeCourseToBlueprint() in the Manual/AI Wizard.
   *
   * Downstream systems (Blueprint Engine, Builder, Publish Engine) receive
   * this state via createCourseFromWizard() and cannot distinguish whether
   * it was authored manually or generated by the Document Intelligence Engine.
   *
   * @param {InstructionalModel} im  Output of DocIntelInstruction.analyse()
   * @returns {object}               Wizard state ready to assign to LumioState.wizard
   * @throws {Error}                 If im is not a valid InstructionalModel
   */
  function build(im) {
    if (!im || !Array.isArray(im.objectives) || !Array.isArray(im.lessons)) {
      throw new Error('DocIntelWizardBuilder: expected a valid InstructionalModel with objectives[] and lessons[]');
    }

    const objectives   = im.objectives.map(_mapObjective);
    const lessons      = im.lessons.map(_mapLesson);
    const assessments  = im.assessments.map(_mapAssessment);
    const interactions = im.lessons.map(l => _interactionForLesson(l, im.assessments));

    return {
      // ── Wizard identity ─────────────────────────────────────────────────
      // These fields mirror the Manual Wizard exactly.
      type:          'Course',
      step:          'blueprint',        // pre-advances past all UI steps
      title:         im.subject.titleCandidate || '',
      description:   im.subject.summary || '',
      audRole:       im.audience.role   || '',
      audPrior:      _mapPriorKnowledge(im.audience.priorKnowledge),
      audMotivation: _mapMotivation(im.audience.motivation),
      duration:      _mapDuration(im.duration.estimated),
      objectives,
      heroImage:     null,               // no source image; UI sets this later
      theme:         't1',               // default; replaced by ensureThemeDesign()
      themeDesign:   null,               // ensureThemeDesign() populates on first access

      // ── Blueprint ────────────────────────────────────────────────────────
      // Identical shape to finalizeCourseToBlueprint()'s output so that
      // renderBlueprintScreen() and createCourseFromWizard() work unchanged.
      blueprintLoading: false,
      blueprint: {
        lessons,
        assessments,
        interactions,
        estimatedDuration: im.duration.estimated,
      },

      // ── DocIntel source marker ───────────────────────────────────────────
      // Consumed by the Phase 9 ContentSeeder guard in wizard.js.
      // Never written by the Manual Wizard — safe to use as a discriminator.
      source: 'document-intelligence',
    };
  }

  return Object.freeze({ build });

})();
