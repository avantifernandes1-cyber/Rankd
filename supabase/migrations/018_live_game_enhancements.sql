-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Live Game Enhancements
-- Run after 001_game_tables.sql and 015_game_lobby_participants.sql.
--
-- Adds persistence for:
--   1. game_sessions  — host game state (phase, current question, paused flag)
--      Allows host refresh without losing game position.
--   2. game_session_participants — player connection status + last seen
--      Allows lobby to exclude disconnected players from count.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── game_sessions additions ───────────────────────────────────────────────────

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS current_question_index INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase                  TEXT        NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS paused                 BOOLEAN     NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN game_sessions.current_question_index IS '0-based index of the question currently being displayed';
COMMENT ON COLUMN game_sessions.phase IS 'Host game phase: waiting | countdown | question | reveal | open-review | ended';
COMMENT ON COLUMN game_sessions.paused IS 'True when the host has paused the timer mid-question';

-- ── game_session_participants additions ───────────────────────────────────────

ALTER TABLE game_session_participants
  ADD COLUMN IF NOT EXISTS status       TEXT        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN game_session_participants.status IS 'active | left | disconnected';
COMMENT ON COLUMN game_session_participants.last_seen_at IS 'Timestamp of most recent heartbeat from player client';

-- Index for filtering active participants only (lobby count)
CREATE INDEX IF NOT EXISTS idx_gsp_session_status
  ON game_session_participants (session_id, status);

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('game_sessions', 'game_session_participants')
--   AND column_name IN ('current_question_index', 'phase', 'paused', 'status', 'last_seen_at');
