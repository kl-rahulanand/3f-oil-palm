# Task plan — backend-observability

## Context
Add the app-wide global exception filter (constitution 07) and structured JSON request/error
logging with `correlationId` (constitution 05 §2.1–2.2) mandated by decision 0013, closing the
handler+logging portion of D-0004. Nothing observability-related exists yet — build it under
`backend/src/common/` (constitution 03 puts cross-cutting concerns there, not a new top-level dir).
Not user-facing. PoC scope per decision 0013 and the client's grill decision: build the handler +
logging + correlationId and migrate `main.ts`'s 3 `console.*` calls (D-0010); DEFER error metrics
(**D-0018**), non-Local centralized log transport (**D-0019**), and decorated Swagger error DTOs
(**D-0020**) to the production pilot.

## Write scope
- `backend/src/common/` — new: exception filter, request-logging middleware, structured logger,
  and the two hermetic tests.
- `backend/src/main.ts` — wire the filter + middleware in `configureApp`; migrate the 3 `console.*`
  emitters (bootstrap/listen/fatal) onto the structured logger (D-0010).
- `backend/src/config.ts` — add `environment` + `serviceName` to `Config`/`loadConfig()`.
- `backend/package.json` + `tools/quality-gate.test.mjs` — register the two new tests in the
  backend hermetic allow-list (both lists are explicit; the quality-gate guard fails otherwise).
- `contract/src/api.ts` (+ `contract/src/index.ts` barrel) — shared error envelope + correlation
  types.
- `docs/specs/app-platform-base.md` — fix the observability provenance (~line 154): built in
  `backend-observability`, not `api-surface-trim` (decision 0013 mandated this reconciliation).

## Decisions (tooling — conduct §9: no silent defaults)
- **UUID**: Node's built-in `crypto.randomUUID()` for `errorId` and the generated `correlationId`
  — no new dependency. Validate an inbound `x-correlation-id` as a UUID before trusting it.
- **Logger**: a tiny in-repo structured JSON logger (one record = one `JSON.stringify` line) — no
  logging dependency for this PoC slice (const 05 §2.4 requires a shared structured logger, not a
  specific library). Console/stdout transport is correct for the Local PoC (const 06); the logger
  exposes a transport **seam** so a centralized transport can be added later (non-Local transport is
  D-0019). Injectable so tests capture records (Nest runs with `logger:false` in tests).
- **Environment enum**: map `process.env.ENVIRONMENT || config.nodeEnv` to the const-05 enum
  (`Local|Development|QA|UAT|Staging|Production`) with a defined fallback for unknown values;
  `serviceName` from `process.env.SERVICE_NAME` defaulting to `3f-backend`.

## Workflow
Delegate to Codex via `./forge delegate backend-observability`; keep uncommitted through the local
review loop; run `verify.py`; run the ONE branch review; defer non-blocking P2s; commit once;
`stage done`; `pr-ready`. Not user-facing → no functional check.

## Approach
1. **Shared types (contract/src/api.ts)** — align with the health `{ success, data, error }`
   envelope and `ResponseClass`: `ErrorPayload` (`errorId, code, type, message, userMessage,
   details, statusCode, correlationId, requestId, environment, timestampUtc`), `ErrorEnvelope`
   (`{ success:false; data:null; error:ErrorPayload }`), `Environment` union. Export via the `api`
   barrel. Backend consumes them (the shipped frontend need not, here).
2. **Config (backend/src/config.ts)** — add `environment: Environment` (mapped, not raw `nodeEnv`)
   and `serviceName: string`.
3. **Structured logger (common/…)** — `emit(level, message, fields)` writes ONE JSON line with
   `timestampUtc, level, message` (STATIC message), `context` (dynamic PII-masked KVs),
   `environment, serviceName, module, correlationId, accountId(null-able), requestId`. A transport
   seam (console for Local). Injectable/capturable for tests.
4. **Request-logging middleware (common/…)** — registered in `configureApp`. At ingress: read
   `x-correlation-id` (use iff a valid UUID) else `crypto.randomUUID()`; `x-request-id` else `null`;
   attach `req.correlationId`/`req.requestId` and echo `correlationId` on the response. Emit the
   **request** record on response **finish** (so `accountId` reflects `req.authUser` after AuthGuard).
   The error record is emitted by the filter, keeping request and error records distinct.
5. **Global exception filter (common/…, `@Catch()`)** — build the const-07 `ErrorEnvelope`:
   `errorId=randomUUID()` (LOGGED and returned); `statusCode`=`HttpException.getStatus()` else 500;
   `message` STATIC; `userMessage` safe/static (never a raw 500 message); `type`/`code` mapped
   (HttpException→status-derived, validation→`VALIDATION_ERROR`, unknown→`INTERNAL_ERROR`);
   `details` sanitized (only validation `fieldErrors`; never provider errors/stacks/PII);
   `correlationId`/`requestId` from the request; `environment`, `timestampUtc`. Log the **error**
   record with a sanitized stack; put a stack in the RESPONSE only when `environment==="Local"`.
   Log level: 4xx (incl. validation 400s) at debug/info, 5xx at error.
6. **Wiring (main.ts `configureApp`)** — `app.use(requestLogging(...))` +
   `app.useGlobalFilters(new AllExceptionsFilter(...))` **before** the `if (!cfg.swaggerEnabled)
   return;` early-return; migrate the 3 `console.*` calls onto the logger (D-0010).

## Acceptance criteria
1. a global exception filter (constitution 07) maps every unhandled exception and existing HttpException to the full standard error payload (errorId, type, user-facing message, sanitized details, http status, correlationId, requestId, environment, timestampUtc) and is wired app-wide via useGlobalFilters
2. structured JSON logging (constitution 05 §2.1) emits a request record and, on error, a distinct error record, each carrying timestampUtc/level/message/context/environment/serviceName/module/correlationId/accountId/requestId; correlationId accepts a valid inbound x-correlation-id else generates a UUID at ingress
3. the wiring is proven through configureApp()+app.init() so a test fails if the filter/middleware is not actually installed; decision 0013's handler+logging portion of D-0004 is closed

## Reviewer focus
Constitution 07 (payload + log levels + sanitized-stack policy), 05 §2.1–2.2 (records), 06
(transport), 03 (common/). Wire in `configureApp` before the swagger early-return; migrate the 3
`main.ts` console calls (D-0010); envelope `{ success:false, data:null, error:{…} }`;
HttpException→getStatus() else 500; stack in the response only for `environment=Local`; requestId
from `x-request-id`||null; correlationId from a valid `x-correlation-id` else a generated UUID shared
across the response and BOTH log records; request vs error records DISTINCT; register both tests in
`backend/package.json` + `tools/quality-gate.test.mjs`. Metrics/non-Local transport/Swagger-error-DTO
are deferred (D-0018/19/20).

## Verify
- `python3 factory/scripts/verify.py` green (structure, typecheck, quality, tests).
- `required_tests` (both registered in the backend hermetic allow-list):
  1. `backend/src/common/error-envelope.wiring.test.ts` — mirror `app.routes.test.ts:10-33`; drive
     BOTH a guarded 4xx (e.g. a CSRF/Auth-guarded mutation with no token) AND an unexpected 500,
     sent without `x-correlation-id`, and assert each response is the const-07 envelope with every
     field populated, a generated `correlationId` + `errorId`, and NO stack (environment≠Local) —
     proving the filter + middleware are installed through `configureApp`+`app.init()`.
  2. `backend/src/common/request-logging.test.ts` — with a captured logger, assert the request
     record and the error record share the request's `correlationId`/`requestId` and carry every
     required field; a valid inbound `x-correlation-id` is honored; an absent/invalid one yields a
     generated UUID.

## Grill resolutions (one cold read; all applied to this plan + the contract)
1. **Tests unrunnable under scope** → added `backend/package.json` + `tools/quality-gate.test.mjs`
   to write scope; both new tests are registered in the hermetic allow-list.
2. **Contradicts D-0010** → the 3 `main.ts` `console.*` calls ARE migrated here (D-0010's trigger);
   only the recon/pins/migrate emitters stay deferred (D-0009).
3. **False provenance** → fix `docs/specs/app-platform-base.md` (~154) to attribute observability to
   `backend-observability` (decision 0013 mandated this).
4. **Error contract underspecified** → `code`/`type`/`userMessage`/`details` mapping + sanitization
   rules specified above (only validation `fieldErrors`; never provider/stack/PII).
5. **Missing const-07 behavior** → log levels (4xx debug/info, 5xx error) + sanitized-stack-in-log
   added; **error metrics deferred (D-0018)** per PoC scope.
6. **Transport rule** → console for Local (compliant) + a transport seam; **non-Local centralized
   transport deferred (D-0019)**.
7. **Traceability not proved** → request record emitted on response finish (accountId after auth);
   tests now assert shared correlationId/requestId across response+logs, invalid inbound IDs, a real
   500, and non-Local stack non-leakage.
8. **Module + DTO shape** → module under `backend/src/common/` (const 03); shared error TYPES in the
   contract (backend-consumed); **decorated Swagger error DTOs deferred (D-0020 / D-0009)**.

## Manual Verification
1. `docker compose up -d app-db`; `npm --prefix backend run dev`.
2. `curl -i http://127.0.0.1:4000/api/auth/me` (unauthenticated) → JSON error envelope with a
   generated `correlationId`, `errorId`, `statusCode`, `timestampUtc`, no stack; stdout shows a
   request record and a distinct error record carrying the same `correlationId`.
3. Repeat with `-H "x-correlation-id: <uuid>"` → that UUID appears in the envelope and both records.
