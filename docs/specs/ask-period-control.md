---
slug: ask-period-control
title: Recoverable periods in Ask
status: confirmed
saved: 2026-09-15T06:02:46+00:00
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

**A governed-financial answer can legitimately have no period at all.** `Show Actual and Budget by
GL code` succeeds 4/4 with **no time window**, summing every loaded month (budget 32,000,000
against July's 8,000,000); its readback carries no period clause. Nothing may invent a period for
such an answer.

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
- A successful data response gains a **period control**: the same shape, with the entry matching
  the window the answer actually ran on marked as current.

In both cases the client clones the base selection with the chosen window and posts it as
`AskRequest.selection`, which `chat.service.ts:146` runs verbatim, skipping the selector. Today's
`options: string[]` / `resumesQuestion` path is untouched for its existing users.

**Scope problems explain rather than offer.** `statementRequest` cannot distinguish "no department"
from "several departments", and department and function are provisioned scope attributes, not
selectable semantic dimensions. Both cases return a plain message naming the attribute and saying
an administrator must set it.

**Failure precedence is fixed and total**, because four different causes currently collapse into one
`undefined`. In order, first match wins:

1. Scope - any of department, function, plant absent or ambiguous. `BlockedByPolicy`, naming the
   first offending attribute in that order, with no period options.
2. No mapping configured for the resolved triple. `NotSupported`, its own message. The resolver
   already checks mapping before period availability and that order is kept.
3. No periods loaded at all. `NotSupported`, its own message, distinct from a missing period.
4. Period missing, not among the offered periods, or spanning more than one of them.
   `ClarificationNeeded` with the period choice above.

**Every successful data answer shows the period it ran on and lets the user change it**, in both
domains. A statement answer offers the loaded months. A governed-financial answer offers the same
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
different values after a reload; the response carries the batch ids that produced what is on screen.

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
   each with its own response class and message, and a scope failure names the first offending
   attribute and offers no periods.
5. A successful data answer in either domain carries a period control whose current entry is the
   window the answer ran on; choosing another replaces that answer in place, the replacement's
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
   range; an empty period list; each of department, function and plant absent and ambiguous; no
   mapping; a successful statement answer; a successful governed answer with a window; a successful
   governed answer with no window; and a failed replacement. Any claim made against the live PoC
   additionally names its sample count and no live claim rests on a single run.

## Out of scope

- Changing which periods the warehouse offers, or the FY-YTD definition.
- Letting a user choose among several granted plants, departments or functions - a new authorized
  selector capability that no current data exercises.
- Rendering the measure and dimension chips, or making them editable.
- Showing batch ids in the Ask panel's "How this was calculated" disclosure. They travel in the
  response and criterion 8 checks them there; the disclosure currently renders only readback,
  measures, scope and freshness, and widening it is a separate gap.
- `requiredTimeWindowClarify`'s day-range options, which are wrong for a monthly statement but
  belong to a different gate.
