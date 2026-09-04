# Task plan — rebrand-pulse-to-3f

## Context
The backend + contract were vendored from Pulse (decision 0008), so the running product still
carries Pulse identifiers. Per decision 0010 (user: "everything is 3F, no pulse"), rename every
**product identifier** Pulse → 3F across the vendored backend + contract BEFORE the frontend
task. Behaviour-preserving (names only). **Provenance is preserved** (accurate Pulse-origin
history stays).

## Write scope
`backend/`, `contract/`, `package.json`, `package-lock.json`, `docker-compose.yml`, `tsconfig.base.json`

## Rename map — product identifiers (verified against source via the grill)
1. **npm packages**: `@pulse/contract` → `@3f/contract`, `@pulse/backend` → `@3f/backend` —
   `name` fields (`contract/package.json`, `backend/package.json`), backend→contract dep, root
   `package.json` refs, **EVERY import specifier** across `backend/src/**` (incl. ~10 `*.test.ts`)
   and `contract/src/**`, `backend/Dockerfile` (`npm -w @pulse/backend …` → `@3f/backend`), any
   tsconfig path/reference. `npm install` to rewrite `package-lock.json` + workspace symlinks.
   (`@3f/` is a valid npm scope — no resolution conflict; Node resolution, no tsconfig paths map.)
2. **Auth WIRE names** — set AND verify sides together:
   - cookies `pulse_access`/`pulse_refresh`/`pulse_csrf` → `3f_access`/`3f_refresh`/`3f_csrf`
     via the `AUTH_COOKIE_NAMES` map in `backend/src/auth/cookies.ts`; readers stay via the map
     (`auth.controller.ts` refresh, `auth.guard.ts` access+refresh, `csrf.guard.ts`).
   - JWT in `backend/src/core/session.service.ts` (3 sites — access sign :188-189, refresh sign
     :200-201, verify :220-221): **issuer `pulse-api` → `3f-api` AND audience `pulse` → `3f`**
     (the grill found audience is `pulse`, not `pulse-api`). Sign and verify must match.
3. **Product strings / infra**:
   - Swagger/OpenAPI title `Pulse API` → `3F API` (`backend/src/main.ts:11`); boot log
     `Pulse backend listening` → `3F backend listening`.
   - Seed `DEFAULT_SEED_USERS` "Pulse Admin" → "3F Admin" (`backend/src/config.ts`).
   - App-DB identifiers `pulse` → **`threef`** (NOT `3f` — a Postgres identifier can't start with
     a digit): `docker-compose.yml` app-db `POSTGRES_DB`/`POSTGRES_USER` defaults + password
     `pulse-local` → `3f-local`, mirrored by `backend/src/config.ts` `cfg.pg` fallbacks
     (host/user/db/password defaults). warehouse-db stays as-is.
   - `AUTH_JWT_SECRET` dev fallback `pulse-local-dev-auth-secret` → `3f-local-dev-auth-secret`
     (`backend/src/config.ts`).
   - Chat greeting "I'm Pulse" → "I'm 3F" (`backend/src/chat/smalltalk-guard.ts`).
   - Contract API field `whatPulseWont` → `whatItWont` (`contract/src/api.ts` + its emit in
     `backend/src/help/help.service.ts`).
   - Help/glossary/LLM product-name strings "Pulse" → "3F" (`help.service.ts`, `glossary.ts`,
     `llm/llm.constants.ts`).
   - Non-provenance source COMMENTS mentioning Pulse (so the no-Pulse scan is clean): reword
     "Pulse Postgres" (`core/rbac.service.ts`), "Pulse roles" (`grants/grants.controller.ts`),
     "Pulse-managed" (`contract/src/rbac.ts`), and the `backend/drizzle/0000_auth_audit.sql`
     header comment ("preserve Pulse's existing SQL names" → "preserve the vendored auth/audit
     SQL names"). These are rationale comments, not provenance records.
4. **Tests to update** (in `backend/src`, in scope): switch `@pulse/contract` imports → `@3f/contract`
   in every `*.test.ts` that has them (audit.service, chat.sse, suppression, measures.guard,
   definitionVersion, usage.controller, users.controller, postgres.adapter.oid, …); `migrate.test.ts`
   expect "3F Admin"; `auth.controller.test.ts` assert the literal `3f_access`/`3f_refresh`/`3f_csrf`
   names; `session.service.test.ts` assert the `3f-api` issuer + `3f` audience on both token types;
   `swagger.test.ts` assert the `3F API` title.

## Provenance — do NOT touch (out of scope, accurate history)
`backend/VENDORED_FROM`, `docs/decisions/0008-pulse-vendored-snapshot.md`, and decision/plan/spec
prose recording "vendored Pulse @ e639840".

## Approach
Do the rename in the order above (packages+imports → wire names → strings/infra → tests), then
`npm install`, then build/typecheck to prove `@3f/*` resolves. Add the hermetic scan test last.

## Acceptance criteria
- no Pulse product identifier remains in backend/ or contract/ or root workspace config
  (package names, imports, cookie names, JWT issuer/audience, seed name, boot log, swagger title,
  app-db identifiers, contract field, help/glossary/chat strings, source comments)
- the workspace builds and typechecks and the existing hermetic tests pass under the @3f/* names
- the email+OTP login still works end-to-end with the renamed cookies/JWT (mock OTP), RBAC + audit intact

## Reviewer focus
Complete + consistent rename per the map; wire names (cookies + JWT issuer AND audience) changed
on set AND verify sides so auth is behaviourally unchanged; app-db uses `threef` (SQL-safe, not
`3f`); provenance history preserved; no behaviour change beyond names; no-Pulse scan test avoids
self-matching and genuinely runs from repo root (decision 0009).

## Verify
- `npm run build:contract && npm run build:backend && npm run typecheck` all green (proves the
  @3f/* rename + every import resolves).
- Required hermetic tests pass from repo root (decision 0009 form, negative-control checked):
  - `"backend and contract source declare only 3F product identifiers"`
    (`backend/src/branding.identifiers.test.ts`) — scans backend/src + contract/src; forbidden
    literals built dynamically so the test doesn't self-match; excludes provenance (VENDORED_FROM
    is not under src).
  - `"blocked columns are rejected case-insensitively by leaf column name"`
    (`backend/src/sql/sqlValidator.pii.test.ts`) — still hermetic + passing (contract resolution
    is proven by build:backend/typecheck above).
  - via `TS_NODE_PROJECT=backend/tsconfig.json node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register`
- Demonstrated (host): app-db recreated with the `threef` db/user; migrate + boot; mock-OTP login
  now sets `3f_access`/`3f_refresh`/`3f_csrf` cookies and JWTs with issuer `3f-api` / audience `3f`,
  returns AuthUser, audit row written — auth works under the renamed wire names.
