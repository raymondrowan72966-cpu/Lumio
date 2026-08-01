import { notImplemented, dataResponse } from '../utils/response.js';
import { ValidationError, AuthenticationError } from '../errors/index.js';
import {
  buildSessionCookie, buildAccessTokenCookie,
} from '../utils/cookie.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository.js';
import { PasswordService } from '../services/PasswordService.js';
import { TokenService } from '../services/TokenService.js';
import { SessionService } from '../services/SessionService.js';
import { AuthService } from '../services/AuthService.js';

// ---------------------------------------------------------------------------
// Helpers — mirror the pattern used in auth.js
// ---------------------------------------------------------------------------

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
// PATCH /users/me/password
// ---------------------------------------------------------------------------

async function handleChangePassword(request, _params, ctx) {
  if (!ctx.auth.isAuthenticated) {
    throw new AuthenticationError('Authentication required.');
  }

  let body;
  try {
    body = await request.json();
  } catch (_err) {
    throw new ValidationError('Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  // Infer Remember Me from current session TTL — same threshold as handleRefresh.
  // ctx.auth.session only carries { id } on the JWT fast path (Path 1 in authContext.js);
  // load the authoritative record when expires_at is absent so the inference is correct
  // regardless of which auth path was used.
  const TWENTY_FIVE_HOURS_MS = 25 * 60 * 60 * 1000;
  let sessionExpiresAt = ctx.auth.session?.expires_at;
  if (!sessionExpiresAt && ctx.auth.session?.id) {
    const fullSession = await ctx.sessionService.loadSession(ctx.auth.session.id);
    sessionExpiresAt = fullSession?.expires_at;
  }
  const rememberMe = sessionExpiresAt
    ? sessionExpiresAt - Date.now() > TWENTY_FIVE_HOURS_MS
    : false;

  const authService = buildAuthService(ctx);
  const result = await authService.changePassword({
    userId: ctx.auth.currentUser.id,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
    confirmPassword: body.confirmPassword,
    rememberMe,
  });

  // Re-load user and workspace from DB to build the fresh JWT — the auth
  // context still holds pre-change data, so we fetch a clean snapshot.
  const userRepository = new UserRepository(ctx.db);
  const user = await userRepository.findById(ctx.auth.currentUser.id);

  const { currentWorkspace: w, currentMembership: m } = ctx.auth;

  const jwt = await buildAccessJwt(ctx.jwtService, ctx.config.security, {
    currentUser: user,
    currentWorkspace: w,
    currentMembership: m,
    sessionId: result.session.sessionId,
  });

  return dataResponse(
    { ok: true },
    {
      cookies: [
        buildAccessTokenCookie(jwt),
        buildSessionCookie(result.session.refreshToken, { rememberMe }),
      ],
    },
  );
}

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

export const userRoutes = [
  { method: 'GET',   path: '/users/me',          handler: () => notImplemented('users.me') },
  { method: 'PATCH', path: '/users/me',          handler: () => notImplemented('users.updateMe') },
  { method: 'DELETE', path: '/users/me',         handler: () => notImplemented('users.deleteMe') },
  { method: 'PATCH', path: '/users/me/password', handler: handleChangePassword },
];
