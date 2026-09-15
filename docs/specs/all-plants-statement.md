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
than a zero. The client has supplied a budget for the nursery only. Later the same day,
after the first plan was approved, the human re-scoped the story to the smallest shape
(decision 0036, superseding 0030; 0034 superseding 0031; 0037 superseding 0033 and 0035: the
assistant is untouched): the three
earlier grill answers that chose cascading selection tuples, the partial-FY-YTD rule and
upload plant reporting now describe the deferred follow-up story, not this one.

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
  MIS Reports dropdowns keep their shipped shape (flat department, function and plant lists
  filtered to the user's grants); a combination the master does not hold renders the existing
  "no mapping configured" zeros with the notice. Cascading tuples are deferred (open item).
- Department and Function are **provisional labels**, flagged as such in the master and
  surfaced as provisional wherever the selection is shown, so the client can rename them
  without a schema change:
  - classification is keyed on the **SAP plant code alone**, through a committed plant
    classification table (decision 0032); the format workbook's `Plant list` is never used
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
  retained and re-uploadable. Reporting unknown and missing plant codes in the validation
  result is deferred (open item); unknown plants are stored raw and never offered, as today.

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

### The budget belongs to the plant the master names (PoC rule, decision 0034)
- Budget batches stay as shipped: one active per period, carrying the workbook's outline
  snapshot (decision 0021) and DUB's amounts. The master's format entry names the **budget
  owner plant** (`nursery-mis-financial-v1` → `DUB`). A statement for the owner plant reads
  the budget as today; a statement for any other plant renders the format's outline from the
  same active budget batch and treats its budget as **not loaded**. Nothing is inferred,
  allocated or copied (decision 0014 stands).
- Plant-keyed budget batches, the format outline as its own ingest object, and a `plant` field
  on the budget upload (decision 0031's model) are **deferred until a second plant's budget
  exists** (decision 0034 supersedes 0031 for the PoC). Uploading a non-nursery budget is not
  possible in this story and is refused by the absence of the field, not by silent
  misattribution.

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
  plant. The partial-FY-YTD rule decided at the spec grill (Budget over loaded months, %
  dashed) is **deferred** with the plant-keyed budgets: with one budget owner and one loaded
  month it cannot occur in this story, and it is recorded as an open item below.
- Governed-financial answers (Ask by GL code) follow the same rule: the Budget measure
  joins only for the budget owner plant; for every other plant Budget is a null measure
  rendered as the dash with the "not loaded" label and % is not computed. The full-outer,
  zero-filled join semantics of decision 0016 apply within the owner plant.

### Drill-down is unchanged
- Clicking any Actual works for every plant exactly as shipped (decisions 0024, 0025): the
  drill pins the actuals batch ids and the active budget batch covering the block end, which
  supplies the outline for every plant. Footing proofs hold for a leaf and for the
  `unmapped-GL` line of a no-budget plant. Pinning the mapping-master version stays deferral
  D-0038; the drill's audit record names the incremented version as today.

### The assistant is untouched (decision 0037)
- No assistant code changes in this story. The governed Ask relation stays DUB-only as
  shipped and a statement question still needs a user granted exactly one plant. A user
  granted every plant therefore gets "not supported" for statement questions in Ask while
  GL-code questions keep answering for DUB; a demo that needs both uses a second user granted
  DUB only. The plant-aware assistant (plant dimension, grounding from the docked report,
  plant named in the question, typed plant choice) is the follow-up story.
- The demo user is granted every plant present in the master.

### What does not change
- Read-only; Actual = Σ(Debit − Credit); composite key mandatory (decision 0017); the
  governed join key stays GL code + month, now within each granted plant (decision 0030,
  which supersedes 0016); the assistant boundary of decision 0027 is unchanged (plant,
  cost-centre and GL vocabulary may reach the model, amounts and rows never); the drill
  and every Ask data answer stay audit-before-read and fail-closed, while the statement and
  export routes stay **un-audited as shipped** (deferral D-0037 stands and is not closed
  here);
  one governed query path; parents derived, never read (decision 0020); Indian grouping,
  rupee rounding after aggregation; all-or-nothing governed access.
- The two existing zero states stay distinct: no transactions renders zeros; no mapping
  configured renders zeros plus the notice.

## Settled by the task grill (2026-09-15)
- **The wire carries null, and the frontend lands first.** The frontend task adds an
  optional `budgetState` to the measure block and guards every budget access on it; the
  backend task then turns the block into a discriminated union (`not-loaded` ⇒ `budget: null`)
  and adapts the export, so neither task breaks the other side's build, no task ever ships a
  placeholder amount, and "never ₹0" holds on the wire as well as on screen. Valid wire pairs:
  loaded or absent state with money; not-loaded with null; a mismatch is a DTO validation
  error. Human-decided (frontend first); the additive-then-union split settled at the
  frontend task grill.
- **The live dash is observed at story closeout.** The backend task carries no functional
  check, so the story's closeout functional check (required: the decomposition is
  user-facing) generates H.O, CK and DUB, drills an H.O leaf and exports H.O.
- **Reading versus returning.** The governed projection already joins the format's budget rows
  for any user granted DUB; for a non-owner plant the service discards them before the
  response and returns no budget amount. A user not granted DUB never receives budget rows
  from the SQL. "No amount is returned" is the guarantee; "no amount is read" is not claimed.
- **Decision 0037 governs the Ask view.** Decision 0034's consequence that `actual_by_gl_month`
  drops its DUB literal belongs to the plant-aware assistant, which 0037 defers; the literal
  stays until that story.
- **Proof split.** The exactly-once resolution and the 31-plant sum are proven hermetically
  from the July extract through the master (a pure function); the 31 rendered statements, the
  non-owner drill footing and DUB's unchanged output are proven by the warehouse-backed proof
  under `test:warehouse-proof`, recorded with executed counts, never as required hermetic
  leaves.

## Supersedes (clauses of earlier confirmed docs overridden by decisions 0036 and 0034)
Decision records win over older docs (`docs/architecture/README.md`); this section names
the clauses so a planner does not inherit both:
- `mis-selection-and-master`: "one selection, Agriculture / Nursery / DUB" and the
  provisional master "seeded from the SAP Entries Mapping sheet + 7 GLs" → one generated
  selection per plant (0032); its Master Table open item is unchanged.
- `sap-financial-ingestion`: unchanged in this story; plant-keyed budgets wait on 0034's
  trigger.
- `financial-mis-statement`: "Budget = 0 & Actual = 0 → NA" and the over-budget rule apply
  only where a budget batch exists; the absent-budget dash is a fourth state (0030).
- `actuals-drill-down`: unchanged in this story.
- `docs/architecture/20-financial-mis-data-model.md` and `30-…build-plan.md`: the
  "Nursery (DUB) only" scope statements. The BRIEF's Smart Palm / Yield / OER framing is
  deferral D-0033 and stays deferred; it does not conflict with this story.

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
6. The master names DUB as the budget owner of `nursery-mis-financial-v1`; a statement
   for any other plant carries `budgetState: not-loaded` for every block while the DUB
   statement carries `loaded`; the budget upload and batch model are unchanged.
7. Drill-down foots in exact paise for a leaf and for the `unmapped-GL` line of a
   no-budget plant with the shipped pin contract; its audit record names master version 3.
8. The assistant is unchanged: its hermetic suite passes untouched, and a user granted only
   DUB sees only DUB in MIS Reports options and drill-down with no row leaking.
9. The two existing zero states and the three existing nil states are each still
   reachable and distinct from the new absent-budget state, proven by hermetic tests over a
   fake warehouse, judged by junit testcase name and executed count (D-0024, D-0032).
10. The selection options endpoint offers only master-configured selections within the
   user's grants; a plant code present in an actuals upload but absent from the master
   never appears in the dropdowns.
11. Classification is a pure function of the committed table and the extract's cost
   centres, proven by a hermetic test over the July extract that yields the fourteen
   nursery codes above, `H.O` as Corporate / Office, and the rest as Operations / Unit.

## Open items (non-blocking)
- The client's authoritative Department / Function names and Master Table, which will
  rename the provisional labels and empty the bucket as data changes.
- Budgets for plants other than the nursery. When one arrives, decision 0034's trigger
  fires and the deferred set lands as its own story: plant-keyed budget batches and the
  format outline object (0031's model), the `plant` upload field, the partial-FY-YTD rule
  (Budget over loaded months, % dashed), cascading selection tuples, unknown / missing plant
  reporting on the actuals upload, and the master-version pin (D-0038).
- The plant-aware assistant (decision 0037): plant dimension, grounding from the docked
  report, plant named in the question, and the typed `plantChoice` continuation on decision
  0033's pattern.
- Whether the format's `Plant list` names `DHS`, `DHS2` and `Belagum` are the SAP plants
  `DMHS` and two not yet in the extract — a naming question for Srihari that affects
  display names only, since classification never reads that list.

## Source
Human decisions 2026-09-15 (this session, recorded as decision 0030); decision 0018 (unmapped-GL bucket), 0014,
0016, 0017, 0020, 0021, 0024, 0025; `docs/context/2026-08-20-srihari-phase1-data/`
(both workbooks and Srihari's email); measured coverage analysis of the July extract
against Sheet1 of `SAP Entries Mapping.xlsx`.
