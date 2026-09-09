---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-09
stories: [sap-ingestion]
---

# Warehouse schema uses snake_case (database-standards deviation, warehouse-scoped)

## Context
The sap-ingestion warehouse schema is fresh backend code, so decision 0013 says it must comply with
`constitution/pnp-database-standards.md` (singular PascalCase tables, camelCase columns, `AtUtc`
timestamps). But the architecture (`docs/architecture/30-financial-mis-build-plan.md:70-84`) and the
near-universal analytics/warehouse convention use snake_case (`sap_transaction`, `cost_center`,
`actual_by_key_month`), and downstream SQL (the governed-joins query layer) will read those names.

## Decision
The **warehouse** schema (the separate `WAREHOUSE_PG_*` Postgres — `ingest_batch`, `sap_transaction`,
`mis_budget`, the `actual_by_key_month` view) uses **snake_case** table/column names and `*_utc`
timestamps, as an explicit, warehouse-scoped deviation from `pnp-database-standards`. The app OLTP
tables (app DB) keep the constitution's PascalCase/camelCase. Audit fields, explicit FK indexes, and
`numeric(18,2)` money precision from the standard STILL apply.

## Consequences
- Warehouse tables read naturally for analytics SQL and match the architecture doc; the deviation is
  bounded to the warehouse DB only.
- The constitution's structural requirements other than casing (audit columns, FK indexes, precision,
  constraints) are retained.
- Revisit if the warehouse is ever folded into the app DB or a shared ORM naming policy is adopted.
