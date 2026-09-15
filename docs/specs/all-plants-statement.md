---
slug: all-plants-statement
title: All plants in the Financial MIS statement
status: confirmed
saved: 2026-09-15T07:21:44+00:00
---

# All plants in the Financial MIS statement

## Why
The shipped statement offers one selection, Agriculture / Nursery / DUB, because the
Mapping Master carries one selection and the budget loader is fixed to the nursery. The
July SAP extract already holds 4,113 lines across 31 plants, and a measured read of the
client's two workbooks (2026-09-15) shows the nursery mapping generalises: the chart of
accounts is company-wide (54 distinct GL codes in July, 45 of them named in the mapping
sheet), every plant books only the cost centres the nursery uses (Admin, Manpower,
Primary, secondary, Tertiary, Imported Sprouts, Transportation Charges), and the mapping
sheet's cost-centre-plus-GL dictionary classifies 92.7% of company spend (₹10,21,80,290.32
of ₹11,02,73,718.00, exact paise). The remaining ₹80,93,427.68 sits in eleven
cost-centre-plus-GL pairs the sheet never names: nine are the secondary-nursery and labour
GLs already bucketed for DUB, and two (`Primary / 50001802`, `Tertiary / 50001904`) DUB
never books.
Srihari's delivery note asks for exactly this: sheets generated "based on the same format
and logic" for every Plant + Cost Center + GL combination, with zero-valued combinations
still rendered.

The human decided (2026-09-15) to offer every plant now, on the nursery format, with
provisional Department / Function labels, and to show an absent budget as a dash rather
than a zero. The client has supplied a budget for the nursery only.

## Users
Finance and management at 3F reviewing any plant's Financial MIS; the demo audience;
Srihari, who will use the provisional labels and the unmapped-GL bucket to tell us the
authoritative master.

## Behaviour

### Every plant in the loaded actuals is selectable
- The Mapping Master carries one selection per SAP plant code present in the client's
  data, not one. The master's `plant_canonical` is the identity that keys grants, budget
  ownership, drill pins and audit: DUB stays `DUB` with its SAP alias `DUB-NUR`, exactly
  as shipped, and every other plant's canonical id is its SAP plant code (no alias). The
  MIS Reports dropdowns cascade from the master's configured selections filtered to the
  signed-in user's plant grants, as `SelectionResolverService.options()` already does, so
  Department, Function and Plant can never form a combination the master does not hold.
- Department and Function are **provisional labels**, flagged as such in the master and
  surfaced as provisional wherever the selection is shown, so the client can rename them
  without a schema change:
  - classification is keyed on the **SAP plant code alone**, through a committed plant
    classification table (decision 0031); the format workbook's `Plant list` is never used
    for matching, so `DHS` / `DHS2` versus `DMHS` cannot misclassify anything;
  - a plant is a **nursery** when the loaded extract books any of the cost centres
    Primary, secondary, Tertiary or Imported Sprouts for it, unless the table overrides
    the flag; nursery plants are labelled **Agriculture / Nursery** (fourteen in July:
    DUB-NUR, CK, TPTY, Krishna, DMHS, ROING, LKMP, NLR, Nandyal, TMK-NK, CHIR, GLIM, Pend,
    S.Kota);
  - `H.O` is labelled **Corporate / Office**;
  - every other plant is labelled **Operations / Unit**.
- A plant that appears in a later SAP upload but not in the master is **not offered**:
  the actuals upload's validation result names every plant code the master does not
  know, and adding it is a master data change, never a runtime inference (decision 0018
  stands). A direct statement request for an unconfigured plant fails closed with the
  existing "no mapping configured" outcome. The unmapped-GL bucket is for unresolved
  cost-centre-plus-GL pairs of a configured plant, not for unconfigured plants.
- **Actuals uploads stay replace-per-period and always activate** (human-decided this
  grill): the SAP Base Report is a company-wide extract, and the previous batch is
  retained and re-uploadable. The upload's validation result additionally names every
  plant present in the previously active batch for that period but absent from the new
  one, so a partial extract is visible rather than silently shrinking the company. Unknown
  plant codes are stored raw and reported, never offered.

### One format, one mapping dictionary, applied per plant
- Every plant renders the confirmed nursery format (`nursery-mis-financial-v1`): the
  same outline, S.No, Budget Component and GL code columns, the same period blocks and
  the same derived subtotals and Grand Total. Office and unit plants populate sections 8
  Manpower and 9 Admin and show ₹0 Actual on the nursery-only sections. This is the
  human's choice over a trimmed format.
- The master's cost-centre-plus-GL entries are the **full mapping sheet** (all 95 pairs
  of Sheet1, keyed on its second `Cost Center` column and GL code), applied to every
  plant, because the chart of accounts and cost-centre vocabulary are company-wide. The
  shipped master carries only the 28 pairs DUB used in July, which resolves 33% of H.O
  spend where the full sheet resolves 100%; that gap closes here.
- Every `(plant, cost centre, GL)` triple present in the actuals resolves **exactly once**:
  to a leaf of the format outline, or to the visible `unmapped-GL` bucket (decision 0018).
  Pairs the mapping sheet does not name go to the bucket with reason "not in the mapping
  sheet"; DUB's existing bucket rows and reasons are unchanged. No row is dropped and no
  row fans out; the sum of every plant's Grand Total Actual equals the company-wide net of
  the active actuals batch, in exact paise.
- All new master rows are provisional, carrying their reason, as decision 0018 requires.
  The master version increments so audit records and drill pins distinguish the two.

### The statement outline belongs to the format, the budget to the plant
- The outline snapshot (decision 0021) becomes the **format's** row structure, a
  pinnable object in its own right, independent of any plant's budget amounts (decision
  0030). A plant budget attaches its amounts to the format outline by stable leaf key.
  Leaves that do not match the active format outline **load and are reported** in the
  upload's validation result (decision 0023: drift is reported, never blocked); they do
  not attach, and the report names them. Every plant, with or without a budget, renders
  the format's active outline. The statement and the drill pin the outline object
  explicitly and separately from any plant budget batch.
- Budget batches are keyed by **plant and period** as well as source kind, so a second
  plant's July budget can be active alongside the nursery's. The client's format workbook
  carries no owning plant (its `Plant list` sheet names sixteen), so the budget upload
  takes an explicit canonical plant id as a request field, validated against the master,
  and the parser stops assuming DUB; the current nursery workbook is re-imported once
  with plant `DUB`. Actuals batches stay keyed by period alone because the SAP extract is
  company-wide. Re-upload semantics (replace per key, no duplicates, old batch retained)
  are unchanged.
- The nursery budget stays attached to DUB only. No budget is inferred, allocated or
  copied to any other plant (decision 0014 stands).

### An absent budget is a dash, never a zero
- When the selected plant has **no active budget batch** for a period block, that block's
  Budget, Roll-over Budget and % cells render a dash (`–`) on every row, including
  subtotals and the Grand Total, with an accessible label "Budget not loaded for this
  plant". Actual renders normally and stays drillable.
- This is a **fourth state**, distinct from the three that exist: ₹0 (a budget line
  with no amount), NA (0 ÷ 0), and the over-budget / credit flags (Budget 0 with a
  non-zero Actual). None of the over-budget or credit flags appear when the budget is
  absent, and the governed % measure yields "not loaded" rather than a division.
- The full cell state table, so nothing collapses: in a block **with** a budget batch,
  Budget and % keep their shipped states (₹0, NA, over-budget, credit) and Roll-over keeps
  its shipped "unavailable" unpopulated state; in a block **without** one, Budget,
  Roll-over and % all show the dash with the "not loaded" label. In Ask, an absent Budget
  is a **null measure value** rendered as the same dash with the same label in a column
  that is still present, and % is null with the "not loaded" label; a column is never
  silently omitted.
- The Excel export renders the same dash and label; its filename and title name the
  plant. When the FY-YTD block spans months with and without a budget batch
  (human-decided this grill): Budget shows the sum over the months that have a budget
  batch and the block heading names those months; **%** shows the dash whenever any
  month in the block that has actuals lacks a budget, so a partial budget is never
  compared to full actuals. A block with no budget month at all is the plain absent state.
- Governed-financial answers (Ask by GL code) follow the same rule: for a plant and
  period with no budget batch the Budget measure is absent and % is not computed; the
  full-outer, zero-filled join semantics of decision 0016 apply only where a budget
  batch exists.

### Drill-down is unchanged in behaviour and pins what the statement used
- Clicking any Actual works for every plant exactly as shipped (decisions 0024, 0025).
  The drill's pin contract is: the actuals batch ids the statement was built from;
  **exactly one format outline batch** whose period covers the block end; and **zero or
  more plant budget batches**, one for each month in the block that has one (a no-budget
  plant sends none, a partial-YTD block sends only the loaded months). A vanished pin is
  refused and a replaced pin reported, as today.
- **The mapping-master version is pinned, not merely named.** The statement's provenance
  carries the master version it resolved against; the drill sends it back and the server
  refuses with the existing "statement out of date" outcome when the running master's
  version differs, rather than resolving triples against a newer master and showing a
  footer that does not foot. This closes deferral D-0038. The footing proofs hold for a
  no-budget plant and for the `unmapped-GL` line of any plant.

### Ask covers every granted plant
- The governed-financial relation is no longer fixed to DUB: it carries `plant` as a
  dimension, scoped by the user's plant grants on both sides of the join (decision 0016),
  so "Show Actual by plant for July 2026" answers with one row per granted plant and a
  total equal to the company-wide net for a fully granted user.
- A statement question resolves its plant from the docked report's grounding when asked
  beside a report, or from a plant named in the question. On the standalone Ask page, a
  statement question from a user granted more than one plant, with no plant named, returns
  a clarification listing the granted plants, in the same shape the period clarification
  uses; the chosen plant re-runs without a further selector call. A user granted exactly
  one plant is unchanged.
- The demo user is granted every plant present in the master, plus the provisional
  department and function labels those plants carry.

### What does not change
- Read-only; Actual = Σ(Debit − Credit); composite key mandatory (decision 0017); the
  governed join key stays GL code + month, now within each granted plant (decision 0029,
  which supersedes 0016); the assistant boundary of decision 0027 is unchanged (plant,
  cost-centre and GL vocabulary may reach the model, amounts and rows never); the drill
  and every Ask data answer stay audit-before-read and fail-closed, while the statement and
  export routes stay **un-audited as shipped** (deferral D-0036 stands and is not closed
  here);
  one governed query path; parents derived, never read (decision 0020); Indian grouping,
  rupee rounding after aggregation; all-or-nothing governed access.
- The two existing zero states stay distinct: no transactions renders zeros; no mapping
  configured renders zeros plus the notice.

## Supersedes (clauses of earlier confirmed docs overridden by decisions 0029 and 0030)
Decision records win over older docs (`docs/architecture/README.md`); this section names
the clauses so a planner does not inherit both:
- `mis-selection-and-master`: "one selection, Agriculture / Nursery / DUB" and the
  provisional master "seeded from the SAP Entries Mapping sheet + 7 GLs" → one generated
  selection per plant (0031); its Master Table open item is unchanged.
- `sap-financial-ingestion`: "re-loads are idempotent per period" → per period for actuals,
  per plant and period for budgets; the outline is its own object (0030).
- `financial-mis-statement`: "Budget = 0 & Actual = 0 → NA" and the over-budget rule apply
  only where a budget batch exists; the absent-budget dash is a fourth state (0029).
- `actuals-drill-down`: "exactly one budget batch covers the block end" → exactly one
  outline batch, zero or more plant budget batches; the master version is pinned (0030,
  this spec).
- `docs/architecture/20-financial-mis-data-model.md` and `30-…build-plan.md`: the
  "Nursery (DUB) only" scope statements. The BRIEF's Smart Palm / Yield / OER framing is
  deferral D-0032 and stays deferred; it does not conflict with this story.

## Rules
- The SAP plant code is canonical; display names and Department / Function are
  provisional master data, flagged, never inferred at runtime.
- Exactly-once resolution of every actuals triple is a proven invariant, not a goal.
- Absent budget is a distinct state and never collapses into ₹0, NA or over-budget.
- Budget is never inferred or allocated across plants.

## Out of scope (now)
- A trimmed office or mill format; Table-1 and Table-3; per-plant budgets for any plant
  other than the nursery until the client supplies them.
- An in-app editor for the master; the authoritative Master Table reconciliation
  (spec `mis-selection-and-master` open item, still owned there).
- Roll-over calculation; live SAP; months other than those uploaded.
- The recoverable-period clarification (`ask-period-control`), which follows this story.

## Acceptance criteria
1. Against the pinned July actuals batch, every one of the 31 SAP plant codes is
   offered in MIS Reports to a fully granted user, each renders a statement, and the
   sum of the 31 Grand Total Actuals equals the batch's company-wide net
   (₹11,02,73,718.00 as measured) in exact paise. Proven by a warehouse fixture, not by
   inspection.
2. The DUB nursery statement is unchanged: Actual ₹1,15,12,712.07 and Budget
   ₹1,00,50,136.29 for July 2026, every parent footing to its leaves, the unmapped-GL
   line carrying its own Actual, and the Excel export matching.
3. Every `(plant, cost centre, GL)` triple in the July extract resolves exactly once,
   with nothing dropped and nothing fanned out, proven by a master validation fixture;
   the eleven pairs the mapping sheet does not name resolve to `unmapped-GL` with
   their reason, and every new master row is flagged provisional with a reason.
4. H.O renders 100% of its July net inside sections 8 Manpower and 9 Admin, with ₹0
   Actual on every nursery-only section, and its Budget, Roll-over and % show the dash
   with the "Budget not loaded for this plant" label on every row including the Grand
   Total; no over-budget or credit flag appears anywhere on a no-budget plant. The Excel
   export shows the same dash and names the plant.
5. Department and Function labels follow the stated classification rule (nursery plants
   Agriculture / Nursery; H.O Corporate / Office; others Operations / Unit), are stored
   flagged as provisional, and the flag is visible wherever the selection is displayed.
6. A second plant's July budget batch can be active alongside the nursery's; uploading
   it does not deactivate the nursery batch; re-uploading it replaces only itself. The
   budget upload refuses a request with no plant or with a plant the master does not
   know; a workbook whose leaves differ from the active format outline loads and its
   validation result names the unattached leaves (decision 0023).
7. Drill-down foots in exact paise for a leaf and for the `unmapped-GL` line of a
   no-budget plant; the drill requires exactly one outline pin covering the block end and
   accepts zero or more plant budget pins; a master-version mismatch between statement and
   server is refused as "statement out of date"; the audit record names the pinned outline
   batch, the budget batches if any, and the master version.
8. Ask: "Show Actual by plant for July 2026" returns one row per granted plant summing to
   the company-wide net for a fully granted user; a user granted only DUB gets only DUB
   in MIS Reports options, in Ask answers and in drill-down, with no row leaking. A
   statement question beside a report resolves the report's plant; on the standalone page
   a multi-plant user with no plant named receives a plant clarification, and the chosen
   plant re-runs with zero further selector calls.
9. The two existing zero states and the three existing nil states are each still
   reachable and distinct from the new absent-budget state, and the partial-YTD rule
   (Budget over loaded months, % dashed) is proven with a two-month fixture, all by
   hermetic tests over a fake warehouse, judged by junit testcase name and executed count
   (D-0024, D-0031).
10. The selection options endpoint offers only master-configured selections within the
   user's grants; a plant code present in an actuals upload but absent from the master
   is named in that upload's validation result and never appears in the dropdowns; an
   actuals upload missing plants that the previously active batch for that period held
   still activates and names those plants in its validation result.
11. Classification is a pure function of the committed table and the extract's cost
   centres, proven by a hermetic test over the July extract that yields the fourteen
   nursery codes above, `H.O` as Corporate / Office, and the rest as Operations / Unit.

## Open items (non-blocking)
- The client's authoritative Department / Function names and Master Table, which will
  rename the provisional labels and empty the bucket as data changes.
- Budgets for plants other than the nursery.
- Whether the format's `Plant list` names `DHS`, `DHS2` and `Belagum` are the SAP plants
  `DMHS` and two not yet in the extract — a naming question for Srihari that affects
  display names only, since classification never reads that list.

## Source
Human decisions 2026-09-15 (this session, recorded as decision 0029); decision 0018 (unmapped-GL bucket), 0014,
0016, 0017, 0020, 0021, 0024, 0025; `docs/context/2026-08-20-srihari-phase1-data/`
(both workbooks and Srihari's email); measured coverage analysis of the July extract
against Sheet1 of `SAP Entries Mapping.xlsx`.
