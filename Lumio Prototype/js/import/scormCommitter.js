/* ============================================================
   SCORM COMMITTER — Import Engine Milestone 7
   Commit Engine: Lumio Course Model → Lumio Project

   Reuses the existing project creation lifecycle entirely.
   No new persistence logic. No new state architecture.
   One call to _restoreProjectPayload() handles everything.

   Pipeline (all existing functions):
     payload assembly
     ↓
     _restoreProjectPayload()   — ID remapping + LumioState registration
     ↓                            + saveLumioState() + cloudPersistProject()
     navigate('#/lesson/')      — opens Builder directly
   ============================================================ */

const ScormCommitter = (() => {

  /* ── Public API ──────────────────────────────────────────── */

  function commit(model) {
    const notifId = NotifySystem.progress('Creating Lumio project…');
    try {
      _doCommit(model, notifId);
    } catch (err) {
      NotifySystem.complete(notifId, 'Commit failed', 'error');
      console.error('[ScormCommitter]', err);
      _showError(err.message || 'Project creation failed unexpectedly.');
    }
  }

  /* ── Core commit ─────────────────────────────────────────── */

  function _doCommit(model, notifId) {
    // Assemble payload in _restoreProjectPayload's expected format.
    // _restoreProjectPayload handles:
    //   • ID remapping (generateUniqueId for every lesson, assessment, project)
    //   • LumioState.projects.unshift(p)
    //   • LumioState.courses[p.id] = course
    //   • Object.assign(LumioState.lessons, lessons)
    //   • saveLumioState()
    //   • cloudPersistProject(p.id)
    const payload = {
      project: {
        id:               model.course.id,
        title:            model.course.title,
        type:             'Course',
        status:           'draft',
        health:           0,
        folder:           null,
        lastAccessed:     Date.now(),
        deleted:          false,
        deletedAt:        null,
        ownerId:          getCurrentUser()?.id || null,
        sharedWith:       [],
        sharedScope:      null,
        sharedPermission: 'view',
        reviewStatus:     null, reviewedBy:     null, reviewedAt:    null,
        reviewComments:   null, submittedBy:    null, submittedAt:   null,
      },
      course:  model.course,
      lessons: model.lessons,
    };

    // Reuse the existing .lumio import function — identical state registration
    // path used by all Lumio project imports.
    _restoreProjectPayload(payload);

    // _restoreProjectPayload appends ' (Imported)' — designed for .lumio file
    // imports. Strip it for SCORM: the course is being authored in Lumio now.
    const newProjectId = LumioState.projects[0].id;
    const cleanTitle   = LumioState.projects[0].title.replace(/ \(Imported\)$/, '');
    LumioState.projects[0].title = cleanTitle;
    if (LumioState.courses[newProjectId]) LumioState.courses[newProjectId].title = cleanTitle;

    // Persist the title correction quietly.
    scheduleLumioSave();

    // Set current course + lesson so the Builder knows what to render.
    LumioState.currentCourseId = newProjectId;
    const firstLesson = (LumioState.courses[newProjectId]?.lessons || [])[0];
    if (firstLesson) LumioState.currentLessonId = firstLesson.id;

    NotifySystem.complete(notifId, `"${cleanTitle}" created`, 'success');

    // Navigate directly to Builder — "immediately editable" per sprint.
    // Small delay keeps the success toast readable.
    const dest = firstLesson
      ? '#/lesson/' + firstLesson.id
      : '#/course/' + newProjectId;
    setTimeout(() => navigate(dest), 700);
  }

  /* ── Error screen ────────────────────────────────────────── */

  function _showError(message) {
    const overlay = el(`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Commit Error">
        <div class="modal" style="width:480px;max-width:94vw;padding:36px;">
          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:40px;line-height:1;margin-bottom:12px;">⛔</div>
            <h2 style="font-size:18px;color:var(--ink-900);">Project Creation Failed</h2>
          </div>
          <div style="padding:14px;border-radius:var(--r-md);background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.18);margin-bottom:24px;">
            <p style="font-size:13px;color:var(--ink-900);line-height:1.65;">${_esc(message)}</p>
          </div>
          <div class="flex justify-end gap-12">
            <button class="btn btn-ghost" id="sce-close">Close</button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(overlay);
    overlay.querySelector('#sce-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => overlay.querySelector('#sce-close').focus());
  }

  function _esc(s) {
    return s == null ? '' : String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { commit };

})();
