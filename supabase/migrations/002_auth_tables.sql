-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Auth Tables Migration
-- Run in Supabase SQL Editor after 001_game_tables.sql.
-- Safe to re-run: uses IF NOT EXISTS + OR REPLACE throughout.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── tenants ───────────────────────────────────────────────────────────────────
-- One row per company. All user data is scoped to a tenant.

CREATE TABLE IF NOT EXISTS tenants (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  plan         TEXT        NOT NULL DEFAULT 'starter',  -- starter|growth|enterprise
  status       TEXT        NOT NULL DEFAULT 'active',   -- active|suspended|pending
  seat_limit   INTEGER     NOT NULL DEFAULT 10,
  admin_email  TEXT,
  logo_url     TEXT,
  domain       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenants_slug_unique UNIQUE (slug)
);

COMMENT ON TABLE  tenants            IS 'One row per company (tenant)';
COMMENT ON COLUMN tenants.slug       IS 'URL-safe identifier, e.g. momence';
COMMENT ON COLUMN tenants.plan       IS 'Billing plan: starter | growth | enterprise';
COMMENT ON COLUMN tenants.seat_limit IS 'Max active users allowed on this plan';

-- ── profiles ──────────────────────────────────────────────────────────────────
-- Extends auth.users with app-specific fields.
-- id = auth.users.id — created automatically via trigger on signup.

CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user',    -- user|orgAdmin|ralli_admin
  tenant_id     UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  color         TEXT,                                   -- avatar background color
  avatar_emoji  TEXT,                                   -- emoji avatar
  xp            INTEGER     NOT NULL DEFAULT 0,
  streak        INTEGER     NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'active',  -- active|suspended|invited
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  profiles           IS 'App user profile — extends auth.users';
COMMENT ON COLUMN profiles.id        IS 'Matches auth.users.id exactly';
COMMENT ON COLUMN profiles.role      IS 'user | orgAdmin | ralli_admin';
COMMENT ON COLUMN profiles.tenant_id IS 'Null for ralli_admin users';

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_tenant  ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role    ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email   ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_tenants_slug     ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status   ON tenants(status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE tenants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- tenants: ralli_admin can read all; orgAdmin can read their own tenant
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'tenants_select') THEN
    CREATE POLICY "tenants_select" ON tenants FOR SELECT TO authenticated
      USING (
        -- ralli_admin sees all
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ralli_admin')
        OR
        -- org members see their own tenant
        id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'tenants_insert_admin') THEN
    CREATE POLICY "tenants_insert_admin" ON tenants FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ralli_admin')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'tenants_update_admin') THEN
    CREATE POLICY "tenants_update_admin" ON tenants FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ralli_admin')
      );
  END IF;

  -- profiles: users read their own; ralli_admin reads all; org members read teammates
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_select') THEN
    CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
      USING (
        id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'ralli_admin')
        OR (
          tenant_id IS NOT NULL
          AND tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_own') THEN
    CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
      USING (id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_insert_trigger') THEN
    -- Allow the trigger function (running as SECURITY DEFINER) to insert
    CREATE POLICY "profiles_insert_trigger" ON profiles FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());
  END IF;
END $$;

-- ── Trigger: auto-create profile on signup ────────────────────────────────────
-- Runs after a new row is inserted into auth.users.
-- Populates profiles with sensible defaults so the app never gets a null profile.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, status, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    'active',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop + recreate trigger so re-running this script is safe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── updated_at auto-update ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_tenants_updated_at ON tenants;
CREATE TRIGGER set_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name IN ('tenants', 'profiles');
