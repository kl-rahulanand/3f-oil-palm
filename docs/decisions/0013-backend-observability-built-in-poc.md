---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-08
stories: [platform-base]
supersedes: []
---

# Build the global exception handler and structured logging in the PoC (supersedes that part of 0012/D-0004)

## Context
Decision 0012 accepted a time-bounded deviation for the vendored backend: it lacks a
global exception handler (`constitution/07-exception-handling.md`) and structured JSON
logging with a `correlationId` (`constitution/05-logging-and-observability.md` §2.1),
plus uneven typed-DTO coverage — all deferred to a production pilot and ledgered as
deferral D-0004. Decision 0012 also drew a line: the deviation "does not extend to any
code written fresh in this repo."

`api-surface-trim` adds a fresh `/health` endpoint. Being fresh code, it owes full
constitution compliance — but a global exception handler and structured request logging
are **app-wide infrastructure**, not per-endpoint concerns. You cannot make a single
fresh endpoint compliant with §07/§05 without the app-wide machinery existing. The
0012/D-0004 deferral therefore created an impossible requirement for any fresh endpoint.

Two ways out were put to the client (2026-09-08): narrowly amend 0012 so the
cross-cutting deferral applies app-wide including fresh endpoints, OR build the handler
and logging now. The client chose to **build them now**.

## Decision
The **global exception handler** (§07) and **structured JSON HTTP request/error logging
with a `correlationId`** (§05 §2.1) are built in platform-base, in the `api-surface-trim`
task, and are no longer deferred. This supersedes the handler-and-logging portion of
decision 0012's deviation and closes that part of deferral D-0004.

**Scope of the logging claim:** this covers the app-wide HTTP request/error logging path
(the request logger + the global exception filter). It does **not** claim to have migrated
every pre-existing ad-hoc `console` emitter in the vendored reconciliation, migration and
pin-refresh code to the shared logger — that migration remains deferred (D-0009), so a
reader must not read "logging built" as "no `console.*` remains anywhere."

**Still deferred** (now deferral **D-0009**, same production-pilot trigger): complete typed
response-DTO coverage across the vendored controllers, and the ad-hoc-emitter migration
above. Fresh code — `/health` and anything written from here — meets full compliance, now
that the app-wide handler and request logging exist.

## Consequences
- `api-surface-trim` grows: beyond the API-surface trim and security hardening it now
  implements the global exception filter and the structured logger, wired app-wide in
  `main.ts`. Its review budget is raised accordingly.
- The PoC gains real operability: an unexpected exception surfaces in one governed error
  shape, and every request is traceable by `correlationId` — precisely what makes a demo
  or a later incident diagnosable.
- D-0004 is updated to drop the handler+logging items and keep only the typed-DTO
  coverage; `docs/specs/app-platform-base.md` and the active plan's vendored-API-compliance
  note are reconciled to say the handler and logging are built, not deferred.
- The remaining DTO-coverage debt is small and bounded, and still travels on the same
  production-pilot trigger as the rest of D-0004 / decision 0011.
