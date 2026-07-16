/* ============================================================
   SCORM ASSET IMPORTER — Import Engine Milestone 6
   Asset Import & Media Reconciliation.

   Pipeline:
     SCORM ZIP → Asset Registry → Deduplicate → AssetStore
     → IndexedDB → asset:// references → Ready for Cloud Sync

   Reuses AssetStore completely. No second asset system.
   No project. No LumioState. No D1. No R2.
   ============================================================ */

const ScormAssetImporter = (() => {

  const MIME_MAP = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm', m4v: 'video/mp4',
    mov: 'video/quicktime', ogv: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
    pdf: 'application/pdf',
  };

  /* ── Public API ──────────────────────────────────────────── */

  function importAssets(model, pm) {
    _doImport(model, pm).catch(err => {
      console.error('[ScormAssetImporter]', err);
      _showError(err.message || 'Asset import failed unexpectedly.');
    });
  }

  /* ── Core import pipeline ────────────────────────────────── */

  async function _doImport(model, pm) {
    const ncm     = pm.ncm;
    const notifId = NotifySystem.progress('Importing assets…');

    const zip = ncm._zip;
    if (!zip) throw new Error('ZIP not available. Re-open the SCORM file to import assets.');

    const ncmAssets  = ncm.assets || [];
    const ncmToLumio = new Map(); // ncmAssetId → entry
    const stats = { total: ncmAssets.length, imported: 0, deduplicated: 0, external: 0, missing: 0 };

    // Track which Lumio asset IDs we've already produced this run (for dedup detection)
    const seenLumioIds = new Map(); // lumioAssetId → first ncmAssetId that produced it

    for (let i = 0; i < ncmAssets.length; i++) {
      const ncmAsset = ncmAssets[i];
      const pct = Math.round(10 + (i / Math.max(ncmAssets.length, 1)) * 75);
      NotifySystem.updateProgress(notifId, pct, `Asset ${i + 1} of ${ncmAssets.length}…`);

      // ── External (Rise defaults / CDN) ────────────────────
      if (ncmAsset.isExternal) {
        ncmToLumio.set(ncmAsset.id, {
          assetId:  null,
          status:   'external',
          url:      ncmAsset.originalPath || null,
          mimeType: _mimeFromExt(ncmAsset.ext),
          size:     0,
          fileName: (ncmAsset.originalPath || '').split('/').pop() || 'external',
        });
        stats.external++;
        continue;
      }

      // ── Look up in ZIP ────────────────────────────────────
      const zipEntry = ncmAsset.zipPath ? zip.file(ncmAsset.zipPath) : null;
      if (!zipEntry) {
        // Not in ZIP — use null reference; import continues
        ncmToLumio.set(ncmAsset.id, {
          assetId:  null,
          status:   'missing',
          url:      null,
          mimeType: _mimeFromExt(ncmAsset.ext),
          size:     0,
          fileName: (ncmAsset.originalPath || '').split('/').pop() || 'unknown',
        });
        stats.missing++;
        continue;
      }

      // ── Extract blob + store via AssetStore ───────────────
      const uint8    = await zipEntry.async('uint8array');
      const mimeType = _mimeFromExt(ncmAsset.ext);
      const blob     = new Blob([uint8], { type: mimeType });
      const fileName = (ncmAsset.originalPath || ncmAsset.zipPath || '').split('/').pop() || 'file';
      const file     = new File([blob], fileName, { type: mimeType });

      // AssetStore.put() is inherently deduplicating:
      // same content → same SHA-256 hash → same asset:// ID → one IndexedDB record
      const assetId = await AssetStore.put(file);

      if (seenLumioIds.has(assetId)) {
        // Content-identical to an asset already imported this session
        ncmToLumio.set(ncmAsset.id, {
          assetId, status: 'deduplicated',
          mimeType, size: blob.size, fileName,
          duplicateOf: seenLumioIds.get(assetId),
        });
        stats.deduplicated++;
      } else {
        seenLumioIds.set(assetId, ncmAsset.id);
        ncmToLumio.set(ncmAsset.id, {
          assetId, status: 'imported',
          mimeType, size: blob.size, fileName,
        });
        stats.imported++;
      }
    }

    NotifySystem.updateProgress(notifId, 90, 'Reconciling references…');

    // ── Replace NCM IDs with asset:// references ──────────
    const reconciledModel = _reconcileModel(model, ncmToLumio);

    // ── Validate ──────────────────────────────────────────
    const validation = _validate(reconciledModel, ncmToLumio, ncm);

    NotifySystem.complete(
      notifId,
      `${stats.imported} imported · ${stats.deduplicated} deduped`,
      validation.valid ? 'success' : 'warning',
    );

    _showAssetSummary(reconciledModel, stats, ncmToLumio, validation, ncm, pm);
  }

  /* ── Reference reconciliation ────────────────────────────── */

  function _reconcileModel(model, ncmToLumio) {
    // Deep-clone lessons (all string/number/array/object — no blobs)
    const lessons = JSON.parse(JSON.stringify(model.lessons));

    for (const blocks of Object.values(lessons)) {
      for (const block of blocks) _reconcileBlock(block, ncmToLumio);
    }

    // Build reconciled assetRefs
    const assetRefs = {};
    for (const [ncmId, entry] of ncmToLumio.entries()) {
      assetRefs[ncmId] = {
        ...model.assetRefs[ncmId],
        lumioAssetId: entry.assetId,
        status:       entry.status,
        mimeType:     entry.mimeType,
        size:         entry.size,
        fileName:     entry.fileName,
        url:          entry.url || null,
      };
    }

    return {
      ...model,
      lessons,
      assetRefs,
      meta: { ...model.meta, reconciled: true, reconciledAt: Date.now() },
    };
  }

  function _reconcileBlock(block, ncmToLumio) {
    const d = block.data || {};

    function resolve(ncmId) {
      if (ncmId == null) return null;
      const entry = ncmToLumio.get(ncmId);
      if (!entry) return ncmId;                      // unknown — leave unchanged
      if (entry.status === 'external') return entry.url || null; // CDN URL passthrough
      if (entry.status === 'missing')  return null;  // placeholder
      return entry.assetId;                          // asset:// reference
    }

    switch (block.type) {
      case 'image':
        d.src = resolve(d.src);
        break;
      case 'labelled_graphic':
        d.image = resolve(d.image);
        break;
      case 'tabs':
        for (const it of (d.items || [])) it.src = resolve(it.src);
        break;
      case 'flashcard_grid':
      case 'flashcard_stack':
        for (const it of (d.items || [])) {
          if (it.front) it.front.image = resolve(it.front.image);
          if (it.back)  it.back.image  = resolve(it.back.image);
        }
        break;
    }
  }

  /* ── Validation ──────────────────────────────────────────── */

  function _validate(model, ncmToLumio, ncm) {
    const errors = [], warnings = [];

    // Every NCM asset must have a mapping
    for (const a of (ncm.assets || [])) {
      if (!ncmToLumio.has(a.id)) errors.push(`NCM asset ${a.id} has no mapping.`);
    }

    // Collect all asset:// refs in reconciled blocks
    const blockRefs = new Set();
    for (const blocks of Object.values(model.lessons)) {
      for (const b of blocks) _collectRefs(b, blockRefs);
    }

    // Every asset:// ref in blocks must have come from our map
    const knownLumioIds = new Set(
      [...ncmToLumio.values()].map(e => e.assetId).filter(Boolean)
    );
    for (const ref of blockRefs) {
      if (AssetStore.isAssetRef(ref) && !knownLumioIds.has(ref)) {
        errors.push(`Orphan asset:// reference: ${ref}`);
      }
    }

    const lumioIds  = [...ncmToLumio.values()].map(e => e.assetId).filter(Boolean);
    const uniqueIds = new Set(lumioIds);
    const idbState  = AssetStore._getState();

    return {
      valid:       errors.length === 0,
      errors,
      warnings,
      dedupCount:  lumioIds.length - uniqueIds.size,
      uniqueCount: uniqueIds.size,
      idbState,
    };
  }

  function _collectRefs(block, refs) {
    const d = block.data || {};
    if (d.src)   refs.add(d.src);
    if (d.image) refs.add(d.image);
    for (const it of (d.items || [])) {
      if (it.src)          refs.add(it.src);
      if (it.front?.image) refs.add(it.front.image);
      if (it.back?.image)  refs.add(it.back.image);
    }
  }

  /* ── Asset Summary Screen ────────────────────────────────── */

  function _showAssetSummary(model, stats, ncmToLumio, validation, ncm, pm) {
    // Type breakdown
    const byType = {};
    for (const entry of ncmToLumio.values()) {
      const cat = (entry.mimeType || '').split('/')[0] || 'other';
      if (!byType[cat]) byType[cat] = { references: 0, unique: 0, size: 0 };
      byType[cat].references++;
      if (entry.status === 'imported') { byType[cat].unique++; byType[cat].size += entry.size; }
    }

    const totalBytes = [...ncmToLumio.values()]
      .filter(e => e.status === 'imported')
      .reduce((s, e) => s + e.size, 0);

    const typeRows = Object.entries(byType).map(([cat, data]) => {
      const label = cat === 'image' ? 'Images' : cat === 'video' ? 'Video'
                  : cat === 'audio' ? 'Audio' : 'Other';
      const td = `style="padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px;"`;
      const tdR = `style="padding:6px 10px;border-bottom:1px solid var(--border);text-align:right;font-variant-numeric:tabular-nums;font-size:12px;"`;
      return `<tr>
        <td ${td}>${_esc(label)}</td>
        <td ${tdR}>${data.references}</td>
        <td ${tdR}>${data.unique}</td>
        <td ${tdR}>${_fmtSize(data.size)}</td>
      </tr>`;
    }).join('');

    // External / missing assets
    const externalEntries = [...ncmToLumio.entries()].filter(([, e]) => e.status === 'external');
    const missingEntries  = [...ncmToLumio.entries()].filter(([, e]) => e.status === 'missing');

    const externalRows = externalEntries.slice(0, 6).map(([, e]) => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px;gap:8px;">
        <span style="color:var(--ink-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(e.fileName)}</span>
        <span style="color:#0369a1;flex-shrink:0;">Online · not stored locally</span>
      </div>`).join('');

    const missingRows = missingEntries.map(([, e]) => `
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:11px;gap:8px;">
        <span style="color:var(--ink-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(e.fileName)}</span>
        <span style="color:#d97706;flex-shrink:0;">Not found · import continued</span>
      </div>`).join('');

    // Lesson reconciliation rows
    const IMAGE_TYPES = new Set(['image', 'labelled_graphic', 'tabs', 'flashcard_grid', 'flashcard_stack']);
    const lessonRecRows = ncm.lessons.filter(l => l.type !== 'quiz').map(ncmLesson => {
      const blocks      = model.lessons[ncmLesson.id] || [];
      const mediaBlocks = blocks.filter(b => IMAGE_TYPES.has(b.type));
      if (!mediaBlocks.length) return '';
      const resolved = mediaBlocks.filter(b => {
        const d = b.data || {};
        return (d.src != null && d.src !== '') || (d.image != null && d.image !== '') ||
          (d.items || []).some(it => (it.src != null && it.src !== '') || (it.front?.image != null && it.front.image !== ''));
      }).length;
      const td  = `style="padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px;"`;
      const tdR = `style="padding:6px 10px;border-bottom:1px solid var(--border);text-align:right;font-size:12px;"`;
      const ok  = resolved === mediaBlocks.length;
      return `<tr>
        <td ${td}>${_esc(ncmLesson.title)}</td>
        <td ${tdR}>${mediaBlocks.length}</td>
        <td ${tdR} style="color:${ok ? '#16a34a' : '#d97706'};">${resolved}/${mediaBlocks.length}</td>
      </tr>`;
    }).filter(Boolean).join('');

    const validationHtml = (!validation.valid || validation.errors.length)
      ? `<div style="margin-bottom:24px;padding:14px 18px;border-radius:var(--r-md);background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.18);">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#7f1d1d;margin-bottom:8px;">Validation Issues</div>
          ${validation.errors.map(e => `<p style="font-size:12px;color:var(--ink-800);margin:3px 0;">⛔ ${_esc(e)}</p>`).join('')}
        </div>` : '';

    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Asset Import Summary" id="m6-summary">
        <div class="modal" style="width:860px;max-width:94vw;max-height:90vh;padding:0;display:flex;flex-direction:column;overflow:hidden;">

          <!-- ═══ HEADER ═══════════════════════════════════ -->
          <div style="padding:24px 32px 20px;border-bottom:1px solid var(--border);flex-shrink:0;">
            <div style="display:flex;align-items:flex-start;gap:14px;">
              <div style="flex-shrink:0;width:44px;height:44px;border-radius:var(--r-md);background:rgba(3,105,161,.10);display:flex;align-items:center;justify-content:center;font-size:20px;">🖼️</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-400);margin-bottom:4px;">Step 4 of 4 · Ready</div>
                <h2 style="font-size:18px;font-weight:800;color:var(--ink-900);margin:0 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(model.course.title)}</h2>
                <div style="font-size:12px;color:var(--ink-400);">${stats.imported} media file${stats.imported !== 1 ? 's' : ''} imported &nbsp;·&nbsp; ${stats.missing ? `${stats.missing} missing` : 'All files ready'}</div>
              </div>
              <div style="flex-shrink:0;text-align:center;padding:10px 16px;border-radius:var(--r-md);background:${validation.valid ? 'rgba(22,163,74,.10)' : 'rgba(217,119,6,.10)'};border:1px solid ${validation.valid ? 'rgba(22,163,74,.25)' : 'rgba(217,119,6,.25)'};">
                <div style="font-size:22px;font-weight:900;color:${validation.valid ? '#16a34a' : '#d97706'};line-height:1;">${validation.valid ? '✓' : '!'}</div>
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${validation.valid ? '#16a34a' : '#d97706'};margin-top:2px;">${validation.valid ? 'Valid' : 'Warning'}</div>
              </div>
            </div>
          </div>

          <!-- ═══ BODY ════════════════════════════════════ -->
          <div style="flex:1;overflow-y:auto;padding:24px 32px 16px;">

            <!-- ── Asset stats ─────────────────────────────── -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-bottom:24px;">
              ${_statCard('Total',        stats.total,        '')}
              ${_statCard('Imported',     stats.imported,     'saved to Lumio')}
              ${_statCard('Deduplicated', stats.deduplicated, 'duplicates removed')}
              ${_statCard('Online',        stats.external,     'hosted externally')}
              ${_statCard('Missing',      stats.missing,      stats.missing ? 'placeholder used' : 'none missing')}
            </div>


            <!-- ── Storage optimisation ────────────────────── -->
            <div class="card card-pad mb-24" style="border-left:3px solid ${validation.dedupCount > 0 ? '#16a34a' : 'var(--border)'};">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:8px;">Storage Optimisation</div>
              ${validation.dedupCount > 0
                ? `<p style="font-size:12px;color:var(--ink-700);margin:0;">
                    Lumio detected and removed <strong>${validation.dedupCount}</strong> duplicate file${validation.dedupCount !== 1 ? 's' : ''} — identical images in the package are stored only once, saving space. <strong>${validation.uniqueCount}</strong> unique file${validation.uniqueCount !== 1 ? 's' : ''} stored in total.
                  </p>`
                : `<p style="font-size:12px;color:var(--ink-500);margin:0;">All ${stats.imported} imported files are unique — no duplicates were found in this package.</p>`
              }
            </div>

            <!-- ── Asset type breakdown ──────────────────── -->
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:12px;">Media Summary</div>
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead><tr style="border-bottom:2px solid var(--border);">
                    <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Type</th>
                    <th style="padding:5px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">References</th>
                    <th style="padding:5px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Files Stored</th>
                    <th style="padding:5px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Storage</th>
                  </tr></thead>
                  <tbody>${typeRows || '<tr><td colspan="4" style="padding:10px;color:var(--ink-400);">No assets.</td></tr>'}</tbody>
                </table>
              </div>
            </div>

            <!-- ── Reference reconciliation ─────────────── -->
            ${lessonRecRows ? `
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:8px;">Course Media</div>
              <p style="font-size:12px;color:var(--ink-500);margin:0 0 10px;">
                All images and files in your course are ready to display in Lumio.
              </p>
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead><tr style="border-bottom:2px solid var(--border);">
                    <th style="padding:5px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Lesson</th>
                    <th style="padding:5px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Media</th>
                    <th style="padding:5px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--ink-400);">Resolved</th>
                  </tr></thead>
                  <tbody>${lessonRecRows}</tbody>
                </table>
              </div>
            </div>` : ''}

            <!-- ── External assets ────────────────────────── -->
            ${externalEntries.length ? `
            <div class="card card-pad mb-24">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:8px;">Online Media (${externalEntries.length})</div>
              <p style="font-size:12px;color:var(--ink-500);margin:0 0 10px;">
                External CDN assets are not included in this package. Their original web addresses are preserved so they continue to load from their source automatically.
              </p>
              <div>${externalRows}</div>
              ${externalEntries.length > 6 ? `<p style="font-size:11px;color:var(--ink-400);margin:6px 0 0;">…and ${externalEntries.length - 6} more</p>` : ''}
            </div>` : ''}

            <!-- ── Missing assets ──────────────────────────── -->
            ${missingEntries.length ? `
            <div class="card card-pad mb-24" style="border-left:3px solid #d97706;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-400);margin-bottom:8px;">Missing Files (${missingEntries.length})</div>
              <p style="font-size:12px;color:var(--ink-500);margin:0 0 10px;">
                Referenced in the course but not found in the ZIP archive. Block media fields set to
                <code style="font-size:11px;">null</code> — blocks render without media.
                Import did not terminate.
              </p>
              <div>${missingRows}</div>
            </div>` : ''}


            <!-- ── Validation ──────────────────────────────── -->
            ${validationHtml}
            ${validation.valid ? `
            <div style="margin-bottom:24px;padding:12px 16px;border-radius:var(--r-md);background:rgba(22,163,74,.07);border:1px solid rgba(22,163,74,.2);">
              <div style="font-size:12px;font-weight:600;color:#16a34a;">
                ✓ All ${stats.total} media files processed · ${validation.uniqueCount} unique files stored · No missing references
              </div>
            </div>` : ''}

          </div><!-- /body -->

          <!-- ═══ FOOTER ══════════════════════════════════ -->
          <div style="padding:20px 32px;border-top:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:16px;">
            <p style="font-size:12px;color:var(--ink-400);margin:0;">
              ${stats.imported} file${stats.imported !== 1 ? 's' : ''} imported and ready. Nothing has been created yet.
            </p>
            <div style="display:flex;gap:12px;flex-shrink:0;">
              <button class="btn btn-ghost" id="m6-back">← Back</button>
              <button class="btn btn-ghost" id="m6-close">Close</button>
              <button class="btn btn-primary" id="m6-commit">Create Course →</button>
            </div>
          </div>

        </div>
      </div>
    `);

    document.body.appendChild(overlay);
    overlay.querySelector('#m6-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#m6-back').addEventListener('click', () => { overlay.remove(); ScormConverter.convert(pm); });
    overlay.querySelector('#m6-commit').addEventListener('click', () => { overlay.remove(); ScormCommitter.commit(model); });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => overlay.querySelector('#m6-commit').focus());
  }

  /* ── Error screen ────────────────────────────────────────── */

  function _showError(message) {
    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Asset Import Error">
        <div class="modal" style="width:480px;max-width:94vw;padding:36px;">
          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:40px;line-height:1;margin-bottom:12px;">⛔</div>
            <h2 style="font-size:18px;color:var(--ink-900);">Asset Import Failed</h2>
          </div>
          <div style="padding:14px;border-radius:var(--r-md);background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.18);margin-bottom:24px;">
            <p style="font-size:13px;color:var(--ink-900);line-height:1.65;">${_esc(message)}</p>
          </div>
          <div class="flex justify-end gap-12">
            <button class="btn btn-ghost" id="aie-close">Close</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(overlay);
    overlay.querySelector('#aie-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => overlay.querySelector('#aie-close').focus());
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

  function _schemaItem(key, value) {
    return `
      <div style="padding:7px 10px;border-radius:var(--r-sm);background:var(--surface-50);display:flex;gap:8px;align-items:baseline;overflow:hidden;">
        <code style="font-size:10px;color:var(--ink-400);flex-shrink:0;">${_esc(key)}</code>
        <span style="font-size:11px;color:var(--ink-800);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(String(value))}</span>
      </div>`;
  }

  function _archStep(num, title, desc) {
    return `
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start;">
        <div style="flex-shrink:0;width:18px;height:18px;border-radius:50%;background:var(--surface-100);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--ink-500);">${_esc(num)}</div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--ink-800);">${_esc(title)}</div>
          <div style="font-size:10px;color:var(--ink-400);">${_esc(desc)}</div>
        </div>
      </div>`;
  }

  function _mimeFromExt(ext) {
    return MIME_MAP[(ext || '').toLowerCase()] || 'application/octet-stream';
  }

  function _esc(s) {
    return s == null ? '' : String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtSize(b) {
    if (!b)       return '0 B';
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  return { importAssets };

})();
