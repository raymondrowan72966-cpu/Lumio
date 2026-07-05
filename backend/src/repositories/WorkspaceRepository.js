import { DatabaseError } from '../errors/index.js';

/**
 * Real implementation against the Sprint 2A `workspaces`/`workspace_members`
 * tables. `workspace_members` uses its approved composite
 * `(workspace_id, user_id)` identity throughout — no surrogate id is ever
 * referenced, by design (see DECISIONS.md ADR-001).
 */
export class WorkspaceRepository {
  constructor(db) {
    this.db = db;
  }

  async findById(id) {
    if (!id) return null;
    const row = await this.db.first('SELECT * FROM workspaces WHERE id = ? AND deleted_at IS NULL', [id]);
    return row || null;
  }

  /** Builds (but does not execute) the INSERT statement for a new
   *  workspace — see UserRepository.buildCreateStatement for why this
   *  exists alongside a standalone `create`. */
  buildCreateStatement({ id, ownerId, name, now }) {
    return {
      sql: 'INSERT INTO workspaces (id, owner_id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)',
      params: [id, ownerId, name, now, now],
    };
  }

  async create(fields) {
    const { sql, params } = this.buildCreateStatement(fields);
    try {
      await this.db.run(sql, params);
    } catch (err) {
      throw new DatabaseError('Failed to create workspace.', { cause: String(err) });
    }
  }

  async findMembership(workspaceId, userId) {
    if (!workspaceId || !userId) return null;
    const row = await this.db.first(
      'SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, userId],
    );
    return row || null;
  }

  /** Builds (but does not execute) the INSERT statement for a new
   *  membership row. `invitationAcceptedAt` is NULL for the workspace's
   *  own Owner (created at workspace-creation time, never via an
   *  invitation) — see the column comment in migration 0001 for the full
   *  rationale; Sprint 2C's registration flow always passes `null` here,
   *  since self-registration never involves an invitation. */
  buildAddMemberStatement({ workspaceId, userId, role, invitationAcceptedAt = null, now }) {
    return {
      sql: `INSERT INTO workspace_members
              (workspace_id, user_id, role, invitation_accepted_at, status, joined_at, created_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      params: [workspaceId, userId, role, invitationAcceptedAt, now, now],
    };
  }

  /** Builds (but does not execute) the INSERT statement for the default
   *  workspace_settings row. Called as part of workspace creation — the
   *  settings row must be created atomically with the workspace row itself
   *  (in the same db.batch() call) so there is never a workspace without a
   *  settings record. All columns except workspace_id and updated_at carry
   *  schema-level defaults, so only those two are supplied here. */
  buildCreateSettingsStatement({ workspaceId, now }) {
    return {
      sql: 'INSERT INTO workspace_settings (workspace_id, updated_at) VALUES (?, ?)',
      params: [workspaceId, now],
    };
  }

  async addMember(fields) {
    const { sql, params } = this.buildAddMemberStatement(fields);
    try {
      await this.db.run(sql, params);
    } catch (err) {
      throw new DatabaseError('Failed to add workspace member.', { cause: String(err) });
    }
  }

  async removeMember(_workspaceId, _userId) {
    throw new Error('WorkspaceRepository.removeMember is not implemented yet (Sprint 2C: registration only).');
  }
}
