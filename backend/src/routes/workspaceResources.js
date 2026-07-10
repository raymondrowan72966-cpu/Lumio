import { dataResponse } from '../utils/response.js';
import { AuthenticationError, PermissionError, ValidationError } from '../errors/index.js';
import { WorkspaceResourceRepository } from '../repositories/WorkspaceResourceRepository.js';

// Only types wired up in the frontend WORKSPACE_RESOURCES registry are served.
const ALLOWED_TYPES = new Set(['labelPacks']);

function requireAuth(auth) {
  if (!auth.isAuthenticated) throw new AuthenticationError('Authentication required.');
  if (!auth.currentWorkspace) throw new PermissionError('No workspace found.');
}

// GET /workspace/resources/:type
async function handleGet(_request, params, ctx) {
  requireAuth(ctx.auth);
  if (!ALLOWED_TYPES.has(params.type)) {
    throw new ValidationError(`Unknown resource type: ${params.type}`);
  }
  const repo = new WorkspaceResourceRepository(ctx.db);
  const items = await repo.listByWorkspace(ctx.auth.currentWorkspace.id, params.type);
  return dataResponse(items);
}

// PUT /workspace/resources/:type — full sync: client sends all items it knows about
async function handleSync(request, params, ctx) {
  requireAuth(ctx.auth);
  if (!ALLOWED_TYPES.has(params.type)) {
    throw new ValidationError(`Unknown resource type: ${params.type}`);
  }
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { items } = body;
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    throw new ValidationError('items must be an object keyed by resource id');
  }
  const repo  = new WorkspaceResourceRepository(ctx.db);
  const wsId  = ctx.auth.currentWorkspace.id;
  const uId   = ctx.auth.currentUser.id;
  for (const [id, data] of Object.entries(items)) {
    await repo.upsert(wsId, params.type, id, data, uId);
  }
  const updated = await repo.listByWorkspace(wsId, params.type);
  return dataResponse(updated);
}

export const workspaceResourceRoutes = [
  { method: 'GET', path: '/workspace/resources/:type', handler: handleGet },
  { method: 'PUT', path: '/workspace/resources/:type', handler: handleSync },
];
