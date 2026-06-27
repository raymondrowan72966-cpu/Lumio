# D1 Migrations

This folder holds numbered `.sql` migration files, applied via Wrangler's
built-in D1 migrations feature — not a custom runtime migration runner.
Wrangler tracks which migrations have already run in a `d1_migrations` table
it creates and maintains itself; `backend/src/database/schemaVersion.js`
reads that table read-only for reporting, but never writes to it.

**This folder is intentionally empty as of Sprint 1 (Cloud Foundation).**
No application tables are created yet — that begins in the Authentication
sprint, per `docs/SAAS_MIGRATION_BLUEPRINT.md` Phase 5/7 and
`docs/SAAS_AUTHENTICATION_SPECIFICATION.md`.

## Conventions for future migrations

- File naming: `NNNN_short_description.sql` (e.g. `0001_create_users.sql`),
  numbered sequentially — Wrangler generates this naming for you via the
  command below.
- One logical change per migration file — do not bundle unrelated schema
  changes into a single numbered migration.
- Migrations are forward-only. A mistake is fixed by adding a new migration
  that corrects it, never by editing a migration that has already been
  applied to any environment.

## Commands (for when migrations begin)

```bash
# Create a new, empty, correctly-numbered migration file:
npx wrangler d1 migrations create lumio-db <description>

# Apply pending migrations locally:
npx wrangler d1 migrations apply lumio-db --local

# Apply pending migrations to a deployed environment:
npx wrangler d1 migrations apply lumio-db --env staging
npx wrangler d1 migrations apply lumio-db --env production
```
