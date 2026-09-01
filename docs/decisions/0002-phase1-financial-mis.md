---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-08-20
stories: []
---

# Phase 1 first deliverable — the Financial MIS from SAP

## Context

On 2026-08-20 Srihari (3F's data owner) sent the first real PoC data and scoped
the opening deliverable: **"For the first phase, we are going with the Financial
MIS Sheet."** He supplied the SAP Base Report (detailed transaction data) as the
source and a sample MIS format. Requirement: generate MIS reports on the
combination of **Plant + Cost Center + GL code**, one sheet per combination,
**zero-filled even when a combination has no transactions** (never skipped).

This narrows and sequences decision `0001-poc-engagement-scope`. Two things it
clarifies that discovery did not anticipate:

1. The first deliverable is a **financial cost report** (budget vs actual by GL),
   not the Yield/ha + OER operational metrics that dominated discovery. SAP is
   therefore also the **financial ledger (FICO)**, not only factory-extraction data.
2. Phase 1 draws from **SAP alone** — Smart Palm is not involved in the Financial MIS.

Source: `docs/context/2026-08-20-srihari-phase1-data/` (email + both Excel files +
structural analysis). Data model and open mapping issues:
`docs/architecture/20-financial-mis-data-model.md`.

## Decision

The first PoC deliverable is the **Financial MIS (Table-2 of the sample format)**,
generated from the SAP Base Report. Each report cell's Actual = `Σ(Debit − Credit)`
of SAP lines matching a **Plant + Cost Center + GL code** for the period; Budget
columns come from planning input, not SAP. Reports are generated per
Plant+CostCenter+GL combination and **zero-filled when empty**. The pilot subject
is the **Nursery (SAP plant `DUB-NUR`)**, the one plant the sample format and
mapping currently cover.

Read-only still holds (per 0001). The Operational MIS (Table-1, Yield/ha + OER and
nursery stock flow) and the chatbot remain later phases.

## Consequences

- **Seven open mapping issues must be resolved with Srihari before build**, because
  the supplied mapping is stale against the live SAP chart of accounts (missing GL
  codes `50001701–50001706`, `50001905`; cost-center tagging that contradicts the
  key; `DUB` vs `DUB-NUR` naming). Detailed in the architecture doc. Building on the
  mapping as-is would silently drop real spend.
- **Whole-company scope is unconfirmed.** "Different MIS sheets per combination"
  could mean one Nursery sheet or one per plant (31 plants in SAP, with different
  cost structures). Phase-1 sizing depends on Srihari's answer.
- **History is not yet available.** The extract is July 2026 only; only the July
  Actual column can be populated now. Prior-FY columns need separate extracts.
- Supersedes nothing; **refines and sequences** 0001. Remains **proposed** until a
  human confirms.
