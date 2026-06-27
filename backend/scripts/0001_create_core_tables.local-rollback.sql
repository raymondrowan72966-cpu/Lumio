-- Rollback script for 0001_create_core_tables.sql — LOCAL VALIDATION ONLY.
--
-- This is NOT applied via `wrangler d1 migrations apply` (Wrangler's D1
-- migrations are forward-only and has no concept of a "down" migration —
-- documented already in migrations/README.md from Sprint 1). It lives in
-- backend/scripts/, deliberately OUTSIDE backend/migrations/, because
-- Wrangler's migration scanner picks up every .sql file in that directory
-- as a real, trackable migration regardless of filename — confirmed live
-- when an earlier version of this file, placed inside migrations/, was
-- applied as if it were migration 0001 itself (and alphabetically BEFORE
-- the real one, since "...down.sql" sorts before "...sql"). Keeping this
-- script entirely outside the scanned directory is the only reliable fix.
--
-- Run via:
--   npx wrangler d1 execute lumio-db-dev --local --file=scripts/0001_create_core_tables.local-rollback.sql
--
-- Production/staging rollback strategy remains: write a new, forward-only
-- corrective migration — never run this file against a deployed database.
-- Drop order is the reverse of creation order, respecting foreign keys.

DROP INDEX IF EXISTS idx_password_resets_user;
DROP TABLE IF EXISTS password_resets;

DROP INDEX IF EXISTS idx_sessions_active;
DROP INDEX IF EXISTS idx_sessions_user;
DROP TABLE IF EXISTS sessions;

DROP INDEX IF EXISTS idx_workspace_members_user;
DROP TABLE IF EXISTS workspace_members;

DROP INDEX IF EXISTS idx_workspaces_active;
DROP INDEX IF EXISTS idx_workspaces_owner;
DROP TABLE IF EXISTS workspaces;

DROP INDEX IF EXISTS idx_users_active;
DROP TABLE IF EXISTS users;
