import { ValidationError } from '../errors/index.js';
import { generateSecureToken, sha256Hex, timingSafeEqual, expiryFromNow, isExpired } from '../utils/crypto.js';

/**
 * The token *engine* — generation, hashing, and verification logic shared
 * by every token type this sprint is asked to support. Deliberately
 * stateless: it never touches the database itself. A future
 * SessionService/AuthService stores the `tokenHash` this returns (in
 * `sessions.refresh_token_hash` or `password_resets.reset_token_hash`,
 * per the Sprint 2A schema) and later passes the stored row back into
 * `verifyToken` for checking — this service never does the storing or
 * looking-up itself.
 *
 * The five types match exactly what this sprint specifies: 'session' (the
 * refresh token for a non-"Remember Me" login), 'rememberMe' (the
 * refresh token for a "Remember Me" login — same shape, different TTL),
 * 'passwordReset', 'emailVerification', 'invitation'. Short-lived access
 * tokens are deliberately out of this list — they're a stateless,
 * signature-based concern (not a hashed-and-stored lookup token), and
 * remain a future sprint's responsibility; `accessTokenTtlMs` already
 * exists in the security config for when that's built.
 */
const TOKEN_TYPE_TTL_KEY = {
  session: 'sessionOnlyRefreshTtlMs',
  rememberMe: 'rememberMeRefreshTtlMs',
  passwordReset: 'passwordResetTtlMs',
  emailVerification: 'emailVerificationTtlMs',
  invitation: 'invitationTtlMs',
};

export class TokenService {
  constructor(securityConfig) {
    if (!securityConfig || !securityConfig.tokens) {
      throw new ValidationError('TokenService requires a security config with a `tokens` policy.');
    }
    this.tokenConfig = securityConfig.tokens;
  }

  /** Generates a new raw token + its hash + its expiry for the given type.
   *  Returns `{ token, tokenHash, expiresAt }`. `token` is the only value
   *  ever handed to the end user (in a URL, a cookie, a response body);
   *  `tokenHash` is the only value a caller should ever write to the
   *  database. */
  async generateToken(type, { now = Date.now(), ttlMs } = {}) {
    const ttlKey = TOKEN_TYPE_TTL_KEY[type];
    if (!ttlKey) {
      throw new ValidationError(`Unknown token type: "${type}".`, { knownTypes: Object.keys(TOKEN_TYPE_TTL_KEY) });
    }
    const effectiveTtlMs = ttlMs !== undefined ? ttlMs : this.tokenConfig[ttlKey];
    if (!Number.isFinite(effectiveTtlMs) || effectiveTtlMs <= 0) {
      throw new ValidationError(`Invalid TTL for token type "${type}".`, { ttlMs: effectiveTtlMs });
    }

    const token = generateSecureToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = expiryFromNow(effectiveTtlMs, now);

    return { token, tokenHash, expiresAt };
  }

  /**
   * Verifies a raw token against a previously-stored record.
   * `record` is whatever the caller loaded from the database — expected
   * shape: `{ tokenHash, expiresAt, revokedAt }` (callers pass `revokedAt:
   * null` for token types with no revocation concept, e.g. password
   * resets use `usedAt` under a different name — map it to `revokedAt`
   * when calling this, rather than this function knowing every table's
   * column name).
   *
   * Returns `{ valid: boolean, reason: string|null }` — never throws for
   * an ordinary "this token doesn't check out" outcome (wrong token,
   * expired, revoked); only throws ValidationError for malformed input
   * (missing record, non-string token), which is a caller bug, not a
   * token-lifecycle outcome.
   */
  async verifyToken(rawToken, record, { now = Date.now() } = {}) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new ValidationError('Token is required.');
    }
    if (!record || typeof record.tokenHash !== 'string' || typeof record.expiresAt !== 'number') {
      throw new ValidationError('A valid token record (tokenHash, expiresAt) is required.');
    }

    if (record.revokedAt) {
      return { valid: false, reason: 'revoked' };
    }
    if (isExpired(record.expiresAt, now)) {
      return { valid: false, reason: 'expired' };
    }

    const candidateHash = await sha256Hex(rawToken);
    // Constant-time comparison of the two hex digests — same rationale as
    // PasswordService.verify: a tampered/guessed token must not be
    // distinguishable from a wrong one by response timing.
    if (!timingSafeEqual(candidateHash, record.tokenHash)) {
      return { valid: false, reason: 'mismatch' };
    }

    return { valid: true, reason: null };
  }
}
