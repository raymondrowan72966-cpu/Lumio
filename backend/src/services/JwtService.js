import { ConfigurationError, ValidationError } from '../errors/index.js';
import { bytesToBase64Url, base64UrlToBytes } from '../utils/crypto.js';

/**
 * Issues and verifies HMAC-SHA256 JWTs — the short-lived access token layer
 * added in Step 6. Stateless: no DB interaction. The signature is computed
 * with SESSION_SECRET (set via `wrangler secret put`), which means the server
 * can verify a token without any database query, enabling the fast auth path.
 *
 * JWT format: base64url(header) + '.' + base64url(payload) + '.' + base64url(sig)
 * Standard HS256 header, pre-computed constant — avoids a base64url encode per request.
 *
 * exp/iat claims use SECONDS (JWT standard), not milliseconds.
 */

// base64url({ "alg": "HS256", "typ": "JWT" }) — standard, constant, no padding needed
const JWT_HEADER_B64 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
const DEV_SECRET_WARNING = '[WARN] SESSION_SECRET not set — using insecure dev-only secret. Never deploy without a real secret.';

export class JwtService {
  constructor(secret, { environment = 'development' } = {}) {
    if (!secret) {
      if (environment !== 'development') {
        throw new ConfigurationError(
          'SESSION_SECRET is required for JWT signing. Set it with: npx wrangler secret put SESSION_SECRET',
        );
      }
      // Development fallback — deterministic but clearly labelled
      console.warn(DEV_SECRET_WARNING);
      secret = 'lumio-dev-only-insecure-secret-do-not-deploy';
    }
    if (typeof secret !== 'string' || secret.length < 16) {
      throw new ConfigurationError('SESSION_SECRET must be a string of at least 16 characters.');
    }
    this._secret = secret;
    this._keyPromise = null;
  }

  _getKey() {
    if (!this._keyPromise) {
      this._keyPromise = crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(this._secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      );
    }
    return this._keyPromise;
  }

  /**
   * Signs a payload object and returns a compact JWT string.
   * Caller is responsible for setting iat and exp (in seconds).
   *
   * @param {object} payload
   * @returns {Promise<string>}
   */
  async sign(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new ValidationError('JWT payload must be a plain object.');
    }
    const payloadB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const input = `${JWT_HEADER_B64}.${payloadB64}`;
    const key = await this._getKey();
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
    const sigB64 = bytesToBase64Url(new Uint8Array(sigBytes));
    return `${input}.${sigB64}`;
  }

  /**
   * Verifies a JWT and returns the parsed payload.
   *
   * Returns:
   *   { valid: true,  payload, reason: null }       — signature ok, not expired
   *   { valid: false, reason: 'expired', payload }   — good sig but exp in the past
   *   { valid: false, reason: 'signature_invalid' }  — bad sig (tampered / wrong key)
   *   { valid: false, reason: 'malformed' }          — not a 3-part JWT
   *   { valid: false, reason: 'missing' }            — falsy input
   *
   * Never throws for ordinary token-lifecycle outcomes — only throws
   * ValidationError for caller-bug input (wrong type).
   *
   * @param {string} token
   * @param {{ now?: number }} opts  — now in ms; defaults to Date.now()
   */
  async verify(token, { now = Date.now() } = {}) {
    if (!token) return { valid: false, reason: 'missing', payload: null };
    if (typeof token !== 'string') throw new ValidationError('token must be a string.');

    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, reason: 'malformed', payload: null };

    const [headerB64, payloadB64, sigB64] = parts;
    const input = `${headerB64}.${payloadB64}`;

    let sigBytes;
    try {
      sigBytes = base64UrlToBytes(sigB64);
    } catch {
      return { valid: false, reason: 'malformed', payload: null };
    }

    const key = await this._getKey();
    const sigValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(input),
    );
    if (!sigValid) return { valid: false, reason: 'signature_invalid', payload: null };

    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));
    } catch {
      return { valid: false, reason: 'malformed', payload: null };
    }

    // exp is in seconds (JWT standard)
    if (!payload.exp || Math.floor(now / 1000) >= payload.exp) {
      return { valid: false, reason: 'expired', payload };
    }

    return { valid: true, payload, reason: null };
  }
}
