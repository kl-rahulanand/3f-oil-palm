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
- The name is the SAP account name with the most transaction lines (a count of rows, not of amount)
  among the lines that feed the answer: the answer's pinned actuals batches, its period and the
  reader's authorized plants. Names are compared trimmed and case-insensitively; ties go to the
  alphabetically first. When a code carries more than one name, the line says how many others there
  are: "55021000 · Salaries & Wages +14 more". The "+14 more" is a focusable, tappable disclosure
  that reveals the full list, ordered by line count and then alphabetically, and the line's
  accessible name includes the complete list; nothing depends on a hover tooltip.
- A code with no SAP lines in that scope (budget-only) falls back to its MIS statement line label
  from the answer's pinned budget outline; when the outline gives the code several labels, the
  first in outline order is shown with "+n more" in the same disclosure. A code with neither shows
  the bare code.
- An Ask answer grouped by statement line shows the line's number and label ("1.1 Sprout Cost")
  instead of the raw key, taken from the active budget outline the statement screen uses.
- Names are display text resolved on the server after the governed query runs. They are never part
  of the selection, never sent to the model, and never change which rows are returned or their order.

### Opening an Actual's transactions

- Supported answers: an Ask answer whose only row dimension is the domain's line dimension, `gl_code`
  in governed-financial or `leaf_key` in mis-statement, with any dimension filters, comparisons and
  time window. In any other shape (no breakdown, or a breakdown by month or by several dimensions)
  no Actual is clickable.
- The client sends only the answer's identity, the row's key and the answer's pinned batches; the
  server re-derives the exact predicate from the executed selection it re-authorizes: the row's GL
  code (or the leaf's mapped plant, cost-centre and GL triples from the pinned outline), the
  selection's time window and dimension filters, the reader's authorized plants and the pinned
  actuals batches. Comparisons decide which rows appear, not which transactions feed a row, so they
  do not enter the predicate.
- In a GL-code answer, a line's Actual figure is a button that opens that code's SAP lines under that
  predicate. In a statement-line answer, a line's Actual opens the statement drill's read for that
  leaf, under the answer's pinned budget outline and batches, so a GL split across several leaves
  is read only for the leaf clicked.
- One transaction panel serves the statement screen and Ask. It shows posting date, document number,
  cost centre, account name, memo, reference, debit, credit and value, 100 lines a page; the
  statement screen's drill gains the document number, cost centre and account name columns as an
  additive change. Its month column stays on the statement screen.
- The panel's footer equals the Actual that was clicked, to the paisa. A replaced or gone batch is
  handled exactly as the statement drill handles it today.
- The server marks each row's Actual clickable only when at least one SAP line feeds it under the
  predicate; a genuine zero net with lines behind it stays clickable. Budget figures, `%`, totals,
  budget-only Actuals and empty-state rows are not clickable, and they cause no read and no audit
  record.
- Every opening writes the same typed drill audit record as the statement drill before any row is
  read, and fails closed when that write fails.

### What does not change

- The governed query, its rows, totals, ordering, comparisons, the readout line and the period
  control.
- The MIS statement screen, apart from the three added drill columns.
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
- **C3** In an answer whose only row dimension is `gl_code`, clicking a line's Actual opens its SAP
  lines under the server-derived predicate (row GL code, time window, dimension filters, authorized
  plants, pinned actuals batches), 100 a page, with a footer equal to the clicked Actual to the
  paisa; other answer shapes have no clickable Actual.
- **C4** In an answer whose only row dimension is `leaf_key`, clicking a line's Actual opens the same
  lines the statement screen's drill opens for that leaf under the answer's pinned outline and
  batches; the shared panel shows document number, cost centre and account name on both screens.
- **C5** Every opening writes the typed drill audit record before the read and fails closed when the
  write fails; a reader outside the line's plants is refused, audited, and sees no rows.
- **C6** A replaced or gone batch is handled exactly as the statement drill handles it today.
- **C7** Only Actuals with at least one feeding SAP line are clickable; Budget, `%`, totals,
  budget-only Actuals and empty-state rows are inert and cause no read or audit record; the "+n more"
  disclosure is keyboard- and touch-operable and the full list is in the accessible name; names and
  transaction lines never reach the model.
- **C8** Hermetic proofs cover name selection, ties, fallback and disclosure, predicate
  re-derivation and refusal, audit-before-read ordering, replaced and gone batches, inert cells and
  exact-paise footing. A manual live check against the July warehouse and the host's Bedrock model,
  outside CI and in a fresh Ask conversation: "show me list items where Actuals are more than
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
