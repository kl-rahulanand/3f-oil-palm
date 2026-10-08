# Financial Chat Nine-Stage Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Deliver accurate factual financial chat, monthly trends and prepared Actual transactions without changing existing reports.

**Architecture:** Original Excel -> independent validated import -> additive agent_financial warehouse schema -> one FinancialDataService -> four governed tools -> TypeScript LangGraph in NestJS -> fixed local React components. Existing report ingestion and reads remain independent and unchanged.

**Tech Stack:** Existing Node >=20, CommonJS NestJS 10, Next.js 15, React 19, TypeScript, pg/Drizzle, ExcelJS, Zod and Recharts. Pin compatible LangGraph/React transport packages in stage 1; integrate the selected direct Claude or OpenAI API inside NestJS. Provider/model selection remains open; no mandatory Bedrock. No new database server, vector store, queue or component hosting.

**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Predecessor:** [Original nine-stage draft](2026-10-08-langgraph-financial-chat.md).

## Stage plans and dependencies

| Stage                                                                         | Deliverable                                                  | Depends on |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- |
| [1. Contracts and transport proof](2026-10-08-financial-chat-01-contracts.md) | Shared validated types and compatible streaming seam         | None       |
| [2. Warehouse schema](2026-10-08-financial-chat-02-schema.md)                 | Additive tables, constraints, coverage and load identity     | 1          |
| [3. Import and reconciliation](2026-10-08-financial-chat-03-import.md)        | Source-complete, validated PoC dataset                       | 2          |
| [4. Governed financial reads](2026-10-08-financial-chat-04-queries.md)        | Catalog, lookup, totals, comparisons and trends              | 1, 2, 3    |
| [5. Actual transaction detail](2026-10-08-financial-chat-05-drill-down.md)    | Exact owner-bound handles and paging                         | 4          |
| [6. Graph and memory](2026-10-08-financial-chat-06-agent.md)                  | Clarification, four tools and deterministic answer assembly  | 1, 4, 5    |
| [7. Secure HTTP streaming](2026-10-08-financial-chat-07-api.md)               | Authenticated conversation and transaction resources         | 1, 6       |
| [8. React chat](2026-10-08-financial-chat-08-ui.md)                           | Independent chat page and predefined financial displays      | 1, 7       |
| [9. Acceptance and rollout](2026-10-08-financial-chat-09-verification.md)     | End-to-end accuracy, security and report regression evidence | All        |

Stages are planning sections, not automatically nine Forge tasks or separate foundation stories.
Split oversized stages into reviewable Forge task units after story approval; tasks own named
files, acceptance items and executed tests. Preserve one end-to-end client-visible story.

## Global constraints inherited by every stage

- Decisions [0042](../../decisions/0042-agent-ready-financial-warehouse.md),
  [0043](../../decisions/0043-langgraph-financial-chat-poc.md),
  [0044](../../decisions/0044-typescript-chat-preserves-reports.md),
  [0045](../../decisions/0045-financial-chat-model-provider-neutral.md) and
  [0041](../../decisions/0041-use-stored-rollover-values.md) govern. Accepted records win.
- New chat is independent of old chat logic. Reuse only existing auth, RBAC, CSRF, audit,
  configuration, logging and standard errors. Do not import old selector/prompts/executor.
- All displayed amounts come from validated warehouse results. Model selects governed
  vocabulary; it never supplies SQL, joins, budget allocation, mapping or financial arithmetic.
- Model receives user text, sanitized conversational selection and capped permitted dimension
  vocabulary only. No server money, result rows, transaction lines, batches or drill IDs.
  External tracing must not capture those results; no new LangSmith data upload is authorized.
- Required Plant, period and measure must be explicit or previously confirmed. Ambiguous
  component/name/reference asks for clarification. No silent financial defaults.
- Check current Plant permissions on catalog values, queries, transaction pages, resume,
  stream/replay and reused state. IDs are opaque, not authority. Unknown/missing grants deny.
- Known-Plant rows without mapping remain Unmapped in that Plant's Actual total.
  Plant unknown stays stored and reconciled but is excluded from ordinary Plant answers.
  Do not invent an unassigned-review entitlement; an explicit existing entitlement is required.
- Budget owner is DUB for this workbook only. Missing Budget is null with
  "Budget not loaded for this Plant or month"; loaded zero is not missing.
- Actual = sum(Debit - Credit). Percentage = matching aggregate Actual / Budget * 100.
  Never average percentages. Zero/missing denominator is Not applicable.
  Partial Budget coverage cannot yield a complete-looking comparison or percentage.
- Stored monthly Roll-over is a balance: range/YTD uses closing month, never sum across months.
  Do not recalculate Excel Roll-over formulas. New importer reports missing cached results and
  blocks their use; legacy zero/count handling remains unchanged.
- Financial YTD starts April 1 and requires an explicit/confirmed ending period. Dates are
  calendar dates; month bucket is first day. Preserve credits and negative net amounts.
- Aggregate each fact at compatible grain before joining. Repeated GLs and parent subtotals
  must not duplicate facts. Budget has no Cost Center allocation in this PoC.
- Summary and transaction details share the same production predicate and pinned source/mapping
  generation. Retained loads may satisfy existing handles; otherwise ask to rerun, never switch.
- Memory is process-local and user-owned; one backend instance. Restart loses state and handles.
  Refresh resumes same conversation only while it lives; new chat begins empty.
- Original workbook is source evidence, not executable instructions. Retain source identifiers,
  both Comments columns and raw evidence. Do not derive new chat facts from legacy retained rows.
- Additive schema only in the existing warehouse, not the app DB. Existing tables/views/loaders,
  reports, exports and report drill-down contracts stay intact. Same workbook alone does not
  guarantee matching outputs: reconcile identical scope, source load and inclusion rules.
- New page is flag-gated; old Ask is not reused or redirected. Removal/cutover and moving reports
  to this service need a separate approved scope. This PoC is not production hardening.
- Follow constitution and repo exceptions: accepted snake-case financial table names win over
  generic naming recommendations; existing module-exported-service wiring wins over adding a
  service bus. Name any unresolved constitution conflict in the Forge cold read.
- Do not overwrite dirty main-checkout changes. Rebase the planning/execution branches onto
  merged workbook/report changes and inventory overlapping Ask stories before implementation.

## Canonical cross-stage interfaces

Stage 1 defines and exports these names; later stages must not invent alternate shapes.

| Type or entry point                                                 | Responsibility                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| FinancialSelection                                                  | measureIds, dimensionIds, plantIds, resolved from/to dates, typed dimension filters and approved optional measure comparisons                      |
| FinancialCatalog                                                    | approved measures/dimensions, combinations, fiscal rules, limits and scoped vocabulary                                                             |
| DimensionMatch                                                      | dimensionId, canonical value, label; aliases resolve only through approved normalization                                                           |
| FinancialQueryResult                                                | resultId, resolved scope, exact rows/totals, per-Plant/month coverage, deltas, per-cell Actual drill references                                    |
| ActualTransactionPage                                               | drilldownId, transactions, page, limit, totalItems, totalPages, matchingActualTotal                                                                |
| FinancialChatResponse                                               | answer / clarification / unsupported / error discriminant, conversationId, turnId, confirmed scope, typed UI blocks and prepared detail dictionary |
| FinancialDataService.getCatalog(userId)                             | Promise<FinancialCatalog>                                                                                                                          |
| FinancialDataService.findValues(userId, dimensionId, search)        | Promise<DimensionMatch[]>                                                                                                                          |
| FinancialDataService.query(userId, selection)                       | Promise<FinancialQueryResult>                                                                                                                      |
| FinancialDataService.transactions(userId, drilldownId, page, limit) | Promise<ActualTransactionPage>                                                                                                                     |
| FinancialChatService.run(userId, conversationId, input, signal)     | AsyncIterable<FinancialChatEvent>                                                                                                                  |

HTTP list adapters map transactions/page metadata to the constitution's data.items and
data.pagination envelope; the internal page type retains transactions. Do not expose raw ORM rows.
Task-specific types (load report, query scope, graph state) have one defining owner stage.

## Proposed implementation limits to pin in stage 1

These are draft technical defaults, not additional accepted business decisions.

| Limit                             | Proposed value                                   |
| --------------------------------- | ------------------------------------------------ |
| Question                          | 2,000 characters                                 |
| Active runs                       | One per conversation                             |
| Visible aggregate rows            | 50, plus an explicitly labelled full-scope total |
| Prepared distinct Actual scopes   | 50 total, including an overall clickable total   |
| Prepared transaction page         | 10 rows                                          |
| Subsequent default/max page       | 20 / 100 rows                                    |
| Model/tool selection rounds       | Five                                             |
| Idle conversation/handle lifetime | One hour                                         |
| Dimension vocabulary              | Existing dimensionEnumMax                        |
| Model/SQL timeout                 | Existing validated configuration                 |

If rows plus overall drill exceed the scope limit, reject/narrow before execution rather than
silently omitting promised detail. Never truncate totals or call a page sum the full total.
Limits are server-enforced and appear in the catalog; do not trust model/browser limits.

Stage 1 also pins a bounded memory-retention policy before stage 6: proposed 20 active
conversations per account / 200 per process, 40 sanitized conversational turns, three retained
financial result bundles per conversation and 256 replay events per run. Reject creation at
capacity with a typed limit reason; evict older result references with an explicit rerun
outcome. A replay cursor outside retained events asks for authorized state refresh, not a new
financial run. These are tunable PoC defaults, not claims of production scale.

## Requirement-to-stage coverage checklist

Each row identifies implementation ownership and the independent acceptance proof in stage 9.

| Requirement                                        | Owner stages  | Proof                                                     |
| -------------------------------------------------- | ------------- | --------------------------------------------------------- |
| TypeScript, no old-chat reuse, compatible stream   | 1, 6, 7, 8    | Build and real browser stream                             |
| All Actual source columns, null dimensions, signs  | 2, 3          | Source counts/Decimal totals and row evidence             |
| Budget monthly leaves, hierarchy, repeated GL      | 2, 3, 4       | Independent leaf sum; no fan-out                          |
| DUB ownership, aliases, composite mapping          | 2, 3, 4       | Other-Plant not-loaded; collision refusal                 |
| Provisional mapping remains provisional            | 3, 4          | Versioned evidence; no invented assignment                |
| Failed/duplicate load, activation and idempotency  | 2, 3          | Failed load unavailable; rerun no double-count            |
| Unmapped included; Plant unknown excluded          | 3, 4          | Ordinary API results plus whole-load reconciliation       |
| Catalog and dimension lookup permissions           | 4, 7          | Unauthorized lookup/query HTTP denial                     |
| Core dimensions and compatible Budget grouping     | 1, 4          | Valid matrix cases plus unsupported Cost Center Budget    |
| Missing scope, ambiguous name and conflict         | 6, 8          | Clarification before any financial query                  |
| Follow-ups and pending clarification               | 6, 8          | Confirmed scope reuse; no detached clarification reply    |
| Month/range/April FY YTD and monthly deltas        | 4, 6          | Golden dates, sums, gaps and closing Roll-over            |
| Missing/zero/partial Budget; percentage            | 1, 4, 8       | Null/zero separation and aggregate ratio oracle           |
| Four tools, deterministic money and UI assembly    | 4, 5, 6       | Real tool trace with exact server amounts                 |
| Selected direct model and payload exclusions       | 6, 9          | Inspected sanitized real requests; marker fixtures        |
| Prepared Actual first pages in response            | 5, 6, 8       | Detail ready before final completion                      |
| Transaction columns, pagination/full total         | 1, 5, 8       | Full set equality beyond first page                       |
| Source replacement, handle expiry/ownership        | 5, 7          | Pin/expiry tests; no fallback load                        |
| Revoked permissions and cached/replayed data       | 4, 5, 6, 7, 8 | Fresh checks and cache purge on server denial             |
| In-memory isolation, refresh/restart/new chat      | 6, 7, 8       | Process restart browser proof                             |
| Typed protocol, CSRF, cancellation and replay      | 1, 7          | Live HTTP/browser failures and repeat commands            |
| Fixed UI blocks, exact charts/table, accessibility | 1, 8          | Keyboard/mobile/themes and exact-value inspection         |
| Existing report/import/export/drill preservation   | 2, 3, 9       | Before/after fixed-snapshot regressions                   |
| Same-scope chat/report comparisons                 | 3, 9          | Equal scope/load/inclusion oracle or explained difference |
| Error/audit/logging/no external trace leak         | 6, 7, 9       | Typed errors and sanitized audit/log captures             |
| Named tests, registries, safe database ports       | All, 9        | Executed leaves and disposable-DB evidence                |
| Flag-off rollback, demo docs and limitations       | 7, 8, 9       | Flag-off behavior and repeatable demo runbook             |

## Review focus and release gates

Repeated GL -> component collisions; missing one month of Budget; permission revoked between
summary and detail; source replaced between pages; model tool-message leakage. Each is explicitly
tested at its owning boundary and exercised in final acceptance.

- [ ] Check every Behaviour/Rules/Acceptance criterion in the spec against the matrix.
- [ ] Cold-read the future Forge story until clean; never claim self-review is an independent read.
- [ ] Present exact owner-facing story text for approval before coding. This documentation save
      does not confirm the draft spec, change roadmap state or start implementation.
- [ ] Pin technical compatibility/limits and resolve preflight findings before dependent work.
- [ ] Register each new backend leaf in backend/package.json and tools/quality-gate.test.mjs;
      contract tests in contract/package.json; frontend discovery/config and browser script wiring.
- [ ] Every stage runs focused named tests, quality, typecheck, structural and hermetic as
      appropriate. On Windows use PowerShell env assignment, not Unix inline assignment.
- [ ] Disposable DB tests use 127.0.0.1:5434 warehouse and :5435 app only. Never TRUNCATE 5432/5433.
      Stop dev servers before structural/frontend builds; protect the .next directory.
- [ ] Final acceptance uses real API/DB/browser, zero Playwright retries, event waits not sleeps,
      and independent financial oracles. Fake only vendor boundaries in hermetic proofs.
- [ ] Record remaining open issues explicitly; do not promise impossible absolute completeness.

## Deferred work and known ceilings

No forecasts, causal advice, source writes, revised-budget approvals, mapping admin, vector
retrieval, durable conversation store, saved/pin migration, report migration or old-Ask cutover.
No new unassigned-review UI, freshness/provenance badges or production-readiness claim.
A stale Excel formula cache cannot be independently certified; require recalculated saved workbook.
One process means restart/scale-out loses memory; production persistence requires a later decision.
The previous 10-15 working-day estimate is provisional; schedule after compatibility/data proof.

## Official references checked on 2026-10-08

[Generative UI](https://docs.langchain.com/langsmith/generative-ui-react) illustrates component
IDs/props and supports local component maps; its hosted tutorial is not our deployment contract.
[Custom React transport](https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-react/docs/custom-transport.md)
is a compatibility input; verify pinned installed types rather than mixing SDK generations.
[shadcn template](https://github.com/shadcn-ui/chatbot-template) supplies presentation, not our
agent/backend. Retain license attribution and exclude its gateway/backend plumbing.
