-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 011: Org Admin Invite Management
--
-- Extends invite management to orgAdmin role (scoped to their own tenant).
--
-- New functions:
--   1. get_my_tenant_invitations()    — orgAdmin/ralli_admin reads their tenant's invites
--
-- Updated functions (CREATE OR REPLACE):
--   2. cancel_member_invite()         — extends to allow orgAdmin (own tenant only)
--   3. resend_member_invite()         — extends to allow orgAdmin (own tenant only)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── get_my_tenant_invitations() ───────────────────────────────────────────────
-- Returns all invitations for the caller's tenant, ordered newest-first.
-- Available to: orgAdmin (own tenant), ralli_admin (must pass — use get_tenant_invitations instead for cross-tenant).
--
-- Returns the same shape as get_tenant_invitations() for UI compatibility.

CREATE OR REPLACE FUNCTION public.get_my_tenant_invitations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_role      TEXT;
  v_tenant_id UUID;
  v_rows      JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'get_my_tenant_invitations: must be authenticated';
  END IF;

  SELECT role, tenant_id INTO v_role, v_tenant_id FROM profiles WHERE id = v_uid;

  -- Allow ralli_admin (will see empty result if they have no tenant, which is fine)
  -- Allow orgAdmin scoped to their tenant
  IF v_role NOT IN ('ralli_admin', 'superadmin', 'orgAdmin') THEN
    RAISE EXCEPTION 'get_my_tenant_invitations: requires orgAdmin or ralli_admin role';
  END IF;

  IF v_tenant_id IS NULL AND v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'get_my_tenant_invitations: caller has no tenant assigned';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',          i.id,
      'tenantId',    i.tenant_id,
      'email',       i.admin_email,
      'role',        COALESCE(i.role, 'user'),
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
  WHERE i.tenant_id = v_tenant_id;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_invitations TO authenticated;


-- ── cancel_member_invite() ────────────────────────────────────────────────────
-- Extends to allow orgAdmin to cancel invites within their own tenant.

CREATE OR REPLACE FUNCTION public.cancel_member_invite(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_role      TEXT;
  v_tenant_id UUID;
  v_row       tenant_invitations%ROWTYPE;
BEGIN
  SELECT role, tenant_id INTO v_role, v_tenant_id FROM profiles WHERE id = v_uid;

  SELECT * INTO v_row FROM tenant_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_member_invite: invitation not found';
  END IF;

  -- ralli_admin: unrestricted
  -- orgAdmin: own tenant only
  IF v_role IN ('ralli_admin', 'superadmin') THEN
    NULL; -- allowed
  ELSIF v_role = 'orgAdmin' THEN
    IF v_row.tenant_id <> v_tenant_id THEN
      RAISE EXCEPTION 'cancel_member_invite: not authorized for this tenant';
    END IF;
  ELSE
    RAISE EXCEPTION 'cancel_member_invite: requires orgAdmin or ralli_admin role';
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
-- Extends to allow orgAdmin to resend invites within their own tenant.

CREATE OR REPLACE FUNCTION public.resend_member_invite(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_role      TEXT;
  v_tenant_id UUID;
  v_row       tenant_invitations%ROWTYPE;
BEGIN
  SELECT role, tenant_id INTO v_role, v_tenant_id FROM profiles WHERE id = v_uid;

  SELECT * INTO v_row FROM tenant_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resend_member_invite: invitation not found';
  END IF;

  -- ralli_admin: unrestricted
  -- orgAdmin: own tenant only
  IF v_role IN ('ralli_admin', 'superadmin') THEN
    NULL; -- allowed
  ELSIF v_role = 'orgAdmin' THEN
    IF v_row.tenant_id <> v_tenant_id THEN
      RAISE EXCEPTION 'resend_member_invite: not authorized for this tenant';
    END IF;
  ELSE
    RAISE EXCEPTION 'resend_member_invite: requires orgAdmin or ralli_admin role';
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


-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('get_my_tenant_invitations', 'cancel_member_invite', 'resend_member_invite');
