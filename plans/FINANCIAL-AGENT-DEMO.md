# New financial chat with monthly trends and traceable Actuals

30 parts · Risks: external model processing, incomplete coverage and integration compatibility · New moving parts: independent chat, additive warehouse tables and direct Claude integration

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

Paths are exact or scoped globs. For every row naming a backend test, its Scope additionally
includes `backend/package.json` and `tools/quality-gate.test.mjs` for that leaf's registration
and, for DB leaves, warehouse-proof routing. This addition applies to every such row.

| ID            | Name                       | What it delivers                                            | Covers  | Scope                                                                                                                                                                                                                                                                                                                             | Tests                                                                                                                                                                                                                                                             | After              | User-facing |
| ------------- | -------------------------- | ----------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| BASELINE      | Preserve existing outputs  | Independent source and fixed legacy baseline before changes | 5       | `backend/test/financial-source-oracle.ts`, `backend/test/financial-report-baseline*`                                                                                                                                                                                                                                              | `backend/test/financial-report-baseline.test.ts`: independent counts/money and report/export/drill capture                                                                                                                                                        | none               | no          |
| CONTRACT      | Define financial contracts | Strict tools, descriptions, UI/error/partial/paging types   | 1, 4, 6 | `contract/src/financial-chat.ts`, `contract/src/index.ts`, `contract/src/api.ts`, `contract/test/financial-chat.test.ts`, `contract/package.json`                                                                                                                                                                                 | `contract/test/financial-chat.test.ts`: exact money, strict fields, partial/synthetic and paging states                                                                                                                                                           | none               | no          |
| TRANSPORT     | Prove compatibility        | SDK imports, explicit cache API and custom stream crossing  | 3, 6    | `backend/src/financial-chat/stream-adapter*`, `frontend/src/features/financial-chat/financial-chat.transport*`, `frontend/package.json`, `package-lock.json`                                                                                                                                                                      | `backend/src/financial-chat/stream-adapter.test.ts`, `frontend/src/features/financial-chat/financial-chat.transport.test.ts`: real frame/render, CJS/Node20/React19/Zod and cancel                                                                                | CONTRACT           | no          |
| SCHEMA        | Store source facts         | Eight additive tables and generation constraints            | 5       | `backend/src/financial-data/financial-schema*`, `backend/drizzle-warehouse/`, `backend/src/warehouse/warehouse-migrate.ts`                                                                                                                                                                                                        | `backend/src/financial-data/financial-schema.db.test.ts`: duplicates/orphans/cross-load refusal, exact generated values and migration twice                                                                                                                       | CONTRACT, BASELINE | no          |
| ACTUAL-PARSER | Preserve Actual lines      | All columns, null dimensions and exact rounding             | 5       | `backend/src/financial-data/financial-workbook.parser.ts`, `backend/src/financial-data/financial-actual.parser*`                                                                                                                                                                                                                  | `backend/src/financial-data/financial-actual.parser.test.ts`: comments, missing dimensions, invalid date/money/duplicates and half-paise                                                                                                                          | SCHEMA             | no          |
| BUDGET-PARSER | Preserve Budget leaves     | Monthly hierarchy/formula parsing and mapping seed          | 1, 5    | `backend/src/financial-data/financial-workbook.parser.ts`, `backend/src/financial-data/financial-budget.parser*`, `backend/src/financial-data/financial-mapping.seed.ts`                                                                                                                                                          | `backend/src/financial-data/financial-budget.parser.test.ts`: repeated/missing GL, parent exclusion, cached formula failure and mapping collisions                                                                                                                | ACTUAL-PARSER      | no          |
| LOAD-REPO     | Activate generations       | Transactional writes, rollback, idempotency and retention   | 5       | `backend/src/financial-data/financial-load.repository.ts`, `backend/src/financial-data/financial-load.db.test.ts`                                                                                                                                                                                                                 | `backend/src/financial-data/financial-load.db.test.ts`: duplicate/concurrent/failed/replacement loads and no generation mixing                                                                                                                                    | BUDGET-PARSER      | no          |
| LOAD          | Import workbook            | Operator CLI, reconciliation and source-month metadata      | 5       | `backend/src/financial-data/financial-loader*`, `backend/src/financial-data/financial-load.cli.ts`                                                                                                                                                                                                                                | `backend/src/financial-data/financial-loader.test.ts`: quoted paths, source sums, coverage/activation and month-set evidence                                                                                                                                      | LOAD-REPO          | no          |
| CATALOG       | Authorize vocabulary       | New catalog, current report/Plant checks and service seams  | 1, 3, 6 | `backend/src/financial-data/financial-data.module.ts`, `backend/src/financial-data/financial-data.service*`, `backend/src/financial-data/financial-access.service.ts`, `backend/src/financial-data/financial-catalog.ts`                                                                                                          | `backend/src/financial-data/financial-data.service.test.ts`: no-report/no-Plants/revocation, scoped lookup and unsupported grouping                                                                                                                               | CONTRACT, LOAD     | no          |
| PREDICATE     | Pin contributing scope     | Shared parameterized summary/detail builder                 | 1, 4    | `backend/src/financial-data/financial-predicate*`                                                                                                                                                                                                                                                                                 | `backend/src/financial-data/financial-predicate.db.test.ts`: filters/descendants/pins and no injection or mirrored semantics                                                                                                                                      | CATALOG            | no          |
| QUERY         | Return exact comparisons   | Independent facts and complete/partial/missing groups       | 1, 4    | `backend/src/financial-data/financial-query.repository.ts`, `backend/src/financial-data/financial-data.service.ts`, `backend/src/financial-data/financial-query.db.test.ts`                                                                                                                                                       | `backend/src/financial-data/financial-query.db.test.ts`: fan-out, Unmapped/missing GL, independent sums and all coverage states                                                                                                                                   | PREDICATE          | no          |
| TRENDS        | Return monthly changes     | FY/ranges, exact deltas, gaps and closing balance           | 1, 2    | `backend/src/financial-data/financial-trend*`, `backend/src/financial-data/financial-query.repository.ts`                                                                                                                                                                                                                         | `backend/src/financial-data/financial-trend.test.ts`: zero/negative/missing prior, April/cross-year, partial never delta and stored closing Roll-over                                                                                                             | QUERY              | no          |
| DRILL         | Issue drill scopes         | Owner/cell/partial/total pins, cap and expiry               | 3, 4    | `backend/src/financial-data/actual-drill-context*`, `backend/src/financial-data/financial-query.repository.ts`, `backend/src/financial-data/financial-data.service.ts`                                                                                                                                                            | `backend/src/financial-data/actual-drill-context.test.ts`: 200/201, dedup, owner/expiry/revocation and source identity                                                                                                                                            | TRENDS             | no          |
| PAGES         | Read transactions          | Fixed continuation and exact full set/total                 | 4       | `backend/src/financial-data/actual-transactions.repository.ts`, `backend/src/financial-data/financial-data.service.ts`, `backend/src/financial-data/actual-drill.db.test.ts`                                                                                                                                                      | `backend/src/financial-data/actual-drill.db.test.ts`: 10-to-20 entire traversal, partial/zero-net, paging errors/reload/revocation                                                                                                                                | DRILL              | no          |
| MODEL         | Select questions           | Fresh Claude provider, instructions and static cache        | 1, 6    | `backend/src/financial-chat/financial-selector.provider*`, `backend/src/financial-chat/financial-chat.tools.ts`                                                                                                                                                                                                                   | `backend/src/financial-chat/financial-selector.provider.test.ts`: schemas, prefix equality across grants, payload exclusions/cache misses and vendor errors                                                                                                       | TRANSPORT, CATALOG | no          |
| MEMORY        | Bound state                | Owner-local memory, limits and result membership            | 3, 4    | `backend/src/financial-chat/financial-chat.state.ts`, `backend/src/financial-chat/financial-chat.memory*`                                                                                                                                                                                                                         | `backend/src/financial-chat/financial-chat.memory.test.ts`: isolation/capacity, refresh/restart, expiry/revocation and cancellation                                                                                                                               | MODEL              | no          |
| GRAPH         | Clarify scope              | LangGraph transitions and confirmed follow-ups              | 1, 3, 6 | `backend/src/financial-chat/financial-chat.graph*`                                                                                                                                                                                                                                                                                | `backend/src/financial-chat/financial-chat.graph.test.ts`: no query before clarification, pending replies, month override, bounded rounds and causal refusal                                                                                                      | MEMORY, TRENDS     | no          |
| ANSWER        | Prepare responses          | Deterministic answer/UI and bounded preparation             | 1, 4, 6 | `backend/src/financial-chat/financial-chat.service*`, `backend/src/financial-chat/financial-answer.helper.ts`                                                                                                                                                                                                                     | `backend/src/financial-chat/financial-chat.service.test.ts`: exact partial/synthetic labels, ready before final, timeout failures and no rows back to model                                                                                                       | GRAPH, PAGES       | no          |
| API           | Expose resources           | Owner-bound commands/state/pages, DTO/Swagger and reasons   | 1, 3, 4 | `backend/src/financial-chat/financial-chat.controller*`, `backend/src/financial-chat/financial-chat.dto.ts`                                                                                                                                                                                                                       | `backend/src/financial-chat/financial-chat.controller.test.ts`: real HTTP auth/CSRF, cross-conversation denial, paging metadata and errors                                                                                                                        | ANSWER             | no          |
| STREAM        | Deliver events             | Bounded authorized replay/cancel and deduplication          | 3, 4, 6 | `backend/src/financial-chat/stream-adapter.ts`, `backend/src/financial-chat/financial-chat.stream.test.ts`                                                                                                                                                                                                                        | `backend/src/financial-chat/financial-chat.stream.test.ts`: lost ack/duplicate command, post-header error, expired/revoked replay and no late answer                                                                                                              | API                | no          |
| CLIENT        | Connect React              | Fresh scoped transport/state and safe retries               | 3, 4    | `frontend/src/features/financial-chat/financial-chat.transport*`, `frontend/src/features/financial-chat/use-financial-chat*`                                                                                                                                                                                                      | `frontend/src/features/financial-chat/financial-chat.transport.test.ts`, `frontend/src/features/financial-chat/use-financial-chat.test.tsx`: frames, one auth refresh/fresh CSRF and denied cache clearing                                                        | STREAM             | no          |
| CHAT          | Build question UI          | Separate screen, pending choices and lifecycle states       | 1, 3, 6 | `frontend/app/(app)/financial-chat/page.tsx`, `frontend/src/features/financial-chat/financial-chat.tsx`, `frontend/src/features/financial-chat/clarification-card.tsx`, `frontend/src/features/financial-chat/financial-chat.test.tsx`                                                                                            | `frontend/src/features/financial-chat/financial-chat.test.tsx`: clarification/follow-up, stop/new chat, denied/no-Plants/restart and keyboard                                                                                                                     | CLIENT             | yes         |
| VALUES        | Render finances            | Exact strings, partial/synthetic labels and gapped trends   | 1, 2, 6 | `frontend/src/features/financial-chat/financial-result*`, `frontend/src/features/financial-chat/monthly-trend.tsx`, `frontend/src/components/ui/`                                                                                                                                                                                 | `frontend/src/features/financial-chat/financial-result.test.tsx`: large/negative money, missing/Unmapped labels, synthetic label, chart/table agreement and no arithmetic                                                                                         | CHAT               | yes         |
| DETAIL        | Open Actuals               | Immediate accessible prepared panel and paging              | 1, 3, 4 | `frontend/src/features/financial-chat/actual-transactions-panel*`                                                                                                                                                                                                                                                                 | `frontend/src/features/financial-chat/actual-transactions-panel.test.tsx`: no LLM click, partial/full total, refresh pinned size, failure/denial/focus                                                                                                            | VALUES             | yes         |
| WIRING        | Enable feature safely      | Modules/config/runtime flag/access/navigation               | 3, 5, 6 | `backend/src/financial-chat/financial-chat.module*`, `backend/src/financial-chat/financial-chat.capabilities.controller.ts`, `backend/src/app.module.ts`, `backend/src/config.ts`, `.env.example`, `backend/src/app.routes.test.ts`, `backend/src/swagger.test.ts`, `frontend/src/components/shell/app-shell*`, `.prettierignore` | `backend/src/financial-chat/financial-chat.module.test.ts`, `backend/src/app.routes.test.ts`, `backend/src/swagger.test.ts`, `frontend/src/components/shell/app-shell.test.tsx`: dead-port scanner, missing-model request failure, one-build flags and old routes | DETAIL             | yes         |
| FIXTURES      | Isolate numeric proof      | Disposable real-loader synthetic and browser harness        | 1, 4, 5 | `backend/test/financial-chat-fixtures*`, `frontend/playwright.config.ts`, `frontend/e2e/financial-chat-fixtures.ts`, `frontend/package.json`, `package.json`, `package-lock.json`                                                                                                                                                 | `backend/test/financial-chat-fixtures.test.ts`: source/host/port refusal before writes and synthetic classification, no real certification                                                                                                                        | WIRING, LOAD       | no          |
| BROWSER       | Prove chat journey         | Real API/DB/browser financial and detail flows              | 1, 2, 4 | `frontend/e2e/financial-chat.spec.ts`                                                                                                                                                                                                                                                                                             | `frontend/e2e/financial-chat.spec.ts`: real-source D1-D12 outcomes and synthetic numeric/negative/zero/partial, paging, themes/mobile/keyboard                                                                                                                    | FIXTURES           | no          |
| REGRESSION    | Prove preservation         | Old baseline parity and new restart/revocation/reload       | 3, 5    | `frontend/e2e/financial-reports-regression.spec.ts`, `backend/test/financial-chat.acceptance.test.ts`                                                                                                                                                                                                                             | `frontend/e2e/financial-reports-regression.spec.ts`, `backend/test/financial-chat.acceptance.test.ts`: old Ask/import/export/drill flag on/off, restart, grants and pins                                                                                          | BROWSER, BASELINE  | no          |
| LIVE          | Validate final Claude      | Gated real probes and sanitized cache/payload proof         | 1, 3, 6 | `backend/src/financial-chat/financial-chat.live-probe*`                                                                                                                                                                                                                                                                           | `backend/src/financial-chat/financial-chat.live-probe.test.ts`: vendor/revision gate; manual real D1-D12 x3/follow-ups and measured cache tokens                                                                                                                  | REGRESSION         | no          |
| ROLLOUT       | Deliver runbook            | Verified evidence, enablement/rollback and limitations      | 4, 5, 6 | `docs/superpowers/plans/financial-chat-acceptance-evidence.md`, `deployment/ec2/README.md`, `deployment/ec2/.env.example`, `docs/superpowers/plans/2026-10-08-financial-chat-*.md`                                                                                                                                                | All named registered quality/typecheck/structural/hermetic/DB/browser/live gates and real CLI/runbook walk                                                                                                                                                        | LIVE               | no          |

New moving parts: pinned LangGraph/React transport and direct Anthropic packages (3/6); eight additive tables and independent import/read module in existing warehouse (1/5); bounded process-local conversation/drill state (3/4); local financial component map/shadcn presentation and Playwright only if absent (1/2/4/6). No DB server, vector store, queue, Agent Server, Deep Agents framework, external component hosting, OpenAI or Bedrock integration.

## Notes

- Stage map: 1 CONTRACT/TRANSPORT; 2 SCHEMA; 3 ACTUAL-PARSER/BUDGET-PARSER/LOAD-REPO/LOAD;
  4 CATALOG/PREDICATE/QUERY/TRENDS; 5 DRILL/PAGES; 6 MODEL/MEMORY/GRAPH/ANSWER;
  7 API/STREAM/WIRING; 8 CLIENT/CHAT/VALUES/DETAIL; 9 BASELINE/FIXTURES/BROWSER/
  REGRESSION/LIVE/ROLLOUT. All master coverage rows remain mandatory.
- Aim around400 implementation lines/task. Split larger responsibilities before dispatch,
  amend builder section and cold-read again; no silent narrowing. Shared seams first, one
  crossing proof before consumers. CONTRACT pins all master names/signatures; CATALOG
  exports FinancialDataService; PREDICATE exports ResolvedFinancialScope reused by detail.
- Backend tasks own only their appended leaf registrations in package/quality gate/proof
  routing. Coordinate/rebase shared registry edits at merge. CONTRACT owns contract registry;
  UI uses existing Vitest discovery; FIXTURES owns Playwright/root wiring if absent.
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
