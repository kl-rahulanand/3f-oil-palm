---
slug: ask-reopen-saved-report
title: Reopening a saved report returns to its answer
status: confirmed
saved: 2026-09-15T13:41:40+00:00
---

# Reopening a saved report returns to its answer

## Why

Opening a pinned report from the Dashboard appends a brand-new turn to the Ask thread every
time, even when that exact report is already answered further up, and the panel does not move.
Open the same pin five times and you get five identical answers; open it once on a long thread
and it looks like nothing happened, because the answer lands below the fold.

Both halves are visible in the code. `pinned-reports.tsx:67` calls `rerun(...)`, which is
`run(question, selection)` (`use-ask.ts:147`), and `use-ask.ts:86` appends unconditionally:

```ts
setTurns((current) => [...current, { id: ..., question: trimmed, response }]);
```

Nothing looks for an existing turn. And `grep` for `scrollIntoView` or `scrollTo` across
`ask-panel.tsx` returns **nothing** - there is no scroll logic in the panel at all.

`saved-views.tsx:64` does the identical thing, so this is not a pins-only defect.

**The obvious fix is wrong.** Matching an existing turn by its question text would collapse
unrelated reports into one, because the text is not the question - it is
`selectionLabel(selection).title`, which is only the measure names joined:

```ts
title: measures.join(" · ")
```

A pin of Actual and Budget by GL code for July and a pin of Actual and Budget by month are both
titled `Actual · Budget`. Identity has to come from the **selection**, never the title.

The machinery to do this correctly already shipped. `continueTurn(turnId, question, selection)`
(`use-ask.ts:97`) marks only its own turn pending, keeps the previous answer visible while it
runs, attaches a typed refusal or a transport failure to that turn, and replaces **only** on
success. It was built for the period control and is proven by six hermetic leaves.

## Behaviour

**Reopening a report that is already in the thread re-runs that turn in place.** The existing turn
is found by comparing the stored `Selection`, never the displayed title.

- **Candidates** are turns whose response was a `success` and which carry a `response.selection`.
  Nothing else can be a match, because nothing else holds a selection to compare.
- **Comparison is structural** over the resolved `Selection` the server returned - domain,
  measureIds, dimensionIds, filters, timeWindow and limit - in the order the server produced it.
  Comparing what the server resolved, rather than what the pin stored, is what makes a pin saved
  before a period was normalised still match its own answer.
- **When several turns match** - the user asked the same thing twice by hand - the **most recent**
  one wins, so reopening always lands on the freshest.

**The re-run sends `turn.question`, not the pin's label.** The existing paths pass
`selectionLabel(selection).title`, which is only the measure names; auditing `Actual · Budget`
while displaying the user's real wording would put a question in the record that nobody asked.
A **new** turn still uses the label, because there is no better text available.

**Clicking Open navigates to Ask FIRST, then runs** (human round). Today both entry points await
the whole re-run before `router.push("/ask")`, so the user waits on the Dashboard with no feedback
and only then jumps - and the pending state and the scroll can never be seen, because there is no
Ask panel on screen while it runs. Navigating first means the click always has an instant visible
effect: the thread appears, the target turn is scrolled into view, and it shows itself working.

**Either way the panel scrolls that turn into view**, reused or new.

**A refused reopen clears the stale answer; a transport failure keeps it** (human round). These
are different situations and must not share one outcome:

- An **authorization or policy refusal** - `blocked_by_policy`, or any response whose selection is
  no longer runnable - **clears the result** and shows why. Decision **0028** requires a revoked
  grant to produce a refusal rather than a cached figure, and today `continueTurn` keeps the old
  answer visible under the failure line, so a revoked user goes on reading numbers they may no
  longer see.
- A **transport failure or timeout** keeps the previous answer, because nothing has said the user
  may not see it.

This **changes `continueTurn`'s failure handling**, which an earlier draft of this spec wrongly
placed out of scope. Its copy is also period-specific today - *"That period could not be loaded.
Choose a period to try again."* - which is wrong for a saved report and must become a message that
fits the reason.

**Pins and saved views behave identically**, because both call the same path today and both have
the same defect.

## Acceptance criteria

1. Opening a saved report whose resolved `Selection` already has a **successful** turn re-runs
   **that** turn through the continuation seam and appends nothing; the thread length is unchanged.
2. Turn identity is the `Selection`, never the displayed title. A test opens two reports that share
   a `selectionLabel().title` but differ in dimensions or filters and asserts two distinct turns.
3. When several successful turns carry the same selection, the **most recent** is the one re-run.
4. A matched turn re-runs with **`turn.question`**; the request body is asserted, not inferred. A
   new turn uses the label.
5. Opening a report that is not in the thread appends exactly one turn.
6. Clicking Open navigates to Ask **before** the request completes, and the target turn is scrolled
   into view and shown pending.
7. A reopen refused for **authorization or policy** clears the stale result and shows the reason;
   the thread length is unchanged. A **transport** failure keeps the previous answer. The two are
   proven by separate leaves, and neither shows period-specific copy.
8. Pins and saved views are both covered; a leaf set exercising only one leaves the other unproven.
9. Every criterion is proven by hermetic tests judged by the vitest discriminator - the testcase
   present AND NOT skipped AND NOT failed - because a matching name proves nothing for vitest.

## Out of scope

- Scrolling behaviour for ordinary typed questions.
- Deduplicating turns the user created by asking the same thing twice by hand.
- `continueTurn`'s **pending** and **replacement-on-success** semantics, which stay exactly as
  shipped. Its **failure** handling changes, per the refusal rule above.
- The brief's already-answered ledger cites accepted decisions **0035** and **0036**; the active
  corpus ends at **0029**, and it calls `ask-period-control` unplanned although the roadmap records
  it done. Stale assertions, corrected here rather than treated as constraints.
