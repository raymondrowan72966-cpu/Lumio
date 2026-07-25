/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — Word Reader (.docx)
   Phase 2: Document Reader

   Converts a .docx File into a StructuredDocumentModel.
   Uses JSZip (already loaded globally) and the browser's
   built-in DOMParser. No additional dependencies.

   DOCX is a ZIP container. Key files extracted:
     word/document.xml   — body content (paragraphs, tables)
     word/styles.xml     — style definitions (heading levels)
     word/numbering.xml  — list format definitions

   Output: StructuredDocumentModel
   On failure: { error, message, format: 'docx' }

   No instructional reasoning. No knowledge classification.
   No Lumio integration of any kind.
   ============================================================ */

const DocIntelWordReader = (() => {

  // XML namespace for WordprocessingML elements
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

  // ── ZIP extraction helpers ────────────────────────────────────────────────

  async function _loadZip(file) {
    const buffer = await file.arrayBuffer();
    return JSZip.loadAsync(buffer);
  }

  async function _getXml(zip, path) {
    const entry = zip.file(path);
    if (!entry) return null;
    const text = await entry.async('text');
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  // ── Style map builder ─────────────────────────────────────────────────────
  // Scans word/styles.xml to build a map of styleId → heading level (1–6).
  // Heading detection relies on w:outlineLvl (0 = H1, 5 = H6).
  // Styles without outlineLvl are body/other styles.

  function _buildStyleMap(stylesXml) {
    const map = new Map(); // styleId → heading level (1-6) or null
    if (!stylesXml) return map;

    const styleEls = stylesXml.getElementsByTagNameNS(W, 'style');
    for (const style of styleEls) {
      const type    = style.getAttributeNS(W, 'type');
      const styleId = style.getAttributeNS(W, 'styleId');
      if (type !== 'paragraph' || !styleId) continue;

      // Primary: outlineLvl attribute in the style's pPr
      const pPrEls       = style.getElementsByTagNameNS(W, 'pPr');
      const outlineLvlEls = pPrEls.length
        ? pPrEls[0].getElementsByTagNameNS(W, 'outlineLvl')
        : [];

      if (outlineLvlEls.length) {
        const val = parseInt(outlineLvlEls[0].getAttributeNS(W, 'val') || '', 10);
        if (!isNaN(val) && val >= 0 && val <= 5) {
          map.set(styleId, val + 1); // outlineLvl 0 → H1, 5 → H6
          continue;
        }
      }

      // Fallback: common English heading style ID patterns
      const lower = styleId.toLowerCase();
      const match = lower.match(/^heading(\d)$/) || lower.match(/^h(\d)$/) || lower.match(/^kop(\d)$/);
      if (match) {
        const lvl = parseInt(match[1], 10);
        if (lvl >= 1 && lvl <= 6) map.set(styleId, lvl);
      }
    }
    return map;
  }

  // ── Numbering map builder ─────────────────────────────────────────────────
  // Maps numId → format type ('decimal' | 'bullet').
  // Used to distinguish numbered lists from bullet lists.

  function _buildNumberingMap(numberingXml) {
    const map = new Map(); // numId → 'decimal' | 'bullet'
    if (!numberingXml) return map;

    // abstractNumId → primary numFmt at ilvl 0
    const abstractMap = new Map();
    const abstractNums = numberingXml.getElementsByTagNameNS(W, 'abstractNum');
    for (const abs of abstractNums) {
      const absId = abs.getAttributeNS(W, 'abstractNumId');
      if (!absId) continue;
      // Find ilvl 0
      const lvls = abs.getElementsByTagNameNS(W, 'lvl');
      for (const lvl of lvls) {
        if (lvl.getAttributeNS(W, 'ilvl') !== '0') continue;
        const fmtEls = lvl.getElementsByTagNameNS(W, 'numFmt');
        if (fmtEls.length) {
          const fmt = fmtEls[0].getAttributeNS(W, 'val') || '';
          abstractMap.set(absId, fmt === 'bullet' || fmt === 'none' ? 'bullet' : 'decimal');
        }
      }
    }

    // numId → abstractNumId → format
    const nums = numberingXml.getElementsByTagNameNS(W, 'num');
    for (const num of nums) {
      const numId = num.getAttributeNS(W, 'numId');
      if (!numId) continue;
      const absIdEls = num.getElementsByTagNameNS(W, 'abstractNumId');
      if (!absIdEls.length) continue;
      const absId = absIdEls[0].getAttributeNS(W, 'val');
      const fmt   = abstractMap.get(absId) || 'decimal';
      map.set(numId, fmt);
    }

    return map;
  }

  // ── Paragraph helpers ─────────────────────────────────────────────────────

  function _getParaStyleId(para) {
    const pPrEls = para.getElementsByTagNameNS(W, 'pPr');
    if (!pPrEls.length) return null;
    const pStyleEls = pPrEls[0].getElementsByTagNameNS(W, 'pStyle');
    if (!pStyleEls.length) return null;
    return pStyleEls[0].getAttributeNS(W, 'val');
  }

  function _getParaNumId(para) {
    const pPrEls  = para.getElementsByTagNameNS(W, 'pPr');
    if (!pPrEls.length) return null;
    const numPrEls = pPrEls[0].getElementsByTagNameNS(W, 'numPr');
    if (!numPrEls.length) return null;
    const numIdEls = numPrEls[0].getElementsByTagNameNS(W, 'numId');
    if (!numIdEls.length) return null;
    return numIdEls[0].getAttributeNS(W, 'val');
  }

  function _extractParaText(para) {
    const runs = para.getElementsByTagNameNS(W, 'r');
    let text = '';
    for (const run of runs) {
      // Skip deleted text (w:del)
      if (run.parentNode && run.parentNode.localName === 'del') continue;
      const tEls = run.getElementsByTagNameNS(W, 't');
      for (const t of tEls) text += t.textContent || '';
    }
    return text;
  }

  function _hasImage(para) {
    // w:drawing signals an inline or floating image
    return para.getElementsByTagNameNS(W, 'drawing').length > 0 ||
           para.getElementsByTagNameNS(W, 'pict').length > 0;
  }

  // ── Table extraction ──────────────────────────────────────────────────────

  function _extractTable(tbl) {
    const rows  = tbl.getElementsByTagNameNS(W, 'tr');
    const table = { headers: [], rows: [] };
    let isFirst = true;

    for (const row of rows) {
      const cells = row.getElementsByTagNameNS(W, 'tc');
      const cellTexts = [];
      for (const cell of cells) {
        const paras = cell.getElementsByTagNameNS(W, 'p');
        const text = [...paras].map(p => _extractParaText(p)).join(' ').trim();
        cellTexts.push(text);
      }
      if (isFirst) {
        table.headers = cellTexts;
        isFirst = false;
      } else {
        table.rows.push(cellTexts);
      }
    }
    return table;
  }

  // ── Word count ────────────────────────────────────────────────────────────

  function _countWords(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  // ── Main reader ───────────────────────────────────────────────────────────

  /**
   * Reads a .docx file and returns a StructuredDocumentModel.
   * @param {File} file
   * @returns {Promise<StructuredDocumentModel|{error:string,message:string,format:string}>}
   */
  async function read(file) {
    let zip;
    try {
      zip = await _loadZip(file);
    } catch (e) {
      return { error: 'MALFORMED', message: 'Could not open file as a ZIP archive. The .docx may be corrupted.', format: 'docx' };
    }

    // Required: word/document.xml
    const docXml = await _getXml(zip, 'word/document.xml');
    if (!docXml) {
      return { error: 'MALFORMED', message: 'Missing word/document.xml — not a valid .docx file.', format: 'docx' };
    }

    // Parse error check
    if (docXml.querySelector('parsererror')) {
      return { error: 'MALFORMED', message: 'word/document.xml could not be parsed as XML.', format: 'docx' };
    }

    // Optional supporting files
    const stylesXml    = await _getXml(zip, 'word/styles.xml');
    const numberingXml = await _getXml(zip, 'word/numbering.xml');
    const styleMap     = _buildStyleMap(stylesXml);
    const numMap       = _buildNumberingMap(numberingXml);

    // Build the SDM
    const sdm = DocIntelModels.createSDM('docx');
    DocIntelTraceability.resetCounter();

    // Walk document body — top-level children are w:p (paragraph) or w:tbl (table)
    const body = docXml.getElementsByTagNameNS(W, 'body')[0];
    if (!body) {
      return { error: 'MALFORMED', message: 'word/document.xml has no <w:body> element.', format: 'docx' };
    }

    // Collect all top-level body children in document order
    // We use Array.from and filter for paragraph and table elements only
    const bodyChildren = [];
    for (const child of body.childNodes) {
      if (child.nodeType !== 1) continue; // element nodes only
      const ln = child.localName;
      if (ln === 'p' || ln === 'tbl' || ln === 'sdt') bodyChildren.push(child);
    }

    // State for section building
    let currentSection = null;
    let sectionIndex   = 0;
    let wordCount      = 0;
    let hasImages      = false;
    let hasTables      = false;
    let hasNumberedLists = false;
    let hasExplicitObjectives = false;

    // Pending list accumulator: consecutive list items → one list element
    let pendingListType  = null; // 'numberedList' | 'bulletList'
    let pendingListItems = [];
    let pendingListPage  = 1;
    let pendingListPos   = 0;

    function _flushList(targetSection) {
      if (!pendingListItems.length || !targetSection) return;
      const listEl = DocIntelModels.createSDMElement(
        pendingListType || 'bulletList',
        pendingListItems.slice(),
        pendingListPage,
        pendingListPos,
      );
      targetSection.elements.push(listEl);
      if (pendingListType === 'numberedList') hasNumberedLists = true;
      pendingListItems = [];
      pendingListType  = null;
    }

    function _ensureSection(heading, level, pageEst, sIdx) {
      const secId  = DocIntelTraceability.generateId('sec');
      const sec    = DocIntelModels.createSDMSection(secId, level, heading, pageEst, pageEst);
      sdm.sections.push(sec);
      return sec;
    }

    // Rough page estimation: running word count / 300 words per page
    function _estimatePage(totalWords) {
      return Math.max(1, Math.ceil(totalWords / 300));
    }

    // Root section for content before the first heading
    currentSection = _ensureSection(null, 0, 1, sectionIndex++);

    for (const child of bodyChildren) {
      const ln = child.localName;

      if (ln === 'tbl') {
        // Flush any pending list
        _flushList(currentSection);

        const tableData = _extractTable(child);
        const pageEst   = _estimatePage(wordCount);
        const tableEl   = DocIntelModels.createSDMElement('table', tableData, pageEst, 0.5);
        currentSection.elements.push(tableEl);
        hasTables = true;

        // Rough word count from table text
        const tableText = [...tableData.headers, ...tableData.rows.flat()].join(' ');
        wordCount += _countWords(tableText);
        continue;
      }

      if (ln === 'sdt') {
        // Structured document tag — extract any paragraphs inside
        const innerParas = child.getElementsByTagNameNS(W, 'p');
        for (const p of innerParas) bodyChildren.push(p);
        continue;
      }

      // ln === 'p' — paragraph
      const para = child;
      const text = _extractParaText(para);
      const pageEst = _estimatePage(wordCount);

      // Image detection
      if (_hasImage(para)) {
        _flushList(currentSection);
        const imgEl = DocIntelModels.createSDMElement('image', { caption: text || '' }, pageEst, 0.5);
        currentSection.elements.push(imgEl);
        hasImages = true;
        continue;
      }

      const styleId    = _getParaStyleId(para);
      let   headingLvl = styleId ? (styleMap.get(styleId) || null) : null;

      // Fallback: when styles.xml is absent or the style lacks outlineLvl,
      // infer heading level from the pStyle name (e.g. "Heading1", "Heading 1").
      if (headingLvl === null && styleId) {
        const low = styleId.toLowerCase().replace(/\s+/g, '');
        const hm  = low.match(/^heading(\d)$/) || low.match(/^h(\d)$/) || low.match(/^kop(\d)$/);
        if (hm) {
          const lvl = parseInt(hm[1], 10);
          if (lvl >= 1 && lvl <= 6) headingLvl = lvl;
        }
      }

      // ── Heading paragraph → start new section ────────────────────────────
      if (headingLvl !== null && text.trim()) {
        _flushList(currentSection);

        // Update page range of just-closed section
        const closedPage = _estimatePage(wordCount);
        currentSection.sourceLocation.pageEnd = Math.max(currentSection.sourceLocation.pageStart, closedPage);

        currentSection = _ensureSection(text.trim(), headingLvl, pageEst, sectionIndex++);
        wordCount += _countWords(text);

        // Heuristic: detect explicit objectives sections
        const lower = text.toLowerCase();
        if (lower.includes('objective') || lower.includes('learning outcome') || lower.includes('by the end')) {
          hasExplicitObjectives = true;
        }
        continue;
      }

      // ── List paragraph ────────────────────────────────────────────────────
      const numId = _getParaNumId(para);
      if (numId && numId !== '0' && text.trim()) {
        const fmt = numMap.get(numId) || 'decimal';
        const listType = fmt === 'bullet' ? 'bulletList' : 'numberedList';

        if (pendingListType && pendingListType !== listType) {
          _flushList(currentSection);
        }
        if (!pendingListType) {
          pendingListType = listType;
          pendingListPage = pageEst;
          pendingListPos  = 0.5;
        }
        pendingListItems.push(text.trim());
        wordCount += _countWords(text);
        continue;
      }

      // ── Regular paragraph ─────────────────────────────────────────────────
      _flushList(currentSection);

      if (!text.trim()) continue; // skip empty paragraphs

      // Detect callout patterns: short all-caps or Note:/Warning:/Tip: prefix
      const trimmed = text.trim();
      const isCallout = /^(note|warning|caution|tip|important|attention)[:\s]/i.test(trimmed) ||
                        (trimmed.length < 200 && trimmed === trimmed.toUpperCase() && trimmed.length > 3);

      const elType = isCallout ? 'callout' : 'paragraph';
      const paraEl = DocIntelModels.createSDMElement(elType, trimmed, pageEst, 0.5);
      currentSection.elements.push(paraEl);
      wordCount += _countWords(text);
    }

    // Flush any trailing list
    _flushList(currentSection);

    // Finalize last section page range
    const finalPage = _estimatePage(wordCount);
    if (currentSection) currentSection.sourceLocation.pageEnd = Math.max(currentSection.sourceLocation.pageStart, finalPage);

    // Remove empty root section if it has no content and there are other sections
    if (sdm.sections.length > 1 && sdm.sections[0].level === 0 && sdm.sections[0].elements.length === 0) {
      sdm.sections.shift();
    }

    // Populate metadata
    sdm.metadata.pageCount             = finalPage;
    sdm.metadata.wordCount             = wordCount;
    sdm.metadata.hasImages             = hasImages;
    sdm.metadata.hasTables             = hasTables;
    sdm.metadata.hasNumberedLists      = hasNumberedLists;
    sdm.metadata.hasExplicitObjectives = hasExplicitObjectives;

    return sdm;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({ read });

})();
