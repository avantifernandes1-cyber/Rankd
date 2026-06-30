/**
 * Ralli Data Schema — Production Database Contracts
 *
 * These types define the canonical data model for Ralli's multi-tenant architecture.
 * Production implementation: Supabase (PostgreSQL) with Row Level Security (RLS).
 *
 * Naming conventions:
 *   - All tables use snake_case in Supabase (tenant_id, created_at, etc.)
 *   - JS layer uses camelCase (tenantId, createdAt, etc.)
 *   - tenantId is required on all tenant-scoped entities
 *   - RLS policies enforce tenant isolation at the database level
 *
 * Each typedef maps to a Supabase table. Comments show the SQL column name.
 */

// ── ROLES ────────────────────────────────────────────────────────────────────
// Canonical role identifiers.
//
// Internal app strings (used in rankd-app.jsx runtime):
//   "user"        → Rep / learner
//   "orgAdmin"    → Manager / tenant admin  (internal key; canonical: "manager" / "admin")
//   "superadmin"  → Platform admin alias    (internal; canonical: "ralli_admin")
//   "ralli_admin" → Canonical platform admin role
//
// Production: roles are stored in the users table and enforced by Supabase RLS policies.

export const ROLES = {
  USER:        "user",
  ORG_ADMIN:   "orgAdmin",    // Manager / Admin (internal key)
  RALLI_ADMIN: "ralli_admin", // Internal Ralli platform administrator
  SUPERADMIN:  "superadmin",  // Backward-compat alias → treated as ralli_admin
};

// ── PLANS ────────────────────────────────────────────────────────────────────
// Canonical subscription plan keys. Raw plan strings (from billing) are normalized
// via normalizePlan() in src/lib/permissions.js.

export const RALLI_PLANS = {
  DEMO:       "demo",
  STARTER:    "Starter",
  PRO:        "Growth",       // "Growth" = pro tier (maps to "pro" in FEATURE_CONFIG)
  ENTERPRISE: "Enterprise",
};

// ── TENANT STATUS ────────────────────────────────────────────────────────────
// Lifecycle: invited → pending_setup → onboarding → active → suspended | canceled
export const TENANT_STATUS = {
  INVITED:       "invited",       // provisioned, invite email sent (mocked)
  PENDING_SETUP: "pending_setup", // admin clicked invite, account not yet created
  ONBOARDING:    "onboarding",    // admin created account, configuring workspace
  ACTIVE:        "active",        // fully live
  SUSPENDED:     "suspended",     // access blocked (billing or policy)
  CANCELED:      "canceled",      // terminal — data retained, access removed
  PENDING:       "pending",       // legacy alias used in seed data
};

// ── USER STATUS ──────────────────────────────────────────────────────────────
export const USER_STATUS = {
  ACTIVE:    "active",
  INVITED:   "invited",
  SUSPENDED: "suspended",
};

// ── TYPE DEFINITIONS ─────────────────────────────────────────────────────────
// JSDoc typedefs map directly to Supabase table columns.
// Production: generate these from Supabase type generation (supabase gen types typescript).

/**
 * @typedef {Object} Tenant
 * Supabase table: tenants
 *
 * @property {string}  id          - UUID primary key       (id)
 * @property {string}  name        - Display name           (name)
 * @property {string}  slug        - URL-safe identifier    (slug) UNIQUE
 * @property {string|null} logo    - Logo URL               (logo_url)
 * @property {string|null} domain  - Custom domain          (domain)
 * @property {string}  plan        - Subscription plan      (plan)
 * @property {string}  status      - active|pending|suspended (status)
 * @property {number}  seatLimit   - Max user seats         (seat_limit)
 * @property {string}  adminEmail  - Primary admin email    (admin_email)
 * @property {string}  createdAt   - ISO date               (created_at)
 * @property {string}  updatedAt   - ISO date               (updated_at)
 */

/**
 * @typedef {Object} User
 * Supabase table: users (joined with auth.users on id)
 *
 * @property {string}  id          - UUID (= Supabase Auth user.id) (id)
 * @property {string|null} tenantId - FK → Tenant.id; null for ralli_admin (tenant_id)
 * @property {string}  email       -                                (email)
 * @property {string}  name        - Display name                   (name)
 * @property {string}  initials    - 2-letter initials              (initials)
 * @property {string}  role        - user|orgAdmin|ralli_admin      (role)
 * @property {string}  status      - active|invited|suspended       (status)
 * @property {string|null} title   - Job title                      (title)
 * @property {string}  color       - Avatar accent color (hex)      (color)
 * @property {string}  createdAt   -                                (created_at)
 * @property {string}  updatedAt   -                                (updated_at)
 *
 * App-layer fields (not in users table — sourced from related tables at query time):
 * @property {number|null} xp          - Current XP total → xp_totals
 * @property {number|null} xpNext      - XP needed for next level
 * @property {number|null} level       - Computed from XP
 * @property {number|null} streak      - Current streak → streaks
 * @property {number|null} rank        - Leaderboard rank
 * @property {number|null} score       - Readiness score → readiness_scores
 * @property {string|null} weeklyChange - Score delta (display string)
 * @property {number|null} pendingTraining - Count of pending assignments
 *
 * Demo-only fields (never stored in production):
 * @property {string}  password    - Demo login only
 * @property {string}  orgId       - Alias for tenantId (app compat)
 */

/**
 * @typedef {Object} TenantSettings
 * Supabase table: tenant_settings (1:1 with tenants)
 *
 * @property {string}  tenantId              - FK → Tenant.id        (tenant_id) PK
 * @property {Object}  branding              -                        (branding jsonb)
 * @property {string}  branding.primaryColor - Hex color
 * @property {string|null} branding.logoUrl  - Logo URL
 * @property {string}  branding.companyName  - Display name
 * @property {Object}  enabledFeatures       - { [key]: boolean }    (enabled_features jsonb)
 * @property {Object|null} rolePermissions   - Overrides DEFAULT_ROLE_PERMISSIONS (role_permissions jsonb)
 * @property {Object}  notificationSettings  -                        (notification_settings jsonb)
 * @property {Object}  learningSettings      -                        (learning_settings jsonb)
 * @property {Object}  gameSettings          -                        (game_settings jsonb)
 * @property {string}  createdAt             -                        (created_at)
 * @property {string}  updatedAt             -                        (updated_at)
 */

/**
 * Future tenant-scoped entities — all require tenantId for RLS isolation.
 *
 * @typedef {{ id: string, tenantId: string, name: string, managerId: string }} Team
 * @typedef {{ id: string, tenantId: string, title: string, description: string }} Course
 * @typedef {{ id: string, tenantId: string, courseId: string, title: string }} Lesson
 * @typedef {{ id: string, tenantId: string, title: string, questions: Array }} Quiz
 * @typedef {{ id: string, tenantId: string, categoryId: string, title: string }} BattleCard
 * @typedef {{ id: string, tenantId: string, quizId: string, pin: string, status: string }} Game
 * @typedef {{ id: string, tenantId: string, contentType: string, contentId: string, assignedTo: Object }} Assignment
 * @typedef {{ id: string, tenantId: string, gameId: string, userId: string, score: number }} GameResult
 * @typedef {{ id: string, tenantId: string, userId: string, amount: number, source: string }} XpEvent
 */
