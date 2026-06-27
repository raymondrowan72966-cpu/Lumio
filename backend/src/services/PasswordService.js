/**
 * Skeleton only. Real implementation (Authentication sprint) must use a
 * real, server-side, salted hash (PBKDF2 via WebCrypto, available natively
 * in the Workers runtime — no external dependency needed) — explicitly NOT
 * the non-cryptographic placeholder hash the original prototype used
 * client-side, which docs/SAAS_MIGRATION_BLUEPRINT.md Phase 9 already
 * flags as something this rewrite must not carry over.
 */
export class PasswordService {
  async hash(_plaintextPassword) {
    throw new Error('PasswordService.hash is not implemented yet (Sprint 1: foundation only).');
  }

  async verify(_plaintextPassword, _hash) {
    throw new Error('PasswordService.verify is not implemented yet (Sprint 1: foundation only).');
  }
}
