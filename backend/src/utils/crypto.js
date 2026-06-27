/**
 * Shared, low-level security primitives — every service in this sprint
 * (PasswordService, TokenService, SessionService) builds on exactly these
 * functions rather than each reimplementing random generation, encoding, or
 * comparison. Uses only the Web Crypto API (`crypto.subtle`,
 * `crypto.getRandomValues`) already available natively in the Workers
 * runtime — no external crypto dependency.
 */

/** Cryptographically secure random bytes, base64url-encoded (URL/cookie/
 *  header-safe, no padding) — used for raw tokens (session refresh tokens,
 *  password reset tokens, etc.) and for password salts. */
export function secureRandomBytes(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A new high-entropy, URL-safe random token — the raw value handed to the
 *  caller (embedded in a link, returned as a refresh token, etc.). Never
 *  store this value itself; store only sha256Hex(token) (below). 32 bytes
 *  (256 bits) is comfortably more entropy than any realistic brute-force
 *  budget needs. */
export function generateSecureToken() {
  return bytesToBase64Url(secureRandomBytes(32));
}

/** SHA-256 hex digest — used to hash high-entropy tokens (sessions,
 *  password resets, invitations, email verification) before storage.
 *  Deliberately NOT used for passwords — passwords are low-entropy,
 *  human-chosen input and need a slow, salted KDF (PasswordService),
 *  whereas these tokens are already 256 bits of random data, so a fast
 *  hash is appropriate and sufficient (the threat model is "don't store
 *  the raw token, in case the database leaks," not "resist brute force,"
 *  since brute-forcing 256 bits of entropy is not a realistic concern). */
export async function sha256Hex(input) {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two equal-meaning-length strings — prevents
 *  a timing side-channel from leaking how many leading characters of a
 *  guess matched a secret (token, hash, etc.). Workers' Web Crypto API has
 *  no built-in timingSafeEqual (unlike Node's `crypto` module), so this is
 *  a small manual implementation: XOR every byte and only branch once, on
 *  the accumulated result, after the full length has been walked
 *  regardless of where a mismatch occurred. Inputs of different lengths
 *  are never equal, but that comparison itself is two integers (an O(1),
 *  non-secret-dependent length check), not the secret-dependent byte
 *  comparison this function exists to protect. */
export function timingSafeEqual(a, b) {
  const bytesA = typeof a === 'string' ? new TextEncoder().encode(a) : a;
  const bytesB = typeof b === 'string' ? new TextEncoder().encode(b) : b;
  if (bytesA.length !== bytesB.length) return false;
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

/** Adds `ttlMs` to `now` (defaults to the current time) — the one place
 *  every service computes an expiry timestamp, so the unit (epoch
 *  milliseconds, matching every `*_at INTEGER` column from the Sprint 2A
 *  schema) is never accidentally inconsistent between services. */
export function expiryFromNow(ttlMs, now = Date.now()) {
  return now + ttlMs;
}

export function isExpired(expiresAt, now = Date.now()) {
  return now >= expiresAt;
}
