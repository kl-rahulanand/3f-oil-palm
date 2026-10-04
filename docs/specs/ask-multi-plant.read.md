---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-04T08:48:36+00:00
read_hash: 9556773e6f8012ba81f88a2cdad0c149847d23d9
round: 22
passed: no
doc_seen: 9556773e6f8012ba81f88a2cdad0c149847d23d9
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: 972527193c60b69a45b40c344461ee249dab75a3
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

## Round 2

11. Gap: the stated plant filter is not a valid `SelectionFilter`.
    - The contract uses `{ dimensionId, op, value }`, not `{ attribute, operator, values }`. Pin the actual serialized shape and its validation/canonicalization at every ingress.
    - `Simpler: filters: [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }]`; do not introduce a second filter grammar.
    Disposition: cut the plant set is the existing `{ dimensionId: "plant", op: "in", value: [...] }` filter, canonical and sorted, with no second grammar, validated at every ingress (question, continuation, edited selection, saved view, pin, re-runs).

12. Gap: `plantChoice` is named but its typed contract is undefined.
    - Period options make one fixed patch; a multi-select plant picker needs option values/labels, an “All plants” snapshot patch, selection/question carriage, and defined submit behavior. Without that, the frontend, API schema, Swagger, saved selections, and continuation handler cannot agree.
    Disposition: cut `AskResponse.plantChoice` is typed (prompt, question, base selection, options of canonical value and display label, and an allPlants snapshot value), submitted through the edited-selection path, re-validated, and carried in the contract, schemas and Swagger (C2).

13. Contradiction: “% is omitted” conflicts with the confirmed all-plants statement rule.
    - `all-plants-statement.md` requires Ask to retain the `%` column with a null not-loaded value and label; this draft can omit a value, but must not omit the column. State the null cell and accessible label for `%` as explicitly as for Budget.
    Disposition: cut the % column stays, with a null cell labelled "not loaded" for not-loaded and partial rows, and no column is ever dropped.

14. Gap: C2/C10 do not ensure an ungranted plant name never reaches the model.
    - The draft requires server resolution before a warehouse read, but the raw question normally reaches the selector first. Require recognized ungranted-plant refusal before the provider call, and prove no selector invocation occurs; otherwise “no ungranted plant … sent to the model” is false.
    Disposition: cut the server checks the question for any ungranted plant's code, SAP code or display name before the selector is called and refuses with no provider call; short codes match only as upper-case tokens; C2 and C10 prove it.

15. Contradiction: C7 says every answer states its plant set, but a picker or an unrecognized-name response has no chosen set.
    - Limit the readout requirement to successful data answers, and specify picker/refusal copy separately. Informational Ask responses likewise have no meaningful plant set.
    Disposition: cut the plant readout applies to successful data answers only; picker, unrecognised-name and refusal copy is stated separately (C7).

16. Unproven: C5: no named proof covers each-plant mapping, a line unmapped by every chosen plant, the cross-plant `unmapped-GL` sum, and one-plant equivalence to the MIS statement.
    - These are the cases that make the combined projection safe; a generic combined-statement assertion can pass while dropping or double-counting a mapping triple.
    Disposition: cut C5 now names the four proofs: each plant's triples feeding a shared line without loss or double-count, a line no plant maps reading ₹0, the cross-plant unmapped-GL sum, and one-plant equivalence.

17. Unproven: C7/C8: no leaf proves the exact effective plant predicate reaches provenance, GL names, composite drill rows, and the transaction footer.
    - Include a mixed grant where the answer reads fewer plants than the reader holds, plus both GL-code × plant and leaf × plant rows. Their names and drills must not widen to the grant set.
    Disposition: cut C7 adds a mixed-grant leaf proving the effective predicate reaches provenance, names, composite GL × plant and leaf × plant drill rows and the footer without widening.

18. Trap: typed refusal delivery: C1 and C9.
    - The global exception filter replaces exception text. The continuation and saved/pin refusal need a typed reason in the response/envelope so the client can reliably render the specified access-changed copy instead of relying on an HTTP message.
    Disposition: cut every plant refusal is an Ask answer with responseClass BlockedByPolicy and a typed `refusal.reason`, so the exception filter cannot strip its wording.

## Round 3

19. Gap: an executable selection without a plant filter is not defined.
    - `at most one` permits zero, so an edited or legacy saved/pinned selection can still bypass the picker and run over the full grant. Require exactly one canonical plant filter before any data query; a multi-plant reader with none gets `plantChoice`, while a one-plant reader gets an injected singleton filter.
    - Unproven: C1/C9: no leaf covers a direct edited selection or legacy saved/pinned selection with no plant filter.
    Disposition: cut every selection that runs a data query holds exactly one plant filter; a selection without one (edited, or an older saved view or pin) gets the picker for multi-plant readers or a singleton filter for one-plant readers, with leaves in C1.

20. Gap: named-plant resolution is not made authoritative over the selector output.
    - The model receives canonical/display vocabulary but not SAP aliases, while the server recognizes SAP aliases in the question. Specify that server-resolved named plants create the authoritative filter (and reject a conflicting edited/model filter), rather than allowing the selector to omit or widen the named set.
    Disposition: cut for a new question the server-resolved named plants set the filter, replacing the selector's (difference logged); a selector filter is discarded when no plant is named; an edited selection's filter is authoritative once validated; C1 proves it.

21. Contradiction: C6 still requires “no %” for not-loaded and partial rows.
    - Behaviour now correctly requires a retained `%` column with a labelled null cell. Replace C6’s “no %” with that exact cell rule so its acceptance test cannot approve column removal.
    Disposition: cut C6 now requires a null % cell labelled "not loaded" in a retained % column, never column removal.

22. Gap: C3’s permitted GL-code × month shapes have no safe row identity for names or drills.
    - `<gl_code>|<plant>` is not unique for GL-code × month or GL-code × plant × month, yet C3 allows both and C8 says links work for any plant set. Either make multi-dimension rows inert, or bind every grouping value—including month—in row labels, the signed key, and the transaction predicate.
    Disposition: cut names and clicks apply only to gl_code, gl_code × plant, leaf_key and leaf_key × plant; any shape with month renders inert as today; C8 proves it.

23. Gap: budget-comparison exclusion must happen before ordering, limiting, totals, and drill preparation.
    - `budgetStates` is response metadata; filtering rows after it is built can omit qualifying DUB rows beyond the limit and produce wrong totals. Pin a query-level loaded-budget predicate and prove a fixture with more loaded matches than the page limit, plus partial/not-loaded rows.
    Disposition: cut a budget comparison restricts the query itself to chosen plants with a loaded budget, before grouping, ordering, the limit, totals and drill preparation, and names the left-out plants; C6 adds the over-limit fixture.

## Round 4

24. Contradiction: success-measure question 4 still expects CHIR to show “no %”.
    - Behaviour and C6 now require a retained `%` column with a labelled null cell. Change the oracle to “a null % cell labelled ‘not loaded’,” so the live check cannot approve column removal.
    Disposition: cut success-measure question 4 now expects a null % cell labelled "not loaded" in a retained % column.

25. Gap: “a name that matches no plant” has no deterministic detection rule.
    - The pre-selector matcher can recognize known aliases, but cannot know that an arbitrary unmatched word is intended as a plant; the selector cannot emit it because its vocabulary excludes it. Define the grammar/source of an unknown plant candidate, including ordinary period words such as “July,” and prove it does not spuriously trigger the picker.
    Disposition: cut a plant is recognised only by the whole-word mapping-master match; no other word is treated as a plant, so an unmatched question gets the picker with no notice; C2 proves period, measure and GL words never match.

26. Gap: C11’s live regression probe is not reproducible.
    - “Existing working Ask phrasings” are neither listed nor given expected pre-change selections. Name the fixed prompt corpus and its expected domain, dimensions, filters, and period so the before/after comparison can actually detect a selector regression.
    Disposition: cut C11 names a fixed four-question corpus with its expected domain, dimension, measure filter and period, probed before and after.

27. Unproven: C6/C7 do not jointly prove the comparison answer’s provenance excludes left-out plants.
    - A DUB+CHIR budget comparison must report CHIR as left out while its query, totals, drill context, and “How this was calculated” scope contain DUB only. Add that exact mixed-budget proof; naming CHIR in the explanatory copy must not make it appear as queried scope.
    Disposition: cut C6 adds the DUB+CHIR comparison proof: CHIR named as left out while the predicate, totals, drill context and provenance scope hold DUB only.

## Round 5

28. Contradiction: C11’s statement regression oracle requires an invalid `% > 100` measure filter.
    - The confirmed comparison spec permits comparisons only between money measures and explicitly refuses `%` as not comparable. The expected selection for “which statement lines are over budget” must be `Actual > Budget`; `%` is only the display/result oracle.
    Disposition: cut the statement corpus question now expects measure filter Actual > Budget; % stays only the result oracle.

## Round 6

29. Gap: an empty plant-picker submission is not defined.
    - The canonical `in` filter can currently contain `[]`, which is neither a chosen set nor valid SQL. Require at least one selected plant; keep the picker open with an accessible validation message and prove no query runs.
    Disposition: cut the client requires at least one plant (picker stays open with an announced "Choose at least one plant", nothing sent), and the server refuses an empty array as invalid; C2 proves both.

30. Gap: a direct edited selection can contain a known but ungranted plant.
    - C2 covers an ungranted name in a question and C9 covers a revoked saved set, but neither covers a tampered/direct `{ dimensionId: "plant", op: "in" }` filter. Revalidate every value against current grants at every ingress and refuse the whole selection—never intersect it down to a partial result.
    Disposition: cut every plant value is checked against current grants at every ingress; a known ungranted plant refuses the whole selection as plant-not-granted with no read, never intersected; C2 proves it for an edited selection.

## Round 7

31. Gap: composite row keys are not defined at the response/table boundary.
    - `ResultTable` exposes separate `gl_code`/`plant` or `leaf_key`/`plant` cells, while existing labels and drill metadata are keyed by one raw dimension value. Define the shared composite-key derivation and require `rowLabels`, `budgetStates`, and `drill.rows` to use it, so the same GL or leaf in DUB and CHIR cannot receive the other row’s name, budget state, or drill link.
    - Unproven: C7/C8 need a two-plant same-GL/leaf case that proves metadata and clicks remain associated with their own row.
    Disposition: cut one shared row-key function (unsplit cell, or `<code>|<plant>` for a breakdown) keys rowLabels, budgetStates and drill.rows on both sides; C8 adds the same-GL and same-line DUB and CHIR proof.

## Round 8

No findings.

## Round 9

32. Unproven: C8: the allowed `month` and `gl_code × month` shapes have no row-key leaves.
   C3 permits every GL-code combination, but C8 omits these two shapes. They are inert for names and drills, yet still need unique keys for row metadata such as budget state.
   Disposition: cut C8's row-key leaves now include `month` alone and `gl_code × month`.

33. Gap: normalized plant aliases can become ambiguous.
   Matching ignores case and repeated whitespace, while the mapping master’s uniqueness guarantee is only for raw aliases. Require master-load validation to reject aliases that collide after normalization, before any resolver, model, or warehouse path uses them, and prove it with a leaf.
   Disposition: cut loading the mapping master rejects aliases that collide after normalisation; C2 proves it.

34. Gap: a reader with zero current plant grants has no defined outcome.
   They cannot receive a singleton filter, and the picker’s required non-empty choice would offer an invalid empty “All plants” set. Define the typed refusal, user copy, audit/provider/read behavior, and a leaf proving it.
   Disposition: cut a reader with no plant is refused as `no-plants-granted` with stated copy, audited, no provider call and no read; C2 proves it.

35. Gap: not every typed plant-refusal reason has defined client copy and payload semantics.
   The document gives copy for ungranted plants and revoked saved views, but not `plant-filter-invalid` or a revoked continuation. An unknown or malformed filter also cannot supply the promised display-name `plants` list. Pin the exact message and whether that list is empty or omitted for each reason, with client leaves.
   Disposition: cut the Refusals table pins each reason's trigger, `plants` payload (`[]` for invalid and no-plants) and copy; client leaves render each.

36. Contradiction: revoked saved-view and pin handling is not reconciled with the existing non-runnable-card path.
   Those surfaces currently preflight access and disable reopening, while the spec requires every plant refusal—including saved and pinned re-runs—to be a typed Ask answer. Specify one path, including whether the card remains openable to receive the Ask refusal, and prove C9 through that path.
   Disposition: cut saved views and pins use the existing non-runnable card path with a new `plants_revoked` status reason; a direct re-run gets the Ask refusal; C9 proves both.

37. Gap: alias handling for a directly submitted plant filter is unspecified.
   Filters must be canonical, but canonicalisation is required at every ingress and alias resolution is only explicitly defined for plant names in a question. State whether edited, saved, pinned, and continuation filters containing `dub`, `DUB-NUR`, or a display name are normalized or refused, then prove the chosen rule.
   Disposition: cut a submitted filter value must already be canonical, compared exactly; aliases are refused as `plant-filter-invalid`, resolution applies only to question text; C2 proves it at each ingress.

## Round 10

38. Contradiction: zero-grant and named-ungranted questions have no refusal precedence.
   A zero-grant reader asking for CHIR qualifies for both `no-plants-granted` and the pre-selector `plant-not-granted` rule. Specify the first-match order and prove it with a no-provider, no-read leaf.
   Disposition: cut checks run in a fixed first-match order starting with `no-plants-granted`; C2 proves a zero-grant reader naming CHIR gets it with no provider call and no read.

39. Contradiction: `plants-revoked` has two copies but only one typed discriminator.
   The refusal payload contains only `{ reason, plants }`, while continuations and saved/pinned re-runs require different wording. Split the reason or add a typed context field, then prove both client renderings.
   Disposition: cut the continuation case is its own reason, `choice-plants-revoked`, with its own copy; C2 proves it.

40. Gap: `budgetStates` does not define each aggregate row’s plant membership.
   `plantsInRow` could mean every selected/query plant or only plants contributing transactions; that changes whether a DUB+CHIR row is loaded or partial when one plant has zero activity. Pin canonical, sorted collection values and the membership rule, with a zero-activity mixed-row leaf.
   Disposition: cut `plantsInRow` is the row's plants within the answer's plant set (every chosen plant for a summed row, activity or not), canonical and sorted; C6 adds the zero-activity mixed-row leaf.

41. Trap: typed refusal delivery: C2/C10’s saved and pin creation ingress.
   A tampered save or pin request is not an Ask request, but C2 requires it to refuse `plant-filter-invalid` and C10 requires typed refusal reasons. Define its response envelope and client rendering so the global exception filter cannot replace the specified copy, and prove it separately from an Ask re-run.
   Disposition: cut save and pin requests reject a bad plant filter with HTTP 400 through the filter's existing typed path (as measure filters do): `userMessage` from the reason, `details.reason` set; C2 proves it separately from an Ask re-run.

## Round 11

42. Contradiction: the special revoked reasons are unreachable under the stated refusal order.
   A revoked continuation, saved view, or pin contains a known plant the reader no longer holds, so `plant-not-granted` fires before either revoked reason. The generic selection request also carries no origin identifying a picker continuation or saved/pinned rerun. Define an origin carrier and precedence that reaches the two revoked reasons, with leaves for both paths.
   Disposition: cut origin decides the wording: `reportGrounding.reportId` marks a saved or pinned re-run, a new `AskRequest.choiceOrigin` marks a continuation; check 3 picks the revoked reason by origin, else plant-not-granted; C2 proves all three.

43. Gap: the new serialized reason values do not fit the existing shared contract surfaces.
   `AskResponse.refusal`, HTTP `error.details.reason`, and list status need typed unions; today the error reason admits only measure-filter reasons, while saved/pin status and Swagger admit only `grant_revoked` and `definition_unregistered`. Pin the contract, schemas, and Swagger updates for `plant-filter-invalid`, `plant-not-granted`, both revoked reasons, and `plants_revoked`, with round-trip leaves.
   Disposition: cut the spec lists every new union value across `refusal.reason`, `leftOut.reason`, `choiceOrigin`, `error.details.reason` and the saved and pin status reason, with schemas and Swagger; C2 adds round-trip leaves.

44. Gap: the no-loaded-budget comparison response is not classified or scoped.
   It performs no read yet must name every selected plant as left out. Specify its response class and whether it carries selection, provenance, plant coverage, or budget metadata; distinguish the explanatory left-out list from C7’s prohibited informational plant readout, and prove the all-not-loaded case.
   Disposition: cut the no-budget comparison is Informational with a typed `leftOut` and stated copy, and no table, provenance, plant readout, budget states or drill; `leftOut` is separate from the plant readout; C7 proves it.

## Round 12

45. Contradiction: `reportGrounding.reportId` does not identify saved-view or pin reruns.
   It identifies a docked MIS report; saved and pinned cards reopen through the generic `selection` Ask path and deliberately send no report grounding. Using it would both fail to reach `plants-revoked` for a stale card and misclassify a docked report request. Add a saved/pin origin carrier or use the generic reason, with leaves for each source.
   Disposition: cut a new `AskRequest.origin` (plant-choice, period-choice, saved-view, pin) set by the client carries the source; `reportGrounding` is not an origin; C2 proves each source and the no-origin case.

46. Gap: `leftOut` presence for a comparison with no omitted plants is unspecified.
   The behaviour says every budget comparison carries and renders `leftOut`, which would add an empty “Left out” message to DUB-only comparisons that must remain unchanged. Define omission versus an empty payload and prove the DUB-only case renders no left-out copy.
   Disposition: cut `leftOut` is omitted when no plant was left out; C7 proves a DUB-only comparison renders no left-out copy.

47. Gap: the no-budget informational statement response leaves “View in report” undefined.
   `viewInReport` is a required response field, while C8 permits it for a single-plant statement answer; a CHIR-only over-budget statement question has no result or provenance. Specify whether it is unavailable and its reason, then prove the no-budget path cannot offer an unrelated report link.
   Disposition: cut the no-budget answer's `viewInReport` is unavailable with the stated reason; C7 proves it for a statement question.

## Round 13

No findings.

## Round 14

48. Gap: “loaded budget” is not defined for the selected period.
   The confirmed statement spec treats a missing active budget batch for a period as not-loaded, including for DUB. Define the period/window rule for `loaded`, `partial`, comparison exclusion, and an all-not-loaded DUB period; C6 needs a leaf for it.
   Disposition: cut a row's budget is loaded only when the owner has an active budget batch for every month the row covers; a missing month makes DUB not loaded; C6 adds the range and all-not-loaded DUB period leaves.

49. Gap: the cross-plant composed relation’s grain is not pinned.
   Actuals must retain canonical plant through the GL and statement relations, and the DUB budget must be associated only with DUB before any multi-plant aggregation. Otherwise a DUB+CHIR actual can join one DUB budget on GL/month and falsely appear loaded. Require a plant-grain relation before aggregation and prove no budget or provenance crosses plants.
   Disposition: cut actual and budget join at the plant, GL (or line) and month grain before any cross-plant aggregation, the budget carrying its owner plant; C6 proves no budget or provenance crosses plants.

50. Contradiction: budget-state requirements assume Budget and % columns that an Actual-only selection need not contain.
   Success question 4 asks only for Actual yet requires Budget and % cells, while Ask selections can contain only the requested Actual measure. Specify whether financial answers always add Budget and % or restrict `budgetStates` and the column rules to selected measures; prove the chosen behavior.
   Disposition: cut the budget rules apply only to shown measures; an Actual-only answer has no Budget or % column and no budgetStates; success question 4 now asks for Actual and Budget.

51. Contradiction: short-code matching conflicts with case-insensitive plant resolution.
   The resolver is case-insensitive for canonical codes, but codes under three characters match only as uppercase tokens. Define the outcome for `CK` versus `ck` (including ungranted access checks) and add it to C2’s normalization proof.
   Disposition: cut short codes match only as an exact upper-case token ("CK" names CK, "ck" names nothing) for granted and ungranted alike; C2 proves it.

## Round 15

52. Gap: the selected-measure rule still cannot produce success question 4’s required `%` column.
   “Actual and Budget” need not select Percentage, yet the oracle requires a null `%` cell. Specify whether selecting Budget automatically includes `%`, or change the question/oracle; cover Actual-only, Actual+Budget, %-only, and all-three measure sets.
   Disposition: cut no measure is added; the dash applies to a shown Budget column and the % cell to a shown % column; question 4 now asks for Actual, Budget and %; C6 covers the four measure sets.

53. Gap: budget comparisons are undefined for a partially budgeted time range.
   Budget availability is now per row/month, but comparison filtering and `leftOut.plants` are plant-only. Define whether a DUB April–July comparison excludes DUB entirely when one month lacks a batch or reads only budgeted months, and how the omitted month is explained; add a C6 leaf.
   Disposition: cut a comparison compares a plant only when its budget is loaded for every month of the window, otherwise it is left out whole and named; C6 adds the April–July leaf.

54. Gap: “every month of the answer’s window” is undefined for a governed answer with no time window.
   Such answers are permitted and cover all loaded data. Define the month set used to decide loaded/partial/not-loaded without a window, including an actual month with no budget batch, and prove it.
   Disposition: cut an answer with no window takes its months from the Actual it read; C6 adds the leaf.

55. Unproven: C11’s live regression corpus does not record expected `measureIds`.
   The no-filter “Actual by GL code” probe could regress to Budget or Percentage while retaining the stated domain, dimensions, filter, and period. Record and compare the complete expected measure set for every corpus prompt.
   Disposition: cut every corpus entry now records its full measure set (from the 2026-10-04 probe) and the re-probe compares measures too.

## Round 16

56. Gap: an unwindowed budget comparison has no defined pre-comparison month set.
   The answer window is defined from Actual “the query read,” but the comparison predicate must exclude unbudgeted plants before that query reads its final rows. Pin that it derives candidate Actual months before comparison filtering, then prove an unwindowed DUB comparison with one unbudgeted Actual month becomes the no-budget informational answer.
   Disposition: cut an unwindowed answer's months come from the active Actual load batches before the query runs, so comparison filtering has its month set first; C6 proves the unwindowed DUB comparison becomes the no-budget answer with no read.

## Round 17

57. Contradiction: the unwindowed no-budget path must read active Actual load batches before it can return an answer that promises “nothing is read.”
   Define permitted preflight metadata lookups versus prohibited figure reads, including their audit behavior, and make C6 prove that only the former occurs.
   Disposition: cut a new "What counts as a read" section separates figure reads (data query, totals, names, drill, transactions; audited) from metadata lookups (mapping master, grants, cached vocabulary, load-batch metadata; not audited as data reads), and every "no read" means no figure read; C6 proves the unwindowed no-budget answer runs only metadata lookups.

## Round 18

58. Gap: a budget-comparison response does not say whether its saved selection keeps left-out plants.
   A DUB+CHIR comparison executes only DUB, yet `AskResponse.selection` is what the client saves and re-runs. Pin that it preserves the requested DUB+CHIR snapshot while provenance, drill, and effective predicate use DUB; add a save/pin re-run leaf.
   Disposition: cut the response's `selection` keeps the requested plants for save and re-run, while the effective predicate, totals, provenance and drill use the compared plants; C6 adds the save and pin re-run leaf.

## Round 19

59. Contradiction: “a plant that gains [a budget] later” exceeds the PoC budget-owner rule.
   Only DUB can gain a newly active DUB budget batch in this scope; a CHIR budget requires decision 0034’s separate plant-keyed-budget story. Limit the re-run statement and C6 proof to DUB’s period batch becoming active.
   Disposition: cut the re-run statement now covers only DUB's missing budget batch becoming active (decision 0034), and C6's leaf proves that case.

## Round 20

60. Unproven: C11 does not pin ordinary dimension filters.
   The live corpus can retain its domain, measures, dimensions, comparison, and period while gaining a GL/month filter that changes the answer. Record `filters: []` for each corpus prompt and compare it after the change, except for the explicitly discarded selector plant filter on unnamed questions.
   Disposition: cut C11 now pins ordinary filters: before and after, each corpus answer may carry only a month equality filter on the asked month (the live model emits it on some runs, observed 2026-10-04) plus, after, the plant filter; any other filter fails the probe.

## Round 21

61. Contradiction: C11 permits a month equality filter although the selector contract requires every period to travel only in `timeWindow`.
   Treating an observed forbidden filter as acceptable bakes a model regression into the baseline and can alter a query; require it to be absent or normalised away in the live probe.
   Disposition: cut the probe normalises away only a month equality filter on exactly the selection's timeWindow month before comparing, and then requires ordinary filters `[]` (plus the plant filter after), so no other filter can pass.

## Round 22

62. Gap: C11 normalises away a raw month filter in the probe but does not require it to be removed or refused before an Ask selection executes.
   The selector explicitly forbids period values in filters, and such a filter can make a domain unanswerable. Pin the runtime handling and prove the raw live-model regression cannot reach the query.
   Disposition: cut the server now removes a month equality filter on exactly a single-month timeWindow's month before any Ask selection executes; C11a proves the query runs without it and returns the same rows.
