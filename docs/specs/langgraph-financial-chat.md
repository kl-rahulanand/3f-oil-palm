---
slug: langgraph-financial-chat
title: New financial chat with monthly trends and traceable Actuals
status: draft
saved: 2026-10-08T14:33:55+00:00
---

# New financial chat with monthly trends and traceable Actuals

## Why

Finance needs to ask factual questions across SAP Actual and Nursery Budget dimensions,
compare monthly spending with Budget, and inspect the transactions behind an Actual.
They also need monthly changes and the workbook's stored Roll-over balances, without
manually summing monthly sheets. The demo questions below make these jobs checkable.
The owner requested a new chat built from scratch and approved the data and agent decisions
in this conversation. Existing report generation must keep working during the PoC.

## Users

Finance and management users, restricted to their currently permitted Plants.

## Behaviour

- One new TypeScript LangGraph agent runs inside NestJS and uses four governed financial tools.
- Trusted financial instruction modules guide comparisons, trends, clarification and
  transaction requests. Explicit Claude prompt caching reuses static instructions/tool
  definitions only; it does not cache financial answers or replace conversation memory.
- Ask for clarification whenever required Plant, period, measure or named component is missing
  or ambiguous. Follow-ups reuse confirmed scope and apply only explicit changes.
- Answer factual totals, Actual/Budget comparisons, monthly trends, month-to-month changes
  and transaction-detail questions for single months, month ranges and April-start Financial YTD.
- Actual-only queries support the fixed typed source dimensions below. Cross-source comparisons
  support only the native Budget grain or recorded component mapping. No Cost Center Budget allocation.
- The new Actual table retains every financially valid source line, including unknown Plants
  and missing Cost Centers. Known-Plant unmapped rows remain in permitted Plant totals.
  Unknown-Plant rows appear only in operator reconciliation evidence, never in this PoC chat.
- Nursery Budget stores only monthly source leaf amounts, separately from its hierarchy.
  Actuals originate in financial transactions; percentage is derived from matching aggregate
  Actual and Budget. Mapping uses recorded Plant/Cost Center/GL to stable component identity,
  keeping the permitted provisional assignments and their reasons provisional.
- The current Budget belongs to DUB. Other Plants and missing months carry a distinct
  "Budget not loaded for this Plant or month" state. Zero is a real loaded value.
  In a loaded Plant/month, an Actual-only GL instead shows null Budget with
  "No Budget line for this GL"; its Actual and prepared transaction drill-down remain.
- Percentage is Actual / Budget * 100; zero/missing denominators are Not applicable.
  Range/YTD Roll-over is the closing month's value, following decision 0041.
- Render totals as short answers, comparisons as tables, and trends as charts plus exact-value
  tables. Show confirmed scope; source/freshness badges are deferred.
- Prepare a first transaction page through `get_actual_transactions` while forming each answer.
  Clickable Actuals open matching details immediately; further pages use the same authorized
  handle. Full matching totals reconcile exactly, including beyond the first page.
- In-memory state is owned per user and conversation. Restart loses context; stale IDs show a
  clear restart/new-chat message. Refresh resumes only while the process still holds the state.
- The new tables sit beside existing warehouse tables. Existing statements, exports, report
  drill-down and ingestion contracts remain unchanged and are regression-tested.

### Supported scope and calculations

Core dimensions are Plant, Month, GL, Cost Center and Nursery Component, including
recorded hierarchy parents. Actual-only source dimensions also include Section,
Consideration, Short Name, Contra Account, Origin and Location; the fixed server catalog
declares their valid combinations. Memo, Comments and Reference remain transaction detail,
not grouping dimensions. Unsupported dimensions or combinations receive a clear refusal.
Budget, Roll-over and percentage support totals and compatible Plant/Month/GL/Component
groupings, never Cost Center or the Actual-only extra dimensions. GL-bearing Budget leaves
remain distinct component leaves; GL grouping sums them once without multiplying Actuals.
Budget leaves with missing GL appear once under "GL not assigned", following decision 0049.
Do not invent a GL or omit their amounts: GL groups plus this group reconcile to the
same-scope Budget total when coverage is complete. This group is not a guessed mapping
to Actuals, and hierarchy subtotal rows remain excluded from Budget facts.

An explicit named Plant, explicit list, or "all my Plants" supplies Plant scope. The last
means the current permitted Plant set pinned for this result, not all warehouse Plants.
Missing Plant still asks for clarification. YTD requires an explicit or previously confirmed
closing month/year; it never silently uses today's month.

Actual is the sum of Debit minus Credit, including credits and known-Plant Unmapped rows.
Plant or GL totals without a component filter include those Unmapped Actuals in their
percentage numerator. "Matching aggregate" means the same selected Plant/time/GL scope,
not silently dropping Actuals without a component match. Component answers use only the
recorded component mapping. Named-component or hierarchy-parent filters exclude unrelated
Unmapped lines. An unfiltered component breakdown includes a separate "Unmapped" row
for known-Plant Actuals without mapping, with prepared drill-down (decision 0050).
Mapped leaf rows plus Unmapped reconcile to the same-scope Plant Actual; hierarchy
parents are subtotals, not rows to sum again. Never allocate Budget to Unmapped.
Unmapped's Budget is null/"No Budget assigned to Unmapped" and its percentage is
null/Not applicable. Its row contributes no Budget; the comparison's Budget total
comes only from actual Budget leaf facts, with existing incomplete-coverage rules.
The recorded provisional assignments permitted by decision 0022 may be seeded with their
reason/version and remain provisional. No runtime inference or new business-approved
status is implied; absent targets stay Unmapped. Unknown-Plant rows are available only in
operator load-reconciliation evidence, not in this PoC's chat or a new review entitlement.
Other nullable Actual dimensions stay in "<Dimension> not assigned" groups, including
"Cost Center not assigned", retaining Actuals and prepared transactions. Unfiltered leaf
groups plus the missing bucket reconcile to the same-scope total. Never invent master data
(decision 0051).

Coverage is explicit per Plant/month for Actual and Budget. A loaded Actual month with no
matching lines is zero; an unloaded month is unavailable and a chart gap, not zero.
Actual is loaded only with confirmed complete coverage for that specific Plant/month in
the active validated generation (decision 0048). A workbook load, another Plant's rows,
or some rows for the requested Plant does not alone prove completeness. Without confirmation,
the complete Actual is null/"Actual data not loaded"; no transactions alone never implies zero.
An incomplete Actual range does not get a complete-looking total; any available-only
subtotal is labelled separately. If any selected Plant/month lacks Budget, full comparison
Budget and percentage are null, alongside an explicitly labelled available-only Budget
subtotal and missing coverage. Thus DUB plus another Plant, or YTD missing one Budget month,
cannot divide complete Actual by partial Budget. Loaded zero remains a real Budget value;
zero or missing denominator is Not applicable.
For a GL with Actuals but no Budget leaf in a loaded Plant/month, preserve the Actual
row and all contributing transactions. Budget is null with "No Budget line for this GL",
and percentage is null/Not applicable, following decision 0047. Never create a zero
Budget, remove the Actual row or disable its drill-down because its Budget is absent.

Monthly Roll-over shows that month's stored leaf balance. A range/YTD summary takes only
the closing month's balance across the selected Plants/components. Missing closing-month
coverage makes the complete balance unavailable; never fall back to an earlier month or sum
balances over time. Monthly absolute change is current minus previous for Actual, Budget
and Roll-over where both periods are available. Percentage change is that change divided
by the previous value times 100 only when the previous value is positive. Prior zero,
negative or missing data gives null/Not applicable, following decision 0052. For a
negative prior show "previous month was negative"; retain the exact monetary change
when both periods are available. Do not use an absolute-value denominator. Derived
Actual/Budget percentage is not itself subject to percentage-change arithmetic.

### Prepared transactions, loads and memory

Clickable Actual coordinates include supported row cells, monthly chart points, whole-scope
totals and the known-Plant Unmapped bucket. A multi-Plant total pins every selected Plant.
Bound an answer to 200 distinct Actual scopes including its overall total, deduplicating
identical coordinates. If it would exceed that bound, ask the user to narrow the question
before execution; no silent truncation or on-click-only preparation replaces this promise.
Count advertised parent subtotals, Unmapped, missing buckets and zero/empty Actual cells.
Identical table/chart scopes share one page. Profile named demo selections against the
reconciled source before live acceptance and verify 200 accepted/201 narrowing; no assumed fit.
The graph prepares page 1 with 10 rows before completing the answer. Further pages default
to 20 rows, maximum 100. Prepared page 1 occupies the first 10 rows; continuation page 2
starts at row 11, never at row 21. The first continuation request pins its page size
for that handle; later size changes are rejected. For page >= 2, offset is
10 + (page - 2) * pinned continuation size. Stable order is posting date, transaction
number, line ID, then unique internal row ID, on the same immutable source generation.
Acceptance traverses the entire set once without omissions/duplicates across this boundary.
Preparation has a shared 30-second deadline for the answer's detail batch; bounded workers
stop launching reads at expiry and cancel outstanding reads. Completed details remain ready;
unfinished scopes become explicitly detail-failed with retry/rerun guidance while the exact
summary remains visible. This is a work bound, not a promised overall response latency.
A preparation failure leaves the exact summary
visible with an explicit detail-failed state, not a ready/clickable claim. Page sums are
never the full matching Actual total. Zero-net Actual can still have offsetting transactions.

An authorized operator uses the dedicated original-workbook CLI loader with explicit DUB
Budget ownership. It writes an inactive immutable generation, independently reconciles
counts and amounts, and atomically activates the complete validated workbook. An identical
rerun is idempotent. A failed first load leaves chat data unavailable; a failed replacement
leaves the previous reconciled generation active and reports failure to the operator.
Missing cached formula amounts block use rather than becoming zero. No new public upload
endpoint, revised-budget approval workflow or change to existing report ingestion is added.
Each result/detail handle pins its source and mapping generation. A replacement may not
change a page's contributing lines: retained pins stay readable, otherwise ask to rerun.

PoC memory is process-local: one active run per conversation, one-hour idle expiry, at most
20 active conversations per account and 200 per process, 40 sanitized context turns, three
retained result bundles per conversation and 256 replay events per run. Capacity refuses
new creation explicitly; expired/evicted conversations behave like lost restart context.
Evicted results ask to rerun. Refresh, state retrieval, replay, prepared-page emission and
pagination all recheck ownership and current grants. Revocation denies the entire pinned
Plant scope, rather than silently shrinking totals, and the client clears denied result
caches. Another user's IDs confer no access. Cancellation cannot emit or commit a late answer.

### Model, errors, audit and coexistence

Decision 0053 adds lightweight, code-authored skills inside the existing LangGraph
design, not another agent framework. Core safety instructions always apply; skills
cannot calculate money, broaden access or execute user-supplied instructions/code.
Use an explicit five-minute Claude cache breakpoint at the end of the stable static
instructions/tool definitions, before dynamic context. User text, current permitted
vocabulary, selections, permissions and conversation history remain outside that
prefix; server financial results remain outside model requests entirely. Current
authorization and warehouse-read rules apply regardless of cache hits. Cache misses,
expiry or an ineligible short prefix do not change answers; do not pad prompts to
meet minimum size. Verify pinned SDK/model support and measure aggregate cache
write/read usage without logging prompts or results. Memory remains process-local.

Only user-authored text, sanitized confirmed/pending selections and permitted capped
vocabulary enter the dynamic part of model requests, alongside trusted static instructions
and tool definitions. Rendered prior answers, result rows, prepared pages,
money, source batches and handles never enter model history, retries, traces or logs.
Every financial answer and UI block comes from deterministic server templates and validated
results, not model prose. A prose-only, malformed or unknown-tool model reply never becomes
a financial answer; bounded validation leads to clarification or a fixed typed refusal.
No SQL, generated code or model-authored arithmetic executes. Selection rounds are capped
at five; the implementing story pins compatible supported API parameters, finite retries and timeouts.

Existing exception handling hides messages, so refusals carry typed details.reason:
unsupported selection, context expired, permission changed, drill expired, data unavailable,
model unavailable/timeout/rate-limit and cancellation. UI messages say what happened and
what to do next. Capacity limits, concurrent runs, query-too-broad narrowing, feature disabled
and access denied also have distinct typed reasons. Missing/invalid new-model configuration
returns a per-request model-unavailable refusal when enabled; it must not prevent backend
startup or disrupt reports/old Ask. Flag-off also starts without a key. No automatic substitution.
Audit entries record actor, authorized/refused action, resolved nonfinancial scope, opaque
internal load/run references and failure category, not prompts, amounts, rows or raw handles.

Require existing financial-report permission plus current Plant grants. Without report
permission deny page/API access; with report permission but no Plants show guidance to
request Plant access and no financial data. Recheck both on reads, resume, cached replay
and pagination. The story pins the exact existing grant through exported auth services.

Existing Ask stays reachable and unchanged. New chat has its own flag-gated Financial Chat
navigation entry and /financial-chat page, new endpoints and independent logic/components.
FINANCIAL_CHAT_ENABLED defaults false and is enforced by the backend as well as the UI.
The frontend reads feature availability from an authenticated runtime backend response,
not a build-time NEXT_PUBLIC flag. Toggling the flag works without rebuilding the frontend.
No copied/imported old-chat prompts, selector, executor, tools, state or UI; only shared
application auth, permission, CSRF, audit, config, logging and errors may be used.
Old-chat cutover/removal is a separate scope, not part of this build. Baseline/regression
evidence includes old Ask as well as statements, imports, report drill and exports.

Before any real new-chat Anthropic request, the project owner records confirmation of
account/model access, billing, processing/retention terms and acceptable residency under the
client's data-handling obligations. A team Claude Code login is not an application API key
or evidence of this check. Until confirmed, use synthetic questions and a fake vendor in
local/hermetic development; blocked access is reported, not bypassed. Live application
probes are separately gated/manual outside CI, measure timing/usage, and inspect allowed
payloads without logging secrets or customer results.
Develop with a fake model first; financial values still come from validated warehouse
reads. Decision 0051 approves this prerequisite, not a claim that vendor/access/billing/
retention/residency checks are complete. A fake model does not prove live-Claude correctness.

## Rules

Accepted decisions [0042](../decisions/0042-agent-ready-financial-warehouse.md),
[0043](../decisions/0043-langgraph-financial-chat-poc.md) and
[0044](../decisions/0044-typescript-chat-preserves-reports.md) govern this design.
[0045](../decisions/0045-financial-chat-model-provider-neutral.md) corrects the inherited provider
assumption: configurable direct-model integration.
[0046](../decisions/0046-financial-chat-claude-sonnet-first.md) selects direct Anthropic
Claude Sonnet 5.5 (claude-sonnet-5-5) first; OpenAI comparison is deferred.
Amounts and transaction rows remain inside the app. Every query is authorized and audited;
SQL, joins and money calculations belong to server code. Only reconciled loads may be queried.
Existing auth, CSRF, audit and error infrastructure may be used; existing chat logic is not reused.

## Success measure

- Metric: Exact golden financial/report regression checks and repeatable validated selections
  across three fresh live-model conversations per demo question, plus scoped follow-up cases.
- Baseline: The new LangGraph path has not been implemented or demonstrated. Expected answers
  come from the agreed workbook and independent golden selections, not old-chat responses.
- Target: Every named financial/regression case passes exactly; all three runs of each live
  question resolve to its expected selection. No missing required scope or unauthorized data read.
- Check date: 2026-10-15

This is a provisional internal review checkpoint for the draft, not a promised delivery date.
Schedule the functional acceptance check at story approval before demo rollout.

### Named demonstration and follow-up cases

These cases fix the semantic selection independently of any model wording. The implementing
story assigns shared typed IDs; before a live run, its import/acceptance tasks record exact source-derived
golden amounts and transaction identities for these same scopes. Expected values must not
be produced by the production parser/query under test.

| Case | Question                                                                                       | Expected selection or outcome                                                     |
| ---- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D1   | Actual vs Budget for DUB in April 2026                                                         | DUB; April 1-30 2026; Actual/Budget; total                                        |
| D2   | Actual vs Budget for DUB in April 2026 by GL                                                   | D1 scope; GL grouping; repeated Budget GL leaves summed once                      |
| D3   | Actual vs Budget for DUB in April 2026 by nursery component                                    | D1 scope; component grouping using recorded mapping                               |
| D4   | Monthly Actual and Budget trends for DUB from April to August 2026, with month-to-month change | DUB; April 1-August 31 2026; month grouping; monetary deltas                      |
| D5   | Actual vs Budget for DUB, financial YTD ending August 2026                                     | DUB; April 1-August 31 2026; total, not calendar YTD                              |
| D6   | Show monthly Roll-over Budget for DUB from April to August 2026 and its period balance         | Stored monthly balances; overall balance only August                              |
| D7   | Show Actual for DUB in April 2026 by Cost Center                                               | DUB; April 2026; Actual-only; Cost Center grouping                                |
| D8   | Actual vs Budget for all my Plants in April 2026                                               | Explicit current permitted Plant set; partial Budget labelled; no DUB replication |
| D9   | Show Actual vs Budget                                                                          | Clarify Plant and period before querying; retain requested measures               |
| D10  | Show Budget for DUB in April 2026 by Cost Center                                               | Fixed unsupported-combination refusal; no Budget allocation                       |
| D11  | Why did DUB spending increase in August 2026?                                                  | Causal explanation unsupported; offer factual month-change query                  |
| D12  | Show Actual for DUB from April to September 2026 by month                                      | Loaded months preserved; unloaded September unavailable/gap                       |

Follow-up cases: after D1, "now by GL" keeps Plant/month/measures; after D4, "same for August
2026" selects only August; after a relative-period selection, an explicitly named April
2026 overrides that relative window; "financial YTD" with no confirmed closing period asks;
answering D9's clarification completes D9 rather than starting a detached request; requesting
transactions after a multi-cell answer asks which Actual, while selecting a specific Actual
opens its prepared matching page; a follow-up after a numeric answer sends no rendered
answer/money back to the model. Repeated component-label ambiguity is proved with a synthetic
two-leaf fixture; it never guesses a leaf from its GL alone.

## Acceptance criteria

1. Authorized questions return exact totals and comparisons at supported dimensions without
   guessing required scope, fabricating financial values or allocating Budget.
2. Monthly trends and their exact-value tables agree, preserve missing-data gaps, and calculate
   period/YTD totals and closing-month Roll-over correctly.
3. Clarification and follow-ups work with isolated memory; revoked permissions take effect on
   the next query and pagination; a process restart loses context visibly.
4. Every clickable Actual has a prepared transaction page and complete matching total; paging
   never changes its scope or exposes another user's data.
5. New data loads reconcile to the source and preserve unmatched valid rows; existing statements,
   Excel exports and report drill-down produce the same results before and after the new load.
6. The chat works with real Claude Sonnet 5.5 through Anthropic directly; inspected model requests contain no
   server-sourced result rows, money values, transaction lines or drill-down handles.

Acceptance evidence for 1: D1-D3/D7-D10; named Actual-only source dimensions; Unmapped Plant
numerator and provisional component mapping; unfiltered component breakdown includes
Unmapped and reconciles to Plant Actual, while named-component filters exclude unrelated
Unmapped lines; repeated GL fan-out prevention;
Budget leaves without GL stay visible as "GL not assigned" and reconcile grouped Budget
to the same-scope total;
unsupported Cost Center Budget; Actual-only GL in a loaded Budget month retains exact Actual,
null Budget/"No Budget line for this GL" and Not applicable percentage; prose-only numeric
model reply never displayed as fact; current Plant
access on lookup and query; audit entries and typed refusals without financial payloads.

Acceptance evidence for 2: D4-D6/D8/D12; April-start and cross-year boundaries; partial
Actual/Budget, loaded-zero and closing-month missing Roll-over; confirmed complete
Plant/month with no rows versus no coverage, and partial rows without confirmed completeness;
exact table/tooltips with chart gaps; amount and percentage deltas with prior positive,
zero, negative and missing
values; no average of ratios.

Acceptance evidence for 3: all named follow-ups; explicit month wins over relative context;
ambiguous component and transaction reference; another user's conversation; refresh/replay
after revocation; idle/capacity/result eviction; actual process restart; cancellation races.
No-report permission denies direct API access; no Plant grants shows guidance without
data; report-permission revocation prevents replay, streaming and pagination.

Acceptance evidence for 4: total/Plant/month/GL/component/Unmapped/zero-net Actual identity
sets and full totals including more than 10 transactions; 200-scope overflow narrows before
execution; first-page failure is honest; expired/revoked/cross-conversation handles denied;
prepared-to-continuation traversal covers every line once with a pinned page size;
batch preparation deadline cancels remaining work and renders honest detail-failed states;
replacement generation never switches page sets; Actual-only GL with absent Budget keeps
its prepared first page, full reconciled transaction total and further paging.
Budget/Roll-over/percentage are not clickable.

Acceptance evidence for 5: real loader failure/rerun/replacement/activation; original row
counts and exact independent sums including unknown Plants; formula-cache failure; no
reconciled generation state; before/after old Ask, report/import/export/drill baseline at
the same legacy snapshot with flag on/off. Same-scope unexplained chat/report differences
block acceptance; different inclusion rules are explained, not forced equal. If cached formula
results are absent, the operator requests a recalculated and saved workbook, imported as a new
source identity. No formula execution or overwrite of the original is automatic; the legacy
zero/count rule stays unchanged. Run the real CLI with the supplied space/parenthesis-containing
filename using correctly quoted path arguments in PowerShell, cmd and Git Bash.

Acceptance evidence for 6: trusted instruction modules and explicit static-only cache
boundary; cached/uncached equivalent validated selections and exact server answers;
aggregate cache counters with honest misses/expiry/short-prefix outcomes; no dynamic
context cached and no new framework. Owner-confirmed vendor precondition; three fresh real-model runs
per D1-D12 plus isolated follow-ups; outgoing marker exclusions after numeric answers and
on retries/tracing; missing key/model access, timeout/rate-limit and cancel give fixed typed
outcomes with no fallback; measured timing/usage. Live runs are gated outside CI, not passed
by mocks. Hermetic module resolution uses DependenciesScanner/InstanceLoader, not real
AppModule startup; truncating DB tests use only disposable warehouse :5434/app :5435, never
live warehouse :5433/app :5432, and each named leaf is registered and observed executing.

## Out of scope

Forecasts, causal explanations, recommendations, source writes, mapping administration,
revised-budget workflows, persistent chat history, report migration, saved-query/pin migration,
external component hosting, vector retrieval and production deployment hardening.

## Source

Owner confirmations in this chat on 2026-10-08; the supplied financial/Nursery workbook;
accepted decisions 0042-0053 and existing model/financial rules cited above.

## Roadmap

- FINANCIAL-AGENT-DEMO: New financial chat with monthly trends and traceable Actuals
