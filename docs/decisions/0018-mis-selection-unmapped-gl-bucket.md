---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-10
stories: [mis-selection]
---

# Unresolved composite-key triples map to an explicit unmapped-GL bucket, never inferred and never dropped

## Context
The `mis-selection` requirements grill (2026-09-10) established that, after normalizing
the plant aliases (`DUB-NUR`, `DUB`, display name), the seed workbook resolves only
**66 of 88** DUB transaction rows. Unresolved:

- **7 GLs** — `50001701`–`50001706` and `50001905` — appear in the transactions but carry
  **no stated MIS-line assignment** (11 rows).
- **2 GLs** — `50001902` and `50001903` — have **conflicting cost centres** between the
  workbook's two `Cost Center` columns (11 rows).

That is **22 of 88 DUB rows**, i.e. nine unresolved composite-key triples. Inferring a
target line from similarly-named GLs would invent financial classification nobody
ratified. Dropping them would silently understate DUB spend and break acceptance
criterion 1 ("Selecting Agriculture/Nursery/DUB returns exactly the DUB nursery slice").

This was recorded as deferral **D-0027** and escalated as a missing decision, on the
expectation that Srihari's authoritative Master Table would settle it
(`docs/context/2026-09-01-srihari-requirements-qa.md` §6 — also the spec's own open item).

The human confirmed on 2026-09-10 that the PoC **cannot wait** for that answer, and that
this build is precisely what will be **shown to Srihari** to elicit it.

## Decision
Every unresolved composite-key triple maps, in the provisional master, to a single
explicit reserved MIS line: the **`unmapped-GL`** bucket.

It is a **visible bucket, not a classification**. We do not infer which real MIS line
these GLs belong to, and we do not exclude them. Consequently **every DUB raw triple maps
exactly once** — no row dropped, no row fanned out — and the resolved slice reconciles to
the full DUB actuals total.

The bucket is a first-class, distinctly-labelled outcome of master resolution, carrying
its provisional status so it reads as "awaiting confirmation", not as a real MIS line.
It is the artifact we put in front of Srihari: it shows him exactly which nine triples
(22 rows, with their amounts) still need an authoritative assignment.

Confirmed by the human on 2026-09-10, settling D-0027.

## Consequences
- The provisional master gains explicit rows for all nine unresolved triples targeting
  `unmapped-GL`, each flagged provisional. No runtime inference anywhere: if a triple is
  not in the master at all, that is the separate "no mapping configured" case (0018 does
  not change that), whereas these nine ARE mapped — deliberately, to the bucket.
- A fixture proves the completeness invariant: **every DUB raw `(plant, cost_center, gl)`
  triple resolves exactly once**, the mapped-plus-bucket totals equal the full DUB actuals
  total, and nothing fans out. This is what makes acceptance criterion 1 honest.
- When Srihari returns the authoritative Master Table, resolving those rows is a **data
  change only** — rows move from `unmapped-GL` to their real line with no schema or code
  change. The bucket is expected to shrink to empty; it is not permanent design.
- `mis-statement` must render the bucket **visibly** (its own labelled line), never hide
  or silently merge it — a total that reconciles only because spend was quietly bucketed
  would be worse than an obvious gap. That rendering belongs to `mis-statement`; this
  story owns only the resolution that produces the bucket.
- The two conflicting-cost-centre GLs (`50001902`, `50001903`) go to the bucket **as a
  conflict**, not by silently picking one of the workbook's two `Cost Center` columns.
- Deferral **D-0027** is resolved by this record. The reconciliation against Srihari's
  authoritative master remains tracked as the spec's open item, now with a concrete
  artifact (the bucket contents) to drive it.
