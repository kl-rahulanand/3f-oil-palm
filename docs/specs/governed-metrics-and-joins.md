---
slug: governed-metrics-and-joins
title: Governed metrics & cross-object joins
status: confirmed
saved: 2026-09-01T10:05:46+00:00
---

# Governed metrics & cross-object joins

## Why
3F needs `% = Actual ÷ Budget` where Actual (SAP) and Budget (plan) are separate
sources, and budgets are revised independently. One governed semantic layer that
composes measures across those objects (decision 0004) keeps the report,
drill-down, and assistant on one source of truth with Pulse's trust guarantees.

## Users
The report, the drill-down, and the assistant — all read through this one layer.

## Behaviour
- Define measures **Actual, Budget, Roll-over, %** over the ingested objects,
  authored **in code** (repo domain files) — the runtime guided builder can't
  express two-column `SUM(Debit − Credit)`.
- **Cross-object composition** (Budget ⋈ Actual on Plant + Cost Center + GL +
  month) is **code-composed and validated**; the LLM only *selects* measures — it
  never authors SQL and there is no free-form join path.
- The join is **full-outer, zero-filling the missing side**, so a budget with no
  actual (and an actual with no budget) both appear.
- Every number carries **provenance** (measure definition + composed SQL).

## Confirmed scope (grilled 2026-09-01)
- **Join type:** full-outer, zero-fill unmatched rows.
- **Measures authored in code** (not the runtime builder).
- **RBAC:** the row-scope predicate is injected on **both** objects.
- **Correctness gate:** golden-answer fixtures required before the capability is
  "done" (no fan-out / double-counting).

## Rules
- Decision 0004 (governed joins): correct join semantics, RBAC across both
  objects, validator support for joins, golden fixtures.
- One governed definition shared by report + drill-down + assistant (no split-brain).

## Out of scope (now)
- Arbitrary user- or LLM-authored joins.

## Acceptance criteria
- `% = Actual ÷ Budget` computes correctly across the two objects, including
  zero-filled rows.
- The governed-join golden fixture passes; no double-counting.
- RBAC scoping holds on joined queries (both sides scoped).

## Open items (non-blocking)
- Roll-over measure definition (pending Srihari's roll-over rule).

## Source
Decision 0004; Pulse `backend/src/sql/*`, `core/rbac.service.ts`.
