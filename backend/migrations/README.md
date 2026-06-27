# D1 Migrations

This folder holds numbered `.sql` migration files, applied via Wrangler's
built-in D1 migrations feature — not a custom runtime migration runner.
Wrangler tracks which migrations have already run in a `d1_migrations` table
it creates and maintains itself; `backend/src/database/schemaVersion.js`
reads that table read-only for reporting, but never writes to it.

**Sprint 1 (Cloud Foundation) left this folder empty.** Sprint 2A (Database
Foundation) added `0001_create_core_tables.sql` — `users`, `workspaces`,
`workspace_members`, `sessions`, `password_resets` — per
`docs/SAAS_MIGRATION_BLUEPRINT.md` Phase 7 and
`docs/SAAS_AUTHENTICATION_SPECIFICATION.md`. No other application tables
(projects, lessons, assets, etc.) exist yet — those begin in later sprints.

**Only `.sql` files belong in this folder.** Wrangler's migration scanner
treats every `.sql` file here as a real, trackable migration, regardless of
its name — confirmed live when a rollback script was briefly placed here
during Sprint 2A's validation and got applied as if it were a genuine
migration (and out of order, since it sorted alphabetically before the
migration it was meant to undo). Local-only rollback/test scripts belong in
`backend/scripts/`, never here.

## Conventions for future migrations

- File naming: `NNNN_short_description.sql` (e.g. `0001_create_users.sql`),
  numbered sequentially — Wrangler generates this naming for you via the
  command below.
- One logical change per migration file — do not bundle unrelated schema
  changes into a single numbered migration.
- Migrations are forward-only. A mistake is fixed by adding a new migration
  that corrects it, never by editing a migration that has already been
  applied to any environment.

## Commands

```bash
# Create a new, empty, correctly-numbered migration file:
npx wrangler d1 migrations create lumio-db-dev <description>

# Apply pending migrations locally:
npx wrangler d1 migrations apply lumio-db-dev --local

# Apply pending migrations to a deployed environment:
npx wrangler d1 migrations apply lumio-db-staging --env staging
npx wrangler d1 migrations apply lumio-db-production --env production
```

## Local rollback testing (validation only — not a production capability)

A local-only rollback script for the current schema lives in
`backend/scripts/0001_create_core_tables.local-rollback.sql`. Run it with
`wrangler d1 execute ... --file=`, never `migrations apply` (which has no
concept of rolling back).

**Important nuance, found while validating Sprint 2A:** after running a
manual rollback script this way, Wrangler's own `d1_migrations` tracking
table still believes the migration is applied — `wrangler d1 migrations
apply --local` will report **"No migrations to apply!"** even though the
tables are genuinely gone, because that command only ever checks its own
tracking table, never the database's actual current schema. To reapply
after a manual local rollback, execute the migration file directly instead:

```bash
npx wrangler d1 execute lumio-db-dev --local --file=migrations/0001_create_core_tables.sql
```

This is a local validation workflow only. Production/staging never use a
manual rollback script — see "Migrations are forward-only" above.
