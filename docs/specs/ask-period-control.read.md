---
reader: codex (gpt-5.6-terra)
read_at: 2026-10-05T07:47:45+00:00
read_hash: 189a0255d695a08560e325a621c91a9553e0dbed
round: 5
passed: yes
doc_seen: 189a0255d695a08560e325a621c91a9553e0dbed
spec_seen: e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
notes_seen: e3a66737499b2e1b5740d907e0df692c157a57f3
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
