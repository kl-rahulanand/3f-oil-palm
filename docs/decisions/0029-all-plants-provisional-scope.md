---
status: superseded
confirmed_by: "Rahul Anand"
date: 2026-09-15
stories: [multi-plant]
supersedes: 0016-governed-joins-poc-scope
superseded_by: 0035-all-plants-scope-for-the-poc
---

# Every SAP plant is selectable on the nursery format with provisional labels, and an absent budget renders as a dash

## Context
The PoC ships one selection, Agriculture / Nursery / DUB, because the client supplied a
mapping sheet and a budget for the nursery only (decisions 0014, 0018). The July SAP
extract holds 4,113 lines across 31 plants, all already ingested and retained.

A measured read of the two client workbooks on 2026-09-15 found that the nursery mapping
generalises: the chart of accounts is company-wide (54 distinct GL codes, 45 named in the
mapping sheet), every plant books only the cost centres the nursery uses, and the mapping
sheet's cost-centre-plus-GL dictionary resolves 93% of company spend. The unresolved 7% is
eleven pairs, the same secondary-nursery and labour GLs already bucketed for DUB.
Srihari's own delivery note asks for sheets "based on the same format and logic" for every
Plant + Cost Center + GL combination.

Three choices were put to the human on 2026-09-15: which format office and unit plants
use, how to label Department and Function for plants the client has not named, and
whether to show plants with no budget at all. The client has not supplied a budget, a
format, or a Department / Function name for any plant other than the nursery.

## Decision
1. **Every plant present in the client's SAP data is selectable**, on the nursery format
   (`nursery-mis-financial-v1`) for all of them. Office and unit plants populate the
   Manpower and Admin sections and show ₹0 on the nursery-only sections. A trimmed
   format is rejected for now: it would add a second outline and a per-plant format
   assignment the client has not confirmed.
2. **Department and Function are provisional labels, flagged in the master**: nursery
   plants (those in the format workbook's Plant list or booking Primary, secondary,
   Tertiary or Imported Sprouts) are Agriculture / Nursery; `H.O` is Corporate / Office;
   every other plant is Operations / Unit. The SAP plant code is the canonical
   identifier. Renaming is a data change when the client answers.
3. **The full mapping sheet is applied to every plant**, and every actuals triple resolves
   exactly once, to a format leaf or to the visible `unmapped-GL` bucket. Nothing is
   inferred and nothing is dropped; decision 0018's bucket rule extends company-wide.
4. **An absent budget is a distinct state rendered as a dash**, never ₹0, NA or an
   over-budget flag. Budget batches become keyed by plant and period; the nursery budget
   stays attached to DUB and is never copied or allocated to another plant (0014 stands).
   In a financial-year-to-date block whose budget covers only some months, Budget sums the
   loaded months and names them, and % renders the dash.
5. **This record supersedes decision 0016 and restates what it keeps.** The governed
   Budget ⋈ Actual join key stays `gl_code` + `month`, full-outer and zero-filled where a
   budget batch exists, now evaluated **within each granted plant** rather than within DUB
   alone, with the row-scope predicate injected on both sides. The "Budget Components"
   label stays informational, never a join key. The Budget-label → SAP-cost-centre
   mapping master and any balanced allocation remain DEFERRED with 0016's revisit trigger
   (the client supplies the mapping, or cost-centre-grain governed reporting is required).
6. **The master's `plant_canonical` is the plant identity.** DUB stays `DUB` with SAP
   alias `DUB-NUR` as shipped; every other plant's canonical id is its SAP code.

## Consequences
- The multi-plant story implements this; its spec `docs/specs/all-plants-statement.md`
  carries the measured acceptance criteria, including that the 31 Grand Totals sum to
  the company-wide net in exact paise.
- The provisional labels and the company-wide bucket are the artifacts put in front of
  Srihari to elicit the authoritative Master Table and per-plant budgets; both resolve as
  data changes with no schema or code change.
- Decision 0016 is superseded by this record; its join key, zero-fill, two-sided scope
  injection and deferral survive unchanged in clause 5, and the governed financial
  relation gains `plant` as a scoped dimension.
- The format outline becomes a pinnable object independent of any plant's budget
  amounts (extending decision 0021); plant budgets attach to it and must match it. The
  budget upload takes an explicit canonical plant id, since the client's workbook names
  no owning plant.
- Only master-configured selections are ever offered; an unknown plant in a later SAP
  upload is reported by ingest validation and added as master data.
- The `ask-period-control` story follows this one; its plant-choice exclusion is
  narrowed by the plant clarification this story adds for multi-plant users.
