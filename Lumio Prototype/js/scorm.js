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
  // LMS & Validation Sprint, Phase 8 fix: a real stress test (20 lessons,
  // 8 assessments, 60 tracked blocks) proved the original "if still too
  // big, hard-slice the JSON string" fallback produces a syntactically
  // INVALID JSON string mid-object — JSON.parse() on the next launch
  // throws, getSuspendData() returns null, and the ENTIRE resume state is
  // silently lost (not gracefully degraded). Fixed by degrading through a
  // strictly ordered list of ALWAYS-VALID-JSON candidates, each built by
  // dropping a less-critical field rather than truncating bytes — resume
  // position and assessment results (the fields that matter most) are
  // preserved as long as possible; only granular per-block interaction
  // detail (blockProgress) is sacrificed first.
  function setSuspendData(obj) {
    const candidates = [
      obj,
      Object.assign({}, obj, { interactionHistory: undefined }),
      Object.assign({}, obj, { interactionHistory: undefined, learnerProgress: obj.learnerProgress ? Object.assign({}, obj.learnerProgress, { blockProgress: undefined }) : obj.learnerProgress }),
      // Last resort: only the fields needed to resume position + know
      // what's complete — always small enough to fit, and always valid JSON.
      {
        resume: obj.resume,
        learnerProgress: obj.learnerProgress ? {
          completedLessons: obj.learnerProgress.completedLessons,
          courseStatus: obj.learnerProgress.courseStatus,
          lastLessonId: obj.learnerProgress.lastLessonId,
          lastBlockIndex: obj.learnerProgress.lastBlockIndex,
        } : undefined,
        assessmentAttempts: obj.assessmentAttempts,
      },
    ];
    let json = null;
    for (let i = 0; i < candidates.length; i++) {
      let candidateJson;
      try { candidateJson = JSON.stringify(candidates[i]); } catch (e) { continue; }
      if (candidateJson.length <= SUSPEND_DATA_MAX) {
        json = candidateJson;
        if (i > 0) console.warn(`[SCORM] suspend_data exceeded the 4096-char SCORM 1.2 limit — degraded to fallback level ${i} (still valid JSON, full lesson position + completion + scores preserved).`);
        break;
      }
    }
    if (json === null) {
      // Even the minimal skeleton didn't fit (pathological case — would
      // need hundreds of lessons). Truncate the lesson list rather than
      // the JSON string itself, so what remains still parses.
      const minimal = candidates[candidates.length - 1];
      while (minimal.learnerProgress && minimal.learnerProgress.completedLessons && minimal.learnerProgress.completedLessons.length > 0) {
        minimal.learnerProgress.completedLessons = minimal.learnerProgress.completedLessons.slice(0, -10);
        const attempt = JSON.stringify(minimal);
        if (attempt.length <= SUSPEND_DATA_MAX) { json = attempt; break; }
      }
      if (json === null) json = '{}'; // truly nothing fits — never invalid JSON
      console.warn('[SCORM] suspend_data could not fit even the minimal resume skeleton — completedLessons list was truncated to fit.');
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

/* ============================================================
   SCORM 2004 (4TH EDITION) RUNTIME LAYER
   Sprint 7C — SCORM 2004 Adapter.

   Same shape and design goals as ScormRuntime above (fail gracefully
   with no LMS present, never throw), but talking to the SCORM 2004 RTE,
   which differs from 1.2 in three structural ways this layer exists to
   isolate:
   1. API discovery looks for `API_1484_11` (not `API`).
   2. Method names drop the "LMS" prefix (Initialize, not LMSInitialize).
   3. The single cmi.core.lesson_status value is split into two
      independent values — cmi.completion_status (completed/incomplete/
      not attempted/unknown) and cmi.success_status (passed/failed/
      unknown) — and score is normalized to cmi.score.scaled (-1..1)
      instead of a raw/min/max triple.
   This is intentionally a SECOND runtime object, not a generalization
   of ScormRuntime — the two RTEs are different enough (split status
   model, different time format, different student-info keys) that a
   shared base would need as many branches as it saved lines. Each
   export adapter in publish.js talks to exactly one of these two.
   ============================================================ */
const ScormRuntime2004 = (function () {
  let api = null;
  let available = false;
  let initialized = false;
  let sessionStartedAt = null;

  function _findApiOnWindow(win, triesLeft) {
    if (!win || triesLeft <= 0) return null;
    try {
      if (win.API_1484_11) return win.API_1484_11;
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
    catch (e) { console.warn('[SCORM 2004] ' + methodName + ' failed:', e); return ''; }
  }

  function init() {
    api = discoverAPI();
    available = !!api;
    if (!available) { console.info('[SCORM 2004] No LMS API found — running in standalone mode.'); return false; }
    const result = _call('Initialize', '');
    initialized = (String(result) === 'true' || result === true);
    sessionStartedAt = Date.now();
    if (!initialized) {
      console.warn('[SCORM 2004] Initialize failed — error:', _call('GetLastError'));
      available = false;
    }
    return initialized;
  }
  function finish() {
    if (!available || !initialized) return;
    setSessionTime(Date.now() - (sessionStartedAt || Date.now()));
    _call('Commit', '');
    _call('Terminate', '');
    initialized = false;
  }
  function commit() {
    if (!available || !initialized) return;
    _call('Commit', '');
  }
  function get(key) { return available ? _call('GetValue', key) : ''; }
  function set(key, value) {
    if (!available) return false;
    const result = _call('SetValue', key, String(value));
    return String(result) === 'true' || result === true;
  }

  // ---- Completion / success status (split, unlike SCORM 1.2's single value) ----
  const VALID_COMPLETION_STATUSES = ['completed', 'incomplete', 'not attempted', 'unknown'];
  const VALID_SUCCESS_STATUSES = ['passed', 'failed', 'unknown'];
  function setCompletionStatus(status) {
    if (!VALID_COMPLETION_STATUSES.includes(status)) return false;
    return set('cmi.completion_status', status);
  }
  function getCompletionStatus() { return get('cmi.completion_status') || 'not attempted'; }
  function setSuccessStatus(status) {
    if (!VALID_SUCCESS_STATUSES.includes(status)) return false;
    return set('cmi.success_status', status);
  }
  function getSuccessStatus() { return get('cmi.success_status') || 'unknown'; }

  // ---- Score: 2004 reports a normalized scaled score (-1..1) as the
  // primary value; raw/min/max remain available for LMS dashboards that
  // still display them, same field names as 1.2 minus the "core." prefix.
  function setScore(raw, min, max) {
    if (typeof raw === 'number' && typeof max === 'number' && max > (min || 0)) {
      const scaled = Math.max(-1, Math.min(1, (raw - (min || 0)) / (max - (min || 0))));
      set('cmi.score.scaled', scaled.toFixed(4));
    }
    if (typeof raw === 'number') set('cmi.score.raw', Math.round(raw));
    set('cmi.score.min', typeof min === 'number' ? Math.round(min) : 0);
    set('cmi.score.max', typeof max === 'number' ? Math.round(max) : 100);
  }

  // ---- Student data: 2004 renames student_id/student_name to
  // learner_id/learner_name. Same read-only contract as SCORM 1.2.
  function getStudentInfo() {
    if (!available) return null;
    const id = get('cmi.learner_id');
    const name = get('cmi.learner_name');
    if (!id && !name) return null;
    return { id: id || null, name: name || null };
  }

  // ---- Time: 2004 uses ISO 8601 duration (PT#H#M#S), not SCORM 1.2's
  // HHHH:MM:SS.SS.
  function _msToIso8601Duration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `PT${h}H${m}M${s}S`;
  }
  function setSessionTime(ms) {
    return set('cmi.session_time', _msToIso8601Duration(ms));
  }
  function getTotalTime() { return get('cmi.total_time') || 'PT0H0M0S'; }

  // ---- Suspend data / bookmarking: same 4096-char-safe degradation
  // strategy as SCORM 1.2 (the field name and size cap are unchanged in
  // 2004 — only the status/score model around it differs).
  const SUSPEND_DATA_MAX = 4096;
  function setSuspendData(obj) {
    const candidates = [
      obj,
      Object.assign({}, obj, { interactionHistory: undefined }),
      Object.assign({}, obj, { interactionHistory: undefined, learnerProgress: obj.learnerProgress ? Object.assign({}, obj.learnerProgress, { blockProgress: undefined }) : obj.learnerProgress }),
      {
        resume: obj.resume,
        learnerProgress: obj.learnerProgress ? {
          completedLessons: obj.learnerProgress.completedLessons,
          courseStatus: obj.learnerProgress.courseStatus,
          lastLessonId: obj.learnerProgress.lastLessonId,
          lastBlockIndex: obj.learnerProgress.lastBlockIndex,
        } : undefined,
        assessmentAttempts: obj.assessmentAttempts,
      },
    ];
    let json = null;
    for (let i = 0; i < candidates.length; i++) {
      let candidateJson;
      try { candidateJson = JSON.stringify(candidates[i]); } catch (e) { continue; }
      if (candidateJson.length <= SUSPEND_DATA_MAX) {
        json = candidateJson;
        if (i > 0) console.warn(`[SCORM 2004] suspend_data exceeded the 4096-char limit — degraded to fallback level ${i}.`);
        break;
      }
    }
    if (json === null) {
      const minimal = candidates[candidates.length - 1];
      while (minimal.learnerProgress && minimal.learnerProgress.completedLessons && minimal.learnerProgress.completedLessons.length > 0) {
        minimal.learnerProgress.completedLessons = minimal.learnerProgress.completedLessons.slice(0, -10);
        const attempt = JSON.stringify(minimal);
        if (attempt.length <= SUSPEND_DATA_MAX) { json = attempt; break; }
      }
      if (json === null) json = '{}';
      console.warn('[SCORM 2004] suspend_data could not fit even the minimal resume skeleton — completedLessons list was truncated to fit.');
    }
    return set('cmi.suspend_data', json);
  }
  function getSuspendData() {
    const raw = get('cmi.suspend_data');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  // 2004 entry values are the same two strings as 1.2 ('resume' / '').
  function setEntry(isResume) { set('cmi.entry', isResume ? 'resume' : ''); }

  return {
    init, finish, commit, get, set,
    get available() { return available; },
    setCompletionStatus, getCompletionStatus,
    setSuccessStatus, getSuccessStatus,
    setScore,
    getStudentInfo,
    setSessionTime, getTotalTime,
    setSuspendData, getSuspendData, setEntry,
  };
})();
