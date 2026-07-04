# Lumio SaaS Migration Blueprint
**Sprint 1 — Browser-Local Architecture → Cloud Platform**

Status: design document only. No backend, migration, or production code was created or modified as part of this sprint.

---

## 0. Why this sprint exists

Production evidence proved the platform's current ceiling:

```
Desktop: register → login succeeds → deploy
Laptop:  login with same email/password → "No account found"
Laptop:  register same email again → succeeds
```

Root cause (already understood, not re-investigated here): Lumio has **no backend**. `LumioState` is a single in-memory object, persisted only to that browser's own `localStorage` (small structured state) and `IndexedDB` (binary assets, via `AssetStore`). Every browser is a fully independent, disconnected copy of the entire platform. This is not a bug — it is the architecture working exactly as built. It cannot support multi-device accounts, team collaboration, or any notion of a shared workspace, because nothing is shared; everything is local to one browser profile.

This document is the blueprint for replacing that foundation without losing any of the product behavior already built on top of it.

---

## PHASE 1 — Current Architecture Audit

Every subsystem below is real, traced directly from the current codebase (`js/app.js`, `js/assetStore.js`, and the `js/screens/*.js` files), not assumed.

### Storage layers in use today

| Layer | What lives there | Mechanism |
|---|---|---|
| `localStorage` | One JSON blob under `LUMIO_STORAGE_KEY`, containing every key in `LUMIO_PERSISTED_KEYS` | `saveLumioState()` / `loadLumioState()`, debounced via `scheduleLumioSave()` (400ms) except auth transitions, which now flush immediately |
| `IndexedDB` (`lumio-assets` DB, `assets` store) | Binary blobs for every uploaded image/video/audio/file, content-addressed by SHA-256 | `AssetStore` (`put`/`get`/`resolveUrl`/`resolveMediaSrc`/`preloadBlocks`) |
| `sessionStorage` | One key, `lumio.session.activeTab` | Tab-lifetime marker used only to distinguish "refresh" from "new browser session" for Remember Me |
| In-memory only | `BuilderUI` (selected block, active tab, AI panel open/closed), `LearnerUI` (revealed continues, viewed-block observer), drag state, `window.__*` test scaffolding | Never persisted; reset on every reload by design |

### Subsystem-by-subsystem audit

| Subsystem | Current storage | Purpose | Owner (today) | Dependencies | Lifecycle | Migration complexity | Risk |
|---|---|---|---|---|---|---|---|
| Users | `localStorage.users[]` | Identity record (email, name, passwordHash, role, authProvider) | `LumioAuth` | Workspaces, Memberships | Created at register/OAuth, mutated at login/reset, never hard-deleted today | Medium | High — primary blocker for cross-device |
| Passwords | `localStorage.users[].passwordHash` | Auth credential | `LumioAuth._hashPassword` | Users | Set at register/reset | High (must NOT migrate the existing weak hash as-is) | Critical |
| Sessions | `localStorage.session` (single object, not an array) | "Who is signed in, in THIS browser" | `LumioAuth._establishSession` | Users, Workspaces | Replaced on every login/logout | Medium | High — today's model is single-session-per-browser, not multi-device |
| Remember Me | `session.rememberMe` + `sessionStorage` tab marker | Distinguish refresh vs. new browser session | `LumioAuth.restoreSession` | Sessions | Re-evaluated every boot | Low (token-based equivalent is a known pattern) | Low |
| Password Reset | `localStorage.passwordResets[]` | Time-boxed reset tokens | `LumioAuth.requestPasswordReset/resetPassword` | Users | Created on request, consumed once, TTL 1hr | Low | Low |
| OAuth Providers | Mocked entirely (`_mockProviderPayload`) | Placeholder for Google/Microsoft/Apple | `LumioAuth.loginWithProvider` | Users | N/A — no real provider integration exists yet | High (this is greenfield, not migration) | Medium |
| Workspace Memberships | `localStorage.workspaceMemberships[]` (composite key `workspaceId+userId`, **no `id` field** — confirmed the hard way in the previous sprint) | Who belongs to which workspace, at what role | `_bindNewUserToWorkspace`, `acceptInvitation` | Users, Workspaces | Created at registration/invitation-acceptance | Medium | Medium |
| Workspace Settings | `localStorage.workspaces[]` | Workspace identity, ownership | `workspaceSettings.js` | Users (ownerId) | Created once per self-registering user | Low | Low |
| Projects | `localStorage.projects[]` | Course/project metadata, status, hero image refs | `projects.js` | Folders, Lessons, AssetStore refs | CRUD via Builder | Medium | Medium |
| Folders | `localStorage.folders[]` | Project organization | `projects.js` | Projects | CRUD | Low | Low |
| Lessons | `localStorage.lessons{ [lessonId]: Block[] }` | The actual authored content, per lesson | `lessonBuilder.js` | Projects (course.lessons[]), Blocks, AssetStore refs | Edited continuously, autosaved | High — largest, most actively-written data | High |
| Blocks | Embedded inside each lesson's array, not a separate table today | Individual content units (30+ types) | `lessonBuilder.js` | Lessons, Assets (asset:// refs) | Same lifecycle as lessons | High (schema variance per block type) | High |
| Assets | `IndexedDB` blobs + `asset://<sha256>` refs in block/course data | Images, video, audio, files | `AssetStore` | Referenced from Projects/Lessons | Content-deduplicated, never garbage-collected today | High | High — largest binary volume, must move to object storage |
| Image/Video/Audio/File uploads | Same as Assets — no distinct subsystem | n/a | `AssetStore` + `mediaPicker*Field` helpers | Assets | Same | (covered above) | (covered above) |
| Thumbnails | Derived/stored as ordinary assets (`heroImage._thumbSrc`) | Cheap preview rendering | `AssetStore` | Assets | Generated client-side | Low | Low |
| Comments | **Does not exist yet** | — | — | — | — | N/A | N/A |
| Review history | **Does not exist yet** beyond `project.status` lifecycle (draft/in review/approved) | Lightweight status field only | `projects.js` | Projects | — | Low | Low |
| Publishing (SCORM/HTML/xAPI/PDF) | Generated on-demand client-side as a Blob, downloaded; `course.publishHistory[]` records metadata only | Export pipeline | `app.js` `publish*Package` functions | Projects, Lessons, Assets | Stateless generation per click | Medium (compute-heavy, good Worker candidate) | Medium |
| AI Assistant | **UI-only today** — `BuilderUI.aiOpen` is in-memory, no prompt history is persisted, no real model call exists | Placeholder panel | `lessonBuilder.js` | None | Resets every reload | Low (greenfield, not migration) | Low |
| Prompt history | **Does not exist yet** | — | — | — | — | N/A | N/A |
| Theme | Baked into CSS variables + a small set of design tokens per block; no separate "theme" persistence subsystem beyond per-block `design` fields | Visual styling | `styles.css` + per-block `design` objects | Lessons/Blocks | Same as blocks | Low | Low |
| User preferences | Not centralized — scattered (`LumioUI.rememberMe`, etc.) | Misc UI state | `app.js` | Users (loosely) | In-memory mostly | Low | Low |
| Recent projects | `project.lastAccessed` field, sorted client-side | "Continue working" list | `projects.js` | Projects | Touched via `touchCurrentProject()` | Low | Low |
| Notifications | `localStorage.notifications[]` | In-app notification feed | `app.js`/various screens | Users (loosely, workspace-scoped) | Append-only today, no real expiry | Low | Low |
| Trash | `project.deleted` + `project.deletedAt` flags (soft delete, no separate table) | Recoverable deletion | `projects.js` | Projects | Filtered, not purged | Low | Low |
| Audit logs | **Does not exist yet** | — | — | — | — | N/A | N/A |
| Autosave | `scheduleLumioSave()` debounce (400ms), `saveLumioState()` immediate for auth | Persist edits without explicit "Save" | `app.js` | Everything in `LUMIO_PERSISTED_KEYS` | Triggered by virtually every mutation | Medium (must become a network call, not a local write) | High — this is the single biggest behavioral change in the whole migration |
| Undo/Redo | **Does not exist yet** | — | — | — | — | N/A | N/A |
| Temporary editor state | `BuilderUI` (selected block index, active right-panel tab, drag state) | Pure UI ephemera | `lessonBuilder.js` | None | Never persisted, by design | None | None |

**Key finding from this audit:** several items on the requested list (Comments, Review history beyond a status field, AI prompt history, Audit logs, Undo/Redo) do not exist today. They should be **designed fresh** as part of the new schema (Phase 7) rather than "migrated" — there is nothing to migrate.

---

## PHASE 2 — Ownership Model

```
Workspace
 ├─ owns → WorkspaceMembership[] ─→ references → User
 ├─ owns → Project[]
 │          ├─ owns → Folder (optional parent)
 │          ├─ owns → Lesson[]
 │          │          └─ owns → Block[]
 │          │                     └─ references → Asset (asset:// / future assetId)
 │          ├─ references → Asset (heroImage, thumbnailImage)
 │          └─ owns → PublishHistory[]
 ├─ owns → Invitation[] ─→ references → User (invitee, once accepted)
 └─ owns → Notification[] (workspace-scoped)

User
 ├─ owns → PasswordReset[] (transient)
 ├─ owns → Session[] (one per device/browser, NOT one global session — this is the core model change)
 └─ has-many → WorkspaceMembership (a user can belong to >1 workspace once invitations are real)

Project
 └─ owns → ReviewHistory[] / Comment[] (new — does not exist today)

Asset
 └─ referenced-by → many Blocks/Projects (many-to-many; never owned by a single block, since dedup is content-addressed)
```

**Hard rule carried over from the current (correct) design:** Assets are reference-counted/content-addressed, never block-owned. A block deleting its reference must not delete the asset if another block still references it. This must be enforced server-side (today it's implicit, via SHA-256 dedup in `AssetStore`).

**New rule required for SaaS:** every owning edge above must carry a `workspaceId` for tenant isolation, even where it's currently implicit (e.g., a Lesson does not store its own `workspaceId` today — it's reached only by walking Project → Workspace). In a multi-tenant database, every table that can be queried directly must be filterable by `workspaceId` without a join, both for performance and as a defense-in-depth security boundary.

---

## PHASE 3 — Cloud Architecture

```
                        ┌─────────────────────┐
                        │   Cloudflare Pages    │  ← static SPA shell (current
                        │  (Lumio frontend)     │     vanilla JS app, largely
                        └──────────┬───────────┘     unchanged, swap localStorage
                                   │ fetch()              calls for fetch() calls
                                   ▼
                        ┌─────────────────────┐
                        │  Cloudflare Workers   │  ← REST API, all business logic,
                        │     (API layer)       │     auth, permission checks
                        └──────────┬───────────┘
                     ┌─────────────┼─────────────┐
                     ▼             ▼             ▼
            ┌────────────┐ ┌─────────────┐ ┌──────────────┐
            │ Cloudflare  │ │  Cloudflare  │ │  Cloudflare   │
            │     D1      │ │     R2       │ │    Cache      │
            │ (structured │ │  (binary     │ │ (CDN edge     │
            │   data)     │ │  assets)     │ │  caching)     │
            └────────────┘ └─────────────┘ └──────────────┘
```

**Why each component:**

- **Cloudflare Pages** — the existing app is already a static, no-build-step SPA; Pages serves it with zero rewrite of the rendering layer. The migration is in *where state lives*, not how the UI renders.
- **Cloudflare Workers** — replaces every direct `LumioState` mutation with an authenticated, validated API call. This is where `LumioAuth`'s logic (hashing, session issuance, membership checks) moves to, server-side, where it belongs — client-side password hashing was always a documented stopgap, never a real security boundary.
- **Cloudflare D1** — structured, relational data (Users, Workspaces, Projects, Lessons, Blocks-as-JSON, Memberships, etc.). SQLite-compatible, which keeps the schema in Phase 7 portable if Lumio ever needs to outgrow D1.
- **Cloudflare R2** — binary asset storage (images/video/audio/files), replacing `IndexedDB`. R2's content-addressing pairs naturally with `AssetStore`'s existing SHA-256 dedup scheme — that logic barely changes, it just targets a different backend.
- **Cloudflare Cache** — edge caching for published HTML/SCORM/xAPI exports and for R2 asset delivery, since exported course packages are read-heavy and rarely change once published.
- **Authentication** — real password hashing (PBKDF2/bcrypt-equivalent available in Workers via WebCrypto), real session tokens (signed, stored as httpOnly cookies or bearer tokens), real OAuth (swap `_mockProviderPayload` for actual provider SDK callbacks — the abstraction boundary already exists and was built for exactly this swap).
- **REST API** — the single source of truth replacing direct `LumioState` access; every screen's data access becomes a fetch call instead of an object read.
- **Asset Service** — a focused Worker route group for upload/dedup/streaming, since asset handling has different scaling and validation needs (file size limits, MIME sniffing, virus/content scanning hooks) than the rest of the API.

---

## PHASE 4 — Authentication Design (design only, not implemented)

| Capability | Design |
|---|---|
| **Registration** | `POST /auth/register` — Worker validates email format/uniqueness against D1 (not client-side array scan), hashes password server-side (PBKDF2-SHA256 or bcrypt via a WASM binding), creates User + owns-new-Workspace + Membership in one transaction. |
| **Verification** | New capability (doesn't exist today): registration issues a verification token (same TTL pattern as password reset), emailed via a transactional provider (e.g., Postmark/Resend through a Worker fetch). Unverified accounts can log in but see a persistent banner; hard-gating is a product decision, not an architectural one. |
| **Login** | `POST /auth/login` — server looks up by normalized (lowercased, trimmed) email, verifies hash, issues a session token. No client-side credential comparison ever again. |
| **Remember Me** | Two session token lifetimes: short-lived (browser-session cookie, expires on browser close) vs. long-lived (30-day refresh token, httpOnly, rotated on use). This directly replaces the current `sessionStorage` tab-marker hack with a real, server-verifiable distinction. |
| **Password Reset** | Same flow as today (request → token → reset), but the token is validated server-side against D1 and the email is actually sent, not printed to console. |
| **OAuth** | Real provider callback (Google/Microsoft/Apple) hits a Worker callback route, which performs the exact same "find or create user, bind to workspace" logic `_createUser`/`_bindNewUserToWorkspace` already implement — that logic is provider-agnostic today by design and survives the migration almost unchanged. |
| **Workspace Invitations** | `POST /workspaces/:id/invitations` issues a token-bound invite; `POST /invitations/:token/accept` creates the Membership. Mirrors `acceptInvitation` in `workspaceSettings.js` almost exactly — that function already builds a membership directly rather than going through self-registration, which is the correct pattern to keep. |
| **User Roles** | Workspace Owner / Administrator / (future: Editor, Viewer) — already modeled as a `role` string on Membership; carries over as an enum column. |
| **Permissions** | Move from "trust the client" to server-enforced: every Worker route checks the caller's Membership role for the target `workspaceId` before reading/writing. This is the single most important security change in the whole migration — today, anything resembling a permission check is purely cosmetic (UI hides a button; nothing stops a direct state mutation). |
| **Session Management** | D1 `Sessions` table (one row per device/login), not a single `session` object — this is what actually fixes "register on desktop, can't log in on laptop," since sessions become independent per device while the User/credentials are shared. |
| **Token Refresh** | Long-lived refresh token rotates a short-lived access token (e.g., 15min JWT or signed cookie) on each use; refresh token revocation = logout from that device. |
| **Logout** | `POST /auth/logout` revokes that session's refresh token server-side — real, not just a local state clear. |
| **Account Deletion** | New capability: cascades through the ownership model in Phase 2 — must decide (product call, flagged here, not decided) whether a sole Workspace Owner's deletion cascades to their Workspace's Projects or requires transfer-of-ownership first. |
| **Admin Controls** | Workspace Owner can view/revoke any member's active sessions, change roles, remove members — all already partially present in `workspaceSettings.js`'s UI; the gap is purely that none of it is currently enforced or persisted beyond the local browser. |

---

## PHASE 5 — Migration Strategy

Each step is independently shippable and rollback-able — the frontend keeps working against `localStorage` until the corresponding backend step is live and the frontend's data-access layer is swapped for that subsystem only.

| Step | Subsystem | Reason it's this order | Risk | Rollback | Dependencies |
|---|---|---|---|---|---|
| 1 | **Authentication** | Nothing else can be tenant-scoped without real, server-verified identity first. Also the subsystem with the most urgent, proven production defect. | High (touches every session) | Feature-flag: keep `LumioAuth`'s local fallback live until the Worker-backed version is verified in production for N days | None — first step |
| 2 | **Users** | Authentication needs a real Users table; same migration, effectively inseparable from Step 1. | Medium | Same flag as Step 1 | Step 1 |
| 3 | **Workspaces + Memberships** | Tenant boundary must exist before any tenant-owned data moves. | Medium | Keep local workspace data readable until migration script confirms 1:1 parity | Steps 1–2 |
| 4 | **Projects + Folders** | Smallest, lowest-risk content type; proves the Project↔Workspace ownership edge end-to-end before touching the much larger Lessons/Blocks volume. | Medium | Dual-write (write to both local and D1) during a transition window; verify counts match before cutting reads over | Step 3 |
| 5 | **Lessons + Blocks** | Largest, highest-value, highest-risk content. Done after Projects so the parent relationship is already proven. | High (data volume + schema variance across 30+ block types) | Per-project migration script with a dry-run/diff mode before any destructive step; keep local copy until a project is confirmed fully migrated | Step 4 |
| 6 | **Assets** | Must follow Lessons/Blocks, since asset references live inside block data — migrating assets first would create dangling `asset://` refs with nothing yet pointing at the new asset IDs. | High (binary volume, IndexedDB → R2 transfer) | Keep `IndexedDB` blobs in place until R2 upload + reference rewrite is confirmed for every block referencing that asset | Step 5 |
| 7 | **Publishing (SCORM/HTML/xAPI/PDF)** | Export logic depends on Lessons/Blocks/Assets all being readable from the new backend; moving generation into a Worker is also a good opportunity to do it async/cached rather than synchronously in the browser. | Medium | Old client-side generation path stays available as a fallback per project until Worker-side export output is byte-for-byte diffed against it | Steps 4–6 |
| 8 | **Sharing** (new capability — workspace invitations, project-level sharing if added) | Needs real Users + Workspaces + Memberships to mean anything. | Medium | New capability — no legacy behavior to preserve, so risk is purely "ship it correctly the first time," not regression | Steps 1–3 |
| 9 | **Roles & Permissions enforcement** | Should be the last thing hardened, once every subsystem is actually behind the API — enforcing permissions before all reads/writes go through the Worker would just break things that haven't moved yet. | High (a strict enforcement pass will surface every place the old UI assumed unchecked access) | Ship permission checks behind a "log only, don't block" mode first, audit the logs, then flip to enforcing | Steps 1–8 |
| 10 | **Production Cutover** | Final flip: stop reading from `localStorage`/`IndexedDB` entirely, treat them as a one-time import source only (e.g., "Import this browser's local projects" for any user who used the pre-SaaS version). | High (point of no return for the old model) | Keep an export-everything-to-`.lumio`-file path available indefinitely — already exists today — as a manual escape hatch even post-cutover | Steps 1–9 |

**Cross-cutting rule for every step:** never delete the local copy of a subsystem's data until that subsystem's cloud copy has been read-verified, not just write-verified. This is a direct extension of the Permanent Validation Rule that has governed every prior sprint on this project — it does not change just because the target moved from "another tab" to "another datacenter."

---

## PHASE 6 — API Surface (responsibilities only, no implementation)

**Auth**
- `POST /auth/register` — create account + first workspace
- `POST /auth/login` — issue session
- `POST /auth/logout` — revoke current session
- `POST /auth/refresh` — rotate access token from refresh token
- `POST /auth/password-reset/request` — issue reset token, send email
- `POST /auth/password-reset/confirm` — consume token, set new password
- `GET /auth/oauth/:provider/callback` — provider round-trip
- `GET /users/me` — resolve current identity (replaces `getCurrentUser()`)
- `PATCH /users/me` — profile edits
- `DELETE /users/me` — account deletion (with cascade rules from Phase 4)

**Workspaces**
- `GET /workspaces/:id` / `PATCH /workspaces/:id` — settings
- `GET /workspaces/:id/members` — membership list (replaces direct `workspaceMemberships` array reads)
- `POST /workspaces/:id/invitations` / `POST /invitations/:token/accept` — invite flow
- `DELETE /workspaces/:id/members/:userId` — remove member

**Projects**
- `GET /projects` (paginated, filterable by folder/status/search — replaces full-array client-side filtering)
- `POST /projects` / `PATCH /projects/:id` / `DELETE /projects/:id` (soft delete → Trash)
- `POST /projects/:id/restore` — un-delete

**Lessons & Blocks**
- `GET /projects/:id/lessons/:lessonId` — returns the block array (kept as one JSON document per lesson, mirroring today's shape, rather than one row per block — see Phase 7 rationale)
- `PUT /projects/:id/lessons/:lessonId` — full-document replace, matching today's "rerender whole lesson" editing model; a future optimization could move to block-level PATCH once conflict handling (Phase 8) is in place

**Assets**
- `POST /assets` — upload, returns content-addressed `assetId` (replaces `AssetStore.put`)
- `GET /assets/:id` — stream from R2 (replaces `AssetStore.get`/`resolveUrl`)
- `DELETE /assets/:id` — only permitted when reference count reaches zero, computed server-side

**Publishing**
- `POST /projects/:id/publish/:format` — kicks off SCORM/HTML/xAPI/PDF generation (sync for small courses, async job + webhook/poll for large ones)
- `GET /projects/:id/publish-history` — replaces `course.publishHistory[]`

**Notifications**
- `GET /notifications` / `PATCH /notifications/:id/read`

---

## PHASE 7 — Database Design (Cloudflare D1, SQLite-compatible)

```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,          -- store normalized (lowercase, trimmed)
  password_hash TEXT,                  -- NULL for OAuth-only accounts
  first_name TEXT, last_name TEXT,
  display_name TEXT,
  avatar_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  auth_provider TEXT NOT NULL,         -- 'email' | 'google' | 'microsoft' | 'apple'
  status TEXT NOT NULL DEFAULT 'active',
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE INDEX idx_users_email ON users(email);

-- Workspaces
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);

-- WorkspaceMembers (composite identity — the exact lesson from this sprint's
-- workspaceMemberships bug: no surrogate id needed, the composite key IS the identity)
CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                  -- 'workspace_owner' | 'administrator' | ...
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_members_user ON workspace_members(user_id);

-- Invitations
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER
);
CREATE INDEX idx_invitations_workspace ON invitations(workspace_id);

-- Sessions (one row per device — the structural fix for "register on desktop,
-- can't log in on laptop": the device-local single `session` object becomes
-- many rows, one per device, all referencing the same shared user)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  remember_me INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- PasswordResets
CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

-- Folders
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_folders_workspace ON folders(workspace_id);

-- Projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',     -- draft | in_review | approved
  hero_image_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  thumbnail_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  last_accessed_at INTEGER,
  deleted_at INTEGER,                        -- soft delete = Trash
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_projects_workspace ON projects(workspace_id, deleted_at);
CREATE INDEX idx_projects_folder ON projects(folder_id);

-- Lessons (block array kept as one JSON document per lesson, not one row per
-- block — see rationale below)
CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  blocks_json TEXT NOT NULL,            -- the existing Block[] shape, unchanged
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_lessons_project ON lessons(project_id, position);

-- Assets (content-addressed, exactly mirroring AssetStore's existing model)
CREATE TABLE assets (
  id TEXT PRIMARY KEY,                  -- sha256 hash, same as today's asset:// id
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT,
  size_bytes INTEGER NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 0, -- incremented/decremented as blocks reference it
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_assets_workspace ON assets(workspace_id);

-- Notifications
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE, -- NULL = workspace-wide
  type TEXT NOT NULL,
  payload_json TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

-- Reviews / Comments (new capability)
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  block_id TEXT,                        -- block ids are not globally unique today; scope by lesson
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_project ON comments(project_id);

-- AuditLogs (new capability)
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,                 -- 'project.delete', 'member.role_change', etc.
  target_type TEXT, target_id TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_workspace ON audit_logs(workspace_id, created_at);
```

**Normalization note — why Lessons stay as one JSON document per row, not one row per Block:** today's editor model treats a lesson as a single ordered array, re-rendered as a whole on every edit (`renderLessonBuilder(lesson.id)`), and Builder/Preview/every export format all consume that same array shape. Splitting blocks into individual rows would require a much larger rewrite of the rendering pipeline for no clear win at current scale (lessons are small, well-bounded documents, not a large relational dataset). The JSON-document-per-lesson approach lets the *entire* existing block-rendering codebase survive the migration essentially unchanged — only the data-fetching wrapper around it changes. This can be revisited later if block-level real-time collaboration becomes a requirement (see Phase 8).

**Cascade behavior, stated explicitly:**
- Workspace deleted → cascades to Projects, Folders, Memberships, Invitations, Notifications, Assets, Audit Logs (all `ON DELETE CASCADE`).
- User deleted → cascades to their Sessions, PasswordResets, Memberships; **does not** cascade to Workspaces they own (`ON DELETE RESTRICT` on `workspaces.owner_id`) — ownership must be transferred first, a deliberate guard against orphaning a workspace's content.
- Project deleted (hard delete, post-Trash) → cascades to Lessons, Comments.
- Asset deleted → only ever triggered when `ref_count` reaches 0; never cascades from a single block edit.

---

## PHASE 8 — Performance

- **Caching**: Cloudflare Cache for R2 asset delivery and for published export packages (immutable once published — cache aggressively, invalidate only on republish).
- **Pagination**: `GET /projects` and any future `GET /workspaces/:id/members` must be cursor- or offset-paginated from day one — today's "load the whole array, filter in JS" pattern does not survive past a few hundred projects per workspace.
- **Lazy loading**: Lesson block content already lazy-loads assets via `AssetStore.preloadBlocks`; this pattern carries over directly to R2-backed fetches.
- **Asset streaming**: R2 supports range requests natively — video/audio playback should stream, not fully download before play, which `AssetStore.resolveMediaSrc`'s current blob-URL approach effectively forces today.
- **Optimistic updates**: the Builder's current "mutate in memory, debounce-save" pattern is already optimistic-UI shaped — the migration should preserve that *feel* (instant local edit) while the actual persistence becomes a background API call with a save-status indicator (the existing `#save-status` "Saved ✓" UI is the right primitive, it just needs to reflect real network state instead of a local debounce timer).
- **Conflict handling**: once two devices can edit the same lesson, last-write-wins (today's only model) becomes actively dangerous instead of just architecturally limited. Minimum viable approach: optimistic concurrency via a `version` column on `lessons`, rejecting a save whose base version is stale and prompting the author to reload/merge — full operational-transform/CRDT-based real-time collaboration is a larger, separate initiative, not a Sprint-1 requirement.
- **Offline behavior**: the existing local-first editing model is actually a *feature* worth preserving deliberately — design the API layer so the frontend can keep editing against a local cache and sync once connectivity returns, rather than requiring a live connection for every keystroke. This reframes "browser-local storage" from purely a bug into also a deliberate offline cache, once a real backend exists as the source of truth.
- **Background sync**: autosave becomes a background `fetch` with retry/backoff, not a synchronous local write — must handle the "closed the tab before the request finished" case explicitly (today's `beforeunload` synchronous save has no real network equivalent; a `navigator.sendBeacon` fallback or a short-lived service worker queue is the standard pattern here).

---

## PHASE 9 — Security

- **Authentication security**: real server-side password hashing (bcrypt/Argon2/PBKDF2 via WebCrypto in Workers) replaces the explicitly-non-cryptographic `_hashPassword` — that function's own comment already documents it as a stopgap, not a security boundary.
- **Session expiry**: short-lived access tokens (~15min) + rotating refresh tokens, with explicit revocation lists for logout-everywhere / admin-initiated revocation.
- **CSRF**: any cookie-based session auth needs CSRF tokens on state-changing requests, or a same-site=strict cookie + custom-header double-submit pattern if using bearer tokens instead.
- **XSS**: the current codebase already uses `escapeHtml` in many places for user-authored text rendered into the DOM — a full audit of every rich-text/user-input rendering path becomes mandatory once content is shared across users/devices rather than trusted as "this browser's own data."
- **Rate limiting**: login, registration, and password-reset-request endpoints need per-IP and per-email rate limits at the Worker layer — none of this exists or can exist in the current architecture, since there's no shared server to rate-limit against.
- **Upload validation**: MIME-type sniffing (not just trusting the `Content-Type` header) and size limits at the Asset Service, before anything reaches R2.
- **Permission checks**: every Worker route must re-derive the caller's role from their session + the target `workspaceId` server-side — never trust a role claimed by the client.
- **Audit logging**: the new `audit_logs` table (Phase 7) should be written to by every state-changing admin action (role changes, member removal, project deletion) from day one, not added later — it's far cheaper to build in from the start than to retrofit.
- **Secrets management**: Cloudflare Workers' encrypted environment variables/secrets bindings for OAuth client secrets, email-provider API keys, and any signing keys — never committed to the repo, never sent to the client.

---

## Final Deliverable Summary

1. **Complete architecture report** — this document.
2. **Current architecture diagram** — Phase 1 table + storage-layer summary above.
3. **Future architecture diagram** — Phase 3.
4. **Entity relationship diagram** — Phase 2 + Phase 7 schema.
5. **API blueprint** — Phase 6.
6. **Database blueprint** — Phase 7.
7. **Migration roadmap** — Phase 5.
8. **Risk assessment** — risk column embedded in Phases 1 and 5; highest risks are Autosave (behavioral change), Lessons/Blocks migration (volume + schema variance), and Permission enforcement (will surface every place the old UI assumed unchecked access).
9. **Estimated implementation phases** — directly the 10 steps in Phase 5; each is independently shippable behind a feature flag / dual-write window, so "estimated phases" and "migration roadmap" are the same artifact by design, not two separate timelines.
10. **Recommendations before writing any backend code**:
    - Build Sessions as a true one-row-per-device table from day one (Phase 7) — this is the one change that, on its own, fixes the exact production symptom that triggered this sprint.
    - Do not attempt to migrate Comments/Audit Logs/AI prompt history/Undo-Redo — they don't exist yet; design their schema fresh rather than forcing a "migration" framing onto greenfield work.
    - Treat the existing `AssetStore` content-addressing scheme as a feature to preserve, not replace — its SHA-256 dedup model maps almost directly onto R2 object keys.
    - Decide the account-deletion-cascade and real-time-collaboration-conflict-handling product questions explicitly (flagged in Phases 4 and 8) before Step 5/6 of the migration, since both affect schema decisions that are expensive to change after data exists.
    - Keep the `.lumio` file export/import path alive indefinitely post-cutover as a manual recovery/portability mechanism — it already exists, costs nothing to keep, and is the only available recovery path before backend backups mature.

No backend code, schema, or migration was created or executed as part of this sprint. This document is the design artifact for that work.
