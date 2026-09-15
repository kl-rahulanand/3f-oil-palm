---
slug: ask-reopen-saved-report
title: Reopening a saved report returns to its answer
status: confirmed
saved: 2026-09-15T15:56:52+00:00
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
- **Comparison is strict structural equality** over domain, measureIds, dimensionIds, filters,
  timeWindow and limit, including optional fields and array order.
  **Correcting this spec's first draft:** it claimed a pin saved before a period was normalised
  would still match its own answer. It will not, and cannot - the client holds only
  `pin.selection` and a turn's `response.selection`, so a pin with no `timeWindow` is simply not
  equal to a turn that has one, and ignoring the window to force a match would match the WRONG
  period. Such a pin opens as a new turn and gets a fresh resolved selection. That is the honest
  behaviour, not a gap.
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

**A refused reopen clears the stale answer; a transport failure keeps it** (human round) - and
**only for reopens** (human round). `ask-period-control` shipped the opposite rule for the period
control, proven by a passing leaf: a refused period switch RETAINS the previous answer. Both go
through the same seam, so the caller states which it wants rather than one silently overriding the
other. The distinction holds on the merits: a period switch explores within data the user already
holds, while reopening a saved report is the moment access is re-checked, which is what decision
**0028** is about.

**What clears, and what does not** (human round) - access-related outcomes only:

| clears the stale result | keeps it |
| --- | --- |
| `blocked_by_policy` | `clarification_needed` |
| a terminal HTTP **401/403** | `not_supported`, `execution_failed`, `backend_error` |
| | rate limiting, timeout, network failure, abort |

**`not_supported` sits on the RIGHT deliberately.** A revoked domain or measure grant returns it
(`chat.service.ts:245`) - but so do "No mapping configured" (`:337`) and "no periods loaded", and
the response carries no reason code to tell them apart (`contract/src/api.ts:515`). Clearing on it
would wipe good answers for reasons that say nothing about entitlement. The consequence - losing one
grant leaves an answer on screen until reload - is recorded in the **2026-09-15 amendment to
decision 0028** and tracked as **D-0048**. The two on the left are the refusals the client can
actually recognise. Everything on the
right says nothing about entitlement, so wiping a good answer for a network blip would be a worse
experience for a problem that is not about access.

`continueTurn`'s copy is period-specific today - *"That period could not be loaded. Choose a period
to try again."* - for every non-success including transport failures. It must carry the returned
reason, or a generic one, on the target turn.

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
7. A reopen refused for **access** - `blocked_by_policy` or a terminal 401/403, the only two the
   client can recognise -
   clears the stale result and shows the reason; the thread length is unchanged. Every other
   outcome, including transport failure, keeps the previous answer. Neither shows period-specific
   copy. **The period control's retain-on-refusal behaviour is unchanged** and its shipped leaf
   still passes.
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
