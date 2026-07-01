export const ANONYMOUS_CONTEXT = Object.freeze({
  isAuthenticated: false,
  currentUser: null,
  currentWorkspace: null,
  currentMembership: null,
  session: null,
});

export async function loadAuthContext(request, { db, sessionService }) {
  const authHeader = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return ANONYMOUS_CONTEXT;
  const rawToken = match[1].trim();
  if (!rawToken) return ANONYMOUS_CONTEXT;

  const { valid, session } = await sessionService.validateSession(rawToken);
  if (!valid || !session) return ANONYMOUS_CONTEXT;

  const currentUser = await db.first(
    'SELECT id, email, first_name, last_name, display_name, auth_provider, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
    [session.user_id],
  );
  if (!currentUser) return ANONYMOUS_CONTEXT;

  const memberships = await db.all(
    'SELECT * FROM workspace_members WHERE user_id = ?',
    [currentUser.id],
  );

  let currentWorkspace = null;
  let currentMembership = null;
  if (memberships.length === 1) {
    currentMembership = memberships[0];
    currentWorkspace = await db.first(
      'SELECT * FROM workspaces WHERE id = ? AND deleted_at IS NULL',
      [currentMembership.workspace_id],
    );
  }
  // Multiple memberships → no single active workspace until multi-workspace
  // selector (auth spec Section 8) is built in a later sprint.

  return { isAuthenticated: true, currentUser, currentWorkspace, currentMembership, session };
}
