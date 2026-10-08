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
from the **uploaded SAP extract**, exact to the format, so any number is traceable
to the batch it came from. It is **not** a live SAP connection — SAP data arrives by
workbook upload (`sap-financial-ingestion`), so the statement names the active
period and its batch rather than claiming currency it does not have.

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
- **Columns:** show **Budget · Roll-over · Actual · %** for the budget-owner plant.
  The monthly block uses that month's stored workbook value; FY-YTD uses the closing
  month's value only because Roll-over is a balance, not a value to sum across months
  (decision **0041**). Other plants keep the distinct `not-loaded` dash state from
  decision **0034**.
- **Excel export:** a **clean, correctly-structured** export of the on-screen
  statement — **not** a pixel replica of the legacy 95-column workbook. **PoC =
  the statement sheet only;** a bundled transactions/line-items sheet is **deferred to a
  named later capability**. It was originally expected to arrive with `actuals-drill-down`;
  that story's requirements grill (2026-09-11) kept the drill **UI-only**, since it already
  carries a new raw-row read path, an RBAC exception and an audit requirement.
- **Table scope:** **Table-2 (Financial MIS) only.** Table-3 (Payment-Office
  rollup) and Table-1 (operational/physical units) are later phases.
- **Nil & format:** Budget = 0 & Actual = 0 → "NA"/blank; Budget = 0 & Actual > 0
  → show the actual with an over-budget flag (no %); numbers in **Indian grouping,
  ₹, rounded to the rupee**.

## Settled by the requirements grill (2026-09-11)
- **Row hierarchy — mirror the workbook outline.** The statement's rows are the
  budget workbook's own outline, rendered to whatever depth each section has: two
  levels for most (`4 Materials Primary Nursery` → `4.1 Shade Net`, GL 50001601),
  three under `9 Admin Expenses` (`9.01 Vehicle Maintenance`, GL 55010900 →
  `Petrol and Diesel Charges`, GL 55010901). **Human-decided this grill.**
- **Parents are derived, never read.** Actuals attach at the **GL leaf** and every
  parent is a computed subtotal (decision **0020**) — reading a stored parent row
  would double-count. Roll-over follows the same leaf-only rule. An uncomputed
  workbook formula may be stored as 0 for ingest resilience and is counted in the
  validation report; a computed stored value is displayed (decision **0041**).
- **Identity columns.** Each row carries the workbook **S.No**, the **Budget
  Component** name and the leaf **GL code**; the Roll-over Budget column carries
  the stored monthly or YTD closing balance for the budget-owner plant. **Payment
  Office is omitted** — that is Table-3, out of scope.
  **Human-decided this grill.**
- **One governed path.** The statement reads the governed relation: selection
  filters Actuals by the master's resolved `(plant, cost centre, GL)` triples
  *before* the GL/month roll-up, and Budget is not re-grained (decision **0017**).
  No direct aggregation that would bypass grants, provenance, zero-fill or the
  no-fan-out guarantee.
- **Two distinct zero states.** A resolved selection with no transactions renders
  zero rows; a selection with **no mapping** renders an all-zero statement **plus
  the "no mapping configured" notice** (decision **0018**, as shipped by
  `mis-selection`). They must not collapse into one another.
- **The `unmapped-GL` line is mandatory and visible** (decision **0018**): actual
  GLs with no home in the budget outline land there rather than being dropped or
  absorbed into a parent.
- **Access and provenance.** The governed layer is all-or-nothing for an authorized
  user, with two-sided scope injection and provenance carried through (decision
  **0016**); "read-only" alone does not state this.
- **Arithmetic and rounding.** Compute in exact paise and round **only for display
  and export, after aggregation** — rounding per line makes subtotals fail to foot.
  Monetary zero shows as ₹0. The `%` nil rules are already implemented by the
  governed measure: `NA` for 0/0, **over-budget** for Budget = 0 with positive
  Actual, and **credit / negative actual** for Budget = 0 with negative Actual —
  the two are labelled distinctly, not merged.

## Rules
- Actual = **Σ(Debit − Credit)** for the matching Plant + Cost Center + GL, per
  period (decision 0002).
- Budget and Roll-over come from the **plan**, not SAP.
- Roll-over is read from the workbook's stored calculation result. The application
  does not calculate the carry-forward formula. Monthly shows the selected month;
  FY-YTD shows only its closing month (decision 0041).
- `%` guards divide-by-zero per the nil rules above.

## Out of scope (now)
- Editing budgets or actuals; any write-back; Table-1 and Table-3; calculating the
  roll-over formula inside the application.

## Acceptance criteria
- **Demo-ready:** against the pinned July batch the nursery statement reconciles
  to **exact** values, not an approximation — Actual **₹1,15,12,712.07** and Budget
  **₹10,050,136.29** for 2026-07-01, the latter matching the budget workbook's own
  grand total. Zero-rows present; every parent subtotal and the grand total foot
  against their leaves; the `unmapped-GL` line carries its own Actual; and the
  Excel export opens with the same structure and the same values.
- **Validated (upgrade):** once Srihari supplies a filled July Financial MIS, the
  comparison covers **every displayed leaf, every derived subtotal, the grand total
  and each Budget / Actual / % value**, after the declared rounding and nil rules —
  mismatches reported by line and measure. Pixel equivalence is **not** required.

## Open items (non-blocking)
- Governing and reproducing the workbook's Roll-over formula in application code;
  the PoC displays the workbook's stored calculated result (decision 0041).
- **One filled month** of Srihari's Financial MIS as the golden reconciliation
  reference.

## Source
Decisions 0002, 0003; `docs/architecture/20-financial-mis-data-model.md`;
`docs/context/2026-09-01-srihari-requirements-qa.md`.
