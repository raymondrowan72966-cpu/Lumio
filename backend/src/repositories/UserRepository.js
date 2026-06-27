import { DatabaseError } from '../errors/index.js';

/**
 * Real implementation against the Sprint 2A `users` table. `email` is
 * always expected already-normalized (lowercase, trimmed) by the caller —
 * this repository does not normalize on read or write, since the schema's
 * own CHECK constraint already rejects a non-normalized value on write,
 * and a caller passing a non-normalized value to findByEmail would simply
 * (and correctly) find nothing, since the stored value can never be
 * anything but normalized.
 */
export class UserRepository {
  constructor(db) {
    this.db = db;
  }

  async findById(id) {
    if (!id) return null;
    const row = await this.db.first('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
    return row || null;
  }

  async findByEmail(email) {
    if (!email) return null;
    const row = await this.db.first('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    return row || null;
  }

  /** Builds (but does not execute) the INSERT statement for a new user —
   *  used both standalone (via `create`, below) and composed into a
   *  larger atomic batch (e.g. Sprint 2C's registration transaction,
   *  which also creates a workspace/membership/session in the same
   *  `db.batch()` call). Building the statement is synchronous and pure;
   *  the caller must have already computed every field (e.g. the password
   *  hash) before calling this. */
  buildCreateStatement(fields) {
    const { id, email, authProvider, passwordHash = null, firstName, lastName = '', displayName, avatarUrl = null, now } = fields;
    return {
      sql: `INSERT INTO users
              (id, email, auth_provider, password_hash, first_name, last_name, display_name, avatar_url, email_verified_at, status, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', ?, ?, NULL)`,
      params: [id, email, authProvider, passwordHash, firstName, lastName, displayName, avatarUrl, now, now],
    };
  }

  /** Standalone create — executes immediately. Not used by Sprint 2C's
   *  registration flow (which needs this row created atomically alongside
   *  the workspace/membership/session, via buildCreateStatement + a single
   *  db.batch() call instead), but kept as the simple path for any future
   *  caller that only ever needs to create a user on its own. */
  async create(fields) {
    const { sql, params } = this.buildCreateStatement(fields);
    try {
      await this.db.run(sql, params);
    } catch (err) {
      throw new DatabaseError('Failed to create user.', { cause: String(err) });
    }
  }

  async update(id, patch) {
    throw new Error('UserRepository.update is not implemented yet (Sprint 2C: registration only).');
  }
}
