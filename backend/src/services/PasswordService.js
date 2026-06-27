import { ValidationError } from '../errors/index.js';
import { secureRandomBytes, bytesToBase64Url, base64UrlToBytes, timingSafeEqual } from '../utils/crypto.js';

/**
 * Production password hashing — PBKDF2-SHA256 via the Web Crypto API
 * (`crypto.subtle`), natively available in the Workers runtime, no external
 * dependency. Explicitly replaces the prototype's non-cryptographic
 * placeholder hash (`_hashPassword` in the original LumioAuth), which its
 * own comment already documented as a stopgap never meant to be a real
 * security boundary — flagged for replacement in
 * docs/SAAS_MIGRATION_BLUEPRINT.md Phase 9.
 *
 * Stored hash format is self-describing:
 *   pbkdf2$<iterations>$<saltBase64Url>$<hashBase64Url>
 * so a future algorithm change (e.g. moving to Argon2 if/when it becomes
 * available in Workers) can recognise and reject — or migrate — an old
 * hash, rather than guessing its shape.
 */
const ALGORITHM_TAG = 'pbkdf2';
const HASH_BYTE_LENGTH = 32; // 256 bits, matching SHA-256's output size

export class PasswordService {
  constructor(securityConfig) {
    if (!securityConfig || !securityConfig.password) {
      throw new ValidationError('PasswordService requires a security config with a `password` policy.');
    }
    this.policy = securityConfig.password;
  }

  /** Throws ValidationError if the password doesn't meet the configured
   *  policy — never silently truncates or "fixes" the input. */
  validateComplexity(password) {
    if (password === null || password === undefined) {
      throw new ValidationError('Password is required.');
    }
    if (typeof password !== 'string') {
      throw new ValidationError('Password must be a string.');
    }
    if (password.length === 0) {
      throw new ValidationError('Password cannot be empty.');
    }
    if (password.length < this.policy.minLength) {
      throw new ValidationError(`Password must be at least ${this.policy.minLength} characters.`);
    }
    if (this.policy.requireMixedCase && !(/[a-z]/.test(password) && /[A-Z]/.test(password))) {
      throw new ValidationError('Password must contain both uppercase and lowercase letters.');
    }
    if (this.policy.requireDigit && !/[0-9]/.test(password)) {
      throw new ValidationError('Password must contain at least one digit.');
    }
  }

  /** Hashes a plaintext password. Throws ValidationError for any input
   *  that fails validateComplexity — the caller (a future registration
   *  flow) should call this expecting that exception, not pre-validate
   *  separately, so there is exactly one source of truth for the policy. */
  async hash(plaintextPassword) {
    this.validateComplexity(plaintextPassword);

    const salt = secureRandomBytes(16);
    const derivedBits = await this._deriveBits(plaintextPassword, salt, this.policy.pbkdf2Iterations);

    return [
      ALGORITHM_TAG,
      String(this.policy.pbkdf2Iterations),
      bytesToBase64Url(salt),
      bytesToBase64Url(new Uint8Array(derivedBits)),
    ].join('$');
  }

  /** Verifies a plaintext password against a stored hash. Returns `true`/
   *  `false` for a correct/wrong password — that is an expected, ordinary
   *  outcome, never an error. Throws ValidationError only when the stored
   *  hash itself is malformed/corrupted (a data-integrity problem, not a
   *  "wrong password" outcome) or when the input shape is invalid. */
  async verify(plaintextPassword, storedHash) {
    if (plaintextPassword === null || plaintextPassword === undefined || typeof plaintextPassword !== 'string') {
      throw new ValidationError('Password is required.');
    }
    if (!storedHash || typeof storedHash !== 'string') {
      throw new ValidationError('Stored hash is required.');
    }

    const parts = storedHash.split('$');
    if (parts.length !== 4 || parts[0] !== ALGORITHM_TAG) {
      throw new ValidationError('Stored password hash is corrupted or in an unrecognized format.');
    }
    const [, iterationsStr, saltB64, hashB64] = parts;
    const iterations = Number.parseInt(iterationsStr, 10);
    if (!Number.isFinite(iterations) || iterations <= 0) {
      throw new ValidationError('Stored password hash is corrupted or in an unrecognized format.');
    }

    let salt, expectedBits;
    try {
      salt = base64UrlToBytes(saltB64);
      expectedBits = base64UrlToBytes(hashB64);
    } catch (err) {
      throw new ValidationError('Stored password hash is corrupted or in an unrecognized format.');
    }
    if (salt.length === 0 || expectedBits.length !== HASH_BYTE_LENGTH) {
      throw new ValidationError('Stored password hash is corrupted or in an unrecognized format.');
    }

    const actualBits = new Uint8Array(await this._deriveBits(plaintextPassword, salt, iterations));
    // Constant-time comparison — never a plain `===`/Buffer.equals, so a
    // wrong-password attempt cannot leak timing information about how many
    // leading bytes happened to match.
    return timingSafeEqual(actualBits, expectedBits);
  }

  async _deriveBits(plaintextPassword, salt, iterations) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(plaintextPassword),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    return crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      keyMaterial,
      HASH_BYTE_LENGTH * 8,
    );
  }
}
