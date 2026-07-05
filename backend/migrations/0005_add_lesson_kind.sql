-- Migration 0005: Add kind column to lessons to distinguish regular lessons
-- from assessment entries (both are stored in the same table but need to be
-- returned to the frontend as separate course.lessons / course.assessments arrays).
ALTER TABLE lessons ADD COLUMN kind TEXT NOT NULL DEFAULT 'lesson';
