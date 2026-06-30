/**
 * Ralli Tenant Service
 *
 * Read + update operations for tenants and their settings.
 * All functions talk directly to Supabase — no mocks.
 *
 * WHO CAN CALL THESE:
 *   - ralli_admin: all functions
 *   - orgAdmin: getTenant, getTenantSettings, updateTenantSettings for own tenant
 *   - RLS in Supabase enforces isolation — no extra guards needed here
 *
 * CREATING TENANTS:
 *   Use provisionTenant() from src/lib/provisioningService.js.
 *   That function runs the full atomic workflow (settings, team, invitation).
 *   Do not use tenantService for tenant creation.
 *
 * Return shape: { data, error } — matches Supabase client conventions.
 *
 * @module tenantService
 */

import { supabase } from "./supabase.js";

// ── READ ──────────────────────────────────────────────────────────────────────

/**
 * Fetch a single tenant by ID.
 *
 * @param {string} id
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function getTenant(id) {
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", id)
    .single();

  return { data: data ? normalizeTenant(data) : null, error };
}

/**
 * List all tenants. ralli_admin only (RLS enforces this).
 * Returns most recently created first.
 *
 * @returns {Promise<{ data: Array, error: Object|null }>}
 */
export async function listTenants() {
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false });

  return {
    data:  data ? data.map(normalizeTenant) : [],
    error,
  };
}

/**
 * Get all active profiles for a tenant (team members).
 *
 * @param {string} tenantId
 * @returns {Promise<{ data: Array, error: Object|null }>}
 */
export async function listTenantUsers(tenantId) {
  if (!tenantId) return { data: [], error: { message: "tenantId is required" } };

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("name");

  return { data: data ?? [], error };
}

/**
 * Get the settings record for a tenant.
 * Returns null if settings haven't been created yet (pre-provisioning).
 *
 * @param {string} tenantId
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function getTenantSettings(tenantId) {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (error?.code === "PGRST116") return { data: null, error: null }; // Not found = OK
  return { data, error };
}

/**
 * Get the teams for a tenant.
 *
 * @param {string} tenantId
 * @returns {Promise<{ data: Array, error: Object|null }>}
 */
export async function listTenantTeams(tenantId) {
  const { data, error } = await supabase
    .from("tenant_teams")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("is_default", { ascending: false })
    .order("name");

  return { data: data ?? [], error };
}

// ── WRITE ─────────────────────────────────────────────────────────────────────

/**
 * Update top-level tenant fields (name, plan, status, seat_limit, etc.)
 * ralli_admin only (RLS enforces via tenants_update_admin policy).
 *
 * @param {string} id
 * @param {Object} updates - subset of tenants columns (camelCase → converted internally)
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function updateTenant(id, updates) {
  // Convert camelCase app fields to snake_case DB columns
  const dbUpdates = {};
  if (updates.name       != null) dbUpdates.name        = updates.name;
  if (updates.plan       != null) dbUpdates.plan        = updates.plan.toLowerCase();
  if (updates.status     != null) dbUpdates.status      = updates.status;
  if (updates.seatLimit  != null) dbUpdates.seat_limit  = updates.seatLimit;
  if (updates.adminEmail != null) dbUpdates.admin_email = updates.adminEmail;
  if (updates.domain     != null) dbUpdates.domain      = updates.domain;
  if (updates.logoUrl    != null) dbUpdates.logo_url    = updates.logoUrl;

  const { data, error } = await supabase
    .from("tenants")
    .update(dbUpdates)
    .eq("id", id)
    .select()
    .single();

  return { data: data ? normalizeTenant(data) : null, error };
}

/**
 * Update tenant settings (partial patch — only provided keys are changed).
 * ralli_admin or orgAdmin for own tenant (RLS enforces scope).
 *
 * @param {string} tenantId
 * @param {Object} updates - any subset of tenant_settings columns
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function updateTenantSettings(tenantId, updates) {
  const { data, error } = await supabase
    .from("tenant_settings")
    .update(updates)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  return { data, error };
}

/**
 * Set tenant status to 'active'. Called after onboarding completion.
 *
 * @param {string} id
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function activateTenant(id) {
  return updateTenant(id, { status: "active" });
}

/**
 * Suspend a tenant. Blocks all tenant user access via RLS + app layer.
 * Production: also revoke active sessions via Supabase Auth admin API.
 *
 * @param {string} id
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function suspendTenant(id) {
  return updateTenant(id, { status: "suspended" });
}

/**
 * Cancel a tenant. Terminal state — data is retained but access is removed.
 *
 * @param {string} id
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function cancelTenant(id) {
  return updateTenant(id, { status: "canceled" });
}

/**
 * Update a tenant's subscription plan.
 * Production: also notify billing provider of plan change + reprovision feature access.
 *
 * @param {string} id
 * @param {string} plan - 'starter' | 'growth' | 'enterprise'
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function updateTenantPlan(id, plan) {
  return updateTenant(id, { plan });
}

// ── NORMALIZE ─────────────────────────────────────────────────────────────────

/**
 * Map a raw tenants DB row (snake_case) to the app's camelCase org shape.
 *
 * @param {Object} row
 * @returns {Object}
 */
function normalizeTenant(row) {
  return {
    id:         row.id,
    slug:       row.slug,
    name:       row.name,
    plan:       capitalize(row.plan ?? "starter"),
    status:     row.status ?? "invited",
    seatLimit:  row.seat_limit ?? 10,
    seats:      row.seat_limit ?? 10,
    adminEmail: row.admin_email ?? null,
    domain:     row.domain ?? null,
    logoUrl:    row.logo_url ?? null,
    createdAt:  row.created_at
      ? new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null,
    updatedAt:  row.updated_at?.split("T")[0] ?? null,
  };
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
