/**
 * Ralli Profile Service
 *
 * Thin layer between Supabase `profiles` table and the app's user object shape.
 * The rest of the app only ever sees the normalized user object — not raw DB rows.
 *
 * User object shape (unchanged from seed data):
 *   { id, email, name, initials, role, orgId, color, emoji, xp, streak, status, _isReal }
 *
 * `_isReal: true` signals that this user is authenticated via Supabase Auth.
 * Seed/demo users don't have this flag — they're cleared from state on sign-out
 * but don't trigger supabase.auth.signOut().
 *
 * @module profileService
 */

import { supabase } from "./supabase.js";

// Default colors — matches PLAYER_COLORS and seed data conventions
const DEFAULT_COLOR = "#F97316"; // C.orange

// ── READ ──────────────────────────────────────────────────────────────────────

/**
 * Fetch a profile by Supabase Auth user ID and return a normalized user object.
 * Returns null if not found (new signup may need a moment for the trigger to fire).
 *
 * @param {string} userId - auth.users.id (UUID)
 * @returns {Promise<Object|null>}
 */
export async function getProfile(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*, tenants(id, name, slug, plan)")
    .eq("id", userId)
    .single();

  if (error || !data) {
    if (error?.code !== "PGRST116") {
      // PGRST116 = row not found — expected for brand-new users before trigger fires
      console.error("[profileService] getProfile failed:", error);
    }
    return null;
  }

  return buildUserObject(data);
}

/**
 * Create a profile row for a user that authenticated successfully but has no profile.
 * This handles the case where a user was created in Supabase Auth before the trigger existed,
 * or in rare cases where the trigger failed to fire.
 *
 * Role defaults to 'user' — promote to ralli_admin manually via SQL if needed.
 *
 * @param {{ id: string, email: string }} authUser - from supabase.auth.getUser() or signInWithPassword
 * @returns {Promise<Object|null>} normalized user object or null on failure
 */
export async function createMissingProfile(authUser) {
  if (!authUser?.id || !authUser?.email) return null;

  const name =
    authUser.user_metadata?.name ??
    authUser.user_metadata?.full_name ??
    authUser.email.split("@")[0];

  // Upsert so this is safe even if the row already exists
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id:     authUser.id,
        email:  authUser.email,
        name,
        role:   authUser.user_metadata?.role ?? "user",
        status: "active",
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[profileService] createMissingProfile failed:", error);
    // Surface the raw error code so callers can show it
    const err = new Error(error.message);
    err.code    = error.code;
    err.details = error.details;
    err.hint    = error.hint;
    throw err;
  }

  return buildUserObject(data);
}

/**
 * Fetch all profiles belonging to a tenant (for team management screens).
 *
 * @param {string} tenantId
 * @returns {Promise<{ data: Object[]|null, error: Object|null }>}
 */
export async function getTenantProfiles(tenantId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("name");
  return { data: data?.map(buildUserObject) ?? null, error };
}

// ── WRITE ─────────────────────────────────────────────────────────────────────

/**
 * Upsert profile fields (e.g. nickname, avatar_emoji, notification prefs).
 * Only the fields provided are updated — partial updates are safe.
 *
 * @param {string} userId
 * @param {Object} updates - subset of profiles columns
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function upsertProfile(userId, updates) {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) console.error("[profileService] upsertProfile failed:", error);
  return { data: data ? buildUserObject(data) : null, error };
}

/**
 * Award XP to a user and return the updated profile.
 * Production: consider a Postgres function to make this atomic.
 *
 * @param {string} userId
 * @param {number} amount
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function awardXp(userId, amount) {
  // Read current XP first (RPC would be cleaner here)
  const { data: current } = await supabase
    .from("profiles")
    .select("xp")
    .eq("id", userId)
    .single();

  const newXp = (current?.xp ?? 0) + amount;
  return upsertProfile(userId, { xp: newXp });
}

// ── NORMALIZE ─────────────────────────────────────────────────────────────────

/**
 * Map a raw `profiles` DB row (with optional joined `tenants`) to the app user shape.
 * This is the single source of truth for what a "user object" looks like in this app.
 *
 * @param {Object} row - raw profiles row from Supabase
 * @returns {Object} normalized user object
 */
export function buildUserObject(row) {
  const name = row.name ?? row.email?.split("@")[0] ?? "User";
  const initials = name
    .split(" ")
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";

  return {
    // Core identity
    id:       row.id,
    email:    row.email,
    name,
    initials,

    // Role + tenant
    role:     row.role ?? "user",
    orgId:    row.tenant_id ?? null,
    orgName:  row.tenants?.name ?? null,

    // Cosmetic
    color:    row.color ?? DEFAULT_COLOR,
    emoji:    row.avatar_emoji ?? null,

    // Progress
    xp:       row.xp ?? 0,
    streak:   row.streak ?? 0,

    // Status
    status:   row.status ?? "active",

    // Flag: real Supabase Auth user (vs demo seed user)
    _isReal:  true,
  };
}
