-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Tenant Provisioning Migration
-- Run after 003_fix_rls.sql.
-- Safe to re-run: uses IF NOT EXISTS + CREATE OR REPLACE throughout.
--
-- What this migration creates:
--   1. Helper functions: is_ralli_admin(), get_plan_features()
--   2. Tables: tenant_settings, tenant_invitations, tenant_teams
--   3. RLS on all new tables (uses is_ralli_admin() + get_my_tenant_id() from 003)
--   4. provision_tenant() — atomic SECURITY DEFINER function that runs the
--      full org creation workflow in a single transaction:
--        a. Create tenant row (status: invited)
--        b. Create default tenant settings (branding, features, role perms, etc.)
--        c. Create default team
--        d. Generate invitation token + onboarding state
--      Feature access is plan-gated via get_plan_features().
-- ─────────────────────────────────────────────────────────────────────────────

-- ── is_ralli_admin() ──────────────────────────────────────────────────────────
-- Unified admin check used in all policies. Handles both 'ralli_admin' and the
-- legacy 'superadmin' alias so no existing session breaks.

CREATE OR REPLACE FUNCTION public.is_ralli_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('ralli_admin', 'superadmin') FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- ── get_plan_features() ───────────────────────────────────────────────────────
-- Returns a JSONB feature-access map for a given plan.
-- Key = feature slug, value = boolean enabled.
-- Plans: starter | growth | enterprise (anything else → demo/free tier)

CREATE OR REPLACE FUNCTION public.get_plan_features(p_plan TEXT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE LOWER(p_plan)
    WHEN 'starter' THEN '{
      "games":          true,
      "learn":          true,
      "quizzes":        true,
      "battle_cards":   false,
      "analytics":      false,
      "integrations":   false,
      "custom_branding":false
    }'::jsonb
    WHEN 'growth' THEN '{
      "games":          true,
      "learn":          true,
      "quizzes":        true,
      "battle_cards":   true,
      "analytics":      true,
      "integrations":   false,
      "custom_branding":false
    }'::jsonb
    WHEN 'enterprise' THEN '{
      "games":          true,
      "learn":          true,
      "quizzes":        true,
      "battle_cards":   true,
      "analytics":      true,
      "integrations":   true,
      "custom_branding":true
    }'::jsonb
    ELSE '{
      "games":          true,
      "learn":          true,
      "quizzes":        false,
      "battle_cards":   false,
      "analytics":      false,
      "integrations":   false,
      "custom_branding":false
    }'::jsonb
  END
$$;

-- ── tenant_settings ───────────────────────────────────────────────────────────
-- 1:1 with tenants. All settings stored as JSONB columns for flexibility.
-- Created automatically by provision_tenant() — never inserted directly.

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id             UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  branding              JSONB       NOT NULL DEFAULT '{}',
  feature_access        JSONB       NOT NULL DEFAULT '{}',
  role_permissions      JSONB       NOT NULL DEFAULT '{}',
  notification_settings JSONB       NOT NULL DEFAULT '{}',
  game_settings         JSONB       NOT NULL DEFAULT '{}',
  learning_settings     JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  tenant_settings IS '1:1 with tenants — all config stored as JSONB';
COMMENT ON COLUMN tenant_settings.feature_access IS 'Plan-gated feature flags; see get_plan_features()';
COMMENT ON COLUMN tenant_settings.role_permissions IS 'Per-role nav/feature access overrides';

-- ── tenant_invitations ────────────────────────────────────────────────────────
-- One invitation record per org creation. Tracks onboarding state.
-- email_sent = false means the email is mocked (no real send yet).
-- Production: send via Supabase Auth invite or transactional email provider.

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admin_email      TEXT        NOT NULL,
  token            TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status           TEXT        NOT NULL DEFAULT 'pending',   -- pending|accepted|expired|resent
  onboarding_state JSONB       NOT NULL DEFAULT '{}',
  email_sent       BOOLEAN     NOT NULL DEFAULT FALSE,       -- false = mocked, no real email
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  tenant_invitations IS 'Invitation + onboarding state per provisioned org';
COMMENT ON COLUMN tenant_invitations.email_sent IS 'False = email mocked; true = real send confirmed';
COMMENT ON COLUMN tenant_invitations.token IS 'Used in /invite/:token onboarding URL';

-- ── tenant_teams ──────────────────────────────────────────────────────────────
-- Default team provisioned per org. One is_default=true team per tenant at creation.
-- Additional teams can be created by orgAdmin after onboarding.

CREATE TABLE IF NOT EXISTS tenant_teams (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  tenant_teams IS 'Teams scoped to a tenant';
COMMENT ON COLUMN tenant_teams.is_default IS 'True for the auto-provisioned default team';

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant     ON tenant_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_tenant  ON tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_token   ON tenant_invitations(token);
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_status  ON tenant_invitations(status);
CREATE INDEX IF NOT EXISTS idx_tenant_teams_tenant        ON tenant_teams(tenant_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE tenant_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_teams       ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN

  -- tenant_settings: ralli_admin reads all; org members read own
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_settings' AND policyname = 'tenant_settings_select') THEN
    CREATE POLICY "tenant_settings_select" ON tenant_settings FOR SELECT TO authenticated
      USING (is_ralli_admin() OR tenant_id = get_my_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_settings' AND policyname = 'tenant_settings_update') THEN
    CREATE POLICY "tenant_settings_update" ON tenant_settings FOR UPDATE TO authenticated
      USING (is_ralli_admin());
  END IF;

  -- tenant_invitations: ralli_admin only (invited admin reads via token — future)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_invitations' AND policyname = 'tenant_invitations_select') THEN
    CREATE POLICY "tenant_invitations_select" ON tenant_invitations FOR SELECT TO authenticated
      USING (is_ralli_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_invitations' AND policyname = 'tenant_invitations_update') THEN
    CREATE POLICY "tenant_invitations_update" ON tenant_invitations FOR UPDATE TO authenticated
      USING (is_ralli_admin());
  END IF;

  -- tenant_teams: ralli_admin reads all; org members read own
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_teams' AND policyname = 'tenant_teams_select') THEN
    CREATE POLICY "tenant_teams_select" ON tenant_teams FOR SELECT TO authenticated
      USING (is_ralli_admin() OR tenant_id = get_my_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_teams' AND policyname = 'tenant_teams_insert') THEN
    CREATE POLICY "tenant_teams_insert" ON tenant_teams FOR INSERT TO authenticated
      WITH CHECK (is_ralli_admin() OR tenant_id = get_my_tenant_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_teams' AND policyname = 'tenant_teams_update') THEN
    CREATE POLICY "tenant_teams_update" ON tenant_teams FOR UPDATE TO authenticated
      USING (is_ralli_admin());
  END IF;

END $$;

-- ── updated_at triggers ───────────────────────────────────────────────────────
-- set_updated_at() already exists from 002_auth_tables.sql

DROP TRIGGER IF EXISTS set_tenant_settings_updated_at ON tenant_settings;
CREATE TRIGGER set_tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_tenant_teams_updated_at ON tenant_teams;
CREATE TRIGGER set_tenant_teams_updated_at
  BEFORE UPDATE ON tenant_teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── provision_tenant() ────────────────────────────────────────────────────────
-- Atomic org creation workflow. Runs as SECURITY DEFINER (bypasses RLS internally).
-- Caller must have ralli_admin role — enforced inside the function.
--
-- Steps:
--   1. Validate caller + slug uniqueness
--   2. Create tenant (status = 'invited')
--   3. Compute plan-gated feature access
--   4. Create default tenant_settings (branding, features, role perms, notifications, game + learning config)
--   5. Create default tenant_teams (one 'is_default = true' team)
--   6. Create tenant_invitations record with onboarding state + invite token
--      (email_sent = false: email is mocked until a real provider is wired)
--
-- Returns JSONB with all provisioned identifiers + invite URL.

CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name        TEXT,
  p_slug        TEXT,
  p_plan        TEXT,
  p_admin_email TEXT,
  p_seat_limit  INTEGER DEFAULT 10,
  p_domain      TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id     UUID;
  v_invitation_id UUID;
  v_token         TEXT;
  v_features      JSONB;
  v_clean_slug    TEXT;
BEGIN
  -- ── Guard: caller must be ralli_admin ──────────────────────────────────────
  IF NOT is_ralli_admin() THEN
    RAISE EXCEPTION 'provision_tenant: caller must have ralli_admin role';
  END IF;

  -- ── Normalize slug ─────────────────────────────────────────────────────────
  v_clean_slug := LOWER(REGEXP_REPLACE(TRIM(p_slug), '[^a-z0-9]+', '-', 'g'));
  v_clean_slug := TRIM(BOTH '-' FROM v_clean_slug);

  IF v_clean_slug = '' THEN
    RAISE EXCEPTION 'provision_tenant: invalid slug derived from "%"', p_slug;
  END IF;

  IF EXISTS (SELECT 1 FROM tenants WHERE slug = v_clean_slug) THEN
    RAISE EXCEPTION 'provision_tenant: slug already exists: "%"', v_clean_slug;
  END IF;

  -- ── Step 1: Create tenant ──────────────────────────────────────────────────
  INSERT INTO tenants (slug, name, plan, status, seat_limit, admin_email, domain)
  VALUES (
    v_clean_slug,
    TRIM(p_name),
    LOWER(p_plan),
    'invited',
    GREATEST(p_seat_limit, 1),
    LOWER(TRIM(p_admin_email)),
    NULLIF(LOWER(TRIM(COALESCE(p_domain, ''))), '')
  )
  RETURNING id INTO v_tenant_id;

  -- ── Step 2: Feature access based on plan ──────────────────────────────────
  v_features := get_plan_features(p_plan);

  -- ── Step 3: Default tenant settings ───────────────────────────────────────
  INSERT INTO tenant_settings (
    tenant_id,
    branding,
    feature_access,
    role_permissions,
    notification_settings,
    game_settings,
    learning_settings
  ) VALUES (
    v_tenant_id,

    -- Branding: defaults; org admin customizes during onboarding
    jsonb_build_object(
      'primaryColor', '#F97316',
      'logoUrl',      NULL,
      'companyName',  TRIM(p_name),
      'domain',       NULLIF(LOWER(TRIM(COALESCE(p_domain, ''))), '')
    ),

    -- Feature access: plan-gated
    v_features,

    -- Role permissions: default nav/action access per role
    jsonb_build_object(
      'user', jsonb_build_object(
        'games',       true,
        'learn',       true,
        'quizzes',     true,
        'battleCards', true,
        'leaderboard', true,
        'progress',    true,
        'settings',    false,
        'team',        false,
        'analytics',   false
      ),
      'manager', jsonb_build_object(
        'games',       true,
        'learn',       true,
        'quizzes',     true,
        'battleCards', true,
        'leaderboard', true,
        'progress',    true,
        'settings',    false,
        'team',        true,
        'analytics',   true
      ),
      'admin', jsonb_build_object(
        'games',       true,
        'learn',       true,
        'quizzes',     true,
        'battleCards', true,
        'leaderboard', true,
        'progress',    true,
        'settings',    true,
        'team',        true,
        'analytics',   true
      )
    ),

    -- Notification defaults
    jsonb_build_object(
      'emailDigest',        true,
      'gameInvites',        true,
      'learningReminders',  true,
      'achievementAlerts',  true,
      'weeklyReport',       true
    ),

    -- Game settings
    jsonb_build_object(
      'defaultTimerSeconds',       30,
      'defaultQuestionCount',      10,
      'allowAnonymousPlayers',     false,
      'showLeaderboardDuringGame', true,
      'requireAuthentication',     true
    ),

    -- Learning settings
    jsonb_build_object(
      'enforceOrder',  false,
      'allowRetakes',  true,
      'passingScore',  80,
      'xpPerLesson',   50,
      'xpPerQuiz',     100,
      'xpPerGame',     150,
      'streakBonusXp', 25
    )
  );

  -- ── Step 4: Default team ───────────────────────────────────────────────────
  INSERT INTO tenant_teams (tenant_id, name, is_default)
  VALUES (v_tenant_id, TRIM(p_name) || ' Team', true);

  -- ── Step 5: Invitation + onboarding state ─────────────────────────────────
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO tenant_invitations (
    tenant_id,
    admin_email,
    token,
    status,
    onboarding_state,
    email_sent,
    expires_at
  ) VALUES (
    v_tenant_id,
    LOWER(TRIM(p_admin_email)),
    v_token,
    'pending',
    jsonb_build_object(
      'currentStep',    'invited',
      'stepsCompleted', '[]'::jsonb,
      'allSteps',       '["invited","account_created","profile_setup","team_setup","first_content","active"]'::jsonb,
      'invitedAt',      NOW()
    ),
    false,
    NOW() + INTERVAL '7 days'
  )
  RETURNING id INTO v_invitation_id;

  -- ── Return provisioned identifiers ────────────────────────────────────────
  RETURN jsonb_build_object(
    'tenantId',     v_tenant_id,
    'invitationId', v_invitation_id,
    'token',        v_token,
    'adminEmail',   LOWER(TRIM(p_admin_email)),
    'status',       'invited',
    'plan',         LOWER(p_plan),
    'features',     v_features,
    'inviteUrl',    '/invite/' || v_token,
    'expiresAt',    NOW() + INTERVAL '7 days'
  );
END;
$$;

-- Callable by authenticated ralli_admin users (function guards internally)
GRANT EXECUTE ON FUNCTION public.provision_tenant TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_plan_features TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ralli_admin TO authenticated;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('tenant_settings', 'tenant_invitations', 'tenant_teams');
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN ('provision_tenant', 'get_plan_features', 'is_ralli_admin');
