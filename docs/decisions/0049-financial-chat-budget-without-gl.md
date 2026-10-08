---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# Financial chat includes Budget items without a GL in grouped answers

## Context

The owner agreed that a Budget item with no GL code must remain visible when asking
for Budget by GL. Otherwise its amount could disappear and the grouped total would
not match the total for the same Plant/month scope.

## Decision

Include Budget leaf items whose GL is missing in a separate “GL not assigned” group.
Their amounts remain included once in the full Budget total for the same scope.
Do not invent a GL or discard these leaves.

## Consequences

Preserve missing GL as a nullable source attribute, with a stable server-owned grouping
identity distinct from real GL codes. The query and UI must display the named group,
not hide null-key rows. This is a Budget grouping, not an inferred Actual-to-Budget mapping.

Aggregate leaf facts once: hierarchy subtotal rows do not become extra Budget facts.
Prove that GL groups plus “GL not assigned” sum to the complete same-scope Budget
when coverage is complete, including repeated GLs and multiple missing-GL leaves.
Missing coverage remains incomplete, not converted to zero.

Together with [0047](0047-financial-chat-missing-gl-budget.md), this preserves both
Actual-only GLs and Budget leaves without GLs in comparisons. Existing reports and
chat are unchanged; this decision only applies to the new financial chat.
