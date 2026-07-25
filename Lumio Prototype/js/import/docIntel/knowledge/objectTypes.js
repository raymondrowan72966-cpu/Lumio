/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Knowledge Object Types
   Phase 1: Shared Infrastructure

   Canonical KnowledgeObjectType enum and metadata.
   These are the 16 logical knowledge types that the Knowledge
   Modeller (Phase K) uses to classify every content element
   extracted from any supported document format.

   These are logical knowledge objects — not UI blocks, not
   instructional decisions. Classification is by what the content
   IS, not what it should become in the Builder.

   The BlockRecommender (Phase 2) uses these types as its input
   to recommend Lumio block types. The mapping from knowledge
   type to block type lives in blockRecommender.js (Phase 2),
   not here.

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelObjectTypes = (() => {

  // ── Canonical type enum ───────────────────────────────────────────────────

  /**
   * The 16 canonical KnowledgeObjectTypes.
   * All Phase 2 sub-components operate exclusively on these types.
   * Adding a new type: add it here, add a description below,
   * add the mapping rule in blockRecommender.js.
   */
  const TYPES = Object.freeze({
    HEADING:   'Heading',    // A titled section marker at a given hierarchy level
    TOPIC:     'Topic',      // A coherent body of prose on a single subject
    CONCEPT:   'Concept',    // An explanation of an idea, principle, or construct
    DEFINITION:'Definition', // A term paired with its precise meaning
    RULE:      'Rule',       // A constraint, policy, or requirement
    PROCEDURE: 'Procedure',  // A named, ordered sequence of steps toward a goal
    STEP:      'Step',       // A single action within a Procedure (child of PROCEDURE)
    WARNING:   'Warning',    // A safety notice, caution, or danger alert
    EXAMPLE:   'Example',    // An illustrative instance of a concept or rule
    REFERENCE: 'Reference',  // A pointer to an external resource or standard
    TABLE:     'Table',      // Structured comparative or lookup data
    IMAGE:     'Image',      // A visual asset with optional caption
    QUESTION:  'Question',   // An interrogative that invites or tests recall
    CHECKLIST: 'Checklist',  // A list of verifiable action items or criteria
    NOTE:      'Note',       // A supplementary observation or aside
    SUMMARY:   'Summary',    // A condensed restatement of prior content
  });

  const ALL_TYPES = new Set(Object.values(TYPES));

  // ── Type metadata ─────────────────────────────────────────────────────────
  //
  // Used by the Knowledge Modeller adapters and the Instructional Intelligence
  // sub-components to understand the properties of each type.

  const META = Object.freeze({
    [TYPES.HEADING]:   { description: 'A titled section marker at a given hierarchy level',     isContainer: true,  isAssessable: false, isStructural: true  },
    [TYPES.TOPIC]:     { description: 'A coherent body of prose on a single subject',           isContainer: false, isAssessable: false, isStructural: false },
    [TYPES.CONCEPT]:   { description: 'An explanation of an idea, principle, or construct',     isContainer: false, isAssessable: true,  isStructural: false },
    [TYPES.DEFINITION]:{ description: 'A term paired with its precise meaning',                 isContainer: false, isAssessable: true,  isStructural: false },
    [TYPES.RULE]:      { description: 'A constraint, policy, or requirement',                   isContainer: false, isAssessable: true,  isStructural: false },
    [TYPES.PROCEDURE]: { description: 'A named, ordered sequence of steps toward a goal',       isContainer: true,  isAssessable: true,  isStructural: false },
    [TYPES.STEP]:      { description: 'A single action within a Procedure',                     isContainer: false, isAssessable: false, isStructural: false },
    [TYPES.WARNING]:   { description: 'A safety notice, caution, or danger alert',              isContainer: false, isAssessable: true,  isStructural: false },
    [TYPES.EXAMPLE]:   { description: 'An illustrative instance of a concept or rule',          isContainer: false, isAssessable: false, isStructural: false },
    [TYPES.REFERENCE]: { description: 'A pointer to an external resource or standard',          isContainer: false, isAssessable: false, isStructural: false },
    [TYPES.TABLE]:     { description: 'Structured comparative or lookup data',                  isContainer: false, isAssessable: false, isStructural: false },
    [TYPES.IMAGE]:     { description: 'A visual asset with optional caption',                   isContainer: false, isAssessable: false, isStructural: false },
    [TYPES.QUESTION]:  { description: 'An interrogative that invites or tests recall',          isContainer: false, isAssessable: true,  isStructural: false },
    [TYPES.CHECKLIST]: { description: 'A list of verifiable action items or criteria',          isContainer: false, isAssessable: true,  isStructural: false },
    [TYPES.NOTE]:      { description: 'A supplementary observation or aside',                   isContainer: false, isAssessable: false, isStructural: false },
    [TYPES.SUMMARY]:   { description: 'A condensed restatement of prior content',               isContainer: false, isAssessable: false, isStructural: false },
  });

  // ── Groupings used by Phase 2 sub-components ─────────────────────────────
  //
  // Pre-built sets that the Instructional Intelligence sub-components
  // use to query the knowledge object graph efficiently.

  /** Types that are assessable — used by AssessmentDesigner to find verification candidates. */
  const ASSESSABLE = Object.freeze(
    new Set(Object.entries(META).filter(([, m]) => m.isAssessable).map(([t]) => t))
  );

  /** Types that act as structural containers — used by LessonPlanner for boundary detection. */
  const STRUCTURAL = Object.freeze(
    new Set(Object.entries(META).filter(([, m]) => m.isStructural).map(([t]) => t))
  );

  /** Types that indicate high-consequence content — used by AssessmentDesigner for domain weighting. */
  const HIGH_CONSEQUENCE = Object.freeze(new Set([TYPES.RULE, TYPES.WARNING, TYPES.PROCEDURE]));

  /** Types that indicate procedural / how-to content — used by DurationEstimator for multipliers. */
  const PROCEDURAL = Object.freeze(new Set([TYPES.PROCEDURE, TYPES.STEP, TYPES.CHECKLIST]));

  /** Types that are definitional — used by AudienceProfiler and ObjectiveSynthesiser. */
  const DEFINITIONAL = Object.freeze(new Set([TYPES.DEFINITION, TYPES.CONCEPT, TYPES.RULE]));

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Returns true if the given type string is a valid canonical type.
   * @param {string} type
   * @returns {boolean}
   */
  function isValid(type) {
    return ALL_TYPES.has(type);
  }

  /**
   * Returns the metadata record for a given type.
   * Returns null if the type is unknown.
   * @param {string} type
   * @returns {{ description: string, isContainer: boolean, isAssessable: boolean, isStructural: boolean }|null}
   */
  function getMeta(type) {
    return META[type] || null;
  }

  /**
   * Returns true if the given type belongs to the provided Set of types.
   * Convenience wrapper for set membership checks in sub-components.
   * @param {string}  type
   * @param {Set<string>} group
   * @returns {boolean}
   */
  function inGroup(type, group) {
    return group.has(type);
  }

  /**
   * Counts knowledge objects of each type in the given array.
   * Returns a plain object keyed by type string with counts as values.
   * Types with zero occurrences are not included.
   * @param {KnowledgeObject[]} objects
   * @returns {Object.<string, number>}
   */
  function countByType(objects) {
    const counts = {};
    for (const obj of objects) {
      counts[obj.type] = (counts[obj.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Filters a knowledge object array to objects of the given type(s).
   * @param {KnowledgeObject[]}  objects
   * @param {string|string[]}    types    One type or array of types
   * @returns {KnowledgeObject[]}
   */
  function ofType(objects, types) {
    const filter = new Set(Array.isArray(types) ? types : [types]);
    return objects.filter(o => filter.has(o.type));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({
    // Enum
    TYPES,

    // Pre-built groupings
    ASSESSABLE,
    STRUCTURAL,
    HIGH_CONSEQUENCE,
    PROCEDURAL,
    DEFINITIONAL,

    // Utilities
    isValid,
    getMeta,
    inGroup,
    countByType,
    ofType,
  });

})();
