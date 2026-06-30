-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Game Lobby Participants
-- Run after 001_game_tables.sql.
--
-- Tracks players who have joined a game lobby (pre-game, while status=waiting).
-- Separate from game_players which stores final per-game results at game end.
--
-- Purpose: cross-device lobby sync so the manager sees real joined players
-- even when Supabase Realtime Presence is not available or the user is on
-- a different browser. Supabase Realtime (postgres_changes) on this table
-- provides real-time INSERT events; a polling fallback covers the rest.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS game_session_participants (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID         NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  tenant_id   TEXT,                          -- for cross-tenant isolation checks
  player_id   TEXT         NOT NULL,         -- auth user id (or ephemeral for guests)
  name        TEXT         NOT NULL,
  emoji       TEXT,
  color       TEXT,
  joined_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- One row per player per session. Upsert is safe to call on re-join.
  UNIQUE (session_id, player_id)
);

COMMENT ON TABLE  game_session_participants            IS 'Players currently in a live game lobby';
COMMENT ON COLUMN game_session_participants.player_id  IS 'Matches auth.users.id when the user is authenticated';
COMMENT ON COLUMN game_session_participants.tenant_id  IS 'Populated for cross-tenant isolation; matches game_sessions.tenant_id';

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary query: all participants for a session (lobby roster)
CREATE INDEX IF NOT EXISTS idx_gsp_session
  ON game_session_participants (session_id, joined_at ASC);

-- Tenant-scoped lookup (admin management)
CREATE INDEX IF NOT EXISTS idx_gsp_tenant_session
  ON game_session_participants (tenant_id, session_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Permissive policy (same as game_sessions) — tighten once tenant auth is fully
-- validated server-side. Cross-tenant protection is enforced client-side in
-- handleEnterPin by comparing remote.tenant_id vs currentUser.orgId.

ALTER TABLE game_session_participants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- anon key: full read/write (needed for unauthenticated guest joins)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'game_session_participants'
      AND policyname = 'anon_all_game_session_participants'
  ) THEN
    CREATE POLICY "anon_all_game_session_participants"
      ON game_session_participants
      FOR ALL TO anon
      USING (true)
      WITH CHECK (true);
  END IF;

  -- authenticated key: full read/write (real users joining sessions)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'game_session_participants'
      AND policyname = 'auth_all_game_session_participants'
  ) THEN
    CREATE POLICY "auth_all_game_session_participants"
      ON game_session_participants
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enable postgres_changes subscriptions for INSERT events.
-- The manager lobby subscribes to: event=INSERT, table=game_session_participants,
-- filter=session_id=eq.<sessionId>
-- This fires immediately when a player calls joinGameSession().

ALTER PUBLICATION supabase_realtime ADD TABLE game_session_participants;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'game_session_participants';
--
-- SELECT * FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'game_session_participants';
