---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-15
stories: [multi-plant]
---

# The statement format's outline is its own ingest object, pinned separately from any plant's budget amounts

## Context
Decision 0021 persisted the budget workbook's outline as a per-batch snapshot under the
**budget** batch, and the statement reads it by budget period
(`StatementOutlineRepository.findByBudgetPeriod`, `mis-statement.service.ts:90`) while the
drill requires exactly one budget batch covering the block end (`mis-drill.service.ts`).
That was correct with one plant and one budget. The all-plants spec makes every plant render
the nursery format, most of them with **no budget batch at all**, and a plant budget can be
uploaded independently of the nursery's. The spec grill (2026-09-15) found that "the format's
active outline" was not an object that exists or can be pinned.

## Decision
The statement format's outline becomes its **own ingest object**: a batch of source kind
`outline`, one active per format and period, holding the format's `mis_budget_outline` rows.
Budget batches are keyed by **plant** and period. Each budget batch still carries its own
workbook outline snapshot (decision 0021 unchanged, so its rows always have a referential home)
and records the format outline batch it was validated against. Uploading the nursery workbook
produces the format's outline batch and DUB's budget batch in one transaction. Any other
plant's budget workbook is compared leaf-for-leaf against the active format outline: **the
upload succeeds either way** and the comparison is reported in its validation result
(decision 0023 governs — drift is reported, never blocked); only leaves present in the format
outline attach to the statement, and the unattached ones are named in the report. The
statement reads the format's active outline for the period and pins its batch id in
provenance under source `outline`; the drill requires exactly one outline pin covering the
block end and accepts zero or more plant budget pins. Parents stay derived (0020).

## Consequences
- Warehouse migration: `ingest_batch.source_kind` admits `outline`; `ingest_batch` gains a
  nullable `plant` (set for budget batches only) and a nullable `outline_batch_id` (set for
  budget batches, naming the format outline they were compared against); the
  active-uniqueness index becomes `(source_kind, period, COALESCE(plant, ''))`. The
  `mis_budget` → `mis_budget_outline` foreign key is unchanged; `budget_by_leaf_month` gains
  `plant` and the statement attaches budget rows to the format outline by leaf key.
- The existing DUB batches are re-created by one re-upload of the nursery workbook with
  `plant=DUB`, the same precedent 0021 used.
- The recorded lesson "ingest_batch has no plant column" is knowingly contradicted by this
  record; it described the old shape, which this decision changes.
