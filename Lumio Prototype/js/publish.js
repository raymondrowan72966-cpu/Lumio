/* ============================================================
   HTML PUBLISH ENGINE — Phase 1
   Generates a self-contained HTML web package that reuses
   the existing learner rendering pipeline without modification.
   ============================================================ */

/* ── Media optimization utilities ── */

/**
 * generateImageThumbnail(blob, maxW?, maxH?, quality?) → Promise<Blob|null>
 * Downscales a raster image blob to fit within maxW×maxH, re-encodes as WebP.
 * Returns null if the image cannot be decoded (SVG, corrupt file, etc.).
 */
function generateImageThumbnail(blob, maxW = 400, maxH = 240, quality = 0.72) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(thumb => resolve(thumb || null), 'image/webp', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/**
 * optimizeImageForPublish(blob, mimeType) → Promise<{ blob, mimeType, ext }>
 * Re-encodes PNG/JPG/WebP as WebP at quality 0.82 for publish packages.
 * Returns the original if the WebP output would be larger, or if the type
 * is SVG/GIF (which must pass through unchanged).
 * Originals in IndexedDB are never modified.
 */
function optimizeImageForPublish(blob, mimeType) {
  const passThrough = ['image/svg+xml', 'image/gif'];
  if (passThrough.includes(mimeType)) {
    return Promise.resolve({ blob, mimeType, ext: _mimeToExt(mimeType) });
  }
  const rasterTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!rasterTypes.includes(mimeType)) {
    return Promise.resolve({ blob, mimeType, ext: _mimeToExt(mimeType) });
  }
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob(optimized => {
        if (optimized && optimized.size < blob.size) {
          resolve({ blob: optimized, mimeType: 'image/webp', ext: 'webp' });
        } else {
          resolve({ blob, mimeType, ext: _mimeToExt(mimeType) });
        }
      }, 'image/webp', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ blob, mimeType, ext: _mimeToExt(mimeType) }); };
    img.src = url;
  });
}

/**
 * analyzePublishAssets(course, lessonData) → Promise<analysis>
 * Scans all asset refs in course+lessons, categorises by MIME type, computes sizes,
 * and generates human-readable warnings for oversized files.
 */
async function analyzePublishAssets(course, lessonData) {
  const refs = _collectProjectAssetRefs(course, lessonData);
  const entries = await AssetStore.exportAll(refs);

  const images = [], audio = [], video = [], docs = [];
  for (const a of entries) {
    const mt = a.mimeType || '';
    if (mt.startsWith('image/')) images.push(a);
    else if (mt.startsWith('audio/')) audio.push(a);
    else if (mt.startsWith('video/')) video.push(a);
    else docs.push(a);
  }

  const totalSize = entries.reduce((s, a) => s + (a.size || 0), 0);

  const WARN_IMAGE_BYTES = UPLOAD_LIMITS.image / 2;          // 25 MB
  const WARN_AUDIO_BYTES = UPLOAD_LIMITS.document;            // 100 MB
  const WARN_VIDEO_BYTES = UPLOAD_LIMITS.video / 2;          // 512 MB

  const warnings = [];
  for (const a of entries) {
    const sz = a.size || 0;
    const mb = sz / 1024 / 1024;
    const mt = a.mimeType || '';
    const name = escapeHtml(a.fileName || 'unknown');
    if (mt.startsWith('image/') && sz > WARN_IMAGE_BYTES)
      warnings.push(`Image "${name}" is ${mb.toFixed(1)} MB — consider using a smaller image`);
    if (mt.startsWith('audio/') && sz > WARN_AUDIO_BYTES)
      warnings.push(`Audio "${name}" is ${mb.toFixed(1)} MB — this will produce a large publish package`);
    if (mt.startsWith('video/') && sz > WARN_VIDEO_BYTES)
      warnings.push(`Video "${name}" is ${mb.toFixed(1)} MB — this will produce a large publish package`);
  }

  return { refs, entries, images, audio, video, docs, totalSize, warnings };
}

const PUBLISH_JS_FILES = [
  'js/data.js',
  'js/lumioAI.js',
  'js/blocks/families.js',
  'js/blocks/capabilities.js',
  'js/blocks/schema.js',
  'js/blocks/migration.js',
  'js/blocks/designSystem.js',
  'js/blocks/behaviourRuntime.js',
  'js/blocks/accessibilityRuntime.js',
  'js/blocks/completionEngine.js',
  'js/heroImage.js',
  'js/assetStore.js',
  'js/app.js',
  'js/mediaPicker.js',
  'js/screens/wizard.js',
  'js/screens/landingSections.js',
  'js/screens/courseLanding.js',
  'js/screens/lessonBuilder.js',
  'js/screens/learnerPreview.js',
];

async function publishHtmlPackage(course, triggerBtn) {
  const issues = getCourseReadinessIssues(course);
  if (issues.length > 0) {
    toast('Course not ready: ' + issues[0], '⚠️');
    return;
  }

  const originalLabel = triggerBtn ? triggerBtn.textContent : '';
  if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = 'Generating…'; }

  try {
    // Collect all lessons and assessments belonging to this course.
    const lessonData = {};
    (course.lessons || []).forEach(l => {
      if (LumioState.lessons[l.id]) lessonData[l.id] = LumioState.lessons[l.id];
    });
    (course.assessments || []).forEach(a => {
      if (LumioState.lessons[a.id]) lessonData[a.id] = LumioState.lessons[a.id];
    });

    // Collect all asset:// refs from this course and fetch their blobs.
    const assetRefs = _collectProjectAssetRefs(course, lessonData);
    const assetEntries = await AssetStore.exportAll(assetRefs);

    // Build publish-safe path map: { 'asset://hash' → 'assets/hash.ext' }
    // Images are re-encoded as WebP at publish time; originals in IDB are untouched.
    const assetMap = {};
    const zipAssetFiles = [];
    let savedBytes = 0;
    for (const a of assetEntries) {
      let finalBlob = a.blob;
      let finalMime = a.mimeType;
      let finalExt = _mimeToExt(a.mimeType);

      if (a.mimeType && a.mimeType.startsWith('image/')) {
        const opt = await optimizeImageForPublish(a.blob, a.mimeType);
        finalBlob = opt.blob;
        finalMime = opt.mimeType;
        finalExt = opt.ext;
        savedBytes += Math.max(0, a.blob.size - finalBlob.size);
      }

      const hexId = a.id.replace('asset://', '');
      const filePath = `assets/${hexId}.${finalExt}`;
      assetMap[a.id] = filePath;
      const buf = await finalBlob.arrayBuffer();
      zipAssetFiles.push({ name: filePath, content: new Uint8Array(buf) });
    }

    const [css, ...jsSources] = await Promise.all([
      fetch('css/styles.css').then(r => { if (!r.ok) throw new Error('CSS fetch failed'); return r.text(); }),
      ...PUBLISH_JS_FILES.map(f => fetch(f).then(r => { if (!r.ok) throw new Error(f + ' fetch failed'); return r.text(); })),
    ]);

    const courseDataJson = JSON.stringify({ course, lessons: lessonData });
    const assetMapJson = JSON.stringify(assetMap);

    // Bootstrap overrides app.js's DOMContentLoaded handler to launch learner mode.
    // Also patches AssetStore to resolve asset:// refs via the publish-time asset map
    // instead of IndexedDB, making the published package fully self-contained.
    const bootstrapScript = `(function(){
  var __cd=window.__LUMIO_COURSE_DATA__;
  var cid=__cd.course.id;
  // Learner-only persistence, isolated per published course — never the full
  // author lumio.state. Only learnerProfile, resume, this course's own
  // learnerProgress/interactionHistory entries, and this course's own
  // assessment attempts are read/written. No projects/courses/assets/author
  // data ever touch this key.
  var __lk='lumio-learner-'+cid;
  var __assessmentIds=(__cd.course.assessments||[]).map(function(a){return a.id;});
  function __loadLearnerState(){
    try{
      var raw=localStorage.getItem(__lk);
      if(!raw)return;
      var rec=JSON.parse(raw);
      if(rec.learnerProfile)LumioState.learnerProfile=rec.learnerProfile;
      if(rec.resume)LumioState.resume=rec.resume;
      if(rec.learnerProgress){if(!LumioState.learnerProgress)LumioState.learnerProgress={};LumioState.learnerProgress[cid]=rec.learnerProgress;}
      if(rec.interactionHistory){if(!LumioState.interactionHistory)LumioState.interactionHistory={};LumioState.interactionHistory[cid]=rec.interactionHistory;}
      if(rec.assessmentAttempts){if(!LumioState.assessmentAttempts)LumioState.assessmentAttempts={};Object.assign(LumioState.assessmentAttempts,rec.assessmentAttempts);}
    }catch(e){}
  }
  function __saveLearnerState(){
    try{
      var assessmentAttempts={};
      __assessmentIds.forEach(function(id){
        if((LumioState.assessmentAttempts||{})[id])assessmentAttempts[id]=LumioState.assessmentAttempts[id];
      });
      var rec={
        learnerProfile:LumioState.learnerProfile,
        resume:LumioState.resume,
        learnerProgress:(LumioState.learnerProgress||{})[cid],
        interactionHistory:(LumioState.interactionHistory||{})[cid],
        assessmentAttempts:assessmentAttempts,
      };
      localStorage.setItem(__lk,JSON.stringify(rec));
    }catch(e){}
  }
  var __saveTimer=null;
  window.loadLumioState=function(){__loadLearnerState();return null;};
  window.saveLumioState=__saveLearnerState;
  window.scheduleLumioSave=function(){if(__saveTimer)clearTimeout(__saveTimer);__saveTimer=setTimeout(__saveLearnerState,400);};
  window.addEventListener('beforeunload',__saveLearnerState);
  LumioState.courses[cid]=__cd.course;
  Object.assign(LumioState.lessons||(LumioState.lessons={}),__cd.lessons);
  LumioState.learnerPreview={returnTo:''};
  LearnerUI.publishedMode=true;
  var __am=window.__LUMIO_ASSET_MAP__;
  AssetStore.resolveMediaSrc=function(src){if(!src)return'';return(__am&&__am[src])||src;};
  AssetStore.preloadBlocks=async function(){return 0;};
  AssetStore.resolveUrl=async function(src){return((__am&&__am[src])||src)||null;};
  window.navigate=function(hash){
    if(location.hash===hash){window.render();}
    else{location.hash=hash;}
    window.scrollTo(0,0);
  };
  window.render=function(){
    LumioState.courses[cid]=__cd.course;
    Object.assign(LumioState.lessons,__cd.lessons);
    var m=(location.hash||'').match(/^#\\/learner\\/[^\\/]+\\/(.+)$/);
    renderLearnerPreview(cid,m?m[1]:null);
  };
  window.addEventListener('hashchange',window.render);
})();`;

    const jsBlocks = jsSources.map((src, i) =>
      `<script>\n/* ${PUBLISH_JS_FILES[i]} */\n${src}\n<\/script>`
    ).join('\n');

    const title = escapeHtml(course.title || 'Course');
    const html = `<!DOCTYPE html>
<html lang="${escapeHtml(course.language || 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
  <div id="app"></div>
  <script>window.__LUMIO_COURSE_DATA__=${courseDataJson};<\/script>
  <script>window.__LUMIO_ASSET_MAP__=${assetMapJson};<\/script>
${jsBlocks}
  <script>${bootstrapScript}<\/script>
</body>
</html>`;

    const courseDataPretty = JSON.stringify({ course, lessons: lessonData }, null, 2);
    const safeName = (course.title || 'course').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'course';
    const zipBytes = buildZip([
      { name: 'index.html', content: html },
      { name: 'course-data.json', content: courseDataPretty },
      ...zipAssetFiles,
    ]);

    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    if (!course.publishHistory) course.publishHistory = [];
    course.publishHistory.unshift({ date: Date.now(), format: 'HTML Web Package', version: course.publishVersion || '1.0', status: 'success' });
    scheduleLumioSave();
    const assetNote = assetEntries.length > 0
      ? ` (${assetEntries.length} asset${assetEntries.length !== 1 ? 's' : ''}${savedBytes > 1024 ? `, saved ${formatFileSize(savedBytes)}` : ''})`
      : '';
    toast(`HTML package downloaded${assetNote}`, '🌐');
  } catch (err) {
    console.error('[Lumio Publish] HTML publish failed:', err);
    toast('Publish failed — see console', '❌');
    if (!course.publishHistory) course.publishHistory = [];
    course.publishHistory.unshift({ date: Date.now(), format: 'HTML Web Package', version: course.publishVersion || '1.0', status: 'failed' });
    scheduleLumioSave();
  } finally {
    if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.textContent = originalLabel; }
  }
}

function buildZip(files) {
  const enc = s => new TextEncoder().encode(s);
  const concat = (...bufs) => {
    const total = bufs.reduce((s, b) => s + b.length, 0);
    const out = new Uint8Array(total); let p = 0;
    bufs.forEach(b => { out.set(b, p); p += b.length; });
    return out;
  };
  const w16 = n => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
  const w32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };

  function crc32(buf) {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const now = new Date();
  const dosDate = ((now.getFullYear() - 1980) << 9 | (now.getMonth() + 1) << 5 | now.getDate()) >>> 0;
  const dosTime = (now.getHours() << 11 | now.getMinutes() << 5 | Math.floor(now.getSeconds() / 2)) >>> 0;

  const locals = [];
  const centralMeta = [];
  let offset = 0;

  for (const { name, content } of files) {
    const nameBytes = enc(name);
    const data = typeof content === 'string' ? enc(content) : content;
    const crc = crc32(data);
    const lh = concat(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      w16(20), w16(0), w16(0),
      w16(dosTime), w16(dosDate),
      w32(crc), w32(data.length), w32(data.length),
      w16(nameBytes.length), w16(0),
      nameBytes
    );
    centralMeta.push({ nameBytes, crc, size: data.length, offset, dosTime, dosDate });
    locals.push(lh, data);
    offset += lh.length + data.length;
  }

  const cdParts = centralMeta.map(c => concat(
    new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
    w16(20), w16(20), w16(0), w16(0),
    w16(c.dosTime), w16(c.dosDate),
    w32(c.crc), w32(c.size), w32(c.size),
    w16(c.nameBytes.length), w16(0), w16(0), w16(0), w16(0),
    w32(0), w32(c.offset),
    c.nameBytes
  ));
  const cdSize = cdParts.reduce((s, b) => s + b.length, 0);

  const eocd = concat(
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    w16(0), w16(0),
    w16(centralMeta.length), w16(centralMeta.length),
    w32(cdSize), w32(offset),
    w16(0)
  );

  return concat(...locals, ...cdParts, eocd);
}
