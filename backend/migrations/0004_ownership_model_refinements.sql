-- Migration number: 0004    2026-07-05
--
-- Ownership model refinements — two approved schema changes following the
-- final ownership model clarification:
--
--   1. Enforce the "one workspace per user" rule at the database level.
--      workspaces.owner_id already carries a UNIQUE constraint via the
--      application layer; this migration adds a UNIQUE INDEX so the
--      database itself prevents a second workspace being created for the
--      same owner, regardless of how the INSERT reaches D1.
--
--   2. Refine project_shares.permission from the prototype-era ('view','edit')
--      pair to the three-level collaboration model ('viewer','editor','reviewer')
--      and add a granted_by column (nullable FK → users) that records which
--      Workspace Owner or Administrator issued the share grant.
--      The table is recreated rather than altered because SQLite does not
--      support modifying CHECK constraints in-place. No data loss occurs:
--      project_shares contains no rows at this stage of the migration ladder.
--
-- Depends on: 0001, 0002, 0003
-- Does NOT touch: workspace_members, invitations, authContext, AuthService,
--                 or any frontend file.

PRAGMA foreign_keys = ON;


-- ===========================================================================
-- 1. Enforce one workspace per user at the database level
-- ===========================================================================
-- A Workspace Owner can never have more than one Personal Workspace.
-- The application enforces this rule today; the schema must also enforce it
-- so a direct SQL INSERT or a future code path cannot silently violate the
-- invariant. A UNIQUE INDEX is the correct SQLite mechanism — it is
-- semantically identical to UNIQUE on the column declaration and is the
-- only way to add this constraint to an existing table without recreating it.
CREATE UNIQUE INDEX idx_workspaces_owner_unique ON workspaces (owner_id);


-- ===========================================================================
-- 2. Recreate project_shares with the refined permission model
-- ===========================================================================
-- Step A: drop the existing table (no data exists at this point in the
-- migration ladder — project_shares was created in 0002 but no application
-- path yet writes rows to it). The DROP also removes the associated index.
DROP TABLE IF EXISTS project_shares;

-- Step B: create the replacement table with three permission levels and
-- the new granted_by column.
--
-- permission values:
--   viewer   — read-only: can preview and export; cannot change anything.
--   editor   — can open and edit content, add/edit/delete lessons and blocks.
--              Cannot submit for review or publish.
--   reviewer — can view content and submit review decisions (approve/reject
--              with comments). Cannot edit content. Used specifically for
--              the governance workflow.
--
-- granted_by is SET NULL on user deletion so historical share records are
-- preserved even if the granting user's account is later removed.
CREATE TABLE project_shares (
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      TEXT    NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  permission   TEXT    NOT NULL DEFAULT 'viewer'
                         CHECK (permission IN ('viewer', 'editor', 'reviewer')),
  -- The user who created this share grant. NULL for system-generated grants
  -- or grants whose author has since been deleted.
  granted_by   TEXT    REFERENCES users(id) ON DELETE SET NULL,
  granted_at   INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

-- Reverse lookup: "every project shared with this user" — equally common
-- as the forward lookup via the composite PK.
CREATE INDEX idx_project_shares_user      ON project_shares (user_id);
-- Covers "who can review project X?" queries.
CREATE INDEX idx_project_shares_reviewer  ON project_shares (project_id)
  WHERE permission = 'reviewer';
