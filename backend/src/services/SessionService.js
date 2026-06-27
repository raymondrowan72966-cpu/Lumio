/**
 * Skeleton only. Real implementation (Authentication sprint) manages the
 * one-row-per-device Sessions table from docs/SAAS_MIGRATION_BLUEPRINT.md
 * Phase 7 — create/refresh/revoke-one/revoke-all, per
 * docs/SAAS_AUTHENTICATION_SPECIFICATION.md Section 7.
 */
export class SessionService {
  constructor({ db, tokenService } = {}) {
    this.db = db;
    this.tokenService = tokenService;
  }

  async createSession(_userId, { _rememberMe } = {}) {
    throw new Error('SessionService.createSession is not implemented yet (Sprint 1: foundation only).');
  }

  async revokeSession(_sessionId) {
    throw new Error('SessionService.revokeSession is not implemented yet (Sprint 1: foundation only).');
  }

  async revokeAllSessionsForUser(_userId) {
    throw new Error('SessionService.revokeAllSessionsForUser is not implemented yet (Sprint 1: foundation only).');
  }
}
