---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# Remaining financial chat PoC rules

## Context

The owner agreed to all four recommendations together after clarification of
fake-model development versus real Claude application calls.

## Decision

1. Missing Cost Center or other supported Actual dimension appears under its explicit
   “<Dimension> not assigned” label, retaining Actuals and prepared drill-down. Never drop
   those rows or fabricate a dimension value. Unknown Plant remains operator-only.
2. Allow at most 200 distinct prepared Actual scopes per answer, including totals.
   This replaces the proposed 50-scope bound. Above the bound ask to narrow before
   executing/promising a financial answer; never silently truncate.
3. Require the existing financial-report permission plus current Plant access.
   Without report permission deny the new chat; without Plant grants show guidance and
   no financial data. No new role or automatic grants are introduced.
4. Develop first with a fake model, then enable real Claude only after application API
   account/model access, billing and client data-handling requirements are confirmed.
   Claude remains the selected model; a fake model is not final acceptance evidence.

## Consequences

Count every distinct advertised Actual scope, including parents, totals, Unmapped,
missing-dimension buckets and zero-valued cells; identical chart/table scopes share a page.
Confirmed empty scopes return empty pages; zero-net scopes may still contain transactions.
Preflight capacity; profile named demo selections against reconciled source before live
acceptance. Do not claim that source-capacity proof has already passed.

Missing-dimension buckets are stable grouping identities, not invented master data.
Unfiltered leaf groups plus the missing bucket reconcile to the same-scope total.
Report permission and Plant grants are rechecked on reads, resume, replay, prepared
cache and pagination. The story pins the exact existing report grant through exported
authorization services, without old-chat logic reuse or widened grants.

Fake-model development still reads validated warehouse financial values, never fake
financial figures shown as customer data. Use synthetic questions until the vendor
check is recorded. This approval agrees to the prerequisite, not a claim that API access,
billing or acceptable retention/residency is already confirmed. Real-Claude selection
and data-boundary checks remain mandatory before final acceptance.

Only the new chat changes; existing reports/chat remain untouched.
Related: [0043](0043-langgraph-financial-chat-poc.md),
[0046](0046-financial-chat-claude-sonnet-first.md),
[0050](0050-financial-chat-unmapped-component-group.md).
