---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# Financial chat shows an Unmapped row in component groupings

## Context

The owner agreed to retain Actual transactions with no Nursery component mapping in
an “Unmapped” row when showing Actuals by Nursery component, with drill-down available.
Omitting this row would make an unfiltered component breakdown disagree with the
same Plant/time Actual total.

## Decision

For an unfiltered Nursery-component breakdown, include permitted known-Plant Actual
lines without a recorded component mapping exactly once under “Unmapped”. Prepare
their transaction drill-down while forming the answer, like other clickable Actuals.

## Consequences

Mapped component leaves plus Unmapped reconcile to the same-scope Plant Actual when
coverage is complete. Derived hierarchy parents are subtotals, not additional facts
to add again. A named component or hierarchy-parent filter continues to exclude
unrelated Unmapped lines; this row is not assigned to any real component.

No Budget is allocated to Unmapped and no component is guessed. Unknown-Plant rows
remain excluded from ordinary chat and retained in operator reconciliation only.
Existing authorization, missing-data and detail-preparation failure rules still apply.

Add independent query, prepared-transaction and browser acceptance evidence for the
Unmapped row and its full contributing transaction total. This affects only the new
chat; existing reports and chat remain unchanged.
