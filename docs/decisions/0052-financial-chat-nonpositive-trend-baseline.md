---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# Percentage change is not applicable with a nonpositive previous month

## Context

After checking the supplied workbook, the owner agreed that a negative previous
month can make the ordinary percentage-change sign confusing. A source-backed
July-to-August example for AP-AGRI, GL 55010305, demonstrated this case.

## Decision

For month-to-month trends, show the exact monetary change (current minus previous)
when both months are available. Percentage change is null/"Not applicable" when the
previous amount is zero or negative; negative prior values receive the explanation
"previous month was negative". When the prior is positive, calculate
(current - previous) / previous * 100.

## Consequences

Missing current or previous data still makes the corresponding change unavailable.
Preserve source signs, exact amounts and transaction drill-down. Do not replace a
negative previous amount with its absolute value to calculate a percentage.

This concerns month-to-month percentage change for the trend measures, not
Actual / Budget * 100. Existing Actual-vs-Budget percentage rules, report generation
and existing chat remain unchanged.

Contracts, governed calculations, deterministic UI and acceptance proofs must cover
negative-to-positive, negative-to-negative, zero prior, missing periods and positive
prior values. Use synthetic edge fixtures and independent source checks, not committed
customer transaction rows. This decision refines the trend behavior in
[0043](0043-langgraph-financial-chat-poc.md).
