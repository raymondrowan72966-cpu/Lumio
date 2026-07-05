import { notImplemented, dataResponse } from '../utils/response.js';
import { ValidationError, AuthenticationError } from '../errors/index.js';
import { buildSessionCookie, clearSessionCookie } from '../utils/cookie.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository.js';
import { PasswordService } from '../services/PasswordService.js';
import { TokenService } from '../services/TokenService.js';
import { SessionService } from '../services/SessionService.js';
import { AuthService } from '../services/AuthService.js';

/**
 * Constructs a fully-wired AuthService from the request context.
 * Called per-request — cheap, stateless, no shared mutable state.
 */
function buildAuthService(ctx) {
  const passwordService = new PasswordService(ctx.config.security);
  const tokenService = new TokenService(ctx.config.security);
  const sessionService = new SessionService({ db: ctx.db, tokenService, securityConfig: ctx.config.security });
  const userRepository = new UserRepository(ctx.db);
  const workspaceRepository = new WorkspaceRepository(ctx.db);
  return new AuthService({
    userRepository,
    workspaceRepository,
    passwordService,
    sessionService,
    db: ctx.db,
    logger: ctx.logger,
  });
}

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------
async function handleRegister(request, _params, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (_err) {
    throw new ValidationError('Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  ctx.logger.info('registration attempt', {
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined,
  });

  const authService = buildAuthService(ctx);
  const result = await authService.registerOwner({
    email: body.email,
    password: body.password,
    firstName: body.firstName,
    lastName: body.lastName,
  });

  // Set the session cookie immediately so the user is authenticated right
  // after registration without a separate login step. The JSON body retains
  // its existing shape — additive change only.
  const cookie = buildSessionCookie(result.session.refreshToken, { rememberMe: false });

  return dataResponse(
    {
      user: result.user,
      workspace: result.workspace,
      membership: { workspaceId: result.workspace.id, role: 'workspace_owner' },
    },
    { status: 201, headers: { 'Set-Cookie': cookie } },
  );
}

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
async function handleLogin(request, _params, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (_err) {
    throw new ValidationError('Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const rememberMe = body.rememberMe === true;

  ctx.logger.info('login attempt', {
    email: typeof body.email === 'string' ? body.email.trim().toLowerCase() : undefined,
  });

  const authService = buildAuthService(ctx);
  const result = await authService.login({
    email: body.email,
    password: body.password,
    rememberMe,
  });

  // The raw refresh token is delivered ONLY as an HttpOnly cookie — never
  // in the JSON response body. This prevents JavaScript (and thus XSS) from
  // ever reading the session token.
  const cookie = buildSessionCookie(result.session.refreshToken, { rememberMe });

  return dataResponse(
    { user: result.user, workspace: result.workspace, membership: result.membership },
    { headers: { 'Set-Cookie': cookie } },
  );
}

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
async function handleLogout(_request, _params, ctx) {
  // Revoke the session if one was loaded (auth context is already populated by
  // loadAuthContext in index.js). Idempotent: works even if the session is
  // already revoked, expired, or absent — we always clear the cookie.
  if (ctx.auth.isAuthenticated && ctx.auth.session) {
    const authService = buildAuthService(ctx);
    await authService.logout({ sessionId: ctx.auth.session.id });
  }

  return dataResponse(
    { ok: true },
    { headers: { 'Set-Cookie': clearSessionCookie() } },
  );
}

// ---------------------------------------------------------------------------
// GET /auth/session
// ---------------------------------------------------------------------------
async function handleSession(_request, _params, ctx) {
  if (!ctx.auth.isAuthenticated) {
    throw new AuthenticationError('No active session.');
  }

  const { currentUser: u, currentWorkspace: w, currentMembership: m } = ctx.auth;

  return dataResponse({
    user: {
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      displayName: u.display_name,
      authProvider: u.auth_provider,
      createdAt: u.created_at,
    },
    workspace: w ? {
      id: w.id,
      name: w.name,
      ownerId: w.owner_id,
    } : null,
    membership: m ? {
      workspaceId: m.workspace_id,
      role: m.role,
    } : null,
  });
}

export const authRoutes = [
  { method: 'POST', path: '/auth/register',                  handler: handleRegister },
  { method: 'POST', path: '/auth/login',                     handler: handleLogin },
  { method: 'POST', path: '/auth/logout',                    handler: handleLogout },
  { method: 'GET',  path: '/auth/session',                   handler: handleSession },
  { method: 'POST', path: '/auth/refresh',                   handler: () => notImplemented('auth.refresh') },
  { method: 'POST', path: '/auth/password-reset/request',    handler: () => notImplemented('auth.passwordResetRequest') },
  { method: 'POST', path: '/auth/password-reset/confirm',    handler: () => notImplemented('auth.passwordResetConfirm') },
  { method: 'GET',  path: '/auth/oauth/:provider/callback',  handler: () => notImplemented('auth.oauthCallback') },
];
