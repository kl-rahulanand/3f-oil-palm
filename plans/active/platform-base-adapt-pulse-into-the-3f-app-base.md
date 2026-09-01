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
No new decisions beyond **0007** (frontend framework = Next.js/React + shadcn/ui +
Tailwind, `_ds`-themed). Governed by 0003 (custom + Pulse), 0004 (governed joins —
framework carried, joins built later), 0006 (frontend fresh / backend-only vendor),
0007. Warehouse = Postgres for the PoC is settled by the `app-platform-base` spec;
the production engine (Postgres vs BigQuery) stays a separate open decision.

## Surface Impact
| Surface | Class | Note |
|---|---|---|
| Runtime behavior | Changed | New app boots (backend API + frontend shell) |
| API | Changed | Pulse REST endpoints vendored (auth, health); MBS-specific routes removed |
| Data / schema | Changed | Trimmed auth+audit migrations; a separate Postgres warehouse container |
| CLI / ops | Changed | `harness.yaml` build/verify wiring; docker-compose (app DB + warehouse) |
| UI | Changed | Fresh KnackLabs-green shell + OTP login (shadcn/ui) |
| Docs | Read-only | Specs/decisions already written; no doc changes in this story |
| Tests | Changed | Vendored backend tests carried; add boot/login/query smoke tests |

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
4. **frontend-shell-login** (frontend, **user_facing: true**) — new Next.js app
   with shadcn/ui + Tailwind themed by `_ds` green tokens; app shell (top bar +
   left nav) + OTP login, per the Claude Design; consumes the backend API.
   depends_on: 3. write_scope: `frontend/`. (Design skills: emil-design-eng,
   frontend-design.)
5. **harness-wiring** (ops, not user-facing) — wire `harness.yaml` build/verify/
   test/lint to the workspace scripts; `verify.py`, dual-runtime, vendor integrity
   clean. depends_on: 1,2,3,4. write_scope: `harness.yaml`, `.github/` (project workflows only).

Every task traces to the acceptance criteria; no speculative tasks.

## Risks
- Vendoring drags MBS coupling → T1 strips domains/seeds; T3 smoke test proves boot.
- Trimming migrations too aggressively could break auth/audit → T3 keeps the auth+audit set and boots against it before trimming further.
- Postgres dialect gaps in node-sql-parser → T2 validates a real query, not a stub.
- Frontend design fidelity → shadcn/ui themed by `_ds` tokens; design review on T4.
- Layout mismatch (Pulse uses backend/frontend/contract, not Nx) → T5 wires the
  actual workspace scripts into harness.yaml.

## Verify Plan
- **Per task:** build + typecheck + relevant tests green; T2 runs a real Postgres
  query; T3 login E2E (mock OTP); T4 design review + the shell renders in green;
  T5 `verify.py` + dual-runtime + vendor integrity clean.
- **Story:** the five acceptance criteria demonstrated end-to-end — boot, OTP
  login, green shell, a Postgres query through the app, and a clean harness.
