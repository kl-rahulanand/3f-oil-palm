---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-02T06:56:58+00:00
read_hash: 6e8be2c78239d7888e37df8afdff5047a4cf9857
round: 25
passed: no
doc_seen: 6e8be2c78239d7888e37df8afdff5047a4cf9857
spec_seen: a6a8d1d38c659820c053ce5dc838a53a64dbf471
notes_seen: 8febab0d884c5965e26d8467b7a0f5b1ef2102ed
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. C2/C4 have a security and visibility hole: `canonicalizeSelection` appends only `compareTo.measureId`, not the filter’s left `measureId`.
   A direct selection can filter on a permitted-hidden left measure, so it is neither displayed nor permission-checked. Re-open the foundation scope to append and authorize both measure operands, and add a leaf for a hidden left measure.
   Disposition: keep `operandMeasureIds` (`backend/src/semantic/measure-filter.helper.ts:41-46`) adds the filter's left `measureId` (line 44) and the right operand (line 45), and `canonicalizeSelection` (line 53) sets `measureIds` from that union, so a direct selection's left measure is displayed and authorised; the foundation leaf `measure-filter.helper.test.ts` covers the union.

2. The grounded vocabulary cannot safely express “Actual-only report, compare Actual to Budget” with the current single `DomainSpec.measures` list.
   That list drives both top-level `measureIds` and comparison enums. Widening it admits Budget as a displayed measure, which report grounding rejects; keeping it narrowed makes Budget unavailable to `compareTo`. Pin a separate comparable-measure vocabulary/seam and prove Budget is valid only as a comparison operand.
   Disposition: cut the doc now pins the seam (Notes, Grounded vocabulary; Done-when details 7 and 9): a separate `comparableMeasureIds` argument on the provider call builds the comparison enums, grounding runs before the canonical append, MEASURE-FILTER-SELECTOR commits it with a crossing leaf.

3. Split: `MEASURE-FILTER-ASK-INTEGRATION` → selector/ingress work and Ask response/grounding work.
   Its delivery text covers C1, C2, C5, C6, C7, C8, and C9, while its Covers cell says only C1, C7, and C9. It also spans provider, chat, persistence, Swagger, help, warehouse proof, and command wiring—well beyond the task size limit.
   Disposition: cut MEASURE-FILTER-ASK-INTEGRATION is split into MEASURE-FILTER-SELECTOR (item 7, the seam) and MEASURE-FILTER-ASK-RESPONSE (items 9 and 1); each Covers cell matches its delivery text.

4. The task ownership is internally contradictory.
   The story says it has two remaining parts, but Technical Approach, Surface Impact, Task Decomposition, and Verify Plan still assign work to legacy tasks 1–3, including the already-merged foundation. Pull request #73 merged the foundation; #74 was the harness upgrade. Re-map every scope, test, and ownership reference to the two proposed tasks.
   Disposition: cut Surface Impact, Task Decomposition and Verify Plan now name the three remaining parts and mark the foundation as on master via pull request #73 (#74 was the harness upgrade).

5. The warehouse-test command change is incomplete in the integration task’s Scope and Tests cells.
   Adding `measure-filter.db.test.ts` to `backend/package.json` also requires updating `tools/quality-gate.test.mjs`, which pins both backend test registries. Assign that shared command-table wiring to one task and name its required test.
   Disposition: cut `tools/quality-gate.test.mjs` is in MEASURE-FILTER-ASK-RESPONSE's Scope and Tests, which owns the registry wiring.

6. Unproven: item 10: the six live Bedrock checks.
   The matrix has no executable runner or command that authenticates as the admin and DUB-only user, sends the prompts through Bedrock, and evaluates the GL and statement oracles. The listed tests are frontend Vitest tests; the gated database proof does not prove provider behavior or the DUB statement result.
   Disposition: keep CI has no network (Forge's own trap) and Bedrock is non-deterministic, so the matrix is the worker's walked functional check under Forge's contract (the brief's `Functional check:` paragraph), not a CI runner; the doc now says how it is executed and names each row's oracle: the gated leaf's printed over-budget set, the DUB statement screen, and the answer's Actual column.

7. Trap: Windows shells: item 10.
   The prescribed warehouse command uses POSIX inline environment assignments and line continuations. Provide PowerShell/cmd equivalents or explicitly declare the live/warehouse checks macOS/Linux-host-only.
   Disposition: cut the doc declares the warehouse proof and the live check macOS/Linux-host-only (For the builders; Verify Plan): CI is Linux without a database or network and the repository has no Windows development host.

## Round 2

8. Split: `MEASURE-FILTER-ASK-RESPONSE` remains too large and its Covers cell is inaccurate.
   It delivers C1, C2, C5, C6, C8, and C9—direct canonicalisation, refusal, warehouse proof, empty answer, snapshot/readback, and grounding—but lists only C1 and C9. The plan also still claims items 1–6 are complete despite this unfinished work. Reassign each unfinished outcome and split the response task further.
   Disposition: cut the claim that items 1 to 6 are complete is withdrawn: details 1, 2, 5 and 6 now say what #73 left and which row delivers it; the response part is split into MEASURE-FILTER-ASK-RESPONSE (items 2, 6, 9) and MEASURE-FILTER-ASK-RECORD (items 1, 8, 5); item 8 is now the backend half and new item 11 the on-screen half, so every Covers cell names what its row delivers.

9. Unproven: item 7: a comparison measure from one permitted domain cannot be used with another selected domain.
   `comparableMeasureIds: string[]` has no domain association, while the provider may receive multiple allowed domains. The plan only validates against that global list; pin either per-domain comparable IDs or a selected-domain parser check, with a cross-domain refusal leaf.
   Disposition: cut the seam is now `comparableMeasureIdsByDomain`, keyed by domain name; `parseMeasureFilters` checks operands against the selected domain's list and MEASURE-FILTER-SELECTOR carries a cross-domain refusal leaf (Notes, The selector and Grounded vocabulary; the SELECTOR row).

10. The plan contradicts itself about the mock provider.
   The selector task and Grounded vocabulary say `LlmProvider` and `mock.provider.ts` carry `comparableMeasureIds`, while the Selector technical approach still says “The mock provider is unchanged.” One contract must be chosen and tested.
   Disposition: cut The selector now says `LlmProvider` and the mock provider accept the new argument and the mock ignores it; the contradiction is gone.

11. Done item 3 remains ambiguous against item 9.
   One says the “statement view” applies comparisons; the other says the MIS statement cannot apply them. The technical notes distinguish Ask’s statement projection from the MIS statement screen, but the user-facing Done-when text does not. Name those two surfaces explicitly.
   Disposition: cut item 3 now names Ask's GL-code view and Ask's statement-line view, and item 9 the MIS statement screen.

## Round 3

12. The new selector seam is still named inconsistently.
   C7, Surface Impact, and Verify Plan say `comparableMeasureIds`; tasks and Technical Approach require `comparableMeasureIdsByDomain`. Use the keyed name everywhere so the parser and provider contract are unambiguous.
   Disposition: cut `comparableMeasureIdsByDomain` is the only name in the doc now (Done-when details 7, Surface Impact, Verify Plan).

13. Item 8’s “backend half” still contains the frontend label, readout, empty-state, and reopen requirements.
   Those belong to item 11 and MEASURE-FILTER-SURFACES, while MEASURE-FILTER-ASK-RECORD owns chips, readback, response, and snapshot. Split the detail text accordingly so each task’s Covers cell remains truthful.
   Disposition: cut detail 8 now holds only the backend half (chip, readback, `appliedMeasureFilters`, snapshot, DTOs and Swagger, with its leaves) and item 8's sentence drops the identity clause; labels, readout, empty state, reopen and identity live in item 11 and MEASURE-FILTER-SURFACES.

14. The ingress Risk still refers to obsolete task numbering and reverses the new ownership.
   It says task 1 covers every door and task 2 covers the provider door; now the selector covers the provider door, response covers the direct door, and foundation covers saved/pin/reopen. Update the risk’s proof references.
   Disposition: cut the ingress risk now names the foundation on master for saved, pin, reopen and prior-turn doors, MEASURE-FILTER-SELECTOR for the provider door and MEASURE-FILTER-ASK-RESPONSE for the direct door.

15. Unproven: item 5: totals beyond the visible page.
   The warehouse proof says it uses the July fixture and asserts totals beyond the page, but does not pin a limit or prove that matching groups exceed it. Specify a deterministic low limit and an assertion that a matching group beyond that page contributes to the total.
   Disposition: cut the gated leaf now pins `limit: 1`, asserts at least two over-budget groups in the July window (failing loudly otherwise) and that the total equals the sum over every matching group in the relation (detail 5, Verify Plan, the RECORD row).

## Round 4

16. Unproven: items 1 and 2: a follow-up after an answer with a measure filter.
   The frontend sends prior successful selections in `priorTurns`, but the current nested schema rejects `measureFilters`. The plan only names the direct `AskRequest.selection` door. State that the shared schema admits filters in prior turns, preserves their canonical form before Bedrock sees them, and add a `chat.schemas` or chat-service leaf for that follow-up.
   Disposition: cut detail 2 now names `askSelectionSchema` (`chat.schemas.ts:24`) as the shape of both the direct selection and every prior turn, MEASURE-FILTER-ASK-RESPONSE widens it and canonicalises each prior turn's selection before Bedrock and before a follow-up re-runs it, with leaves in `chat.schemas.test.ts` and `chat.service.test.ts` (row, Verify Plan).

## Round 5

17. The prior-turn plan describes behavior the chat service does not have.
   `chat.service.ts:193` only reads the latest prior selection for time-window inheritance; the next selection still comes from Bedrock. It never “re-runs the last one.” Rename this as canonical prior context passed to Bedrock and test that behavior, or explicitly scope and prove a new rerun path.
   Disposition: cut detail 2, the ASK-RESPONSE row and the Verify Plan now describe prior turns as canonical conversation context for Bedrock (`bedrock.provider.ts:200`) with only the time window inherited (`chat.service.ts:193`, `:318`), state that nothing re-runs a prior selection and the story adds no re-run path, and the leaf tests that behaviour.

## Round 6

18. The ingress-risk ownership is stale again.
   It says foundation leaves cover prior-turn doors, yet C2 and MEASURE-FILTER-ASK-RESPONSE say `priorTurns[].selection` currently rejects filters and that task must admit and canonicalise them. Assign that prior-context door and leaf to ASK-RESPONSE.
   Disposition: cut the ingress risk now assigns the prior-turn context door and its leaf to MEASURE-FILTER-ASK-RESPONSE, matching detail 2 and the row; the foundation covers saved, pin and reopen only.

## Round 7

19. Grounding’s duplicate rule cannot work with the stated ordering.
   Provider output is merged before canonicalization, but C9 requires deduplication after amount normalization. `500000` and stored `500000.00` remain separate through the merge, then normalize into a refused duplicate. Normalize filters before or inside the merge and add a leaf for this equivalent-value case.
   Disposition: cut the order is now normalise, merge, append (Notes, Grounded vocabulary; detail 9; the ASK-RESPONSE row and Verify Plan): filters are normalised before the grounding merge, the report's filters too, so `500000` and a stored `500000.00` deduplicate to one entry, and the operand append still comes after the merge; a `chat.service.test.ts` leaf covers the equivalent-value duplicate.

20. The plan contradicts the confirmed spec on prior-turn reruns.
   Spec C2 requires canonicalization at a “prior-turn selection re-run,” while this plan says no such path exists or will be added. Reconcile the confirmed spec and plan, or identify and prove the required rerun path.
   Disposition: keep the repository has no prior-turn re-run path (`chat.service.ts:193` and `:318` only inherit the time window; `bedrock.provider.ts:200` passes prior turns as context), so the spec's "prior-turn re-run" is a misnomer for the prior-turn context door, which MEASURE-FILTER-ASK-RESPONSE canonicalises; the plan records it under Notes as a spec erratum to correct at the spec's next edit, because re-confirming a confirmed spec for wording that changes no behaviour costs a full spec read cycle.

## Round 8

21. The selector task cannot pass its grounded crossing leaf before the response task.
   Grounding currently drops `measureFilters`; its merge is assigned to the later response task, yet selector must prove an Actual-only report preserves `Actual > Budget` through grounding and append. Move the merge seam and crossing leaf into selector, or move both to response.
   Disposition: cut the report-grounding merge (carrying `measureFilters` through `applyReportGroundingToSelection`, which drops them today) and `viewInReport` now belong to MEASURE-FILTER-SELECTOR with the crossing leaf, so it covers items 7 and 9; MEASURE-FILTER-ASK-RESPONSE keeps the direct and prior-turn doors, the refusal translation and the empty answer, items 2 and 6 (rows, detail 9, Task Decomposition, Verify Plan, Surface Impact).

## Round 9

22. Split: `MEASURE-FILTER-SELECTOR` → provider seam and grounded-selector integration.
   It now spans provider schema/prompt/parser/interface/mock changes plus normalization, grounding merge, append order, `viewInReport`, and several chat leaves—likely beyond the ~400-line task limit. The second task can depend on the provider seam and own C9.
   Disposition: cut MEASURE-FILTER-SELECTOR is split into MEASURE-FILTER-PROVIDER (item 7: schema, prompt, parser, the seam, the provider door, a crossing leaf on an ungrounded recorded output) and MEASURE-FILTER-GROUNDING (item 9: normalise-merge-append, the merge carrying filters, viewInReport, the grounded crossing case), the latter after the former; five parts remain.

23. The refusal-contract notes still assign work to nonexistent “Task 1.”
   They say Task 1 changes `global-exception.filter.ts`, but Surface Impact says that branch is already on master and current task 1 has no such Scope. Replace it with the foundation ownership.
   Disposition: cut the refusal-contract note now says the foundation (on master, #73) added the exception-filter branch.

## Round 10

24. The builders summary is stale.
   It says “Four parts remain,” while the task table and decomposition now define five.
   Disposition: cut the builders summary now says five parts remain.

25. `MEASURE-FILTER-PROVIDER` omits C2 from its Covers cell.
   C2 explicitly assigns the provider ingress to this task, and its delivery canonicalizes provider output, but it claims to cover only C7.
   Disposition: cut the provider door's canonicalisation is stated under item 7 (detail 7), which MEASURE-FILTER-PROVIDER covers, and detail 2 now says that door is done under item 7 before item 2's task runs; item 2 stays with MEASURE-FILTER-ASK-RESPONSE, which runs after it, so its reviewer sees every door in place.

## Round 11

26. C2’s provider ingress is still unmapped.
   Rewording it as “part of item 7” does not change that canonicalizing provider output is C2 behavior. Add C2 to `MEASURE-FILTER-PROVIDER`’s Covers cell, or move that work to the C2 task.
   Disposition: cut canonicalising the provider door now belongs to MEASURE-FILTER-ASK-RESPONSE with items 2 and 6 (every door: provider, direct, prior turn), which runs right after MEASURE-FILTER-PROVIDER; the provider task covers item 7 only and its crossing leaf shows parsed filters reaching the chat service intact; MEASURE-FILTER-GROUNDING follows and inserts the merge between the normalise and the append (rows, details 2 and 7, Task Decomposition, Verify Plan, Surface Impact, the ingress risk).

## Round 12

27. C2’s grounded ingress is now unmapped.
   `MEASURE-FILTER-GROUNDING` runs `canonicalizeSelection` after its merge, yet claims only C9 while C2 says the grounded selection is an ingress. Add C2 to that task and its detail, or move the grounded canonicalization into the C2 task.
   Disposition: cut MEASURE-FILTER-GROUNDING now covers items 9 and 2: its row and detail 2 name the grounded selection as item 2's last ingress, canonicalised after the merge and refused identically, with a leaf; it runs after MEASURE-FILTER-ASK-RESPONSE, so every other door is in place when its reviewer reads item 2.

## Round 13

28. Split: `MEASURE-FILTER-ASK-RECORD` → answer record and warehouse proof.
   The DB proof plus package and quality-gate wiring is independent C5 work and makes this already three-item, multi-surface task likely exceed the line budget. Give the proof and its registries their own task.
   Disposition: cut the gated warehouse proof and its registries are MEASURE-FILTER-WAREHOUSE-PROOF (item 5), after MEASURE-FILTER-ASK-RECORD (items 1 and 8) and before MEASURE-FILTER-SURFACES, whose functional check uses the set it prints; six parts remain.

## Round 14

29. The warehouse-proof task has an artificial dependency.

   Its builder/executor DB proof and registry wiring do not consume chips, readback, snapshots, DTOs, or help from `MEASURE-FILTER-ASK-RECORD`. Start it from the foundation; then make Surfaces wait for both the record task and the proof.
   Disposition: cut MEASURE-FILTER-WAREHOUSE-PROOF now waits for nothing (it needs only the foundation on master) and MEASURE-FILTER-SURFACES waits for both MEASURE-FILTER-ASK-RECORD and the proof (rows, Task Decomposition).

## Round 15

No findings.

## Round 16

30. Shared test-registry wiring has two concurrent owners.
   `MEASURE-FILTER-ASK-RECORD` and `MEASURE-FILTER-WAREHOUSE-PROOF` both edit `backend/package.json` and `tools/quality-gate.test.mjs`, yet the proof has no dependency on Record. The Record row also says “No … registry … change” while its Scope says the opposite. Put both registrations in a small final wiring task after Record and Proof (and make Surfaces wait for it), or serialize ownership under one task.
   Disposition: cut the proof part merged as #79 before the record part started, so the two registry files have one owner at a time and no wiring task is needed; the record row now says it registers its two new leaves there, matching its Scope (Tasks row).

31. The D-0006 formatter-removal path targets a deleted ledger and contradicts the plan’s migration note.
   `.prettierignore` requires recording a removal in `plans/deferrals.md`, but Forge v1 deleted that file and the plan says deferrals are plain Notes; the Record task nevertheless scopes the absent file. Pin one current recording location and its update, rather than recreating an obsolete ledger or leaving the required removal undocumented.
   Disposition: cut `plans/deferrals.md` is dropped from the Scope; the row now pins the recording location as one dated header comment in `.prettierignore` itself, the way the D-0005 removal is recorded, and says the ledger is not recreated (Tasks row).

## Round 17

32. The plan’s task state is stale and contradictory.
   It says six parts remain and that Provider and Warehouse Proof may still run, while the Record task relies on Provider #78 and Warehouse Proof #79 already having merged. Mark those two parts as on master and update the remaining-work count and decomposition so workers have one current dependency state.
   Disposition: cut the For the builders paragraph and the Task Decomposition now mark Provider (#78), Warehouse Proof (#79), Ask Response (#80) and Grounding (#81) as merged and name the two remaining parts.

33. The D-0006 cleanup is not fully pinned.
   Removing `conversations.service.ts` from `.prettierignore` also requires removing its entry from `tools/quality-gate.test.mjs`’s exact `ignoredBaselineHashes` manifest; otherwise the quality-gate leaf fails. Name that removal and add `tools/quality-gate.test.mjs` to Record’s Tests cell. The task should also replace the existing `.prettierignore` header’s still-false reference to deleted `plans/deferrals.md`, not merely append a new comment.
   Disposition: cut the Record row now names the `ignoredBaselineHashes` removal in `tools/quality-gate.test.mjs` and the replacement of the header's `plans/deferrals.md` reference, and `tools/quality-gate.test.mjs` joins its Tests cell (Tasks row).

## Round 18

No findings.

## Round 19

No findings.

## Round 20

34. The task state is stale: Ask Record has already merged to `origin/master` as pull request #82, but the plan still says only four parts are merged and lists Ask Record as next.

   Update the builders summary and decomposition to mark Ask Record merged and Surfaces as the sole remaining part, so no worker attempts to rebuild it.
   Disposition: cut the For the builders paragraph and the Task Decomposition now mark MEASURE-FILTER-ASK-RECORD merged as #82 and name MEASURE-FILTER-SURFACES as the one remaining part.

## Round 21

35. The plan still says the completed Ask Response work is broken “today”: it claims `askSelectionSchema` omits `measureFilters` and prior turns are refused.

   Pull request #80 is merged; `origin/master` now uses the full selection schema and has acceptance coverage. Update that C2 detail and the ingress risk to describe the completed behavior, leaving only Surfaces as unfinished.
   Disposition: cut Done-when detail 2 now says the Ask doors were delivered and merged as #80 and describes the schema gap in the past tense; the Risks line sits above For the builders in the approved part of the doc and records the risk as it stood at approval, so it is left as approved.

## Round 22

36. The ingress-risk entry still says `priorTurns[].selection` “rejects today,” although #80 is merged and the schema now accepts it.

   Retain the risk, but describe the former gap in past tense and the completed leaf that guards against regression.
   Disposition: cut the ingress risk keeps its place and now says the prior-turn schema gap closed with #80 and names the `chat.schemas.test.ts` leaves that guard it; Risks is outside the approval hash, so the approval stands.

## Round 23

37. C9 still says `applyReportGroundingToSelection` “drops `measureFilters` today,” despite Grounding having merged as #81.

   Change this to the pre-#81 condition and name the merged grounding leaf, so the remaining Surfaces worker is not told to fix an already-completed backend path.
   Disposition: cut Done-when detail 9 now says the grounding merge dropped filters before #81 and names its merged leaves; the same sweep put every other present-tense description of a merged gap below For the builders (the Ask Response and Grounding rows, the refusal and totals notes, the grounded-vocabulary note) in the past tense or neutral wording.

## Round 24

No findings.

## Round 25

38. Unproven: item 11: the readout cannot “survive reopening a conversation” on the declared frontend path.
   `AskProvider` keeps turns only in memory, and its existing test explicitly proves a reload clears them. The frontend has no conversation API client or hydration path despite backend conversation endpoints. Name the reopen UI/API path, scope it, and add a hydration/readout leaf—or defer this requirement.
   Disposition: cut Done-when 11 no longer promises the readout after a conversation reopen; the owner removed it and deferred it until a reopen screen exists (Notes, Decided line, 2026-10-02), and detail 11 and the Surfaces row drop it too.

39. Unproven: item 11: reopening a saved or pinned selection with a measure filter is not covered by a declared leaf.
   The task names only label, identity, Ask-panel, and provider tests; it excludes `saved-views` and `pinned-reports`, whose existing reopen tests use selections without `measureFilters`. Add filtered reopen leaves there that assert the exact selection reaches Ask, or explicitly make an equivalent integration leaf prove both entry points.
   Disposition: cut `saved-views.test.tsx` and `pinned-reports.test.tsx` join the Surfaces row's Scope and Tests, and detail 11 names their filtered reopen leaves asserting the stored selection with `measureFilters` reaches Ask intact.
