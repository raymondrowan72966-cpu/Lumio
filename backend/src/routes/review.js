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

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// Recursively walks a JSON value and collects every "asset://" string found.
function collectAssetIds(value, found = new Set()) {
  if (typeof value === 'string') {
    if (value.startsWith(ASSET_ID_PREFIX)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectAssetIds(item, found);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectAssetIds(v, found);
  }
  return found;
}

// Maps a D1 courses row to the camelCase shape learnerPreview.js expects.
function rowToCourse(row) {
  return {
    id:             row.id,
    title:          row.title || '',
    description:    row.description || '',
    audience:       row.audience || '',
    duration:       row.duration || '',
    objectives:     JSON.parse(row.objectives     || '[]'),
    learnerOutcomes: JSON.parse(row.learner_outcomes || '[]'),
    themeDesign:    JSON.parse(row.theme_design   || '{}'),
    landingLayout:  row.landing_layout || 'A',
    heroImage:      JSON.parse(row.hero_image     || '{}'),
    heroSettings:   JSON.parse(row.hero_settings  || '{}'),
    labelSet:       row.label_set || 'en',
    assessments:    [],
  };
}

// Maps a D1 lessons row to the shape learnerPreview.js expects.
function rowToLesson(row) {
  return {
    id:       row.id,
    title:    row.title || '',
    position: row.position || 0,
    duration: row.duration || null,
    kind:     row.kind || 'standard',
    blocks:   JSON.parse(row.blocks || '[]'),
  };
}

// ── POST /review ──────────────────────────────────────────────────────────────
// Authenticated. Creates a frozen review snapshot for an eligible course.
// Reads course + lessons from D1 (SELECT only), copies referenced assets to
// review/{reviewId}/ R2 prefix, inserts one review_links row.
async function handleCreate(request, _params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  let body;
  try { body = await request.json(); } catch {
    throw new ValidationError('Request body must be JSON.');
  }

  const { courseId } = body || {};
  if (!courseId || typeof courseId !== 'string') {
    throw new ValidationError('courseId is required.');
  }

  const wsId   = ctx.auth.currentWorkspace.id;
  const userId = ctx.auth.currentUser.id;

  // Verify course exists and belongs to this workspace.
  const courseRow = await ctx.db.first(
    'SELECT * FROM courses WHERE id = ? AND workspace_id = ?',
    [courseId, wsId],
  );
  if (!courseRow) throw new PermissionError('Course not found or access denied.');

  // Verify the associated project is approved or published (same gate as
  // canPublishProjectStatus() in app.js — enforced here server-side too).
  const projectRow = await ctx.db.first(
    'SELECT status FROM projects WHERE id = ?',
    [courseId],
  );
  if (!projectRow || (projectRow.status !== 'approved' && projectRow.status !== 'published')) {
    throw new PermissionError('Course must be approved or published before a review link can be created.');
  }

  // Load all lessons for this course (SELECT only — no writes to existing tables).
  const lessonRows = await ctx.db.all(
    'SELECT * FROM lessons WHERE course_id = ? ORDER BY position ASC',
    [courseId],
  );

  const course  = rowToCourse(courseRow);
  const lessons = lessonRows.map(rowToLesson);

  // Collect every asset:// ID referenced across the course and all lesson blocks.
  const allAssetIds = collectAssetIds({ course, lessons });

  // Fetch D1 metadata for each asset so we know its r2Key and mimeType.
  const assetRepo = new AssetRepository(ctx.db);
  const assetMeta = [];
  for (const assetId of allAssetIds) {
    const rec = await assetRepo.getById(assetId);
    if (rec) assetMeta.push(rec);
  }

  const reviewId = generateId();
  const reviewPrefix = `review/${reviewId}`;

  // Copy each asset to the isolated review R2 prefix.
  // Existing production keys are read via getObject only — never modified.
  const assetMap = {};
  const assetFilenames = [];
  for (const rec of assetMeta) {
    const ext = MIME_TO_EXT[(rec.mimeType || '').toLowerCase()] || 'bin';
    const cleanId = rec.id.slice(ASSET_ID_PREFIX.length);
    const filename = `${cleanId}.${ext}`;
    const reviewKey = `${reviewPrefix}/${filename}`;

    try {
      const obj = await ctx.config.assetsBucket.get(rec.r2Key);
      if (obj) {
        const buf = await obj.arrayBuffer();
        await ctx.config.assetsBucket.put(reviewKey, buf, {
          httpMetadata: { contentType: rec.mimeType },
          customMetadata: { assetId: rec.id, reviewId },
        });
        assetMap[rec.id] = `/api/review/${reviewId}/assets/${filename}`;
        assetFilenames.push(filename);
      }
    } catch (err) {
      ctx.logger && ctx.logger.warn('Review asset copy failed', { assetId: rec.id, err: err.message });
    }
  }

  // Build the frozen snapshot.
  const snapshot = { course, lessons };

  // Insert the review_links row (new isolated table — no existing table touched).
  const now = Math.floor(Date.now() / 1000);
  await ctx.db.run(
    `INSERT INTO review_links (id, course_id, workspace_id, created_by, snapshot_json, asset_ids, created_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [reviewId, courseId, wsId, userId, JSON.stringify(snapshot), JSON.stringify(assetFilenames), now],
  );

  const url = `${ctx.config.appBaseUrl}/review/${reviewId}`;

  return dataResponse({ reviewId, url });
}

// ── GET /review/:reviewId ─────────────────────────────────────────────────────
// Unauthenticated. Returns the frozen snapshot and asset URL map for a valid
// active review link.
async function handleGet(_request, params, ctx) {
  const { reviewId } = params;
  if (!reviewId) throw new AppError('Review ID is required.', { status: 400, code: 'VALIDATION_ERROR' });

  const row = await ctx.db.first(
    'SELECT * FROM review_links WHERE id = ?',
    [reviewId],
  );

  if (!row) throw new AppError('Review link not found.', { status: 404, code: 'NOT_FOUND' });

  if (!row.is_active) throw new AppError('Review link has been revoked.', { status: 410, code: 'GONE' });

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at && row.expires_at < now) {
    throw new AppError('Review link has expired.', { status: 410, code: 'GONE' });
  }

  const snapshot = JSON.parse(row.snapshot_json);

  // Rebuild the assetMap from stored filenames.
  const assetFilenames = JSON.parse(row.asset_ids || '[]');
  const assetMap = {};
  for (const filename of assetFilenames) {
    // Derive the asset:// ID from the filename (strip extension).
    const cleanId = filename.replace(/\.[^.]+$/, '');
    assetMap[`${ASSET_ID_PREFIX}${cleanId}`] = `/api/review/${reviewId}/assets/${filename}`;
  }

  return dataResponse({ snapshot, assetMap });
}

// ── GET /review/:reviewId/assets/:filename ────────────────────────────────────
// Unauthenticated. Serves an asset that was copied to the review R2 prefix.
// The filename is validated against the review_links.asset_ids whitelist before
// any R2 lookup — it is structurally impossible to reach production asset keys.
async function handleAsset(_request, params, ctx) {
  const { reviewId, filename } = params;
  if (!reviewId || !filename) {
    throw new AppError('Missing review ID or filename.', { status: 400, code: 'VALIDATION_ERROR' });
  }

  // Reject any path traversal attempt.
  if (filename.includes('/') || filename.includes('..') || filename.includes('\\')) {
    throw new AppError('Invalid filename.', { status: 400, code: 'VALIDATION_ERROR' });
  }

  const row = await ctx.db.first(
    'SELECT is_active, expires_at, asset_ids FROM review_links WHERE id = ?',
    [reviewId],
  );

  if (!row) throw new AppError('Review link not found.', { status: 404, code: 'NOT_FOUND' });
  if (!row.is_active) throw new AppError('Review link revoked.', { status: 410, code: 'GONE' });

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at && row.expires_at < now) {
    throw new AppError('Review link expired.', { status: 410, code: 'GONE' });
  }

  // Security gate: filename must be in the whitelist recorded at creation time.
  const allowed = JSON.parse(row.asset_ids || '[]');
  if (!allowed.includes(filename)) {
    throw new AppError('Asset not found.', { status: 404, code: 'NOT_FOUND' });
  }

  const r2Key = `review/${reviewId}/${filename}`;
  const obj = await ctx.config.assetsBucket.get(r2Key);
  if (!obj) throw new AppError('Asset not found in storage.', { status: 404, code: 'NOT_FOUND' });

  const ext = filename.split('.').pop().toLowerCase();
  const extToMime = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
    mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
    pdf: 'application/pdf',
  };
  const contentType = extToMime[ext] || 'application/octet-stream';

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export const reviewRoutes = [
  { method: 'POST', path: '/review',                           handler: handleCreate },
  { method: 'GET',  path: '/review/:reviewId',                 handler: handleGet },
  { method: 'GET',  path: '/review/:reviewId/assets/:filename', handler: handleAsset },
];
