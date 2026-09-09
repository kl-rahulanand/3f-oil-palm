---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-09
stories: [sap-ingestion]
---

# PoC ingests the provided Excel workbooks directly — no governed mapping master

## Context
The sap-ingestion plan grill found that a governed mapping master and a balanced budget allocation
cannot be built for the PoC from the supplied data: `SAP Entries Mapping.xlsx` lacks 7 of the DUB GLs
(≈11 DUB rows unmapped, a cost-center conflict), and neither workbook carries MIS line-id / period /
amount / weights from which an allocation could be derived without inventing financial meaning
(architecture `20-financial-mis-data-model.md:67-84`; `30-financial-mis-build-plan.md`). The client
directed (2026-09-09) that the PoC use the provided workbooks directly.

## Decision
For the sap-ingestion PoC, ingest the mapping and budget **directly from the two provided workbooks**
(`docs/context/2026-08-20-srihari-phase1-data/{SAP Entries Mapping.xlsx, Nursery MIS Format.xlsx}`)
with their coverage taken as-is — **no governed `mis_mapping_master` object and no derived budget
allocation.** The raw + gold reconciliation (`Σ(Debit−Credit)`, July DUB = ₹11,512,712.07) is
mapping-independent; unmapped rows are retained raw. Actuals and Budget stay separate (decision 0004).

## Consequences
- A governed mapping master and a reviewed budget allocation are DEFERRED to the mis-selection and
  governed-joins stories; this supersedes, for the PoC only, the requirements-grill's
  balanced-allocation answer.
- Mapped/reportable categorization and budget% are not produced by this story; the statement story
  proves display later against the same frozen reconciliation fixture.
- Ingestion never invents a mapping/allocation; correctness for the PoC rests on the raw+gold total.
