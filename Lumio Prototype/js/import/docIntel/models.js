/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Models
   Phase 1: Shared Infrastructure

   Factory functions and type documentation for every data model
   that flows through the Document Intelligence Engine pipeline:

     StructuredDocumentModel  (Phase 1 → Phase K output)
     CanonicalKnowledgeModel  (Phase K → Phase 2 output)
     InstructionalModel       (Phase 2 → Phase 3 output)
     KnowledgeObject          (element of CanonicalKnowledgeModel)
     BlockSuggestion          (element of InstructionalModel)
     SourceReference          (traceability — carried by every decision)
     Confidence               (certainty — carried by every decision)
     DecisionRationale        (explainability — carried by every decision)

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelModels = (() => {

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _require(value, field) {
    if (value === undefined || value === null)
      throw new Error(`DocIntelModels: required field "${field}" is missing`);
    return value;
  }

  function _requireString(value, field) {
    _require(value, field);
    if (typeof value !== 'string' || value.trim() === '')
      throw new Error(`DocIntelModels: field "${field}" must be a non-empty string`);
    return value;
  }

  // ── SourceReference ───────────────────────────────────────────────────────
  //
  // Carried by every field produced by the Instructional Intelligence phase.
  // Provides the full chain: decision → knowledge object → document section → page.

  /**
   * @typedef {{
   *   sectionId:      string,
   *   sectionTitle:   string,
   *   pageRange:      string|null,
   *   elementIndices: number[],
   *   evidence:       string
   * }} SourceReference
   */

  /**
   * Creates a SourceReference.
   * @param {string}   sectionId       Stable section ID from the StructuredDocumentModel
   * @param {string}   sectionTitle    Human-readable section label
   * @param {string|null} pageRange    e.g. "14–18", null for formats without page numbers
   * @param {number[]} elementIndices  Indices of originating elements within the section
   * @param {string}   evidence        Human-readable reason this section was identified as the origin
   * @returns {SourceReference}
   */
  function createSourceRef(sectionId, sectionTitle, pageRange, elementIndices, evidence) {
    return {
      sectionId:      _requireString(sectionId, 'sectionId'),
      sectionTitle:   _requireString(sectionTitle, 'sectionTitle'),
      pageRange:      (pageRange !== null && pageRange !== undefined) ? String(pageRange) : null,
      elementIndices: Array.isArray(elementIndices) ? elementIndices : [],
      evidence:       _requireString(evidence, 'evidence'),
    };
  }

  /** A null SourceReference for fields where traceability cannot be established. */
  function nullSourceRef() {
    return { sectionId: '', sectionTitle: '', pageRange: null, elementIndices: [], evidence: 'not traceable' };
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  //
  // Carried by every inference produced by the Instructional Intelligence phase.
  // score: 0–1. basis: why the engine is this certain.

  /**
   * @typedef {{
   *   score:           number,
   *   basis:           string,
   *   fallbackApplied: boolean
   * }} Confidence
   */

  /**
   * Creates a Confidence object.
   * @param {number}  score           Normalised certainty (0–1)
   * @param {string}  basis           Machine-readable reason for this score
   * @param {boolean} [fallbackApplied=false] True if score was below threshold and output was simplified
   * @returns {Confidence}
   */
  function createConfidence(score, basis, fallbackApplied = false) {
    if (typeof score !== 'number' || score < 0 || score > 1)
      throw new Error(`DocIntelModels: confidence score must be a number between 0 and 1, got: ${score}`);
    return {
      score,
      basis:           _requireString(basis, 'basis'),
      fallbackApplied: Boolean(fallbackApplied),
    };
  }

  // ── DecisionRationale ─────────────────────────────────────────────────────
  //
  // Carried by every decision produced by the Instructional Intelligence phase.
  // Explains WHY a decision was made — distinct from Confidence (HOW certain).

  /**
   * @typedef {{
   *   text:                   string,
   *   signals:                string[],
   *   knowledgeObjectIds:     string[],
   *   decisionType:           string,
   *   alternativesConsidered: string[]
   * }} DecisionRationale
   */

  /**
   * Creates a DecisionRationale.
   * @param {string}   decisionType           One of the DECISION_TYPES constants
   * @param {string}   text                   Human-readable explanation in instructional design language
   * @param {string[]} signals                Knowledge object types or structural signals observed
   * @param {string[]} knowledgeObjectIds     IDs of the knowledge objects that triggered this decision
   * @param {string[]} [alternativesConsidered=[]] Alternatives the engine evaluated and rejected
   * @returns {DecisionRationale}
   */
  function createRationale(decisionType, text, signals, knowledgeObjectIds, alternativesConsidered = []) {
    return {
      decisionType:           _requireString(decisionType, 'decisionType'),
      text:                   _requireString(text, 'text'),
      signals:                Array.isArray(signals) ? signals : [],
      knowledgeObjectIds:     Array.isArray(knowledgeObjectIds) ? knowledgeObjectIds : [],
      alternativesConsidered: Array.isArray(alternativesConsidered) ? alternativesConsidered : [],
    };
  }

  // ── BlockSuggestion ───────────────────────────────────────────────────────
  //
  // Produced by the BlockRecommender. Lives inside InstructionalModel.lessons[].blockSuggestions[].
  // Keyed by objectiveIndex for ContentSeeder mapping after course creation.

  /**
   * @typedef {{
   *   blockType:          string,
   *   content:            string|string[]|object,
   *   knowledgeObjectId:  string,
   *   objectiveIndex:     number,
   *   source:             SourceReference,
   *   confidence:         Confidence,
   *   rationale:          DecisionRationale
   * }} BlockSuggestion
   */

  /**
   * Creates a BlockSuggestion.
   * @param {string}            blockType         Lumio block type identifier
   * @param {*}                 content           Normalised content for this block
   * @param {string}            knowledgeObjectId ID of the originating knowledge object
   * @param {number}            objectiveIndex    Index into wizard.objectives[] — keying key for ContentSeeder
   * @param {SourceReference}   source
   * @param {Confidence}        confidence
   * @param {DecisionRationale} rationale
   * @returns {BlockSuggestion}
   */
  function createBlockSuggestion(blockType, content, knowledgeObjectId, objectiveIndex, source, confidence, rationale) {
    return {
      blockType:         _requireString(blockType, 'blockType'),
      content:           _require(content, 'content'),
      knowledgeObjectId: _requireString(knowledgeObjectId, 'knowledgeObjectId'),
      objectiveIndex:    (typeof objectiveIndex === 'number') ? objectiveIndex : 0,
      source:            _require(source, 'source'),
      confidence:        _require(confidence, 'confidence'),
      rationale:         _require(rationale, 'rationale'),
    };
  }

  // ── KnowledgeObject ───────────────────────────────────────────────────────
  //
  // The canonical unit produced by the Knowledge Modeller (Phase K).
  // Every KnowledgeObject has a stable ID, a canonical type, normalised content,
  // an optional parent reference, and full source traceability.

  /**
   * @typedef {{
   *   id:       string,
   *   type:     string,
   *   content:  string|string[]|object,
   *   level:    number|null,
   *   parentId: string|null,
   *   source:   SourceReference
   * }} KnowledgeObject
   */

  /**
   * Creates a KnowledgeObject.
   * @param {string}          id       Stable unique identifier (assigned by graphBuilder)
   * @param {string}          type     One of DocIntelObjectTypes values
   * @param {*}               content  Normalised content — no format-specific markup
   * @param {number|null}     level    Hierarchy depth (null if not applicable)
   * @param {string|null}     parentId Parent object ID (null if root-level)
   * @param {SourceReference} source   Full traceability reference from Phase 1
   * @returns {KnowledgeObject}
   */
  function createKnowledgeObject(id, type, content, level, parentId, source) {
    return {
      id:       _requireString(id, 'id'),
      type:     _requireString(type, 'type'),
      content:  _require(content, 'content'),
      level:    (typeof level === 'number') ? level : null,
      parentId: (typeof parentId === 'string') ? parentId : null,
      source:   _require(source, 'source'),
    };
  }

  // ── StructuredDocumentModel ───────────────────────────────────────────────
  //
  // Output of Phase 1 (Document Reader). Retains format-specific structural
  // artefacts. Never seen by Phase 2. Consumed entirely by Phase K.

  /**
   * @typedef {'paragraph'|'numberedList'|'bulletList'|'table'|'image'|'callout'} SDMElementType
   *
   * @typedef {{ page: number, positionFraction: number }} SDMElementLocation
   *
   * @typedef {{
   *   type:           SDMElementType,
   *   content:        string|string[]|object,
   *   sourceLocation: SDMElementLocation
   * }} SDMElement
   *
   * @typedef {{ pageStart: number, pageEnd: number }} SDMSectionLocation
   *
   * @typedef {{
   *   id:             string,
   *   level:          number,
   *   heading:        string|null,
   *   elements:       SDMElement[],
   *   children:       SDMSection[],
   *   sourceLocation: SDMSectionLocation
   * }} SDMSection
   *
   * @typedef {{
   *   format:   'docx'|'pdf'|'pptx',
   *   metadata: {
   *     pageCount:              number,
   *     wordCount:              number,
   *     hasImages:              boolean,
   *     hasTables:              boolean,
   *     hasNumberedLists:       boolean,
   *     hasExplicitObjectives:  boolean
   *   },
   *   sections: SDMSection[]
   * }} StructuredDocumentModel
   */

  /**
   * Creates an empty StructuredDocumentModel. Readers populate sections[].
   * @param {'docx'|'pdf'|'pptx'} format
   * @returns {StructuredDocumentModel}
   */
  function createSDM(format) {
    if (!['docx', 'pdf', 'pptx'].includes(format))
      throw new Error(`DocIntelModels: unknown document format "${format}"`);
    return {
      format,
      metadata: {
        pageCount:             0,
        wordCount:             0,
        hasImages:             false,
        hasTables:             false,
        hasNumberedLists:      false,
        hasExplicitObjectives: false,
      },
      sections: [],
    };
  }

  /**
   * Creates an SDMSection.
   * @param {string}      id
   * @param {number}      level   0 = no heading
   * @param {string|null} heading
   * @param {number}      pageStart
   * @param {number}      pageEnd
   * @returns {SDMSection}
   */
  function createSDMSection(id, level, heading, pageStart, pageEnd) {
    return {
      id:             _requireString(id, 'id'),
      level:          typeof level === 'number' ? level : 0,
      heading:        heading || null,
      elements:       [],
      children:       [],
      sourceLocation: { pageStart: pageStart || 0, pageEnd: pageEnd || 0 },
    };
  }

  /**
   * Creates an SDMElement.
   * @param {SDMElementType} type
   * @param {*}              content
   * @param {number}         page
   * @param {number}         positionFraction  0–1 position within the page
   * @returns {SDMElement}
   */
  function createSDMElement(type, content, page, positionFraction) {
    const VALID_TYPES = ['paragraph', 'numberedList', 'bulletList', 'table', 'image', 'callout'];
    if (!VALID_TYPES.includes(type))
      throw new Error(`DocIntelModels: unknown SDM element type "${type}"`);
    return {
      type,
      content,
      sourceLocation: { page: page || 0, positionFraction: positionFraction || 0 },
    };
  }

  // ── CanonicalKnowledgeModel ───────────────────────────────────────────────
  //
  // Output of Phase K (Knowledge Modeller). Format-agnostic.
  // Phase 2 (Instructional Intelligence) operates exclusively on this model.
  // sourceFormat retained for diagnostics only — never used by Phase 2.

  /**
   * @typedef {{
   *   sourceFormat: 'docx'|'pdf'|'pptx',
   *   metadata: {
   *     estimatedWordCount:    number,
   *     objectCount:           number,
   *     hasImages:             boolean,
   *     hasTables:             boolean,
   *     hasProcedures:         boolean,
   *     hasExplicitObjectives: boolean
   *   },
   *   objects: KnowledgeObject[]
   * }} CanonicalKnowledgeModel
   */

  /**
   * Creates an empty CanonicalKnowledgeModel. Knowledge Modeller populates objects[].
   * @param {'docx'|'pdf'|'pptx'} sourceFormat
   * @returns {CanonicalKnowledgeModel}
   */
  function createCKM(sourceFormat) {
    if (!['docx', 'pdf', 'pptx'].includes(sourceFormat))
      throw new Error(`DocIntelModels: unknown source format "${sourceFormat}"`);
    return {
      sourceFormat,
      metadata: {
        estimatedWordCount:    0,
        objectCount:           0,
        hasImages:             false,
        hasTables:             false,
        hasProcedures:         false,
        hasExplicitObjectives: false,
      },
      objects: [],
    };
  }

  // ── InstructionalModel ────────────────────────────────────────────────────
  //
  // Output of Phase 2 (Instructional Intelligence). Every field carries
  // source + confidence + rationale. Consumed by Phase 3 (Course Generator).

  /**
   * @typedef {{
   *   verb: string,
   *   text: string,
   *   lessonIndex:    number,
   *   source:         SourceReference,
   *   confidence:     Confidence,
   *   rationale:      DecisionRationale
   * }} IMObjective
   *
   * @typedef {{
   *   title:            string,
   *   objectiveIndex:   number,
   *   estimatedMinutes: number,
   *   knowledgeObjectIds: string[],
   *   blockSuggestions: BlockSuggestion[],
   *   source:           SourceReference,
   *   confidence:       Confidence,
   *   rationale:        DecisionRationale,
   *   sequenceRationale: DecisionRationale
   * }} IMLessonPlan
   *
   * @typedef {{
   *   title:           string,
   *   type:            string,
   *   objectiveIndex:  number,
   *   knowledgeObjectIds: string[],
   *   source:          SourceReference,
   *   confidence:      Confidence,
   *   rationale:       DecisionRationale
   * }} IMAssessment
   *
   * @typedef {{
   *   subject: {
   *     titleCandidate: string, source: SourceReference, confidence: Confidence, rationale: DecisionRationale,
   *     domain:         string, domainConfidence: Confidence, domainRationale: DecisionRationale,
   *     summary:        string, summarySource: SourceReference
   *   },
   *   audience: {
   *     role:             string, roleSource: SourceReference, roleConfidence: Confidence, roleRationale: DecisionRationale,
   *     priorKnowledge:   string, priorConfidence: Confidence, priorRationale: DecisionRationale,
   *     motivation:       string, motivationConfidence: Confidence, motivationRationale: DecisionRationale
   *   },
   *   objectives:         IMObjective[],
   *   lessons:            IMLessonPlan[],
   *   assessments:        IMAssessment[],
   *   duration: { estimated: string, confidence: Confidence, rationale: DecisionRationale },
   *   overallConfidence:  number
   * }} InstructionalModel
   */

  /**
   * Creates an empty InstructionalModel shell.
   * The Instructional Intelligence sub-components populate each field.
   * @returns {InstructionalModel}
   */
  function createInstructionalModel() {
    return {
      subject: {
        titleCandidate:   '',  source: nullSourceRef(), confidence: createConfidence(0, 'uninitialised'), rationale: null,
        domain:           '',  domainConfidence: createConfidence(0, 'uninitialised'), domainRationale: null,
        summary:          '',  summarySource: nullSourceRef(),
      },
      audience: {
        role:             '',  roleSource: nullSourceRef(), roleConfidence: createConfidence(0, 'uninitialised'), roleRationale: null,
        priorKnowledge:   '',  priorConfidence: createConfidence(0, 'uninitialised'), priorRationale: null,
        motivation:       '',  motivationConfidence: createConfidence(0, 'uninitialised'), motivationRationale: null,
      },
      objectives:         [],
      lessons:            [],
      assessments:        [],
      duration: {
        estimated:  '',
        confidence: createConfidence(0, 'uninitialised'),
        rationale:  null,
      },
      overallConfidence: 0,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({
    // StructuredDocumentModel
    createSDM,
    createSDMSection,
    createSDMElement,

    // CanonicalKnowledgeModel
    createCKM,

    // InstructionalModel
    createInstructionalModel,

    // Shared decision metadata
    createSourceRef,
    nullSourceRef,
    createConfidence,
    createRationale,

    // Sub-model
    createKnowledgeObject,
    createBlockSuggestion,
  });

})();
