import { dataResponse } from '../utils/response.js';
import { ValidationError, AuthenticationError } from '../errors/index.js';
import {
  buildSessionCookie, clearSessionCookie,
  buildAccessTokenCookie, clearAccessTokenCookie,
  parseSessionCookie,
} from '../utils/cookie.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository.js';
import { PasswordService } from '../services/PasswordService.js';
import { TokenService } from '../services/TokenService.js';
import { SessionService } from '../services/SessionService.js';
import { AuthService } from '../services/AuthService.js';
import { PasswordResetRepository } from '../repositories/PasswordResetRepository.js';
import { RateLimitRepository } from '../repositories/RateLimitRepository.js';
import { EmailService } from '../services/EmailService.js';

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
  const passwordResetRepository = new PasswordResetRepository(ctx.db);
  const rateLimitRepository = new RateLimitRepository(ctx.db);
  const emailService = new EmailService(ctx.config.resendApiKey, ctx.config.appBaseUrl);
  return new AuthService({
    userRepository,
    workspaceRepository,
    passwordService,
    sessionService,
    tokenService,
    passwordResetRepository,
    rateLimitRepository,
    emailService,
    appBaseUrl: ctx.config.appBaseUrl,
    db: ctx.db,
    logger: ctx.logger,
  });
}

/**
 * Builds and signs an access JWT from an authenticated auth context.
 * Returns the compact JWT string.
 *
 * Called by every handler that issues or renews an access token:
 * login, register, session, refresh.
 */
async function buildAccessJwt(jwtService, securityConfig, { currentUser: u, currentWorkspace: w, currentMembership: m, sessionId }) {
  const now = Date.now();
  const ttlMs = securityConfig.tokens.accessTokenTtlMs;
  return jwtService.sign({
    sub: u.id,
    sid: sessionId,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    displayName: u.display_name,
    authProvider: u.auth_provider,
    createdAt: u.created_at,
    workspaceId: w ? w.id : null,
    workspaceName: w ? w.name : null,
    workspaceOwnerId: w ? (w.owner_id || w.ownerId || null) : null,
    role: m ? m.role : null,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + ttlMs) / 1000),
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

  const membership = { workspaceId: result.workspace.id, role: 'workspace_owner' };

  // Issue access JWT + refresh token cookie — user is authenticated immediately.
  const currentUser = {
    id: result.user.id,
    email: result.user.email,
    first_name: result.user.firstName,
    last_name: result.user.lastName,
    display_name: result.user.displayName,
    auth_provider: 'email',
    created_at: result.user.createdAt,
  };
  const currentWorkspace = { id: result.workspace.id, name: result.workspace.name, owner_id: result.user.id };
  const currentMembership = { workspace_id: result.workspace.id, role: 'workspace_owner' };

  const jwt = await buildAccessJwt(ctx.jwtService, ctx.config.security, {
    currentUser,
    currentWorkspace,
    currentMembership,
    sessionId: result.session.sessionId,
  });

  return dataResponse(
    { user: result.user, workspace: result.workspace, membership },
    {
      status: 201,
      cookies: [
        buildAccessTokenCookie(jwt),
        buildSessionCookie(result.session.refreshToken, { rememberMe: false }),
      ],
    },
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
  const result = await authService.login({ email: body.email, password: body.password, rememberMe });

  const jwt = await buildAccessJwt(ctx.jwtService, ctx.config.security, {
    currentUser: {
      id: result.user.id,
      email: result.user.email,
      first_name: result.user.firstName,
      last_name: result.user.lastName,
      display_name: result.user.displayName,
      auth_provider: result.user.authProvider,
      created_at: result.user.createdAt,
    },
    currentWorkspace: result.workspace ? {
      id: result.workspace.id,
      name: result.workspace.name,
      owner_id: result.workspace.ownerId,
    } : null,
    currentMembership: result.membership ? {
      workspace_id: result.membership.workspaceId,
      role: result.membership.role,
    } : null,
    sessionId: result.session.sessionId,
  });

  return dataResponse(
    { user: result.user, workspace: result.workspace, membership: result.membership },
    {
      cookies: [
        buildAccessTokenCookie(jwt),
        buildSessionCookie(result.session.refreshToken, { rememberMe }),
      ],
    },
  );
}

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
async function handleLogout(_request, _params, ctx) {
  if (ctx.auth.isAuthenticated && ctx.auth.session) {
    const authService = buildAuthService(ctx);
    await authService.logout({ sessionId: ctx.auth.session.id });
  }

  return dataResponse(
    { ok: true },
    {
      cookies: [clearAccessTokenCookie(), clearSessionCookie()],
    },
  );
}

// ---------------------------------------------------------------------------
// GET /auth/session
// ---------------------------------------------------------------------------
async function handleSession(_request, _params, ctx) {
  if (!ctx.auth.isAuthenticated) {
    throw new AuthenticationError('No active session.');
  }

  const { currentUser: u, currentWorkspace: w, currentMembership: m, session } = ctx.auth;

  // Issue a fresh access JWT so the page load always warms up the fast path.
  const jwt = await buildAccessJwt(ctx.jwtService, ctx.config.security, {
    currentUser: u,
    currentWorkspace: w,
    currentMembership: m,
    sessionId: session.id,
  });

  return dataResponse(
    {
      user: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        displayName: u.display_name,
        authProvider: u.auth_provider,
        createdAt: u.created_at,
      },
      workspace: w ? { id: w.id, name: w.name, ownerId: w.owner_id } : null,
      membership: m ? { workspaceId: m.workspace_id, role: m.role } : null,
    },
    { cookies: [buildAccessTokenCookie(jwt)] },
  );
}

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------
async function handleRefresh(request, _params, ctx) {
  // The refresh token must arrive via the lumio_session cookie.
  // authContext validated it via the DB path (path 2/3) before this handler
  // is called — so ctx.auth.isAuthenticated is true if the session is valid.
  if (!ctx.auth.isAuthenticated) {
    throw new AuthenticationError('No active session.');
  }

  const rawRefreshToken = parseSessionCookie(request);
  if (!rawRefreshToken) {
    throw new AuthenticationError('No refresh token present.');
  }

  // Infer Remember Me from the session's remaining TTL:
  // sessionOnlyRefreshTtlMs = 24 h; rememberMeRefreshTtlMs = 30 days.
  // If more than 25 hours remain → this is a Remember Me session.
  const TWENTY_FIVE_HOURS_MS = 25 * 60 * 60 * 1000;
  const sessionExpiresAt = ctx.auth.session?.expires_at;
  const rememberMe = sessionExpiresAt
    ? sessionExpiresAt - Date.now() > TWENTY_FIVE_HOURS_MS
    : false;

  const { refreshed, refreshToken: newRefreshToken, sessionId } = await ctx.sessionService.refreshSession(
    rawRefreshToken,
    { rememberMe },
  );

  if (!refreshed) {
    throw new AuthenticationError('Session could not be refreshed.');
  }

  const { currentUser: u, currentWorkspace: w, currentMembership: m } = ctx.auth;

  const jwt = await buildAccessJwt(ctx.jwtService, ctx.config.security, {
    currentUser: u,
    currentWorkspace: w,
    currentMembership: m,
    sessionId,
  });

  return dataResponse(
    { ok: true },
    {
      cookies: [
        buildAccessTokenCookie(jwt),
        buildSessionCookie(newRefreshToken, { rememberMe }),
      ],
    },
  );
}

// ---------------------------------------------------------------------------
// POST /auth/password-reset/request
// ---------------------------------------------------------------------------
async function handlePasswordResetRequest(request, _params, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (_err) {
    throw new ValidationError('Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const authService = buildAuthService(ctx);
  await authService.requestPasswordReset({ email: body.email, ip });
  return dataResponse({ ok: true });
}

// ---------------------------------------------------------------------------
// POST /auth/password-reset/confirm
// ---------------------------------------------------------------------------
async function handlePasswordResetConfirm(request, _params, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (_err) {
    throw new ValidationError('Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const authService = buildAuthService(ctx);
  await authService.confirmPasswordReset({
    token: body.token,
    newPassword: body.newPassword,
    confirmPassword: body.confirmPassword,
  });
  return dataResponse({ ok: true });
}

export const authRoutes = [
  { method: 'POST', path: '/auth/register',                  handler: handleRegister },
  { method: 'POST', path: '/auth/login',                     handler: handleLogin },
  { method: 'POST', path: '/auth/logout',                    handler: handleLogout },
  { method: 'GET',  path: '/auth/session',                   handler: handleSession },
  { method: 'POST', path: '/auth/refresh',                   handler: handleRefresh },
  { method: 'POST', path: '/auth/password-reset/request',    handler: handlePasswordResetRequest },
  { method: 'POST', path: '/auth/password-reset/confirm',    handler: handlePasswordResetConfirm },
  { method: 'GET',  path: '/auth/oauth/:provider/callback',  handler: (_req, _p, _ctx) => { throw new ValidationError('OAuth is not implemented yet.'); } },
];
