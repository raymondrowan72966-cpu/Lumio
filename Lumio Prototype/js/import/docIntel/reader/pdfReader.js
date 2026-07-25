/* ============================================================
   DOCUMENT INTELLIGENCE ENGINE — PDF Reader (.pdf)
   Phase 2: Document Reader

   Converts a .pdf File into a StructuredDocumentModel.
   Dynamically loads Mozilla PDF.js from CDN on first use.
   No static dependency on PDF.js — avoids index.html changes.

   NOTE: js/pdf.js in this project is Lumio's PDF export engine.
   It is NOT a PDF parser. PDF.js (Mozilla) is entirely separate
   and is loaded here dynamically.

   Strategy:
     1. Load PDF.js from CDN if not already loaded
     2. Convert file to ArrayBuffer
     3. Open with pdfjsLib.getDocument()
     4. Iterate pages, extract text via getTextContent()
     5. Use font-size heuristics to detect headings
     6. Build flat sections array
     7. Return StructuredDocumentModel

   Image-only PDFs (no extractable text) return a typed error:
     { error: 'IMAGE_ONLY_PDF', message: '...', format: 'pdf' }

   Output: StructuredDocumentModel
   On failure: { error, message, format: 'pdf' }

   No instructional reasoning. No knowledge classification.
   No Lumio integration of any kind.
   ============================================================ */

const DocIntelPdfReader = (() => {

  // ── PDF.js CDN configuration ──────────────────────────────────────────────
  // Matches the project's existing CDN pattern (same host as JSZip).

  const PDFJS_VERSION    = '3.11.174';
  const PDFJS_CDN_BASE   = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
  const PDFJS_MAIN_URL   = `${PDFJS_CDN_BASE}/pdf.min.js`;
  const PDFJS_WORKER_URL = `${PDFJS_CDN_BASE}/pdf.worker.min.js`;

  // Minimum extractable text characters to consider a page as "has text"
  const MIN_TEXT_CHARS_PER_PAGE = 10;

  // Minimum font height (pts) to consider text as a heading
  // PDF transform matrix: item.transform[3] is y-scale ≈ font size in pts
  const HEADING_MIN_FONT_HEIGHT = 13;

  // If total text across entire document is below this, flag as image-only
  const MIN_TOTAL_CHARS = 50;

  // ── PDF.js loader ─────────────────────────────────────────────────────────
  // Loads PDF.js once and caches the reference. Subsequent calls return
  // the cached lib immediately without touching the DOM.

  let _pdfjsLib = null;
  let _loadPromise = null;

  function _loadPdfJs() {
    // Already loaded
    if (_pdfjsLib) return Promise.resolve(_pdfjsLib);

    // Already loading — reuse the same promise
    if (_loadPromise) return _loadPromise;

    _loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDFJS_MAIN_URL;
      script.onload = () => {
        const lib = window.pdfjsLib;
        if (!lib) {
          reject(new Error('PDF.js loaded but window.pdfjsLib is not defined.'));
          return;
        }
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        _pdfjsLib = lib;
        resolve(lib);
      };
      script.onerror = () => reject(new Error(`Failed to load PDF.js from ${PDFJS_MAIN_URL}`));
      document.head.appendChild(script);
    });

    return _loadPromise;
  }

  // ── Font-size heading heuristic ───────────────────────────────────────────
  // PDF.js text items carry a transform matrix:
  //   [scaleX, skewX, skewY, scaleY, translateX, translateY]
  // transform[3] approximates the rendered font height in pt units.
  // Values above HEADING_MIN_FONT_HEIGHT suggest a heading-level element.

  function _estimateFontHeight(item) {
    if (item.transform && item.transform.length >= 4) {
      return Math.abs(item.transform[3]);
    }
    return 0;
  }

  // ── Page text extraction ──────────────────────────────────────────────────
  // Returns an array of { text, height, x, y } for each text item on the page.
  // Items with empty text are excluded.

  async function _extractPageItems(page) {
    const content = await page.getTextContent();
    const items = [];
    for (const item of content.items) {
      const text = item.str || '';
      if (!text.trim()) continue;
      items.push({
        text,
        height: _estimateFontHeight(item),
        x: item.transform ? item.transform[4] : 0,
        y: item.transform ? item.transform[5] : 0,
      });
    }
    return items;
  }

  // ── Per-page heading font threshold ──────────────────────────────────────
  // Computes the "dominant body font" for a page as the median font height,
  // then flags items above that + a margin as headings.
  // Falls back to HEADING_MIN_FONT_HEIGHT as an absolute floor.

  function _computeHeadingThreshold(items) {
    if (!items.length) return HEADING_MIN_FONT_HEIGHT;
    const heights = items.map(i => i.height).filter(h => h > 0).sort((a, b) => a - b);
    if (!heights.length) return HEADING_MIN_FONT_HEIGHT;
    const median = heights[Math.floor(heights.length / 2)];
    // A heading must be meaningfully larger than body text (≥ 20% taller)
    return Math.max(HEADING_MIN_FONT_HEIGHT, median * 1.2);
  }

  // ── Line grouping ─────────────────────────────────────────────────────────
  // PDF.js returns individual character runs, not paragraphs.
  // Group items into lines by y-coordinate proximity, then lines into blocks.

  function _groupIntoLines(items) {
    if (!items.length) return [];

    // Sort by page position: top-to-bottom (descending y), left-to-right
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

    const lines = [];
    let currentLine = [sorted[0]];
    let currentY    = sorted[0].y;

    for (let i = 1; i < sorted.length; i++) {
      const item = sorted[i];
      // Same line if y-difference is small relative to font height
      const yTolerance = Math.max(2, item.height * 0.4);
      if (Math.abs(item.y - currentY) <= yTolerance) {
        currentLine.push(item);
      } else {
        lines.push(currentLine);
        currentLine = [item];
        currentY    = item.y;
      }
    }
    lines.push(currentLine);

    return lines;
  }

  // ── Block (paragraph) grouping ────────────────────────────────────────────
  // Adjacent lines with similar font height and close y proximity → one block.
  // A significant gap or font-height change → new block.

  function _groupLinesIntoBlocks(lines) {
    if (!lines.length) return [];

    const blocks = [];
    let currentLines = [lines[0]];
    let prevY        = lines[0][0].y;

    const _lineHeight = (line) => Math.max(...line.map(i => i.height));

    for (let i = 1; i < lines.length; i++) {
      const line    = lines[i];
      const lineH   = _lineHeight(line);
      const prevH   = _lineHeight(currentLines[currentLines.length - 1]);
      const yGap    = prevY - line[0].y;
      const normalLineSpacing = Math.max(prevH, lineH) * 2.0;

      const isSameBlock = yGap <= normalLineSpacing &&
                          Math.abs(lineH - prevH) / Math.max(prevH, 1) < 0.25;

      if (isSameBlock) {
        currentLines.push(line);
      } else {
        blocks.push(currentLines);
        currentLines = [line];
      }
      prevY = line[0].y;
    }
    blocks.push(currentLines);

    return blocks;
  }

  // ── Block text assembly ───────────────────────────────────────────────────

  function _blockToText(lines) {
    return lines.map(line => {
      const sortedItems = [...line].sort((a, b) => a.x - b.x);
      return sortedItems.map(i => i.text).join('');
    }).join(' ').replace(/\s+/g, ' ').trim();
  }

  function _blockMaxHeight(lines) {
    let max = 0;
    for (const line of lines) {
      for (const item of line) {
        if (item.height > max) max = item.height;
      }
    }
    return max;
  }

  // ── Word count ────────────────────────────────────────────────────────────

  function _countWords(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  // ── Main reader ───────────────────────────────────────────────────────────

  /**
   * Reads a .pdf file and returns a StructuredDocumentModel.
   * @param {File} file
   * @returns {Promise<StructuredDocumentModel|{error:string,message:string,format:string}>}
   */
  async function read(file) {
    // Load PDF.js
    let pdfjsLib;
    try {
      pdfjsLib = await _loadPdfJs();
    } catch (loadErr) {
      return {
        error:   'DEPENDENCY_UNAVAILABLE',
        message: `Could not load PDF.js: ${loadErr.message}`,
        format:  'pdf',
      };
    }

    // Convert file to ArrayBuffer
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (e) {
      return { error: 'MALFORMED', message: 'Could not read file as ArrayBuffer.', format: 'pdf' };
    }

    // Open PDF document
    let pdf;
    try {
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      pdf = await loadingTask.promise;
    } catch (e) {
      return { error: 'MALFORMED', message: `PDF.js could not open the document: ${e.message}`, format: 'pdf' };
    }

    const pageCount = pdf.numPages;
    const sdm       = DocIntelModels.createSDM('pdf');
    DocIntelTraceability.resetCounter();

    let totalChars       = 0;
    let totalWords       = 0;
    let hasImages        = false;
    let hasTables        = false;
    let hasExplicitObjectives = false;

    // Root section for content before the first detected heading
    let currentSection = null;
    let sectionCount   = 0;

    function _ensureSection(heading, level, pageNum) {
      const secId = DocIntelTraceability.generateId('sec');
      const sec   = DocIntelModels.createSDMSection(secId, level, heading, pageNum, pageNum);
      sdm.sections.push(sec);
      return sec;
    }

    // Seed with a root section
    currentSection = _ensureSection(null, 0, 1);

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page  = await pdf.getPage(pageNum);
      const items = await _extractPageItems(page);

      // Check for images (operator list is expensive; use viewport heuristic instead)
      // If a page has very few text chars but exists, it may be image-heavy
      const pageText = items.map(i => i.text).join('');
      totalChars += pageText.length;

      if (pageText.length < MIN_TEXT_CHARS_PER_PAGE) {
        // Sparse text page — likely an image or cover page
        if (currentSection) {
          const imgEl = DocIntelModels.createSDMElement('image', { caption: '' }, pageNum, 0.5);
          currentSection.elements.push(imgEl);
          hasImages = true;
        }
        continue;
      }

      // Compute heading threshold for this page
      const headingThreshold = _computeHeadingThreshold(items);

      // Group items → lines → blocks
      const lines  = _groupIntoLines(items);
      const blocks = _groupLinesIntoBlocks(lines);

      for (const blockLines of blocks) {
        const text      = _blockToText(blockLines);
        const maxHeight = _blockMaxHeight(blockLines);

        if (!text.trim()) continue;

        const isHeading = maxHeight >= headingThreshold;

        if (isHeading) {
          // Close previous section
          if (currentSection) {
            currentSection.sourceLocation.pageEnd = pageNum;
          }

          // Heading level: larger font → lower level number
          // Rough 3-tier: very large (≥1.5x threshold) → H1, large → H2, else H3
          let level = 3;
          if (maxHeight >= headingThreshold * 1.5) level = 1;
          else if (maxHeight >= headingThreshold * 1.2) level = 2;

          currentSection = _ensureSection(text.trim(), level, pageNum);
          sectionCount++;

          const lower = text.toLowerCase();
          if (lower.includes('objective') || lower.includes('learning outcome') || lower.includes('by the end')) {
            hasExplicitObjectives = true;
          }
        } else {
          // Body content
          const trimmed   = text.trim();
          const isCallout = /^(note|warning|caution|tip|important|attention)[:\s]/i.test(trimmed);
          const elType    = isCallout ? 'callout' : 'paragraph';
          const paraEl    = DocIntelModels.createSDMElement(elType, trimmed, pageNum, 0.5);
          if (currentSection) currentSection.elements.push(paraEl);
        }

        totalWords += _countWords(text);
      }

      // Update section end page
      if (currentSection) {
        currentSection.sourceLocation.pageEnd = Math.max(currentSection.sourceLocation.pageEnd, pageNum);
      }
    }

    // Image-only PDF check
    if (totalChars < MIN_TOTAL_CHARS) {
      return {
        error:   'IMAGE_ONLY_PDF',
        message: 'This PDF appears to contain only images with no extractable text. ' +
                 'OCR is required to process image-based PDFs.',
        format:  'pdf',
      };
    }

    // Remove empty root section if other sections exist
    if (sdm.sections.length > 1 && sdm.sections[0].level === 0 && sdm.sections[0].elements.length === 0) {
      sdm.sections.shift();
    }

    // Populate metadata
    sdm.metadata.pageCount             = pageCount;
    sdm.metadata.wordCount             = totalWords;
    sdm.metadata.hasImages             = hasImages;
    sdm.metadata.hasTables             = hasTables;
    sdm.metadata.hasNumberedLists      = false; // PDF list detection not yet implemented
    sdm.metadata.hasExplicitObjectives = hasExplicitObjectives;

    return sdm;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return Object.freeze({ read });

})();
