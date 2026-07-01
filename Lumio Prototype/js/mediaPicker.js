/* ============================================================
   MEDIA PICKER
   Shared modal for image/audio/video/file upload/replace/remove,
   reused across all media-enabled blocks and settings panels.
   Visual language matches the Course Settings Hero Image uploader
   (drag & drop area, Browse File, Replace, Remove) plus
   Cancel/Insert actions in a modal.
   ============================================================ */

const MEDIA_PICKER_KINDS = {
  image: {
    types: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'],
    extRegex: /\.(png|jpe?g|webp|gif|svg)$/i,
    extra: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'],
    maxBytes: UPLOAD_LIMITS.image,
    formatsLabel: 'PNG, JPG, JPEG, WEBP, GIF, SVG',
    maxLabel: _formatUploadLimit(UPLOAD_LIMITS.image),
    noun: 'image',
    icon: '🖼️',
    errorLabel: 'a PNG, JPG, JPEG, WEBP, GIF, or SVG image',
    defaultMime: 'image/png',
  },
  audio: {
    types: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/ogg'],
    extRegex: /\.(mp3|wav|m4a|ogg)$/i,
    extra: ['.mp3', '.wav', '.m4a', '.ogg'],
    maxBytes: UPLOAD_LIMITS.audio,
    formatsLabel: 'MP3, WAV, M4A, OGG',
    maxLabel: _formatUploadLimit(UPLOAD_LIMITS.audio),
    noun: 'audio file',
    icon: '🎵',
    errorLabel: 'an MP3, WAV, M4A, or OGG audio file',
    defaultMime: 'audio/mpeg',
  },
  video: {
    types: ['video/mp4', 'video/webm', 'video/quicktime'],
    extRegex: /\.(mp4|webm|mov)$/i,
    extra: ['.mp4', '.webm', '.mov'],
    maxBytes: UPLOAD_LIMITS.video,
    formatsLabel: 'MP4, WEBM, MOV',
    maxLabel: _formatUploadLimit(UPLOAD_LIMITS.video),
    noun: 'video',
    icon: '🎬',
    errorLabel: 'an MP4, WEBM, or MOV video file',
    defaultMime: 'video/mp4',
  },
  file: {
    types: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain',
      'application/zip',
      'application/x-zip-compressed',
    ],
    extRegex: /\.(pdf|docx|pptx|xlsx|csv|txt|zip)$/i,
    extra: ['.pdf', '.docx', '.pptx', '.xlsx', '.csv', '.txt', '.zip'],
    maxBytes: UPLOAD_LIMITS.document,
    formatsLabel: 'PDF, DOCX, PPTX, XLSX, CSV, TXT, ZIP',
    maxLabel: _formatUploadLimit(UPLOAD_LIMITS.document),
    noun: 'document',
    icon: '📎',
    errorLabel: 'a PDF, DOCX, PPTX, XLSX, CSV, TXT, or ZIP file',
    defaultMime: 'application/octet-stream',
  },
};

function mediaPickerKindConfig(opts) {
  return MEDIA_PICKER_KINDS[(opts && opts.kind) || 'image'];
}

function mediaPickerFileAccept(opts) {
  const cfg = mediaPickerKindConfig(opts);
  return cfg.types.concat(cfg.extra).join(',');
}

/* Formats a byte count as a short human-readable size string (e.g. "2.4 MB"). */
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Validates a File and reads it to a data URL. Calls callback(result, error).
// result = { src, fileName, mimeType, size } on success.
// opts: { kind: 'image'|'audio'|'video'|'file' } — selects accepted types, size limit, and messaging.
function readMediaPickerFile(file, callback, opts) {
  if (!file) return;
  opts = opts || {};
  const cfg = mediaPickerKindConfig(opts);
  const type = file.type || '';
  const validType = cfg.types.includes(type) || cfg.extRegex.test(file.name || '');
  if (!validType) {
    callback(null, `Unsupported file type. Please upload ${cfg.errorLabel}.`);
    return;
  }
  if (file.size > cfg.maxBytes) {
    const fileMb = file.size / 1024 / 1024;
    const fileStr = fileMb >= 1024 ? `${(fileMb / 1024).toFixed(1)} GB` : `${fileMb.toFixed(1)} MB`;
    callback(null, `This ${cfg.noun} is ${fileStr}. Maximum supported ${cfg.noun} size is ${cfg.maxLabel}.`);
    return;
  }
  AssetStore.put(file).then(assetId => {
    return AssetStore.resolveUrl(assetId).then(() => {
      callback({ src: assetId, fileName: file.name, mimeType: type || cfg.defaultMime, size: file.size }, null);
    });
  }).catch(() => {
    callback(null, 'Could not store the file. Please try again.');
  });
}

// Opens the shared Media Picker modal.
// opts:
//   title: modal heading (e.g. "Avatar Image")
//   kind: 'image' (default), 'audio', 'video', or 'file'
//   currentSrc: existing media data URL, or null/undefined if none
//   currentFileName: existing file name, for display
//   onInsert(result): called with { src, fileName, mimeType, size } when the user confirms a new/replaced file
//   onRemove(): called when the user removes the current file
function openMediaPicker(opts) {
  const cfg = mediaPickerKindConfig(opts);
  const kind = (opts && opts.kind) || 'image';
  const isImage = kind === 'image';
  const state = {
    src: opts.currentSrc || null,
    fileName: opts.currentFileName || null,
    mimeType: null,
    size: null,
    changed: false,
    removed: false,
  };

  const overlay = el('<div class="overlay"></div>');
  document.body.appendChild(overlay);

  function render() {
    let preview;
    if (state.src) {
      if (isImage) {
        // state.src is frequently an opaque asset:// reference (every real
        // upload goes through AssetStore.put, not a directly-renderable
        // URL) — must resolve to a real blob URL before use as <img src>,
        // exactly like every other image renderer in the app does via
        // AssetStore.resolveMediaSrc(). Without this the preview was
        // silently blank for every real upload (only direct data:/blob:
        // URLs, e.g. from a test harness, happened to render).
        const resolvedSrc = AssetStore.resolveMediaSrc(state.src) || state.src;
        // Critical Correction Sprint: positioning/cropping removed entirely
        // per explicit instruction — this is now a plain, large confirmation
        // preview only. It fills the frame (object-fit:contain keeps the
        // whole image visible/undistorted, since there is no crop to judge
        // anymore) so the author can simply confirm the right file was
        // selected before inserting.
        preview = `<div style="width:100%; min-height:280px; max-height:360px; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:var(--r-sm); background:var(--surface-50);">
          <img src="${resolvedSrc}" alt="" style="max-width:100%; max-height:360px; object-fit:contain; display:block;" />
        </div>`;
      } else if (kind === 'audio') {
        preview = `<div class="mp-audio-preview" style="padding:16px; text-align:center;">
             <div style="font-size:32px;">${cfg.icon}</div>
             <div class="text-sm mt-8" style="word-break:break-all;">${escapeHtml(state.fileName || 'Audio file')}</div>
             <audio controls src="${state.src}" style="width:100%; margin-top:12px;"></audio>
           </div>`;
      } else if (kind === 'video') {
        preview = `<div class="mp-video-preview" style="padding:16px; text-align:center;">
             <video controls src="${state.src}" style="width:100%; max-height:200px; border-radius:var(--r-sm); background:#000;"></video>
             <div class="text-sm mt-8" style="word-break:break-all;">${escapeHtml(state.fileName || 'Video file')}</div>
           </div>`;
      } else {
        preview = `<div class="mp-file-preview" style="padding:24px; text-align:center;">
             <div style="font-size:32px;">${cfg.icon}</div>
             <div class="text-sm mt-8" style="word-break:break-all;">${escapeHtml(state.fileName || 'File')}</div>
             ${state.size ? `<div class="text-sm text-muted mt-4">${formatFileSize(state.size)}</div>` : ''}
           </div>`;
      }
    } else {
      preview = `<div class="mp-dropzone-empty">
             <div class="mp-dropzone-icon">${cfg.icon}</div>
             <p class="text-sm text-muted mt-8">Drag &amp; drop ${isImage ? 'an image' : kind === 'audio' ? 'an audio file' : kind === 'video' ? 'a video file' : 'a file'} here, or browse</p>
           </div>`;
    }

    const nounCap = kind === 'audio' ? 'Audio' : kind === 'video' ? 'Video' : kind === 'file' ? 'File' : 'Image';

    overlay.innerHTML = `
      <div class="modal" style="width:480px; padding:28px;">
        <h3 style="font-size:16px;">${opts.title || `Choose ${nounCap}`}</h3>
        <div class="mt-16">
          <div class="mp-dropzone" id="mp-dropzone" tabindex="0" role="button" aria-label="Upload ${nounCap.toLowerCase()}">
            ${preview}
          </div>
          <input type="file" id="mp-file-input" accept="${mediaPickerFileAccept(opts)}" style="display:none" />
          <div class="flex gap-12 mt-12" style="flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="mp-browse">${state.src ? `🔄 Replace ${nounCap}` : '📤 Browse File'}</button>
            ${state.src ? `<button class="btn btn-secondary btn-sm text-destructive" id="mp-remove">🗑️ Remove ${nounCap}</button>` : ''}
          </div>
          <div class="text-sm text-muted mt-8">Supported formats: ${cfg.formatsLabel} · Max size ${cfg.maxLabel}.</div>
          <div id="mp-error" class="text-sm mt-8 text-destructive" style="display:none;"></div>
        </div>
        <div class="flex gap-12 mt-24" style="justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" id="mp-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="mp-insert" ${state.changed ? '' : 'disabled'}>Insert</button>
        </div>
      </div>
    `;
    bind();
  }

  function showError(msg) {
    const errEl = overlay.querySelector('#mp-error');
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }

  function handleFile(file) {
    readMediaPickerFile(file, (result, error) => {
      if (error) {
        showError(error);
        toast(error, '⚠️');
        return;
      }
      state.src = result.src;
      state.fileName = result.fileName;
      state.mimeType = result.mimeType;
      state.size = result.size;
      state.changed = true;
      state.removed = false;
      render();
    }, opts);
  }

  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  function bind() {
    const dropzone = overlay.querySelector('#mp-dropzone');
    const fileInput = overlay.querySelector('#mp-file-input');

    overlay.querySelector('#mp-browse').addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFile(file);
      e.target.value = '';
    });

    overlay.querySelector('#mp-remove')?.addEventListener('click', () => {
      state.src = null;
      state.fileName = null;
      state.mimeType = null;
      state.size = null;
      state.changed = true;
      state.removed = true;
      render();
    });

    overlay.querySelector('#mp-cancel').addEventListener('click', close);

    overlay.querySelector('#mp-insert').addEventListener('click', () => {
      if (state.removed) {
        opts.onRemove && opts.onRemove();
      } else if (state.changed) {
        opts.onInsert && opts.onInsert({ src: state.src, fileName: state.fileName, mimeType: state.mimeType, size: state.size });
      }
      close();
    });

    let dragDepth = 0;
    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      dropzone.classList.add('drag-active');
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });
    dropzone.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) dropzone.classList.remove('drag-active');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      dropzone.classList.remove('drag-active');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKeydown);

  render();
}
