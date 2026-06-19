/* ============================================================
   HERO IMAGE SYSTEM
   Shared data model defaults, helpers, and rendering engine used
   by both the Course Landing Page and Learner Preview so hero
   image settings render identically on both surfaces.
   ============================================================ */

const HERO_HEIGHT_PRESETS = [
  { id: 'small', label: 'Small Banner', px: 160 },
  { id: 'medium', label: 'Medium Banner', px: 240 },
  { id: 'large', label: 'Large Banner', px: 360 },
  { id: 'full', label: 'Full Width Hero', px: 480 },
];

/* ── Centralized upload limits (single source of truth for all upload pipelines) ── */
const UPLOAD_LIMITS = {
  image:    50   * 1024 * 1024,  // 50 MB
  audio:    250  * 1024 * 1024,  // 250 MB
  video:    1024 * 1024 * 1024,  // 1 GB
  document: 100  * 1024 * 1024,  // 100 MB
};

/* Formats a byte count as a short label for upload limit display ("50 MB", "1 GB"). */
function _formatUploadLimit(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

const HERO_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

function defaultHeroImage() {
  return {
    src: null,
    fileName: null,
    mimeType: null,
    displayMode: 'cover', // 'cover' | 'contain' | 'fill'
    posX: 'center',        // 'left' | 'center' | 'right'
    posY: 'center',        // 'top' | 'center' | 'bottom'
    scale: 100,             // 50 | 75 | 100 | 125 | 150
  };
}

function defaultHeroSettings() {
  return {
    height: 'medium', // 'small' | 'medium' | 'large' | 'full'
    overlay: { mode: 'none', opacity: 0.35 }, // mode: 'none' | 'light' | 'dark' | 'theme'
    roundedCorners: true,
    titlePosition: 'bottom', // 'top' | 'center' | 'bottom'
    textAlign: 'center',     // 'left' | 'center' | 'right'
    textColor: 'auto',       // 'auto' | 'light' | 'dark' | '#custom'
  };
}

// Backfills missing hero fields on a course without clobbering existing values.
function ensureHeroDefaults(course) {
  const di = defaultHeroImage();
  if (!course.heroImage || typeof course.heroImage !== 'object') {
    course.heroImage = di;
  } else {
    Object.keys(di).forEach(k => { if (course.heroImage[k] === undefined) course.heroImage[k] = di[k]; });
  }

  const ds = defaultHeroSettings();
  if (!course.heroSettings || typeof course.heroSettings !== 'object') {
    course.heroSettings = ds;
  } else {
    Object.keys(ds).forEach(k => { if (course.heroSettings[k] === undefined) course.heroSettings[k] = ds[k]; });
    if (typeof course.heroSettings.overlay !== 'object' || course.heroSettings.overlay === null) {
      const num = typeof course.heroSettings.overlay === 'number' ? course.heroSettings.overlay : 0.35;
      course.heroSettings.overlay = { mode: num > 0 ? 'dark' : 'none', opacity: num || 0.35 };
    }
  }
  return course;
}

function heroHeightPx(heightId) {
  const preset = HERO_HEIGHT_PRESETS.find(p => p.id === heightId);
  return preset ? preset.px : 240;
}

function heroFallbackGradient(course) {
  return `linear-gradient(135deg, ${course.themeDesign.primary}, ${course.themeDesign.secondary})`;
}

function hexToRgb(hex) {
  if (!hex) return null;
  const clean = String(hex).replace('#', '');
  const m = clean.match(/.{1,2}/g);
  if (!m || m.length < 3) return null;
  return m.slice(0, 3).map(x => parseInt(x, 16)).join(',');
}

// Returns an rgba(...) string for the overlay layer, or null if no overlay.
function heroOverlayCss(course) {
  const ov = (course.heroSettings && course.heroSettings.overlay) || { mode: 'none', opacity: 0.35 };
  if (!ov.mode || ov.mode === 'none') return null;
  let rgb;
  if (ov.mode === 'light') rgb = '255,255,255';
  else if (ov.mode === 'dark') rgb = '0,0,0';
  else if (ov.mode === 'theme') rgb = hexToRgb(course.themeDesign && course.themeDesign.primary) || '0,0,0';
  else return null;
  const opacity = ov.opacity != null ? ov.opacity : 0.35;
  return `rgba(${rgb},${opacity})`;
}

// Resolves the effective title/text colour based on heroSettings.textColor.
function heroTextColor(course) {
  const hs = course.heroSettings;
  const tc = hs.textColor || 'auto';
  if (tc === 'light') return '#ffffff';
  if (tc === 'dark') return 'var(--ink-900)';
  if (tc === 'auto') {
    const ov = hs.overlay || {};
    if (ov.mode === 'light') return 'var(--ink-900)';
    return '#ffffff';
  }
  return tc; // custom hex
}

// Renders the hero image/gradient layer plus overlay, with optional
// absolutely-positioned content (e.g. title) and an optional edit button.
function renderHeroMedia(course, heightPx, opts = {}) {
  const radius = opts.radius || '0px';
  const hi = course.heroImage || defaultHeroImage();
  let bgLayer;
  if (hi.src) {
    const objectFit = { cover: 'cover', contain: 'contain', fill: '100% 100%' }[hi.displayMode] || 'cover';
    const objectPosition = `${hi.posX || 'center'} ${hi.posY || 'center'}`;
    const scale = (hi.scale || 100) / 100;
    bgLayer = `<img src="${AssetStore.resolveMediaSrc(hi.src)}" alt="${course.title || ''} hero image" style="position:absolute; inset:0; width:100%; height:100%; object-fit:${objectFit}; object-position:${objectPosition}; transform:scale(${scale}); transform-origin:${objectPosition};" />`;
  } else {
    bgLayer = `<div style="position:absolute; inset:0; background:${heroFallbackGradient(course)};"></div>
      <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:48px; opacity:0.85; z-index:1;">🧠✨</div>`;
  }
  const overlayColor = heroOverlayCss(course);
  const overlayLayer = overlayColor ? `<div style="position:absolute; inset:0; background:${overlayColor}; z-index:1;"></div>` : '';
  const editBtn = opts.editable ? `<button class="btn btn-secondary btn-sm" id="${opts.editBtnId || 'change-hero'}" style="position:absolute; bottom:12px; right:12px; z-index:3;">${opts.editBtnLabel || '🖼️ Edit hero image'}</button>` : '';
  return `<div style="height:${heightPx}px; position:relative; overflow:hidden; border-radius:${radius};">
    ${bgLayer}
    ${overlayLayer}
    ${opts.content || ''}
    ${editBtn}
  </div>`;
}

// Renders the course title (and optional extra HTML, e.g. description/CTA)
// positioned and coloured on top of the hero image per heroSettings.
function renderHeroTitleOverlay(course, extraHtml) {
  const hs = course.heroSettings;
  const justify = { top: 'flex-start', center: 'center', bottom: 'flex-end' }[hs.titlePosition] || 'bottom';
  const align = { left: 'flex-start', center: 'center', right: 'flex-end' }[hs.textAlign] || 'center';
  const textAlign = hs.textAlign || 'center';
  const color = heroTextColor(course);
  return `<div style="position:absolute; inset:0; z-index:2; display:flex; flex-direction:column; align-items:${align}; justify-content:${justify}; padding:32px; text-align:${textAlign}; pointer-events:none;">
    <div style="max-width:560px; pointer-events:auto;">
      <h1 style="font-size:calc(var(--theme-font-size, 16px) + 14px); font-family:var(--theme-font-display, var(--font-display)); color:${color}; margin:0;">${course.title}</h1>
      ${extraHtml || ''}
    </div>
  </div>`;
}

/* ---------------- CARD THUMBNAILS ---------------- */
// Returns the uploaded hero image src for a course (by project/course id), or
// null if the course has no custom hero image yet.
function courseHeroImageSrc(courseId) {
  const course = LumioState.courses && LumioState.courses[courseId];
  return (course && course.heroImage && course.heroImage.src) || null;
}

// Returns the auto-generated thumbnail asset ID for a course's hero image, or null.
// Thumbnails are created at upload time (400×240 WebP) and stored separately from the hero.
function courseHeroThumbSrc(courseId) {
  const course = LumioState.courses && LumioState.courses[courseId];
  return (course && course.heroImage && course.heroImage._thumbSrc) || null;
}

/* ---------------- COURSE THUMBNAIL ---------------- */
// The Course Thumbnail is a separate asset from the Hero Image. It is used on
// Projects/Recent/search/folder cards; the Hero Image is used on Course
// Landing and Learner Preview. The two are never derived from one another.
function defaultThumbnailImage() {
  return { src: null, fileName: null, mimeType: null };
}

// Backfills missing thumbnail fields on a course without clobbering existing values.
function ensureThumbnailDefaults(course) {
  const dt = defaultThumbnailImage();
  if (!course.thumbnailImage || typeof course.thumbnailImage !== 'object') {
    course.thumbnailImage = dt;
  } else {
    Object.keys(dt).forEach(k => { if (course.thumbnailImage[k] === undefined) course.thumbnailImage[k] = dt[k]; });
  }
  return course;
}

// Returns the uploaded thumbnail image src for a course (by project/course
// id), or null if the course has no custom thumbnail yet.
function courseThumbnailSrc(courseId) {
  const course = LumioState.courses && LumioState.courses[courseId];
  return (course && course.thumbnailImage && course.thumbnailImage.src) || null;
}

// Returns thumbnail background info for a project/course card. Priority:
// 1) a custom Course Thumbnail, 2) the Hero Image (existing behaviour),
// 3) the gradient placeholder.
function cardThumbMedia(p) {
  // Priority: user-set thumbnail → auto-generated hero thumbnail (smaller) → full-res hero
  const src = courseThumbnailSrc(p.id) || courseHeroThumbSrc(p.id) || courseHeroImageSrc(p.id);
  if (src) {
    return {
      heroSrc: src,
      bg: '#0b0b12',
      img: `<img src="${AssetStore.resolveMediaSrc(src)}" alt="" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center; z-index:0;" />`,
    };
  }
  return { heroSrc: null, bg: LumioData.thumbGradients[p.thumb], img: '' };
}

/* ---------------- IMAGE UPLOAD HANDLING ---------------- */
function heroFileAccept() {
  return HERO_ACCEPTED_TYPES.join(',');
}

// Validates a File and reads it to a data URL. Calls callback(result, error).
// result = { src, fileName, mimeType } on success.
function readHeroImageFile(file, callback) {
  if (!file) return;
  const type = file.type || '';
  const validType = HERO_ACCEPTED_TYPES.includes(type) || /\.(png|jpe?g|webp)$/i.test(file.name || '');
  if (!validType) {
    callback(null, 'Unsupported file type. Please upload a PNG, JPG, JPEG, or WEBP image.');
    return;
  }
  if (file.size > UPLOAD_LIMITS.image) {
    const fileMb = (file.size / 1024 / 1024).toFixed(1);
    callback(null, `This image is ${fileMb} MB. Maximum supported image size is ${_formatUploadLimit(UPLOAD_LIMITS.image)}.`);
    return;
  }
  AssetStore.put(file).then(async assetId => {
    await AssetStore.resolveUrl(assetId);
    // Auto-generate a lightweight thumbnail for use in project/course cards.
    // Best-effort: never blocks or fails the upload if thumbnail creation errors.
    let _thumbSrc = null;
    try {
      const asset = await AssetStore.get(assetId);
      if (asset) {
        const thumb = await generateImageThumbnail(asset.blob, 400, 240, 0.72);
        if (thumb) {
          _thumbSrc = await AssetStore.put(thumb);
          await AssetStore.resolveUrl(_thumbSrc);
        }
      }
    } catch (_) {}
    callback({ src: assetId, fileName: file.name, mimeType: type || 'image/png', _thumbSrc }, null);
  }).catch(() => {
    callback(null, 'Could not store the file. Please try again.');
  });
}
