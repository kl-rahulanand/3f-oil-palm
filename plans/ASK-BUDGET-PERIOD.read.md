---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-05T09:19:08+00:00
read_hash: 590a97ed801f12dd28c16d528e740cb8e55655e1
round: 4
passed: yes
doc_seen: 590a97ed801f12dd28c16d528e740cb8e55655e1
spec_seen: eefd007b935ce364c36e49a98866d5fee92c3f00
notes_seen: 0120b90a0b4a0cc1ad82ec0c4c3c9669a8d6c7a5
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. The post-plant trigger conflicts with existing follow-up period inheritance.
   `chat.service.ts` copies a prior turn’s `timeWindow` before the proposed check. A no-period comparison asked as a follow-up would therefore answer with the inherited period, not ask. Pin the override/explicit-period signal and add a service leaf.
   Disposition: keep follow-up inheritance is pinned in Done-when detail 1 with a leaf each way.

2. The comparison-option rule can offer a period with nothing actually comparable.
   A chosen set can have CHIR actuals while DUB alone has budget; the stated independent checks offer the window, then the comparison excludes CHIR and has no DUB actuals. Decide whether eligibility requires Actual and Budget on the same chosen plant, and prove the resulting plain response or omission.
   Disposition: keep a comparison window now needs actuals and budget on the same chosen plant, with the CHIR-alone leaf.

3. Unproven: item 1: the trigger’s “either direction, any operator” contract.
   The listed leaves cover Actual `gt`/`lt` Budget only. Add table-driven coverage for Budget-on-the-left and `gte`/`lte`, or narrow the stated trigger.
   Disposition: keep the trigger leaf is now table-driven over gt, gte, lt, lte and Budget on the left.

4. Split: BP-ASK-PERIOD → period-policy module and Ask-service integration.
   Its new policy, extensive option/outcome matrix, continuation behavior, service-flow proofs, registry updates, and changes to the large service/test files are well beyond the roughly 400-line task threshold. Put the shared test registration in the final integration task.
   Disposition: keep split into BP-PERIOD-POLICY (pure rules plus its test registration) and BP-ASK-WIRING (service integration).

5. New moving parts is inaccurate.
   BP-ACTUAL-MONTHS introduces a repository lookup, and BP-ASK-PERIOD introduces `ask-budget-period.ts`. List them with their owning Done-when items and why a private helper in the existing service is insufficient.
   Disposition: keep none: a repository query and a pure module are not a dependency, service, datastore, queue, job or layer; the reason is in Notes.

6. Trap: Forge’s test command omits formatting and lint: items 1–4.
   The plan names hermetic and component leaves but does not require `npm run quality`; retain the repository-required final quality check for both backend and frontend tasks.
   Disposition: keep Notes now require npm run quality in every code part before its last commit.

## Round 2

7. Disputed keep 3: the trigger table still does not prove “either direction, any operator.”
   It covers all four operators only with Actual on the left, and only `Budget gt Actual` in reverse. Cover all four reverse-direction operators too, or narrow the contract.
   Disposition: keep the trigger leaf now covers all eight direction and operator pairs.

8. BP-PERIOD-POLICY does not pin the cross-task contract that BP-ASK-WIRING must implement.
   Function names alone leave the inputs and results undefined: the full chosen-set months, budget-owner months, loaded-budget months, eligible plants/left-out plants, and the distinct NotSupported versus Informational outcomes. Pin parameter and return types, including how the no-budget response obtains `leftOut`, in the policy task.
   Disposition: keep the rules contract section now pins the input and outcome types, including leftOut for the no-budget answer.

## Round 3

9. BP-PERIOD-POLICY still promises a pinned `comparisonPeriodOptions(...)` function that the rules contract neither declares nor needs.
   The contract makes `comparisonPeriodOutcome(...)` the sole options producer. Cut `comparisonPeriodOptions(...)` from the task description, or add its exact signature, ownership, and proof.
   Disposition: cut the task row now names exactly the contract's exports; comparisonPeriodOptions is gone.

## Round 4

No findings.
