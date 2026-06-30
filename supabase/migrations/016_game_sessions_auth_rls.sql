-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Fix game_sessions RLS for authenticated users
--
-- Root cause: migration 001_game_tables.sql only created RLS policies for the
-- `anon` role. Authenticated Supabase users (managers and players with real
-- accounts) send a JWT, which means Postgres evaluates them as `authenticated`
-- — not `anon`. With no policy for `authenticated`, RLS denied all reads and
-- writes on game_sessions, causing:
--
--   1. Manager's createGameSession INSERT → blocked → data = null → dbId missing
--      → lobby never loads real participants.
--   2. Player's findSessionByPin SELECT → blocked → remote = null → player
--      joins a ghost local session → joinGameSession never called → manager
--      never sees the player.
--
-- game_session_participants already has auth_all_game_session_participants
-- (migration 015) so that table is fine.
--
-- Fix: add permissive authenticated policies for game_sessions, game_players,
-- and game_answers matching the existing anon policies.
-- Tighten to tenant-scoped policies once JWT custom claims are wired.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN

  -- ── game_sessions ──────────────────────────────────────────────────────────
  -- Managers (authenticated) need INSERT to create sessions.
  -- Players (authenticated) need SELECT to look up sessions by PIN.
  -- Both need UPDATE (manager starts/ends; player count increments).

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'game_sessions' AND policyname = 'auth_select_game_sessions'
  ) THEN
    CREATE POLICY "auth_select_game_sessions"
      ON game_sessions
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'game_sessions' AND policyname = 'auth_insert_game_sessions'
  ) THEN
    CREATE POLICY "auth_insert_game_sessions"
      ON game_sessions
      FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'game_sessions' AND policyname = 'auth_update_game_sessions'
  ) THEN
    CREATE POLICY "auth_update_game_sessions"
      ON game_sessions
      FOR UPDATE TO authenticated
      USING (true);
  END IF;

  -- ── game_players ───────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'game_players' AND policyname = 'auth_all_game_players'
  ) THEN
    CREATE POLICY "auth_all_game_players"
      ON game_players
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  -- ── game_answers ───────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'game_answers' AND policyname = 'auth_all_game_answers'
  ) THEN
    CREATE POLICY "auth_all_game_answers"
      ON game_answers
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

END $$;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Run to confirm all six policies exist (3 anon + 3 auth on game_sessions):
-- SELECT policyname, roles, cmd FROM pg_policies
-- WHERE tablename IN ('game_sessions', 'game_players', 'game_answers')
-- ORDER BY tablename, roles, cmd;
