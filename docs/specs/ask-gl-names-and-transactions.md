---
slug: ask-gl-names-and-transactions
title: Ask names each GL line and opens its transactions
status: draft
saved: 2026-10-02T15:10:27+00:00
---

# Ask names each GL line and opens its transactions

## Why

An Ask answer by GL code lists bare codes - `50001201`, `55010603` - next to Actual and Budget. A
reader cannot tell what a line is without a chart of accounts open beside them, and cannot see what
a figure is made of without leaving Ask for the MIS statement and drilling there. The owner asked on
2026-10-02 for each GL line to carry its name, and for a click on the number to show the
transactions behind it. Ask's statement-line answers have the same gap in a different form: they show
raw keys such as `1.1|50001201|sprout-cost`.

The data is already in the warehouse. Every SAP transaction line carries its GL account name
(`sap_transaction.acct_name`, e.g. "Sprout Cost - Imp" for 50001201), and the MIS statement already
drills an Actual to its SAP lines through a governed, audited, batch-pinned read
(`docs/specs/actuals-drill-down.md`).

## Users

Finance and management at 3F reading Ask answers by GL code or by statement line, and checking a
figure against its source transactions without switching screens.

## Behaviour

### Names

- An Ask answer grouped by GL code shows each code's name beside it: "50001201 · Sprout Cost - Imp".
- The name is the SAP account name the code uses most often in the active actuals batches; ties go
  to the alphabetically first name. When a code carries more than one name, the line says how many
  others there are: "55021000 · Salaries & Wages +14 more", and the full list is available on hover
  and to a screen reader.
- A code with no SAP transactions (budget-only) falls back to its MIS statement line label from the
  active budget outline; a code with neither shows the bare code.
- An Ask answer grouped by statement line shows the line's number and label ("1.1 Sprout Cost")
  instead of the raw key, taken from the active budget outline the statement screen uses.
- Names are display text resolved on the server after the governed query runs. They are never part
  of the selection, never sent to the model, and never change which rows are returned or their order.

### Opening an Actual's transactions

- In an answer grouped by GL code, a line's Actual figure is a button. Clicking it opens that GL
  code's SAP transaction lines for the answer's period and the reader's plant scope, in the same
  panel and columns the statement drill uses: posting date, document number, cost centre, account
  name, memo, reference, debit, credit and value, 100 lines a page.
- In an answer grouped by statement line, a line's Actual opens the same transactions the statement
  screen's drill opens for that line.
- The panel's footer equals the Actual that was clicked, to the paisa. The read is pinned to the
  actuals batches that produced the answer; when a batch has since been replaced the panel says so,
  and when it is gone the panel says the answer must be asked again, exactly as the statement drill
  does.
- Budget figures, `%`, totals and rows from the empty-state are not clickable: a budget has no
  transactions.
- Every opening writes the same typed drill audit record as the statement drill before any row is
  read, and fails closed when that write fails.

### What does not change

- The governed query, its rows, totals, ordering, comparisons, the readout line and the period
  control.
- The MIS statement screen and its drill.
- What reaches the model: the question, prior turns and the governed vocabulary; never names,
  amounts or transaction lines.

## Rules

- Transaction lines are the documented raw-row read path: RBAC-scoped to the reader's plants,
  audited before the read, pinned to the answer's batches (decisions 0004, 0013, 0028 lineage via
  the drill-down spec).
- No figure is fabricated: the drill footer and every name trace to warehouse rows.

## Success measure

- Metric: in the July demo answer "show me list items where Actuals are more than the budget for July 2026", the share of GL lines that show a name, and the number of clicks from an Actual to its SAP lines.
- Baseline: 0 of 21 lines named; opening a line's transactions needs leaving Ask for the MIS statement screen and drilling there.
- Target: 21 of 21 lines named, and one click from any line's Actual to its SAP lines, with a footer equal to that Actual.
- Check date: 2026-10-16

## Out of scope (now)

- Clicking Budget, `%` or totals; budget-line breakdowns.
- Editing or exporting the transactions from Ask (the statement screen's Excel export is unchanged).
- Names in saved-view and pin labels (they keep the selection label).
- A chart-of-accounts master or renaming GL codes.

## Acceptance criteria

- **C1** An Ask answer grouped by GL code shows each code with its most-used SAP account name from
  the active actuals batches, "+n more" when it has several, the MIS line label for a budget-only
  code, and the bare code when neither exists; rows, totals and order are unchanged.
- **C2** An Ask answer grouped by statement line shows "<number> <label>" from the active budget
  outline instead of the raw leaf key.
- **C3** Clicking a GL line's Actual opens its SAP transaction lines for the answer's period and the
  reader's plant scope, pinned to the answer's actuals batches, 100 a page, with a footer equal to
  the clicked Actual to the paisa.
- **C4** Clicking a statement line's Actual in Ask opens the same lines the statement screen's drill
  opens for that line.
- **C5** Every opening writes the typed drill audit record before the read and fails closed when the
  write fails; a reader outside the line's plants is refused, audited, and sees no rows.
- **C6** A replaced batch is read and named; a gone batch asks the reader to ask again.
- **C7** Budget, `%`, totals and empty-state rows are not clickable; names and transaction lines
  never reach the model.
- **C8** A live check against the July warehouse: "show me list items where Actuals are more than
  the budget for July 2026" shows names for all 21 codes, and opening 50001201's Actual foots to
  ₹83,98,339 across its SAP lines; a DUB-only user's statement-line answer opens the same lines as
  the statement screen.

## Open items (non-blocking)

- Whether finance prefers the MIS line label over the SAP name for codes the statement maps; the
  owner chose the SAP name on 2026-10-02.

## Source

- Owner request, 2026-10-02: "it should be a transaction name or the name so that we can understand
  what transaction it is. Also clicking on that number should show transaction details of that
  number." Choices made the same day: SAP name (most used, "+n more", MIS label fallback); Actual
  opens its transactions, Budget stays unclickable; both the GL-code and statement-line views.
- `docs/specs/actuals-drill-down.md`, `backend/src/warehouse/drill-transactions.repository.ts`.

## Roadmap
- ASK-GL-NAMES-AND-TRANSACTIONS: Ask names each GL line and opens its transactions
