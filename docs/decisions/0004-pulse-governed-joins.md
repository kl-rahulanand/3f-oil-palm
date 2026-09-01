---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-01
stories: []
---

# Governed cross-object joins in Pulse

## Context

We're building 3F by adapting Pulse (decision `0003`). Pulse today enforces
**one data object per query** — its SQL builder throws on cross-object measures
(the "A5 / cross-object composition" TODO), because MBS's use case was ad-hoc
single-aggregate answers.

3F is structurally different: **Budget** (from the plan/MIS format) and **Actual**
(from SAP GL) are separate sources at the same grain (Plant + Cost Center + GL +
month), and `% = Actual / Budget` must combine them. Budgets are also revised
independently of GL. Two options:

- **Pre-join** Budget + Actual into one wide monthly gold table in ingestion —
  engine unchanged, but a brittle denormalized table rebuilt on every change.
- **Allow joins** — implement cross-object composition in the engine, keeping the
  sources as separate, normalized objects.

## Decision

**Allow governed cross-object joins.** Implement modeled cross-object composition
in Pulse's SQL builder + validator + RBAC. "Governed" is the guardrail: joins are
**relationships declared in the semantic layer** (e.g. `budget ⋈ actuals` on
Plant + Cost Center + GL + month) that **code composes deterministically** — the
LLM still only *selects* from the vocabulary; it never authors joins, and there is
no free-form/arbitrary join path. Budget and Actuals stay separate semantic
objects.

## Consequences

- **Touches the trust spine** (the deterministic builder/validator) — so it is a
  first-class capability with: correct join semantics (no fan-out/double-counting),
  RBAC scope-predicate injection across **both** objects, validator support for
  joins, and **golden-answer fixtures** proving the numbers. Not a hack.
- **On the critical path** — the MIS statement needs Budget + Actual together, so
  this lands early (before the statement renderer).
- **Does not remove the transaction drill work** — drilling an aggregate to raw GL
  lines is a grain change, not a same-grain join; that raw-row read path is
  net-new either way (see the build plan).
- **Upsides:** budgets revisable without touching GL ingestion; normalized,
  maintainable modeling; and it is **reusable IP** — cross-object joins make Pulse
  more capable for every future client and the broader analytics-platform vision.

## Related

- Decisions: `0003-mis-presentation-tool.md`, `0002-phase1-financial-mis.md`
- Build plan / data model: `docs/architecture/30-financial-mis-build-plan.md`,
  `docs/architecture/20-financial-mis-data-model.md`
- Foundation to change: Pulse `backend/src/sql/sqlBuilder.ts` (the A5 TODO),
  `sqlValidator.ts`, `core/rbac.service.ts`
