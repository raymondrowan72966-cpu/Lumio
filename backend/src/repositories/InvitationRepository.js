import { DatabaseError } from '../errors/index.js';

export class InvitationRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ id, workspaceId, inviterUserId, email, firstName, lastName, role, authProvider, tokenHash, expiresAt, now }) {
    try {
      await this.db.run(
        `INSERT INTO invitations
           (id, workspace_id, inviter_user_id, email, first_name, last_name, role,
            auth_provider, invitation_token_hash, expires_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [id, workspaceId, inviterUserId, email, firstName, lastName, role, authProvider, tokenHash, expiresAt, now],
      );
    } catch (err) {
      throw new DatabaseError('Failed to create invitation.', { cause: String(err) });
    }
  }

  async findById(id) {
    if (!id) return null;
    try {
      return await this.db.first('SELECT * FROM invitations WHERE id = ?', [id]) || null;
    } catch (err) {
      throw new DatabaseError('Failed to look up invitation.', { cause: String(err) });
    }
  }

  async findByTokenHash(tokenHash) {
    if (!tokenHash) return null;
    try {
      return await this.db.first(
        'SELECT * FROM invitations WHERE invitation_token_hash = ?',
        [tokenHash],
      ) || null;
    } catch (err) {
      throw new DatabaseError('Failed to look up invitation by token.', { cause: String(err) });
    }
  }

  /** Returns a pending invitation for the given email in the given workspace, or null. */
  async findPendingByEmailAndWorkspace(email, workspaceId) {
    if (!email || !workspaceId) return null;
    try {
      return await this.db.first(
        `SELECT * FROM invitations
         WHERE email = ? AND workspace_id = ? AND status = 'pending'`,
        [email, workspaceId],
      ) || null;
    } catch (err) {
      throw new DatabaseError('Failed to check for existing invitation.', { cause: String(err) });
    }
  }

  /** Returns all pending invitations for a workspace, newest first. */
  async findPendingByWorkspace(workspaceId) {
    if (!workspaceId) return [];
    try {
      return await this.db.all(
        `SELECT * FROM invitations
         WHERE workspace_id = ? AND status = 'pending'
         ORDER BY created_at DESC`,
        [workspaceId],
      );
    } catch (err) {
      throw new DatabaseError('Failed to list pending invitations.', { cause: String(err) });
    }
  }

  async markAccepted(id, now) {
    try {
      await this.db.run(
        `UPDATE invitations SET status = 'accepted', accepted_at = ? WHERE id = ?`,
        [now, id],
      );
    } catch (err) {
      throw new DatabaseError('Failed to mark invitation as accepted.', { cause: String(err) });
    }
  }

  async markRevoked(id, now) {
    try {
      await this.db.run(
        `UPDATE invitations SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'pending'`,
        [now, id],
      );
    } catch (err) {
      throw new DatabaseError('Failed to revoke invitation.', { cause: String(err) });
    }
  }

  /** Lazily expires all pending invitations whose expires_at has passed. */
  async expirePending(now) {
    try {
      await this.db.run(
        `UPDATE invitations SET status = 'expired'
         WHERE status = 'pending' AND expires_at < ?`,
        [now],
      );
    } catch (err) {
      throw new DatabaseError('Failed to expire stale invitations.', { cause: String(err) });
    }
  }
}
