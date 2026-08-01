-- Migration number: 0011    2026-08-01
--
-- Rebuilds the invitations table to match the schema defined in migration 0010.
--
-- Background: a manually-created invitations table existed in the remote database
-- before migration 0010 was applied. That table used different column names
-- (invited_by, token_hash) and was missing columns (revoked_at) required by
-- InvitationRepository. The table contained zero rows at the time of this
-- migration — confirmed before creation.
--
-- Migration 0010 is treated as immutable. This migration performs the drop-and-
-- recreate that makes the remote schema consistent with the code.
--
-- Depends on: 0010_create_invitations.sql

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS invitations;

CREATE TABLE invitations (
  id                    TEXT PRIMARY KEY,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inviter_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  email                 TEXT NOT NULL
                          CHECK (email = lower(trim(email))),
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL DEFAULT '',
  role                  TEXT NOT NULL
                          CHECK (role IN ('workspace_owner', 'administrator')),
  auth_provider         TEXT NOT NULL
                          CHECK (auth_provider IN ('email', 'google', 'microsoft', 'apple')),
  -- SHA-256 hex digest of the raw invitation token — never the raw token itself
  -- (charter Rule 8). Same pattern as sessions.refresh_token_hash.
  invitation_token_hash TEXT NOT NULL UNIQUE,
  expires_at            INTEGER NOT NULL,
  -- Explicit lifecycle status (AD #2). Timestamps are retained for auditing;
  -- the status column is the authoritative gate for all business logic.
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at            INTEGER NOT NULL,
  -- NULL until the invitation is accepted.
  accepted_at           INTEGER,
  -- NULL until the invitation is revoked.
  revoked_at            INTEGER
);

CREATE INDEX idx_invitations_workspace ON invitations (workspace_id);
CREATE INDEX idx_invitations_email     ON invitations (email);
-- Speeds up "list pending invitations for this workspace" — the most common query.
CREATE INDEX idx_invitations_pending   ON invitations (workspace_id, status)
  WHERE status = 'pending';
-- invitation_token_hash already has a unique index via the UNIQUE constraint above.
