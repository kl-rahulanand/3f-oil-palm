# Discovery — 3oilpalm (3F Oil Palm)

Phase 0a. Lightweight on purpose: no .factory ceremony until client sign-off.

Client: **3F Oil Palm** (https://www.3foilpalm.com/) — integrates with farmers
across the country to grow fresh fruit bunches (FFB) for palm-oil extraction;
fruit is trucked to their factory. KnackLabs engagement, NDA in place.

## Problem

The client's monthly MIS reporting is Excel-based and painful for the people who
run and consume it:

- **Data is not live** — reports are compiled by hand from two sources.
- **Reports take significant time to prepare** — manual compilation each cycle.
- **No drill-down** — numbers aren't clickable, so it's hard to verify *how and
  why* a figure arrives at its value.
- **Trust problem in the headline metrics** — the two most critical metrics,
  **Yield per hectare** and **OER (Oil Extraction Rate)**, currently suffer from
  **manual manipulation of some input values**, which produces inaccurate data.

Data lives in two systems and is stitched together in Excel:
1. **Smart Palm application** (SQL Server) — farmer and plot details, farmer
   lifecycle (editable), plots. Pre-factory data: farmer onboarding, field
   sizing, crop sizing, nutrients, etc.
2. **SAP** — factory-side data: temperature, thrasher size, yield, etc.

Scale: **~60,000 plots today**, growing **6–7k plots/year**. Monthly targets are
tracked live.

## Stakeholders

- **Devanshi** (client) — wife of the CEO; primary coordination contact / sign-off.
- **Srihari** (client) — data person who generates the current Excel MIS; the
  drill-down/report build is to be done "in coordination with Srihari".
- **Rahul Anand** (KnackLabs) — engagement lead.
- **Puneet** (KnackLabs) — scoping / data requests.

## What KnackLabs committed to (from recap email)

1. A more advanced MIS report with **drill-downs and clickable options**.
2. Make the Excel/report data **live**.
3. A **chatbot layer** on top of the centralized data.
Future enhancement the client liked: **budget tracking and alerting**.

## Scoping calls (from office-hours, 2026-08-14 — working assumptions)

Not yet client-approved decisions; they steer the roadmap and get confirmed at
sign-off. Full reasoning in the design doc:
`.gstack/projects/3oilpalm/caw-dev-master-design-20260814-110242.md`.

- **v1 scope** = automated live MIS (replace the full report) + clickable
  drill-down **+ chatbot** over the centralized data. Chatbot is in v1 but
  sequenced as a fast-follow after the report slice. Budget/alerting deferred.
- **v1 is read-only** — reads SAP + Smart Palm, derives/reports metrics; no
  write-back to source.
- **Architecture lean = warehouse + modeled metrics** (Approach B): ELT both
  sources into a modeled store; one governed metrics layer defines Yield/ha + OER
  with lineage; report drill-down + chatbot both read it. Real architecture gets
  grilled in plan mode per-feature.
- **Manipulation/accuracy is OUT of scope for v1** (client call). The
  manipulation is *upstream* in the source systems, so a read-only recompute
  inherits it — v1 makes numbers *traceable*, not *certified correct*. Parked as
  deferral **D-0001** (`plans/deferrals.md`) with a revisit trigger.
- **Client data** (MIS/Excel, SAP export, Smart Palm tables, Yield/OER rules)
  to be shared by the client, then harvested from `docs/context/`.

## Assignment out of office-hours

Get Srihari on a screen-share and **watch him build one MIS cycle end to end**
(not another guided demo). Capture, per headline metric, the exact source
columns, the formula, and every point a value is typed/edited by hand. That one
session resolves most open questions and yields the metric definitions the whole
warehouse is built on.

## Open inputs still needed from client (Email 2 — post-NDA asks)

Nothing here is confirmed until these land; PoC scope depends on them.

- [ ] Latest MIS/Excel reports currently in use
- [ ] Underlying SAP data/export used for the reports
- [ ] Relevant Smart Palm SQL Server tables / sample extract
- [ ] Existing calculation logic / business rules for Yield-per-hectare and OER
- [ ] Any other reports/dashboards to include in v1

## Client-approved decisions
<!-- Each becomes docs/decisions/NNNN-<slug>.md via: ./forge decision new <slug> -->
- [ ] (none accepted yet — pending data review and PoC scoping)

## Open questions / to confirm with client

- **Where does the "manual manipulation" happen?** In Smart Palm entry, in
  SAP, or only during Excel compilation? Determines whether "make it live"
  alone fixes the accuracy problem, or whether input-side validation is needed.
- **Definitions of record** for Yield-per-hectare and OER — exact formulas,
  numerator/denominator, time windows, unit of aggregation (plot / cluster /
  region / factory).
- **Read-only vs write-back**: is v1 a reporting/analytics layer over existing
  data, or does it also correct/replace any data entry?
- **Data access mechanism**: direct SQL Server read replica? SAP export/API?
  Refresh cadence needed for "live" (real-time vs near-real-time / nightly)?
- **PoC boundary**: is v1 the MIS + drill-down only, with chatbot and
  budget-alerting explicitly deferred?
- **Deployment / hosting / security** expectations (on-prem vs cloud, data
  residency given NDA).

## Prototype notes (phase 0b)
<!-- What was shown, what the client said, what changed. -->
- Not started. Prototype should target the MIS drill-down experience against a
  representative sample extract once data arrives.
