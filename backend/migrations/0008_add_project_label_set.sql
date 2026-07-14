-- Migration 0008 — Add label_set to projects table
-- The learner language is a Project Summary field, not a course-blob detail.
-- Denormalising label_set onto the project row lets the Projects list display
-- the correct language badge immediately after login, without loading the full
-- course object. Pattern follows status, health, and folder_id — all summary
-- fields that the Projects page needs without opening a course.
ALTER TABLE projects ADD COLUMN label_set TEXT;
