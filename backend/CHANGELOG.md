# Changelog

All notable backend changes are recorded here, newest first. Frontend (`Lumio Prototype/`) changes are not tracked in this file.

## Sprint 2A — Database Foundation

### Added
- `migrations/0001_create_core_tables.sql` — the production D1 schema for `users`, `workspaces`, `workspace_members`, `sessions`, `password_resets`, per `docs/SAAS_MIGRATION_BLUEPRINT.md` Phase 7 and `docs/SAAS_AUTHENTICATION_SPECIFICATION.md`.
- `scripts/0001_create_core_tables.local-rollback.sql` — local-only rollback script for validation (never applied to staging/production).
- 7 explicit indexes (active-user/workspace partial indexes, owner lookup, reverse membership lookup, session/reset user lookups, active-session lookup).
- CHECK constraints enforcing lowercase-normalized email, valid `auth_provider` values, and valid `role` values at the database layer, not just in application code.
- `workspace_members` composite primary key `(workspace_id, user_id)` — no synthetic id, per the approved design (see `DECISIONS.md` ADR-001).

### Not included (by design — out of Sprint 2A scope)
- No authentication, registration, login, or session-issuing logic — schema only.
- No password hashing, no token generation.
- No API endpoints, no Worker business logic, no frontend changes.
- No tables beyond the five required this sprint (no `projects`, `assets`, `invitations`, etc.).

### Validation
- Applied `0001_create_core_tables.sql` to a local D1 database via `wrangler d1 migrations apply --local` — 5 tables + 7 indexes created exactly as designed, confirmed by inspecting `sqlite_master` directly.
- Inserted real rows across all 5 tables, including an Owner, an Administrator (with `invitation_accepted_at` set), a session, and a password reset.
- Confirmed constraint enforcement with real failing inserts: duplicate email (case-insensitive), non-normalized (uppercase) email, invalid `role` value, and an orphaned foreign key — all correctly rejected.
- Confirmed cascade/restrict behaviour with real deletes: deleting a workspace cascades to its `workspace_members`; deleting a user cascades to their `sessions` and `password_resets`; deleting a user who still owns a workspace is correctly **blocked** (`ON DELETE RESTRICT`) until ownership is transferred or the workspace is removed first.
- Ran the full create → apply → rollback → reapply cycle locally; schema after reapply is byte-for-byte identical to the original (`sqlite_master` diffed directly).
- Found and fixed a real tooling gotcha during this validation: Wrangler's migration scanner treats every `.sql` file inside `migrations/` as a trackable migration regardless of name — the rollback script had to be moved to `scripts/` (see `DECISIONS.md` ADR-007). Also documented that `migrations apply` will report "No migrations to apply!" after a manual local rollback, since it only checks its own tracking table — reapplying after a manual rollback requires `wrangler d1 execute --file=...` directly.

## Sprint 1 — Cloud Foundation

### Added
- Cloudflare Worker entry point (`src/index.js`) with a minimal, dependency-free router (`src/routes/router.js`).
- Environment-variable-only configuration loader for development/staging/production (`src/config/index.js`), failing fast on missing required bindings.
- D1 client wrapper (`src/database/client.js`) — connectivity only, no application queries.
- Read-only schema-version introspection (`src/database/schemaVersion.js`), backed by Wrangler's built-in D1 migrations feature (no custom migration runner).
- Structured logger supporting DEBUG/INFO/WARNING/ERROR/AUDIT levels (`src/utils/logger.js`).
- Shared typed-error framework: `AppError` base + `AuthenticationError`, `ValidationError`, `PermissionError`, `DatabaseError`, `ConfigurationError`, `NetworkError`.
- Centralised error-handling and request-logging middleware.
- Placeholder skeletons: `AuthService`, `SessionService`, `TokenService`, `PasswordService`, `UserRepository`, `WorkspaceRepository` — every method throws "not implemented yet."
- Route definitions for `/auth`, `/users`, `/workspaces`, `/projects`, `/assets` — every endpoint returns `501 Not Implemented`. Added `/health` (not in the original required set, near-zero cost, makes every future deploy verifiable in seconds).
- `wrangler.toml` with dev/staging/production environment blocks, `.dev.vars.example` for local secrets (gitignored).

### Not included (by design — out of Sprint 1 scope)
- No authentication, registration, login, or session logic.
- No project/asset/workspace persistence.
- No application database tables — `backend/migrations/` is intentionally empty.

### Validation
- `node --check` on every source file.
- End-to-end mock-fetch test against the real Worker handler (health check, all 5 resource route groups, 404 for unknown routes, fail-fast on missing D1 binding).
- `wrangler deploy --dry-run` succeeded for all three environments.
- Confirmed zero changes to the existing frontend; live preview reloaded with a clean console.
