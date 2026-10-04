---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-04T13:54:24+00:00
read_hash: d7b3037e9e2b7ca2f7f5a616e4212582dfb8e95b
round: 20
passed: yes
doc_seen: d7b3037e9e2b7ca2f7f5a616e4212582dfb8e95b
spec_seen: 25f0688944de29ca0538c1351091fce3514f8bf9
notes_seen: 457416a7d79376c76b7c577551aebd14b38ae1c7
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

## Round 6

19. `plantNames` is not persisted with conversation turns.
   Conversation snapshots deliberately copy only listed render fields, and neither the snapshot type nor `conversations.service.ts` is in scope. Reopening a saved Ask answer will lose plant display names. Unproven: items 3, 5, and 6. Add the field, copy, and persistence leaf to the contract/budget work.
   Disposition: cut `ConversationAnswerSnapshot` gains plantNames, budgetStates and leftOut (MP-CONTRACT) and the conversation service keeps them with a persistence leaf (MP-ASK-BUDGET, scope added).

20. `plantNames` contradicts the confirmed `leftOut` shape.
   The spec defines `leftOut.plants` as display names, but the plan says the client renders `leftOut` through a map keyed by canonical codes; it has no canonical key to look up. Keep `leftOut` rendered directly from its display names, or amend and reconfirm the spec.
   Disposition: cut `plantNames` covers plants read only; `leftOut.plants` stays display names per the spec and renders directly.

21. C11a is still absent from MP-ASK-CHOICE’s Covers cell.
   Its delivery and test name the work, but the task remains marked only 1, 2, and 9. It also covers Done-when item 10 through C11a; record that mapping.
   Disposition: cut C11a moves to MP-ASK-BUDGET, which now covers 5, 6 and 10 (detail 10 records C11a); MP-ASK-CHOICE stays at 1, 2 and 9.

22. MP-STATEMENT-COMBINED now delivers budget behaviour without covering item 5.
   Its new DUB-only statement-budget join and CHIR-no-budget leaf are C6 behaviour, but its Covers cell remains only 4. Add item 5 so the task table matches the work.
   Disposition: cut MP-STATEMENT-COMBINED now covers 4 and 5.

## Round 7

23. The plant-readout formatting branches have no named proof.
   Item 6 requires one-to-three plants by name, and four or more as “n plants” with names only in “How this was calculated.” The plan names only a mixed-grant leaf. Unproven: item 6. Add UI/backend leaves for the three-name boundary and the four-plant disclosure.
   Disposition: cut detail 6 names the one, three and four plant readout leaves in the backend (MP-ASK-BUDGET) and the panel (MP-ASK-UI).

## Round 8

24. Split: MP-ASK-BUDGET → budget/readout persistence + selection normalisation.
   It now combines budget-state and no-budget response assembly, provenance/readout, stored-answer persistence, and C11a’s unrelated selection rewrite across the central chat service and three test suites. Move C11a back to MP-ASK-CHOICE (and mark it as covering item 10), or make it a small dedicated normalisation task.
   Disposition: cut C11a is its own small part, MP-MONTH-FILTER (a pure helper plus the chat service call, covering 10), after MP-ASK-CHOICE; MP-ASK-BUDGET waits for it and covers 5 and 6 only.

## Round 9

25. New moving-parts inventory is stale after the C11a split.
    It says there are two pure modules, but MP-MONTH-FILTER adds `redundant-month-filter.ts`. List it with Done-when item 10 and why extraction beats an in-service helper, or fold it into `chat.service.ts`.
    Disposition: cut the moving-parts line lists all three pure modules with their Done-when items and why each is extracted (its cases are proven without the chat service's dependencies).

## Round 10

26. Unproven: item 10: removing the redundant month filter returns the same rows as no filter.
    MP-MONTH-FILTER names removal and kept-shape leaves, but not C11a’s execution-equivalence proof. Its chat-service leaf should run both selections and assert identical rows while only the redundant filter is absent from execution.
    Disposition: cut MP-MONTH-FILTER names the execution-equivalence leaf: both selections run, identical rows, the executed selection lacking only the redundant filter.

27. The moving-parts inventory still omits `contract/src/row-key.ts`.
    MP-CONTRACT creates this shared pure module, but the summary says the row-key work lives in existing services and lists only three modules. Add it with Done-when 7 and its shared backend/frontend rationale, or correct the inventory.
    Disposition: cut the inventory lists `contract/src/row-key.ts` with Done-when 7 and why it lives in the contract (backend and frontend derive the same key).

## Round 11

28. C1 still says the picker is produced before “any warehouse read,” while allowing `distinctValues` to read the warehouse.
    Replace that phrase with “before any figure read” so it matches the confirmed spec and the stated leaf.
    Disposition: cut detail 1 now says before any figure read.

29. Unproven: item 7: month-bearing result shapes render inert.
    The plan declares only four drillable shapes but names no leaf proving a `month` shape has no labels, drill link, or clickable Actual. Add it to MP-ASK-DRILL.
    Disposition: cut detail 7 adds the inert month-bearing shapes leaf to MP-ASK-DRILL (no rowLabels, no drill, plain Actuals).

30. Unproven: item 2: duplicate and out-of-order canonical plant filters become sorted and deduplicated.
    The spec requires every executed selection’s plant filter to be canonical, sorted, and deduplicated, but no leaf covers values such as `["DUB", "CHIR", "DUB"]` across ingress paths.
    Disposition: cut detail 9 adds the sort-and-dedupe leaf for `["DUB","CHIR","DUB"]` at each ingress, in plant-set.test.ts and chat.service.test.ts.

## Round 12

31. Unproven: item 2: valid unordered or duplicate filters are canonicalized when creating a saved view or pin.
    Detail 9 names only saved/pin re-runs, while C2 requires canonicalisation at their creation ingress too. Add MP-SAVED-PINS service leaves asserting stored selections are sorted and deduplicated.
    Disposition: cut detail 9 adds the creation-ingress leaves: saving or pinning `["DUB","CHIR","DUB"]` stores `["CHIR","DUB"]`, in saved.service.test.ts and pins.service.test.ts (MP-SAVED-PINS).

## Round 13

32. Unproven: item 2: a selection carrying two plant filters is refused.
    C2 requires exactly one plant filter, but the named leaves cover malformed values and duplicate values within one filter only. Add a `plant-filter-invalid`, no-read leaf for two plant filters.
    Disposition: cut detail 9 adds the two-plant-filters leaf: `plant-filter-invalid` with no read in plant-set.test.ts and chat.service.test.ts, and rejected on save and pin.

## Round 14

No findings.

## Round 15

33. Split: MP-ASK-CHOICE → plant choice/model boundary (1, 2, 9) + statement Ask handoff (4).
   It explicitly removes the multi-plant statement refusal, which is required for Done-when 4 but absent from Covers. Adding 4 gives it four items; move that handoff and its leaf to a small follow-on task or MP-STATEMENT-COMBINED.
   Disposition: cut the multi-plant statement handoff moves to its own part, MP-ASK-STATEMENT (covers 4), after MP-ASK-CHOICE, which keeps 1, 2 and 9.

34. Split: MP-ASK-UI → picker/refusals (1, 9) + result presentation (5, 6, 7).
   It renders refusal reasons (item 9) and changes row-keyed labels and drill links (item 7), yet Covers lists only 1, 5 and 6. Adding the missing items makes five, across the already large Ask panel and test files.
   Disposition: cut MP-ASK-UI splits into MP-ASK-UI-CHOICE (picker, origin continuations, refusal copy: 1, 9) and MP-ASK-UI-RESULTS (readout, budget labels, left-out, plant names, row-keyed lookups: 5, 6, 7).

35. MP-ASK-BUDGET must cover Done-when 7.
   Its `viewInReport` rule for multi-plant statements is the C8 link behaviour: only a single-plant statement can open the report. Add 7 to its Covers cell; it then covers three items, not four.
   Disposition: cut MP-ASK-BUDGET now covers 5, 6 and 7.

## Round 16

No findings.

## Round 17

36. The new saved/pin selection-label requirement has no display-name source or owning criterion.
   `selectionLabel` receives only a `Selection`, while saved-view and pin list items carry only that selection; `AskResponse.plantNames` is neither present nor available there. Pin a list-response mapping/source for canonical code → display name and its tests, and place it under C9/MP-SAVED-PINS (or remove this non-spec addition).
   Disposition: cut the label now reads "Plant: <canonical codes>" from a `plant` entry in the contract's dimension labels, so it needs no display-name source; MP-ASK-UI-RESULTS scopes contract/src/api.ts and proves it in selection-label.test.ts.

## Round 18

37. The new shared `SEMANTIC_LABELS.dimensions.plant` is late contract work with no first owner.
   Both MP-CONTRACT and MP-ASK-UI-RESULTS scope `contract/src/api.ts`, but only the late UI task introduces and proves the label. Pin it in MP-CONTRACT and let the UI consume it; if this saved/pin-card change remains, trace it to item 8 rather than MP-ASK-UI-RESULTS’s current 5–7 coverage.
   Disposition: cut the plant label wording on saved and pinned cards is removed from this story (it is not in the spec and the contract part is already merged); it becomes a separate follow-up.

## Round 19

38. Cut or defer: the orphaned `selection-label.ts` work in MP-ASK-UI-RESULTS.
   The label behaviour was removed, but both the source file and its test remain in that task’s Scope and Tests cells without delivering any Done-when item. Remove them from this story task.
   Disposition: cut selection-label.ts and its test are removed from MP-ASK-UI-RESULTS's Scope and Tests.

## Round 20

No findings.
