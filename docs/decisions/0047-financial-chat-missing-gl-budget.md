---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# Financial chat preserves Actuals when a GL has no Budget line

## Context

The owner confirmed that, when Budget is loaded for the selected Plant/month but a GL
has Actuals and no corresponding Budget leaf, the new chat must not invent a zero
Budget or hide those Actuals. The owner explicitly confirmed that their transaction
drill-down must remain available.

## Decision

Keep the GL's exact warehouse Actual and its prepared transaction drill-down. Return
Budget as null with the label “No Budget line for this GL”, and percentage as null
with the label “Not applicable”.

This is distinct from “Budget not loaded for this Plant or month” and from a real
loaded Budget of zero. Missing Budget is not a reason to remove an Actual row,
disable its drill-down, or exclude its contributing transactions.

## Consequences

The shared contract, query service, deterministic answer, React display and acceptance
checks must preserve these distinct states. The full matching transaction total must
equal the displayed Actual; a first page is not the full total.

This decision applies only to the new financial chat. Existing chat, report generation,
report imports, exports and drill-down behavior remain unchanged.

This does not settle the separate question of how a Budget leaf without a GL is grouped.
It builds on decisions [0042](0042-agent-ready-financial-warehouse.md),
[0043](0043-langgraph-financial-chat-poc.md) and
[0044](0044-typescript-chat-preserves-reports.md).
