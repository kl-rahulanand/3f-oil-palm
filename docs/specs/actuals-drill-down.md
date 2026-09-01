---
slug: actuals-drill-down
title: Actuals drill-down
status: draft
saved: 2026-09-01T09:20:13+00:00
---

# Capability: Actuals drill-down

## Summary
From the Financial MIS statement, reveal how an Actual was built — down to the
underlying SAP transactions.

## Users
Finance / operations staff verifying a number ("how and why is this value here?").

## Behaviour
- Only **Actual** amounts are interactive; **Budget and %** are not clickable.
- Clicking a **sub-line** Actual opens a **Line Items** view: Month, Debit,
  Credit, Value, reference, memo — sorted **Value largest→lowest**, then **Month
  latest→oldest** — footing exactly to the clicked Actual.
- (Enhancement, decision-pending with Srihari) Clicking a **group-total** Actual
  first opens its **sub-lines**; each sub-line Actual then drills to transactions.

## Rules
- Line items are the raw SAP lines behind the aggregate — a distinct read path
  from the aggregate measures (a grain change, not a same-grain join).
- RBAC-scoped and audited like every other read; provenanced.

## Out of scope (now)
- Editing; drilling the Budget side; drill beyond the transaction line.

## Acceptance signals
- Line-item footer total equals the clicked Actual.
- Default sort is Value↓ then Month↓.
- Budget / % do nothing on click.

## Source
`docs/context/2026-09-01-srihari-requirements-qa.md` (§3); build plan.
