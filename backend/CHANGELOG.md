# Changelog

All notable backend changes are recorded here, newest first. Frontend (`Lumio Prototype/`) changes are not tracked in this file.

## Sprint 2D — Authentication Middleware & API Standards

### Added
- `src/middleware/authContext.js` — `loadAuthContext(request, {db, sessionService})` reads the `Authorization: Bearer <token>` header, validates the token via `SessionService.validateSession`, loads the user (excluding deleted rows), resolves the single active workspace (if exactly one membership exists), and returns either a fully-populated auth context or `ANONYMOUS_CONTEXT` (unauthenticated). Exported `ANONYMOUS_CONTEXT` constant (`Object.freeze`) used by callers that need a typed empty context.
- `src/middleware/authorize.js` — six authorization helpers, all zero-dependency pure functions:
  - `requireAuthenticated(authContext)` — throws `AuthenticationError` if not authenticated.
  - `requireRole(authContext, allowedRoles)` — throws `AuthenticationError` (not authenticated) or `PermissionError` (wrong role).
  - `requireWorkspaceOwner(authContext)` — `requireRole` preset for `['workspace_owner']`.
  - `requireWorkspaceAdministratorOrAbove(authContext)` — `requireRole` preset for `['workspace_owner', 'administrator']`.
  - `withAuth(handler)` — HOC: calls `requireAuthenticated(ctx.auth)` before delegating to the wrapped handler.
  - `withRole(allowedRoles, handler)` — HOC: calls `requireRole(ctx.auth, allowedRoles)` before delegating.
- `src/utils/response.js` — `dataResponse(data, {status=200, headers={}})` wraps the payload as `{data:{...}}` per ADR-017. All new success responses must use this.

### Changed
- `src/index.js` — `TokenService` + `SessionService` now constructed per-request (stateless, cheap); `loadAuthContext` called before every route dispatch; result attached as `ctx.auth`. Every route handler now receives `ctx.auth` alongside `ctx.config`/`ctx.db`/`ctx.logger`.
- `src/routes/auth.js` — `handleRegister` now returns `dataResponse(result, {status:201})` (ADR-017). `jsonResponse` import replaced with `dataResponse`.
- `src/routes/health.js` — health handler now returns `dataResponse(...)` (ADR-017). `jsonResponse` import replaced with `dataResponse`.
- `DECISIONS.md` — ADR-017 (Standard API Response Envelope) and ADR-018 (Bearer token transport) added.
- `SPRINTS.md` — Sprint 2D row and detail section added; 2D+ row relabelled 2E+.

### Not included (by design — out of Sprint 2D scope)
- No login, logout, Remember Me, invitations, OAuth, password reset.
- No business logic, no frontend changes.
- No schema changes.
- Multi-workspace selector (auth spec Section 8) — not built; `currentWorkspace` is `null` when a user has more than one membership.

### Validation
- 44/44 assertions passed in a throwaway end-to-end test (not committed): ADR-017 envelope shape for `/health` and `/auth/register`, duplicate-email 409 with exact code + message, invalid email 400, unknown route 404, all six authorization guards (all role combinations + both HOC wrappers), `loadAuthContext` integration against real D1 via Miniflare (valid token → full context, no header → anonymous, invalid token → anonymous, revoked session → anonymous, expired session → anonymous), registration regression (201, no password_hash in response, exact email reflected).
- `wrangler deploy --dry-run` succeeded for all three environments (47.43 KiB / 12.92 KiB gzip), no broken imports.

## API Standards review: duplicate-email status code (addendum to Sprint 2C)

### Changed
- `src/errors/DuplicateEmailError.js` — now extends `AppError` directly with `status: 409` instead of `ValidationError` (which is hardcoded to 400). A duplicate resource is a conflict, not a malformed request, per the API Standards rule. `code: 'DUPLICATE_EMAIL'` and the response envelope shape (`{ error: { code, message } }`, consistent with every other error type) are unchanged. Default message updated to match the spec exactly: "An account with this email address already exists."

### Validation
- 14/14 assertions passed: live `/auth/register` now returns `201` (success), `409` (duplicate email, with the exact spec'd code and message), `400` (invalid email format, weak password), and `404` (unknown route) — each via the real Worker fetch handler against a real D1 database. Directly exercised the centralized error handler to confirm `AuthenticationError` → 401, `PermissionError` → 403, `DatabaseError` → 500, and an unhandled/unexpected exception → 500 without leaking its message — none of these are reachable through `/auth/register` yet, but the typed-error-to-status mapping they all share is the same one this fix lives in, so proving it once covers every future endpoint that throws these types. Also confirmed every error response (duplicate, invalid-input, etc.) still shares the identical `{error:{code,message}}` envelope — the status code changed, the response shape didn't.
- Re-ran `wrangler deploy --dry-run` for all three environments and reloaded the live frontend preview — both clean, no regressions.

## Database Concurrency Rule review (addendum to Sprint 2C)

### Added
- `src/errors/DuplicateEmailError.js` — a distinct, identifiable `ValidationError` subclass (`code: 'DUPLICATE_EMAIL'`) for the specific "email already registered" case, replacing the generic `ValidationError` previously thrown for it from both the pre-check and the in-batch UNIQUE-constraint catch.

### Changed
- `src/services/AuthService.js` — comments and error types updated to make explicit (and proven, not just implicit) that the `users.email` UNIQUE constraint is the sole authoritative enforcement of uniqueness; the pre-check is UX-only. No functional change to the registration flow's actual behavior — it was already structured this way.

### Validation
- New throwaway test monkey-patched the pre-check to always report "no duplicate found" (simulating a real check-then-insert race) and confirmed the database constraint alone still rejects the duplicate, with zero extra rows created, and that a genuinely new email still registers successfully under the same conditions. 5/5 assertions passed.
- Re-confirmed the API-level duplicate-email response still returns `400` (now with `code: "DUPLICATE_EMAIL"` instead of the previous generic `VALIDATION_ERROR`).
- Re-ran `wrangler deploy --dry-run` for all three environments and reloaded the live frontend preview — both clean.

## Sprint 2C — Workspace Owner Registration (Email & Password)

### Added
- `POST /auth/register` — the first real, working API endpoint in this backend. Validates input, normalizes email, hashes the password (PasswordService), creates User + Workspace + Owner membership + initial session as one atomic `db.batch()` transaction, and returns `{ user, workspace, session }` with a 201 status. Every other `/auth/*` route remains 501, untouched.
- `src/database/client.js` — new `batch(statements)` method: D1's all-or-nothing multi-statement transaction primitive, the only mechanism this sprint's atomicity requirement could be built on.
- `src/repositories/UserRepository.js`, `src/repositories/WorkspaceRepository.js` — real implementations (`findById`, `findByEmail`, `findMembership`, plus `buildCreateStatement`/`buildAddMemberStatement` pairs that build-but-don't-execute, for composing into the registration transaction), replacing the Sprint 1 placeholders.
- `src/services/SessionService.js` — added `buildCreateStatement` (generates the token, builds the INSERT, doesn't execute it); `createSession` now calls it internally, behavior unchanged and re-confirmed via regression test.
- `src/services/AuthService.js` — `registerOwner` is now a real implementation; `login`/`logout`/`acceptInvitation` remain Sprint 1 placeholders.

### Not included (by design — out of Sprint 2C scope)
- No login, logout, Remember Me, password reset, invitations, Administrator registration, OAuth (Google/Microsoft/Apple), projects, assets, or workspace switching.
- No schema changes — used the Sprint 2A `sessions` table exactly as-is (see `DECISIONS.md` ADR-011 from Sprint 2B for the one related design question already resolved without a schema change).

### Validation
- 28/28 assertions passed in a throwaway end-to-end test (not committed) — the **actual Worker `fetch()` handler**, called with real HTTP-shaped `Request` objects, against a **real D1 database via Miniflare** (not a mock): successful registration (201, correct response shape, no password hash ever in the response), duplicate email (400, zero orphaned rows in any of the 4 tables), weak password (both length and complexity cases), invalid email format, missing required fields, malformed JSON body, repeated independent registrations, and confirmation that every other `/auth/*` route still returns 501.
- Re-ran a focused 4-assertion regression check against `SessionService` directly to confirm the `buildCreateStatement` refactor changed nothing about its already-validated Sprint 2B behavior (create/validate/refresh/revoke) — all passed.
- Confirmed via direct log inspection at `LOG_LEVEL=DEBUG` (the most verbose setting) that no password value ever appears in any log line, at any level — only the normalized email and, on failure, the validation error's own message (e.g. "Password must be at least 8 characters"), never the password itself.
- `wrangler deploy --dry-run` succeeded for all three environments; the live frontend preview reloaded with a clean console.

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
