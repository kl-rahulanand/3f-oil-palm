# Stage 7: Authenticated Conversation API Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Expose the new graph and transaction pages securely through the existing application.
**Architecture:** Thin NestJS controllers adapt typed commands/events using stage 1's pinned
protocol. Existing session/RBAC/CSRF/audit infrastructure protects every resource.
**Tech Stack:** NestJS, shared Zod/DTOs, typed frame adapter and native credential-aware React fetch/ReadableStream.
**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Global constraints:** [Master](2026-10-08-financial-chat-master.md).
**Dependencies:** Stage 1 transport proof and stage 6 service.

## Files and ownership

- Create backend/src/financial-chat/financial-chat.controller.ts, financial-chat.dto.ts,
  financial-chat.controller.test.ts and financial-chat.stream.test.ts.
- Expand stage 1 stream-adapter.ts and frontend financial-chat.transport.ts plus transport tests.
- Modify backend/src/app.module.ts, backend/src/config.ts, .env.example, route/Swagger tests,
  manifests/test scripts and tools/quality-gate.test.mjs as needed.
- Include .prettierignore when touching an ignored file and remove/format its entry.
- No change to existing report endpoints or old Ask contracts.

## Resource map and interfaces

| Resource                                                                 | Behavior                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| POST /api/v1/financial-conversations                                     | Create an empty owner-bound in-memory conversation             |
| GET /api/v1/financial-conversations/:id                                  | Authorized sanitized state/resume metadata                     |
| POST /api/v1/financial-conversations/:id/commands                        | Typed command adapter: start/reply/cancel as proved in stage 1 |
| GET /api/v1/financial-conversations/:id/stream                           | Pinned authenticated event subscription/replay cursor          |
| GET /api/v1/financial-conversations/:id/actual-transactions/:drilldownId | Reauthorized handle page via FinancialDataService.transactions |

Stage 1 pins typed command/event spellings and adapter argument shape; resource intent above
does not authorize an untested pseudo-Agent Server API. If the chosen adapter needs a different
HTTP verb/frame, record the exact mapping before dependent code. Streaming frames are typed
protocol events, while ordinary resource responses/errors use the standard envelope.
The transaction adapter uses data.items + data.pagination + matchingActualTotal.

For transaction paging, verify the handle belongs to a result recorded in the requested
conversation's graph state before calling the data service. Owner equality alone does not
authorize attaching a different conversation's result to this resource.

## Tasks

### 7A: Protected resources and standard errors

- [ ] Write real-HTTP cases unauthenticated_denied, csrf_required_for_command,
      cross_user_conversation_and_handle_denied, forged_grants_ignored, malformed_fields_rejected,
      feature_disabled_not_available and documented_errors_match_envelope.
- [ ] Resolve current authenticated account from existing session services; controllers pass
      user identity only, never browser grants. Service-level authorization remains in place.
- [ ] Require CSRF on creation/commands/cancellation, named CORS origins and existing rate-limit/
      security-header policy. No new permissive origin or public financial stream.
- [ ] Use current backend grants; do not broaden entitlements just to make chat demo work.
      Require existing financial-report permission plus current Plant grants, including
      replay/prepared cache/pagination. No report permission denies direct endpoints.
      No Plant grants gives typed guidance with no financial data, not a default Plant.
      State/list access checks owner before exposing even clarification choices.
- [ ] Pin flag FINANCIAL_CHAT_ENABLED, default false, in validated configuration and example env.
      Separate frontend visibility from server enforcement; hiding a link is not authorization.
- [ ] Validate FINANCIAL_CHAT_MODEL_PROVIDER=anthropic, FINANCIAL_CHAT_MODEL_ID=claude-sonnet-5-5
      and server-only ANTHROPIC_API_KEY. No OPENAI_API_KEY requirement; never prefix model
      credentials with NEXT_PUBLIC_. Provider processing/retention/residency must be checked before
      enabling real requests; direct APIs do not inherit the old Mumbai guarantee.
- [ ] Document all fields, paths, query limits, auth/session and typed errors in Swagger.
      details.reason survives the global generic userMessage replacement. No raw SQL/stack traces.

### 7B: Secure streaming, retry and replay

- [ ] Write duplicate_command_no_second_run, interrupted_stream_terminal_state,
      replay_no_duplicate_ui, replay_revoked_permission_denied, stale_restart_context_expired,
      concurrent_run_conflict and cancel_suppresses_late_events.
- [ ] Bind streams/run IDs/cursors to owner and conversation; reject foreign or expired cursor.
      Check current session/grants before cached financial event delivery, not only at start.
- [ ] Map one active run rule and bounded event retention; terminal response is complete.
      Unexpected errors before headers use global envelope; after headers use typed terminal error
      plus sanitized logged errorId/correlationId.
- [ ] Client transport refreshes authentication at most once on 401. Fetch fresh CSRF before each
      mutating retry. Use command/run identity to avoid duplicating a possibly successful POST;
      don't automatically replay a financial command merely because network response was lost.
- [ ] Disconnect aborts subscription; explicit cancel follows proved run semantics. Reconnect
      resumes bounded existing events rather than silently starting another model/query run.
- [ ] Auth expiry/permission change clears client-held result/detail cache when denied; no error
      fallback that renders another user's old response as current.

### 7C: Module/config/audit integration

- [ ] Register financial-data/financial-chat modules through existing exported service seams.
      Resolve old controllers too, with feature flag both off/on.
- [ ] Audit allowed/refused query, drill, load/run identity and failure class using existing audit
      service; no raw transaction rows, prompts, secret/token/handle payloads or financial result blobs.
- [ ] Missing/invalid new-model inputs produce typed per-request model-unavailable failures,
      not backend startup failure that would break reports/old Ask. Flag-off adds no model key,
      active financial-table or external-hosting startup dependency.
- [ ] Expose authenticated runtime capability metadata for the frontend feature gate. Do not
      freeze this flag in NEXT_PUBLIC build-time configuration; test on/off with one frontend build.

## Verification and handoff

- [ ] Run registered hermetic controller/protocol/module leaves with PGPORT=1 and WAREHOUSE_PG_PORT=1
      set using PowerShell env variables; restore values afterward. Do not boot real AppModule in
      hermetic dependency-scanner proof.
- [ ] Run HTTP integration against throwaway :5434/:5435, standard checks and Swagger/route cases.
      Browser URLs use http://127.0.0.1:3000, matching configured FRONTEND_ORIGIN.
- [ ] Hand off resource examples, typed failures, flag behavior and tested resume/cancel semantics.

**Done when:** Authenticated owner-scoped resources stream complete new-chat answers and pages,
and malformed, expired, replayed or cross-user requests cannot leak data.
**Review focus:** CSRF rotation on retry; cursor authority; post-header errors; double command runs;
stream cache disclosure after permission revocation.
