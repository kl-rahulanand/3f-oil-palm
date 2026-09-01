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
- **Vendor** Pulse's app (backend + frontend + contract + build config) into this
  repo as a **snapshot copy we own** — no upstream link; adapt freely.
- Keep Pulse's **backend / frontend / contract** workspace layout and its
  **email+OTP passwordless auth + RBAC + session + audit** stack as-is.
- Stand up a **Postgres** warehouse adapter (the Postgres-vs-BigQuery production
  engine decision stays open); flip the SQL validator dialect to `postgresql`.
- **Reskin** to the KnackLabs green design system and rebrand from "Pulse" to the
  3F app; app runs **deploy-per-client** (single-tenant, no multi-tenant work).
- The app builds, boots, authenticates, and serves an empty/placeholder home.

## Confirmed scope (grilled 2026-09-01)
- **Vendor method:** snapshot-copy into the repo (own it), cherry-pick upstream fixes manually.
- **Warehouse (PoC):** Postgres; production engine decision remains open.
- **Auth:** keep Pulse's email+OTP passwordless auth/RBAC/session as-is.

## Rules
- Harness-owned files (factory, constitution, forge, harness) stay 3oilpalm's — do
  not overwrite them with Pulse's harness.
- `harness.yaml` is updated so build/verify/test know the vendored app.

## Out of scope (now)
- BigQuery; multi-tenant hosting; any capability feature (statement, ingestion,
  joins, drill-down, assistant) — those are their own stories.

## Acceptance criteria
- App builds and boots on this repo's stack (npm workspace: backend/frontend/contract).
- Login works (Pulse email+OTP) and the shell renders in KnackLabs green, branded 3F.
- A Postgres warehouse adapter connects and the existing pipeline runs a trivial
  query end-to-end against Postgres.
- The 3oilpalm harness machinery is intact (dual-runtime + vendor integrity clean).

## Open items (non-blocking)
- Production warehouse engine (Postgres vs BigQuery) — separate open decision.
- LLM/model + residency — deferred (assistant spec).

## Source
Decisions 0003, 0004; `docs/architecture/30-financial-mis-build-plan.md`; Pulse repo `~/Desktop/pulse`.
