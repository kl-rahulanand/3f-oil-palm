---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-11
stories: [mis-selection, mis-statement]
---

# MIS budget ingest stores leaf rows at the GL codes SAP books

## Context
The real client budget workbook (`Nursery MIS Format.xlsx`) has never been ingested. The
failure was first read as a date bug — deferral **D-0029**, raised when
`mis-budget.parser.ts` `cellText()` threw `RangeError: Invalid time value` — but
investigating it on the host showed three distinct things, only the first of which is a
code defect:

1. **The crash.** ExcelJS decodes an *uncalculated* formula's cached result as an
   `Invalid Date`, and `cellText()` called `toISOString()` on it unconditionally. This
   happened on row 4 of the `MIs Format` sheet — inside an unrelated table — so the parser
   died before ever reaching the budget table, whose header row is **479**.
2. **The workbook is hierarchical.** A row that carries an `S. No.` is a **parent** line
   whose Budget cell is an uncalculated `SUM()` over the rows directly beneath it. Those
   rows carry **no `S. No.`**, hold the real figures, and have their own GL codes — e.g.
   parent `55011200` *Insurance* = `SUM` of `55011201` *Insurance–Stocks* and `55011202`
   *Insurance–Assets*. The parser required `S. No.` on every GL row, so it rejected all
   37 leaf rows as malformed while accepting the parents.
3. **Formulas without cached results.** The workbook was saved by a tool that did not cache
   formula results: 532 `Roll Over Budget` cells and 56 `Budget` cells carry a formula with
   no numeric result. The parser is fail-closed, so any one of them refuses the upload.

Which rows to store is **financial meaning, not an engineering choice**, so it was put to
the human rather than inferred. The deciding evidence: **SAP books actuals against the LEAF
GL codes.** `55010901` (Petrol and Diesel) and `55010902` (Repairs & Maintenance Vehicles)
are both leaf rows here, and both appeared as real DUB actuals in the live MIS Reports run.
Parent codes such as `55011200` do not appear in the actuals at all. Since the governed
relation joins Budget to Actual on `gl_code` (decision 0017), storing parents would produce
budget rows that can never join, and storing both would double-count every parent's amount.

## Decision
The MIS budget ingest stores **leaf rows only**. A GL row whose Budget cell is a
`SUM()` over the rows below it is a **parent subtotal** and is skipped; the rows beneath it,
which carry the figures and the GL codes SAP books, are what is stored.
`S. No.` is consequently **no longer required** on a stored row — it identifies a parent
line, and leaves have none.

An **uncomputed `Roll Over Budget` cell stores 0** and is counted in the ingest's validation
report rather than blocking the upload, because decision 0016 defers Roll-over entirely and
the governed layer exposes only Actual, Budget and %. An uncomputed **`Budget`** cell on a
row that is being stored still **fails the ingest**: that is a real figure, and defaulting
it would invent a number. After parent subtotals are skipped this is expected to be
unreachable for this workbook — every uncomputed Budget cell sits on a parent `SUM` row.

> **Amended 2026-09-11 (implementation).** This record originally said a parent is a row
> whose Budget cell is an *uncomputed* `SUM()`. That was drawn from an incomplete reading and
> is **too narrow**: the budget table has **17** `SUM()` parent rows, and **10 of them carry a
> cached result**. Skipping only the uncomputed ones stored nine cached parents alongside
> their children and overstated July by exactly **132,000.00** — the sum of those nine. The
> rule is therefore: a Budget cell that is a `SUM()` over the rows below marks a parent,
> **whether or not Excel cached its result**. (The three parents with no GL code are skipped
> anyway, since a stored row must carry one.) Verified by reconciling the stored leaves against
> the workbook's own July grand total.

Confirmed by the human on 2026-09-11.

## Consequences
- Budget joins Actual on `gl_code` as decision 0017 requires, because both sides now carry
  the codes SAP books. Nothing double-counts, because a parent and its children are never
  both stored.
- The MIS statement's visible parent lines are **derived by rolling up the leaves**, not
  read from the workbook. That is the same direction the governed layer already aggregates
  in, so no second source of truth appears.
- The parser stops treating a missing `S. No.` as malformed. The line identity of a stored
  row is its GL code and Budget Component, not the workbook's outline number.
- Deferral **D-0029** is resolved by this record and the change it implies.
- The ingest's validation report gains a count of uncomputed Roll-over cells, so a workbook
  that silently lost its cached results is visible rather than absorbed.
- If a future workbook books actuals against parent codes, this record must be revisited.

> **Amended 2026-09-11 by decision [0021](0021-mis-statement-outline-snapshot.md).** The
> "assumes one parent level over leaf GLs" caveat is superseded: `9 Admin Expenses` →
> `9.01 Vehicle Maintenance` → `Petrol and Diesel Charges` is two parent levels, and the
> outline is now persisted as a per-batch snapshot of arbitrary depth. The substantive
> rule here is unchanged — a Budget cell that is a formula containing a cell reference
> marks a derived subtotal, and no parent amount is ever stored.
