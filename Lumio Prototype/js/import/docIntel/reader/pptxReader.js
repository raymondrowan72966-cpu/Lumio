/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — PowerPoint Reader (.pptx)
   Phase 2: Document Reader

   Converts a .pptx File into a StructuredDocumentModel.
   Uses JSZip (already loaded globally) and the browser's
   built-in DOMParser. No additional dependencies.

   PPTX is a ZIP container. Key files:
     ppt/presentation.xml            — slide count + ordering
     ppt/_rels/presentation.xml.rels — slide rId → filename map
     ppt/slides/slide{N}.xml         — slide content (title, body, notes)

   Mapping:
     Each slide → one SDM section
     Title placeholder → section heading
     Body placeholder → paragraph/list/table elements
     Speaker notes → Note elements

   Output: StructuredDocumentModel
   On failure: { error, message, format: 'pptx' }

   No instructional reasoning. No knowledge classification.
   No Lumio integration of any kind.
   ============================================================ */

const DocIntelPptxReader = (() => {

  // XML namespaces used in PPTX files
  const NS_P  = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const NS_A  = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_R  = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';

  // ── ZIP helpers ────────────────────────────────────────────────────────────

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

  // ── Slide order from presentation.xml.rels ─────────────────────────────────
  // Returns an ordered array of slide file paths relative to the ppt/ directory,
  // e.g. ['slides/slide1.xml', 'slides/slide2.xml', ...]

  async function _getSlideOrder(zip) {
    // Build rId → target map from the relationships file
    const relsXml = await _getXml(zip, 'ppt/_rels/presentation.xml.rels');
    if (!relsXml) return [];

    const rIdToTarget = new Map();
    const relEls = relsXml.getElementsByTagNameNS(NS_PKG_R, 'Relationship');
    for (const rel of relEls) {
      const type   = rel.getAttribute('Type') || '';
      const rId    = rel.getAttribute('Id')     || '';
      const target = rel.getAttribute('Target') || '';
      // Only slide relationships (not slideMasters, layouts, etc.)
      if (type.endsWith('/slide') && rId) {
        // Target may be 'slides/slideN.xml' or '../slides/slideN.xml'
        const normalised = target.replace(/^\.\.\//, '');
        rIdToTarget.set(rId, normalised);
      }
    }

    // Slide order from presentation.xml sldIdLst
    const presXml = await _getXml(zip, 'ppt/presentation.xml');
    if (!presXml) return [...rIdToTarget.values()];

    const sldIdEls = presXml.getElementsByTagNameNS(NS_P, 'sldId');
    const ordered  = [];
    for (const sldId of sldIdEls) {
      // r:id attribute points to the relationship ID
      const rId = sldId.getAttributeNS(NS_R, 'id');
      if (rId && rIdToTarget.has(rId)) {
        ordered.push(rIdToTarget.get(rId));
      }
    }

    // Fallback: if sldIdLst is missing, return whatever we got from rels
    return ordered.length ? ordered : [...rIdToTarget.values()];
  }

  // ── DrawingML text extraction ──────────────────────────────────────────────
  // Extracts all text from an <a:txBody> element.
  // Paragraphs are separated; runs within a paragraph are concatenated.

  function _extractTxBody(txBody) {
    if (!txBody) return { paragraphs: [], text: '' };
    const aParas = txBody.getElementsByTagNameNS(NS_A, 'p');
    const paragraphs = [];

    for (const para of aParas) {
      // Each <a:r> run contains an <a:t> text element
      const runs = para.getElementsByTagNameNS(NS_A, 'r');
      let lineText = '';
      for (const run of runs) {
        const tEls = run.getElementsByTagNameNS(NS_A, 't');
        for (const t of tEls) lineText += t.textContent || '';
      }
      if (lineText.trim()) paragraphs.push(lineText.trim());
    }

    return { paragraphs, text: paragraphs.join('\n') };
  }

  // ── Placeholder type detection ─────────────────────────────────────────────
  // PPTX placeholders carry a type attribute on <p:ph>.
  // Recognised title types: 'title', 'ctrTitle', 'subTitle'
  // Body types: 'body', 'obj', untyped (default body)

  function _getPlaceholderType(spEl) {
    const spPrEl = spEl.getElementsByTagNameNS(NS_P, 'sp')[0] ||
                   (spEl.localName === 'sp' ? spEl : null);
    if (!spPrEl) return null;

    const nvSpPrEls = spPrEl.getElementsByTagNameNS(NS_P, 'nvSpPr');
    if (!nvSpPrEls.length) return null;

    const nvPrEls = nvSpPrEls[0].getElementsByTagNameNS(NS_P, 'nvPr');
    if (!nvPrEls.length) return null;

    const phEls = nvPrEls[0].getElementsByTagNameNS(NS_P, 'ph');
    if (!phEls.length) return null;

    const typeAttr = phEls[0].getAttribute('type');
    return typeAttr || 'body'; // untyped placeholder defaults to body
  }

  // ── Numbered list detection ────────────────────────────────────────────────
  // Checks a DrawingML txBody for numbered-list signals:
  //   1. Any paragraph's pPr contains <a:buAutoNum> → explicit auto-numbering
  //   2. Majority of paragraphs start with "N." or "N)" patterns → implicit numbering
  // Returns true when the content should be treated as a numberedList.

  function _isNumberedList(txBody) {
    const paras = txBody.getElementsByTagNameNS(NS_A, 'p');
    for (const para of paras) {
      const pPrEls = para.getElementsByTagNameNS(NS_A, 'pPr');
      if (pPrEls.length && pPrEls[0].getElementsByTagNameNS(NS_A, 'buAutoNum').length) {
        return true;
      }
    }
    // Fallback: text-based detection for presentations that bake in their own numbers
    const texts = [...paras]
      .map(p => { const r = _extractTxBody(p); return r.text.trim(); })
      .filter(Boolean);
    if (texts.length > 1) {
      const numericCount = texts.filter(t => /^\d+[\.\)]/.test(t)).length;
      if (numericCount >= Math.ceil(texts.length * 0.5)) return true;
    }
    return false;
  }

  // ── Shape iteration on a slide ─────────────────────────────────────────────
  // Returns { titleText, bodyBlocks[], hasImages, hasTables }

  function _parseSlideShapes(slideXml, slideNum) {
    const result = {
      titleText:  null,
      bodyBlocks: [],
      hasImages:  false,
      hasTables:  false,
    };

    // sp elements are regular shapes (text boxes, placeholders)
    const spEls = slideXml.getElementsByTagNameNS(NS_P, 'sp');

    for (const sp of spEls) {
      // Get placeholder type
      const nvSpPrEls = sp.getElementsByTagNameNS(NS_P, 'nvSpPr');
      if (!nvSpPrEls.length) continue;
      const nvPrEls = nvSpPrEls[0].getElementsByTagNameNS(NS_P, 'nvPr');
      if (!nvPrEls.length) continue;
      const phEls = nvPrEls[0].getElementsByTagNameNS(NS_P, 'ph');

      const phType = phEls.length ? (phEls[0].getAttribute('type') || 'body') : null;

      // Extract text body
      const txBodyEls = sp.getElementsByTagNameNS(NS_P, 'txBody');
      if (!txBodyEls.length) continue;
      const { paragraphs, text } = _extractTxBody(txBodyEls[0]);
      if (!text.trim()) continue;

      const isTitlePh = phType && (phType === 'title' || phType === 'ctrTitle' || phType === 'subTitle');
      const isBodyPh  = phType === 'body' || phType === 'obj' || phType === null;

      if (isTitlePh && result.titleText === null) {
        result.titleText = text.trim();
      } else if (isBodyPh || !phType) {
        // Detect if this block is a list (multiple paragraphs) and whether it is numbered.
        const isMultiLine = paragraphs.length > 1;
        if (isMultiLine) {
          const listType = _isNumberedList(txBodyEls[0]) ? 'numberedList' : 'bulletList';
          result.bodyBlocks.push({ type: listType, content: paragraphs, page: slideNum });
        } else {
          const trimmed   = text.trim();
          const isCallout = /^(note|warning|caution|tip|important|attention)[:\s]/i.test(trimmed);
          result.bodyBlocks.push({ type: isCallout ? 'callout' : 'paragraph', content: trimmed, page: slideNum });
        }
      }
    }

    // Detect images (pic elements)
    const picEls = slideXml.getElementsByTagNameNS(NS_P, 'pic');
    if (picEls.length > 0) result.hasImages = true;

    // Detect tables (graphicFrame containing tbl)
    const graphicFrames = slideXml.getElementsByTagNameNS(NS_P, 'graphicFrame');
    for (const frame of graphicFrames) {
      const tblEls = frame.getElementsByTagNameNS(NS_A, 'tbl');
      if (tblEls.length > 0) {
        result.hasTables = true;
        result.bodyBlocks.push({ type: 'table', content: _extractTable(tblEls[0]), page: slideNum });
      }
    }

    return result;
  }

  // ── Table extraction (DrawingML) ──────────────────────────────────────────

  function _extractTable(tbl) {
    const table = { headers: [], rows: [] };
    const rows  = tbl.getElementsByTagNameNS(NS_A, 'tr');
    let isFirst = true;

    for (const row of rows) {
      const cells     = row.getElementsByTagNameNS(NS_A, 'tc');
      const cellTexts = [];
      for (const cell of cells) {
        const txBodyEls = cell.getElementsByTagNameNS(NS_A, 'txBody');
        const text = txBodyEls.length ? _extractTxBody(txBodyEls[0]).text : '';
        cellTexts.push(text.trim());
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

  // ── Speaker notes extraction ──────────────────────────────────────────────

  async function _extractNotes(zip, slidePath, slideNum) {
    // Notes file lives at ppt/notesSlides/notesSlide{N}.xml
    // Derive its path from the slide's own rels file
    const slideFile  = slidePath.split('/').pop(); // e.g. 'slide1.xml'
    const slideDir   = slidePath.split('/').slice(0, -1).join('/'); // e.g. 'slides'
    const relsPath   = `ppt/${slideDir}/_rels/${slideFile}.rels`;
    const relsXml    = await _getXml(zip, relsPath);
    if (!relsXml) return null;

    const relEls = relsXml.getElementsByTagNameNS(NS_PKG_R, 'Relationship');
    for (const rel of relEls) {
      const type   = rel.getAttribute('Type') || '';
      const target = rel.getAttribute('Target') || '';
      if (type.endsWith('/notesSlide')) {
        // Target is relative to ppt/slides/ — resolve it
        const notePathRaw  = `ppt/${slideDir}/${target}`.replace(/\/[^/]+\/\.\.\//g, '/');
        const notesXml     = await _getXml(zip, notePathRaw);
        if (!notesXml) return null;

        // Notes body: look for the sp with ph type "body" inside the notes XML
        const spEls = notesXml.getElementsByTagNameNS(NS_P, 'sp');
        for (const sp of spEls) {
          const nvPrEls = sp.getElementsByTagNameNS(NS_P, 'nvPr');
          if (!nvPrEls.length) continue;
          const phEls   = nvPrEls[0].getElementsByTagNameNS(NS_P, 'ph');
          if (!phEls.length) continue;
          const phType  = phEls[0].getAttribute('type');
          if (phType === 'body' || phType === null || !phType) {
            const txBodyEls = sp.getElementsByTagNameNS(NS_P, 'txBody');
            if (txBodyEls.length) {
              const { text } = _extractTxBody(txBodyEls[0]);
              if (text.trim()) return text.trim();
            }
          }
        }
      }
    }
    return null;
  }

  // ── Word count ─────────────────────────────────────────────────────────────

  function _countWords(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  // ── Main reader ───────────────────────────────────────────────────────────

  /**
   * Reads a .pptx file and returns a StructuredDocumentModel.
   * @param {File} file
   * @returns {Promise<StructuredDocumentModel|{error:string,message:string,format:string}>}
   */
  async function read(file) {
    let zip;
    try {
      zip = await _loadZip(file);
    } catch (e) {
      return { error: 'MALFORMED', message: 'Could not open file as a ZIP archive. The .pptx may be corrupted.', format: 'pptx' };
    }

    // Determine slide order
    let slidePaths;
    try {
      slidePaths = await _getSlideOrder(zip);
    } catch (e) {
      return { error: 'MALFORMED', message: `Could not determine slide order: ${e.message}`, format: 'pptx' };
    }

    if (!slidePaths.length) {
      return { error: 'MALFORMED', message: 'No slides found in the presentation.', format: 'pptx' };
    }

    const sdm = DocIntelModels.createSDM('pptx');
    DocIntelTraceability.resetCounter();

    let totalWords            = 0;
    let hasImages             = false;
    let hasTables             = false;
    let hasNumberedLists      = false;
    let hasExplicitObjectives = false;

    for (let i = 0; i < slidePaths.length; i++) {
      const slideNum  = i + 1;
      const slidePath = slidePaths[i];
      const fullPath  = `ppt/${slidePath}`;

      const slideXml = await _getXml(zip, fullPath);
      if (!slideXml) continue;

      if (slideXml.querySelector('parsererror')) continue;

      const { titleText, bodyBlocks, hasImages: slideHasImg, hasTables: slideHasTbl } =
        _parseSlideShapes(slideXml, slideNum);

      if (slideHasImg) hasImages = true;
      if (slideHasTbl) hasTables = true;

      // Each slide is one section; heading is the slide title
      const heading = titleText || `Slide ${slideNum}`;
      const secId   = DocIntelTraceability.generateId('sec');
      const section = DocIntelModels.createSDMSection(secId, 1, heading, slideNum, slideNum);
      sdm.sections.push(section);

      totalWords += _countWords(heading);

      // Objectives detection on title
      const lowerHeading = heading.toLowerCase();
      if (lowerHeading.includes('objective') || lowerHeading.includes('learning outcome') || lowerHeading.includes('by the end')) {
        hasExplicitObjectives = true;
      }

      // Body elements
      for (const block of bodyBlocks) {
        if (block.type === 'bulletList' || block.type === 'numberedList') {
          const listEl = DocIntelModels.createSDMElement(block.type, block.content, block.page, 0.5);
          section.elements.push(listEl);
          if (block.type === 'numberedList') hasNumberedLists = true;
          totalWords += block.content.reduce((acc, t) => acc + _countWords(t), 0);
        } else if (block.type === 'table') {
          const tblEl = DocIntelModels.createSDMElement('table', block.content, block.page, 0.5);
          section.elements.push(tblEl);
          const tableWords = [...block.content.headers, ...block.content.rows.flat()].reduce((acc, t) => acc + _countWords(t), 0);
          totalWords += tableWords;
        } else {
          const paraEl = DocIntelModels.createSDMElement(block.type, block.content, block.page, 0.5);
          section.elements.push(paraEl);
          totalWords += _countWords(block.content);
        }
      }

      // Speaker notes → Note element
      try {
        const notesText = await _extractNotes(zip, slidePath, slideNum);
        if (notesText) {
          const noteEl = DocIntelModels.createSDMElement('callout', notesText, slideNum, 0.9);
          section.elements.push(noteEl);
          totalWords += _countWords(notesText);
        }
      } catch (_) {
        // Notes extraction is best-effort; never fail the whole read
      }
    }

    // Populate metadata
    sdm.metadata.pageCount             = slidePaths.length;
    sdm.metadata.wordCount             = totalWords;
    sdm.metadata.hasImages             = hasImages;
    sdm.metadata.hasTables             = hasTables;
    sdm.metadata.hasNumberedLists      = hasNumberedLists;
    sdm.metadata.hasExplicitObjectives = hasExplicitObjectives;

    return sdm;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({ read });

})();
