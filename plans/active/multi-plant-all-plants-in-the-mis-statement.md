---
issue: multi-plant
title: All plants in the MIS statement
status: approved
saved: 2026-09-15T10:20:00+00:00
story: multi-plant
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
  - 0017-mis-selection-composite-key-seam
  - 0018-mis-selection-unmapped-gl-bucket
  - 0019-fresh-routes-follow-vendored-house-style
  - 0020-mis-budget-leaf-grain
  - 0021-mis-statement-outline-snapshot
  - 0022-mis-statement-governed-projection
  - 0023-mis-statement-drift-reports-not-blocks
  - 0024-drill-down-aggregate-client-projection
  - 0025-drill-down-pinned-batch-raw-read
  - 0026-assistant-ships-in-the-poc
  - 0027-assistant-llm-bedrock-mumbai
  - 0028-saved-selections-not-snapshots
  - 0031-master-generated-from-workbook
  - 0033-poc-budget-owner-plant
  - 0035-all-plants-scope-for-the-poc
  - 0036-ask-untouched-in-multi-plant
---

# Plan — multi-plant: All plants in the MIS statement

Story: `multi-plant` (roadmap 9, epic reporting) · spec: `docs/specs/all-plants-statement.md`
(confirmed 2026-09-15, re-scoped twice the same day at the human's request). This is the
**third** saved version: the six-task plan was approved and then cut, first to four tasks, then
to the minimum the human named — "for other plants show `–` on Budget and %, everything else
stays as it is". Decisions 0035, 0033 and 0036 supersede 0029, 0030 and 0032/0034; the roadmap
item's acceptance criteria were reduced in the same change.

## Problem
The shipped statement offers exactly one selection, Agriculture / Nursery / DUB, for two
reasons that matter at this scope, each verified by reading the file:

1. `backend/src/mapping/mis-mapping-master.ts` holds one selection and the 28
   cost-centre-plus-GL pairs DUB used in July; the client's mapping sheet has 95 pairs and
   the July extract has 31 plants, all already ingested and retained.
2. The budget batch is global per month with no plant on it (`mis_budget` has no plant
   column; `warehouse-schema.ts:43`), so a statement for any other plant would silently show
   DUB's nursery budget and percentages beside that plant's actuals.

The plant dropdown already renders whatever the master offers (`selection-resolver.service.ts:35`),
so exposing 31 plants is master data. The only code the scope needs is the rule that keeps
DUB's budget off every other plant's statement.

## Scope / Non-goals

**In scope**
- A generated master covering every SAP plant in the July extract (0031): the full mapping
  sheet applied per plant, bucket rows for the eleven unnamed pairs, provisional Department /
  Function labels from the classification table, and the format's budget owner (`DUB`).
- The not-loaded budget state for non-owner plants in the statement response and the Excel
  export, rendered as `–` with a label on screen (0033, 0035).
- The demo admin granted every plant in the master.

**Non-goals (deferred with decision 0033's trigger, and decision 0036)**
- Everything assistant-side: the plant dimension, grounding from the docked report, plant
  named in the question, the typed plant choice. Ask is untouched; a fully granted user gets
  "not supported" for statement questions in Ask (0036 says so plainly).
- Plant-keyed budget batches, the outline object, the `plant` upload field, the
  partial-FY-YTD rule, cascading selection tuples, upload plant reporting, the master-version
  pin (D-0038), audit on the statement route (D-0036).
- A trimmed office or mill format; Table-1 and Table-3; roll-over; live SAP; a master editor.

## Acceptance Criteria
- **C1** Against the pinned July actuals batch, all 31 SAP plant codes are offered to a fully
  granted user, each renders a statement, and the 31 Grand Total Actuals sum to
  ₹11,02,73,718.00 in exact paise. Proven by a gated warehouse fixture over the client
  extract, run per plant.
- **C2** DUB is unchanged: Actual ₹1,15,12,712.07 and Budget ₹1,00,50,136.29 for July 2026,
  every parent footing, `unmapped-GL` carrying its own Actual, the export matching; the
  existing statement-projection and golden proofs keep passing.
- **C3** Every `(plant, cost centre, GL)` triple in the July extract resolves exactly once via
  the generated master (version 3); classification is a pure function of the committed table
  and the extract's cost centres (fourteen July nursery codes, `H.O` Corporate / Office, the
  rest Operations / Unit); the eleven unnamed pairs resolve to `unmapped-GL` reusing the two existing reason literals
  (`GL absent from Sheet1` for a pair the sheet never names; `Sheet1 says Tertiary while SAP
  books Primary` for 50001902 / 50001903 wherever SAP books them under Primary), so DUB's nine
  bucket rows are byte-for-byte unchanged and no new literal is introduced; every new row is
  provisional with a reason; a hermetic test proves the checked-in master equals the
  generator's output; the format names `DUB` as budget owner and a format without an owner
  fails validation. The validator's duplicate-pair rule (`mapping-master.ts:100`) is re-keyed
  to `(plant_canonical, cost_center, gl_code)`, since the same 95 pairs recur per plant.
- **C4** A non-owner plant's statement carries `budgetState: "not-loaded"` on every block;
  its Budget, Roll-over and % are null on every row including the Grand Total; no over-budget
  or credit label is computed; the Excel export writes `–` in those cells with a "Budget not
  loaded for this plant" note; the filename already names the plant
  (`mis-statement.controller.ts:145`) and is asserted as a regression, not changed. H.O renders 100% of its
  July net inside sections 8 Manpower and 9 Admin and ₹0 Actual on every nursery-only
  section. DUB carries `budgetState: "loaded"` and its cells are byte-for-byte unchanged.
- **C5** On screen, a not-loaded block renders `–` with the accessible label "Budget not
  loaded for this plant" in Budget, Roll-over and % on every row including the Grand Total,
  with no drill affordance on those cells; Actual cells stay drillable and unchanged.
- **C6** `MisSelectionScopeReadout` gains `provisional: boolean` and `plantDisplay`; the plant
  option labels and the statement header show a visible "provisional" mark for every non-DUB
  selection.
- **C7** Every statement pins the period's active budget batch in its provenance as the
  outline source **regardless of the user's grants** (human-decided at this grill): today
  `sqlBuilder.ts:216` gates the budget pin on `'DUB' IN (scope)`, so a user granted H.O but
  not DUB would get no pin and the drill would refuse. The statement service adds the pin from
  the active batch for the period; for a non-owner plant no budget amount is read or returned,
  only the batch id and row structure. With that pin the drill foots in exact paise for a leaf
  and for `unmapped-GL` on a non-owner plant, for a user granted that plant alone; the drill
  service and its pin contract are not edited. The client-side aggregate drill
  (`drill-panel.tsx:394,438`) formats and sums `measure.budget` and would throw on null, so the
  frontend task owns its null handling: dash cells, a dashed footer, no `toPaise` on null.
- **C8** `SEED_USERS` gains an optional fourth field, a `+`-separated list of canonical plant
  codes (`email|name|roles|plants`); absent, an admin is granted every plant in the master.
  Seeding is idempotent and reconciles scope to the configured list. The default seed carries
  the all-plants admin; a DUB-only second user is one more entry, which is what decision 0036's
  demo workaround needs. A user granted only DUB sees only DUB in options and drill with no
  row leaking; the assistant's hermetic suite passes unchanged (0036). `README.md` documents
  the field.
- **C10** `MisSelectionScopeReadout` is shared with `POST /api/mis/run`
  (`mis-selection.service.ts:89`): its `provisional` and `plantDisplay` fields are populated
  there too, the DTO and Swagger are updated once, and both routes' response tests cover them.
- **C9** The two zero states and the three nil states stay distinct from the not-loaded state
  in hermetic tests; every proof is judged by junit testcase name and executed count
  (D-0024, D-0031); new test files are registered in `backend/package.json` and
  `tools/quality-gate.test.mjs`. No D-0006-listed file is edited (`.prettierignore` checked:
  `mis-statement.service.ts`, `mis-statement-export.service.ts`, `migrate.ts`,
  `mapping-master.ts` and the statement view are not listed).

## Technical Approach

### The master is generated, not typed (0031)
`backend/src/mapping/generate-mapping-master.ts`, run as `npm -w @3f/backend run master:generate`
(ts-node, like `db:migrate` and `warehouse:migrate`), reads Sheet1 and the SAP Report of
`docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx`, the Table-2 outline of
`Nursery MIS Format.xlsx` through the budget parser's outline and stable-leaf-key logic
(extracted into a shared `backend/src/ingest/mis-format-outline.ts`, imported natively by both
the CommonJS backend and the generator, so they cannot disagree), and a committed `backend/src/mapping/plant-classification.ts` (SAP code →
canonical id, display, department, function, nursery flag, provisional). It emits one selection
per plant: `plant_canonical` = SAP code (DUB keeps `DUB` + alias `DUB-NUR`),
`mis_format: "nursery-mis-financial-v1"`, `budget_gl_codes` = the format's leaf GL codes, the 95
sheet pairs as `leaf` targets resolved to stable leaf keys (a GL under several S.No rows is
disambiguated by the sheet's cost centre → section rule as the shipped master did; an entry that
cannot resolve to exactly one leaf is refused), plus a `bucket` entry for every pair the SAP
Report books for that plant and the sheet does not name. DUB's nine bucket rows and reasons are
carried from the classification table. The master schema gains `provisional_labels` on the
selection and a `formats` map naming `budget_owner_plant`; validation re-keys the duplicate-pair
guard per plant and refuses a format without an owner.

### Budget owner and the not-loaded state (0033)
`MisStatementService` asks the master for the format's owner; when the selection's plant is not
the owner, every block's `budgetState` is `"not-loaded"`, Budget and Roll-over are null, % is
null, and the over-budget / credit labels are not computed. `MisStatementRunResponse` gains
`budgetState` per block and `provisional` + `plantDisplay` on the scope readout. The projection
SQL is unchanged: the full-outer join still runs and the service discards the budget side for
non-owners, so row structure, zero-fill and DUB's output stay identical. The export writes `–`,
a note row, and the plant in its filename. The service pins the period's active budget batch in provenance for every plant, from the
batch table rather than the scope-gated SQL, so the drill's unchanged pin contract holds for a
user without DUB. `migrate.ts` seeds the admin's plant scope from the
master's canonical ids; it keeps `department` / `function` scope as today.

### The screen (frontend task)
`statement-view.tsx` renders a null Budget / Roll-over / % as `–` with the accessible label,
gives those cells no button and no pointer affordance, and shows the provisional mark from the
scope readout in the header; the plant option labels carry the mark from the options response.
No Ask surface changes.

### What stays exactly as built
Ingestion and the batch model; one governed path (0017); parents derived (0020); the statement
projection (0022); the drill (0024, 0025); the assistant (0036); the two zero states; the
statement and export routes un-audited (D-0036).

## Decisions
- `docs/decisions/0035-all-plants-scope-for-the-poc.md` — supersedes 0029; restates the product
  call with the PoC budget rule and the assistant left untouched.
- `docs/decisions/0031-master-generated-from-workbook.md` — accepted; generator plus
  classification table. Rejected: hand-authoring ~3,000 entries; a runtime master (0014).
- `docs/decisions/0033-poc-budget-owner-plant.md` — supersedes 0030. Rejected: plant-keyed
  batches and an outline object for a budget that does not exist.
- `docs/decisions/0036-ask-untouched-in-multi-plant.md` — supersedes 0034. Rejected: any
  assistant work in this story; the demo cost is stated in the record.
- Tooling: no new dependency; `exceljs` reads the workbooks; the generator is a ts-node script
  in the backend workspace so it shares the TypeScript outline helper without a loader. No
  migration of any kind.
- Contradicted lesson, deliberately: none.

## Surface Impact
| Surface | Change | Owning task |
| --- | --- | --- |
| Mapping master constant + generator + classification table + shared outline helper | **New / Changed** — 31 selections, version 3, budget owner, per-plant duplicate guard | 1 |
| `GET /api/mis/options` | **Changed** — 31 plants with provisional display labels; shape unchanged | 1 |
| Statement service, DTOs, Swagger, export | **Changed** — `budgetState`, provisional scope readout, outline pin for every plant, dash export; filename asserted unchanged | 1 |
| `POST /api/mis/run` scope readout | **Changed** — same DTO fields, same task | 1 |
| App-DB seed (`migrate.ts`) + `SEED_USERS` grammar + README | **Changed** — per-user optional plant list; default all plants | 1 |
| `backend/package.json`, `tools/quality-gate.test.mjs` | **Changed** — new test registration | 1 |
| Statement view + options labels + client aggregate drill | **Changed** — dash cells with label, no drill affordance, provisional mark, null-safe aggregate drill | 2 |
| Drill service, pins, audit; ingestion; batch model; warehouse schema | **Unchanged by design** — 0033, 0035 | — |
| Assistant (chat, semantic layer, SQL builder, Ask panel) | **Unchanged by design** — 0036 | — |
| `plans/roadmap.json` item `multi-plant` | **Pre-plan baseline change** — criteria reduced in commit 39c60bd before this plan; no task owns it | — |
| Deferred set (plant-keyed budgets, outline object, upload field, partial-YTD, cascade, upload reporting, D-0038, plant-aware Ask) | **Deferred** — decision 0033's trigger; 0036 | — |

## Task Decomposition
Two leaves, the minimum the harness allows (backend and frontend never share a task). The
frontend lands FIRST (human-decided at the task grill, 2026-09-15): widening the statement's
Budget field to null breaks the frontend build if the backend does it alone, so the frontend
task widens the contract and renders the dash, and the backend task then sends null.

1. **`all-plants-statement-ui`** (frontend, `user_facing: true`) — C5, C6(client), C7(client)
   and the contract. Widen `MisStatementMeasureBlock.budget` to nullable and add
   `budgetState`; add `provisional` / `plantDisplay` to the scope readout and `provisional` to
   the plant option record; render dash cells with the accessible label and no drill
   affordance; make the client aggregate drill null-safe; show the provisional mark on header
   and options. DUB's rendering unchanged. Depends on nothing. Its functional check confirms
   DUB renders unchanged; the dash is seen live at task 2's close.
2. **`all-plants-backend`** (backend, `user_facing: false`) — C1, C2, C3, C4, C6(server), C7,
   C8, C9. The generator, classification table, shared outline helper, regenerated master with
   owner and re-keyed validator, the fixtures, the budget-owner rule sending null with
   `budgetState`, the grant-independent outline pin through the outline repository, the export
   dash, the `SEED_USERS` plant field, the warehouse-backed proofs. Depends on task 1.

## Risks
- **The backend task is one session by design.** It spans the generator, the master and the
  statement service, all backend. If the task grill judges it unbounded, the split is the
  generator plus master first and the statement rule second — still no assistant work.
- **Leaf-key resolution for the 95 sheet pairs.** A GL under several S.No rows (50001201 under
  1.1, 2.1, 10.1, 11.1) must resolve by the cost centre → section rule; the exactly-once fixture
  proves it.
- **Demo-visible Ask cost.** A fully granted user cannot ask statement questions in Ask until
  the follow-up; 0036 names the second-user workaround.
- **Provisional labels on screen.** The mark must read as "awaiting the client's names", not as
  an error; the functional check on task 2 covers the copy.

## Verify Plan
- **Hermetic backend** — `mapping-master.test.ts` (31 selections; generator equals checked-in
  file; exactly-once and classification over the July extract; owner required; per-plant
  duplicate guard), `selection-resolver.service.test.ts` (options labels),
  `mis-statement.service.test.ts` (`budgetState`, non-owner discard, DUB unchanged, states
  distinct), `mis-statement-export.test.ts` (dash, note, filename),
  `mis-statement.controller.test.ts` (outline pin present for a non-DUB user; filename
  regression), `mis-selection.controller.test.ts` (run endpoint readout fields),
  `swagger.test.ts`, `migrate.trim.test.ts` and a config test (seed grammar, idempotent
  reconciliation), `app.routes.test.ts` unchanged; the chat suite unchanged.
- **Gated DB proofs (`test:db` / `test:warehouse-proof`, D-0008)** — new
  `all-plants-reconciliation.db.test.ts` (31 statements sum to ₹11,02,73,718.00);
  `statement-projection.db.test.ts` and `golden-financial.db.test.ts` unchanged and green;
  `drill-transactions.db.test.ts` extended for a non-owner leaf and `unmapped-GL`.
- **Frontend (vitest)** — dash cells and label, no pointer affordance on dashed cells,
  provisional mark, aggregate drill with null budgets (no throw, dashed footer).
- **Functional (task 2)** — live: generate H.O, CK and DUB statements; drill an H.O leaf;
  export H.O; confirm DUB is unchanged.
- Commands: `npm run typecheck`, `npm run quality`, `npm run test:hermetic`, `npm run test:db`,
  `npm -w @3f/backend run test:warehouse-proof`; every artifact records the executed count and
  testcase name.
