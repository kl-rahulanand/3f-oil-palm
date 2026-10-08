---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# New LangGraph financial chat with monthly trends and tool-issued Actual drill-down

## Context
The owner approved the new chat direction, then requested that the locked decisions be
updated on 2026-10-08. Build the agent and chat from scratch over the warehouse, with the
target data rules in [0042](0042-agent-ready-financial-warehouse.md). Existing chat code is
not the basis of this replacement. The approved UI references are the
[shadcn chatbot template](https://github.com/shadcn-ui/chatbot-template) and
[LangGraph Generative UI guide](https://docs.langchain.com/langsmith/generative-ui-react).

The owner specifically requested that transaction drill-down be an agent tool call and
that transaction details arrive while the agent forms its response, ready for an Actual click.

## Decision
### Factual scope and clarification

Use a LangGraph agent to select from a governed vocabulary. V1 answers factual totals,
Actual versus Budget comparisons, monthly trends and contributing Actual transactions.
Measures are Actual, Budget, Roll-over Budget and percentage. Core dimensions include Plant,
Month, GL, Cost Center and Nursery Component, subject to the catalogue's valid combinations.
Support one month, a month range and Financial YTD using the project's fiscal calendar.
Month-to-month changes are computed by the data service. Forecasts, recommendations and causal
explanations of why a value changed are excluded.

Missing or ambiguous required scope produces a clarification before querying. There are no
silent Plant, time or measure defaults. Previously confirmed conversation scope can supply
these fields; permissions still apply on every read. Plant grants constrain catalogue value
lookup, aggregate queries, transaction drill-down and subsequent pagination.

### Four tools from one financial data service

| Tool | Contract responsibility |
| --- | --- |
| `get_financial_catalog` | Approved measures, dimensions, time windows and compatible query combinations |
| `find_dimension_values` | Resolve names/aliases to valid values visible to the user; ambiguous matches trigger clarification |
| `query_financials` | Execute a validated selection through code-owned SQL, joins, mappings and exact financial calculations; return scope, results, budget states and drill-down handles |
| `get_actual_transactions` | Read the transaction set behind an authorized server-issued drill-down handle, with a first page, pagination and the complete matching Actual total |

These are in-process modules/services behind the application's backend, not four separately
deployed services. The model never authors SQL, creates joins, allocates Budget, edits data
or computes financial values. No vector database is needed for this structured data PoC.

Preserve decision [0027](0027-assistant-llm-bedrock-mumbai.md): AWS Bedrock in Mumbai receives
question text, conversation context and permitted governed vocabulary, including capped
dimension values. Server-sourced amounts, transaction rows and result bodies stay inside the
application. Tool availability in the agent graph does not authorize sending their financial
outputs to the external model. Server graph nodes execute/validate the tool requests and pass
typed result data to the UI; subsequent model inputs expose only permitted metadata/vocabulary.
Numeric answer text, tables and charts are populated from validated server results.

### Contextual follow-ups and memory

Store confirmed Plant, period, measures, grouping, filters and pending clarification in
LangGraph state keyed by conversation ID and owned by the authenticated user. For example,
after a confirmed DUB April-August question, "now show it by GL" changes the grouping while
retaining confirmed Plant, period and measures. Conflicts or ambiguous references clarify.
Candidate changes remain pending until validated/confirmed; a clarification reply completes
that pending request rather than creating a detached question.

Use an in-memory checkpointer for the PoC, with one backend instance. Restart clears state.
A browser refresh can resume only with the same conversation ID while that backend lives.
New chats start empty. Database checkpoint persistence is deferred. State/messaging must not
let another user resume a conversation merely by knowing its ID. Context reuse never bypasses
current permissions or uses old result values as fresh warehouse answers.

### UI and trends

Adapt the shadcn template's chat presentation, including input, messages and clarification
cards, to the LangGraph stream rather than retaining its default independent AI SDK agent.
Use predefined React components registered in the frontend: `FinancialTotal`,
`FinancialComparison`, `MonthlyTrend`, `ClarificationCard`, and an Actual transaction detail
panel. Follow the Generative UI pattern of emitting a component identifier and validated
props. Do not generate executable React code at runtime. Exact stream/transport wiring is an
implementation-plan detail, not a requirement to buy LangSmith hosting.

Totals use short answer text; comparisons use tables; monthly trends use a line chart and an
exact-value table. Answers briefly show the Plant, period and filters used. All financial
surfaces read the same verified result. Missing Budget is labelled and drawn as a gap rather
than zero. Source/freshness badges and an exposed provenance UI are deferred for v1; internal
source traceability and scope identity remain necessary for accurate drill-down.

### Actual drill-down is prepared by the agent graph

1. `query_financials` returns server-issued `drilldown_id` handles for clickable Actuals.
   A handle identifies the authenticated owner and the exact Plant, period, GL/component,
   filters, mapping and source load that produced that value; it never contains model-authored SQL.
2. While forming the answer, the agent graph calls `get_actual_transactions` for those
   Actuals and associates the returned detail bundles with their summary cells/chart points.
   Treat this as governed graph execution; it does not require an additional LLM round trip
   or expose transaction output to Bedrock. Opening the first page needs no new AI decision.
3. Clicking an Actual opens its prepared detail panel. "Show the transactions behind this
   amount" also uses this tool; an ambiguous reference to a prior result asks which Actual.
4. Large sets include a bounded first page, full matching total and pagination metadata.
   Further pages use the same handle and recheck authorization. A first-page sum must never
   be presented as the complete set's total.

Show transaction number, line ID, posting date, Plant, Cost Center, GL code/name, Debit,
Credit, Actual, memo and reference. The full matching transaction total must reconcile
exactly to its clickable Actual. Share the governed predicate/mapping builder between
summary and drill-down rather than independently recreating its filters. Pin the source
scope across both calls so a replacement load cannot mix generations. An expired/unavailable
scope asks the user to rerun; it must not silently fall back to another transaction set.

Preparing pages must be bounded. The implementation plan must define response/page limits,
handling for large result sets and partial tool failures, without claiming that unprepared
or failed detail data is available. Budget is not a transaction-drill subject in this scope.

## Consequences
- This record locks the design choices confirmed in the chat; it does not implement a new
  agent, import the template, install dependencies or migrate warehouse data.
- The implementation story must pin shared schemas for the four tools, result/UI props,
  conversation ownership and drill-down handles before dependent components are built.
- Verify clarification and follow-ups, permission changes, memory loss on restart, exact
  monthly/range/YTD totals, missing Budget, chart/table equality, and summary/drill-down
  equality including pagination. Probe live model phrasing as well as hermetic fixtures.
- The existing chat and report decision records govern their shipped behavior. This record
  defines their future chat replacement; its cutover/removal scope must be explicit in the
  implementation story. Existing model data-boundary rules remain binding.
