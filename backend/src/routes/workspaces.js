import { dataResponse, notImplemented } from '../utils/response.js';
import { ValidationError, AuthenticationError, PermissionError } from '../errors/index.js';
import { requireWorkspaceOwner } from '../middleware/authorize.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository.js';
import { InvitationRepository } from '../repositories/InvitationRepository.js';
import { PasswordService } from '../services/PasswordService.js';
import { InvitationService } from '../services/InvitationService.js';
import { EmailService } from '../services/EmailService.js';

// ---------------------------------------------------------------------------
// Service factory — per-request, stateless, same pattern as auth.js
// ---------------------------------------------------------------------------

function buildInvitationService(ctx) {
  const userRepository = new UserRepository(ctx.db);
  const workspaceRepository = new WorkspaceRepository(ctx.db);
  const invitationRepository = new InvitationRepository(ctx.db);
  const passwordService = new PasswordService(ctx.config.security);
  const emailService = new EmailService(
    ctx.config.resendApiKey,
    ctx.config.appBaseUrl,
    ctx.config.emailFromAddress,
  );
  return new InvitationService({
    invitationRepository,
    userRepository,
    workspaceRepository,
    passwordService,
    tokenService: ctx.tokenService,
    emailService,
    appBaseUrl: ctx.config.appBaseUrl,
    db: ctx.db,
    logger: ctx.logger,
  });
}

// ---------------------------------------------------------------------------
// POST /workspaces/:id/invitations
// ---------------------------------------------------------------------------

async function handleInvite(request, params, ctx) {
  if (!ctx.auth.isAuthenticated) {
    throw new AuthenticationError('Authentication required.');
  }
  requireWorkspaceOwner(ctx.auth);

  // The caller may only invite to their own workspace
  const workspaceId = params.id;
  if (!ctx.auth.currentWorkspace || ctx.auth.currentWorkspace.id !== workspaceId) {
    throw new PermissionError('You may only invite users to your own workspace.');
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

  const svc = buildInvitationService(ctx);
  const result = await svc.sendInvitation({
    workspaceId,
    inviterUserId: ctx.auth.currentUser.id,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    role: body.role,
    authProvider: body.authProvider,
  });

  return dataResponse(result, { status: 201 });
}

// ---------------------------------------------------------------------------
// GET /workspaces/:id/invitations
// ---------------------------------------------------------------------------

async function handleListInvitations(request, params, ctx) {
  if (!ctx.auth.isAuthenticated) {
    throw new AuthenticationError('Authentication required.');
  }
  requireWorkspaceOwner(ctx.auth);

  const workspaceId = params.id;
  if (!ctx.auth.currentWorkspace || ctx.auth.currentWorkspace.id !== workspaceId) {
    throw new PermissionError('You may only view invitations for your own workspace.');
  }

  const svc = buildInvitationService(ctx);
  const invitations = await svc.listPending(workspaceId);
  return dataResponse({ invitations });
}

// ---------------------------------------------------------------------------
// GET /invitations/:token
// ---------------------------------------------------------------------------

async function handleGetInvitation(request, params, ctx) {
  const svc = buildInvitationService(ctx);
  const invitation = await svc.getInvitation(params.token);
  if (!invitation) {
    throw new ValidationError('This invitation link is invalid, expired, or has already been used.');
  }
  return dataResponse({ invitation });
}

// ---------------------------------------------------------------------------
// POST /invitations/:token/accept
// ---------------------------------------------------------------------------

async function handleAcceptInvitation(request, params, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (_err) {
    throw new ValidationError('Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }

  const svc = buildInvitationService(ctx);
  const result = await svc.acceptInvitation({
    rawToken: params.token,
    password: body.password,
  });

  return dataResponse(result);
}

// ---------------------------------------------------------------------------
// DELETE /invitations/:id
// ---------------------------------------------------------------------------

async function handleRevokeInvitation(request, params, ctx) {
  if (!ctx.auth.isAuthenticated) {
    throw new AuthenticationError('Authentication required.');
  }
  requireWorkspaceOwner(ctx.auth);

  const svc = buildInvitationService(ctx);
  const result = await svc.revokeInvitation({
    invitationId: params.id,
    requestingUserId: ctx.auth.currentUser.id,
  });

  return dataResponse(result);
}

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

export const workspaceRoutes = [
  { method: 'GET',    path: '/workspaces/:id',                   handler: () => notImplemented('workspaces.get') },
  { method: 'PATCH',  path: '/workspaces/:id',                   handler: () => notImplemented('workspaces.update') },
  { method: 'DELETE', path: '/workspaces/:id',                   handler: () => notImplemented('workspaces.delete') },
  { method: 'GET',    path: '/workspaces/:id/members',           handler: () => notImplemented('workspaces.listMembers') },
  { method: 'DELETE', path: '/workspaces/:id/members/:userId',   handler: () => notImplemented('workspaces.removeMember') },
  { method: 'POST',   path: '/workspaces/:id/invitations',       handler: handleInvite },
  { method: 'GET',    path: '/workspaces/:id/invitations',       handler: handleListInvitations },
  { method: 'GET',    path: '/invitations/:token',               handler: handleGetInvitation },
  { method: 'POST',   path: '/invitations/:token/accept',        handler: handleAcceptInvitation },
  { method: 'DELETE', path: '/invitations/:id',                  handler: handleRevokeInvitation },
];
