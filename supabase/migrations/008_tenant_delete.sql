-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Tenant Delete / Deactivate Functions
-- Run after 005_invite_functions.sql.
--
-- 1. deactivate_tenant() — sets status = 'suspended' (reversible)
-- 2. delete_tenant()     — hard deletes tenant + all child rows (irreversible)
--
-- Both require the caller to have role = 'ralli_admin' in their profile.
-- SECURITY DEFINER bypasses RLS so the cascade can touch all tenant data.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── deactivate_tenant ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deactivate_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'deactivate_tenant: requires ralli_admin role';
  END IF;

  UPDATE tenants
  SET status = 'suspended', updated_at = NOW()
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deactivate_tenant: tenant not found';
  END IF;

  RETURN jsonb_build_object('tenantId', p_tenant_id, 'status', 'suspended');
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_tenant TO authenticated;

-- ── reactivate_tenant ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reactivate_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'reactivate_tenant: requires ralli_admin role';
  END IF;

  UPDATE tenants
  SET status = 'active', updated_at = NOW()
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reactivate_tenant: tenant not found';
  END IF;

  RETURN jsonb_build_object('tenantId', p_tenant_id, 'status', 'active');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reactivate_tenant TO authenticated;

-- ── delete_tenant ─────────────────────────────────────────────────────────────
-- Hard deletes the tenant and all child rows in the correct dependency order.
-- Profiles belonging to this tenant have their tenant_id nulled (they still
-- exist in auth.users and can log in, but are effectively unassigned).

CREATE OR REPLACE FUNCTION public.delete_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_role      TEXT;
  v_name      TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'delete_tenant: requires ralli_admin role';
  END IF;

  SELECT name INTO v_name FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_tenant: tenant not found';
  END IF;

  -- Detach profiles (keep auth users, just remove tenant association)
  UPDATE profiles
  SET tenant_id = NULL, role = 'user', updated_at = NOW()
  WHERE tenant_id = p_tenant_id;

  -- Delete child rows
  DELETE FROM tenant_invitations WHERE tenant_id = p_tenant_id;
  DELETE FROM tenant_settings    WHERE tenant_id = p_tenant_id;

  -- Delete the tenant itself
  DELETE FROM tenants WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'tenantId', p_tenant_id,
    'name',     v_name,
    'deleted',  true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_tenant TO authenticated;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN ('deactivate_tenant', 'reactivate_tenant', 'delete_tenant');
