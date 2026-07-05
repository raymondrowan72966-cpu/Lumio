/**
 * AssetRepository — D1 queries for the assets table.
 * Actual binary data lives in R2; this table holds the metadata needed to
 * locate the R2 object (r2_key), verify ownership (workspace_id), and serve
 * correct Content-Type / filename headers.
 */
export class AssetRepository {
  constructor(db) {
    this._db = db;
  }

  /**
   * Persist a new asset record. Uses INSERT OR IGNORE so re-uploading the
   * same content-addressed ID is a silent no-op (idempotent upsert).
   */
  async create(data) {
    const now = Date.now();
    await this._db.run(
      `INSERT OR IGNORE INTO assets
         (id, workspace_id, course_id, uploaded_by,
          file_name, mime_type, size_bytes, r2_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.workspaceId,
        data.courseId || null,
        data.uploadedBy,
        data.fileName,
        data.mimeType,
        data.sizeBytes,
        data.r2Key,
        now,
      ],
    );
  }

  async getById(id) {
    const row = await this._db.first(
      'SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    return row ? rowToAsset(row) : null;
  }

  async listByCourse(courseId) {
    const rows = await this._db.all(
      `SELECT * FROM assets WHERE course_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`,
      [courseId],
    );
    return rows.map(rowToAsset);
  }

  async softDelete(id) {
    const now = Date.now();
    await this._db.run('UPDATE assets SET deleted_at = ? WHERE id = ?', [now, id]);
  }
}

function rowToAsset(row) {
  return {
    id:          row.id,
    workspaceId: row.workspace_id,
    courseId:    row.course_id,
    uploadedBy:  row.uploaded_by,
    fileName:    row.file_name,
    mimeType:    row.mime_type,
    sizeBytes:   row.size_bytes,
    r2Key:       row.r2_key,
    createdAt:   row.created_at,
    deletedAt:   row.deleted_at,
  };
}
