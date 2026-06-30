-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012: Fix tenant_teams RLS for orgAdmin
--
-- Problem: tenant_teams UPDATE policy was ralli_admin-only, no DELETE policy.
-- orgAdmin cannot edit or delete teams they created.
--
-- Fix:
--   - UPDATE: orgAdmin can update teams in their own tenant
--   - DELETE: orgAdmin can delete non-default teams in their own tenant
--             (default team is protected — it's created at provisioning and should
--              not be accidentally removed; ralli_admin can still delete it)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing update policy (was ralli_admin-only)
DROP POLICY IF EXISTS "tenant_teams_update" ON tenant_teams;

-- New update: orgAdmin can update own tenant's teams; ralli_admin can update all
CREATE POLICY "tenant_teams_update" ON tenant_teams
  FOR UPDATE TO authenticated
  USING   (is_ralli_admin() OR tenant_id = get_my_tenant_id())
  WITH CHECK (is_ralli_admin() OR tenant_id = get_my_tenant_id());

-- New delete: orgAdmin can delete non-default teams in own tenant; ralli_admin unrestricted
CREATE POLICY "tenant_teams_delete" ON tenant_teams
  FOR DELETE TO authenticated
  USING (
    is_ralli_admin()
    OR (tenant_id = get_my_tenant_id() AND is_default = FALSE)
  );

-- Verify:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'tenant_teams' ORDER BY cmd;
