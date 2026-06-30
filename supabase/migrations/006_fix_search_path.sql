-- ─────────────────────────────────────────────────────────────────────────────
-- Ralli: Fix provision_tenant search path
-- Run after 004_tenant_provisioning.sql.
--
-- Problem: provision_tenant uses gen_random_bytes() which lives in the
-- `extensions` schema on Supabase. The function was created with
-- SET search_path = public, so Postgres can't find it → error 42883.
--
-- Fix: add `extensions` to the function's search_path so gen_random_bytes
-- is resolvable without touching any other logic.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER FUNCTION public.provision_tenant(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT)
  SET search_path = public, extensions;

-- ── Verify ────────────────────────────────────────────────────────────────────
-- Quick smoke test — should return a row with a 64-char hex token:
-- SELECT provision_tenant('Smoke Test', 'smoke-test', 'starter', 'smoke@test.com', 5, null);
-- DELETE FROM tenants WHERE slug = 'smoke-test';
