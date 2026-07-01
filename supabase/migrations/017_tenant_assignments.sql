-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Tenant Assignments Table
-- Run after 016_game_sessions_auth_rls.sql
--
-- Replaces INITIAL_ASSIGNMENTS mock data with a real persistence layer.
-- Tracks manager/admin assignments of courses or lessons to teams or individuals.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_assignments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  content_type TEXT        NOT NULL CHECK (content_type IN ('course', 'lesson')),
  content_id   TEXT        NOT NULL,     -- UUID of tenant_courses or tenant_lessons
  assigned_to  JSONB       NOT NULL DEFAULT '{}',
  -- { type: 'team'|'individual', teamId?: UUID, teamName?: string, userId?: UUID, userName?: string }
  due_at       TEXT,                     -- ISO date string or "Open"
  required     BOOLEAN     NOT NULL DEFAULT false,
  assigned_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tenant_assignments ENABLE ROW LEVEL SECURITY;

-- All tenant members can read assignments for their org (needed for user Learn screen)
CREATE POLICY "tenant_assignments_select" ON public.tenant_assignments
  FOR SELECT TO authenticated
  USING (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id());

-- Only managers and above can create assignments
CREATE POLICY "tenant_assignments_insert" ON public.tenant_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

-- Only managers and above can delete assignments
CREATE POLICY "tenant_assignments_delete" ON public.tenant_assignments
  FOR DELETE TO authenticated
  USING (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE INDEX IF NOT EXISTS tenant_assignments_tenant_idx ON public.tenant_assignments (tenant_id);
CREATE INDEX IF NOT EXISTS tenant_assignments_content_idx ON public.tenant_assignments (content_type, content_id);
CREATE INDEX IF NOT EXISTS tenant_assignments_assigned_at_idx ON public.tenant_assignments (assigned_at DESC);

-- Verify
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenant_assignments';
