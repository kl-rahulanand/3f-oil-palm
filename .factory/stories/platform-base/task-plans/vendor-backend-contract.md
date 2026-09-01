# Task plan — vendor-backend-contract

## Objective
Vendor Pulse's `backend/` + `contract/` into this repo as owned code, strip the
MBS-specific pieces, and stand up the npm workspace so both build and typecheck.

## Write scope
`backend/`, `contract/`, `package.json`, `package-lock.json`, `tsconfig.base.json`

## Approach
1. Snapshot-copy from `~/Desktop/pulse` (exclude `node_modules`, `dist`, `.next`):
   `backend/`, `contract/`, plus root `package.json`, `package-lock.json`,
   `tsconfig.base.json`. Keep 3oilpalm's harness files untouched.
2. Strip MBS specifics:
   - delete `backend/src/semantic/domains/operations.ts` and `leadActivity.ts`;
     unregister them in `backend/src/semantic/semanticLayer.ts`.
   - remove MBS seed users/roles/grants in `backend/src/db/migrate.ts`.
   - remove MBS curated report defs (`mbs-*`) in `backend/src/semantic/reports.ts`.
   - rewrite MBS-naming LLM prompt strings in `backend/src/llm/llm.constants.ts`
     to neutral placeholders (no 3F domain logic yet).
3. `package.json` workspaces = `[contract, backend, frontend]`; add an empty
   `frontend/` package stub so install resolves (a later task builds it out).
4. `npm install` at repo root; `npm run build:contract`, `build:backend`, `typecheck`.

## Acceptance criteria
- backend and contract build and typecheck in the npm workspace
- MBS-specific domains (operations, leadActivity) and MBS seeds/grants are removed
- npm install succeeds at repo root with workspaces contract/backend/frontend

## Reviewer focus
Clean vendor: no MBS domain/seed/report references remain; minimal workspace
wiring; no dead code; `contract` is the single source of shared types and compiles.

## Verify
- `npm install` succeeds at repo root.
- `npm run build:contract && npm run build:backend && npm run typecheck` all green.
- `grep -ri "leadActivity\|operations" backend/src/semantic backend/src/db` returns
  no MBS domain/seed references (only generic framework code remains).
