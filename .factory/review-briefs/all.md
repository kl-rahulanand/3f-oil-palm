# Branch-wide plan-contract review brief

For each contract, emit a verdict — implemented | partial | missing — with file:line evidence, recorded as contract_verdicts in the quality artifact. Then review the diff normally; the contract check does not replace the quality/performance/security lenses.

## Task gl-month-rollups

### Plan contracts

- **t-glm-c1**
  - Source: backend/src/warehouse/warehouse-schema.ts
  - Statement: a reproducible warehouse rollup reduces DUB actuals to (gl_code, month) as SUM(actual_net) over cost centres (WHERE plant='DUB'), and an active-budget rollup reduces the ACTIVE budget batch to (gl_code, month) as SUM(budget_amount)::numeric(18,2) with period aliased to month, each reflecting ONLY the active batch
- **t-glm-c2**
  - Source: docs/decisions/0016-governed-joins-poc-scope.md
  - Statement: the budget rollup preserves the set of cost_center (Budget Components) labels per (gl_code, month) key as informational (never a join key), and carries raw rollover_amount untouched with no measure
- **t-glm-c3**
  - Source: docs/decisions/0004-pulse-governed-joins.md
  - Statement: a demonstrated warehouse-DB test proves each rollup reflects only the active batch: a retained prior actuals/budget batch does not change the rollup, and a budget reload swaps the active batch without altering actuals

### Reviewer focus

FIRST task of governed-joins: two READ-ONLY warehouse GL+month rollup views that reduce each ingested object to ONE active row per (gl_code, month) BEFORE any cross-object join (the join itself is task 2, composed-relation). NO new endpoint, grant, base table, or dependency. It EXTENDS the warehouse schema built in sap-ingestion; mirror the existing actual_by_key_month view EXACTLY (backend/src/warehouse/warehouse-schema.ts:117-134, a drizzle pgView; its DDL is emitted in backend/drizzle-warehouse/0000_*.sql). GROUNDING: actual_by_key_month is Plant+CostCenter+GL+month (SUM(debit-credit)); mis_budget (warehouse-schema.ts:86-115) has NO plant, its month column is `period` (month-truncated), cost_center is the MIS 'Budget Components' LABEL, unique grain (batch_id,format_id,period,line_id,gl_code,cost_center); ingest_batch (warehouse-schema.ts:23-46) has the partial-unique active pointer on (source_kind, period) WHERE is_active. Decisions 0004 (no pre-join beyond this governed layer), 0015 (warehouse snake_case), 0016 (gl_code+month within DUB; Budget-Components label informational; roll-over measure deferred but raw rollover_amount kept). VIEW 1 actual_by_gl_month: SELECT 'DUB'::text AS plant, gl_code, month, SUM(actual_net)::numeric(18,2) AS actual_net FROM actual_by_key_month WHERE plant='DUB' GROUP BY gl_code, month — reduce the existing gold view across cost centres for the single DUB plant (the fan-out fix: without it, joining Plant+CostCenter+GL+month to a GL+month budget repeats Budget per cost centre). HUMAN-decided seam (task-1 grill round): EXPOSE a constant plant='DUB' column so task 2 can inject/verify its Actual-side scope predicate against the rollup. NOTE the active-batch filter is INHERITED through actual_by_key_month (which already filters source_kind='actuals' AND is_active) — this view has NO direct ingest_batch predicate; do not duplicate the join. VIEW 2 budget_by_gl_month: SELECT b.gl_code, b.period AS month, SUM(b.budget_amount)::numeric(18,2) AS budget_net, SUM(b.rollover_amount)::numeric(18,2) AS rollover_net, array_agg(DISTINCT b.cost_center ORDER BY b.cost_center) AS budget_component_labels FROM mis_budget b JOIN ingest_batch bt ON bt.id=b.batch_id WHERE bt.source_kind='budget' AND bt.is_active GROUP BY b.gl_code, b.period — the active budget batch only via its OWN direct join to ingest_batch; cost_center is NEVER a GROUP BY/join key, only a DETERMINISTIC informational label SET (the ORDER BY inside array_agg is REQUIRED — Postgres gives no order otherwise, and provenance/golden fixtures need determinism); rollover_net is carried but exposed by NO measure (roll-over deferred). Add both as drizzle pgViews in warehouse-schema.ts and their CREATE VIEW DDL in a NEW migration backend/drizzle-warehouse/0002_gl_month_rollups.sql AND its journal entry in backend/drizzle-warehouse/meta/_journal.json (both are owned; a migration not in the journal will not apply on a clean warehouse), applied by `npm --prefix backend run warehouse:migrate` (follow how 0000/0001 are wired). HERMETIC TESTS (warehouse-schema.test.ts, in test:hermetic): assert each view's SQL shape (active-batch filter, the (gl_code, month) GROUP BY, numeric(18,2) casts, DUB filter on actuals, the label-set aggregate, rollover carried) — regex/string assertions like the existing actual_by_key_month tests, no DB. D-0008 GATED PROOF (a NEW backend/src/warehouse/gl-month-rollups.db.test.ts, `{ skip: process.env.WAREHOUSE_DB_TEST !== '1' }`): migrateWarehouse(), then use IngestionRepository (NOT direct SQL inserts — the proof must exercise the atomic candidate-load-then-flip active-batch invariant) to: (a) load a PRIOR actuals batch then a REPLACEMENT actuals batch (across MULTIPLE cost centres for one gl_code+month in DUB) and assert the prior stays inactive, ONLY the replacement contributes, and actual_by_gl_month sums the replacement's cost centres to ONE row (with plant='DUB'); (b) load a PRIOR budget batch then a REPLACEMENT budget batch and assert budget_by_gl_month reflects ONLY the active batch and exposes the deterministic label set; (c) a budget reload swaps the active budget batch WITHOUT changing actuals. Guard the destructive TRUNCATE to loopback-only hosts and add a dead-port negative control. REGISTRATION (every backend *.test.ts is in EXACTLY ONE declared hermetic suite): add gl-month-rollups.db.test.ts to test:hermetic AND its hermeticTests registry in tools/quality-gate.test.mjs (the gated leaf self-skips there). RUNNABLE PROOF: EXTEND the existing backend/package.json `test:warehouse-proof` script (which today runs ONLY reconciliation.repository.test.ts) to run BOTH proofs — RETAIN reconciliation.repository.test.ts and add this file — and because both destructively TRUNCATE shared warehouse tables they MUST run SERIALIZED (node --test with --test-concurrency=1, or a sequential invocation), so one proof never wipes the other mid-run. Commit tests.json with the pinned host command (`... WAREHOUSE_DB_TEST=1 npm --prefix backend run test:warehouse-proof`, TS_NODE_PROJECT retained) + pass counts + the dead-port negative control (per decision 0009 + the sap-ingestion D-0008 lessons: demonstrated host evidence run by the orchestrator; the evidence record must be COMMITTED into the diff BEFORE review). NEVER read/write/join across the two objects here (that is task 2).

### Settled — do not relitigate

The following are accepted: the story plan's decisions and rulings, and the contracts of tasks already sealed in this story. A finding that contradicts one is a proposal to change a decision, which belongs in a decision record, not in this review; do not raise it as a defect. Rejected findings from earlier rounds are ledgered as lessons below.

#### Story plan — Decisions

0002 (Financial MIS; Actual = Σ(Debit−Credit)), 0004 (governed joins: correct
semantics, RBAC across both objects, validator support, golden fixtures, one
shared definition), 0009 (required_tests name real leaves + pin `TS_NODE_PROJECT`),
0014 (no mapping master), 0015 (warehouse snake_case), 0016 (governed-joins PoC
scope: `gl_code+month` within DUB, informational Budget-Components label, deferred
mapping master + roll-over measure + row-scoping, role-based RBAC, %-nil rule).
D-0008: the golden-fixture warehouse proof is demonstrated host evidence.

### Lessons in force

Recorded lessons that apply to this task's paths. A finding that contradicts one is not a defect unless it shows the lesson itself is wrong; say so explicitly instead of re-raising it.

- [high] required_tests false-green: A required_tests entry must name a REAL leaf test (id = the string in test("...")), not the file path, and must pin TS_NODE_PROJECT=backend/tsconfig.json because forge runs it from repo root; otherwise junit-run's --test-name-pattern matches nothing and ts-node skips the workspace tsconfig, so the gate reports pass without running assertions. Always verify with a negative control (a required test whose negative control cannot fail is not proof).
- [high] warehouse row period equals batch period: Enforce at the DB level (a trigger, like the immutability trigger) that sap_transaction.month equals its ingest_batch.period and mis_budget.period equals its batch period; otherwise a mis-periodized row double-counts in actual_by_key_month, which groups by ROW month while active-uniqueness is keyed on BATCH period.
- [high] warehouse DB separation guard: The WAREHOUSE_PG_* separation guard must REJECT when the normalized host AND port match the app DB, regardless of database name (canonicalize localhost/127.0.0.1/::1 and equivalent aliases) — otherwise warehouse DDL can be applied to the application Postgres server under a different db name.
- [high] warehouse proof must execute not grep: The demonstrated warehouse proof must RUN migrate + the fixture against the warehouse DB via a committed, re-runnable warehouse:proof script that EXERCISES IngestionRepository's atomic candidate-load-then-flip; a hermetic test that only greps seed-proof.sql text is false-green. Do NOT build a controller/API here (that is the actuals-loader task) — exercise the repository directly.
- [high] warehouse guard must resolve hosts not string-match: The WAREHOUSE_PG_* separation guard must RESOLVE both the warehouse host and the app pg host via dns.promises.lookup(host,{all:true}) and reject when their resolved IP sets INTERSECT and the ports match (normalize IPv4-mapped ::ffff: and IPv6 loopback). A hand-picked list of loopback spellings + isIP() cannot catch DNS aliases or IPv6-mapped aliases of the app host. This makes loadWarehousePostgresConfig async — make createWarehouseWritePool async and await it in warehouse:migrate/proof and the hermetic test.
- [high] warehouse D-0008 proof must be a recorded test: The D-0008 live warehouse proof must be a COMMITTED, reviewer-visible DB-backed test (e.g. backend/src/warehouse/warehouse-proof.db.test.ts calling proveWarehouse, registered in the backend package.json test:db script) so the required execution is provable from the diff itself — a tests.json narrative alone is invisible to the cold-diff reviewer and reads as an absent D-0008 record.
- [high] warehouse D-0008 proof test must be a separate DB-only file: Put the DB-backed warehouse proof in its OWN file backend/src/warehouse/warehouse-proof.db.test.ts registered ONLY in test:db (and the db list of tools/quality-gate.test.mjs); keep warehouse-schema.test.ts hermetic-only. NEVER register one test file in both test:hermetic and test:db — tools/quality-gate.test.mjs asserts exactly one suite per file and fails the whole verify if a file appears twice.
- [high] warehouse-schema DB proof stays in the hermetic file (final): SUPERSEDES the separate-file guidance for warehouse-schema: its write_scope does NOT include warehouse-proof.db.test.ts, so do NOT create that file. Keep the DB proof test INSIDE backend/src/warehouse/warehouse-schema.test.ts gated by WAREHOUSE_DB_TEST=1 (skips under plain test:hermetic, runs the migrate + IngestionRepository proof when the env + WAREHOUSE_PG_* are set), registered ONLY in test:hermetic. REMOVE warehouse-schema.test.ts from the test:db script and the db-list in tools/quality-gate.test.mjs, and drop the WAREHOUSE_DB_TEST env added to test:db — quality-gate requires each test file in exactly ONE suite and fails verify otherwise. This is the ONLY remaining fix.
- [high] actuals-loader raw column is additive dont touch schema test: The sap_transaction 'raw' jsonb column is ADDITIVE - add it to warehouse-schema.ts + a NEW backend/drizzle-warehouse/0001_*.sql migration (generate-once, apply-only via warehouse:migrate). Do NOT modify backend/src/warehouse/warehouse-schema.test.ts (out of write_scope); its column/constraint assertions use .includes and are non-exhaustive and the 0000 migration is unchanged, so it stays green untouched. Assert the raw column IN-SCOPE: sap-actuals.parser.test.ts (parser emits the full raw row) and the WAREHOUSE_DB_TEST=1-gated ingest.service.test.ts (raw persists).
- [high] removing a prettierignore entry also updates the quality-gate baseline map: tools/quality-gate.test.mjs validateIgnoredBaseline asserts .prettierignore's non-comment lines deep-equal the keys of its ignoredBaselineHashes map. So when D-0006 requires removing a file (e.g. backend/src/db/migrate.ts) from .prettierignore, you MUST also remove that path's entry from the ignoredBaselineHashes map in tools/quality-gate.test.mjs (both in write_scope) in the SAME change, and ensure the now-unignored file is prettier-formatted so format:check passes. Keep .prettierignore and ignoredBaselineHashes in sync.
- [high] D-0008 gated-leaf pinned command must set TS_NODE_PROJECT + TS_NODE_TRANSPILE_ONLY: The pinned WAREHOUSE_DB_TEST=1 host command must be prefixed with TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1; without them 'node --require ts-node/register --test <file.ts>' loads the TypeScript file as a single empty testcase that FALSE-PASSES (tests 1/pass 1) even against a dead DB port — verified: with the prefix the good port gives tests 4/pass 4 and a bad port fails the 2 gated DB leaves (ECONNREFUSED); without it a bad port still 'passes'.
- [high] A D-0008 gated warehouse proof needs a registered executable command (test:db), not only test:hermetic: autoreview blocks a PROOF task whose gated WAREHOUSE_DB_TEST=1 leaf is registered only in test:hermetic (where it self-skips) — from the diff there is no registered command that RUNS it. Add the gated test file to backend/package.json test:db (the DB-backed suite a Postgres/warehouse runner executes with WAREHOUSE_DB_TEST=1), alongside the committed tests.json execution record + the pinned host command in the plan. This makes the execution path provable from the diff itself; the demonstrated-host-evidence model (decision 0009 / D-0008) is unchanged — CI without a warehouse container still skips it.
- [high] The D-0008 proof needs a dedicated flag-SETTING script (test:warehouse-proof), not just membership in a suite that leaves WAREHOUSE_DB_TEST unset: Registering the gated reconciliation test in test:db is NOT enough: test:db does not set WAREHOUSE_DB_TEST=1, so the leaf still self-skips there and autoreview reads it as an unrunnable proof. FIX: add a dedicated backend package.json script 'test:warehouse-proof' that itself sets WAREHOUSE_DB_TEST=1 and runs backend/src/warehouse/reconciliation.repository.test.ts (the WAREHOUSE_PG_*/PGHOST/PGPORT connection env is still supplied by the host/operator, NOT hardcoded), and REMOVE the file from test:db (it is a warehouse-DB test, not an app-DB test). Then the registered command actually EXECUTES the proof when run against a warehouse; the pinned host command in tests.json becomes 'WAREHOUSE_PG_*... npm --prefix backend run test:warehouse-proof'. Keep it in test:hermetic too (self-skips there). Still demonstrated-host-evidence (decision 0009/D-0008), NOT CI-enforced.
- [medium] rejected-review-finding-quality: Not a defect (Decisions): Factually incorrect and contradicts the settled D-0008 model. (1) The claim that the supplied evidence contains no invocation of test:warehouse-proof is false: the committed tests.json commands_run records 'npm --prefix backend run test:warehouse-proof -> tests 4 / pass 4 / fail 0 / skipped 0' (the gated warehouse leaf EXECUTES because the script sets WAREHOUSE_DB_TEST=1) plus a dead-port negative control (fail 1, ECONNREFUSED). Performance and security accepted this same evidence and approved this round. (2) The warehouse proof is committed, reviewer-visible and runnable via the registered test:warehouse-proof script. (3) The story plan Decisions section settles that DB-backed warehouse proofs run as DEMONSTRATED HOST EVIDENCE (docker warehouse, WAREHOUSE_PG_*) per D-0008, NOT inside the enforced hermetic path; demanding a non-skipped enforced execution is CI-enforcement the plan defers. — raised as "[P1] Record an execution of the gated warehouse proof (backend/src/warehouse/reconciliation.repository.test.ts:107): The only recorded execution is `npm run tes"
- [high] A destructive TRUNCATE in a gated warehouse test must be guarded to loopback-only hosts: The reconciliation D-0008 gated leaf TRUNCATEs ingest_batch + sap_transaction CASCADE on whatever DB WAREHOUSE_PG_* points at. Guard it: BEFORE truncating, assert the warehouse host (WAREHOUSE_PG_HOST) is loopback/local (127.0.0.1, ::1, or localhost) and THROW a clear error refusing to run against a non-local warehouse — so a misconfigured WAREHOUSE_PG_* can never wipe a shared/production warehouse. Also fix the P2: tools/quality-gate.test.mjs wrapping the declared test lists in new Set removes the gate's exactly-one-suite detection (a file registered in two suites is silently deduped) — compare with duplicate detection preserved (e.g. detect duplicates before dedup, or assert no file appears in more than one suite) instead of Set-then-compare.
- [medium] rejected-review-finding-quality: Not a defect (Decisions): Factually incorrect and contradicts the settled D-0008 model. (1) tests.json IS committed at f9c6b1d with the full host-execution record: 'npm --prefix backend run test:warehouse-proof -> tests 7 / pass 7 / fail 0 / skipped 0' plus a dead-port negative control (fail 2, ECONNREFUSED). The reviewer cannot see it only because the review bundle deliberately excludes .factory bookkeeping ('review tip excludes 9 harness bookkeeping paths; the bundle is the product delta only') - not because it is absent. (2) The runnable command that executes the proof (test:warehouse-proof, serialized) IS in the product delta at backend/package.json, and the gated test is committed and reviewer-visible. (3) The security lens accepted this identical evidence and approved. (4) The story plan Decisions section settles that the DB-backed warehouse proof is DEMONSTRATED HOST EVIDENCE (D-0008), not CI-enforced execution. — raised as "[P1] Commit the required host-execution evidence for the new proof (backend/package.json:19): The new `test:warehouse-proof` command is registered, but the chan"
- [medium] rejected-review-finding-performance: Not a defect (Decisions): Factually incorrect and contradicts the settled D-0008 model, same as the quality lens. tests.json IS committed at f9c6b1d with the host-execution record (test:warehouse-proof -> tests 7 / pass 7; dead-port negative control fail 2, ECONNREFUSED); the reviewer cannot see it only because the review bundle excludes .factory bookkeeping ('the bundle is the product delta only'). The runnable serialized test:warehouse-proof command IS in the product delta (backend/package.json) and the gated test is committed reviewer-visible; the security lens approved this identical evidence. The story plan Decisions section settles the warehouse proof as demonstrated host evidence (D-0008), not CI-enforced. — raised as "[P1] Commit the required warehouse-proof execution evidence (backend/src/warehouse/gl-month-rollups.db.test.ts:22): This DB-backed proof is skipped unless WAREH"

## Task composed-relation

### Plan contracts

- None declared.

### Reviewer focus

No task-specific reviewer focus declared.

### Settled — do not relitigate

The following are accepted: the story plan's decisions and rulings, and the contracts of tasks already sealed in this story. A finding that contradicts one is a proposal to change a decision, which belongs in a decision record, not in this review; do not raise it as a defect. Rejected findings from earlier rounds are ledgered as lessons below.

#### Story plan — Decisions

0002 (Financial MIS; Actual = Σ(Debit−Credit)), 0004 (governed joins: correct
semantics, RBAC across both objects, validator support, golden fixtures, one
shared definition), 0009 (required_tests name real leaves + pin `TS_NODE_PROJECT`),
0014 (no mapping master), 0015 (warehouse snake_case), 0016 (governed-joins PoC
scope: `gl_code+month` within DUB, informational Budget-Components label, deferred
mapping master + roll-over measure + row-scoping, role-based RBAC, %-nil rule).
D-0008: the golden-fixture warehouse proof is demonstrated host evidence.

## Task governed-domain-measures

### Plan contracts

- None declared.

### Reviewer focus

No task-specific reviewer focus declared.

### Settled — do not relitigate

The following are accepted: the story plan's decisions and rulings, and the contracts of tasks already sealed in this story. A finding that contradicts one is a proposal to change a decision, which belongs in a decision record, not in this review; do not raise it as a defect. Rejected findings from earlier rounds are ledgered as lessons below.

#### Story plan — Decisions

0002 (Financial MIS; Actual = Σ(Debit−Credit)), 0004 (governed joins: correct
semantics, RBAC across both objects, validator support, golden fixtures, one
shared definition), 0009 (required_tests name real leaves + pin `TS_NODE_PROJECT`),
0014 (no mapping master), 0015 (warehouse snake_case), 0016 (governed-joins PoC
scope: `gl_code+month` within DUB, informational Budget-Components label, deferred
mapping master + roll-over measure + row-scoping, role-based RBAC, %-nil rule).
D-0008: the golden-fixture warehouse proof is demonstrated host evidence.

## Task golden-provenance

### Plan contracts

- None declared.

### Reviewer focus

No task-specific reviewer focus declared.

### Settled — do not relitigate

The following are accepted: the story plan's decisions and rulings, and the contracts of tasks already sealed in this story. A finding that contradicts one is a proposal to change a decision, which belongs in a decision record, not in this review; do not raise it as a defect. Rejected findings from earlier rounds are ledgered as lessons below.

#### Story plan — Decisions

0002 (Financial MIS; Actual = Σ(Debit−Credit)), 0004 (governed joins: correct
semantics, RBAC across both objects, validator support, golden fixtures, one
shared definition), 0009 (required_tests name real leaves + pin `TS_NODE_PROJECT`),
0014 (no mapping master), 0015 (warehouse snake_case), 0016 (governed-joins PoC
scope: `gl_code+month` within DUB, informational Budget-Components label, deferred
mapping master + roll-over measure + row-scoping, role-based RBAC, %-nil rule).
D-0008: the golden-fixture warehouse proof is demonstrated host evidence.
