# Every Ask answer works across plants

14 parts · Risks: none one-way · New moving parts: a warehouse view change so the GL relation carries every plant

## What changes for you

Ask stops treating DUB's figures as the whole company. A question that names no plant asks which
plants to cover, with an "All plants" choice; a question that names plants ("for CHIR", "DUB and
CHIR") answers for exactly those. You can break answers down by plant ("Actual by plant for July
2026"), and a statement question for several plants gives one combined statement. Plants with no
loaded budget show "Budget not loaded" instead of ₹0, and over-budget questions compare only plants
that have a budget and say which were left out. Every answer says which plants it covers, names and
transaction clicks keep working for any plant set, and saved views and pins keep their plants. Readers
who hold one plant see the same answers as today, apart from honest budget labels.

## Why

The warehouse holds actuals for all 31 SAP plants, but Ask's GL answers read only DUB while listing
every plant as their scope, statement questions from multi-plant readers are refused, and plants with
no budget read ₹0 and can look over budget. The owner asked on 2026-10-04 that every Ask answer work
across plants, chose the picker, filter and breakdown, combined statement and "Budget not loaded"
behaviour, and confirmed the spec `docs/specs/ask-multi-plant.md`.

## Done when

1. **A question that names no plant gets a plant picker with "All plants" for a reader holding several plants, nothing is read before the choice, and a reader holding one plant gets the answer directly.**
2. **A question that names plants by code, SAP code or name answers for exactly those plants, and a plant the reader does not hold is refused by name before the question reaches the assistant's model.**
3. **GL-code answers read every chosen plant and can be filtered or broken down by plant, and DUB's over-budget answer for July 2026 is unchanged: 21 codes, with 50001201 at ₹83,98,339.**
4. **A statement question for several plants returns one combined statement whose lines add up each plant's own statement, and a one-plant statement answer is unchanged.**
5. **Plants with no loaded budget show "Budget not loaded" dashes instead of ₹0, and an over-budget question compares only plants with a loaded budget and names the plants it left out.**
6. **Every answer says which plants it covers, and "How this was calculated" lists exactly the plants that were read.**
7. **GL names, statement labels and clicking an Actual work for any plant set: each row opens only its own plants' transactions, adding up to the clicked figure.**
8. **Saved views and pins keep their plants; one that includes a plant the reader has lost is shown disabled with the reason and never runs on part of its plants.**
9. **Every plant refusal states its reason in plain words, in Ask and when saving or pinning.**
10. **A live check as the admin on the July data answers all five success-measure questions as expected, and the questions that work today still pick the same answers.**

## Risks

- **Live model shift.** Adding plant to the selector's vocabulary can change how the live model reads
  questions that work today; the pre-change probe is recorded below and the last part re-probes it.
- **Budget honesty.** Budget belongs to DUB only; a summed row that mixes DUB with other plants must
  never show DUB's budget against the combined Actual. The budget parts prove partial rows show dashes.
- **Nothing one-way:** the view change recreates a view over existing data, no data is deleted, no new
  vendor.

## For the builders

### Done-when details

Spec criteria are `docs/specs/ask-multi-plant.md` C1–C11; each detail below names the criteria it
must prove. Shared rules for every part:

- **Plant is governed by plant grants, not the dimension grant list.** `plant` is never added to role
  `dimensionIds`; `validateSelectionForUser`, `SelectionExecutor.authorize` and the saved and pin
  `selectionStatus` treat `plant` (as a dimension or filter) as authorized exactly when every plant in
  the selection's plant filter is in the reader's `user.scope` plant grants. No seed change. The
  discovery paths follow the same rule: `SemanticLayer.allowedFor` and `availableFieldsForDomain` keep
  the `plant` dimension whatever the dimension grant list says, and its values are always the reader's
  granted plants only.
- **Budget owner** comes from the mapping master's `formats.budget_owner_plant` (DUB), never a new
  literal. A plant "has a loaded budget" for a row when it is the budget owner and every month the row
  covers (the row's own month when `month` is grouped, otherwise every month of the answer's window)
  has an active budget batch; a missing month makes the owner count as not loaded for that row. An
  answer with no time window takes its months from the active Actual load batches before the query runs.
  A comparison compares a plant only when its budget is loaded for every month of the window; otherwise
  the plant is left out whole. Actual and Budget join at the plant, GL code (or line) and month grain,
  the budget carrying its owner plant, before any cross-plant aggregation. Budget states, dashes and %
  cells apply only to the measures the answer shows; no measure is added.
- **Reads** follow the spec's "What counts as a read": a figure read (data query, totals, names, drill,
  transactions) is audited as today; a metadata lookup (mapping master, grants, cached GL-code and month
  vocabulary, load-batch metadata) is not. "No read" in any leaf means no figure read.
- **Gated warehouse tests** (`*.db.test.ts` under `WAREHOUSE_DB_TEST=1`) truncate tables: a part that
  adds or changes one runs it only against the throwaway Postgres on 5434/5435 (AGENTS.md Known traps),
  never the dev warehouse on 5433.
- **Plant names on the wire**: `AskResponse.plantNames: Record<canonicalCode, displayName>` covers every
  plant the answer read. Result rows keep the canonical code in the `plant` cell (and in `askRowKey`);
  the client renders a plant cell and the readout through `plantNames`. `leftOut.plants` stays display
  names as the spec defines and renders directly. MP-CONTRACT pins it, MP-ASK-BUDGET emits it, MP-ASK-UI-RESULTS
  renders it for plant alone, month × plant, gl_code × plant and leaf_key × plant.
- **Stored answers**: `ConversationAnswerSnapshot` gains `plantNames`, `budgetStates` and `leftOut`
  (MP-CONTRACT pins the type), and the conversation service's snapshot copy keeps them, with a
  persistence leaf (MP-ASK-BUDGET).
- **Row key** is `askRowKey(row, dimensionIds)` in `contract/src/row-key.ts`, used by backend and
  frontend alike: the grouping cells in the fixed order `gl_code` or `leaf_key`, then `month` (as
  `YYYY-MM-01`), then `plant` (canonical code), joined with `|`, using only the dimensions the answer
  groups by.

1. Picker (C1). `AskResponse.plantChoice` exactly as the spec types it, prompt "Which plants should this
   answer cover?", options built from the mapping master alone (`MAPPING_MASTER` plants filtered to the
   reader's grants; value canonical code, label display name; never `SelectionResolverService.options`,
   which reads load batches), `allPlants.value` the sorted granted codes. Produced before any figure read
   and before the period choice; the client submits the original question with `selection` plus the
   chosen plant filter and `origin: "plant-choice"` through the edited-selection path; a period choice
   after it carries the plant filter and `origin: "period-choice"`. A selection without a plant filter
   from any ingress (edited, saved, pinned, continuation) gets the picker (several plants) or a singleton
   filter (one plant). The client requires at least one plant and shows "Choose at least one plant"
   (live region) with no request. The base selection comes from the selector as today; the only warehouse
   access before the picker is the selector's existing cached vocabulary lookup of distinct GL-code and
   month values (`DimensionValuesService`), which reads no figure, exactly as before today's period
   choice. Plant values never come from that lookup: they come from the mapping master and the reader's
   grants. "No read before the choice" (C1) therefore means no figure read: no executor query, totals,
   names, drill summary or batch lookup (owner decision of 2026-10-04, Notes). Leaves: no figure read
   before the choice (the executor, the adapter's `execute` and `freshness` calls and the batch repository
   spies are not called; the adapter's `distinctValues`, reached only through the dimension-values
   service, is called only for the non-plant vocabulary columns),
   one-plant reader answered directly, edited, saved and pinned selections without a plant filter, plant
   before period, each continuation re-checks grants.
2. Resolution and model boundary (C2, C10). A pre-selector check over the question text runs before
   `llm.select`: whole-word, case- and repeated-whitespace-insensitive matches against every mapping
   master plant's canonical code, SAP codes and display names, codes shorter than three characters only
   as an exact upper-case token. A match on a plant the reader does not hold refuses with no provider
   call. Granted matches set the plant filter, replacing any selector plant filter (difference logged);
   no match discards a selector plant filter and applies the picker rule. Loading the mapping master
   rejects aliases that collide after that normalisation. The selector's plant vocabulary
   (`dimensionValuesForAllowedDomains`, the help index and `availableFieldsForAnswer`) lists only the
   reader's granted codes and display names; `normalizeFilterValues` never case-folds a plant filter.
   Leaves: canonical, SAP and display-name matches with case and whitespace variants; "July", "Actual",
   "Budget", "GL" and "statement" never match; `CK` not matched inside "check"; an ungranted name refused
   with no provider call (the provider spy is not called) and no read; "CK" names CK (refused when
   ungranted) while "ck" names no plant; the model input carries no ungranted plant and no figure.
3. GL answers across plants (C3, C4). Warehouse migration `0004` recreates `actual_by_gl_month` grouped
   by `plant, gl_code, month` over `actual_by_key_month` for every plant (journal entry added; the
   schema definition and its leaf follow). The governed-financial domain gains a `plant` dimension
   (label "Plant") allowed with `gl_code` and `month` in any combination; the plant filter applies inside
   `actual_src` (never on the outer relation, which today silently skips it); with no plant dimension
   rows sum over the chosen plants. `budget_src` carries the budget owner as its plant and joins on
   plant when plant is grouped; the `'DUB' IN <grants>` gate becomes "the budget owner is in the chosen
   plant set". Leaves: plant alone, gl_code × plant, month × plant, gl_code × month × plant; the DUB-only
   over-budget answer equals today's 21 codes with 50001201 at ₹83,98,339 (gated warehouse leaf); the
   GL relation proof covers several plants.
4. Combined statement (C5). The selection resolver resolves several plants (each plant's own triples
   and leaf targets, unioned by leaf); the statement projection sums each leaf over the chosen plants'
   triples and, for `leaf_key × plant`, groups by plant ordered by statement order then plant display
   name. A one-plant statement goes through the unchanged path. Leaves: each plant's triples feed a shared
   line with none dropped or double-counted; a line no chosen plant maps to reads ₹0; unmapped-GL sums
   every chosen plant's unmapped triples; one plant equals that plant's MIS statement line by line.
   The MIS statement screen and export are unchanged (their existing leaves stay green).
5. Budget states and comparisons (C6, C7 no-budget case). `AskResponse.budgetStates` per row key with
   `plantsInRow` and `plantsWithBudget` as the spec defines; Budget and % cells null for `not-loaded`
   and `partial`. A comparison that needs a budget restricts the query's plant predicate to the chosen
   plants with a loaded budget, inside the query before grouping, ordering, the limit, totals and drill
   preparation; `leftOut` names the others and is omitted when none were left out; when none remain,
   the Informational no-budget answer with its stated copy, no table, provenance, plant readout,
   `budgetStates` or drill, and `viewInReport` unavailable with "Budget is not loaded for any chosen
   plant.". The table renders the dash labels as the cells' accessible names and keeps every column.
   Leaves: the spec's C6 list, a DUB range April–July with no active budget batch for one month (the
   summed row is `not-loaded` for DUB, a month-grouped row loaded only for the months with a batch), the over-limit fixture with more qualifying DUB rows than the
   row limit beside non-owner plants, the DUB+CHIR zero-activity partial row, and a DUB+CHIR comparison
   whose predicate, totals, drill context and provenance hold DUB only while `leftOut` names CHIR and its
   `selection` keeps DUB and CHIR (re-run, it compares DUB again); the four measure sets (Actual only,
   Actual and Budget, % only, all three) for a CHIR row; the unwindowed DUB comparison with an Actual
   month lacking a budget batch giving the no-budget answer with only metadata lookups.
6. Plant readout (C7). A successful data answer states its plant set (one or up to three names, else
   "n plants" with names in "How this was calculated"); `provenance.scope` lists exactly the plants the
   query read, never the grant list, and no longer lists department or function grants for GL answers.
   A combined statement's readout names its plants, not one plant's department and function. Pickers,
   refusals and informational answers carry no readout. Leaves: the readout for one, three and four
   plants (three names; then "4 plants" with all four names only in "How this was calculated"), in
   `chat.service.test.ts` (MP-ASK-BUDGET) and `ask-panel.test.tsx` (MP-ASK-UI-RESULTS); a mixed grant (reader holds more plants
   than the answer reads) proves provenance, names, composite drill rows and the transaction footer stay
   on the effective plant set.
7. Names and drills (C8). Names and drills only for `gl_code`, `gl_code × plant`, `leaf_key`,
   `leaf_key × plant`; other shapes inert. `rowLabels`, `budgetStates` and `drill.rows` keyed by
   `askRowKey`. The signed context binds per row its plant set (per-plant row its one plant, summed row
   the chosen set) and composite key; the drill route reads only that row's plants (statement rows, each
   plant's own triples), foots to the paisa, and refuses with the existing access-changed wording if any
   plant of the row is no longer held. `buildDrillPredicate` and the name resolver share the same
   per-row plant predicate. "View in report" only for a single-plant statement answer; a multi-plant
   answer's reason says it covers several plants. Leaves: a row-key leaf per allowed shape (plant,
   month, month × plant, gl_code × month, gl_code × month × plant and the four drillable shapes); one GL
   code and one statement line for both DUB and CHIR each get their own name, budget state and drill
   link, and CHIR's click reads only CHIR's lines; a `month`, `month × plant` and `gl_code × month`
   answer carries no `rowLabels` and no `drill`, and its Actuals render as plain cells (MP-ASK-DRILL).
8. Saved and pinned (C9). Saved views and pins store the canonical plant filter; their list status
   gains `plants_revoked` with "This view includes plants you no longer have access to: <names>. Edit
   its plants to run it." and the card is disabled; a re-run that reaches Ask anyway, with `origin`
   `saved-view` or `pin`, is the `plants-revoked` answer, audited, with no subset run; an "All plants"
   view does not grow with new grants. Both cards send their `origin` on reopen. A new save or pin with
   no plant filter is rejected as `plant-filter-invalid` and nothing is stored. The server-side
   re-run leaf (a saved-view and a pin `origin` with a revoked plant gives the `plants-revoked` answer,
   audited, with no read) belongs to MP-ASK-CHOICE, which owns the Ask plant step.
9. Refusals (C2, C10). Every plant refusal of an Ask request is a BlockedByPolicy answer with
   `refusal: { reason, plants }` and the spec's copy table, checked in the spec's order (no plants,
   invalid filter, then by `origin`: `plants-revoked`, `choice-plants-revoked`, else
   `plant-not-granted`; a request carrying only `reportGrounding` and no `origin` with a revoked plant is
   `plant-not-granted`, proven in `chat.service.test.ts`). A submitted filter value must already be canonical (exact compare): `dub`,
   `DUB-NUR` or a display name is `plant-filter-invalid`. Valid canonical values in any order or with
   duplicates (`["DUB", "CHIR", "DUB"]`) execute as `["CHIR", "DUB"]` at each ingress (new question,
   continuation, edited selection, saved and pinned re-run), proven in `plant-set.test.ts`
   (MP-PLANT-RULES) and `chat.service.test.ts` (MP-ASK-CHOICE); creating a saved view or a pin with
   `["DUB", "CHIR", "DUB"]` stores `["CHIR", "DUB"]`, proven in `saved.service.test.ts` and
   `pins.service.test.ts` (MP-SAVED-PINS). A selection with two plant filters (e.g. `in ["DUB"]` and
   `in ["CHIR"]`) is `plant-filter-invalid` with no read, in `plant-set.test.ts` and
   `chat.service.test.ts`, and rejected on save and pin. Save and pin requests reject a bad plant
   filter with HTTP 400 through a typed `PlantFilterInvalidException` that the global exception filter
   maps like `MeasureFilterInvalidException` (`userMessage` from the reason, `details.reason` set); the
   save and pin dialogs render the server's `userMessage` (`ApiError` carries it). Every new value
   round-trips through the contract, the schemas and Swagger (`swagger.test.ts`'s
   `Required<AskResponse>` fixture gains each new field).
10. Live check (C11, C11a). The redundant month filter (spec C11a) is removed before any Ask selection
    executes, only in its one exact shape, with the spec's removed-case and kept-case leaves
    (MP-MONTH-FILTER). The post-round probe of MP-ASK-CHOICE is a completion gate for that part: it
    does not close until the corpus selects as recorded. Before the change the coordinator probed the corpus on master (Notes). After the
    last part, on this story's code against the July warehouse and live Bedrock: the five
    success-measure questions as the admin in fresh conversations with their stated results, and the
    corpus again, each selecting the same domain, measures, dimensions, measure filter and period as
    recorded, with ordinary filters `[]` after the spec's one normalisation (a month eq filter on exactly
    the single-month window is removed) apart from the plant filter, the admin's now after the plant
    picker. The results are recorded in
    `docs/memory/ask-multi-plant-live-check.md`.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| MP-CONTRACT | The plant contract, schemas and error mapping | Pins the shared types and wire shapes: `AskRequest.origin`, `AskResponse.plantChoice`, `refusal`, `leftOut`, `budgetStates`, `plantNames` (and the same three on `ConversationAnswerSnapshot`), the `error.details.reason` and saved and pin status reason unions, and `askRowKey` in `contract/src/row-key.ts`; the chat, saved and pin request and response schemas and Swagger; `PlantFilterInvalidException` and its global-filter mapping (`userMessage` from the reason, `details.reason`). No behaviour changes. One crossing leaf: a `PlantFilterInvalidException` thrown from a route reaches the client as the typed envelope whose reason is the contract union's. | 9 | `contract/src/api.ts`, `contract/src/measure.ts`, `contract/src/row-key.ts`, `contract/src/index.ts`, `contract/test/row-key.test.ts`, `contract/package.json`, `backend/package.json`, `backend/src/chat/chat.schemas.ts`, `backend/src/chat/chat.schemas.test.ts`, `backend/src/saved/saved.schemas.ts`, `backend/src/pins/pins.schemas.ts`, `backend/src/pins/pins.schemas.test.ts`, `backend/src/semantic/plant-filter-invalid.exception.ts`, `backend/src/common/global-exception.filter.ts`, `backend/src/common/error-envelope.wiring.test.ts`, `backend/src/swagger.test.ts`, `tools/quality-gate.test.mjs` | `contract/test/row-key.test.ts`, `backend/src/chat/chat.schemas.test.ts`, `backend/src/pins/pins.schemas.test.ts`, `backend/src/common/error-envelope.wiring.test.ts`, `backend/src/swagger.test.ts`, `tools/quality-gate.test.mjs` | none | no |
| MP-PLANT-RULES | The plant rules | `backend/src/chat/plant-set.ts`, a pure module: `PLANT_DIMENSION_ID`, the pre-selector name matcher, the plant filter validator (canonical, exact, granted, the refusal order by `origin`), the picker options from the mapping master and `PLANT_REFUSAL_MESSAGES` (the spec's copy table); the mapping master's normalised alias-collision check at load. Nothing calls it yet. | 2, 9 | `backend/src/chat/plant-set.ts`, `backend/src/chat/plant-set.test.ts`, `backend/src/mapping/mapping-master.ts`, `backend/src/mapping/mapping-master.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | `backend/src/chat/plant-set.test.ts`, `backend/src/mapping/mapping-master.test.ts`, `tools/quality-gate.test.mjs` | MP-CONTRACT | no |
| MP-GL-VIEW | The GL relation and the plant dimension | Warehouse migration `0004` recreating `actual_by_gl_month` grouped by plant for every plant, with its journal entry, schema definition and proof fixtures; the `plant` dimension (label "Plant") on governed-financial; plant governed by plant grants in `allowedFor`, the selection validator and the executor. | 3 | `backend/drizzle-warehouse/0004_gl_month_all_plants.sql`, `backend/drizzle-warehouse/meta/_journal.json`, `backend/src/warehouse/warehouse-schema.ts`, `backend/src/warehouse/warehouse-schema.test.ts`, `backend/src/warehouse/warehouse-migrate.ts`, `backend/src/warehouse/gl-month-rollups.db.test.ts`, `backend/src/semantic/semanticLayer.ts`, `backend/src/semantic/semanticLayer.financial.test.ts`, `backend/src/semantic/selectionValidation.ts`, `backend/src/chat/selectionExecutor.ts`, `backend/src/chat/selectionExecutor.composed.test.ts` | `backend/src/warehouse/warehouse-schema.test.ts`, `backend/src/warehouse/gl-month-rollups.db.test.ts`, `backend/src/semantic/semanticLayer.financial.test.ts`, `backend/src/chat/selectionExecutor.composed.test.ts` | MP-PLANT-RULES | no |
| MP-GL-SQL | GL queries filter, group and compare by plant | The SQL builder applying the plant filter inside the actual source, grouping by plant in any combination, joining the owner's budget by plant and gating budget on the chosen set, and restricting a budget comparison's plant predicate to plants with a loaded budget before grouping, ordering, the limit and totals. | 3, 5 | `backend/src/sql/sqlBuilder.ts`, `backend/src/sql/sqlBuilder.composed.test.ts`, `backend/src/sql/sqlBuilder.selection.test.ts`, `backend/src/sql/sqlBuilder.provenance.test.ts`, `backend/src/warehouse/golden-financial.db.test.ts`, `backend/src/warehouse/measure-filter.db.test.ts` | `backend/src/sql/sqlBuilder.composed.test.ts`, `backend/src/sql/sqlBuilder.selection.test.ts`, `backend/src/sql/sqlBuilder.provenance.test.ts`, `backend/src/warehouse/golden-financial.db.test.ts`, `backend/src/warehouse/measure-filter.db.test.ts` | MP-GL-VIEW | no |
| MP-STATEMENT-COMBINED | One statement for several plants | The selection resolver resolving several plants (each plant's triples and leaf targets); the statement projection summing each leaf over the chosen plants and grouping `leaf_key × plant` ordered by statement order then plant name; the statement budget joining DUB's actual rows only, at the plant, line and month grain, with a DUB+CHIR `leaf_key × plant` leaf proving CHIR's rows carry no budget; the `plant` dimension on the statement domain; the unchanged one-plant path and MIS screen. | 4, 5 | `backend/src/mapping/selection-resolver.interface.ts`, `backend/src/mapping/selection-resolver.service.ts`, `backend/src/mapping/selection-resolver.service.test.ts`, `backend/src/semantic/semanticLayer.ts`, `backend/src/semantic/semanticLayer.statement.test.ts`, `backend/src/sql/sqlBuilder.ts`, `backend/src/sql/sqlBuilder.statement.test.ts`, `backend/src/warehouse/statement-projection.db.test.ts` | `backend/src/mapping/selection-resolver.service.test.ts`, `backend/src/semantic/semanticLayer.statement.test.ts`, `backend/src/sql/sqlBuilder.statement.test.ts`, `backend/src/warehouse/statement-projection.db.test.ts` | MP-GL-SQL | no |
| MP-ASK-CHOICE | Ask chooses the plants | The chat service's plant step before the selector, using `plant-set.ts`: refusal order, the pre-selector name check with no provider call, the picker (before the period choice), singleton filters, selector plant filter override and discard, plant filter validation at every Ask ingress with `origin` (including the saved-view and pin re-run refusal), the granted-only plant vocabulary for the model, the help index and `availableFieldsForDomain`, no case-folding of plant filters; `ChatController` forwarding `origin` from the regular and streaming routes into `ChatService.ask`, with a leaf per route. Closes only after the coordinator's live probe selects as recorded. | 1, 2, 9 | `backend/src/chat/chat.service.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/ask-period.test.ts`, `backend/src/chat/chat.controller.ts`, `backend/src/chat/chat.controller.test.ts`, `backend/src/chat/chat.constants.ts`, `backend/src/llm/bedrock.provider.ts`, `backend/src/llm/bedrock.provider.test.ts`, `backend/src/help/help.service.ts`, `backend/src/help/help.service.test.ts` | `backend/src/chat/chat.service.test.ts`, `backend/src/chat/ask-period.test.ts`, `backend/src/chat/chat.controller.test.ts`, `backend/src/llm/bedrock.provider.test.ts`, `backend/src/help/help.service.test.ts` | MP-STATEMENT-COMBINED | no |
| MP-ASK-STATEMENT | Statement questions across plants in Ask | The chat service's statement path accepting a plant set instead of refusing a reader with several plants: one plant keeps today's path, several plants run the combined statement (MP-STATEMENT-COMBINED), plant chosen before the statement period; leaves for one plant, DUB+CHIR combined, and plant-then-period continuations. | 4 | `backend/src/chat/chat.service.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/ask-period.test.ts` | `backend/src/chat/chat.service.test.ts`, `backend/src/chat/ask-period.test.ts` | MP-ASK-CHOICE | no |
| MP-MONTH-FILTER | The redundant month filter | A pure helper `backend/src/chat/redundant-month-filter.ts` that removes exactly one shape (a `month` filter, `eq`, one string value equal to the first day of the single calendar month the `timeWindow` spans) and the chat service calling it before any Ask selection executes (spec C11a); a `chat.service.test.ts` leaf that runs the selection with and without the redundant filter and asserts identical rows while the executed selection lacks only that filter; leaves for every kept case (another month, `in`, `neq`, an array value, a multi-month window, no window, a `gl_code` filter beside the redundant one). | 10 | `backend/src/chat/redundant-month-filter.ts`, `backend/src/chat/redundant-month-filter.test.ts`, `backend/src/chat/chat.service.ts`, `backend/src/chat/chat.service.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | `backend/src/chat/redundant-month-filter.test.ts`, `backend/src/chat/chat.service.test.ts`, `tools/quality-gate.test.mjs` | MP-ASK-STATEMENT | no |
| MP-ASK-BUDGET | Answers state their plants and budget states | Response assembly for budgets and scope: `plantNames` for every plant read, the conversation snapshot keeping `plantNames`, `budgetStates` and `leftOut`, `budgetStates` keyed by `askRowKey`, Budget and % nulled for not-loaded and partial rows, `leftOut` and the no-budget Informational answer, the plant readout, plants-read provenance, and `viewInReport` for multi-plant and no-budget answers. | 5, 6, 7 | `backend/src/chat/chat.service.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/ask-budget-states.ts`, `backend/src/chat/ask-budget-states.test.ts`, `backend/src/conversations/conversations.service.ts`, `backend/src/conversations/conversations.service.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | `backend/src/chat/chat.service.test.ts`, `backend/src/chat/ask-budget-states.test.ts`, `backend/src/conversations/conversations.service.test.ts`, `tools/quality-gate.test.mjs` | MP-MONTH-FILTER | no |
| MP-ASK-DRILL | Names and clicks per plant row | `askRowKey`-keyed `rowLabels` and `drill.rows`, per-row plant sets in the signed drill context, the drill route reading each row's own plants (statement rows, each plant's triples) and refusing a partly lost row, and names resolved under the same per-row predicate. | 7 | `backend/src/chat/chat.service.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/ask-drill-issuer.ts`, `backend/src/chat/ask-drill-issuer.test.ts`, `backend/src/chat/ask-drill-context.ts`, `backend/src/chat/ask-drill-context.test.ts`, `backend/src/chat/ask-drill.service.ts`, `backend/src/chat/ask-drill.service.test.ts`, `backend/src/warehouse/gl-name.repository.ts`, `backend/src/warehouse/gl-name.repository.test.ts`, `backend/src/warehouse/drill-transactions.repository.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/warehouse/drill-transactions.interface.ts` | `backend/src/chat/chat.service.test.ts`, `backend/src/chat/ask-drill-issuer.test.ts`, `backend/src/chat/ask-drill-context.test.ts`, `backend/src/chat/ask-drill.service.test.ts`, `backend/src/warehouse/gl-name.repository.test.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts` | MP-ASK-BUDGET | no |
| MP-SAVED-PINS | Saved views and pins keep their plants | Saved and pin create reject a bad plant filter with the typed 400; their list status gains `plants_revoked` with its message; "All plants" stays a snapshot; `ApiError` carries the server's `userMessage`, and the save and pin dialogs show it; the cards send `origin` on reopen and stay disabled when not runnable. | 8, 9 | `backend/src/saved/saved.service.ts`, `backend/src/saved/saved.service.test.ts`, `backend/src/pins/pins.service.ts`, `backend/src/pins/pins.service.test.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/api.test.ts`, `frontend/src/features/exploration/saved-views.tsx`, `frontend/src/features/exploration/saved-views.test.tsx`, `frontend/src/features/exploration/pinned-reports.tsx`, `frontend/src/features/exploration/pinned-reports.test.tsx`, `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/features/assistant/use-ask.ts`, `frontend/src/features/assistant/use-ask.test.tsx` | `backend/src/saved/saved.service.test.ts`, `backend/src/pins/pins.service.test.ts`, `frontend/src/lib/api.test.ts`, `frontend/src/features/exploration/saved-views.test.tsx`, `frontend/src/features/exploration/pinned-reports.test.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/features/assistant/use-ask.test.tsx` | MP-ASK-CHOICE | yes |
| MP-ASK-UI-CHOICE | Ask shows the plant picker and refusals | The plant picker (several, "All plants", "Choose at least one plant" announced with nothing sent), continuations carrying `origin` (`plant-choice`, `period-choice`), and the refusal copy rendered from `refusal.reason` for every reason in the spec's table. | 1, 9 | `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/features/assistant/use-ask.ts`, `frontend/src/features/assistant/use-ask.test.tsx` | `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/features/assistant/use-ask.test.tsx` | MP-ASK-DRILL, MP-SAVED-PINS | yes |
| MP-ASK-UI-RESULTS | Ask shows plants, budget states, names and links per row | The plant readout (one to three names, else "n plants" with names in "How this was calculated"), the Budget and % dash labels from `budgetStates` as accessible names, the left-out line from `leftOut`, plant display names in rows through `plantNames` (leaves for plant alone, month × plant, gl_code × plant and leaf_key × plant), and every per-row name, budget state and drill link looked up through `askRowKey` (a DUB and a CHIR row of the same GL code keep their own). | 5, 6, 7 | `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx` | `frontend/src/features/assistant/ask-panel.test.tsx` | MP-ASK-UI-CHOICE | yes |
| MP-LIVE | The live check | The post-change live check of Done-when 10 on this story's code, the July warehouse and live Bedrock, recorded with the pre-change probe. | 10 | `docs/memory/ask-multi-plant-live-check.md` | none | MP-ASK-UI-RESULTS | yes |

New moving parts: warehouse migration `0004` recreating `actual_by_gl_month` across every plant (Done-when 3). The plant step, row keys, budget states and the month-filter cleanup live in existing services and four pure modules: `contract/src/row-key.ts` (Done-when 7; in the contract because backend and frontend must derive the same key), `plant-set.ts` (Done-when 1, 2, 9), `ask-budget-states.ts` (Done-when 5) and `redundant-month-filter.ts` (Done-when 10), the last three extracted so their many cases are proven without the chat service's dependencies; no new service, store or job.

## Notes

- Owner decisions:
  - 2026-10-04: the spec's "no warehouse read runs before a choice" (C1) means no figure is read. The
    selector's existing cached lookup of distinct GL-code and month values may run before the plant
    picker, as it does before today's period choice; plant values never come from it.

- Pre-change probe, recorded by the coordinator on 2026-10-04 against master (live Bedrock, July
  warehouse), as the admin unless stated:
  - "show me list items where Actuals are more than the budget for July 2026": success,
    `governed-financial`, measures Actual and Budget, `gl_code`, filter month eq 2026-07-01 (normalised
    away), measure filter Actual > Budget, July 2026, 21 rows.
  - "which GL codes spent more than 5 lakh in July 2026": success, `governed-financial`, measure Actual,
    `gl_code`, a month filter on one run and none on another (normalised away), Actual > 500000.00,
    July 2026, 2 rows.
  - "Actual by GL code for July 2026": success, `governed-financial`, measure Actual, `gl_code`, month
    filter (normalised away), no measure filter, July 2026, 67 rows.
  - "which statement lines are over budget for July 2026", as the DUB-only user: success,
    `mis-statement`, measures Actual and Budget, `leaf_key`, no filters, Actual > Budget, July 2026,
    14 rows.
  - No admin answer carried a plant filter.
- Parts that change the selector's schema or prompt (MP-ASK-CHOICE) are probed live by the coordinator
  after their round, per AGENTS.md Known traps; a shift is fixed in that part before it closes.
- Gated warehouse tests run only against the throwaway Postgres on 5434/5435 (AGENTS.md Known traps).
