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

## Amendment — 2026-09-15 (ask-reopen-saved-report)

The rule above is unchanged in intent, but it claimed a guarantee the client cannot keep, so the
limit is recorded here rather than left implicit.

Re-running does re-authorize server-side. What the **client** can do about a refusal depends on
being able to recognise one, and today it cannot always. A revoked domain or measure grant returns
`not_supported` (`backend/src/chat/chat.service.ts:245`) — and so do *"No mapping configured"*
(`:337`) and *"no periods loaded"*. The response carries only a `responseClass` and human copy, with
no stable reason code (`contract/src/api.ts:515`).

So a client **clears a stale answer on the refusals it can identify** — `blocked_by_policy` and a
terminal HTTP **401/403** — and keeps it otherwise. The consequence, stated plainly: after losing a
single domain or measure grant, a previously rendered answer can remain on screen until the view is
reloaded. Nothing new is stored, and the next successful re-run re-authorizes as always; this is a
display-lifetime limit, not a cached figure at rest.

Closing it needs a typed refusal reason on the chat response. Tracked as **D-0048**, whose trigger
reopens this amendment.

Confirmed by Rahul Anand, 2026-09-15.
