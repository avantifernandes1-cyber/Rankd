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

// ── LOBBY PARTICIPANTS ────────────────────────────────────────────────────────

/**
 * Persist a player joining the lobby. Upserts so re-joins are safe.
 * Call immediately after the user confirms their name in the name-entry screen.
 *
 * @param {string} sessionId - game_sessions.id (UUID, the DB primary key, not the PIN)
 * @param {{ playerId: string, name: string, emoji?: string|null, color?: string|null, tenantId?: string|null }} params
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function joinGameSession(sessionId, { playerId, name, emoji = null, color = null, tenantId = null }) {
  const { data, error } = await supabase
    .from("game_session_participants")
    .upsert(
      {
        session_id: sessionId,
        player_id:  playerId,
        tenant_id:  tenantId,
        name,
        emoji,
        color,
        joined_at:  new Date().toISOString(),
      },
      { onConflict: "session_id,player_id" }
    )
    .select()
    .single();
  return { data, error };
}

/**
 * Fetch the current lobby roster for a session.
 * Used by the manager lobby on mount and as a polling fallback.
 *
 * @param {string} sessionId - game_sessions.id (UUID)
 * @returns {Promise<{ data: Object[]|null, error: Object|null }>}
 */
export async function getLobbyParticipants(sessionId) {
  const { data, error } = await supabase
    .from("game_session_participants")
    .select("*")
    .eq("session_id", sessionId)
    .order("joined_at", { ascending: true });
  return { data, error };
}

/**
 * Subscribe to new participants joining this lobby (postgres_changes INSERT).
 * Returns the Supabase channel so the caller can unsubscribe on cleanup.
 *
 * Usage:
 *   const channel = subscribeToLobbyParticipants(sessionId, (row) => addPlayer(row));
 *   // cleanup:
 *   supabase.removeChannel(channel);
 *
 * @param {string} sessionId - game_sessions.id (UUID)
 * @param {(row: Object) => void} onInsert - called with the new participant row
 * @returns {RealtimeChannel}
 */
export function subscribeToLobbyParticipants(sessionId, onInsert) {
  const channel = supabase
    .channel(`lobby_participants:${sessionId}`)
    .on(
      "postgres_changes",
      {
        event:  "INSERT",
        schema: "public",
        table:  "game_session_participants",
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        if (payload.new) onInsert(payload.new);
      }
    )
    .subscribe();
  return channel;
}

// ── LIVE GAME PERSISTENCE ─────────────────────────────────────────────────────

/**
 * Persist host game state (phase + current question index + paused flag).
 * Called on each phase transition in KahootHostView so a host refresh can recover.
 *
 * @param {string} sessionId - game_sessions.id (UUID)
 * @param {{ phase: string, currentQuestionIndex?: number, paused?: boolean }} params
 * @returns {Promise<{ error: Object|null }>}
 */
export async function updateSessionPhase(sessionId, { phase, currentQuestionIndex, paused } = {}) {
  const patch = { phase };
  if (currentQuestionIndex !== undefined) patch.current_question_index = currentQuestionIndex;
  if (paused !== undefined) patch.paused = paused;
  const { error } = await supabase
    .from("game_sessions")
    .update(patch)
    .eq("id", sessionId);
  return { error };
}

/**
 * Batch-insert per-question answers for all players after a reveal.
 * Called by KahootHostView.doReveal() once scores are computed.
 *
 * @param {string} sessionId - game_sessions.id (UUID)
 * @param {Array<{
 *   playerId: string,
 *   playerName: string,
 *   questionIdx: number,
 *   optionIdx: number|null,
 *   text: string|null,
 *   timeMs: number|null,
 *   isCorrect: boolean,
 *   points: number,
 *   tenantId?: string|null,
 * }>} answers
 * @returns {Promise<{ error: Object|null }>}
 */
export async function saveGameAnswers(sessionId, answers = []) {
  if (!answers.length) return { error: null };
  const rows = answers.map(a => ({
    session_id:   sessionId,
    tenant_id:    a.tenantId ?? null,
    player_id:    a.playerId,
    player_name:  a.playerName,
    question_idx: a.questionIdx,
    option_idx:   a.optionIdx ?? null,
    answer_text:  a.text ?? null,
    time_ms:      a.timeMs ?? null,
    is_correct:   a.isCorrect,
    points:       a.points ?? 0,
  }));
  const { error } = await supabase.from("game_answers").insert(rows);
  return { error };
}

/**
 * Mark a lobby participant as having left the session.
 * Called when a player disconnects (presence untrack) or manually leaves.
 *
 * @param {string} sessionId - game_sessions.id (UUID)
 * @param {string} playerId - player_id value from game_session_participants
 * @returns {Promise<{ error: Object|null }>}
 */
export async function markParticipantLeft(sessionId, playerId) {
  const { error } = await supabase
    .from("game_session_participants")
    .update({ status: "left", last_seen_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("player_id", playerId);
  return { error };
}

/**
 * Update a participant's last_seen_at heartbeat timestamp.
 * Called periodically by KahootPlayerView while the player is in-game.
 *
 * @param {string} sessionId - game_sessions.id (UUID)
 * @param {string} playerId
 * @returns {Promise<{ error: Object|null }>}
 */
export async function updateParticipantHeartbeat(sessionId, playerId) {
  const { error } = await supabase
    .from("game_session_participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("player_id", playerId);
  return { error };
}

/**
 * Fetch game history for a player from game_players table.
 * Used on the "My Scores" tab to replace the static USER_GAME_HISTORY seed.
 *
 * @param {string} playerId - auth user id
 * @param {number} [limit=20]
 * @returns {Promise<{ data: Array|null, error: Object|null }>}
 */
export async function getPlayerGameHistory(playerId, limit = 20) {
  const { data, error } = await supabase
    .from("game_players")
    .select("*, game_sessions(name, question_count, ended_at, pin)")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data, error };
}

/**
 * Fetch final results for a completed session from game_players.
 * Used by RankdResultsScreen when gameData is not in memory (after refresh).
 *
 * @param {string} sessionId - game_sessions.id (UUID)
 * @returns {Promise<{ data: Array|null, error: Object|null }>}
 */
export async function getSessionPlayers(sessionId) {
  const { data, error } = await supabase
    .from("game_players")
    .select("*")
    .eq("session_id", sessionId)
    .order("final_rank", { ascending: true });
  return { data, error };
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

/**
 * Fetch active / recent sessions for a tenant.
 * Used on mount to replace INITIAL_SESSIONS for real users.
 * Returns sessions normalised to the local state shape.
 *
 * @param {string} tenantId
 * @param {number} [limit=30]
 * @returns {Promise<{ data: Object[]|null, error: Object|null }>}
 */
export async function getActiveSessions(tenantId, limit = 30) {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["waiting", "started", "live", "completed"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return { data: null, error };

  const normalised = data.map(s => ({
    code:          s.pin,
    name:          s.name,
    quizId:        s.quiz_id,
    questionCount: s.question_count,
    status:        s.status,
    playerCount:   s.player_count ?? 0,
    demoMode:      s.demo_mode ?? false,
    players:       [],
    dbId:          s.id,
  }));

  return { data: normalised, error: null };
}
