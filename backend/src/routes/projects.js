import { dataResponse } from '../utils/response.js';
import { AppError, AuthenticationError, PermissionError, ValidationError } from '../errors/index.js';
import { ProjectRepository } from '../repositories/ProjectRepository.js';

function requireAuth(auth) {
  if (!auth.isAuthenticated) throw new AuthenticationError('Authentication required.');
}

function requireWorkspace(auth) {
  if (!auth.currentWorkspace) throw new PermissionError('No workspace found for this account.');
}

function notFound(id) {
  throw new AppError(`Project not found: ${id}`, { status: 404, code: 'NOT_FOUND' });
}

// ── GET /projects ─────────────────────────────────────────────────────────────
async function handleList(_request, _params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);
  const repo = new ProjectRepository(ctx.db);
  const projects = await repo.listByWorkspace(ctx.auth.currentWorkspace.id, ctx.auth.currentUser.id);
  return dataResponse(projects);
}

// ── POST /projects ────────────────────────────────────────────────────────────
async function handleCreate(request, _params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { title, type, folder, course, lessons } = body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new ValidationError('title is required');
  }
  if (!type || !['Course', 'Microlearning'].includes(type)) {
    throw new ValidationError('type must be Course or Microlearning');
  }

  const repo   = new ProjectRepository(ctx.db);
  const id = (body.id && typeof body.id === 'string' && body.id.length > 0)
    ? body.id
    : crypto.randomUUID();
  const wsId   = ctx.auth.currentWorkspace.id;
  const userId = ctx.auth.currentUser.id;
  const now    = Date.now();

  // Upsert the folder into D1 before creating the project — the FK constraint
  // on projects.folder_id → folders.id requires the folder to exist first.
  if (folder && folder.id) {
    await repo.upsertFolder(folder.id, wsId, folder.name || 'Untitled', folder.color);
  }

  await repo.createProject({
    id,
    workspaceId: wsId,
    ownerId:     userId,
    title:       title.trim(),
    type,
    status:      body.status || 'draft',
    health:      body.health != null ? body.health : 0,
    folderId:    body.folderId || null,
    labelSet:    (course && course.labelSet) || null,
    lastAccessedAt: now,
  });

  if (course) {
    await repo.upsertCourse(id, { ...course, workspaceId: wsId });
    await _persistLessons(repo, id, wsId, course, lessons || {});
  }

  const project = await repo.getById(id);
  return dataResponse(project, { status: 201 });
}

// ── GET /projects/:id ─────────────────────────────────────────────────────────
async function handleGet(_request, params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  const repo    = new ProjectRepository(ctx.db);
  const project = await repo.getById(params.id);
  if (!project || project.workspaceId !== ctx.auth.currentWorkspace.id) notFound(params.id);

  const course     = await repo.getCourse(params.id);
  const lessonRows = await repo.getLessons(params.id);

  // Reconstruct course with lessons/assessments arrays split by kind, plus
  // pass through any extra per-lesson metadata columns the frontend stores.
  let courseOut = course;
  if (courseOut) {
    const regularLessons = lessonRows
      .filter(r => r.kind !== 'assessment')
      .map(r => ({ id: r.id, title: r.title, position: r.position, duration: r.duration }));
    const assessments = lessonRows
      .filter(r => r.kind === 'assessment')
      .map(r => ({ id: r.id, title: r.title, position: r.position, duration: r.duration }));
    courseOut = { ...courseOut, lessons: regularLessons, assessments };
  }

  // blocks map: lessonId → blocks[]
  const lessonsMap = {};
  lessonRows.forEach(r => {
    lessonsMap[r.id] = _parseJson(r.blocks, []);
  });

  return dataResponse({ project, course: courseOut, lessons: lessonsMap });
}

// ── PUT /projects/:id ─────────────────────────────────────────────────────────
async function handleUpdate(request, params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  const repo     = new ProjectRepository(ctx.db);
  const existing = await repo.getById(params.id);
  if (!existing || existing.workspaceId !== ctx.auth.currentWorkspace.id) notFound(params.id);
  if (existing.ownerId !== ctx.auth.currentUser.id) throw new PermissionError('Not the project owner.');

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { project, folder, course, lessons } = body;
  if (!project) throw new ValidationError('project is required');

  // Upsert the folder into D1 before updating the project — the FK constraint
  // on projects.folder_id → folders.id requires the folder to exist first.
  if (folder && folder.id) {
    await repo.upsertFolder(folder.id, ctx.auth.currentWorkspace.id, folder.name || 'Untitled', folder.color);
  }

  await repo.updateProject(params.id, {
    title:            project.title            != null    ? project.title            : existing.title,
    status:           project.status           != null    ? project.status           : existing.status,
    health:           project.health           != null    ? project.health           : existing.health,
    folderId:         project.folderId         !== undefined ? project.folderId      : existing.folderId,
    sharedScope:      project.sharedScope      !== undefined ? project.sharedScope   : existing.sharedScope,
    sharedPermission: project.sharedPermission !== undefined ? project.sharedPermission : existing.sharedPermission,
    labelSet:         project.labelSet         !== undefined ? project.labelSet      : existing.labelSet,
    lastAccessedAt:   project.lastAccessedAt   != null    ? project.lastAccessedAt   : Date.now(),
  });

  if (course) {
    await repo.upsertCourse(params.id, { ...course, workspaceId: ctx.auth.currentWorkspace.id });
    const allLessons = [...(course.lessons || []), ...(course.assessments || [])];
    const keepIds    = allLessons.map(l => l.id);
    await _persistLessons(repo, params.id, ctx.auth.currentWorkspace.id, course, lessons || {});
    await repo.deleteLessonsExcept(params.id, keepIds);
  }

  const updated = await repo.getById(params.id);
  return dataResponse(updated);
}

// ── POST /projects/:id/shares ─────────────────────────────────────────────────
async function handleShareUpsert(request, params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  const repo     = new ProjectRepository(ctx.db);
  const existing = await repo.getById(params.id);
  if (!existing || existing.workspaceId !== ctx.auth.currentWorkspace.id) notFound(params.id);
  if (existing.ownerId !== ctx.auth.currentUser.id) throw new PermissionError('Not the project owner.');

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const { userId, permission } = body;
  if (!userId || typeof userId !== 'string') throw new ValidationError('userId is required.');
  if (userId === ctx.auth.currentUser.id) throw new ValidationError('Cannot share with yourself.');
  const validPerms = ['view', 'comment', 'edit'];
  const perm = validPerms.includes(permission) ? permission : 'view';

  await repo.upsertShare(params.id, userId, perm, ctx.auth.currentUser.id);
  return dataResponse({ ok: true });
}

// ── DELETE /projects/:id/shares/:userId ───────────────────────────────────────
async function handleShareDelete(_request, params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  const repo     = new ProjectRepository(ctx.db);
  const existing = await repo.getById(params.id);
  if (!existing || existing.workspaceId !== ctx.auth.currentWorkspace.id) notFound(params.id);
  if (existing.ownerId !== ctx.auth.currentUser.id) throw new PermissionError('Not the project owner.');

  await repo.deleteShare(params.id, params.userId);
  return dataResponse({ ok: true });
}

// ── DELETE /projects/:id ──────────────────────────────────────────────────────
async function handleDelete(_request, params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  const repo     = new ProjectRepository(ctx.db);
  const existing = await repo.getById(params.id);
  if (!existing || existing.workspaceId !== ctx.auth.currentWorkspace.id) notFound(params.id);
  if (existing.ownerId !== ctx.auth.currentUser.id) throw new PermissionError('Not the project owner.');

  await repo.softDelete(params.id);
  return dataResponse({ deleted: true });
}

// ── PATCH /projects/:id/status ────────────────────────────────────────────────
// Governance-only route: lets the Workspace Owner persist a status transition on
// any project in their workspace without passing the project-owner check on PUT.
async function handleStatusUpdate(request, params, ctx) {
  requireAuth(ctx.auth);
  requireWorkspace(ctx.auth);

  const wsOwnerId = ctx.auth.currentWorkspace.owner_id;
  if (ctx.auth.currentUser.id !== wsOwnerId) {
    throw new PermissionError('Only the Workspace Owner may use this route.');
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { status } = body;
  if (!status) throw new ValidationError('status is required');

  const repo = new ProjectRepository(ctx.db);
  const existing = await repo.getById(params.id);
  if (!existing || existing.workspaceId !== ctx.auth.currentWorkspace.id) notFound(params.id);

  await repo.updateProject(params.id, {
    title:            existing.title,
    status,
    health:           existing.health,
    folderId:         existing.folderId,
    sharedScope:      existing.sharedScope,
    sharedPermission: existing.sharedPermission,
    labelSet:         existing.labelSet,
    lastAccessedAt:   existing.lastAccessedAt,
  });

  const updated = await repo.getById(params.id);
  return dataResponse(updated);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _persistLessons(repo, projectId, workspaceId, course, lessonsMap) {
  const lessonItems     = (course.lessons     || []).map(l => ({ ...l, kind: 'lesson' }));
  const assessmentItems = (course.assessments || []).map(a => ({ ...a, kind: 'assessment' }));
  const allItems = [...lessonItems, ...assessmentItems];
  for (let i = 0; i < allItems.length; i++) {
    const l = allItems[i];
    await repo.upsertLesson(projectId, workspaceId, {
      id:       l.id,
      title:    l.title,
      kind:     l.kind,
      duration: l.duration || null,
      blocks:   lessonsMap[l.id] || [],
    }, i);
  }
}

function _parseJson(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export const projectRoutes = [
  { method: 'GET',    path: '/projects',                          handler: handleList        },
  { method: 'POST',   path: '/projects',                          handler: handleCreate      },
  { method: 'GET',    path: '/projects/:id',                      handler: handleGet         },
  { method: 'PUT',    path: '/projects/:id',                      handler: handleUpdate      },
  { method: 'DELETE', path: '/projects/:id',                      handler: handleDelete      },
  { method: 'PATCH',  path: '/projects/:id/status',               handler: handleStatusUpdate },
  { method: 'POST',   path: '/projects/:id/shares',               handler: handleShareUpsert },
  { method: 'DELETE', path: '/projects/:id/shares/:userId',       handler: handleShareDelete },
];
