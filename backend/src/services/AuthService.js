/**
 * Skeleton only. Real implementation (Authentication sprint) wires together
 * UserRepository + WorkspaceRepository + PasswordService + SessionService
 * to implement registration, login, and the invitation-acceptance flow
 * exactly as specified in docs/SAAS_AUTHENTICATION_SPECIFICATION.md.
 * Deliberately depends only on already-skeletoned collaborators, never on
 * anything concrete, so swapping any one implementation later (e.g. a
 * different password hashing approach) never requires changing this class.
 */
export class AuthService {
  constructor({ userRepository, workspaceRepository, passwordService, sessionService } = {}) {
    this.userRepository = userRepository;
    this.workspaceRepository = workspaceRepository;
    this.passwordService = passwordService;
    this.sessionService = sessionService;
  }

  async registerOwner(_fields) {
    throw new Error('AuthService.registerOwner is not implemented yet (Sprint 1: foundation only).');
  }

  async login(_email, _password, { _rememberMe } = {}) {
    throw new Error('AuthService.login is not implemented yet (Sprint 1: foundation only).');
  }

  async logout(_sessionId) {
    throw new Error('AuthService.logout is not implemented yet (Sprint 1: foundation only).');
  }

  async acceptInvitation(_token, _credentials) {
    throw new Error('AuthService.acceptInvitation is not implemented yet (Sprint 1: foundation only).');
  }
}
