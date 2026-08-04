import { parseSessionCookie, parseAccessTokenCookie } from '../utils/cookie.js';

export const ANONYMOUS_CONTEXT = Object.freeze({
  isAuthenticated: false,
  currentUser: null,
  currentWorkspace: null,
  currentMembership: null,
  session: null,
});

/**
 * Resolves the authentication context for every incoming request.
 *
 * Priority  (per Step 6 specification):
 *   1. lumio_access JWT (HttpOnly cookie) — fast path, zero DB queries.
 *      Verifies HMAC-SHA256 signature and exp claim only.
 *      If valid → return context immediately with no DB interaction.
 *      If expired or absent → fall through to step 2.
 *      If malformed / bad signature → fall through to step 2.
 *
 *   2. lumio_session refresh token (HttpOnly cookie or Bearer header).
 *      Full DB path: sessions + users + workspace_members + workspace.
 *      Used for: GET /auth/session (warm-up on page load), POST /auth/refresh,
 *      and any request arriving before the access JWT has been issued or
 *      after it has been expired/deleted by the browser (Max-Age elapsed).
 *
 *   3. Neither credential → ANONYMOUS_CONTEXT (isAuthenticated: false).
 *      Protected routes return 401 AUTHENTICATION_ERROR, which LumioAPI's
 *      DOMContentLoaded handler catches and redirects to #/login.
 *
 * Result: authenticated routes are served without 401 round-trips — the
 * refresh token path handles silent token renewal end-to-end. The explicit
 * POST /auth/refresh route exists for client-initiated rotation (LumioAPI
 * auto-refresh) and for non-browser clients that want explicit control.
 *
 * @param {Request} request
 * @param {{ db, sessionService, jwtService }} deps
 */
export async function loadAuthContext(request, { db, sessionService, jwtService }) {
  // --- Path 1: Access JWT fast path (no DB) --------------------------------
  const rawJwt = parseAccessTokenCookie(request);
  if (rawJwt) {
    const result = await jwtService.verify(rawJwt);

    if (result.valid) {
      const p = result.payload;
      return {
        isAuthenticated: true,
        // Reconstruct DB-row-shaped objects from JWT claims so route handlers
        // (which use snake_case column names) continue to work unchanged.
        currentUser: {
          id: p.sub,
          email: p.email,
          first_name: p.firstName,
          last_name: p.lastName,
          display_name: p.displayName,
          auth_provider: p.authProvider,
          created_at: p.createdAt,
        },
        currentWorkspace: p.workspaceId ? {
          id: p.workspaceId,
          name: p.workspaceName,
          owner_id: p.workspaceOwnerId,
        } : null,
        currentMembership: p.workspaceId ? {
          workspace_id: p.workspaceId,
          role: p.role,
        } : null,
        // Minimal session object — handlers only need id for revoking on logout.
        session: { id: p.sid },
      };
    }
    // JWT expired, malformed, or bad signature → fall through to refresh token.
  }

  // --- Path 2: Refresh token (cookie or Bearer header) — full DB path ------
  let rawRefreshToken = parseSessionCookie(request);
  if (!rawRefreshToken) {
    const authHeader = request.headers.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match) rawRefreshToken = match[1].trim();
  }
  if (!rawRefreshToken) return ANONYMOUS_CONTEXT;

  const { valid, session } = await sessionService.validateSession(rawRefreshToken);
  if (!valid || !session) return ANONYMOUS_CONTEXT;

  const currentUser = await db.first(
    'SELECT id, email, first_name, last_name, display_name, auth_provider, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
    [session.user_id],
  );
  if (!currentUser) return ANONYMOUS_CONTEXT;

  const memberships = await db.all(
    "SELECT * FROM workspace_members WHERE user_id = ? AND status = 'active'",
    [currentUser.id],
  );

  if (memberships.length === 0) return ANONYMOUS_CONTEXT;

  let currentWorkspace = null;
  let currentMembership = null;
  if (memberships.length === 1) {
    currentMembership = memberships[0];
    currentWorkspace = await db.first(
      'SELECT * FROM workspaces WHERE id = ? AND deleted_at IS NULL',
      [currentMembership.workspace_id],
    );
  }

  return {
    isAuthenticated: true,
    currentUser,
    currentWorkspace,
    currentMembership,
    session,
  };
}
