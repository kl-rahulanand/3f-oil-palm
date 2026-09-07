---
slug: app-platform-base
title: App platform base
status: confirmed
saved: 2026-09-01T10:31:50+00:00
---

# App platform base

## Why
We're building 3F by adapting Pulse (decisions 0003, 0004). Before any capability
can land, the Pulse app must live in this repo, run on our stack, and wear the
3F identity. This is the foundation every other story depends on.

## Users
The development team (foundation); indirectly every end user, via the running app.

## Behaviour
- **Vendor** Pulse's **backend + contract** (with build config) into this repo as a
  **snapshot copy we own** — no upstream link; adapt freely. The frontend is **built
  fresh**, not vendored (decision 0006); `backend/VENDORED_FROM` records `excluded: frontend/`.
- Set up an **npm workspace** (`backend`, `contract`, and a fresh `frontend`) and keep
  the vendored **email+OTP passwordless auth + RBAC + session + audit** stack as-is.
- Build a **fresh Next.js frontend** (decision 0007) from the approved Claude Design —
  scope is the **app shell + OTP login + placeholder Dashboard only**; MIS, drill-down,
  assistant, and search are later stories and render unavailable/disabled.
- Stand up a **Postgres** warehouse adapter (the Postgres-vs-BigQuery production
  engine decision stays open); flip the SQL validator dialect to `postgresql`.
- **Rebrand** every Pulse product identifier to **3F** (decision 0010; provenance
  history preserved) and reskin to the KnackLabs green design system.
- Keep the API surface **honest**: only **auth, CSRF and an explicit health endpoint**
  are registered. The vendored capability routes (chat, reports, saved queries, pins,
  measures, conversations, admin) stay **absent / 404** until their owning stories bring
  them back with their tables — leaving them mounted would ship endpoints that fail at
  runtime, since the trimmed migration removed what they read.
- The app builds, boots, authenticates (mock OTP for the PoC), and serves the shell.
- **PoC profile:** runs locally, single-tenant, **mock OTP**; production
  deployment-readiness (real SES email, provisioning, secrets, CORS allowlist, audit
  retention/encryption, residency, `/deployment/<env>`) is **deferred** (decision 0011).

## Local runtime contract (the PoC profile, defined)
"Builds and boots" means this exact profile — anything vaguer is not reproducible:
- **Node 20+**; app-DB and warehouse Postgres both up **and the fixture seeded**:
  `docker compose up -d app-db warehouse-db warehouse-seed`, waiting for
  `warehouse-seed` to complete — it is a separate service, and without it the warehouse
  E2E has no fixture to return. App-DB migrations run.
- **Warehouse connection** (all `WAREHOUSE_PG_*` default to empty, so the adapter returns
  nothing until these are set): `WAREHOUSE_DRIVER=postgres`, `WAREHOUSE_PG_HOST=127.0.0.1`,
  `WAREHOUSE_PG_PORT=5433`, `WAREHOUSE_PG_USER=warehouse`,
  `WAREHOUSE_PG_PASSWORD=warehouse-local`, `WAREHOUSE_PG_DATABASE=warehouse`. The expected
  E2E result is `SUM(WarehouseFixture.value) = 42`.
- **How the warehouse E2E runs without a forbidden route:** the allow-list has no query
  endpoint, and it must not gain one. The `validate → explain → execute` proof therefore
  runs through an **in-process integration harness** that exposes **no runtime HTTP
  route**. Crucially it must **resolve `WAREHOUSE` and `SelectionExecutor` from the
  application module's own DI container** — the current test hand-constructs
  `new SelectionExecutor(new SqlBuilder(), new SqlValidator(), new PostgresAdapter())`,
  which passes even if the runtime provider would resolve a different adapter entirely.
  That is an assembly look-alike, not the app path. Testing the adapter alone would skip
  validation and likewise fails the criterion.
- **Backend on `:4000`, frontend (Next.js) on `:3000`.**
- **The whole mock-OTP profile is loopback, and standardises on the literal `127.0.0.1`
  — not the name `localhost`.** Both dev servers bind `127.0.0.1` whenever
  `AUTH_OTP_MOCK=true`; both Postgres ports are published to `127.0.0.1` in
  docker-compose (they currently publish on every interface); and every URL in this
  profile — the API base, the CORS origin, the warehouse host — is written `127.0.0.1`.
  The name matters: `localhost` can resolve to IPv6 `::1` and then fail against an
  IPv4-only listener, which looks like a broken app rather than a resolution mismatch.
  The reason for loopback: Nest currently calls `app.listen(port)` with no host, binding
  every interface; with a publicly-known mock code (`000000`) and a deterministic
  development JWT secret, that puts an admin login on the local network. CORS does not
  prevent this — it is a browser policy, not a network control. Making the mock profile
  LAN-reachable requires its own explicitly scoped security decision; it is not
  sanctioned here.
- **Frontend transport:** the browser calls the backend **directly** at
  `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000` with `credentials: 'include'` — no Next
  proxy for this PoC. Every mutating POST is preceded by the CSRF sequence: `GET
  /api/auth/csrf` to bootstrap the `3f_csrf` cookie, then the **current** cookie value
  re-read and sent as `x-csrf-token` on each POST (the guard rotates it per request).
  Without this, a correctly-rendered login still 403s on both OTP calls.
- **The canonical startup sequence** lives with the frontend task plan's Manual
  Verification section and is the one a reviewer runs: compose up (including
  `warehouse-seed`) → `npm install` → `npm run build` → `npm run db:migrate` to completion
  → backend with the mock/origin/warehouse env above, readiness being the
  `3F backend listening on :4000` line → `npm run dev:frontend`, readiness being Next
  serving `:3000`. Equivalent-looking substitutes are not the contract.
- **`FRONTEND_ORIGIN=http://127.0.0.1:3000` must be set**, and the app-DB variables with
  it: `PGHOST=127.0.0.1`, `PGPORT=5432`, `PGUSER`/`PGPASSWORD`/`PGDATABASE` per
  docker-compose. `PGHOST` also defaults to `localhost` today, so migrations inherit the
  same resolution trap. **`127.0.0.1` is authoritative everywhere in this profile** —
  browser URL, API base, CORS origin and its default, `PGHOST`, warehouse host, the
  Docker port bindings, and both dev-server hosts. A browser served at `127.0.0.1:3000`
  sends that Origin, and a backend configured for `localhost` rejects it. The vendored
  origin default is
  `http://localhost:5173` (Vite's port, inherited from Pulse), so a credentialed request
  from the Next dev server is rejected by CORS under the defaults. The base task that
  constrains the API surface also changes this default to `:3000`, since this repo's
  frontend is Next — but the variable stays the contract.
- **`AUTH_OTP_MOCK=true` and a non-production `NODE_ENV`.** Mock OTP is refused outright
  when `NODE_ENV=production`; the code `000000` alone does not reproduce a login.
- **A seeded, active, provisioned admin principal** (`SEED_USERS`-overridable). Only a
  provisioned user can complete verification: an unknown email receives the deliberately
  uniform acknowledgement (no account enumeration) but can never verify. "Single tenant"
  means no tenant selector and no tenant-isolation feature — it does **not** mean any
  email can sign in.

## Confirmed scope (grilled 2026-09-01; reconciled 2026-09-04 to decisions 0006/0008/0010/0011)
- **Vendor method:** snapshot-copy **backend + contract** into the repo (own it),
  cherry-pick upstream fixes manually; the **frontend is fresh** (decision 0006).
- **Warehouse (PoC):** Postgres; production engine decision remains open.
- **Auth:** keep the vendored email+OTP passwordless auth/RBAC/session as-is; **mock
  OTP** for the PoC (real SES delivery deferred, decision 0011). "As-is" is not
  self-proving — see the observable auth guarantees in the acceptance criteria.
- **API boundary — the sanctioned PoC allow-list**, complete and comparable by test:
  `GET /api/auth/csrf`, `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`,
  `GET /api/auth/me`, `POST /api/auth/logout`, **`POST /api/auth/refresh`**, and
  `GET /health`. Plus the Swagger documentation routes **as a non-production exception
  only**: the UI at `/api/docs` **and its generated document route** (`/api/docs-json`) —
  a UI route alone is not the whole surface, so a route-registration test naming only
  `/api/docs` would either fail against the real app or silently ignore framework-mounted
  routes. Swagger must be **unconditionally absent when `NODE_ENV=production`**: today
  `swaggerEnabled` still honours `ENABLE_SWAGGER=true` in production, which is a hole to
  close, not a toggle to document. Every other vendored route is unregistered until its
  owning story; the route-registration test compares the full method/path list, not a
  sample.
  **Refresh is in the list deliberately:** the vendored session stack pairs a 15-minute
  access cookie with a 7-day refresh cookie, so dropping `refresh` would silently turn
  "keep the session stack as-is" into "log in again every 15 minutes". Its CSRF flow is
  tested like the other mutating POSTs.
  The existing `/api/auth/*` paths stay **unversioned** for the PoC — a deliberate
  deviation from the constitution's versioning requirement, scoped to the vendored
  surface alongside decision 0012. `GET /health` is **fresh** code and would therefore owe
  full compliance, so it carries its own **narrow, explicit exception**: an infrastructure
  liveness probe sits outside the versioned API surface by convention. It returns a typed,
  Swagger-documented `200` carrying **the constitution's standard response envelope** with
  `status: "ok"` in its data — the Swagger standard says "Never return raw objects", so an
  unwrapped body would contradict the same compliance claim this exception is narrowing.
  Liveness only: no dependency health, which is a later concern.
- **Binding design:** the shell is bound to **one** named export —
  `docs/design/3F-Financial-MIS/3F Financial MIS.dc.html` (the interactive export, not
  the older v1 artboards). A generic green page does not satisfy this. That export shows
  an *active* MIS shell with live-looking search and freshness data; the disabled nav,
  disabled search and unavailable freshness pill required here are **intentional,
  enumerated divergences** from it, not fidelity failures. The export contains **no login
  state**, so the login screen is designed here from the `_ds` token system and its
  binding definition is the **Login screen contract** section below — normative here, at
  the requirements gate, rather than authored inside a task plan that can still change.
  The task plan implements that contract; it does not invent it. Shell fidelity is checked by
  the user-facing functional check at **1440×900 desktop** and **390×844 mobile** — not by
  "looks green". At the mobile viewport the left nav collapses to an off-canvas drawer
  behind a keyboard-focusable toggle that reports `aria-expanded`, closes on Escape, and
  returns focus to the toggle.
- **Deployment:** local, single-tenant, PoC-only; production readiness deferred (0011).
- **Vendored API compliance:** the snapshot does not meet two constitution requirements —
  a global exception handler (`07-exception-handling.md`) and structured JSON logging with
  a `correlationId` (`05-logging-and-observability.md` §2.1) — and its typed response DTO
  coverage is uneven. Accepted as a **time-bounded deviation** for the PoC (decision 0012,
  deferral D-0004). "Harness machinery intact" is **not** a claim of full constitution
  compliance. Swagger is already compliant and excluded from the deviation.

## Rules
- Harness-owned files (factory, constitution, forge, harness) stay 3oilpalm's — do
  not overwrite them with Pulse's harness.
- `harness.yaml` is updated so build/verify/test know the vendored app.

## Out of scope (now)
- BigQuery; multi-tenant hosting; any capability feature (statement, ingestion,
  joins, drill-down, assistant) — those are their own stories.
- **Production deployment readiness** (real SES email/non-mock auth, user provisioning/
  roles, secret & config ownership, production CORS allowlist, audit access/retention/
  encryption, data residency, `/deployment/<environment>` structure) — deferred to a
  post-PoC story (decision 0011).

## Login screen contract (normative)
The bound design export carries no login state, so the login screen is specified here.
It is acceptance-critical and user-facing; leaving it to a task plan would let an
acceptance-critical screen stay mutable after this gate.

**Layout.** A split screen built only from `_ds` tokens. Left: a Deep Forest (`#0C3529`)
brand panel carrying the "3F Financial MIS" wordmark and one quiet value line; Mint
(`#6AF1B0`) appears only as a thin on-dark accent, never as text on light. Right: a white
card on the Off-White (`#F4F7F6`) canvas. At the 390×844 mobile viewport the brand panel
stacks above the card.

**Flow.** Two steps. Step 1: an email field (`type=email`, `autocomplete=email`) and an
Emerald (`#1C6B49`) "Send code" button, 44px tall at radius-md. Step 2: a single 6-digit
code field (`inputmode=numeric`, `autocomplete="one-time-code"`, client-validated
`/^\d{6}$/`) with an Emerald "Verify", a "Use a different email" back link, and "Resend
code".

**Copy** (in voice, and load-bearing for the no-enumeration criterion): the acknowledgement
is uniform — "If that email has access, a code is on its way." A failed verification reads
"That code didn't match — check it or resend."

**Behaviour and accessibility.** Real `<label>`s throughout; acknowledgements and errors
announced via `aria-live="polite"`; focus moves to the code field after "Send code" and to
the first error on failure; button `:active` feedback; entry transitions ease-out ≤200ms;
`prefers-reduced-motion` respected.

**Visual check.** The user-facing functional check covers both steps at 1440×900 and
390×844.

## Acceptance criteria
> **Normative:** this section is the binding acceptance set for platform-base, in full.
> `plans/roadmap.json` carries an abbreviated summary for backlog display — it is a
> pointer, never a substitute, and its brevity does not narrow this list. A planner or
> implementer working from the roadmap entry alone is working from an incomplete
> contract and must read this section.

- App builds and boots on this repo's stack (npm workspace: `backend`, `contract`, and
  a fresh `frontend`).
- **Login works via email+OTP** under the local runtime contract above (seeded admin,
  `AUTH_OTP_MOCK=true`, non-production `NODE_ENV`, code `000000`). The retained auth
  guarantees are proven observably, not asserted: verification creates the 3F session
  cookies, `GET /api/auth/me` resolves the principal **and its role**, logout clears the
  session, and an `auth.otp_verified` row is **appended** to the audit log. A screen that
  merely looks logged in does not satisfy this.
- Only **auth, CSRF and health** answer on the API (plus non-production `/api/docs`); the
  unowned capability routes are absent (404), proven by a route-registration test that
  compares the complete method/path allow-list.
- **Session continuity is observable, not merely registered.** Keeping `refresh` in the
  allow-list is pointless if nothing exercises it: after CSRF bootstrap, `POST
  /api/auth/refresh` rotates the session cookies and a subsequent `GET /api/auth/me`
  succeeds; and the frontend, on an access-token 401, retries **once** through refresh
  before falling back to `/login`. Without this the endpoint can stay mounted while
  continuity quietly regresses to a 15-minute session.
- **No account enumeration**, as a release criterion rather than an incidental behaviour:
  OTP requests for active, inactive and unknown emails return an identical status and
  body; verification fails identically for unknown and inactive principals; and neither
  ever yields a usable OTP or session. Covered by a required test, so a later regression
  cannot pass the story.
- The **fresh** shell renders in KnackLabs green, branded 3F, faithful to the bound
  design export: exactly the five nav labels (`Dashboard`, `MIS Reports`, `Ask`,
  `Explore / Saved`, `Admin`) with **only Dashboard active**; the other four and the
  top-bar search are visibly disabled, non-navigable, and **make no feature API calls**;
  the data-freshness pill reads as explicitly unavailable. The frontend delivers the app
  shell + login + placeholder Dashboard only.
- With `WAREHOUSE_PG_*` configured, the Postgres warehouse adapter runs a trivial
  `SELECT` **end-to-end through the app path** (validate → explain → execute) returning
  the expected fixture result. This is falsifiable: the live E2E is demonstrated evidence
  gated behind `WAREHOUSE_E2E=1` (fixture result observed on the host), and the pg-OID →
  numeric mapping is proven by a hermetic unit test with a negative control (decision
  0009). (When `WAREHOUSE_PG_*` is unset the adapter returns an empty result rather than
  failing fast — a known PoC behaviour; fail-fast on missing configuration is a robustness
  item folded into the deferred deployment-readiness work, decision 0011.)
- A **repo-wide quality baseline** covers `backend`, `contract` and `frontend`: ESLint,
  Prettier and TypeScript checking across all three, enforced by root verification via
  `FACTORY_QUALITY_CMD` and `FACTORY_TYPECHECK_CMD`. Root `verify.py` treats quality as
  optional unless it is declared, so an undeclared gate is an absent gate.
- The 3oilpalm harness machinery is intact — meaning, specifically: a **root-level
  `verify.py` run whose `FACTORY_STRUCTURAL_CMD` explicitly invokes both
  `check_dual_runtime.py` and `check_vendor_integrity.py`**. `verify.py` runs only the
  commands the `FACTORY_*` variables declare; it does not itself guarantee either check is
  among them, so "clean" is otherwise unfalsifiable. Separately, the **Pulse snapshot
  carries its own provenance**: `backend/VENDORED_FROM` names the source repository **and
  the exact commit** it was taken from (decision 0008) — asserted on its own, since the
  harness integrity check protects harness assets and says nothing about the snapshot.

## Open items (non-blocking)
- Production warehouse engine (Postgres vs BigQuery) — separate open decision.
- LLM/model + residency — deferred (assistant spec).
- Production deployment readiness — deferred (decision 0011; deferral D-0003).

## Source
Decisions 0003, 0004; `docs/architecture/30-financial-mis-build-plan.md`; Pulse repo `~/Desktop/pulse`.
