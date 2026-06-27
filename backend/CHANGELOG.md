# Changelog

All notable backend changes are recorded here, newest first. Frontend (`Lumio Prototype/`) changes are not tracked in this file.

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
