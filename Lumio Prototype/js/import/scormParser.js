/* ============================================================
   SCORM PARSER — Import Engine Milestone 3
   Transforms the M2 Import Session into the Normalized Content Model.
   Output is a single in-memory object. Nothing is written anywhere.
   No project creation. No LumioState writes. No Builder access.
   ============================================================ */

const ScormParser = (() => {

  // HTML tags allowed through the sanitizer
  const ALLOWED_TAGS = new Set([
    'p','br','strong','b','em','i','u','s','strike',
    'a','ul','ol','li','h1','h2','h3','h4','h5','h6',
    'blockquote','code','pre','table','thead','tbody',
    'tr','th','td','sup','sub',
  ]);

  const IMAGE_EXT = new Set(['jpg','jpeg','png','gif','svg','webp','bmp','ico','avif']);
  const VIDEO_EXT = new Set(['mp4','webm','m4v','mov','ogv','avi']);
  const AUDIO_EXT = new Set(['mp3','wav','ogg','m4a','aac','flac']);

  /* ── Public API ──────────────────────────────────────────── */

  async function parse(session, file) {
    const notifId = NotifySystem.progress('Parsing SCORM package…');
    let ncm;
    try {
      ncm = await _doParse(session, file, notifId);
    } catch (err) {
      NotifySystem.complete(notifId, 'Parse failed', 'error');
      _showError(err.message || 'Parsing failed unexpectedly.');
      return;
    }
    const warnCount = ncm.statistics.warningCount;
    NotifySystem.complete(notifId, `Parsed — ${ncm.statistics.blockCount} blocks`, warnCount ? 'warning' : 'success');
    ScormValidator.present(ncm);
  }

  /* ── Core parse pipeline ─────────────────────────────────── */

  async function _doParse(session, file, notifId) {
    NotifySystem.updateProgress(notifId, 10, 'Opening package…');
    const zip = await JSZip.loadAsync(file);

    NotifySystem.updateProgress(notifId, 20, 'Decoding course JSON…');
    const indexPath = Object.keys(zip.files).find(f => f.toLowerCase() === 'scormcontent/index.html');
    if (!indexPath) throw new Error('scormcontent/index.html not found in package — cannot parse.');
    const html = await zip.file(indexPath).async('string');
    const riseJson = _decodeCourseJson(html);
    if (!riseJson) throw new Error('Course data blob could not be decoded from this package.');

    const course  = riseJson.course  || riseJson;
    const labelSet = riseJson.labelSet || {};
    const ncm = _buildSkeleton(session, course, labelSet);

    const lessons      = Array.isArray(course.lessons) ? course.lessons : [];
    const assetRegistry = new Map();
    const seenIds      = new Set();

    for (let li = 0; li < lessons.length; li++) {
      const pct = 30 + Math.round((li / Math.max(lessons.length, 1)) * 55);
      NotifySystem.updateProgress(notifId, pct, `Parsing lesson ${li + 1} of ${lessons.length}…`);
      _parseLesson(lessons[li], li, ncm, assetRegistry, seenIds);
    }

    ncm.assets = Array.from(assetRegistry.values());
    _finalizeStats(ncm);
    _validate(ncm, zip);
    ncm._zip = zip; // retained in memory for M6 asset extraction
    NotifySystem.updateProgress(notifId, 100);
    return ncm;
  }

  /* ── NCM skeleton ────────────────────────────────────────── */

  function _buildSkeleton(session, course, labelSet) {
    const locale = course.locale || labelSet.iso639Code || 'en';
    return {
      metadata: {
        sourceId:        course.id       || null,
        title:           course.title    || session.courseTitle || null,
        locale,
        color:           course.color    || null,
        scormVersion:    session.scormVersion,
        isRise360:       session.isRise360,
        packageSize:     session.fileSize,
        packageFilename: session.filename,
        importedAt:      Date.now(),
        navigationMode:  course.navigationMode || null,
      },
      course: {
        id:     course.id    || null,
        title:  course.title || null,
        locale,
        color:  course.color || null,
      },
      sections:    [],
      lessons:     [],
      blocks:      [],
      assessments: [],
      assets:      [],
      warnings:    [],
      statistics: {
        lessonCount: 0, blockCount: 0, omittedCount: 0,
        convertedCount: 0, assetCount: 0, externalAssetCount: 0,
        quizQuestionCount: 0, warningCount: 0, unknownBlockCount: 0,
      },
      validation: {
        valid: false, errors: [], warnings: [],
        unknownTypes: [], missingAssets: [], duplicateIds: [], malformedBlocks: [],
      },
    };
  }

  /* ── Lesson parsing ──────────────────────────────────────── */

  function _parseLesson(lesson, li, ncm, assetRegistry, seenIds) {
    const id = lesson.id || `lesson-${li}`;
    _checkDupId(id, 'lesson', seenIds, ncm);

    const isQuiz = lesson.type === 'quiz';
    const parsed = {
      id,
      title:      lesson.title || `Lesson ${li + 1}`,
      type:       isQuiz ? 'quiz' : 'blocks',
      index:      li,
      blockCount: 0,
    };

    if (isQuiz) {
      const s = lesson.settings || {};
      parsed.quizSettings = {
        passingScore:           s.passingScore           ?? null,
        retryCount:             s.retryCount             ?? null,
        revealAnswers:          s.revealAnswers           ?? null,
        shuffleAnswerChoices:   s.shuffleAnswerChoices    ?? false,
        randomizeQuestionOrder: s.randomizeQuestionOrder  ?? false,
      };
    }
    ncm.lessons.push(parsed);

    const blocks = Array.isArray(lesson.items) ? lesson.items : [];

    if (isQuiz) {
      const assessment = {
        lessonId: id, lessonIndex: li,
        questions: [],
        settings: parsed.quizSettings || {},
      };
      for (const b of blocks) {
        if (b.type === 'MULTIPLE_CHOICE' || b.type === 'MULTIPLE_RESPONSE') {
          const q = _parseQuestion(b, id, ncm);
          if (q) { assessment.questions.push(q); ncm.statistics.quizQuestionCount++; }
        } else {
          _warn(ncm, 'UNKNOWN_BLOCK_TYPE', id, b.id,
            `Unknown quiz block type "${b.type}" in lesson "${parsed.title}". Block skipped.`);
          ncm.validation.unknownTypes.push(b.type);
          ncm.statistics.unknownBlockCount++;
        }
      }
      ncm.assessments.push(assessment);
    } else {
      let bi = 0;
      for (const b of blocks) {
        const expanded = _parseBlock(b, id, li, bi, ncm, assetRegistry, seenIds);
        for (const pb of expanded) { ncm.blocks.push(pb); bi++; }
      }
      parsed.blockCount = bi;
    }
  }

  /* ── Block parsing (returns array — some blocks expand to multiple) */

  function _parseBlock(block, lessonId, lessonIndex, bi, ncm, assetRegistry, seenIds) {
    const id      = block.id      || `block-${lessonIndex}-${bi}`;
    const family  = (block.family  || '').toLowerCase();
    const variant = (block.variant || '').toLowerCase();
    const items   = Array.isArray(block.items) ? block.items : [];

    _checkDupId(id, 'block', seenIds, ncm);

    const base = {
      id, lessonId, lessonIndex, index: bi,
      sourceType: block.type, sourceFamily: block.family, sourceVariant: block.variant,
      type: null, data: {}, importRecord: null, assetRefs: [],
    };

    try {
      // ── continue dividers: omit ─────────────────────────
      if (family === 'continue') {
        ncm.statistics.omittedCount++;
        return [{ ...base, type: 'omit',
          data: { reason: 'continue-divider', title: (items[0] || {}).title || '' },
          importRecord: { status: 'OMITTED', message: 'Continue divider removed. Lumio uses continuous scroll.' },
        }];
      }

      // ── spacing divider ─────────────────────────────────
      if (family === 'divider') {
        return [{ ...base, type: 'divider', data: {},
          importRecord: { status: 'IMPORTED', message: 'Spacing divider.' },
        }];
      }

      // ── text blocks ─────────────────────────────────────
      if (family === 'text') return _textBlock(block, base, items, ncm, assetRegistry, lessonId);

      // ── impact / callout ─────────────────────────────────
      if (family === 'impact') return _calloutBlock(base, items, ncm);

      // ── image blocks ─────────────────────────────────────
      if (family === 'image') return _imageBlock(block, base, items, ncm, assetRegistry, lessonId, variant);

      // ── list blocks ──────────────────────────────────────
      if (family === 'list') return _listBlock(block, base, items);

      // ── interactive tabs ─────────────────────────────────
      if (family === 'interactive') {
        if (variant.includes('tab')) return _tabsBlock(block, base, items, ncm, assetRegistry, lessonId);
        _warn(ncm, 'UNKNOWN_BLOCK_TYPE', lessonId, id,
          `Unsupported interactive variant "${block.variant}". Raw data preserved for future milestone.`);
        ncm.statistics.unknownBlockCount++;
        return [_unknownBlock(base, block, 'FALLBACK', `Interactive variant "${block.variant}" not yet supported.`)];
      }

      // ── labeled graphic / hotspot ────────────────────────
      if (family === 'interactive-fullscreen') return _hotspotBlock(block, base, ncm, assetRegistry, lessonId);

      // ── flashcard ────────────────────────────────────────
      if (family === 'flashcard') return _flashcardBlock(block, base, items, ncm, assetRegistry, lessonId, variant);

      // ── unknown block family ─────────────────────────────
      _warn(ncm, 'UNKNOWN_BLOCK_TYPE', lessonId, id,
        `Unknown block: family="${block.family}", variant="${block.variant}". Raw data preserved.`);
      ncm.validation.unknownTypes.push(`${block.family || '?'}/${block.variant || '?'}`);
      ncm.statistics.unknownBlockCount++;
      return [_unknownBlock(base, block, 'FALLBACK', `Unknown block type "${block.family}/${block.variant}".`)];

    } catch (err) {
      ncm.validation.malformedBlocks.push({ id, lessonId, error: err.message });
      _warn(ncm, 'MALFORMED_BLOCK', lessonId, id, `Block could not be parsed: ${err.message}`);
      return [{ ...base, type: 'unknown', data: { error: err.message },
        importRecord: { status: 'FALLBACK', message: `Parse error: ${err.message}` },
      }];
    }
  }

  function _unknownBlock(base, block, status, message) {
    return { ...base, type: 'unknown',
      data: { family: block.family, variant: block.variant },
      importRecord: { status, message },
    };
  }

  /* ── Block type handlers ─────────────────────────────────── */

  function _textBlock(block, base, items, ncm, assetRegistry, lessonId) {
    const item     = items[0] || {};
    const isParaOnly = (block.variant || '').toLowerCase() === 'paragraph';
    const heading  = isParaOnly ? '' : _sanitizeHtml(item.heading   || '');
    const body     = _sanitizeHtml(item.paragraph || '');
    const results  = [];

    // Background-image edge case (Phase 3 spec Part 3)
    const settings = block.settings || {};
    const bgImg    = ((block.background || {}).media || {}).image || {};
    if (settings.backgroundType === 'IMAGE' && bgImg.key) {
      const ref = _regAsset(bgImg, 'image', assetRegistry, base.id + '-bg');
      if (ref) {
        results.push({ ...base, id: base.id + '-bg', type: 'image',
          data: { src: ref.id, caption: '', alt: '' }, assetRefs: [ref],
          importRecord: { status: 'IMPORTED', message: 'Background image extracted as separate block above text.' },
        });
        _warn(ncm, 'BACKGROUND_TEXT_SPLIT', lessonId, base.id,
          `Background image on text block separated into a preceding image block. Inline colour styles stripped.`);
        ncm.statistics.convertedCount++;
      }
    }

    results.push({ ...base, type: 'text', data: { heading, body },
      importRecord: results.length
        ? { status: 'CONVERTED', message: 'Background image removed and inserted as separate block above. Inline colours stripped.' }
        : { status: 'IMPORTED', message: `Text block (${block.variant || 'text'}).` },
    });
    return results;
  }

  function _calloutBlock(base, items, ncm) {
    const item = items[0] || {};
    ncm.statistics.convertedCount++;
    return [{ ...base, type: 'callout',
      data: { html: _sanitizeHtml(item.paragraph || ''), variant: 'note' },
      importRecord: { status: 'CONVERTED', message: 'Impact callout converted to callout block. Visual emphasis removed.' },
    }];
  }

  function _imageBlock(block, base, items, ncm, assetRegistry, lessonId, variant) {
    const item     = items[0] || {};
    const img      = (item.media || {}).image || {};
    const ref      = _regAsset(img, 'image', assetRegistry, base.id);
    const isOverlay = variant.includes('text overlay');
    const overlay  = isOverlay ? _sanitizeHtml(item.paragraph || '') : '';
    const results  = [{ ...base, type: 'image',
      data: {
        src:         ref ? ref.id : null,
        caption:     _sanitizeHtml(item.caption || ''),
        alt:         '',
        overlayText: overlay,
      },
      assetRefs: ref ? [ref] : [],
      importRecord: { status: 'IMPORTED', message: `Image block (${variant || 'full'}).` },
    }];
    if (isOverlay && overlay) {
      results.push({ ...base, id: base.id + '-txt', type: 'text',
        data: { heading: '', body: overlay }, assetRefs: [],
        importRecord: { status: 'CONVERTED', message: 'Text overlay extracted as separate text block below image.' },
      });
      ncm.statistics.convertedCount++;
    }
    return results;
  }

  function _listBlock(block, base, items) {
    const v = (block.variant || '').toLowerCase();
    const style = v.includes('checkbox') ? 'checkbox' : v.includes('number') ? 'numbered' : 'bullet';
    return [{ ...base, type: 'list',
      data: { style, items: items.map(i => _sanitizeHtml(i.paragraph || '')) },
      importRecord: { status: 'IMPORTED', message: `List (${style}).` },
    }];
  }

  function _tabsBlock(block, base, items, ncm, assetRegistry, lessonId) {
    ncm.statistics.convertedCount++;
    _warn(ncm, 'TABS_EXPANDED', lessonId, base.id,
      `Interactive tabs (${items.length} tab${items.length !== 1 ? 's' : ''}) expanded to sequential blocks. All content preserved. Interactive layout removed.`);
    const tabs = items.map((item, i) => {
      const img = (item.media || {}).image || {};
      const ref = _regAsset(img, 'image', assetRegistry, base.id + '-t' + i);
      return {
        title:        _sanitizeText(item.title || ''),
        description:  _sanitizeHtml(item.description || ''),
        imageAssetId: ref ? ref.id : null,
      };
    });
    return [{ ...base, type: 'tabs', data: { tabs },
      importRecord: { status: 'CONVERTED', message: `Interactive tabs (${items.length}) expanded. Interaction removed, all content preserved.` },
    }];
  }

  function _hotspotBlock(block, base, ncm, assetRegistry, lessonId) {
    const bgImg = ((block.background || {}).media || {}).image || {};
    const bgRef = _regAsset(bgImg, 'image', assetRegistry, base.id + '-bg');
    const items = Array.isArray(block.items) ? block.items : [];
    const hotspots = items.map(pin => ({
      x:     parseFloat(pin.x) || 0,
      y:     parseFloat(pin.y) || 0,
      title: _sanitizeText(pin.title       || ''),
      body:  _sanitizeHtml(pin.description || ''),
      icon:  pin.icon || null,
    }));
    return [{ ...base, type: 'hotspot',
      data: { backgroundAssetId: bgRef ? bgRef.id : null, hotspots },
      assetRefs: bgRef ? [bgRef] : [],
      importRecord: { status: 'IMPORTED', message: `Labeled graphic with ${hotspots.length} hotspot(s).` },
    }];
  }

  function _flashcardBlock(block, base, items, ncm, assetRegistry, lessonId, variant) {
    const cards = [];
    const refs  = [];
    for (let i = 0; i < items.length; i++) {
      const item     = items[i];
      const frontImg = ((item.front || {}).media || {}).image || {};
      const backImg  = ((item.back  || {}).media || {}).image || {};
      const frontRef = _regAsset(frontImg, 'image', assetRegistry, base.id + '-f' + i);
      if (frontRef && !frontRef.isExternal) refs.push(frontRef);
      if (backImg.key) {
        const backRef = _regAsset(backImg, 'image', assetRegistry, base.id + '-b' + i);
        if (backRef && backRef.isExternal && backRef.referenceCount === 1) {
          _warn(ncm, 'EXTERNAL_ASSET', lessonId, base.id,
            `Flashcard back image "${backImg.key}" is a CDN asset (not in this package). Back image omitted.`);
        }
      }
      cards.push({
        front: { imageAssetId: frontRef ? frontRef.id : null, text: _sanitizeHtml((item.front || {}).description || '') },
        back:  { text: _sanitizeHtml((item.back  || {}).description || '') },
      });
    }
    return [{ ...base, type: 'flashcard',
      data: { variant: variant.includes('stack') ? 'stack' : 'flashcard', cards },
      assetRefs: refs,
      importRecord: { status: 'IMPORTED', message: `Flashcard (${variant || 'flashcard'}), ${cards.length} card(s).` },
    }];
  }

  /* ── Quiz question parsing ───────────────────────────────── */

  function _parseQuestion(block, lessonId, ncm) {
    try {
      const answers = Array.isArray(block.answers) ? block.answers : [];
      // Authoritative source: answers[n].correct === true
      // block.correct and block.corrects[] are potentially stale in Rise exports
      // (see Phase 3 spec Part 6 — 12/15 questions in DID-007 show divergence)
      const correctIds  = new Set(answers.filter(a => a.correct === true).map(a => a.id));
      const topLevelIds = [block.correct, ...(Array.isArray(block.corrects) ? block.corrects : [])].filter(Boolean);
      const hasConflict = topLevelIds.length > 0 && topLevelIds.some(id => !correctIds.has(id));
      if (hasConflict) {
        _warn(ncm, 'QUIZ_CORRECT_CONFLICT', lessonId, block.id,
          `Question "${_truncate(_sanitizeText(block.title || ''), 60)}" — correct/corrects fields diverge. Using answers[n].correct as authoritative.`);
      }
      return {
        id:              block.id || null,
        type:            block.type,
        question:        _sanitizeHtml(block.title || ''),
        options:         answers.map(a => ({
          id:       a.id,
          text:     _sanitizeHtml((a.title || '').replace(/ |&nbsp;/g, ' ').trim()),
          correct:  a.correct === true,
          feedback: _sanitizeHtml(a.feedback || ''),
        })),
        shuffle:         block.settings?.shuffleAnswerChoices ?? false,
        feedback:        _sanitizeHtml(block.feedback || ''),
        correctConflict: hasConflict,
      };
    } catch (err) {
      ncm.validation.malformedBlocks.push({ blockId: block.id, lessonId, error: err.message });
      _warn(ncm, 'MALFORMED_BLOCK', lessonId, block.id, `Quiz question parse error: ${err.message}`);
      return null;
    }
  }

  /* ── Asset registry ──────────────────────────────────────── */

  function _regAsset(img, type, assetRegistry, refId) {
    if (!img || !img.key) return null;
    const isExt = img.sourcedFrom === 'DEFAULT';
    const key   = isExt ? `ext:${img.key}` : _resolveZipPath(img);
    if (!key) return null;

    if (!assetRegistry.has(key)) {
      const ext = (key.split('.').pop() || '').toLowerCase();
      assetRegistry.set(key, {
        id:             `asset-${assetRegistry.size}`,
        originalPath:   img.key,
        zipPath:        isExt ? null : key,
        type:           IMAGE_EXT.has(ext) ? 'image' : VIDEO_EXT.has(ext) ? 'video' : AUDIO_EXT.has(ext) ? 'audio' : type,
        ext,
        sourcedFrom:    img.sourcedFrom || 'USER',
        isExternal:     isExt,
        referenceCount: 0,
        blocks:         [],
      });
    }
    const ref = assetRegistry.get(key);
    ref.referenceCount++;
    if (refId && !ref.blocks.includes(refId)) ref.blocks.push(refId);
    return ref;
  }

  function _resolveZipPath(img) {
    if (!img || !img.key) return null;
    // Strip any path prefix (e.g. "G8cNbk/rI5xSS9-f9TP9nD5-Picture23.svg" → "rI5xSS9-f9TP9nD5-Picture23.svg")
    // Use crushedKey filename when useCrushedKey is true (see Phase 3 spec Part 5)
    let fname = (img.useCrushedKey && img.crushedKey) ? img.crushedKey : img.key;
    fname = fname.split('/').pop();
    return `scormcontent/assets/${fname}`;
  }

  /* ── HTML sanitizer ──────────────────────────────────────── */

  function _sanitizeHtml(html) {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      _cleanNode(doc.body);
      return doc.body.innerHTML.trim();
    } catch (_) {
      return String(html).replace(/<[^>]+>/g, '').trim();
    }
  }

  function _cleanNode(node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        } else {
          for (const attr of Array.from(child.attributes)) {
            const keep = tag === 'a' && attr.name === 'href';
            if (!keep) child.removeAttribute(attr.name);
          }
          _cleanNode(child);
        }
      } else if (child.nodeType === 3) {
        child.textContent = child.textContent.replace(/ /g, ' ');
      }
    }
  }

  function _sanitizeText(text) {
    if (!text) return '';
    try {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      return doc.body.textContent.replace(/ /g, ' ').trim();
    } catch (_) { return String(text).trim(); }
  }

  /* ── Validation & statistics ─────────────────────────────── */

  function _decodeCourseJson(html) {
    const m = html.match(/deserialize\s*\(\s*['"`]([A-Za-z0-9+/=\s\r\n]+)['"`]\s*\)/s);
    if (!m) return null;
    try {
      const b64   = m[1].replace(/[\s\r\n]/g, '');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (_) { return null; }
  }

  function _checkDupId(id, kind, seenIds, ncm) {
    if (seenIds.has(id)) {
      ncm.validation.duplicateIds.push({ id, kind });
      _warn(ncm, 'DUPLICATE_ID', null, id, `Duplicate ${kind} ID "${id}".`);
    } else {
      seenIds.add(id);
    }
  }

  function _warn(ncm, code, lessonId, blockId, message) {
    ncm.warnings.push({ code, lessonId: lessonId || null, blockId: blockId || null, message });
    ncm.statistics.warningCount++;
  }

  function _finalizeStats(ncm) {
    const content = ncm.blocks.filter(b => b.type !== 'omit');
    ncm.statistics.lessonCount        = ncm.lessons.length;
    ncm.statistics.blockCount         = content.length;
    ncm.statistics.assetCount         = ncm.assets.filter(a => !a.isExternal).length;
    ncm.statistics.externalAssetCount = ncm.assets.filter(a =>  a.isExternal).length;
  }

  function _validate(ncm, zip) {
    const zipPaths = new Set(Object.keys(zip.files).map(k => k.toLowerCase()));
    for (const asset of ncm.assets) {
      if (!asset.isExternal && asset.zipPath && !zipPaths.has(asset.zipPath.toLowerCase())) {
        ncm.validation.missingAssets.push(asset.zipPath);
        _warn(ncm, 'MISSING_ASSET', null, null, `Asset "${asset.zipPath}" is referenced but not found in the ZIP.`);
      }
    }
    ncm.validation.valid = ncm.validation.errors.length === 0;
  }

  /* ── Utilities ───────────────────────────────────────────── */

  function _esc(s) {
    return s == null ? '' : String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _fmtSize(b) {
    if (b < 1024)    return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1048576).toFixed(1)} MB`;
  }

  function _truncate(s, n) {
    return !s ? '' : (s.length > n ? s.slice(0, n) + '…' : s);
  }

  /* ── Error screen ────────────────────────────────────────── */

  function _showError(message) {
    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Parse Error">
        <div class="modal" style="width:480px; max-width:94vw; padding:36px;">
          <div style="text-align:center; margin-bottom:20px;">
            <div style="font-size:40px; line-height:1; margin-bottom:12px;">⛔</div>
            <h2 style="font-size:18px; color:var(--ink-900);">Parse Failed</h2>
          </div>
          <div style="padding:14px; border-radius:var(--r-md); background:rgba(220,38,38,.06); border:1px solid rgba(220,38,38,.18); margin-bottom:24px;">
            <p class="text-sm" style="color:var(--ink-900); line-height:1.65;">${_esc(message)}</p>
          </div>
          <div class="flex justify-end gap-12">
            <button class="btn btn-ghost" id="pe-close">Close</button>
            <button class="btn btn-secondary" id="pe-retry">Try Another File</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(overlay);
    overlay.querySelector('#pe-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#pe-retry').addEventListener('click', () => { overlay.remove(); openImportContentModal(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => overlay.querySelector('#pe-retry').focus());
  }

  return { parse };

})();
