# Task plan — vendor-backend-contract

## Objective
Vendor Pulse's `backend/` + `contract/` (+ `tools/`) into this repo as a pinned
snapshot (decision 0008), strip the MBS-specific pieces, and stand up the npm
workspace so backend and contract build and typecheck.

## Write scope
`backend/`, `contract/`, `tools/`, `package.json`, `package-lock.json`, `tsconfig.base.json`

## Review budget
Elevated per decision 0008 (max 220 files / 20,000 lines): this is a bulk vendored
snapshot of our own code, reviewed as "Pulse @ commit", not authored line-by-line.
The MBS-strip and workspace-wiring are the reviewable authored deltas.

## Approach
1. Snapshot-copy from `~/Desktop/pulse` (exclude `node_modules`, `dist`, `.next`):
   `backend/`, `contract/`, `tools/`, plus root `package.json`, `package-lock.json`,
   `tsconfig.base.json`. Keep 3oilpalm's harness files untouched. Record the source
   commit in a `VENDORED_FROM` note so it can be re-vendored.
2. Strip MBS specifics:
   - delete `backend/src/semantic/domains/operations.ts` and `leadActivity.ts`;
     unregister them in `backend/src/semantic/semanticLayer.ts`.
   - remove MBS seed users/roles/grants in `backend/src/db/migrate.ts`.
   - remove MBS curated report defs (`mbs-*`) in `backend/src/semantic/reports.ts`.
   - rewrite MBS-naming LLM prompt strings in `backend/src/llm/llm.constants.ts`
     to neutral placeholders (no 3F domain logic yet).
3. `package.json` workspaces = `[contract, backend]` (the `frontend` workspace is
   added by the later frontend task — NOT here; it is outside this task's scope).
4. `npm install` at repo root; `npm run build:contract`, `build:backend`, `typecheck`.

## Acceptance criteria
- backend and contract build and typecheck in the npm workspace
- MBS-specific domains (operations, leadActivity) and MBS seeds/grants are removed
- npm install succeeds at repo root with workspaces contract/backend

## Reviewer focus
Clean vendor: no MBS domain/seed/report references remain; minimal workspace
wiring; no dead code; `contract` is the single source of shared types and compiles.
The snapshot itself is reviewed as an import, not line-by-line; the authored delta
(strip + wiring) is the review surface.

## Verify
- `npm install` succeeds at repo root.
- `npm run build:contract && npm run build:backend && npm run typecheck` all green.
- `grep -ri "leadActivity\|operations" backend/src/semantic backend/src/db` returns
  no MBS domain/seed references (only generic framework code remains).
