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
- The app builds, boots, authenticates (mock OTP for the PoC), and serves the shell.
- **PoC profile:** runs locally, single-tenant, **mock OTP**; production
  deployment-readiness (real SES email, provisioning, secrets, CORS allowlist, audit
  retention/encryption, residency, `/deployment/<env>`) is **deferred** (decision 0011).

## Confirmed scope (grilled 2026-09-01; reconciled 2026-09-04 to decisions 0006/0008/0010/0011)
- **Vendor method:** snapshot-copy **backend + contract** into the repo (own it),
  cherry-pick upstream fixes manually; the **frontend is fresh** (decision 0006).
- **Warehouse (PoC):** Postgres; production engine decision remains open.
- **Auth:** keep the vendored email+OTP passwordless auth/RBAC/session as-is; **mock
  OTP** for the PoC (real SES delivery deferred, decision 0011).
- **Deployment:** local, single-tenant, PoC-only; production readiness deferred (0011).

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

## Acceptance criteria
- App builds and boots on this repo's stack (npm workspace: `backend`, `contract`, and
  a fresh `frontend`).
- **Login works via email+OTP (mock OTP for the PoC, code `000000`)** and the **fresh**
  shell renders in KnackLabs green, branded 3F, per the approved Claude Design; the
  frontend delivers the app shell + login + placeholder Dashboard only.
- With `WAREHOUSE_PG_*` configured, the Postgres warehouse adapter runs a trivial
  `SELECT` **end-to-end through the app path** (validate → explain → execute) returning
  the expected fixture result. This is falsifiable: the live E2E is demonstrated evidence
  gated behind `WAREHOUSE_E2E=1` (fixture result observed on the host), and the pg-OID →
  numeric mapping is proven by a hermetic unit test with a negative control (decision
  0009). (When `WAREHOUSE_PG_*` is unset the adapter returns an empty result rather than
  failing fast — a known PoC behaviour; fail-fast on missing configuration is a robustness
  item folded into the deferred deployment-readiness work, decision 0011.)
- The 3oilpalm harness machinery is intact (dual-runtime + vendor integrity clean).

## Open items (non-blocking)
- Production warehouse engine (Postgres vs BigQuery) — separate open decision.
- LLM/model + residency — deferred (assistant spec).
- Production deployment readiness — deferred (decision 0011; deferral D-0003).

## Source
Decisions 0003, 0004; `docs/architecture/30-financial-mis-build-plan.md`; Pulse repo `~/Desktop/pulse`.
