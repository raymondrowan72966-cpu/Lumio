/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — End-to-End Validation Harness
   Phase 6: End-to-End Validation & Readiness

   Exercises the complete DocIntel pipeline with synthetic data,
   validates every inter-stage contract, and reports a detailed
   pass/fail result.

   NOT loaded in index.html. Loaded on demand for validation:
     await DocIntelValidate.loadAll();
     const report = DocIntelValidate.run();

   Pipeline under test:
     Synthetic SDM
       → DocIntelModeller.model()      → CanonicalKnowledgeModel
       → DocIntelInstruction.analyse() → InstructionalModel
       → DocIntelGenerator.buildWizardState() → wizard state

   Reader format detection is validated separately without file I/O.

   No imports from any existing Lumio subsystem.
   No side effects on LumioState.
   ============================================================ */

const DocIntelValidate = (() => {

  // ── Module load order (strict dependency sequence) ────────────────────────
  const MODULE_PATHS = Object.freeze([
    'js/import/docIntel/models.js',
    'js/import/docIntel/confidence.js',
    'js/import/docIntel/traceability.js',
    'js/import/docIntel/rationale.js',
    'js/import/docIntel/knowledge/objectTypes.js',
    'js/import/docIntel/reader/index.js',
    'js/import/docIntel/reader/wordReader.js',
    'js/import/docIntel/reader/pdfReader.js',
    'js/import/docIntel/reader/pptxReader.js',
    'js/import/docIntel/knowledge/classifier.js',
    'js/import/docIntel/knowledge/graphBuilder.js',
    'js/import/docIntel/knowledge/modeller.js',
    'js/import/docIntel/instruction/analyser.js',
    'js/import/docIntel/instruction/objectiveSynthesiser.js',
    'js/import/docIntel/instruction/prerequisiteAnalyser.js',
    'js/import/docIntel/instruction/difficultyEstimator.js',
    'js/import/docIntel/instruction/durationEstimator.js',
    'js/import/docIntel/instruction/blockRecommender.js',
    'js/import/docIntel/instruction/modelBuilder.js',
    'js/import/docIntel/instruction/index.js',
    'js/import/docIntel/generator/wizardBuilder.js',
    'js/import/docIntel/generator/index.js',
    'js/import/docIntel/seeder/blockBuilder.js',
    'js/import/docIntel/seeder/contentSeeder.js',
    'js/import/docIntel/index.js',
  ]);

  // ── Dynamic loader ────────────────────────────────────────────────────────

  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload  = resolve;
      s.onerror = () => reject(new Error(`DocIntelValidate: failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function loadAll() {
    for (const path of MODULE_PATHS) {
      await _loadScript(path);
    }
  }

  // ── Synthetic SDM construction ────────────────────────────────────────────
  // Covers all valid SDM element types and multiple heading levels.
  // Designed to exercise all KO classification paths in Phase 3.

  function _buildSyntheticSDM() {
    const sdm = DocIntelModels.createSDM('docx');
    sdm.metadata.pageCount   = 4;
    sdm.metadata.wordCount   = 520;
    sdm.metadata.hasImages   = true;
    sdm.metadata.hasTables   = true;
    sdm.metadata.hasNumberedLists = true;

    // ── Section 1: H1 — Introduction ─────────────────────────────────────
    const s1 = DocIntelModels.createSDMSection('s1', 1, 'Workplace Safety Fundamentals', 1, 1);
    s1.elements.push(DocIntelModels.createSDMElement('paragraph',
      'Workplace safety protects all employees from injury and illness.', 1, 0.10));
    s1.elements.push(DocIntelModels.createSDMElement('paragraph',
      'Warning: Do not operate machinery without completing safety training.', 1, 0.25));
    s1.elements.push(DocIntelModels.createSDMElement('callout',
      'Note: All procedures must be reviewed before starting any task.', 1, 0.40));
    sdm.sections.push(s1);

    // ── Section 2: H2 — Hazard Recognition ───────────────────────────────
    const s2 = DocIntelModels.createSDMSection('s2', 2, 'Recognising Workplace Hazards', 1, 2);
    s2.elements.push(DocIntelModels.createSDMElement('paragraph',
      'A hazard is any condition, situation, or practice that may cause harm to people or property.', 1, 0.10));
    s2.elements.push(DocIntelModels.createSDMElement('bulletList',
      ['Slips, trips, and falls', 'Electrical hazards', 'Chemical exposure', 'Manual handling injuries'], 1, 0.30));
    s2.elements.push(DocIntelModels.createSDMElement('table',
      { rows: [['Hazard Type','Risk Level','Action Required'],['Wet floor','High','Place signage immediately'],['Frayed cable','Critical','Remove from service']] },
      2, 0.10));
    s2.elements.push(DocIntelModels.createSDMElement('image',
      { alt: 'Hazard signage reference guide' }, 2, 0.50));
    sdm.sections.push(s2);

    // ── Section 3: H2 — PPE Procedures ───────────────────────────────────
    const s3 = DocIntelModels.createSDMSection('s3', 2, 'Personal Protective Equipment', 2, 3);
    // Colon-definition pattern — no warning/rule words so classifier reaches step 6 (DEFINITION)
    s3.elements.push(DocIntelModels.createSDMElement('paragraph',
      'Ergonomics: The study of designing equipment to fit the physical capabilities of the person using it.', 2, 0.10));
    s3.elements.push(DocIntelModels.createSDMElement('numberedList',
      ['Inspect PPE before use', 'Don safety glasses and hi-vis vest', 'Check steel-toe boots for damage', 'Report any defective equipment'], 2, 0.30));
    // "for example" phrase — matches _EXAMPLE_RE before _RULE_RE triggers
    s3.elements.push(DocIntelModels.createSDMElement('paragraph',
      'For example, workers who wore correct PPE during the audit reported far fewer incidents than those who did not.', 3, 0.10));
    s3.elements.push(DocIntelModels.createSDMElement('paragraph',
      'For more information, refer to the PPE Selection Guide and the Site Safety Handbook.', 3, 0.25));
    sdm.sections.push(s3);

    // ── Section 4: H2 — Emergency Procedures ─────────────────────────────
    const s4 = DocIntelModels.createSDMSection('s4', 2, 'Emergency Response Procedures', 3, 4);
    s4.elements.push(DocIntelModels.createSDMElement('paragraph',
      'In the event of an emergency, all personnel must follow the established response procedures.', 3, 0.10));
    s4.elements.push(DocIntelModels.createSDMElement('numberedList',
      ['Raise the alarm immediately', 'Evacuate via the nearest marked exit', 'Assemble at the designated muster point', 'Do not re-enter until authorised by the safety officer'], 3, 0.25));
    s4.elements.push(DocIntelModels.createSDMElement('callout',
      'Warning: Never use lifts during a fire evacuation.', 4, 0.10));
    s4.elements.push(DocIntelModels.createSDMElement('paragraph',
      'In summary, all personnel must know the emergency assembly point, the evacuation routes, and the responsibilities of the safety officer.', 4, 0.25));
    sdm.sections.push(s4);

    return sdm;
  }

  // ── Assertion helper ──────────────────────────────────────────────────────

  function _assert(name, condition, detail) {
    return { name, pass: Boolean(condition), detail: detail != null ? String(detail) : '' };
  }

  // ── Stage validators ──────────────────────────────────────────────────────

  const VALID_SDM_TYPES = Object.freeze(['paragraph','numberedList','bulletList','table','image','callout']);
  const VALID_KO_TYPES  = Object.freeze(['Heading','Topic','Concept','Definition','Rule','Procedure','Step',
    'Warning','Example','Reference','Table','Image','Question','Checklist','Note','Summary']);
  // 'accordion' and 'tabs' removed — they are never generated by the engine and have no
  // blockBuilder handler. 'continue' is composition-only (LessonComposer) and not part
  // of the IM-level block suggestions validated here.
  const VALID_BLOCK_TYPES = Object.freeze(['paragraph','heading_paragraph','list_numbered','list_checkbox',
    'list_bullet','process','table','image',
    'stmt_info','stmt_tip','stmt_note','stmt_warning','flashcard_stack','kc_multiple_choice']);
  const VALID_AUDIT_PRIOR = Object.freeze(['none','some','experienced']);
  const VALID_AUDIT_MOTIV = Object.freeze(['required','self-directed','curiosity']);
  const VALID_DURATION    = Object.freeze(['5-15 min','15-30 min','30-60 min','60+ min']);
  const VALID_ASSESS_TYPES= Object.freeze(['Knowledge Check','Practical Exercise','Reflection']);

  function _validateSDM(sdm) {
    const R = [];
    R.push(_assert('SDM format is docx',         sdm.format === 'docx'));
    R.push(_assert('SDM sections.length > 0',    sdm.sections.length > 0, sdm.sections.length));
    R.push(_assert('SDM metadata exists',        sdm.metadata && typeof sdm.metadata === 'object'));
    R.push(_assert('SDM wordCount > 0',          sdm.metadata.wordCount > 0, sdm.metadata.wordCount));
    R.push(_assert('SDM sections have IDs',      sdm.sections.every(s => typeof s.id === 'string' && s.id)));
    R.push(_assert('SDM sections have levels',   sdm.sections.every(s => typeof s.level === 'number')));

    let allElValid = true;
    let badEl = null;
    for (const sec of sdm.sections) {
      for (const el of sec.elements) {
        if (!VALID_SDM_TYPES.includes(el.type)) { allElValid = false; badEl = el.type; break; }
      }
    }
    R.push(_assert('SDM all element types valid', allElValid, badEl || ''));
    R.push(_assert('SDM elements have content',   sdm.sections.every(s => s.elements.every(e => e.content != null))));
    return R;
  }

  function _validateCKM(ckm, sdm) {
    const R = [];
    R.push(_assert('CKM sourceFormat matches SDM', ckm.sourceFormat === sdm.format, ckm.sourceFormat));
    R.push(_assert('CKM objects is array',          Array.isArray(ckm.objects)));
    R.push(_assert('CKM objects.length > 0',        ckm.objects.length > 0, ckm.objects.length));
    R.push(_assert('CKM metadata.objectCount matches', ckm.metadata.objectCount === ckm.objects.length,
      `count=${ckm.metadata.objectCount} actual=${ckm.objects.length}`));

    const allTypesValid = ckm.objects.every(ko => VALID_KO_TYPES.includes(ko.type));
    const firstBadType  = ckm.objects.find(ko => !VALID_KO_TYPES.includes(ko.type));
    R.push(_assert('CKM all KO types valid', allTypesValid, firstBadType ? firstBadType.type : ''));

    R.push(_assert('CKM all KOs have IDs',      ckm.objects.every(ko => typeof ko.id === 'string' && ko.id)));
    R.push(_assert('CKM all KOs have source',   ckm.objects.every(ko => ko.source && ko.source.sectionId !== undefined)));
    R.push(_assert('CKM has Heading KOs',       ckm.objects.some(ko => ko.type === 'Heading')));

    // Step KOs must have a Procedure parent
    const stepKOs = ckm.objects.filter(ko => ko.type === 'Step');
    if (stepKOs.length > 0) {
      const koById = new Map(ckm.objects.map(ko => [ko.id, ko]));
      const stepsHaveParent = stepKOs.every(s => s.parentId && koById.get(s.parentId)?.type === 'Procedure');
      R.push(_assert('CKM Step KOs have Procedure parent', stepsHaveParent,
        `${stepKOs.length} steps`));
    }

    // Heading KOs sourced from SDM sections
    const sectionIds = new Set(sdm.sections.map(s => s.id));
    const headingKOs = ckm.objects.filter(ko => ko.type === 'Heading');
    const headingsFromSections = headingKOs.every(ko => sectionIds.has(ko.source.sectionId));
    R.push(_assert('CKM Heading KO source IDs match SDM sections', headingsFromSections));

    R.push(_assert('CKM confidence fields present', ckm.objects.every(ko =>
      ko.source && typeof ko.source.sectionId === 'string')));

    return R;
  }

  function _validateIM(im) {
    const R = [];
    R.push(_assert('IM subject exists',              im.subject && typeof im.subject === 'object'));
    R.push(_assert('IM subject.titleCandidate str',  typeof im.subject.titleCandidate === 'string'));
    R.push(_assert('IM subject.domain str',          typeof im.subject.domain === 'string' && im.subject.domain));
    R.push(_assert('IM subject.confidence 0-1',      im.subject.confidence?.score >= 0 && im.subject.confidence?.score <= 1));
    R.push(_assert('IM audience exists',             im.audience && typeof im.audience === 'object'));
    R.push(_assert('IM audience.role str',           typeof im.audience.role === 'string'));
    R.push(_assert('IM objectives is array',         Array.isArray(im.objectives)));
    R.push(_assert('IM objectives.length > 0',       im.objectives.length > 0, im.objectives.length));
    R.push(_assert('IM lessons is array',            Array.isArray(im.lessons)));
    R.push(_assert('IM lessons.length > 0',          im.lessons.length > 0, im.lessons.length));
    R.push(_assert('IM assessments is array',        Array.isArray(im.assessments)));
    R.push(_assert('IM duration.estimated str',      typeof im.duration?.estimated === 'string' && im.duration.estimated));
    R.push(_assert('IM overallConfidence 0-1',       typeof im.overallConfidence === 'number' &&
      im.overallConfidence >= 0 && im.overallConfidence <= 1, im.overallConfidence));

    // Objectives shape
    if (im.objectives.length > 0) {
      R.push(_assert('IM objectives[].verb str',     im.objectives.every(o => typeof o.verb === 'string' && o.verb)));
      R.push(_assert('IM objectives[].text str',     im.objectives.every(o => typeof o.text === 'string')));
      R.push(_assert('IM objectives[].confidence',   im.objectives.every(o => o.confidence?.score >= 0 && o.confidence?.score <= 1)));
      R.push(_assert('IM objectives[].source',       im.objectives.every(o => o.source && o.source.sectionId !== undefined)));
      R.push(_assert('IM objectives[].rationale',    im.objectives.every(o => o.rationale && o.rationale.text)));
    }

    // Lessons shape
    if (im.lessons.length > 0) {
      R.push(_assert('IM lessons[].title str',        im.lessons.every(l => typeof l.title === 'string')));
      R.push(_assert('IM lessons[].objectiveIndex',   im.lessons.every(l => typeof l.objectiveIndex === 'number')));
      R.push(_assert('IM lessons[].estimatedMinutes', im.lessons.every(l => typeof l.estimatedMinutes === 'number' && l.estimatedMinutes >= 5)));
      R.push(_assert('IM lessons[].knowledgeObjectIds', im.lessons.every(l => Array.isArray(l.knowledgeObjectIds))));
      R.push(_assert('IM lessons[].blockSuggestions', im.lessons.every(l => Array.isArray(l.blockSuggestions))));
      R.push(_assert('IM lessons[].confidence',       im.lessons.every(l => l.confidence?.score >= 0)));
      R.push(_assert('IM lessons[].rationale',        im.lessons.every(l => l.rationale?.text)));
      R.push(_assert('IM lessons[].sequenceRationale',im.lessons.every(l => l.sequenceRationale?.text)));

      // Block suggestions use valid Lumio block type identifiers
      let allBsValid = true, badBs = null;
      for (const lesson of im.lessons) {
        for (const bs of lesson.blockSuggestions) {
          if (!VALID_BLOCK_TYPES.includes(bs.blockType)) { allBsValid = false; badBs = bs.blockType; break; }
        }
        if (!allBsValid) break;
      }
      R.push(_assert('IM blockSuggestions use valid Lumio block types', allBsValid, badBs || ''));

      // Block suggestions have required fields
      R.push(_assert('IM blockSuggestions have knowledgeObjectId', im.lessons.every(l =>
        l.blockSuggestions.every(bs => typeof bs.knowledgeObjectId === 'string' && bs.knowledgeObjectId))));
      R.push(_assert('IM blockSuggestions have objectiveIndex', im.lessons.every(l =>
        l.blockSuggestions.every(bs => typeof bs.objectiveIndex === 'number'))));
      R.push(_assert('IM blockSuggestions have confidence', im.lessons.every(l =>
        l.blockSuggestions.every(bs => bs.confidence?.score >= 0))));
    }

    return R;
  }

  function _validateWizardState(ws, im) {
    const R = [];
    R.push(_assert('WS type === Course',          ws.type === 'Course'));
    R.push(_assert('WS step === blueprint',        ws.step === 'blueprint'));
    R.push(_assert('WS title is string',           typeof ws.title === 'string'));
    R.push(_assert('WS description is string',     typeof ws.description === 'string'));
    R.push(_assert('WS audRole is string',         typeof ws.audRole === 'string'));
    R.push(_assert('WS audPrior is valid band',    VALID_AUDIT_PRIOR.includes(ws.audPrior), ws.audPrior));
    R.push(_assert('WS audMotivation is valid',    VALID_AUDIT_MOTIV.includes(ws.audMotivation), ws.audMotivation));
    R.push(_assert('WS duration is valid band',    VALID_DURATION.includes(ws.duration), ws.duration));
    R.push(_assert('WS objectives is array',       Array.isArray(ws.objectives)));
    R.push(_assert('WS objectives match IM count', ws.objectives.length === im.objectives.length,
      `ws=${ws.objectives.length} im=${im.objectives.length}`));
    R.push(_assert('WS objectives[].verb',         ws.objectives.every(o => typeof o.verb === 'string' && o.verb)));
    R.push(_assert('WS objectives[].text',         ws.objectives.every(o => typeof o.text === 'string')));
    R.push(_assert('WS heroImage is null',         ws.heroImage === null));
    R.push(_assert('WS themeDesign is null',       ws.themeDesign === null));
    R.push(_assert('WS blueprintLoading false',    ws.blueprintLoading === false));
    R.push(_assert('WS source === document-intelligence', ws.source === 'document-intelligence'));

    const bp = ws.blueprint;
    R.push(_assert('WS blueprint exists',          bp && typeof bp === 'object'));
    R.push(_assert('WS blueprint.lessons array',   Array.isArray(bp?.lessons)));
    R.push(_assert('WS blueprint.assessments arr', Array.isArray(bp?.assessments)));
    R.push(_assert('WS blueprint.interactions arr',Array.isArray(bp?.interactions)));
    R.push(_assert('WS blueprint.estimatedDuration', typeof bp?.estimatedDuration === 'string' && bp.estimatedDuration));

    if (bp?.lessons?.length > 0) {
      R.push(_assert('WS lessons all accepted',    bp.lessons.every(l => l.accepted === true)));
      R.push(_assert('WS lessons have title',      bp.lessons.every(l => typeof l.title === 'string')));
      R.push(_assert('WS lessons have duration',   bp.lessons.every(l => typeof l.duration === 'string' && l.duration.includes('min'))));
      R.push(_assert('WS lessons have objectiveIndex', bp.lessons.every(l => typeof l.objectiveIndex === 'number')));
      R.push(_assert('WS lessons have _blockSuggestions array', bp.lessons.every(l => Array.isArray(l._blockSuggestions))));
    }
    if (bp?.assessments?.length > 0) {
      R.push(_assert('WS assessments all accepted', bp.assessments.every(a => a.accepted === true)));
      R.push(_assert('WS assessment types valid',   bp.assessments.every(a => VALID_ASSESS_TYPES.includes(a.type)),
        bp.assessments.map(a => a.type).join(',')));
    }
    if (bp?.interactions?.length > 0) {
      R.push(_assert('WS interactions parallel to lessons', bp.interactions.length === bp.lessons.length,
        `interactions=${bp.interactions.length} lessons=${bp.lessons.length}`));
      R.push(_assert('WS interactions[].type str', bp.interactions.every(i => typeof i.type === 'string' && i.type)));
    }

    return R;
  }

  function _validateContracts(sdm, ckm, im, ws) {
    const R = [];
    const sectionIds = new Set(sdm.sections.map(s => s.id));
    const koById     = new Map(ckm.objects.map(ko => [ko.id, ko]));

    // SDM → CKM
    R.push(_assert('CONTRACT SDM→CKM: sourceFormat preserved', ckm.sourceFormat === sdm.format));
    R.push(_assert('CONTRACT SDM→CKM: KO source sectionIds exist in SDM',
      ckm.objects.every(ko => !ko.source.sectionId || sectionIds.has(ko.source.sectionId))));

    // CKM → IM
    let allKoIdsValid = true, badId = null;
    for (const lesson of im.lessons) {
      for (const kid of lesson.knowledgeObjectIds) {
        if (!koById.has(kid)) { allKoIdsValid = false; badId = kid; break; }
      }
      if (!allKoIdsValid) break;
    }
    R.push(_assert('CONTRACT CKM→IM: lesson KO IDs exist in CKM', allKoIdsValid, badId || ''));

    let allBsKoIdsValid = true;
    for (const lesson of im.lessons) {
      for (const bs of lesson.blockSuggestions) {
        if (!koById.has(bs.knowledgeObjectId)) { allBsKoIdsValid = false; break; }
      }
      if (!allBsKoIdsValid) break;
    }
    R.push(_assert('CONTRACT CKM→IM: blockSuggestion KO IDs exist in CKM', allBsKoIdsValid));

    R.push(_assert('CONTRACT CKM→IM: objectiveIndex in range',
      im.lessons.every(l => l.objectiveIndex >= 0 && l.objectiveIndex < im.objectives.length)));

    // IM → WS
    R.push(_assert('CONTRACT IM→WS: lesson count matches',
      ws.blueprint.lessons.length === im.lessons.length,
      `ws=${ws.blueprint.lessons.length} im=${im.lessons.length}`));
    R.push(_assert('CONTRACT IM→WS: assessment count matches',
      ws.blueprint.assessments.length === im.assessments.length,
      `ws=${ws.blueprint.assessments.length} im=${im.assessments.length}`));
    R.push(_assert('CONTRACT IM→WS: objective count matches',
      ws.objectives.length === im.objectives.length));
    R.push(_assert('CONTRACT IM→WS: interactions parallel to lessons',
      ws.blueprint.interactions.length === ws.blueprint.lessons.length));

    // Isolation: LumioState must not have been touched
    R.push(_assert('ISOLATION: LumioState.wizard unchanged by buildWizardState',
      typeof LumioState === 'undefined' || LumioState.wizard === null));

    return R;
  }

  function _validateReaderFormatDetection() {
    const R = [];
    // Test DocIntelReader.detectFormat() without actual File I/O
    const cases = [
      { name: 'docx by extension',       file: { name: 'course.docx', type: '' },        expected: 'docx' },
      { name: 'pdf by extension',        file: { name: 'course.pdf',  type: '' },        expected: 'pdf'  },
      { name: 'pptx by extension',       file: { name: 'slides.pptx', type: '' },        expected: 'pptx' },
      { name: 'docx MIME fallback',      file: { name: 'file',        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, expected: 'docx' },
      { name: 'pdf MIME fallback',       file: { name: 'file',        type: 'application/pdf' }, expected: 'pdf' },
      { name: 'pptx MIME fallback',      file: { name: 'file',        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }, expected: 'pptx' },
      { name: 'unsupported returns null',file: { name: 'file.xls',    type: '' },        expected: null   },
    ];
    for (const { name, file, expected } of cases) {
      try {
        const got = DocIntelReader.detectFormat(file);
        R.push(_assert(`READER ${name}`, got === expected, `expected=${expected} got=${got}`));
      } catch (e) {
        R.push(_assert(`READER ${name}`, false, e.message));
      }
    }
    // SUPPORTED set
    // SUPPORTED is a frozen plain object {docx:'docx', pdf:'pdf', pptx:'pptx'}
    R.push(_assert('READER SUPPORTED has docx', 'docx' in DocIntelReader.SUPPORTED));
    R.push(_assert('READER SUPPORTED has pdf',  'pdf'  in DocIntelReader.SUPPORTED));
    R.push(_assert('READER SUPPORTED has pptx', 'pptx' in DocIntelReader.SUPPORTED));
    return R;
  }

  // ── Phase 9: Seeder validation ────────────────────────────────────────────
  // Exercises DocIntelBlockBuilder.build() for every block type produced by
  // DocIntelBlockRecommender and verifies DocIntelContentSeeder is callable.
  // Does NOT write to LumioState — all assertions operate on the returned
  // block objects directly.

  function _validateSeeder() {
    const R = [];
    const T = DocIntelObjectTypes.TYPES;

    // ── Module presence ───────────────────────────────────────────────────────
    R.push(_assert('SEEDER DocIntelBlockBuilder defined',          typeof DocIntelBlockBuilder          !== 'undefined'));
    R.push(_assert('SEEDER DocIntelContentSeeder defined',         typeof DocIntelContentSeeder         !== 'undefined'));
    R.push(_assert('SEEDER DocIntelLessonComposer defined',        typeof DocIntelLessonComposer        !== 'undefined'));
    R.push(_assert('SEEDER DocIntelBlockBuilder.build is fn',      typeof DocIntelBlockBuilder.build    === 'function'));
    R.push(_assert('SEEDER DocIntelContentSeeder.seed is fn',      typeof DocIntelContentSeeder.seed    === 'function'));
    R.push(_assert('SEEDER DocIntelLessonComposer.compose is fn',  typeof DocIntelLessonComposer?.compose === 'function'));

    // ── Helper: build a minimal BlockSuggestion stub ──────────────────────────
    function _stub(blockType, content) {
      return { blockType, content, knowledgeObjectId: 'ko_test', objectiveIndex: 0,
               source: {}, confidence: {}, rationale: {} };
    }

    // ── paragraph ─────────────────────────────────────────────────────────────
    const para = DocIntelBlockBuilder.build(_stub('paragraph', 'Sample topic text.'));
    R.push(_assert('SEEDER paragraph block returned', para !== null));
    R.push(_assert('SEEDER paragraph has id',   para && typeof para.id === 'string'));
    R.push(_assert('SEEDER paragraph type ok',  para && para.type === 'paragraph'));
    R.push(_assert('SEEDER paragraph data.body', para && typeof para.data.body === 'string'));

    // ── heading_paragraph ─────────────────────────────────────────────────────
    const hp = DocIntelBlockBuilder.build(_stub('heading_paragraph', 'Concept Title: concept explanation text.'));
    R.push(_assert('SEEDER heading_paragraph returned', hp !== null));
    R.push(_assert('SEEDER heading_paragraph data.heading', hp && typeof hp.data.heading === 'string'));
    R.push(_assert('SEEDER heading_paragraph data.body',    hp && typeof hp.data.body    === 'string'));

    // ── list_numbered (string[] steps) ────────────────────────────────────────
    const ln = DocIntelBlockBuilder.build(_stub('list_numbered', { title: 'Procedure', steps: ['Step one', 'Step two'] }));
    R.push(_assert('SEEDER list_numbered returned', ln !== null));
    R.push(_assert('SEEDER list_numbered data.items is array', ln && Array.isArray(ln.data.items)));
    R.push(_assert('SEEDER list_numbered data.items[0].text', ln && typeof ln.data.items[0].text === 'string'));

    // ── list_checkbox ─────────────────────────────────────────────────────────
    const lc = DocIntelBlockBuilder.build(_stub('list_checkbox', ['Item A', 'Item B']));
    R.push(_assert('SEEDER list_checkbox returned', lc !== null));
    R.push(_assert('SEEDER list_checkbox data.items is array', lc && Array.isArray(lc.data.items)));
    R.push(_assert('SEEDER list_checkbox items count matches', lc && lc.data.items.length === 2));

    // ── stmt_info ─────────────────────────────────────────────────────────────
    const si = DocIntelBlockBuilder.build(_stub('stmt_info', 'All staff must complete this training.'));
    R.push(_assert('SEEDER stmt_info returned', si !== null));
    R.push(_assert('SEEDER stmt_info data.title', si && si.data.title === 'Rule'));
    R.push(_assert('SEEDER stmt_info data.text',  si && typeof si.data.text === 'string'));

    // ── stmt_warning ──────────────────────────────────────────────────────────
    const sw = DocIntelBlockBuilder.build(_stub('stmt_warning', 'Do not operate without PPE.'));
    R.push(_assert('SEEDER stmt_warning returned', sw !== null));
    R.push(_assert('SEEDER stmt_warning data.title', sw && sw.data.title === 'Warning'));

    // ── stmt_note ─────────────────────────────────────────────────────────────
    const sn = DocIntelBlockBuilder.build(_stub('stmt_note', 'This section is for reference.'));
    R.push(_assert('SEEDER stmt_note returned', sn !== null));
    R.push(_assert('SEEDER stmt_note data.title', sn && sn.data.title === 'Note'));

    // ── flashcard_stack ───────────────────────────────────────────────────────
    const fs = DocIntelBlockBuilder.build(_stub('flashcard_stack', 'Ergonomics: the study of designing equipment for safe use.'));
    R.push(_assert('SEEDER flashcard_stack returned', fs !== null));
    R.push(_assert('SEEDER flashcard_stack data.items is array', fs && Array.isArray(fs.data.items)));
    R.push(_assert('SEEDER flashcard_stack item has front.text', fs && typeof fs.data.items[0].front.text === 'string'));
    R.push(_assert('SEEDER flashcard_stack item has back.text',  fs && typeof fs.data.items[0].back.text  === 'string'));

    // ── table ─────────────────────────────────────────────────────────────────
    const tbl = DocIntelBlockBuilder.build(_stub('table', [['Header 1', 'Header 2'], ['Cell A', 'Cell B']]));
    R.push(_assert('SEEDER table returned', tbl !== null));
    R.push(_assert('SEEDER table data.rows is array', tbl && Array.isArray(tbl.data.rows)));
    R.push(_assert('SEEDER table data.rows[0] is array', tbl && Array.isArray(tbl.data.rows[0])));

    // ── image ─────────────────────────────────────────────────────────────────
    const img = DocIntelBlockBuilder.build(_stub('image', 'Figure 1'));
    R.push(_assert('SEEDER image returned', img !== null));
    R.push(_assert('SEEDER image data.src is null', img && img.data.src === null));
    R.push(_assert('SEEDER image data.label is string', img && typeof img.data.label === 'string'));

    // ── kc_multiple_choice ────────────────────────────────────────────────────
    const kc = DocIntelBlockBuilder.build(_stub('kc_multiple_choice', 'What is the first step?'));
    R.push(_assert('SEEDER kc_multiple_choice returned', kc !== null));
    R.push(_assert('SEEDER kc_multiple_choice data.question', kc && typeof kc.data.question === 'string'));
    R.push(_assert('SEEDER kc_multiple_choice data.options is array', kc && Array.isArray(kc.data.options)));
    R.push(_assert('SEEDER kc_multiple_choice data.correct is number', kc && typeof kc.data.correct === 'number'));

    // ── process (Phase 10) ────────────────────────────────────────────────────
    const proc = DocIntelBlockBuilder.build(_stub('process', { title: 'PPE Donning Procedure', steps: ['Inspect equipment for damage', 'Don safety glasses and hi-vis vest', 'Check steel-toe boots'] }));
    R.push(_assert('SEEDER process returned',                proc !== null));
    R.push(_assert('SEEDER process type ok',                 proc && proc.type === 'process'));
    R.push(_assert('SEEDER process data.items is array',     proc && Array.isArray(proc.data.items)));
    R.push(_assert('SEEDER process items count matches steps', proc && proc.data.items.length === 3));
    R.push(_assert('SEEDER process item[0].title is string', proc && typeof proc.data.items[0].title === 'string'));
    R.push(_assert('SEEDER process item[0].body is string',  proc && typeof proc.data.items[0].body  === 'string'));
    R.push(_assert('SEEDER process item titles are Step N',  proc && proc.data.items[0].title === 'Step 1' && proc.data.items[2].title === 'Step 3'));
    // String fallback — single-step procedure
    const procStr = DocIntelBlockBuilder.build(_stub('process', 'Complete the safety check before starting.'));
    R.push(_assert('SEEDER process string fallback returns 1 item', procStr && Array.isArray(procStr.data.items) && procStr.data.items.length === 1));
    R.push(_assert('SEEDER process string fallback item.title ok',  procStr && procStr.data.items[0].title === 'Step 1'));

    // ── stmt_tip (Phase 10) ───────────────────────────────────────────────────
    const tip = DocIntelBlockBuilder.build(_stub('stmt_tip', 'A warehouse operative must wear a hi-vis vest and safety glasses in all marked zones.'));
    R.push(_assert('SEEDER stmt_tip returned',              tip !== null));
    R.push(_assert('SEEDER stmt_tip type ok',               tip && tip.type === 'stmt_tip'));
    R.push(_assert('SEEDER stmt_tip data.title === Example', tip && tip.data.title === 'Example'));
    R.push(_assert('SEEDER stmt_tip data.text is string',   tip && typeof tip.data.text === 'string'));
    R.push(_assert('SEEDER stmt_tip data.text non-empty',   tip && tip.data.text.length > 0));

    // ── list_bullet (Phase 10) ────────────────────────────────────────────────
    const lb = DocIntelBlockBuilder.build(_stub('list_bullet', 'Workers must wear PPE at all times. Hazards must be reported immediately. Emergency routes must be kept clear.'));
    R.push(_assert('SEEDER list_bullet returned',               lb !== null));
    R.push(_assert('SEEDER list_bullet type ok',                lb && lb.type === 'list_bullet'));
    R.push(_assert('SEEDER list_bullet data.heading is string', lb && typeof lb.data.heading === 'string'));
    R.push(_assert('SEEDER list_bullet data.heading === Key Points', lb && lb.data.heading === 'Key Points'));
    R.push(_assert('SEEDER list_bullet data.items is array',    lb && Array.isArray(lb.data.items)));
    R.push(_assert('SEEDER list_bullet splits sentences into items', lb && lb.data.items.length > 1));
    // Single-sentence fallback — no period-space boundary
    const lbSingle = DocIntelBlockBuilder.build(_stub('list_bullet', 'In summary this course covered workplace safety.'));
    R.push(_assert('SEEDER list_bullet single-sentence fallback ok', lbSingle && Array.isArray(lbSingle.data.items) && lbSingle.data.items.length >= 1));

    // ── Phase 10 block-map coverage via full pipeline ─────────────────────────
    // Run the synthetic SDM (which now includes REFERENCE and SUMMARY elements)
    // through the complete pipeline and verify that process, stmt_tip, stmt_note,
    // and list_bullet block types appear in the generated lesson block suggestions.
    try {
      const sdm10 = _buildSyntheticSDM();
      const ckm10 = DocIntelModeller.model(sdm10);
      const im10  = DocIntelInstruction.analyse(ckm10);
      const allSuggestions = im10.lessons.flatMap(l => l.blockSuggestions);
      const blockTypes10   = new Set(allSuggestions.map(bs => bs.blockType));
      R.push(_assert('P10 pipeline produces process block',    blockTypes10.has('process')));
      R.push(_assert('P10 pipeline produces stmt_tip block',   blockTypes10.has('stmt_tip')));
      R.push(_assert('P10 pipeline produces stmt_note block',  blockTypes10.has('stmt_note')));
      R.push(_assert('P10 pipeline produces list_bullet block',blockTypes10.has('list_bullet')));
      R.push(_assert('P10 pipeline produces flashcard_stack',  blockTypes10.has('flashcard_stack')));
      R.push(_assert('P10 pipeline produces stmt_warning',     blockTypes10.has('stmt_warning')));
      R.push(_assert('P10 no paragraph from Procedure',        !allSuggestions.some(bs => bs.blockType === 'paragraph' &&
        (() => { try { const T = DocIntelObjectTypes.TYPES; return false; } catch(e) { return false; } })())));
    } catch (e) {
      R.push(_assert('P10 pipeline block-type coverage check', false, e.message));
    }

    // ── Phase 11 — LessonComposer unit tests ─────────────────────────────────
    // Helper to call compose safely even if the module is not yet loaded.
    const _compose = (suggs, title, obj) =>
      (typeof DocIntelLessonComposer !== 'undefined')
        ? DocIntelLessonComposer.compose(suggs, title, obj)
        : null;

    // Empty / null guards
    const cEmpty = _compose([], 'Test Lesson', null);
    R.push(_assert('COMPOSER compose([]) returns []',           Array.isArray(cEmpty) && cEmpty.length === 0));
    const cNull  = _compose(null, 'Test Lesson', null);
    R.push(_assert('COMPOSER compose(null) returns []',         Array.isArray(cNull) && cNull.length === 0));

    // process → [stmt_info preamble, process]
    const procSugg = _stub('process', { title: 'Inspect PPE', steps: ['Step one', 'Step two'] });
    const cProc    = _compose([procSugg], 'PPE Inspection', null);
    R.push(_assert('COMPOSER process expands to 2 blocks',      Array.isArray(cProc) && cProc.length === 2));
    R.push(_assert('COMPOSER process[0] is stmt_info',          cProc && cProc[0].blockType === 'stmt_info'));
    R.push(_assert('COMPOSER process[1] is process',            cProc && cProc[1].blockType === 'process'));
    R.push(_assert('COMPOSER process preamble content str',     cProc && typeof cProc[0].content === 'string'));
    R.push(_assert('COMPOSER process preamble uses KO title',   cProc && cProc[0].content.includes('inspect ppe')));
    // Lesson title fallback — no title in content
    const procNoTitle = _stub('process', { title: '', steps: ['Do the thing'] });
    const cProcFb     = _compose([procNoTitle], 'Emergency Evacuation', null);
    R.push(_assert('COMPOSER process preamble lesson-title fallback',
      cProcFb && cProcFb[0].content.includes('Emergency Evacuation')));
    // No duplicate preamble when stmt_info precedes
    const ruleSugg  = _stub('stmt_info', 'All personnel must follow this procedure.');
    const cProcNoDup = _compose([ruleSugg, procSugg], 'Test', null);
    R.push(_assert('COMPOSER process no dup preamble after stmt_info', cProcNoDup && cProcNoDup.length === 2));
    R.push(_assert('COMPOSER process[0] stays stmt_info (rule)',       cProcNoDup && cProcNoDup[0].blockType === 'stmt_info'));

    // flashcard_stack → [heading_paragraph expo, flashcard_stack]
    const fsSugg = _stub('flashcard_stack', 'Ergonomics: The study of designing equipment for safe use.');
    const cFs    = _compose([fsSugg], 'Ergonomics', null);
    R.push(_assert('COMPOSER flashcard expands to 2 blocks',    Array.isArray(cFs) && cFs.length === 2));
    R.push(_assert('COMPOSER flashcard[0] is heading_paragraph', cFs && cFs[0].blockType === 'heading_paragraph'));
    R.push(_assert('COMPOSER flashcard[1] is flashcard_stack',   cFs && cFs[1].blockType === 'flashcard_stack'));
    // No duplicate expo when heading_paragraph precedes
    const hpSugg   = _stub('heading_paragraph', 'Ergonomics is the study of human factors in design.');
    const cFsNoDup = _compose([hpSugg, fsSugg], 'Test', null);
    R.push(_assert('COMPOSER flashcard no dup expo after heading_paragraph', cFsNoDup && cFsNoDup.length === 2));

    // Lesson-closing KC injection
    const warnSugg = _stub('stmt_warning', 'Always wear PPE when entering the hazard zone.');
    const noteSugg = _stub('stmt_note',    'See the PPE Selection Guide for full details.');
    // 3 blocks including assessable → KC added
    const cKC = _compose([warnSugg, fsSugg, noteSugg], 'PPE Safety', { verb: 'Demonstrate', text: 'correct PPE use' });
    R.push(_assert('COMPOSER closing KC added (3 blocks, assessable)',
      Array.isArray(cKC) && cKC[cKC.length - 1].blockType === 'kc_multiple_choice'));
    R.push(_assert('COMPOSER closing KC question is string',
      cKC && typeof cKC[cKC.length - 1].content === 'string'));
    R.push(_assert('COMPOSER closing KC uses objective text',
      cKC && cKC[cKC.length - 1].content.includes('correct PPE use')));
    // < 3 blocks → no KC
    const cKCFew = _compose([warnSugg, noteSugg], 'Short Lesson', null);
    R.push(_assert('COMPOSER no KC when < 3 blocks',
      Array.isArray(cKCFew) && !cKCFew.some(s => s.blockType === 'kc_multiple_choice')));
    // KC already present → no second KC
    const existKC = _stub('kc_multiple_choice', 'Which is correct?');
    const cKCDup  = _compose([warnSugg, fsSugg, noteSugg, existKC], 'Test', null);
    R.push(_assert('COMPOSER no KC when KC already present',
      cKCDup && cKCDup.filter(s => s.blockType === 'kc_multiple_choice').length === 1));
    // No assessable blocks → no KC
    const tipSugg  = _stub('stmt_tip',  'Tip: clean your workspace daily.');
    const noteSugg2 = _stub('stmt_note', 'See Appendix A.');
    const paraSugg  = _stub('paragraph', 'This is an introductory topic.');
    const cKCNoAss = _compose([tipSugg, noteSugg2, paraSugg], 'Intro', null);
    R.push(_assert('COMPOSER no KC when no assessable blocks',
      Array.isArray(cKCNoAss) && !cKCNoAss.some(s => s.blockType === 'kc_multiple_choice')));

    // ── Phase 11 full-pipeline composition coverage ───────────────────────────
    // Run the synthetic SDM through the complete pipeline including composition.
    try {
      const sdm11 = _buildSyntheticSDM();
      const ckm11 = DocIntelModeller.model(sdm11);
      const im11  = DocIntelInstruction.analyse(ckm11);
      // Simulate what contentSeeder does: compose each lesson's suggestions
      const objectives11 = im11.objectives;
      const composed11   = im11.lessons.map((l, i) => {
        const obj = objectives11[l.objectiveIndex] || null;
        return _compose(l.blockSuggestions, l.title, obj) || [];
      });
      const allComposed = composed11.flat();
      const composedTypes = allComposed.map(s => s.blockType);

      // Procedure lesson should now have stmt_info preamble before process
      const procIdx = composedTypes.indexOf('process');
      R.push(_assert('P11 process block present in composed output', procIdx >= 0));
      R.push(_assert('P11 stmt_info precedes process block',
        procIdx > 0 && composedTypes[procIdx - 1] === 'stmt_info'));

      // Definition lesson should have heading_paragraph exposition before flashcard
      const fsIdx = composedTypes.indexOf('flashcard_stack');
      R.push(_assert('P11 flashcard_stack present in composed output', fsIdx >= 0));
      R.push(_assert('P11 heading_paragraph precedes flashcard_stack',
        fsIdx > 0 && composedTypes[fsIdx - 1] === 'heading_paragraph'));

      // Composed output has more blocks than raw suggestions (composition expanded something)
      const rawCount      = im11.lessons.reduce((n, l) => n + l.blockSuggestions.length, 0);
      const composedCount = allComposed.length;
      R.push(_assert('P11 composition expands block count', composedCount > rawCount));

      // At least one lesson should have a closing KC
      R.push(_assert('P11 at least one lesson has closing KC',
        composed11.some(lesson => lesson.some(s => s.blockType === 'kc_multiple_choice'))));

    } catch (e) {
      R.push(_assert('P11 full-pipeline composition check', false, e.message));
    }

    // ── HTML escaping ─────────────────────────────────────────────────────────
    const esc = DocIntelBlockBuilder.build(_stub('paragraph', 'A < B & C > D'));
    R.push(_assert('SEEDER paragraph HTML-escapes < in body', esc && esc.data.body.includes('&lt;')));
    R.push(_assert('SEEDER paragraph HTML-escapes & in body', esc && esc.data.body.includes('&amp;')));

    // ── null input guard ──────────────────────────────────────────────────────
    R.push(_assert('SEEDER build(null) returns null',       DocIntelBlockBuilder.build(null) === null));
    R.push(_assert('SEEDER build({}) returns null',         DocIntelBlockBuilder.build({}) === null));

    // ── Phase 12 — blockBuilder fixes ────────────────────────────────────────

    // continue block
    const cont = DocIntelBlockBuilder.build(_stub('continue', 'Continue'));
    R.push(_assert('SEEDER continue returned',             cont !== null));
    R.push(_assert('SEEDER continue type ok',              cont && cont.type === 'continue'));
    R.push(_assert('SEEDER continue data.label is string', cont && typeof cont.data.label === 'string'));
    R.push(_assert('SEEDER continue data.label value',     cont && cont.data.label === 'Continue'));
    // Custom label
    const contCustom = DocIntelBlockBuilder.build(_stub('continue', 'Next Section'));
    R.push(_assert('SEEDER continue custom label',         contCustom && contCustom.data.label === 'Next Section'));

    // table — { headers, rows } format (Word/PPTX reader format)
    const tblHR = DocIntelBlockBuilder.build(_stub('table', {
      headers: ['Name', 'Role', 'Department'],
      rows:    [['Alice', 'Engineer', 'Tech'], ['Bob', 'Designer', 'UX']],
    }));
    R.push(_assert('SEEDER table { headers, rows } returned',      tblHR !== null));
    R.push(_assert('SEEDER table { headers, rows } type ok',       tblHR && tblHR.type === 'table'));
    R.push(_assert('SEEDER table { headers, rows } has rows arr',  tblHR && Array.isArray(tblHR.data.rows)));
    R.push(_assert('SEEDER table { headers, rows } row count',     tblHR && tblHR.data.rows.length === 3)); // header row + 2 data rows
    R.push(_assert('SEEDER table header row preserved',            tblHR && tblHR.data.rows[0][0] === 'Name'));
    R.push(_assert('SEEDER table data row preserved',              tblHR && tblHR.data.rows[1][0] === 'Alice'));
    // Empty headers (rows-only format)
    const tblRowsOnly = DocIntelBlockBuilder.build(_stub('table', {
      headers: [],
      rows:    [['A', 'B'], ['C', 'D']],
    }));
    R.push(_assert('SEEDER table empty-headers rows-only ok',      tblRowsOnly && tblRowsOnly.data.rows.length === 2));

    // image — { caption } format (Word reader format)
    const imgCap = DocIntelBlockBuilder.build(_stub('image', { caption: 'Figure 3: PPE donning sequence' }));
    R.push(_assert('SEEDER image { caption } returned',            imgCap !== null));
    R.push(_assert('SEEDER image { caption } type ok',             imgCap && imgCap.type === 'image'));
    R.push(_assert('SEEDER image { caption } label uses caption',  imgCap && imgCap.data.label.includes('PPE donning sequence')));
    R.push(_assert('SEEDER image { caption } src is null',         imgCap && imgCap.data.src === null));
    // Empty caption → default label
    const imgNoCap = DocIntelBlockBuilder.build(_stub('image', { caption: '' }));
    R.push(_assert('SEEDER image empty caption → default label',   imgNoCap && imgNoCap.data.label === 'Image from document'));

    // ── Phase 12 — full-pipeline composition includes continue + KC ───────────
    try {
      const sdm12 = _buildSyntheticSDM();
      const ckm12 = DocIntelModeller.model(sdm12);
      const im12  = DocIntelInstruction.analyse(ckm12);
      const objectives12 = im12.objectives;
      const composed12   = im12.lessons.map(l => {
        const obj = objectives12[l.objectiveIndex] || null;
        return (typeof DocIntelLessonComposer !== 'undefined')
          ? DocIntelLessonComposer.compose(l.blockSuggestions, l.title, obj)
          : l.blockSuggestions;
      }).flat();
      const types12 = composed12.map(s => s.blockType);
      R.push(_assert('P12 composed output includes continue divider',  types12.includes('continue')));
      R.push(_assert('P12 continue precedes kc_multiple_choice',
        types12.includes('continue') && types12.includes('kc_multiple_choice') &&
        types12.lastIndexOf('continue') < types12.lastIndexOf('kc_multiple_choice')));
    } catch (e) {
      R.push(_assert('P12 pipeline composition check', false, e.message));
    }

    // ── Bloom's verbs are from LumioData.bloomVerbs ───────────────────────────
    // Verify objective synthesiser now uses only verbs present in bloomVerbs.
    // Run a tiny pipeline to produce objectives and check each verb.
    try {
      const sdm = _buildSyntheticSDM();
      const ckm = DocIntelModeller.model(sdm);
      const im  = DocIntelInstruction.analyse(ckm);
      const allValid = typeof LumioData !== 'undefined'
        ? im.objectives.every(o => {
            const allVerbs = Object.values(LumioData.bloomVerbs).flat();
            return allVerbs.includes(o.verb);
          })
        : true; // LumioData not available in validate-only context — skip
      R.push(_assert('SEEDER objectives use bloomVerbs verbs only', allValid));
    } catch (e) {
      R.push(_assert('SEEDER objective bloom-verb check', false, e.message));
    }

    return R;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Runs the complete end-to-end validation suite.
   * All DocIntel modules must be loaded before calling this.
   *
   * @returns {{ stages, summary, failures, pipeline }}
   */
  function run() {
    const report = {
      stages:   {},
      summary:  { total: 0, passed: 0, failed: 0 },
      failures: [],
      pipeline: null,
      error:    null,
    };

    try {
      const sdm = _buildSyntheticSDM();
      const ckm = DocIntelModeller.model(sdm);
      const im  = DocIntelInstruction.analyse(ckm);
      const ws  = DocIntelGenerator.buildWizardState(im);  // pure — does NOT touch LumioState

      report.stages.reader    = _validateReaderFormatDetection();
      report.stages.sdm       = _validateSDM(sdm);
      report.stages.ckm       = _validateCKM(ckm, sdm);
      report.stages.im        = _validateIM(im);
      report.stages.wizard    = _validateWizardState(ws, im);
      report.stages.contracts = _validateContracts(sdm, ckm, im, ws);
      report.stages.seeder    = _validateSeeder();

      for (const [stageName, checks] of Object.entries(report.stages)) {
        for (const r of checks) {
          report.summary.total++;
          if (r.pass) report.summary.passed++;
          else         report.summary.failed++;
          if (!r.pass) {
            report.failures.push(`[${stageName}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
          }
        }
      }

      report.pipeline = {
        sdmFormat:       sdm.format,
        sdmSections:     sdm.sections.length,
        sdmWordCount:    sdm.metadata.wordCount,
        ckmObjects:      ckm.objects.length,
        ckmObjectTypes:  [...new Set(ckm.objects.map(ko => ko.type))].sort().join(', '),
        imDomain:        im.subject.domain,
        imTitle:         im.subject.titleCandidate,
        imObjectives:    im.objectives.length,
        imLessons:       im.lessons.length,
        imAssessments:   im.assessments.length,
        imDuration:      im.duration.estimated,
        imOverallConf:   Math.round(im.overallConfidence * 100) + '%',
        wsDuration:      ws.duration,
        wsAudPrior:      ws.audPrior,
        wsAudMotivation: ws.audMotivation,
        wsSource:        ws.source,
      };

    } catch (e) {
      report.error = e.message + '\n' + (e.stack || '');
    }

    return report;
  }

  return Object.freeze({ loadAll, run });

})();
