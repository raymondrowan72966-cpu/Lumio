-- Migration 0006: Add missing objectives column to courses table.
-- The original migration 0002 was applied without this column — this
-- ALTER TABLE brings the live schema in sync with the migration file.
ALTER TABLE courses ADD COLUMN objectives TEXT NOT NULL DEFAULT '[]';
