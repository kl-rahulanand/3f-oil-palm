---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-11
stories: [mis-statement]
---

# The budget outline is persisted as a per-batch snapshot keyed by a stable leaf key

## Context
The human settled that the Financial MIS statement **mirrors the budget workbook's own
outline** at its natural, uneven depth. Nothing persists that outline today:
`mis_budget` (`backend/src/warehouse/warehouse-schema.ts:87`) stores only
`formatId, period, lineId, glCode, costCenter, budgetAmount, rolloverAmount`.

The first design put a `parent_key` on the leaf rows. The plan grill showed that fails
three ways:

1. **There is no parent to point at.** Decision **0020** stores leaf rows only — parent
   subtotals are deliberately skipped — so `parent_key` would reference a node that is
   never persisted.
2. **Admin Expenses has two parent levels** (`9 Admin Expenses` → `9.01 Vehicle
   Maintenance` → `Petrol and Diesel Charges`), which 0020's wording did not anticipate.
3. **The leaf key is unstable.** `lineId` is the workbook's **sheet row number**
   (`mis-budget.parser.ts`, D-0029). Any reissued or reordered workbook silently
   repoints every Mapping Master entry that targets it — a silent financial
   misattribution, the same class this project has already paid for twice.

## Decision
The budget workbook's outline is persisted as its **own per-batch snapshot** — the
ordered tree of section → component → leaf, carrying each node's `S. No.`, its label and
its ordering — rather than as columns on the leaf amount rows. Monetary storage stays
exactly as decision 0020 set it: **leaf rows only, no stored parent amounts**; the
snapshot records *structure*, never money.

Each leaf carries a **stable leaf key derived from its identity** (its position in the
outline plus its GL and component), **never its sheet row number**, so a reissued
workbook maps onto the same lines. The existing July batch is re-uploaded once so it
carries the snapshot.

Decision **0020 is amended** by this record: its "one parent level over leaf GLs"
assumption is replaced by an outline of arbitrary depth. Its substantive rule — a row
whose Budget cell is a formula containing a cell reference is a derived subtotal and is
never stored as an amount — is unchanged.

Confirmed by the human on 2026-09-11.

## Consequences
- The statement can mirror the workbook at whatever depth each section has, and a
  reissued plan changes the statement's structure with it, which is what "from the plan,
  not SAP" means.
- The Mapping Master can target a leaf that survives a reordered workbook.
- A migration plus one re-upload of the July batch is required; a batch ingested before
  this change has no snapshot and must be re-ingested rather than guessed at.
- The parser must now genuinely **walk** the outline to build the tree. It does not do
  this today — it tests each row's Budget cell formula independently — so that is new
  work, not a rewording of what exists.
