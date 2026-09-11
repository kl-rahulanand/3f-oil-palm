---
story: mis-statement
title: MIS statement + Excel export
decisions_reviewed:
  - 0001-poc-engagement-scope
  - 0002-phase1-financial-mis
  - 0003-mis-presentation-tool
  - 0004-pulse-governed-joins
  - 0005-client-signoff
  - 0006-frontend-fresh-backend-vendor
  - 0007-frontend-framework-nextjs
  - 0008-pulse-vendored-snapshot
  - 0009-required-tests-real-name-and-tsproject
  - 0010-rebrand-pulse-to-3f
  - 0011-deployment-readiness-poc-scope
  - 0012-vendored-api-constitution-deviation
  - 0013-backend-observability-built-in-poc
  - 0014-sap-ingestion-poc-no-master
  - 0015-warehouse-snake-case-deviation
  - 0016-governed-joins-poc-scope
  - 0017-mis-selection-composite-key-seam
  - 0018-mis-selection-unmapped-gl-bucket
  - 0019-fresh-routes-follow-vendored-house-style
  - 0020-mis-budget-leaf-grain
---

# MIS statement + Excel export

## Problem
`mis-selection` resolves a selection to its governed scope and shows the DUB nursery
slice as a flat GL table. That is not the Financial MIS. Srihari's statement is a
**hierarchical** document — budget component lines with derived subtotals and a grand
total — and replacing his manual build means producing it exactly, from the uploaded
SAP extract and the uploaded plan, and letting him take it away as Excel.

Reading the system for this plan surfaced the structural crux, and it is not where the
spec suggested it would be:

- **The statement's line structure is not persisted anywhere.** `mis_budget`
  (`warehouse-schema.ts:87`) stores `formatId, period, lineId, glCode, costCenter,
  budgetAmount, rolloverAmount` — no S.No, no parent link, no ordering. The `lineId`
  is the workbook's **sheet row number** (`mis-budget.parser.ts`, D-0029), which is a
  uniqueness token, not an outline. The outline the human asked us to mirror is
  currently read and thrown away at ingest.
- **A GL does not identify a statement line.** In July, 80 leaf rows carry only 60
  distinct GLs, and **three GLs hold non-zero budget on more than one component**:
  `50001605` Fertilizers (₹1,73,891.67 / ₹1,34,729.67 / ₹330.87 across Primary,
  Secondary and Tertiary nursery), `50001606` Pesticides (₹3,826.67 / ₹40,275.75) and
  `50001901` Nursery labour (₹81,022.89 / ₹3,86,774.80). Decision **0017** rolls Actual
  up to `(gl_code, month)` with cost centre deliberately a *filter*, never an output
  dimension — so the governed relation returns **one Actual per GL** and the statement
  has no way to place it on the right component row.

SAP does carry the distinction (its cost centres are `Primary`, `secondary`,
`Tertiary`, …) and the budget sections mirror it (`4 Materials Primary Nursery`,
`5 Materials Secondary Nursery`, `6 Materials Tertiary Nursery`). What is missing is
the **recorded correspondence** between them — precisely the *Budget-label → SAP
cost-centre mapping master* that decision **0016 §2** deferred, whose revisit trigger
is *"the client supplies the mapping, OR multi-cost-centre / multi-plant governed
reporting is required."* **That trigger has now fired**, and this story is where it
lands.

## Scope / Non-goals
**In scope**
- Persist the budget workbook's **outline** (S.No, section, component, ordering,
  parent/child) with the batch, so the statement can mirror it.
- Record the **budget-leaf ↔ SAP (cost centre, GL)** correspondence in the versioned
  Mapping Master, so an Actual lands on the right line.
- Group the governed roll-up by the **governed line**, so one query still serves the
  statement — no second query path, no per-row query.
- Render the statement: hierarchy at its natural depth, derived subtotals, grand
  total, both zero states, the visible `unmapped-GL` line.
- Measures per the spec: **Budget · Roll-over · Actual · %** for the **selected month**
  and **FY 26-27 YTD**, Roll-over rendered but unpopulated.
- **Excel export** of the on-screen statement — the first download route in the app.

**Non-goals**
- Table-1 (operational) and Table-3 (Payment Office) — out of scope by the spec, and
  Table-3 is the block the budget parser now deliberately stops before.
- The roll-over **calculation** (column rendered, left blank until Srihari's rule).
- Actuals drill-down to transactions — that is the `drill-down` story, and the export's
  transactions sheet goes with it.
- Editing budgets or actuals; any write-back.
- A live SAP connection: the statement reads the uploaded extract and names its batch.

## Acceptance Criteria
- **s-ms-c1** — For Agriculture / Nursery / DUB / 2026-07-01 the statement renders the
  budget workbook's outline at its natural depth (two levels for most sections, three
  under `9 Admin Expenses`), each row carrying **S.No, Budget Component and leaf GL**,
  with Roll-over shown and unpopulated.
- **s-ms-c2** — Every parent is a **derived** subtotal over its leaves and the grand
  total foots; against the pinned July batch the statement reconciles to **exact**
  values — Actual **₹1,15,12,712.07** and Budget **₹1,00,50,136.29** — and the three
  multi-component GLs show their Actual split across Primary / Secondary / Tertiary
  rather than summed onto one line.
- **s-ms-c3** — Both zero states stay distinct (a resolved-but-empty selection renders
  zero rows; a no-mapping selection renders zeros **plus** the notice), and the
  `unmapped-GL` line is visible with its own Actual.
- **s-ms-c4** — The statement downloads as **Excel** with the same structure and the
  same values, opening cleanly with the hierarchy intact.

## Technical Approach
### Where the line structure comes from
The spec already says *"Budget and Roll-over come from the plan, not SAP"*. The outline
is part of that plan, so it is **persisted with the budget batch**, not frozen in the
repo: when Srihari re-issues his workbook the statement follows it. `mis_budget` gains
the outline columns (`s_no`, `section`, `component`, `sort_order`, `parent_key`) and the
parser — which already walks the outline to decide what is a subtotal — records them
instead of discarding them. Decision **0020** is untouched: **no parent amount is ever
stored**; only the parent's *identity* is, so the statement can group leaves under it
and derive the subtotal itself.

### Where the Actual↔line correspondence comes from
The Mapping Master (`backend/src/mapping/mis-mapping-master.ts`) is already the single
runtime authority for `(cost_centre, gl_code) → mis_line` and plant aliases. It gains
the **budget-leaf correspondence**: each entry names the budget leaf its triple belongs
to. This is 0016 §2's deferred mapping, scoped to the one nursery selection. Following
the pattern `mis-selection` established, the correspondence is **provisional with a
reason** — the Primary/Secondary/Tertiary correspondence is legible from the two
vocabularies, but it is *recorded*, never inferred at runtime, and Srihari's
confirmation resolves it exactly as the `unmapped-GL` bucket is resolved.

### One governed path, still
Decision **0017** stands: selection filters the Actual side by the master's resolved
triples **before** the roll-up. What changes is the *grouping key* of that roll-up —
from `gl_code` to the **governed line** the master defines. This respects 0016/0017 to
the letter: the SAP **cost centre is still never an output dimension**; what the
statement reads back is a master-defined line, which is the same governed vocabulary
`mis_line` already uses. There is no second query path and no per-row query.

### Arithmetic
Aggregate in **exact paise** and round only for display and export, after aggregation —
rounding per line makes subtotals fail to foot. `%` keeps the shipped governed measure
semantics, including its distinct `over-budget` and `credit / negative actual` labels;
the renderer must pass a non-numeric measure value through verbatim (the lesson
`mis-selection` paid for).

### Export
`exceljs@^4.4.0` is already a backend dependency for parsing and writes workbooks too,
so no new dependency. The export is the **first download route** in the app, so it
establishes the pattern: a governed route returning a streamed workbook with a
`Content-Disposition` filename, built from the **same** statement payload the screen
renders — not a second assembly of the numbers, which would be free to drift.

## Surface Impact
- **Warehouse**: `mis_budget` gains outline columns + a migration; the budget rollup
  view carries them through.
- **Backend**: `mis-budget.parser.ts` records the outline; `mis-mapping-master.ts` gains
  the budget-leaf correspondence; `sqlBuilder.ts` groups the roll-up by governed line;
  a statement service + route under `backend/src/mis/`; an export route.
- **Contract**: statement row/tree types and the export request in `contract/src/api.ts`.
- **Frontend**: a statement view under `src/features/mis/`, reached from MIS Reports.
- **Unchanged by design**: the resolution and selection routes (`mis-selection`), the
  governed measures and their nil rules, the six gated warehouse proofs, the auth shell.

## Task Decomposition
Three bounded tasks, sequential — each builds on the last:
1. **statement-model** (backend, `user_facing: false`) — persist the outline, record the
   budget-leaf correspondence in the master, group the governed roll-up by governed
   line, and return the hierarchical statement payload. Gated D-0008 proof that July
   reconciles exactly and the three multi-component GLs split correctly.
2. **statement-view** (frontend, `user_facing: true`) — render the hierarchy, derived
   subtotals, grand total, both zero states and the `unmapped-GL` line.
3. **statement-export** (fullstack, `user_facing: true`) — the Excel download, built
   from the same payload the screen renders.
