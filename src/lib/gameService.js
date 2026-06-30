/**
 * Ralli Game Service
 *
 * All database operations for game sessions, players, and answers.
 * Returns { data, error } for every function — callers decide how to handle errors.
 *
 * All writes are non-blocking from the UI perspective:
 * - createGameSession is awaited (UI needs the session id)
 * - endGameSession is fire-and-forget (UI navigates immediately)
 *
 * Production upgrade checklist:
 *   - Scope all queries to tenantId once RLS + JWT claims are wired
 *   - Replace player_id 'anonymous' with auth user.id
 *   - game_answers: extend to pass full per-question payloads from KahootHostView
 *
 * @module gameService
 */

import { supabase } from "./supabase.js";

// ── SESSION ────────────────────────────────────────────────────────────────────

/**
 * Create a new game session in the database.
 * Called in handleCreateSession immediately after the host clicks "Create Session".
 *
 * @param {{ pin: string, name: string, quizId: string, questionCount: number, demoMode: boolean, tenantId?: string|null, hostId?: string }} params
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function createGameSession({
  pin,
  name,
  quizId,
  questionCount,
  demoMode = false,
  tenantId = null,
  hostId = "anonymous",
}) {
  const { data, error } = await supabase
    .from("game_sessions")
    .insert({
      pin,
      name,
      quiz_id:        quizId,
      question_count: questionCount,
      demo_mode:      demoMode,
      tenant_id:      tenantId,
      host_id:        hostId,
      status:         "waiting",
    })
    .select()
    .single();
  return { data, error };
}

/**
 * Find a game session by PIN.
 * Called in handleEnterPin for cross-device joins (player's device has no local sessions state).
 *
 * @param {string} pin
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function findSessionByPin(pin) {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("pin", pin)
    .single();
  return { data, error };
}

/**
 * Mark a session as started and record start time.
 * Called in handleGameStart before navigating to rankd-game.
 *
 * @param {string} pin
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function startGameSession(pin) {
  const { data, error } = await supabase
    .from("game_sessions")
    .update({
      status:     "started",
      started_at: new Date().toISOString(),
    })
    .eq("pin", pin)
    .select()
    .single();
  return { data, error };
}

/**
 * Mark a session as completed, record end time, and save final player scores.
 * Called in handleGameEnd (fire-and-forget — UI navigates immediately).
 *
 * @param {string} pin
 * @param {{ scores: Array, tenantId?: string|null }} params
 *   scores: [{ id?, name, score, emoji?, color? }]
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function endGameSession(pin, { scores = [], tenantId = null } = {}) {
  // 1. Update session status
  const { data: session, error: sessionError } = await supabase
    .from("game_sessions")
    .update({
      status:   "completed",
      ended_at: new Date().toISOString(),
    })
    .eq("pin", pin)
    .select()
    .single();

  if (sessionError) {
    console.error("[gameService] endGameSession: failed to update session", sessionError);
    return { data: null, error: sessionError };
  }

  if (!session?.id) return { data: null, error: new Error("session not found") };

  // 2. Save final player scores (ranked by position in scores array)
  if (scores.length > 0) {
    const playerRows = scores.map((p, idx) => ({
      session_id:  session.id,
      tenant_id:   tenantId,
      player_id:   p.id ?? p.playerId ?? p.name ?? `player-${idx}`,
      name:        p.name,
      emoji:       p.emoji ?? null,
      color:       p.color ?? null,
      final_score: p.score ?? 0,
      final_rank:  idx + 1,
    }));

    const { error: playersError } = await supabase
      .from("game_players")
      .insert(playerRows);

    if (playersError) {
      console.error("[gameService] endGameSession: failed to save player scores", playersError);
      // Non-fatal — session is already marked completed
    }
  }

  return { data: session, error: null };
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────

/**
 * Fetch completed game session history for a tenant.
 * Used by Leadership Dashboard and user history views.
 *
 * @param {string} tenantId
 * @param {number} [limit=20]
 * @returns {Promise<{ data: Array|null, error: Object|null }>}
 */
export async function getGameHistory(tenantId, limit = 20) {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("*, game_players(*)")
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .order("ended_at", { ascending: false })
    .limit(limit);
  return { data, error };
}

/**
 * Fetch a single session with all player scores.
 * Used by results screens when navigating from game history.
 *
 * @param {string} sessionId
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function getSessionWithResults(sessionId) {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("*, game_players(*), game_answers(*)")
    .eq("id", sessionId)
    .single();
  return { data, error };
}
