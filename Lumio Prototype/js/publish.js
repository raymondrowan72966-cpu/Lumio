/* ============================================================
   HTML PUBLISH ENGINE — Phase 1
   Generates a self-contained HTML web package that reuses
   the existing learner rendering pipeline without modification.
   ============================================================ */

const PUBLISH_JS_FILES = [
  'js/data.js',
  'js/blocks/families.js',
  'js/blocks/capabilities.js',
  'js/blocks/schema.js',
  'js/blocks/migration.js',
  'js/blocks/designSystem.js',
  'js/blocks/behaviourRuntime.js',
  'js/blocks/accessibilityRuntime.js',
  'js/blocks/completionEngine.js',
  'js/heroImage.js',
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
    const [css, ...jsSources] = await Promise.all([
      fetch('css/styles.css').then(r => { if (!r.ok) throw new Error('CSS fetch failed'); return r.text(); }),
      ...PUBLISH_JS_FILES.map(f => fetch(f).then(r => { if (!r.ok) throw new Error(f + ' fetch failed'); return r.text(); })),
    ]);

    // Collect all lessons and assessments belonging to this course
    const lessonData = {};
    (course.lessons || []).forEach(lid => {
      if (LumioState.lessons[lid]) lessonData[lid] = LumioState.lessons[lid];
    });
    (course.assessments || []).forEach(aid => {
      if (LumioState.lessons[aid]) lessonData[aid] = LumioState.lessons[aid];
    });

    const courseDataJson = JSON.stringify({ course, lessons: lessonData });

    // Bootstrap overrides app.js's DOMContentLoaded handler to launch learner mode instead of the Lumio app.
    // Placed after all JS is defined; window.render is resolved at call time so the override wins.
    const bootstrapScript = `(function(){
  var __cd=window.__LUMIO_COURSE_DATA__;
  var cid=__cd.course.id;
  window.loadLumioState=function(){return null;};
  window.saveLumioState=function(){};
  window.scheduleLumioSave=function(){};
  LumioState.courses[cid]=__cd.course;
  Object.assign(LumioState.lessons||(LumioState.lessons={}),__cd.lessons);
  LumioState.learnerPreview={returnTo:''};
  LearnerUI.publishedMode=true;
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
${jsBlocks}
  <script>${bootstrapScript}<\/script>
</body>
</html>`;

    const courseDataPretty = JSON.stringify({ course, lessons: lessonData }, null, 2);
    const safeName = (course.title || 'course').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'course';
    const zipBytes = buildZip([
      { name: 'index.html', content: html },
      { name: 'course-data.json', content: courseDataPretty },
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
    toast('HTML package downloaded', '🌐');
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
