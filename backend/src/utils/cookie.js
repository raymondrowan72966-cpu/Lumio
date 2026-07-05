/**
 * HttpOnly cookie utilities — two cookies per authenticated session:
 *
 *   lumio_access  — short-lived JWT access token (15 min Max-Age).
 *                   Verified by the Worker without a DB query (fast path).
 *                   When missing or expired → Worker returns 401 TOKEN_EXPIRED
 *                   → LumioAPI calls POST /auth/refresh → rotates both cookies.
 *
 *   lumio_session — long-lived opaque refresh token (30 days / session-only).
 *                   Only presented at POST /auth/refresh and GET /auth/session.
 *                   Rotated on every use (prevents refresh token theft via replay).
 *
 * Both cookies: HttpOnly; Secure; SameSite=Lax; Path=/
 * SameSite=Lax: prevents CSRF while allowing top-level navigations (future OAuth).
 * HttpOnly: token never reachable from JavaScript — XSS cannot exfiltrate it.
 */

const SESSION_COOKIE = 'lumio_session';
const ACCESS_COOKIE = 'lumio_access';
const REMEMBER_ME_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;           // 15 minutes — matches JWT exp
const BASE_ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Lax';

// Legacy alias kept so existing callers don't need changing.
const COOKIE_NAME = SESSION_COOKIE;

// ---------------------------------------------------------------------------
// lumio_session — long-lived refresh token
// ---------------------------------------------------------------------------

/** Set-Cookie for the refresh token. Remember Me → 30-day persistent cookie;
 *  otherwise no Max-Age (browser discards on close, server TTL = 24 h). */
export function buildSessionCookie(token, { rememberMe = false } = {}) {
  const maxAge = rememberMe ? `; Max-Age=${REMEMBER_ME_MAX_AGE_SECONDS}` : '';
  return `${SESSION_COOKIE}=${token}; ${BASE_ATTRS}${maxAge}`;
}

/** Clears the refresh token cookie immediately. */
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; ${BASE_ATTRS}; Max-Age=0`;
}

/** Extracts the lumio_session token from the Cookie request header.
 *  Returns null if absent or empty. */
export function parseSessionCookie(request) {
  return _parseCookie(request, SESSION_COOKIE);
}

// ---------------------------------------------------------------------------
// lumio_access — short-lived JWT access token
// ---------------------------------------------------------------------------

/** Set-Cookie for the JWT access token. Max-Age=900 (15 min) lets the
 *  browser expire and discard it automatically when the JWT exp fires,
 *  so the next request falls through to the refresh path rather than
 *  sending a cookie the Worker would immediately reject. */
export function buildAccessTokenCookie(jwt) {
  return `${ACCESS_COOKIE}=${jwt}; ${BASE_ATTRS}; Max-Age=${ACCESS_TOKEN_MAX_AGE_SECONDS}`;
}

/** Clears the access token cookie immediately. */
export function clearAccessTokenCookie() {
  return `${ACCESS_COOKIE}=; ${BASE_ATTRS}; Max-Age=0`;
}

/** Extracts the lumio_access JWT from the Cookie request header.
 *  Returns null if absent or empty. */
export function parseAccessTokenCookie(request) {
  return _parseCookie(request, ACCESS_COOKIE);
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function _parseCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const cookieName = part.slice(0, eqIdx).trim();
    if (cookieName !== name) continue;
    const value = part.slice(eqIdx + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}
