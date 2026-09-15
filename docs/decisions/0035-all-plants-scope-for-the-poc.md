---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-15
stories: [multi-plant]
supersedes: 0029-all-plants-provisional-scope
---

# Every SAP plant is selectable on the nursery format with provisional labels; for the PoC the nursery budget stays a single batch owned by DUB and every other plant shows a dash

## Context
Decision 0029 recorded the human's product call of 2026-09-15: every SAP plant selectable on
the nursery format, provisional labels, an absent budget shown as a dash. Its clause 4 also
fixed the mechanism — budget batches keyed by plant and period, and the partial-FY-YTD rule —
and decisions 0030 and 0032 elaborated that mechanism. After the six-task plan was approved,
the human asked why showing 31 plants was such a big task and re-scoped the story to the
smallest shape that still keeps the docked assistant working beside any plant (decisions 0033
and 0034 supersede 0030 and 0032). Clause 4 of 0029 then contradicted 0033, and the plan
re-read refused to choose silently between two accepted records.

## Decision
This record supersedes 0029 and restates what it keeps:

1. **Every plant present in the client's SAP data is selectable** on the nursery format
   (`nursery-mis-financial-v1`). Office and unit plants populate the Manpower and Admin
   sections and show ₹0 on the nursery-only sections; a trimmed format stays rejected.
2. **Department and Function are provisional labels, flagged in the master**, classified
   from the SAP plant code through the committed classification table: nursery plants (those
   booking Primary, secondary, Tertiary or Imported Sprouts, or flagged in the table) are
   Agriculture / Nursery; `H.O` is Corporate / Office; every other plant is Operations / Unit.
3. **The full mapping sheet is applied to every plant**, and every actuals triple resolves
   exactly once, to a format leaf or to the visible `unmapped-GL` bucket (0018 extends
   company-wide). Nothing is inferred and nothing is dropped.
4. **For the PoC the nursery budget stays one batch per period, owned by DUB** (decision
   0033): a statement or Ask answer for any other plant carries a distinct not-loaded state
   rendered as a dash, never ₹0, NA or an over-budget flag. Plant-keyed budget batches, the
   outline object, the `plant` upload field, the partial-FY-YTD rule, cascading selection
   tuples, unknown / missing plant reporting on the actuals upload and the master-version pin
   are **deferred together until a second plant's budget arrives** (0033's trigger). The
   earlier grill answers that chose cascading tuples, the partial-YTD rule and upload
   reporting are superseded by this re-scope, not forgotten: they describe the deferred story.
5. **The governed join** keeps 0016's surviving clauses as 0029 restated them: key
   `gl_code` + `month`, full-outer and zero-filled, the "Budget Components" label
   informational, the Budget-label → SAP-cost-centre master and any allocation still deferred
   with 0016's trigger. Evaluating it within each granted plant, with the Budget side attached
   only to the owner plant, is part of the plant-aware assistant that decision 0036 defers; in
   this story the governed Ask relation stays DUB-only as shipped.
6. **The master's `plant_canonical` is the plant identity.** DUB stays `DUB` with SAP alias
   `DUB-NUR`; every other plant's canonical id is its SAP code.

## Consequences
- The multi-plant story implements clauses 1-3, 5-6 and the PoC half of clause 4; the
  deferred half is one follow-up story with a named trigger.
- Decisions 0031 (generated master), 0033 (budget owner) and 0036 (assistant untouched) stand
  and are attested by the plan; 0016, 0029, 0030, 0032 and 0034 are superseded.
- The roadmap item's acceptance criteria are reduced to match; `ask-period-control` proceeds
  against the shipped `statementRequest`.
