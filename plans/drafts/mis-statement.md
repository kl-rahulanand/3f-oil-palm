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
  - 0021-mis-statement-outline-snapshot
  - 0022-mis-statement-governed-projection
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
### Where the line structure comes from (decision 0021)
The spec already says *"Budget and Roll-over come from the plan, not SAP"*. The outline
is part of that plan, so it is **persisted with the budget batch** — when Srihari
reissues his workbook the statement follows it.

It is stored as its **own per-batch outline snapshot** — the ordered tree of
section → component → leaf carrying each node's `S. No.`, label and ordering — **not**
as columns on the leaf amount rows. A `parent_key` on a leaf would point at a parent
that decision 0020 deliberately never persists, and `9 Admin Expenses` has **two**
parent levels, which 0020's original wording did not anticipate. Each leaf carries a
**stable key derived from its identity**, never its sheet row number, so a reordered
workbook cannot silently repoint a mapping. Monetary storage is untouched: **leaf rows
only, no stored parent amounts** — the snapshot records structure, never money.

**The parser does not walk the outline today.** It tests each row's Budget cell formula
independently (`isSubtotal`), which is enough to *exclude* subtotals but does not build
a tree. Constructing the outline is **new work**, not a rewording of what exists. The
existing July batch is re-uploaded once so it carries a snapshot; a batch ingested
before this change has none and must be re-ingested rather than guessed at.

### Where the Actual↔line correspondence comes from
The Mapping Master (`backend/src/mapping/mis-mapping-master.ts`) is already the single
runtime authority for `(cost_centre, gl_code) → mis_line` and plant aliases. It gains
the **budget-leaf correspondence**: each entry names the budget leaf its triple belongs
to. This is 0016 §2's deferred mapping, scoped to the one nursery selection. Following
the pattern `mis-selection` established, the correspondence is **provisional with a
reason** — the Primary/Secondary/Tertiary correspondence is legible from the two
vocabularies, but it is *recorded*, never inferred at runtime, and Srihari's
confirmation resolves it exactly as the `unmapped-GL` bucket is resolved.

### A second governed shape, recorded as one (decision 0022)
The statement reads a **separate governed projection** at **leaf/month** grain. It keeps
decision 0017's principle exactly — filter the Actual side by the master's resolved
`(plant, cost centre, GL)` triples **before** aggregating — then maps each triple to its
stable leaf key and full-outer-joins Budget and Actual at that grain.

The shipped `(gl_code, month)` relation is **left exactly as it is**. The earlier draft
claimed the grouping key could change with "0016/0017 unchanged"; that was wrong on both
counts, and `mis-selection`, the semantic domain and the future `drill-down` all read the
GL-month shape deliberately. This is therefore recorded as a **new governed shape**. The
SAP cost centre is still never an output dimension — what the statement reads back is a
**master-defined line**.

Two governed shapes now exist, so both stay behind the same grants, scope injection and
provenance (decision 0016), and the statement projection carries a **no-fan-out proof of
its own** — a leaf/month grain has its own fan-out risk, and a silent fan-out here would
overstate the statement exactly as the bucket grain did in `mis-selection`.

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

### Routes and DTOs
Two routes under the existing `api/mis` controller, following decision **0019** (the
vendored house style: unversioned path, raw typed body, direct module import), both
behind the same `SessionGuard` + governed `report` grant the shipped selection routes
use, and both documented with `@ApiProperty` DTOs beside the existing
`mis-selection.dto.ts`:

- `POST api/mis/statement` — body is the four selectors already validated by
  `misSelectionRunRequestSchema`; returns the statement tree, its measures, the scope
  readout and provenance.
- `POST api/mis/statement/export` — same body, returns the workbook as a streamed
  download with a `Content-Disposition` filename. This is the **first download route in
  the app**, so it sets the pattern.

An unauthorized plant is refused exactly as `mis-selection` refuses it; a plant the
master does not cover returns the **unresolvable** outcome, never a 403 — the split
`mis-selection` had to make mid-review.

## Decisions
- **0021** (this story) — the outline is a per-batch snapshot keyed by a stable leaf key;
  amends 0020's one-parent-level assumption.
- **0022** (this story) — the statement reads its own governed projection at leaf/month
  grain; the GL-month relation is untouched; 0016 §2's deferred Budget-label mapping is
  taken up here, provisionally.
- **0020** — leaf rows only, no stored parent amounts; parents are derived.
- **0017** — filter before the roll-up; selection narrows the governed path, never forks it.
- **0018** — the `unmapped-GL` line stays visible; the no-mapping zero state keeps its notice.
- **0016** — all-or-nothing governed access, two-sided scope injection, provenance, golden fixtures.
- **0019** — fresh routes follow the vendored house style.
- **0002 / 0003** — this is the Phase-1 deliverable and its presentation layer.
- **0007 / 0010 / 0012 / 0015** — Next.js, 3F branding, the vendored-API deviation, warehouse snake_case.
- **0009** — `required_tests` name a real leaf and pin `TS_NODE_PROJECT`.

## Risks
- **Fan-out at the new grain.** A leaf/month join can fan out where the GL/month one did
  not. Mitigated by a gated no-fan-out proof owned by task 1, asserting exact row counts
  and exact July totals.
- **Double-count via a stored parent.** If the snapshot ever carried money, parents and
  leaves would both total. Mitigated structurally: the snapshot stores no amounts.
- **A provisional correspondence presented as fact.** The Primary/Secondary/Tertiary
  mapping is recorded provisionally with a reason and is visible for Srihari to confirm,
  exactly as the `unmapped-GL` bucket is.
- **Rounding that does not foot.** Mitigated by aggregating in exact paise and rounding
  only for display and export, asserted by a test that sums leaves against each subtotal.
- **Export drift.** Mitigated by building the workbook from the **same payload** the
  screen renders, asserted by a test comparing exported cells to the rendered rows.

## Verify Plan
- `python3 factory/scripts/verify.py` — structural, typecheck, quality, test.
- `npm run build:frontend` — the statement adds a route.
- Gated **D-0008** host proof extending `test:warehouse-proof`: July reconciles to
  Actual **₹1,15,12,712.07** and Budget **₹1,00,50,136.29**; every parent subtotal equals
  the sum of its leaves; the grand total foots; the three multi-component GLs split
  across Primary / Secondary / Tertiary; no fan-out at leaf/month grain. Run with a
  dead-port negative control so a green run cannot be skips.
- The six existing gated warehouse proofs still pass **unchanged** — that is the evidence
  decision 0022 kept its promise not to disturb the GL-month relation.
- **Functional check** (user-facing tasks 2 and 3): sign in, open the statement for
  Agriculture / Nursery / DUB / Jul 2026, confirm the hierarchy, the derived subtotals,
  the grand total and the `unmapped-GL` line, then download the Excel and open it.

## Surface Impact
| Surface | Change | Classification |
|---|---|---|
| Warehouse schema | budget outline snapshot table + migration; stable leaf key on `mis_budget` | **new** |
| Warehouse views | a statement projection at leaf/month grain | **new** |
| Backend — ingest | `mis-budget.parser.ts` builds and records the outline tree | **changed** |
| Backend — mapping | `mis-mapping-master.ts` gains the provisional budget-leaf correspondence | **changed** |
| Backend — API | `POST api/mis/statement` and `.../export` + DTOs in `backend/src/mis/` | **new** |
| Contract | statement tree/row types and the export contract in `contract/src/api.ts` | **new** |
| Frontend | statement view under `src/features/mis/`, reached from MIS Reports | **new** |
| **Unchanged by design** | the `(gl_code, month)` relation, the semantic domain and its measures, the selection/options routes, the six gated warehouse proofs, `SessionGuard`/`AppShell` | **unchanged** |

## Task Decomposition
Four bounded tasks, sequential — each builds on the last. The export is split so no task
spans backend and frontend at once:
1. **statement-model** (backend, `user_facing: false`) — persist the outline snapshot with
   its stable leaf key, record the provisional budget-leaf correspondence in the master,
   and add the statement's governed projection at leaf/month grain. Gated D-0008 proof:
   exact July reconciliation, footing subtotals, the three-way GL split, no fan-out.
2. **statement-api** (backend, `user_facing: false`) — `POST api/mis/statement` returning
   the hierarchical payload with scope readout and provenance, behind the existing grant,
   with the unresolvable outcome preserved and DTOs beside `mis-selection.dto.ts`.
3. **statement-view** (frontend, `user_facing: true`) — render the hierarchy at its
   natural depth, derived subtotals, grand total, both zero states and the visible
   `unmapped-GL` line, with non-numeric measure labels passed through verbatim.
4. **statement-export** (backend, `user_facing: true`) — `POST api/mis/statement/export`
   streaming an `exceljs` workbook built from the **same payload** task 2 returns, plus
   the download affordance on the statement view.
