# Task plan — vendor-backend-contract

## Context
Task 1 was reopened to re-verify its evidence after a false-green required-tests gate
was found and fixed (decision 0009). The re-verify surfaced a real leak the false-green
had masked: `contract/test/auth-contract.test.ts` still carries MBS-specific fixtures
(`display_name: "MBS Analyst"`, `domains: ["operations"]`,
`measureIds: ["operations.disbursals"]`), contradicting acceptance c2 (MBS domains
removed) and the `VENDORED_FROM` exclusion note. This re-cycle neutralizes that leak and
re-produces genuine gate evidence over the committed vendored snapshot.

## Objective
Vendor Pulse's `backend/` + `contract/` (+ `tools/`) as a pinned snapshot (decision 0008),
strip ALL MBS-specific pieces (including the contract auth test fixtures), and stand up
the npm workspace so backend and contract build and typecheck.

## Write scope
`backend/`, `contract/`, `tools/`, `package.json`, `package-lock.json`, `tsconfig.base.json`

## Review budget
Elevated per decision 0008 (max 220 files / 20,000 lines): a bulk vendored snapshot of
our own code, reviewed as "Pulse @ commit", not authored line-by-line. The MBS-strip and
workspace-wiring are the reviewable authored deltas.

## Approach
1. Snapshot-copy from `~/Desktop/pulse` (exclude `node_modules`, `dist`, `.next`):
   `backend/`, `contract/`, `tools/`, plus root `package.json`, `package-lock.json`,
   `tsconfig.base.json`. Record the source commit in `VENDORED_FROM`. (Already committed.)
2. Strip MBS specifics:
   - delete `backend/src/semantic/domains/operations.ts` and `leadActivity.ts`;
     unregister them in `backend/src/semantic/semanticLayer.ts`.
   - remove MBS seed users/roles/grants in `backend/src/db/migrate.ts`.
   - remove MBS curated report defs (`mbs-*`) in `backend/src/semantic/reports.ts`.
   - rewrite MBS-naming LLM prompt strings in `backend/src/llm/llm.constants.ts` to
     neutral placeholders.
   - **NEW (leak fix): neutralize the MBS fixtures in
     `contract/test/auth-contract.test.ts`** — replace `display_name: "MBS Analyst"` and
     the `operations` / `operations.disbursals` domain+measure fixtures with neutral,
     framework-generic placeholders (e.g. a generic analyst name and a `fixture`
     domain/measure), keeping the schema assertions intact. After this, no MBS domain
     name (`operations`, `leadActivity`, `mbs`, "MBS Analyst") remains anywhere under
     `backend/src` or `contract/`.
3. `package.json` workspaces = `[contract, backend]` (frontend added by the later task).
4. `npm install` at repo root; `npm run build:contract`, `build:backend`, `typecheck`.

## Acceptance criteria
- backend and contract build and typecheck in the npm workspace
- MBS-specific domains (operations, leadActivity) and MBS seeds/grants are removed
- npm install succeeds at repo root with workspaces contract/backend

## Reviewer focus
Clean vendor: NO MBS domain/seed/report/fixture references remain anywhere under
`backend/src` or `contract/` (grep for operations/leadActivity/mbs/"MBS Analyst" is
empty); minimal workspace wiring; no dead code; `contract` is the single source of shared
types and compiles. The snapshot is reviewed as an import (decision 0008); the authored
delta (strip + wiring + the contract-test fixture fix) is the review surface.

## Verify
- `npm install` succeeds at repo root.
- `npm run build:contract && npm run build:backend && npm run typecheck` all green.
- `grep -riE "leadactivity|operations|mbs" backend/src/semantic backend/src/db contract`
  returns no MBS domain/seed/fixture references.
- Required test passes, run per decision 0009 (real leaf test-name id +
  `TS_NODE_PROJECT=backend/tsconfig.json`, since forge runs it from repo root):
  `"blocked columns are rejected case-insensitively by leaf column name"`
  (`backend/src/sql/sqlValidator.pii.test.ts`) via
  `TS_NODE_PROJECT=backend/tsconfig.json node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register`.
