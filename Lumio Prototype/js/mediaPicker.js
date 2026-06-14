/* ============================================================
   MEDIA PICKER
   Shared modal for image upload/replace/remove, reused across all
   media-enabled blocks and settings panels. Visual language matches
   the Course Settings Hero Image uploader (drag & drop area, Browse
   File, Replace, Remove) plus Cancel/Insert actions in a modal.
   ============================================================ */

const MEDIA_PICKER_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'];
const MEDIA_PICKER_MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB

function mediaPickerFileAccept() {
  return MEDIA_PICKER_ACCEPTED_TYPES.join(',');
}

// Validates a File and reads it to a data URL. Calls callback(result, error).
// result = { src, fileName, mimeType } on success.
function readMediaPickerFile(file, callback) {
  if (!file) return;
  const type = file.type || '';
  const validType = MEDIA_PICKER_ACCEPTED_TYPES.includes(type) || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name || '');
  if (!validType) {
    callback(null, 'Unsupported file type. Please upload a PNG, JPG, JPEG, WEBP, GIF, or SVG image.');
    return;
  }
  if (file.size > MEDIA_PICKER_MAX_FILE_BYTES) {
    callback(null, `Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 2MB.`);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => callback({ src: reader.result, fileName: file.name, mimeType: type || 'image/png' }, null);
  reader.onerror = () => callback(null, 'Could not read the selected file. Please try again.');
  reader.readAsDataURL(file);
}

// Opens the shared Media Picker modal.
// opts:
//   title: modal heading (e.g. "Avatar Image")
//   currentSrc: existing image data URL, or null/undefined if none
//   onInsert(result): called with { src, fileName, mimeType } when the user confirms a new/replaced image
//   onRemove(): called when the user removes the current image
function openMediaPicker(opts) {
  const state = {
    src: opts.currentSrc || null,
    fileName: null,
    mimeType: null,
    changed: false,
    removed: false,
  };

  const overlay = el('<div class="overlay"></div>');
  document.body.appendChild(overlay);

  function render() {
    overlay.innerHTML = `
      <div class="modal" style="width:480px; padding:28px;">
        <h3 style="font-size:16px;">${opts.title || 'Choose Image'}</h3>
        <div class="mt-16">
          <div class="mp-dropzone" id="mp-dropzone" tabindex="0" role="button" aria-label="Upload image">
            ${state.src
              ? `<img src="${state.src}" alt="" class="mp-preview-img" />`
              : `<div class="mp-dropzone-empty">
                   <div class="mp-dropzone-icon">🖼️</div>
                   <p class="text-sm text-muted mt-8">Drag &amp; drop an image here, or browse</p>
                 </div>`}
          </div>
          <input type="file" id="mp-file-input" accept="${mediaPickerFileAccept()}" style="display:none" />
          <div class="flex gap-12 mt-12" style="flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" id="mp-browse">${state.src ? '🔄 Replace Image' : '📤 Browse File'}</button>
            ${state.src ? `<button class="btn btn-secondary btn-sm" id="mp-remove" style="color:#E5484D;">🗑️ Remove Image</button>` : ''}
          </div>
          <div class="text-sm text-muted mt-8">Supported formats: PNG, JPG, JPEG, WEBP, GIF, SVG · Max size 2MB.</div>
          <div id="mp-error" class="text-sm mt-8" style="color:#E5484D; display:none;"></div>
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
      state.changed = true;
      state.removed = false;
      render();
    });
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
      state.changed = true;
      state.removed = true;
      render();
    });

    overlay.querySelector('#mp-cancel').addEventListener('click', close);

    overlay.querySelector('#mp-insert').addEventListener('click', () => {
      if (state.removed) {
        opts.onRemove && opts.onRemove();
      } else if (state.changed) {
        opts.onInsert && opts.onInsert({ src: state.src, fileName: state.fileName, mimeType: state.mimeType });
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
