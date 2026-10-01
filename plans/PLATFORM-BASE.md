# Adapt Pulse into the 3F app base

## What changes for you

**In:** vendor Pulse `backend` + `contract` (strip MBS specifics); a Postgres
warehouse adapter + validator dialect; backend boots + OTP auth on Postgres; a
repo-wide lint/format/typecheck baseline; a constrained API surface (auth, CSRF,
health only); a fresh frontend shell + OTP login (KnackLabs green, from the
design); harness build/verify wiring.
**Non-goals:** SAP ingestion, semantic layer/joins, the MIS screens, drill-down,
assistant (later stories); BigQuery; multi-tenant; hardening beyond boot.
The non-goals are enforced, not merely stated: the vendored capability modules
(chat, reports, saved queries, pins, measures, conversations, admin) stay
**unregistered** until their owning stories activate them, and every not-yet-built
navigation target in the shell renders visibly unavailable rather than as a dead
route.

## Why

Before any capability (ingestion, metrics, reporting, assistant) can be built, the
app must exist in this repo, run on our stack, authenticate, talk to a Postgres
warehouse, and wear the 3F identity. We adapt Pulse (decisions 0003/0004/0006):
vendor its backend trust spine, and build a fresh frontend from the approved
Claude Design. This story unblocks the other six.

## Done when

1. App builds + boots on the npm workspace (backend/frontend/contract).
2. Email+OTP login works; RBAC intact; audit is **application-enforced and
  fail-closed** (append-only by construction in the app layer — database-level
  immutability is deferred with the deployment hardening, decision 0011 / D-0003),
  proven by the observable login audit row.
3. Only **auth, CSRF and an explicit health endpoint** are reachable on the API; the
  capability modules whose tables the trimmed migration removed are not registered,
  so an authenticated caller cannot reach a failing or misleading route.
4. Frontend shell renders in KnackLabs green, branded 3F, per the Claude Design:
  exactly the five nav labels (`Dashboard`, `MIS Reports`, `Ask`, `Explore / Saved`,
  `Admin`) with **only Dashboard active**, the other four and the top-bar search
  visibly unavailable, and the data-freshness pill reading as **explicitly
  unavailable** until the ingestion capability owns a real value.
5. A Postgres warehouse adapter runs a trivial query end-to-end via the app path
  (`validate → explain → execute`) returning the expected fixture result — demonstrated
  behind `WAREHOUSE_E2E=1`, with the pg field-OID → numeric mapping proven by a
  hermetic unit test and a negative control (decision 0009).
6. A repo-wide quality gate (ESLint + Prettier + `tsc --noEmit`) covers **all three**
  workspaces and is enforced by `verify.py`, not merely declared.
7. Harness intact: dual-runtime + vendor integrity clean; `verify.py` green.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| VENDOR-BACKEND-CONTRACT | Vendor Pulse backend + contract | Vendor Pulse's backend and contract into the repo (stripping MBS specifics) and set up the npm workspace so backend and contract build and typecheck. |  | `backend/`, `contract/`, `package.json`, `package-lock.json`, `tsconfig.base.json`, `tools/` | `backend/src/sql/sqlValidator.pii.test.ts` | none | no |
| POSTGRES-WAREHOUSE-ADAPTER | Postgres warehouse adapter | Implement a Postgres adapter behind the Warehouse port, add a separate warehouse Postgres, and flip the SQL validator dialect to postgresql so a trivial query runs end-to-end. |  | `backend/src/warehouse/`, `backend/src/sql/`, `backend/src/config.ts`, `backend/src/core/core.module.ts`, `docker-compose.yml`, `contract/test/auth-contract.test.ts` | `backend/src/sql/sqlValidator.pii.test.ts`, `backend/src/warehouse/postgres.adapter.oid.test.ts` | VENDOR-BACKEND-CONTRACT | no |
| BACKEND-BOOT-OTP-AUTH | Backend boots + OTP auth on Postgres | Trim the app-DB migrations to the auth+audit minimum, add a separate app-DB Postgres, run the migrations, and boot the NestJS backend so email+OTP login works (mock OTP) with RBAC and append-only audit intact. |  | `backend/src/`, `backend/drizzle/`, `docker-compose.yml` | `backend/src/db/migrate.trim.test.ts` | VENDOR-BACKEND-CONTRACT, POSTGRES-WAREHOUSE-ADAPTER | no |
| REBRAND-PULSE-TO-3F | Rebrand product identifiers Pulse -> 3F | Rename every Pulse product identifier to 3F across the vendored backend + contract — npm package names (@pulse/* -> @3f/*) and all imports, the auth wire names (cookies pulse_access/refresh/csrf and the JWT issuer/audience), the seed display name, the boot log, and help/glossary product strings — leaving the provenance records that document the Pulse vendor origin unchanged. |  | `backend/`, `contract/`, `package.json`, `package-lock.json`, `docker-compose.yml`, `tsconfig.base.json` | `backend/src/branding.identifiers.test.ts`, `backend/src/sql/sqlValidator.pii.test.ts` | VENDOR-BACKEND-CONTRACT, POSTGRES-WAREHOUSE-ADAPTER, BACKEND-BOOT-OTP-AUTH | no |
| QUALITY-GATE-BASELINE | Repo-wide quality gate baseline (backend + contract lint/format, FACTORY_* commands) | Establish the repo-wide quality gate BEFORE new code is written: ESLint + Prettier config and lint/format:check scripts for backend and contract (which have neither), and the four FACTORY_* commands verify.py reads from .envrc. The frontend joins each command when its workspace lands. |  | `.envrc`, `package.json`, `package-lock.json`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`, `backend/package.json`, `backend/src/atlasTokens.test.ts`, `contract/package.json`, `tools/quality-gate.test.mjs`, `.github/workflows/quality.yml`, `tools/junit-run.mjs`, `tools/junit-run.test.mjs`, `plans/deferrals.md` | `tools/quality-gate.test.mjs` | VENDOR-BACKEND-CONTRACT, REBRAND-PULSE-TO-3F | no |
| API-SURFACE-TRIM | Constrain the API surface, close the local-network exposure, harden the warehouse proof | Register only the sanctioned allow-list (auth, CSRF, health) and unregister the vendored capability modules whose tables the trimmed migration removed; close two inherited defaults that make the shipped backend unsafe or unusable (CORS origin defaulting to Vite's :5173, and app.listen binding every interface while the mock OTP code and dev JWT secret are constants); and replace the hand-constructed warehouse E2E with one that resolves the runtime DI binding. |  | `backend/src/app.module.ts`, `backend/src/health/`, `backend/src/config.ts`, `backend/src/main.ts`, `backend/src/warehouse/`, `docker-compose.yml`, `backend/package.json`, `tools/quality-gate.test.mjs`, `.prettierignore`, `backend/src/app.routes.test.ts`, `backend/src/swagger-production.test.ts`, `backend/src/loopback-profile.test.ts`, `backend/src/health/health.controller.test.ts` | `backend/src/app.routes.test.ts`, `backend/src/swagger-production.test.ts`, `backend/src/loopback-profile.test.ts`, `backend/src/health/health.controller.test.ts` | BACKEND-BOOT-OTP-AUTH, REBRAND-PULSE-TO-3F, QUALITY-GATE-BASELINE | no |
| FRONTEND-FOUNDATION | Fresh frontend foundation (Next.js workspace, _ds theme, quality gate) | Scaffold the fresh Next.js (App Router) frontend/ npm workspace and its toolchain: the _ds-token Tailwind theme, locally vendored Inter via next/font/local, in-tree shadcn/ui primitives, TanStack Query wiring, and the frontend quality gate. No app screens — the reviewable foundation the shell/login builds on. It also widens the repo-wide gate to the frontend, so it must own eslint.config.mjs and tools/quality-gate.test.mjs alongside the root scripts. |  | `frontend/`, `package.json`, `package-lock.json`, `eslint.config.mjs`, `tools/quality-gate.test.mjs` | `frontend/src/theme/tokens.test.ts`, `frontend/src/theme/font.test.ts`, `frontend/src/app/providers.test.tsx` | VENDOR-BACKEND-CONTRACT, REBRAND-PULSE-TO-3F, QUALITY-GATE-BASELINE | no |
| FRONTEND-SHELL-LOGIN | Fresh frontend shell + OTP login | Build the user-facing app shell (Deep Forest left nav + white top bar, branded 3F) and a net-new email+OTP login wired to the backend auth API, faithful to the approved Claude Design, on top of the frontend-foundation scaffold. Server state via TanStack Query over the api.ts transport (credentials:'include' + per-POST 3f_csrf re-read). |  | `frontend/`, `package.json`, `package-lock.json` | `frontend/src/features/auth/login-form.test.tsx`, `frontend/src/lib/api.test.ts`, `frontend/src/lib/api.refresh.test.ts`, `frontend/src/features/auth/session-guard.test.tsx`, `frontend/src/components/shell/app-shell.test.tsx`, `frontend/src/features/auth/login-secondary.test.tsx`, `frontend/src/components/shell/nav-drawer.test.tsx` | API-SURFACE-TRIM, FRONTEND-FOUNDATION | yes |
| BACKEND-OBSERVABILITY | App-wide global exception handler + structured JSON request/error logging | Build the global exception filter (constitution 07, full errorId payload) and structured JSON HTTP request/error logging with a correlationId (constitution 05 §2.1), wired app-wide in main.ts via a shared configureApp seam, per decision 0013 — the observability infrastructure split out of api-surface-trim. Fresh /health and every endpoint become fully compliant; the D-0004/0012 handler+logging deferral is closed (typed-DTO coverage + ad-hoc console migration stay deferred, D-0009). |  | `backend/src/common/`, `backend/src/main.ts`, `backend/src/config.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`, `contract/src/api.ts`, `contract/src/index.ts`, `docs/specs/app-platform-base.md` | `backend/src/common/error-envelope.wiring.test.ts`, `backend/src/common/request-logging.test.ts` | API-SURFACE-TRIM | no |
| HARNESS-WIRING | Harness build/verify wiring | Establish the repo-wide quality gate and declare the verify commands verify.py reads from .envrc, so the factory gates run against the whole app (contract + backend + frontend), keeping dual-runtime and vendor integrity clean. |  | `contract/package.json`, `contract/test/auth-contract.test.ts`, `package.json`, `tools/quality-gate.test.mjs`, `plans/deferrals.md`, `docs/specs/app-platform-base.md` | `tools/quality-gate.test.mjs`, `contract/test/auth-contract.test.ts` | VENDOR-BACKEND-CONTRACT, POSTGRES-WAREHOUSE-ADAPTER, BACKEND-BOOT-OTP-AUTH, REBRAND-PULSE-TO-3F, QUALITY-GATE-BASELINE, API-SURFACE-TRIM, FRONTEND-FOUNDATION, FRONTEND-SHELL-LOGIN, BACKEND-OBSERVABILITY | no |

New moving parts: none named in the old plan

## Risks

- Vendoring drags MBS coupling → T1 strips domains/seeds; T3 smoke test proves boot.
- Trimming migrations too aggressively could break auth/audit → T3 keeps the auth+audit set and boots against it before trimming further.
- Postgres dialect gaps in node-sql-parser → T2 validates a real query, not a stub.
- Frontend design fidelity → shadcn/ui themed by `_ds` tokens; design review on T8.
- Layout mismatch — the vendored code uses npm workspaces (backend/frontend/contract),
  not the Nx layout `constitution/01-monorepo-standard.md` recommends. Deliberate,
  documented deviation (avoids re-tooling the vendored snapshot, decision 0008); T9
  wires the actual workspace scripts into harness.yaml/.envrc.
- Unregistering the capability modules (T6) could disturb auth, which shares the module
  graph → the task keeps a route-registration test asserting auth + CSRF + health answer
  and the removed routes 404, and the T3 login E2E is re-run before the task closes.
- A promise of "no external font request" is easy to state and easy to break → T7 proves
  it with an offline production build, not by inspection.

## Notes

Converted from plans/active/platform-base-adapt-pulse-into-the-3f-app-base.md by forge migrate.

### Technical Approach

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
  "Append-only audit" means **application-enforced, fail-closed inserts**: the app
  never updates or deletes an audit row, and an audit write that cannot complete
  fails the operation rather than passing silently. Database-level immutability
  (triggers or a permission model refusing `UPDATE`/`DELETE`) is **not** built here —
  it is production hardening, deferred with decision 0011 (D-0003).
- **API surface:** the vendored `AppModule` registers Pulse's full capability set,
  but the trimmed migration removed several of those tables — so those routes are
  reachable and broken. Register **only auth, CSRF and an explicit health endpoint**;
  leave chat, reports, saved queries, pins, measures, conversations and admin
  **unregistered** until their owning stories bring them back with their tables. This
  makes the non-goals real rather than aspirational, and delivers the "health" surface
  the plan already promises.
- **Quality gate, front-loaded:** ESLint + Prettier reach `backend/` and `contract/`
  (which have neither today) and the four `FACTORY_*` commands `verify.py` reads are
  declared in `.envrc` **before** the frontend is written, so the gate constrains the
  new code as it lands instead of auditing it afterwards. The gate widens as the
  frontend workspace appears; only the final whole-workspace proof stays in the last
  task.
- **Frontend:** a new **Next.js (App Router) + React + TS** package (`frontend/`,
  decision 0007) using **shadcn/ui on Tailwind**, themed with the KnackLabs `_ds`
  tokens ported from `docs/design/3F-Financial-MIS/_ds`; build the **app shell**
  (top bar, left nav) and **OTP login** from the approved design; consume the
  backend REST API. The `.dc.html` export is a design reference, not a runtime —
  rebuild as React components. **Inter is vendored**: the licensed WOFF2 files live
  under `frontend/` with their OFL licence and load through `next/font/local`, so the
  build and the running app make **no external font request** — the `_ds` export's
  Google Fonts import is a design-reference artifact, not the runtime source.
- **Harness:** point `harness.yaml` build/verify/test/lint at the workspace scripts
  so `verify.py` and the gates run against the vendored app.

### Decisions

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
**quality-gate-baseline task (T5)** — front-loaded, before any new code is written, so
the gate constrains what lands rather than auditing it afterwards — so ALL touched
TypeScript is linted+formatted. The repo-wide gate is wired into `verify.py` via `.envrc`
`FACTORY_STRUCTURAL_CMD` / `FACTORY_TYPECHECK_CMD` / `FACTORY_QUALITY_CMD` /
`FACTORY_TEST_CMD` (exact names read by `verify.py`) in T5, widened to the frontend in T7,
and proven whole-workspace in T9. **`pg` (node-postgres)** — the Postgres driver
behind `PostgresAdapter`: the standard, well-supported client already backing the
vendored Drizzle stack, so reusing it avoids a second Postgres client. **TanStack Query v5**
— server-state layer (me query + OTP/logout mutations) wrapping the `api.ts` transport.
**`next/font/local` (Inter)** — the `_ds` token face served from **licensed WOFF2 files
vendored under `frontend/`** with their OFL licence. `next/font/google` is deliberately
rejected: it needs network at build time and the exact files can drift between builds.
The `_ds` export's Google Fonts `@import` is a design-reference artifact — the runtime
makes no external font request, and an offline production build is the proof.

**Deployment (decision 0011):** platform-base is a **PoC** — local, single-tenant, mock
OTP. Production deployment readiness (real SES email, provisioning, secrets, CORS
allowlist, audit retention/encryption, residency) and the constitution's
`/deployment/<environment>` structure are **deliberately deferred** to a post-PoC story
(deferral D-0003) — not built or scaffolded here.

**Vendored API compliance (decision 0012):** the vendored backend does not meet two
constitution requirements — a global exception handler (`constitution/07-exception-handling.md`)
and structured JSON logging with a `correlationId` (`constitution/05-logging-and-observability.md`
§2.1) — and its typed response DTO coverage is uneven. These are accepted as a
**time-bounded deviation** for the PoC and ledgered as D-0004, revisited on the same
trigger as 0011. The deviation covers the **vendored** code only: anything written fresh
in this repo meets the standards as written. Swagger is **not** part of it — it is already
mounted at `api/docs` with error responses documented, and stays compliant.

### Surface Impact

| Surface | Class | Note |
|---|---|---|
| Runtime behavior | Changed | New app boots (backend API + frontend shell) |
| API | Changed | Surface deliberately **constrained** to auth + CSRF + an explicit health endpoint (T6); the vendored capability modules (chat, reports, saved queries, pins, measures, conversations, admin) stay unregistered until their owning stories, so no route is reachable without its tables |
| Data / schema | Changed | Trimmed auth+audit migrations; a separate Postgres warehouse container |
| CLI / ops | Changed | Repo-wide lint/format/typecheck baseline + the four `FACTORY_*` `.envrc` commands land in T5 (front-loaded), widen to the frontend in T7, and are wired into `harness.yaml` and proven whole-workspace in T9; docker-compose (app DB + warehouse) |
| UI | Changed | Fresh KnackLabs-green Next.js app — T7 builds the `_ds` theme + locally vendored Inter + shadcn/ui primitives (foundation), T8 the shell + OTP login (TanStack Query), with the four inactive nav items, the search box and the freshness pill all visibly unavailable |
| Docs | Unchanged-by-design (planning reconciliation only) | Spec + architecture build-plan were reconciled to the accepted decisions during re-planning (0006/0008/0010/0011) — completed planning governance, NOT a story task output; no task carries `docs/` in its write_scope |
| Tests | Changed | Vendored backend tests carried; add boot/login/query smoke tests + frontend Vitest+RTL hermetic tests and the lint/format/typecheck gate |

### Task Decomposition

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
5. **quality-gate-baseline** (ops, not user-facing) — establish the repo-wide quality
   gate **before** new code is written: add ESLint + Prettier config and
   `lint`/`format:check` scripts to **backend and contract** (they have neither today),
   and declare the commands `verify.py` reads from `.envrc` under these exact names —
   `FACTORY_STRUCTURAL_CMD` (build + workspace/vendor integrity), `FACTORY_TYPECHECK_CMD`
   (contract + backend), `FACTORY_QUALITY_CMD` (ESLint + Prettier across the workspaces
   that exist), `FACTORY_TEST_CMD` (backend tests). The frontend joins each command as
   its workspace lands (T7). depends_on: 1,4. write_scope: `.envrc`, `package.json`,
   `backend/` + `contract/` (lint/format config + scripts only).
6. **api-surface-trim** (backend, not user-facing) — register **only** auth, CSRF and an
   explicit health endpoint in `AppModule`; leave the vendored capability modules (chat,
   reports, saved queries, pins, measures, conversations, admin) unregistered until their
   owning stories restore them with their tables. Removes the reachable-but-broken routes
   the trimmed migration left behind and delivers the health surface the plan promises.
   `GET /health` is fresh code, so it returns a **typed, Swagger-documented** liveness
   response (decision 0012's deviation covers vendored code only). Also fixes two inherited
   defaults: (a) `config.ts` defaults `frontendOrigin` to `http://localhost:5173` (Vite,
   from Pulse), which **CORS-rejects** credentialed calls from the Next dev server on
   `:3000` — default it to `:3000`, keeping `FRONTEND_ORIGIN` as the override; (b)
   `main.ts` calls `app.listen(port)` with **no host**, binding every interface — bind
   `127.0.0.1` whenever `AUTH_OTP_MOCK` is on, so a known mock code (`000000`) and a
   deterministic dev JWT secret are not an admin login for the whole local network.
   **The spec's API allow-list and local runtime contract are normative for this task** —
   `docs/specs/app-platform-base.md` §"Confirmed scope" and §"Local runtime contract" carry
   the exact method/path/environment list (including `POST /api/auth/refresh`, `/api/docs`
   + `/api/docs-json` non-production only, Swagger unconditionally absent when
   `NODE_ENV=production`, and the typed **enveloped** health response). Implement that list,
   do not re-derive it.
   Also **hardens the warehouse E2E proof** (same class of work: shipped backend claims
   that don't match reality): the current test hand-constructs `new SelectionExecutor(new
   SqlBuilder(), new SqlValidator(), new PostgresAdapter())`, so it passes even if the
   runtime provider resolves a different adapter. Resolve `WAREHOUSE` and
   `SelectionExecutor` from the application module's DI container and prove
   `validate → explain → execute` returns `SUM(WarehouseFixture.value) = 42` against the
   `warehouse-seed` fixture.
   Proof: a route-registration test comparing the **complete** method/path allow-list; a
   no-enumeration test (active / inactive / unknown emails return identical status and
   body; unknown and inactive verification fail identically and yield no session); a
   session-continuity test (refresh rotates cookies, a subsequent `/me` succeeds); and the
   DI-resolved warehouse E2E.
   depends_on: 3,4,5. write_scope: `backend/src/app.module.ts`, `backend/src/health/`,
   `backend/src/config.ts`, `backend/src/main.ts`, `backend/src/warehouse/`,
   `docker-compose.yml`, `backend/test/`.
7. **frontend-foundation** (frontend, not user-facing) — scaffold the fresh Next.js
   (App Router) `frontend/` npm workspace and its toolchain: the `_ds`-token Tailwind
   theme, **Inter vendored as local WOFF2 loaded via `next/font/local`** (no external
   font request at build or runtime), in-tree shadcn/ui primitives, the TanStack Query
   provider, and a stack-appropriate quality gate (ESLint `eslint-config-next` + Prettier
   + `tsc --noEmit`) run by the task's `verify_commands` plus a pinned, non-downloading
   Vitest runner; widen the `FACTORY_*` commands from T5 to include the frontend. No app
   screens yet — the reviewable foundation the shell/login builds on. depends_on: 1,4,5
   (consumes `@3f/contract`, decision 0010). write_scope: `frontend/`, `.envrc`,
   `package.json`, `package-lock.json`.
8. **frontend-shell-login** (frontend, **user_facing: true**) — the user-facing app
   shell (Deep Forest left nav + white top bar, branded 3F) + net-new email+OTP login
   wired to the backend auth API, per the Claude Design; server state via TanStack
   Query over an `api.ts` transport (credentials + per-POST `3f_csrf` re-read), retrying
   **once** through `refresh` on an access-token 401. Exactly five nav labels with only
   Dashboard active; the other four, the top-bar search and the data-freshness pill all
   render visibly unavailable.
   **Bound to `docs/specs/app-platform-base.md` §"Login screen contract" (normative)** —
   layout, exact copy, input semantics, focus transfer, `aria-live` regions, ≤200ms
   reduced-motion-aware transitions — plus the mobile drawer closing on Escape and
   restoring focus to its toggle. "Per the Claude Design" is *not* sufficient authority
   here: the approved export contains no login state. Functional check at **1440×900** and
   **390×844**. The API base and CORS origin use the literal `127.0.0.1`, per the spec's
   local runtime contract. depends_on: 6,7. write_scope:
   `frontend/`, `package.json`, `package-lock.json`.
   (Design skills: emil-design-eng, frontend-design.)
9. **harness-wiring** (ops, not user-facing) — point `harness.yaml` at the workspace
   scripts and prove the **whole-workspace** gate: `verify.py` green across structure,
   typecheck, quality (ESLint + Prettier over frontend AND backend AND contract) and
   tests (backend AND frontend). `FACTORY_STRUCTURAL_CMD` must **explicitly invoke both**
   `check_dual_runtime.py` and `check_vendor_integrity.py` — `verify.py` runs only what the
   `FACTORY_*` variables declare, so "harness intact" is otherwise unfalsifiable — and the
   Pulse snapshot's provenance (`backend/VENDORED_FROM` naming repo + commit, decision
   0008) is asserted separately from harness integrity. Also **add or adjust the product CI
   workflow so root verification runs on every push** — a gate that only ever runs when
   someone remembers to run it locally is not enforced. The gate itself was established in T5 and widened
   in T7 — this task wires and proves it, it does not invent it. depends_on: 1,2,3,4,5,6,7,8.
   write_scope: `harness.yaml`, `.envrc`, `.github/` (project workflows only).

Every task traces to the acceptance criteria; no speculative tasks.

### Verify Plan

- **Per task:** build + typecheck + relevant tests green; T2 the app-path query proof
  (`validate → explain → execute` returning the fixture result, demonstrated behind
  `WAREHOUSE_E2E=1`, plus the hermetic pg-OID → numeric mapping test with a negative
  control); T3 login E2E (mock OTP) + the observable append-only login audit row;
  T4 rebrand proof (build/typecheck green under `@3f/*` + a **product-identifier**
  pulse-free scan that deliberately **excludes provenance records** — `VENDORED_FROM`,
  `VENDOR_MANIFEST.json` and commit history retain "Pulse" by design, decision 0010);
  T5 the backend+contract lint/format gate runs and `verify.py` reads all four
  `FACTORY_*` commands; T6 the capability routes are gone and `/health` answers, proven
  by a route-registration test; T7 the frontend quality gate (ESLint + Prettier +
  `tsc --noEmit`) + a themed-primitive test + an **offline** `build:frontend` green
  (no external font fetch); T8 design review + the shell renders in green + OTP login
  E2E (successful verify → shell, logout → login) + the mobile drawer + the user-facing
  functional check; T9 whole-workspace `verify.py` (structure, typecheck, quality
  lint+format, tests for frontend AND backend) + dual-runtime + vendor integrity clean.
- **Story:** the acceptance criteria demonstrated end-to-end — boot, OTP login, green
  shell, a Postgres query through the app, and a clean harness.
