/* ============================================================
   PDF EXPORT ENGINE — Sprint 8 Phase 3

   Design philosophy: the PDF is a printed version of the course —
   not a themed PDF document. Every colour decision must come from
   the resolved course styling, never from hardcoded Lumio brand
   choices. If the author changes the course theme, the PDF
   automatically matches without code changes.
   ============================================================ */

/* ── Page sizes (points) ── */
const PDF_PAGE_SIZES = {
  letter: { w: 612,    h: 792    },
  a4:     { w: 595.28, h: 841.89 },
};

/* ── Document ink colours — match CSS variables exactly ──
   title  = --ink-900: #1F1B3A  (h1-h6 colour)
   body   = --ink-700: #3A3655  (default body text)
   muted  = --ink-400: #8A8A9E  (secondary / caption text)
   subtle = slightly lighter than muted, for footer / header labels */
const INK = {
  title:  [0.122, 0.106, 0.227], // #1F1B3A  matches --ink-900
  body:   [0.227, 0.212, 0.333], // #3A3655  matches --ink-700
  muted:  [0.541, 0.541, 0.620], // #8A8A9E  matches --ink-400
  subtle: [0.650, 0.645, 0.700], // slightly lighter than muted
};

/* ── Statement panel left-stripe colours ──
   These match the iconColor in STATEMENT_DEFAULTS (lessonBuilder.js).
   The live course renders a coloured emoji icon per type; in print we
   use the same colour on the left accent stripe. Background is always
   a 6% tint of the course theme primary (same for all types in live). */
const PDF_STMT = {
  stmt_info:    { label: 'INFORMATION', stripe: [0.388, 0.400, 0.945] }, // #6366F1
  stmt_tip:     { label: 'TIP',         stripe: [0.961, 0.620, 0.043] }, // #F59E0B
  stmt_success: { label: 'SUCCESS',     stripe: [0.133, 0.773, 0.369] }, // #22C55E
  stmt_warning: { label: 'WARNING',     stripe: [0.961, 0.620, 0.043] }, // #F59E0B
  stmt_error:   { label: 'ERROR',       stripe: [0.937, 0.267, 0.267] }, // #EF4444
  stmt_note:    { label: 'NOTE',        stripe: [0.541, 0.541, 0.580] }, // #8A8A94
};

/* Convert hex → [r,g,b] 0..1 */
function _hexToRgb(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}

/* Lighten toward white by factor (0=same, 1=white) */
function _lighten(rgb, f) { return rgb.map(c => c + (1-c)*f); }

/* ── PDF binary writer ── */
function SimplePdf(pageOpts) {
  pageOpts = pageOpts || {};
  const sizeKey = pageOpts.pageSize === 'a4' ? 'a4' : 'letter';
  const portrait = pageOpts.orientation !== 'landscape';
  const base  = PDF_PAGE_SIZES[sizeKey];
  const pageW = portrait ? base.w : base.h;
  const pageH = portrait ? base.h : base.w;

  const objects = [null];
  let pages = [], currentContent = null, currentResources = null;
  let currentImageCount = 0, _headerFn = null, _footerFn = null, _pageNum = 0;

  function _alloc() { objects.push(null); return objects.length - 1; }
  function _set(id, v) { objects[id] = v; }

  function _esc(s) {
    return String(s||'')
      .replace(/[''`]/g,"'").replace(/[""]/g,'"')
      .replace(/—|―/g,'-').replace(/–/g,'-')
      .replace(/…/g,'...').replace(/©/g,'(c)').replace(/®/g,'(R)')
      .replace(/°/g,' deg').replace(/×/g,'x')
      .replace(/→/g,'->').replace(/←/g,'<-')
      .replace(/•/g,'*').replace(/✓|✔/g,'(*)').replace(/✘/g,'(x)')
      .replace(/▶/g,'>').replace(/[\\()]/g,c=>'\\'+c)
      .replace(/[^\x00-\xFF]/g,'');
  }

  function addPage() {
    currentContent = []; currentImageCount = 0;
    currentResources = { fonts:{F1:'Helvetica',F2:'Helvetica-Bold',F3:'Helvetica-Oblique'}, images:{} };
    _pageNum++;
    pages.push({ content:currentContent, resources:currentResources, pageNum:_pageNum });
  }
  function onHeader(fn){ _headerFn=fn; }
  function onFooter(fn){ _footerFn=fn; }
  function _drawHeaderFooter(){ if(_headerFn)_headerFn(_pageNum,publicApi); if(_footerFn)_footerFn(_pageNum,publicApi); }

  function text(x,y,str,opts){
    opts=opts||{};
    const font  = opts.italic?'F3':(opts.bold?'F2':'F1');
    const size  = opts.size||11;
    const color = opts.color||[0,0,0];
    currentContent.push(
      `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg `+
      `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${_esc(str)}) Tj ET`
    );
  }
  function rect(x,y,w,h,opts){
    opts=opts||{}; let cmd='';
    if(opts.fill)   cmd+=`${opts.fill[0].toFixed(3)} ${opts.fill[1].toFixed(3)} ${opts.fill[2].toFixed(3)} rg `;
    if(opts.stroke) cmd+=`${opts.stroke[0].toFixed(3)} ${opts.stroke[1].toFixed(3)} ${opts.stroke[2].toFixed(3)} RG ${(opts.lineWidth||0.5).toFixed(2)} w `;
    cmd+=`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re `;
    cmd+=(opts.fill&&opts.stroke)?'B':opts.fill?'f':'S';
    currentContent.push(cmd);
  }
  function line(x1,y1,x2,y2,opts){
    opts=opts||{};
    const color=opts.color||[0.7,0.7,0.7], lw=opts.lineWidth||0.5;
    currentContent.push(
      `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} RG `+
      `${lw.toFixed(2)} w `+
      `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
  }
  function embedJpeg(bytes,w,h){
    const id=_alloc(); _set(id,{type:'image',bytes,w,h});
    const name='Im'+(currentImageCount++);
    currentResources.images[name]=id; return name;
  }
  function drawImage(name,x,y,w,h){
    currentContent.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q`);
  }
  function serialize(meta){
    meta=meta||{};
    const catalogId=_alloc(), pagesId=_alloc();
    const fReg=_alloc(); _set(fReg,{type:'font',base:'Helvetica'});
    const fBold=_alloc(); _set(fBold,{type:'font',base:'Helvetica-Bold'});
    const fItal=_alloc(); _set(fItal,{type:'font',base:'Helvetica-Oblique'});
    const pageIds=[];
    pages.forEach(p=>{
      const cid=_alloc(); _set(cid,{type:'stream',data:p.content.join('\n')});
      const pid=_alloc(); _set(pid,{type:'page',contentId:cid,resources:p.resources,fReg,fBold,fItal});
      pageIds.push(pid);
    });
    _set(pagesId,{type:'pages',kids:pageIds,w:pageW,h:pageH});
    _set(catalogId,{type:'catalog',pagesId});
    const enc=s=>new TextEncoder().encode(s);
    const chunks=[]; let offset=0;
    const xref=new Array(objects.length).fill(0);
    function push(b){ chunks.push(b); offset+=b.length; }
    push(enc('%PDF-1.4\n'));
    for(let id=1;id<objects.length;id++){
      xref[id]=offset; const o=objects[id]; if(!o) continue;
      if(o.type==='catalog')  push(enc(`${id} 0 obj\n<< /Type /Catalog /Pages ${o.pagesId} 0 R >>\nendobj\n`));
      else if(o.type==='pages'){ const k=o.kids.map(k=>`${k} 0 R`).join(' '); push(enc(`${id} 0 obj\n<< /Type /Pages /Kids [${k}] /Count ${o.kids.length} /MediaBox [0 0 ${o.w.toFixed(2)} ${o.h.toFixed(2)}] >>\nendobj\n`)); }
      else if(o.type==='font') push(enc(`${id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${o.base} >>\nendobj\n`));
      else if(o.type==='image'){ const hdr=`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${o.w} /Height ${o.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${o.bytes.length} >>\nstream\n`; push(enc(hdr)); push(o.bytes); push(enc('\nendstream\nendobj\n')); }
      else if(o.type==='stream'){ const b=enc(o.data); push(enc(`${id} 0 obj\n<< /Length ${b.length} >>\nstream\n`)); push(b); push(enc('\nendstream\nendobj\n')); }
      else if(o.type==='page'){ const ir=Object.entries(o.resources.images).map(([n,i])=>`/${n} ${i} 0 R`).join(' '); const xo=ir?`/XObject << ${ir} >>`:''; push(enc(`${id} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /Resources << /Font << /F1 ${o.fReg} 0 R /F2 ${o.fBold} 0 R /F3 ${o.fItal} 0 R >> ${xo} >> /Contents ${o.contentId} 0 R >>\nendobj\n`)); }
    }
    const xs=offset;
    let xt=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for(let i=1;i<objects.length;i++) xt+=objects[i]?`${String(xref[i]).padStart(10,'0')} 00000 n \n`:'0000000000 00000 f \n';
    push(enc(xt));
    push(enc(`trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R /Info << /Title (${_esc(meta.title||'')}) /Producer (Lumio) /Creator (Lumio Export Engine) >> >>\nstartxref\n${xs}\n%%EOF`));
    const total=chunks.reduce((s,c)=>s+c.length,0);
    const out=new Uint8Array(total); let p=0;
    chunks.forEach(c=>{ out.set(c,p); p+=c.length; }); return out;
  }
  const publicApi={addPage,onHeader,onFooter,_drawHeaderFooter,text,rect,line,embedJpeg,drawImage,serialize,pageW,pageH};
  return publicApi;
}

/* ── Image → JPEG via canvas ── */
function _imageBlobToJpeg(blob){
  return new Promise(resolve=>{
    const img=new Image(), url=URL.createObjectURL(blob);
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const cv=document.createElement('canvas');
      cv.width=img.naturalWidth; cv.height=img.naturalHeight;
      const ctx=cv.getContext('2d');
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height); ctx.drawImage(img,0,0);
      cv.toBlob(b=>{ if(!b){resolve(null);return;} b.arrayBuffer().then(buf=>resolve({bytes:new Uint8Array(buf),w:cv.width,h:cv.height})); },'image/jpeg',0.88);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); resolve(null); };
    img.src=url;
  });
}

/* ── Strip HTML tags and decode entities ── */
function _stripHtml(s){
  return String(s||'')
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .trim();
}

/* ── Accurate Helvetica width estimate ──
   Space: 278/1000 em. Average letter: 520/1000 em.
   Using character-level estimates prevents word-spacing errors. */
function _pdfTextWidth(str, size) {
  let w = 0;
  for (const ch of str) {
    // Helvetica AFM: space=278, avg letter≈520
    w += (ch === ' ') ? 0.278 : 0.52;
  }
  return w * size;
}

/* Word-wrap a plain string to lines fitting maxWidth. */
function _wrapStr(str, size, maxWidth) {
  const text = _stripHtml(String(str||''));
  if (!text) return [''];
  const words = text.split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const word of words) {
    const test = line ? line+' '+word : word;
    if (_pdfTextWidth(test, size) > maxWidth && line) { lines.push(line); line=word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/* ── Rich text HTML parser ──
   Returns [{text, bold, italic, color}].
   - Block-level tags become \n breaks.
   - <span style="color:#hex"> preserves author-applied inline colours.
   - Post-processes: inserts \n between adjacent spans where a span ends
     with sentence punctuation and the next starts with a digit (numbered
     list pattern — common in Lumio rich text).
   color is null (use context default) or [r,g,b] 0..1 for author colours. */
function _parseRichText(html) {
  if (!html) return [{text:'',bold:false,italic:false,color:null}];
  let h = String(html)
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/p>/gi,'\n').replace(/<\/div>/gi,'\n')
    .replace(/<\/li>/gi,'\n').replace(/<\/h[1-6]>/gi,'\n');

  const raw = [];
  let bold=false, italic=false;
  // Color stack: each <span style="color:..."> pushes a color (or null),
  // </span> pops. currentColor is the top of the stack.
  const colorStack = [];
  let currentColor = null;

  const re=/<([^>]+)>|([^<]+)/g; let m;
  while((m=re.exec(h))!==null){
    if(m[2]!==undefined){
      const txt=m[2].replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
      if(txt) raw.push({text:txt,bold,italic,color:currentColor});
    } else {
      const full=m[1]; // full tag body (no < >)
      const tag=full.split(/[\s/]/)[0].toLowerCase();
      if(tag==='b'||tag==='strong') bold=true;
      else if(tag==='/b'||tag==='/strong') bold=false;
      else if(tag==='em'||tag==='i') italic=true;
      else if(tag==='/em'||tag==='/i') italic=false;
      else if(tag==='span'){
        // Extract color from style="...color:#HEX..." or style="...color:rgb(...)..."
        const styleMatch=full.match(/style\s*=\s*["']([^"']*)["']/i);
        let spanColor=null;
        if(styleMatch){
          const colorVal=styleMatch[1].match(/(?:^|;)\s*color\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]+\))/i);
          if(colorVal){
            const cv=colorVal[1].trim();
            if(cv.startsWith('#')){
              // Normalise 3-digit hex to 6-digit
              const h6=cv.length===4?`#${cv[1]}${cv[1]}${cv[2]}${cv[2]}${cv[3]}${cv[3]}`:cv.slice(0,7);
              spanColor=_hexToRgb(h6);
            }
            // rgb() form: extract r,g,b
            else{
              const rgba=cv.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
              if(rgba) spanColor=[+rgba[1]/255,+rgba[2]/255,+rgba[3]/255];
            }
          }
        }
        colorStack.push(spanColor);
        currentColor=spanColor;
      }
      else if(tag==='/span'){
        colorStack.pop();
        currentColor=colorStack.length?colorStack[colorStack.length-1]:null;
      }
    }
  }
  if(!raw.length) return [{text:'',bold:false,italic:false,color:null}];

  // Post-process: insert \n between runs where first ends with sentence
  // punctuation and second begins with a digit (numbered list pattern).
  const runs = [raw[0]];
  for(let i=1;i<raw.length;i++){
    const prev=raw[i-1], curr=raw[i];
    if(prev.text && curr.text &&
       /[.!?]$/.test(prev.text.trimEnd()) &&
       /^\d/.test(curr.text.trimStart())){
      runs.push({text:'\n',bold:false,italic:false,color:null});
    }
    runs.push(curr);
  }
  return runs;
}

/* Wrap rich-text runs to lines fitting maxWidth.
   Returns [{lineRuns:[{text,bold,italic,color}]}] — color is null or [r,g,b]. */
function _wrapRuns(runs, size, maxWidth) {
  const out = [];
  const flat = [];
  for(const run of runs){
    const parts=run.text.split('\n');
    parts.forEach((p,i)=>{
      flat.push({text:p,bold:run.bold,italic:run.italic,color:run.color||null});
      if(i<parts.length-1) flat.push({isBreak:true});
    });
  }
  const paras=[]; let cur=[];
  for(const r of flat){ if(r.isBreak){paras.push(cur);cur=[];}else if(r.text!==undefined)cur.push(r); }
  if(cur.length) paras.push(cur);

  for(const para of paras){
    if(!para.length||!para.some(r=>r.text.trim())){ out.push({lineRuns:[{text:'',bold:false,italic:false,color:null}]}); continue; }
    let lineRuns=[], lineW=0;
    for(const run of para){
      if(!run.text) continue;
      const words=run.text.split(/(\s+)/);
      for(const word of words){
        const isSpace=/^\s+$/.test(word);
        const ww=_pdfTextWidth(word,size);
        if(!isSpace && lineW+ww>maxWidth && lineRuns.length){ out.push({lineRuns}); lineRuns=[]; lineW=0; }
        if(word){ lineRuns.push({text:word,bold:run.bold,italic:run.italic,color:run.color||null}); lineW+=ww; }
      }
    }
    if(lineRuns.length) out.push({lineRuns});
  }
  return out.length ? out : [{lineRuns:[{text:'',bold:false,italic:false,color:null}]}];
}

/* Try to detect numbered list content ("1. Item 2. Item...") and return
   array of plain item strings, or null if not a numbered list. */
function _parseNumberedList(html) {
  const plain = _stripHtml(html).replace(/\s+/g,' ').trim();
  if(!/^\d+\./.test(plain)) return null;
  // Split on digit-dot boundaries (no preceding space needed)
  const parts = plain.split(/(?=\d+\.)/).filter(s=>s.trim());
  if(parts.length < 2) return null;
  return parts.map(s => s.replace(/^\d+\.\s*/,'').trim()).filter(Boolean);
}

/* ══════════════════════════════════════════════════════════════
   LAYOUT ENGINE
   ══════════════════════════════════════════════════════════════ */
async function renderCoursePdf(course, lessonData, assetEntries, opts) {
  opts = opts || {};
  const pageSize    = opts.pageSize    || 'letter';
  const orientation = opts.orientation || 'portrait';
  const profile     = opts.profile     || 'learner';
  const incAnswers  = opts.includeAnswers !== false;

  // Accent colour from the course's themeDesign.primary (hex).
  // This is exactly the value applied as --theme-primary in the live course.
  // Falls back to the default preset primary if themeDesign is absent.
  const primaryHex  = (course.themeDesign && course.themeDesign.primary) || '#7C3AED';
  const accentColor = _hexToRgb(primaryHex);

  const pdf        = SimplePdf({pageSize,orientation});
  const margin     = 56;
  const headerH    = 28;
  const footerH    = 26;
  const contentTop    = pdf.pageH - margin - headerH;
  const contentBottom = margin + footerH;
  const contentW   = pdf.pageW - margin * 2;
  const courseTitle = _stripHtml(course.title || 'Course');

  // Pre-convert images to JPEG
  const jpegCache = {};
  for(const a of (assetEntries||[])){
    if(!a.mimeType||!a.mimeType.startsWith('image/')) continue;
    try{ const j=await _imageBlobToJpeg(a.blob); if(j) jpegCache[a.id]=j; }catch(e){}
  }

  /* ── Per-page header / footer ── */
  pdf.onHeader((n,p)=>{
    if(n===1) return;
    const ly=pdf.pageH-margin-headerH+6;
    p.line(margin,ly,pdf.pageW-margin,ly,{color:[0.86,0.86,0.88],lineWidth:0.4});
    p.text(margin,ly+6,courseTitle,{size:8,color:INK.subtle});
  });
  pdf.onFooter((n,p)=>{
    if(n===1) return;
    const ly=margin+footerH-6;
    p.line(margin,ly,pdf.pageW-margin,ly,{color:[0.86,0.86,0.88],lineWidth:0.4});
    p.text(margin,margin+8,`Generated ${new Date().toLocaleDateString()}`,{size:8,color:INK.subtle});
    p.text(pdf.pageW-margin-50,margin+8,`Page ${n}`,{size:8,color:INK.subtle});
  });

  let cursorY = contentTop;
  function newPage(){ pdf.addPage(); pdf._drawHeaderFooter(); cursorY=contentTop; }
  function ensureSpace(h){ if(cursorY-h < contentBottom) newPage(); }
  function blockGap(extra){ cursorY -= 12+(extra||0); }

  /* ── Heading ──
     color defaults to dark navy (INK.title), NOT the accent colour.
     Accent is passed explicitly only for cover/TOC/section breaks. */
  function drawHeading(str, o) {
    o = o||{};
    const size  = o.size  || 16;
    const color = o.color || INK.title;  // dark navy by default
    const txt   = _stripHtml(String(str||''));
    if(!txt.trim()) return;
    const lines = _wrapStr(txt, size, contentW-(o.indent||0));
    ensureSpace((size+6)*lines.length + 16); // keep with following content
    if(o.rule){
      const bh = (size+6)*lines.length+10;
      pdf.rect(margin, cursorY-bh+4, contentW, bh, {fill:_lighten(accentColor,0.93)});
    }
    for(const ln of lines){ cursorY-=size+6; pdf.text(margin+(o.indent||0),cursorY,ln,{size,bold:true,color}); }
    cursorY-=4;
  }

  /* ── Plain paragraph ── */
  function drawParagraph(str, o) {
    o=o||{};
    const size   = o.size   || 11;
    const color  = o.color  || INK.body;
    const indent = o.indent || 0;
    const lines  = _wrapStr(String(str||''), size, contentW-indent);
    for(const ln of lines){
      if(!ln && lines.length===1) break;
      ensureSpace(size+5); cursorY-=size+4;
      if(ln) pdf.text(margin+indent,cursorY,ln,{size,color,bold:o.bold,italic:o.italic});
    }
    cursorY-=2;
  }

  /* ── Rich text with inline bold/italic/colour ──
     Merges consecutive same-style+same-colour runs into single Tj ops so the
     PDF viewer uses real glyph advances (eliminates artificial word gaps).
     Per-run `color` (from <span style="color:...">) overrides the block default,
     preserving author-applied inline colours exactly as in the live course. */
  function drawRichText(html, o) {
    o=o||{};
    const size   = o.size   || 11;
    const color  = o.color  || INK.body;
    const indent = o.indent || 0;
    const maxW   = contentW-indent;
    if(!html || !_stripHtml(html)) return;
    const runs   = _parseRichText(html);
    const lines  = _wrapRuns(runs, size, maxW);
    for(const {lineRuns} of lines){
      const combined = lineRuns.map(r=>r.text).join('');
      if(!combined.trim()){ cursorY-=(size+2); continue; }
      ensureSpace(size+5); cursorY-=size+4;

      // Merge adjacent runs that share bold, italic, AND colour into a single
      // string → single Tj. Two runs with null color are same-colour; one null
      // and one explicit are different (the explicit one overrides the default).
      const merged=[];
      for(const run of lineRuns){
        const last=merged[merged.length-1];
        const sameColor = last && (
          (last.color===null && run.color===null) ||
          (last.color&&run.color && last.color[0]===run.color[0] && last.color[1]===run.color[1] && last.color[2]===run.color[2])
        );
        if(last && last.bold===run.bold && last.italic===run.italic && sameColor){
          last.text+=run.text;
        } else {
          merged.push({text:run.text,bold:run.bold,italic:run.italic,color:run.color});
        }
      }
      // Strip leading whitespace from the first token
      if(merged.length) merged[0]={...merged[0],text:merged[0].text.trimStart()};

      let x=margin+indent;
      for(const run of merged){
        if(!run.text) continue;
        // Use author-applied inline colour if present, otherwise block default
        const runColor = run.color || color;
        pdf.text(x,cursorY,run.text,{size,bold:run.bold,italic:run.italic,color:runColor});
        x+=_pdfTextWidth(run.text,size);
      }
    }
    cursorY-=3;
  }

  /* ── Divider ── */
  function drawDivider(color){
    ensureSpace(18); cursorY-=8;
    pdf.line(margin,cursorY,pdf.pageW-margin,cursorY,{color:color||[0.82,0.82,0.86],lineWidth:0.75});
    cursorY-=8;
  }

  /* ── Image block (centred, proportional) ── */
  async function drawImageBlock(assetRef, maxW, maxH, caption){
    if(!assetRef) return;
    const j=jpegCache[assetRef]; if(!j) return;
    const scale=Math.min(maxW/j.w,(maxH||320)/j.h,1);
    const w=j.w*scale, h=j.h*scale;
    ensureSpace(h+(caption?26:12));
    cursorY-=h;
    const xOff=margin+(contentW-w)/2; // centred
    const name=pdf.embedJpeg(j.bytes,j.w,j.h);
    pdf.drawImage(name,xOff,cursorY,w,h);
    cursorY-=8;
    if(caption) drawParagraph(caption,{size:9,color:INK.subtle,italic:true});
  }

  /* ── Media placeholder pill ── */
  function drawMediaLabel(type, title){
    ensureSpace(22); cursorY-=6;
    const pw=Math.min(_pdfTextWidth(type,8)+16,90);
    pdf.rect(margin,cursorY-13,pw,16,{fill:_lighten(accentColor,0.88)});
    pdf.text(margin+5,cursorY,type,{size:8,bold:true,color:accentColor});
    if(title){
      const t=_stripHtml(title).substring(0,60);
      pdf.text(margin+pw+6,cursorY,t,{size:10,color:INK.muted});
    }
    cursorY-=16;
  }

  /* ── Statement information panel ──
     Background rect ALWAYS drawn FIRST so text appears on top (PDF paint
     order). Height pre-calculated from content so background fits exactly.

     Colour fidelity rules (matching the live course exactly):
     - Background: 6% tint of the course theme primary, same for ALL types.
       Live course: color-mix(in srgb, var(--theme-primary) 6%, white)
     - Left accent stripe: type-specific icon colour (STATEMENT_DEFAULTS
       in lessonBuilder.js) — the closest print equivalent to the emoji icon.
     - Border: only rendered if block.design?.borderOn is true (live default = none). */
  function drawStatementPanel(block) {
    const d   = block.data||{};
    const ds  = block.design||{};
    const def = PDF_STMT[block.type]||PDF_STMT.stmt_note;
    // title uses d.title (live) not d.heading; body uses d.text (live) not d.body
    const body  = _stripHtml(d.body||d.text||'');
    const title = _stripHtml(d.title||'');
    if(!body&&!title) return;

    const iW      = contentW-16;
    const labelH  = 18;
    const titleH  = title ? _wrapStr(title,11,iW).length*16+4 : 0;
    const bodyH   = body  ? _wrapStr(body,10,iW).length*14+4  : 0;
    const totalH  = labelH+titleH+bodyH+20;

    ensureSpace(totalH+8);
    const topY=cursorY; cursorY-=4;

    // Background: 6% theme primary tint (matches live course default)
    const panelBg = _lighten(accentColor, 0.94);
    pdf.rect(margin,topY-totalH,contentW,totalH,{fill:panelBg});
    // Border: only if author explicitly enabled it
    if(ds.borderOn) pdf.rect(margin,topY-totalH,contentW,totalH,{stroke:_lighten(def.stripe,0.55),lineWidth:0.6});
    // Left accent stripe using type-specific colour
    pdf.rect(margin,topY-totalH,4,totalH,{fill:def.stripe});
    // Label text (drawn after background — visible)
    cursorY-=4;
    pdf.text(margin+12,cursorY,def.label,{size:8,bold:true,color:def.stripe});
    cursorY-=labelH;
    // Content
    if(title) drawParagraph(title,{size:11,bold:true,color:INK.title,indent:8});
    if(body)  drawParagraph(body, {size:10,color:INK.body,indent:8});

    if(cursorY>topY-totalH) cursorY=topY-totalH;
    cursorY-=6;
  }

  /* ── Bordered card — background drawn FIRST ── */
  function beginCard(estH, fill, stroke) {
    ensureSpace(estH+12); cursorY-=4;
    const topY=cursorY;
    pdf.rect(margin,topY-estH,contentW,estH,{fill,stroke:stroke||_lighten(accentColor,0.65),lineWidth:0.4});
    return {topY,estH};
  }
  function endCard(card){
    if(cursorY>card.topY-card.estH) cursorY=card.topY-card.estH;
    cursorY-=8;
  }

  /* ════════════════════════════════════════════
     BLOCK RENDERER
     ════════════════════════════════════════════ */
  async function renderBlock(block) {
    const d=block.data||{};

    switch(block.type){

      /* ── Rich text blocks ── */
      case 'heading':
      case 'heading_paragraph': {
        const htxt = _stripHtml(d.heading||'');
        if(htxt) drawHeading(htxt,{size:15});
        if(d.body) drawRichText(d.body);
        blockGap(); return;
      }
      case 'paragraph':
        drawRichText(d.body||d.text||'');
        blockGap(); return;

      /* ── Images ── */
      case 'image':
        await drawImageBlock(d.src||d.image, contentW, 340, d.caption);
        blockGap(); return;

      case 'image_text':
      case 'text_image': {
        const htxt=_stripHtml(d.heading||'');
        if(htxt) drawHeading(htxt,{size:13});
        // Both d.image and d.src are used across blocks
        await drawImageBlock(d.image||d.src, contentW, 280);
        if(d.body) drawRichText(d.body);
        if(d.caption) drawParagraph(d.caption,{size:9,color:INK.subtle,italic:true});
        blockGap(); return;
      }

      /* ── Text on image (text overlay block) ── */
      case 'text_on_image': {
        const htxt=_stripHtml(d.heading||'');
        if(htxt) drawHeading(htxt,{size:13});
        await drawImageBlock(d.src||d.image, contentW, 280);
        // Body text was over the image — render below it in print (ignore white colour inline styles)
        if(d.body){
          // Strip colour spans (white text was for image overlay — use body colour instead)
          const cleanBody=String(d.body||'').replace(/color\s*:\s*#[0-9a-f]{3,6}/gi,'');
          drawRichText(cleanBody,{color:INK.body});
        }
        blockGap(); return;
      }

      /* ── Statement panels ── */
      case 'stmt_info': case 'stmt_tip': case 'stmt_success':
      case 'stmt_warning': case 'stmt_error': case 'stmt_note':
        drawStatementPanel(block);
        blockGap(); return;

      /* ── Lists ── */
      case 'list_numbered':
      case 'list_bullet':
      case 'list_checkbox': {
        const def2  = (typeof LIST_DEFAULTS!=='undefined'&&LIST_DEFAULTS[block.type])||{};
        const items = (typeof normalizeListItems==='function') ? normalizeListItems(d,def2.items||[]) : (d.items||[]);
        const htxt  = _stripHtml(d.heading||def2.heading||'');
        if(htxt) drawHeading(htxt,{size:13});
        items.forEach((item,i)=>{
          const raw   = typeof item==='string' ? item : (item.text||'');
          const txt   = _stripHtml(raw).replace(/^[\s ]+/,''); // strip leading &nbsp;
          if(!txt) return;
          const bullet= block.type==='list_numbered'?`${i+1}.`:block.type==='list_checkbox'?'[ ]':'•';
          const linesT= _wrapStr(txt,10,contentW-28);
          ensureSpace(16); cursorY-=15;
          pdf.text(margin+8,cursorY,bullet,{size:10,bold:block.type==='list_numbered',color:accentColor});
          pdf.text(margin+24,cursorY,linesT[0]||'',{size:10,color:INK.body});
          for(let li=1;li<linesT.length;li++){ cursorY-=14; pdf.text(margin+24,cursorY,linesT[li],{size:10,color:INK.body}); }
        });
        blockGap(); return;
      }

      /* ── Table ── */
      case 'table': {
        const rows=d.rows||[]; const cols=rows[0]?rows[0].length:0;
        if(!rows.length||!cols) return;
        const colW=contentW/cols; const rowH=20;
        for(let ri=0;ri<rows.length;ri++){
          const row=rows[ri]; const isH=ri===0;
          ensureSpace(rowH+4);
          // Background first (so text renders on top)
          if(isH) pdf.rect(margin,cursorY-rowH,contentW,rowH,{fill:accentColor});
          else if(ri%2===0) pdf.rect(margin,cursorY-rowH,contentW,rowH,{fill:_lighten(accentColor,0.95)});
          // Cell text after background
          for(let ci=0;ci<Math.min(row.length,cols);ci++){
            const cx=margin+ci*colW;
            const ct=_stripHtml(String(row[ci]||''));
            const maxC=Math.max(8,Math.floor(colW/(11*0.52)));
            const disp=ct.length>maxC?ct.substring(0,maxC-1)+'…':ct;
            pdf.text(cx+5,cursorY-rowH+7,disp,{size:9,bold:isH,color:isH?[1,1,1]:INK.body});
          }
          // Column dividers
          for(let ci=1;ci<cols;ci++){
            const lx=margin+ci*colW;
            pdf.line(lx,cursorY-rowH,lx,cursorY,{color:isH?[1,1,1]:[0.84,0.84,0.90],lineWidth:0.3});
          }
          cursorY-=rowH;
        }
        pdf.rect(margin,cursorY,contentW,rows.length*rowH,{stroke:[0.72,0.72,0.82],lineWidth:0.5});
        blockGap(); return;
      }

      /* ── Quotes ── */
      case 'quote1': case 'quote2': case 'quote3': case 'quote4': {
        const txt  = _stripHtml(d.quote||d.text||'');
        const auth = _stripHtml(d.author||d.attribution||'');
        if(!txt){ blockGap(); return; }
        const qLines=_wrapStr(txt,12,contentW-32);
        const estH=20+qLines.length*17+(auth?18:0)+16;
        const card=beginCard(estH,_lighten(accentColor,0.95));
        cursorY-=8;
        pdf.text(margin+10,cursorY,'"',{size:22,bold:true,color:_lighten(accentColor,0.45)});
        cursorY-=8;
        qLines.forEach(ln=>{ cursorY-=17; pdf.text(margin+24,cursorY,ln,{size:12,italic:true,color:INK.title}); });
        if(auth){ cursorY-=6; pdf.text(margin+24,cursorY,`— ${auth}`,{size:10,color:INK.muted}); }
        endCard(card); blockGap(); return;
      }
      case 'quote_image': {
        const txt=_stripHtml(d.quote||d.text||'');
        const auth=_stripHtml(d.author||d.attribution||'');
        if(d.image) await drawImageBlock(d.image,80,80);
        if(txt) drawRichText(`“${txt}”`,{size:12,italic:true});
        if(auth) drawParagraph(`— ${auth}`,{size:10,color:INK.muted});
        blockGap(); return;
      }
      case 'quote_carousel': {
        const qs=(typeof normalizeQuoteItems==='function')?normalizeQuoteItems(d):(d.quotes||[]);
        for(const q of qs){
          const qt=_stripHtml(q.text||'');
          const ql=_wrapStr(qt,12,contentW-28);
          const estH=20+ql.length*17+(q.author?18:0)+12;
          const card=beginCard(estH,_lighten(accentColor,0.95));
          cursorY-=8;
          ql.forEach(ln=>{ cursorY-=17; pdf.text(margin+10,cursorY,`“${ln}”`,{size:12,italic:true,color:INK.title}); });
          if(q.author){ cursorY-=6; pdf.text(margin+10,cursorY,`— ${_stripHtml(q.author)}`,{size:10,color:INK.muted}); }
          endCard(card);
        }
        blockGap(); return;
      }

      /* ── Gallery ── */
      case 'gallery': case 'image_gallery': {
        const slides=(typeof normalizeCarouselItems==='function')?normalizeCarouselItems(d):(d.items||[]);
        if(_stripHtml(d.heading||'')) drawHeading(d.heading,{size:13});
        for(const s of slides){
          await drawImageBlock(s.src||s.image,contentW,240,_stripHtml(s.caption||s.description||''));
        }
        blockGap(); return;
      }

      /* ── Multimedia ── */
      case 'video': case 'multimedia':
        drawMediaLabel('VIDEO',_stripHtml(d.title||d.heading||''));
        if(d.body) drawRichText(d.body,{size:10});
        blockGap(); return;
      case 'audio':
        drawMediaLabel('AUDIO',_stripHtml(d.title||d.heading||''));
        if(d.body) drawRichText(d.body,{size:10});
        blockGap(); return;
      case 'file': {
        const fn=_stripHtml(d.fileName||d.fileFileName||d.label||'');
        drawMediaLabel('FILE',fn);
        if(d.caption) drawParagraph(d.caption,{size:10});
        blockGap(); return;
      }

      /* ── Carousel — all slides as sequential content ── */
      case 'carousel': {
        const items=(typeof normalizeCarouselItems==='function')?normalizeCarouselItems(d):(d.items||[]);
        for(const [i,item] of items.entries()){
          if(item.title) drawHeading(item.title,{size:12});
          if(item.src||item.image) await drawImageBlock(item.src||item.image,contentW,220);
          if(item.description) drawRichText(item.description);
          if(i<items.length-1) drawDivider(_lighten(accentColor,0.82));
        }
        blockGap(); return;
      }

      /* ── Column grid ── */
      case 'column_grid': {
        const items=(typeof normalizeColumnGridItems==='function')?normalizeColumnGridItems(d):(d.items||[]);
        for(const item of items){
          if(item.title) drawHeading(item.title,{size:12});
          if(item.imageUrl) await drawImageBlock(item.imageUrl,contentW,200);
          if(item.description) drawRichText(item.description);
        }
        blockGap(); return;
      }

      /* ── Accordion — expanded learning content ──
         Renders as a series of titled sections with content.
         No accordion widget framing — pure printable content. */
      case 'accordion': {
        const items=(typeof normalizeItemList==='function')?normalizeItemList(d,'items',()=>[]):(d.items||[]);
        const htxt=_stripHtml(d.heading||'');
        if(htxt) drawHeading(htxt,{size:14});
        for(const item of items){
          const title=_stripHtml(item.title||'');
          if(title){
            // Section heading: bold, dark navy, with subtle left accent rule
            ensureSpace(22);
            cursorY-=6;
            pdf.rect(margin,cursorY-16,3,18,{fill:accentColor});
            pdf.text(margin+10,cursorY-3,title,{size:12,bold:true,color:INK.title});
            cursorY-=22;
          }
          // Body: data uses 'content' key (confirmed from live data audit)
          const bodyHtml=item.body||item.content||'';
          if(bodyHtml) drawRichText(bodyHtml,{indent:6});
          if(item.image) await drawImageBlock(item.image,contentW-10,220);
          if(item.video) drawMediaLabel('VIDEO',item.videoTitle);
          if(item.audio) drawMediaLabel('AUDIO',item.audioTitle);
          cursorY-=6;
        }
        blockGap(); return;
      }

      /* ── Tabs — all tabs shown sequentially ── */
      case 'tabs': {
        const items=(typeof normalizeItemList==='function')?normalizeItemList(d,'items',()=>[]):(d.items||[]);
        const htxt=_stripHtml(d.heading||'');
        if(htxt) drawHeading(htxt,{size:14});
        for(const [i,item] of items.entries()){
          const title=_stripHtml(item.title||'');
          if(title){
            ensureSpace(22); cursorY-=6;
            const tw=Math.min(_pdfTextWidth(title,10)+24,220);
            pdf.rect(margin,cursorY-16,tw,18,{fill:accentColor});
            pdf.text(margin+8,cursorY-3,title,{size:10,bold:true,color:[1,1,1]});
            cursorY-=24;
          }
          const bodyStart=cursorY;
          const bodyHtml=item.body||item.content||'';
          if(bodyHtml) drawRichText(bodyHtml,{indent:8});
          if(item.image) await drawImageBlock(item.image,contentW-12,200);
          pdf.line(margin+1,cursorY,margin+1,bodyStart,{color:accentColor,lineWidth:1.5});
          if(i<items.length-1) cursorY-=8;
        }
        blockGap(); return;
      }

      /* ── Process — numbered steps ── */
      case 'process': {
        const items=(typeof normalizeItemList==='function')?normalizeItemList(d,'items',()=>[]):(d.items||[]);
        const htxt=_stripHtml(d.heading||'');
        if(htxt) drawHeading(htxt,{size:14});
        for(const [i,item] of items.entries()){
          const title=_stripHtml(item.title||'');
          ensureSpace(30); cursorY-=8;
          pdf.rect(margin,cursorY-20,22,22,{fill:accentColor});
          pdf.text(margin+5,cursorY-6,String(i+1),{size:11,bold:true,color:[1,1,1]});
          if(title) pdf.text(margin+28,cursorY-4,title,{size:12,bold:true,color:INK.title});
          cursorY-=26;
          const bodyHtml=item.body||item.content||'';
          if(bodyHtml) drawRichText(bodyHtml,{indent:28});
          if(item.image) await drawImageBlock(item.image,contentW-32,180);
          if(item.video) drawMediaLabel('VIDEO');
          if(item.audio) drawMediaLabel('AUDIO');
          cursorY-=4;
        }
        blockGap(); return;
      }

      /* ── Labelled Graphic — image with numbered callouts ── */
      case 'labelled_graphic': {
        const hs=(typeof normalizeItemList==='function')?normalizeItemList(d,'hotspots',()=>[]):(d.hotspots||d.items||[]);
        if(_stripHtml(d.heading||'')) drawHeading(d.heading,{size:13});
        if(d.image) await drawImageBlock(d.image,contentW,300);
        if(hs.length){
          cursorY-=4;
          hs.forEach((h,i)=>{
            const t=_stripHtml(h.title||h.label||'');
            ensureSpace(22); cursorY-=4;
            pdf.rect(margin+6,cursorY-14,18,16,{fill:accentColor});
            pdf.text(margin+9,cursorY-3,String(i+1),{size:9,bold:true,color:[1,1,1]});
            if(t) pdf.text(margin+28,cursorY-1,t,{size:11,bold:true,color:INK.title});
            cursorY-=18;
            const b=h.body||h.content||'';
            if(b) drawRichText(b,{size:10,indent:28});
          });
        }
        blockGap(); return;
      }

      /* ── Flashcards — professional learning content ──
         Design philosophy: render the LEARNING EXPERIENCE, not the card widget.
         - Front image (the visual hook) shown full-width
         - Back content (the learning) shown as clean text or bulleted list
         - No "Card N", "FRONT", "BACK" labels
         - Cards separated by subtle dividers, not box borders */
      case 'flashcard_grid':
      case 'flashcard_stack': {
        const items=(typeof normalizeFlashcardItems==='function')?normalizeFlashcardItems(d):(d.items||[]);
        const htxt=_stripHtml(d.heading||'');
        if(htxt) drawHeading(htxt,{size:14});

        for(const [i,card] of items.entries()){
          const front=card.front||{};
          const back =card.back ||{};

          // Front image (the visual/stimulus)
          if(front.image) await drawImageBlock(front.image,contentW,200);

          // Front text — only if it contains actual content (not just <br>)
          const frontTxt=_stripHtml(front.text||'');
          if(frontTxt) drawRichText(front.text,{size:12,bold:true});

          // Back content — the learning
          const backHtml=back.text||'';
          const backPlain=_stripHtml(backHtml).replace(/\s+/g,' ').trim();
          if(backPlain){
            // Detect numbered list pattern ("1. Item 2. Item...")
            const listItems=_parseNumberedList(backHtml);
            if(listItems && listItems.length>1){
              // Render as clean bullet list — bullets in body colour (no accent),
              // matching flashcard back content which uses plain dark text in live course
              listItems.forEach(item=>{
                const lns=_wrapStr(item,10,contentW-24);
                ensureSpace(16); cursorY-=15;
                pdf.text(margin+8,cursorY,'•',{size:10,color:INK.body});
                pdf.text(margin+20,cursorY,lns[0]||'',{size:10,color:INK.body});
                for(let li=1;li<lns.length;li++){ cursorY-=14; pdf.text(margin+20,cursorY,lns[li],{size:10,color:INK.body}); }
              });
            } else {
              drawRichText(backHtml,{size:10});
            }
          }
          if(back.image) await drawImageBlock(back.image,contentW,160);

          // Divider between cards (not after last)
          if(i<items.length-1){
            cursorY-=4;
            drawDivider(_lighten(accentColor,0.82));
          }
        }
        blockGap(); return;
      }

      /* ── Scenario ── */
      case 'scenario': {
        const scenes=(typeof normalizeItemList==='function')?normalizeItemList(d,'scenes',()=>[]):(d.scenes||[]);
        const htxt=_stripHtml(d.heading||d.title||'');
        if(htxt) drawHeading(htxt,{size:14});
        for(const [i,scene] of scenes.entries()){
          const t=_stripHtml(scene.title||'');
          if(t) drawHeading(t,{size:12});
          if(scene.backgroundImage) await drawImageBlock(scene.backgroundImage,contentW,160);
          if(scene.characterName) drawParagraph(_stripHtml(scene.characterName),{bold:true,size:11,color:accentColor});
          if(scene.dialogue) drawRichText(scene.dialogue,{indent:10});
          if(scene.choices&&scene.choices.length){
            cursorY-=4;
            scene.choices.forEach(c=>drawParagraph(`> ${_stripHtml(c.text||'')}`,{size:10,indent:18,color:INK.muted}));
          }
          cursorY-=4;
        }
        blockGap(); return;
      }

      /* ── Knowledge Checks ── */
      case 'kc_multiple_choice':
      case 'kc_multiple_response': {
        const kOpts=(typeof normalizeKcOptions==='function')?normalizeKcOptions(d):(d.options||[]);
        const correct=Array.isArray(d.correct)?d.correct:(d.correct!=null?[d.correct]:[0]);
        drawStatementPanel({type:'stmt_info',data:{text:'Knowledge Check'}});
        if(d.question) drawRichText(d.question,{size:11,bold:true});
        cursorY-=2;
        kOpts.forEach((o,i)=>{
          const isC=correct.includes(i);
          const marker=incAnswers?(isC?'(*)':'( )'):' ';
          const col=(incAnswers&&isC)?[0.06,0.50,0.20]:INK.body;
          const txt=_stripHtml(String(o||''));
          const lns=_wrapStr(txt,10,contentW-34);
          ensureSpace(18); cursorY-=15;
          pdf.text(margin+10,cursorY,marker,{size:10,bold:incAnswers&&isC,color:col});
          pdf.text(margin+30,cursorY,lns[0]||'',{size:10,color:col});
          for(let li=1;li<lns.length;li++){ cursorY-=14; pdf.text(margin+30,cursorY,lns[li],{size:10,color:col}); }
        });
        if(d.feedback&&incAnswers){ cursorY-=4; drawParagraph(`Explanation: ${_stripHtml(d.feedback)}`,{size:9,italic:true,indent:10,color:INK.muted}); }
        blockGap(4); return;
      }
      case 'kc_fill_gap': {
        drawStatementPanel({type:'stmt_info',data:{text:'Fill the Gap'}});
        const gapped  =_stripHtml(d.text||'').replace(/\{\{.*?\}\}/g,'_____');
        const answered=_stripHtml(d.text||'').replace(/\{\{(.*?)\}\}/g,'[$1]');
        drawParagraph(gapped,{size:11});
        if(incAnswers) drawParagraph(`Answer: ${answered}`,{size:10,italic:true,color:[0.06,0.50,0.20]});
        blockGap(4); return;
      }
      case 'kc_matching': {
        const pairs=d.pairs||[];
        drawStatementPanel({type:'stmt_info',data:{text:'Matching Activity'}});
        if(d.question) drawRichText(d.question,{size:11,bold:true});
        pairs.forEach((p,i)=>{
          const l=_stripHtml(p.left||p.prompt||'');
          const r=_stripHtml(p.right||p.response||'');
          drawParagraph(incAnswers?`${i+1}.  ${l}   ->   ${r}`:`${i+1}.  ${l}`,{size:10,indent:10});
        });
        blockGap(4); return;
      }
      case 'kc_ordering': {
        const its=d.items||[];
        drawStatementPanel({type:'stmt_info',data:{text:'Ordering Activity'}});
        if(d.question) drawRichText(d.question,{size:11,bold:true});
        its.forEach((it,i)=>{
          const t=_stripHtml(typeof it==='string'?it:(it.text||''));
          drawParagraph(incAnswers?`${i+1}.  ${t}`:`___.  ${t}`,{size:10,indent:10});
        });
        blockGap(4); return;
      }

      /* ── Charts ── */
      case 'chart_bar': case 'chart_line': case 'chart_pie': {
        const ct=_stripHtml(d.title||'');
        if(ct) drawHeading(ct,{size:13});
        const ci=d.items||[];
        if(ci.length){
          ensureSpace(22);
          pdf.rect(margin,cursorY-20,contentW,20,{fill:accentColor});
          pdf.text(margin+6,cursorY-7,'Label',{size:9,bold:true,color:[1,1,1]});
          pdf.text(margin+contentW*0.65+6,cursorY-7,'Value',{size:9,bold:true,color:[1,1,1]});
          cursorY-=20;
          ci.forEach((it,ri)=>{
            ensureSpace(18);
            if(ri%2===0) pdf.rect(margin,cursorY-16,contentW,16,{fill:_lighten(accentColor,0.95)});
            pdf.text(margin+6,cursorY-5,_stripHtml(String(it.label||'')).substring(0,40),{size:9,color:INK.body});
            pdf.text(margin+contentW*0.65+6,cursorY-5,String(it.value??''),{size:9,color:INK.body});
            cursorY-=16;
          });
          pdf.rect(margin,cursorY,contentW,(ci.length+1)*20,{stroke:[0.72,0.72,0.82],lineWidth:0.4});
        }
        blockGap(); return;
      }

      /* ── Button ── */
      case 'button': {
        const lbl=_stripHtml(d.label||d.text||'');
        const url=d.url||'';
        if(!lbl){ blockGap(); return; }
        ensureSpace(28); cursorY-=8;
        const bw=Math.min(_pdfTextWidth(lbl,11)+28,200);
        pdf.rect(margin,cursorY-14,bw,18,{fill:accentColor});
        pdf.text(margin+10,cursorY-3,lbl,{size:11,bold:true,color:[1,1,1]});
        if(url) pdf.text(margin+bw+10,cursorY-3,_stripHtml(url).substring(0,50),{size:8,color:accentColor});
        cursorY-=20; blockGap(); return;
      }

      /* ── Dividers ── */
      case 'continue': return; // omitted from print — web-only artefact
      case 'numbered_divider': {
        const num=_stripHtml(String(d.number||''));
        const txt=_stripHtml(d.text||d.label||'');
        ensureSpace(30); cursorY-=12;
        if(num){
          pdf.rect(margin,cursorY-14,24,20,{fill:accentColor});
          pdf.text(margin+5,cursorY-1,num,{size:12,bold:true,color:[1,1,1]});
        }
        if(txt) pdf.text(margin+(num?30:0),cursorY-1,txt,{size:12,bold:true,color:INK.title});
        drawDivider(_lighten(accentColor,0.72));
        blockGap(); return;
      }
      case 'line_divider': drawDivider(); blockGap(-4); return;
      case 'spacer': cursorY-=Math.min(d.height||20,60); return;
      default: return;
    }
  }

  /* ── Assessment profile filter ── */
  const KC_TYPES=new Set(['kc_multiple_choice','kc_multiple_response','kc_fill_gap','kc_matching','kc_ordering']);
  function filterBlocks(bs){ return profile==='assessment'?(bs||[]).filter(b=>KC_TYPES.has(b.type)):(bs||[]); }

  /* ══════════════════════════════════════════════
     COVER PAGE
     ══════════════════════════════════════════════ */
  newPage();
  const heroSrc=(course.heroImage||{}).src;
  if(heroSrc && jpegCache[heroSrc]){
    await drawImageBlock(heroSrc,contentW,260);
    cursorY-=16;
  } else {
    // Decorative band when no hero image
    cursorY=pdf.pageH-margin-headerH-20;
    const bh=90;
    pdf.rect(margin,cursorY-bh,contentW,bh,{fill:accentColor});
    pdf.rect(margin,cursorY-bh,contentW*0.28,bh,{fill:_lighten(accentColor,0.18)});
    cursorY-=bh+20;
  }

  // Cover title — large, dark navy
  const titleLns=_wrapStr(courseTitle,26,contentW);
  titleLns.forEach(ln=>{ cursorY-=32; pdf.text(margin,cursorY,ln,{size:26,bold:true,color:INK.title}); });
  cursorY-=10;

  // Description
  if(course.description){
    const desc=_stripHtml(course.description);
    const dLines=_wrapStr(desc,12,contentW);
    dLines.forEach(ln=>{ cursorY-=17; pdf.text(margin,cursorY,ln,{size:12,color:INK.muted}); });
    cursorY-=8;
  }

  // Accent rule
  cursorY-=10;
  pdf.line(margin,cursorY,margin+60,cursorY,{color:accentColor,lineWidth:2});
  cursorY-=16;

  // Metadata (background drawn first)
  const meta=[
    ['Profile', profile==='assessment'?'Assessment Pack':'Learner Guide'],
    ['Version', course.publishVersion||'1.0'],
    ['Language',course.language||'English'],
    ['Date',    new Date().toLocaleDateString()],
    ['Lessons', String((course.lessons||[]).length)],
  ];
  if(course.authorName) meta.unshift(['Author',_stripHtml(course.authorName)]);
  const mrH=16, mH=meta.length*mrH+14;
  pdf.rect(margin,cursorY-mH,contentW*0.48,mH,{fill:[0.97,0.97,0.99],stroke:[0.86,0.86,0.90],lineWidth:0.4});
  meta.forEach(([k,v])=>{ cursorY-=mrH; pdf.text(margin+7,cursorY,k,{size:9,bold:true,color:INK.muted}); pdf.text(margin+76,cursorY,v,{size:9,color:INK.body}); });
  cursorY-=10;

  /* ══════════════════════════════════════════════
     CONTENTS PAGE
     ══════════════════════════════════════════════ */
  newPage();
  drawHeading('Contents',{size:20,color:accentColor});
  cursorY-=6;
  const sections=[
    ...(course.lessons||[]).map((l,i)=>`${i+1}.  ${_stripHtml(l.title)}`),
    ...(course.assessments||[]).filter(a=>(lessonData[a.id]||[]).length>0).map(a=>`Assessment:  ${_stripHtml(a.title)}`),
  ];
  sections.forEach(item=>{
    ensureSpace(18); cursorY-=17;
    pdf.text(margin+8,cursorY,item,{size:12,color:INK.body});
    // Dot leader
    let dx=margin+8+_pdfTextWidth(item,12)+4;
    const de=pdf.pageW-margin-8;
    while(dx<de-6){ pdf.text(dx,cursorY,'.',{size:12,color:[0.76,0.76,0.80]}); dx+=5; }
  });

  /* ══════════════════════════════════════════════
     LESSONS
     ══════════════════════════════════════════════ */
  for(const lesson of (course.lessons||[])){
    newPage();
    // Lesson heading: large, dark navy, with accent band
    drawHeading(_stripHtml(lesson.title),{size:18,rule:true,color:INK.title});
    blockGap(4);
    for(const block of filterBlocks(lessonData[lesson.id]||[])) await renderBlock(block);
  }

  /* ══════════════════════════════════════════════
     ASSESSMENTS
     ══════════════════════════════════════════════ */
  for(const assessment of (course.assessments||[])){
    const bs=filterBlocks(lessonData[assessment.id]||[]);
    if(!bs.length) continue;
    newPage();
    drawHeading(_stripHtml(assessment.title),{size:18,rule:true,color:INK.title});
    blockGap(4);
    for(const block of bs) await renderBlock(block);
  }

  /* ══════════════════════════════════════════════
     END PAGE
     ══════════════════════════════════════════════ */
  newPage();
  const ebH=70;
  pdf.rect(margin,contentTop-ebH,contentW,ebH,{fill:accentColor});
  pdf.rect(margin,contentTop-ebH,contentW*0.22,ebH,{fill:_lighten(accentColor,0.18)});
  pdf.text(margin+12,contentTop-ebH+40,'End of Document',{size:15,bold:true,color:[1,1,1]});
  cursorY=contentTop-ebH-20;
  drawParagraph(courseTitle,{size:11,color:INK.body});
  drawParagraph(`${profile==='assessment'?'Assessment Pack':'Learner Guide'}  ·  Generated by Lumio  ·  ${new Date().toLocaleDateString()}`,{size:9,color:INK.muted});

  return pdf.serialize({title:courseTitle});
}
