---
issue: sap-ingestion
title: Ingest SAP actuals + budgets
status: approved
saved: 2026-09-09T05:22:47+00:00
story: sap-ingestion
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
---

# Story plan — sap-ingestion (Ingest SAP actuals + budgets)

## Problem
The statement, drill-down, and metrics stories all need SAP GL actuals and the MIS budget in the
**separate warehouse Postgres** (`WAREHOUSE_PG_*`). Today the warehouse adapter
(`backend/src/warehouse/postgres.adapter.ts`) and `Warehouse` port are **read-only/EXPLAIN-guarded**:
there is no ingest path, no write pool, no `warehouse:migrate`, and no SAP tables. This story brings
the July 2026 Nursery/`DUB` pilot data in reliably and idempotently.

## Scope / Non-goals
**In:** ingest the SAP Base Report (Excel upload) → raw `sap_transaction` + a paise-precise
`actual_by_key_month` gold view; ingest the MIS budget as a SEPARATE `mis_budget` object; an immutable
`ingest_batch` registry with idempotent per-period replace; the July DUB reconciliation.
**PoC scope decision (client, 2026-09-09): NO governed mapping master.** Ingest the mapping + budget
DIRECTLY from the two provided workbooks under `docs/context/2026-08-20-srihari-phase1-data/`
(`SAP Entries Mapping.xlsx` — Sheet1 "New SAP", incl. `DUB-NUR→DUB`; `Nursery MIS Format.xlsx`), with
their coverage taken as-is.
**Non-goals (deferred):** the query-time budget⋈actual join → governed-joins; the drill-down UI →
drill-down; a governed mapping master + derived budget allocation → mis-selection / governed-joins;
live SAP sync + the full backfill (spec "out of scope now"). Per **0004**, ingestion must NOT
pre-join.

## Acceptance Criteria
1. The July `DUB` load reconciles EXACTLY to **₹11,512,712.07** (paise) across accepted raw rows AND
   the `actual_by_key_month` gold view, and against a frozen in-repo reconciliation fixture.
2. The MIS budget is present as a separate `mis_budget` object (not pre-joined to actuals).
3. Raw transaction lines are retained (all source + drill fields + original & canonical keys, linked
   to their `ingest_batch`) so a later drill-down can reach them.
4. Re-uploading July replaces that month with no duplicates: a new `ingest_batch` becomes active and
   the prior batch is retained (auditable), never erased.
5. Actual net = Debit − Credit; the `DUB-NUR → DUB` normalization is applied from the provided mapping
   workbook.

## Technical Approach
Warehouse schema (arch `30-financial-mis-build-plan.md:70-84`; fresh-schema conventions per
`constitution/pnp-database-standards.md`):
- `ingest_batch(id, source_kind['actuals'|'budget'], period(month), canonical_plant, uploaded_by,
  uploaded_at, row_count, validation_result, reconciliation_result, is_active)` — exactly one active
  per `(source_kind, period, canonical_plant)`.
- `sap_transaction(batch_id, txn_no, line_id, posting_date, month, plant, plant_src, cost_center,
  gl_code, acct_name, debit numeric(18,2), credit numeric(18,2), memo, reference, created_at)` —
  indexes on `(month,plant,cost_center,gl_code)` and `batch_id`.
- `actual_by_key_month` — a **plain view** (not matview) over the ACTIVE actuals batch, `Σ(debit −
  credit)` (paise) by `(plant,cost_center,gl_code,month)`.
- `mis_budget` — budget lines linked to a budget `ingest_batch`, stored as-provided.
A warehouse **write pool + ingestion repository** distinct from the read-only query port, and a
reproducible `warehouse:migrate`. Upload endpoints follow the pins-controller auth pattern
(`@UseGuards(AuthGuard)` + `RequireAction('ingest')`, typed multipart DTO, Swagger, CSRF), added to
the strict route allow-list. `exceljs` (the pre-committed ingestion lib) parses header-identified,
single-month files, validating ALL rows before any write. Synchronous upload for the PoC (BullMQ
workers deferred).

## Decisions
- **0002** — Actual = Σ(Debit−Credit) per Plant+CostCenter+GL; budgets from planning input, not SAP.
- **0004** — Budget and Actual are separate objects joined at query time; this story does NOT pre-join
  and does NOT build the join (governed-joins owns it).
- **0008** — DB-backed proofs run as demonstrated host evidence (docker warehouse, `WAREHOUSE_PG_*`);
  `verify.py` alone does not run them.
- **New — `sap-ingestion-poc-no-master`** (record via `forge decision new`): for the PoC, mapping +
  budget come straight from the provided workbooks; a governed mapping master + budget allocation are
  deferred to mis-selection / governed-joins. Supersedes the requirements-grill's balanced-allocation
  answer for the PoC.
- **Precision (grill correction)** — July DUB totals ₹11,512,712.07; preserve paise in raw + gold,
  reconcile paise-exact, round only a displayed aggregate; no statement total is asserted here.
- **New `ingest` RBAC action grant** (constitution §9 — not a silent default): the ingestion
  endpoints require it; existing grants are admin/save/pin only.

## Task Decomposition
1. **warehouse-schema** — the write pool + ingestion repository + `warehouse:migrate`; create
   `ingest_batch`, `sap_transaction`, `mis_budget`, and the `actual_by_key_month` view; the view
   returns paise Σ(debit−credit) by key/month over seeded rows.
2. **actuals-loader** — `exceljs`; `POST /api/ingest/actuals` (AuthGuard + `ingest` grant + allow-list
   + typed DTO + Swagger + CSRF/forbidden tests + structured logging); header-identified single-month
   parse with validate-before-write + row diagnostics; `DUB-NUR→DUB`; net Debit−Credit at paise;
   retain raw + keys; idempotent replace = new active `ingest_batch`, prior retained.
3. **budget-loader** — `POST /api/ingest/budget` (same guard/role/allow-list); load
   `Nursery MIS Format.xlsx` into `mis_budget` as a SEPARATE object, as-provided, no allocation, no
   Actuals mutation; atomic per-(period,canonical_plant) batch replace.
4. **reconciliation-proof** — a demonstrated warehouse-DB test grounding July `DUB` net to EXACTLY
   ₹11,512,712.07 across raw + gold against a frozen fixture; re-upload replaces the month with no
   duplicates.

## Risks
- **Mapping coverage (PoC):** the provided workbook doesn't map every DUB GL (7 GLs absent, ~11
  unmapped, a cost-center conflict). Mitigation: the raw+gold reconciliation is mapping-independent
  (Σ over raw rows); mapped/reportable categorization is deferred to later stories per the client's
  no-master decision; unmapped rows are retained raw.
- **Warehouse write path is new:** must not mutate the read-only query seam — a dedicated write pool.
- **Precision drift:** integer rounding would mis-reconcile; all money is `numeric(18,2)` paise.
- **Idempotency correctness:** the active-pointer switch must be atomic under a re-upload.

## Surface Impact
- **API:** `POST /api/ingest/actuals`, `POST /api/ingest/budget` (AuthGuard + `ingest` grant + added to the route allow-list; typed multipart DTOs + Swagger + CSRF/forbidden tests).
- **Data:** warehouse tables `ingest_batch`, `sap_transaction`, `mis_budget`; view `actual_by_key_month`; a warehouse migration path.
- **Ops:** `warehouse:migrate`; `exceljs` dependency; synchronous upload (workers deferred).
- **Auth:** a new `ingest` RBAC action grant (grants.constants.ts + db/migrate seed).
- **Docs/tests:** route allow-list update; typed DTO + Swagger; hermetic parse/validation tests + the demonstrated warehouse-DB reconciliation/idempotency proofs (D-0008).

## Verify Plan
Per task: `verify.py` green; hermetic tests for the parse/validation/DTO/route-allow-list; the
warehouse-DB proofs (schema/migrate, load, reconciliation to ₹11,512,712.07, idempotency) run as
demonstrated host evidence (docker warehouse, `WAREHOUSE_PG_*`) per D-0008. Surface impact: API
(`/api/ingest/actuals`, `/api/ingest/budget` + `ingest` grant + allow-list), data (`ingest_batch`,
`sap_transaction`, `mis_budget`, `actual_by_key_month`, warehouse migration), ops (`warehouse:migrate`,
`exceljs`), docs/tests (allow-list, typed DTO + Swagger, hermetic + demonstrated proofs).
