import { AuthenticationError, PermissionError } from '../errors/index.js';

export function requireAuthenticated(authContext) {
  if (!authContext?.isAuthenticated) {
    throw new AuthenticationError('Authentication required.');
  }
}

export function requireRole(authContext, allowedRoles) {
  requireAuthenticated(authContext);
  const role = authContext.currentMembership?.role;
  if (!role || !allowedRoles.includes(role)) {
    throw new PermissionError('You do not have permission to perform this action.');
  }
}

export const requireWorkspaceOwner = (authContext) =>
  requireRole(authContext, ['workspace_owner']);

export const requireWorkspaceAdministratorOrAbove = (authContext) =>
  requireRole(authContext, ['workspace_owner', 'administrator']);

export function withAuth(handler) {
  return async (request, params, ctx) => {
    requireAuthenticated(ctx.auth);
    return handler(request, params, ctx);
  };
}

export function withRole(allowedRoles, handler) {
  return async (request, params, ctx) => {
    requireRole(ctx.auth, allowedRoles);
    return handler(request, params, ctx);
  };
}
