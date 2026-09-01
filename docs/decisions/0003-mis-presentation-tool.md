---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-01
stories: []
---

# MIS presentation layer — custom report + Pulse (option 3)

**Decided: option 3.** The buy-vs-build exploration below stands as the record;
the call is a custom MIS report plus Pulse (our own platform).

## Context

Kartik challenged the "custom web app" default: BI tools (Metabase, Superset,
Power BI, Looker) already do reporting + drill-down, and we should aim for a
platform experience, not "just a collection of reports." Four factors decided it:
MIS-format fidelity, the assistant, ownership/lock-in (3F's founding motive), and
ad-hoc exploration.

Evidence gathered 2026-08-20 (hands-on Metabase spike on real July data + tool
research; see `docs/architecture/20-financial-mis-data-model.md` and the buy-vs-build
comparison artifact):
- **No off-the-shelf tool renders the bespoke MIS statement.** Metabase can't
  (native SQL isn't pivotable; the GUI pivot has no hierarchy/%/month-blocks);
  Power BI's matrix is closest but is ruled out below.
- **Power BI and Looker are ruled out** by ownership + India residency + lock-in —
  the exact trap 3F hired us to escape. (Looker would also force BigQuery.)
- **Pulse** — KnackLabs' own trustworthy NL-to-data platform — gives a governed
  semantic layer, code-composed + validated SQL, provenance, saved reports,
  dashboards, drill-down, and a self-hosted assistant. It directly targets 3F's
  core pain (distrust of the numbers) and is IP we own.

## Decision

1. **Presentation = a custom-built MIS report** (the exact grouped
   Budget/Rollover/Actual/% statement, 2-level drill-down, Excel export) **plus
   Pulse** (our platform) for the assistant, natural-language exploration, and the
   **governed semantic layer**. Both read from **one shared warehouse + semantic
   layer** — one source of truth.
2. **Not adopted:** BigQuery+Looker and Power BI (ownership/residency/lock-in).
   Metabase/Superset kept only as a possible future fallback for drag-drop
   exploration if a power-analyst need appears.
3. **Build approach = adapt/extend Pulse**, not greenfield — reuse its shell,
   auth/RBAC, chat, semantic layer, exploration, and trust spine; add the MIS
   statement renderer, the 2-level drill-down, a 3F financial semantic layer over
   SAP, and the KnackLabs design. **Contingent on a portability assessment
   (underway)** confirming Pulse is reusable beyond MBS.
4. **Delivery mode = prototype (phase 0b)** for now — internal approval only;
   client sign-off (Devanshi) recorded later before the full factory loop.

## Consequences

- Big head start from Pulse; the **MIS statement renderer + drill-down are net-new
  regardless** (Pulse has no bespoke-statement view).
- **Warehouse engine (Postgres vs BigQuery) stays a separate, open decision;**
  Pulse's warehouse seam is described as swappable — the assessment will confirm.
- Reusing Pulse across clients is an **investment in its portability** (StarRocks
  → Postgres, Bedrock → Claude, navy → KnackLabs design, MBS-specific config) —
  the assessment sizes it.
- The trust spine (verified measures, provenance, reconciliation) is the
  differentiated value for 3F and aligns with the ownership motive.
- Refines the presentation lean in `0001`/`0002`. Remains **proposed** until a
  human confirms.

## Related

- Build plan: `docs/architecture/30-financial-mis-build-plan.md`
- Data model: `docs/architecture/20-financial-mis-data-model.md`
- Decisions: `0001-poc-engagement-scope.md`, `0002-phase1-financial-mis.md`
- Pulse repo (foundation to adapt): `~/Desktop/pulse`
