/**
 * Skeleton only. Real implementation (Authentication sprint) issues/verifies
 * the short-lived access token + long-lived refresh token pair specified in
 * docs/SAAS_AUTHENTICATION_SPECIFICATION.md Section 7 — one Session row per
 * device, never a single shared session object.
 */
export class TokenService {
  async issueAccessToken(_userId, _sessionId) {
    throw new Error('TokenService.issueAccessToken is not implemented yet (Sprint 1: foundation only).');
  }

  async issueRefreshToken(_sessionId) {
    throw new Error('TokenService.issueRefreshToken is not implemented yet (Sprint 1: foundation only).');
  }

  async verifyAccessToken(_token) {
    throw new Error('TokenService.verifyAccessToken is not implemented yet (Sprint 1: foundation only).');
  }

  async verifyRefreshToken(_token) {
    throw new Error('TokenService.verifyRefreshToken is not implemented yet (Sprint 1: foundation only).');
  }
}
