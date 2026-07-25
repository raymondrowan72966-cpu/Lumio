/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Block Builder
   Phase 9: Content Seeder | Phase 10: Instructional Block Optimisation

   Maps a BlockSuggestion (from Phase 4 BlockRecommender) to a
   Lumio block object ready to be stored in LumioState.lessons[id].

   The block shape matches what the Lesson Builder creates when a
   user drags a tile onto the canvas:
     { id: string, type: string, data: {} }

   The `data` field is populated with the minimum fields required
   for the block to render meaningfully in the Builder and
   Learner Preview. Every field the Builder reads via `block.data`
   is satisfied; design, behaviour, and meta are left at defaults
   (the Builder handles empty/missing design fields gracefully).

   Content text is HTML-escaped before storage — the Builder
   stores content as HTML in `data` fields and passes it through
   richTextOut()/sanitizeRichHtml(), so plain text with
   characters like <, >, & must be escaped to avoid corruption.

   Block types handled (from DocIntelBlockRecommender.BLOCK_MAP):
     paragraph          ← Topic (narrative prose fallback)
     heading_paragraph  ← Concept
     process            ← Procedure (interactive step-by-step)
     list_checkbox      ← Checklist
     list_bullet        ← Summary (key points as scannable bullets)
     stmt_info          ← Rule
     stmt_tip           ← Example (highlighted practical tip)
     stmt_warning       ← Warning
     stmt_note          ← Note, Reference (supplementary aside)
     flashcard_stack    ← Definition (active recall)
     table              ← Table
     image              ← Image
     kc_multiple_choice ← Question

   No imports from any existing Lumio subsystem beyond generating
   a unique block id. No UI. No side effects.
   ============================================================ */

const DocIntelBlockBuilder = (() => {

  // ── ID generation ─────────────────────────────────────────────────────────
  // Generates a block id in the same style as generateBlockId() in app.js
  // ('blk_' prefix) without depending on that function.

  let _seq = 1;
  function _makeId(type) {
    return `blk_di_${type}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;
  }

  // ── HTML escaping ──────────────────────────────────────────────────────────
  // The Builder stores rich-text content as HTML and passes it through
  // sanitizeRichHtml() at render time. Plain text must be escaped so that
  // characters such as < or & are not treated as markup.

  function _esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Title/body split ───────────────────────────────────────────────────────
  // Attempts to split a plain-text string into a short title and a body.
  // Used for heading_paragraph (Concept) and flashcard_stack (Definition).
  // Strategy: look for a colon or period boundary within maxTitleLen chars.

  function _splitTitleBody(text, maxTitleLen) {
    const s = String(text || '').trim();
    if (!s) return { title: '', body: '' };

    // Colon boundary (e.g. "Ergonomics: the study of ...")
    const colon = s.indexOf(':');
    if (colon > 0 && colon <= maxTitleLen) {
      return { title: s.slice(0, colon).trim(), body: s.slice(colon + 1).trim() };
    }

    // First sentence (period + space)
    const dot = s.search(/\.\s/);
    if (dot > 0 && dot <= maxTitleLen) {
      return { title: s.slice(0, dot + 1).trim(), body: s.slice(dot + 2).trim() };
    }

    // Truncate at maxTitleLen
    if (s.length > maxTitleLen) {
      return { title: s.slice(0, maxTitleLen).trim() + '…', body: s };
    }

    return { title: s, body: '' };
  }

  // ── Per-type data builders ─────────────────────────────────────────────────

  function _dataParagraph(content) {
    return { body: _esc(typeof content === 'string' ? content : '') };
  }

  function _dataHeadingParagraph(content) {
    const text = typeof content === 'string' ? content : '';
    const { title, body } = _splitTitleBody(text, 80);
    return {
      heading: _esc(title || text),
      body:    _esc(body),
    };
  }

  function _dataListNumbered(content) {
    // Procedure KO content: { title: string, steps: string[] } or a single string.
    if (content && typeof content === 'object' && Array.isArray(content.steps)) {
      return {
        heading: _esc(content.title || 'Steps'),
        items:   content.steps.map(s => ({ text: _esc(String(s || '')) })),
      };
    }
    const text = typeof content === 'string' ? content : '';
    return {
      heading: 'Steps',
      items:   [{ text: _esc(text) }],
    };
  }

  function _dataProcess(content) {
    // Procedure KO content: { title: string, steps: string[] } or a single string.
    // Process block data shape: { items: [{ title: string, body: string }] }
    // Each step becomes one panel in the interactive stepper.
    if (content && typeof content === 'object' && Array.isArray(content.steps)) {
      return {
        items: content.steps.map((s, i) => ({
          title: `Step ${i + 1}`,
          body:  _esc(String(s || '')),
        })),
      };
    }
    const text = typeof content === 'string' ? content : '';
    return { items: [{ title: 'Step 1', body: _esc(text) }] };
  }

  function _dataStmtTip(content) {
    // Example KO content: string. Rendered as a Tip statement with a 💡 icon
    // to visually distinguish practical examples from core rule content.
    return {
      title: 'Example',
      text:  _esc(typeof content === 'string' ? content : ''),
    };
  }

  function _dataListBullet(content) {
    // Summary KO content: a prose summary string. Split into individual bullet
    // points by sentence boundary so the learner can scan key takeaways quickly.
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return { heading: 'Key Points', items: [{ text: '' }] };
    // Split on ". " or ".\n" — each sentence becomes one bullet point.
    const sentences = text
      .split(/\.\s+|\.\n/)
      .map(s => s.replace(/\.$/, '').trim())
      .filter(Boolean);
    const items = sentences.length > 1
      ? sentences.map(s => ({ text: _esc(s) }))
      : [{ text: _esc(text) }];
    return { heading: 'Key Points', items };
  }

  function _dataListCheckbox(content) {
    // Checklist KO content: string[] of items.
    const items = Array.isArray(content)
      ? content.map(s => ({ text: _esc(String(s || '')) }))
      : [{ text: _esc(typeof content === 'string' ? content : '') }];
    return { heading: 'Checklist', items };
  }

  function _dataStatement(title, content) {
    return {
      title: title,
      text:  _esc(typeof content === 'string' ? content : ''),
    };
  }

  function _dataFlashcardStack(content) {
    // Definition KO content: typically a string with "term: definition" structure.
    // Attempt to split at a colon or first sentence for term/definition sides.
    const text = typeof content === 'string' ? content : '';
    const { title: term, body: def } = _splitTitleBody(text, 60);
    return {
      items: [{
        front: { text: _esc(term || text), image: null, imageFit: 'cover' },
        back:  { text: _esc(def  || text), image: null, imageFit: 'cover' },
      }],
    };
  }

  function _dataTable(content) {
    // Format A: { headers: string[], rows: string[][] } — produced by Word and PPTX readers.
    if (content && typeof content === 'object' && !Array.isArray(content) && Array.isArray(content.headers)) {
      const combined = content.headers.length
        ? [content.headers, ...content.rows]
        : content.rows;
      if (Array.isArray(combined) && combined.length > 0) {
        return { rows: combined.map(row => row.map(cell => _esc(String(cell == null ? '' : cell)))) };
      }
    }
    // Format B: 2D array directly.
    if (Array.isArray(content) && content.length > 0 && Array.isArray(content[0])) {
      return {
        rows: content.map(row => row.map(cell => _esc(String(cell == null ? '' : cell)))),
      };
    }
    // Fallback placeholder.
    return {
      rows: [['Column 1', 'Column 2'], [_esc(typeof content === 'string' ? content : ''), '']],
    };
  }

  function _dataImage(content) {
    // Image KO: no file extraction possible; render an informative placeholder.
    // Content from Word/PPTX readers arrives as { caption: string }.
    let label = 'Image from document';
    if (typeof content === 'string' && content.trim()) {
      label = content.trim();
    } else if (content && typeof content === 'object' &&
               typeof content.caption === 'string' && content.caption.trim()) {
      label = content.caption.trim();
    }
    return { src: null, label: _esc(label), alt: '' };
  }

  function _dataContinue(content) {
    // Pacing divider — label is displayed as the button text the learner clicks.
    const label = typeof content === 'string' && content.trim() ? content.trim() : 'Continue';
    return { label: _esc(label) };
  }

  function _dataKcMultipleChoice(content) {
    // Question KO content: the question text. Answers are placeholder stubs —
    // the author fills in real options in the Builder content panel.
    return {
      question: _esc(typeof content === 'string' ? content : ''),
      options:  ['Option A', 'Option B', 'Option C'],
      correct:  0,
    };
  }

  // ── Block type dispatch ────────────────────────────────────────────────────

  function _buildData(blockType, content) {
    switch (blockType) {
      case 'paragraph':          return _dataParagraph(content);
      case 'heading_paragraph':  return _dataHeadingParagraph(content);
      case 'list_numbered':      return _dataListNumbered(content);
      case 'list_checkbox':      return _dataListCheckbox(content);
      case 'list_bullet':        return _dataListBullet(content);
      case 'process':            return _dataProcess(content);
      case 'stmt_info':          return _dataStatement('Rule',    content);
      case 'stmt_tip':           return _dataStmtTip(content);
      case 'stmt_warning':       return _dataStatement('Warning', content);
      case 'stmt_note':          return _dataStatement('Note',    content);
      case 'flashcard_stack':    return _dataFlashcardStack(content);
      case 'table':              return _dataTable(content);
      case 'image':              return _dataImage(content);
      case 'kc_multiple_choice': return _dataKcMultipleChoice(content);
      case 'continue':           return _dataContinue(content);
      default:                   return _dataParagraph(content);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Builds a Lumio block from a BlockSuggestion.
   * Returns null if the suggestion is invalid.
   *
   * @param {BlockSuggestion} suggestion  Output of DocIntelBlockRecommender
   * @returns {{ id: string, type: string, data: object }|null}
   */
  function build(suggestion) {
    if (!suggestion || typeof suggestion.blockType !== 'string') return null;
    return {
      id:   _makeId(suggestion.blockType),
      type: suggestion.blockType,
      data: _buildData(suggestion.blockType, suggestion.content),
    };
  }

  return Object.freeze({ build });

})();
