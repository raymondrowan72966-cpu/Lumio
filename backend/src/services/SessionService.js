import { DatabaseError, ValidationError } from '../errors/index.js';
import { sha256Hex } from '../utils/crypto.js';

/**
 * Manages the one-row-per-device Sessions table from the Sprint 2A schema
 * — the structural fix for the cross-device authentication defect found
 * during production validation (a single shared `session` object could
 * never represent "logged in on desktop AND laptop, log out of one without
 * affecting the other"). See SAAS_AUTHENTICATION_SPECIFICATION.md
 * Sections 6-7.
 *
 * Deliberately NOT wired to login/registration in this sprint — every
 * method here is called directly with an already-known `userId`, never
 * derived from credentials. That wiring is explicitly Sprint 2C+'s job.
 *
 * Design note on "Remember Me" and refresh: the `sessions` table has no
 * column recording whether a session was created with Remember Me
 * enabled — and deliberately does not need one. Remember Me is fundamentally
 * about how the refresh token is delivered/stored client-side (a
 * persistent cookie vs. a session-only cookie), not something the server
 * needs to remember about the row itself; the *enforcement* is just
 * `expires_at`. `refreshSession` therefore takes `rememberMe` as an
 * explicit parameter on every call, supplied by the caller from request
 * context, exactly as `createSession` does — this was a real design
 * question (could the table need a column?), considered and resolved
 * without a schema change, not an oversight.
 */
export class SessionService {
  constructor({ db, tokenService, securityConfig } = {}) {
    if (!db) throw new ValidationError('SessionService requires a db client.');
    if (!tokenService) throw new ValidationError('SessionService requires a tokenService.');
    this.db = db;
    this.tokenService = tokenService;
    this.securityConfig = securityConfig;
  }

  /** Creates a new session row for one device/login. Returns the raw
   *  refresh token (give this to the caller to store client-side) — the
   *  database only ever holds its hash. */
  async createSession({ userId, rememberMe = false, deviceId = null, now = Date.now() } = {}) {
    if (!userId) throw new ValidationError('userId is required to create a session.');

    const tokenType = rememberMe ? 'rememberMe' : 'session';
    const { token, tokenHash, expiresAt } = await this.tokenService.generateToken(tokenType, { now });
    const id = crypto.randomUUID();

    try {
      await this.db.run(
        `INSERT INTO sessions (id, user_id, device_id, refresh_token_hash, expires_at, created_at, last_activity_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        [id, userId, deviceId, tokenHash, expiresAt, now, now],
      );
    } catch (err) {
      throw new DatabaseError('Failed to create session.', { cause: String(err) });
    }

    return { sessionId: id, refreshToken: token, expiresAt, deviceId };
  }

  /** Loads a session by its row id — for inspection/admin purposes (e.g. a
   *  future "Active Sessions" UI), not for verifying a presented token (use
   *  validateSession for that, which looks up by the token itself). */
  async loadSession(sessionId) {
    if (!sessionId) throw new ValidationError('sessionId is required.');
    const row = await this.db.first('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    return row || null;
  }

  /** Validates a presented raw refresh token. Returns
   *  `{ valid, reason, session }` — `session` is the loaded row (useful to
   *  the caller for `user_id` etc.) whenever one was found, even if it
   *  turned out invalid, so the caller can log/audit which session a
   *  rejected attempt corresponds to. */
  async validateSession(rawRefreshToken, { now = Date.now() } = {}) {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new ValidationError('A refresh token is required.');
    }

    // refresh_token_hash is UNIQUE — looking it up directly is correct and
    // indexed; recomputing the hash here (rather than asking the caller
    // for it) keeps "how a token is hashed" entirely inside the
    // TokenService/crypto utilities, never duplicated at the call site.
    const candidateHash = await sha256Hex(rawRefreshToken);
    const session = await this.db.first('SELECT * FROM sessions WHERE refresh_token_hash = ?', [candidateHash]);

    if (!session) {
      return { valid: false, reason: 'not_found', session: null };
    }

    const result = await this.tokenService.verifyToken(
      rawRefreshToken,
      { tokenHash: session.refresh_token_hash, expiresAt: session.expires_at, revokedAt: session.revoked_at },
      { now },
    );

    return { valid: result.valid, reason: result.reason, session };
  }

  /** Rotates the refresh token for a still-valid session (sliding expiry —
   *  every use extends it). `rememberMe` must be supplied by the caller
   *  (see class-level note above) — it is not read from the existing row. */
  async refreshSession(rawRefreshToken, { rememberMe = false, now = Date.now() } = {}) {
    const { valid, reason, session } = await this.validateSession(rawRefreshToken, { now });
    if (!valid) {
      return { refreshed: false, reason, refreshToken: null, expiresAt: null };
    }

    const tokenType = rememberMe ? 'rememberMe' : 'session';
    const { token, tokenHash, expiresAt } = await this.tokenService.generateToken(tokenType, { now });

    try {
      await this.db.run(
        'UPDATE sessions SET refresh_token_hash = ?, expires_at = ?, last_activity_at = ? WHERE id = ?',
        [tokenHash, expiresAt, now, session.id],
      );
    } catch (err) {
      throw new DatabaseError('Failed to refresh session.', { cause: String(err) });
    }

    return { refreshed: true, reason: null, refreshToken: token, expiresAt, sessionId: session.id };
  }

  /** Revokes exactly one session (this device only) — the literal fix for
   *  "logging out on the laptop didn't affect the desktop." Idempotent: a
   *  session that's already revoked is left alone, not re-stamped. */
  async revokeSession(sessionId, { now = Date.now() } = {}) {
    if (!sessionId) throw new ValidationError('sessionId is required.');
    try {
      await this.db.run(
        'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
        [now, sessionId],
      );
    } catch (err) {
      throw new DatabaseError('Failed to revoke session.', { cause: String(err) });
    }
  }

  /** Revokes every active session for a user, on every device — used after
   *  a password reset (SAAS_AUTHENTICATION_SPECIFICATION.md Section 7: the
   *  one event that intentionally affects all devices at once). */
  async revokeAllSessionsForUser(userId, { now = Date.now() } = {}) {
    if (!userId) throw new ValidationError('userId is required.');
    try {
      await this.db.run(
        'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
        [now, userId],
      );
    } catch (err) {
      throw new DatabaseError('Failed to revoke sessions.', { cause: String(err) });
    }
  }

  /** Returns sessions eligible for cleanup (expired or revoked) — read-only;
   *  does not delete anything itself. A future scheduled job (flagged as a
   *  risk in Sprint 2A's CHANGELOG) calls this to find candidates, then
   *  deletes them via its own explicit DELETE, kept as a deliberate, visible
   *  step rather than something this method does silently as a side effect. */
  async findCleanupCandidates({ now = Date.now(), limit = 500 } = {}) {
    return this.db.all(
      'SELECT id FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL LIMIT ?',
      [now, limit],
    );
  }
}
