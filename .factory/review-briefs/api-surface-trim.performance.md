# Review brief — api-surface-trim — performance lens

You are one lens of a three-lens code review. You see ONLY the diff bundle for
this task (no repository access), so judge what the diff shows and say so when
something cannot be verified from it. Report every finding with its
file_path and line. Use ONLY these categories: bug, security, regression,
test_gap, maintainability. Priorities: P0/P1 block the task; P2/P3 must be
resolved or explicitly deferred with a reason before it ships.

LENS: PERFORMANCE. Hot paths, algorithmic complexity, query fanout (N+1),
I/O amplification, memory churn, concurrency bottlenecks, missing pagination or
bounds, work repeated per request that could be done once. Distinguish measured
evidence from inference and say which each finding is. Use category `bug` for a
performance defect that will bite in production and `maintainability` for a cost
worth reducing.

LEFTOVERS (blocking): the diff must carry no code kept only for compatibility — no wrapper or shim over its replacement, no re-export or alias kept 'for callers', no renamed-but-retained symbol, no dead branch behind a removed feature, no 'legacy'/'deprecated'/'backward' naming or comment. Report each as a BLOCKING finding with file:line and verdict the contract it belongs to as partial; a clean diff says so in one line.
## Task api-surface-trim

### Plan contracts

- **t6-c1**
  - Source: docs/specs/app-platform-base.md
  - Statement: AppModule keeps exactly imports:[CoreModule, HealthModule], controllers:[AuthController], providers:[AuthGuard, LoginRateLimitService, {provide:APP_GUARD, useClass:CsrfGuard}]; every capability registration is removed — imports AdminModule/ConversationsModule/UsageModule/MeasuresModule/HelpModule, controllers UsersController/GrantsController/ChatController/SavedController/PinsController/ReportsController, providers ChatService/SavedService/PinsService/ReportsService/AdminGuard — so their routes (incl. /api/admin/users, /api/admin/grants, /api/admin/usage, /api/help) return 404, and Swagger (api/docs + api/docs-json) is unconditionally absent when NODE_ENV=production
- **t6-c2**
  - Source: docs/specs/app-platform-base.md
  - Statement: GET /health returns the standard response envelope {success:true, data:{status:ok}, error:null} via a decorated success DTO with an example and @ApiTags/@ApiOperation/@ApiOkResponse(typed); it keeps the spec's narrow non-versioned-health exception. The app-wide global exception handler and structured logging are NOT this task's concern (backend-observability, decision 0013)
- **t6-c3**
  - Source: docs/specs/app-platform-base.md
  - Statement: the backend mock-OTP profile is loopback-only: main.ts binds 127.0.0.1 when AUTH_OTP_MOCK is truthy via a small injectable listen seam, config.ts defaults frontendOrigin to http://127.0.0.1:3000 (FRONTEND_ORIGIN overrides) and PGHOST to 127.0.0.1, docker-compose publishes BOTH the app-db and warehouse-db ports to 127.0.0.1, and config.ts is formatted and removed from the .prettierignore D-0006 list in the same change
- **t6-c4**
  - Source: docs/specs/app-platform-base.md
  - Statement: the warehouse E2E resolves WAREHOUSE and SelectionExecutor from the application module's DI container and proves validate->explain->execute returns SUM(WarehouseFixture.value)=42 through a WAREHOUSE_E2E=1-gated path in the already-hermetic-listed oid test (skipped when unset, NOT added to test:db)
- **t6-c5**
  - Source: docs/specs/app-platform-base.md
  - Statement: hermetic DB-free tests (route allow-list, production-Swagger absence, loopback/CORS/PGHOST/compose defaults, /health envelope body + generated schema) are added to test:hermetic and the guard's pinned graph; login/RBAC/audit, no-enumeration and session-continuity remain DEMONSTRATED Postgres evidence via the established DB test (they cannot be hermetic — the real auth path needs a Postgres pool)

### Reviewer focus

The spec is normative (docs/specs/app-platform-base.md §'Confirmed scope', §'Local runtime contract'). EXACT AppModule shape (verified): keep imports:[CoreModule, HealthModule], controllers:[AuthController], providers:[AuthGuard, LoginRateLimitService, {provide:APP_GUARD, useClass:CsrfGuard}] — these live in AppModule, NOT CoreModule; a naive 'CoreModule provides auth' trim breaks auth. Remove the eleven capability registrations. Route test compares the complete method/path list by introspecting the initialized app (configureApp()+app.init(), no socket, no new dep — use the express adapter's router); removed routes 404; Swagger absent in production regardless of ENABLE_SWAGGER. SECURITY: 127.0.0.1 bind under AUTH_OTP_MOCK via a small injectable listen seam a fake can assert + compose port publish for BOTH dbs close a LAN admin login; config.ts defaults frontendOrigin to 127.0.0.1:3000 AND PGHOST to 127.0.0.1. /health returns the envelope {success:true,data:{status:ok},error:null} via a typed success DTO + example, @ApiOkResponse typed; tested for body AND generated schema. The GLOBAL exception handler + structured logging are OUT of scope here — decision 0013 assigns them to the separate backend-observability task; /health needs only its success DTO now. WAREHOUSE E2E: resolve from app-module DI; prove =42 via a WAREHOUSE_E2E=1-gated path in the already-hermetic oid test — NOT test:db. D-0006: config.ts is on .prettierignore — format it and remove that line here. New hermetic tests join test:hermetic AND the guard's pinned graph. TESTS ARE DB-FREE ONLY: no-enumeration and session-continuity are NOT hermetic (the real auth path needs Postgres) — they stay demonstrated DB evidence via the established auth DB test, not required hermetic tests. PLAN/0013: the approved plan's compliance note still reads 'deferred'; it is SUPERSEDED by accepted decision 0013 (the constitution has decisions govern when plan prose drifts) and the spec is reconciled — the plan is left as-approved to avoid a disproportionate story re-approval; plans/deferrals.md and docs/ are not in this leaf's write_scope. ROUND-6 SPECIFICS: (Q2) Swagger exposes more than two routes — the non-production docs surface is /api/docs, /api/docs/ (UI + static assets/init scripts) and /api/docs-json AND /api/docs-yaml; the production-absence test asserts ALL of them 404 when NODE_ENV=production, and the route allow-list test does not claim the surface is exactly two paths. (Q3) app.init() is NOT DB-free as-is: AuthoredMeasureRegistry.onModuleInit() queries authored_measures, so the hermetic route/Swagger/health tests must stub ONLY AuthoredMeasureRegistry.onModuleInit before app.init() (keep the real AppModule container + routes; no runtime-lifecycle change, no new test dependency). config.ts also REFUSES a production boot without required secrets — the production-Swagger test must set them or run configureApp without the full production guard. /health ships its success-envelope DTO here; the typed ERROR response shape and its runtime producer land in backend-observability (decision 0013), so do not block /health on the global handler.

### Lessons in force

Recorded lessons that apply to this task's paths. A finding that contradicts one is not a defect unless it shows the lesson itself is wrong; say so explicitly instead of re-raising it.

- [high] required_tests false-green: A required_tests entry must name a REAL leaf test (id = the string in test("...")), not the file path, and must pin TS_NODE_PROJECT=backend/tsconfig.json because forge runs it from repo root; otherwise junit-run's --test-name-pattern matches nothing and ts-node skips the workspace tsconfig, so the gate reports pass without running assertions. Always verify with a negative control (a required test whose negative control cannot fail is not proof).
