/**
 * Ralli Provisioning Service
 *
 * Full tenant onboarding workflow — from the moment a Ralli admin clicks
 * "Invite Organization" through the customer admin completing setup.
 *
 * Architecture:
 *   - provisionTenant() calls provision_tenant() Postgres function (SECURITY DEFINER)
 *     which runs all DB writes atomically in a single transaction.
 *   - Email sending is mocked: invitation records are written, but no real email
 *     is sent until a transactional email provider (Resend, Postmark, etc.) is wired.
 *   - Auth user creation for the invited admin is deferred: they create their own
 *     account when they follow the /invite/:token link.
 *   - All data is tenant-scoped from the first INSERT.
 *
 * Production swap checklist:
 *   - Wire sendInvitationEmail() to Resend / Postmark / Supabase Auth invite
 *   - Add Supabase Edge Function for server-side admin.inviteUserByEmail if needed
 *   - Set email_sent = true after confirmed delivery
 *
 * @module provisioningService
 */

import { supabase } from "./supabase.js";

// ── PROVISION ─────────────────────────────────────────────────────────────────

/**
 * Run the full tenant provisioning workflow.
 *
 * Delegates to the provision_tenant() Postgres function which atomically:
 *   1. Creates the tenant row (status: 'invited')
 *   2. Creates default tenant_settings (branding, features, role perms, etc.)
 *   3. Creates the default team
 *   4. Generates an invitation token + onboarding state record
 *
 * Email is mocked — invite URL is returned for the admin to use or display.
 *
 * @param {{
 *   name:        string,
 *   plan:        string,
 *   adminEmail:  string,
 *   seatLimit?:  number,
 *   domain?:     string | null,
 *   slug?:       string,
 * }} params
 * @returns {Promise<ProvisionResult>}
 * @throws {Error} If the caller lacks ralli_admin role, slug conflicts, or DB error
 */
export async function provisionTenant({ name, plan, adminEmail, seatLimit = 10, domain = null, slug }) {
  const derivedSlug = slug
    ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const { data, error } = await supabase.rpc("provision_tenant", {
    p_name:        name.trim(),
    p_slug:        derivedSlug,
    p_plan:        plan.toLowerCase(),
    p_admin_email: adminEmail.trim().toLowerCase(),
    p_seat_limit:  seatLimit,
    p_domain:      domain ?? null,
  });

  if (error) throw error;

  // Log invite URL — production: send via email provider
  const inviteUrl = buildInviteUrl(data.token);
  console.info(
    `[ralli] Tenant provisioned (mock email). Admin invite URL:\n  ${inviteUrl}`
  );

  return { ...data, inviteUrl };
}

// ── READ ──────────────────────────────────────────────────────────────────────

/**
 * Fetch a tenant with its settings and latest invitation record.
 * Used by the ralli_admin org detail view to show provisioning status.
 *
 * @param {string} tenantId
 * @returns {Promise<{ tenant: Object, settings: Object|null, invitation: Object|null }>}
 */
export async function getTenantWithProvisioningState(tenantId) {
  const [
    { data: tenant,      error: tenantErr },
    { data: settings,    error: settingsErr },
    { data: invitations, error: invErr },
  ] = await Promise.all([
    supabase.from("tenants").select("*").eq("id", tenantId).single(),
    supabase.from("tenant_settings").select("*").eq("tenant_id", tenantId).single(),
    supabase
      .from("tenant_invitations")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (tenantErr) throw tenantErr;

  return {
    tenant,
    settings:   settings   ?? null,
    invitation: invitations?.[0] ?? null,
  };
}

/**
 * Fetch an invitation by token. Used on the /invite/:token onboarding page.
 * Callable by anon (future: requires separate anon-accessible RLS policy or Edge Function).
 *
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
export async function getInvitationByToken(token) {
  const { data, error } = await supabase
    .from("tenant_invitations")
    .select("*, tenants(id, name, plan, slug)")
    .eq("token", token)
    .single();

  if (error) {
    if (error.code !== "PGRST116") console.error("[provisioningService] getInvitationByToken:", error);
    return null;
  }

  return data;
}

// ── INVITATION LIFECYCLE ──────────────────────────────────────────────────────

/**
 * Resend an invitation (mock — updates DB record, no real email sent yet).
 * Production: also trigger real email via email provider.
 *
 * @param {string} invitationId
 * @returns {Promise<{ data: Object, inviteUrl: string }>}
 */
export async function resendInvitation(invitationId) {
  const { data, error } = await supabase
    .from("tenant_invitations")
    .update({
      status:     "resent",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", invitationId)
    .select()
    .single();

  if (error) throw error;

  const inviteUrl = buildInviteUrl(data.token);
  console.info(`[ralli] Invitation resent (mock). URL: ${inviteUrl}`);

  return { data, inviteUrl };
}

/**
 * Mark an invitation as accepted and advance onboarding state.
 * Called when the invited admin creates their account via /invite/:token.
 *
 * @param {string} token
 * @param {string} completedStep - e.g. 'account_created'
 * @returns {Promise<Object>}
 */
export async function advanceOnboardingStep(token, completedStep) {
  // Fetch current state
  const invitation = await getInvitationByToken(token);
  if (!invitation) throw new Error("Invitation not found or expired");

  const currentState   = invitation.onboarding_state ?? {};
  const stepsCompleted = currentState.stepsCompleted ?? [];

  if (!stepsCompleted.includes(completedStep)) {
    stepsCompleted.push(completedStep);
  }

  // Determine next step
  const allSteps   = currentState.allSteps ?? [];
  const nextIdx    = allSteps.indexOf(completedStep) + 1;
  const nextStep   = allSteps[nextIdx] ?? "active";

  const newStatus = completedStep === "active" ? "accepted" : invitation.status;

  const { data, error } = await supabase
    .from("tenant_invitations")
    .update({
      status:          newStatus,
      accepted_at:     completedStep === "account_created" ? new Date().toISOString() : invitation.accepted_at,
      onboarding_state: {
        ...currentState,
        currentStep:    nextStep,
        stepsCompleted,
      },
    })
    .eq("id", invitation.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── MEMBER INVITE ─────────────────────────────────────────────────────────────

/**
 * Create an invite for a team member (rep, manager) within the caller's tenant.
 * Caller must be an authenticated org admin with a tenant_id on their profile.
 *
 * @param {string} email
 * @param {'user'|'manager'|'orgAdmin'} [role='user']
 * @returns {Promise<{ invitationId, token, email, role, tenantId, expiresAt, inviteUrl }>}
 */
export async function createMemberInvite(email, role = "user") {
  const { data, error } = await supabase.rpc("create_member_invite", {
    p_email: email.trim().toLowerCase(),
    p_role:  role,
  });

  if (error) throw error;

  const inviteUrl = buildInviteUrl(data.token);
  console.info(`[ralli] Member invite created (mock email). URL:\n  ${inviteUrl}`);
  return { ...data, inviteUrl };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Build the full invite URL for a token.
 * Used for display and mock email logging.
 *
 * @param {string} token
 * @returns {string}
 */
export function buildInviteUrl(token) {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://rankd-six.vercel.app";
  return `${base}/invite/${token}`;
}

/**
 * Normalize a provisioned tenant result + tenant DB row into the app's org shape.
 * Replaces the optimistic entry in the orgs list after provisioning completes.
 *
 * @param {ProvisionResult} result   - returned by provisionTenant()
 * @param {Object}          tenantRow - raw tenants DB row
 * @returns {Object} app-layer org shape
 */
export function normalizeProvisionedOrg(result, tenantRow) {
  const row = tenantRow ?? {};
  return {
    id:              row.id          ?? result.tenantId,
    slug:            row.slug,
    name:            row.name,
    plan:            capitalize(row.plan ?? result.plan),
    status:          row.status      ?? result.status,
    seatLimit:       row.seat_limit  ?? 10,
    seats:           row.seat_limit  ?? 10,
    adminEmail:      row.admin_email ?? result.adminEmail,
    domain:          row.domain      ?? null,
    invitationToken: result.token,
    inviteUrl:       result.inviteUrl,
    features:        result.features ?? {},
    createdAt:       row.created_at
      ? new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    updatedAt:       row.updated_at?.split("T")[0] ?? new Date().toISOString().split("T")[0],
  };
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * @typedef {Object} ProvisionResult
 * @property {string} tenantId
 * @property {string} invitationId
 * @property {string} token
 * @property {string} adminEmail
 * @property {string} status        - 'invited'
 * @property {string} plan
 * @property {Object} features      - plan-gated feature map
 * @property {string} inviteUrl     - full onboarding URL
 * @property {string} expiresAt     - ISO timestamp, 7 days from now
 */
