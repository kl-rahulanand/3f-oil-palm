---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-11
stories: [mis-statement]
---

# Budget ingest reports mapping drift; it does not block the upload

## Context
Decision **0021** gives each budget leaf a **stable key derived from its identity**. If
Srihari renames or renumbers a line in a reissued workbook, that line's key changes and a
Mapping Master entry targeting the old key now points at nothing — which, unchecked,
silently splits one statement line into a budget-only row and an actual-only row.

The `statement-model` task grill established the check itself but left its **policy**
undefined: does a workbook whose outline no longer matches the master still load? Three
options were put to the human — succeed and report, refuse the upload, or load and flag
the affected lines on the statement itself.

## Decision
**The ingest succeeds.** Unmatched master targets are recorded in the batch's validation
result, alongside the uncomputed roll-over count that is already reported there. Srihari
is **never blocked** from loading a new plan; the drift is visible to us, and we reconcile
the master.

Refusing the batch was considered and rejected: a renamed line would block the client's
upload entirely, and only we could unblock it. Flagging drifted lines on the statement
itself was also rejected — it reaches into `statement-api`'s payload and
`statement-view`'s rendering, beyond the task that detects the drift.

Confirmed by the human on 2026-09-11 during the `statement-model` task grill.

## Consequences
- Budget ingest is **fail-open on drift and fail-closed on money**: a drifted mapping
  still loads and is reported, while an uncomputed Budget cell on a stored row still
  refuses the ingest (decision **0020**) because that would invent a number.
- A statement may show a split line between a reissued workbook and the master being
  reconciled. That window is the accepted cost of never blocking the client's upload.
- A review finding that asks the ingest to **reject** a drifted candidate contradicts
  this record and is not a defect.
- If drift is ever observed in practice and the split line misleads someone, revisit —
  surfacing it on the statement is the option already scoped out here.
