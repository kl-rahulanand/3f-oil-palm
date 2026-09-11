---
status: accepted
confirmed_by: "kl-rahulanand"
date: 2026-09-11
stories: [drill-down]
---

# The transaction drill reads sap_transaction under a pinned batch predicate, beside the governed executor

## Context
Two facts in the built system force this decision.

**The governed relation cannot be pinned.** The statement's Actual comes from the
`actual_by_key_month` view (`backend/src/warehouse/warehouse-schema.ts:154`), defined as
`SUM(debit - credit) FROM sap_transaction INNER JOIN ingest_batch ... WHERE
batch.source_kind = 'actuals' AND batch.is_active`. It takes **no batch-id parameter** — it
is always "whatever is active now". The grill settled that a drill must read the **exact
actual-batch ids the displayed statement was built from**, and say so if that batch has
since been replaced. Neither is expressible against that view.

**The governed executor is aggregate-shaped.** `SelectionExecutor.executeResolved`
(`backend/src/chat/selectionExecutor.ts`) builds from a `DomainSpec`'s measures and
dimensions, labels columns from measure specs, and applies k-anonymity suppression for
`piiSensitive` measures. At row grain there are no measures to name. The spec already calls
the drill "a distinct raw-row read path (a grain change, not a same-grain join)" and an
explicit exception to the aggregate-only / k-anon rules.

The statement path writes **no audit record**: `AuditService.writeRequestEvent` has exactly
one caller, `backend/src/chat/chat.service.ts:317`. So the drill cannot inherit an audit
record; it must write its own.

## Decision
The transaction drill reads **`sap_transaction` directly**, in a dedicated repository
**beside** the governed executor rather than through it, under a predicate of: the resolved
`(plant, cost centre, GL)` triples for the clicked leaf, the block's month range, the user's
authorized plant scope, and an explicit **`batch_id IN (<pinned actual-batch ids>)`**.

It **reuses the governed layer's guards rather than reimplementing them**:
`SelectionExecutor.authorize` plus the statement's plant-scope check for authorization,
`SqlValidator` for the object allowlist / no-`SELECT *` / mandatory bounded `LIMIT`,
`warehouse.explain` before execution, and the configured query timeout.

Every drill writes a **pre-query, fail-closed audit record** — `AuditService.writeRequestEvent`
(which throws on failure) naming the actor, the full predicate, the pinned batch ids and the
generated SQL. **If the audit write fails, the read does not happen.**

Pinned ids are compared against the currently-active actuals batches for the same months; a
difference is **reported to the user**, never silently resolved either way.

## Consequences
- Footing is exact **by construction, not by tolerance**: `sap_transaction.debit` and
  `.credit` are `numeric(18,2)`, so the view's `::numeric(18,2)` cast is a no-op and the
  statement's paise are these rows' paise summed. Divergence can only come from a different
  **row set**, so the footing tests are predicate-identity tests.
- The k-anon suppression path (`backend/src/chat/suppression.ts`) is **not** applied here and
  must not be wired in — this read is the documented exception. The compensating controls are
  the unchanged plant-scope predicate, the governed grant, and the fail-closed audit.
- Accepting client-supplied batch ids is safe only because the triples, the plant scope and
  the month range are **re-derived server-side** on every drill and never taken from the
  client; the batch ids narrow the read, they cannot widen it. A supplied id that is not an
  actuals batch for a month in range is rejected.
- The statement path's missing audit record is a real gap this decision exposes but does not
  fix. It is recorded as a deferral rather than widened into this story.
- A second consumer of raw transactions (the deferred export sheet, D-0035) must go through
  this same repository and audit, not around it.
