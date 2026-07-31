import { DatabaseError } from '../errors/index.js';

export class RateLimitRepository {
  constructor(db) {
    this.db = db;
  }

  async countSince(key, since) {
    try {
      const row = await this.db.get(
        'SELECT COUNT(*) as n FROM rate_limit_events WHERE key = ? AND created_at >= ?',
        [key, since],
      );
      return row?.n ?? 0;
    } catch (err) {
      throw new DatabaseError('Failed to query rate limit events.', { cause: String(err) });
    }
  }

  async record(key, now) {
    try {
      await this.db.run(
        'INSERT INTO rate_limit_events (id, key, created_at) VALUES (?, ?, ?)',
        [crypto.randomUUID(), key, now],
      );
    } catch (err) {
      throw new DatabaseError('Failed to record rate limit event.', { cause: String(err) });
    }
  }
}
