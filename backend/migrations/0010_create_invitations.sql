-- Migration number: 0010    2026-08-01
--
-- Sprint 1 — Workspace Invitation Engine. Creates the invitations table
-- required by InvitationRepository and InvitationService.
--
-- Design decisions (per architectural review):
--   - Explicit status column ('pending','accepted','revoked','expired') per AD #2,
--     alongside timestamps for auditing — both are retained.
--   - invitation_token_hash stores SHA-256 of the raw token (charter Rule 8:
--     never store the raw token). Same pattern as sessions.refresh_token_hash
--     and password_resets.reset_token_hash.
--   - auth_provider constrains to the same four values as users.auth_provider.
--   - role constrains to the two valid workspace_members.role values.
--   - inviter_user_id uses ON DELETE RESTRICT (not CASCADE): the inviter's
--     account cannot be deleted while uninvested invitations still reference
--     them — the workspace owner must be transferred first, same rationale
--     as workspaces.owner_id.
--   - workspace_id uses ON DELETE CASCADE: deleting a workspace removes all
--     its invitations.
--
-- Depends on: 0001_create_core_tables.sql

PRAGMA foreign_keys = ON;

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
