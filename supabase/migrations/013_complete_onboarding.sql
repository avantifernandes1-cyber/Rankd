-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013: complete_onboarding()
--
-- Problem: tenants_update_admin RLS only allows ralli_admin to UPDATE tenants.
-- When orgAdmin calls supabase.from("tenants").update({ status: "active" }),
-- RLS silently drops the update — no error thrown, status stays "onboarding".
--
-- Fix: SECURITY DEFINER function that orgAdmin can call to mark their own
-- tenant active after completing the setup wizard.
-- Scoped to caller's tenant only — cannot be used to modify other tenants.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_role      TEXT;
  v_tenant_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'complete_onboarding: must be authenticated';
  END IF;

  SELECT role, tenant_id INTO v_role, v_tenant_id FROM profiles WHERE id = v_uid;

  IF v_role NOT IN ('orgAdmin', 'ralli_admin', 'superadmin') THEN
    RAISE EXCEPTION 'complete_onboarding: requires orgAdmin role';
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'complete_onboarding: caller has no tenant assigned';
  END IF;

  UPDATE tenants
  SET status = 'active', updated_at = NOW()
  WHERE id = v_tenant_id
    AND status = 'onboarding';  -- no-op if already active

  RETURN jsonb_build_object('tenantId', v_tenant_id, 'status', 'active');
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_onboarding TO authenticated;
