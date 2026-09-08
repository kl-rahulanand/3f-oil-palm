# Review brief — harness-wiring — performance lens

You are one lens of a three-lens code review. You see ONLY the diff bundle for
this task (no repository access), so judge what the diff shows and say so when
something cannot be verified from it. Report every finding with its
file_path and line. Use ONLY these categories: bug, security, regression,
test_gap, maintainability. Priorities: P0/P1 block the task; P2/P3 must be
resolved or explicitly deferred with a reason before it ships.

LENS: PERFORMANCE. Hot paths, algorithmic complexity, query fanout (N+1),
I/O amplification, memory churn, concurrency bottlenecks, missing pagination or
bounds, work repeated per request that could be done once. Distinguish measured
evidence from inference and say which each finding is. Use category `bug` for a
performance defect that will bite in production and `maintainability` for a cost
worth reducing.

LEFTOVERS (blocking): the diff must carry no code kept only for compatibility — no wrapper or shim over its replacement, no re-export or alias kept 'for callers', no renamed-but-retained symbol, no dead branch behind a removed feature, no 'legacy'/'deprecated'/'backward' naming or comment. Report each as a BLOCKING finding with file:line and verdict the contract it belongs to as partial; a clean diff says so in one line.
## Task harness-wiring

### Plan contracts

- **t10-c1**
  - Source: docs/specs/app-platform-base.md
  - Statement: .envrc build/verify/test/lint commands (the FACTORY_STRUCTURAL/TYPECHECK/QUALITY/TEST variables verify.py reads) point at the workspace scripts
- **t10-c2**
  - Source: docs/specs/app-platform-base.md
  - Statement: FACTORY_STRUCTURAL_CMD explicitly invokes both check_dual_runtime.py and check_vendor_integrity.py, and FACTORY_QUALITY_CMD / FACTORY_TEST_CMD cover all three workspaces
- **t10-c3**
  - Source: docs/specs/app-platform-base.md
  - Statement: verify.py runs green at the repo root across structure, typecheck, quality and tests
- **t10-c4**
  - Source: docs/specs/app-platform-base.md
  - Statement: backend/VENDORED_FROM provenance (source repo + exact commit, decision 0008) is asserted separately from harness integrity
- **t10-c5**
  - Source: docs/specs/app-platform-base.md
  - Statement: the product CI workflow runs root verification on every push

### Reviewer focus

The repo-wide gate is already built (quality-gate-baseline created the .envrc FACTORY_* commands + the tools/quality-gate.test.mjs drift guard; frontend-foundation added the frontend workspace; structural already invokes BOTH check_dual_runtime.py and check_vendor_integrity.py; backend/VENDORED_FROM exists; CI quality.yml runs verify:ci on push). This task closes the two real gaps and NOTHING else. (A) FACTORY_TEST_CMD (root test:hermetic) does not run the CONTRACT workspace's tests - add a transpile-only contract `test` script (TS_NODE_PROJECT=contract/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node --require ts-node/register --test contract/test/auth-contract.test.ts; test files stay OUT of the build include per D-0007; use the root-hoisted ts-node like the backend does), make the auth-contract import extension-clean (../src/index, not ../src/index.ts), and prepend `npm -w @3f/contract run test` to root test:hermetic (resolve D-0002). (B) NO test asserts criterion 4 - ADD a test to tools/quality-gate.test.mjs named EXACTLY 'the quality gate runs all three workspaces and independently pins backend VENDORED_FROM' that (i) pins the new test:hermetic body covering contract+backend+frontend+guard, and (ii) reads backend/VENDORED_FROM and asserts its repository + commit fields independently of check_vendor_integrity (criterion 4). Criterion 1 refers to .envrc (NOT harness.yaml, which carries no such graph) - reconcile the docs/specs/app-platform-base.md wording to match. verify_commands now run test:hermetic so stage-done proves the aggregate; verify.py must stay green at root with FACTORY_* UNSET so an inherited override cannot false-green. Do NOT touch structural, typecheck/lint/format, or the CI workflow. Keep it minimal - the last task.

### Lessons in force

Recorded lessons that apply to this task's paths. A finding that contradicts one is not a defect unless it shows the lesson itself is wrong; say so explicitly instead of re-raising it.

- [medium] plan contracts must not require review-verification of review-excluded paths: A plan_contract clause requiring evidence in plans/, .factory/, or docs/decisions/ cannot be verified by forge review, which excludes those paths (HARNESS_PREFIXES). The quality lens flip-flopped 10/10/7 on t5-c1's 'ledgered as debt (D-0006)' clause because the deferral IS recorded in plans/deferrals.md, which the reviewer structurally cannot see. Keep bookkeeping (deferral ledgering) in the ledger, not in a code-review plan_contract; contracts assert only code behaviour visible in the diff.
