/**
 * ProjectRepository — all D1 queries for the projects, courses, and lessons
 * tables. Route handlers build one of these per request; there is no shared
 * connection state because D1 bindings are stateless per-request handles.
 */
export class ProjectRepository {
  constructor(db) {
    this._db = db;
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listByWorkspace(workspaceId) {
    const rows = await this._db.all(
      `SELECT * FROM projects
       WHERE workspace_id = ? AND deleted_at IS NULL
       ORDER BY last_accessed_at DESC`,
      [workspaceId],
    );
    return rows.map(rowToProject);
  }

  async getById(id) {
    const row = await this._db.first('SELECT * FROM projects WHERE id = ?', [id]);
    return row ? rowToProject(row) : null;
  }

  async createProject(data) {
    const now = Date.now();
    await this._db.run(
      `INSERT INTO projects
         (id, workspace_id, owner_id, title, type, status, health, folder_id,
          shared_scope, shared_permission, last_accessed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.workspaceId,
        data.ownerId,
        data.title,
        data.type,
        data.status || 'draft',
        data.health != null ? data.health : 0,
        data.folderId || null,
        data.sharedScope || null,
        data.sharedPermission || 'view',
        data.lastAccessedAt || now,
        now,
        now,
      ],
    );
  }

  async updateProject(id, data) {
    const now = Date.now();
    await this._db.run(
      `UPDATE projects
       SET title = ?, status = ?, health = ?, folder_id = ?,
           last_accessed_at = ?, updated_at = ?
       WHERE id = ?`,
      [
        data.title,
        data.status,
        data.health != null ? data.health : 0,
        data.folderId != null ? data.folderId : null,
        data.lastAccessedAt || now,
        now,
        id,
      ],
    );
  }

  async softDelete(id) {
    const now = Date.now();
    await this._db.run(
      'UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [now, now, id],
    );
  }

  // ── Courses ───────────────────────────────────────────────────────────────

  async getCourse(projectId) {
    const row = await this._db.first('SELECT * FROM courses WHERE id = ?', [projectId]);
    return row ? rowToCourse(row) : null;
  }

  async upsertCourse(projectId, data) {
    const now = Date.now();
    await this._db.run(
      `INSERT INTO courses
         (id, workspace_id, title, description, audience, duration,
          objectives, learner_outcomes, theme_id, theme_design,
          landing_layout, hero_image, hero_settings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title            = excluded.title,
         description      = excluded.description,
         audience         = excluded.audience,
         duration         = excluded.duration,
         objectives       = excluded.objectives,
         learner_outcomes = excluded.learner_outcomes,
         theme_id         = excluded.theme_id,
         theme_design     = excluded.theme_design,
         landing_layout   = excluded.landing_layout,
         hero_image       = excluded.hero_image,
         hero_settings    = excluded.hero_settings,
         updated_at       = excluded.updated_at`,
      [
        projectId,
        data.workspaceId,
        data.title || '',
        data.description || null,
        data.audience || null,
        data.duration || null,
        JSON.stringify(data.objectives || []),
        JSON.stringify(data.learnerOutcomes || []),
        data.themeId || null,
        JSON.stringify(data.themeDesign || {}),
        data.landingLayout || null,
        JSON.stringify(data.heroImage || null),
        JSON.stringify(data.heroSettings || null),
        now,
        now,
      ],
    );
  }

  // ── Lessons ───────────────────────────────────────────────────────────────

  async getLessons(courseId) {
    return this._db.all(
      'SELECT * FROM lessons WHERE course_id = ? ORDER BY position ASC',
      [courseId],
    );
  }

  async upsertLesson(courseId, workspaceId, lesson, position) {
    const now  = Date.now();
    const kind = lesson.kind || 'lesson';
    await this._db.run(
      `INSERT INTO lessons
         (id, course_id, workspace_id, title, kind, position, duration, blocks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title      = excluded.title,
         kind       = excluded.kind,
         position   = excluded.position,
         duration   = excluded.duration,
         blocks     = excluded.blocks,
         updated_at = excluded.updated_at`,
      [
        lesson.id,
        courseId,
        workspaceId,
        lesson.title || '',
        kind,
        position,
        lesson.duration || null,
        JSON.stringify(lesson.blocks || []),
        now,
        now,
      ],
    );
  }

  async deleteLessonsExcept(courseId, keepIds) {
    if (keepIds.length === 0) {
      await this._db.run('DELETE FROM lessons WHERE course_id = ?', [courseId]);
      return;
    }
    const placeholders = keepIds.map(() => '?').join(',');
    await this._db.run(
      `DELETE FROM lessons WHERE course_id = ? AND id NOT IN (${placeholders})`,
      [courseId, ...keepIds],
    );
  }
}

// ── Row mappers ──────────────────────────────────────────────────────────────

function rowToProject(row) {
  return {
    id:               row.id,
    workspaceId:      row.workspace_id,
    ownerId:          row.owner_id,
    title:            row.title,
    type:             row.type,
    status:           row.status,
    health:           row.health,
    folderId:         row.folder_id,
    sharedScope:      row.shared_scope,
    sharedPermission: row.shared_permission,
    lastAccessedAt:   row.last_accessed_at,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
    deletedAt:        row.deleted_at,
  };
}

function rowToCourse(row) {
  return {
    id:             row.id,
    workspaceId:    row.workspace_id,
    title:          row.title,
    description:    row.description,
    audience:       row.audience,
    duration:       row.duration,
    objectives:     _parseJson(row.objectives, []),
    learnerOutcomes: _parseJson(row.learner_outcomes, []),
    themeId:        row.theme_id,
    themeDesign:    _parseJson(row.theme_design, {}),
    landingLayout:  row.landing_layout,
    heroImage:      _parseJson(row.hero_image, null),
    heroSettings:   _parseJson(row.hero_settings, null),
  };
}

function _parseJson(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
