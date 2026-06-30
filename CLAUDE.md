# ralli

ralli is a sales readiness platform combining LMS, gamification, coaching, and performance insights.

Core principles:

- Prioritize simplicity, usability, and engagement.
- Build for three personas: reps, managers, and executives.
- Optimize for action, not dashboards.
- Prefer insights over raw metrics.
- ask questions if you do not know, do not assume.

Design:

- Light-mode first.
- Follow the ralli brand.
- Use clean, modern interfaces.
- Avoid excessive emojis and AI-looking copy.
- Favor clarity over decoration.
- Minimize clicks and cognitive load.

Implementation:

- Think before making changes.
- Understand existing architecture first.
- Reuse existing components whenever possible.
- Make the smallest change necessary.
- Preserve existing functionality.
- Avoid unnecessary refactors.
- Avoid duplicate logic.
- Keep components modular and consistent.

Bugs:

- Identify root cause before fixing.
- Explain the issue before making changes.
- Patch instead of rewriting.

Token efficiency:

- Be credit-conscious without sacrificing quality.
- Avoid rewriting large files unless necessary.
- Avoid redesigning unrelated pages.
- Reuse patterns and components.
- Prefer incremental improvements.

Scope:

- Build only what is requested.
- Do not implement future ideas unless explicitly asked.
- MVP solutions are preferred.

Requirements:

- Consider loading states.
- Consider empty states.
- Consider responsiveness.
- Consider accessibility.
- Maintain visual consistency.

Assets:

- Screenshots and provided assets are the source of truth.
- Never guess branding, logos, or behaviors.
- Ask when requirements are unclear.

At the end of each task:

1. Summarize the root cause (if applicable).
2. List files modified.
3. Describe the changes made.
4. Do not change unrelated code.

# Architecture & Security Principles

These principles apply to the entire project unless explicitly overridden.

## Build for Production

Build every feature with production architecture in mind.

Do not build disposable prototypes or temporary implementations that will require major rewrites later.

If backend functionality is unavailable, use mock data only as a temporary data source while preserving the final data model, API boundaries, authentication flow, and database integration points.

---

## Multi-Tenant Architecture

Assume olli is a multi-tenant SaaS platform.

Every company (tenant) has its own isolated data.

Never assume a single-company application.

---

## Authentication

Do not build custom authentication.

Design the application to integrate with a production authentication provider (e.g. Supabase Auth).

Authentication should determine:

* User identity
* Company (tenant)
* Role
* Permissions

---

## Authorization

All application behavior should support Role-Based Access Control (RBAC).

Roles should remain independent.

Current roles include:

* User
* Manager
* Admin

Future roles may be added without restructuring existing code.

Never allow functionality intended for one role to unintentionally affect another role.

---

## Routing

Separate the public website from the authenticated application.

Example structure:

* `/` → Marketing website
* `/login` → Authentication
* Authenticated application routes remain protected after login

Future public pages should be able to be added without restructuring routing.

---

## Data Model

Avoid hardcoded values.

Preserve clear relationships between:

* Companies
* Users
* Teams
* Roles
* Courses
* Lessons
* Quizzes
* Games
* Battle Cards
* Assignments
* Progress
* XP
* Analytics

---

## Security

Assume all application data is private.

Never expose data across companies.

Never expose data outside a user's permissions.

Never store passwords manually.

Authentication providers should handle credential storage.

---

## Feature Development

Before implementing new functionality:

1. Inspect the existing architecture.
2. Reuse existing components where possible.
3. Make the smallest possible change.
4. Avoid unnecessary refactoring.
5. Preserve existing functionality.

Implement production-ready solutions whenever practical.

---

## Scalability

Design every feature so it can support:

* Multiple companies
* Multiple teams
* Thousands of users
* Future subscription plans
* Future permissions
* Future integrations

Avoid architectural decisions that would require rebuilding these systems later.

---

## Development Philosophy

Favor:

* Reusable components
* Modular architecture
* Clear separation of concerns
* Predictable routing
* Centralized configuration
* Minimal code duplication

Every implementation should be easy to extend, easy to maintain, and consistent with the existing architecture.
Architectural Changes

Before introducing architectural changes, first inspect the existing implementation.

Determine whether the requested feature can be implemented using the current architecture.

If architectural changes are necessary to support a production-ready implementation:

Identify only the components that require modification.
Preserve existing functionality wherever possible.
Maintain backward compatibility unless explicitly instructed otherwise.
Avoid unnecessary refactoring.
Do not rewrite working code solely for preference or style.

When a structural change is required, modify only the minimum set of components needed while maintaining the integrity of the existing application.

Favor incremental improvements over large rewrites.