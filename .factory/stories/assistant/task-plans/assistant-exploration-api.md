# Task plan — assistant-exploration-api: saved selections, personal pins, and the snapshot deletion

Story: assistant · Task 3 of 4 · **user_facing: false**

## Objective
Give exploration its persistence and its routes — and **delete** the snapshot behaviour decision
**0028** forbids.

A deliberately scoped migration creates `saved_queries` and `dashboard_pins`; the saved and pins
modules are registered behind their existing grants; every read re-authorizes as the current
user; and `PinRefreshService`, its interval, the two refresh routes, the create-time refresh and
the list-time join are removed outright.

Backend only — the Explore and pinned-reports surfaces are task 4.

## Acceptance criteria (plan_contracts)
- **t-aea-c1** — a **hand-scoped** migration: exactly `saved_queries` and `dashboard_pins`,
  superseding the approved plan's "five", with FK indexes and `schema.ts`'s exact names.
- **t-aea-c2** — registered and governed; the allow-list fails on an **unexpected** route too;
  decision 0019's non-deviated half binds these newly public routes.
- **t-aea-c3** — the snapshot machinery **deleted**, not deprecated — `core.module.ts` included.
- **t-aea-c4** — every read **re-authorizes**, and the refusal has a **declared shape**.
- **t-aea-c5** — fail-closed audit on **all eight** routes, guard-level denials included.
- **t-aea-c6** — six hermetic leaves plus an app-DB migration proof, each in the right CI group.

## What already exists (grounding, file:line)
- `backend/drizzle/` — **one** migration, `0000_auth_audit.sql`, creating `users`, `roles`,
  `user_roles`, `role_perms`, `user_scope`, `sessions`, `otp_codes`, `refresh_tokens`,
  `audit_events`. `migrate.ts:85` runs that folder. `event_type` is **free text** (`:80`), so a
  new audit event type needs no migration.
- `backend/src/db/schema.ts` declares **seven** tables that do not exist: `authored_measures`,
  `conversations`, `conversation_turns`, `reconciliation_runs`, `saved_queries`,
  `dashboard_pins`, `pin_snapshots`. This task creates **two** of them. `:254-278` fixes the
  exact table and column names the SQL must match, because drizzle reads them.
- `backend/src/db/migrate.trim.test.ts:6` — `EXPECTED_TABLES`, an **exact** list. It breaks the
  moment `0001` lands, which is precisely what makes it the hermetic proof of the scope.
- `backend/src/saved/saved.controller.ts:10` — `@Controller("api/saved")`, `AuthGuard`, with
  `RequireAction("save")` already on `@Post()`. Routes: POST, GET, DELETE `:id`.
- `backend/src/pins/pins.controller.ts:11` — `@Controller("api/pins")`, `AuthGuard`, with
  `RequireAction("pin")` on `@Post()`. Routes: POST, GET, **POST `refresh-all`**,
  **POST `:id/refresh`**, PATCH `reorder`, PATCH `:id/view` (`:69`), DELETE `:id`.
- `backend/src/auth/auth.guard.ts:77-90` — `RequireAction` throws `ForbiddenException` **inside
  the guard**, before any controller method runs. No in-controller audit can see that denial.
- `backend/src/mis/mis-drill.audit.filter.ts` + `@UseFilters` at `mis-drill.controller.ts:32` —
  the working precedent for auditing a guard-level refusal, from decision 0025.
- `backend/src/pins/pins.service.ts:50` — `refreshPin` on create; `list` left-joins
  `pinSnapshots` and returns the snapshot.
- `backend/src/pins/pin-refresh.service.ts` — a background service: `OnModuleInit`,
  `OnModuleDestroy`, `refreshAllDue`, `refreshOne`, `refreshAllForUser`, `storeAccessRevoked`,
  `storeExecutionError` — all writing `pinSnapshots`. **Three live referrers:**
  `core.module.ts:28/:57/:75` (import, provide, export), `pins.controller.ts:16`,
  `pins.service.ts:18/:25`.
- `contract/src/api.ts:372` `SavedQuery` and `:386` `Pin` — both require a runnable `Selection`,
  and `Pin` carries `snapshot?` and `lastRefresh?`. **Nothing in `frontend/` reads either type
  yet**, so the shape is settled here rather than after task 4 depends on it. `:486` is the
  in-repo precedent for a *required* discriminated union.
- `backend/src/grants/grants.constants.ts:3` — `GRANT_ACTIONS` already carries `save` and `pin`.
  **No new action is needed.**
- `backend/src/app.module.ts` — imports neither module. `app.routes.test.ts:20` lists no
  `/api/saved` or `/api/pins` route.
- `tools/quality-gate.test.mjs:15` `hermeticTests`, `:70` `dbTests`, `:331` the partition
  assertion — every backend test must appear in **exactly one** list.

## Design

### The migration, hand-written
`0001_saved_and_pins.sql` creates **two** tables. Generating from `schema.ts` would sweep in all
seven — including `pin_snapshots`, which this very task exists to stop writing to. The other
five stay declared-but-absent, and the plan says so rather than closing the gap by accident.

**The approved story plan says five, and it is not being edited.**
`plans/active/assistant-assistant-exploration.md:111` and `:263` predate decision 0028 and the
plan grill's deferral of durable history. `approved_plan_sha256` locks that body, so correcting
the wording would send the plan back to the board for a second approval. The human confirmed on
**2026-09-12** that the two-table scope stands and the supersession is recorded here instead.

Names match `schema.ts:254-278` exactly. That snake_case is the **vendored app-DB convention**
already set by `0000_auth_audit.sql` under decision **0012** — it is *not* licensed by decision
0015, whose snake_case deviation is warehouse-only (`0015:17`). What 0015 still requires here
does apply: an **explicit index on each FK column** (`saved_queries.user_id`,
`dashboard_pins.user_id`) and timezone-aware timestamps.

It must apply to a database whose only prior migration is `0000_auth_audit.sql` — that is what
every existing environment has — and the journal entry goes with it.

### Registration and governance
Both modules imported, every route in the allow-list, each behind its existing grant. The
allow-list assertion must fail on an **unexpected** route as well as a missing one, because the
**absence** of the refresh routes is part of this contract.

These routes become public API for the first time, so decision **0019**'s *non-deviated* half
binds them: named typed request/response DTOs, documented Swagger responses including typed
400/401/403, strict rejection of unknown fields, and `07-exception-handling.md`'s failure model.
0019's actual deviations stand (unversioned paths, raw bodies, direct cross-module imports), and
0019 asks for **no** pagination.

### The deletion
`PinRefreshService` and its interval, `POST :id/refresh`, `POST refresh-all`, the create-time
refresh and the list-time join all go. **No route returns a stored `ResultTable`**, and
`pin_snapshots` is never created.

The service has **three** referrers, and missing any one of them fails: delete the file without
`core.module.ts:28/:57/:75` and the build breaks; leave `core.module.ts` alone and the interval
keeps running. So `core.module.ts` is in write scope.

`Pin` also loses `snapshot?` and `lastRefresh?` in `contract/src/api.ts`. An optional field that
is never populated is exactly the leftover this task exists to remove. The `PinSnapshot`
*interface* and the `pinSnapshots` declaration in `schema.ts` may remain — decision 0028's
consequences say so explicitly, and a later snapshot capability would build on them.

This is a deletion of shipped vendored behaviour, made because a decision forbids it — not a
feature switched off. A service left registered but uncalled, or a route that 404s by accident
rather than by removal, is the compatibility-leftover class that cost task 1 a whole review
round.

### Re-authorization on read, and how a refusal is shaped
A save is a **question**, and a question can stop being answerable: the grant can be revoked, or
the measure can leave the semantic layer. So listing re-validates each stored selection against
the **current** user's grants and the **current** registered domains, and reports what is no
longer runnable. Silently dropping it would hide a real access change from the reader — and
there is nothing cached to fall back to, which is the point.

Today there is nowhere to say no: `SavedQuery` and `Pin` both *require* a runnable `Selection`.
Both gain a **required** discriminated status —

```ts
{ runnable: true } | { runnable: false; reason: "grant_revoked" | "definition_unregistered"; message: string }
```

— required rather than optional so a consumer cannot forget to render it, and the stored
`selection` is **retained** on a refusal so the reader can still see and delete what they saved.

### Audit
**Eight** routes, not one: `POST/GET/DELETE /api/saved`, and `POST/GET/PATCH reorder/PATCH
:id/view/DELETE` on `/api/pins`. Each writes its record **before** the operation and fails
closed — if the insert throws, the operation does not happen.

Refusals are audited too, **including the ones the guard throws**. `RequireAction` raises inside
`auth.guard.ts:77-90`, before any controller method runs, so a denied save or pin would otherwise
leave no trace at all. A route-scoped audit exception filter on both controllers catches it and
delegates to `GlobalExceptionFilter`, exactly as `MisDrillAuditFilter` does for the drill.
`AuditService` gains typed exploration request and refusal methods beside the existing
`writeDrillEvent`/`writeDrillRefusalEvent`. Nothing here uses `writeResultEvent`, which
`audit.service.ts` documents as best-effort and never blocking.

## Workflow
```mermaid
flowchart TD
  M["0001_saved_and_pins.sql — hand-scoped"] --> T["creates saved_queries + dashboard_pins ONLY<br/>NOT pin_snapshots · NOT conversations · NOT the two unrelated tables<br/>+ explicit FK indexes (0015's surviving half)"]
  R["8 routes: POST/GET/DELETE /api/saved · POST/GET/PATCH reorder/PATCH :id~view/DELETE /api/pins"] --> G{AuthGuard · CsrfGuard · RequireAction save|pin}
  G -->|refused INSIDE the guard| FL["route-scoped audit filter<br/>the only thing that can see it"] --> AR["audit: fail-closed refusal"] --> F["403"]
  G --> AU["audit: fail-closed, BEFORE the operation"]
  AU -->|insert throws| STOP["error · the write never happens"]
  AU --> OP{operation}
  OP -->|create| C["store the SELECTION only — no ResultTable, ever"]
  OP -->|list| V{"re-authorize each stored selection<br/>current grants AND current semantic layer"}
  V -->|runnable| OK["status: runnable true"]
  V -->|grant revoked or measure gone| RF["status: runnable false + reason + message<br/>selection RETAINED · never dropped, never a cached figure"]
  X["PinRefreshService · its interval · :id/refresh · refresh-all<br/>create-time refresh · list-time join · core.module.ts:28/57/75<br/>Pin.snapshot · Pin.lastRefresh"] --> DEL["DELETED"]
```

## Manual Verification
1. `npm run build:contract && npm run build:backend && npm run typecheck && npm run lint &&
   npm run format:check && npm run test:hermetic` — the **six** hermetic leaves pass, each
   confirmed by its junit testcase name and executed count, never the exit code (D-0024, D-0031).
2. **The allow-list is the proof, in both directions** — `/api/saved` and `/api/pins` routes
   present, and **no** `refresh-all` or `:id/refresh` route anywhere.
3. **App-DB migration proof** — `npm run test:db` (the app-DB group, outside CI under D-0008;
   **not** `test:warehouse-proof`, which is the `WAREHOUSE_PG_*` database behind
   `WAREHOUSE_DB_TEST=1`). Against an **isolated scratch database** the test creates and drops,
   holding only `0000_auth_audit.sql`: the migration applies cleanly, `saved_queries` and
   `dashboard_pins` exist, and `pin_snapshots`, `conversations`, `conversation_turns`,
   `authored_measures` and `reconciliation_runs` **do not**.
4. `grep -rn "pinSnapshots\|PinRefreshService" backend/src` — nothing but the `schema.ts`
   declaration; in particular nothing in `core.module.ts`.
5. `grep -n "snapshot\|lastRefresh" contract/src/api.ts` — the `PinSnapshot` interface only,
   never a field on `Pin`.
6. Denied-grant curl against each of the eight routes writes an audit row — including the two
   the guard refuses outright.
7. The existing chat, statement and drill suites still pass **unchanged**; this task touches none
   of them.

## Decisions attested
0028 (saves store the selection, never the answer; pins are personal and re-authorize), 0026
(the assistant ships in the PoC), 0025 (the route-scoped audit filter, reused here for
guard-level denials), 0016 (all-or-nothing governed access, inherited by the re-authorization
rule), 0019 (house style for the routes — **and its non-deviated half: typed DTOs, documented
400/401/403, strict unknown-field rejection**), 0015 (**warehouse-only** snake_case — it does
**not** license the app-DB casing here; what survives is FK indexes and timezone-aware
timestamps), 0012 (the vendored API's constitution deviation covers these controllers **and the
app-DB casing they inherit**), 0011 (deployment readiness rides with the pilot), 0009 (required
tests name a real leaf and pin `TS_NODE_PROJECT`). Deferral **D-0006** is discharged for the
five ignored files this task must edit.

## Surface impact
- **New:** `0001_saved_and_pins.sql` and its journal entry; `saved.module.ts`, `pins.module.ts`;
  `common/exploration-audit.filter.ts` and its test; the service tests; the app-DB migration
  proof.
- **Changed:** `app.module.ts` (two imports), `app.routes.test.ts` (the allow-list),
  `core.module.ts` (the `PinRefreshService` registration removed),
  `pins.controller.ts`/`pins.service.ts` (snapshot behaviour removed, filter applied),
  `saved.controller.ts`/`saved.service.ts` (re-authorization, audit boundary, filter),
  `pins.schemas.ts`/`saved.schemas.ts` (strict unknown-field rejection per 0019),
  `contract/src/api.ts` (required `status`; `Pin.snapshot`/`lastRefresh` removed),
  `core/audit.service.ts` (typed exploration events), `db/migrate.trim.test.ts`
  (`EXPECTED_TABLES` grows by exactly two), `swagger.test.ts`, `backend/package.json` and
  `tools/quality-gate.test.mjs` (test registration), `.prettierignore` (five entries removed
  under D-0006, plus the deleted service's).
- **Deleted:** `pin-refresh.service.ts`.
- **Unchanged:** the semantic layer, the warehouse, the chat/statement/drill paths, the approved
  story plan's body, and the five tables that stay declared-but-absent.

## Out of scope
The Explore and pinned-reports surfaces (task 4); answer snapshots and shareable pins (0028);
durable chat history and `conversations` (deferred at the plan grill); the vendored
`HelpService` suggestions that name an unregistered dimension (**D-0040**).

<!-- forge:contract -->
## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Give exploration its persistence and its routes, and delete the snapshot behaviour decision 0028 forbids. A deliberately scoped migration creates saved_queries and dashboard_pins; the saved and pins modules are registered behind their existing grants; every read re-authorizes as the current user; and PinRefreshService, its interval, the two refresh routes and the create-time and list-time snapshot reads are removed outright. Backend only - the Explore and pinned-reports surfaces are task 4.

**Acceptance criteria**

- A DELIBERATELY SCOPED migration creates exactly two tables - saved_queries and dashboard_pins - and applies cleanly to a database whose only prior migration is 0000_auth_audit.sql, which is what every existing environment has. It is NOT generated from schema.ts: that would sweep in all seven absent tables, including pin_snapshots (which decision 0028 forbids writing to), conversations and conversation_turns (durable history deferred at the plan grill) and authored_measures and reconciliation_runs (features this story does not ship). Those five stay declared-but-absent and the gap is named rather than quietly closed. THE TWO-TABLE SCOPE SUPERSEDES the approved story plan's 'five new tables' wording at plans/active/assistant-assistant-exploration.md:111 and :263, which predates decision 0028 and the plan-grill deferral of durable history; confirmed by the human on 2026-09-12, with the plan body left unedited so its approval digest stands. Table and column names MATCH schema.ts:254-278 EXACTLY - saved_queries, dashboard_pins, user_id, chart_type, view_prefs, definition_version, refresh_cadence, last_refresh, created_at - because drizzle reads those names. That casing follows the vendored app-DB convention already set by 0000_auth_audit.sql under decision 0012 and is NOT authorized by decision 0015, whose snake_case deviation is warehouse-only (0015 line 17). 0015's still-applicable half DOES bind: an explicit index on each FK column (saved_queries.user_id, dashboard_pins.user_id) and timezone-aware timestamps.
- The saved and pins modules are REGISTERED and GOVERNED: imported by app.module.ts, with every route in the strict allow-list in backend/src/app.routes.test.ts - the only thing that proves a route exists - and each behind AuthGuard, the global CsrfGuard and its existing action grant (RequireAction('save') for saved, RequireAction('pin') for pins; no new action is minted, GRANT_ACTIONS already carries both). The allow-list assertion must fail on an UNEXPECTED route as well as a missing one, because the refresh routes are being removed and their absence is part of the contract. These routes enter the public API surface for the first time, so decision 0019's NON-deviated half binds them: named typed request and response DTOs, documented Swagger responses including typed 400/401/403, strict rejection of unknown request fields, and constitution/07-exception-handling.md's failure model. 0019's actual deviations stand - unversioned api/<resource> paths, raw typed bodies rather than {success,data,error} envelopes, direct cross-module imports - and 0019 imposes no pagination requirement.
- The snapshot machinery is DELETED, not merely unused. pins.service.ts:50 refreshes and persists a ResultTable on create and list left-joins pin_snapshots to return it; PinRefreshService is a whole background service - OnModuleInit/OnModuleDestroy, an interval calling refreshAllDue, storeAccessRevoked and storeExecutionError all writing pinSnapshots - and pins.controller.ts exposes POST :id/refresh and POST refresh-all. All of it goes: the service, its interval, the two refresh routes, the create-time refresh and the list join. The service has THREE live referrers, and missing any one of them fails the build or leaves the interval running: backend/src/core/core.module.ts imports it at :28, provides it at :57 and exports it at :75; pins.controller.ts:16 injects it; pins.service.ts:18/:25 imports it and toSnapshot. core.module.ts is therefore in write_scope and all three of its references go with the file. The Pin interface loses its snapshot and lastRefresh fields in contract/src/api.ts - an optional field that is never populated is exactly the compatibility leftover this task exists to remove. NO route returns a stored ResultTable and the pin_snapshots table is never created; the PinSnapshot interface and the pinSnapshots declaration in schema.ts may remain unused, as decision 0028's consequences state.
- Every read re-authorizes as the CURRENT user against the CURRENT semantic layer, because a save is a question and a question may stop being answerable. Listing saved queries or pins validates each stored selection against the caller's present grants and the registered domains; one the caller may no longer run is returned as a refusal that says so, never silently dropped and never served from anything cached - there is nothing cached to serve. A selection naming a measure or dimension the semantic layer no longer registers is likewise reported rather than returned as if runnable. THE REFUSAL HAS A DECLARED SHAPE, because today SavedQuery (contract/src/api.ts:372) and Pin (:386) each require a runnable Selection and there is nowhere to say no. contract/src/api.ts is in write_scope: both interfaces gain a REQUIRED discriminated status - {runnable: true} | {runnable: false, reason: 'grant_revoked' | 'definition_unregistered', message: string} - required rather than optional so a consumer cannot forget to render it, following the required-discriminated-union precedent at contract/src/api.ts:486. The stored selection is RETAINED on a refusal so the reader can still see and delete what they saved. No frontend consumes SavedQuery or Pin yet - task 4 builds those surfaces - so this shape is settled here, not later.
- Authorization and audit are per-request on EVERY route this task registers, not merely on create: POST /api/saved, GET /api/saved, DELETE /api/saved/:id, POST /api/pins, GET /api/pins, PATCH /api/pins/reorder, PATCH /api/pins/:id/view (pins.controller.ts:69) and DELETE /api/pins/:id. Each writes its audit record BEFORE the read or write and FAILS CLOSED - if the audit insert throws, the operation does not happen. Refusals are audited too, INCLUDING the ones RequireAction('save') and RequireAction('pin') throw from inside the guard (auth.guard.ts:77-90) BEFORE any controller method runs, which no in-controller audit can reach: those are caught by a route-scoped audit exception filter applied to both controllers, exactly as MisDrillAuditFilter does for the drill under decision 0025 (backend/src/mis/mis-drill.audit.filter.ts, @UseFilters at mis-drill.controller.ts:32), delegating to GlobalExceptionFilter once the record is written. AuditService gains typed exploration request and refusal methods beside the existing writeDrillEvent/writeDrillRefusalEvent; event_type is free text in 0000_auth_audit.sql:80 so they need no migration. Nothing here uses writeResultEvent, which audit.service.ts documents as best-effort and never blocking.
- The behaviour is proven by hermetic leaves covering registration and the absence of the refresh routes, the create and list payloads carrying NO ResultTable, the re-authorization refusal for a revoked grant and for a selection whose measure is no longer registered, the fail-closed audit on a denied branch, and a guard-level RequireAction denial being audited by the route-scoped filter; plus a DB-backed proof that the scoped migration applies to a database holding only 0000_auth_audit.sql, creates exactly saved_queries and dashboard_pins, and leaves the other five declared tables absent - run against an ISOLATED scratch database it creates and drops, never the developer's app DB. That proof is an APP-DB test, so it belongs in tools/quality-gate.test.mjs's dbTests list and backend/package.json test:db beside migrate.test.ts; test:warehouse-proof is the separate WAREHOUSE_PG_* group gated on WAREHOUSE_DB_TEST=1 and is the wrong home. It stays outside CI under D-0008 and is demonstrated on the host. backend/src/db/migrate.trim.test.ts:6 pins an EXACT expected-table list and WILL break: it is in write_scope and its EXPECTED_TABLES grows by exactly saved_queries and dashboard_pins, which makes it the hermetic proof that the SQL creates those two and none of the other five. New hermetic files are registered in backend/package.json test:hermetic AND tools/quality-gate.test.mjs hermeticTests, or CI runs none of them - and the partition assertion at quality-gate.test.mjs:331 requires every backend test file to appear in exactly one of dbTests or hermeticTests. Under D-0006, every file this task edits that is named in .prettierignore - backend/src/core/core.module.ts, backend/src/db/migrate.trim.test.ts, backend/src/pins/pins.controller.ts, backend/src/pins/pins.service.ts, backend/src/saved/saved.service.ts - is formatted and removed from that list in the same change, and the entry for the deleted pin-refresh.service.ts goes with the file. Check the EXECUTED COUNT and testcase name in every artifact, never the exit code (D-0024, D-0031).

**Write scope** (what `stage done` measures the diff against)

- backend/drizzle/0001_saved_and_pins.sql
- backend/drizzle/meta/_journal.json
- backend/src/app.module.ts
- backend/src/app.routes.test.ts
- backend/src/common/exploration-audit.filter.ts
- backend/src/common/exploration-audit.filter.test.ts
- backend/src/core/core.module.ts
- backend/src/core/audit.service.ts
- backend/src/saved/saved.module.ts
- backend/src/saved/saved.controller.ts
- backend/src/saved/saved.schemas.ts
- backend/src/saved/saved.service.ts
- backend/src/saved/saved.service.test.ts
- backend/src/pins/pins.module.ts
- backend/src/pins/pins.controller.ts
- backend/src/pins/pins.schemas.ts
- backend/src/pins/pins.schemas.test.ts
- backend/src/pins/pins.service.ts
- backend/src/pins/pins.service.test.ts
- backend/src/pins/pin-refresh.service.ts
- backend/src/db/migrate.trim.test.ts
- backend/src/db/migrate.exploration.db.test.ts
- backend/src/swagger.test.ts
- contract/src/api.ts
- backend/package.json
- tools/quality-gate.test.mjs
- .prettierignore

**Required tests** (run by `stage done`)

- `the saved and pins routes are registered behind their existing grants and no refresh route remains in the allow list` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/app.routes.test.ts)
- `creating and listing a pin returns no stored result table and no snapshot is written` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/pins/pins.service.test.ts)
- `listing refuses a saved selection the caller may no longer run instead of dropping it or serving a cached figure` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/saved/saved.service.test.ts)
- `a selection naming a measure the semantic layer no longer registers is reported rather than returned as runnable` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/pins/pins.service.test.ts)
- `a failing audit insert aborts a saved query write before it happens` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/saved/saved.service.test.ts)
- `a require action denial thrown by the guard is audited by the route scoped filter before the request fails` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/common/exploration-audit.filter.test.ts)
- `the scoped migration creates exactly saved queries and dashboard pins on a database holding only the auth audit migration` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/db/migrate.exploration.db.test.ts)

**Verify commands**

- `npm run build:contract`
- `npm run build:backend`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:hermetic`

**Review budget.** 27 files / 2900 lines -- The first schema change to the app database since platform-base, hand-scoped against a schema.ts that declares five more absent tables and against an approved plan that says five; registration and governance of two vendored modules under decision 0019's non-deviated half; a required discriminated refusal status added to two shared contract interfaces; a fail-closed audit on eight routes plus a route-scoped filter for guard-level denials; and the outright deletion of a background refresh service with its interval, two routes, a create-time refresh, a list-time join and its registration in core.module.ts. Seven required leaves, one a DB-backed migration proof against an isolated scratch database, plus the D-0006 formatting debt on five files this task must touch. No UI.
<!-- /forge:contract -->
