---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-01T15:42:53+00:00
read_hash: ec98c53b1343c160b76da9a96ea333bae05195ad
round: 1
passed: no
doc_seen: ec98c53b1343c160b76da9a96ea333bae05195ad
spec_seen: a6a8d1d38c659820c053ce5dc838a53a64dbf471
notes_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
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
