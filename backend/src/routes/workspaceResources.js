import { dataResponse } from '../utils/response.js';
import { AuthenticationError, PermissionError, ValidationError } from '../errors/index.js';
import { requireRole } from '../middleware/authorize.js';
import { WorkspaceResourceRepository } from '../repositories/WorkspaceResourceRepository.js';

// Types wired up in the frontend WORKSPACE_RESOURCES registry.
// Each entry may carry a writeRole — callers must hold that role to PUT.
// Types without writeRole are writable by any authenticated workspace member.
const RESOURCE_CONFIG = {
  folders:           {},
  labelPacks:        {},
  workspaceIdentity: { writeRole: 'workspace_owner', singleton: true },
};
const ALLOWED_TYPES = new Set(Object.keys(RESOURCE_CONFIG));

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
  // Enforce per-type write role if configured.
  const config = RESOURCE_CONFIG[params.type];
  if (config.writeRole) {
    requireRole(ctx.auth, [config.writeRole]);
  }
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { items } = body;
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    throw new ValidationError('items must be an object keyed by resource id');
  }
  // Singleton resource types must receive exactly one item — enforce the contract
  // server-side so no bug or future code path can corrupt a singleton with extra rows.
  if (config.singleton && Object.keys(items).length !== 1) {
    throw new ValidationError(`Singleton resource type '${params.type}' must contain exactly one item.`);
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
