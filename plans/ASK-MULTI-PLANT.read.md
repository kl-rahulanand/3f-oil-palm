---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-04T08:29:31+00:00
read_hash: c936f285d0a1578bb42ebbd6acfb0f47bd9aeffe
round: 2
passed: no
doc_seen: c936f285d0a1578bb42ebbd6acfb0f47bd9aeffe
spec_seen: 983c0579061af49e59e4c9fca0342b92886718aa
notes_seen: a25ad66b26578f591f550999b58520d84cdeb0ad
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

12. MP-CONTRACT misses `backend/package.json` in Scope.
   It adds `contract/test/row-key.test.ts`; the repository rule requires every task adding a test file to scope both `backend/package.json` and `tools/quality-gate.test.mjs` so the registered leaf is actually run.
