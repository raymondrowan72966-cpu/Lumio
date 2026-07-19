import { AppError } from '../errors/index.js';
import { dataResponse } from '../utils/response.js';
import { WorkspaceResourceRepository } from '../repositories/WorkspaceResourceRepository.js';
import { AssetRepository } from '../repositories/AssetRepository.js';

const ASSET_ID_PREFIX = 'asset://';

// The set of slot keys that may appear in workspaceIdentity.logos.
// Only slots in this list are projected into the public response and
// accepted as valid targets for the unauthenticated asset-serving route.
const BRANDING_SLOTS = new Set([
  'sidebar', 'sidebar-large', 'compact', 'welcome',
  'login-badge', 'login-background',
]);

// ── Shared helpers ────────────────────────────────────────────────────────────

// Resolve the single workspace for this single-tenant deployment.
// Returns the workspace id string; throws 404 if no workspace exists.
async function resolveWorkspaceId(db) {
  const row = await db.first(
    'SELECT id FROM workspaces WHERE deleted_at IS NULL LIMIT 1',
  );
  if (!row) throw new AppError('Workspace not found.', { status: 404, code: 'NOT_FOUND' });
  return row.id;
}

// Read the workspaceIdentity singleton from workspace_resources and parse
// its payload.  Returns null when no identity has been configured yet.
async function readWorkspaceIdentity(db, workspaceId) {
  const repo  = new WorkspaceResourceRepository(db);
  const items = await repo.listByWorkspace(workspaceId, 'workspaceIdentity');
  const entry = Object.values(items)[0];
  if (!entry) return null;
  // payload fields are merged into the row by WorkspaceResourceRepository.rowToResource
  return entry;
}

// ── GET /workspace/public ─────────────────────────────────────────────────────
//
// Public read-only projection of the existing workspaceIdentity singleton.
// No session required — only visual presentation fields are returned.
// asset:// identifiers are mapped to /branding/assets/{id} URLs so the
// caller can render branding without needing authenticated asset access.
//
// Response is CDN-cacheable: public, 60-second TTL, 5-minute stale window.
async function handleGetPublic(_request, _params, ctx) {
  const workspaceId = await resolveWorkspaceId(ctx.db);
  const identity    = await readWorkspaceIdentity(ctx.db, workspaceId);

  // No identity configured yet — return empty projection so the login page
  // falls back to Lumio defaults without error.
  if (!identity) {
    return dataResponse(
      { name: null, shortName: null, logos: {}, theme: {} },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  }

  const rawLogos = (identity.logos && typeof identity.logos === 'object') ? identity.logos : {};
  const theme    = (identity.theme  && typeof identity.theme  === 'object') ? identity.theme  : {};

  // Map asset:// identifiers to public branding asset URLs.
  // Legacy data:image/ values (pre-migration) and unknown slot names are
  // intentionally excluded — the login page falls back to its default image.
  const logos = {};
  for (const [slot, value] of Object.entries(rawLogos)) {
    if (
      BRANDING_SLOTS.has(slot) &&
      typeof value === 'string' &&
      value.startsWith(ASSET_ID_PREFIX)
    ) {
      logos[slot] = `/branding/assets/${encodeURIComponent(value)}`;
    }
  }

  return dataResponse(
    {
      name:      identity.name      || null,
      shortName: identity.shortName || null,
      logos,
      theme,
    },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}

// ── GET /branding/assets/:id ──────────────────────────────────────────────────
//
// Streams a workspace branding asset from R2 without requiring authentication.
//
// Security gate: the requested asset:// id must appear as a current value
// in workspaceIdentity.logos.  Private course assets — which are not in
// workspaceIdentity.logos — cannot be served by this route regardless of
// whether the caller knows their id.
//
// Response is CDN-cacheable: public, 1-hour TTL, 24-hour stale window.
async function handleGetBrandingAsset(_request, params, ctx) {
  const assetId = params.id;
  if (!assetId || !assetId.startsWith(ASSET_ID_PREFIX)) {
    throw new AppError('Invalid asset id.', { status: 400, code: 'VALIDATION_ERROR' });
  }

  const workspaceId = await resolveWorkspaceId(ctx.db);
  const identity    = await readWorkspaceIdentity(ctx.db, workspaceId);

  // Validate: the requested asset id must be a current branding slot value.
  const rawLogos = (identity && identity.logos && typeof identity.logos === 'object')
    ? identity.logos : {};
  if (!Object.values(rawLogos).includes(assetId)) {
    throw new AppError('Asset not found.', { status: 404, code: 'NOT_FOUND' });
  }

  // Retrieve D1 metadata to get the R2 key and correct Content-Type.
  const assetRepo = new AssetRepository(ctx.db);
  const asset = await assetRepo.getById(assetId);
  if (!asset || asset.workspaceId !== workspaceId) {
    throw new AppError('Asset not found.', { status: 404, code: 'NOT_FOUND' });
  }

  // Stream the existing R2 object — no copy, no transform.
  const obj = await ctx.config.assetsBucket.get(asset.r2Key);
  if (!obj) {
    throw new AppError('Asset binary not found in storage.', { status: 404, code: 'NOT_FOUND' });
  }

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type':        asset.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(asset.fileName)}"`,
      'Cache-Control':       'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Length':      String(asset.sizeBytes),
    },
  });
}

export const brandingRoutes = [
  { method: 'GET', path: '/workspace/public',    handler: handleGetPublic      },
  { method: 'GET', path: '/branding/assets/:id', handler: handleGetBrandingAsset },
];
