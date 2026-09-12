---
status: accepted
confirmed_by: "kl-rahulanand"
date: 2026-09-12
stories: [assistant]
---

# Saves store the governed selection, never the answer; pins are personal and re-authorize on every open

## Context
The confirmed spec uses **"saved queries"**, **"saved report"** and **"pinned dashboards"**
interchangeably without deciding what a save actually holds. The vendored contract is more
decided than the prose: `contract/src/api.ts` distinguishes a `SavedQuery` (a `Selection`) from
a `PinSnapshot` (a `ResultTable` with `computedAt`), and `PinSnapshot.status` already includes
**`access_revoked`** — someone anticipated a pin outliving the access that made it.

The spec's own acceptance criterion is the tell: *"A saved report re-runs correctly under the
current user's RBAC."* Re-running is only meaningful if what was saved is the **question**.

## Decision
A save stores the **governed selection** — the question, not the numbers. **Nothing is stored
at rest that the user could not re-derive by asking again**, and re-running **re-authorizes as
the current user**, so a revoked grant produces a refusal rather than a cached figure. Pins are
**personal**; there is no sharing model in the PoC.

## Consequences
- No stale answer can outlive the access that produced it, and no governed measure value sits at
  rest outside the warehouse. `access_revoked` becomes a live refusal path rather than a label on
  a copy of data someone may no longer read.
- Opening a pin costs a query. That is the price of the guarantee, and at PoC volumes it is not a
  performance concern — the governed projection already answers the statement in one round trip.
- Answer snapshots and shareable pins are **not** in this story. Either would need its own
  retention, revocation and — for sharing — a whose-RBAC-applies rule. Revisit when a client asks
  for offline or shared dashboards, or when a pinned answer must survive a definition change for
  audit reasons.
- `PinSnapshot` stays in the vendored contract unused by this story rather than being deleted; a
  later snapshot capability would build on it.
