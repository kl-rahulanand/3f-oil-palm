# New financial chat with monthly trends and traceable Actuals

35 parts · Risks: external model processing, incomplete coverage and integration compatibility · New moving parts: independent chat, additive warehouse tables and direct Claude integration

## What changes for you

You get a separate Financial Chat alongside existing Ask. It answers factual Actual versus
Budget questions by Plant, month, GL and nursery component, supports monthly trends and
follow-ups, and prepares transactions behind every clickable Actual. Missing or ambiguous
scope asks for clarification. Users see only their permitted Plants.

Completeness confirmation remains deferred for this PoC. The supplied workbook's complete
Actual is unavailable, with a clearly labelled available-data subtotal and its transactions;
partial amounts never become complete percentages or changes. Synthetic test data proves
complete-data behavior separately and is visibly labelled. Conversation memory disappears
when the backend restarts.

Claude Sonnet is the first model. Financial instruction modules and caching of repeated
static instructions are included; calculations stay in the backend. Existing chat, report
generation, imports, exports and report drill-down remain unchanged.

## Why

Finance needs accurate, traceable warehouse answers without manually summing monthly
sheets or risking changes to the existing reporting application.

## Done when

1. **Permitted users receive exact factual answers with clear missing-data and partial-data labels, without guessed scope, values or Budget allocations.**
2. **Monthly trends show correct exact values, gaps, changes and closing Roll-over balances for the selected period.**
3. **Clarification and follow-ups retain confirmed scope, respect current access and explain expired or lost conversation context.**
4. **Every clickable Actual opens its prepared matching transactions, and further pages preserve the full total, source and permitted scope.**
5. **The new workbook import preserves and reconciles the source while existing chat and reporting features keep their previous behavior.**
6. **The separate chat works with Claude Sonnet, trusted financial instructions and static prompt caching without sending server financial results to the model.**

## Risks

- Real Claude calls send permitted user text and sanitized selection metadata to a new
  vendor. Owner confirmation of application account/model access, billing and client
  retention/residency requirements is mandatory first; developer login is not approval.
- Completeness confirmation stays deferred. Real-source Actual remains partial; a complete
  customer-Actual demonstration requires a later agreed confirmation process.
- Changes are additive and imports independent. No source overwrite, destructive migration,
  old-chat cutover or report migration. Rollback disables the new feature.
- Package/stream compatibility must be proved before dependent work. One backend process
  holds temporary memory; restart loses conversation and transaction handles.

## For the builders

### Done-when details

1. Spec acceptance 1 and D1-D3/D7-D10: exact paise/decimal strings, all supported source
   dimensions and catalog combinations, independent Actual/Budget aggregates, no repeated-GL
   or parent fan-out. Composite mapping only; provisional remains provisional. Known-Plant
   Unmapped/missing dimensions retained; unknown Plants operator-only. All missing/zero/GL
   Budget states use the exact spec labels. No Cost Center Budget allocation, SQL/code tools,
   forecast or causal advice. Require current action `report`, domain `mis-statement`, four
   `mis-statement.actual_net/budget_net/rollover_net/percentage` measure grants, `leaf_key`
   dimension grant and `scope.attribute === "plant"` values through exported
   RbacService.resolveUser. These identifiers are auth compatibility, not old-chat code reuse.
   No report permission denies, no Plants guides, revocation denies pinned scope. Exact
   `availableActualSubtotal` is distinct, labelled completeness-unconfirmed, prepared and
   counted; never complete Actual/ratio/delta/chart point. Outside source months no fake
   subtotal. QUERY/CATALOG/BROWSER compare independent expected totals, refusals and scopes.
2. Spec acceptance 2, D4-D6/D8/D12: April FY with explicit ending period, cross-year ranges,
   flow sums versus closing-month stored Roll-over, complete-Actual gaps, table-only partial
   subtotals. Prior zero/negative/missing gives Not applicable percentage change; exact monetary
   delta requires both complete values. Distinct batch sourceReportingMonths includes valid
   unknown-Plant rows, never implied continuous span/completeness. TRENDS/VALUES/BROWSER
   prove missing closing month, noncontinuous months, empty covered Plant versus outside
   month, and chart/table agreement only between matching complete/Budget columns.
3. Spec acceptance 3 and all named follow-ups: pending replies complete the same request;
   explicit month overrides relative context; ambiguities clarify before query. One run,
   one-hour idle expiry; 20 conversations/account, 200/process, 40 sanitized turns, three result
   bundles, 256 replay events. Recheck owner/session/grants before read/replay/emission; never
   shrink pinned scope. MEMORY/GRAPH/API/STREAM/CLIENT/REGRESSION prove capacity/cancel/expiry,
   no-report/no-Plants, revocation and actual process restart with typed outcomes.
4. Spec acceptance 4: prepare 10 rows before completion; cap200 distinct Actual scopes including
   totals/parents/Unmapped/missing/empty/partial; deduplicate chart/table; 201 narrows first.
   Shared predicate and immutable source/mapping pins. Ascending stable posting date/transaction
   number/line ID/internal ID; full count/total not page sum. Continuation default20/max100
   pinned first time, offset10+(page-2)*limit; spec totalPages and 400 invalid_pagination,
   page_size_changed, page_out_of_range apply. Authorized metadata supplies prepared/default/
   pinned sizes after refresh/second tab. Shared30-second preparation deadline cancels outstanding
   work, preserves ready scopes, explicitly fails unfinished scopes and prevents late ready writes.
   Retained source pin or rerun, never fallback. DRILL/PAGES/ANSWER/DETAIL/BROWSER compare
   full transaction identity sets and totals, including partial and zero-net offsets.
5. Spec acceptance 5: BASELINE before migration/load. Eight additive agent_financial tables;
   independent original Excel parser retains all columns/both Comments/null identifiers/signs/
   evidence. Cell half-away-from-zero paise rounding with raw precision/delta evidence. Budget
   monthly leaves, separate hierarchy, repeated/missing GL, cached formulas only; missing cache
   blocks use and requests recalculated saved new source, no automatic overwrite/zero.
   Explicit DUB ownership/approved aliases, provisional mapping preserved. Immutable lifecycle,
   checksum/parser idempotency, atomic activation, failed replacement retains prior generation.
   Independent counts/Decimal/source sums, unconfirmed real coverage still permits faithful
   activation. Test-owned real-loader harness only on :5434 and synthetic: batch completeness,
   rejects real identities/wrong destinations before writes; no production completeness override.
   Every synthetic result labelled. SCHEMA/PARSERS/LOAD/FIXTURES/REGRESSION prove these and
   quoted real filename in PowerShell/cmd/Git Bash. Same legacy snapshot flag off/on for old
   Ask/import/statement/export/drill; unexplained same-scope differences block acceptance.
6. Spec acceptance 6: fresh TypeScript LangGraph/NestJS, direct ChatAnthropic Sonnet5.5
   (`claude-sonnet-5-5`), no Bedrock/OpenAI path/fallback. Four tools have meaningful descriptions,
   strict input and output Zod schemas. Catalog/lookup selection metadata only; financial results
   stay server-side. Trusted static instructions plus user text/sanitized selection/current capped
   permitted vocabulary; no server money/rows/handles/batches/raw state/rendered answers in
   calls/retries/traces/logs. Deterministic answer/UI, five rounds, bounded timeouts/retries,
   typed vendor errors. Always bundle four instruction modules in fixed order; static schemas
   have no per-user enums. Explicit5-minute cache prefix before dynamic context; no padding or
   automatic whole-history caching. Different grants share static prefix bytes. Hits/misses/
   expiry/short prefixes never bypass access/queries; record aggregate cache counters/timing only.
   MODEL/GRAPH/ANSWER prove boundaries. LIVE requires owner-confirmed vendor prerequisites,
   then D1-D12 x3 fresh real runs and follow-ups on final prompt/tool/cache revision; later
   changes rerun the set. Mocks are not live proof or confirmed-customer-data demonstration.

Mandatory inputs: confirmed `docs/specs/langgraph-financial-chat.md`, accepted decisions
0041-0054 and `docs/superpowers/plans/2026-10-08-financial-chat-master.md` plus all nine
stage files. Confirmed spec and accepted records win over stale plan wording.

## Tasks

Paths are exact or scoped globs. Each backend leaf's registry/gate paths are explicitly
listed in its row. Every backend test joins the gate's hermeticTests or dbTests partition.
Warehouse leaves join both test:hermetic/hermeticTests and test:warehouse-proof, skipping
explicitly without WAREHOUSE_DB_TEST=1; a skip is not executed DB proof. API controller
proof is hermetic with in-memory collaborators, not an AppModule boot. Truly app-DB-backed
leaves join test:db/dbTests and require separate disposable-DB execution before acceptance.
BASELINE and REGRESSION dual-DB leaves join hermeticTests/test:hermetic and the explicit
backend test:financial-chat-db-proof runner, owned by BASELINE. They skip without
FINANCIAL_CHAT_DUAL_DB_TEST=1. Every dual-DB leaf must then call BASELINE's shared typed
assertDisposableFinancialDatabases guard before any write, even when the flag is manually
set. It validates both resolved connections as 127.0.0.1:5434 warehouse and :5435 app;
flags never substitute for target validation. BASELINE owns the hermetic refusal test and
cross-platform tools/financial-chat-db-proof.mjs wrapper (covered by tools lint/format) to
set TS_NODE_PROJECT/transpile mode and launch the registered test runner. REGRESSION
appends its leaf/gate pin and calls the same guard; no copied safety check. Pure/provider/graph leaves join test:hermetic. All files are under backend/src so existing
strict typecheck and backendTests discovery apply. Real HTTP/database/browser acceptance
remains separate from fake-backed controller proof.

| ID            | Name                          | What it delivers                                                          | Covers  | Scope                                                                                                                                                                                                                                                                            | Tests                                                                                                                                                                                                                                                                                                                                                                                              | After                         | User-facing |
| ------------- | ----------------------------- | ------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------- |
| BASELINE      | Preserve existing outputs     | Independent source oracle and backend legacy baseline before changes      | 5       | `backend/src/financial-chat/financial-source-oracle.ts`, `backend/src/financial-chat/financial-report-baseline*`, `tools/financial-chat-db-proof.mjs`, `backend/src/financial-chat/financial-disposable-db.guard*`, `backend/package.json`, `tools/quality-gate.test.mjs`        | `backend/src/financial-chat/financial-report-baseline.test.ts`: unconditional generated-source oracle; gated real-source report/export/drill and in-process old-Ask HTTP parity with recorded provider override on disposable DBs; `backend/src/financial-chat/financial-disposable-db.guard.test.ts`: hermetic refusal of wrong hosts/ports, missing targets and manual-flag bypass before writes | none                          | no          |
| LEGACY-UI     | Preserve legacy screens       | Playwright setup and fixed legacy UI capture                              | 5       | `frontend/e2e/legacy-financial-baseline.spec.ts`, `frontend/playwright.config.ts`, `frontend/package.json`, `package.json`, `package-lock.json`, `tools/quality-gate.test.mjs`                                                                                                  | `frontend/e2e/legacy-financial-baseline.spec.ts`: existing report/export/drill screens and unchanged mock-provider Ask clarification on BASELINE snapshot; local generated and explicitly gated real-source runs on disposable DBs with recorded evidence, not CI                                                                                                                                  | BASELINE                      | no          |
| CONTRACT      | Define financial contracts    | Tool vocabulary, selection and input/output schemas with descriptions     | 1, 4, 6 | `contract/src/financial-tools.ts`, `contract/src/index.ts`, `contract/test/financial-tools.test.ts`, `contract/package.json`, `tools/quality-gate.test.mjs`                                                                                                                      | `contract/test/financial-tools.test.ts`: exact money, four strict tool schemas/descriptions, selection/catalog/result validation                                                                                                                                                                                                                                                                   | none                          | no          |
| RESPONSE      | Define presentation contracts | UI frames, capabilities, partial/synthetic, paging and typed error shapes | 3, 4, 6 | `contract/src/financial-chat.ts`, `contract/src/index.ts`, `contract/src/api.ts`, `contract/test/financial-chat.test.ts`, `contract/package.json`, `tools/quality-gate.test.mjs`                                                                                                 | `contract/test/financial-chat.test.ts`: strict output/UI props, money preservation, paging reasons, capabilities and frame schema crossing tool types                                                                                                                                                                                                                                              | CONTRACT                      | no          |
| TRANSPORT     | Prove compatibility           | Backend SDK/cache API and native fetch/ReadableStream crossing            | 3, 6    | `backend/src/financial-chat/stream-adapter*`, `frontend/src/features/financial-chat/financial-chat.transport*`, `package-lock.json`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                       | `backend/src/financial-chat/stream-adapter.test.ts`, `frontend/src/features/financial-chat/financial-chat.transport.test.ts`: real frame/render, CJS/Node20/React19/Zod and cancel                                                                                                                                                                                                                 | RESPONSE                      | no          |
| CONFIG        | Configure new model safely    | Central flag/model/key/retry/timeout config without changing old provider | 3, 5, 6 | `backend/src/config.ts`, `.env.example`, `backend/src/financial-chat/financial-model-config.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                                      | `backend/src/financial-chat/financial-model-config.test.ts`: hermetic safe startup with absent/invalid new settings, typed request refusal and unchanged old settings                                                                                                                                                                                                                              | RESPONSE                      | no          |
| SCHEMA        | Store source facts            | Eight additive tables and generation constraints                          | 5       | `backend/src/financial-data/financial-schema*`, `backend/drizzle-warehouse/*`, `backend/src/warehouse/warehouse-migrate.ts`, `backend/src/warehouse/warehouse-schema.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                    | `backend/src/financial-data/financial-schema.db.test.ts`: duplicates/orphans/cross-load refusal, exact generated values and migration twice                                                                                                                                                                                                                                                        | RESPONSE, BASELINE, LEGACY-UI | no          |
| ACTUAL-PARSER | Preserve Actual lines         | All columns, null dimensions and exact rounding                           | 5       | `backend/src/financial-data/financial-workbook.parser.ts`, `backend/src/financial-data/financial-actual.parser*`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                          | `backend/src/financial-data/financial-actual.parser.test.ts`: comments, missing dimensions, invalid date/money/duplicates and half-paise                                                                                                                                                                                                                                                           | SCHEMA                        | no          |
| BUDGET-PARSER | Preserve Budget leaves        | Monthly hierarchy/formula parsing and mapping seed                        | 1, 5    | `backend/src/financial-data/financial-workbook.parser.ts`, `backend/src/financial-data/financial-budget.parser*`, `backend/src/financial-data/financial-mapping.seed.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                  | `backend/src/financial-data/financial-budget.parser.test.ts`: repeated/missing GL, parent exclusion, cached formula failure and mapping collisions                                                                                                                                                                                                                                                 | ACTUAL-PARSER                 | no          |
| LOAD-REPO     | Activate generations          | Transactional writes, rollback, idempotency and retention                 | 5       | `backend/src/financial-data/financial-load.repository.ts`, `backend/src/financial-data/financial-load.db.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                         | `backend/src/financial-data/financial-load.db.test.ts`: duplicate/concurrent/failed/replacement loads and no generation mixing                                                                                                                                                                                                                                                                     | BUDGET-PARSER                 | no          |
| LOAD          | Import workbook               | Operator CLI, reconciliation and source-month metadata                    | 5       | `backend/src/financial-data/financial-loader*`, `backend/src/financial-data/financial-load.cli.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                                        | `backend/src/financial-data/financial-loader.test.ts`: Linux-safe argument handling of spaced paths (three Windows shells are manual ROLLOUT evidence), source sums, coverage/activation and month-set evidence                                                                                                                                                                                    | LOAD-REPO                     | no          |
| CATALOG       | Authorize vocabulary          | New catalog, current report/Plant checks and service seams                | 1, 3, 6 | `backend/src/financial-data/financial-data.module.ts`, `backend/src/financial-data/financial-data.service*`, `backend/src/financial-data/financial-access.service.ts`, `backend/src/financial-data/financial-catalog.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`  | `backend/src/financial-data/financial-data.service.test.ts`: no-report/no-Plants/revocation, scoped lookup and unsupported grouping, audit actor/nonfinancial scope/references/failure and no prompt/amount/row payload                                                                                                                                                                            | RESPONSE, LOAD                | no          |
| PREDICATE     | Pin contributing scope        | Shared parameterized summary/detail builder                               | 1, 4    | `backend/src/financial-data/financial-predicate*`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                                                                                         | `backend/src/financial-data/financial-predicate.db.test.ts`: filters/descendants/pins and no injection or mirrored semantics                                                                                                                                                                                                                                                                       | CATALOG                       | no          |
| QUERY         | Return exact comparisons      | Independent facts and complete/partial/missing groups                     | 1, 4    | `backend/src/financial-data/financial-query.repository.ts`, `backend/src/financial-data/financial-data.service.ts`, `backend/src/financial-data/financial-query.db.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                               | `backend/src/financial-data/financial-query.db.test.ts`: fan-out, Unmapped/missing GL, independent sums and all coverage states, all-known-Plants still excludes unknown-Plant rows                                                                                                                                                                                                                | PREDICATE                     | no          |
| TRENDS        | Return monthly changes        | FY/ranges, exact deltas, gaps and closing balance                         | 1, 2    | `backend/src/financial-data/financial-trend*`, `backend/src/financial-data/financial-query.repository.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                                 | `backend/src/financial-data/financial-trend.test.ts`: zero/negative/missing prior, April/cross-year, partial never delta and stored closing Roll-over                                                                                                                                                                                                                                              | QUERY                         | no          |
| DRILL         | Issue drill scopes            | Owner/cell/partial/total pins, cap and expiry                             | 3, 4    | `backend/src/financial-data/actual-drill-context*`, `backend/src/financial-data/financial-query.repository.ts`, `backend/src/financial-data/financial-data.service.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                    | `backend/src/financial-data/actual-drill-context.test.ts`: 200/201, dedup, owner/expiry/revocation and source identity                                                                                                                                                                                                                                                                             | TRENDS                        | no          |
| PAGES         | Read transactions             | Fixed continuation and exact full set/total                               | 4       | `backend/src/financial-data/actual-transactions.repository.ts`, `backend/src/financial-data/financial-data.service.ts`, `backend/src/financial-data/actual-drill.db.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                              | `backend/src/financial-data/actual-drill.db.test.ts`: 10-to-20 entire traversal, partial/zero-net, paging errors/reload/revocation                                                                                                                                                                                                                                                                 | DRILL                         | no          |
| MODEL         | Select questions              | Claude provider, trusted modules, static prefix and vendor errors         | 1, 6    | `backend/src/financial-chat/financial-selector.provider*`, `backend/src/financial-chat/financial-chat.tools.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                           | `backend/src/financial-chat/financial-selector.provider.test.ts`: schemas, prefix equality across grants, payload exclusions/cache misses and vendor errors, including captured retry/trace/log assertions that exclude money, rows, handles, batches, raw state and rendered answers                                                                                                                | CONFIG, TRANSPORT, CATALOG    | no          |
| MEMORY        | Bound state                   | Owner-local memory, limits and result membership                          | 3, 4    | `backend/src/financial-chat/financial-chat.state.ts`, `backend/src/financial-chat/financial-chat.memory*`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                                 | `backend/src/financial-chat/financial-chat.memory.test.ts`: isolation/capacity, refresh/restart, expiry/revocation, cancellation, and typed concurrent-run refusal that leaves the original run intact                                                                                                                                                                                              | MODEL                         | no          |
| GRAPH         | Clarify scope                 | LangGraph transitions and confirmed follow-ups                            | 1, 3, 6 | `backend/src/financial-chat/financial-chat.graph*`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                                                                                        | `backend/src/financial-chat/financial-chat.graph.test.ts`: no query before clarification, pending replies, month override, bounded rounds and causal refusal, prose-only/malformed/unknown-tool replies never become financial answers                                                                                                                                                             | MEMORY, TRENDS                | no          |
| ANSWER        | Prepare responses             | Deterministic answer/UI and bounded preparation                           | 1, 4, 6 | `backend/src/financial-chat/financial-chat.service*`, `backend/src/financial-chat/financial-answer.helper.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                             | `backend/src/financial-chat/financial-chat.service.test.ts`: exact partial/synthetic labels, ready before final, timeout failures and no rows back to model                                                                                                                                                                                                                                        | GRAPH, PAGES                  | no          |
| API           | Expose resources              | Owner-bound commands/state/pages, DTO/Swagger and reasons                 | 1, 3, 4 | `backend/src/financial-chat/financial-chat.controller*`, `backend/src/financial-chat/financial-chat.dto.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                               | `backend/src/financial-chat/financial-chat.controller.test.ts`: hermetic HTTP/controller auth/CSRF with in-memory collaborators, cross-conversation denial, paging metadata and errors                                                                                                                                                                                                             | ANSWER                        | no          |
| STREAM        | Deliver events                | Bounded authorized replay/cancel and deduplication                        | 3, 4, 6 | `backend/src/financial-chat/stream-adapter.ts`, `backend/src/financial-chat/financial-chat.stream.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                                | `backend/src/financial-chat/financial-chat.stream.test.ts`: lost ack/duplicate command, post-header error, expired/revoked replay and no late answer                                                                                                                                                                                                                                               | API                           | no          |
| CLIENT        | Connect React                 | Fresh scoped transport/state and safe retries                             | 3, 4    | `frontend/src/features/financial-chat/financial-chat.transport*`, `frontend/src/features/financial-chat/use-financial-chat*`                                                                                                                                                     | `frontend/src/features/financial-chat/financial-chat.transport.test.ts`, `frontend/src/features/financial-chat/use-financial-chat.test.tsx`: frames, one auth refresh/fresh CSRF and denied cache clearing                                                                                                                                                                                         | STREAM                        | no          |
| CHAT          | Build question UI             | Separate screen, pending choices and lifecycle states                     | 1, 3, 6 | `frontend/app/(app)/financial-chat/page.tsx`, `frontend/src/features/financial-chat/financial-chat.tsx`, `frontend/src/features/financial-chat/clarification-card.tsx`, `frontend/src/features/financial-chat/financial-chat.test.tsx`                                           | `frontend/src/features/financial-chat/financial-chat.test.tsx`: clarification/follow-up, stop/new chat, denied/no-Plants/restart and keyboard                                                                                                                                                                                                                                                      | CLIENT                        | yes         |
| VALUES        | Render finances               | Exact strings, partial/synthetic labels and gapped trends                 | 1, 2, 6 | `frontend/src/features/financial-chat/financial-result*`, `frontend/src/features/financial-chat/monthly-trend.tsx`, `frontend/src/components/ui/`                                                                                                                                | `frontend/src/features/financial-chat/financial-result.test.tsx`: large/negative money, missing/Unmapped labels, synthetic label, chart/table agreement and no arithmetic, Budget/Roll-over/percentage never clickable                                                                                                                                                                             | CHAT                          | yes         |
| DETAIL        | Open Actuals                  | Immediate accessible prepared panel and paging                            | 1, 3, 4 | `frontend/src/features/financial-chat/actual-transactions-panel*`                                                                                                                                                                                                                | `frontend/src/features/financial-chat/actual-transactions-panel.test.tsx`: no LLM click, partial/full total, refresh pinned size, failure/denial/focus                                                                                                                                                                                                                                             | VALUES                        | yes         |
| WIRING        | Enable feature safely         | Backend modules, runtime capabilities, routes and Swagger                 | 3, 5, 6 | `backend/src/financial-chat/financial-chat.module*`, `backend/src/financial-chat/financial-chat.capabilities.controller.ts`, `backend/src/app.module.ts`, `backend/src/app.routes.test.ts`, `backend/src/swagger.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | `backend/src/financial-chat/financial-chat.module.test.ts`, `backend/src/app.routes.test.ts`, `backend/src/swagger.test.ts`: dead-port scanner, per-request model failures, runtime capabilities and unchanged old routes                                                                                                                                                                          | DETAIL                        | no          |
| NAVIGATION    | Add independent entry         | Runtime-gated Financial Chat navigation without changing AskProvider      | 3, 5, 6 | `frontend/src/components/shell/app-shell.tsx`, `frontend/src/components/shell/app-shell.test.tsx`                                                                                                                                                                                | `frontend/src/components/shell/app-shell.test.tsx`: same-build flag toggle, no-report denial/no-Plants guidance and old Ask unchanged                                                                                                                                                                                                                                                              | WIRING                        | yes         |
| FIXTURES      | Isolate numeric proof         | Disposable real-loader synthetic and browser harness                      | 1, 4, 5 | `backend/src/financial-chat/financial-chat-fixtures*`, `frontend/e2e/financial-chat-fixtures.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                                          | `backend/src/financial-chat/financial-chat-fixtures.test.ts`: source/host/port refusal before writes and synthetic classification, no real certification                                                                                                                                                                                                                                           | NAVIGATION, LOAD, LEGACY-UI   | no          |
| BROWSER       | Prove chat journey            | Real-source coverage-dependent financial questions and partial drills     | 1, 2, 4 | `frontend/e2e/financial-chat-real-source.spec.ts`                                                                                                                                                                                                                                | `frontend/e2e/financial-chat-real-source.spec.ts`: D1-D12 on original real source with null complete Actual and labelled prepared partial values, Budget states and no inferred completeness                                                                                                                                                                                                       | FIXTURES                      | no          |
| SYNTHETIC     | Prove complete-data UI        | Labelled numeric/negative/zero/trend/drill and accessibility journeys     | 1, 2, 4 | `frontend/e2e/financial-chat-synthetic.spec.ts`                                                                                                                                                                                                                                  | `frontend/e2e/financial-chat-synthetic.spec.ts`: independent synthetic golden money, every partial/zero/detail/paging edge, 200/201, light/dark/mobile/keyboard and nonclickable Budget/%                                                                                                                                                                                                          | FIXTURES                      | no          |
| REGRESSION    | Prove preservation            | Old baseline parity and new restart/revocation/reload                     | 3, 5    | `frontend/e2e/financial-reports-regression.spec.ts`, `backend/src/financial-chat/financial-chat.acceptance.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`                                                                                                       | `frontend/e2e/financial-reports-regression.spec.ts`, `backend/src/financial-chat/financial-chat.acceptance.test.ts`: old Ask/import/export/drill flag on/off, restart, grants and pins                                                                                                                                                                                                             | BROWSER, SYNTHETIC, BASELINE  | no          |
| LIVE          | Validate final Claude         | Gated real probes and sanitized cache/payload proof                       | 1, 3, 6 | `backend/src/financial-chat/financial-chat.live-probe*`, `backend/package.json`, `tools/quality-gate.test.mjs`, `docs/context/financial-chat-vendor-prerequisites.md`                                                                                                            | `backend/src/financial-chat/financial-chat.live-probe.test.ts`: vendor/revision gate; manual real D1-D12 x3/follow-ups and measured cache tokens; blocked until owner records application model/account, billing and client retention/residency confirmation in that document                                                                                                                      | REGRESSION                    | no          |
| ROLLOUT       | Deliver runbook               | Verified evidence, enablement/rollback and limitations                    | 4, 5, 6 | `docs/superpowers/plans/financial-chat-acceptance-evidence.md`, `deployment/ec2/README.md`, `deployment/ec2/.env.example`, `docs/superpowers/plans/2026-10-08-financial-chat-*.md`                                                                                               | All named registered quality/typecheck/structural/hermetic/DB/browser/live gates and real CLI/runbook walk; manual Windows PowerShell/cmd/Git Bash real supplied-filename walks, not Linux CI                                                                                                                                                                                                      | LIVE                          | no          |

New moving parts: backend LangGraph and native React fetch transport and direct Anthropic packages (3/6); eight additive tables and independent import/read module in existing warehouse (1/5); bounded process-local conversation/drill state (3/4); local financial component map/shadcn presentation and Playwright only if absent (1/2/4/6). No DB server, vector store, queue, Agent Server, Deep Agents framework, external component hosting, OpenAI or Bedrock integration.

## Notes

- Stage map: 1 CONTRACT/RESPONSE/TRANSPORT; 2 SCHEMA; 3 ACTUAL-PARSER/BUDGET-PARSER/LOAD-REPO/LOAD;
  4 CATALOG/PREDICATE/QUERY/TRENDS; 5 DRILL/PAGES; 6 CONFIG/MODEL/MEMORY/GRAPH/ANSWER;
  7 API/STREAM/WIRING/NAVIGATION; 8 CLIENT/CHAT/VALUES/DETAIL; 9 BASELINE/LEGACY-UI/FIXTURES/BROWSER/
  SYNTHETIC/REGRESSION/LIVE/ROLLOUT. All master coverage rows remain mandatory.
- Aim around400 implementation lines/task. Split larger responsibilities before dispatch,
  amend builder section and cold-read again; no silent narrowing. Shared seams first, one
  crossing proof before consumers. CONTRACT and RESPONSE pin all master names/signatures; CATALOG
  exports FinancialDataService; PREDICATE exports ResolvedFinancialScope reused by detail.
- Tasks own only their appended leaf registrations and scoped manifest changes. Serialize all
  tasks touching shared manifests, package-lock.json or the quality gate, across frontend,
  backend and contract chains: merge one at a time and rebase onto earlier merged edits
  before close/merge. Regenerate the npm lockfile after rebasing dependency changes with
  npm install; never resolve it by textual merging. No concurrent shared-line edits/merges.
  UI uses existing Vitest discovery; LEGACY-UI owns Playwright/root wiring if absent;
  FIXTURES consumes that established harness. Native transport adds no frontend dependency.
- Start with intended failing boundary tests, then implement, run named owner/sibling checks,
  quality/typecheck/structural/hermetic. No duplicate private-helper proofs or test-only
  production exports. Fake vendors only. Named leaf must be observed executing.
- All truncating tests and synthetic writes use disposable Postgres16 at 127.0.0.1:5434
  warehouse/:5435 app, never live :5433/:5432. Confirm targets before writes. Test-owned
  harness calls real loader and guarded synthetic-only coverage setup; no production override.
- SCHEMA picks next migration/journal number after rebase, directory scope intentional.
  Never edit merged migrations/legacy schema. Constitution naming/API/Swagger/logging/errors
  apply, with accepted snake-case financial schema and exported-service wiring exceptions.
- TRANSPORT records exact command/frame/SDK mapping in stream-adapter.ts and crossing tests;
  compatibility failure stops dependent work, never authorizes Agent Server or wholesale upgrades.
  APIs use /api/v1/financial-conversations, with authenticated runtime GET
  /api/v1/financial-chat-capabilities. Controller verifies result membership in conversation;
  no hidden conversation argument is added to FinancialDataService.transactions.
- Reuse only shared auth/RBAC/CSRF/audit/config/logging/errors. No old prompts/selector/tools/
  executor/state/parser/UI copied/imported. AppShell's existing AskProvider stays untouched;
  independent chat owns new hook/context. Navigation edit is not old-chat cutover.
- Rebase on merged report/workbook work before tasks, inventory overlapping Ask stories,
  preserve dirty main edits and stable legacy snapshot. No default-branch commits/no-verify/
  gh pr merge/merge-policy changes. Shared manifests updated only for proven dependencies.
- Fake selector first; real vendor calls wait for owner preconditions. LIVE checks final
  prompt/tool/cache bytes; any later change invalidates and reruns all fresh probes.
- UI uses app-baseline and existing theme/shadcn/Recharts/accessibility. Template presentation
  only with MIT attribution, no gateway/AI SDK backend. Missing optional design skills are
  recorded with explicit bounded interaction/accessibility walk. No financial arithmetic in UI.
- Each ignored-file edit includes .prettierignore in scope, formats/removes its entry and
  records the removal in its header in the same change; no unrelated cleanup.
- Stop dev servers before builds/protect .next. Browser uses 127.0.0.1:3000 and fresh CSRF
  each POST. Hermetic uses scanner/loader not AppModule boot; PowerShell PGPORT and
  WAREHOUSE_PG_PORT=1 during proof, restore afterward.
- ROLLOUT claims only actual proof, no working-day estimate/new cloud infrastructure/
  production-readiness claim. Human story approval precedes coding; normal review/merge gates remain.

Decided: completeness process deferred, explicit real-source partial Actual not invented
certification (owner, 2026-10-08, 0054). Decided: trusted instructions/static-prefix caching
without another framework (owner, 2026-10-08, 0053).

### Review-pinned execution seams

- BASELINE captures the original supplied workbook checksum and restores a fixed legacy dataset
  through the unchanged existing ingestion API into disposable :5434/:5435. Save any pg_dump
  snapshot and customer data only in a validated task temporary directory outside Git; record
  checksum, load IDs and scopes as nonfinancial metadata. Restore the same snapshot for before/
  after comparisons, never substitute a new source. The pure generated-source oracle executes in CI with independent expected rows.
  Generated legacy database/UI baselines run locally on disposable DBs with recorded evidence,
  explicitly distinct from real-source proof; immutable CI has no browser/database execution.
  Backend old-Ask parity runs in-process in a disposable-DB integration test overriding only
  the LLM_PROVIDER token with recorded governed selections. No production provider switch,
  CoreModule edit or old-prompt copy is allowed. LEGACY-UI captures the existing mock-provider
  clarification path plus report/export/drill screens in Playwright; it does not claim recorded
  selection UI proof. REGRESSION replays each respective baseline unchanged after the feature.
  BASELINE pins FINANCIAL_CHAT_SOURCE_FILE as the test/operator input path (not required app
  config), records its SHA-256 and validates the same source for BROWSER, REGRESSION and
  ROLLOUT. The supplied source is external, never copied into Git. Without it, registered
  generated/synthetic cases still run; real-source cases explicitly skip with a reason and
  real-source acceptance stays pending. Never label synthetic runs as real-source proof.
  Repeated real runs validate the recorded hash; a changed file requires a new source identity.
- CONFIG first adds all FINANCIAL_CHAT_ENABLED/provider/model/key/retry/timeout keys in central
  config.ts and .env.example. Missing/invalid new-model config never prevents startup; it causes
  per-request typed refusal. No provider reads process.env directly. API/STREAM consume these
  keys; WIRING only registers backend modules/capabilities, NAVIGATION only the shell link.
- The React client uses native credentialed fetch/ReadableStream and shared typed frames,
  not a LangGraph React SDK. Backend LangGraph and direct Claude remain selected. TRANSPORT
  proves incremental frames, cancel/replay/CSRF/auth semantics; fixed local components remain
  the generative-UI presentation. No hosted Agent Server or extra frontend agent framework.
- LOAD's registered argument tests run on Linux with generated filenames containing spaces/
  parentheses. ROLLOUT manually records correctly quoted PowerShell/cmd/Git Bash commands
  with the real supplied workbook; it never expects these Windows shells in Linux CI.
- The project owner records vendor prerequisites in docs/context/financial-chat-vendor-prerequisites.md:
  application account/model access, billing approval and client processing/retention/residency
  confirmation, with date and evidence reference but no credentials. Until the owner records
  that confirmation, done-when 6, LIVE, ROLLOUT and final completion are blocked; decision 0051
  alone does not establish those prerequisites. Earlier hermetic/fixture implementation can proceed after story approval.
  LIVE refuses missing confirmation; no task can bypass the gate or mark mocks as live success.
- CATALOG audit proof asserts actor, nonfinancial resolved scope, opaque internal references
  and failure category without prompts, money, rows or raw handles. GRAPH rejects prose-only,
  malformed and unknown-tool replies before financial execution; QUERY excludes unknown-Plant
  rows even for all-known-Plants grants; VALUES/SYNTHETIC prove only Actual cells are clickable.
