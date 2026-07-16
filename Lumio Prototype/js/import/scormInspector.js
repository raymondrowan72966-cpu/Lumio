/* ============================================================
   SCORM INSPECTOR — Import Engine Milestone 2
   Package intake and metadata inspection only.
   No conversion. No LumioState writes. No AssetStore writes.
   No project creation. No builder access.
   ============================================================ */

const ScormInspector = (() => {

  const IMAGE_EXT = new Set(['jpg','jpeg','png','gif','svg','webp','bmp','ico','avif']);
  const VIDEO_EXT = new Set(['mp4','webm','m4v','mov','ogv','avi']);
  const AUDIO_EXT = new Set(['mp3','wav','ogg','m4a','aac','flac']);
  const DOC_EXT   = new Set(['pdf']);

  /* ── Public entry point ──────────────────────────────────── */

  async function inspect(file) {
    const notifId = NotifySystem.progress(`Inspecting "${file.name}"…`);
    let result;
    try {
      result = await _doInspect(file, notifId);
    } catch (err) {
      NotifySystem.complete(notifId, 'Inspection failed', 'error');
      _showError('Package Inspection Failed', err.message || 'An unexpected error occurred.', file.name);
      return;
    }
    NotifySystem.complete(notifId, 'Package inspected', result.warnings.length ? 'warning' : 'success');
    _showInspectionScreen(result, file);
  }

  /* ── Core inspection logic ───────────────────────────────── */

  async function _doInspect(file, notifId) {
    const result = {
      valid: false,
      errors: [],
      warnings: [],
      filename: file.name,
      fileSize: file.size,
      scormVersion: null,
      isRise360: false,
      manifestFound: false,
      courseTitle: null,
      lessonCount: 0,
      kcCount: 0,
      assets: { images: 0, videos: 0, audio: 0, documents: 0, total: 0 },
    };

    // ── Step 1: Open ZIP ──────────────────────────────────────
    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('password') || msg.includes('encrypted')) {
        throw new Error('This ZIP file is password-protected. Remove the password protection and try again.');
      }
      throw new Error('This file could not be read as a ZIP archive. It may be corrupt, truncated, or in an unsupported format.');
    }

    const zipFiles = Object.keys(zip.files);
    if (zipFiles.length === 0) {
      throw new Error('The ZIP file appears to be empty — there is no content to import.');
    }

    NotifySystem.updateProgress(notifId, 20, 'Locating manifest…');

    // ── Step 2: Locate SCORM manifest ────────────────────────
    const manifestPath = zipFiles.find(f => f.toLowerCase().endsWith('imsmanifest.xml'));
    if (!manifestPath) {
      throw new Error(
        'No SCORM manifest found (imsmanifest.xml is missing). ' +
        'This does not appear to be a valid SCORM package. ' +
        'Export your content as SCORM 1.2 and try again.'
      );
    }
    result.manifestFound = true;

    // ── Step 3: Read SCORM version from manifest ──────────────
    NotifySystem.updateProgress(notifId, 35, 'Reading manifest…');
    try {
      const manifestText = await zip.file(manifestPath).async('string');
      const xml = new DOMParser().parseFromString(manifestText, 'text/xml');
      const sv = xml.querySelector('schemaversion')?.textContent?.trim() || '';
      if (sv === '1.2') {
        result.scormVersion = 'SCORM 1.2';
      } else if (sv.includes('1.3') || sv.includes('2004')) {
        result.scormVersion = 'SCORM 2004';
        result.warnings.push('This package uses SCORM 2004. Lumio currently supports SCORM 1.2. Import results may vary.');
      } else if (sv) {
        result.scormVersion = `SCORM (${sv})`;
        result.warnings.push(`Unrecognised SCORM version "${sv}". Package inspection continues but import may not be supported.`);
      } else {
        result.scormVersion = 'Unknown';
        result.warnings.push('SCORM version could not be determined from the manifest.');
      }
    } catch (_) {
      result.scormVersion = 'Unknown';
      result.warnings.push('The SCORM manifest could not be parsed — version unknown.');
    }

    // ── Step 4: Detect Rise 360 signature ────────────────────
    NotifySystem.updateProgress(notifId, 50, 'Detecting course format…');
    const indexPath = zipFiles.find(f => f.toLowerCase() === 'scormcontent/index.html');
    result.isRise360 = Boolean(indexPath);

    if (indexPath) {
      try {
        const html = await zip.file(indexPath).async('string');
        const hasRiseSignature = html.includes('__fetchCourse') || html.includes('deserialize(');
        if (!hasRiseSignature) {
          result.warnings.push('A compatible package structure was found, but the expected course content was not detected. This package may use a different format.');
        } else {
          // Extract course metadata for display — inspection only, no conversion
          NotifySystem.updateProgress(notifId, 65, 'Reading course metadata…');
          await _extractCourseMetadata(html, result);
        }
      } catch (_) {
        result.warnings.push('Could not read scormcontent/index.html to inspect course metadata.');
      }
    } else {
      result.warnings.push('scormcontent/index.html was not found. This package may use a non-standard folder structure.');
    }

    // ── Step 5: Count assets (no extraction, no AssetStore) ──
    NotifySystem.updateProgress(notifId, 80, 'Counting assets…');
    _countAssets(zip, result);

    // ── Step 6: Size advisory ─────────────────────────────────
    if (file.size > 150 * 1024 * 1024) {
      result.warnings.push(`This package is ${_formatSize(file.size)}. Very large packages may take longer to import on slower connections.`);
    }

    NotifySystem.updateProgress(notifId, 100);
    result.valid = result.manifestFound && result.errors.length === 0;
    return result;
  }

  /* ── Metadata extraction (inspection only) ───────────────── */

  async function _extractCourseMetadata(html, result) {
    // Locate the base64-encoded course JSON embedded in the Rise 360 SCORM output.
    // This is metadata inspection only — no blocks are read, converted, or stored.
    const match = html.match(/deserialize\s*\(\s*['"`]([A-Za-z0-9+/=\s\r\n]+)['"`]\s*\)/s);
    if (!match) {
      result.warnings.push('Course data blob not found in scormcontent/index.html. Title and lesson count cannot be displayed.');
      return;
    }

    try {
      const b64 = match[1].replace(/[\s\r\n]/g, '');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const riseJson = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      const course = riseJson.course || riseJson;

      // Authoritative title is course.title, NOT exportSettings.title
      result.courseTitle = course.title || null;

      const lessons = Array.isArray(course.lessons) ? course.lessons : [];
      result.lessonCount = lessons.length;

      // Count knowledge check questions — count only, no conversion
      for (const lesson of lessons) {
        for (const block of (lesson.items || [])) {
          if (block.type === 'MULTIPLE_CHOICE' || block.type === 'MULTIPLE_RESPONSE') {
            result.kcCount++;
          }
        }
      }
    } catch (e) {
      result.warnings.push('Course data could not be decoded. The title and lesson count will not be available.');
    }
  }

  /* ── Asset counting ──────────────────────────────────────── */

  function _countAssets(zip, result) {
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const lower = path.toLowerCase();
      // Only count files within the expected asset directories
      if (!lower.includes('/assets/') && !lower.includes('/media/')) continue;
      const ext = lower.split('.').pop();
      if      (IMAGE_EXT.has(ext)) result.assets.images++;
      else if (VIDEO_EXT.has(ext)) result.assets.videos++;
      else if (AUDIO_EXT.has(ext)) result.assets.audio++;
      else if (DOC_EXT.has(ext))   result.assets.documents++;
      else continue;
      result.assets.total++;
    }
  }

  /* ── Inspection screen ───────────────────────────────────── */

  function _showInspectionScreen(result, file) {
    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="SCORM Package Inspection Results">
        <div class="modal" style="width:600px; max-width:94vw; max-height:90vh; overflow-y:auto; padding:36px;">

          <!-- Header -->
          <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:24px;">
            <div style="flex-shrink:0;width:44px;height:44px;border-radius:var(--r-md);background:rgba(79,70,229,.10);display:flex;align-items:center;justify-content:center;font-size:20px;">📦</div>
            <div style="min-width:0;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-400);margin-bottom:4px;">Step 1 of 4 · Inspect</div>
              <h2 style="font-size:20px;font-weight:800;color:var(--ink-900);margin:0 0 4px;">SCORM Package Detected</h2>
              <div style="font-size:12px;color:var(--ink-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(result.filename)} · ${_formatSize(result.fileSize)}</div>
            </div>
          </div>

          <!-- Version badges -->
          <div class="flex gap-8 mb-24" style="flex-wrap:wrap; align-items:center;">
            ${result.scormVersion && result.scormVersion !== 'Unknown'
              ? `<span class="pill pill-indigo">${_esc(result.scormVersion)}</span>`
              : `<span class="pill" style="background:var(--surface-50);color:var(--ink-400);border:1px solid var(--border);">Version unknown</span>`}
            ${result.isRise360
              ? `<span class="pill pill-cyan">Compatible Package</span>`
              : `<span class="pill" style="background:var(--surface-50);color:var(--ink-400);border:1px solid var(--border);">Format not recognised</span>`}
          </div>

          <!-- Package integrity -->
          <div class="card card-pad mb-16">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-400); margin-bottom:14px;">Package Integrity</div>
            <div class="flex-col gap-10">
              ${_integrityRow(true,                    'Valid ZIP archive')}
              ${_integrityRow(result.manifestFound,    'Manifest found (imsmanifest.xml)')}
              ${_integrityRow(result.isRise360,        'Structured learning package', result.isRise360 ? null : 'warn')}
              ${_integrityRow(
                  result.scormVersion === 'SCORM 1.2',
                  result.scormVersion ? `SCORM version: ${_esc(result.scormVersion)}` : 'SCORM version: Unknown',
                  result.scormVersion === 'SCORM 1.2' ? null : 'warn'
              )}
            </div>
          </div>

          <!-- Course information -->
          <div class="card card-pad mb-16">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-400); margin-bottom:14px;">Course Information</div>
            <div class="flex-col gap-10">
              ${_infoRow('📘', 'Course title',
                result.courseTitle
                  ? `<strong>${_esc(result.courseTitle)}</strong>`
                  : `<span class="text-muted">Not detected</span>`
              )}
              ${_infoRow('📚', 'Lessons found', `<strong>${result.lessonCount}</strong>`)}
              ${_infoRow('🧩', 'Knowledge checks', `<strong>${result.kcCount}</strong>`)}
            </div>
          </div>

          <!-- Assets -->
          <div class="card card-pad mb-16">
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--ink-400); margin-bottom:14px;">Package Assets</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px 24px;">
              ${_assetRow('🖼️', 'Images',    result.assets.images)}
              ${_assetRow('🎬', 'Video',     result.assets.videos)}
              ${_assetRow('🎵', 'Audio',     result.assets.audio)}
              ${_assetRow('📄', 'Documents', result.assets.documents)}
            </div>
            <p class="text-sm text-muted mt-14">
              ${result.assets.total > 0
                ? `${result.assets.total} asset file${result.assets.total !== 1 ? 's' : ''} found in package`
                : 'No media assets detected in package'}
            </p>
          </div>

          <!-- Warnings -->
          ${result.warnings.length ? `
            <div style="margin-bottom:20px; padding:14px 16px; border-radius:var(--r-md); background:rgba(217,119,6,.07); border-left:3px solid #d97706;">
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#92400e; margin-bottom:8px;">
                ${result.warnings.length === 1 ? '1 Warning' : `${result.warnings.length} Warnings`}
              </div>
              ${result.warnings.map(w => `
                <p class="text-sm mt-6" style="color:var(--ink-800); line-height:1.55;">⚠️ ${_esc(w)}</p>
              `).join('')}
            </div>
          ` : ''}

          <!-- Footer -->
          <div class="flex justify-end items-center gap-12 mt-24">
            <button class="btn btn-ghost" id="insp-close">Close</button>
            ${result.isRise360
              ? `<button class="btn btn-primary" id="insp-parse">Parse Package →</button>`
              : `<button class="btn btn-ghost" id="insp-parse" disabled style="opacity:.45;cursor:not-allowed;">Parse Package</button>`}
          </div>

        </div>
      </div>
    `);

    document.body.appendChild(overlay);
    overlay.querySelector('#insp-close').addEventListener('click', () => overlay.remove());
    const parseBtn = overlay.querySelector('#insp-parse');
    if (parseBtn && !parseBtn.disabled) {
      parseBtn.addEventListener('click', () => { overlay.remove(); ScormParser.parse(result, file); });
    }
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => (parseBtn && !parseBtn.disabled ? parseBtn : overlay.querySelector('#insp-close')).focus());
  }

  /* ── Error screen ────────────────────────────────────────── */

  function _showError(title, message, filename) {
    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="${_esc(title)}">
        <div class="modal" style="width:520px; max-width:94vw; padding:36px;">

          <div style="text-align:center; margin-bottom:24px;">
            <div style="font-size:44px; line-height:1; margin-bottom:16px;">⚠️</div>
            <h2 style="font-size:20px; color:var(--ink-900);">${_esc(title)}</h2>
            ${filename ? `<p class="text-sm text-muted mt-6" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:400px; margin:6px auto 0;">${_esc(filename)}</p>` : ''}
          </div>

          <div style="padding:16px; border-radius:var(--r-md); background:rgba(220,38,38,.06); border:1px solid rgba(220,38,38,.18); margin-bottom:24px;">
            <p class="text-sm" style="color:var(--ink-900); line-height:1.65;">${_esc(message)}</p>
          </div>

          <div class="flex justify-end gap-12">
            <button class="btn btn-ghost" id="err-close">Close</button>
            <button class="btn btn-secondary" id="err-retry">Try Another File</button>
          </div>

        </div>
      </div>
    `);

    document.body.appendChild(overlay);
    overlay.querySelector('#err-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#err-retry').addEventListener('click', () => {
      overlay.remove();
      openImportContentModal();
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => overlay.querySelector('#err-retry').focus());
  }

  /* ── Row helpers ─────────────────────────────────────────── */

  function _integrityRow(ok, label, state) {
    const icon = state === 'warn'
      ? `<span style="color:#d97706; font-size:15px; flex-shrink:0;">⚠</span>`
      : ok
        ? `<span style="color:#059669; font-size:15px; flex-shrink:0;">✓</span>`
        : `<span style="color:#dc2626; font-size:15px; flex-shrink:0;">✗</span>`;
    return `<div class="flex items-center gap-10" style="font-size:13.5px; color:var(--ink-900);">${icon} ${_esc(label)}</div>`;
  }

  function _infoRow(icon, label, valueHtml) {
    return `
      <div class="flex items-center gap-10" style="font-size:13.5px; color:var(--ink-900);">
        <span style="flex-shrink:0;">${icon}</span>
        <span style="color:var(--ink-500); min-width:140px;">${_esc(label)}</span>
        <span>${valueHtml}</span>
      </div>`;
  }

  function _assetRow(icon, label, count) {
    return `
      <div class="flex items-center gap-10" style="font-size:13.5px; color:var(--ink-900);">
        <span style="flex-shrink:0;">${icon}</span>
        <span style="flex:1;">${_esc(label)}</span>
        <strong style="font-variant-numeric:tabular-nums;">${count}</strong>
      </div>`;
  }

  /* ── Utilities ───────────────────────────────────────────── */

  function _formatSize(bytes) {
    if (bytes < 1024)             return `${bytes} B`;
    if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3)        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
  }

  function _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Public API ──────────────────────────────────────────── */
  return { inspect };

})();
