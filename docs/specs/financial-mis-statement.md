---
slug: financial-mis-statement
title: Financial MIS statement
status: confirmed
saved: 2026-09-01T09:52:09+00:00
---

# Financial MIS statement

## Why
The Financial MIS is 3F's Phase-1 ask. Today Srihari hand-compiles it in Excel:
slow, not live, and hard to verify. This capability generates the same statement
live from SAP, exact to the format, so any number is current and traceable.

## Users
Finance / operations staff and management at 3F (replacing Srihari's manual build).

## Behaviour
- Given a selection (Department, Function, Plant, period), produce the Financial
  MIS in the confirmed format: hierarchical rows (budget component → sub-lines)
  with, per period, **Budget · Roll-over Budget · Actual · %** (Actual ÷ Budget).
- Group-header rows show subtotals; a grand total foots the statement.
- Combinations with no transactions still appear, valued **zero** (never skipped).
- The statement downloads to **Excel** matching the on-screen layout.
- Read-only.

## Confirmed scope (grilled 2026-09-01)
- **Periods (PoC):** render **current month (July 2026) + FY 26-27 YTD** only. The
  FY-YTD column is shown, labelled **"FY 26-27 (YTD to Jul)"**, and grows as more
  months load. The full period set (historical FYs + all 12 months) is modelled
  underneath so more data drops in without redesign — but not drawn empty now.
- **Columns:** show **Budget · Actual · %** now. Keep the **Roll-over** column but
  leave it **unpopulated** until Srihari confirms the roll-over rule (see Open).
- **Excel export:** a **clean, correctly-structured** export of the on-screen
  statement — **not** a pixel replica of the legacy 95-column workbook. **PoC =
  the statement sheet only;** a bundled transactions/line-items sheet is added
  later with the drill-down capability.
- **Table scope:** **Table-2 (Financial MIS) only.** Table-3 (Payment-Office
  rollup) and Table-1 (operational/physical units) are later phases.
- **Nil & format:** Budget = 0 & Actual = 0 → "NA"/blank; Budget = 0 & Actual > 0
  → show the actual with an over-budget flag (no %); numbers in **Indian grouping,
  ₹, rounded to the rupee**.

## Rules
- Actual = **Σ(Debit − Credit)** for the matching Plant + Cost Center + GL, per
  period (decision 0002).
- Budget and Roll-over come from the **plan**, not SAP.
- `%` guards divide-by-zero per the nil rules above.

## Out of scope (now)
- Editing budgets or actuals; any write-back; Table-1 and Table-3; roll-over calc.

## Acceptance criteria
- **Demo-ready:** the nursery **July** statement reconciles to our SAP-derived
  totals (nursery net ≈ ₹1,15,12,712); zero-rows present; subtotals and grand
  total foot; Excel export opens with the same structure.
- **Validated (upgrade):** the same statement matches Srihari's filled July
  Financial MIS once he provides it (golden reference).

## Open items (non-blocking)
- **Roll-over rule** from Srihari (carry-forward of unspent budget) — column kept,
  calc deferred.
- **One filled month** of Srihari's Financial MIS as the golden reconciliation
  reference.

## Source
Decisions 0002, 0003; `docs/architecture/20-financial-mis-data-model.md`;
`docs/context/2026-09-01-srihari-requirements-qa.md`.
