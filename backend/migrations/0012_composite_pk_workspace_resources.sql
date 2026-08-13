-- Migration 0012 — Composite Primary Key for workspace_resources
--
-- Problem: workspace_resources was created with `id TEXT PRIMARY KEY` (global).
-- Workspace-level singleton resources (e.g. workspaceIdentity) all use
-- id = 'default', making the singleton globally unique across workspaces.
-- This caused Workspace B's save to silently overwrite Workspace A's row.
--
-- Fix: change the primary key to (id, workspace_id) so each workspace may
-- independently hold a singleton with the same logical id.
--
-- Strategy: recreate the table (SQLite does not support ALTER PRIMARY KEY).
-- All existing rows are copied verbatim — no column, payload, or FK changes.
-- This pattern is identical to migration 0004 (project_shares recreation).
--
-- Depends on: 0007_add_workspace_resources.sql

PRAGMA foreign_keys = ON;

-- Step 1: Create the replacement table with the composite primary key.
CREATE TABLE workspace_resources_new (
  id            TEXT    NOT NULL,
  workspace_id  TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  resource_type TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  payload       TEXT    NOT NULL DEFAULT '{}',
  created_by    TEXT    REFERENCES users(id) ON DELETE SET NULL,
  updated_by    TEXT    REFERENCES users(id) ON DELETE SET NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (id, workspace_id)
);

-- Step 2: Copy all existing rows unchanged.
INSERT INTO workspace_resources_new
  SELECT id, workspace_id, resource_type, name, payload,
         created_by, updated_by, version, created_at, updated_at
  FROM workspace_resources;

-- Step 3: Drop the original table (also drops its index).
DROP TABLE workspace_resources;

-- Step 4: Rename the replacement table into place.
ALTER TABLE workspace_resources_new RENAME TO workspace_resources;

-- Step 5: Recreate the secondary index (was dropped with the original table).
CREATE INDEX idx_workspace_resources_ws_type
  ON workspace_resources (workspace_id, resource_type);
