/**
 * Security policy configuration — every numeric/policy value the security
 * services (PasswordService, TokenService, SessionService) use, read from
 * `env` with sensible defaults, never hardcoded inside the services
 * themselves (charter Phase 5 requirement). None of these are secrets —
 * they're policy numbers, safe to default in code and override per
 * environment via plain vars in wrangler.toml if ever needed, same as
 * LOG_LEVEL/ENVIRONMENT in src/config/index.js.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function intFromEnv(env, key, fallback) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadSecurityConfig(env = {}) {
  return {
    password: {
      // SAAS_AUTHENTICATION_SPECIFICATION.md Section 2: "min 8 chars,
      // recommend a basic strength check" — minLength is the hard floor;
      // requireMixedCase/requireDigit are the "basic strength check."
      minLength: intFromEnv(env, 'PASSWORD_MIN_LENGTH', 8),
      requireMixedCase: true,
      requireDigit: true,
      // PBKDF2 iteration count — the Cloudflare Workers Web Crypto
      // implementation enforces a hard platform maximum of 100,000 iterations
      // for PBKDF2 (any higher value throws NotSupportedError at runtime,
      // regardless of CPU budget). 100,000 is therefore both the default and
      // the effective ceiling for any Workers deployment. OWASP's 2023+
      // recommendation for PBKDF2-SHA256 is >= 600,000, which exceeds this
      // platform limit; the trade-off is documented in DECISIONS.md ADR-019.
      // Kept env-overridable so the value can be adjusted if Cloudflare ever
      // raises the cap, without requiring a code change.
      pbkdf2Iterations: intFromEnv(env, 'PASSWORD_PBKDF2_ITERATIONS', 100_000),
    },
    tokens: {
      // Access token: short-lived, per SAAS_AUTHENTICATION_SPECIFICATION.md
      // Section 7.
      accessTokenTtlMs: intFromEnv(env, 'ACCESS_TOKEN_TTL_MINUTES', 15) * MINUTE,
      // Refresh token: "Remember Me" checked = 30 days sliding (Section 7).
      rememberMeRefreshTtlMs: intFromEnv(env, 'REMEMBER_ME_REFRESH_TTL_DAYS', 30) * DAY,
      // Refresh token: "Remember Me" unchecked. The server cannot truly
      // know when a browser closes, so this is a defense-in-depth bound,
      // not the actual enforcement mechanism — the application layer
      // (a future sprint) issues this as a non-persistent session cookie;
      // even if that cookie somehow outlived the browser session, this
      // shorter server-side TTL still caps how long it could be used.
      // Not specified numerically in the authentication spec — documented
      // as a decision in DECISIONS.md.
      sessionOnlyRefreshTtlMs: intFromEnv(env, 'SESSION_ONLY_REFRESH_TTL_HOURS', 24) * HOUR,
      // Password reset: 1 hour, matching the prototype's established
      // precedent (PASSWORD_RESET_TTL_MS in the original LumioAuth) — the
      // authentication spec does not restate a different number, so the
      // existing value carries forward unchanged.
      passwordResetTtlMs: intFromEnv(env, 'PASSWORD_RESET_TTL_HOURS', 1) * HOUR,
      // Email verification: spec recommends 24-48 hours
      // (SAAS_PRODUCT_SPECIFICATION.md Section 2); 48 is chosen as the
      // upper end for friction tolerance — documented in DECISIONS.md.
      emailVerificationTtlMs: intFromEnv(env, 'EMAIL_VERIFICATION_TTL_HOURS', 48) * HOUR,
      // Invitation: 7 calendar days, explicit and exact in
      // SAAS_AUTHENTICATION_SPECIFICATION.md Section 3.
      invitationTtlMs: intFromEnv(env, 'INVITATION_TTL_DAYS', 7) * DAY,
    },
  };
}
