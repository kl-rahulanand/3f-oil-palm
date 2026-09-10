---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-10
stories: [mis-selection]
---

# Composite-key selection filters the Actual side before the GL roll-up (one governed path)

## Context
`mis-selection` makes the composite key **Plant + Cost Center + GL** mandatory: the
Mapping Master resolves, for a Department → Function → Plant selection, the applicable
cost centres and GL codes (`docs/specs/mis-selection-and-master.md`).

But the governed relation shipped in `governed-joins` (PRs #20–#23, decision 0016) is
deliberately DUB-only at the **`(gl_code, month)`** grain: `actual_by_gl_month` sums
Actuals **across** cost centres before the Budget⋈Actual join, precisely to stop Budget
fanning out per cost centre. Cost-centre-level reporting was deferred there.

So a selection cannot filter by cost centre *after* the roll-up — the column is already
gone. The requirements grill (2026-09-10) flagged that without a stated seam an
implementer could build a **second, contradictory query path** against the
cost-centre-grain view, bypassing the governed grants, provenance and %-nil rule that
`governed-joins` established. Recorded as deferral **D-0028** and escalated as a missing
decision.

Three options were put to the human: (a) filter before the roll-up keeping one path,
(b) resolve selections to GL codes only, (c) accept a separate selection query path.

## Decision
**Filter before the roll-up, one path.** The composed relation's **Actual side** is
extended to filter by the Mapping Master's resolved `(plant, cost_center, gl)` triples
**before** aggregating to `(gl_code, month)` — sourcing the existing cost-centre-grain
`actual_by_key_month` view rather than the pre-rolled `actual_by_gl_month`.

There remains exactly **ONE** governed query path. Selection **narrows** that path; it
never forks it. Options (b) and (c) are rejected: (b) loses cost-centre precision and
contradicts the spec's mandatory composite key (it would mis-slice any GL shared across
cost centres — the very Primary/Secondary overlap Srihari §4 calls out), and (c) creates
the parallel, ungoverned path the grill warned about.

Confirmed by the human on 2026-09-10, settling D-0028.

## Consequences
- The governed builder's `actual_src` CTE becomes **selection-aware**: given the master's
  resolved triples it reads `actual_by_key_month`, applies the triple filter plus the
  existing validated plant scope, and aggregates to `(gl_code, month)` — preserving the
  no-fan-out invariant that `gl-month-rollups` proved, because the reduction to one row
  per `(gl_code, month)` still happens before the FULL OUTER JOIN.
- Everything `governed-joins` established continues to apply unchanged to selected
  queries: the fail-closed governed-financial read action plus domain/measure/dimension
  grants, two-sided row scope, COALESCE zero-fill, the `%` nil rule and its labels, and
  in-query provenance (source-presence, label set, active batch tuples).
- Budget is **not** re-grained. It stays at `(gl_code, month)` from
  `budget_by_gl_month`; the master's cost centres narrow the **Actual** side only. The
  Budget-Components label set remains informational (0016), so a selection never fans
  Budget out per cost centre.
- The golden-answer fixture from `golden-provenance` must gain a **selected-slice** case
  proving a cost-centre-filtered selection still yields one row per `(gl_code, month)`
  with no fan-out and exact values.
- This partially reopens 0016's deferral of cost-centre-level reporting: cost centres now
  act as a **selection filter**, but are still never a join key, a Budget grain, or an
  output dimension.
- Deferral **D-0028** is resolved by this record. **D-0027** (the MIS-line assignment for
  the 9 unresolved DUB composite-key triples) stays **open** — it is financial meaning
  awaiting Srihari's authoritative Master Table, and `mis-selection` planning cannot fully
  converge until it is settled.
