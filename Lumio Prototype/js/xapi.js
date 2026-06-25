/* ============================================================
   xAPI (TIN CAN) RUNTIME LAYER
   Sprint 3F — xAPI Export Engine.

   Unlike SCORM (ScormRuntime / ScormRuntime2004 in scorm.js), which talk
   to a window-level API object the host LMS injects synchronously, xAPI
   has no injected API — an LRS is a remote HTTP endpoint. This is the one
   genuinely new capability flagged in the Sprint 7A export-architecture
   audit: every other export format talks to something already present in
   the page; this one makes real network calls. Everything else about
   this runtime (fail gracefully with no LRS configured, never throw) is
   the same design contract as ScormRuntime.

   Launch configuration follows the common "xAPI Launch" convention used
   by LMS/LRS platforms that host xAPI content: endpoint, auth, actor,
   and registration are passed as URL query parameters on the launch URL.
   If none are present (e.g. the package was just unzipped and opened
   directly), `available` stays false and the bootstrap's existing
   localStorage fallback (identical to the HTML/SCORM exports) is used.
   ============================================================ */
const XapiRuntime = (function () {
  let endpoint = null;
  let authHeader = null;
  let actor = null;
  let registration = null;
  let available = false;

  function _parseLaunchParams() {
    const params = new URLSearchParams(window.location.search);
    const ep = params.get('endpoint');
    if (!ep) return false;
    endpoint = ep.endsWith('/') ? ep : ep + '/';
    const auth = params.get('auth');
    authHeader = auth ? (auth.startsWith('Basic ') || auth.startsWith('Bearer ') ? auth : `Basic ${auth}`) : null;
    registration = params.get('registration') || null;
    const actorParam = params.get('actor');
    if (actorParam) {
      try { actor = JSON.parse(actorParam); } catch (e) { actor = null; }
    }
    return true;
  }

  // Anonymous actor fallback — a stable, locally-generated mbox identity
  // so statements from the same browser/device are attributable to the
  // same (anonymous) agent across a session, without requiring real LRS
  // launch credentials. Real deployments will always supply `actor` via
  // the launch URL; this only covers the "opened standalone" case.
  function _anonymousActor() {
    const key = 'lumio-xapi-anon-id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem(key, id); } catch (e) {}
    }
    return { mbox: `mailto:${id}@anonymous.lumio`, name: 'Anonymous Learner' };
  }

  function init() {
    available = _parseLaunchParams();
    if (!actor) actor = _anonymousActor();
    if (!available) console.info('[xAPI] No LRS endpoint in launch URL — running in standalone mode.');
    return available;
  }

  function _headers(extra) {
    const h = { 'Content-Type': 'application/json', 'X-Experience-API-Version': '1.0.3' };
    if (authHeader) h['Authorization'] = authHeader;
    return Object.assign(h, extra || {});
  }

  // Fire-and-forget — an LRS being slow or unreachable must never block
  // or break the learner's experience. Errors are logged, never thrown.
  function _send(method, url, body) {
    if (!available) return;
    try {
      fetch(url, { method, headers: _headers(), body: body !== undefined ? JSON.stringify(body) : undefined })
        .catch(e => console.warn('[xAPI] request failed:', e));
    } catch (e) { console.warn('[xAPI] request failed:', e); }
  }

  // ---- Statements ----
  // Activity IDs are deterministic URIs derived from Lumio's own ids —
  // they don't need to resolve to anything, only be stable and unique.
  const ACTIVITY_BASE = 'https://lumio.app/xapi/activities';
  function courseActivity(courseId, title) {
    return { id: `${ACTIVITY_BASE}/course/${courseId}`, definition: { name: { 'en-US': title || 'Course' }, type: 'http://adlnet.gov/expapi/activities/course' } };
  }
  function lessonActivity(courseId, lessonId, title) {
    return { id: `${ACTIVITY_BASE}/course/${courseId}/lesson/${lessonId}`, definition: { name: { 'en-US': title || 'Lesson' }, type: 'http://adlnet.gov/expapi/activities/lesson' } };
  }
  function interactionActivity(courseId, lessonId, blockId, kind, title) {
    return { id: `${ACTIVITY_BASE}/course/${courseId}/lesson/${lessonId}/${kind}/${blockId}`, definition: { name: { 'en-US': title || kind }, type: 'http://adlnet.gov/expapi/activities/interaction' } };
  }

  const VERBS = {
    launched:  { id: 'http://adlnet.gov/expapi/verbs/launched',  display: { 'en-US': 'launched' } },
    completed: { id: 'http://adlnet.gov/expapi/verbs/completed', display: { 'en-US': 'completed' } },
    passed:    { id: 'http://adlnet.gov/expapi/verbs/passed',    display: { 'en-US': 'passed' } },
    failed:    { id: 'http://adlnet.gov/expapi/verbs/failed',    display: { 'en-US': 'failed' } },
    experienced: { id: 'http://adlnet.gov/expapi/verbs/experienced', display: { 'en-US': 'experienced' } },
  };

  function _statement(verbKey, object, result) {
    if (!available) return;
    const stmt = { actor, verb: VERBS[verbKey], object, timestamp: new Date().toISOString() };
    if (registration) stmt.context = { registration };
    if (result) stmt.result = result;
    _send('POST', `${endpoint}statements`, stmt);
  }

  function sendCourseLaunched(courseId, title) { _statement('launched', courseActivity(courseId, title)); }
  function sendLessonViewed(courseId, lessonId, title) { _statement('experienced', lessonActivity(courseId, lessonId, title)); }
  function sendContinueCompleted(courseId, lessonId, blockId, title) {
    _statement('completed', interactionActivity(courseId, lessonId, blockId, 'continue', title), { completion: true });
  }
  function sendKnowledgeCheckCompleted(courseId, lessonId, blockId, title) {
    _statement('completed', interactionActivity(courseId, lessonId, blockId, 'assessment', title), { completion: true });
  }
  function sendKnowledgeCheckPassed(courseId, lessonId, blockId, title, scaled, passed) {
    _statement(passed ? 'passed' : 'failed', interactionActivity(courseId, lessonId, blockId, 'assessment', title), {
      completion: true, success: !!passed, score: { scaled: Math.max(0, Math.min(1, scaled)) },
    });
  }
  function sendCourseCompleted(courseId, title, scaled) {
    const result = { completion: true };
    if (typeof scaled === 'number') result.score = { scaled: Math.max(0, Math.min(1, scaled)) };
    _statement('completed', courseActivity(courseId, title), result);
  }

  // ---- State API (suspend/resume) ----
  // Unlike SCORM 1.2's 4096-char cmi.suspend_data, the xAPI State API has
  // no practical size cap — the full learner-state record is stored
  // as-is, no degradation strategy needed.
  function _stateUrl(activityId, stateId) {
    const q = new URLSearchParams({ activityId, agent: JSON.stringify(actor), stateId });
    if (registration) q.set('registration', registration);
    return `${endpoint}activities/state?${q.toString()}`;
  }
  async function getState(courseId, stateId) {
    if (!available) return null;
    try {
      const res = await fetch(_stateUrl(`${ACTIVITY_BASE}/course/${courseId}`, stateId), { headers: _headers() });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { console.warn('[xAPI] getState failed:', e); return null; }
  }
  function setState(courseId, stateId, value) {
    if (!available) return;
    _send('PUT', _stateUrl(`${ACTIVITY_BASE}/course/${courseId}`, stateId), value);
  }

  return {
    init,
    get available() { return available; },
    get actor() { return actor; },
    sendCourseLaunched, sendLessonViewed, sendContinueCompleted,
    sendKnowledgeCheckCompleted, sendKnowledgeCheckPassed, sendCourseCompleted,
    getState, setState,
  };
})();
