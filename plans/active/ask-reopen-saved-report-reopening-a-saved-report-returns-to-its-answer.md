---
issue: ask-reopen-saved-report
title: Reopening a saved report returns to its answer
status: awaiting-approval
saved: 2026-09-15T15:44:55+00:00
story: ask-reopen-saved-report
decisions_reviewed:
  - 0001-poc-engagement-scope
  - 0002-phase1-financial-mis
  - 0003-mis-presentation-tool
  - 0004-pulse-governed-joins
  - 0005-client-signoff
  - 0006-frontend-fresh-backend-vendor
  - 0007-frontend-framework-nextjs
  - 0008-pulse-vendored-snapshot
  - 0009-required-tests-real-name-and-tsproject
  - 0010-rebrand-pulse-to-3f
  - 0011-deployment-readiness-poc-scope
  - 0012-vendored-api-constitution-deviation
  - 0013-backend-observability-built-in-poc
  - 0014-sap-ingestion-poc-no-master
  - 0015-warehouse-snake-case-deviation
  - 0016-governed-joins-poc-scope
  - 0017-mis-selection-composite-key-seam
  - 0018-mis-selection-unmapped-gl-bucket
  - 0019-fresh-routes-follow-vendored-house-style
  - 0020-mis-budget-leaf-grain
  - 0021-mis-statement-outline-snapshot
  - 0022-mis-statement-governed-projection
  - 0023-mis-statement-drift-reports-not-blocks
  - 0024-drill-down-aggregate-client-projection
  - 0025-drill-down-pinned-batch-raw-read
  - 0026-assistant-ships-in-the-poc
  - 0027-assistant-llm-bedrock-mumbai
  - 0028-saved-selections-not-snapshots
  - 0029-bind-host-explicit-network-exposure
---

# Plan — ask-reopen-saved-report: Reopening a saved report returns to its answer

Story: `ask-reopen-saved-report` (roadmap 10) · spec: `docs/specs/ask-reopen-saved-report.md` (confirmed)

## Problem
Opening a pinned report appends a fresh turn every time, even when that exact report is already
answered further up the thread, and the panel never moves. Open the same pin five times and you get
five identical answers; open it once on a long thread and it looks like the click did nothing.

Both halves are in the code. `pinned-reports.tsx:67` calls `rerun(...)`, which is
`run(question, selection)` (`use-ask.ts:147`), and `use-ask.ts:86` appends unconditionally.
`grep` for `scrollIntoView` or `scrollTo` across `ask-panel.tsx` returns **nothing**.
`saved-views.tsx:64` does the same thing, so it is not a pins-only defect.

Three things the cold reads found that the obvious fix gets wrong.

**Matching on the displayed title would merge unrelated reports.** That text is not a question - it
is `selectionLabel(selection).title`, which is `measures.join(" · ")`. A pin of Actual and Budget by
GL code and a pin of Actual and Budget by month are both `Actual · Budget`.

**The spec's own refusal rule leaked.** It required a refused reopen to keep the previous answer,
which contradicts decision **0028**: a revoked grant must produce a refusal, not a cached figure.
`continueTurn` preserves the old response on every failure, so a revoked user would keep reading
numbers they may no longer see.

**And clearing globally would break shipped code.** `ask-period-control` requires a refused *period
switch* to RETAIN the previous answer and proves it with a passing leaf. Both paths use the same
seam.

## Scope / Non-goals

**In scope**
- Reuse an existing turn, identified by its resolved `Selection`, and re-run it in place.
- Navigate to Ask **before** the request completes, and scroll the target turn into view.
- Split `continueTurn`'s failure handling so a reopen clears on access refusals while a period
  switch keeps its shipped behaviour.
- Both pins and saved views.

**Non-goals**
- Scrolling for ordinary typed questions.
- Deduplicating turns the user created by asking the same thing twice by hand.
- Queueing an Open while another request runs - it stays refused, as today.
- `continueTurn`'s pending and replace-on-success semantics, unchanged.

## Acceptance Criteria
- **C1** Opening a saved report whose resolved `Selection` already has a **successful** turn re-runs
  that turn and appends nothing; thread length unchanged. Candidates are successful turns carrying
  `response.selection`; nothing else holds a selection to compare.
- **C2** Identity is **strict structural equality** over domain, measureIds, dimensionIds, filters,
  timeWindow and limit, including optional fields and array order - never the displayed title. A
  leaf opens two reports sharing a `selectionLabel().title` but differing in dimensions and asserts
  two distinct turns. A pin whose selection predates a normalised `timeWindow` is **not** equal and
  opens as a new turn; the spec's earlier "will still match" claim was unsupportable with the data
  the client holds and is withdrawn.
- **C3** When several successful turns carry that selection, the **most recent** is re-run.
- **C4** A matched turn re-runs with **`turn.question`**, asserted on the request body. A new turn
  uses the label, because no better text exists.
- **C5** An unmatched open appends **one** turn **immediately, already pending** - it cannot wait
  for the response or there is nothing to scroll to. It is replaced on success, carries the reason
  on a refusal, and carries an error on a transport failure. One turn, not two.
- **C6** Open navigates to Ask **before** the request completes; the target turn is scrolled into
  view and shown pending.
- **C7** A reopen refused for **access** clears the stale result and shows the reason. The client
  can only tell that from two signals, so those two are the rule: **`blocked_by_policy`** and a
  terminal **HTTP 401/403**. Everything else keeps the answer, **including `not_supported`**.

  That last word is a deliberate, recorded compromise, not an oversight. A revoked domain or
  measure grant returns `not_supported` (`chat.service.ts:245`) - and so do "no mapping configured"
  (`:337`) and "no periods loaded", which are not access problems at all. The response carries only
  a class and human copy, no stable reason code (`contract/src/api.ts:515`), so clearing on
  `not_supported` would wipe good answers for reasons that say nothing about entitlement.
  **Human round: narrow it now and log the gap** rather than grow a frontend fix into a
  contract change. The residual gap - losing a single measure's grant leaves stale numbers on
  screen until reload - is recorded as a deferral with a trigger.

  Terminal 401/403 uses a **generic** message: `ApiError` retains only the status, not server copy.
  Neither path shows period-specific copy.
- **C8** **The period control is unchanged.** Its refused switch still retains the previous answer
  and its shipped leaf still passes unmodified. The caller states which behaviour it wants.
- **C9** Open while another request is running is refused with the existing row message and does
  **not** navigate - an explicit exception to C6, since there would be no target to start.
- **C10** Pins and saved views are both covered. Every criterion is proven by hermetic tests judged
  by the vitest discriminator - present AND NOT skipped AND NOT failed - because a matching testcase
  name proves nothing for vitest.

## Technical Approach

### Identity
A pure `sameSelection(a, b)` helper beside `selection-label.ts`, so both callers and the tests share
one definition. Strict structural equality; no normalisation, no field skipping.

### The seam
`continueTurn` grows an explicit failure policy from its caller rather than a second code path -
period switches keep today's retain-on-refusal, reopens clear on the C7 access set. One seam, one
behaviour per caller, no duplicate continuation logic.

### Navigation and scroll
The Open handlers navigate first, then run. The panel scrolls a target turn into view; the turn id
is the handle, which `AskTurn.id` already provides from ask-period-control.

### Copy
`continueTurn`'s period-specific failure strings move behind the caller's policy so a reopen can
carry the server's reason.

## Decisions
No new decisions. Governed by **0028** (a save is a selection, never a snapshot, and re-running
re-authorizes - the reason an access refusal must clear), **0019** (house style for touched code). Two further constraints are **deferrals, not decisions**,
and the first draft mis-cited them as decisions: **D-0006** (a prettier-ignored file is formatted
and de-listed by the task that edits it) and **D-0024 / D-0031** (proofs judged by testcase name and
executed count, never an exit code).

The grill brief's already-answered ledger cited decisions **0035** and **0036**; the active corpus
ends at **0029**, and it called `ask-period-control` unplanned although the roadmap records it done.
Stale, corrected rather than adopted.

## Risks
- **The shared seam.** C8 exists because a careless change breaks a shipped, approved contract. The
  period-control leaf must pass unmodified, not be updated to suit.
- **Immediate pending turns** change what the thread looks like mid-flight; C5 pins the lifecycle so
  a failure cannot leave a phantom turn.

## Verify Plan
`python3 factory/scripts/verify.py`. The hermetic leaves are named rather than implied, because each
of these can pass by accident:

- a turn shown **pending before the response resolves**, not after;
- the **most recent** of several matching turns is the one re-run;
- **both** entry points - a pin and a saved view;
- **busy state**: Open while a request runs refuses and does **not** navigate;
- **`scrollIntoView`** is called on the target turn;
- **terminal 401/403** clears with a generic message;
- **`not_supported` KEEPS the answer**, which is the compromise C7 records and the one a later
  reader is most likely to "fix" without knowing why;
- the **shipped period-control leaf passes unmodified**.

The live check re-opens a pin twice from the Dashboard and confirms one turn, current numbers and a
visible scroll, with `LLM_PROVIDER=bedrock` declared - the mock provider always clarifies and would
prove nothing.

## Surface Impact
| Surface | Classification | Notes |
| --- | --- | --- |
| Runtime behavior | **Changed** | Reopen reuses a turn, navigates first, and clears on access refusals. |
| API | **Unchanged by design** | No route, request or response change; this is entirely client-side. |
| Data/schema | **N-A** | No storage change; pins and saved queries are untouched. |
| CLI/ops | **N-A** | No CLI or deployment surface. |
| UI | **Changed** | Scroll-into-view, immediate pending turn, refusal copy, Open handlers. |
| Docs | **Unchanged by design** | The confirmed spec already carries this behaviour and no task edits documentation. |
| Tests | **Changed** | New frontend leaves; the ask-period-control leaf must pass unmodified. |

## Task Decomposition
Sequential; one runtime, explicit dependencies.

1. **`reopen-identity-and-policy`** (frontend, `user_facing: false`) — C1, C2, C3, C4, C7, C8.
   `sameSelection`, the caller-stated failure policy on `continueTurn`, and the reopen wiring in
   `use-ask`. No visual change. Depends on nothing.
2. **`reopen-navigation-and-scroll`** (frontend, `user_facing: true`) — C5, C6, C9, C10.
   Navigate-first from both Open handlers, the immediate pending turn, scroll-into-view, and the
   refusal copy on screen. Depends on task 1.
