-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Content Tables + Lesson Completions
-- Run after 009_admin_management.sql.
--
-- Tables:
--   1. tenant_courses      — courses scoped per tenant
--   2. tenant_lessons      — lessons scoped per tenant
--   3. tenant_quizzes      — quizzes scoped per tenant (replaces localStorage)
--   4. lesson_completions  — per-user lesson completion log (cross-device sync)
--
-- RLS:
--   - All content tables: tenants see only their own content
--   - Writes restricted to orgAdmin / ralli_admin roles
--   - lesson_completions: users read/write their own rows only
-- ─────────────────────────────────────────────────────────────────────────────


-- ── tenant_courses ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_courses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  lesson_ids  JSONB       NOT NULL DEFAULT '[]',  -- ordered array of tenant_lesson UUIDs
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  emoji       TEXT,
  color       TEXT,
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tenant_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_courses_select" ON public.tenant_courses
  FOR SELECT TO authenticated
  USING (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_courses_insert" ON public.tenant_courses
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE POLICY "tenant_courses_update" ON public.tenant_courses
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE POLICY "tenant_courses_delete" ON public.tenant_courses
  FOR DELETE TO authenticated
  USING (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE INDEX IF NOT EXISTS tenant_courses_tenant_idx ON public.tenant_courses (tenant_id);


-- ── tenant_lessons ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_lessons (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  type        TEXT        NOT NULL DEFAULT 'text' CHECK (type IN ('video','text','interactive','flipcard','recording')),
  duration    TEXT,
  xp          INTEGER     NOT NULL DEFAULT 100,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','inactive')),
  content     JSONB       NOT NULL DEFAULT '{}',  -- { videoUrl?, body?, notes? }
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tenant_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_lessons_select" ON public.tenant_lessons
  FOR SELECT TO authenticated
  USING (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_lessons_insert" ON public.tenant_lessons
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE POLICY "tenant_lessons_update" ON public.tenant_lessons
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE POLICY "tenant_lessons_delete" ON public.tenant_lessons
  FOR DELETE TO authenticated
  USING (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE INDEX IF NOT EXISTS tenant_lessons_tenant_idx ON public.tenant_lessons (tenant_id);


-- ── tenant_quizzes ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_quizzes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  questions   JSONB       NOT NULL DEFAULT '[]',
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','draft')),
  is_favorite BOOLEAN     NOT NULL DEFAULT false,
  tags        JSONB                DEFAULT '[]',
  created_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tenant_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_quizzes_select" ON public.tenant_quizzes
  FOR SELECT TO authenticated
  USING (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id());

CREATE POLICY "tenant_quizzes_insert" ON public.tenant_quizzes
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE POLICY "tenant_quizzes_update" ON public.tenant_quizzes
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE POLICY "tenant_quizzes_delete" ON public.tenant_quizzes
  FOR DELETE TO authenticated
  USING (
    get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager')
    AND (get_my_role() = 'ralli_admin' OR tenant_id = get_my_tenant_id())
  );

CREATE INDEX IF NOT EXISTS tenant_quizzes_tenant_idx ON public.tenant_quizzes (tenant_id);


-- ── lesson_completions ────────────────────────────────────────────────────────
-- Tracks which lessons each user has completed.
-- lesson_id is TEXT (not FK) to support both DB UUID lessons and legacy string IDs.

CREATE TABLE IF NOT EXISTS public.lesson_completions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id    UUID        REFERENCES public.tenants(id) ON DELETE SET NULL,
  lesson_id    TEXT        NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, lesson_id)
);

ALTER TABLE public.lesson_completions ENABLE ROW LEVEL SECURITY;

-- Users see and manage only their own completions
CREATE POLICY "lesson_completions_select" ON public.lesson_completions
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR get_my_role() IN ('ralli_admin', 'orgAdmin', 'manager'));

CREATE POLICY "lesson_completions_insert" ON public.lesson_completions
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "lesson_completions_update" ON public.lesson_completions
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "lesson_completions_delete" ON public.lesson_completions
  FOR DELETE TO authenticated
  USING (profile_id = auth.uid() OR get_my_role() IN ('ralli_admin', 'orgAdmin'));

CREATE INDEX IF NOT EXISTS lesson_completions_profile_idx ON public.lesson_completions (profile_id);
CREATE INDEX IF NOT EXISTS lesson_completions_lesson_idx  ON public.lesson_completions (lesson_id);


-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('tenant_courses', 'tenant_lessons', 'tenant_quizzes', 'lesson_completions');
