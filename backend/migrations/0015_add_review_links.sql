-- ===========================================================================
-- review_links
-- ===========================================================================
-- Isolated table for "Publish for Review" delivery format.
-- No existing table is modified by this migration.
--
-- snapshot_json  — frozen course + lesson data serialised at creation time.
--                  Never updated after creation; subsequent course edits do
--                  not affect the review snapshot.
-- asset_ids      — JSON array of asset hash filenames (e.g. ["abc123.png"])
--                  valid for this review link. Used as a security whitelist
--                  before any R2 lookup on the review asset route.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS review_links (
  id            TEXT    PRIMARY KEY,
  course_id     TEXT    NOT NULL,
  workspace_id  TEXT    NOT NULL,
  created_by    TEXT    NOT NULL,
  snapshot_json TEXT    NOT NULL,
  asset_ids     TEXT    NOT NULL DEFAULT '[]',
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER,
  is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_review_links_course ON review_links (course_id);
