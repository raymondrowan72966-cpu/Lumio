# Lumio Backend — Cloud Foundation (Sprint 1)

This is the backend Worker for Lumio's SaaS migration. **Sprint 1 implements
the foundation only** — routing, configuration, logging, error handling,
and database connectivity skeletons. No authentication, persistence,
invitations, or asset logic exists yet; every `/auth`, `/users`,
`/workspaces`, `/projects`, `/assets` route currently returns `501 Not
Implemented` by design.

This backend is intentionally a separate, sibling project to `Lumio
Prototype/` (the existing static frontend) — nothing here changes how that
frontend is served, and nothing in that frontend was modified by this sprint.

## Structure

```
backend/
  src/
    index.js            Worker entry point — request → router → response
    config/             Environment-variable-only configuration loader
    database/           D1 client wrapper, schema-version introspection
    errors/              Typed error classes + shared base class
    middleware/          Request id, structured error handling, request logging
    repositories/        UserRepository, WorkspaceRepository (skeletons)
    services/            AuthService, SessionService, TokenService,
                          PasswordService (skeletons)
    routes/              Route definitions + minimal hand-rolled router
    utils/                Structured logger, JSON response helpers
  migrations/             D1 migration files (empty — see migrations/README.md)
  wrangler.toml           Per-environment (dev/staging/production) config
  .dev.vars.example       Template for local-only secrets (never committed)
```

## Local development

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars   # only needed once secrets exist
npm run dev
curl http://localhost:8787/health
```

## Deployment

```bash
npm run deploy:staging
npm run deploy:production
```

Each targets the matching `[env.*]` block in `wrangler.toml`. Secrets are
never stored in this repository — set them with `wrangler secret put
<NAME> --env <environment>`.

## Why no application tables yet

Per the sprint's explicit scope, Phase 4 builds only the D1 *connectivity*
(`src/database/client.js`) and the *migration convention*
(`migrations/README.md`, using Wrangler's built-in D1 migrations feature —
no custom migration runner was written, since one already exists and
reinventing it would be unnecessary abstraction). The first real migration
(`users`, `workspaces`, `workspace_members`, etc., per
`docs/SAAS_MIGRATION_BLUEPRINT.md` Phase 7) is created in the Authentication
sprint, not this one.

## Reference specifications

- `docs/SAAS_MIGRATION_BLUEPRINT.md` — overall architecture
- `docs/SAAS_PRODUCT_SPECIFICATION.md` — product workflows
- `docs/SAAS_AUTHENTICATION_SPECIFICATION.md` — authentication/invitation detail
