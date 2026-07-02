-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 019: Add 'archived' status to tenant_lessons
-- Run after 018_live_game_enhancements.sql.
--
-- tenant_courses already supports 'archived' status (from 010_content_tables.sql).
-- tenant_lessons was missing it — this migration adds it.
-- The contentService already queries .neq("status","archived") for both tables,
-- so no application code changes are needed for the existing read paths.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tenant_lessons
  DROP CONSTRAINT IF EXISTS tenant_lessons_status_check;

ALTER TABLE public.tenant_lessons
  ADD CONSTRAINT tenant_lessons_status_check
  CHECK (status IN ('active', 'draft', 'inactive', 'archived'));
