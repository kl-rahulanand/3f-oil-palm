---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-11
stories: [mis-statement]
---

# The statement reads its own governed projection at leaf/month grain; the GL-month relation is untouched

## Context
Three GLs carry non-zero July budget on more than one statement line — `50001605`
Fertilizers (₹1,73,891.67 / ₹1,34,729.67 / ₹330.87 across Primary, Secondary and
Tertiary nursery), `50001606` Pesticides and `50001901` Nursery labour. The shipped
governed relation rolls Actual up to `(gl_code, month)` with the SAP cost centre
deliberately a **filter**, never an output dimension (decisions **0016** and **0017**),
so it returns **one Actual per GL** and the statement cannot place it on the right line.

The first design proposed changing that roll-up's grouping key from `gl_code` to a
"governed line", while claiming 0016/0017 were unchanged. The plan grill rejected that
on both counts: it **is** a change of governed shape, and the shipped `mis-selection`
route, the semantic domain (`backend/src/semantic/semanticLayer.ts`) and the planned
`drill-down` story all deliberately read GL-month rows. Mutating the shared relation
would risk proven, shipped behaviour to serve a new consumer.

This is also where decision **0016 §2**'s deferred *Budget-label → SAP-cost-centre
mapping master* lands: its revisit trigger was "the client supplies the mapping, OR
multi-cost-centre / multi-plant governed reporting is required", and the statement
requires exactly that.

## Decision
The statement reads a **separate governed projection** at **leaf/month** grain. It
follows decision 0017's principle unchanged — filter the Actual side by the Mapping
Master's resolved `(plant, cost centre, GL)` triples **before** aggregating — then maps
each triple to its **stable statement leaf key** (decision 0021) and full-outer-joins
Budget and Actual at that grain.

The existing `(gl_code, month)` relation is **left exactly as it is**. This is recorded
as a **new governed shape**, not as "0016/0017 unchanged": the statement projection adds
a governed output grain that did not exist before, and the SAP cost centre remains not
an output dimension — what the statement reads back is a **master-defined line**.

The budget-leaf ↔ SAP `(cost centre, GL)` correspondence is recorded in the versioned
Mapping Master as **provisional with a reason**, following the pattern `mis-selection`
established: the Primary / Secondary / Tertiary correspondence is legible from the two
vocabularies but is **recorded, never inferred at runtime**, and Srihari's confirmation
resolves it exactly as the `unmapped-GL` bucket is resolved.

> **Amended 2026-09-11 (implementation evidence).** This record specified the projection
> at **leaf/month** grain. That multiplied rows against the governed `LIMIT`: the FY 26-27
> YTD block spans twelve months over eighty leaves — **960 rows against a default
> `maxRows` of 1000** — so the statement was forty rows from **silently truncating** and
> under-reporting, with no error. The projection therefore aggregates over the requested
> period **range**, returning **one row per leaf per block**, and a query that returns
> exactly the limit now fails loudly instead of returning a short statement. The substance
> of this record is unchanged: it is still a **separate** projection, the `(gl_code,
> month)` relation is still untouched, the SAP cost centre is still never an output
> dimension, and Actuals are still filtered by the resolved triples before aggregating.

Confirmed by the human on 2026-09-11.

## Consequences
- `mis-selection`, the semantic domain, the assistant and the future `drill-down` story
  keep the GL-month shape they were built and proven against; none of their tests or
  gated proofs change.
- The three multi-component GLs split correctly across Primary / Secondary / Tertiary,
  which is the whole reason the statement can foot against Srihari's workbook.
- There are now **two** governed shapes to keep honest. Both must stay behind the same
  grants, scope injection and provenance (decision 0016), and the statement projection
  must carry a no-fan-out proof of its own — a leaf/month grain has its own fan-out risk.
- Decision 0016 §2's deferred Budget-label mapping is **taken up here**, scoped to the
  one nursery selection, and stays provisional until the client confirms it.
