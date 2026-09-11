---
status: proposed
confirmed_by: ""
date: 2026-09-11
stories: [drill-down]
---

# Drill Down Aggregate Client Projection

## Context
The requirements grill settled that clicking **any non-leaf Actual** opens a flattened
list of **all its descendant leaves**, and only a **leaf** opens raw transactions. The
shipped statement payload already carries everything the leaf list needs: `MisStatementNode`
(`contract/src/api.ts`) has `sNo`, `budgetComponent`, `glCode` and `children`, and each
`MisStatementMeasureBlock` carries `budget`, `actual` and `percentage` per block. `actual`
and `budget` are `FixedScaleMoney` — a fixed two-decimal string — so summing descendants in
**exact paise** is decidable on the payload the browser already holds.

Building the aggregate drill as a second server round-trip would therefore re-query the
warehouse to recompute numbers the client can already prove, and would put a second
raw-adjacent read path behind the same click.

## Decision
The **aggregate drill is a client-side projection of the statement response**: flatten the
clicked node's descendant leaves and foot them in `FixedScaleMoney` paise. **Only the leaf
drill crosses the network**, to the single transactions endpoint decision **0025** governs.
The Grand Total follows the same rule — it is the root aggregate, flattened client-side.

## Consequences
- Exactly **one** new read path, one new endpoint, one audit surface and one RBAC exception
  in this story — the aggregate step exposes nothing that is not already on screen, so it
  needs no audit record and no server authorization beyond the statement's own.
- The aggregate footer foots **by construction**: the statement's subtotals are already
  derived from its leaves (decision **0020**), so the panel's Total row and the clicked
  Actual come from the same numbers. The test asserts the identity rather than a tolerance.
- Opening an aggregate is instant and works with the network down; closing and reopening
  costs nothing.
- The drill is only as fresh as the statement on screen. That is the intent — decision
  **0025** pins the leaf drill to the same batch for the same reason.
- If a later capability needs aggregate-level data the statement does not carry (a
  cost-centre split, say), that is a new server projection and a new decision; it must not
  be smuggled in by turning this client projection into a fetch.
