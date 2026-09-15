---
status: superseded
confirmed_by: "Rahul Anand"
date: 2026-09-10
stories: [governed-joins]
superseded_by: 0029-all-plants-provisional-scope
---

# Governed Joins PoC Scope

## Context
The governed-joins spec (docs/specs/governed-metrics-and-joins.md, decision 0004)
composes `% = Actual ÷ Budget` across two ingested objects and states a join grain
of Plant + Cost Center + GL + month. But that grain does not exist for Budget:
`mis_budget` has **no plant** and its `cost_center` is the MIS spreadsheet's
"Budget Components" label — an opaque display label, **not** a SAP cost centre.
Decision 0014 deferred the governed Budget-label → SAP-cost-centre + plant mapping
master (and any balanced allocation) to this story. The requirements grill
(recorded 2026-09-10) put the resulting join-key and RBAC questions to the client,
who chose the PoC-scoped answers below.

## Decision
For the governed-joins PoC:
1. **Join key = `gl_code` + `month`, within the single plant DUB.** The full-outer,
   zero-filled Budget⋈Actual join composes on `(gl_code, month)` over the DUB
   actuals; the "Budget Components" label is carried as an **informational**
   attribute only, never a join key. (`mis_budget.period` is the month column and
   conforms to Actual's `month`.)
2. **The Budget-label → SAP-cost-centre + plant mapping master (and balanced
   allocation) remains DEFERRED**, with a revisit trigger: the client supplies the
   mapping, OR multi-cost-centre / multi-plant governed reporting is required.
3. **Read RBAC is role-based all-or-nothing.** A user sees the whole governed
   layer or none of it (an action/domain/measure grant check). The row-scope
   predicate is still injected on **both** objects of the join (correctness +
   defense-in-depth), but because access is all-or-nothing, asymmetric one-sided
   key visibility cannot arise, so no partial-disclosure (zero-fill-vs-conceal)
   policy is defined now. Genuine per-plant/region row-level scoping and
   asymmetric-RBAC denial fixtures are DEFERRED with a trigger.
4. **`% = Actual ÷ Budget` divide-by-zero semantics** follow the settled statement
   rule (docs/specs/financial-mis-statement.md): `0/0` → NA/blank; `Actual>0,
   Budget=0` → over-budget (no percentage). One governed definition is shared by
   report, drill-down, and assistant. The **Roll-over** measure is DEFERRED
   (pending Srihari's roll-over rule, per the spec's open item).

## Consequences
- Actual and Budget are each reduced to their **active** batch and rolled up to
  `(gl_code, month)` before the join (Actual via `actual_by_key_month`, Budget via
  a new active-budget rollup), so retained prior batches never double-count and a
  budget reload swaps the active batch without touching actuals (0004).
- Cost-centre-level and multi-plant governed reporting are out of scope until the
  mapping master lands; numbers are reported at `(gl_code, month)` grain for DUB.
- The cross-object join must be **code-composed and validated** (the LLM only
  selects measures); the SQL builder — which today rejects multi-gold-object
  composition — gains a governed composed-join path.
- Correctness is gated by golden-answer fixtures (matched / Budget-only / Actual-
  only / duplicate-no-fan-out / reload-version / %-edge cases) with exact expected
  values, and provenance carries both active source batch ids + per-row
  source-presence so a reload's changed answer is attributable to a batch swap.
