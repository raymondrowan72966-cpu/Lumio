import { DatabaseError } from '../errors/index.js';

export class PasswordResetRepository {
  constructor(db) {
    this.db = db;
  }

  async create({ id, userId, tokenHash, expiresAt, now }) {
    try {
      await this.db.run(
        'INSERT INTO password_resets (id, user_id, reset_token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        [id, userId, tokenHash, now, expiresAt],
      );
    } catch (err) {
      throw new DatabaseError('Failed to create password reset token.', { cause: String(err) });
    }
  }

  async findByTokenHash(tokenHash) {
    try {
      return await this.db.first(
        'SELECT * FROM password_resets WHERE reset_token_hash = ?',
        [tokenHash],
      );
    } catch (err) {
      throw new DatabaseError('Failed to look up password reset token.', { cause: String(err) });
    }
  }

  async markUsed(id, usedAt) {
    try {
      await this.db.run(
        'UPDATE password_resets SET used_at = ? WHERE id = ?',
        [usedAt, id],
      );
    } catch (err) {
      throw new DatabaseError('Failed to mark reset token as used.', { cause: String(err) });
    }
  }

  async countByUserSince(userId, since) {
    try {
      const row = await this.db.first(
        'SELECT COUNT(*) as n FROM password_resets WHERE user_id = ? AND created_at >= ?',
        [userId, since],
      );
      return row?.n ?? 0;
    } catch (err) {
      throw new DatabaseError('Failed to count password reset requests.', { cause: String(err) });
    }
  }

  async invalidatePreviousTokens(userId, now) {
    try {
      await this.db.run(
        'UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
        [now, userId],
      );
    } catch (err) {
      throw new DatabaseError('Failed to invalidate previous reset tokens.', { cause: String(err) });
    }
  }
}
