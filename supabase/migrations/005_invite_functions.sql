-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Invite Functions
-- Run after 004_tenant_provisioning.sql.
--
-- 1. Adds `role` column to tenant_invitations (what role the invited user gets)
-- 2. get_invitation_by_token() — callable by anon, used on /invite/:token page
-- 3. accept_invitation()       — callable by authenticated users after signUp,
--    atomically assigns tenant + role and marks the invitation accepted
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Add role column to tenant_invitations ─────────────────────────────────────
-- Stores the role the invited user should receive on acceptance.
-- Defaults to 'orgAdmin' — matches the org provisioning flow.
-- Future: 'user' | 'manager' for Add Member invites.

ALTER TABLE tenant_invitations
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'orgAdmin';

-- ── get_invitation_by_token() ─────────────────────────────────────────────────
-- Read an invitation by its token. Callable by anon so the /invite/:token page
-- works before the user has an account.
-- Returns NULL for expired, already-accepted, or nonexistent tokens.

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv    tenant_invitations%ROWTYPE;
  v_tenant tenants%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM tenant_invitations
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Expired
  IF v_inv.expires_at < NOW() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  -- Already accepted
  IF v_inv.status = 'accepted' THEN
    RETURN jsonb_build_object('error', 'already_accepted');
  END IF;

  SELECT * INTO v_tenant FROM tenants WHERE id = v_inv.tenant_id;

  RETURN jsonb_build_object(
    'id',              v_inv.id,
    'tenantId',        v_inv.tenant_id,
    'tenantName',      v_tenant.name,
    'tenantPlan',      v_tenant.plan,
    'tenantSlug',      v_tenant.slug,
    'adminEmail',      v_inv.admin_email,
    'role',            v_inv.role,
    'status',          v_inv.status,
    'expiresAt',       v_inv.expires_at,
    'onboardingState', v_inv.onboarding_state
  );
END;
$$;

-- Anon-callable: the invite URL is the authorization mechanism (256-bit token)
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token TO anon, authenticated;

-- ── accept_invitation() ───────────────────────────────────────────────────────
-- Called after the invited user creates their Supabase Auth account.
-- Atomically:
--   1. Validates the token is still valid
--   2. Upserts the caller's profile with tenant_id + role from the invitation
--      (handles race condition where the auth trigger hasn't fired yet)
--   3. Marks the invitation as accepted
--   4. Advances the tenant status to 'onboarding'
--
-- Requires: caller is authenticated (just completed signUp)

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT, p_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv    tenant_invitations%ROWTYPE;
  v_uid    UUID := auth.uid();
  v_email  TEXT;
BEGIN
  -- Must be authenticated
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'accept_invitation: must be authenticated';
  END IF;

  -- Fetch and validate invitation
  SELECT * INTO v_inv
  FROM tenant_invitations
  WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_invitation: invitation not found';
  END IF;

  IF v_inv.expires_at < NOW() THEN
    RAISE EXCEPTION 'accept_invitation: invitation has expired';
  END IF;

  IF v_inv.status = 'accepted' THEN
    RAISE EXCEPTION 'accept_invitation: invitation already accepted';
  END IF;

  -- Get caller email from auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- Upsert profile: works whether trigger has fired or not
  INSERT INTO profiles (id, email, name, role, tenant_id, status, created_at, updated_at)
  VALUES (
    v_uid,
    COALESCE(v_email, v_inv.admin_email),
    COALESCE(NULLIF(TRIM(p_name), ''), split_part(COALESCE(v_email, v_inv.admin_email), '@', 1)),
    v_inv.role,
    v_inv.tenant_id,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id  = EXCLUDED.tenant_id,
    role       = EXCLUDED.role,
    name       = CASE WHEN NULLIF(TRIM(p_name), '') IS NOT NULL THEN TRIM(p_name) ELSE profiles.name END,
    status     = 'active',
    updated_at = NOW();

  -- Mark invitation accepted
  UPDATE tenant_invitations SET
    status      = 'accepted',
    accepted_at = NOW(),
    onboarding_state = onboarding_state || jsonb_build_object(
      'currentStep',    'account_created',
      'stepsCompleted', (onboarding_state->'stepsCompleted') || '["invited"]'::jsonb,
      'acceptedAt',     NOW()
    )
  WHERE id = v_inv.id;

  -- Advance tenant to 'onboarding' if still on 'invited'
  UPDATE tenants
  SET status = 'onboarding', updated_at = NOW()
  WHERE id = v_inv.tenant_id AND status = 'invited';

  RETURN jsonb_build_object(
    'userId',   v_uid,
    'tenantId', v_inv.tenant_id,
    'role',     v_inv.role,
    'name',     COALESCE(NULLIF(TRIM(p_name), ''), split_part(COALESCE(v_email, v_inv.admin_email), '@', 1)),
    'email',    COALESCE(v_email, v_inv.admin_email)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation TO authenticated;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN ('get_invitation_by_token', 'accept_invitation');
