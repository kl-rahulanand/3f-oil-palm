---
slug: ask-traceable-answers
title: Complete Ask questions stay complete and every live Actual is traceable
status: draft
saved: 2026-10-08T08:03:09+00:00
---

# Complete Ask questions stay complete and every live Actual is traceable

## Why

The client needs confidence that every number shown by Ask is both the number requested and the
number in the supplied financial data. In the live app, the complete question:

> Show Actual and Budget by month for DUB April 2026 to August 2026.

was reduced to April and carried an unstated Actual-over-Budget comparison. The resulting empty
answer was valid for the generated selection but not for the words the user entered. Current Ask
transaction links also cover only GL-code and statement-leaf rows, so monthly trend values and
totals cannot be checked against the SAP lines that produced them.

## Users

Finance and management asking governed financial questions and checking the answer against the
client's SAP and Budget workbooks during the demo.

## Behaviour

### Complete questions override conversation history

- A self-contained question is authoritative for every slot it states: domain, measures,
  dimensions, plants, period and comparison.
- A fully stated question does not inherit an omitted comparison or period from an earlier turn.
- A clearly referential follow-up may inherit only the slots it omits. Examples are "these",
  "same plant", "now by GL" and "what about May?". Every slot explicitly stated in the follow-up
  replaces the inherited value.
- The same complete question produces the same governed selection in a fresh conversation and
  after an unrelated or over-budget turn.

### Critical facts are reconciled before execution

- Bedrock continues to select from the governed vocabulary and never writes SQL.
- One server-side reconciliation step checks only facts that can be read deterministically from
  the current question: complete month endpoints, requested Actual/Budget measures, a named plant,
  "by month", and explicit comparison wording.
- Supported ranges include compact and spaced month-years (`Apr2026`, `Apr 2026`, `April 2026`),
  a dash or `to`, a shared year (`Apr-Aug 2026`) and ranges crossing a year boundary.
- Two stated endpoints remain two endpoints. A malformed, reversed or domain-incompatible range
  asks for clarification or is refused with its reason; it is never collapsed silently.
- A measure comparison is kept or added only when the current question explicitly asks for one
  (for example over/under Budget, exceeds, greater/less than, or a comparison symbol), or a clearly
  referential follow-up inherits it. "Actual and Budget" means show both and does not mean Actual
  greater than Budget.
- The reconciliation step does not become a second general natural-language parser. Language not
  covered by these safety rules stays with the governed selector; an irreconcilable conflict asks
  one question instead of executing.
- The existing answer readback shows the applied measures, plant scope, exact period, grouping and
  comparison. No second interpretation component is added.

### Every eligible live Actual is traceable

- In a live successful Ask answer, an Actual row value is eligible for transaction drill when its
  dimensions are any supported combination of month, plant, GL code and statement leaf. A single
  Actual KPI or displayed Actual total is eligible too.
- The server derives each transaction predicate from the executed governed selection and the
  displayed row coordinates. It reuses the governed predicate builder; it never interprets the
  question again or mirrors filter rules in another implementation.
- A total over an unfiltered result uses the executed answer scope. A total over a comparison,
  ranking or top-N result is the union of exactly the displayed row predicates, so excluded rows
  cannot appear in the drill.
- Every context binds the current user, exact Actual in paise, effective plants, complete time
  window, pinned actual batches and the row or total predicate. Context size and row count remain
  bounded; a value that cannot carry a complete safe context stays visible but inert.
- Eligibility is established through the existing audited Ask read using an aggregate transaction
  summary. A value is clickable only when at least one feeding SAP line exists and all feeding
  lines sum to the displayed Actual in exact paise. An offsetting zero with feeding lines may be
  clickable; a zero with no lines is inert.
- Opening a drill reauthorizes the user's current domain, Actual-measure and complete plant access,
  writes the typed audit event before the read, reads only the pinned batches and returns fixed,
  stable pagination with an all-match footer equal to the clicked Actual.
- A retained replaced batch is read and identified as replaced. A missing batch, expired or
  altered context, revoked access, incomplete pin or non-footing result is refused with no rows.
- Only live Actual cells and the live Actual total are interactive. Budget, percentage, Roll-over,
  chart points and stored conversation snapshots are inert. A saved view or pin receives fresh
  links when it reruns.

### Demonstration

For "Show Actual and Budget by month for DUB April 2026 to August 2026", Ask selects
`governed-financial`, Actual and Budget, dimension `month`, plant DUB, 1 April through 31 August
2026, and no measure filter. It returns five monthly rows. Every monthly Actual opens only that
month's DUB SAP lines, and the Actual total opens the combined lines for the five displayed rows.
Each footer equals its displayed Actual in exact paise. Budget remains inert.

## Rules

- Numbers come only from governed warehouse rows; the model never authors SQL or figures.
- Existing RBAC, audit-before-read, batch pinning, exact-paise footing and pagination rules from
  `actuals-drill-down.md` and `ask-gl-names-and-transactions.md` continue to apply.
- The established period choice and period readback from `ask-period-control.md` remain intact.
- No selector tool-schema or prompt change is made unless the backend guard cannot meet the
  behaviour; any such change requires before-and-after live probes in fresh conversations.

## Acceptance criteria

1. After an over-budget turn, the complete April-to-August trend question selects both measures,
   month, DUB, the full range and no comparison; the same question in a fresh conversation produces
   the same selection.
2. Compact, spaced, shared-year and cross-year ranges preserve both endpoints; malformed, reversed
   and domain-incompatible ranges never execute as a silently changed period.
3. Explicit over/under-budget questions keep the correct comparison, while side-by-side Actual and
   Budget questions never gain one. Referential follow-ups inherit only omitted slots.
4. The existing readback shows the exact applied measures, plants, period, grouping and comparison,
   and every executed selection remains within the semantic catalog and the user's grants.
5. Live Actual values drill for the supported single and composite dimensions and for a displayed
   Actual total. Budget, percentage, Roll-over, charts and stored answers remain inert.
6. Every clickable value has at least one feeding SAP line and its all-match footer equals the
   displayed Actual in exact paise, including negative values and an offsetting zero. No-line and
   mismatched values are inert.
7. Filtered, ranked and top-N totals open only the union of displayed rows. Tampered, expired,
   oversized, unauthorized, missing-batch and non-footing requests fail closed and are audited.
8. Replaced retained batches still foot to the displayed answer with a notice; deleted batches are
   refused. Saved views and pins obtain fresh links on rerun.
9. Hermetic selection tests, drill contract/service tests, frontend interaction tests, typecheck,
   structural build and quality checks pass. Gated warehouse proofs run only against the throwaway
   test database.
10. A live demo compares the five monthly values and the total with the supplied Excel/SAP data and
    records each transaction footer; current workbook values are evidence, not permanent literals
    in automated tests.

## Out of scope

- New semantic dimensions such as cost centre.
- Budget, percentage or Roll-over transaction drill-down.
- Clicking chart points, transaction export or editing.
- Model-authored SQL, a new datastore or a database schema migration.
- Persisting signed drill links in conversation snapshots.

## Success measure

- Metric: successful runs of the target trend question whose selection has five months and no
  comparison, and whose six drill targets (five monthly Actuals plus the Actual total) reconcile
  exactly to their SAP lines.
- Baseline: 0 successful runs on 2026-10-08; the question collapsed to April, retained Actual over
  Budget and returned no rows, so none of the six Actual drill targets was available.
- Target: 4 of 4 fresh-conversation runs and 4 of 4 runs after an over-budget turn return the same
  correct selection; all 6 of 6 Actual drill targets foot exactly in each checked answer.
- Check date: 2026-10-16

## Source

- Owner discussion and approved combined plan, 2026-10-08.
- `docs/specs/ask-period-control.md`.
- `docs/specs/ask-gl-names-and-transactions.md`.
- `docs/specs/actuals-drill-down.md`.
