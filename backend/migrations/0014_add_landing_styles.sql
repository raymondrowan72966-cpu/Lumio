-- Migration number: 0014    2026-08-21
--
-- Add landing_styles column to courses table.
-- Stores the JSON-serialised landingStyles object (section heading/text/colour
-- customisations for Learning Objectives, Navigation Tips, and Course Structure
-- sections on the Course Landing page).
-- Non-destructive: existing rows get NULL via default, which the application
-- treats identically to an absent landingStyles object (ensureLandingStyles()
-- initialises defaults on first access).

ALTER TABLE courses ADD COLUMN landing_styles TEXT;
