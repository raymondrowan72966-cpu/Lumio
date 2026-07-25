/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Traceability
   Phase 1: Shared Infrastructure

   SourceReference construction and propagation utilities.
   Every value produced by Instructional Intelligence carries a
   SourceReference that traces it back to the originating section
   of the StructuredDocumentModel.

   The full chain is:
     wizard field
       → InstructionalModel field
         → knowledge object ID
           → SourceReference
             → document section + page range

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelTraceability = (() => {

  // ── ID generation ─────────────────────────────────────────────────────────
  //
  // Section IDs are assigned by the Document Reader.
  // Knowledge object IDs are assigned by the Knowledge Modeller's graphBuilder.
  // Both use this utility to produce stable, collision-resistant IDs.

  let _counter = 0;

  /**
   * Generates a stable, unique ID with the given prefix.
   * IDs are deterministic within a single engine run (counter-based).
   * @param {string} [prefix='id']
   * @returns {string}
   */
  function generateId(prefix = 'id') {
    return `${prefix}-${++_counter}`;
  }

  /** Resets the internal counter. Called once per engine run (by DocIntel.open). */
  function resetCounter() {
    _counter = 0;
  }

  // ── SourceReference construction ──────────────────────────────────────────

  /**
   * Creates a SourceReference linking an InstructionalModel decision
   * to the originating document section.
   *
   * @param {string}      sectionId       Stable section ID (from StructuredDocumentModel)
   * @param {string}      sectionTitle    Human-readable section label
   * @param {string|null} pageRange       e.g. "14–18", null for formats without page numbers
   * @param {number[]}    elementIndices  Indices of originating elements within the section
   * @param {string}      evidence        Human-readable explanation of why this is the origin
   * @returns {SourceReference}
   */
  function createRef(sectionId, sectionTitle, pageRange, elementIndices, evidence) {
    return {
      sectionId:      String(sectionId || ''),
      sectionTitle:   String(sectionTitle || ''),
      pageRange:      pageRange != null ? String(pageRange) : null,
      elementIndices: Array.isArray(elementIndices) ? [...elementIndices] : [],
      evidence:       String(evidence || ''),
    };
  }

  /**
   * Creates a null SourceReference for fields where traceability
   * cannot be established (e.g. a duration estimate derived from
   * aggregate statistics rather than a specific section).
   * @returns {SourceReference}
   */
  function nullRef() {
    return {
      sectionId:      '',
      sectionTitle:   '',
      pageRange:      null,
      elementIndices: [],
      evidence:       'not traceable to a specific section',
    };
  }

  /**
   * Propagates a SourceReference forward through the pipeline without mutation.
   * Produces a defensive copy so downstream phases cannot accidentally
   * modify upstream traceability records.
   * @param {SourceReference} ref
   * @returns {SourceReference}
   */
  function propagate(ref) {
    if (!ref) return nullRef();
    return {
      sectionId:      ref.sectionId      || '',
      sectionTitle:   ref.sectionTitle   || '',
      pageRange:      ref.pageRange      != null ? String(ref.pageRange) : null,
      elementIndices: Array.isArray(ref.elementIndices) ? [...ref.elementIndices] : [],
      evidence:       ref.evidence       || '',
    };
  }

  /**
   * Merges multiple SourceReferences into one when a decision spans
   * several sections (e.g. a lesson boundary that draws from two adjacent sections).
   * sectionId and sectionTitle reflect the primary (first) source.
   * pageRange spans from the earliest to the latest page mentioned.
   * elementIndices are combined and deduplicated.
   *
   * @param {SourceReference[]} refs
   * @param {string}            evidence  Evidence string for the merged reference
   * @returns {SourceReference}
   */
  function merge(refs, evidence) {
    if (!Array.isArray(refs) || refs.length === 0) return nullRef();
    if (refs.length === 1) return { ...propagate(refs[0]), evidence: evidence || refs[0].evidence };

    const primary = refs[0];

    // Collect all page numbers mentioned across refs to compute combined range
    const pages = [];
    for (const ref of refs) {
      if (ref.pageRange) {
        const parts = ref.pageRange.split('–').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        pages.push(...parts);
      }
    }
    const pageRange = pages.length >= 2
      ? `${Math.min(...pages)}–${Math.max(...pages)}`
      : pages.length === 1
        ? String(pages[0])
        : null;

    const allIndices = [...new Set(refs.flatMap(r => Array.isArray(r.elementIndices) ? r.elementIndices : []))];

    return {
      sectionId:      primary.sectionId      || '',
      sectionTitle:   primary.sectionTitle   || '',
      pageRange,
      elementIndices: allIndices,
      evidence:       String(evidence || primary.evidence || ''),
    };
  }

  /**
   * Formats a SourceReference as a human-readable label for debugging.
   * @param {SourceReference} ref
   * @returns {string}
   */
  function format(ref) {
    if (!ref || !ref.sectionId) return '[no traceability]';
    const page = ref.pageRange ? ` · pages ${ref.pageRange}` : '';
    return `${ref.sectionTitle || ref.sectionId}${page}`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({
    generateId,
    resetCounter,
    createRef,
    nullRef,
    propagate,
    merge,
    format,
  });

})();
