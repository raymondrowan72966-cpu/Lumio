import { dataResponse } from '../utils/response.js';
import { AppError, AuthenticationError, PermissionError, ValidationError } from '../errors/index.js';
import { AssetRepository } from '../repositories/AssetRepository.js';
import { ProjectRepository } from '../repositories/ProjectRepository.js';

const ASSET_ID_PREFIX = 'asset://';

const MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg',
  'audio/wav': 'wav', 'audio/mp4': 'm4a',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv',
  'application/pdf': 'pdf',
};

function requireAuth(auth) {
  if (!auth.isAuthenticated) throw new AuthenticationError('Authentication required.');
}

function requireWorkspace(auth) {
  if (!auth.currentWorkspace) throw new PermissionError('No workspace found for this account.');
}

function buildR2Key(workspaceId, courseId, cleanId, mimeType) {
  const ext = MIME_TO_EXT[(mimeType || '').toLowerCase()] || 'bin';
  const dir = courseId
    ? `${workspaceId}/${courseId}`
    : `${workspaceId}/_assets`;
  return `${dir}/${cleanId}.${ext}`;
}

// ── POST /assets/upload ───────────────────────────────────────────────────────
// Multipart form fields: file (binary), assetId (content-hash ID), courseId (optional)
async function handleUpload(request, _params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    throw new ValidationError('Request must be multipart/form-data.');
  }

  const assetId = formData.get('assetId');
  const file    = formData.get('file');
  const courseId = formData.get('courseId') || null;

  if (!assetId || typeof assetId !== 'string' || !assetId.startsWith(ASSET_ID_PREFIX)) {
    throw new ValidationError('assetId must be a valid asset:// identifier.');
  }
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new ValidationError('file field is required.');
  }

  const wsId    = ctx.auth.currentWorkspace.id;
  const userId  = ctx.auth.currentUser.id;
  const mimeType = file.type || 'application/octet-stream';
  const fileName = file.name || 'asset';
  const sizeBytes = file.size;

  // Verify courseId belongs to this workspace when provided
  if (courseId) {
    const projectRepo = new ProjectRepository(ctx.db);
    const project = await projectRepo.getById(courseId);
    if (!project || project.workspaceId !== wsId) {
      throw new PermissionError('Course not found or access denied.');
    }
  }

  const cleanId = assetId.slice(ASSET_ID_PREFIX.length);
  const r2Key   = buildR2Key(wsId, courseId, cleanId, mimeType);

  // Upload to R2 first — if R2 fails, we don't write D1
  const buf = await file.arrayBuffer();
  try {
    await ctx.config.assetsBucket.put(r2Key, buf, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { assetId, fileName },
    });
  } catch (err) {
    ctx.logger.error('R2 upload failed', { assetId, r2Key, err: err.message });
    throw new AppError('Asset storage failed.', { status: 502, code: 'STORAGE_ERROR' });
  }

  // Write D1 metadata — if this fails, attempt R2 rollback
  const assetRepo = new AssetRepository(ctx.db);
  try {
    await assetRepo.create({
      id: assetId,
      workspaceId: wsId,
      courseId,
      uploadedBy: userId,
      fileName,
      mimeType,
      sizeBytes,
      r2Key,
    });
  } catch (err) {
    // Best-effort R2 rollback
    try { await ctx.config.assetsBucket.delete(r2Key); } catch { /* ignore */ }
    ctx.logger.error('D1 asset insert failed', { assetId, err: err.message });
    throw new AppError('Asset metadata save failed.', { status: 500, code: 'DATABASE_ERROR' });
  }

  return dataResponse({ id: assetId, fileName, mimeType, sizeBytes, r2Key });
}

// ── GET /assets/:id ───────────────────────────────────────────────────────────
// Streams the R2 binary with the correct Content-Type. The :id is URL-decoded
// by the router, so params.id is the full "asset://..." string.
async function handleGet(_request, params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  const assetId = params.id;
  if (!assetId || !assetId.startsWith(ASSET_ID_PREFIX)) {
    throw new AppError('Invalid asset id.', { status: 400, code: 'VALIDATION_ERROR' });
  }

  const assetRepo = new AssetRepository(ctx.db);
  const asset = await assetRepo.getById(assetId);
  if (!asset) {
    throw new AppError(`Asset not found: ${assetId}`, { status: 404, code: 'NOT_FOUND' });
  }

  if (asset.workspaceId !== ctx.auth.currentWorkspace.id) {
    throw new PermissionError('Access denied.');
  }

  const obj = await ctx.config.assetsBucket.get(asset.r2Key);
  if (!obj) {
    throw new AppError('Asset binary not found in storage.', { status: 404, code: 'NOT_FOUND' });
  }

  const headers = {
    'Content-Type': asset.mimeType,
    'Content-Disposition': `inline; filename="${encodeURIComponent(asset.fileName)}"`,
    'Cache-Control': 'private, max-age=3600',
    'Content-Length': String(asset.sizeBytes),
  };

  return new Response(obj.body, { status: 200, headers });
}

// ── DELETE /assets/:id ────────────────────────────────────────────────────────
async function handleDelete(_request, params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  const assetId = params.id;
  if (!assetId || !assetId.startsWith(ASSET_ID_PREFIX)) {
    throw new AppError('Invalid asset id.', { status: 400, code: 'VALIDATION_ERROR' });
  }

  const assetRepo = new AssetRepository(ctx.db);
  const asset = await assetRepo.getById(assetId);
  if (!asset) {
    throw new AppError(`Asset not found: ${assetId}`, { status: 404, code: 'NOT_FOUND' });
  }
  if (asset.workspaceId !== ctx.auth.currentWorkspace.id) {
    throw new PermissionError('Access denied.');
  }

  await assetRepo.softDelete(assetId);
  return dataResponse({ deleted: true });
}

// ── GET /projects/:projectId/assets ──────────────────────────────────────────
async function handleListByProject(_request, params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  const projectRepo = new ProjectRepository(ctx.db);
  const project = await projectRepo.getById(params.projectId);
  if (!project) {
    throw new AppError(`Project not found: ${params.projectId}`, { status: 404, code: 'NOT_FOUND' });
  }
  if (project.workspaceId !== ctx.auth.currentWorkspace.id) {
    throw new PermissionError('Access denied.');
  }

  const assetRepo = new AssetRepository(ctx.db);
  const assets = await assetRepo.listByCourse(params.projectId);
  return dataResponse(assets);
}

export const assetRoutes = [
  { method: 'POST',   path: '/assets/upload',              handler: handleUpload },
  { method: 'GET',    path: '/assets/:id',                 handler: handleGet },
  { method: 'DELETE', path: '/assets/:id',                 handler: handleDelete },
  { method: 'GET',    path: '/projects/:projectId/assets', handler: handleListByProject },
];
