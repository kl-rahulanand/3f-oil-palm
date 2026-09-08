# Task plan — harness-wiring

## Context
The repo-wide quality gate is already built and pinned: `quality-gate-baseline` created the
`FACTORY_*` commands in `.envrc` + the `tools/quality-gate.test.mjs` drift guard; `frontend-foundation`
added the frontend workspace to typecheck/lint/format/test; `structural` already invokes both
`check_dual_runtime.py` and `check_vendor_integrity.py`; `backend/VENDORED_FROM` exists; and CI
(`quality.yml`) runs `npm run verify:ci` on every push. `verify.py` is green at root.

Two genuine gaps remain, and this task closes only these: (A) `FACTORY_TEST_CMD` (root `test:hermetic`)
runs backend + frontend + the guard but NOT the CONTRACT workspace's tests — criterion 2's "all three
workspaces" is unmet and **D-0002** is open; (B) nothing asserts criterion 4 — the guard never reads
`backend/VENDORED_FROM`. Not user-facing.

## Write scope
- `contract/package.json` — add a transpile-only `test` script.
- `contract/test/auth-contract.test.ts` — extension-clean barrel import (`../src/index`).
- `package.json` — prepend `npm -w @3f/contract run test` to root `test:hermetic`.
- `tools/quality-gate.test.mjs` — add a guard test that pins the 3-workspace `test:hermetic` AND
  independently validates `backend/VENDORED_FROM`.
- `plans/deferrals.md` — resolve D-0002.
- `docs/specs/app-platform-base.md` — reconcile criterion 1's wording to `.envrc`.

## Decisions (tooling — conduct §9: no silent defaults)
- **Contract test runner**: transpile-only `node --test` via `ts-node/register`
  (`TS_NODE_PROJECT=contract/tsconfig.json`, `TS_NODE_TRANSPILE_ONLY=1`) — identical to the backend
  hermetic pattern (D-0007 keeps test files out of typecheck). Uses the root-hoisted `ts-node` the
  backend already relies on — no new/contract-owned dependency for a one-file test.
- **Import shape**: `../src/index` (extensionless) — ts-node resolves it and it removes the `.ts`
  specifier D-0002 flagged (`allowImportingTsExtensions`).
- **Criterion-1 wording**: `.envrc` (not `harness.yaml`, which has no build/verify/test/lint graph;
  `verify.py` reads the FACTORY_* commands from `.envrc`) — confirmed with the human; the spec is
  reconciled to match.

## Workflow
Delegate to Codex via `./forge delegate harness-wiring`; keep uncommitted through the local review
loop; run `verify.py` (with FACTORY_* unset so an inherited override cannot false-green); run the ONE
branch review; defer non-blocking P2s; commit once; `stage done`; `pr-ready`. Not user-facing → no
functional check.

## Approach
1. **contract/package.json** — add
   `"test": "cd .. && TS_NODE_PROJECT=contract/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node --require ts-node/register --test contract/test/auth-contract.test.ts"`.
2. **contract/test/auth-contract.test.ts** — `from "../src/index.ts"` → `from "../src/index"`.
3. **package.json** — root `test:hermetic` becomes
   `npm -w @3f/contract run test && npm -w @3f/backend run test:hermetic && npm run test:frontend && node --test tools/quality-gate.test.mjs`.
4. **tools/quality-gate.test.mjs** — add a test named EXACTLY
   `the quality gate runs all three workspaces and independently pins backend VENDORED_FROM` that
   (i) pins the new `test:hermetic` body (contract+backend+frontend+guard) and the contract `test`
   script, and (ii) reads `backend/VENDORED_FROM` and asserts its `repository` + `commit` fields
   independently of `check_vendor_integrity` (criterion 4).
5. **plans/deferrals.md** — mark **D-0002** resolved.
6. **docs/specs/app-platform-base.md** — reconcile the criterion-1 wording to `.envrc`.

## Acceptance criteria
1. .envrc build/verify/test/lint commands (the FACTORY_STRUCTURAL/TYPECHECK/QUALITY/TEST variables verify.py reads) point at the workspace scripts
2. FACTORY_STRUCTURAL_CMD explicitly invokes both check_dual_runtime.py and check_vendor_integrity.py, and FACTORY_QUALITY_CMD / FACTORY_TEST_CMD cover all three workspaces
3. verify.py runs green at the repo root across structure, typecheck, quality and tests
4. backend/VENDORED_FROM provenance (source repo + exact commit, decision 0008) is asserted separately from harness integrity
5. the product CI workflow runs root verification on every push

## Reviewer focus
Only two changes: wire the contract workspace's tests into `FACTORY_TEST_CMD` (resolve D-0002) and add
a guard test that pins the 3-workspace `test:hermetic` AND independently validates `backend/VENDORED_FROM`
(criterion 4). Contract test stays transpile-only (D-0007). Criterion 1 = `.envrc`. `verify.py` stays
green at root with FACTORY_* unset. Do NOT alter structural, typecheck/lint/format, or CI. Minimal.

## Grill resolutions (one cold read; all applied to this plan + the contract)
1. **Required-test IDs were prose, not real `test()` names** → now the exact leaf names: the new guard
   test name (added in step 4) and `AuthUser identity is email-based and keeps normalized RBAC fields`.
2. **Transpile-only omitted from the contract command** → the required-test command carries
   `TS_NODE_TRANSPILE_ONLY=1`.
3. **verify_commands didn't run the changed graph** → `npm run test:hermetic` added to
   `verify_commands` so stage-done proves the aggregate; verify.py run with FACTORY_* unset.
4. **Criterion 4 had no proof** → the new guard test reads and validates `backend/VENDORED_FROM`.
5. **Criterion 1 said harness.yaml** → amended to `.envrc` (+ spec reconciled) per the human.
6. **Deps omitted backend-observability** → added to the task dependencies.
7. **Scope too broad** → write scope narrowed to `contract/test/auth-contract.test.ts` (not the dir),
   `contract/tsconfig.json` dropped; hoisted `ts-node` used intentionally.
8. **"Frontier blocked on vendor-backend-contract"** → stale cold-read misread; `forge next` confirms
   the frontier is at harness-wiring (all prior stages done).

## Verify
- `python3 factory/scripts/verify.py` green — the test stage now runs contract + backend + frontend +
  the guard.
- `required_tests`:
  1. `tools/quality-gate.test.mjs` — `the quality gate runs all three workspaces and independently
     pins backend VENDORED_FROM`.
  2. `contract/test/auth-contract.test.ts` — `AuthUser identity is email-based and keeps normalized
     RBAC fields`.

## Manual Verification
1. `npm run test:hermetic` — contract auth-contract tests run first, then backend, frontend, guard.
2. `python3 factory/scripts/verify.py` — Verification passed at root.
3. `./forge defer list --open` — D-0002 no longer listed.
