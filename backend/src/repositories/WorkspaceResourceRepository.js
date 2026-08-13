/**
 * WorkspaceResourceRepository — D1 queries for the workspace_resources table.
 *
 * The table stores workspace-owned resources (label packs, future: themes,
 * branding) under a single generic schema keyed by resource_type.  Route
 * handlers use the RESOURCE_TYPES allowlist to validate callers before they
 * ever reach this layer.
 */
export class WorkspaceResourceRepository {
  constructor(db) {
    this._db = db;
  }

  /**
   * Return all resources of a given type for a workspace, keyed by id.
   * @param {string} workspaceId
   * @param {string} resourceType  e.g. 'labelPacks'
   * @returns {Promise<Record<string, object>>}
   */
  async listByWorkspace(workspaceId, resourceType) {
    const rows = await this._db.all(
      `SELECT * FROM workspace_resources
       WHERE workspace_id = ? AND resource_type = ?
       ORDER BY created_at ASC`,
      [workspaceId, resourceType],
    );
    return Object.fromEntries(rows.map(r => [r.id, rowToResource(r)]));
  }

  /**
   * Insert or update a single resource. Version is auto-incremented on conflict.
   * @param {string} workspaceId
   * @param {string} resourceType
   * @param {string} id
   * @param {object} data  — { name, payload }
   * @param {string} userId
   */
  async upsert(workspaceId, resourceType, id, data, userId) {
    const now = Date.now();
    await this._db.run(
      `INSERT INTO workspace_resources
         (id, workspace_id, resource_type, name, payload,
          created_by, updated_by, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id, workspace_id) DO UPDATE SET
         name       = excluded.name,
         payload    = excluded.payload,
         updated_by = excluded.updated_by,
         version    = workspace_resources.version + 1,
         updated_at = excluded.updated_at`,
      [
        id,
        workspaceId,
        resourceType,
        data.name || '',
        JSON.stringify(data.payload != null ? data.payload : data),
        userId,
        userId,
        now,
        now,
      ],
    );
  }

  /**
   * Hard-delete a single resource. Caller must verify workspace ownership.
   * @param {string} workspaceId
   * @param {string} id
   */
  async delete(workspaceId, id) {
    await this._db.run(
      'DELETE FROM workspace_resources WHERE id = ? AND workspace_id = ?',
      [id, workspaceId],
    );
  }
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function rowToResource(row) {
  const payload = _parseJson(row.payload, {});
  return {
    ...payload,
    id:        row.id,
    name:      row.name,
    custom:    true,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    version:   row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function _parseJson(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
