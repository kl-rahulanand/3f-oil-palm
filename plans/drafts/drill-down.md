---
story: drill-down
title: Actuals drill-down to transactions
decisions_reviewed:
  - 0001-poc-engagement-scope
  - 0002-phase1-financial-mis
  - 0003-mis-presentation-tool
  - 0004-pulse-governed-joins
  - 0005-client-signoff
  - 0006-frontend-fresh-backend-vendor
  - 0007-frontend-framework-nextjs
  - 0008-pulse-vendored-snapshot
  - 0009-required-tests-real-name-and-tsproject
  - 0010-rebrand-pulse-to-3f
  - 0011-deployment-readiness-poc-scope
  - 0012-vendored-api-constitution-deviation
  - 0013-backend-observability-built-in-poc
  - 0014-sap-ingestion-poc-no-master
  - 0015-warehouse-snake-case-deviation
  - 0016-governed-joins-poc-scope
  - 0017-mis-selection-composite-key-seam
  - 0018-mis-selection-unmapped-gl-bucket
  - 0019-fresh-routes-follow-vendored-house-style
  - 0020-mis-budget-leaf-grain
  - 0021-mis-statement-outline-snapshot
  - 0022-mis-statement-governed-projection
  - 0023-mis-statement-drift-reports-not-blocks
  - 0024-drill-down-aggregate-client-projection
  - 0025-drill-down-pinned-batch-raw-read
---

# Actuals drill-down to transactions

## Problem
`mis-statement` ships the Financial MIS as a hierarchy of budget components with derived
subtotals and a grand total. Srihari can now read the number. He still cannot answer the
question that motivated the whole engagement — *how was this number built?* — because every
Actual on that screen is an aggregate over transactions the screen never shows.

This story makes Actuals interactive: click a group and see the leaves that make it up,
click a leaf and see the SAP transaction lines behind it, footing to the paise.

Reading the system for this plan moved the crux twice, and neither place is where the spec
implied it would be.

**The governed relation cannot be pinned to a batch.** The grill settled that a drill must
read the *exact* actual-batch ids the displayed statement was built from — otherwise a
re-upload between render and click silently changes the answer under the user's finger. But
the statement's Actual comes from the `actual_by_key_month` view
(`backend/src/warehouse/warehouse-schema.ts:154`):

```sql
SELECT plant, cost_center, gl_code, month, SUM(debit - credit)::numeric(18,2) AS actual_net
FROM sap_transaction AS txn
INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
WHERE batch.source_kind = 'actuals' AND batch.is_active
GROUP BY ...
```

There is no batch-id parameter. The view *is* "whatever is active now", and
`ingest_batch_active_source_period_unique` guarantees exactly one active actuals batch per
period — so a re-upload flips the whole view with no seam to hold on to. A pinned drill
therefore cannot be a lower-grain read of the same relation; it has to read `sap_transaction`
with an explicit `batch_id IN (…)`. That is not a workaround, it is what makes the required
"the batch was replaced" notice *possible*: pinned ids versus currently-active ids for the
same months is a comparison only the raw path can make.

**Footing is a predicate problem, not an arithmetic one.** `sap_transaction.debit` and
`.credit` are `numeric(18,2)` (`warehouse-schema.ts:67-68`), so the view's `::numeric(18,2)`
cast is a no-op: the statement's paise *are* these rows' paise, summed. The drill and the
statement can only disagree by reading a **different set of rows** — a different batch, a
different triple set, a different month range. So "foots in exact paise" is testable as an
identity between two predicates, and the tests assert equality, never a tolerance.

This is also why the pinned batch set has to be *complete*, not merely *valid* — see
**Binding the pinned batch set** below. A client that omits one month's batch narrows the
read, which is harmless for authorization and fatal for footing.

**Most of the drill does not need the server at all.** The grill settled that a non-leaf
opens *its descendant leaves*, not transactions. `MisStatementNode` already carries `sNo`,
`budgetComponent`, `glCode` and `children`; each `MisStatementMeasureBlock` carries `budget`,
`actual` and `percentage`; and `FixedScaleMoney` is a fixed two-decimal string, so summing
descendants in exact paise is decidable on the payload the browser already holds. The
approved prototype agrees — its L1 panel is *S.No · Sub-line · GL code · Budget · Actual · %*
plus a Total row, which is precisely a flatten of the clicked node. One click crosses the
network in this story: **leaf → transactions** (decision **0024**).

That matters for the security load. The leaf step is the only place raw rows are exposed —
the documented exception to the aggregate-only / k-anonymity rules the governed layer
(`backend/src/chat/suppression.ts`) enforces everywhere else — so it is the only place that
needs the RBAC re-check and the audit record, and it gets all of the review attention.

**And it has no audit to inherit.** `AuditService.writeRequestEvent` — the fail-closed
writer, documented "if the request event cannot be written, the query MUST NOT execute" —
has exactly one caller in the repo: `backend/src/chat/chat.service.ts:317`. `POST
api/mis/statement` writes nothing. The drill cannot point at the statement's audit; it must
establish the pattern. The statement's own gap is recorded as **D-0036**, not widened into
this story.

## Scope / Non-goals

**In scope**
- One new backend route returning the transaction lines behind a **leaf**, pinned to the
  statement's actual-batch ids, server-paginated, with an exact full-result footer.
- A pre-query, **fail-closed** audit record for every drill.
- The drill panel from the approved prototype: scrim, breadcrumb, title, total + meta, sort
  chips, close, and both body states (leaf list / transactions).
- The Actual-only affordance on the statement: every Actual cell in the tree **and** in the
  grand-total footer is activatable; Budget, Roll-over and % are inert.
- The batch-replaced notice, and the stale-snapshot refusal.

**Non-goals**
- **Excel export of transactions** — the statement spec's bundled sheet is deferred as
  **D-0035**; this story is UI-only, as the grill settled.
- Drilling Budget, Roll-over or % — inert by acceptance criterion, not by omission.
- Any write path, and any drill below the transaction line.
- Auditing the statement and export routes (**D-0036**).
- Any change to `actual_by_key_month`, to the statement projection, to `MisStatementNode`, to
  the statement response, or to the k-anon suppression used by the aggregate paths.
- Any schema migration: `sap_transaction` and `audit_events` already carry everything needed.

## Acceptance Criteria
1. **Leaf foots in exact paise.** For a leaf line on the July statement, the panel's footer
   `Value` total equals that leaf's `actual` `FixedScaleMoney` string exactly — compared as
   paise, never as the display-rounded rupee.
2. **Derived group foots.** Opening a non-leaf lists **all** descendant leaves (not just
   immediate children) and its Total row equals the clicked node's `actual` exactly.
   Demonstrated at a three-level node (`9 Admin Expenses` → `9.01 Vehicle Maintenance` →
   leaf), where "one level per click" would have been wrong.
3. **Grand Total behaves the same way.** `grandTotal` is a *sibling* of the tree with
   `children: []` (`mis-statement.service.ts`), so a generic flatten of its children yields
   nothing. Clicking it flattens the **roots of `response.tree`** instead — which already
   include the synthetic `unmapped-GL` root — and its total equals the statement's grand
   total.
4. **FY-YTD drill spans batches.** A leaf drilled on the FY 26-27 YTD block foots across
   several monthly actuals batches, and the panel names each contributing batch.
5. **`unmapped-GL` drills.** The bucket line (decision **0018**) is a **reserved node key**,
   synthesised by the statement and deliberately absent from the outline snapshot. It maps to
   the reserved leaf key `unmapped-GL`, whose triples are the resolver's `leafTargets` with
   `target.kind === "bucket"`. It opens its transactions and foots like any other leaf.
6. **Sort and tie-break are deterministic.** Default order is `Value` ↓ then `Month` ↓, then
   `posting_date` ↓, `txn_no`, `line_id`; requesting the same page twice returns the same
   rows in the same order.
7. **Budget, Roll-over and % do nothing on click** — no handler, no cursor affordance, no
   focusable control.
8. **Scope is enforced and nothing leaks.** A user without the target plant in scope is
   refused, and the refusal body carries **no** transaction rows, counts or totals. A user
   without the `mis-statement` domain grant or the `report` action is refused identically.
9. **The outline is pinned with the batch.** With the statement on screen and the *budget*
   period re-uploaded, the drill resolves `nodeKey` against the pinned budget snapshot and
   still reads the leaf that was clicked — it does not follow the newly active outline.
10. **Refused attempts are audited.** An unauthorized drill writes its own audit event naming
    the actor and the predicate **as submitted**; the resolved predicate never appears in it.
11. **Audit is pre-query and fail-closed.** Each drill writes an `audit_events` row naming the
   actor, the predicate (leaf, triples, month range) and the pinned batch ids **before any
   `sap_transaction` read**; with the audit insert failing, the endpoint errors and **no
   transaction query is issued**. The resolver and outline lookups that *derive* the
   predicate necessarily precede the audit write — the record cannot name a predicate that
   has not been computed — and they read only mapping and outline metadata, never a raw line;
   they are the same lookups the already-shipped statement route makes.
12. **Re-upload after display.** With the statement on screen and its period re-uploaded, the
    drill still foots to the displayed number *and* states that the batch was replaced.
13. **An incomplete pin is refused, not answered.** If the pinned set does not cover every
    month in the block's range that has an actuals batch, the endpoint refuses as a stale
    snapshot. It never returns a partial footer.
14. **Pagination is server-side and the footer is not.** With a result larger than one page,
    the response carries the total matching count and totals over **all** matches; the footer
    on screen never equals a page subtotal. An out-of-range or non-integer page is a 400; an
    empty result is a zero-row success with a zero footer.
15. **The footer matches the statement on screen.** It renders through the statement's own
    rupee formatter, with the exact paise value on a secondary line.

## Technical Approach

### The predicate, once
Everything the drill does is one predicate, derived **server-side** on every request:

| term | source | never from |
|---|---|---|
| leaf key | `nodeKey` → the **pinned** budget batch's outline snapshot, **or** the reserved key `unmapped-GL` | the client's idea of the leaf |
| `(plant, cost centre, GL)` triples | `SelectionResolverService.resolve(request).leafTargets` filtered to that leaf (`target.kind === "leaf"` with matching `leafKey`; `target.kind === "bucket"` for the reserved `unmapped-GL`) | the client |
| month range | the block key re-run through the statement's own `blockDefinitions` | the client's dates |
| plant scope | `user.scope` where `attribute === "plant"` | the client |
| pinned batch ids | the request (`provenance.activeBatchIds` verbatim, split by source server-side), bound by the completeness rule below | — |
| mapping master | the compiled-in `MIS_MAPPING_MASTER` constant and its `version` | anywhere mutable |

`nodeKey` is accepted only if it is a **leaf** in the current outline snapshot or the
reserved bucket key; a non-leaf or unknown key is a 400. Only the pinned ids come from the
browser, and they can only **narrow** the read — which is what makes accepting them safe for
authorization, and exactly why they need their own completeness rule for footing.

### Binding the pinned batch set
`provenance.activeBatchIds` is statement-wide: both sources, all blocks. The client sends it
**verbatim** and the server splits it by `source`; each entry carries its `period`, so the
actuals set is month-keyed.

**The budget batch is pinned too, and that is not decoration.** The statement's row structure
is the budget batch's outline snapshot (decision **0021**), and both
`StatementOutlineRepository.findByBudgetPeriod` and the projection's `outline_order` CTE
filter on `batch.is_active`. A budget re-upload between render and click therefore swaps the
`nodeKey → leaf key` mapping, and the drill would read a *different leaf's* transactions out
of a perfectly pinned actuals batch — footing broken with every batch id correct. So the leaf
is resolved against the **pinned** budget snapshot, which means `StatementOutlineRepository`
gains a by-batch-id lookup beside its by-period one. The mapping master needs no pin:
`mis-mapping-master.ts` is a compiled-in constant (decision **0014** — no governed master in
the PoC) and cannot drift inside a running process; the audit record names its `version` so a
deploy-time change stays traceable.

The actuals set is bound as follows, and the single budget id by the same replaced/gone rules:

- compute the months in the block's range that have an actuals batch at all;
- require the pinned set to carry **exactly one id per such month** — a missing month is a
  stale snapshot and a **refusal**, never a partial answer (criterion 11);
- an id that is not an actuals batch for its stated month is a 400;
- an id that *is* valid but is no longer the active batch for that month means the period was
  re-uploaded: **read the pinned batch** and report the replacement (criterion 10);
- an id that no longer exists at all is reported as gone, distinctly from replaced, and is
  likewise a refusal rather than a substitution.

A wrong footer is then unrepresentable: either the pin covers the range and the drill foots,
or the request is refused with a reason.

### Request and response
`POST api/mis/statement/drill` — unversioned path, raw response, DTOs beside
`mis-statement.dto.ts`, direct module imports (decision **0019**). It inherits the global
`CsrfGuard` (`app.module.ts` registers it as an `APP_GUARD`), so the request carries the
`x-csrf-token` header like the export route, and `AuthGuard` + `RequireAction("report")` like
the statement route.

The request extends the shape the export control already round-trips successfully
(`department`, `function`, `plant`, `period` — see `use-mis-statement.ts`) with `nodeKey`,
the measure `block` key (`"selected" | "fy26-27-ytd"`), the statement's
`provenance.activeBatchIds` passed through as `pinnedBatches`, and a 1-based `page`. Page size is fixed server-side at **100** rows; it is not client-settable, so
it cannot be pushed toward `maxRows`. **No change to `MisStatementNode` or to the statement
response is required** — the statement already puts `nodeKey`, `scope` and
`provenance.activeBatchIds` on the wire.

The response carries the page of lines (`month`, `postingDate`, `debit`, `credit`, `value`,
`reference`, `memo`), the **total matching count**, the page number and size, exact
full-result totals as `FixedScaleMoney`, the batch ids actually read, and a batch-state
discriminator (`current` | `replaced`). Money stays a fixed-scale string end to end — the
statement's `FixedScaleMoney` discipline — so no value ever passes through a JS `number`.

Refusals are the house error DTO with no rows, counts or totals in the body: **400** for an
invalid payload, unknown or non-leaf `nodeKey`, bad page, or a batch id that is not an
actuals batch for its month; **401** unauthenticated; **403** for CSRF, plant scope or the
governed grant; **409** for a stale or vanished pin. An **empty result is a success**, not an error: zero
rows and a zero footer. All four are declared with
`@ApiResponse` alongside the success schema, matching `mis-statement.controller.ts`.

Column semantics are fixed by the grill: `Value = Debit − Credit`, `reference` is SAP
**Reference 1**, `memo` is **LineMemo** — which is exactly what `sap-ingestion` already wrote
into `sap_transaction.reference` and `.memo`.

### The read path
A dedicated repository beside the governed executor (decision **0025**), following the house
precedent set by `StatementOutlineRepository` — string SQL over `Warehouse.execute` — but
reusing the governed guards rather than reimplementing them: `SelectionExecutor.authorize`
plus the statement's plant-scope check, then `SqlValidator.validate` (object allowlist, no
`SELECT *`, mandatory bounded `LIMIT` ≤ `maxRows`), then `warehouse.explain`, then execution
under the configured timeout.

Two statements per drill, under one audit record: the page (`ORDER BY (debit - credit) DESC,
month DESC, posting_date DESC, txn_no, line_id` with `LIMIT`/`OFFSET`) and the footer
(`COUNT(*)` and the three `SUM`s, `LIMIT 1`). Both read `sap_transaction` joined to
`ingest_batch`, under the identical predicate, so the footer cannot drift from the page.

The composite index `idx_sap_transaction_month_plant_cost_center_gl_code` covers the
selective part of the predicate.

### The audit record
Written inside the same "before execute" discipline chat uses: derive the predicate, build
the SQL, write the record, and let a throw abort before `sap_transaction` is touched.
`audit_events` already has the columns — `question` for the human-readable drill description,
`selection` (jsonb) for the predicate and pinned ids, `generated_sql`, `objects_touched`, and
`session_id` from the existing `@SessionId()` decorator (`backend/src/auth/auth.guard.ts:100`).
**No migration.**

Two things the shipped `AuditService` does not yet give, both additive:

- **A typed drill payload.** `writeRequestEvent` types its `selection` as the governed
  `Selection`, which has no room for a node key, resolved triples or pins — a generic call
  would satisfy "an audit was written" while losing exactly the facts a raw-row disclosure
  investigation needs. The drill gets its own typed event carrying actor, node key, resolved
  leaf key, triples, month range, pinned actuals **and** budget ids, mapping-master version,
  SQL and objects touched. `audit_events.selection` is already `jsonb`, so this is a
  TypeScript widening, not a schema change.
- **Refused attempts are audited too.** A drill refused *after* the predicate is derived
  (stale pin, vanished batch) already has its record. One refused *before* it — no plant
  scope, no `report` grant, no domain — currently leaves no trace, and a probe against the
  raw-row endpoint is precisely the event worth keeping. Authorization refusals get their own
  event type carrying the actor and the predicate **as submitted**, never the resolved one:
  echoing back what the caller was not allowed to see would itself be a disclosure.

### The panel
The approved prototype's drill overlay, rendered from `docs/design/3F-Financial-MIS`: scrim,
eyebrow "Drill-down", breadcrumb (group › sub-line), title, total + meta line, "Sorted"
chips, and a close control. Body is one of two states — the client-side leaf list (decision
**0024**), whose Total row foots by construction; or the transactions table with its Total
row and the prototype's "Matches the Actual in the report" note. The prototype's guidance
copy ("Click any Actual to see its transactions. Budget is not drillable.") is kept.

**The footer reads in rupees, with paise beneath.** The statement rounds its Actual to whole
rupees (`formatMoney` in `statement-view.tsx`), so a paise-precise footer can sit up to ₹1
away from the cell that was clicked while both are correct — and the prototype's footer
claims "Matches the Actual in the report". The footer therefore renders through the **same
rupee formatter as the statement**, with the exact paise value on a secondary line for a user
verifying to the paise. The equality the tests assert stays a paise equality.

**One deliberate departure from the prototype:** the transactions table gains a seventh
column, **Posting date**, in the prototype's own styling. The spec's Behaviour section lists
it among the line-item columns, and it is the field a finance user cross-checks against SAP —
a line's `month` is its booking month, not the day it was posted. The prototype predates the
settled deterministic tie-break, which also uses posting date. Every other aspect of the
panel follows the design as drawn.

Each Actual cell becomes a real `<button>` inside its `gridcell` so the `role="treegrid"`
table keeps a valid structure and the affordance is keyboard-reachable; Escape closes, focus
returns to the cell that opened the panel.

## Decisions
- **0024 — The aggregate drill is a client projection of the statement payload; only the leaf
  drill crosses the network** (accepted 2026-09-11). Rationale: the payload already carries
  every field the prototype's aggregate panel shows, in exact-paise strings.
- **0025 — The transaction drill reads `sap_transaction` under a pinned batch predicate,
  beside the governed executor** (accepted 2026-09-11), reusing its authorization, validator,
  explain and timeout, with a pre-query fail-closed audit record. Rationale:
  `actual_by_key_month` takes no batch parameter and the governed executor is measure-shaped.
- Inherited and load-bearing here: **0017** (triples filter the Actual side before roll-up),
  **0018** (`unmapped-GL` is explicit and visible — so it drills, as a reserved key),
  **0020** (Actuals attach at the GL leaf; parents are derived — so an aggregate has
  descendant leaves to flatten), **0021** (the outline snapshot is what maps `nodeKey` →
  leaf), **0022** (the statement's own projection, whose numbers the drill must foot to),
  **0019** (unversioned route, raw response, direct module imports, typed error responses).

## Risks
- **Pinned ids that no longer exist.** A batch can be deleted or deactivated between render
  and click. The drill distinguishes *replaced* (read the pin, say so) from *gone* (refuse),
  and in neither case substitutes the active batch silently. Covered by criteria 12 and 13.
- **Trusting the client's node key.** If `nodeKey` were taken at face value, a crafted value
  could widen the triple set. Mitigated by re-deriving the leaf and its triples from the
  outline snapshot and the resolver on every request, by allowing exactly one reserved key
  outside the snapshot (`unmapped-GL`), and by rejecting everything else.
- **`SqlValidator` is a parser gate.** It astifies the SQL with `node-sql-parser`; a
  construct it cannot parse blocks the read rather than allowing it. Keep the drill SQL to
  the shapes already proven by the statement projection.
- **Sorting is not indexed.** `ORDER BY (debit - credit) DESC` has no supporting index; the
  filter is selective enough that this is a sort of a small set, but the plan checks it with
  `EXPLAIN` on the real July batch rather than assuming.
- **Offset pagination.** Stable only because the total order is fully deterministic
  (criterion 6). If the tie-break were ever relaxed, pages would overlap.
- **The panel is an overlay on a `treegrid`.** Focus management and the Escape/scrim
  behaviour are the parts most likely to regress silently; the functional check covers them.

## Verify Plan
- **Backend unit** — predicate derivation (leaf mapping including the reserved bucket key,
  triple filtering, block → range), the batch-binding rule in all four states (complete /
  incomplete / replaced / gone), page validation, and refusal shapes carrying no rows.
- **Backend DB-backed** (gated host evidence, **D-0008**) against the pinned July batch:
  exact-paise footing for a leaf and for `unmapped-GL`; deterministic ordering across
  repeated page requests; page-vs-footer totals on a result larger than one page; and the
  `EXPLAIN` check on the sort.
- **The FY-YTD proof needs a fixture, and the plan says so.** The supplied SAP extract
  contains **July only** (`docs/context/2026-08-20-srihari-phase1-data/README.md`), so
  "foots across several monthly batches" **cannot** be demonstrated against client data. The
  DB-backed suite constructs a deliberate multi-period actuals fixture (two or three synthetic
  months over the same triples) for criteria 4 and 13. What client data proves — exact July
  footing, the three-level group, `unmapped-GL` — is proven against client data; what it
  cannot is proven against a fixture and labelled as such in the evidence.
- **Outline pinning** — a DB-backed test that re-uploads the budget period after the
  statement is built and asserts the drill still resolves the clicked `nodeKey` to the leaf in
  the pinned snapshot, not the newly active one.
- **Audit** — a test that makes the audit insert fail and asserts `sap_transaction` was never
  queried; one asserting the written row's predicate, batch ids and mapping-master version;
  and one asserting an unauthorized attempt is recorded with the submitted predicate and not
  the resolved one.
- **Frontend unit** — the aggregate flatten sums descendant leaves to the clicked node's
  `FixedScaleMoney` for a three-level node, and the Grand Total case flattens `response.tree`
  roots to the grand total; Budget/Roll-over/% expose no control; the batch-replaced notice
  and the stale-snapshot refusal render.
- **Functional check** (`user_facing` tasks) — live, against this worktree's servers: open the
  statement, drill a group, drill a leaf from within it, compare the footer to the statement
  cell, page a large result, and confirm design parity with the prototype panel including the
  added Posting date column.
- Every automated artifact records the **executed count and the testcase name**, not the exit
  code (D-0024, D-0031).

## Surface Impact
- **New:** `POST api/mis/statement/drill` and its DTOs beside `mis-statement.dto.ts`, contract
  types for the drill request/response, a transactions repository in `backend/src/warehouse/`,
  and the drill panel plus its hook and styles in `frontend/src/features/mis/`.
- **Changed:** `statement-view.tsx` — Actual cells become activatable and own the panel state.
  `StatementOutlineRepository` gains a by-batch-id lookup beside its by-period one, and
  `AuditService` gains a typed drill event beside `writeRequestEvent`. Both are additive; no
  existing caller changes.
- **Unchanged:** the statement response contract, the statement projection, the semantic
  layer, `actual_by_key_month`, the suppression path, and the database schema. No migration —
  `audit_events.selection` is already `jsonb`.

## Task Decomposition
Three bounded tasks, sequential. No task spans backend and frontend — `WORKFLOW.md` forbids
it, and only the frontend tasks are `user_facing`.

1. **drill-transactions-api** (backend, `user_facing: false`) — the pinned, audited,
   paginated leaf read: predicate derivation including the reserved `unmapped-GL` key, the
   batch-binding rule and its four states across **both** pinned sources, the outline
   by-batch lookup, the typed drill audit event including refusals, the repository, the route
   with its typed error responses, contract types, and the multi-period fixture the FY-YTD
   proof needs.
2. **drill-panel** (frontend, `user_facing: true`) — the prototype's overlay and the Actual
   affordance, with the aggregate state rendered entirely from the statement payload,
   **including the Grand Total case that flattens `response.tree` roots**. Needs no network,
   so it is demonstrable the moment it lands.
3. **drill-transactions-view** (frontend, `user_facing: true`) — the leaf state: wire the
   endpoint, the transactions table with its seven columns, the rupee footer with its exact
   paise line, pagination, the empty-result state, and the batch-replaced / stale-snapshot
   notices.

**Why the frontend is two tasks.** The aggregate state and the leaf state share only the
panel shell; one is a pure projection of data already on screen, the other is the consumer of
a new network path with its own failure and pagination states. Splitting them keeps the
second task's review focused on the part that can actually be wrong.
