---
status: proposed
confirmed_by: ""
date: 2026-08-20
stories: []
---

# MIS presentation layer — buy a BI tool, build custom, or hybrid

**This decision is OPEN.** Recorded to capture the framework, the evidence gathered
so far, and a leading hypothesis — to take to the team (Kartik) before committing
build effort. It does not bind until confirmed.

## Context

Kartik challenged the "build a custom web app" default: existing BI/reporting tools
(Metabase, Superset, Power BI, Looker) already do reporting + drill-down + DB
connection, and warned against building "just a collection of reports" — the target
should be a Power BI / Metabase-class analytics experience, not a static report
generator. Rahul: explore all options; start with the report (separate from the
chatbot); decide on evidence.

Four factors decide it for *this* product:

1. **MIS format fidelity.** The deliverable is a bespoke financial statement
   (grouped rows, Budget/Roll-over/Actual/% column-blocks per period, zero-rows
   shown, exact Excel/PDF). This is a *report*, not a dashboard — the weakest spot
   for off-the-shelf BI.
2. **Embedded chatbot.** A docked, VS-Code-style assistant over the same data (and/or
   a separate tab). No BI tool ships this; a custom surface makes it trivial.
3. **Ownership / anti-lock-in.** The client's founding motive is escaping a vendor
   and owning their stack (NDA, India residency). Proprietary SaaS re-introduces
   exactly that.
4. **Platform ambition.** A self-serve exploration experience (many consumers) is
   the strongest argument to buy a tool rather than rebuild it.

## Evidence gathered (2026-08-20)

**Hands-on Metabase spike** (self-hosted Metabase + Postgres, real July SAP data
loaded — `docs/context/2026-08-20-srihari-phase1-data/`):
- Connect + auto-discover + a grouped Budget-vs-Actual table: ~2 minutes. Good.
- **Native SQL questions cannot be pivoted** ("Pivot tables are only supported for
  questions built in the query builder") — so the complex MIS SQL (Σ Debit−Credit by
  Plant+CostCenter+GL, budget join, %) can't drive the pivot viz.
- The GUI pivot flattens components (no S.No hierarchy/subtotals), has **no % column**
  without a custom column, no multi-period Budget|RollOver|Actual|% blocks, no
  zero-row/format control. It **cannot reproduce the MIS statement.**
- (Also surfaced the GL-not-unique double-count when the composite key isn't used —
  a data-modeling point, not a tool limit.)

**Tool research** (sources on file):
- **Power BI** — best matrix rendering, but on-prem (PBIRS) strips Copilot/modern
  features; Copilot is cloud-only and absent in embedded; capacity pricing lumpy;
  deepest lock-in. **Ruled out** by ownership + residency + embedded-chatbot needs.
- **Looker** — cloud-only, per-seat/opaque pricing, Google + BigQuery lock-in (would
  also drag the engine decision). **Ruled out.**
- **Metabase** — self-hostable; **best self-hosted AI story** (Metabot, bring-your-own
  key, states it does not egress data — residency-safe); configurable drill-through.
  But **cannot render the exact MIS statement** (measures-as-rows unsupported;
  ratio/subtotal formatting limited). Viable as the *exploration + chatbot* layer.
- **Superset** — Apache-2.0, best ownership, no feature gating; but no native chatbot
  and no statement templating — you build both. Viable, heavier.
- Code-first contenders worth noting: **Evidence.dev** (git-based, pixel-controlled
  statements, total ownership), **Lightdash** (dbt-native + AI agents).

## Decision (provisional — leading hypothesis)

**Hybrid, custom-first, and defer the final call to a short bake-off.** Every path
shares the same foundation — a **Postgres warehouse + governed metrics + the mapping
master** — so build that first (needed regardless) and keep the presentation choice
reversible.

- The **exact MIS statement + its Excel/PDF export** → **custom-built** (no BI tool
  renders it; it's our differentiation).
- The **drill-down** (Actual → transactions, sorted Value↓/Month↓) → **custom** query,
  full control.
- The **ad-hoc exploration** ("not just reports" breadth Kartik wants) → a
  **self-hosted BI tool (Metabase or Superset)** over the same warehouse.
- The **chatbot** → self-hostable, residency-safe (self-hosted Metabot with BYO key,
  or an MCP/LLM layer over the warehouse), embeddable in our UI.

Proprietary SaaS (Power BI, Looker) is **excluded** by factor 3 regardless of features.

## Consequences

- Not blocked and not gambling: the warehouse + metrics layer is common to every path.
- Keeps the stack **ownable** (open-source + custom, zero proprietary lock-in) — aligned
  with why the client hired us.
- **What would close this decision:** (a) confirm the exploration tool (Metabase vs
  Superset) with a second spike if needed; (b) team/Kartik review of this hybrid; (c)
  the warehouse-engine decision (Postgres vs BigQuery) stays separate and open.
- Remains **proposed/open** until confirmed by a human.

## Related

- Build plan: `docs/architecture/30-financial-mis-build-plan.md`
- Data model: `docs/architecture/20-financial-mis-data-model.md`
- Decisions: `0001-poc-engagement-scope.md`, `0002-phase1-financial-mis.md`
- Spike + research artifacts: session 2026-08-20 (Metabase spike on the July data)
