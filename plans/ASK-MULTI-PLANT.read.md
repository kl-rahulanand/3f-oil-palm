---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-04T09:46:37+00:00
read_hash: 7e3d5ac104824914326b8da4a7a3c14cedc451f3
round: 5
passed: no
doc_seen: 7e3d5ac104824914326b8da4a7a3c14cedc451f3
spec_seen: 983c0579061af49e59e4c9fca0342b92886718aa
notes_seen: 6db2bf4b04fb8b513e4b387f4c71d52db10c4952
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. C1 contradicts its own picker implementation.
   `SelectionResolverService.options(grantedPlants)` reads `ingest_batch` to build periods, so it cannot produce the picker “before any warehouse read.” Make plant options a mapping-master-only path, and prove no warehouse call—not only no executor call.
   Disposition: cut picker options come from the mapping master alone; the leaf proves no executor, warehouse adapter or batch repository call before the choice.

2. Plant authorization is not pinned across the discovery paths.
   `SemanticLayer.allowedFor` and `availableFieldsForDomain` currently remove dimensions absent from `permissions.dimensionIds`; the plan forbids adding `plant` there. Pin their plant-grant exception with the validator/executor rule, or the selector, help, and editable fields will not consistently expose plant. Unproven: items 2, 3, and 10.
   Disposition: cut a shared rule keeps `plant` in `allowedFor` and `availableFieldsForDomain` whatever the dimension grants, with granted values only; MP-GL-VIEW and MP-ASK-CHOICE own the two paths.

3. “Loaded budget” is ambiguous for a multi-month window.
   The plan says an active batch “in the answer’s window,” but does not say whether every month must have one or whether any active month is enough. That changes Budget, %, comparisons, totals, and the no-budget response. Decide and add leaves for an owner-plant range with a missing active budget month. Unproven: item 5.
   Disposition: cut a row's owner budget counts as loaded only when every month the row covers has an active batch; detail 5 adds the April–July range leaf with a missing month.

4. MP-SAVED-PINS cannot prove its direct re-run requirement at its scheduled point.
   It depends only on MP-PLANT-SET, but `origin` handling and the `plants-revoked` Ask answer live in MP-ASK-CHOICE. Add that dependency and a server-side re-run leaf, or move the C9 re-run proof into MP-ASK-CHOICE.
   Disposition: cut MP-SAVED-PINS now waits for MP-ASK-CHOICE, which owns the server-side re-run refusal leaf.

5. The save/pin server-error rendering is assigned twice.
   MP-SAVED-PINS owns the dialogs and their tests; MP-ASK-UI repeats the delivery but does not scope either dialog. Keep it in MP-SAVED-PINS and cut it from MP-ASK-UI.
   Disposition: cut the save and pin error rendering is MP-SAVED-PINS's only (it scopes ask-panel); cut from MP-ASK-UI.

6. Split: MP-PLANT-SET → contract/schema/Swagger wiring + plant-policy module and mapping validation.
   Its 20-file scope, two test registries, API envelope work, and matcher/validation logic are well beyond one focused task.
   Disposition: cut split into MP-CONTRACT (types, schemas, Swagger, typed error) and MP-PLANT-RULES (plant-set module, alias collision).

7. Split: MP-GL-RELATION → warehouse relation/domain migration + SQL authorization and budget-comparison semantics.
   The migration, semantic model, three executor/validation paths, composed SQL, and nine warehouse/query leaves are too large to review or roll back coherently in one task.
   Disposition: cut split into MP-GL-VIEW (migration, plant dimension, grant rule) and MP-GL-SQL (filter, grouping, budget gate and comparison restriction).

8. Split: MP-ASK-ANSWER → budget/readout response assembly + row-label and per-row drill context.
   Budget states, no-budget responses, provenance, names, signed contexts, transaction predicates, and drill footing are separate failure domains across 13 files.
   Disposition: cut split into MP-ASK-BUDGET (budget states, left-out, readout, provenance, report link) and MP-ASK-DRILL (row-keyed names and per-row drill).

9. Trap: Ask selector schema or prompt live-model shift: items 2 and 10.
   The planned live probes are necessary; retain the post-MP-ASK-CHOICE probe as a completion gate, since hermetic recordings cannot detect this regression.
   Disposition: cut MP-ASK-CHOICE closes only after the coordinator's live probe selects as recorded; detail 10 makes it a completion gate.

10. Trap: destructive gated warehouse tests: items 3 and 4.
   Their database leaves must run only against the documented throwaway ports 5434/5435; the plan notes this, but each task should make it an explicit execution condition.
   Disposition: cut a shared rule makes 5434/5435 an explicit execution condition for every part that adds or changes a gated warehouse test.

## Round 2

11. C1 still has no no-read route for constructing `plantChoice.selection`.
   The current selector preparation calls `dimensionValuesForAllowedDomains`, which reads the warehouse before `llm.select`; mapping-master picker options do not remove that read. Pin how the base selection is produced before a plant choice, and have the leaf spy on dimension-values reads too.
   Disposition: keep the base selection comes from the selector as today, after its existing cached distinct-value vocabulary lookup (no figure), the same precedent as today's period choice; detail 1 defines C1's "no read" as no figure read and the leaf spies on the executor, the adapter query path, the batch repository and the dimension-values lookup (non-plant columns only).

12. MP-CONTRACT misses `backend/package.json` in Scope.
   It adds `contract/test/row-key.test.ts`; the repository rule requires every task adding a test file to scope both `backend/package.json` and `tools/quality-gate.test.mjs` so the registered leaf is actually run.
   Disposition: cut MP-CONTRACT now scopes `backend/package.json` beside `tools/quality-gate.test.mjs` and `contract/package.json`.

## Round 3

13. Disputed keep 11: C1 explicitly requires no warehouse read before the choice, not merely no figure read.
   `DimensionValuesService` calls the warehouse adapter’s `distinctValues`; the new leaf cannot truthfully assert both that the adapter query path was not called and that this service performed its vocabulary lookup. The base-selection path must avoid that lookup until after plant choice, or the confirmed spec must change.
   Disposition: keep the owner decided on 2026-10-04 (recorded in the plan's Notes) that C1's no-read rule means no figure read, so the cached distinct-value vocabulary lookup may precede the picker; detail 1's leaf now asserts no `execute`, `freshness` or batch read and `distinctValues` only for non-plant vocabulary columns.

## Round 4

14. Disputed keep 13: the plan now contradicts the unchanged confirmed spec.
   C1 says “No warehouse read runs before a choice”; `distinctValues` is a warehouse read. An inline owner note cannot silently redefine confirmed C1 while the plan claims to prove it. Update and reconfirm the spec, or retain a genuinely no-read picker path.
   Disposition: keep the spec itself is being amended to the owner's ruling (C1: no figure read before a choice; the cached GL-code and month vocabulary lookup may run first) in its own fix, and this plan is re-read once that amendment is merged into the story branch.

## Round 5

15. Plant display names have no pinned answer wire shape.
   `rowLabels` are keyed by full `askRowKey`, while result rows carry canonical plant codes; neither the contract nor a backend task defines a code-to-display-name mapping for plant-only, month×plant, or GL×plant rows. Unproven: item 3’s “Rows show plant display names.” Pin and emit the mapping before MP-ASK-UI, then prove each shape renders it.
   Disposition: cut `AskResponse.plantNames` (code to display name for every plant read or left out) is pinned by MP-CONTRACT, emitted by MP-ASK-BUDGET and rendered by MP-ASK-UI with a leaf per plant-bearing shape.

16. The statement-side budget join is unowned.
   C6 requires DUB’s budget to join only DUB actuals at plant grain for both GL and statement answers. MP-GL-SQL is explicitly GL-only, while MP-STATEMENT-COMBINED’s leaves cover actual triples but not the budget join. Unproven: item 5. Assign the statement join and a DUB+CHIR statement plant-breakdown leaf to MP-STATEMENT-COMBINED.
   Disposition: cut MP-STATEMENT-COMBINED owns the statement budget join at plant grain with a DUB+CHIR leaf_key × plant leaf.

17. C11a and the revised live-corpus assertions are not fully traced to a task.
   The redundant-month-filter behaviour appears only inside detail 2, but no task lists C11a in Covers or names its leaf. The live detail and recorded baseline also omit the spec’s required selected measures and normalised ordinary-filter comparison. Add C11a to MP-ASK-CHOICE’s delivery, Covers, and named test; make MP-LIVE record and compare measures plus normalised filters.
   Disposition: cut MP-ASK-CHOICE delivers C11a with its named leaves; MP-LIVE and the recorded baseline now carry measures and the normalised-filter comparison.

18. The `reportGrounding` refusal-order case has no named proof.
   The confirmed spec requires a revoked plant with report grounding but no `origin` to return `plant-not-granted`; the plan repeats the rule but names no leaf for it. Unproven: item 9. Add the case to MP-ASK-CHOICE’s chat-service tests.
   Disposition: cut detail 9 names the reportGrounding-only revoked case as `plant-not-granted`, proven in chat.service.test.ts by MP-ASK-CHOICE.
