-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Member Invite Function
-- Run after 005_invite_functions.sql.
--
-- Allows an authenticated org admin to generate an invite token for a team
-- member (rep, manager, or any role). Uses the same tenant_invitations table
-- and InviteScreen flow as the ralli_admin → orgAdmin provisioning path.
--
-- Security: caller must be authenticated and have a tenant_id in their profile.
-- The function derives the tenant from auth.uid() — not from a parameter —
-- so an org admin can only invite into their own tenant.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_member_invite(
  p_email TEXT,
  p_role  TEXT DEFAULT 'user'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_tenant_id UUID;
  v_token     TEXT;
  v_inv_id    UUID;
  v_expires   TIMESTAMPTZ := NOW() + INTERVAL '7 days';
BEGIN
  -- Must be authenticated
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'create_member_invite: must be authenticated';
  END IF;

  -- Derive tenant from the caller's profile
  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_uid;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_member_invite: caller has no tenant assigned';
  END IF;

  -- Role must be valid
  IF p_role NOT IN ('user', 'manager', 'orgAdmin') THEN
    RAISE EXCEPTION 'create_member_invite: invalid role %', p_role;
  END IF;

  -- Generate a secure random token (same approach as provision_tenant)
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Insert invitation record
  INSERT INTO tenant_invitations (
    tenant_id,
    admin_email,
    token,
    role,
    status,
    expires_at,
    onboarding_state
  ) VALUES (
    v_tenant_id,
    LOWER(TRIM(p_email)),
    v_token,
    p_role,
    'invited',
    v_expires,
    jsonb_build_object(
      'currentStep',    'invited',
      'stepsCompleted', '[]'::jsonb,
      'allSteps',       '["invited", "account_created", "active"]'::jsonb
    )
  )
  RETURNING id INTO v_inv_id;

  RETURN jsonb_build_object(
    'invitationId', v_inv_id,
    'token',        v_token,
    'email',        LOWER(TRIM(p_email)),
    'role',         p_role,
    'tenantId',     v_tenant_id,
    'expiresAt',    v_expires
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_member_invite TO authenticated;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Run as an authenticated orgAdmin to test:
-- SELECT create_member_invite('newrep@example.com', 'user');
