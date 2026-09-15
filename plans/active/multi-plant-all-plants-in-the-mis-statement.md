---
issue: multi-plant
title: All plants in the MIS statement
status: awaiting-approval
saved: 2026-09-15T08:09:41+00:00
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
  - 0029-all-plants-provisional-scope
  - 0030-format-outline-object
  - 0031-master-generated-from-workbook
  - 0032-ask-typed-choice-continuation
---

# Plan — multi-plant: All plants in the MIS statement

Story: `multi-plant` (roadmap 9, epic reporting) · spec: `docs/specs/all-plants-statement.md`
(confirmed 2026-09-15; spec grill and requirements grill both recorded against its amended
digest). Decisions 0029-0032 are accepted.

## Problem
The shipped statement offers exactly one selection, Agriculture / Nursery / DUB, because the
product is pinned to the nursery in five places, each verified by reading the file:

1. `backend/src/mapping/mis-mapping-master.ts` holds one selection and the 28
   cost-centre-plus-GL pairs DUB used in July; the full mapping sheet has 95.
2. `backend/src/ingest/mis-budget.parser.ts:8-9` hard-codes the format id and `plant = "DUB"`.
3. `backend/src/warehouse/warehouse-schema.ts:43` makes exactly one budget batch active per
   period, with no plant on `ingest_batch`, so a second plant's July budget would deactivate
   the nursery's.
4. `warehouse-schema.ts:180-185` defines `actual_by_gl_month` with `'DUB'::text AS plant …
   WHERE plant = 'DUB'`, so Ask answers by GL code can never show another plant.
5. `backend/src/chat/chat.service.ts:726-737` (`statementRequest`) requires exactly one
   department, function and plant on the user, so a multi-plant user's statement question
   from Ask resolves to nothing.

The July extract already holds 4,113 lines across 31 plants, all retained. A measured read of
the client's two workbooks shows the nursery mapping generalises: one company-wide chart of
accounts (54 GL codes, 45 in the sheet), one cost-centre vocabulary everywhere, and the sheet's
dictionary classifying ₹10,21,80,290.32 of ₹11,02,73,718.00 (92.7%). The human decided
(decision 0029) to offer every plant on the nursery format with provisional labels, and to
show an absent budget as a dash.

## Scope / Non-goals

**In scope**
- A generated master covering every SAP plant in the data (decision 0031), the full mapping
  sheet applied per plant, bucket rows for the eleven unnamed pairs, provisional labels.
- The format outline as its own ingest object; plant-keyed budget batches; the budget upload
  taking an explicit plant (decision 0030).
- The absent-budget state through the statement, its export, the governed measures and the
  drill pins; the partial-FY-YTD rule.
- Ask across granted plants: `plant` as a governed-financial dimension, statement plant from
  report grounding or the question, a typed plant clarification (decision 0032); the demo
  user granted every plant.
- The MIS Reports and Ask surfaces rendering the above.

**Non-goals**
- A trimmed office or mill format (rejected by the human, 0029); Table-1 and Table-3.
- Budgets for any plant but the nursery; roll-over; live SAP; months beyond those uploaded.
- An in-app master editor; the authoritative Master Table reconciliation (still owned by
  `mis-selection-and-master`'s open item).
- The recoverable-period clarification: `ask-period-control` follows this story and builds
  `periodChoice` on the pattern 0032 sets.
- Re-planning shipped drill or statement behaviour beyond what the outline object requires.

## Acceptance Criteria
- **C1** Against the pinned July actuals batch, all 31 SAP plant codes are offered to a fully
  granted user, each renders, and the 31 Grand Total Actuals sum to ₹11,02,73,718.00 in exact
  paise. Proven by a gated warehouse fixture over the client extract, not by inspection.
- **C2** DUB is unchanged: Actual ₹1,15,12,712.07 and Budget ₹1,00,50,136.29 for July 2026,
  every parent footing to its leaves, `unmapped-GL` carrying its own Actual, the export
  matching. The existing statement-projection and golden proofs keep passing.
- **C3** Every `(plant, cost centre, GL)` triple in the July extract resolves exactly once via
  the generated master; classification is a pure function of the committed table and the
  extract's cost centres (the fourteen July nursery codes, `H.O` Corporate / Office, the rest
  Operations / Unit), proven hermetically; nothing dropped or fanned out; the eleven unnamed pairs resolve to
  `unmapped-GL` with reason "not in the mapping sheet"; DUB's nine existing bucket rows keep
  their reasons; every new row is `provisional: true` with a reason; the master version is 3;
  a hermetic test proves the checked-in master equals the generator's output.
- **C4** A plant with no active budget batch for a block renders `–` with the accessible label
  "Budget not loaded for this plant" in Budget, Roll-over and % on every row including the Grand
  Total, on screen and in the Excel export, with no over-budget or credit flag anywhere. H.O
  renders 100% of its July net inside sections 8 Manpower and 9 Admin and ₹0 Actual on every
  nursery-only section.
- **C5** Department and Function follow the classification rule (nursery plants Agriculture /
  Nursery; `H.O` Corporate / Office; others Operations / Unit), are stored `provisional` in the
  master; `MisSelectionScopeReadout` gains `provisional: boolean` and `plantDisplay`, and both
  the selection options and the statement header render a visible "provisional" mark from it.
- **C6** Budget batches are keyed by plant and period; the upload takes a canonical `plant`
  field and refuses a missing or unknown plant; leaves that differ from the active format
  outline **load and are named** in the validation result (0023), and only matching leaves
  attach; a second plant's July budget coexists with DUB's and re-uploading it replaces only
  itself. The nursery workbook re-imported with `plant=DUB` yields the format outline batch and
  DUB's budget batch in one transaction.
- **C7** The statement's provenance carries the outline batch under source `outline` and the
  mapping-master version; the drill requires exactly one outline pin covering the block end,
  accepts zero or more plant budget pins (one per loaded month), and refuses a master-version
  mismatch as "statement out of date" (closing D-0038); it foots in exact paise for a leaf and
  for `unmapped-GL` on a no-budget plant; its audit record names the pinned outline batch, the
  budget batches if any, and the master version.
- **C8** Ask: `plant` is a `governed-financial` dimension scoped by grants on both sides of the
  join, so "Show Actual by plant for July 2026" returns one row per granted plant summing to
  the company net for the seeded user; a user granted only DUB gets only DUB in options, Ask
  and drill with no row leaking; `baseRolePerms` grants the admin role the new `plant`
  dimension. A statement question beside a report resolves the report's plant through a typed
  `statementGrounding { department, function, plant, period }` that the panel takes from the
  rendered statement scope and the server re-resolves through the master and the user's current
  grants on every ask (human-decided at the plan grill; no report is persisted to obtain an
  id); one naming a granted plant resolves it; on the standalone page a multi-plant user with
  no plant named receives a `plantChoice` clarification whose pick resolves the chosen canonical
  plant to its **unique master selection** (department and function from the master, not from
  user scope; the user's grant on that plant is re-checked) and re-runs with zero further
  selector calls, proven by counting `select()` on a fake provider. On the governed path an
  Actual-only row for a plant and month with **no active budget batch** yields a null Budget
  and a `not-loaded` % — never `over-budget`, which stays reserved for a present budget batch
  with a zero or missing leaf row.
- **C9** Partial FY-YTD: Budget sums the months that have a budget batch and the block heading
  names them; % renders the dash whenever any month with actuals in the block lacks a budget;
  a two-month fixture proves it. The two zero states, the three nil states and the absent
  state stay distinct in hermetic tests.
- **C10** `GET /api/mis/options` returns the typed list of valid master selection tuples
  `{ department, function, plant, plantDisplay, provisional }` within the user's grants
  (human-decided at the plan grill) and the client cascades each dropdown from what is already
  chosen, so an impossible tuple cannot be formed; the flat `departments` / `functions` /
  `plants` arrays are removed with their consumers; an actuals upload always activates (replace-per-period, human-decided) and its
  validation result names unknown plant codes and plants present in the previously active
  batch but absent from the new one; unknown plants never appear in the dropdowns.
- **C11** Every proof is judged by junit testcase name and executed count (D-0024, D-0031); new
  test files are registered in `backend/package.json` and `tools/quality-gate.test.mjs`; a
  D-0006-ignored file edited by this story (`backend/src/chat/chat.service.ts`,
  `backend/src/db/migrate.ts` is not ignored) is formatted and de-ignored in the same task.

## Technical Approach

### The master is generated, not typed (0031)
`tools/generate-mapping-master.mjs` reads Sheet1 and the SAP Report of
`docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx`, the **Table-2 outline**
of `Nursery MIS Format.xlsx` (through the budget parser's outline and stable-leaf-key logic,
extracted into a shared `backend/src/ingest/mis-format-outline.ts` so the generator and the
parser cannot disagree; the `Plant list` sheet is not read), and a committed table
`backend/src/mapping/plant-classification.ts`
(SAP code → canonical id, display, department, function, nursery flag, provisional). For each
plant it emits one selection: `plant_canonical` = SAP code (DUB keeps `DUB` + alias `DUB-NUR`),
`mis_format: "nursery-mis-financial-v1"`, `budget_gl_codes` = the format's leaf GL codes, and
entries = the 95 sheet pairs as `leaf` targets resolved to stable leaf keys via the format
outline's `S.No|GL|slug` identity, disambiguating a GL that appears under several S.No rows by
the sheet's cost centre → section rule exactly as the shipped master did, and refusing to emit an
entry it cannot resolve to exactly one leaf, plus a
`bucket` entry for every `(cost centre, GL)` pair the SAP Report books for that plant and the
sheet does not name. DUB's nine bucket rows and their two reasons are carried from the
classification table so nothing shipped changes. The generated file keeps the existing
`MappingMasterDefinition` shape; `mapping-master.ts` validation (duplicate keys, alias reuse,
provisional-without-reason) is unchanged and now guards 31 selections. `provisional_labels:
true` is added to the selection schema; `GET /api/mis/options` returns the typed tuple list and
the statement scope readout carries `provisional` and `plantDisplay`.

### The outline is an object; budgets belong to a plant (0030)
Migration `0004_outline_object_and_plant_budgets.sql`: `source_kind` check admits `outline`;
`ingest_batch.plant text NULL` with a check that it is set exactly when `source_kind = 'budget'`,
`ingest_batch.format_id text NULL` set for `outline` and `budget` batches (0030: one active
outline per **format** and period), and `ingest_batch.outline_batch_id uuid NULL` naming the
format outline a budget batch was compared against; the partial unique index becomes
`(source_kind, period, COALESCE(format_id, ''), COALESCE(plant, ''))`;
the `mis_budget` → `mis_budget_outline` foreign key is unchanged; `budget_by_leaf_month` and
`budget_by_gl_month` add `plant`; `actual_by_gl_month` drops the DUB literal and groups by
`plant`. The actuals validation result gains `unknownPlants` and `missingPlants` (versus the
previously active batch for the period); activation is unchanged. Existing budget batches are deactivated by the migration (the
0003 precedent) and the nursery workbook is re-imported once. `IngestionRepository` gains
`replaceOutlineBatch` and `replaceBudgetBatch(metadata{plant, outlineBatchId}, rows, outline)`;
the budget batch keeps its own workbook outline snapshot (0021 unchanged) so its rows always
have a referential home, and the service compares its leaf keys with the active format outline,
naming unattached leaves in the validation result — never refusing (0023). The nursery workbook
upload (plant `DUB`) is the one that also writes the format outline batch; the statement
attaches budget rows to the format outline by leaf key.

### Absent budget is a fourth state
`MisStatementRunResponse` measures become `budget: FixedScaleMoney | null`,
`percentage: string | null | "not-loaded"` is avoided in favour of a typed
`budgetState: "loaded" | "not-loaded"` per block in the response, so the renderer never infers
from null. `buildStatementProjection` keeps the full-outer join; the service decides
`budgetState` from the active budget batches for `(plant, period range)`: none → `not-loaded`
for the block; some months missing → Budget summed over loaded months, heading carries
`budgetMonths`, `%` null with `percentageState: "not-loaded"`. Export writes `–` and the label
row; filename includes the canonical plant. Provenance adds `mappingMasterVersion`. The shared contract changes with it, owned by task 3:
`ProvenanceBatch.source` becomes `"actuals" | "budget" | "outline"`; the drill request accepts
outline pins; the drill response replaces the mandatory `budgetBatchId` with `outlineBatchId`
and `budgetBatchIds: string[]`; DTOs, Swagger, the drill repository, the audit payload and the
frontend drill panel (task 4) follow. Drill: `bindPins` requires one `outline` pin whose period
covers the block end, accepts zero or more budget pins (one per loaded month), and refuses when
the request's master version differs from the running master (409, the existing "statement out
of date" class). The statement and export routes stay un-audited (D-0036 stands).

On the governed Ask path the absent state needs its own seam: the composed CTE gains a
`budget_presence` relation (active budget batches by plant and month), and the `budget` and
`percentage` measure expressions return null / `not-loaded` when no budget batch is present for
that plant and month, keeping `over-budget` for a present batch with a zero or missing leaf row.
Task 5 owns it server-side with golden cases; task 6 renders a null measure as the dash with the
"not loaded" label in tables, tiles and charts.

### Ask across plants
`semanticLayer.ts` adds dimension `plant` (column `plant`) to `governed-financial`; the composed
CTEs already inject the scope predicate on both sides (`sqlBuilder.ts:92,133`), so grants hold.
`AskRequest` gains `statementGrounding { department, function, plant, period }` beside the
existing `reportGrounding`; the docked panel fills it from `MisStatementRunResponse.scope`, and
the server re-resolves it through `SelectionResolverService` and the user's plant grants on
every ask (0028's re-authorize rule). `statementRequest` resolves the plant in this order:
statement grounding, an explicit plant filter the selector emitted (the `plant` dimension is
enumerable, so the model can select it), then the user's single plant; several granted plants
and no plant → `ClarificationNeeded` with `plantChoice` (0032). A pick carries the canonical
plant; the server resolves it to its unique master selection (department and function come
from the master, so a fully granted user is no longer blocked by holding several), re-checks
the grant, and runs the selection verbatim at `chat.service.ts:146`. `migrate.ts` seeds the
admin's plant scope from the generated master's canonical ids and adds the `plant` dimension
grant to `baseRolePerms`. `chat.service.ts` is D-0006-ignored: the task formats it and drops its
`.prettierignore` and baseline entries.

### What stays exactly as built
One governed path (0017); parents derived (0020); statement projection at leaf grain (0022);
aggregate drill client-side (0024); raw drill under pinned predicate (0025); audit before read;
0027's model boundary; the two zero states.

## Decisions
- `docs/decisions/0029-all-plants-provisional-scope.md` — accepted; the product call.
- `docs/decisions/0030-format-outline-object.md` — accepted; the outline as an ingest object,
  plant-keyed budgets, drift reported per 0023. Rejected simpler shape: reuse DUB's budget batch as every plant's
  outline. It couples 30 plants' rows to one plant's budget upload and makes an H.O drill pin
  a DUB budget batch, which the spec grill called unpinnable.
- `docs/decisions/0031-master-generated-from-workbook.md` — accepted; generator plus
  classification table. Rejected: hand-authoring ~3,000 entries (misattribution risk) and a
  runtime master read from the warehouse (contradicts 0014 for the PoC).
- `docs/decisions/0032-ask-typed-choice-continuation.md` — accepted; typed `plantChoice`.
  Rejected: re-asking through the model with the plant appended (measured unreliable in the
  period-control spec) and refusing multi-plant users outright (fails C8).
- Tooling: no new dependency. `exceljs` (present) reads the workbooks; the generator is a Node
  script under `tools/` like the existing quality-gate tooling; migrations follow the
  generate-once, apply-only drizzle pattern of 0001-0003.
- Contradicted lesson, deliberately: "ingest_batch has no plant column — do not act on it
  again" described the old shape; 0030 changes it.

## Surface Impact
| Surface | Change | Owning task |
| --- | --- | --- |
| Mapping master constant + generator + classification table | **New / Changed** — 31 selections, version 3 | 1 |
| `GET /api/mis/options` | **Changed** — typed selection tuples with provisional flag; flat arrays removed | 1 |
| Actuals upload validation result | **Changed** — names unknown plant codes | 1 |
| Warehouse schema + migration 0004 + views | **Changed** — outline source kind, batch plant and format_id, plant in GL views | 2 |
| `POST /api/ingest/budget` + DTOs + Swagger | **Changed** — `plant` field; outline comparison reported in the validation result | 2 |
| `POST /api/ingest/actuals` validation result | **Changed** — `unknownPlants`, `missingPlants`; activation unchanged | 2 |
| `IngestionRepository`, budget parser | **Changed** — outline batch, plant-keyed budget | 2 |
| Statement service, DTOs, projection, export | **Changed** — budgetState, partial-YTD, outline pin, master version, provisional scope readout, plant in filename | 3 |
| Shared contract `ProvenanceBatch` + drill request/response | **Changed** — `outline` source, `outlineBatchId` + `budgetBatchIds`; Swagger follows | 3 |
| Drill service pins + audit payload | **Changed** — outline pin required, budget pins optional, master-version refusal | 3 |
| Statement/export audit | **Deferred** — D-0036 stands; out of this story's scope | — |
| MIS Reports selection UI + statement view + drill panel | **Changed** — cascading tuples, provisional mark, dash cells, heading months, outline pin payload, statement scope handed to the docked panel | 4 |
| Semantic layer, SQL builder, chat service, contract | **Changed** — plant dimension, budget presence and null measures, statementGrounding, plantChoice resolved to a master selection | 5 |
| App-DB seed (`migrate.ts`) | **Changed** — admin granted every canonical plant and the `plant` dimension | 5 |
| Ask panel | **Changed** — sends statementGrounding when docked; plantChoice buttons post a selection; null measures render as the labelled dash; answer names the plant | 6 |
| `.prettierignore` + quality-gate baseline | **Changed** — D-0006 for `chat.service.ts` | 5 |
| `backend/package.json`, `tools/quality-gate.test.mjs` | **Changed** — new test registration | 1, 2, 3, 5 |
| `docs/specs/all-plants-statement.md` | **Unchanged** — confirmed contract | — |
| Model, region, audit shape, RBAC model | **Unchanged by design** — 0027, 0016's surviving clauses in 0029 | — |
| Roll-over calculation, Table-1/3, master editor | **Deferred** — out of scope per spec; existing deferrals stand | — |

## Task Decomposition
Sequential leaves, backend and frontend separate, each single-runtime.

1. **`master-all-plants`** (backend, `user_facing: false`) — C3, C5(server), C10. The generator,
   the classification table, the regenerated master (version 3), the drift test, the
   exactly-once and classification fixtures over the July extract, the shared outline helper,
   the typed selection-tuple options response with its controller and Swagger tests. Depends on
   nothing.
2. **`outline-object-and-plant-budgets`** (backend, `user_facing: false`) — C6, C1(data). The
   migration, the schema and views, the repository and parser changes, the `plant` upload field,
   outline comparison reported per 0023, the actuals validation result's `unknownPlants` and
   `missingPlants`, the nursery re-import proof, the second-plant coexistence proof. Depends on
   task 1 (canonical plant ids validate the upload).
3. **`statement-all-plants`** (backend, `user_facing: false`) — C1, C2, C4(server), C7, C9.
   `budgetState` and partial-YTD in the statement service and DTOs, the provisional scope
   readout, the export dash and filename, the shared-contract change (`outline` source,
   `outlineBatchId` + `budgetBatchIds`) with its DTOs, Swagger, repository and audit payload,
   the master version in provenance and drill (D-0038 closed), the 31-plant reconciliation
   fixture, the DUB regression, the two-month fixture, and controller tests for the statement,
   export and drill routes. Depends on task 2.
4. **`statement-ui-all-plants`** (frontend, `user_facing: true`) — C4(client), C5(client).
   Cascading dropdowns from the selection tuples, dash cells with the accessible label, no
   drill affordance on dashed Budget/%, block heading with budget months, the provisional mark on
   options and header, the drill panel sending the outline and budget pins and the master
   version, and the statement view handing its scope to the docked Ask panel as
   `statementGrounding`. Depends on task 3.
5. **`ask-all-plants`** (backend, `user_facing: false`) — C8(server), C11(D-0006). The `plant`
   dimension and its `baseRolePerms` grant, the budget-presence seam and null measures on the
   governed path, `statementGrounding` in the contract and service, plant resolution order in
   `statementRequest`, the `plantChoice` carrier resolved to a master selection, the
   zero-selector-call proof, the seeded scopes, and controller plus SSE tests for the changed
   chat contract. Depends on task 1 (canonical ids) and task 3 (statement response shape);
   sequenced after 4 so the report ships whole first.
6. **`ask-plant-ui`** (frontend, `user_facing: true`) — C8(client). `plantChoice` buttons that
   post the patched selection, `statementGrounding` sent when docked, null Budget and % rendered
   as the labelled dash in tables, tiles and charts, the answer header naming the plant. Depends
   on task 5.

## Risks
- **Leaf-key resolution for the 95 sheet pairs.** Sheet1 names GLs the nursery outline lists
  under several S.No rows (e.g. 50001201 under 1.1, 2.1, 10.1, 11.1). The generator must apply
  the same disambiguation the shipped master used (cost centre → section) and refuse to emit an
  entry it cannot resolve to exactly one leaf; task 1's fixture proves exactly-once.
- **Row cap.** 31 plants × the format's leaves is far under the projection's `maxRows`, but the
  reconciliation fixture runs 31 statements; it must run per plant, not one 31-plant query.
- **Migration on live data.** 0004 deactivates existing budget batches; the re-import is a
  recorded proof step, as 0021 required, and the demo environment must run it before the demo.
- **Coordination with `ask-period-control`.** Its saved plan touches `statementRequest` and
  the clarification carriers. This story lands first; that plan re-grills against the new
  shape (0032 names the pattern it should follow).
- **Provisional labels on screen.** The mark must read as "awaiting the client's names", not as
  an error; the functional check on task 4 covers the copy.

## Verify Plan
- **Hermetic backend** — `mapping-master.test.ts` (31 selections validate; generator output
  equals the checked-in file; exactly-once over the July extract from `docs/context`),
  `selection-resolver.service.test.ts` (options filtered, provisional mark, unknown plant
  absent), `mis-budget.parser.test.ts` (plant required, outline fingerprint), `ingest.service.test.ts`
  (attach, drift reported, unknown and missing plants reported), `mis-statement.service.test.ts` (budgetState, partial-YTD
  two-month fixture, DUB unchanged), `mis-statement-export.test.ts` (dash, label, filename),
  `mis-drill.service.test.ts` (outline pin required, budget pins optional, master-version
  mismatch refused),
  `semanticLayer.financial.test.ts` + `sqlBuilder.composed.test.ts` (plant dimension, scope on
  both sides), `chat.service.test.ts` (plant resolution order; plantChoice; zero selector calls
  on the pick), `chat.schemas.test.ts`, `migrate.trim.test.ts` (seeded scopes).
- **Route contracts (hermetic)** — `mis-selection.controller.test.ts` (tuple options),
  `ingest.controller.test.ts` (plant field, outline report), `mis-statement.controller.test.ts`
  and `mis-statement-export.test.ts` (scope readout, budgetState, master version),
  `mis-drill.controller.test.ts` (outline pin, `budgetBatchIds`, version refusal),
  `chat.controller.test.ts` + `chat.sse.test.ts` (statementGrounding, plantChoice, null
  measures), `swagger.test.ts` for every changed DTO, `app.routes.test.ts` unchanged.
- **Gated DB proofs (`test:db` / `test:warehouse-proof`, D-0008)** — migration 0004 applies;
  `statement-projection.db.test.ts` and `golden-financial.db.test.ts` unchanged and green;
  new `all-plants-reconciliation.db.test.ts` (31 statements sum to ₹11,02,73,718.00);
  `drill-transactions.db.test.ts` extended for a no-budget plant leaf and `unmapped-GL`.
- **Frontend (vitest)** — statement view dash cells and label, no pointer affordance on dashed
  cells, block heading months, provisional mark, drill panel pin payload; Ask panel plantChoice
  buttons post a selection.
- **Functional (tasks 4 and 6)** — live: generate H.O, CK and DUB statements; drill an H.O
  leaf; export H.O; ask "Show Actual by plant for July 2026"; ask a statement question on
  `/ask` and pick a plant.
- Commands: `npm run typecheck`, `npm run quality`, `npm run test:hermetic`, `npm run test:db`,
  `npm -w @3f/backend run test:warehouse-proof`; every artifact records the executed count and
  testcase name.
