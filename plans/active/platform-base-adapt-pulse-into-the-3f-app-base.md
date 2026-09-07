---
issue: platform-base
title: Adapt Pulse into the 3F app base
status: approved
saved: 2026-09-01T11:17:14+00:00
story: platform-base
decisions_reviewed:
  - 0001-poc-engagement-scope
  - 0002-phase1-financial-mis
  - 0003-mis-presentation-tool
  - 0004-pulse-governed-joins
  - 0005-client-signoff
  - 0006-frontend-fresh-backend-vendor
  - 0007-frontend-framework-nextjs
  - 0008-pulse-vendored-snapshot
  - 0009-required-tests-real-name-and-tsproject
  - 0010-rebrand-pulse-to-3f
  - 0011-deployment-readiness-poc-scope
---

# Plan — platform-base: Adapt Pulse into the 3F app base

## Problem
Before any capability (ingestion, metrics, reporting, assistant) can be built, the
app must exist in this repo, run on our stack, authenticate, talk to a Postgres
warehouse, and wear the 3F identity. We adapt Pulse (decisions 0003/0004/0006):
vendor its backend trust spine, and build a fresh frontend from the approved
Claude Design. This story unblocks the other six.

## Scope / Non-goals
**In:** vendor Pulse `backend` + `contract` (strip MBS specifics); a Postgres
warehouse adapter + validator dialect; backend boots + OTP auth on Postgres; a
fresh frontend shell + OTP login (KnackLabs green, from the design); harness
build/verify wiring.
**Non-goals:** SAP ingestion, semantic layer/joins, the MIS screens, drill-down,
assistant (later stories); BigQuery; multi-tenant; hardening beyond boot.

## Acceptance Criteria
- App builds + boots on the npm workspace (backend/frontend/contract).
- Email+OTP login works; RBAC + append-only audit intact.
- Frontend shell renders in KnackLabs green, branded 3F, per the Claude Design.
- A Postgres warehouse adapter runs a trivial query end-to-end via the app.
- Harness intact: dual-runtime + vendor integrity clean; `verify.py` green.

## Technical Approach
- **Vendor** `backend/` + `contract/` from the Pulse repo as owned code (snapshot,
  decision 0006). Strip MBS-specific domains (`operations`, `leadActivity`) and MBS
  seeds/grants; keep the framework: auth, RBAC, session, audit, semantic-layer
  framework, SQL builder/validator, warehouse port. npm workspace at repo root
  (`workspaces: [contract, backend, frontend]`).
- **Warehouse:** a **separate Postgres container** (docker-compose), distinct from
  the app DB (grill decision). Implement `PostgresAdapter implements Warehouse`
  using `pg`; select it via `warehouseDriver=postgres`; flip the `sqlValidator`
  node-sql-parser dialect to `postgresql`.
- **Migrations:** **trim Pulse's Drizzle migrations to the auth + audit minimum**
  needed for first boot (grill decision); the rest come back with the stories that
  need them.
- **Auth:** keep Pulse email+OTP (mock OTP until SES), JWT cookies, RBAC, audit — as-is.
- **Frontend:** a new **Next.js (App Router) + React + TS** package (`frontend/`,
  decision 0007) using **shadcn/ui on Tailwind**, themed with the KnackLabs `_ds`
  tokens ported from `docs/design/3F-Financial-MIS/_ds`; build the **app shell**
  (top bar, left nav) and **OTP login** from the approved design; consume the
  backend REST API. The `.dc.html` export is a design reference, not a runtime —
  rebuild as React components.
- **Harness:** point `harness.yaml` build/verify/test/lint at the workspace scripts
  so `verify.py` and the gates run against the vendored app.

## Decisions
Reviewed at planning time: 0003 (custom + Pulse), 0004 (governed joins — framework
carried, joins built later), 0006 (frontend fresh / backend-only vendor), 0007
(frontend framework = Next.js/React + shadcn/ui + Tailwind, `_ds`-themed). Warehouse
= Postgres for the PoC is settled by the `app-platform-base` spec; the production
engine (Postgres vs BigQuery) stays a separate open decision.

**Accepted during implementation** (they govern their respective tasks and supersede
the original "no new decisions" scope note): **0008** (Pulse `backend`+`contract`
vendored as a pinned snapshot — provenance preserved), **0009** (required_tests must
name a real leaf test and pin the runner project, closing a false-green gate — applies
to every task's proof), and **0010** (rebrand every Pulse product identifier → 3F;
provenance history preserved). **0011** (deployment readiness deferred; PoC acceptance
is local + mock-OTP). The frontend tasks consume `@3f/contract` and the 3F auth wire
names per 0010, and prove themselves per 0009.

**Frontend tooling (conduct §9, confirmed with the client 2026-09-04 — best-fit, not
defaults):** **npm workspaces** (not Nx) — the vendored backend is already one; adding
`frontend` avoids re-tooling vendored code (`constitution/01-monorepo-standard.md`
deviation, decision 0008). **Vitest + React Testing Library + jsdom** — ESM/TS-native,
fast, minimal Next config (over Jest). **ESLint + Prettier +
`tsc --noEmit`** — the lint + format + type-check gate. The frontend uses
`eslint-config-next`, run by each frontend task's `verify_commands` (stage-done
enforcement); **backend + contract** get a base ESLint + Prettier config in the
harness-wiring task (they have none today) so ALL touched TypeScript is linted+formatted.
The repo-wide gate is wired into `verify.py` via `.envrc` `FACTORY_STRUCTURAL_CMD` /
`FACTORY_TYPECHECK_CMD` / `FACTORY_QUALITY_CMD` / `FACTORY_TEST_CMD` (exact names read by
`verify.py`) in the harness-wiring task. **`pg` (node-postgres)** — the Postgres driver
behind `PostgresAdapter`: the standard, well-supported client already backing the
vendored Drizzle stack, so reusing it avoids a second Postgres client. **TanStack Query v5**
— server-state layer (me query + OTP/logout mutations) wrapping the `api.ts` transport.
**next/font (Inter)** — self-hosted `_ds` token face, no external fetch.

**Deployment (decision 0011):** platform-base is a **PoC** — local, single-tenant, mock
OTP. Production deployment readiness (real SES email, provisioning, secrets, CORS
allowlist, audit retention/encryption, residency) and the constitution's
`/deployment/<environment>` structure are **deliberately deferred** to a post-PoC story
(deferral D-0003) — not built or scaffolded here.

## Surface Impact
| Surface | Class | Note |
|---|---|---|
| Runtime behavior | Changed | New app boots (backend API + frontend shell) |
| API | Changed | Pulse REST endpoints vendored (auth, health); MBS-specific routes removed |
| Data / schema | Changed | Trimmed auth+audit migrations; a separate Postgres warehouse container |
| CLI / ops | Changed | `harness.yaml` + `.envrc` build/verify wiring incl. the frontend lint/format/typecheck gate (T7); docker-compose (app DB + warehouse) |
| UI | Changed | Fresh KnackLabs-green Next.js app — T5 builds the `_ds` theme + shadcn/ui primitives (foundation), T6 the shell + OTP login (TanStack Query) |
| Docs | Unchanged-by-design (planning reconciliation only) | Spec + architecture build-plan were reconciled to the accepted decisions during re-planning (0006/0008/0010/0011) — completed planning governance, NOT a story task output; no task carries `docs/` in its write_scope |
| Tests | Changed | Vendored backend tests carried; add boot/login/query smoke tests + frontend Vitest+RTL hermetic tests and the lint/format/typecheck gate |

## Task Decomposition
1. **vendor-backend-contract** (backend, not user-facing) — snapshot `backend/` +
   `contract/`; strip MBS domains/seeds; set up the npm workspace; `npm install`;
   backend + contract build and typecheck. write_scope: `backend/`, `contract/`,
   `package.json`, `package-lock.json`, `tsconfig.base.json`.
2. **postgres-warehouse-adapter** (backend, not user-facing) — `PostgresAdapter`
   over the Warehouse port; validator dialect `postgresql`; warehouse config +
   a separate warehouse Postgres in docker-compose; a trivial query runs E2E.
   depends_on: 1. write_scope: `backend/src/warehouse/`, `backend/src/sql/`,
   `backend/src/config.ts`, `backend/src/core/core.module.ts`, `docker-compose.yml`.
3. **backend-boot-otp-auth** (backend, not user-facing) — trim migrations to
   auth+audit; app-DB migrations run; backend boots; email+OTP login works;
   RBAC/audit intact; boot/login smoke tests. depends_on: 1,2. write_scope:
   `backend/src/`, `backend/drizzle/`, `docker-compose.yml`.
4. **rebrand-pulse-to-3f** (backend, not user-facing) — rename every Pulse product
   identifier to 3F across the vendored backend + contract (packages `@3f/contract`/
   `@3f/backend`, auth wire names `3f_*` + JWT `3f-api`/`3f`, seed/strings), behaviour
   preserving; provenance history preserved (decision 0010). depends_on: 1,2,3. write_scope:
   `backend/`, `contract/`, `package.json`, `package-lock.json`, `docker-compose.yml`.
5. **frontend-foundation** (frontend, not user-facing) — scaffold the fresh Next.js
   (App Router) `frontend/` npm workspace and its toolchain: the `_ds`-token Tailwind
   theme, in-tree shadcn/ui primitives, and a stack-appropriate quality gate (ESLint
   `eslint-config-next` + Prettier + `tsc --noEmit`) run by the task's `verify_commands`
   plus a pinned, non-downloading Vitest runner. No app screens yet — the reviewable
   foundation the shell/login builds on. depends_on: 1,4 (consumes `@3f/contract`,
   decision 0010). write_scope: `frontend/`, `package.json`, `package-lock.json`.
6. **frontend-shell-login** (frontend, **user_facing: true**) — the user-facing app
   shell (Deep Forest left nav + white top bar, branded 3F) + net-new email+OTP login
   wired to the backend auth API, per the Claude Design; server state via TanStack
   Query over an `api.ts` transport (credentials + per-POST `3f_csrf` re-read).
   depends_on: 5. write_scope: `frontend/`, `package.json`, `package-lock.json`.
   (Design skills: emil-design-eng, frontend-design.)
7. **harness-wiring** (ops, not user-facing) — establish the **repo-wide** quality gate
   and declare the verify commands `verify.py` reads from `.envrc` (exact names):
   `FACTORY_STRUCTURAL_CMD` (build + workspace/vendor integrity), `FACTORY_TYPECHECK_CMD`
   (contract + backend + frontend), `FACTORY_QUALITY_CMD` (ESLint + Prettier across **all**
   workspaces — frontend, backend, contract), `FACTORY_TEST_CMD` (backend AND frontend
   tests). Add ESLint + Prettier config + `lint`/`format:check` scripts to **backend and
   contract** (they have none today) so all touched TypeScript is linted+formatted, not
   just the frontend; run vendor integrity in the structural command or as a distinct
   proof; dual-runtime clean. depends_on: 1,2,3,4,5,6. write_scope: `harness.yaml`,
   `.envrc`, `package.json`, `backend/` + `contract/` (lint/format config + scripts only),
   `.github/` (project workflows only).

Every task traces to the acceptance criteria; no speculative tasks.

## Risks
- Vendoring drags MBS coupling → T1 strips domains/seeds; T3 smoke test proves boot.
- Trimming migrations too aggressively could break auth/audit → T3 keeps the auth+audit set and boots against it before trimming further.
- Postgres dialect gaps in node-sql-parser → T2 validates a real query, not a stub.
- Frontend design fidelity → shadcn/ui themed by `_ds` tokens; design review on T6.
- Layout mismatch — the vendored code uses npm workspaces (backend/frontend/contract),
  not the Nx layout `constitution/01-monorepo-standard.md` recommends. Deliberate,
  documented deviation (avoids re-tooling the vendored snapshot, decision 0008); T7
  wires the actual workspace scripts into harness.yaml/.envrc.

## Verify Plan
- **Per task:** build + typecheck + relevant tests green; T2 runs a real Postgres
  query; T3 login E2E (mock OTP); T4 rebrand proof (source pulse-free scan + build/
  typecheck green under `@3f/*`); T5 the frontend quality gate (ESLint + Prettier +
  `tsc --noEmit`) + a themed-primitive test + `build:frontend` green; T6 design review +
  the shell renders in green + OTP login E2E + the user-facing functional check; T7
  whole-workspace `verify.py` (structure, typecheck, quality lint+format, tests for
  frontend AND backend) + dual-runtime + vendor integrity clean.
- **Story:** the acceptance criteria demonstrated end-to-end — boot, OTP login, green
  shell, a Postgres query through the app, and a clean harness.
