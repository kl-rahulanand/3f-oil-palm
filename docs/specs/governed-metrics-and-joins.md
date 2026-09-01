---
slug: governed-metrics-and-joins
title: Governed metrics & cross-object joins
status: draft
saved: 2026-09-01T09:20:13+00:00
---

# Capability: Governed metrics & cross-object joins

## Summary
A governed semantic layer that defines the financial measures and composes them
safely across separate objects (Budget ⋈ Actual), keeping Pulse's trust spine.

## Users
The report, the drill-down, and the assistant — all read through this one layer.

## Behaviour
- Define measures **Actual, Budget, Roll-over, %** over the ingested objects.
- **Cross-object composition** (Budget ⋈ Actual on Plant + Cost Center + GL +
  month) is **code-composed and validated**; the LLM only *selects* measures — it
  never authors SQL and there is no free-form join path.
- Every number carries **provenance** (the measure definition + the composed SQL).

## Rules
- Decision 0004 (governed joins): correct join semantics (no fan-out /
  double-counting), **RBAC scope injected across both objects**, validator support
  for joins, and **golden-answer fixtures** proving the numbers.
- One governed definition shared by report + drill-down + assistant (no split-brain).

## Out of scope (now)
- Arbitrary user- or LLM-authored joins; measures the guided builder can't express
  (authored in code).

## Acceptance signals
- `% = Actual ÷ Budget` computes correctly across the two objects.
- The governed-join golden fixture passes; RBAC scoping holds on joined queries.

## Source
Decision 0004; Pulse `backend/src/sql/*`, `core/rbac.service.ts`.
