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
The owner requested a new chat built from scratch and approved the data and agent decisions
in this conversation. Existing report generation must keep working during the PoC.

## Users

Finance and management users, restricted to their currently permitted Plants.

## Behaviour

- One new TypeScript LangGraph agent runs inside NestJS and uses four governed financial tools.
- Ask for clarification whenever required Plant, period, measure or named component is missing
  or ambiguous. Follow-ups reuse confirmed scope and apply only explicit changes.
- Answer factual totals, Actual/Budget comparisons, monthly trends, month-to-month changes
  and transaction-detail questions for single months, month ranges and April-start Financial YTD.
- Actual-only queries support the approved typed source dimensions. Cross-source comparisons
  support only dimensions with a reviewed Budget correspondence. No Cost Center Budget allocation.
- The new Actual table retains every financially valid source line, including unknown Plants
  and missing Cost Centers. Known-Plant unmapped rows remain in permitted Plant totals.
  Unknown-Plant rows are excluded from ordinary Plant answers and retained for reconciliation.
- Nursery Budget stores only monthly source leaf amounts, separately from its hierarchy.
  Actuals originate in financial transactions; percentage is derived from matching aggregate
  Actual and Budget. Mapping uses approved Plant/Cost Center/GL to stable component identity.
- The current Budget belongs to DUB. Other Plants and missing months carry a distinct
  "Budget not loaded for this Plant or month" state. Zero is a real loaded value.
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

## Rules

Accepted decisions [0042](../decisions/0042-agent-ready-financial-warehouse.md),
[0043](../decisions/0043-langgraph-financial-chat-poc.md) and
[0044](../decisions/0044-typescript-chat-preserves-reports.md) govern this design.
[0045](../decisions/0045-financial-chat-model-provider-neutral.md) corrects the inherited provider
assumption: configurable direct Claude or OpenAI integration; exact provider/model remains open.
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
6. The chat works with the selected real model/provider; inspected model requests contain no
   server-sourced result rows, money values, transaction lines or drill-down handles.

## Out of scope

Forecasts, causal explanations, recommendations, source writes, mapping administration,
revised-budget workflows, persistent chat history, report migration, saved-query/pin migration,
external component hosting, vector retrieval and production deployment hardening.

## Source

Owner confirmations in this chat on 2026-10-08; the supplied financial/Nursery workbook;
accepted decisions 0042-0044 and existing model/financial rules cited above.

## Roadmap

- LANGGRAPH-FINANCIAL-CHAT: New financial chat with monthly trends and traceable Actuals
