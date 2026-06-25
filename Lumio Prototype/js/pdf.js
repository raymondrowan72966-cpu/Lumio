/* ============================================================
   PDF EXPORT ENGINE
   Sprint 3G.

   Unlike every other export format, a PDF is a static document with no
   runtime at all — there is no "later execution" to bundle JS for, so
   (unlike scorm.js/xapi.js) this file is loaded directly into the
   authoring app itself (see index.html) and runs immediately when the
   author clicks Publish, the same way publish.js's buildZip already does.

   Two halves:
   1. A minimal, dependency-free PDF 1.4 binary writer (SimplePdf) — text
      via the standard Helvetica/Helvetica-Bold fonts (no embedding
      needed), JPEG image XObjects, simple filled/stroked rectangles.
   2. A layout engine (renderCoursePdf) that walks the SAME course/lesson
      block data every other export reads — reusing the existing
      normalizer functions (normalizeListItems, normalizeItemList,
      normalizeKcOptions, normalizeFlashcardItems, normalizeQuoteItems,
      STATEMENT_DEFAULTS) rather than re-parsing block.data itself, per
      "do not duplicate the course parser."
   ============================================================ */

/* ---------------------------------------------------------
   1. Low-level PDF writer
   --------------------------------------------------------- */
function SimplePdf() {
  const objects = [null]; // index 0 reserved (PDF's free-list head) and never assigned a real object — object numbers are 1-based, so _alloc()'s first real call must return 1, not 0.
  const pageW = 612, pageH = 792; // US Letter, points
  let pages = [];
  let currentContent = null;
  let currentResources = null;
  let currentImageCount = 0;

  function _alloc() { objects.push(null); return objects.length - 1; }
  function _set(id, body) { objects[id] = body; }

  function addPage() {
    currentContent = [];
    currentResources = { fonts: { F1: 'Helvetica', F2: 'Helvetica-Bold' }, images: {} };
    currentImageCount = 0;
    pages.push({ content: currentContent, resources: currentResources });
  }

  // Escapes PDF literal-string special characters.
  function _esc(s) {
    return String(s).replace(/[\\()]/g, c => '\\' + c).replace(/[-￿]/g, ''); // non-Latin1 stripped (standard fonts have no glyphs for them anyway)
  }

  function text(x, y, str, opts) {
    opts = opts || {};
    const font = opts.bold ? 'F2' : 'F1';
    const size = opts.size || 11;
    const color = opts.color || [0, 0, 0];
    currentContent.push(`${color[0]} ${color[1]} ${color[2]} rg BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${_esc(str)}) Tj ET`);
  }

  function rect(x, y, w, h, opts) {
    opts = opts || {};
    const fill = opts.fill;
    const stroke = opts.stroke;
    let cmd = '';
    if (fill) cmd += `${fill[0]} ${fill[1]} ${fill[2]} rg `;
    if (stroke) cmd += `${stroke[0]} ${stroke[1]} ${stroke[2]} RG `;
    cmd += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re `;
    if (fill && stroke) cmd += 'B';
    else if (fill) cmd += 'f';
    else cmd += 'S';
    currentContent.push(cmd);
  }

  // jpegBytes: Uint8Array of a JPEG-encoded image. Returns the resource
  // name (e.g. "Im0") to reference in drawImage on THIS page.
  function embedJpeg(jpegBytes, w, h) {
    const id = _alloc();
    _set(id, { type: 'image', bytes: jpegBytes, w, h });
    const name = 'Im' + (currentImageCount++);
    currentResources.images[name] = id;
    return name;
  }

  function drawImage(name, x, y, w, h) {
    currentContent.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q`);
  }

  function serialize(meta) {
    meta = meta || {};
    // Allocate fixed objects: 1=Catalog, 2=Pages, then fonts, then pages+content+images.
    const catalogId = _alloc();
    const pagesId = _alloc();
    const fontRegularId = _alloc();
    _set(fontRegularId, { type: 'font', base: 'Helvetica' });
    const fontBoldId = _alloc();
    _set(fontBoldId, { type: 'font', base: 'Helvetica-Bold' });

    const pageIds = [];
    pages.forEach(p => {
      const contentId = _alloc();
      _set(contentId, { type: 'stream', data: p.content.join('\n') });
      const pageId = _alloc();
      _set(pageId, { type: 'page', contentId, resources: p.resources, fontRegularId, fontBoldId });
      pageIds.push(pageId);
    });
    _set(pagesId, { type: 'pages', kids: pageIds, w: pageW, h: pageH });
    _set(catalogId, { type: 'catalog', pagesId });

    // Build the byte stream with a real, valid xref table.
    const enc = s => new TextEncoder().encode(s);
    const chunks = [];
    let offset = 0;
    const xrefOffsets = new Array(objects.length).fill(0);
    function push(bytes) { chunks.push(bytes); offset += bytes.length; }

    push(enc('%PDF-1.4\n'));

    for (let id = 1; id < objects.length; id++) {
      xrefOffsets[id] = offset;
      const obj = objects[id];
      if (!obj) continue;
      if (obj.type === 'catalog') {
        push(enc(`${id} 0 obj\n<< /Type /Catalog /Pages ${obj.pagesId} 0 R >>\nendobj\n`));
      } else if (obj.type === 'pages') {
        const kidsStr = obj.kids.map(k => `${k} 0 R`).join(' ');
        push(enc(`${id} 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${obj.kids.length} /MediaBox [0 0 ${obj.w} ${obj.h}] >>\nendobj\n`));
      } else if (obj.type === 'font') {
        push(enc(`${id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${obj.base} >>\nendobj\n`));
      } else if (obj.type === 'image') {
        const header = `${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${obj.w} /Height ${obj.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${obj.bytes.length} >>\nstream\n`;
        push(enc(header));
        push(obj.bytes);
        push(enc('\nendstream\nendobj\n'));
      } else if (obj.type === 'stream') {
        const body = enc(obj.data);
        push(enc(`${id} 0 obj\n<< /Length ${body.length} >>\nstream\n`));
        push(body);
        push(enc('\nendstream\nendobj\n'));
      } else if (obj.type === 'page') {
        const imgRefs = Object.entries(obj.resources.images).map(([name, imgId]) => `/${name} ${imgId} 0 R`).join(' ');
        const xobjectDict = imgRefs ? `/XObject << ${imgRefs} >>` : '';
        push(enc(`${id} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /Resources << /Font << /F1 ${obj.fontRegularId} 0 R /F2 ${obj.fontBoldId} 0 R >> ${xobjectDict} >> /Contents ${obj.contentId} 0 R >>\nendobj\n`));
      }
    }

    const xrefStart = offset;
    let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) {
      xref += objects[id] ? `${String(xrefOffsets[id]).padStart(10, '0')} 00000 n \n` : '0000000000 00000 f \n';
    }
    push(enc(xref));
    push(enc(`trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R /Info << /Title (${_esc(meta.title || 'Course')}) /Producer (Lumio) >> >>\nstartxref\n${xrefStart}\n%%EOF`));

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    chunks.forEach(c => { out.set(c, p); p += c.length; });
    return out;
  }

  return { addPage, text, rect, embedJpeg, drawImage, serialize, pageW, pageH };
}

/* ---------------------------------------------------------
   2. Image conversion — any blob → JPEG bytes, via canvas.
   PDF embedding here only supports DCTDecode (JPEG); PNG/SVG/etc. are
   re-encoded once at publish time, same pattern optimizeImageForPublish
   already uses for the HTML/SCORM exports (re-encode for the package,
   never touch the original asset).
   --------------------------------------------------------- */
function _imageBlobToJpeg(blob) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(b => {
        if (!b) { resolve(null); return; }
        b.arrayBuffer().then(buf => resolve({ bytes: new Uint8Array(buf), w: canvas.width, h: canvas.height }));
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/* ---------------------------------------------------------
   3. Layout engine
   --------------------------------------------------------- */
function _wrapText(ctx, str, maxWidth) {
  const words = String(str || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

async function renderCoursePdf(course, lessonData, assetEntries, assetMap) {
  const pdf = SimplePdf();
  const margin = 56;
  const contentWidth = pdf.pageW - margin * 2;
  const measureCtx = document.createElement('canvas').getContext('2d');

  // Pre-convert every needed image asset to JPEG once, keyed by asset ref.
  const jpegCache = {};
  for (const a of assetEntries) {
    if (!a.mimeType || !a.mimeType.startsWith('image/')) continue;
    const jpeg = await _imageBlobToJpeg(a.blob);
    if (jpeg) jpegCache[a.id] = jpeg;
  }

  let cursorY = 0;
  let pageIndex = -1;
  function newPage() { pdf.addPage(); pageIndex++; cursorY = pdf.pageH - margin; }
  function ensureSpace(h) { if (cursorY - h < margin + 24) newPage(); }
  function footer(label) {
    pdf.text(margin, margin - 20, label, { size: 8, color: [0.5, 0.5, 0.5] });
    pdf.text(pdf.pageW - margin - 60, margin - 20, `Page ${pageIndex + 1}`, { size: 8, color: [0.5, 0.5, 0.5] });
  }
  function heading(str, opts) {
    opts = opts || {};
    const size = opts.size || 16;
    ensureSpace(size + 16);
    measureCtx.font = `bold ${size}px Helvetica`;
    cursorY -= size;
    pdf.text(margin, cursorY, str, { size, bold: true });
    cursorY -= 10;
  }
  function paragraph(str, opts) {
    opts = opts || {};
    const size = opts.size || 11;
    measureCtx.font = `${size}px Helvetica`;
    const lines = _wrapText(measureCtx, str, contentWidth - (opts.indent || 0));
    lines.forEach(line => {
      ensureSpace(size + 4);
      cursorY -= size + 4;
      pdf.text(margin + (opts.indent || 0), cursorY, line, { size, color: opts.color });
    });
    cursorY -= 4;
  }
  function divider() {
    ensureSpace(20);
    cursorY -= 10;
    pdf.rect(margin, cursorY, contentWidth, 1, { fill: [0.85, 0.85, 0.88] });
    cursorY -= 10;
  }
  async function image(assetRef, maxW, maxH) {
    const jpeg = jpegCache[assetRef];
    if (!jpeg) return;
    const scale = Math.min(maxW / jpeg.w, maxH / jpeg.h, 1);
    const w = jpeg.w * scale, h = jpeg.h * scale;
    ensureSpace(h + 10);
    cursorY -= h;
    const name = pdf.embedJpeg(jpeg.bytes, jpeg.w, jpeg.h);
    pdf.drawImage(name, margin, cursorY, w, h);
    cursorY -= 10;
  }

  // ---- Cover page ----
  newPage();
  cursorY = pdf.pageH / 2 + 60;
  heading(course.title || 'Course', { size: 28 });
  paragraph(course.description || '', { size: 13 });
  cursorY -= 20;
  paragraph(`Learner Workbook — Generated ${new Date().toLocaleDateString()}`, { size: 10, color: [0.5, 0.5, 0.5] });
  footer(course.title || 'Course');

  // ---- Table of contents ----
  newPage();
  heading('Contents', { size: 20 });
  (course.lessons || []).forEach((l, i) => paragraph(`${i + 1}. ${l.title}`, { size: 12 }));
  if ((course.assessments || []).length) {
    cursorY -= 6;
    (course.assessments || []).forEach(a => paragraph(`Assessment: ${a.title}`, { size: 12 }));
  }
  footer(course.title || 'Course');

  // ---- Block renderers, mapped per the Sprint 3G spec ----
  async function renderBlock(block, ctx) {
    const d = block.data || {};
    switch (block.type) {
      case 'heading': case 'heading_paragraph':
        if (d.heading) heading(d.heading.replace(/<[^>]+>/g, ''), { size: 15 });
        if (d.body) paragraph(d.body);
        return;
      case 'paragraph':
        paragraph(d.body || '');
        return;
      case 'image':
        if (d.src) await image(d.src, contentWidth, 320);
        if (d.caption) paragraph(d.caption, { size: 9, color: [0.5, 0.5, 0.5] });
        return;
      case 'image_text': case 'text_image':
        if (d.heading) heading(d.heading.replace(/<[^>]+>/g, ''), { size: 13 });
        if (d.image) await image(d.image, contentWidth, 280);
        if (d.body) paragraph(d.body);
        return;
      case 'stmt_info': case 'stmt_tip': case 'stmt_success': case 'stmt_warning': case 'stmt_error': case 'stmt_note': {
        const def = (typeof STATEMENT_DEFAULTS !== 'undefined' && STATEMENT_DEFAULTS[block.type]) || {};
        ensureSpace(40);
        const boxTop = cursorY;
        paragraph(`${def.label || 'Note'}: ${(d.title || '').replace(/<[^>]+>/g, '')}`, { size: 11, indent: 12 });
        paragraph(d.text || '', { size: 10, indent: 12 });
        return;
      }
      case 'list_numbered': case 'list_bullet': case 'list_checkbox': {
        const def = (typeof LIST_DEFAULTS !== 'undefined' && LIST_DEFAULTS[block.type]) || {};
        if (d.heading || def.heading) heading((d.heading || def.heading), { size: 13 });
        const items = typeof normalizeListItems === 'function' ? normalizeListItems(d, def.items) : (d.items || []);
        items.forEach((item, i) => {
          const prefix = block.type === 'list_numbered' ? `${i + 1}. ` : block.type === 'list_checkbox' ? '☐ ' : '• ';
          paragraph(prefix + (item.text || item || ''), { indent: 8 });
        });
        return;
      }
      case 'accordion': case 'tabs': case 'process': {
        const items = typeof normalizeItemList === 'function' ? normalizeItemList(d, 'items', () => []) : (d.items || []);
        items.forEach((item, i) => {
          heading((item.title || `Section ${i + 1}`).replace(/<[^>]+>/g, ''), { size: 12 });
          if (item.body) paragraph(item.body, { indent: 8 });
        });
        return;
      }
      case 'labelled_graphic': {
        const hotspots = typeof normalizeItemList === 'function' ? normalizeItemList(d, 'hotspots', () => []) : (d.hotspots || []);
        if (d.image) await image(d.image, contentWidth, 280);
        hotspots.forEach((h, i) => paragraph(`${i + 1}. ${(h.title || '').replace(/<[^>]+>/g, '')} — ${h.body || ''}`, { size: 10, indent: 8 }));
        return;
      }
      case 'flashcard_grid': case 'flashcard_stack': {
        const items = typeof normalizeFlashcardItems === 'function' ? normalizeFlashcardItems(d) : (d.items || []);
        for (let i = 0; i < items.length; i++) {
          heading(`Card ${i + 1}`, { size: 12 });
          paragraph('Front: ' + (items[i].front && items[i].front.text || ''), { indent: 8 });
          paragraph('Back: ' + (items[i].back && items[i].back.text || ''), { indent: 8 });
        }
        return;
      }
      case 'scenario': {
        const scenes = typeof normalizeItemList === 'function' ? normalizeItemList(d, 'scenes', () => []) : (d.scenes || []);
        scenes.forEach((s, i) => {
          heading((s.title || `Scene ${i + 1}`), { size: 12 });
          paragraph(s.dialogue || '', { indent: 8 });
          (s.choices || []).forEach(c => paragraph('• ' + c.text, { size: 10, indent: 16 }));
        });
        return;
      }
      case 'kc_multiple_choice': case 'kc_multiple_response': {
        const opts = typeof normalizeKcOptions === 'function' ? normalizeKcOptions(d) : (d.options || []);
        const correct = Array.isArray(d.correct) ? d.correct : [d.correct ?? 0];
        heading('Knowledge Check', { size: 12 });
        paragraph(d.question || '', { size: 11 });
        opts.forEach((o, i) => paragraph(`${correct.includes(i) ? '✓' : '○'} ${o}`, { size: 10, indent: 12 }));
        return;
      }
      case 'kc_fill_gap':
        heading('Knowledge Check', { size: 12 });
        paragraph((d.text || '').replace(/\{\{.*?\}\}/g, '_____'), { size: 11 });
        return;
      case 'kc_matching': case 'kc_ordering':
        heading('Knowledge Check', { size: 12 });
        paragraph(d.question || '', { size: 11 });
        return;
      case 'chart_bar': case 'chart_line': case 'chart_pie': {
        // Charts render as a static data table rather than a rasterized
        // image — the live chart is an interactive in-DOM SVG/canvas with
        // no existing "export as image" path to reuse, and building one
        // is out of scope for this sprint's PDF adapter.
        heading(d.title || 'Chart', { size: 12 });
        (d.items || []).forEach(it => paragraph(`${it.label}: ${it.value}`, { indent: 8 }));
        return;
      }
      case 'continue': case 'numbered_divider': case 'line_divider': case 'spacer':
        divider();
        return;
      default:
        return; // Buttons, dividers' design-only variants, etc. — nothing to render statically.
    }
  }

  for (const lesson of (course.lessons || [])) {
    newPage();
    heading(lesson.title, { size: 18 });
    const blocks = lessonData[lesson.id] || [];
    for (const block of blocks) await renderBlock(block, { lessonId: lesson.id });
    footer(`${course.title || 'Course'} — ${lesson.title}`);
  }
  for (const assessment of (course.assessments || [])) {
    newPage();
    heading(assessment.title, { size: 18 });
    const blocks = lessonData[assessment.id] || [];
    for (const block of blocks) await renderBlock(block, { lessonId: assessment.id });
    footer(`${course.title || 'Course'} — ${assessment.title}`);
  }

  // ---- Course summary / end of document ----
  newPage();
  heading('Course Summary', { size: 18 });
  paragraph(`Lessons: ${(course.lessons || []).length}`);
  paragraph(`Assessments: ${(course.assessments || []).length}`);
  cursorY -= 20;
  paragraph('End of Document', { size: 10, color: [0.5, 0.5, 0.5] });
  footer(course.title || 'Course');

  return pdf.serialize({ title: course.title });
}
