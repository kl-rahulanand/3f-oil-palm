# Task plan — postgres-warehouse-adapter

## Context
The vendored Pulse backend talks to its analytical warehouse through a
`Warehouse` port (`backend/src/warehouse/warehouse.interface.ts`), and ships only
StarRocks adapters. For the 3F PoC we run the warehouse on **Postgres** — a second,
isolated Postgres reached through the same port — so the assistant/semantic layer
never share a database with auth/OTP/audit. This task adds a Postgres adapter behind
the port, wires the core warehouse factory to select it, flips the SQL validator to
the `postgresql` dialect, stands up a separate warehouse Postgres in docker-compose,
and proves a trivial query runs end-to-end through the real app path.

## Write scope
`backend/src/warehouse/`, `backend/src/sql/`, `backend/src/config.ts`,
`backend/src/core/core.module.ts`, `docker-compose.yml`

## Approach
1. **PostgresAdapter** — `backend/src/warehouse/postgres.adapter.ts`,
   `implements Warehouse` (`warehouse.interface.ts:11`): `explain` / `execute` /
   `freshness` / `distinctValues`, using `pg` (already a dep,
   `backend/package.json:31`). `execute` returns `QueryResult` whose
   `columns[].numeric` is set from the pg field OID.
2. **OID→numeric as a PURE mapping function** — expose a pure, exported
   `pgOidIsNumeric(oid: number): boolean` (int2/int4/int8/float4/float8/numeric →
   true; text/varchar/bool/etc. → false) that `execute` uses to fill
   `columns[].numeric`. This is the deterministic seam: it is covered by a hermetic
   unit test with NO live DB. Do NOT try to prove OID mapping through the app path —
   `selectionExecutor` reconstructs `numeric` from measure aliases
   (`selectionExecutor.ts:129-139`) and cannot observe the adapter flag.
3. **Driver selection in the core warehouse factory** —
   `backend/src/core/core.module.ts`: `warehouseDriver="postgres"` → `PostgresAdapter`.
   NOTE: `backend/src/recon/recon.run.ts` is a standalone `main()` batch entrypoint,
   NOT the app request path; it is intentionally OUT of scope here (its postgres
   routing is a follow-up when recon enters the PoC).
4. **Typed warehouse config, isolated from the app DB** — add a typed
   `warehouse.postgres` block in `config.ts` with its OWN env vars
   (`WAREHOUSE_PG_HOST` / `_PORT` / `_DATABASE` / `_USER` / `_PASSWORD`) and a
   "configured when host+database present" rule. It MUST NOT reuse `cfg.pg` (that is
   the app database pool, `backend/src/db/pool.ts:9`) — the two databases never share
   credentials. No bare string literals.
5. **Validator dialect flip** — change node-sql-parser database from `"mysql"` to
   `"postgresql"` at all three call sites in `backend/src/sql/sqlValidator.ts`
   (lines 28, 44, 53 — astify/tableList/columnList). Confirmed the only three.
6. **Separate warehouse container** — `docker-compose.yml` does not exist yet; create
   it with a distinct `warehouse-db` Postgres service (own credentials/DB, a host port
   distinct from the future app DB e.g. `5433:5432`, its own named volume) and a small
   init/seed fixture (one table with a numeric column + a row) so the E2E query has
   data. (The app DB service is added by the later backend-boot-otp-auth task.)
7. **E2E proof via the app path** — a trivial `SELECT` runs through the real pipeline
   (validate → explain → execute) as `selectionExecutor` does
   (`selectionExecutor.ts:101,111`), against the warehouse Postgres. This proves the
   query runs end-to-end; it is demonstrated evidence (needs the live warehouse-db),
   separate from the hermetic OID unit test.

## Acceptance criteria
- PostgresAdapter implements the Warehouse port and is selected via
  warehouseDriver=postgres in the core warehouse factory (the app request path)
- the SQL validator uses the postgresql dialect
- a trivial SELECT runs end-to-end through the app path (validate → explain → execute)
  against a separate warehouse Postgres defined in docker-compose
- pg field OIDs map to the QueryResult numeric flag via a pure mapping function,
  covered by a hermetic unit test (no live DB)

## Reviewer focus
Port conformance (explain/execute/freshness/distinctValues); OID→numeric via a pure
exported function with a hermetic unit test (not proven through the app path);
complete dialect switch (no MySQL parse calls left); postgres selected in the core
factory (recon.run.ts intentionally out of scope); warehouse config typed and isolated
from `cfg.pg` (separate WAREHOUSE_PG_* creds); no dialect-specific SQL in the builder;
E2E via the app path, not a bare adapter call.

## Verify
- `npm run build:contract && npm run build:backend && npm run typecheck` all green.
- Required tests pass (JUnit via `tools/junit-run.mjs`):
  - `backend/src/sql/sqlValidator.pii.test.ts` (PII validator, under postgresql dialect)
  - `backend/src/warehouse/postgres.adapter.oid.test.ts` (hermetic OID→numeric mapping)
- Demonstrated E2E: a trivial `SELECT` runs through the app path (validate/explain/execute)
  against the warehouse-db container and returns rows.
