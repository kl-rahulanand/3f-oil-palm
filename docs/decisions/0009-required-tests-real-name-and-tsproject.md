---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-02
stories: [platform-base]
---

# required_tests must name a real test and pin TS_NODE_PROJECT (fix false-green gate)

## Context
The recorded `required_tests` convention used in task 1 (`vendor-backend-contract`)
was a **false green**: the command
`node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register`
with `{id}` set to the **file path**, run by `forge stage done` from the repo root,
reported `pass` WITHOUT executing the test's assertions. Two compounding causes:

1. `tools/junit-run.mjs` passes `--name` to node as `--test-name-pattern`. With
   `{id}` = the file path, the pattern matches NONE of the real `test("…")` names,
   so every real test is filtered out and only a file-level wrapper testcase remains.
2. Run from the repo root, `ts-node/register` does not pick up `backend/tsconfig.json`,
   so the TypeScript subtests never register.

Node then emits a single `<testcase name="<file path>">` that the gate's
`_junit_case_matches_id` accepts (name == id == file path). Proven with a negative
control: the old command returns exit 0 / "pass 1" even against a dead Postgres port
with the live E2E enabled; the corrected command returns exit 1 with a `<failure>`.

The underlying code and tests are correct — they genuinely pass when run properly.
This is an evidence-integrity defect in the recorded proof command, not a code defect.

## Decision
`required_tests` entries MUST make the gate execute real assertions:
- **`id` is the real leaf test name** (the string inside `test("…")`), NOT the file
  path. The gate matches a `<testcase>` by name (or leaf) and attributes it to the
  declared `path` via the report's `file=` attribute, so the file path lives in
  `path`, not `id`.
- **The command pins the workspace TS project**, since `forge` runs it from the repo
  root: prepend the shell-free token `TS_NODE_PROJECT=backend/tsconfig.json`
  (the gate strips leading `NAME=VALUE` tokens into the child environment).

Canonical form:
`TS_NODE_PROJECT=backend/tsconfig.json node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register`

Task 1 is reopened and re-verified under this convention; task 2 and all future
backend tasks adopt it. A required test whose negative control cannot fail is not
proof.

## Consequences
- Amending an active task's `required_tests` stales its grill + approval and drops
  its local review stamp (by design) — task 2 re-grills, re-approves, and re-reviews.
- Task 1 (`vendor-backend-contract`) is reopened, its `required_tests` corrected, and
  re-run to produce genuine JUnit evidence before re-closing.
- Live/integration proofs that need a container (e.g. the app-path E2E) stay
  DEMONSTRATED EVIDENCE, never a hermetic `required_tests` entry.
- A durable lesson records the negative-control rule so this does not recur.

## Related
- Decisions: 0008 (Pulse vendored snapshot)
- Spec: docs/specs/app-platform-base.md ; Runner: tools/junit-run.mjs ; Gate:
  factory/scripts/forge_cli/stages.py (`_run_required_tests`)
