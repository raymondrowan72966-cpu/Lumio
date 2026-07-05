-- Migration number: 0003    2026-07-05
--
-- Phase 2 schema refinements — two approved architectural changes from the
-- final D1 architecture review:
--
--   1. Remove courses.objectives JSON column.
--      course_objectives is now the sole source of truth for all learning
--      objectives. The Worker assembles objectives:[] on every course read.
--      Dual-source drift between the JSON column and the SQL table is
--      eliminated by removing the JSON column entirely.
--
--   2. Introduce workspace_settings as a dedicated 1:1 configuration table.
--      workspaces remains a narrow identity/governance table (id, owner_id,
--      name, created_at, updated_at, deleted_at). All configuration — branding,
--      theme, language, timezone, billing plan, storage quota, AI flags, and
--      default authoring defaults — moves here. workspace_id is both the PK
--      and the FK, enforcing the one-to-one relationship at the schema level.
--
-- Depends on: 0001_create_core_tables.sql, 0002_create_content_tables.sql

PRAGMA foreign_keys = ON;


-- ===========================================================================
-- 1. Remove courses.objectives JSON column
-- ===========================================================================
-- course_objectives (created in 0002) is already the relational source of
-- truth for all objective rows. This column was a redundant JSON copy that
-- created two authoritative representations of the same data — a drift risk
-- identified during the final architecture review and eliminated here.
--
-- SQLite ALTER TABLE DROP COLUMN is supported on D1 (SQLite ≥ 3.35.0).
-- The column has no FK references and no indexes pointing at it, so the
-- DROP is safe and non-destructive to any other table.
ALTER TABLE courses DROP COLUMN objectives;


-- ===========================================================================
-- 2. Create workspace_settings
-- ===========================================================================
-- One row per workspace — created automatically (in the same transaction as
-- the workspace row itself, via application code) whenever a new workspace is
-- registered. Defaults are set so an INSERT with only workspace_id is valid.
--
-- workspace_id is both PRIMARY KEY and FOREIGN KEY to workspaces(id). This
-- enforces the 1:1 constraint at the schema level: there can never be two
-- settings rows for the same workspace, and a settings row can never outlive
-- its workspace.
--
-- Column groups:
--   Branding        — logo_asset_id, accent_color, cover_image_asset_id
--   Appearance      — theme
--   Localisation    — timezone, language
--   Billing         — billing_plan, storage_quota_bytes
--                     (moved to workspace_billing when Stripe integration lands;
--                      no other table references these columns so extraction is
--                      a simple additive migration + DROP COLUMN pair)
--   Authoring       — default_course_theme_id, default_landing_layout, ai_features_enabled
--   Extensible JSON — branding_config, preferences
--                     (heterogeneous document-shaped settings that do not
--                      benefit from normalisation and are always read/written
--                      as a unit; never queried for internal content)
CREATE TABLE workspace_settings (
  workspace_id              TEXT PRIMARY KEY
                              REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Branding
  -- logo_asset_id and cover_image_asset_id are soft FKs (TEXT, no FK
  -- constraint) because assets may be deleted independently; the application
  -- handles the NULL case when constructing workspace payloads.
  logo_asset_id             TEXT,
  cover_image_asset_id      TEXT,
  accent_color              TEXT,    -- CSS hex string e.g. '#5B4CF5'

  -- Appearance
  theme                     TEXT NOT NULL DEFAULT 'system'
                              CHECK (theme IN ('light', 'dark', 'system')),

  -- Localisation
  timezone                  TEXT NOT NULL DEFAULT 'UTC',    -- IANA tz string
  language                  TEXT NOT NULL DEFAULT 'en',     -- BCP 47 tag

  -- Billing (promoted to workspace_billing when Stripe integration arrives)
  billing_plan              TEXT NOT NULL DEFAULT 'free'
                              CHECK (billing_plan IN ('free', 'starter',
                                                      'pro', 'enterprise')),
  -- NULL means "use platform default" — overridden at the workspace level
  -- for enterprise customers or promotional allocations.
  storage_quota_bytes       INTEGER,

  -- Authoring defaults
  ai_features_enabled       INTEGER NOT NULL DEFAULT 1,     -- boolean as SQLite int
  default_course_theme_id   TEXT,
  default_landing_layout    TEXT NOT NULL DEFAULT 'A',

  -- Document-shaped extension fields (see design rationale above)
  branding_config           TEXT,    -- JSON object — heterogeneous branding doc
  preferences               TEXT,    -- JSON object — heterogeneous workspace prefs

  updated_at                INTEGER NOT NULL
);
-- No secondary index needed: all queries hit workspace_id directly via PK.
