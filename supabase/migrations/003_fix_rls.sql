-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Fix RLS infinite recursion on profiles table
--
-- Root cause: profiles_select and tenant policies referenced the `profiles`
-- table inside their USING clause. Every time Postgres evaluated the policy
-- it triggered another SELECT on profiles, which triggered the same policy
-- again — infinite recursion (error 42P17).
--
-- Fix: SECURITY DEFINER helper functions that read profiles bypassing RLS,
-- then use those functions in all policies that previously queried profiles.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper functions ──────────────────────────────────────────────────────────
-- SECURITY DEFINER + fixed search_path means these run as the function owner
-- (postgres / service role), bypassing RLS on profiles.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ── Drop old recursive policies ───────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select"         ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"     ON profiles;
DROP POLICY IF EXISTS "profiles_insert_trigger" ON profiles;
DROP POLICY IF EXISTS "tenants_select"          ON tenants;
DROP POLICY IF EXISTS "tenants_insert_admin"    ON tenants;
DROP POLICY IF EXISTS "tenants_update_admin"    ON tenants;

-- ── Recreate policies using helper functions ──────────────────────────────────

-- profiles: own row, ralli_admin sees all, org members see teammates
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR get_my_role() = 'ralli_admin'
    OR (tenant_id IS NOT NULL AND tenant_id = get_my_tenant_id())
  );

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_insert_trigger" ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- tenants: ralli_admin sees all; org members see their own tenant
CREATE POLICY "tenants_select" ON tenants FOR SELECT TO authenticated
  USING (
    get_my_role() = 'ralli_admin'
    OR id = get_my_tenant_id()
  );

CREATE POLICY "tenants_insert_admin" ON tenants FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'ralli_admin');

CREATE POLICY "tenants_update_admin" ON tenants FOR UPDATE TO authenticated
  USING (get_my_role() = 'ralli_admin');

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_name IN ('get_my_role', 'get_my_tenant_id');
