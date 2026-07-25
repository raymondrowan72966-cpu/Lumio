/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Reader Index
   Phase 2: Document Reader

   Format detection and routing.
   Routes a File object to the correct format-specific reader.
   Returns a StructuredDocumentModel or a typed error object.

   Supported formats: .docx, .pdf, .pptx
   Unsupported formats return { error: 'UNSUPPORTED_FORMAT' }.

   This module has no knowledge of:
     - Knowledge Modeller
     - Instructional Intelligence
     - Course Generator
     - Wizard, Builder, or any existing Lumio system

   Dependencies (global IIFE modules):
     - DocIntelWordReader (wordReader.js)
     - DocIntelPdfReader  (pdfReader.js)
     - DocIntelPptxReader (pptxReader.js)
   ============================================================ */

const DocIntelReader = (() => {

  // ── Supported format registry ─────────────────────────────────────────────

  const SUPPORTED = Object.freeze({
    docx: 'docx',
    pdf:  'pdf',
    pptx: 'pptx',
  });

  // MIME types as a secondary detection signal (not sole authority)
  const MIME_MAP = Object.freeze({
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  });

  // ── Format detection ──────────────────────────────────────────────────────

  /**
   * Detects the document format from filename extension and optionally MIME type.
   * Extension is the primary signal; MIME is used as a fallback.
   * @param {File} file
   * @returns {'docx'|'pdf'|'pptx'|null}
   */
  function detectFormat(file) {
    const nameParts = file.name.split('.');
    const ext = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : '';
    if (SUPPORTED[ext]) return SUPPORTED[ext];
    // Fallback to MIME if extension is ambiguous or missing
    if (file.type && MIME_MAP[file.type]) return MIME_MAP[file.type];
    return null;
  }

  // ── Error constructors ────────────────────────────────────────────────────

  function _unsupportedFormat(file) {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : '(none)';
    return {
      error:   'UNSUPPORTED_FORMAT',
      message: `".${ext}" is not a supported format. Supported formats: .docx, .pdf, .pptx`,
      filename: file.name,
    };
  }

  function _parseError(format, err) {
    return {
      error:   'PARSE_ERROR',
      message: err.message || String(err),
      format,
    };
  }

  // ── Main entry point ──────────────────────────────────────────────────────

  /**
   * Reads a document file and returns a StructuredDocumentModel.
   * On any failure returns a typed error object instead of throwing.
   *
   * @param {File} file
   * @returns {Promise<StructuredDocumentModel|{error:string, message:string}>}
   */
  async function read(file) {
    if (!(file instanceof File) && !(file instanceof Blob)) {
      return { error: 'INVALID_INPUT', message: 'Expected a File or Blob object.' };
    }

    const format = detectFormat(file);
    if (!format) return _unsupportedFormat(file);

    try {
      switch (format) {
        case 'docx': return await DocIntelWordReader.read(file);
        case 'pdf':  return await DocIntelPdfReader.read(file);
        case 'pptx': return await DocIntelPptxReader.read(file);
        default:     return _unsupportedFormat(file);
      }
    } catch (err) {
      console.warn('[DocIntel:Reader] Unhandled error during document read:', err);
      return _parseError(format, err);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({
    read,
    detectFormat,
    SUPPORTED,
  });

})();
