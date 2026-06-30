-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Ralli Admin Management Functions
-- Run after 008_tenant_delete.sql.
--
-- All functions are SECURITY DEFINER and require ralli_admin role.
-- They bypass RLS so the ralli_admin can manage tenants/members across
-- any org without being a member of that org.
--
-- Functions:
--   1. update_tenant()           — edit tenant name, plan, seat_limit, status, domain
--   2. update_member()           — edit profile name, role, or status
--   3. remove_member()           — soft-delete: profile status='inactive', tenant_id=NULL
--   4. cancel_member_invite()    — set tenant_invitation status='canceled'
--   5. resend_member_invite()    — extend expiry, reset status to 'pending'
--   6. get_tenant_invitations()  — fetch all invitations (admin + member) for a tenant
-- ─────────────────────────────────────────────────────────────────────────────


-- ── update_tenant() ───────────────────────────────────────────────────────────
-- Ralli admin edits an existing tenant's core fields.
-- Only non-NULL params are applied — pass NULL to leave a field unchanged.

CREATE OR REPLACE FUNCTION public.update_tenant(
  p_tenant_id   UUID,
  p_name        TEXT    DEFAULT NULL,
  p_plan        TEXT    DEFAULT NULL,
  p_seat_limit  INTEGER DEFAULT NULL,
  p_status      TEXT    DEFAULT NULL,
  p_domain      TEXT    DEFAULT NULL,
  p_admin_email TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
  v_row  tenants%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'update_tenant: requires ralli_admin role';
  END IF;

  SELECT * INTO v_row FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_tenant: tenant not found';
  END IF;

  -- Validate status if provided
  IF p_status IS NOT NULL AND p_status NOT IN ('invited', 'onboarding', 'active', 'suspended', 'canceled') THEN
    RAISE EXCEPTION 'update_tenant: invalid status "%"', p_status;
  END IF;

  -- Validate plan if provided
  IF p_plan IS NOT NULL AND LOWER(p_plan) NOT IN ('starter', 'growth', 'enterprise') THEN
    RAISE EXCEPTION 'update_tenant: invalid plan "%"', p_plan;
  END IF;

  UPDATE tenants SET
    name         = COALESCE(NULLIF(TRIM(p_name), ''), name),
    plan         = COALESCE(LOWER(NULLIF(TRIM(p_plan), '')), plan),
    seat_limit   = COALESCE(p_seat_limit, seat_limit),
    status       = COALESCE(p_status, status),
    domain       = CASE WHEN p_domain IS NOT NULL THEN NULLIF(LOWER(TRIM(p_domain)), '') ELSE domain END,
    admin_email  = CASE WHEN p_admin_email IS NOT NULL THEN LOWER(TRIM(p_admin_email)) ELSE admin_email END,
    updated_at   = NOW()
  WHERE id = p_tenant_id
  RETURNING * INTO v_row;

  -- Update branding.companyName in tenant_settings if name changed
  IF p_name IS NOT NULL THEN
    UPDATE tenant_settings
    SET branding = branding || jsonb_build_object('companyName', TRIM(p_name)),
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id;
  END IF;

  -- Update feature_access if plan changed
  IF p_plan IS NOT NULL THEN
    UPDATE tenant_settings
    SET feature_access = get_plan_features(LOWER(p_plan)),
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'tenantId',   v_row.id,
    'name',       v_row.name,
    'plan',       v_row.plan,
    'seatLimit',  v_row.seat_limit,
    'status',     v_row.status,
    'domain',     v_row.domain,
    'adminEmail', v_row.admin_email,
    'updatedAt',  v_row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tenant TO authenticated;


-- ── update_member() ───────────────────────────────────────────────────────────
-- Ralli admin edits a member profile: name, role, or status.
-- Only non-NULL params are applied.
-- Cannot demote the last ralli_admin to prevent lockout.

CREATE OR REPLACE FUNCTION public.update_member(
  p_profile_id UUID,
  p_name       TEXT DEFAULT NULL,
  p_role       TEXT DEFAULT NULL,
  p_status     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
  v_row  profiles%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'update_member: requires ralli_admin role';
  END IF;

  SELECT * INTO v_row FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_member: profile not found';
  END IF;

  -- Prevent demoting self
  IF p_profile_id = v_uid AND p_role IS NOT NULL AND p_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'update_member: cannot change your own ralli_admin role';
  END IF;

  -- Validate role if provided
  IF p_role IS NOT NULL AND p_role NOT IN ('user', 'orgAdmin', 'manager', 'ralli_admin') THEN
    RAISE EXCEPTION 'update_member: invalid role "%"', p_role;
  END IF;

  -- Validate status if provided
  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'suspended', 'inactive', 'invited') THEN
    RAISE EXCEPTION 'update_member: invalid status "%"', p_status;
  END IF;

  UPDATE profiles SET
    name       = COALESCE(NULLIF(TRIM(p_name), ''), name),
    role       = COALESCE(p_role, role),
    status     = COALESCE(p_status, status),
    updated_at = NOW()
  WHERE id = p_profile_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'profileId', v_row.id,
    'name',      v_row.name,
    'role',      v_row.role,
    'status',    v_row.status,
    'tenantId',  v_row.tenant_id,
    'updatedAt', v_row.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_member TO authenticated;


-- ── remove_member() ───────────────────────────────────────────────────────────
-- Soft-delete: sets profile status='inactive', removes tenant association.
-- Preserves the auth.users record and profile row.
-- The user can be re-invited to any org in the future.

CREATE OR REPLACE FUNCTION public.remove_member(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
  v_row  profiles%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'remove_member: requires ralli_admin role';
  END IF;

  -- Prevent removing self
  IF p_profile_id = v_uid THEN
    RAISE EXCEPTION 'remove_member: cannot remove yourself';
  END IF;

  SELECT * INTO v_row FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'remove_member: profile not found';
  END IF;

  UPDATE profiles SET
    status     = 'inactive',
    tenant_id  = NULL,
    role       = 'user',
    updated_at = NOW()
  WHERE id = p_profile_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'profileId', v_row.id,
    'status',    'inactive',
    'removed',   true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_member TO authenticated;


-- ── cancel_member_invite() ────────────────────────────────────────────────────
-- Sets a tenant_invitation status to 'canceled'.
-- Works for both org admin invites and member invites.

CREATE OR REPLACE FUNCTION public.cancel_member_invite(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
  v_row  tenant_invitations%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'cancel_member_invite: requires ralli_admin role';
  END IF;

  SELECT * INTO v_row FROM tenant_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_member_invite: invitation not found';
  END IF;

  IF v_row.status = 'accepted' THEN
    RAISE EXCEPTION 'cancel_member_invite: cannot cancel an already-accepted invitation';
  END IF;

  UPDATE tenant_invitations SET
    status = 'canceled'
  WHERE id = p_invitation_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'invitationId', v_row.id,
    'status',       'canceled'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_member_invite TO authenticated;


-- ── resend_member_invite() ────────────────────────────────────────────────────
-- Resets expiry to +7 days and status to 'pending' for a non-accepted invite.

CREATE OR REPLACE FUNCTION public.resend_member_invite(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
  v_row  tenant_invitations%ROWTYPE;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'resend_member_invite: requires ralli_admin role';
  END IF;

  SELECT * INTO v_row FROM tenant_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resend_member_invite: invitation not found';
  END IF;

  IF v_row.status = 'accepted' THEN
    RAISE EXCEPTION 'resend_member_invite: invitation already accepted';
  END IF;

  UPDATE tenant_invitations SET
    status     = 'pending',
    expires_at = NOW() + INTERVAL '7 days'
  WHERE id = p_invitation_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'invitationId', v_row.id,
    'token',        v_row.token,
    'status',       'pending',
    'expiresAt',    v_row.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resend_member_invite TO authenticated;


-- ── get_tenant_invitations() ──────────────────────────────────────────────────
-- Returns all invitations for a tenant, ordered newest-first.
-- Used by ralli_admin to see all pending/accepted/canceled invites.

CREATE OR REPLACE FUNCTION public.get_tenant_invitations(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
  v_rows JSONB;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'get_tenant_invitations: requires ralli_admin role';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',          i.id,
      'tenantId',    i.tenant_id,
      'email',       i.admin_email,
      'role',        COALESCE(i.role, 'orgAdmin'),
      'status',      i.status,
      'token',       i.token,
      'expiresAt',   i.expires_at,
      'acceptedAt',  i.accepted_at,
      'createdAt',   i.created_at,
      'emailSent',   i.email_sent
    )
    ORDER BY i.created_at DESC
  )
  INTO v_rows
  FROM tenant_invitations i
  WHERE i.tenant_id = p_tenant_id;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_invitations TO authenticated;


-- ── create_member_invite_admin() ─────────────────────────────────────────────
-- Ralli admin creates a member invite for any tenant (explicit p_tenant_id).
-- Use this instead of create_member_invite() when the caller is ralli_admin
-- and may not have a tenant_id on their own profile.

CREATE OR REPLACE FUNCTION public.create_member_invite_admin(
  p_tenant_id UUID,
  p_email     TEXT,
  p_role      TEXT DEFAULT 'user'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_role    TEXT;
  v_token   TEXT;
  v_inv_id  UUID;
  v_expires TIMESTAMPTZ := NOW() + INTERVAL '7 days';
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'create_member_invite_admin: requires ralli_admin role';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'create_member_invite_admin: tenant not found';
  END IF;

  IF p_role NOT IN ('user', 'manager', 'orgAdmin') THEN
    RAISE EXCEPTION 'create_member_invite_admin: invalid role %', p_role;
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO tenant_invitations (
    tenant_id, admin_email, token, role, status, expires_at, onboarding_state
  ) VALUES (
    p_tenant_id,
    LOWER(TRIM(p_email)),
    v_token,
    p_role,
    'invited',
    v_expires,
    jsonb_build_object(
      'currentStep',    'invited',
      'stepsCompleted', '[]'::jsonb,
      'allSteps',       '["invited","account_created","active"]'::jsonb
    )
  )
  RETURNING id INTO v_inv_id;

  RETURN jsonb_build_object(
    'invitationId', v_inv_id,
    'token',        v_token,
    'email',        LOWER(TRIM(p_email)),
    'role',         p_role,
    'tenantId',     p_tenant_id,
    'expiresAt',    v_expires
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_member_invite_admin TO authenticated;


-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN (
--   'update_tenant', 'update_member', 'remove_member',
--   'cancel_member_invite', 'resend_member_invite', 'get_tenant_invitations',
--   'create_member_invite_admin'
-- );
