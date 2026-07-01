import { notImplemented, dataResponse } from '../utils/response.js';
import { ValidationError } from '../errors/index.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository.js';
import { PasswordService } from '../services/PasswordService.js';
import { TokenService } from '../services/TokenService.js';
import { SessionService } from '../services/SessionService.js';
import { AuthService } from '../services/AuthService.js';

/**
 * Route surface only for every endpoint except /auth/register — every
 * other handler still returns 501 until a later sprint implements it, per
 * docs/SAAS_AUTHENTICATION_SPECIFICATION.md. Sprint 2C's single objective
 * (Workspace Owner self-registration via Email & Password) is real below.
 */
async function handleRegister(request, _params, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    throw new ValidationError('Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  // Services are constructed per-request from ctx (config/db/logger) —
  // cheap, stateless construction, no shared mutable state between
  // requests. This is the one place this sprint wires the previously-
  // skeleton AuthService/UserRepository/WorkspaceRepository to the
  // already-real PasswordService/TokenService/SessionService from
  // Sprint 2B.
  const passwordService = new PasswordService(ctx.config.security);
  const tokenService = new TokenService(ctx.config.security);
  const sessionService = new SessionService({ db: ctx.db, tokenService, securityConfig: ctx.config.security });
  const userRepository = new UserRepository(ctx.db);
  const workspaceRepository = new WorkspaceRepository(ctx.db);
  const authService = new AuthService({
    userRepository,
    workspaceRepository,
    passwordService,
    sessionService,
    db: ctx.db,
    logger: ctx.logger,
  });

  ctx.logger.info('registration attempt', { email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined });

  const result = await authService.registerOwner({
    email: body.email,
    password: body.password,
    firstName: body.firstName,
    lastName: body.lastName,
  });

  return dataResponse(result, { status: 201 });
}

export const authRoutes = [
  { method: 'POST', path: '/auth/register', handler: handleRegister },
  { method: 'POST', path: '/auth/login', handler: () => notImplemented('auth.login') },
  { method: 'POST', path: '/auth/logout', handler: () => notImplemented('auth.logout') },
  { method: 'POST', path: '/auth/refresh', handler: () => notImplemented('auth.refresh') },
  { method: 'POST', path: '/auth/password-reset/request', handler: () => notImplemented('auth.passwordResetRequest') },
  { method: 'POST', path: '/auth/password-reset/confirm', handler: () => notImplemented('auth.passwordResetConfirm') },
  { method: 'GET', path: '/auth/oauth/:provider/callback', handler: () => notImplemented('auth.oauthCallback') },
];
