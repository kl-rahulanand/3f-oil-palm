---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-07
stories: [platform-base]
---

# Vendored API constitution deviation, time-bounded to the PoC

## Context
The 3F backend is a snapshot copy of Pulse's NestJS app (decision 0008), vendored
rather than written here, and adapted only where the PoC needed it. The
platform-base plan grill (2026-09-07) challenged "vendor as-is" as an insufficient
answer to the constitution: a vendored API is still our API, and the standards
apply to it.

Checked against the constitution rather than assumed, the picture is narrower than
the grill's first pass claimed:

**Already compliant** — Swagger is mounted (`src/main.ts` sets it up at `api/docs`,
which is the path `constitution/pnp-swagger-api-documentation-standards.md` names),
and the auth endpoints carry `@ApiResponse` decorators covering their error statuses
(401, 429) as well as success.

**Genuinely unmet, both load-bearing:**
- `constitution/07-exception-handling.md` requires that all unexpected exceptions
  bubble to a **global exception handler** ("A global handler **MUST** …"). The
  vendored backend registers no `ExceptionFilter` and calls no `useGlobalFilters`.
- `constitution/05-logging-and-observability.md` §2.1 requires **structured JSON
  logs** carrying a `correlationId` that traces a request across logs. The vendored
  backend uses neither pino nor winston and emits no correlation id.

**Partial** — typed response DTO coverage is uneven across the vendored controllers.

Decision 0001 scopes platform-base as a local PoC and decision 0011 already defers
production deployment readiness (real SES, provisioning, secrets, CORS allowlist,
audit retention/encryption, residency) to a post-PoC story. The question is whether
these two API gaps belong with that deferred work or must be closed now.

## Decision
Accept a **time-bounded deviation** from `constitution/05-logging-and-observability.md`
(structured JSON logging with `correlationId`) and `constitution/07-exception-handling.md`
(global exception handler), plus uneven typed-DTO coverage, for the duration of the
platform-base PoC. The deviation is recorded here rather than left implicit in
"vendor as-is", and it does not extend to any code written fresh in this repo — new
frontend and backend code meets the standards as written.

Swagger documentation is **not** part of this deviation: it is already compliant and
stays that way.

## Consequences
- The PoC ships with unstructured logs and NestJS's default exception rendering.
  Debugging a failure in a demo means reading plain logs without correlation ids;
  an unexpected exception surfaces in whatever shape Nest chooses rather than a
  single governed error contract.
- This is acceptable while the app runs locally, single-tenant, for a small known
  audience. It stops being acceptable the moment the app faces real users, because
  both gaps are precisely what makes a production incident diagnosable.
- The work implied when the trigger fires: register a global exception filter that
  meets the §07 MUST/MUST NOT list, adopt a structured JSON logger with
  `correlationId` propagation per §05, and complete typed response DTO coverage
  across the vendored controllers.
- Tracked as a deferral with a revisit trigger tied to the production pilot, the
  same trigger that governs decision 0011's deployment-readiness work — the two
  should be picked up together, since both are "make it operable by someone other
  than us" work.
- Anyone reading the vendored backend and finding no exception filter should read
  this record, not assume an oversight.
