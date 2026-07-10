-- Migration 0007 — Workspace Resource Persistence
-- Adds the generic workspace_resources table (label packs first; extensible to
-- themes, branding, settings) and the label_set reference column on courses.
PRAGMA foreign_keys = ON;

CREATE TABLE workspace_resources (
  id            TEXT    PRIMARY KEY,
  workspace_id  TEXT    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  resource_type TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  payload       TEXT    NOT NULL DEFAULT '{}',
  created_by    TEXT    REFERENCES users(id) ON DELETE SET NULL,
  updated_by    TEXT    REFERENCES users(id) ON DELETE SET NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_workspace_resources_ws_type
  ON workspace_resources (workspace_id, resource_type);

ALTER TABLE courses ADD COLUMN label_set TEXT;
