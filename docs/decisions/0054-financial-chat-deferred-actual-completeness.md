---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# Financial chat deferred actual completeness

## Context

The owner deferred the completeness-confirmation process and explicitly chose to
keep that decision for the PoC rather than reopen it during the plan review.

## Decision

Defer the operator/business process for confirming Actual completeness. Retain
decision 0048: without confirmed Plant/month coverage in the active generation,
complete Actual is null with "Actual data not loaded", not zero or a complete total.

## Consequences

The PoC loader may activate a structurally valid, independently reconciled source
generation with unconfirmed Actual coverage. Reconciliation proves faithful import,
not upstream business completeness. Do not require an unresolved confirmation
workflow to implement/import, and do not silently declare DUB April-August complete.
Budget coverage remains separately validated from its monthly source leaves.

With no confirmation process in this PoC, the supplied workbook's Actual coverage
starts unconfirmed. Its real demonstration must show unavailable complete Actual,
gaps and unavailable comparisons/deltas where required; no full-data demonstration
claim is authorized. Numeric Actual, loaded-zero and prepared-drill behavior is
proved with explicitly synthetic complete-coverage fixtures through the real
application/warehouse boundary, never presented as confirmed customer data.

Named live questions still prove correct selection, access and coverage-dependent
outcomes. Record fixture-based numeric proof separately from real-source unavailable
states. A future complete-customer-Actual demonstration needs explicit business
coverage confirmation and a separately agreed way of recording it.

This accepted PoC limitation resolves the scope question, not an independent review
result or story approval. All other accuracy, permissions, source reconciliation,
model-vendor prerequisites and existing-report preservation rules remain unchanged.
