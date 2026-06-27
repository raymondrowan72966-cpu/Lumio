# Changelog

All notable backend changes are recorded here, newest first. Frontend (`Lumio Prototype/`) changes are not tracked in this file.

## Sprint 2B — Security Services

### Added
- `src/utils/crypto.js` — shared low-level primitives: secure random bytes/tokens, base64url encode/decode, SHA-256 hex digest, constant-time comparison, expiry helpers. Web Crypto API only, no external dependency.
- `src/config/security.js` — security policy configuration (password policy, every token type's TTL), env-overridable, wired into `src/config/index.js` as `config.security`.
- `src/services/PasswordService.js` — production PBKDF2-SHA256 (600,000 iterations) password hashing and verification, replacing the Phase 1 placeholder. Self-describing stored hash format (`pbkdf2$iterations$salt$hash`). Complexity validation (min length, mixed case, digit) per the authentication specification.
- `src/services/TokenService.js` — stateless token generation/verification engine for 5 token types (session, rememberMe, passwordReset, emailVerification, invitation), replacing the Phase 1 placeholder. Tokens are random 256-bit values; only their SHA-256 hash is ever meant to be persisted.
- `src/services/SessionService.js` — full implementation against the Sprint 2A `sessions` table, replacing the Phase 1 placeholder: create, load, validate, refresh (with token rotation), revoke one, revoke all, and a cleanup-candidate finder. Not wired to login/registration — every method is called directly with an already-known `userId`.

### Not included (by design — out of Sprint 2B scope)
- No registration, login, logout, Remember Me UI/cookie handling, invitations, OAuth, workspace creation, or any API endpoint business logic.
- `AuthService`, `UserRepository`, `WorkspaceRepository` remain unmodified placeholders from Sprint 1.
- No schema changes — the Sprint 2A `sessions` table is used as-is (see `DECISIONS.md` ADR-011 for the one place this required a deliberate, documented design choice instead of a schema change).

### Validation
- 39/39 assertions passed in a throwaway validation script (not committed): PasswordService (hashing, verification, all 6 invalid-input cases, salt uniqueness), security utilities (constant-time comparison, hash determinism), TokenService (generation, verification, expiry, revocation, tampering, unknown type), SessionService against a **real D1 database via Miniflare** (not a mock) — multiple concurrent sessions per user, cross-device isolation, token rotation, single-session revocation not affecting other devices, revoke-all, real expiry via direct row mutation, cleanup-candidate detection.
- Found and fixed two real, non-obvious facts about the D1 API while building that validation harness (not production code issues) — documented in `DECISIONS.md` ADR-010.
- Confirmed `wrangler deploy --dry-run` still succeeds for all three environments with the new services bundled in, and the live frontend preview reloads with a clean console.

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
