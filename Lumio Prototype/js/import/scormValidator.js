/* ============================================================
   SCORM VALIDATOR — Import Engine Milestone 4
   Validates the NCM and presents the Import Preview.
   Builds the Preview Model in memory only.
   Nothing is written. Nothing is created.
   ============================================================ */

const ScormValidator = (() => {

  /* ── Public API ──────────────────────────────────────────── */

  function present(ncm) {
    const pm = _buildPreviewModel(ncm);
    _showImportPreview(pm);
  }

  /* ── Preview Model ───────────────────────────────────────── */

  function _buildPreviewModel(ncm) {
    const s = ncm.statistics;

    // Per-block confidence scoring
    const blockConf = {};
    const totals = { high: 0, medium: 0, low: 0, unknown: 0 };
    for (const block of ncm.blocks) {
      const conf = _scoreBlock(block, ncm);
      blockConf[block.id] = conf;
      totals[conf]++;
    }

    // Per-lesson conversion plan
    const lessonPlans = ncm.lessons.map(lesson => {
      const lBlocks  = ncm.blocks.filter(b => b.lessonId === lesson.id);
      const lTotals  = { high: 0, medium: 0, low: 0, unknown: 0 };
      for (const b of lBlocks) lTotals[blockConf[b.id] || 'unknown']++;
      const assessment = ncm.assessments.find(a => a.lessonId === lesson.id);
      return {
        lessonId:           lesson.id,
        title:              lesson.title,
        type:               lesson.type,
        index:              lesson.index,
        originalBlockCount: lBlocks.length,
        lumioBlockCount:    lBlocks.filter(b => b.type !== 'omit').length,
        omitted:            lBlocks.filter(b => b.type === 'omit').length,
        converted:          lBlocks.filter(b => b.importRecord?.status === 'CONVERTED').length,
        requiresReview:     lBlocks.filter(b => b.importRecord?.status === 'FALLBACK').length,
        unsupported:        lBlocks.filter(b => b.type === 'unknown').length,
        confidence:         lTotals,
        quizQuestions:      assessment ? assessment.questions.length : 0,
        quizConflicts:      assessment ? assessment.questions.filter(q => q.correctConflict).length : 0,
        warnings:           ncm.warnings.filter(w => w.lessonId === lesson.id),
        blocks:             lBlocks.map(b => ({
          id:           b.id,
          ncmType:      b.type,
          sourceFamily: b.sourceFamily,
          confidence:   blockConf[b.id],
          status:       b.importRecord?.status || 'UNKNOWN',
          note:         b.importRecord?.message || '',
        })),
      };
    });

    // Import report counts
    const allBlocks     = ncm.blocks;
    const recognised    = allBlocks.length;
    const omitted       = allBlocks.filter(b => b.type === 'omit').length;
    const convertible   = allBlocks.filter(b => b.importRecord?.status === 'IMPORTED' && b.type !== 'omit').length;
    const requiresRev   = allBlocks.filter(b => b.importRecord?.status === 'CONVERTED').length;
    const unsupported   = allBlocks.filter(b => b.importRecord?.status === 'FALLBACK' || b.type === 'unknown').length;
    const errCount      = ncm.validation.errors.length;
    const missingCount  = ncm.validation.missingAssets.length;

    // Fidelity: fraction of active (non-omitted) blocks that come through
    const active = Math.max(recognised - omitted, 1);
    const estimatedFidelity = Math.round((convertible + requiresRev) / active * 100);

    // Quality score: weighted confidence average, penalised by errors/missing assets
    const rawConf = (totals.high * 3 + totals.medium * 2 + totals.low * 1) /
                    Math.max(recognised * 3, 1) * 100;
    const overallQuality = Math.round(Math.max(0, rawConf - errCount * 5 - missingCount * 3));
    const qualityLabel   = overallQuality >= 90 ? 'Excellent'
                         : overallQuality >= 75 ? 'Good'
                         : overallQuality >= 50 ? 'Needs Review'
                         : 'Limited';
    const qualityColor   = overallQuality >= 90 ? '#16a34a'
                         : overallQuality >= 75 ? '#2563eb'
                         : overallQuality >= 50 ? '#d97706'
                         : '#dc2626';

    // Estimated duration (0.5 min/block, 0.75 min/quiz question)
    const durationMins = Math.max(1, Math.round(s.blockCount * 0.5 + s.quizQuestionCount * 0.75));
    const estimatedDuration = durationMins < 60
      ? `~${durationMins} min`
      : `~${Math.floor(durationMins / 60)}h ${durationMins % 60}m`;

    return {
      ncm,
      confidence: { ...totals, blockConf },
      lessonPlans,
      importReport: {
        recognised, convertible,
        requiresReview: requiresRev,
        unsupported,
        warnings:    s.warningCount,
        errors:      errCount,
        omitted,
        missingAssets: missingCount,
        estimatedFidelity,
        overallQuality,
        qualityLabel,
        qualityColor,
      },
      estimatedDuration,
      validation: { passed: ncm.validation.valid && errCount === 0 && missingCount === 0 },
    };
  }

  function _scoreBlock(block, ncm) {
    if (block.type === 'omit')                          return 'low';
    if (block.type === 'unknown')                        return 'unknown';
    if (block.importRecord?.status === 'FALLBACK')       return 'low';

    const hasMissingAsset = Array.isArray(block.assetRefs) && block.assetRefs.some(
      ref => ref.zipPath && ncm.validation.missingAssets.includes(ref.zipPath)
    );

    if (block.importRecord?.status === 'CONVERTED')      return hasMissingAsset ? 'low' : 'medium';
    if (hasMissingAsset)                                 return 'medium';
    return 'high';
  }

  /* ── Import Preview UI ───────────────────────────────────── */

  function _showImportPreview(pm) {
    const { ncm, importReport: r, confidence: c, lessonPlans, estimatedDuration } = pm;
    const meta = ncm.metadata;
    const s    = ncm.statistics;

    // Confidence bar percentages
    const total = Math.max(ncm.blocks.length, 1);
    const hPct  = Math.round(c.high    / total * 100);
    const mPct  = Math.round(c.medium  / total * 100);
    const lPct  = Math.round(c.low     / total * 100);
    const uPct  = Math.max(0, 100 - hPct - mPct - lPct);

    // Per-lesson table rows
    const lessonRows = lessonPlans.map(lp => {
      const lt    = Math.max(lp.confidence.high + lp.confidence.medium + lp.confidence.low + lp.confidence.unknown, 1);
      const lhPct = Math.round(lp.confidence.high   / lt * 100);
      const lmPct = Math.round(lp.confidence.medium / lt * 100);
      const llPct = Math.round(lp.confidence.low    / lt * 100);
      const luPct = Math.max(0, 100 - lhPct - lmPct - llPct);

      const statusDot = (lp.unsupported > 0 || lp.quizConflicts > 0)
        ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#dc2626;flex-shrink:0;" title="Has issues"></span>`
        : (lp.converted > 0 || lp.warnings.length > 0)
        ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#d97706;flex-shrink:0;" title="Needs review"></span>`
        : `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a;flex-shrink:0;" title="Ready"></span>`;

      const typeLabel = lp.type === 'quiz'
        ? `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:rgba(99,102,241,.12);color:#4338ca;">Quiz</span>`
        : `<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:var(--surface-50);color:var(--ink-500);">Lesson</span>`;

      const miniBar = `
        <div style="display:flex;height:4px;border-radius:2px;overflow:hidden;min-width:70px;gap:1px;">
          ${lhPct ? `<div style="flex:${lhPct};background:#16a34a;"></div>` : ''}
          ${lmPct ? `<div style="flex:${lmPct};background:#2563eb;"></div>` : ''}
          ${llPct ? `<div style="flex:${llPct};background:#d97706;"></div>` : ''}
          ${luPct ? `<div style="flex:${luPct};background:#dc2626;"></div>` : ''}
        </div>`;

      const contentLabel = lp.type === 'quiz'
        ? `${lp.quizQuestions} q${lp.quizQuestions !== 1 ? 's' : ''}`
        : `${lp.lumioBlockCount} block${lp.lumioBlockCount !== 1 ? 's' : ''}${lp.omitted ? `<span style="color:var(--ink-400);font-size:10px;"> +${lp.omitted} omit</span>` : ''}`;

      const convLabel = lp.converted
        ? `<span style="color:#d97706;font-size:12px;">${lp.converted}</span>`
        : `<span style="color:var(--ink-300);">—</span>`;

      const td  = `style="padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:middle;"`;
      const tdR = `style="padding:7px 10px;border-bottom:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;vertical-align:middle;"`;

      return `<tr>
        <td ${td} style="padding:7px 10px;border-bottom:1px solid var(--border);color:var(--ink-400);font-size:11px;font-variant-numeric:tabular-nums;">${lp.index + 1}</td>
        <td ${td}>
          <div style="display:flex;align-items:center;gap:7px;">
            ${statusDot}
            <span style="font-size:12px;font-weight:600;color:var(--ink-900);">${_esc(lp.title)}</span>
          </div>
        </td>
        <td ${td}>${typeLabel}</td>
        <td ${tdR}><span style="font-size:12px;">${contentLabel}</span></td>
        <td ${tdR}>${convLabel}</td>
        <td ${td}><div style="min-width:70px;">${miniBar}</div></td>
      </tr>`;
    }).join('');

    // Grouped warnings
    const warnGroups = {};
    for (const w of ncm.warnings) {
      if (!warnGroups[w.code]) warnGroups[w.code] = [];
      warnGroups[w.code].push(w);
    }
    const warnGroupHtml = Object.entries(warnGroups).map(([code, ws]) => {
      const samples = ws.slice(0, 3).map(w =>
        `<div style="font-size:12px;color:var(--ink-700);padding:3px 0;border-bottom:1px solid rgba(217,119,6,.1);">${_esc(w.message)}</div>`
      ).join('');
      const more = ws.length > 3 ? `<div style="font-size:11px;color:var(--ink-400);margin-top:4px;">…and ${ws.length - 3} more</div>` : '';
      return `
        <div style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;padding:2px 8px;border-radius:10px;background:rgba(217,119,6,.15);color:#92400e;">${_esc(code)}</span>
            <span style="font-size:11px;color:var(--ink-400);">${ws.length} occurrence${ws.length !== 1 ? 's' : ''}</span>
          </div>
          <div style="padding-left:12px;">${samples}${more}</div>
        </div>`;
    }).join('');

    // "What will be created" plan items
    const planItems = [
      _planItem('✓', `${s.lessonCount} lesson${s.lessonCount !== 1 ? 's' : ''}`,
        'All lesson structure, titles, and order preserved', '#16a34a'),
      r.convertible
        ? _planItem('✓', `${r.convertible} block${r.convertible !== 1 ? 's' : ''} imported unchanged`,
            'Full fidelity — text, images, lists, hotspots, flashcards', '#16a34a')
        : '',
      r.requiresReview
        ? _planItem('~', `${r.requiresReview} block${r.requiresReview !== 1 ? 's' : ''} converted`,
            'Content preserved; interactive or visual layout adapted for Lumio', '#d97706')
        : '',
      s.quizQuestionCount
        ? _planItem('✓', `${s.quizQuestionCount} quiz question${s.quizQuestionCount !== 1 ? 's' : ''}`,
            'Multiple-choice and multiple-response questions imported with answer keys', '#16a34a')
        : '',
      s.assetCount
        ? _planItem('✓', `${s.assetCount} media asset${s.assetCount !== 1 ? 's' : ''}`,
            'Images and media mapped — will be uploaded in the next milestone', '#16a34a')
        : '',
      r.omitted
        ? _planItem('—', `${r.omitted} block${r.omitted !== 1 ? 's' : ''} omitted`,
            'Continue-scroll dividers have no Lumio equivalent and are intentionally excluded', 'var(--ink-400)')
        : '',
      r.unsupported
        ? _planItem('?', `${r.unsupported} block${r.unsupported !== 1 ? 's' : ''} unsupported`,
            'Unrecognised block types — raw data retained for a future conversion milestone', '#dc2626')
        : '',
    ].filter(Boolean).join('');

    const qualityBg = r.overallQuality >= 90 ? 'rgba(22,163,74,.10)'
                    : r.overallQuality >= 75 ? 'rgba(37,99,235,.10)'
                    : r.overallQuality >= 50 ? 'rgba(217,119,6,.10)'
                    : 'rgba(220,38,38,.10)';

    const displayLabel = r.qualityLabel === 'Excellent' ? 'Import Ready'
                       : r.qualityLabel === 'Good'      ? 'High Quality'
                       : r.qualityLabel === 'Needs Review' ? 'Review First'
                       : r.qualityLabel;

    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Import Preview" id="m4-import-preview">
        <div class="modal" style="width:860px;max-width:94vw;max-height:90vh;padding:0;display:flex;flex-direction:column;overflow:hidden;">

          <!-- ═══ HEADER ══════════════════════════════════════ -->
          <div style="padding:24px 32px 20px;border-bottom:1px solid var(--border);flex-shrink:0;">
            <div style="display:flex;align-items:flex-start;gap:16px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-400);margin-bottom:5px;">Step 2 of 4 · Review</div>
                <h2 style="font-size:18px;font-weight:800;color:var(--ink-900);margin:0 0 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(meta.title || meta.packageFilename)}</h2>
                <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--ink-400);">
                  ${meta.color ? `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${_esc(meta.color)};"></span>${_esc(meta.color)}</span>` : ''}
                  <span>${(meta.locale || 'en').toUpperCase()}</span>
                  <span>${_fmtSize(meta.packageSize)}</span>
                  <span>${_esc(meta.scormVersion || '')}</span>
                  <span>Parsed ${new Date(meta.importedAt).toLocaleTimeString()}</span>
                </div>
              </div>
              <!-- Quality badge -->
              <div style="flex-shrink:0;text-align:center;padding:14px 20px;border-radius:var(--r-md);background:${qualityBg};border:1px solid ${r.qualityColor}44;min-width:106px;">
                <div style="font-size:34px;font-weight:900;font-variant-numeric:tabular-nums;color:${r.qualityColor};line-height:1;">${r.overallQuality}</div>
                <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:${r.qualityColor};margin-top:2px;">${_esc(displayLabel)}</div>
                <div style="font-size:10px;color:var(--ink-400);margin-top:2px;">Quality Score</div>
              </div>
            </div>
          </div>

          <!-- ═══ SCROLLABLE BODY ═════════════════════════════ -->
          <div style="flex:1;overflow-y:auto;padding:24px 32px 16px;">

            <!-- ── Summary stats ──────────────────────────── -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-bottom:24px;">
              ${_statCard('Lessons',        s.lessonCount,       '')}
              ${_statCard('Content Blocks', s.blockCount,        '')}
              ${_statCard('Quiz Questions', s.quizQuestionCount, '')}
              ${_statCard('Est. Duration',  estimatedDuration,   '')}
              ${_statCard('Assets',         s.assetCount,        s.externalAssetCount ? `+${s.externalAssetCount} ext` : '')}
            </div>

            <!-- ── Import Report ──────────────────────────── -->
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:12px;">Import Report</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:8px;">
                ${_reportCell('Recognised',    r.recognised,         '',      'All blocks detected in package')}
                ${_reportCell('Importable',    r.convertible,        'green', 'Will import with full fidelity')}
                ${_reportCell('Converted',     r.requiresReview,     'amber', 'Content preserved; layout adapted')}
                ${_reportCell('Unsupported',   r.unsupported, r.unsupported   ? 'red' : '', 'Raw data retained for future milestone')}
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;">
                ${_reportCell('Omitted',       r.omitted,     r.omitted       ? 'muted' : '', 'Continue dividers intentionally excluded')}
                ${_reportCell('Warnings',      r.warnings,    r.warnings      ? 'amber' : '', 'Review recommended')}
                ${_reportCell('Missing Media', r.missingAssets, r.missingAssets ? 'red' : '', 'Referenced but absent from ZIP')}
                ${_reportCell('Est. Fidelity', r.estimatedFidelity + '%',
                  r.estimatedFidelity >= 90 ? 'green' : r.estimatedFidelity >= 70 ? 'amber' : 'red',
                  'Content faithfully preservable')}
              </div>
            </div>

            <!-- ── Import Readiness ───────────────────────── -->
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:12px;">Import Readiness</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:14px;">
                ${_confCard('High',    c.high,    '#16a34a', 'rgba(22,163,74,.10)',  'Imports cleanly with full fidelity')}
                ${_confCard('Medium',  c.medium,  '#2563eb', 'rgba(37,99,235,.10)',  'Content preserved; format adapted')}
                ${_confCard('Low',     c.low,     '#d97706', 'rgba(217,119,6,.10)',  'Omitted or unsupported block')}
                ${_confCard('Unknown', c.unknown, '#dc2626', 'rgba(220,38,38,.10)',  'Could not be assessed')}
              </div>
              <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;gap:2px;" role="img" aria-label="Confidence distribution bar">
                ${hPct ? `<div style="flex:${hPct};background:#16a34a;" title="High: ${c.high} blocks (${hPct}%)"></div>` : ''}
                ${mPct ? `<div style="flex:${mPct};background:#2563eb;" title="Medium: ${c.medium} blocks (${mPct}%)"></div>` : ''}
                ${lPct ? `<div style="flex:${lPct};background:#d97706;" title="Low: ${c.low} blocks (${lPct}%)"></div>` : ''}
                ${uPct ? `<div style="flex:${uPct};background:#dc2626;" title="Unknown: ${c.unknown} blocks (${uPct}%)"></div>` : ''}
              </div>
              <div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--ink-400);flex-wrap:wrap;">
                <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#16a34a;"></span>High</span>
                <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#2563eb;"></span>Medium</span>
                <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#d97706;"></span>Low</span>
                <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#dc2626;"></span>Unknown</span>
              </div>
            </div>

            <!-- ── What will be created ───────────────────── -->
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:6px;">What will be created</div>
              <p style="font-size:12px;color:var(--ink-500);margin:0 0 12px;line-height:1.55;">Lumio will build a new course with the structure shown below. Nothing has been created yet.</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">${planItems}</div>
            </div>

            <!-- ── Course Contents ────────────────────────── -->
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:12px;">Course Contents</div>
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                  <thead>
                    <tr style="border-bottom:2px solid var(--border);">
                      <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">#</th>
                      <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Lesson</th>
                      <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Type</th>
                      <th style="padding:5px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Content</th>
                      <th style="padding:5px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Blocks</th>
                      <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>${lessonRows || '<tr><td colspan="6" style="padding:12px 10px;color:var(--ink-400);">No lessons found.</td></tr>'}</tbody>
                </table>
              </div>
              <div style="display:flex;align-items:center;gap:16px;margin-top:10px;font-size:11px;color:var(--ink-400);flex-wrap:wrap;">
                <span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a;"></span>Ready</span>
                <span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#d97706;"></span>Needs Review</span>
                <span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#dc2626;"></span>Has Issues</span>
              </div>
            </div>

            <!-- ── Warnings ───────────────────────────────── -->
            ${ncm.warnings.length ? `
            <div style="margin-bottom:24px;padding:16px 20px;border-radius:var(--r-md);background:rgba(217,119,6,.06);border:1px solid rgba(217,119,6,.2);">
              <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#92400e;margin-bottom:14px;">
                Warnings (${ncm.warnings.length})
              </div>
              ${warnGroupHtml}
            </div>` : ''}

            <!-- ── Missing assets ─────────────────────────── -->
            ${ncm.validation.missingAssets.length ? `
            <div style="margin-bottom:24px;padding:16px 20px;border-radius:var(--r-md);background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.2);">
              <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#7f1d1d;margin-bottom:8px;">
                Missing Files (${ncm.validation.missingAssets.length})
              </div>
              ${ncm.validation.missingAssets.slice(0, 15).map(p =>
                `<p style="font-family:ui-monospace,monospace;font-size:12px;color:var(--ink-800);margin:3px 0;">${_esc(p)}</p>`
              ).join('')}
            </div>` : ''}

          </div><!-- /body -->

          <!-- ═══ FOOTER ══════════════════════════════════════ -->
          <div style="padding:20px 32px;border-top:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <p style="font-size:12px;color:var(--ink-400);margin:0;min-width:0;">
              Review the import plan below. Nothing has been created yet.
            </p>
            <div style="display:flex;gap:12px;flex-shrink:0;">
              <button class="btn btn-ghost" id="m4-retry">Start Over</button>
              <button class="btn btn-ghost" id="m4-close">Close</button>
              <button class="btn btn-primary" id="m4-import">Begin Import →</button>
            </div>
          </div>

        </div>
      </div>
    `);

    document.body.appendChild(overlay);
    overlay.querySelector('#m4-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#m4-retry').addEventListener('click', () => { overlay.remove(); openImportContentModal(); });
    overlay.querySelector('#m4-import').addEventListener('click', () => { overlay.remove(); ScormConverter.convert(pm); });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => overlay.querySelector('#m4-import').focus());
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
    const col = color === 'green' ? '#16a34a'
              : color === 'amber' ? '#d97706'
              : color === 'red'   ? '#dc2626'
              : color === 'muted' ? 'var(--ink-400)'
              : 'var(--ink-900)';
    const bg  = color === 'green' ? 'rgba(22,163,74,.08)'
              : color === 'amber' ? 'rgba(217,119,6,.08)'
              : color === 'red'   ? 'rgba(220,38,38,.08)'
              : 'var(--surface-50)';
    return `
      <div style="padding:10px 12px;border-radius:var(--r-md);background:${bg};">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-400);margin-bottom:3px;">${_esc(label)}</div>
        <div style="font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:${col};">${_esc(String(value))}</div>
        <div style="font-size:10px;color:var(--ink-400);margin-top:3px;line-height:1.4;">${_esc(desc)}</div>
      </div>`;
  }

  function _confCard(label, count, color, bg, desc) {
    return `
      <div style="padding:12px 14px;border-radius:var(--r-md);background:${bg};border:1px solid ${color}33;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${color};margin-bottom:4px;">${_esc(label)}</div>
        <div style="font-size:24px;font-weight:900;font-variant-numeric:tabular-nums;color:${color};">${count}</div>
        <div style="font-size:10px;color:var(--ink-500);margin-top:4px;line-height:1.4;">${_esc(desc)}</div>
      </div>`;
  }

  function _planItem(icon, title, desc, color) {
    return `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:var(--r-md);border:1px solid var(--border);">
        <span style="font-size:13px;font-weight:900;color:${color};flex-shrink:0;margin-top:1px;min-width:14px;">${_esc(icon)}</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--ink-900);">${_esc(title)}</div>
          <div style="font-size:11px;color:var(--ink-400);margin-top:2px;line-height:1.4;">${_esc(desc)}</div>
        </div>
      </div>`;
  }

  function _esc(s) {
    return s == null ? '' : String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtSize(b) {
    if (!b) return '';
    if (b < 1024)    return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  return { present };

})();
