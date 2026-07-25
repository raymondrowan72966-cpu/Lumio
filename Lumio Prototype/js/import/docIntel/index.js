/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Public Entry Point
   Phase 5: Course Generator

   Top-level namespace for the Document Intelligence Engine.
   Exposes the full pipeline as a single async entry point.

   Pipeline:
     File → DocIntelReader.read()       → StructuredDocumentModel
          → DocIntelModeller.model()    → CanonicalKnowledgeModel
          → DocIntelInstruction.analyse()→ InstructionalModel
          → DocIntelGenerator.generate()→ LumioState.wizard

   Usage (Phase 8 UI layer):
     await DocIntel.run(file);
     navigate('#/wizard');

   Phase 9 adds DocIntel.ContentSeeder (content population after
   course creation). Nothing else is added to this namespace.

   Dependencies (all global IIFE modules, loaded before this file):
     - DocIntelReader      (reader/index.js)
     - DocIntelModeller    (knowledge/modeller.js)
     - DocIntelInstruction (instruction/index.js)
     - DocIntelGenerator   (generator/index.js)

   No imports from any existing Lumio subsystem beyond LumioState.
   ============================================================ */

const DocIntel = (() => {

  /**
   * Runs the full Document Intelligence pipeline on an uploaded File.
   *
   * Reads the document, extracts knowledge, derives an instructional
   * design, and writes the result to LumioState.wizard. After this
   * resolves, the wizard is ready; the caller navigates to '#/wizard'.
   *
   * @param {File} file  Uploaded document (.docx, .pdf, or .pptx)
   * @returns {Promise<void>}
   * @throws {Error} On unsupported format, parse failure, or pipeline error
   */
  async function run(file) {
    const sdm = await DocIntelReader.read(file);

    // Reader returns typed error objects on failure — propagate with user-friendly message.
    if (sdm && sdm.error) {
      throw new Error(sdm.message || `Could not read document (${sdm.error})`);
    }

    const ckm = DocIntelModeller.model(sdm);
    const im  = DocIntelInstruction.analyse(ckm);

    // Guard against documents that yield no learnable content (image-only, header-only, etc.).
    if (!Array.isArray(im.lessons) || im.lessons.length === 0) {
      throw new Error(
        'No learnable content was found in this document. ' +
        'Ensure the document contains headings and body text.',
      );
    }

    DocIntelGenerator.generate(im);
  }

  return Object.freeze({ run });

})();
