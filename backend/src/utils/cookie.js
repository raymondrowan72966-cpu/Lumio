/**
 * HttpOnly session cookie utilities.
 *
 * Cookie design:
 *   Name:  lumio_session
 *   Attrs: HttpOnly; Secure; SameSite=Lax; Path=/
 *
 * Remember Me = true  → Max-Age = 30 days (matches rememberMeRefreshTtlMs)
 * Remember Me = false → no Max-Age (session cookie; browser discards on close)
 *
 * The same-origin architecture (browser → Pages /api/* proxy → Worker) means
 * the browser always sends this cookie with every /api/* request without any
 * CORS credential handling — it is a same-site cookie from the browser's
 * perspective. SameSite=Lax prevents cross-site request forgery while still
 * allowing top-level navigations (OAuth redirects, email links) to carry the
 * cookie, per the spec requirement.
 *
 * HttpOnly ensures the token is never accessible from JavaScript, which is the
 * entire point of moving away from localStorage: a stored XSS payload cannot
 * read or exfiltrate the session token.
 */

const COOKIE_NAME = 'lumio_session';
const REMEMBER_ME_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const BASE_ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Lax';

/**
 * Builds the Set-Cookie header value for a new session.
 *
 * @param {string}  token
 * @param {{ rememberMe?: boolean }} opts
 * @returns {string}
 */
export function buildSessionCookie(token, { rememberMe = false } = {}) {
  const maxAge = rememberMe ? `; Max-Age=${REMEMBER_ME_MAX_AGE_SECONDS}` : '';
  return `${COOKIE_NAME}=${token}; ${BASE_ATTRS}${maxAge}`;
}

/**
 * Builds a cookie-clearing header value (Max-Age=0 removes the cookie
 * immediately on the client regardless of whether it was set with Max-Age).
 *
 * @returns {string}
 */
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; ${BASE_ATTRS}; Max-Age=0`;
}

/**
 * Extracts the lumio_session token from the Cookie request header.
 * Returns null if the cookie is absent or empty.
 *
 * @param {Request} request
 * @returns {string|null}
 */
export function parseSessionCookie(request) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    if (name !== COOKIE_NAME) continue;
    const value = part.slice(eqIdx + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}
