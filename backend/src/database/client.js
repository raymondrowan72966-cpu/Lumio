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

  /** Executes multiple statements as a single atomic transaction — D1's
   *  `.batch()` guarantees all-or-nothing execution: if any statement
   *  fails, every statement in the batch is rolled back, including ones
   *  that ran successfully earlier in the same call. This is the only
   *  mechanism this client exposes for multi-table writes that must
   *  succeed or fail together (e.g. Sprint 2C's registration: user +
   *  workspace + membership + session in one transaction) — there is no
   *  separate BEGIN/COMMIT/ROLLBACK in the Workers D1 binding API.
   *  `statements` is an array of `{ sql, params }`; callers build these
   *  from already-known values (no async work may happen between
   *  building a statement and calling batch — D1 statements are prepared
   *  and bound synchronously). */
  async function batch(statements) {
    try {
      const prepared = statements.map(({ sql, params = [] }) => d1Database.prepare(sql).bind(...params));
      return await d1Database.batch(prepared);
    } catch (err) {
      logger?.error('D1 batch() failed', { statementCount: statements.length, error: String(err) });
      throw new DatabaseError('Database transaction failed.', { cause: String(err) });
    }
  }

  return { run, first, all, ping, batch };
}
