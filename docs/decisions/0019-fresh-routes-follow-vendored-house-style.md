---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-10
stories: [mis-selection]
---

# Fresh PoC routes follow the vendored house style: unversioned paths, raw responses, direct module imports

## Context
`mis-selection`'s `selection-resolution` task adds the **first governed-query HTTP routes**
in this app. Its task grill (2026-09-10) correctly observed that these are **fresh code**,
so the constitution applies to them directly — decision **0012** is scoped only to the
vendored backend's *unmet* global-exception-handler and structured-logging gaps, and says
nothing about versioning, response envelopes or module boundaries.

Three constitution rules are in play:

- `constitution/pnp-api-standards.md` §5 — "Always version your APIs. `/api/v1/<resource>`".
- `constitution/pnp-api-standards.md` §7.1 — every endpoint must return the
  `{success, data, error}` envelope.
- `constitution/pnp-coding-standards-modular-monolith.md` §8.1 — "No domain module imports
  another domain module directly. Use **Service Bus** for cross-domain communication";
  shared code only under `/common` or `/service-bus`.

Checked against what was actually built rather than assumed:

- **Every** existing controller is unversioned — `api/auth`, `api/ingest`, `api/chat`,
  `api/pins`, `api/saved`, `api/admin/grants`, `health`. None is `/api/v1/...`.
- None returns a `{success, data, error}` envelope; they return raw bodies, and the
  frontend client (`frontend/src/lib/api.ts`) is written against that.
- The vendored code **already** cross-imports domain modules directly — e.g.
  `backend/src/chat/chat.service.ts` imports `../semantic/semanticLayer`, and
  `selectionExecutor` reaches into `sql/` and `warehouse/`. §8.1 is pervasively violated by
  the snapshot, and there is no `/common` or `/service-bus` structure to import from.

So conforming strictly for fresh routes would make the MIS routes the **only** versioned,
enveloped routes in the app, forcing the frontend client to carry two conventions and
splitting the reporting epic's surface from the vendored one it sits beside.

## Decision
For the PoC, **fresh routes and modules follow the vendored house style**, and this
deviation is recorded rather than left implicit:

- Paths are **unversioned** `api/<resource>` (so: `api/mis/...`), matching every existing
  controller.
- Responses are **raw typed bodies**, not `{success, data, error}` envelopes.
- A new domain module **may import another domain module directly** (`mis` → `mapping`),
  as the vendored code already does; no Service Bus or `/common` extraction is introduced.

What is **NOT** deviated from, and remains required for this fresh code: **named typed
request and response DTOs**, **documented Swagger responses including typed 400/401/403**,
cookie authentication via the existing guards, strict rejection of unknown request fields,
and `constitution/07-exception-handling.md`'s failure model.

Confirmed by the human on 2026-09-10, in the same spirit as decisions 0012 (vendored API)
and 0015 (warehouse snake_case): a deliberate, scoped, PoC-time-bounded deviation, honestly
ledgered instead of silently broken.

## Consequences
- One consistent API surface: the frontend's `lib/api.ts` keeps a single convention, and
  `mis-statement` and `drill-down` inherit the same shape rather than re-litigating it.
- The constitution's versioning, envelope and module-boundary rules are **knowingly** unmet
  for this app's routes. That is a real cost: a future consumer expecting `/api/v1` and an
  envelope will not find them.
- **Revisit trigger** — the production pilot (the 0011 / D-0003 deployment-readiness
  trigger). At that point the API surface is versioned and enveloped **as a whole**, and the
  module seams are extracted to `/common` or a Service Bus, rather than migrating one story's
  routes in isolation.
- This decision does **not** relax DTOs, Swagger error documentation, authentication, or
  unknown-field rejection; the `selection-resolution` grill's other findings stand.
- Scope: fresh routes/modules in the **vendored backend** during the PoC. It does not license
  new deviations elsewhere, and it does not extend 0012.
