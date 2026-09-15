---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-15
stories: [multi-plant]
supersedes: 0031-format-outline-object
---

# PoC: the format's budget belongs to the plant the master names; plant-keyed budget batches and the outline object wait for a second plant's budget

## Context
Decision 0031 designed the correct long-term model for many plants with their own budgets: the
format outline as its own ingest object and budget batches keyed by plant and period. After the
plan was approved the human asked why showing 31 plants was such a big task, and re-scoped
(2026-09-15): the client has supplied exactly one budget, the nursery's, and no second budget is
in sight before the PoC demo. Building plant-keyed batches, a new source kind, a migration and a
plant field on the upload for a budget that does not exist is work ahead of demonstrated demand.

What cannot wait is the misattribution 0031 also prevented: the shipped budget batch is global
per month, so a non-nursery statement would silently show DUB's budget on every line.

## Decision
For the PoC, **the format's budget belongs to the plant the master names as its budget owner**
(`nursery-mis-financial-v1` → `DUB`). The statement for the owner plant reads the budget as
shipped; a statement for any other plant renders the same format outline from the active budget
batch and carries a distinct **not-loaded** budget state, rendered as a dash with the label
"Budget not loaded for this plant" in Budget, Roll-over and %, never as ₹0 or an over-budget
flag. The governed Ask relation joins Budget only for the owner plant; every other plant's Budget
measure is null with the same label. The batch model, the budget upload, the drill's pin contract
and decision 0021's outline snapshot are unchanged.

This record **supersedes 0031 for the PoC** and carries its model forward as a named deferral
with a trigger: **when a second plant's budget workbook arrives**, plant-keyed budget batches,
the format outline object, the `plant` upload field, the partial-FY-YTD rule and the
master-version pin (D-0038) land together as their own story.

## Consequences
- No warehouse table migration in this story; the `actual_by_gl_month` view drops its DUB
  literal (a view redefinition) so Ask can carry `plant` as a dimension.
- The master gains a `budget_owner_plant` per format; a format with no owner has no budget
  anywhere, which is a validation error, not a silent zero.
- Decision 0023 (drift reported, not blocked) is untouched because the budget upload is
  untouched.
