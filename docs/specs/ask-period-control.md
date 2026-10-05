---
slug: ask-period-control
title: Recoverable periods in Ask
status: draft
saved: 2026-10-05T07:39:23+00:00
---

# Recoverable periods in Ask

## Why

Live PoC testing asked a well-formed statement question with no period:

> Show the MIS statement Actual by statement leaf

and got a flat red failure: *"The answer does not resolve to one statement selector set and offered
period."* Measured 4/4 `not_supported`. Adding a period makes the same question work 6/6 with 81
rows, so the answer was one word away and the product said no instead of asking.

`ClarificationNeeded` exists for exactly this, is already rendered by the Ask panel as clickable
option buttons (`ask-panel.tsx:131-147`), and is already used elsewhere in the same method.

Four measurements decide the design. Three of them contradict the obvious implementation.

**Re-asking through the model is unreliable.** Today's clarify carries `options: string[]` and the
panel appends the chosen string to the question, which goes back through the selector. 4 samples each:

| re-asked question | result |
| --- | --- |
| `Show the MIS statement Actual by statement leaf (2026-07-01)` | success 2/4, informational 2/4 |
| `Show the MIS statement Actual by statement leaf (July 2026)` | success 3/4, informational 1/4 |

A period the user has explicitly clicked must never be re-guessed.

**The MIS Reports period list contains an option that cannot answer a statement Ask.** Its
`periods` include `FY 26-27 YTD`, a twelve-month range, while `statementPeriod` needs a single
period point. Measured: `... (FY 26-27 YTD)` is `not_supported` 4/4.

**A governed-financial answer can legitimately have no period at all.** `Show Actual by GL code`
sums every loaded month and its readback says so. Nothing may invent a period for such an answer.

**An answer that sets Actual against Budget cannot.** Amended 2026-10-05 after the multi-plant QA:
`Which GL codes had Actual over Budget?` with no period compared July's actuals (the only loaded
actual month) against the full year's budget (April to March) and returned 8 codes, against 21 for
July on its own; `Show Actual and Budget by GL code` showed budget 32,000,000 against July's
8,000,000 the same way. Each side is "all loaded data", but the two sides cover different months, so
the comparison reads as underspending. The owner chose that such a question asks for the period
rather than guess one.

**Three different failures share one dead end.** `chat.service.ts` returns `NotSupported` at
`:322` (no selector set or no period), `:331` (`SelectionPeriodUnavailableError` - the period is
not among the offered ones) and `:335` (no mapping configured). Only the first is a missing period,
and only some of that one is recoverable by the person asking.

## Behaviour

**A statement question whose period cannot be resolved asks instead of refusing**, and the offered
options are only periods that can actually answer it.

**The offered period reaches the warehouse as data, not as words.** Two distinct carriers, so a
recovery and a settled answer never share one field:

- A `ClarificationNeeded` response gains a typed **period choice**: the base `Selection` the
  selector already produced, the original question verbatim, and one entry per offered period
  carrying a COMPLETE `timeWindow` - `grain`, `column`, `from`, `to` - plus its `value` and `label`.
  A period-less base selection has no `timeWindow` and `Selection.timeWindow` requires a `grain`,
  so the option supplies the whole window and the client never invents a field.
- A successful data response gains a **period control** (`AskResponse.periodControl`): the same
  `options` entries, with `current` holding the `value` of the entry matching the window the answer
  ran on, or null with a `coverage` sentence when it ran on no window. It does not repeat the base
  selection or the question; the client uses the answer's own `selection` and the turn's question.

In both cases the client clones the base selection with the chosen window and posts it as
`AskRequest.selection`, which `chat.service.ts:146` runs verbatim, skipping the selector. Today's
`options: string[]` / `resumesQuestion` path is untouched for its existing users.

**An Actual-versus-Budget answer with no period asks for the period**, in the governed-financial
domain, with the same typed period choice. The trigger is mechanical, read from the selection after
the server has applied its plant set:

- its `measureIds` contain `governed-financial.actual` together with `governed-financial.budget`, or
  contain `governed-financial.percentage` (Actual as a percentage of Budget) with or without others; or
- a `measureFilters` entry compares one of those two measures against the other (Actual over Budget,
  Budget over Actual, either operator).

`governed-financial.budget` alone, `governed-financial.actual` alone, and a filter against a fixed
amount ("more than 5 lakh") do not trigger it and keep the all-loaded-data rule. A measure added later
that reads both Actual and Budget joins the first rule when it is added.

The plant choice comes first (`ask-multi-plant.md`), so nothing is read before either choice. The
offered periods come from the active actual batches restricted to the chosen plant set; other filters
do not narrow the list. They are each month with at least one actual row for those plants, newest
first, plus one "financial year to date" option running from 1 April of the financial year that
contains the newest such month (April to March, so January 2027 belongs to the year starting
1 April 2026) through the last day of that month. When that window is the same as a month option
(the newest month is April), the year-to-date option is left out, so no two options share a window
and the current option is always unique. Every option is a complete window and applies to
both sides of the comparison. A question that names a period answers directly.

When the selection filters Actual against Budget (the second trigger form), an option is offered only
if at least one chosen plant has a loaded budget for every month of its window, by the same rule
`ask-multi-plant.md` uses to leave plants out; a month or a year to date that no chosen plant can be
compared on is not offered. Side-by-side and percentage answers offer every month with actuals,
because they answer with "Budget not loaded" dashes rather than compare. The outcomes are checked in
this order, after the plant choice and before any figure is read:

1. The chosen plants have no month of actuals: `NotSupported`, "No actuals are loaded for the chosen
   plants, so there is nothing to compare against Budget.", no period offered.
2. A comparison filter, and no offered window remains: the multi-plant spec's Informational
   no-budget answer ("Budget is not loaded for any chosen plant, so nothing was compared."), no period
   offered.
3. Otherwise the period choice.

**Every successful data answer shows its period under the title**, beside the plants it covers, as
exact dates: "1 Jul 2026 – 31 Jul 2026" for July, "1 Apr 2026 – 31 Aug 2026" for a year to date. The
dates are the window the answer ran on (`appliedTimeWindow`), so changing the period updates the line.
An answer with no window shows, in the same place, its coverage sentence (the "all loaded data
within the asker's access scope and any filters the question applied" wording below, carried in
`periodControl.coverage`), rendered once there and not repeated lower down. The over- and under-budget
readout no longer repeats the period, since the line above now carries it.

**Scope problems explain rather than offer.** A reader who holds no plant gets the plain refusal
`ask-multi-plant.md` specifies, with no period options. Amended 2026-10-05: department and function
were once checked here, but a statement now resolves its mapping from the chosen plant set, so they
never produce a refusal.

**Failure precedence is fixed and total**, because four different causes currently collapse into one
`undefined`. In order, first match wins:

1. Scope - the reader holds no plant. Refused as `ask-multi-plant.md` specifies, with no period
   options. Amended 2026-10-05: several granted plants are resolved by the plant choice, and a
   statement's mapping resolves from the chosen plant set, so department and function scope are no
   longer checked here and never block a statement.
2. No mapping configured for the resolved triple. `NotSupported`, its own message. The resolver
   already checks mapping before period availability and that order is kept.
3. No periods loaded at all. `NotSupported`, its own message, distinct from a missing period.
4. Period missing, not among the offered periods, or spanning more than one of them.
   `ClarificationNeeded` with the period choice above.

**Every successful data answer that ran on a window shows that period and lets the user change
it**, in both domains. An answer that ran on no window shows its coverage sentence and offers no
switch, as today; asking again with a period gives one. A statement answer offers the loaded months. A governed-financial answer offers the same
months plus the window it actually ran on, marked current. An answer that resolved to no window
states that it covers **all loaded data within the asker's access scope and any filters the question
applied** - governed queries inject the user's plant scope at `sqlBuilder.ts:88`, so "all loaded
data" alone would overclaim. Informational, clarification and failure responses carry no period
control; a clarification's period choice is the recovery, not a control.

**Changing the period replaces that answer in place** rather than appending a turn, and goes through
the same deterministic path. **The asked question is never rewritten.** If someone asks "for July
2026" and switches to August, their words stay exactly as typed and the answer carries the period it
is now showing, so the transcript records what they asked plus the period they chose rather than a
question they never typed. While a replacement is in flight the answer shows a pending state and
stays readable; if it fails or access has been revoked, the previous answer remains and the failure
is shown against it rather than blanking it.

**A re-run is a fresh governed query, not a snapshot.** It re-authorizes, audits and reads the
currently active batches, so under decision 0028 an identical choice may legitimately return
different values after a reload; the response carries the batch ids that produced what is on screen, every active batch the query
read, in `provenance.activeBatchIds`.

## Acceptance criteria

1. A statement question whose period is missing, not among the offered periods, or spanning more
   than one of them returns `ClarificationNeeded` naming the missing part, never `NotSupported`.
2. The clarification carries a typed period choice - base selection, the original question, and one
   entry per period with a complete timeWindow (grain, column, from, to), value and label - and its
   entries contain only periods that can answer that question, never one guaranteed to fail such as
   a multi-month range for a statement.
3. Choosing an offered period issues exactly zero selector calls, proven by a hermetic test that
   counts calls on a fake provider: one for the original question, none for the continuation.
4. The four failure causes resolve in the fixed order scope, no mapping, no periods loaded, period -
   each with its own response class and message, and a scope failure (no granted plant) offers no
   periods.
5. A successful data answer in either domain that ran on a window carries a period control whose
   current entry is that window; choosing another replaces that answer in place, the replacement's
   control shows the new period, and the asked question is unchanged.
6. A successful answer that resolved to no window states that it covers all loaded data within the
   asker's access scope and any filters the question applied; informational, clarification and
   failure responses carry no period control.
7. A replacement in flight leaves the previous answer readable under a pending state, and a
   replacement that fails or is refused leaves the previous answer in place with the failure shown
   against it.
8. A re-run's response carries the active batch ids that produced the displayed values, and the
   determinism claim is about selector calls, not about values being stable across reloads.
9. Hermetic tests over a fake provider and warehouse cover the whole matrix, not a sample of it:
   missing period; a same-day period that is not offered; a partial-month range; a multi-month
   range; an empty period list; no granted plant; no
   mapping; a successful statement answer; a successful governed answer with a window; a successful
   governed answer with no window; a failed replacement; and a replacement refused for revoked
  access, proven in the Ask panel to leave the previous answer readable, clear the pending state,
  show the refusal against that answer and keep the question as typed. Any claim made against the live PoC
   additionally names its sample count and no live claim rests on a single run.
10. A governed-financial Ask question that shows Actual and Budget together, or filters one against
    the other (the trigger above, one leaf per trigger form), and names no period returns
    `ClarificationNeeded` with a period choice after any plant choice, reads no figure before the
    choice, and offers each month with actuals for the chosen plants, newest first, plus the
    financial year to date through the newest of them; choosing an option answers with no selector
    call; chosen plants with no month of actuals get the `NotSupported` message above; and a
    comparison filter offers only windows a chosen plant has budget for, with leaves for a month that
    has actuals but no budget batch (not offered for a comparison filter, offered for side by side),
    a year to date containing a month with no budget batch (not offered for a comparison filter),
    no comparable window (the no-budget answer), and April as the newest month (no year-to-date
    option).
11. The same question naming a period answers directly; a question showing only Actual or only
    Budget with no period still answers over all loaded data; and over-budget for July 2026 on DUB
    after choosing July is unchanged: 21 codes, with 50001201 at 83,98,339.
12. Every successful data answer shows its period under the title as exact from and to dates of the
    window it ran on, or with no window the single coverage sentence of criterion 6; switching the period updates the line;
    and the over- or under-budget readout does not repeat it.

## Success measure

- Metric: of three no-period questions asked by the seeded DUB reader on the July data, each in a
  fresh conversation and each asked 4 times against the live model, how many runs show the period
  choice and, after choosing July 2026, the expected answer: "Which GL codes had Actual over
  Budget?" (21 codes, 50001201 at 83,98,339), "Show Actual and Budget by GL code" (Budget for July
  only) and "Which GL codes are under budget?" (July on both sides), each answer showing
  "1 Jul 2026 – 31 Jul 2026" under its title.
- Baseline: 0 of 12 on 2026-10-05; each answered at once with the full-year budget against July's
  actuals (8 codes for the first question).
- Target: 12 of 12, and "Show Actual by GL code" with no period still answers at once 4 of 4.
- Check date: 2026-10-12

## Out of scope

- Changing which periods the warehouse offers, or the FY-YTD definition.
- Letting a user choose among several granted plants, departments or functions - a new authorized
  selector capability that no current data exercises.
- Rendering the measure and dimension chips, or making them editable.
- Showing batch ids in the Ask panel's "How this was calculated" disclosure. They travel in the
  response and criterion 8 checks them there; the disclosure currently renders only readback,
  measures, scope and freshness, and widening it is a separate gap.
- Saved views and pins saved with no period before the 2026-10-05 amendment keep running as saved;
  answers saved after it carry the period the person chose.
- `requiredTimeWindowClarify`'s day-range options, which are wrong for a monthly statement but
  belong to a different gate.
