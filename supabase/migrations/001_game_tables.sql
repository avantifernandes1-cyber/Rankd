-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Game Tables Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: all statements use IF NOT EXISTS / CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── game_sessions ─────────────────────────────────────────────────────────────
-- One row per game session. PIN is the join code players use.
-- Status lifecycle: waiting → live → started → completed

CREATE TABLE IF NOT EXISTS game_sessions (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT,                                    -- null until auth is wired
  quiz_id        TEXT         NOT NULL,                   -- references the quiz used
  host_id        TEXT         NOT NULL DEFAULT 'anonymous',
  pin            TEXT         NOT NULL,                   -- 6-digit join code
  name           TEXT         NOT NULL,                   -- session display name
  status         TEXT         NOT NULL DEFAULT 'waiting', -- waiting|live|started|completed
  question_count INTEGER      NOT NULL DEFAULT 0,
  demo_mode      BOOLEAN      NOT NULL DEFAULT false,     -- true = fake players in lobby
  player_count   INTEGER      NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT game_sessions_pin_unique UNIQUE (pin)
);

COMMENT ON TABLE  game_sessions              IS 'One row per ralli game session';
COMMENT ON COLUMN game_sessions.pin          IS '6-digit join code shown to players';
COMMENT ON COLUMN game_sessions.demo_mode    IS 'True = simulated lobby, no real players';
COMMENT ON COLUMN game_sessions.tenant_id    IS 'Populated when Supabase Auth is wired';

-- ── game_players ──────────────────────────────────────────────────────────────
-- Final state of each player at game end (rank, score, accuracy).
-- Inserted once per player when the session is marked completed.

CREATE TABLE IF NOT EXISTS game_players (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID         NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  tenant_id     TEXT,
  player_id     TEXT         NOT NULL,   -- user.id or ephemeral id for guests
  name          TEXT         NOT NULL,
  emoji         TEXT,
  color         TEXT,
  final_score   INTEGER      NOT NULL DEFAULT 0,
  final_rank    INTEGER,                 -- 1-based rank at game end
  accuracy      INTEGER,                 -- percentage correct (0-100)
  joined_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  game_players            IS 'Final player scores per game session';
COMMENT ON COLUMN game_players.player_id  IS 'Matches auth user id once auth is wired';
COMMENT ON COLUMN game_players.accuracy   IS 'Percent of questions answered correctly';

-- ── game_answers ──────────────────────────────────────────────────────────────
-- Per-question answer for each player. Powers the Leadership Dashboard
-- readiness drill-down and the per-session analytics in results screens.

CREATE TABLE IF NOT EXISTS game_answers (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID         NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  tenant_id     TEXT,
  player_id     TEXT         NOT NULL,
  player_name   TEXT,
  question_idx  INTEGER      NOT NULL,   -- 0-based index into session's question array
  option_idx    INTEGER,                 -- null for open-ended questions
  answer_text   TEXT,                    -- populated for open-ended questions
  time_ms       INTEGER,                 -- time taken to answer in milliseconds
  is_correct    BOOLEAN,
  points        INTEGER      NOT NULL DEFAULT 0,
  answered_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  game_answers               IS 'Per-question answers for analytics + readiness';
COMMENT ON COLUMN game_answers.question_idx  IS '0-based index into session quiz questions';
COMMENT ON COLUMN game_answers.time_ms       IS 'Response time in ms from question display';

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- PIN lookup: most frequent query (player joins)
CREATE INDEX IF NOT EXISTS idx_game_sessions_pin
  ON game_sessions(pin);

-- Tenant-scoped history queries (Leadership Dashboard, analytics)
CREATE INDEX IF NOT EXISTS idx_game_sessions_tenant_status
  ON game_sessions(tenant_id, status, created_at DESC);

-- Player results per session
CREATE INDEX IF NOT EXISTS idx_game_players_session
  ON game_players(session_id);

-- Player history across sessions
CREATE INDEX IF NOT EXISTS idx_game_players_player
  ON game_players(player_id, session_id);

-- Answer analytics per session (question distribution, accuracy)
CREATE INDEX IF NOT EXISTS idx_game_answers_session_question
  ON game_answers(session_id, question_idx);

-- Player performance history (readiness score inputs)
CREATE INDEX IF NOT EXISTS idx_game_answers_player
  ON game_answers(player_id, answered_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Permissive policies for now — anon key can read/write all game data.
-- Tighten once Supabase Auth is wired:
--   - Players can only read sessions they're in
--   - Hosts can only manage their own sessions
--   - ralli_admin can access all tenant data via service_role

ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_answers  ENABLE ROW LEVEL SECURITY;

-- Permissive policies (replace with tenant-scoped policies after auth)
DO $$
BEGIN
  -- game_sessions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sessions' AND policyname = 'anon_read_game_sessions') THEN
    CREATE POLICY "anon_read_game_sessions"
      ON game_sessions FOR SELECT TO anon USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sessions' AND policyname = 'anon_insert_game_sessions') THEN
    CREATE POLICY "anon_insert_game_sessions"
      ON game_sessions FOR INSERT TO anon WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_sessions' AND policyname = 'anon_update_game_sessions') THEN
    CREATE POLICY "anon_update_game_sessions"
      ON game_sessions FOR UPDATE TO anon USING (true);
  END IF;

  -- game_players
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_players' AND policyname = 'anon_all_game_players') THEN
    CREATE POLICY "anon_all_game_players"
      ON game_players FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  -- game_answers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'game_answers' AND policyname = 'anon_all_game_answers') THEN
    CREATE POLICY "anon_all_game_answers"
      ON game_answers FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enable realtime publication for status change subscriptions.
-- (Broadcast channels don't require this, but it's needed for Postgres changes.)
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Run this to confirm tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'game_%';
