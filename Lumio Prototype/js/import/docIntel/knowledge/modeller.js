/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Knowledge Modeller
   Phase 3: Knowledge Modeller

   Orchestrator for the SDM → CKM transformation.
   The Knowledge Modeller is the second stage of the pipeline:

     Document Reader  →  [SDM]  →  Knowledge Modeller  →  [CKM]

   Pipeline:
     1. Receive a StructuredDocumentModel from Phase 2
     2. Delegate to DocIntelGraphBuilder to classify all elements
        and build the KnowledgeObject graph
     3. Populate CKM metadata from the resulting object array
     4. Return the populated CanonicalKnowledgeModel

   The CKM is format-agnostic — it carries no DOCX/PDF/PPTX
   artefacts. Phase 4 (Instructional Intelligence) operates
   exclusively on the CKM.

   Dependencies (global IIFE modules):
     - DocIntelModels       (models.js)
     - DocIntelObjectTypes  (knowledge/objectTypes.js)
     - DocIntelTraceability (traceability.js)
     - DocIntelClassifier   (knowledge/classifier.js)
     - DocIntelGraphBuilder (knowledge/graphBuilder.js)

   No imports from any existing Lumio subsystem.
   No application integration. No UI. No side effects.
   ============================================================ */

const DocIntelModeller = (() => {

  const T = DocIntelObjectTypes.TYPES;

  // ── Metadata derivation ───────────────────────────────────────────────────

  function _deriveMetadata(sdm, objects) {
    const types = new Set(objects.map(o => o.type));
    return {
      estimatedWordCount:    sdm.metadata.wordCount,
      objectCount:           objects.length,
      hasImages:             types.has(T.IMAGE),
      hasTables:             types.has(T.TABLE),
      hasProcedures:         types.has(T.PROCEDURE),
      hasExplicitObjectives: sdm.metadata.hasExplicitObjectives,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Transforms a StructuredDocumentModel into a CanonicalKnowledgeModel.
   *
   * @param {StructuredDocumentModel} sdm  Output of the Document Reader
   * @returns {CanonicalKnowledgeModel}
   * @throws {Error} if sdm is not a valid StructuredDocumentModel
   */
  function model(sdm) {
    if (!sdm || typeof sdm !== 'object' || !Array.isArray(sdm.sections)) {
      throw new Error('DocIntelModeller: expected a StructuredDocumentModel with sections[]');
    }
    if (!sdm.format || !['docx', 'pdf', 'pptx'].includes(sdm.format)) {
      throw new Error(`DocIntelModeller: unknown source format "${sdm.format}"`);
    }

    const ckm     = DocIntelModels.createCKM(sdm.format);
    const objects = DocIntelGraphBuilder.build(sdm);

    ckm.objects  = objects;
    const meta   = _deriveMetadata(sdm, objects);
    Object.assign(ckm.metadata, meta);

    return ckm;
  }

  return Object.freeze({ model });

})();
