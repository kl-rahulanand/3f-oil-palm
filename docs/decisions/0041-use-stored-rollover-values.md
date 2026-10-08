---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-10-07
stories: [new-workbook-ingestion]
---

# MIS uses the workbook's stored Roll-over values; YTD shows the closing month's value

## Context
The new nursery budget workbook supplies a monthly `Roll Over Budget` value for every stored
leaf. The warehouse already preserves that value, but the MIS screen and export deliberately
left Roll-over blank while its calculation rule was unresolved. Recalculating the workbook's
formula in the application would introduce a second financial calculation whose behaviour has
not been accepted by the client. Summing monthly Roll-over values for YTD would also be wrong:
Roll-over is a point-in-time balance, not a flow like Budget or Actual.

## Decision
The MIS statement and its Excel export display the stored `rollover_net` value for the format's
budget-owner plant. The selected-month block shows that month's value. A multi-month FY-YTD
block shows the closing month's value only; it never sums Roll-over across months. Leaves read
the stored values and all parent rows and the grand total are derived by summing their leaves,
using the same outline and exact-money rules as Budget.

The application does not reproduce the workbook formula. The workbook must be recalculated and
saved before upload so its cached formula results are current. An uncomputed formula result
continues to ingest as zero and remains visible in the ingest validation count, as decision 0020
requires. Plants other than the budget-owner plant keep the distinct `not-loaded` state and show
a dash for Budget, Roll-over and percentage.

## Consequences
- The response contract requires money-valued Roll-over whenever `budgetState` is `loaded`, and
  requires null whenever it is `not-loaded`.
- The screen and exported workbook carry the same monthly or closing-month Roll-over value.
- Actual, Budget and percentage calculations are unchanged.
- A stale workbook calculation cache can produce a stale displayed Roll-over. The ingest report's
  uncomputed-cell count is the guardrail until the financial formula itself is governed in code.
- Supporting another plant's budget still follows decision 0034's trigger and is not introduced
  by this change.
