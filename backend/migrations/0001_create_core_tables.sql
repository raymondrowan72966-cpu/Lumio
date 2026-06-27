-- Migration number: 0001 	 2026-06-27T15:32:14.099Z
--
-- Sprint 2A — Database Foundation. Creates the five core tables required by
-- docs/SAAS_AUTHENTICATION_SPECIFICATION.md and
-- docs/SAAS_MIGRATION_BLUEPRINT.md Phase 7: users, workspaces,
-- workspace_members, sessions, password_resets.
--
-- No other tables are created — assets/projects/lessons/etc. are out of
-- scope for this sprint and are deliberately not referenced by foreign key
-- here (see DECISIONS.md ADR-006 for the one place this required a
-- documented choice: avatar storage).
--
-- This migration contains no DML, no seed data, and no application logic —
-- schema only, per the Sprint 2A charter ("No hashing. No tokens.").

PRAGMA foreign_keys = ON;

-- ===========================================================================
-- users
-- ===========================================================================
-- Identity is the account (this row), never the email string — see
-- SAAS_AUTHENTICATION_SPECIFICATION.md Section 9 (Email Change Policy).
-- Email normalization (lowercase, trimmed) is enforced by the application
-- AND defended at the schema level via the CHECK constraint below, so a
-- write that bypasses app-level normalization still cannot violate the
-- uniqueness invariant silently.
CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE
                        CHECK (email = lower(trim(email))),
  auth_provider       TEXT NOT NULL
                        CHECK (auth_provider IN ('email', 'google', 'microsoft', 'apple')),
  -- NULL for OAuth-only accounts (Google/Microsoft/Apple) — those never have
  -- a Lumio-managed password. Hashing itself is out of scope this sprint;
  -- this column only ever stores a hash, never plaintext (charter Rule 8).
  password_hash       TEXT,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL DEFAULT '',
  display_name        TEXT NOT NULL,
  -- A URL, not a foreign key to an `assets` table — that table doesn't
  -- exist yet (out of scope this sprint), and OAuth providers supply avatar
  -- photos as external URLs in the first place, not Lumio-hosted assets.
  -- See DECISIONS.md ADR-006.
  avatar_url          TEXT,
  email_verified_at   INTEGER,
  -- Open-ended on purpose: only 'active' is meaningful today, but account
  -- lockout (SAAS_AUTHENTICATION_SPECIFICATION.md Section 2, "Locked
  -- Accounts") will need a value here in a future sprint. Left unconstrained
  -- by a CHECK so that addition doesn't require a schema migration of its
  -- own just to widen an enum.
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  -- Soft delete — required by the Account Deletion grace-period behaviour
  -- in SAAS_PRODUCT_SPECIFICATION.md Section 2. NULL = not deleted.
  deleted_at          INTEGER
);

-- Case-insensitive lookups are already guaranteed by the CHECK constraint
-- above (the column can only ever hold a lowercase value), so the UNIQUE
-- constraint on `email` is sufficient on its own; no separate
-- lower(email) index is needed. A second, partial index speeds up the
-- overwhelmingly common "active users only" query shape without bloating
-- the index with soft-deleted rows.
CREATE INDEX idx_users_active ON users (id) WHERE deleted_at IS NULL;


-- ===========================================================================
-- workspaces
-- ===========================================================================
-- Exactly one Owner per workspace, always (SAAS_PRODUCT_SPECIFICATION.md
-- Section 3). owner_id uses ON DELETE RESTRICT, not CASCADE: a user cannot
-- be deleted while they still own a workspace with this FK in place — they
-- must transfer ownership first (Section 3 of the product spec), which is
-- an application-level workflow this sprint does not implement, but the
-- schema must already make the unsafe path (silently orphaning a
-- workspace) impossible at the database layer, not just by convention.
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  -- Soft delete — workspace deletion grace period, same pattern as users.
  deleted_at  INTEGER
);

CREATE INDEX idx_workspaces_owner ON workspaces (owner_id);
CREATE INDEX idx_workspaces_active ON workspaces (id) WHERE deleted_at IS NULL;


-- ===========================================================================
-- workspace_members
-- ===========================================================================
-- Composite primary key (workspace_id, user_id) — NO synthetic membership
-- id, per the approved design. This is a deliberate, documented correction:
-- an earlier prototype-stage bug (see DECISIONS.md ADR-001) was caused
-- exactly by code that assumed every record had a surrogate `.id`, when
-- membership's real identity was always this pair. The schema enforces
-- that correctness structurally, not just by convention in application code.
CREATE TABLE workspace_members (
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL
                          CHECK (role IN ('workspace_owner', 'administrator')),
  -- NULL for the workspace's own Owner (their membership is created
  -- automatically at workspace-creation time, never via an invitation).
  -- Set to the acceptance timestamp for every Administrator, whose
  -- membership row is only ever created as the terminal step of accepting
  -- an invitation (SAAS_AUTHENTICATION_SPECIFICATION.md Section 4).
  invitation_accepted_at INTEGER,
  -- Open-ended for the same reason as users.status — only 'active' is
  -- meaningful until a future sprint needs e.g. 'suspended'. Per the
  -- product spec, *removing* a member deletes this row outright rather
  -- than changing its status, so 'active' is expected to be the only
  -- value in practice for the foreseeable future; the column still exists
  -- now so adding a real second state later doesn't require a migration
  -- that adds the column itself, only one that starts using a new value.
  status                TEXT NOT NULL DEFAULT 'active',
  -- "When they joined this workspace" — semantically distinct from
  -- created_at (when this row was written), even though the two will be
  -- identical for every row created by this schema's own application
  -- logic. The distinction exists for any future data import/migration
  -- scenario where a recorded join date could legitimately differ from
  -- the row's actual creation time.
  joined_at             INTEGER NOT NULL,
  created_at            INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

-- The composite primary key already indexes (workspace_id, user_id) and
-- (workspace_id) as its leading column; a separate index on user_id alone
-- is required for the equally common reverse lookup ("every workspace this
-- user belongs to") per SAAS_AUTHENTICATION_SPECIFICATION.md Section 8.
CREATE INDEX idx_workspace_members_user ON workspace_members (user_id);


-- ===========================================================================
-- sessions
-- ===========================================================================
-- One row per device/login — this table exists specifically to fix the
-- cross-device authentication defect identified during production
-- validation (a single shared `session` object could never represent
-- "logged in on desktop AND laptop, log out of one without affecting the
-- other"). See SAAS_AUTHENTICATION_SPECIFICATION.md Section 6 and Section 7.
CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Nullable: the exact device-fingerprinting strategy (cookie-based,
  -- generated server-side on first contact, etc.) is an Authentication-
  -- sprint application decision, not a schema decision — this column only
  -- commits to "a session may optionally be tagged with a stable per-device
  -- identifier," not to how that identifier is produced.
  device_id           TEXT,
  -- Never the raw refresh token (charter Rule 8) — only its hash, and only
  -- ever compared against, never decrypted/reversed.
  refresh_token_hash  TEXT NOT NULL UNIQUE,
  expires_at          INTEGER NOT NULL,
  created_at          INTEGER NOT NULL,
  -- Updated on every successful refresh — supports the sliding-expiry
  -- "Remember Me" behaviour in SAAS_AUTHENTICATION_SPECIFICATION.md
  -- Section 7, and is what a future "Active Sessions" UI's "last active"
  -- column reads from.
  last_activity_at    INTEGER NOT NULL,
  -- NULL = still valid. Set on logout (this session only) or on a
  -- password reset (every session for that user — Section 7's
  -- all-sessions-revoked rule), distinct from expiry.
  revoked_at          INTEGER
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
-- refresh_token_hash already has a unique index via the UNIQUE constraint
-- above; a second explicit index would be redundant.
-- Speeds up the "find sessions that are neither revoked nor expired" scan
-- a future cleanup job will run periodically.
CREATE INDEX idx_sessions_active ON sessions (user_id) WHERE revoked_at IS NULL;


-- ===========================================================================
-- password_resets
-- ===========================================================================
CREATE TABLE password_resets (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Never the raw token (charter Rule 8) — same pattern as sessions.
  reset_token_hash    TEXT NOT NULL UNIQUE,
  created_at          INTEGER NOT NULL,
  expires_at          INTEGER NOT NULL,
  -- NULL = unused. A timestamp here (rather than a boolean) directly
  -- records *when* it was used, which a boolean would have discarded —
  -- the same modeling choice as sessions.revoked_at.
  used_at             INTEGER
);

CREATE INDEX idx_password_resets_user ON password_resets (user_id);
-- reset_token_hash already has a unique index via the UNIQUE constraint above.
