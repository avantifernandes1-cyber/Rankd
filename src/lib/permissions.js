/**
 * Ralli Permissions Layer
 *
 * Central authority for all access control in Ralli:
 *   1. Feature access  — plan-gated via FEATURE_CONFIG + canAccess()
 *   2. Role permissions — admin-controlled per-tenant via hasPermission()
 *
 * Production swap plan:
 *   - FEATURE_CONFIG → entitlements from Stripe/billing or Supabase JWT custom claims
 *   - loadRolePermissions → GET /api/tenants/:id/settings → .rolePermissions
 *   - saveRolePermissions → PATCH /api/tenants/:id/settings
 *   - hasPermission signature stays the same; only the data source changes
 *
 * All exported functions are pure (no side effects except localStorage read/write).
 */

import { ROLES } from '../data/schema.js';
export { ROLES };

// ── RALLI ADMIN CHECK ────────────────────────────────────────────────────────
// Returns true if the role is a Ralli platform administrator.
// Handles both the canonical "ralli_admin" role and the legacy "superadmin" alias.
// Use this everywhere instead of role === "superadmin".
//
// Production: also check Supabase service_role claim when operating server-side.

export function isRalliAdmin(role) {
  return role === ROLES.RALLI_ADMIN || role === ROLES.SUPERADMIN;
}

// ── FEATURE ACCESS ───────────────────────────────────────────────────────────
// Maps feature keys to the minimum plan required to access them.
// Plans in ascending order: demo < starter < pro < enterprise
//
// Production hook: replace with entitlements from billing provider or JWT claims:
//   const entitlements = session.user.user_metadata?.entitlements ?? {};
//   return entitlements[featureKey] === true;

export const FEATURE_CONFIG = {
  dashboard:      ["demo", "starter", "pro", "enterprise"],
  games:          ["starter", "pro", "enterprise"],
  learn:          ["starter", "pro", "enterprise"],
  analytics:      ["pro", "enterprise"],
  aiInsights:     ["enterprise"],
  integrations:   ["pro", "enterprise"],
  customBranding: ["enterprise"],
};

// Normalize raw plan strings (from org data or billing provider) to FEATURE_CONFIG keys.
// Update this map when real billing plan IDs are known.
export function normalizePlan(rawPlan) {
  if (!rawPlan) return "demo";
  switch (String(rawPlan).toLowerCase()) {
    case "demo":        return "demo";
    case "starter":     return "starter";
    case "growth":      return "pro";      // "Growth" billing tier = pro
    case "pro":         return "pro";
    case "enterprise":  return "enterprise";
    default:            return "demo";     // unknown → most restrictive
  }
}

// Central feature access check.
// featureKey — key in FEATURE_CONFIG
// userPlan   — raw plan string from tenant.plan (normalized internally)
// ralli_admin always gets enterprise access (pass "enterprise" explicitly from App).
export function canAccess(featureKey, userPlan) {
  const allowed = FEATURE_CONFIG[featureKey];
  if (!allowed) return false;
  return allowed.includes(normalizePlan(userPlan));
}

// ── ROLE PERMISSIONS ─────────────────────────────────────────────────────────
// Admin-controlled per-role permission matrix.
// Tenants can override these via the Role Access settings screen.
//
// ralli_admin always bypasses all permission checks (see hasPermission).
// orgAdmin defaults to full create/edit/delete/assign/launch.
// user defaults to view-only.
//
// Production hook: source from tenant_settings.role_permissions via API.

export const DEFAULT_ROLE_PERMISSIONS = {
  user: {
    features: {
      home:        true,
      games:       true,
      learn:       true,
      quizzes:     true,
      battlecards: true,
      progress:    true,
      leaderboard: true,
      settings:    true,
    },
    actions: {
      view:           true,
      create:         false,
      edit:           false,
      delete:         false,
      assign:         false,
      launch:         false,
      manageResults:  false,
      manageSettings: false,
    },
  },
  orgAdmin: {
    features: {
      home:        true,
      games:       true,
      learn:       true,
      quizzes:     true,
      battlecards: true,
      progress:    true,
      leaderboard: true,
      settings:    true,
    },
    actions: {
      view:           true,
      create:         true,
      edit:           true,
      delete:         true,
      assign:         true,
      launch:         true,
      manageResults:  true,
      manageSettings: false,
    },
  },
};

// Load saved role permissions for a tenant from localStorage.
// Deep-merges with defaults so any new permission keys are always present.
//
// Production hook: replace with:
//   const { data } = await supabase
//     .from('tenant_settings')
//     .select('role_permissions')
//     .eq('tenant_id', tenantId)
//     .single();
//   return data?.role_permissions ?? DEFAULT_ROLE_PERMISSIONS;
export function loadRolePermissions(tenantId) {
  try {
    const key    = `ralli_role_permissions_${tenantId ?? "default"}`;
    const saved  = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Deep-merge: new default keys are always present even if not in saved data
      return {
        user: {
          features: { ...DEFAULT_ROLE_PERMISSIONS.user.features, ...parsed.user?.features },
          actions:  { ...DEFAULT_ROLE_PERMISSIONS.user.actions,  ...parsed.user?.actions  },
        },
        orgAdmin: {
          features: { ...DEFAULT_ROLE_PERMISSIONS.orgAdmin.features, ...parsed.orgAdmin?.features },
          actions:  { ...DEFAULT_ROLE_PERMISSIONS.orgAdmin.actions,  ...parsed.orgAdmin?.actions  },
        },
      };
    }
  } catch {}
  return DEFAULT_ROLE_PERMISSIONS;
}

// Persist role permissions for a tenant.
//
// Production hook: replace with:
//   await supabase
//     .from('tenant_settings')
//     .upsert({ tenant_id: tenantId, role_permissions: perms });
export function saveRolePermissions(tenantId, perms) {
  try {
    localStorage.setItem(`ralli_role_permissions_${tenantId ?? "default"}`, JSON.stringify(perms));
  } catch {}
}

// Central permission check.
// rolePerms — from loadRolePermissions(tenantId) or tenant_settings API
// role      — current user's role string
// scope     — "features" | "actions"
// key       — feature or action key string
//
// ralli_admin and superadmin (legacy alias) always return true (no tenant scope).
// Unknown roles/keys default to false (deny-by-default).
export function hasPermission(rolePerms, role, scope, key) {
  if (isRalliAdmin(role)) return true;
  return rolePerms?.[role]?.[scope]?.[key] === true;
}
