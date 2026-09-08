# Review brief — backend-observability — security lens

You are one lens of a three-lens code review. You see ONLY the diff bundle for
this task (no repository access), so judge what the diff shows and say so when
something cannot be verified from it. Report every finding with its
file_path and line. Use ONLY these categories: bug, security, regression,
test_gap, maintainability. Priorities: P0/P1 block the task; P2/P3 must be
resolved or explicitly deferred with a reason before it ships.

LENS: SECURITY. OWASP-style trust boundaries, authentication and authorization
(every new route/handler: who may call it, with what scope), secrets and
credential handling, injection (SQL/command/template), data exposure and
over-broad responses, unsafe defaults, privilege escalation, and abuse paths.
Use category `security` for these findings.

LEFTOVERS (blocking): the diff must carry no code kept only for compatibility — no wrapper or shim over its replacement, no re-export or alias kept 'for callers', no renamed-but-retained symbol, no dead branch behind a removed feature, no 'legacy'/'deprecated'/'backward' naming or comment. Report each as a BLOCKING finding with file:line and verdict the contract it belongs to as partial; a clean diff says so in one line.
## Task backend-observability

### Plan contracts

- **t9-c1**
  - Source: constitution/07-exception-handling.md
  - Statement: a global exception filter (constitution 07) maps every unhandled exception and existing HttpException to the full standard error payload (errorId, type, user-facing message, sanitized details, http status, correlationId, requestId, environment, timestampUtc) and is wired app-wide via useGlobalFilters
- **t9-c2**
  - Source: constitution/05-logging-and-observability.md
  - Statement: structured JSON logging (constitution 05 §2.1) emits a request record and, on error, a distinct error record, each carrying timestampUtc/level/message/context/environment/serviceName/module/correlationId/accountId/requestId; correlationId accepts a valid inbound x-correlation-id else generates a UUID at ingress
- **t9-c3**
  - Source: docs/decisions/0013-backend-observability-built-in-poc.md
  - Statement: the wiring is proven through configureApp()+app.init() so a test fails if the filter/middleware is not actually installed; decision 0013's handler+logging portion of D-0004 is closed

### Reviewer focus

Normative sources (READ them): constitution/07-exception-handling.md, constitution/05-logging-and-observability.md §2.1-2.2, constitution/06-logger-and-log-transports.md, constitution/03-modular-monolith-structure.md, decision 0013 (docs/decisions/0013-backend-observability-built-in-poc.md), and deferrals D-0010/D-0018/D-0019/D-0020. Nothing observability-related exists yet - build under backend/src/common/ (constitution 03 puts cross-cutting logging/middleware/error handling in common, NOT a new top-level dir). WIRING SEAM: main.ts configureApp(app, cfg) (main.ts:20-27) is the single seam that both bootstrap() and the tests (configureApp+app.init) exercise; register the request-logging middleware and app.useGlobalFilters(new <Filter>(cfg,logger)) BEFORE the `if (!cfg.swaggerEnabled) return;` early-return (main.ts:22) or production is uncovered. MIGRATE main.ts's three console.* calls (bootstrap/listen/fatal, ~main.ts:26) onto the structured logger - that is D-0010's assignment; the recon/pins/migrate console.* stay deferred (D-0009). ERROR ENVELOPE (const 07): { success:false, data:null, error:{ errorId (uuid-v4, LOGGED and returned), code (stable machine code: HttpException->status-derived, validation->VALIDATION_ERROR, unknown->INTERNAL_ERROR), type (exception category), message (STATIC), userMessage (safe static; NEVER a raw 500 message), details (sanitized - only validation fieldErrors; NEVER provider errors/stacks/PII), statusCode (HttpException.getStatus() else 500), correlationId, requestId, environment, timestampUtc } }. Log levels: 4xx (incl. validation 400s) at debug/info, 5xx at error; the sanitized stack goes in the LOG record only, and the response carries a stack ONLY when environment=Local. requestId from req.headers['x-request-id']||null. Align the shape with the health { success, data, error } envelope and contract/src/api.ts ResponseClass. LOG RECORDS (const 05): structured JSON; a request record AND a DISTINCT error record, each with timestampUtc, level, message (static), context (dynamic PII-masked KVs), environment (enum Local|Development|QA|UAT|Staging|Production), serviceName, module, correlationId, accountId (nullable), requestId. Emit the request record on response finish so accountId is populated after AuthGuard sets req.authUser; correlationId = a valid inbound x-correlation-id else a UUID generated at ingress and shared across the response header and BOTH log records. Console/stdout transport is correct for Local (const 06); expose a transport seam - non-Local centralized transport is D-0019, error metrics are D-0018, decorated Swagger error DTOs are D-0020. CONFIG: add environment (mapped to the const-05 enum from ENVIRONMENT||nodeEnv, defined unknown-value behavior) and serviceName (SERVICE_NAME || '3f-backend') to config.ts loadConfig. SHARED TYPES in contract/src/api.ts (barrel index.ts) consumed by the BACKEND filter; the shipped frontend is not required to consume them here. TESTS: mirror backend/src/app.routes.test.ts:10-33 (stub AuthoredMeasureRegistry.prototype.onModuleInit; NestFactory.create(AppModule,{logger:false}); configureApp(app); await app.init(); close in finally); reach Express via app.getHttpAdapter().getInstance(); capture the injected logger. REGISTER both new tests in the backend allow-list: backend/package.json test:hermetic AND tools/quality-gate.test.mjs hermeticTests (else the quality-gate guard fails or the tests never run under verify.py). Test files are transpile-only (D-0007). PROVENANCE: fix docs/specs/app-platform-base.md (~line 154) so observability is attributed to backend-observability, not api-surface-trim (decision 0013 mandated this reconciliation).
