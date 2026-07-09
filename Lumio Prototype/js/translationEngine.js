/* ============================================================
   LUMIO TRANSLATION ENGINE
   Phase 1 — XLIFF Architecture

   This is the single source of truth for all multilingual operations.
   No feature performs translation independently — everything passes
   through this engine.

   Architecture:
     extract()          → pull translatable strings from a course
     generateXliff()    → produce XLIFF 1.2 XML for export
     parseXliff()       → parse imported XLIFF back to a string map
     validateImport()   → validate parsed XLIFF against a course
     applyTranslation() → merge translated strings back into the course

   Extension points reserved (not implemented):
     TranslationEngine.AI      → AI translation adapters
     TranslationEngine.MEMORY  → Translation memory store
     TranslationEngine.HISTORY → Per-course translation history

   ID strategy (Phase 1 — positional for array items):
     course|title
     course|description
     course|objectives|{n}|text
     {lessonId}|title
     {lessonId}|{blockId}|{field}
     {lessonId}|{blockId}|{arrayField}|{index}|{subField}

   Phase 2 migration path: add stable IDs to array items
   (accordion panels, KC options, flashcard items, etc.) and switch
   from positional indices to item IDs. This file documents the
   upgrade points with TODO(phase2-stable-ids) markers.

   XLIFF 1.2 format. One <file> element per lesson/assessment.
   Rich HTML preserved as XLIFF inline <g> markup.
   ============================================================ */

const TranslationEngine = (function () {

  // ── Constants ────────────────────────────────────────────────

  const XLIFF_NS   = 'urn:oasis:names:tc:xliff:document:1.2';
  const XHTML_NS   = 'http://www.w3.org/1999/xhtml';
  const SCHEMA_LOC = 'urn:oasis:names:tc:xliff:document:1.2 http://docs.oasis-open.org/xliff/v1.2/os/xliff-core-1.2-strict.xsd';

  // HTML tag name → XLIFF ctype mapping for inline markup preservation
  const HTML_TO_CTYPE = {
    STRONG: 'x-html-STRONG', B: 'x-html-STRONG',
    EM: 'x-html-EM', I: 'x-html-EM',
    U: 'x-html-U',
    P: 'x-html-P',
    BR: 'x-html-BR',
    IMG: 'x-html-IMG',
    SPAN: 'x-html-SPAN',
    A: 'x-html-A',
    H1: 'x-html-H1', H2: 'x-html-H2', H3: 'x-html-H3',
    H4: 'x-html-H4', H5: 'x-html-H5', H6: 'x-html-H6',
    UL: 'x-html-UL', OL: 'x-html-OL', LI: 'x-html-LI',
    DIV: 'x-html-DIV',
    TABLE: 'x-html-TABLE',
    THEAD: 'x-html-THEAD',
    TBODY: 'x-html-TBODY',
    TR: 'x-html-TR',
    TH: 'x-html-TH',
    TD: 'x-html-TD',
  };

  const CTYPE_TO_HTML = {
    'x-html-STRONG': 'strong', 'x-html-EM': 'em', 'x-html-U': 'u',
    'x-html-P': 'p', 'x-html-SPAN': 'span', 'x-html-A': 'a',
    'x-html-IMG': 'img',
    'x-html-H1': 'h1', 'x-html-H2': 'h2', 'x-html-H3': 'h3',
    'x-html-H4': 'h4', 'x-html-H5': 'h5', 'x-html-H6': 'h6',
    'x-html-UL': 'ul', 'x-html-OL': 'ol', 'x-html-LI': 'li',
    'x-html-DIV': 'div',
    'x-html-TABLE': 'table', 'x-html-THEAD': 'thead', 'x-html-TBODY': 'tbody',
    'x-html-TR': 'tr', 'x-html-TH': 'th', 'x-html-TD': 'td',
    'x-html-BR': 'br',
  };

  // ── XML utilities ─────────────────────────────────────────────

  function escapeXml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ── HTML ↔ XLIFF inline markup ───────────────────────────────

  /* Converts a rich HTML string to XLIFF inline <g>/<x> markup.
     Used when exporting rich text fields. Preserves bold, italic,
     underline, colour, size, links, paragraphs, line-breaks, and
     tables. Non-translatable attribute values (href, style) are
     carried as xhtml:* attributes on <g> elements, allowing CAT
     tools to preserve them without treating them as translatable text. */
  function htmlToXliffInline(html) {
    if (!html || typeof html !== 'string') return '';
    if (!html.includes('<')) return escapeXml(html);

    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    let _gId = 0;
    const nextId = () => 'g' + (++_gId);

    function walk(node) {
      if (node.nodeType === 3 /* TEXT_NODE */) {
        return escapeXml(node.textContent);
      }
      if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';

      const tag = node.tagName;
      const ctype = HTML_TO_CTYPE[tag];

      if (!ctype) {
        // Flatten unrecognised tags — text content is still exported
        return Array.from(node.childNodes).map(walk).join('');
      }

      // Void elements
      if (tag === 'BR') {
        return `<x id="${nextId()}" ctype="${ctype}"/>`;
      }
      if (tag === 'IMG') {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || '';
        const imgAttrs = [];
        if (src) imgAttrs.push(`xhtml:src="${escapeXml(src)}"`);
        if (alt) imgAttrs.push(`xhtml:alt="${escapeXml(alt)}"`);
        const attrsStr = imgAttrs.length ? ' ' + imgAttrs.join(' ') : '';
        return `<x id="${nextId()}" ctype="${ctype}"${attrsStr}/>`;
      }

      const attrs = [];
      if (tag === 'A' && node.getAttribute('href')) {
        attrs.push(`xhtml:href="${escapeXml(node.getAttribute('href'))}"`);
        if (node.getAttribute('target')) attrs.push(`xhtml:target="${escapeXml(node.getAttribute('target'))}"`);
        if (node.getAttribute('rel')) attrs.push(`xhtml:rel="${escapeXml(node.getAttribute('rel'))}"`);
      }
      if (tag === 'SPAN' && node.style.cssText) {
        attrs.push(`xhtml:style="${escapeXml(node.style.cssText)}"`);
      }
      if (tag === 'P' && node.style.textAlign) {
        attrs.push(`xhtml:style="${escapeXml('text-align:' + node.style.textAlign)}"`);
      }
      if ((tag === 'TABLE' || tag === 'TH' || tag === 'TD') && node.getAttribute('class')) {
        attrs.push(`xhtml:class="${escapeXml(node.getAttribute('class'))}"`);
      }

      const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
      const inner = Array.from(node.childNodes).map(walk).join('');
      return `<g id="${nextId()}" ctype="${ctype}"${attrStr}>${inner}</g>`;
    }

    return Array.from(tmp.childNodes).map(walk).join('');
  }

  /* Converts XLIFF inline <g>/<x> markup back to HTML.
     Accepts a DOM element whose children are mixed text/g/x nodes.
     Used during import to reconstruct rich HTML from <target> content. */
  function xliffNodeToHtml(node) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      return node.textContent;
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';

    const localName = node.localName;

    if (localName === 'g') {
      const ctype = node.getAttribute('ctype') || '';
      const htmlTag = CTYPE_TO_HTML[ctype];
      if (!htmlTag) {
        return Array.from(node.childNodes).map(xliffNodeToHtml).join('');
      }
      const inner = Array.from(node.childNodes).map(xliffNodeToHtml).join('');
      let attrStr = '';
      if (htmlTag === 'a') {
        const href = node.getAttributeNS(XHTML_NS, 'href') || node.getAttribute('xhtml:href') || '';
        const rel  = node.getAttributeNS(XHTML_NS, 'rel')  || node.getAttribute('xhtml:rel')  || '';
        const tgt  = node.getAttributeNS(XHTML_NS, 'target') || node.getAttribute('xhtml:target') || '';
        if (href) attrStr += ` href="${escapeXml(href)}"`;
        if (rel)  attrStr += ` rel="${escapeXml(rel)}"`;
        if (tgt)  attrStr += ` target="${escapeXml(tgt)}"`;
      }
      if (htmlTag === 'span' || htmlTag === 'p' || htmlTag === 'div') {
        const style = node.getAttributeNS(XHTML_NS, 'style') || node.getAttribute('xhtml:style') || '';
        if (style) attrStr += ` style="${escapeXml(style)}"`;
      }
      if (htmlTag === 'table' || htmlTag === 'th' || htmlTag === 'td') {
        const cls = node.getAttributeNS(XHTML_NS, 'class') || node.getAttribute('xhtml:class') || '';
        if (cls) attrStr += ` class="${escapeXml(cls)}"`;
      }
      return `<${htmlTag}${attrStr}>${inner}</${htmlTag}>`;
    }

    if (localName === 'x') {
      const ctype = node.getAttribute('ctype') || '';
      if (ctype === 'x-html-IMG') {
        const src = node.getAttributeNS(XHTML_NS, 'src') || node.getAttribute('xhtml:src') || '';
        const alt = node.getAttributeNS(XHTML_NS, 'alt') || node.getAttribute('xhtml:alt') || '';
        const imgAttrStr = (src ? ` src="${escapeXml(src)}"` : '') + (alt ? ` alt="${escapeXml(alt)}"` : '');
        return `<img${imgAttrStr}>`;
      }
      const htmlTag = CTYPE_TO_HTML[ctype];
      if (htmlTag) return `<${htmlTag}>`;
      return '';
    }

    // Unknown XLIFF structural element — pass children through
    return Array.from(node.childNodes).map(xliffNodeToHtml).join('');
  }

  /* Extracts the text/HTML content from a <source> or <target> element.
     Returns a string. If the element contains only text, returns plain text.
     If it contains <g> nodes, reconstructs HTML from them.
     If the element is missing, returns null. */
  function sourceToString(el) {
    if (!el) return null;
    const hasInline = Array.from(el.childNodes).some(n => n.nodeType === 1);
    if (!hasInline) return el.textContent || '';
    return Array.from(el.childNodes).map(xliffNodeToHtml).join('');
  }

  // ── Stable ID helpers ─────────────────────────────────────────

  function sid(...parts) {
    return parts.join('|');
  }

  // ── Field extraction by block type ───────────────────────────

  /* Extracts all translatable strings from a single block.
     Returns an array of { id, text, richText } objects.
     id:       stable trans-unit ID (relative to the lesson file)
     text:     the raw string value from block.data
     richText: true if the value may contain HTML formatting */
  function extractBlock(lessonId, block) {
    const units = [];
    const d = block.data || {};
    const bid = block.id;

    function add(field, value, richText) {
      if (value == null || value === '') return;
      units.push({ id: sid(bid, field), text: String(value), richText: !!richText });
    }

    function addItem(arrayField, index, subField, value, richText) {
      if (value == null || value === '') return;
      // TODO(phase2-stable-ids): replace index with item.id when items gain stable IDs
      units.push({ id: sid(bid, arrayField, index, subField), text: String(value), richText: !!richText });
    }

    switch (block.type) {

      // ── Text family ──────────────────────────────────────────
      case 'heading':
        add('heading', d.heading, true);
        break;

      case 'heading_paragraph':
        add('heading', d.heading, true);
        add('body', d.body, true);
        break;

      case 'paragraph':
        add('body', d.body, true);
        break;

      case 'columns': {
        const cols = d.cols || [];
        cols.forEach((col, i) => addItem('cols', i, 'text', col, true));
        break;
      }

      case 'table': {
        const rows = d.rows || [];
        rows.forEach((row, ri) => {
          (row || []).forEach((cell, ci) => {
            addItem('rows', ri + '-' + ci, 'text', cell, true);
          });
        });
        break;
      }

      // ── Callout family ───────────────────────────────────────
      case 'stmt_info': case 'stmt_tip': case 'stmt_success':
      case 'stmt_warning': case 'stmt_error': case 'stmt_note':
        add('title', d.title, true);
        add('text', d.text, true);
        break;

      // ── Quote family ─────────────────────────────────────────
      case 'quote1': case 'quote2': case 'quote3': case 'quote4':
        add('text', d.text, true);
        add('author', d.author, false);
        break;

      case 'quote_image':
        add('text', d.text, true);
        add('author', d.author, false);
        add('caption', d.caption, false);
        break;

      case 'quote_carousel': {
        const quotes = d.quotes || [];
        quotes.forEach((q, i) => {
          addItem('quotes', i, 'text', q.text, true);
          addItem('quotes', i, 'author', q.author, false);
        });
        break;
      }

      // ── List family ──────────────────────────────────────────
      case 'list_numbered': case 'list_bullet': case 'list_checkbox': {
        add('heading', d.heading, false);
        const items = (d.items || []).map(it => typeof it === 'string' ? { text: it } : it);
        items.forEach((item, i) => addItem('items', i, 'text', item.text, true));
        break;
      }

      // ── Media family ─────────────────────────────────────────
      case 'image':
        add('caption', d.caption, false);
        add('alt', d.alt, false);
        break;

      case 'image_text':
        add('heading', d.heading, true);
        add('body', d.body, true);
        add('caption', d.caption, false);
        break;

      case 'text_on_image':
        add('heading', d.heading, true);
        add('body', d.body, true);
        break;

      case 'carousel': {
        const items = d.items || [];
        items.forEach((item, i) => {
          addItem('items', i, 'heading', item.heading, true);
          addItem('items', i, 'body', item.body, true);
          addItem('items', i, 'caption', item.caption, false);
        });
        break;
      }

      case 'column_grid': {
        const items = d.items || [];
        items.forEach((item, i) => {
          addItem('items', i, 'heading', item.heading, true);
          addItem('items', i, 'body', item.body, true);
          addItem('items', i, 'caption', item.caption, false);
        });
        break;
      }

      case 'audio':
        add('caption', d.caption, false);
        add('transcript', d.transcript, false);
        break;

      case 'video':
        add('caption', d.caption, false);
        add('transcript', d.transcript, false);
        break;

      case 'file':
        // File names are metadata; captions may be added by the author
        add('caption', d.caption, false);
        break;

      case 'chart_bar': case 'chart_line': case 'chart_pie': {
        add('title', d.title, false);
        add('xLabel', d.xLabel, false);
        add('yLabel', d.yLabel, false);
        const items = d.items || [];
        items.forEach((item, i) => addItem('chartItems', i, 'label', item.label || item.type, false));
        break;
      }

      // ── Interactive family ────────────────────────────────────
      case 'accordion': {
        const items = d.items || [];
        items.forEach((item, i) => {
          addItem('items', i, 'title', item.title, true);
          addItem('items', i, 'body', item.body, true);
        });
        break;
      }

      case 'tabs': {
        const items = d.items || [];
        items.forEach((item, i) => {
          addItem('items', i, 'title', item.title, true);
          addItem('items', i, 'body', item.body, true);
        });
        break;
      }

      case 'process': {
        const items = d.items || [];
        items.forEach((item, i) => {
          addItem('items', i, 'title', item.title, true);
          addItem('items', i, 'body', item.body, true);
        });
        break;
      }

      case 'labelled_graphic': {
        const hotspots = d.hotspots || [];
        hotspots.forEach((hs, i) => {
          addItem('hotspots', i, 'title', hs.title, true);
          addItem('hotspots', i, 'body', hs.body, true);
        });
        break;
      }

      // ── Flashcard family ──────────────────────────────────────
      // Each item is { front: { text, image, imageFit }, back: { text, image, imageFit } }.
      // Only the text subfield is translatable. image and imageFit are non-translatable
      // asset/layout properties that must never be touched.
      case 'flashcard_grid': case 'flashcard_stack': {
        const items = d.items || [];
        items.forEach((item, i) => {
          const front = (item && item.front) || {};
          const back  = (item && item.back)  || {};
          addItem('items', i, 'front.text', front.text, true);
          addItem('items', i, 'back.text',  back.text,  true);
        });
        break;
      }

      // ── Scenario ──────────────────────────────────────────────
      case 'scenario': {
        const scenes = d.scenes || [];
        scenes.forEach((scene, si) => {
          addItem('scenes', si, 'title', scene.title, false);
          addItem('scenes', si, 'dialogue', scene.dialogue, true);
          addItem('scenes', si, 'characterName', scene.characterName, false);
          (scene.choices || []).forEach((choice, ci) => {
            // TODO(phase2-stable-ids): add stable choice IDs
            units.push({
              id: sid(bid, 'scenes', si, 'choices', ci, 'text'),
              text: String(choice.text || ''), richText: false,
            });
            if (choice.feedback) {
              units.push({
                id: sid(bid, 'scenes', si, 'choices', ci, 'feedback'),
                text: String(choice.feedback), richText: true,
              });
            }
          });
        });
        break;
      }

      // ── Assessment family ─────────────────────────────────────
      case 'kc_multiple_choice': case 'kc_multiple_response': {
        add('question', d.question, true);
        const opts = Array.isArray(d.options) ? d.options : [];
        opts.forEach((o, i) => {
          // Options can be plain strings or { text, feedback, correct } objects
          const text = typeof o === 'string' ? o : (o && o.text) || '';
          const feedback = typeof o === 'object' && o ? (o.feedback || '') : '';
          addItem('options', i, 'text', text, true);
          if (feedback) addItem('options', i, 'feedback', feedback, true);
        });
        break;
      }

      case 'kc_matching': {
        add('instruction', d.instruction, true);
        (d.left || []).forEach((item, i) => addItem('left', i, 'text', item, false));
        (d.right || []).forEach((item, i) => addItem('right', i, 'text', item, false));
        break;
      }

      case 'kc_fill_gap': {
        add('instruction', d.instruction, true);
        add('text', d.text, true);
        break;
      }

      case 'kc_ordering': {
        add('instruction', d.instruction, true);
        const items = Array.isArray(d.items) ? d.items : [];
        items.forEach((item, i) => {
          const text = typeof item === 'string' ? item : (item && item.text) || '';
          addItem('items', i, 'text', text, false);
        });
        break;
      }

      case 'kc_matching_cards': {
        add('instruction', d.instruction, true);
        const cats = Array.isArray(d.categories) ? d.categories : [];
        cats.forEach((cat, i) => {
          const text = typeof cat === 'string' ? cat : (cat && cat.name) || '';
          addItem('categories', i, 'text', text, false);
        });
        const cards = Array.isArray(d.cards) ? d.cards : [];
        cards.forEach((card, i) => {
          addItem('cards', i, 'text', card.text || '', false);
        });
        break;
      }

      // ── Action / Layout ───────────────────────────────────────
      case 'button':
        add('label', d.label, false);
        break;

      case 'continue':
        add('label', d.label, false);
        break;

      case 'numbered_divider':
        add('label', d.label, false);
        break;

      // Types with no translatable text (spacer, line_divider, image-only blocks)
      default:
        break;
    }

    return units;
  }

  // ── Course-level extraction ────────────────────────────────────

  /* Extracts all translatable strings from a course.
     Returns an array of FileGroup objects:
       { fileId: string, title: string, units: [{id, text, richText}] }
     The first group has fileId='course' and contains course metadata.
     Subsequent groups correspond to lessons/assessments. */
  function extract(course) {
    const groups = [];

    // Course-level metadata
    const courseUnits = [];
    const addCourse = (field, value) => {
      if (value != null && value !== '') {
        courseUnits.push({ id: sid('course', field), text: String(value), richText: false });
      }
    };
    addCourse('title', course.title);
    addCourse('description', course.description);
    addCourse('targetAudience', course.targetAudience);
    addCourse('language', course.language);
    // learnerOutcomes — plain strings shown to learners on the landing page
    (course.learnerOutcomes || []).forEach((outcome, i) => {
      if (outcome) {
        courseUnits.push({ id: sid('course', 'learnerOutcomes', i), text: String(outcome), richText: false });
      }
    });
    // objectives — internal planning metadata ({verb, text}); text is translatable
    (course.objectives || []).forEach((obj, i) => {
      if (obj && obj.text) {
        courseUnits.push({ id: sid('course', 'objectives', i, 'text'), text: obj.text, richText: false });
      }
    });
    if (courseUnits.length) {
      groups.push({ fileId: 'course', title: 'Course', units: courseUnits });
    }

    // One file group per lesson + assessment
    const allLessons = [
      ...(course.lessons || []),
      ...(course.assessments || []),
    ];

    allLessons.forEach(lesson => {
      const units = [];
      // Lesson title
      if (lesson.title) {
        units.push({ id: 'title', text: lesson.title, richText: false });
      }
      // Block content
      const blocks = (LumioState.lessons && LumioState.lessons[lesson.id]) || [];
      blocks.forEach(block => {
        const blockUnits = extractBlock(lesson.id, block);
        units.push(...blockUnits);
      });
      groups.push({ fileId: lesson.id, title: lesson.title || lesson.id, units });
    });

    return groups;
  }

  // ── XLIFF generation ──────────────────────────────────────────

  /* Renders a single <trans-unit> element.
     Returns empty string (caller must filter) when sourceContent is empty —
     this prevents empty <source> elements appearing in the XLIFF, which would
     cause the importer to overwrite the original field with an empty string. */
  function renderTransUnit(unit, sourceLocale, opts) {
    const preserveHtml = opts && opts.preserveHtml !== false;
    const sourceContent = (preserveHtml && unit.richText)
      ? htmlToXliffInline(unit.text)
      : escapeXml(unit.text);
    if (!sourceContent) return '';
    return `<trans-unit id="${escapeXml(unit.id)}"><source>${sourceContent}</source></trans-unit>`;
  }

  /* Renders a single <file> element containing all trans-units for one lesson. */
  function renderFile(group, sourceLocale, targetLocale, opts) {
    const targetAttr = targetLocale ? ` target-language="${escapeXml(targetLocale)}"` : '';
    const units = group.units
      .map(u => renderTransUnit(u, sourceLocale, opts))
      .filter(u => u)
      .map(u => '      ' + u)
      .join('\n');
    return `  <file original="${escapeXml(group.fileId)}" datatype="plaintext" source-language="${escapeXml(sourceLocale)}"${targetAttr}>
    <body>
${units}
    </body>
  </file>`;
  }

  /* Generates a complete XLIFF 1.2 document for a course.
     opts:
       sourceLocale:  e.g. 'en-us' (default: course.language or 'en-us')
       targetLocale:  e.g. 'fr-fr' (optional)
       preserveHtml:  true (default) — wrap rich text in <g> markup */
  function generateXliff(course, opts) {
    opts = opts || {};
    const sourceLocale = opts.sourceLocale
      || _localeCode(course.language)
      || 'en-us';
    const targetLocale = opts.targetLocale || '';
    const preserveHtml = opts.preserveHtml !== false;

    const groups = extract(course);
    const files = groups.map(g => renderFile(g, sourceLocale, targetLocale, { preserveHtml })).join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<xliff xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="${SCHEMA_LOC}"
  version="1.2"
  xmlns:xhtml="${XHTML_NS}"
  xml:space="preserve"
  xmlns="${XLIFF_NS}">
${files}
</xliff>`;
  }

  // Convert human-readable language name to BCP-47 locale code
  function _localeCode(language) {
    const map = {
      'English': 'en-us', 'Spanish': 'es-es', 'French': 'fr-fr',
      'German': 'de-de', 'Italian': 'it-it', 'Portuguese': 'pt-pt',
      'Dutch': 'nl-nl', 'Japanese': 'ja-jp', 'Chinese': 'zh-cn',
      'Arabic': 'ar-sa', 'Korean': 'ko-kr', 'Russian': 'ru-ru',
    };
    return language ? (map[language] || language.toLowerCase().replace(/\s+/, '-')) : 'en-us';
  }

  // ── XLIFF parsing ─────────────────────────────────────────────

  /* Parses an XLIFF 1.2 document string.
     Returns:
       { ok: true, files: Map<fileId, Map<unitId, string>>, sourceLocale, targetLocale, errors: [] }
       { ok: false, errors: [string] }
     Each file entry maps trans-unit ids to their <target> content (or
     <source> content if no <target> is present). */
  function parseXliff(xliffStr) {
    const errors = [];
    let doc;
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(xliffStr, 'text/xml');
      const parseErr = doc.querySelector('parsererror');
      if (parseErr) {
        errors.push('XML parse error: ' + (parseErr.textContent || 'invalid XML'));
        return { ok: false, errors };
      }
    } catch (e) {
      errors.push('Failed to parse XML: ' + e.message);
      return { ok: false, errors };
    }

    const root = doc.documentElement;
    if (!root || root.localName !== 'xliff') {
      errors.push('Root element is not <xliff>');
      return { ok: false, errors };
    }

    const version = root.getAttribute('version');
    if (version && version !== '1.2') {
      errors.push(`Unsupported XLIFF version: ${version}. Expected 1.2.`);
      return { ok: false, errors };
    }

    const files = new Map();
    let sourceLocale = '';
    let targetLocale = '';
    const idSet = new Set();
    let duplicateCount = 0;

    Array.from(root.children).forEach(fileEl => {
      if (fileEl.localName !== 'file') return;
      const fileId = fileEl.getAttribute('original') || '';
      const sl = fileEl.getAttribute('source-language') || '';
      const tl = fileEl.getAttribute('target-language') || '';
      if (sl && !sourceLocale) sourceLocale = sl;
      if (tl && !targetLocale) targetLocale = tl;

      const unitMap = new Map();

      const body = fileEl.querySelector('body');
      if (!body) return;

      Array.from(body.querySelectorAll('trans-unit')).forEach(tu => {
        const unitId = tu.getAttribute('id');
        if (!unitId) { errors.push('trans-unit missing id attribute'); return; }

        const compositeId = fileId + '::' + unitId;
        if (idSet.has(compositeId)) {
          duplicateCount++;
          errors.push(`Duplicate trans-unit id "${unitId}" in file "${fileId}"`);
          return;
        }
        idSet.add(compositeId);

        // Prefer <target>; fall back to <source> if no translation yet
        const targetEl = tu.querySelector('target');
        const sourceEl = tu.querySelector('source');
        const content = sourceToString(targetEl) || sourceToString(sourceEl) || '';
        unitMap.set(unitId, content);
      });

      files.set(fileId, unitMap);
    });

    return { ok: true, files, sourceLocale, targetLocale, errors };
  }

  // ── Import validation ─────────────────────────────────────────

  /* Validates parsed XLIFF against the current course state.
     Returns a detailed report:
       total:          total trans-units in the XLIFF
       matched:        IDs that map to current course content
       missing:        IDs in course not present in XLIFF
       unknown:        IDs in XLIFF not recognised in course
       duplicates:     duplicate IDs (from parseXliff errors)
       malformedHtml:  units where HTML reconstruction failed
       ready:          true if import is safe to proceed */
  function validateImport(course, parsed) {
    const report = {
      total: 0, matched: 0, missing: 0, unknown: 0,
      duplicates: 0, malformedHtml: 0,
      missingIds: [], unknownIds: [],
      ready: false,
    };

    if (!parsed || !parsed.ok) {
      report.error = (parsed && parsed.errors && parsed.errors[0]) || 'Parse failed';
      return report;
    }

    // Count duplicates from parse errors
    report.duplicates = parsed.errors.filter(e => e.startsWith('Duplicate')).length;

    // Build expected ID set from course extraction
    const expectedGroups = extract(course);
    const expectedIds = new Map(); // compositeId → true
    expectedGroups.forEach(group => {
      group.units.forEach(unit => {
        const compositeId = group.fileId + '::' + unit.id;
        expectedIds.set(compositeId, unit);
      });
      // Lesson title uses bare 'title' id
      if (group.fileId !== 'course') {
        expectedIds.set(group.fileId + '::title', { id: 'title', text: '', richText: false });
      }
    });

    // Check XLIFF against expected
    const seenIds = new Set();
    parsed.files.forEach((unitMap, fileId) => {
      unitMap.forEach((value, unitId) => {
        report.total++;
        const compositeId = fileId + '::' + unitId;
        if (expectedIds.has(compositeId)) {
          report.matched++;
          seenIds.add(compositeId);
        } else {
          report.unknown++;
          if (report.unknownIds.length < 20) report.unknownIds.push(compositeId);
        }
        // Basic HTML well-formedness check for rich text
        if (value && value.includes('<') && !_isWellFormedHtml(value)) {
          report.malformedHtml++;
        }
      });
    });

    // Check for missing IDs
    expectedIds.forEach((unit, compositeId) => {
      if (!seenIds.has(compositeId)) {
        report.missing++;
        if (report.missingIds.length < 20) report.missingIds.push(compositeId);
      }
    });

    report.ready = report.unknown === 0 && report.malformedHtml === 0 && parsed.errors.length === 0;
    return report;
  }

  function _isWellFormedHtml(html) {
    if (!html || !html.includes('<')) return true;
    try {
      const d = document.createElement('div');
      d.innerHTML = html;
      return true;
    } catch (_) {
      return false;
    }
  }

  // ── Apply translation ─────────────────────────────────────────

  /* Merges translated strings from parsed XLIFF back into the course.
     MUTATES course.lessons, LumioState.lessons blocks in place.
     Returns { applied: number, skipped: number }.

     ARCHITECTURE RULE — permanent:
       The Translation Engine is a pure text transformation engine.
       It may modify learner-visible text only.
       It must NEVER modify object structure, object identity, asset references,
       UUIDs, IDs, settings, layouts, themes, interactions, or media.
       No array may be replaced. No object may be replaced. No new object may be
       created. Only approved text property values may change.

     Phase 1: in-place replacement.
     Phase 2 architecture: store in course.translations[locale] instead,
     and read the active locale when rendering. See docs/translation-engine.md. */
  function applyTranslation(course, parsed) {
    const result = { applied: 0, skipped: 0 };
    if (!parsed || !parsed.ok) { result.error = 'Cannot apply invalid XLIFF'; return result; }

    // Apply course-level strings
    const courseFile = parsed.files.get('course');
    if (courseFile) {
      _applyCourseMeta(course, courseFile, result);
    }

    // Apply lesson/assessment strings
    const allLessons = [...(course.lessons || []), ...(course.assessments || [])];
    allLessons.forEach(lesson => {
      const unitMap = parsed.files.get(lesson.id);
      if (!unitMap) return;

      // Lesson title
      if (unitMap.has('title')) {
        lesson.title = unitMap.get('title');
        result.applied++;
      }

      // Block content
      const blocks = (LumioState.lessons && LumioState.lessons[lesson.id]) || [];
      blocks.forEach(block => {
        _applyBlock(block, unitMap, result);
      });
    });

    return result;
  }

  function _applyCourseMeta(course, unitMap, result) {
    const simple = ['title', 'description', 'targetAudience', 'language'];
    simple.forEach(field => {
      const id = sid('course', field);
      if (unitMap.has(id)) {
        course[field] = unitMap.get(id);
        result.applied++;
      }
    });
    // learnerOutcomes — plain string array
    (course.learnerOutcomes || []).forEach((_, i) => {
      const id = sid('course', 'learnerOutcomes', i);
      if (unitMap.has(id)) {
        course.learnerOutcomes[i] = unitMap.get(id);
        result.applied++;
      }
    });
    // objectives — {verb, text} objects
    (course.objectives || []).forEach((obj, i) => {
      const id = sid('course', 'objectives', i, 'text');
      if (unitMap.has(id) && obj) {
        obj.text = unitMap.get(id);
        result.applied++;
      }
    });
  }

  function _applyBlock(block, unitMap, result) {
    const d = block.data || (block.data = {});
    const bid = block.id;

    function get(field) {
      const id = sid(bid, field);
      return unitMap.has(id) ? unitMap.get(id) : null;
    }
    function apply(field) {
      const v = get(field);
      if (v !== null) { d[field] = v; result.applied++; return true; }
      return false;
    }
    function applyItem(arrayField, index, subField) {
      const id = sid(bid, arrayField, index, subField);
      if (!unitMap.has(id)) return false;
      // Only update an item that already exists in the block data.
      // Never create stub objects or convert types — that would be a structural mutation.
      const arr = d[arrayField];
      if (!arr || !arr[index] || typeof arr[index] !== 'object') return false;
      arr[index][subField] = unitMap.get(id);
      result.applied++;
      return true;
    }

    switch (block.type) {
      case 'heading': apply('heading'); break;
      case 'heading_paragraph': apply('heading'); apply('body'); break;
      case 'paragraph': apply('body'); break;

      case 'columns': {
        const cols = d.cols || [];
        cols.forEach((_, i) => {
          const id = sid(bid, 'cols', i, 'text');
          if (unitMap.has(id)) {
            d.cols[i] = unitMap.get(id);
            result.applied++;
          }
        });
        break;
      }

      case 'table': {
        const rows = d.rows || [];
        rows.forEach((row, ri) => {
          (row || []).forEach((_, ci) => {
            const id = sid(bid, 'rows', ri + '-' + ci, 'text');
            if (unitMap.has(id)) {
              d.rows[ri][ci] = unitMap.get(id);
              result.applied++;
            }
          });
        });
        break;
      }

      case 'stmt_info': case 'stmt_tip': case 'stmt_success':
      case 'stmt_warning': case 'stmt_error': case 'stmt_note':
        apply('title'); apply('text'); break;

      case 'quote1': case 'quote2': case 'quote3': case 'quote4':
        apply('text'); apply('author'); break;

      case 'quote_image':
        apply('text'); apply('author'); apply('caption'); break;

      case 'quote_carousel': {
        const quotes = d.quotes || [];
        quotes.forEach((_, i) => { applyItem('quotes', i, 'text'); applyItem('quotes', i, 'author'); });
        break;
      }

      case 'list_numbered': case 'list_bullet': case 'list_checkbox': {
        apply('heading');
        const items = d.items || [];
        items.forEach((_, i) => {
          const id = sid(bid, 'items', i, 'text');
          if (unitMap.has(id)) {
            // Preserve original type — strings stay strings, objects get .text updated.
            // Converting string items to objects would mutate the schema and break D1 persistence.
            if (typeof d.items[i] === 'string') d.items[i] = unitMap.get(id);
            else { if (!d.items[i]) d.items[i] = {}; d.items[i].text = unitMap.get(id); }
            result.applied++;
          }
        });
        break;
      }

      case 'image': apply('caption'); apply('alt'); break;
      case 'image_text': apply('heading'); apply('body'); apply('caption'); break;
      case 'text_on_image': apply('heading'); apply('body'); break;

      case 'carousel': case 'column_grid': {
        const items = d.items || [];
        items.forEach((_, i) => {
          applyItem('items', i, 'heading');
          applyItem('items', i, 'body');
          applyItem('items', i, 'caption');
        });
        break;
      }

      case 'audio': case 'video':
        apply('caption'); apply('transcript'); break;

      case 'file': apply('caption'); break;

      case 'chart_bar': case 'chart_line': case 'chart_pie': {
        apply('title'); apply('xLabel'); apply('yLabel');
        const items = d.items || [];
        items.forEach((item, i) => {
          const id = sid(bid, 'chartItems', i, 'label');
          if (unitMap.has(id) && d.items[i]) {
            d.items[i].label = unitMap.get(id);
            result.applied++;
          }
        });
        break;
      }

      case 'accordion': case 'tabs': case 'process': {
        const items = d.items || [];
        items.forEach((_, i) => { applyItem('items', i, 'title'); applyItem('items', i, 'body'); });
        break;
      }

      case 'labelled_graphic': {
        const hotspots = d.hotspots || [];
        hotspots.forEach((_, i) => { applyItem('hotspots', i, 'title'); applyItem('hotspots', i, 'body'); });
        break;
      }

      case 'flashcard_grid': case 'flashcard_stack': {
        const items = d.items || [];
        items.forEach((_, i) => {
          const item = d.items[i];
          if (!item) return;
          const frontId = sid(bid, 'items', i, 'front.text');
          if (unitMap.has(frontId) && item.front && typeof item.front === 'object') {
            item.front.text = unitMap.get(frontId);
            result.applied++;
          }
          const backId = sid(bid, 'items', i, 'back.text');
          if (unitMap.has(backId) && item.back && typeof item.back === 'object') {
            item.back.text = unitMap.get(backId);
            result.applied++;
          }
        });
        break;
      }

      case 'scenario': {
        const scenes = d.scenes || [];
        scenes.forEach((scene, si) => {
          const titleId = sid(bid, 'scenes', si, 'title');
          if (unitMap.has(titleId)) { scene.title = unitMap.get(titleId); result.applied++; }
          const dialogueId = sid(bid, 'scenes', si, 'dialogue');
          if (unitMap.has(dialogueId)) { scene.dialogue = unitMap.get(dialogueId); result.applied++; }
          const charId = sid(bid, 'scenes', si, 'characterName');
          if (unitMap.has(charId)) { scene.characterName = unitMap.get(charId); result.applied++; }
          (scene.choices || []).forEach((choice, ci) => {
            const textId = sid(bid, 'scenes', si, 'choices', ci, 'text');
            if (unitMap.has(textId)) { choice.text = unitMap.get(textId); result.applied++; }
            const fbId = sid(bid, 'scenes', si, 'choices', ci, 'feedback');
            if (unitMap.has(fbId)) { choice.feedback = unitMap.get(fbId); result.applied++; }
          });
        });
        break;
      }

      case 'kc_multiple_choice': case 'kc_multiple_response': {
        apply('question');
        const opts = d.options || [];
        opts.forEach((o, i) => {
          const textId = sid(bid, 'options', i, 'text');
          const fbId   = sid(bid, 'options', i, 'feedback');
          if (unitMap.has(textId)) {
            if (typeof d.options[i] === 'string') d.options[i] = unitMap.get(textId);
            else if (d.options[i]) d.options[i].text = unitMap.get(textId);
            result.applied++;
          }
          if (unitMap.has(fbId) && typeof d.options[i] === 'object' && d.options[i]) {
            d.options[i].feedback = unitMap.get(fbId);
            result.applied++;
          }
        });
        break;
      }

      case 'kc_matching': {
        apply('instruction');
        (d.left || []).forEach((_, i) => {
          const id = sid(bid, 'left', i, 'text');
          if (unitMap.has(id)) { d.left[i] = unitMap.get(id); result.applied++; }
        });
        (d.right || []).forEach((_, i) => {
          const id = sid(bid, 'right', i, 'text');
          if (unitMap.has(id)) { d.right[i] = unitMap.get(id); result.applied++; }
        });
        break;
      }

      case 'kc_fill_gap': apply('instruction'); apply('text'); break;

      case 'kc_ordering': {
        apply('instruction');
        const items = d.items || [];
        items.forEach((item, i) => {
          const id = sid(bid, 'items', i, 'text');
          if (unitMap.has(id)) {
            if (typeof d.items[i] === 'string') d.items[i] = unitMap.get(id);
            else if (d.items[i]) d.items[i].text = unitMap.get(id);
            result.applied++;
          }
        });
        break;
      }

      case 'kc_matching_cards': {
        apply('instruction');
        (d.categories || []).forEach((cat, i) => {
          const id = sid(bid, 'categories', i, 'text');
          if (unitMap.has(id)) {
            if (typeof d.categories[i] === 'string') d.categories[i] = unitMap.get(id);
            else if (d.categories[i]) d.categories[i].name = unitMap.get(id);
            result.applied++;
          }
        });
        (d.cards || []).forEach((card, i) => {
          const id = sid(bid, 'cards', i, 'text');
          if (unitMap.has(id)) { d.cards[i] = d.cards[i] || {}; d.cards[i].text = unitMap.get(id); result.applied++; }
        });
        break;
      }

      case 'button': case 'continue': case 'numbered_divider':
        apply('label'); break;

      default: break;
    }
  }

  // ── Utility: download helper ──────────────────────────────────

  function downloadXliff(xliffStr, filename) {
    const blob = new Blob([xliffStr], { type: 'application/xliff+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'course.xlf';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ── String count helper ───────────────────────────────────────

  function countStrings(course) {
    const groups = extract(course);
    return groups.reduce((sum, g) => sum + g.units.length, 0);
  }

  // ── Extension points (reserved — not yet implemented) ─────────

  /* AI Translation adapters.
     Future: TranslationEngine.AI.translate(units, opts) → translatedUnits
     Supported providers: openai, anthropic, google, azure, deepl, local
     All adapters receive the same units[] array and produce translated units[].
     The Translation Engine merges the result via applyTranslation(). */
  const AI = {
    PROVIDERS: ['openai', 'anthropic', 'google', 'azure', 'deepl', 'local'],
    // translate(units, { provider, sourceLocale, targetLocale, apiKey }) → Promise<units>
    translate: null, // reserved
  };

  /* Translation Memory.
     Future: TranslationEngine.MEMORY.lookup(text, locale) → string|null
     Stores previously translated strings for reuse across courses.
     Keyed by source text hash + locale pair. */
  const MEMORY = {
    // lookup(text, locale) → cached translation or null
    lookup: null,
    // store(text, translated, locale)
    store: null,
  };

  /* Translation History.
     Future: course.translations = { 'es': Map<compositeId, string>, ... }
     Phase 2: applyTranslation stores into course.translations[locale]
     instead of mutating block.data directly, enabling multiple language
     variants of a single course to coexist without data duplication. */
  const HISTORY = {
    // getLocales(course) → string[]
    // getTranslation(course, locale) → Map<compositeId, string>
    // setTranslation(course, locale, map) → void
  };

  // ── Public API ────────────────────────────────────────────────

  return {
    extract,
    generateXliff,
    parseXliff,
    validateImport,
    applyTranslation,
    downloadXliff,
    countStrings,
    htmlToXliffInline,
    // Extension points
    AI,
    MEMORY,
    HISTORY,
  };
})();
