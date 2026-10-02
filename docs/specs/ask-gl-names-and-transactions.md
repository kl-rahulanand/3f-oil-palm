---
slug: ask-gl-names-and-transactions
title: Ask names each GL line and opens its transactions
status: confirmed
saved: 2026-10-02T16:30:41+00:00
confirmed_by: "Rahul Anand"
confirmed_hash: 74b4375e670e29bfdd0159a83cc4db61985ae61dcd39d0d3c9a3164b05fe526c
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
  among the raw SAP lines the answer's own governed query aggregated into that row: its pinned
  actuals batches, its period, and the effective plant predicate of the executed query (never simply
  every plant the reader may see). Names are grouped by a normalized form: trim the ends, collapse
  internal whitespace and case-fold. Line counts belong to normalized groups, not spellings. Each
  group displays its most frequent original spelling, with the alphabetically first spelling winning
  a tie. The group with the most lines is the primary name, with ties going to the alphabetically
  first displayed spelling. When a code carries more than one normalized name group, the line says
  how many other groups there are: "55021000 · Salaries & Wages +14 more". The "+14 more" is a
  focusable, tappable disclosure that reveals the full group list, ordered by line count and then
  alphabetically, and the line's accessible name includes the complete list; nothing depends on a
  hover tooltip.
- A code with no SAP lines in that scope (budget-only) falls back to its MIS statement line label
  from the outline belonging to the answer window's last-month budget batch (never the currently
  active one); when the outline gives the code several labels, the first in outline order is shown
  with "+n more" in the same disclosure. A code with neither shows the bare code.
- An Ask answer grouped by statement line shows the line's number and label ("1.1 Sprout Cost")
  instead of the raw key, taken from the outline belonging to the answer window's last-month budget
  batch. Its `rowLabels` are stored in the conversation answer snapshot, so a stored answer reopened
  after a re-upload keeps the labels of the data it was built on.
- Names are display text resolved on the server after the governed query runs. They are never part
  of the selection, never sent to the model, and never change which rows are returned or their order.
  The `ResultTable` dimension cell keeps the raw GL code or leaf key. `AskResponse` carries names as an
  optional typed `rowLabels` list of `{ key, label, otherLabels }`, keyed by that same raw value. For a
  GL-code row the client renders "key · label" and the "+n more" disclosure from `otherLabels`; for a
  statement row it renders the line-number-and-label text instead of the raw leaf key. The matching
  `drill.rows` entry uses the same raw key, so presentation metadata cannot change which row opens.

### Opening an Actual's transactions

- Supported answers: an Ask answer whose only row dimension is the domain's line dimension, `gl_code`
  in governed-financial or `leaf_key` in mis-statement, with any dimension filters, comparisons and
  time window, AND whose displayed measures include that domain's Actual, which the reader is
  authorized to see. In any other shape (no breakdown, or a breakdown by month or by several dimensions)
  no Actual is clickable.
- Each supported Ask answer carries a signed drill context, built the way the statement screen's
  signed context is built (`backend/src/mis/statement-attestation.ts`): it binds the reader, the
  executed selection, the effective plant predicate of the executed query, the pinned actuals
  batches, the single budget batch for the answer window's last month (the same block-end rule as the
  statement drill) and that batch's outline. For each statement leaf it also binds the exact plant,
  cost-centre and GL triples the executed query resolved through the mapping master; the outline binds
  only the node-to-leaf identity and label. For every row the context binds its key, its Actual in exact
  paise and whether at least one SAP line feeds it (so the clickable marker and the footer target come
  from the signed context, never from the client), and it expires after the same configured lifetime
  (30 minutes by default). The client sends only that context, the row's key and a page number. Pages
  are integers from 1 through 1,000,000 and the page size is fixed server-side at 100. The page is
  non-authoritative: it never widens scope or changes the predicate. Any page outside that range, or a
  non-integer, is refused with HTTP 400. The server refuses, with a stated reason and an audit record,
  a missing, altered, expired or other-user context, and it never accepts a selection, scope, batch,
  triples or amount from the client.
- Delivery: a supported `AskResponse` gains an optional typed `drill` object, outside the generic
  `ResultTable` rows (whose cells stay string, number or null and gain no column): an opaque signed
  `context` string and a `rows` list of `{ key, drillable }` matching result rows by key. The client
  uses `drillable` only to render an Actual as a button; the server re-checks it against the signed
  context on every click. Answers of other shapes, and answers that do not display an authorized
  Actual (Budget-only, `%`-only, or a reader without the Actual grant), carry no `drill` object. The
  context is signed, not encrypted, so it holds only the values needed to reproduce the displayed
  Actual's read and footer: the row keys, the Actuals shown on screen and, for statement leaves, the
  bound triples, never a figure the answer did not show. The non-sensitive `rowLabels`, resolved from
  the answer's pinned data, are stored in the conversation answer snapshot so its original labels
  remain visible; the `drill` object is never stored there, in a saved view or in a pin. A saved view or
  pin reopens by re-running, so it gets fresh labels and context. An answer shown from a stored
  conversation renders every Actual inert,
  with an "Ask again to open transactions" action that re-runs it; an answer whose context has
  expired is refused on click with "This answer is too old to open. Ask again to open its
  transactions."
- Every click re-authorizes against the reader's current grants and plant scope. If the reader no
  longer holds the domain, the Actual measure or any one plant in the signed predicate, the drill is
  refused with "Your access has changed since this answer was shown. Ask again." and audited; it never
  narrows the predicate and returns a partial, non-footing result.
- From the verified context the server reconstructs the exact predicate for the raw SAP lines the
  answer's governed query aggregated into that row: the row's GL code, or for a statement leaf exactly
  the plant, cost-centre and GL triples bound when the executed query resolved that leaf through the
  mapping master, plus the time window and dimension filters, the effective plant predicate of the
  executed query, and the pinned actuals batches. The statement outline supplies only the node-to-leaf
  identity and label, never the triples. On a statement-leaf click the server reads exactly the bound
  triples. A reader allowed several plants never sees another plant's lines in an answer whose query
  read fewer. Comparisons decide which rows appear, not which transactions feed a row, so they do not
  enter the predicate.
- In a GL-code answer, a line's Actual figure is a button that opens that code's SAP lines under that
  predicate. In a statement-line answer, a line's Actual opens the statement drill's read for that
  leaf, using exactly the triples bound for that leaf by the executed query; the pinned outline
  supplies only its node-to-leaf identity and label. A GL split across several leaves is read only for
  the leaf clicked.
- One transaction panel serves the statement screen and Ask. It shows posting date, document number,
  cost centre, account name, memo, reference, debit, credit and value, 100 lines a page; the
  statement screen's drill gains the document number, cost centre and account name columns as an
  additive change. Its month column stays on the statement screen. Lines are sorted by Value
  descending, Month descending, then posting date descending, transaction number and line id, so page
  boundaries are stable. The drill response returns the total matching count, page and fixed page size
  of 100; the footer covers all matches, not only that page.
- The panel's footer equals the signed Actual of the row that was clicked, to the paisa.
- Reloaded data follows the confirmed drill-down spec (`docs/specs/actuals-drill-down.md`), for the
  pinned actuals batches and, on statement lines, the pinned last-month budget batch alike: a pinned
  batch that still exists but has been replaced is read, the lines still foot to the clicked Actual,
  and the panel names the replacement ("This answer was built on data that has since been reloaded;
  these are the lines it was built from."); a pinned batch that is gone is refused with no rows, the
  reason "The data behind this answer is no longer available. Ask again to open its transactions.",
  and an audit record of the refusal.
- The server marks each row's Actual clickable only when at least one SAP line feeds it under the
  predicate; a genuine zero net with lines behind it stays clickable. Budget figures, `%`, totals,
  budget-only Actuals and empty-state rows are not clickable, and they cause no read and no audit
  record.
- Every opening writes the same typed drill audit record as the statement drill before any row is
  read, including the mapping-master version for attribution only, and fails closed when that write
  fails. The version does not reproduce or gate the read; the signed triples do.

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
  the raw lines its executed query aggregated (pinned batches, period, effective plant predicate).
  Names are grouped after trimming, collapsing internal whitespace and case-folding; group counts and
  "+n more" count normalized groups, and each group displays its most frequent original spelling with
  the alphabetically first spelling winning a tie. A budget-only code uses the MIS line label from the
  answer window's last-month budget outline, and a code with neither uses the bare code; rows, totals
  and order are unchanged.
- **C2** An Ask answer grouped by statement line shows "<number> <label>" from the outline belonging
  to the answer window's last-month budget batch instead of the raw leaf key, also after a re-upload
  makes another outline active; a stored conversation answer retains and shows its original
  `rowLabels` after that re-upload.
- **C3** In an answer whose only row dimension is `gl_code`, clicking a line's Actual opens its SAP
  lines under the server-derived predicate (row GL code, time window, dimension filters, the effective
  plant predicate of the executed query, pinned actuals batches), 100 a page, with a footer equal to
  the row's signed Actual to the paisa; other answer shapes have no clickable Actual.
- **C4** In an answer whose only row dimension is `leaf_key`, clicking a line's Actual opens the same
  lines the statement screen's drill opens for that leaf, using exactly the plant, cost-centre and GL
  triples the executed query bound for it and the answer's pinned batches; the outline supplies only
  the node-to-leaf identity and label. The mapping-master version is audit attribution only and never
  gates the read. The shared panel shows document number, cost centre and account name on both screens.
- **C5** Every opening writes the typed drill audit record before the read and fails closed when the
  write fails; it records the mapping-master version for attribution only. A reader outside the line's
  plants is refused, audited, and sees no rows.
- **C5b** `AskResponse` carries optional typed presentation metadata, `rowLabels` as a list of
  `{ key, label, otherLabels }`, while each `ResultTable` dimension cell keeps its raw GL code or leaf
  key. The client joins labels and the optional `drill.rows` list of `{ key, drillable }` to rows by
  that same raw key; labels never alter query rows or their order. The optional `drill` object also
  carries its signed `context`, is absent for unsupported shapes and answers that do not display an
  authorized Actual, and holds no figure the answer did not display. Conversation answer snapshots
  store `rowLabels` so stored answers retain their original display text, but never store the `drill`
  object; saved views and pins store neither object. A stored conversation answer renders every Actual
  inert with an "Ask again" action; an expired answer's click is refused with the stated wording; a
  saved or pinned reopen gets fresh metadata and context from its re-run.
- **C5c** Every click re-authorizes the reader's current grants and plant scope; a reader who lost
  the domain, the Actual measure or any one plant in the signed predicate is refused with the stated wording and an audit record, never
  served a narrowed, non-footing read.
- **C5a** The drill request accepts only the answer's signed drill context, the row key and an integer
  page from 1 through 1,000,000; the server fixes page size at 100, and anything outside that range or a
  non-integer is a 400. The page cannot change scope or predicate. The response carries the total
  matching count, page and size, and its all-match footer; lines sort by Value descending, Month
  descending, posting date descending, transaction number and line id. The context carries each row's
  key, exact-paise Actual and clickable marker: a missing, altered, expired or other-user context is
  refused with its reason and audited; the read uses the effective plant predicate of the executed
  query, so a reader allowed more plants than the query read sees no extra lines and the footer still
  equals the Actual.
- **C6** A replaced pinned batch, actuals or (on statement lines) budget, is read, foots to the
  clicked Actual and is named as replaced; a gone pinned batch is refused with no rows, the stated
  reason and an audit record, as the confirmed drill-down spec requires.
- **C7** Only Actuals with at least one feeding SAP line are clickable; Budget, `%`, totals,
  budget-only Actuals and empty-state rows are inert and cause no read or audit record; the "+n more"
  disclosure is keyboard- and touch-operable and the full list is in the accessible name; names and
  transaction lines never reach the model.
- **C8** Hermetic proofs cover normalized name grouping, representative-spelling and group-count
  selection, ties, fallback and disclosure; labels leaving query rows and order unchanged and joining
  the correct drill row by raw key; pinned labels after a re-upload and a stored conversation retaining
  those original labels after another re-upload; a multi-period answer choosing its last-month budget
  batch and outline; signed-context refusals; the signed per-row Actual and marker; a non-integer page
  and excessive page 1,000,001, response metadata and stable page boundaries under the specified sort;
  replaced and gone actuals and budget batches; an expired or stored answer; access revoked after the
  answer was shown (including losing one of several plants); the absent `drill` object on unsupported
  shapes; inert Actuals on a stored answer; no `drill` object and no Actual value for a Budget-only
  answer or a reader without the Actual grant; a mixed-plant reader; predicate re-derivation and
  refusal; audit-before-read ordering; replaced and gone batches; inert cells; exact-paise footing;
  and `rowLabels`, SAP account names, the drill context, amounts and transaction rows absent from every
  model request. A manual live check against the July warehouse and the host's Bedrock model,
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
