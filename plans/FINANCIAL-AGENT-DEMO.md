# Demo-first Financial Chat with monthly trends and traceable Actuals

28 parts (18 complete, 10 remaining) · Risks: external model processing, incomplete source coverage and PoC-only runtime reliability · New moving parts: independent chat, additive warehouse tables, process memory and direct Claude integration

## What changes for you

You get a separate Financial Chat alongside existing Ask. It answers warehouse-backed Actual
versus Budget questions by Plant, month, GL and nursery component, shows monthly trends, remembers
follow-up scope while the backend is running, and opens the matching transactions when any Actual
value is clicked. It asks for clarification whenever the required scope is missing or ambiguous,
and users see only their permitted Plants.

The demo never invents completeness. Unmapped transactions stay visible as Unmapped, missing
Budget is labelled rather than treated as zero, and the supplied workbook's incomplete Actual is
shown only as a clearly labelled available-data subtotal. Conversation memory is in process and
is lost when the backend restarts.

Claude Sonnet selects governed financial questions; all financial queries, calculations, labels
and drill-down matching remain deterministic in the backend. Existing Ask, reports, imports,
exports and report drill-down continue unchanged. One browser journey proves the complete PoC
flow from clarification through answer, trend, follow-up and Actual transaction drill-down.

## Why

Finance needs a usable, accurate and traceable demonstration quickly, without manually summing
monthly sheets or risking changes to the existing reporting application. Production hardening can
follow after the PoC validates the workflow.

## Done when

1. **Permitted users receive exact warehouse-backed Actual versus Budget answers by Plant, month, GL and nursery component, with clarification instead of guessed scope and honest Unmapped, missing-Budget and partial-data labels.**
2. **Monthly trends and in-memory follow-ups preserve confirmed scope and show exact values, gaps, changes and closing Roll-over balances without turning missing or partial data into complete results.**
3. **Every displayed Actual value opens its matching warehouse transactions with the exact full total, source and permitted scope, while non-Actual values remain non-clickable.**
4. **The separate Claude Sonnet Financial Chat completes one end-to-end browser journey with backend calculations while existing Ask, reports, imports, exports and report drill-down keep their previous behavior.**

## Risks

- Real Claude calls send permitted user text and sanitized selection metadata to an external
  vendor. The deterministic browser journey uses a fake provider; enabling real calls still
  requires valid application model access and billing, and must never send financial results,
  rows, transaction handles, batch identities or raw conversation state to the model.
- Completeness confirmation remains deferred. Real-source Actual is partial and must remain an
  available-data subtotal; the PoC cannot claim a complete customer-Actual comparison.
- Process-local memory is intentionally demo-grade. A backend restart loses conversations and
  drill handles; connection-loss replay, advanced deduplication, cancellation, concurrent-run and
  multi-tab guarantees are deferred.
- Changes remain additive and feature-gated. No source overwrite, destructive migration, old-chat
  cutover or report migration is allowed; rollback disables the new Financial Chat.
- One focused browser journey proves the demo flow, not every real-source, synthetic, device,
  cache or vendor combination. Those matrices move to the later hardening story.
- Approximately 8–12 hours is a target for the remaining PoC work, not a guaranteed deadline;
  review findings, CI failures or environmental blockers can extend it.

## For the builders

### Done-when details

1. Exact money remains a paise-precise decimal string from governed warehouse rows. Supported
   question dimensions are Plant, month, GL and nursery component using the catalog combinations
   already implemented. The model chooses only governed selections and never authors SQL, joins,
   values or Budget allocations. Missing Plant, period or another required scope produces a
   clarification before any financial query. Current Plant grants are checked before selection,
   query, response and drill reads. Revocation denies the retained scope rather than shrinking it.
   Known-Plant transactions with no component mapping remain in an `Unmapped` row and drill.
   Missing Budget uses `Budget not loaded for this Plant or month`; a loaded Plant/month with no GL
   line uses `No Budget line for this GL` and a not-applicable percentage. Missing Actual is zero
   only for a source month explicitly represented as loaded; otherwise it is `Actual data not
   loaded`. The real workbook's incomplete Actual appears only as an `availableActualSubtotal`,
   never as complete Actual, percentage, delta or chart point. Input schemas remain strict and
   reject unsupported dimensions, measures, filters, dates, page sizes and unknown fields.
2. Month, explicit range and April-based financial-year trends use backend values only. Monetary
   change requires two complete Actual values; percentage change is not applicable when the prior
   value is zero, negative, missing or partial. Missing months remain gaps. Roll-over uses the
   stored balance for the selected closing month rather than summing monthly balances. A pending
   clarification reply and later follow-up reuse the confirmed conversation scope; an explicit new
   month replaces the earlier month. Memory is owner-local and process-local, bounded for the PoC,
   and a refresh can continue while a backend restart returns a clear lost-context response. This
   story does not require connection replay, advanced cancellation, simultaneous runs or multi-tab
   coordination.
3. Every Actual rendered in the answer table, total or trend exposes an owner-bound handle for its
   exact aggregate scope, including Unmapped and available-data subtotal values. Budget,
   Roll-over and percentage are inert. Drill reads reuse the shared governed predicate and the
   immutable source and mapping pins; no LLM call occurs on click. The prepared first ten rows,
   stable continuation order, exact full count and exact full total already implemented by DRILL
   and PAGES remain authoritative. Invalid, expired, revoked, replaced or out-of-range requests
   return typed safe errors and never fall back to a newer source.
4. The independent route and navigation entry remain behind the Financial Chat feature flag and
   reuse only shared authentication, RBAC, CSRF, audit, configuration, logging and error handling.
   Claude Sonnet receives trusted financial instructions, strict tool schemas, user text and
   sanitized permitted vocabulary; backend results never return to the model. Repeated static
   instructions keep the existing cache boundary, but detailed cache-token measurement is not PoC
   acceptance. The final deterministic Playwright journey uses disposable databases and a fake
   Claude response to: clarify missing Plant/period, answer an exact Actual-versus-Budget question,
   show a monthly trend with an honest gap/partial state, retain a follow-up, and click an Actual
   through to matching transactions. Existing hermetic, baseline and focused browser checks prove
   Ask, report generation, import, export and report drill-down stay unchanged. No production
   deployment or live-Claude repetition is required for this story.

### Deferred hardening

Create a later hardening story, after the PoC workflow is accepted, for:

- connection-loss replay and advanced event deduplication;
- advanced cancellation, concurrent-run and multi-tab behavior;
- exhaustive real-source and synthetic browser-test matrices;
- repeated live-Claude probes and detailed cache-token measurements; and
- production rollout evidence and the final deployment runbook.

The deferral does not relax financial accuracy, authorization, strict input validation,
transaction traceability or preservation of existing features.

### Task rules

The first 18 rows are already merged and are retained as the factual foundation; do not reopen or
rewrite them. The ten remaining rows are the smallest reviewable PoC units: combining any adjacent
rows would mix ownership boundaries or is expected to exceed Forge's roughly 400-line task size.
Every backend test is registered in the correct package runner and quality gate. Database writes
and truncation use only disposable PostgreSQL on 127.0.0.1:5434 (warehouse) and :5435 (app), never
the live :5433/:5432 databases. Browser work uses 127.0.0.1:3000 and a fresh CSRF token for each
scripted POST. Each task begins with a failing owner-boundary test, runs its focused tests, then
quality, typecheck, structural and hermetic checks before close.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BASELINE | Preserve existing outputs | Independent source oracle and backend legacy baseline | 4 | `backend/src/financial-chat/financial-source-oracle.ts`, `backend/src/financial-chat/financial-report-baseline*`, `tools/financial-chat-db-proof.mjs`, `backend/src/financial-chat/financial-disposable-db.guard*`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged baseline and disposable-target proofs remain green | none | no |
| LEGACY-UI | Preserve legacy screens | Fixed existing Ask/report/export/drill browser baseline | 4 | `frontend/e2e/legacy-financial-baseline.spec.ts`, `frontend/playwright.config.ts`, `frontend/package.json`, `package.json`, `package-lock.json`, `tools/quality-gate.test.mjs` | Existing merged legacy browser proof remains green | BASELINE | no |
| CONTRACT | Define financial contracts | Strict governed tool, selection and result schemas | 1, 3, 4 | `contract/src/financial-tools.ts`, `contract/src/index.ts`, `contract/test/financial-tools.test.ts`, `contract/package.json`, `tools/quality-gate.test.mjs` | Existing merged exact-money, tool-schema and result validation tests remain green | none | no |
| RESPONSE | Define presentation contracts | Strict answer, UI, drill and typed-error frames | 2, 3, 4 | `contract/src/financial-chat.ts`, `contract/src/index.ts`, `contract/src/api.ts`, `contract/test/financial-chat.test.ts`, `contract/package.json`, `tools/quality-gate.test.mjs` | Existing merged response-contract tests remain green | CONTRACT | no |
| TRANSPORT | Prove compatibility | Native fetch/ReadableStream and backend frame adapter compatibility | 4 | `backend/src/financial-chat/stream-adapter*`, `frontend/src/features/financial-chat/financial-chat.transport*`, `package-lock.json`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged frame and runtime compatibility tests remain green | RESPONSE | no |
| CONFIG | Configure model safely | Feature flag and Claude settings without changing old Ask | 4 | `backend/src/config.ts`, `.env.example`, `backend/src/financial-chat/financial-model-config.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged safe-startup and unchanged-provider tests remain green | RESPONSE | no |
| SCHEMA | Store source facts | Additive exact source tables and generation constraints | 1, 4 | `backend/src/financial-data/financial-schema*`, `backend/drizzle-warehouse/*`, `backend/src/warehouse/warehouse-migrate.ts`, `backend/src/warehouse/warehouse-schema.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged migration and source-constraint DB proofs remain green | RESPONSE, BASELINE, LEGACY-UI | no |
| ACTUAL-PARSER | Preserve Actual lines | Exact Actual source parsing, null dimensions and rounding | 1 | `backend/src/financial-data/financial-workbook.parser.ts`, `backend/src/financial-data/financial-actual.parser*`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged Actual parser tests remain green | SCHEMA | no |
| BUDGET-PARSER | Preserve Budget leaves | Monthly hierarchy/formula parsing and governed mapping seed | 1 | `backend/src/financial-data/financial-workbook.parser.ts`, `backend/src/financial-data/financial-budget.parser*`, `backend/src/financial-data/financial-mapping.seed.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged Budget parser and mapping tests remain green | ACTUAL-PARSER | no |
| LOAD-REPO | Activate generations | Atomic, idempotent source generation activation | 1, 4 | `backend/src/financial-data/financial-load.repository.ts`, `backend/src/financial-data/financial-load.db.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged generation and rollback DB proofs remain green | BUDGET-PARSER | no |
| LOAD | Import workbook | Independent workbook CLI with reconciliation and source months | 1, 4 | `backend/src/financial-data/financial-loader*`, `backend/src/financial-data/financial-load.cli.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged loader, reconciliation and spaced-path tests remain green | LOAD-REPO | no |
| CATALOG | Authorize vocabulary | Governed dimensions plus report and Plant authorization | 1, 4 | `backend/src/financial-data/financial-data.module.ts`, `backend/src/financial-data/financial-data.service*`, `backend/src/financial-data/financial-access.service.ts`, `backend/src/financial-data/financial-catalog.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged catalog, authorization, revocation and audit tests remain green | RESPONSE, LOAD | no |
| PREDICATE | Pin contributing scope | One parameterized summary/detail predicate | 1, 3 | `backend/src/financial-data/financial-predicate*`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged filter, descendant, pin and injection DB proofs remain green | CATALOG | no |
| QUERY | Return exact comparisons | Independent complete, partial and missing Actual/Budget facts | 1 | `backend/src/financial-data/financial-query.repository.ts`, `backend/src/financial-data/financial-data.service.ts`, `backend/src/financial-data/financial-query.db.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged fan-out, Unmapped, missing-Budget and coverage tests remain green | PREDICATE | no |
| TRENDS | Return monthly changes | Exact ranges, deltas, gaps and closing balance | 2 | `backend/src/financial-data/financial-trend*`, `backend/src/financial-data/financial-query.repository.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged zero/negative/missing-prior, cross-year, partial and Roll-over tests remain green | QUERY | no |
| DRILL | Issue drill scopes | Owner-bound exact Actual scopes with expiry and access recheck | 3 | `backend/src/financial-data/actual-drill-context*`, `backend/src/financial-data/financial-query.repository.ts`, `backend/src/financial-data/financial-data.service.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged owner, expiry, revocation, deduplication and source-identity tests remain green | TRENDS | no |
| PAGES | Read transactions | Stable prepared and continuation pages with exact full totals | 3 | `backend/src/financial-data/actual-transactions.repository.ts`, `backend/src/financial-data/financial-data.service.ts`, `backend/src/financial-data/actual-drill.db.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged full traversal, stable order, paging error, partial and zero-net DB proof remains green | DRILL | no |
| MODEL | Select questions | Direct Claude Sonnet provider, trusted instructions and safe cache boundary | 1, 4 | `backend/src/financial-chat/financial-selector.provider*`, `backend/src/financial-chat/financial-chat.tools.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Existing merged strict tools, fixed prefix, payload exclusion and typed vendor-error tests remain green | CONFIG, TRANSPORT, CATALOG | no |
| MEMORY | Remember PoC conversations | Owner-local bounded in-memory turns, confirmed scope and result membership | 2, 3 | `backend/src/financial-chat/financial-chat.state.ts`, `backend/src/financial-chat/financial-chat.memory*`, `backend/package.json`, `tools/quality-gate.test.mjs` | `financial-chat.memory.test.ts`: owner isolation, bounded conversations/turns/results, refresh continuation, restart loss, expiry and revocation; no concurrent-run or multi-tab matrix | MODEL | no |
| GRAPH | Clarify and follow up | LangGraph transitions from question to clarification or governed selection | 1, 2, 4 | `backend/src/financial-chat/financial-chat.graph*`, `backend/package.json`, `tools/quality-gate.test.mjs` | `financial-chat.graph.test.ts`: no query before required clarification, pending reply, explicit month override, follow-up scope, bounded rounds and malformed/unknown tool refusal | MEMORY, TRENDS | no |
| ANSWER | Form exact responses | Deterministic text/UI, trends and ready Actual handles without model arithmetic | 1, 2, 3 | `backend/src/financial-chat/financial-chat.service*`, `backend/src/financial-chat/financial-answer.helper.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | `financial-chat.service.test.ts`: exact complete/partial/missing labels, trend gaps, backend-only calculations, prepared handles and no rows/results sent to Claude | GRAPH, PAGES | no |
| API | Expose the PoC | Authenticated commands, simple streamed frames, conversation state and drill pages | 2, 3, 4 | `backend/src/financial-chat/financial-chat.controller*`, `backend/src/financial-chat/financial-chat.dto.ts`, `backend/src/financial-chat/financial-chat.stream.test.ts`, `backend/src/financial-chat/stream-adapter.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | Controller/stream tests: auth, CSRF, owner isolation, exact final frame, typed errors and drill paging; no connection replay, advanced deduplication or cancellation matrix | ANSWER | no |
| CLIENT | Connect React | Credentialed native transport and one in-memory chat hook | 2, 3 | `frontend/src/features/financial-chat/financial-chat.transport*`, `frontend/src/features/financial-chat/use-financial-chat*` | Transport/hook tests: frames, clarification reply, follow-up, one auth refresh, fresh CSRF and denied-state clearing; no concurrent-run or multi-tab matrix | RESPONSE, TRANSPORT | no |
| CHAT | Build the screen | Separate accessible Financial Chat page and clarification controls | 1, 2, 4 | `frontend/app/(app)/financial-chat/page.tsx`, `frontend/src/features/financial-chat/financial-chat.tsx`, `frontend/src/features/financial-chat/clarification-card.tsx`, `frontend/src/features/financial-chat/financial-chat.test.tsx` | Chat tests: clarification, follow-up, new chat, denied/no-Plants/restart copy and keyboard behavior | CLIENT | yes |
| VALUES | Render finances | Exact answer tables, honest labels and gapped monthly trends | 1, 2 | `frontend/src/features/financial-chat/financial-result*`, `frontend/src/features/financial-chat/monthly-trend.tsx`, `frontend/src/components/ui/` | Result tests: large/negative exact strings, Unmapped and missing-Budget labels, partial exclusion, gap handling, chart/table agreement and no frontend arithmetic | RESPONSE | yes |
| DETAIL | Open Actuals | Accessible Actual transaction panel using prepared and continued pages | 3 | `frontend/src/features/financial-chat/actual-transactions-panel*` | Panel tests: no LLM call, matching partial/full totals, paging, typed failure/denial and focus return; Budget/Roll-over/percentage remain inert | CLIENT, VALUES | yes |
| INTEGRATE | Enable independently | Backend module/routes/Swagger plus feature-gated navigation without Ask changes | 4 | `backend/src/financial-chat/financial-chat.module*`, `backend/src/financial-chat/financial-chat.capabilities.controller.ts`, `backend/src/app.module.ts`, `backend/src/app.routes.test.ts`, `backend/src/swagger.test.ts`, `frontend/src/components/shell/app-shell.tsx`, `frontend/src/components/shell/app-shell.test.tsx`, `backend/package.json`, `tools/quality-gate.test.mjs` | Module, route, Swagger and shell tests: flag on/off, safe missing-model refusal, permitted/no-Plant states, independent navigation and unchanged Ask route/provider | API, CHAT, DETAIL | yes |
| DEMO | Prove the PoC journey | One disposable-data Playwright flow plus focused legacy preservation smoke | 1, 2, 4 | `backend/src/financial-chat/financial-chat-fixtures*`, `frontend/e2e/financial-chat-demo.spec.ts`, `frontend/e2e/financial-chat-fixtures.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | One deterministic browser journey: clarify Plant/month, exact Actual versus Budget, honest missing/partial/Unmapped state, monthly trend, follow-up, click Actual and match transaction total/source/scope; then smoke existing Ask/report/export/drill and rely on merged import regression | INTEGRATE, LOAD, LEGACY-UI | yes |

New moving parts: TypeScript LangGraph in the NestJS backend; direct Claude Sonnet selection;
strict shared financial response contracts; an independent React page using native fetch and
ReadableStream; additive warehouse source tables and loaders; and process-local conversation
state. No database server, vector store, queue, durable checkpointer, hosted Agent Server, Deep
Agents framework, OpenAI/Bedrock fallback or production deployment system is added.

## Notes

- This amendment replaces the original production-shaped acceptance for this story. The broader
  confirmed spec and accepted decisions remain the source for a later hardening story, but the
  five items under Deferred hardening are not prerequisites for this PoC.
- Completed work stays unchanged. Do not revert already merged compatibility, cache, paging,
  authorization or test protections merely because the reduced PoC no longer requires their full
  matrix.
- Remaining dependency graph is acyclic. MEMORY starts from merged MODEL; CLIENT and VALUES can
  start immediately after approval. GRAPH follows MEMORY; ANSWER follows GRAPH; API follows
  ANSWER. CHAT follows CLIENT; DETAIL follows CLIENT and VALUES; INTEGRATE joins API, CHAT and
  DETAIL; DEMO is the final PoC proof.
- Start every ready PoC task immediately after exact-plan approval. Ignore unrelated Ask and Forge
  work. Serialize only tasks that actually edit the same manifest, lockfile or quality-gate line;
  independent scopes run in parallel.
- Reuse only shared authentication, RBAC, CSRF, audit, config, logging and error handling. Do not
  reuse old Ask prompts, selector, tools, executor, state, parser or UI. The existing AskProvider
  stays untouched.
- The deterministic browser journey may fake Claude selection but not financial results. Every
  displayed value and transaction must still come through the real warehouse query and backend
  calculation paths using guarded disposable data.
- Fake or real model output can select only the governed vocabulary. No financial amount,
  percentage, transaction row, drill handle, batch identity, raw state or rendered answer is sent
  to Claude, logs or traces.
- Do not add automatic defaults for missing Plant or period. Do not convert missing Budget or
  incomplete Actual into zero. Do not allocate Budget across Cost Centers. Do not compute money or
  percentages in React.
- Approximately 8–12 hours is a planning target only. Forge review, tests and CI remain mandatory;
  speed does not authorize bypassing task scopes, reviews, financial proofs or merge gates.

Decided: demo-first scope and listed hardening deferrals (owner, 2026-10-10).
Decided: completeness confirmation remains deferred; supplied-source Actual stays explicitly
partial (owner, 2026-10-08, decision 0054).
Decided: Claude Sonnet with trusted static-prefix instructions and backend calculations remains
selected (owner, 2026-10-08, decision 0053).
