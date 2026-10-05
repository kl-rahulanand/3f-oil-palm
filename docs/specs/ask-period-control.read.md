---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-05T08:22:05+00:00
read_hash: 1f340c34d803e87830715e81505b7e75e93e1a01
round: 10
passed: yes
doc_seen: 1f340c34d803e87830715e81505b7e75e93e1a01
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: ff0001f15023cc6753d1e23f25c56f95e31ba8c3
---
# Cold read notes

Written by `forge read`. Under every finding, write one disposition line, amend the doc, then run
`forge read <doc>` again for the next round, until a round finds nothing:

- `Disposition: cut` when the doc was edited to remove it;
- `Disposition: defer` when the item moved to the spec's Out of scope;
- `Disposition: keep <one-line reason>` otherwise.

Only a genuine trade-off goes to the human, as a question with options.

## Round 1

1. Contradiction: ambiguous plant scope both blocks and prompts for a choice.
   The precedence rules require `BlockedByPolicy` for an ambiguous plant with no options, while the governed-comparison behaviour and acceptance item 10 require the plant choice first. Decide which wins; the same conflict exists for department/function, which current statement resolution derives from the mapping master rather than user scope.
   Disposition: keep plant now resolves before the precedence list per ask-multi-plant; precedence item 1 amended to department and function only.

2. Gap: the governed-comparison trigger is not mechanically defined.
   “Actual and Budget together” must say whether `percentage` alone, a future variance measure, and each measure-filter form trigger clarification. Without an exact selection-level rule over measure IDs and measure-filter operands, builders cannot distinguish a comparison from a Budget-only answer reliably.
   Disposition: keep the trigger is now an exact rule over measureIds and measureFilters, with the non-triggering cases named.

3. Gap: “months with loaded actuals” is not scoped tightly enough to guarantee offered choices can answer.
   Specify whether the list is limited to active actual batches that have rows for the selected, authorized plant set and filters; how the April financial year is derived when months cross calendar years; and the exact response class/message when no such month exists. “The existing no-budget or no-data answer stands” does not identify which outcome applies.
   Disposition: keep options now come from active actual batches for the chosen plant set, the April financial year is defined, and the no-actuals outcome has its class and message.

4. Gap: the response contract is ambiguous for the successful period control and batch provenance.
   “The same shape” could mean the control repeats `selection` and `question`, or relies on the successful response’s `selection` and the turn’s question; “marked as current” likewise needs a concrete field. Name the exact response path for the batch IDs (for example, provenance) and whether it contains every contributing active batch.
   Disposition: keep the period control now names AskResponse.periodControl current/coverage and the batch ids path provenance.activeBatchIds.

5. Unproven: item 7: access revocation during a period replacement.
   The test matrix names only a failed replacement. It needs a frontend-facing proof that an authorization refusal leaves the prior answer readable, clears pending state, and renders the refusal against that answer without rewriting the question.
   Disposition: keep criterion 9 now names the revoked-access replacement proof in the Ask panel (existing leaf: use-ask.test.tsx a refused period switch still retains the previous answer).

## Round 2

6. Disputed keep 1: department and function scope still conflict with the confirmed multi-plant behaviour.
   `ask-multi-plant.md` makes the selected plant set authoritative and resolves statement mappings from it; the current Ask-period tests likewise show absent or ambiguous legacy department/function scope does not block a statement. Retaining them as `BlockedByPolicy` failures makes criteria 4 and 9 contradict that confirmed behaviour.
   Disposition: cut department and function scope removed from precedence item 1 and criteria 4 and 9; scope is now only no granted plant.

7. Contradiction: the no-window period readout has two incompatible required copies.
   The new behaviour and criterion 12 require “All loaded data,” while the retained behaviour and criterion 6 require “all loaded data within the asker's access scope and any filters the question applied.” Specify one rendered line—preferably the latter—so the title readout and `periodControl.coverage` cannot diverge.
   Disposition: cut the title line now shows the single coverage sentence from periodControl.coverage, rendered once.

8. Gap: governed comparison options are based on Actual availability alone although a comparison also requires matching Budget coverage.
   The confirmed multi-plant spec excludes plants lacking Budget for every month of the answer window and returns its informational no-Budget outcome when none remain. The new rule can offer an Actual month or FYTD window with no usable Budget, making a clicked “comparison” unable to compare. Define whether options require at least one chosen plant with Budget for the complete window, the precedence between no-Actual and no-Budget, and hermetic leaves for an Actual-only month and a FYTD window containing an unloaded Budget month.
   Disposition: keep comparison-filter options now require a chosen plant with budget for the whole window, precedence no-actuals then no-budget is defined, and the leaves are named.

## Round 3

9. Contradiction: the retained “Scope problems explain rather than offer” paragraph still requires department/function refusals.
   The amended precedence now correctly says department and function are never checked or block a statement. Remove or revise the earlier paragraph; otherwise the behaviour still demands mutually exclusive outcomes.
   Disposition: cut the scope paragraph now names only the no-plant refusal; department and function never refuse.

10. Gap: a one-month financial-year-to-date window duplicates its month option.
   If April is the newest—or only—loaded actual month, April and FYTD have the same `timeWindow`. Then the control cannot uniquely identify which matching option is `current`. Specify whether FYTD is omitted when identical to a month, or give an explicit current-selection rule and a test.
   Disposition: keep the year-to-date option is left out when it equals a month option, with a leaf for April as the newest month.

## Round 4

11. Contradiction: an answer with no window must both let the user change period and expose no selectable control.
   `AskPeriodControl.current = null` renders only `coverage` in the Ask panel, so “Show Actual by GL code” cannot switch to an offered month. Either limit period switching to answers that already ran on a window, or define a no-window selector state and add a leaf proving its continuation skips the selector.
   Disposition: cut switching is now limited to answers that ran on a window; a no-window answer shows its coverage sentence and no switch, as shipped.

## Round 5

No findings.

## Round 6

12. Disputed keep 1: the Out of scope list still excludes choosing among several granted plants.
   The behaviour requires plant choice first, and confirmed `ask-multi-plant.md` explicitly reopens and governs that choice. Remove or narrow this stale exclusion.
   Disposition: cut the out-of-scope item now covers only departments and functions and points plant choice to ask-multi-plant.

13. Gap: a statement’s outcome is undefined when its chosen plants have no actual rows but other plants do.
   Its offered list must be empty to avoid unusable choices, yet “no periods loaded at all” could mean globally or for the selected plant set. Define the response class/message and add a hermetic leaf where another granted/warehouse plant has actuals but the chosen statement plant has none.
   Disposition: keep statement periods are the loaded statement periods for every plant set; a plant with no rows answers at ₹0; criterion 9 names the leaf.

## Round 7

14. Unproven: item 10 does not explicitly require a percentage-only trigger leaf.
   `governed-financial.percentage` without both explicit measures must clarify, and still offer an Actual month with no Budget as a dashed percentage answer. “One leaf per trigger form” can otherwise be satisfied by side-by-side and filter cases alone.
   Disposition: keep criterion 10 now names a percentage-alone leaf, including an Actual month with no budget offered and answered with not-loaded cells.

15. Cut or defer: the rule for a future measure that reads both Actual and Budget.
   No such measure, metadata flag, or acceptance case exists. Add it when that measure is introduced; the current three governed measures fully cover this change.
   Disposition: cut the future-measure sentence is removed.

## Round 8

16. Unproven: items 10–11 lack a leaf for the stated fixed-amount non-trigger.
   Require an Actual-only or Budget-only fixed-amount filter with no period to answer over all loaded data and offer no period choice; otherwise a generic “mentions Budget” implementation can wrongly clarify.
   Disposition: keep criterion 11 now names leaves for Actual alone, Budget alone and an Actual-only fixed-amount filter, none offering a period choice.

## Round 9

17. Disputed keep 16: the fixed-amount leaf covers Actual only, not Budget.
   The behaviour says any fixed-amount filter does not trigger clarification. Add `Budget > ₹5 lakh` without a period, proving it remains an all-loaded-data answer with no period choice.
   Disposition: keep criterion 11 now also names a Budget-only fixed-amount leaf.

## Round 10

No findings.
