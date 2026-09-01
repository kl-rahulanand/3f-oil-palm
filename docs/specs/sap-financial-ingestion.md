---
slug: sap-financial-ingestion
title: SAP financial ingestion
status: confirmed
saved: 2026-09-01T10:03:06+00:00
---

# SAP financial ingestion

## Why
The statement, drill-down, and metrics all need SAP GL data (and the plan
budgets) in the warehouse. Today the actuals live in SAP and the budgets in an
Excel plan; this brings both in reliably and repeatably.

## Users
The system / an operator loading a period's data; later, an automated sync.

## Behaviour
- Ingest the **SAP Base Report** via **Excel upload** now; SAP export/API later.
- Ingest the **budget plan** from the MIS format, as a **separate object** from
  Actuals (joined at query time — decision 0004).
- Store aggregated to **Plant + Cost Center + GL + month** (gold) **and retain the
  raw transaction lines** so the drill-down can reach them.
- Re-loads are **idempotent per period** (re-uploading a month replaces it).

## Confirmed scope (grilled 2026-09-01)
- **Input:** Excel upload now; SAP export/API is a later phase.
- **Budget:** ingested from the MIS format as a separate object.
- **Grain:** monthly gold + raw transaction lines retained.
- **Re-load:** idempotent replace per period.

## Rules
- Actual net = **Debit − Credit** (stored or directly derivable).
- Keys normalized (e.g. plant `DUB-NUR` ↔ `DUB`) per the mapping master.

## Out of scope (now)
- Live / real-time sync; the full 10-year backfill (PoC = recent slice, July).

## Acceptance criteria
- The July SAP load reconciles to the report totals (nursery net ≈ ₹1,15,12,712).
- Budgets from the MIS format are present as a separate object.
- Raw transaction lines are available to the drill-down; re-uploading July
  replaces that month with no duplicates.

## Open items (non-blocking)
- Scoping the full backfill and live SAP sync (later phase).

## Source
Decisions 0002, 0004; `docs/architecture/{10-source-systems,20-financial-mis-data-model}.md`.
