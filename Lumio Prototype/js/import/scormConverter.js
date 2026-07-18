/* ============================================================
   SCORM CONVERTER — Import Engine Milestone 5
   Executes the approved Conversion Plan from M4.
   Produces a complete Lumio Course Model in memory only.
   Nothing is persisted. No project is created.
   No LumioState writes. No AssetStore writes.
   ============================================================ */

const ScormConverter = (() => {

  /* ── Block type labels ───────────────────────────────────── */
  const BLOCK_LABEL = {
    heading_paragraph: 'Heading & Para',
    paragraph:         'Paragraph',
    image:             'Image',
    image_text:        'Image & Text',
    list_bullet:       'Bullet List',
    list_numbered:     'Numbered List',
    list_checkbox:     'Checklist',
    stmt_note:         'Note',
    stmt_info:         'Info',
    stmt_tip:          'Tip',
    stmt_warning:      'Warning',
    stmt_error:        'Error',
    stmt_success:      'Success',
    line_divider:      'Divider',
    tabs:              'Tabs',
    accordion:         'Accordion',
    labelled_graphic:  'Labelled Graphic',
    flashcard_grid:    'Flashcard Grid',
    flashcard_stack:   'Flashcard Stack',
    kc_multiple_choice:   'Multiple Choice KC',
    kc_multiple_response: 'Multiple Response KC',
  };

  /* ── Public API ──────────────────────────────────────────── */

  function convert(pm) {
    const notifId = NotifySystem.progress('Converting to Lumio course model…');
    let model, validation;
    try {
      model      = _buildCourseModel(pm);
      validation = _validateModel(model, pm.ncm);
    } catch (err) {
      NotifySystem.complete(notifId, 'Conversion failed', 'error');
      console.error('[ScormConverter]', err);
      _showError(err.message || 'Conversion failed unexpectedly.');
      return;
    }
    const label = validation.valid
      ? `Converted — ${model.meta.blockCount} blocks`
      : `Converted with ${validation.errors.length} issue${validation.errors.length !== 1 ? 's' : ''}`;
    NotifySystem.complete(notifId, label, validation.valid ? 'success' : 'warning');
    _showConversionSummary(model, validation, pm);
  }

  /* ── Course model builder ────────────────────────────────── */

  function _buildCourseModel(pm) {
    const ncm  = pm.ncm;
    const meta = ncm.metadata;

    // Temporary course ID — in memory only
    const courseId = 'import-' + Date.now().toString(16);

    const courseLessons     = [];
    const courseAssessments = [];
    const lessonBlocks      = {};  // id → [blocks]
    const convStats = { imported: 0, converted: 0, omitted: 0, fallback: 0, kcConverted: 0 };

    for (let li = 0; li < ncm.lessons.length; li++) {
      const ncmLesson = ncm.lessons[li];
      const lessonId  = ncmLesson.id;

      if (ncmLesson.type === 'quiz') {
        // Quiz lesson → assessment entry + KC blocks
        const asmId = `${courseId}-asm-${li}`;
        courseAssessments.push({
          id:         asmId,
          title:      ncmLesson.title,
          type:       'Quiz',
          objectives: [],
        });

        const asmEntry = ncm.assessments.find(a => a.lessonId === lessonId);
        const kcBlocks = [];
        if (asmEntry) {
          for (const q of asmEntry.questions) {
            const kb = _convertQuestion(q);
            if (kb) { kcBlocks.push(kb); convStats.kcConverted++; }
          }
        }
        lessonBlocks[asmId] = kcBlocks;

      } else {
        // Content lesson → lesson entry + content blocks
        const durationMins = Math.max(1, Math.round(ncmLesson.blockCount * 0.5));
        courseLessons.push({
          id:             lessonId,
          title:          ncmLesson.title,
          objectiveIndex: 0,
          duration:       `~${durationMins} min`,
        });

        const ncmBlocks  = ncm.blocks.filter(b => b.lessonId === lessonId);
        const converted  = [];
        for (const b of ncmBlocks) {
          if (b.type === 'omit') { convStats.omitted++; continue; }
          const lb = _convertBlock(b);
          if (lb) {
            converted.push(lb);
            const st = b.importRecord?.status;
            if (st === 'CONVERTED') convStats.converted++;
            else if (st === 'FALLBACK') convStats.fallback++;
            else convStats.imported++;
          }
        }
        lessonBlocks[lessonId] = converted;
      }
    }

    // Asset references — copied for M6 handoff; NOT written to AssetStore
    const assetRefs = {};
    for (const a of ncm.assets) {
      assetRefs[a.id] = {
        originalPath:   a.originalPath,
        zipPath:        a.zipPath,
        type:           a.type,
        ext:            a.ext,
        isExternal:     a.isExternal,
        sourcedFrom:    a.sourcedFrom,
        referenceCount: a.referenceCount,
      };
    }

    const totalBlocks = Object.values(lessonBlocks).reduce((n, arr) => n + arr.length, 0);

    // Default theme design — matches what Course Wizard produces
    const themeDesign = typeof defaultThemeDesign === 'function'
      ? defaultThemeDesign()
      : { primary: '#4F46E5', secondary: '#06B6D4', accent: '#14B8A6',
          fontId: 'poppins-inter', fontSizeId: 'md', buttonStyleId: 'pill', radiusId: 'soft', bgStyleId: 'white' };

    const course = {
      id:              courseId,
      title:           meta.title || 'Imported Course',
      description:     '',
      audience:        '',
      duration:        pm.estimatedDuration,
      objectives:      [],
      learnerOutcomes: [],
      theme:           't1',
      themeDesign,
      landingLayout:   'A',
      heroImage:       { src: null, fileName: null, mimeType: null, displayMode: 'cover', posX: 'center', posY: 'center', scale: 100 },
      heroSettings:    { height: 'medium', overlay: { mode: 'theme', opacity: 0.35 }, roundedCorners: true, titlePosition: 'bottom', textAlign: 'center', textColor: 'auto' },
      lessons:         courseLessons,
      assessments:     courseAssessments,
    };

    return {
      course,
      lessons:   lessonBlocks,
      assetRefs,
      meta: {
        convertedAt:     Date.now(),
        sourcePackage:   meta.packageFilename,
        sourceTitle:     meta.title,
        scormVersion:    meta.scormVersion,
        blockCount:      totalBlocks,
        lessonCount:     courseLessons.length,
        assessmentCount: courseAssessments.length,
        kcCount:         convStats.kcConverted,
        assetRefCount:   Object.keys(assetRefs).length,
        conversionStats: convStats,
      },
    };
  }

  /* ── Block conversion dispatch ───────────────────────────── */

  function _convertBlock(b) {
    const d = b.data || {};

    switch (b.type) {

      case 'text':
        return {
          type: d.heading ? 'heading_paragraph' : 'paragraph',
          data: { heading: d.heading || '', body: d.body || '' },
        };

      case 'image':
        return {
          type: 'image',
          data: { src: d.src || null, label: d.alt || '', caption: d.caption || '', alt: d.alt || '' },
        };

      case 'list': {
        const listType = d.style === 'numbered' ? 'list_numbered'
                       : d.style === 'checkbox'  ? 'list_checkbox'
                       : 'list_bullet';
        return {
          type: listType,
          data: { heading: '', items: Array.isArray(d.items) ? d.items.map(String) : [] },
        };
      }

      case 'callout':
        return {
          type: 'stmt_note',
          data: { text: d.html || d.body || '' },
        };

      case 'divider':
        return {
          type: 'line_divider',
          data: {},
        };

      case 'tabs': {
        const tabs = Array.isArray(d.tabs) ? d.tabs : [];
        return {
          type: 'tabs',
          data: { items: tabs.map(t => ({ title: t.title || '', body: t.description || '', src: t.imageAssetId || null })) },
        };
      }

      case 'hotspot': {
        const hotspots = Array.isArray(d.hotspots) ? d.hotspots : [];
        return {
          type: 'labelled_graphic',
          data: {
            image:    d.backgroundAssetId || null,
            hotspots: hotspots.map(h => ({ title: h.title || '', body: h.body || '', x: h.x || 50, y: h.y || 50 })),
          },
        };
      }

      case 'flashcard': {
        const lumioType = d.variant === 'stack' ? 'flashcard_stack' : 'flashcard_grid';
        const cards = Array.isArray(d.cards) ? d.cards : [];
        return {
          type: lumioType,
          data: {
            items: cards.map(c => ({
              front: { text: (c.front || {}).text || '', image: (c.front || {}).imageAssetId || null, imageFit: 'cover' },
              back:  { text: (c.back  || {}).text || '', image: null, imageFit: 'cover' },
            })),
          },
        };
      }

      case 'unknown':
      default:
        return {
          type: 'paragraph',
          data: { body: `<p><em>[Unsupported block: ${_esc(b.sourceFamily || b.type || 'unknown')}. Content could not be imported from this block type.]</em></p>` },
        };
    }
  }

  /* ── Question conversion ─────────────────────────────────── */

  function _convertQuestion(q) {
    const options = (q.options || []).map(o => o.text || '');

    if (q.type === 'MULTIPLE_CHOICE') {
      const correctIdx = (q.options || []).findIndex(o => o.correct === true);
      return {
        type: 'kc_multiple_choice',
        data: { question: q.question || '', options, correct: correctIdx >= 0 ? correctIdx : 0 },
      };
    }

    if (q.type === 'MULTIPLE_RESPONSE') {
      const correctIdxs = (q.options || []).reduce((acc, o, i) => {
        if (o.correct === true) acc.push(i);
        return acc;
      }, []);
      return {
        type: 'kc_multiple_response',
        data: { question: q.question || '', options, correct: correctIdxs },
      };
    }

    return null; // unsupported question type — skipped
  }

  /* ── Model validation ────────────────────────────────────── */

  function _validateModel(model, ncm) {
    const errors   = [];
    const warnings = [];

    // Every content NCM lesson must have a corresponding entry
    for (const ncmLesson of ncm.lessons) {
      if (ncmLesson.type === 'quiz') continue;
      if (!model.lessons[ncmLesson.id]) {
        errors.push(`Lesson "${ncmLesson.title}" not found in converted model.`);
      }
    }

    // Every quiz lesson must produce an assessment
    const quizLessons = ncm.lessons.filter(l => l.type === 'quiz');
    if (quizLessons.length > 0 && model.course.assessments.length !== quizLessons.length) {
      errors.push(`Assessment count mismatch: expected ${quizLessons.length}, got ${model.course.assessments.length}.`);
    }

    // No duplicate lesson IDs in course
    const seenIds = new Set();
    for (const l of model.course.lessons) {
      if (seenIds.has(l.id)) errors.push(`Duplicate lesson ID: ${l.id}`);
      seenIds.add(l.id);
    }

    // Every omitted NCM block must have status OMITTED
    const omittedWithWrongStatus = ncm.blocks.filter(
      b => b.type === 'omit' && b.importRecord?.status !== 'OMITTED'
    );
    if (omittedWithWrongStatus.length) {
      warnings.push(`${omittedWithWrongStatus.length} omitted block(s) have unexpected importRecord status.`);
    }

    // Every asset referenced in blocks must exist in assetRefs
    const orphanRefs = [];
    for (const blocks of Object.values(model.lessons)) {
      for (const b of blocks) {
        const src = _extractAssetRef(b);
        if (src && !model.assetRefs[src]) orphanRefs.push(src);
      }
    }
    if (orphanRefs.length) warnings.push(`${orphanRefs.length} asset reference(s) could not be resolved in assetRefs.`);

    return { valid: errors.length === 0, errors, warnings };
  }

  function _extractAssetRef(block) {
    const d = block.data || {};
    if (block.type === 'image' || block.type === 'image_text') return d.src || null;
    if (block.type === 'labelled_graphic') return d.image || null;
    return null;
  }

  /* ── Conversion Summary Screen ───────────────────────────── */

  function _showConversionSummary(model, validation, pm) {
    const { course, meta } = model;
    const stats = meta.conversionStats;

    // Per-lesson block type breakdown
    const lessonRows = course.lessons.map((l, i) => {
      const blocks = model.lessons[l.id] || [];
      const typeCounts = {};
      for (const b of blocks) typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
      const typeChips = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t, n]) => `<span style="display:inline-block;font-size:10px;padding:1px 6px;border-radius:8px;background:var(--surface-50);color:var(--ink-500);margin:1px;">${_esc(BLOCK_LABEL[t] || t)} ×${n}</span>`)
        .join('');
      const td  = `style="padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:top;"`;
      const tdR = `style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;vertical-align:top;"`;
      return `<tr>
        <td ${td} style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--ink-400);font-size:11px;">${i + 1}</td>
        <td ${td}><span style="font-size:12px;font-weight:600;color:var(--ink-900);">${_esc(l.title)}</span></td>
        <td ${tdR}><span style="font-size:12px;">${blocks.length} block${blocks.length !== 1 ? 's' : ''}</span></td>
        <td ${td}><div style="line-height:1.8;">${typeChips || '<span style="color:var(--ink-300);font-size:11px;">—</span>'}</div></td>
      </tr>`;
    }).join('');

    // Assessment rows
    const asmRows = course.assessments.map(a => {
      const blocks  = model.lessons[a.id] || [];
      const mcCount = blocks.filter(b => b.type === 'kc_multiple_choice').length;
      const mrCount = blocks.filter(b => b.type === 'kc_multiple_response').length;
      const ncmAsm  = pm.ncm.assessments.find(x => x.questions.length === blocks.length);
      const pass    = ncmAsm?.settings?.passingScore;
      const td = `style="padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:middle;"`;
      return `<tr>
        <td ${td}><span style="font-size:12px;font-weight:600;">${_esc(a.title)}</span></td>
        <td ${td}><span style="font-size:12px;">${blocks.length} question${blocks.length !== 1 ? 's' : ''}</span></td>
        <td ${td}><span style="font-size:12px;color:var(--ink-500);">${mcCount ? mcCount + ' MC' : ''}${mrCount ? ' ' + mrCount + ' MR' : ''}</span></td>
        <td ${td}>${pass != null ? `<span style="font-size:12px;color:var(--ink-500);">Pass: ${pass}%</span>` : '<span style="color:var(--ink-300);font-size:11px;">—</span>'}</td>
      </tr>`;
    }).join('');

    // Validation panel
    const validationHtml = (!validation.valid || validation.warnings.length)
      ? `<div style="margin-bottom:18px;padding:14px 18px;border-radius:var(--r-md);background:${validation.valid ? 'rgba(217,119,6,.06)' : 'rgba(220,38,38,.06)'};border:1px solid ${validation.valid ? 'rgba(217,119,6,.2)' : 'rgba(220,38,38,.2)'};">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${validation.valid ? '#92400e' : '#7f1d1d'};margin-bottom:10px;">
            Validation ${validation.valid ? 'Warnings' : 'Errors'}
          </div>
          ${validation.errors.map(e => `<p style="font-size:12px;color:var(--ink-800);margin:3px 0;">${platformIcon('error')} ${_esc(e)}</p>`).join('')}
          ${validation.warnings.map(w => `<p style="font-size:12px;color:var(--ink-700);margin:3px 0;">${platformIcon('warning')} ${_esc(w)}</p>`).join('')}
        </div>`
      : '';

    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Conversion Summary" id="m5-summary">
        <div class="modal" style="width:860px;max-width:94vw;max-height:90vh;padding:0;display:flex;flex-direction:column;overflow:hidden;">

          <!-- ═══ HEADER ══════════════════════════════════════ -->
          <div style="padding:24px 32px 20px;border-bottom:1px solid var(--border);flex-shrink:0;">
            <div style="display:flex;align-items:flex-start;gap:14px;">
              <div style="flex-shrink:0;width:44px;height:44px;border-radius:var(--r-md);background:rgba(22,163,74,.12);display:flex;align-items:center;justify-content:center;font-size:20px;">✓</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-400);margin-bottom:4px;">Step 3 of 4 · Prepare</div>
                <h2 style="font-size:18px;font-weight:800;color:var(--ink-900);margin:0 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(course.title)}</h2>
                <div style="font-size:12px;color:var(--ink-400);">
                  Course structure ready &nbsp;·&nbsp; ${meta.lessonCount} lesson${meta.lessonCount !== 1 ? 's' : ''}, ${meta.blockCount} block${meta.blockCount !== 1 ? 's' : ''}
                </div>
              </div>
              <div style="flex-shrink:0;text-align:center;padding:10px 16px;border-radius:var(--r-md);background:rgba(22,163,74,.10);border:1px solid rgba(22,163,74,.25);">
                <div style="font-size:26px;font-weight:900;color:#16a34a;line-height:1;">${validation.valid ? '✓' : '!'}</div>
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#16a34a;margin-top:2px;">${validation.valid ? 'Valid' : 'Issues'}</div>
              </div>
            </div>
          </div>

          <!-- ═══ SCROLLABLE BODY ═════════════════════════════ -->
          <div style="flex:1;overflow-y:auto;padding:24px 32px 16px;">

            <!-- ── Stats ──────────────────────────────────────── -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-bottom:24px;">
              ${_statCard('Lessons',       meta.lessonCount,     '')}
              ${_statCard('Blocks',        meta.blockCount,      '')}
              ${_statCard('Know. Checks',  meta.kcCount,         '')}
              ${_statCard('Media Files',   meta.assetRefCount,   'pending import')}
              ${_statCard('Assessments',   meta.assessmentCount, '')}
            </div>

            <!-- ── Conversion stats ───────────────────────────── -->
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:12px;">Course Overview</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;">
                ${_reportCell('Imported',  stats.imported,   'green', 'Full fidelity')}
                ${_reportCell('Converted', stats.converted,  'amber', 'Layout adapted')}
                ${_reportCell('Omitted',   stats.omitted,    'muted', 'Intentionally excluded')}
                ${_reportCell('Adapted',   stats.fallback,   stats.fallback ? 'red' : '', 'Reformatted for Lumio')}
                ${_reportCell('Know. Checks', stats.kcConverted,'',   'Knowledge checks')}
              </div>
            </div>

            <!-- ── Ready to continue ──────────────────────────── -->
            <div class="card card-pad mb-24" style="background:rgba(22,163,74,.05);border-color:rgba(22,163,74,.2);">
              <div style="font-size:13px;font-weight:600;color:#16a34a;">✓ Course structure built — ${meta.lessonCount} lesson${meta.lessonCount !== 1 ? 's' : ''}, ${meta.blockCount} block${meta.blockCount !== 1 ? 's' : ''}${meta.kcCount ? `, ${meta.kcCount} knowledge check${meta.kcCount !== 1 ? 's' : ''}` : ''}. Review the breakdown below, then continue to import your media files.</div>
            </div>

            <!-- ── Lesson breakdown ───────────────────────────── -->
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:12px;">Lesson Block Breakdown</div>
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                  <thead><tr style="border-bottom:2px solid var(--border);">
                    <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">#</th>
                    <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Lesson</th>
                    <th style="padding:5px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Blocks</th>
                    <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Block Types</th>
                  </tr></thead>
                  <tbody>${lessonRows || '<tr><td colspan="4" style="padding:12px 10px;color:var(--ink-400);">No lessons.</td></tr>'}</tbody>
                </table>
              </div>
            </div>

            <!-- ── Assessments ────────────────────────────────── -->
            ${course.assessments.length ? `
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:12px;">Assessments</div>
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                  <thead><tr style="border-bottom:2px solid var(--border);">
                    <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Title</th>
                    <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Questions</th>
                    <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Types</th>
                    <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Pass</th>
                  </tr></thead>
                  <tbody>${asmRows}</tbody>
                </table>
              </div>
            </div>` : ''}

            <!-- ── Validation ─────────────────────────────────── -->
            ${validationHtml}
            ${validation.valid && !validation.warnings.length ? `
            <div style="margin-bottom:24px;padding:12px 16px;border-radius:var(--r-md);background:rgba(22,163,74,.07);border:1px solid rgba(22,163,74,.2);">
              <div style="font-size:12px;font-weight:600;color:#16a34a;">✓ All ${ncm_lessonCount(pm.ncm)} lessons and knowledge checks imported successfully — ready to continue.</div>
            </div>` : ''}

          </div><!-- /body -->

          <!-- ═══ FOOTER ══════════════════════════════════════ -->
          <div style="padding:20px 32px;border-top:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <p style="font-size:12px;color:var(--ink-400);margin:0;min-width:0;">
              Course structure ready. Media files will be imported in the next step.
            </p>
            <div style="display:flex;gap:12px;flex-shrink:0;">
              <button class="btn btn-ghost" id="m5-back">← Back</button>
              <button class="btn btn-ghost" id="m5-close">Close</button>
              <button class="btn btn-primary" id="m5-upload">Import Media →</button>
            </div>
          </div>

        </div>
      </div>
    `);

    document.body.appendChild(overlay);
    overlay.querySelector('#m5-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#m5-back').addEventListener('click', () => { overlay.remove(); ScormValidator.present(pm.ncm); });
    overlay.querySelector('#m5-upload').addEventListener('click', () => { overlay.remove(); ScormAssetImporter.importAssets(model, pm); });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => overlay.querySelector('#m5-upload').focus());
  }

  function ncm_lessonCount(ncm) { return ncm.lessons.length; }

  /* ── Error screen ────────────────────────────────────────── */

  function _showError(message) {
    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Conversion Error">
        <div class="modal" style="width:480px;max-width:94vw;padding:36px;">
          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:40px;line-height:1;margin-bottom:12px;">${platformIcon('error')}</div>
            <h2 style="font-size:18px;color:var(--ink-900);">Conversion Failed</h2>
          </div>
          <div style="padding:14px;border-radius:var(--r-md);background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.18);margin-bottom:24px;">
            <p style="font-size:13px;color:var(--ink-900);line-height:1.65;">${_esc(message)}</p>
          </div>
          <div class="flex justify-end gap-12">
            <button class="btn btn-ghost" id="ce-close">Close</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(overlay);
    overlay.querySelector('#ce-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => overlay.querySelector('#ce-close').focus());
  }

  /* ── UI helpers ──────────────────────────────────────────── */

  function _statCard(label, value, sub) {
    return `
      <div style="padding:12px 14px;border-radius:var(--r-md);border:1px solid var(--border);">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-400);margin-bottom:4px;">${_esc(label)}</div>
        <div style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink-900);">${_esc(String(value))}</div>
        ${sub ? `<div style="font-size:10px;color:var(--ink-400);margin-top:2px;">${_esc(sub)}</div>` : ''}
      </div>`;
  }

  function _reportCell(label, value, color, desc) {
    const col = color === 'green' ? '#16a34a' : color === 'amber' ? '#d97706'
              : color === 'red'   ? '#dc2626' : color === 'muted' ? 'var(--ink-400)'
              : 'var(--ink-900)';
    const bg  = color === 'green' ? 'rgba(22,163,74,.08)' : color === 'amber' ? 'rgba(217,119,6,.08)'
              : color === 'red'   ? 'rgba(220,38,38,.08)' : 'var(--surface-50)';
    return `
      <div style="padding:10px 12px;border-radius:var(--r-md);background:${bg};">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-400);margin-bottom:3px;">${_esc(label)}</div>
        <div style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:${col};">${_esc(String(value))}</div>
        <div style="font-size:10px;color:var(--ink-400);margin-top:3px;line-height:1.4;">${_esc(desc)}</div>
      </div>`;
  }

  function _schemaItem(key, value) {
    return `
      <div style="padding:8px 10px;border-radius:var(--r-sm);background:var(--surface-50);display:flex;gap:8px;align-items:baseline;">
        <code style="font-size:10px;color:var(--ink-400);flex-shrink:0;">${_esc(key)}</code>
        <span style="font-size:11px;color:var(--ink-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(String(value))}</span>
      </div>`;
  }

  function _esc(s) {
    return s == null ? '' : String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { convert };

})();

