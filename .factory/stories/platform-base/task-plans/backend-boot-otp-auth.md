# Task plan — backend-boot-otp-auth

## Context
The vendored Pulse backend carries 11 app-DB migrations (0000–0010) creating auth, audit,
AND domain/feature tables. For the 3F PoC the app DB should be the **auth+audit minimum**,
the backend should boot, and **email+OTP login (mock OTP)** should work with RBAC and
append-only audit intact. The warehouse Postgres + adapter exist (task 2); this task adds a
**separate app DB** and boots the app on the trimmed schema.

## Scope decision (drift is intentional and bounded)
This task trims the **migrations only**. `backend/src/db/schema.ts` and the feature modules
(measures, chat/conversations, saved queries, pins, reconciliation) are **left compiled**;
their tables simply aren't migrated. This is deliberate, documented drift — detaching
feature modules is a later story's concern, out of this task's bound. Therefore
**`drizzle-kit generate` is NOT run** in this flow (it would regenerate the domain tables
from schema.ts); the trimmed migration set is authored/squashed by hand and applied by the
**runtime migrator** (`drizzle-orm` reads `meta/_journal.json` + the SQL tags).

## Write scope
`backend/src/`, `backend/drizzle/`, `docker-compose.yml`

## Migration classification (verified against the files)
KEEP (auth): users, roles, user_roles, role_perms, user_scope, sessions, otp_codes,
refresh_tokens. KEEP (audit): audit_events with its FINAL shape — including
`conversation_id` (added by 0007, nullable, no FK) and the four usage columns `model_id`,
`input_tokens`, `output_tokens`, `total_tokens` (added by 0009, which is audit-ONLY).
DROP (feature): saved_queries, dashboard_pins (both in 0000, FK→users), pin_snapshots
(0005, FK→dashboard_pins), reconciliation_runs (0002), conversations + conversation_turns
(0007), authored_measures (0010, FK→users only). Note **0000 is MIXED** (auth+audit AND
saved_queries+dashboard_pins) so it must be split/replaced, not retained wholesale.

## Approach
1. **Squash to a clean auth+audit migration set** under `backend/drizzle/`: a coherent set
   (prefer a single squashed `0000_auth_audit.sql`) creating exactly the KEEP tables with
   the final `audit_events` shape; rewrite `meta/_journal.json` to match (one entry) and
   remove/replace stale snapshot metas so the runtime migrator is consistent. No orphaned
   FKs; every retained `REFERENCES` points at a retained table. `db:migrate` seeds
   (roles + framework grants + configured users in `backend/src/db/migrate.ts`) are unchanged.
2. **Boot decoupling (narrow):** make `AuthoredMeasureRegistry.onModuleInit()`
   (`backend/src/measures/authored-measure.registry.ts`) tolerate ONLY the
   absent/empty `authored_measures` table (catch the undefined-table condition, init empty),
   and RE-THROW any other error — do not broad-catch (would mask real app-DB failures). No
   other boot-time code reads a trimmed table (pin-refresh + reconciliation schedulers exist
   but their intervals default to disabled — keep them disabled; they are unsupported on the
   minimum DB). The auth flow is unchanged.
3. **Separate app-DB service** in `docker-compose.yml`: an `app-db` Postgres with its own
   `POSTGRES_*` creds/db, a configurable host port defaulting to 5432 (distinct from
   warehouse-db's 5433), its own named volume. Keep warehouse-db untouched.
4. **Hermetic proof** — `backend/src/db/migrate.trim.test.ts`, test
   `"trimmed app-DB migrations declare only auth and audit tables"` (no live DB): parse the
   drizzle SQL + `_journal.json` and assert (a) created tables are EXACTLY the auth+audit
   set (none of saved_queries/dashboard_pins/reconciliation_runs/pin_snapshots/
   conversations/conversation_turns/authored_measures), (b) `audit_events` retains
   `conversation_id` + the four usage columns, (c) every retained `REFERENCES` target is a
   created table (no orphaned FK), (d) the journal entries correspond to the present SQL tags.
5. **Demonstrate the flow** (host, docker app-db) — see Verify.

## Acceptance criteria
- app-DB migrations trimmed to auth+audit run cleanly
- the backend boots and email+OTP login works (mock OTP)
- RBAC and append-only audit are intact; boot/login smoke tests pass

## Reviewer focus
Trim keeps only auth+audit; audit_events retains 0007 `conversation_id` + 0009 usage
columns; 0000 split correctly; no orphaned FKs; journal/meta consistent with the runtime
migrator (drizzle-kit generate intentionally NOT used; schema.ts drift documented). Boot
tolerance is absent-table-only (other errors propagate); auth flow unchanged; feature
schedulers stay disabled. app-db is a separate service with `PG*` creds distinct from
`WAREHOUSE_PG_*`. "Append-only audit" is application-level (fail-closed writes; no DB
trigger) and unchanged.

## Verify
- `npm run build:contract && npm run build:backend && npm run typecheck` all green.
- Required (hermetic, decision 0009): `"trimmed app-DB migrations declare only auth and
  audit tables"` (`backend/src/db/migrate.trim.test.ts`) via
  `TS_NODE_PROJECT=backend/tsconfig.json node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register`.
- Demonstrated evidence (host, docker `app-db`), env: `PGHOST=127.0.0.1 PGPORT=<app-db>
  PGUSER/PGPASSWORD/PGDATABASE` matching app-db, `AUTH_OTP_MOCK=true`, non-production
  `NODE_ENV`:
  - `npm run db:migrate` runs cleanly against a fresh app-db.
  - the backend boots (`backend/src/main.ts`).
  - mock-OTP login for the seeded admin (`admin@example.invalid`, from
    `backend/src/config.ts` / `migrate.ts` seed): obtain the `pulse_csrf` cookie, then POST
    `/api/auth/otp/request` and `/api/auth/otp/verify` (code `000000`) carrying the CSRF
    cookie + `x-csrf-token` header; verify returns AuthUser and sets `pulse_access`/`pulse_refresh`.
  - an `audit_events` row is written on `auth.otp_verified`.
  - the existing DB-backed tests pass against app-db: `backend/src/auth/auth.controller.test.ts`,
    `backend/src/db/migrate.test.ts`, `backend/src/core/audit.service.test.ts`.
