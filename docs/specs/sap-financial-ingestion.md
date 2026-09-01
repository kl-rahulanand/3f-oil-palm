---
slug: sap-financial-ingestion
title: SAP financial ingestion
status: draft
saved: 2026-09-01T09:20:13+00:00
---

# Capability: SAP financial ingestion

## Summary
Bring SAP GL data (and the budget plan) into the warehouse as period-aware objects
that feed the statement, drill-down, and semantic layer.

## Users
The system / an operator loading a period's data; later, an automated sync.

## Behaviour
- Ingest the **SAP Base Report** via **Excel upload** now; SAP export/API later.
- Ingest the **budget plan** (from the MIS format / plan).
- Store as **separate** objects at **Plant + Cost Center + GL + month** grain, and
  retain the **raw transaction lines** for drill-down.
- Re-loads are **idempotent** per period.

## Rules
- Store net **Actual = Debit − Credit**; Budget stays a separate object (decision
  0004 — combined at query time, not pre-joined).
- Keys normalized (e.g. plant `DUB-NUR` ↔ `DUB`) per the mapping master.

## Out of scope (now)
- Live / real-time sync; the full 10-year backfill (PoC = recent slice).

## Acceptance signals
- The July SAP load reconciles to the report totals (nursery net ≈ ₹1,15,12,712).
- Raw transaction lines are available to the drill-down.

## Source
Decisions 0002, 0004; `docs/architecture/{10-source-systems,20-financial-mis-data-model}.md`.
