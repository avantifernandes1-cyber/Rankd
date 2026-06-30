-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 014: Team membership
--
-- 1. Add team_id to profiles — which team a member belongs to
-- 2. Add team_id to tenant_invitations — pre-assign invitee to a team
-- 3. assign_member_team() RPC — orgAdmin moves members between teams
-- 4. Update create_member_invite() — accept optional p_team_id
-- 5. Update accept_invitation() — apply team_id from invitation on signup
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. profiles.team_id
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES tenant_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_team ON profiles(team_id);

-- 2. tenant_invitations.team_id
ALTER TABLE tenant_invitations
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES tenant_teams(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. assign_member_team()
-- orgAdmin can assign/move members within their own tenant.
-- Passing p_team_id = NULL removes the member from any team.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_member_team(p_user_id UUID, p_team_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant UUID;
  v_target_tenant UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'assign_member_team: must be authenticated';
  END IF;

  SELECT tenant_id INTO v_caller_tenant FROM profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_target_tenant FROM profiles WHERE id = p_user_id;

  IF v_target_tenant IS NULL THEN
    RAISE EXCEPTION 'assign_member_team: target user not found';
  END IF;

  IF NOT (is_ralli_admin() OR v_caller_tenant = v_target_tenant) THEN
    RAISE EXCEPTION 'assign_member_team: unauthorized';
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM tenant_teams WHERE id = p_team_id AND tenant_id = v_target_tenant) THEN
      RAISE EXCEPTION 'assign_member_team: team not found in this tenant';
    END IF;
  END IF;

  UPDATE profiles SET team_id = p_team_id, updated_at = NOW() WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_member_team TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. create_member_invite() — updated to accept optional p_team_id
-- Replaces the version in 007_member_invite.sql
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_member_invite(
  p_email   TEXT,
  p_role    TEXT DEFAULT 'user',
  p_team_id UUID DEFAULT NULL
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'create_member_invite: must be authenticated';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM profiles WHERE id = v_uid;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_member_invite: caller has no tenant assigned';
  END IF;

  IF p_role NOT IN ('user', 'manager', 'orgAdmin') THEN
    RAISE EXCEPTION 'create_member_invite: invalid role %', p_role;
  END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM tenant_teams WHERE id = p_team_id AND tenant_id = v_tenant_id) THEN
      RAISE EXCEPTION 'create_member_invite: team not found in tenant';
    END IF;
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO tenant_invitations (
    tenant_id, admin_email, token, role, team_id, status, expires_at, onboarding_state
  ) VALUES (
    v_tenant_id,
    LOWER(TRIM(p_email)),
    v_token,
    p_role,
    p_team_id,
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
    'teamId',       p_team_id,
    'tenantId',     v_tenant_id,
    'expiresAt',    v_expires
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_member_invite TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. accept_invitation() — updated to set team_id from invitation
-- Replaces the version in 005_invite_functions.sql
-- ─────────────────────────────────────────────────────────────────────────────
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'accept_invitation: must be authenticated';
  END IF;

  SELECT * INTO v_inv FROM tenant_invitations WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_invitation: invitation not found';
  END IF;

  IF v_inv.expires_at < NOW() THEN
    RAISE EXCEPTION 'accept_invitation: invitation has expired';
  END IF;

  IF v_inv.status = 'accepted' THEN
    RAISE EXCEPTION 'accept_invitation: invitation already accepted';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO profiles (id, email, name, role, tenant_id, team_id, status, created_at, updated_at)
  VALUES (
    v_uid,
    COALESCE(v_email, v_inv.admin_email),
    COALESCE(NULLIF(TRIM(p_name), ''), split_part(COALESCE(v_email, v_inv.admin_email), '@', 1)),
    v_inv.role,
    v_inv.tenant_id,
    v_inv.team_id,
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id  = EXCLUDED.tenant_id,
    role       = EXCLUDED.role,
    team_id    = COALESCE(v_inv.team_id, profiles.team_id),
    name       = CASE WHEN NULLIF(TRIM(p_name), '') IS NOT NULL THEN TRIM(p_name) ELSE profiles.name END,
    status     = 'active',
    updated_at = NOW();

  UPDATE tenant_invitations SET
    status      = 'accepted',
    accepted_at = NOW(),
    onboarding_state = onboarding_state || jsonb_build_object(
      'currentStep',    'account_created',
      'stepsCompleted', (onboarding_state->'stepsCompleted') || '["invited"]'::jsonb,
      'acceptedAt',     NOW()
    )
  WHERE id = v_inv.id;

  UPDATE tenants
  SET status = 'onboarding', updated_at = NOW()
  WHERE id = v_inv.tenant_id AND status = 'invited';

  RETURN jsonb_build_object(
    'userId',   v_uid,
    'tenantId', v_inv.tenant_id,
    'role',     v_inv.role,
    'teamId',   v_inv.team_id,
    'name',     COALESCE(NULLIF(TRIM(p_name), ''), split_part(COALESCE(v_email, v_inv.admin_email), '@', 1)),
    'email',    COALESCE(v_email, v_inv.admin_email)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_invitation TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'team_id';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_invitations' AND column_name = 'team_id';
-- SELECT routine_name FROM information_schema.routines WHERE routine_name IN ('assign_member_team', 'create_member_invite', 'accept_invitation');
-- ─────────────────────────────────────────────────────────────────────────────
