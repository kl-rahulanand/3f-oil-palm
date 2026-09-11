---
slug: actuals-drill-down
title: Actuals drill-down
status: confirmed
saved: 2026-09-01T10:10:31+00:00
---

# Actuals drill-down

## Why
The headline pain is "I can't verify how a number was built." Clicking an Actual
to see the exact transactions behind it is the feature that answers that — and
it's what Excel can't do.

## Users
Finance / operations staff verifying a number.

## Behaviour
- Only **Actual** amounts are interactive; **Budget and %** are not clickable.
- **2-level drill:** clicking a **group-total** Actual opens its **sub-lines**;
  clicking a **sub-line** Actual opens the **transaction line items**.
- Line items show **Month, Debit, Credit, Value, reference, memo, posting date**,
  sorted **Value largest→lowest** then **Month latest→oldest**, footing exactly to
  the clicked Actual.
- Budgets never drill.

## Confirmed scope (grilled 2026-09-01)
- **Levels:** 2-level (group → sub-lines → transactions) — richer than Srihari's
  written single-level spec; **to confirm with Srihari** (async).
- **Raw rows:** the drill-down **exposes individual transaction lines within the
  user's RBAC scope, audited** — an explicit exception to Pulse's aggregate-only /
  k-anon suppression (the feature's whole purpose).
- **Columns:** Month, Debit, Credit, Value, reference, memo, posting date.

## Settled by the requirements grill (2026-09-11)
- **Depth — any aggregate opens its leaf sub-lines.** The shipped statement mirrors the
  workbook outline at **arbitrary** depth (three levels under `9 Admin Expenses`), so a
  strict "one level per click" would be a 3-click drill there and 2-click elsewhere.
  Clicking **any non-leaf Actual** opens a flattened list of **all its descendant leaves**;
  clicking a **leaf** (including **`unmapped-GL`**) opens that leaf's raw transactions.
  **Grand Total follows the same rule.** **Human-decided this grill.**
- **The drill is pinned to the statement's batch.** Re-uploading a period replaces the
  active actuals batch; a drill reading the newly active rows would no longer foot to the
  number that was clicked — silently. So the drill reads the **exact actual-batch ids the
  displayed statement was built from**, together with its resolved triples, node key and
  selected time block. **Authorization is re-checked at drill time** against the user's
  current plant scope, but the **data** is the statement's. If that batch has since been
  replaced, **say so** rather than showing different numbers. **Human-decided this grill.**
- **No export in this story.** The statement spec promised a bundled transactions sheet
  "with the drill-down capability"; that is **deferred to a named later capability**. This
  story is UI-only — it already carries a new raw-row read path, an RBAC exception and an
  audit requirement. **Human-decided this grill.**
- **Footing is compared in exact paise**, never the statement's display-rounded rupees:
  the statement aggregates *before* rounding, so two visually equal `₹` values can conceal
  a real mismatch.
- **The drill predicate** is: the selected statement **node key** (and its descendant leaf
  keys where the node is an aggregate), the master's resolved **`(plant, cost centre, GL)`
  triples**, the **selected month or YTD range**, and the **pinned actual-batch ids**.
- **Authorization and audit are testable, not adjectival.** The drill requires the **same
  governed-financial authorization and current plant scope** as the statement, and writes a
  **pre-query, fail-closed audit record** naming the actor, the predicate above and the
  batch ids — if the audit write fails, the read does not happen.
- **Column semantics.** `Value = Debit − Credit`; `reference` is the SAP **Reference 1**
  column; `memo` is **LineMemo**. Sort **Value ↓, Month ↓**, then a deterministic
  tie-break — **posting date ↓, then transaction number, then line id** — so a page is
  stable across requests.
- **Large results are server-paginated.** A response carries the **total matching count**
  and an **exact full-result footer** (not a page subtotal), with the visible page sorted
  deterministically.

## Settled by the requirements re-read (2026-09-11)
The plan-gate work put two accepted decisions into the product tree (**0024**, **0025**) and
a cold re-read of this spec against them found nine gaps. All are settled here.

- **The pin must be complete, not merely valid.** The drill sends the actual-batch ids from
  the displayed statement's provenance. The server requires **exactly one actuals batch for
  every month in the clicked block's range that has one**. A missing month, a duplicate, a
  wrong-source or wrong-period id is a **refusal** — never an authorized but partial footer.
  Omitting a batch only narrows the read, which is safe for access and fatal for footing.
- **Pin the outline, not only the actuals.** The statement's row structure comes from the
  budget batch's outline snapshot (decision **0021**), which a budget re-upload replaces. The
  drill therefore pins the **budget batch id** the same way — it is already on the wire in
  `provenance.activeBatchIds` — and resolves `nodeKey → leaf key` against **that** snapshot,
  not the currently-active one. The mapping master is a compiled-in constant carrying a
  `version` (decision **0014** — no governed master in the PoC), so it cannot drift inside a
  running process; the audit record names its version so a deploy-time change is traceable.
- **Only a leaf calls the server.** Per decision **0024**, every aggregate — including the
  **Grand Total** — is a client-side flattening of the statement payload already on screen.
  It issues no request, exposes nothing new and writes no audit record. Only a leaf reaches
  the transactions endpoint, and only that read is audited. An implementer must not add a
  server-backed aggregate drill.
- **The pagination contract.** Pages are **1-based**; page size is **fixed server-side at
  100** and is not client-settable. Every response carries the **total matching count**, the
  page number and size, and totals over **all** matches. A non-integer or out-of-range page
  is a **400**. An empty result is a valid response: zero rows and a zero footer, not an error.
- **The audit record has a typed shape.** The existing request-audit API takes a governed
  `Selection`, which has no room for a node key, resolved triples or pins, so the drill gets
  its own typed payload: actor, node key, resolved leaf key, the `(plant, cost centre, GL)`
  triples, the month range, the pinned actuals **and** budget batch ids, the mapping-master
  version, the generated SQL and the objects touched. **Refused attempts are audited too** —
  an authorization refusal records the actor and the predicate **as submitted** (never the
  resolved one, which would disclose what the caller could not see) under its own event type.
  **Human-decided this re-read.**
- **A vanished pinned batch is refused, never substituted.** Replacement and disappearance are
  distinct outcomes: a batch that is no longer active but still exists is **read** and the
  replacement is reported; a batch that no longer exists at all is a **refusal** with a
  distinct message. In neither case does the drill silently fall back to the active batch.
- **The footer shows rupees, with paise beneath.** The statement rounds its Actual to whole
  rupees, so a paise-precise footer can read up to ₹1 away from the cell that was clicked
  while both are correct. The footer renders through the **same rupee formatter as the
  statement** — so "Matches the Actual in the report" is literally true on screen — with the
  **exact paise value on a secondary line** for a user verifying to the paise. Equality is
  asserted in paise by the automated proof. **Human-decided this re-read.**
- **Budget, Roll-over and % are all inert.** The shipped statement has a Roll-over column that
  the earlier wording omitted. None of the three carries a click handler, a focusable control
  or a pointer affordance.
- **The one-level question is ledgered, not left open.** Srihari's written spec asks for a
  single level; this capability ships the settled multi-level behaviour. That divergence now
  carries a named deferral with a revisit trigger rather than sitting as an untriggered open
  item (see Open items).

## Rules
- Line items are a distinct raw-row read path (a grain change, not a same-grain
  join); RBAC-scoped and written to the append-only audit like every read.

## Out of scope (now)
- Editing; drilling Budget/%; drill beyond the transaction line.
- **Exporting transactions to Excel** — deferred to a named later capability (see Settled).

## Acceptance criteria
- **Footing, in exact paise**: the line-item footer equals the clicked Actual — proven for
  a **leaf**, for a **derived group** (where the footer equals the sum of its descendant
  leaves), for an **FY-YTD** drill spanning several monthly batches, and for the
  **`unmapped-GL`** line.
- Default sort is **Value ↓ then Month ↓** with a deterministic tie-break; **Budget and %
  do nothing on click**.
- A user sees **only** transactions within their RBAC scope: an unauthorized plant is
  refused and **no rows leak**; each drill writes its audit record **before** the read, and
  a failed audit write means no read.
- **Re-upload after display**: with the statement on screen and the period re-uploaded, the
  drill still foots to the displayed number and says the batch was replaced.
- Large results paginate, and the footer covers **all** matches, not the visible page.

## Open items (non-blocking)
- Confirm the multi-level drill with Srihari vs his single-level spec — ledgered as
  **D-0037** with a revisit trigger (demonstrated to Srihari, his async reply, or a request
  for a one-click group-to-transactions path), so it is owned rather than merely open.

## Source
`docs/context/2026-09-01-srihari-requirements-qa.md` (§3); build plan; decision 0003.
