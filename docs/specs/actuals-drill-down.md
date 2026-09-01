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

## Rules
- Line items are a distinct raw-row read path (a grain change, not a same-grain
  join); RBAC-scoped and written to the append-only audit like every read.

## Out of scope (now)
- Editing; drilling Budget/%; drill beyond the transaction line.

## Acceptance criteria
- Line-item footer total equals the clicked Actual.
- Default sort is Value↓ then Month↓; Budget/% do nothing on click.
- A user only sees transactions within their RBAC scope; each drill is audited.

## Open items (non-blocking)
- Confirm 2-level (group opens sub-lines) with Srihari vs his single-level spec.

## Source
`docs/context/2026-09-01-srihari-requirements-qa.md` (§3); build plan; decision 0003.
