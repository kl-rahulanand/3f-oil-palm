---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-01T15:56:35+00:00
read_hash: 96a6c30fde08cec727b9d10d348bbdcde157e46a
round: 5
passed: no
doc_seen: 96a6c30fde08cec727b9d10d348bbdcde157e46a
spec_seen: a6a8d1d38c659820c053ce5dc838a53a64dbf471
notes_seen: d0ade4c7bfec241c1de157cb6ea17d89707c2b61
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
