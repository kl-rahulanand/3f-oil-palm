# Task plan — postgres-warehouse-adapter

## Context
The vendored Pulse backend reaches its analytical warehouse through a `Warehouse`
port and shipped only StarRocks adapters. For the 3F PoC the warehouse runs on a
second, isolated Postgres reached through the same port, so the assistant/semantic
layer never share a database with auth/OTP/audit. This task adds a Postgres adapter,
selects it in the core factory, flips the SQL validator to the `postgresql` dialect,
stands up an isolated warehouse Postgres in docker-compose, and proves a trivial
query runs end-to-end through the app path.

**Cumulative re-close note:** this task's product code is already committed (223e2dd)
and was validly closed once. Reopening task 1 to re-verify its evidence (decision 0009)
cascaded this task back to pending. Because task 1's contract-test fix (5dc224c) landed
after this task's commit in history, this re-close measures the whole post-vendor delta
since 223e2dd^ — task 2's adapter work PLUS task 1's already-reviewed
`contract/test/auth-contract.test.ts` fixture fix — which no single baseline can isolate.

## Write scope
`backend/src/warehouse/`, `backend/src/sql/`, `backend/src/config.ts`,
`backend/src/core/core.module.ts`, `docker-compose.yml`,
`contract/test/auth-contract.test.ts` (only to absorb the interleaved task-1 fix in the
cumulative measurement; that file was authored and reviewed under task 1).

## Approach
1. **PostgresAdapter** — `backend/src/warehouse/postgres.adapter.ts` implements
   `Warehouse` (explain/execute/freshness/distinctValues) using `pg`; `execute` fills
   `QueryResult.columns[].numeric` from the pg field OID.
2. **OID→numeric as a PURE mapping function** — exported `pgOidIsNumeric(oid)`, covered
   by a hermetic unit test (no live DB); the app path can't observe the adapter flag.
3. **Driver selection in the core factory** — `core.module.ts`: warehouseDriver=postgres
   → PostgresAdapter. (recon.run.ts is a standalone batch entrypoint, out of scope.)
4. **Typed warehouse config isolated from the app DB** — `config.ts` `warehouse.postgres`
   block with its own `WAREHOUSE_PG_*` env vars, never reusing `cfg.pg`.
5. **Validator dialect flip** — node-sql-parser `mysql`→`postgresql` at all three
   astify/tableList/columnList sites in `sqlValidator.ts`.
6. **Separate warehouse container** — `docker-compose.yml` isolated `warehouse-db`
   (own port 5433/creds/volume + numeric seed).
7. **E2E via the app path** — opt-in test runs validate→explain→execute against the
   warehouse-db (demonstrated evidence; host-verified total=42).

## Acceptance criteria
- PostgresAdapter implements the Warehouse port and is selected via
  warehouseDriver=postgres in the core warehouse factory (the app request path)
- the SQL validator uses the postgresql dialect
- a trivial SELECT runs end-to-end through the app path (validate → explain → execute)
  against a separate warehouse Postgres defined in docker-compose
- pg field OIDs map to the QueryResult numeric flag via a pure mapping function,
  covered by a hermetic unit test (no live DB)

## Reviewer focus
Port conformance; OID→numeric via a pure function with a hermetic test; complete dialect
switch; postgres selected in the core factory; warehouse config isolated from `cfg.pg`;
E2E via the app path. The cumulative diff also carries task 1's contract-test fixture fix
(already reviewed under task 1) due to the reopen interleaving.

## Verify
- `npm run build:contract && npm run build:backend && npm run typecheck` all green.
- Required tests pass per decision 0009 (real leaf test-name id +
  `TS_NODE_PROJECT=backend/tsconfig.json`):
  - `"blocked columns are rejected case-insensitively by leaf column name"` (PII block, postgresql)
  - `"PostgreSQL aggregate FILTER syntax is accepted"` (proves the postgresql dialect, c2)
  - `"Postgres numeric field OIDs map without database access"` (hermetic OID→numeric, c4)
  - Command: `TS_NODE_PROJECT=backend/tsconfig.json node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register`
- Demonstrated E2E (c3): opt-in `"app selection path validates, explains, and executes
  against Postgres"` (`WAREHOUSE_E2E=1`) against warehouse-db, total=42; dead-port
  negative control fails with ECONNREFUSED.
