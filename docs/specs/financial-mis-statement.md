---
slug: financial-mis-statement
title: Financial MIS statement
status: draft
saved: 2026-09-01T09:18:42+00:00
---

# Capability: Financial MIS statement

## Summary
Generate the 3F Financial MIS as an exact, on-screen statement for a selected
Department + Function + Plant + period, and let the user download it.

## Users
Finance / operations staff and management at 3F. Today Srihari hand-compiles this
in Excel; this capability replaces that with a live, generated statement.

## Behaviour
- Given a selection (Department, Function, Plant, period), produce the Financial
  MIS in the confirmed format: hierarchical rows (budget component → sub-lines)
  with, per period, **Budget · Roll-over Budget · Actual · %** (Actual ÷ Budget).
- Group-header rows show subtotals; a grand total foots the statement.
- Combinations with no transactions still appear, valued **zero** (never skipped).
- The statement downloads to **Excel** matching the on-screen layout.
- Read-only.

## Rules
- Actual = **Σ(Debit − Credit)** for the matching Plant + Cost Center + GL, per
  period (decision 0002).
- Budget and Roll-over come from the **plan**, not SAP.
- `%` guards divide-by-zero (blank / NA when Budget = 0).

## Out of scope (now)
- Editing budgets or actuals; any write-back; the operational (Table-1) MIS.

## Acceptance signals
- The nursery **July** statement reconciles to Srihari's manual MIS.
- Zero-rows present; subtotals and grand total foot correctly.
- Excel export opens with the same structure.

## Source
Decisions 0002, 0003; `docs/architecture/20-financial-mis-data-model.md`;
`docs/context/2026-09-01-srihari-requirements-qa.md`.
