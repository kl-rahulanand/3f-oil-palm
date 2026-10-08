# New Financial Chat Implementation Plan

> Expanded on 2026-10-08 into the [master coverage checklist](2026-10-08-financial-chat-master.md)
> and nine linked stage plans. Use that bundle for implementation detail; this document retains
> the original overview. Accepted decisions and the spec remain authoritative.

> **For agentic workers:** Use the repository's Forge story/task workflow for execution.
> Read this plan, its spec and the accepted decisions before editing code. This is a draft
> for owner review; it does not approve implementation or alter an already approved story.

**Goal:** Build the agreed financial chat, monthly trends and prepared Actual transaction
drill-down in TypeScript while preserving existing reports.

**Architecture:** A new NestJS financial-data module owns reads from the separate
`agent_financial` warehouse namespace. A new TypeScript LangGraph module handles conversation
state, clarification, governed tool selection and result preparation. Next.js renders locally
registered financial components adapted from the shadcn template. Auth/audit infrastructure is
shared; existing chat logic and report read paths are not used by the new agent.

**Tech stack:** Existing NestJS, Next.js 15, React 19, TypeScript, Drizzle/pg, Zod and Recharts;
LangGraph TypeScript with in-memory checkpoints; direct Anthropic Claude Sonnet 5.5; compatible
LangGraph React stream packages and shadcn components pinned after the first compatibility proof.

**Spec:** [langgraph-financial-chat.md](../../specs/langgraph-financial-chat.md).

## Global constraints

- Four tools: `get_financial_catalog`, `find_dimension_values`, `query_financials`,
  `get_actual_transactions`; one backend process, no separate tool services.
- All numbers originate in reconciled warehouse facts. Model inputs contain questions,
  sanitized conversational scope and permitted vocabulary, never server result bodies.
- Missing required scope clarifies. Known-Plant missing component mapping is Unmapped.
  Missing/unresolved Plant is Plant unknown and excluded from ordinary Plant answers.
- Current Nursery Budget owner is DUB. Missing Budget is null/not-loaded, distinct from zero.
  An Actual-only GL in a loaded Plant/month instead shows "No Budget line for this GL",
  null Budget and Not applicable percentage; its Actual and prepared transaction drill-down remain.
  Percentage uses matching totals; range Roll-over uses the closing month's stored balance.
- Keep legacy tables/views, ingestion contracts, report generation, exports and report drill
  reads intact. Implement the new loader from the original workbook, not legacy retained rows.
- Additive migrations only; no live TRUNCATE. Database proofs run on throwaway Postgres at
  warehouse port 5434 and app port 5435. Do not run those proofs on 5432/5433.
- Every new backend test leaf is registered in `backend/package.json` and pinned in
  `tools/quality-gate.test.mjs`. Any ignored existing file edited also includes `.prettierignore`
  removal/formatting in its scope. Required test execution is judged by named executed leaves.
- Before execution, rebase against the merged workbook/report changes and inventory overlapping
  Ask stories. The current main checkout has user edits; none may be overwritten or imported
  accidentally. Dependencies remain with the tasks whose end-to-end deliverables need them.

## Review focus

1. Same GL in several components must not duplicate Actual or Budget; only approved mapping joins.
2. Total Actual includes authorized Unmapped rows; Plant unknown rows still reconcile to source.
3. Missing one month of Budget must not produce a complete-looking range percentage or trend zero.
4. Follow-ups/pagination after a permission change must not expose stored unauthorized results.
5. A summary and transaction page must read the same source generation, including after reload.

The task tests below cover each case; these are the highest-risk cross-task checks for reviewers.

## Shared interfaces and implementation defaults

Define in `contract/src/financial-chat.ts`, exported from `contract/src/index.ts`:

- `FinancialSelection`: `measureIds`, `dimensionIds`, `plantIds`, `timeWindow`, typed dimension
  filters and optional approved measure comparisons; resolved time is explicit dates.
- `FinancialCatalog`: measures/dimensions, allowed combinations, fiscal calendar and limits.
- `FinancialQueryResult`: resolved `scope`, exact decimal-string rows/totals, coverage per
  Plant/month, optional month-to-month deltas, result ID and per-Actual drill-down references.
- `ActualTransactionPage`: `drilldownId`, transactions, `page`, `limit`, `totalItems`,
  `totalPages`, exact `matchingActualTotal`; page sum is never the overall total.
- `FinancialChatResponse`: discriminated `answer | clarification | unsupported | error`,
  `conversationId`, `turnId`, scope, approved UI blocks and prepared detail-page references.
- UI blocks: `FinancialTotal`, `FinancialComparison`, `MonthlyTrend`, `ClarificationCard`.
  Transaction details live in a result dictionary keyed by opaque handle, not repeated in
  every cell. The same handle can serve identical summary scopes.

Service signatures:
`getCatalog(userId): Promise<FinancialCatalog>`;
`findValues(userId, dimensionId, search): Promise<DimensionMatch[]>`;
`query(userId, FinancialSelection): Promise<FinancialQueryResult>`;
`transactions(userId, drilldownId, page, limit): Promise<ActualTransactionPage>`.
All services resolve current grants server-side; browser/model requests cannot supply grants.

PoC defaults to validate in Task 1: 2,000-character question; one active run per conversation;
199 visible aggregate rows plus complete totals; up to 200 first-page drill scopes per response,
including totals, following accepted decision 0051;
transaction first page 10 rows, subsequent page default 20/max 100; five bounded model/tool
selection rounds; one-hour idle conversation/handle expiry. Reject oversize selections and
ask to narrow grouping instead of silently truncating or omitting promised drill-downs.
Use opaque IDs and server-owned scope records. Existing configured model/query timeouts apply;
cancel prevents new work and stops writes, with in-flight SQL bounded by statement timeout.

At initial load, a component leaf represents one workbook GL row, so its fact grain is
`load + Plant + component leaf + month`; several GL rows under a parent are separate leaves.
Keep stable component key separate from the per-load hierarchy node ID. Use a parent-path,
source serial and GL/name identity with a uniqueness check; unresolved duplicate identities
fail validation instead of merging. Date/month fields are database-derived when feasible.

## Task 1: Pin contracts and prove TypeScript/React streaming compatibility

**Files:** `contract/src/financial-chat.ts`, `contract/src/index.ts`,
`contract/test/financial-chat.test.ts`; `backend/src/financial-chat/stream-adapter.ts`,
`backend/src/financial-chat/stream-adapter.test.ts`; package manifests/lock; test registries.

**Produces:** shared interfaces above and a selected, pinned stream API usable in the existing
CommonJS NestJS backend and React 19 frontend. Use `useStream` with a supported HTTP adapter
for custom NestJS endpoints. Do not copy Agent Server assumptions from the UI guide.

- [ ] Test strict input validation, decimal strings, missing-data states and protocol round-trip.
- [ ] Prove the selected LangGraph/React packages compile and a locally registered financial
      block travels backend-to-React. Pin compatible versions; no wholesale Tailwind/Next upgrade.
- [ ] Define protocol command/stream routes under `/api/v1/financial-conversations/:id`,
      permitted command types and mapping of terminal failures to the standard error envelope.
- [ ] Run contract tests and backend/frontend typechecks; commit the shared seam through Forge.

## Task 2: Add the separate warehouse schema

**Files:** `backend/src/financial-data/financial-schema.ts`, new additive migrations and journal
in `backend/drizzle-warehouse/` (choose next migration number after rebasing),
`backend/src/financial-data/financial-schema.db.test.ts`; test registries.

**Produces:** schema-qualified `agent_financial.financial_actual`, `nursery_budget`,
`nursery_budget_component`, `plant`, `cost_center`, `gl_account`, `actual_budget_mapping`
and `ingestion_batch`. Report tables and views stay unchanged.

- [ ] Test constraints against throwaway Postgres: duplicate line/leaf rejection, generated
      Actual/month, nullable unknown dimensions, hierarchy foreign keys and unique mapping targets.
- [ ] Add exact numeric columns, lookup/mapping keys, source evidence, indexed joins/filter
      coordinates and reconciliation/availability metadata. Scope Cost Center codes explicitly
      by source/Plant where required; never assume display names are globally unique.
- [ ] Record Budget coverage by Plant/month independently of whether any leaf has nonzero money.
- [ ] Apply migrations twice in the test warehouse; prove legacy table definitions unchanged.

## Task 3: Load and reconcile the real workbook through an independent path

**Files:** `backend/src/financial-data/financial-loader.ts`, `financial-workbook.parser.ts`,
`financial-load.repository.ts`, their tests, a loader CLI script and backend script registration;
new mapping seed definitions within this module; test registries.

**Consumes:** Task 2 schema. **Produces:** one reconciled PoC dataset from the source workbook.

- [ ] Test Actual parsing of all source columns, duplicate headers, missing dimensions, invalid
      money/dates and duplicate identities. Preserve all valid money rows and original evidence.
- [ ] Test Budget leaf classification and hierarchy, repeated GLs, monthly unpivoting, Payment
      Office, rollover flags and cached formula results. Missing numeric formula results must be
      reported; do not fabricate a financial figure to pass reconciliation.
- [ ] Load DUB Budget ownership explicitly, and approved mapping definitions with provenance
      and provisional status. Do not generate new business assignments from names at runtime.
- [ ] Compare source counts/Decimal totals to persisted rows by month. Refuse activation on
      mismatch; idempotent rerun of the same demo file must not accumulate duplicate facts.
- [ ] Preserve underlying source money in raw evidence. For source cells with more than two
      decimals, convert each cell to paise with explicit decimal half-away-from-zero rounding;
      reconcile the sum of those converted cells exactly and report the raw-versus-paise rounding
      difference separately. Never reconcile a sum rounded only at the end against per-cell rounding.
- [ ] Produce source and same-scope legacy-report reconciliation evidence. Explain differences
      caused by retained unknown dimensions; complete-source totals are not forced to legacy totals.

## Task 4: Govern totals, comparisons and monthly trends

**Files:** `backend/src/financial-data/financial-data.module.ts`, `financial-data.service.ts`,
`financial-catalog.ts`, `financial-query.repository.ts`, `financial-predicate.ts`,
`financial-query.db.test.ts`, `financial-data.service.test.ts`; test registries.

**Produces:** `getCatalog`, `findValues` and `query` service methods. The module exports its
service; controllers/agent never import its tables or repositories directly.

- [ ] Test access-scoped values and query results; missing/unknown Plant grants deny by default.
- [ ] Implement fixed SQL builders with parameterized predicates. Aggregate each fact side at
      the compatible requested grain before joining; attach Budget once and preserve Unmapped.
- [ ] Test explicit loaded-zero/missing-month states, aggregate percentage, parent totals,
      single month/range/FY YTD, closing-month Roll-over and monthly chart ordering/gaps.
- [ ] Calculate exact-money monthly deltas server-side; previous zero/negative/missing denominators
      yield unavailable percentage changes. Credits retain their source signs.
- [ ] Reject unsupported Budget groupings (e.g. Cost Center without approved allocation),
      log/audit refusals and enforce aggregate row limits without returning truncated totals.

## Task 5: Prepare and paginate exact Actual transaction sets

**Files:** `backend/src/financial-data/actual-transactions.repository.ts`,
`actual-drill-context.service.ts`, `actual-drill.db.test.ts`; update Task 4's service/query
result producer and shared predicates; test registries.

**Produces:** `transactions(userId, drilldownId, page, limit)` and server-issued handles.

- [ ] Test Plant/component/GL/month cells and overall totals against exact contributing lines.
- [ ] Share Task 4 predicates; pin source-load/mapping IDs and resolved dates in owner-scoped
      handles. Bind them to result/cell identity rather than accepting browser-provided SQL/filter JSON.
- [ ] Test full-set count/Actual against summary beyond page 1, stable ordering by posting date
      then transaction/line/internal ID, changed grants, cross-user handles, expiry and load replacement.
- [ ] Prepare one first page for each distinct clickable Actual scope. Deduplicate scopes;
      return typed detail failures rather than silently switching loads or claiming details are ready.

## Task 6: Build the TypeScript LangGraph agent and isolated memory

**Files:** `backend/src/financial-chat/financial-chat.module.ts`, `financial-chat.graph.ts`,
`financial-chat.state.ts`, `financial-chat.tools.ts`, `financial-selector.provider.ts`,
`financial-chat.service.ts`, graph/provider tests, `backend/package.json`, lock and registries.

**Consumes:** four data-service methods. **Produces:** `run(userId, conversationId, input,
signal)` and structured response/UI events, with server-owned conversation state.

- [ ] Test explicit scope, pending clarification, "now by GL", "same for August", ambiguous
      component names and date ranges, and fresh versus follow-up conversation behavior.
- [ ] Implement graph nodes: context/catalogue, select/resolve, clarify or validate, query,
      prepare transactions, deterministic answer/UI assembly. Register all four tools; never pass
      money/result/transaction tool messages back into the external model's history.
- [ ] Use ChatAnthropic with claude-sonnet-5-5 through the direct Anthropic API.
      Cap model output/tool rounds, distinguish malformed selection from unsupported,
      and validate every requested field before warehouse work.
- [ ] Apply decision 0053 through stage 6: trusted bundled financial instruction modules and
      explicit static instructions/tool-prefix caching, no additional agent framework. Dynamic
      context and financial results are never cached in that prefix. Memory, current authorization
      and warehouse-read rules remain independent; stages 1/9 prove SDK support and real usage.
- [ ] Use LangGraph's in-memory checkpointer; owner-bound IDs, idle expiry and one run per
      conversation. Restart makes unknown conversation IDs a clear context-expired response.
- [ ] Test provider payload exclusions with amount/transaction marker fixtures; test cancellation,
      loop exhaustion, changed grants and absence of data work while clarification is pending.

## Task 7: Expose authenticated conversation streaming and paging

**Files:** `backend/src/financial-chat/financial-chat.controller.ts`, DTO/schema files,
controller/stream tests, Task 1 adapter, `backend/src/app.module.ts`, config and `.env.example`,
route/Swagger tests, `frontend/src/features/financial-chat/financial-chat.transport.ts` and tests;
test registries. Any ignored file touched includes `.prettierignore` in scope.

- [ ] Add creation, state/resume, command, streaming and transaction-page resources using the
      Task 1 pinned protocol. NestJS enforces auth/CSRF and owner checks before subscribing/replay.
- [ ] Integrate existing exported session/RBAC/audit services; fresh code follows constitution
      envelopes/Swagger/logging. Use current configured backend grants; do not broaden legacy grants.
- [ ] Test cookies/CSRF rotation, one 401 refresh, malformed/unfinished stream, cancellation,
      cross-user state access, stale restart IDs and simultaneous runs with typed failure reasons.
- [ ] Register the new module and a demo feature flag; old report controllers continue to resolve.

## Task 8: Build the new shadcn chat, financial displays and transaction panel

**Files:** `frontend/app/(app)/financial-chat/page.tsx`,
`frontend/src/features/financial-chat/financial-chat.tsx`, `use-financial-chat.ts`,
`financial-result.tsx`, `monthly-trend.tsx`, `clarification-card.tsx`,
`actual-transactions-panel.tsx` and focused tests; selected shadcn components under
`frontend/src/components/ui/`; shell link, manifests/lock if needed.

- [ ] Adapt only the template presentation components and preserve its MIT attribution.
      Connect them to Task 7 transport; exclude the template's default AI Gateway agent/tools.
- [ ] Register the fixed UI component map locally. Render server decimal strings exactly with
      localized money/percentage formatting; charts may use numeric coordinates but labels/tooltips
      read the original exact values. No client calculation of financial totals.
- [ ] Test clarification answers, scope labels, new chat/refresh, trend-table equality, missing
      Budget gaps, zero values, Unmapped rows, prepared Actual clicks and further page loads.
- [ ] Show loading/error/empty states, per-detail failures and restart guidance. Provide keyboard
      access, table alternative to charts, named axes and mobile/light/dark layout checks.
- [ ] Present this new page behind the flag for the PoC. Existing report pages/dock stay intact;
      redirecting/removing old Ask awaits an explicit cutover story after demonstration.

## Task 9: Run the whole PoC and protect report generation

**Files:** `frontend/e2e/financial-chat.spec.ts`, `financial-reports-regression.spec.ts`,
Playwright config/dependency/script wiring if not already available on the rebased branch;
`backend/src/financial-chat/financial-chat.live-probe.ts`, demo proof documentation and
`deployment/ec2/README.md`. Stop dev servers while producing worker builds.

- [ ] First record existing report statement, export and report drill totals/structure for a
      fixed snapshot. Load the new schema and prove those outputs remain identical.
- [ ] Browser-test clarification, comparisons, 5-month trend, Actual click/pagination,
      unauthorized Plant, unknown-Plant exclusion, missing Budget and follow-ups with real API/DB.
- [ ] Independently reconcile new totals/transaction sets against source and golden SQL/Decimal
      oracles; do not validate a query only by calling its own builder again.
- [ ] Probe the real selected model: explicit month, range, FY YTD, trends, repeated GL/component,
      Unmapped, missing Budget, component clarification and detail questions. Run three fresh
      conversations per base question; test follow-ups in separately prepared conversations.
- [ ] Capture actual tool sequence, exclusions in model inputs, full financial equality and
      timings. Verify the response includes prepared detail pages before its final completion.
- [ ] Run `npm run quality`, `npm run typecheck`, `npm run structural`, registered hermetic
      suites with database ports deliberately unavailable, disposable DB proofs and browser tests.
      Verify named leaves executed. Update demo loading steps and restart/in-memory caveats.
- [ ] Enable only after proof passes. Rollback disables the new feature/module entry and retains
      the additive schema; no report restoration or destructive table rollback is needed.

## Execution order and approval

Tasks 1-3 establish the source-to-contract seam. Tasks 4-5 establish verified financial reads.
Tasks 6-8 deliver the new chat end to end. Task 9 proves the complete demo and report preservation.
Split these into smaller Forge task units at decomposition if a task exceeds its file/change
limits; keep contract/registry ownership explicit and avoid concurrent edits to shared files.

New moving parts: TypeScript LangGraph, its compatible React/protocol packages, needed shadcn
components and browser acceptance tooling if absent. No new database server, vector store,
hosted component service or durable chat store is introduced. The chosen direct-model adapter
is a new integration, not permission to add multiple providers or automatic vendor fallback.

The owner reviews this spec/plan. Once approved, confirm the spec, add its roadmap entry and
create the Forge story, cold-read until clean, and present its exact owner-facing text for
approval through Plan Mode as AGENTS.md requires. No implementation is authorized by this draft.

## References

- [Generative UI and client-side component registration](https://docs.langchain.com/langsmith/generative-ui-react).
- [shadcn chatbot template](https://github.com/shadcn-ui/chatbot-template).
- [Official custom React transport guide](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-react/docs/custom-transport.md).
- Decisions 0042, 0043, 0044, 0045 and 0046; the constitution; existing backend/frontend test registries.
