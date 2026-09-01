# 3oilpalm (3F Oil Palm MIS) — BRIEF.md

> DRAFT — phase 0a. Firms up once the client shares the MIS/Excel, SAP export,
> Smart Palm tables, and the Yield/OER calculation rules (see DISCOVERY.md).

## Summary

3F Oil Palm runs its monthly management reporting (MIS) in Excel, hand-compiled
from two systems (SAP + the Smart Palm SQL Server). The result is slow, not
live, un-auditable, and its two headline metrics — Yield per hectare and OER —
are distorted by manual value edits. We are building an automated, live MIS: a
single trusted layer over the two data sources that reports the key metrics with
clickable drill-downs so any number can be traced to the source rows that produced
it. v1 also includes a conversational (chatbot) layer over the same centralized
data (sequenced as a fast-follow). The system is a **read-only reporting layer** —
it never edits SAP or Smart Palm. v1 makes numbers *live and traceable*, not
*certified correct*: the manual manipulation of Yield/ha and OER happens upstream
in the source systems and is explicitly out of scope for now (deferral D-0001).
Budget tracking/alerting is a later enhancement.

## Users

- **Operations / management (report consumers)** — read the MIS, track monthly
  targets live, drill into any metric to see how it was derived.
- **Data owner (Srihari)** — today assembles the Excel; needs the automated
  pipeline to replace the manual compilation and be verifiable against source.
- **Client leadership (CEO / Devanshi)** — verify how the headline numbers were
  derived; watch targets and (later) budgets.

## Target Outcome

The monthly MIS is produced automatically from source data with no manual
re-keying; every reported figure (especially Yield/ha and OER) is live and
drill-down-traceable to the underlying SAP and Smart Palm records, so anyone can
see how a number was built. (Certifying the numbers as correct — closing the
upstream manual-manipulation gap — is a later phase, deferral D-0001.)

## Key Flows

<!-- DRAFT — to confirm against the real reports/data. -->

1. **View live MIS** — A manager opens the MIS dashboard and sees current-period
   metrics and monthly-target progress, refreshed from source rather than a
   hand-built Excel.
2. **Drill down a metric** — They click a figure (e.g. OER, Yield/ha) and see the
   contributing records/steps down to the source rows, so the value is auditable.
3. **Trace the headline metrics** — Yield/ha and OER are computed by a single
   defined rule from source data, shown with their inputs, eliminating manual edits.
4. **Track monthly targets** — Actuals vs monthly targets update live per the
   tracked unit (plot/cluster/region/factory — TBC).
5. **Ask the data (chatbot, v1)** — A user asks a natural-language question over
   the centralized data and gets an answer grounded in the same figures.
6. **Budget tracking & alerting (later phase)** — Thresholds raise alerts.

## Domain Concepts

<!-- Nouns and relationships only. -->

- **Farmer** — grower onboarded by 3F. Related to: Plots, farmer lifecycle.
- **Plot / field** — a growing unit (~60k today, +6–7k/yr). Has field size, crop
  size, nutrients, and pre-factory data points. Related to: Farmer, FFB.
- **FFB (fresh fruit bunch)** — fruit harvested from plots, trucked to factory.
- **Factory process** — receives fruit; captures temperature, thrasher size,
  yield, etc. Related to: FFB, OER.
- **Yield per hectare** — key metric; production per unit area. Derived.
- **OER (Oil Extraction Rate)** — key metric; oil extracted per FFB. Derived.
- **Monthly target** — planned figure a metric is tracked against, live.
- **Source systems** — Smart Palm (SQL Server, editable, pre-factory) and SAP
  (factory-side). The MIS is derived from both.

## Constraints

- **Two upstream systems**: Smart Palm SQL Server + SAP — read integration;
  access mechanism, cadence, and whether via replica/export/API are TBC.
- **Accuracy is the point**: the value of the system is trustworthy, auditable
  Yield/ha and OER — drill-down must reach source rows.
- **Scale**: ~60k plots now, growing ~6–7k/yr; metrics aggregate across many plots.
- **NDA in place** — data handling/residency/security expectations to confirm.
- **Metric definitions must be agreed with the client** before they are canon.

## Out of Scope

For v1 / the PoC:

- Budget tracking & alerting (**future enhancement**).
- Writing back to / correcting data inside Smart Palm or SAP — **v1 is
  read-only** (confirmed). Accuracy comes from a single trusted calculation over
  source, not from editing the source systems.
- Replacing Smart Palm or SAP themselves.

---

<!-- Everything below the line is DERIVED, not written by hand. Keep this ≤1 page.
     Do not add schemas, endpoint tables, or page specs here. -->
