/* ============================================================
   SCORM 1.2 RUNTIME LAYER
   SCORM 1.2 Export Implementation Sprint, Phase 1.

   A thin, defensive wrapper around the SCORM 1.2 RTE (Run-Time
   Environment) API. Bundled verbatim into every SCORM-exported package
   (see PUBLISH_SCORM_JS_FILES in publish.js) — it only ever runs inside
   the published learner package, never inside the authoring app.

   Design goals:
   - Fail gracefully with no LMS present (local file:// or plain HTML
     hosting) — every method becomes a safe no-op and `available` stays
     false, so the rest of the bootstrap (the existing localStorage-based
     __loadLearnerState/__saveLearnerState flow) keeps working exactly as
     it does for the plain HTML export.
   - Never throw — a misbehaving LMS shim must not break the learner page.
   ============================================================ */
const ScormRuntime = (function () {
  let api = null;
  let available = false;
  let initialized = false;
  let sessionStartedAt = null;

  // SCORM 1.2 API discovery: the host LMS places a window-level `API`
  // object (NOT `API_1484_11` — that's the SCORM 2004 name) somewhere in
  // the frame/window ancestry. Walk up through parent frames, then across
  // to opener windows, same algorithm every SCORM 1.2 course uses.
  function _findApiOnWindow(win, triesLeft) {
    if (!win || triesLeft <= 0) return null;
    try {
      if (win.API) return win.API;
    } catch (e) { /* cross-origin frame — can't read it, keep walking */ }
    if (win.parent && win.parent !== win) return _findApiOnWindow(win.parent, triesLeft - 1);
    return null;
  }
  function discoverAPI() {
    let found = _findApiOnWindow(window, 10);
    if (!found && window.opener) found = _findApiOnWindow(window.opener, 10);
    return found || null;
  }

  function _call(methodName, ...args) {
    if (!api || typeof api[methodName] !== 'function') return '';
    try { return api[methodName].apply(api, args); }
    catch (e) { console.warn('[SCORM] ' + methodName + ' failed:', e); return ''; }
  }

  // ---- Phase 1: lifecycle ----
  function init() {
    api = discoverAPI();
    available = !!api;
    if (!available) { console.info('[SCORM] No LMS API found — running in standalone mode.'); return false; }
    const result = _call('LMSInitialize', '');
    initialized = (String(result) === 'true' || result === true);
    sessionStartedAt = Date.now();
    if (!initialized) {
      console.warn('[SCORM] LMSInitialize failed — error:', _call('LMSGetLastError'));
      available = false;
    }
    return initialized;
  }
  function finish() {
    if (!available || !initialized) return;
    setSessionTime(Date.now() - (sessionStartedAt || Date.now()));
    _call('LMSCommit', '');
    _call('LMSFinish', '');
    initialized = false;
  }
  function commit() {
    if (!available || !initialized) return;
    _call('LMSCommit', '');
  }
  function get(key) { return available ? _call('LMSGetValue', key) : ''; }
  function set(key, value) {
    if (!available) return false;
    const result = _call('LMSSetValue', key, String(value));
    return String(result) === 'true' || result === true;
  }

  // ---- Phase 2: completion status ----
  // Lumio completion → SCORM cmi.core.lesson_status. 'passed'/'failed' are
  // reserved for lessons that have an assessment-style pass/fail outcome;
  // plain content-completion lessons use 'completed'.
  const VALID_LESSON_STATUSES = ['not attempted', 'incomplete', 'completed', 'passed', 'failed'];
  function setLessonStatus(status) {
    if (!VALID_LESSON_STATUSES.includes(status)) return false;
    return set('cmi.core.lesson_status', status);
  }
  function getLessonStatus() { return get('cmi.core.lesson_status') || 'not attempted'; }

  // ---- Phase 3: score reporting ----
  function setScore(raw, min, max) {
    if (typeof raw === 'number') set('cmi.core.score.raw', Math.round(raw));
    set('cmi.core.score.min', typeof min === 'number' ? Math.round(min) : 0);
    set('cmi.core.score.max', typeof max === 'number' ? Math.round(max) : 100);
  }

  // ---- Phase 4: student data ----
  // SCORM 1.2 student_id/student_name are LMS-provided and READ-ONLY from
  // the SCO's perspective — Lumio reads them to personalise the learner
  // profile, never writes them back.
  function getStudentInfo() {
    if (!available) return null;
    const id = get('cmi.core.student_id');
    const name = get('cmi.core.student_name');
    if (!id && !name) return null;
    return { id: id || null, name: name || null };
  }

  // ---- Phase 5: time tracking ----
  // SCORM 1.2 time format: HHHH:MM:SS.SS (hours can exceed 2 digits).
  function _msToScormTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${String(h).padStart(4, '0')}:${pad(m)}:${pad(s)}`;
  }
  function setSessionTime(ms) {
    return set('cmi.core.session_time', _msToScormTime(ms));
  }
  // total_time is normally LMS-computed (read-only in most implementations)
  // — read it for display/logging only, never written.
  function getTotalTime() { return get('cmi.core.total_time') || '0000:00:00'; }

  // ---- Phase 6: bookmarking & resume ----
  // cmi.suspend_data is capped at 4096 chars by the SCORM 1.2 spec. Store
  // only what's needed to resume exactly where the learner left off —
  // current lesson, per-lesson completion, assessment attempts/scores,
  // and the completion-engine's per-block progress (Continue blocks,
  // required interactions) — same shape as the existing localStorage
  // learner-state record, just size-capped for LMS storage.
  const SUSPEND_DATA_MAX = 4096;
  function setSuspendData(obj) {
    let json;
    try { json = JSON.stringify(obj); } catch (e) { return false; }
    if (json.length > SUSPEND_DATA_MAX) {
      console.warn(`[SCORM] suspend_data (${json.length} chars) exceeds the 4096-char SCORM 1.2 limit — dropping interactionHistory to fit.`);
      const trimmed = Object.assign({}, obj, { interactionHistory: undefined });
      json = JSON.stringify(trimmed);
      if (json.length > SUSPEND_DATA_MAX) json = json.slice(0, SUSPEND_DATA_MAX); // last resort, should not happen in practice
    }
    return set('cmi.suspend_data', json);
  }
  function getSuspendData() {
    const raw = get('cmi.suspend_data');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function setEntry(isResume) { set('cmi.core.entry', isResume ? 'resume' : ''); }

  return {
    init, finish, commit, get, set,
    get available() { return available; },
    setLessonStatus, getLessonStatus,
    setScore,
    getStudentInfo,
    setSessionTime, getTotalTime,
    setSuspendData, getSuspendData, setEntry,
  };
})();
