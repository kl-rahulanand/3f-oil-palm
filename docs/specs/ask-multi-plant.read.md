---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-04T06:35:01+00:00
read_hash: a975439534fa0be6fb5a855a31afcc4852f87ea5
round: 1
passed: no
doc_seen: a975439534fa0be6fb5a855a31afcc4852f87ea5
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
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

1. Gap: the plant-selection contract and its authorization boundary are not defined.
   - Specify one canonical form for a chosen set, alias canonicalization, duplicate/conflicting filters, unknown names, and the named-but-ungranted refusal before the model or warehouse is called.
   - `Simpler: chosen plants → reuse Selection.filters with one canonical plant in-filter; “All plants” stores the exact selected canonical set.` This also settles whether a saved “All plants” view means its original set or newly granted plants; C9 currently conflicts with the dynamic wording of “All plants.”
   Disposition: cut "The plant set an answer uses" defines one canonical sorted, deduplicated plant `in` filter, alias resolution (canonical, SAP, display name; case- and whitespace-insensitive) on the server before any read, refusal of other plant filter shapes, the named-but-ungranted refusal (audited, no read), unknown names to the picker, and "All plants" as a stored snapshot; C9 now matches.

2. Contradiction: the picker relies on a superseded decision while the confirmed period spec still excludes multi-plant choice.
   - Decision 0033 was superseded by 0035 and then 0037; `ask-period-control.md` explicitly lists choosing among several plants as out of scope. State that this follow-up reopens that capability and is the governing source for `plantChoice`.
   Disposition: cut Why now says this spec reopens multi-plant choice excluded by ask-period-control.md, supersedes 0037 for Ask, governs `plantChoice`, and reuses the shipped period-choice mechanism rather than the superseded 0033.

3. Gap: picker and period clarification precedence is unspecified.
   - A multi-plant statement question can lack both plant and period, while `AskResponse` currently has one typed `periodChoice`. Define whether plant is chosen first, what base selection each continuation carries, and what happens if its selection or grants become invalid between clicks.
   - Unproven: C1: no test proves zero data reads before a plant choice, one-plant bypass, or the missing-plant-and-period sequence.
   Disposition: cut plant is chosen before period; each continuation carries the full base selection plus prior choices and re-checks grants, refusing with no read if invalid; C1 now requires leaves for no read before the choice, the one-plant bypass and the plant-then-period sequence.

4. Contradiction: C3’s “one row per plant” is not reconciled with statement-line answers.
   - Define the statement result grain for a plant breakdown: plant total only, or plant × statement leaf. The latter is required to retain a statement-line answer, but needs composite row identity and ordering; the former cannot show the combined statement lines described by C5.
   Disposition: cut statement answers accept leaf_key or leaf_key × plant, keyed `<leaf_key>|<plant>` and ordered by statement order then plant name; plant-total questions without statement lines are governed-financial.

5. Gap: the budget state cannot be represented by the current generic result table as written.
   - A nullable Budget cell alone cannot carry the required accessible labels, per-row `k of n`, or suppress % reliably. Define the typed response metadata and exact comparison behavior for DUB+non-DUB aggregates: whether the whole aggregate is excluded, which rows remain under a plant breakdown, and the exact skipped-plants readout.
   - Unproven: C6: no proof covers DUB-only, non-owner-only, mixed aggregate, mixed breakdown, zero-budget owner rows, and an empty comparison result.
   Disposition: cut typed `AskResponse.budgetStates` (loaded, not-loaded, partial with k of n) carries the labels and % suppression; comparisons evaluate only loaded rows with a left-out readout; C6 lists the six cases to prove.

6. Gap: C8 requires drill shapes the existing signed context does not support.
   - Current Ask drills support exactly one `gl_code` or `leaf_key` dimension and use that raw value as the row key. A per-plant GL or statement row needs a composite signed row identity and a predicate restricted to that row’s plant; otherwise the per-plant click can read the whole selected set.
   - Unproven: C8: no proof covers a plant-breakdown drill, a combined-statement drill, partial plant-grant revocation, or exact-paise footing for each.
   Disposition: cut the signed context binds each row's own plant set and composite row key, a click reads only that row's plants and foots to the paisa, and partial revocation is refused; C8 lists the cases.

7. Gap: saved and pinned re-runs lack a specified refusal path for a removed plant.
   - The current scope predicate can intersect a stored plant filter and silently return an empty or partial answer. C9 requires refusal, so pin the response class, user copy, audit behavior, and the rule that no surviving subset is run.
   - Unproven: C9: no test proves a saved or pinned DUB+CHIR selection is refused after either plant is revoked.
   Disposition: cut a re-run with any stored plant no longer held is refused (BlockedByPolicy) with stated copy, audited, and no subset is run; C9 requires the DUB+CHIR revocation leaves.

8. Gap: the success measure cannot be reproduced.
   - It refers to “the three suggested questions” without naming them. C11 names three question flows plus a Budget assertion, not the five-question denominator. List all five exact fresh-conversation prompts and their oracles.
   Disposition: cut the success measure now lists the five exact prompts with their expected results, and the baseline is 0 of 5.

9. Unproven: C2 and C10: alias recognition and model isolation have no stated proof.
   - Cover canonical code, SAP alias, display name, case/whitespace normalization, an ungranted recognized alias, and an unknown token. Prove the model receives only the current reader’s canonical/display vocabulary and no ungranted plant names or figures.
   Disposition: cut C2 and C10 now name the alias, normalisation, ungranted, unknown-name and model-vocabulary proofs.

10. Trap: selector schema/system-prompt regression: C1–C4 and C10.
    - Adding plant selection changes the selector vocabulary/schema. Hermetic replays cannot show whether existing phrasing loses `dimensionIds` or its period, so require a pre-change live Bedrock probe of existing working phrasings and run every C11 question in a fresh conversation.
   Disposition: cut Rules and C11 require a pre-change live Bedrock probe of existing working phrasings and a post-change check in fresh conversations.
