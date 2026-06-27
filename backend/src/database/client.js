import { DatabaseError } from '../errors/index.js';

/**
 * Single access point for the D1 binding. There is no connection pooling to
 * manage — a D1 binding is stateless per-request infrastructure supplied by
 * the Workers runtime, not a connection this code opens/closes — but every
 * query still funnels through here so error-wrapping and (later) query
 * logging happen in exactly one place, never duplicated per repository.
 *
 * No application queries exist yet (Sprint 1 is foundation-only) — these
 * three methods are the complete, generic surface every future repository
 * will build on.
 */
export function createDbClient(d1Database, logger) {
  if (!d1Database) {
    throw new DatabaseError('D1 binding was not provided to createDbClient.');
  }

  async function run(sql, params = []) {
    try {
      return await d1Database.prepare(sql).bind(...params).run();
    } catch (err) {
      logger?.error('D1 run() failed', { sql, error: String(err) });
      throw new DatabaseError('Database write failed.', { cause: String(err) });
    }
  }

  async function first(sql, params = []) {
    try {
      return await d1Database.prepare(sql).bind(...params).first();
    } catch (err) {
      logger?.error('D1 first() failed', { sql, error: String(err) });
      throw new DatabaseError('Database read failed.', { cause: String(err) });
    }
  }

  async function all(sql, params = []) {
    try {
      const result = await d1Database.prepare(sql).bind(...params).all();
      return result.results || [];
    } catch (err) {
      logger?.error('D1 all() failed', { sql, error: String(err) });
      throw new DatabaseError('Database read failed.', { cause: String(err) });
    }
  }

  /** Verifies the binding is actually reachable — used by the health check
   *  route, not by application startup (Workers have no startup phase). */
  async function ping() {
    try {
      await d1Database.prepare('SELECT 1').first();
      return true;
    } catch (err) {
      logger?.error('D1 ping() failed', { error: String(err) });
      return false;
    }
  }

  return { run, first, all, ping };
}
