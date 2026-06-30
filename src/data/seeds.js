/**
 * Ralli Seed Data
 *
 * Production replacement: rows in Supabase PostgreSQL tables.
 * These constants power the Ralli prototype and internal demos.
 *
 * ID conventions (demo):
 *   Tenants:  "org_<slug>"         — production: UUID v4
 *   Users:    short name string    — production: Supabase Auth UUID
 *
 * When Supabase is connected:
 *   1. Run src/scripts/seed.sql to insert these rows into the database
 *   2. Remove SEED_TENANTS and SEED_USERS from App state (fetch from API instead)
 *   3. Keep SEED_TENANT_SETTINGS as reference for the default settings shape
 *
 * @module seeds
 */

import { RALLI_PLANS, TENANT_STATUS, USER_STATUS } from './schema.js';

// ── SEED TENANTS ─────────────────────────────────────────────────────────────
// Production: SELECT * FROM tenants ORDER BY created_at DESC
// tenantId is the canonical isolation key for all child entities.
// "Momence" is the primary demo tenant and the seed for all feature demos.

export const SEED_TENANTS = [
  {
    // ── Momence — primary demo tenant (Growth/pro plan) ──────────────────
    id:         "org_momence",
    slug:       "momence",
    name:       "Momence",
    logo:       null,                    // logoUrl — set when org uploads logo
    domain:     "momence.com",
    plan:       RALLI_PLANS.PRO,         // "Growth" (maps to pro in FEATURE_CONFIG)
    status:     TENANT_STATUS.ACTIVE,
    seatLimit:  25,
    seats:      25,                      // alias — backward compat for app reads
    adminEmail: "admin@momence.com",
    createdAt:  "2025-05-12",
    updatedAt:  "2025-06-01",
  },
  {
    // ── FinPilot — secondary demo tenant (Starter plan) ──────────────────
    id:         "org_finpilot",
    slug:       "finpilot",
    name:       "FinPilot",
    logo:       null,
    domain:     "finpilot.io",
    plan:       RALLI_PLANS.STARTER,
    status:     TENANT_STATUS.ACTIVE,
    seatLimit:  10,
    seats:      10,
    adminEmail: "admin@finpilot.io",
    createdAt:  "2025-06-01",
    updatedAt:  "2025-06-10",
  },
  {
    // ── HireFrame — Enterprise demo tenant ────────────────────────────────
    id:         "org_hireframe",
    slug:       "hireframe",
    name:       "HireFrame",
    logo:       null,
    domain:     "hireframe.com",
    plan:       RALLI_PLANS.ENTERPRISE,
    status:     TENANT_STATUS.ACTIVE,
    seatLimit:  100,
    seats:      100,
    adminEmail: "admin@hireframe.com",
    createdAt:  "2025-04-20",
    updatedAt:  "2025-05-15",
  },
  {
    // ── Demo Co — pending onboarding tenant ──────────────────────────────
    id:         "org_demotest",
    slug:       "democorp",
    name:       "Demo Co (Pending)",
    logo:       null,
    domain:     null,
    plan:       RALLI_PLANS.STARTER,
    status:     TENANT_STATUS.PENDING,
    seatLimit:  5,
    seats:      5,
    adminEmail: "hello@democorp.com",
    createdAt:  "2025-06-20",
    updatedAt:  "2025-06-20",
  },
];

// ── SEED USERS ───────────────────────────────────────────────────────────────
// Production: SELECT * FROM users WHERE tenant_id = :tenantId
// tenantId is the canonical field. orgId is retained as an alias for app-layer compat.
// Supabase Auth handles authentication; the users table stores profile + role.
//
// App-layer XP/level/streak/rank/score fields are denormalized here for the demo.
// Production: these come from xp_totals, streaks, and readiness_scores tables.
//
// IMPORTANT: password field is demo-only and is NEVER stored in production.
// Production auth: supabase.auth.signInWithPassword({ email, password })

export const SEED_USERS = [

  // ── Momence (tenantId: org_momence) ─────────────────────────────────────

  {
    id:        "jordan",
    tenantId:  "org_momence",
    orgId:     "org_momence",          // alias — app compat (= tenantId)
    email:     "jordan@momence.com",
    name:      "Jordan Rivera",
    initials:  "JR",
    role:      "user",
    status:    USER_STATUS.ACTIVE,
    title:     "Senior AE",
    color:     "#FDBF24",              // C.orange
    password:  "demo",                 // demo only
    // App-layer fields (production: from related tables)
    level: 14, xp: 2340, xpNext: 3000,
    streak: 7, rank: 3, score: 91,
    weeklyChange: "+7.2%", pendingTraining: 3,
    createdAt: "2025-05-12", updatedAt: "2025-06-01",
  },
  {
    id:        "sara",
    tenantId:  "org_momence",
    orgId:     "org_momence",
    email:     "sara@momence.com",
    name:      "Sara Kim",
    initials:  "SK",
    role:      "orgAdmin",             // canonical: "admin" — internal key preserved
    status:    USER_STATUS.ACTIVE,
    title:     "Sales Enablement Manager",
    color:     "#22C55E",
    password:  "demo",
    level: 12, xp: 1890, xpNext: 2500,
    streak: 10, rank: 4, score: 88,
    weeklyChange: "+4.1%", pendingTraining: 5,
    createdAt: "2025-05-12", updatedAt: "2025-06-01",
  },
  {
    id:        "marcus",
    tenantId:  "org_momence",
    orgId:     "org_momence",
    email:     "marcus@momence.com",
    name:      "Marcus Webb",
    initials:  "MW",
    role:      "user",
    status:    USER_STATUS.ACTIVE,
    title:     "BDR",
    color:     "#3B82F6",
    password:  "demo",
    level: 8,  xp: 980,  xpNext: 1500,
    streak: 3, rank: 7, score: 78,
    weeklyChange: "+2.3%", pendingTraining: 8,
    createdAt: "2025-05-12", updatedAt: "2025-06-01",
  },

  // ── FinPilot (tenantId: org_finpilot) ───────────────────────────────────

  {
    id:        "priya",
    tenantId:  "org_finpilot",
    orgId:     "org_finpilot",
    email:     "priya@finpilot.io",
    name:      "Priya Sharma",
    initials:  "PS",
    role:      "orgAdmin",
    status:    USER_STATUS.ACTIVE,
    title:     "Sales Manager",
    color:     "#8B5CF6",
    password:  "demo",
    level: 10, xp: 1400, xpNext: 2000,
    streak: 5, rank: 1, score: 94,
    weeklyChange: "+5.1%", pendingTraining: 2,
    createdAt: "2025-06-01", updatedAt: "2025-06-10",
  },
  {
    id:        "devon",
    tenantId:  "org_finpilot",
    orgId:     "org_finpilot",
    email:     "devon@finpilot.io",
    name:      "Devon Reyes",
    initials:  "DR",
    role:      "user",
    status:    USER_STATUS.ACTIVE,
    title:     "Account Executive",
    color:     "#F43F5E",
    password:  "demo",
    level: 9,  xp: 1200, xpNext: 1800,
    streak: 4, rank: 2, score: 87,
    weeklyChange: "+3.8%", pendingTraining: 4,
    createdAt: "2025-06-01", updatedAt: "2025-06-10",
  },

  // ── Ralli Platform Admin (no tenant) ────────────────────────────────────
  // tenantId: null — ralli_admin is not scoped to any tenant.
  // Has full read/write access to all tenants via service-role operations.
  // Production: Supabase service role key + separate admin API routes.

  {
    id:        "avanti",
    tenantId:  null,                   // not tenant-scoped
    orgId:     null,                   // alias — app compat
    email:     "avanti@ralli.com",
    name:      "Avanti Fernandes",
    initials:  "AF",
    role:      "superadmin",           // internal key — canonical: "ralli_admin"
                                       // isRalliAdmin() handles both strings
    status:    USER_STATUS.ACTIVE,
    title:     "ralli platform admin",
    color:     "#FFD86A",              // C.green (brand secondary)
    password:  "demo",
    // ralli_admin has no tenant-scoped metrics
    level: null, xp: null, xpNext: null,
    streak: null, rank: null, score: null,
    weeklyChange: null, pendingTraining: null,
    createdAt: "2025-01-01", updatedAt: "2025-06-01",
  },
];

// ── SEED TENANT SETTINGS ─────────────────────────────────────────────────────
// Production: SELECT * FROM tenant_settings WHERE tenant_id = :tenantId
// Stored as JSONB columns in Supabase. One row per tenant.
// null rolePermissions → use DEFAULT_ROLE_PERMISSIONS from permissions.js

export const SEED_TENANT_SETTINGS = [
  {
    tenantId: "org_momence",
    branding: {
      primaryColor: "#FDBF24",
      logoUrl:      null,
      companyName:  "Momence",
    },
    // Growth plan = pro — matches FEATURE_CONFIG access
    enabledFeatures: {
      dashboard:      true,
      games:          true,
      learn:          true,
      analytics:      true,
      aiInsights:     false,
      integrations:   true,
      customBranding: false,
    },
    rolePermissions:      null,         // uses DEFAULT_ROLE_PERMISSIONS
    notificationSettings: {
      quizAssigned:   true,
      courseAssigned: true,
      lessonAssigned: true,
      gameResults:    true,
      dueSoon:        true,
      overdue:        true,
    },
    learningSettings: {
      xpEnabled:           true,
      streaksEnabled:      true,
      certificatesEnabled: false,
    },
    gameSettings: {
      maxPlayersPerGame: 50,
      allowAnonymous:    false,
    },
    createdAt: "2025-05-12",
    updatedAt: "2025-06-01",
  },
  {
    tenantId: "org_finpilot",
    branding: {
      primaryColor: "#8B5CF6",
      logoUrl:      null,
      companyName:  "FinPilot",
    },
    // Starter plan — limited feature access
    enabledFeatures: {
      dashboard:      true,
      games:          true,
      learn:          true,
      analytics:      false,
      aiInsights:     false,
      integrations:   false,
      customBranding: false,
    },
    rolePermissions:      null,
    notificationSettings: { quizAssigned: true, courseAssigned: true, lessonAssigned: true, gameResults: true, dueSoon: true, overdue: true },
    learningSettings:     { xpEnabled: true, streaksEnabled: true, certificatesEnabled: false },
    gameSettings:         { maxPlayersPerGame: 25, allowAnonymous: false },
    createdAt: "2025-06-01",
    updatedAt: "2025-06-10",
  },
  {
    tenantId: "org_hireframe",
    branding: {
      primaryColor: "#FDBF24",
      logoUrl:      null,
      companyName:  "HireFrame",
    },
    // Enterprise — full feature access
    enabledFeatures: {
      dashboard:      true,
      games:          true,
      learn:          true,
      analytics:      true,
      aiInsights:     true,
      integrations:   true,
      customBranding: true,
    },
    rolePermissions:      null,
    notificationSettings: { quizAssigned: true, courseAssigned: true, lessonAssigned: true, gameResults: true, dueSoon: true, overdue: true },
    learningSettings:     { xpEnabled: true, streaksEnabled: true, certificatesEnabled: true },
    gameSettings:         { maxPlayersPerGame: 200, allowAnonymous: false },
    createdAt: "2025-04-20",
    updatedAt: "2025-05-15",
  },
];
