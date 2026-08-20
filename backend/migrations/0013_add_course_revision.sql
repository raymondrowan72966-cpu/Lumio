-- Migration number: 0013    2026-08-20
--
-- Add optimistic concurrency revision column to courses.
-- Non-destructive: existing rows get revision = 1 via DEFAULT.
-- The revision is incremented on every UPDATE in the application layer,
-- and the frontend sends expectedRevision so a stale write is rejected
-- with HTTP 409 rather than silently overwriting newer cloud content.

ALTER TABLE courses ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
