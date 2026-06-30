/**
 * Ralli Authentication Service
 *
 * Current: mock implementation using SEED_USERS (demo only).
 * Production: Supabase Auth — no custom password storage, no credential handling.
 *
 * Production swap checklist:
 *   1. npm install @supabase/supabase-js
 *   2. Create src/lib/supabase.js:
 *        import { createClient } from '@supabase/supabase-js';
 *        export const supabase = createClient(
 *          import.meta.env.VITE_SUPABASE_URL,
 *          import.meta.env.VITE_SUPABASE_ANON_KEY
 *        );
 *   3. Replace mockLogin  → supabase.auth.signInWithPassword({ email, password })
 *   4. Replace resolveSession → supabase.auth.getSession()
 *   5. Replace clearSession → supabase.auth.signOut()
 *   6. Add to App: useEffect(() => { supabase.auth.onAuthStateChange((_e, s) => setSession(s)) }, [])
 *   7. Add DB trigger in Supabase to populate JWT custom claims: tenantId, role
 *
 * All function signatures match what the Supabase implementation will use.
 * No changes to call sites are required when swapping implementations.
 *
 * @module auth
 */

import { SEED_USERS } from '../data/seeds.js';
import { isRalliAdmin } from './permissions.js';

// ── AUTH CONFIG ──────────────────────────────────────────────────────────────
// Production: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
// These env vars are intentionally safe to expose client-side (anon key only).

// Safely read Vite env vars (undefined in Node.js test environments)
const _env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};

export const AUTH_CONFIG = {
  // "mock" in demo, "supabase" in production
  provider: _env.VITE_SUPABASE_URL ? "supabase" : "mock",

  // Supabase connection (null in demo mode)
  supabaseUrl:     _env.VITE_SUPABASE_URL     ?? null,
  supabaseAnonKey: _env.VITE_SUPABASE_ANON_KEY ?? null,

  // Session config
  sessionStorageKey: "ralli_session",
  sessionTtlMs:      8 * 60 * 60 * 1000, // 8 hours
};

// ── SESSION SHAPE ────────────────────────────────────────────────────────────
// Matches the enriched Supabase session shape after custom claim resolution.
// Production: tenantId and role come from JWT custom claims set by DB trigger.
//
// @typedef {Object} RalliSession
// @property {string}      userId    - User ID (= Supabase Auth user.id)
// @property {string|null} tenantId  - Tenant ID (null for ralli_admin)
// @property {string}      role      - user | orgAdmin | superadmin | ralli_admin
// @property {Object}      user      - Full user record from SEED_USERS / users table

// ── MOCK AUTH (demo only) ────────────────────────────────────────────────────

/**
 * Validate credentials against seed data and return a session.
 * Production replacement:
 *   const { data, error } = await supabase.auth.signInWithPassword({ email, password });
 *   if (error) return { session: null, error: error.message };
 *   const user = await fetchUserProfile(data.user.id); // from users table
 *   return { session: buildSession(data.session, user), error: null };
 *
 * @param {string} email
 * @param {string} password
 * @param {Array}  users   - User list (defaults to SEED_USERS)
 * @returns {{ session: RalliSession|null, error: string|null }}
 */
export function mockLogin(email, password, users = SEED_USERS) {
  const match = users.find(
    u => u.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!match) return { session: null, error: "No account found with that email." };
  if (!password) return { session: null, error: "Password is required." };
  // Demo: any non-empty password works (real auth uses Supabase bcrypt)
  return {
    session: buildSession(match),
    error: null,
  };
}

/**
 * Build a normalized RalliSession from a user record.
 * @param {Object} user - User record from SEED_USERS or users table
 * @returns {RalliSession}
 */
export function buildSession(user) {
  return {
    userId:   user.id,
    tenantId: user.tenantId ?? user.orgId ?? null,
    role:     user.role,
    user,
  };
}

/**
 * Resolve the current session from sessionStorage.
 * Production replacement:
 *   const { data: { session } } = await supabase.auth.getSession();
 *   if (!session) return null;
 *   const user = await fetchUserProfile(session.user.id);
 *   return buildSession(user);
 *
 * @param {Array} users - User list for re-hydration (defaults to SEED_USERS)
 * @returns {RalliSession|null}
 */
export function resolveSession(users = SEED_USERS) {
  try {
    const raw = sessionStorage.getItem(AUTH_CONFIG.sessionStorageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.expiresAt && Date.now() > saved.expiresAt) {
      sessionStorage.removeItem(AUTH_CONFIG.sessionStorageKey);
      return null;
    }
    // Re-hydrate from current seed (catches role/data changes during dev)
    const user = users.find(u => u.id === saved.userId);
    return user ? buildSession(user) : null;
  } catch {
    return null;
  }
}

/**
 * Persist a session to sessionStorage.
 * Production: Supabase handles session persistence automatically via its client.
 * @param {RalliSession} session
 */
export function persistSession(session) {
  try {
    sessionStorage.setItem(
      AUTH_CONFIG.sessionStorageKey,
      JSON.stringify({ ...session, expiresAt: Date.now() + AUTH_CONFIG.sessionTtlMs })
    );
  } catch {}
}

/**
 * Clear the current session (sign out).
 * Production replacement:
 *   await supabase.auth.signOut();
 */
export function clearSession() {
  try {
    sessionStorage.removeItem(AUTH_CONFIG.sessionStorageKey);
  } catch {}
}

// ── TENANT RESOLUTION ────────────────────────────────────────────────────────

/**
 * Determine the tenant context for a given user.
 * ralli_admin users have no tenant context (they operate across all tenants).
 * All other users are scoped to their tenant.
 *
 * Production: tenantId comes from JWT claims or users table lookup.
 * @param {Object} user
 * @param {Array}  tenants
 * @returns {{ tenantId: string|null, tenant: Object|null }}
 */
export function resolveTenantContext(user, tenants = []) {
  if (!user || isRalliAdmin(user.role)) {
    return { tenantId: null, tenant: null };
  }
  const tenantId = user.tenantId ?? user.orgId ?? null;
  const tenant   = tenants.find(t => t.id === tenantId) ?? null;
  return { tenantId, tenant };
}
