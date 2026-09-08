# Task plan — frontend-shell-login

## Context
platform-base tasks 1-4 delivered the backend (vendored NestJS + contract, Postgres
warehouse adapter, auth+audit boot with email+OTP login) and rebranded every product
identifier Pulse → 3F (decision 0010 — packages are now `@3f/contract` / `@3f/backend`,
auth cookies `3f_access` / `3f_refresh` / `3f_csrf`, JWT issuer `3f-api` / audience `3f`).
platform-base tasks 5-7 then delivered the repo-wide quality gate, the API-surface trim +
loopback hardening, and the **frontend-foundation** scaffold (the fresh Next.js App Router
`@3f/frontend` workspace, the `_ds`-token Tailwind theme, locally vendored Inter via
`next/font/local`, a TanStack Query provider, an in-tree shadcn `button`, and the widened
three-workspace quality gate). This task **consumes that foundation** (it does NOT recreate
the workspace) to build the **user-facing app shell** (Deep Forest left nav + white top bar,
branded 3F) and a net-new **email+OTP login**, both **faithful to the imported Claude Design
export** (`docs/design/3F-Financial-MIS/3F Financial MIS.dc.html`) and its `_ds` colour scheme.
Scope is **shell + login only**; MIS/drill-down/assistant screens are later stories.

## Write scope
`frontend/`, `package.json`, `package-lock.json`. The frontend workspace already exists (T7);
this task adds the shell + login source under `frontend/` and seeds `lucide-react` (host install)
for the nav icons. It does NOT re-scaffold the workspace or re-touch the root gate/eslint/guard.

## Decisions (tooling — conduct §9: no silent defaults)
Every tool below is a deliberate best-fit pick for THIS fresh TypeScript frontend, not an
ecosystem autopilot default; the load-bearing constitution reference is
`constitution/09-agent-conduct.md` §9 (justify or ask — never default).
- **Next.js (App Router) + React + TypeScript** — fixed by decision 0007.
- **npm workspaces (NOT Nx)** — `constitution/01-monorepo-standard.md` *recommends* Nx for
  JS/TS monorepos. This repo already is an npm workspace (backend + contract, inherited from
  the vendored snapshot, decision 0008). Adding `frontend` as a third npm workspace keeps one
  dependency graph and avoids re-tooling vendored code. **Deliberate, documented deviation**
  from the Nx recommendation — confirmed with the human on 2026-09-04.
- **Vitest + React Testing Library + jsdom** (tests) — Vitest is ESM/TS-native and fast, wires
  into the Next/TS config with minimal setup; RTL drives user-centric component tests; jsdom
  supplies the DOM. Best-fit over Jest (CJS-oriented, slower cold start) for a fresh TS app.
  Confirmed with the human 2026-09-04.
- **ESLint (`eslint-config-next` / core-web-vitals) + Prettier** (lint + format) — ESLint with
  the Next config catches React/Next/a11y problems; Prettier enforces formatting. Both wired
  into `verify_commands` (an enforced lint + format + type-check baseline, not just a test
  runner). Best-fit over Biome (weaker Next.js rule coverage). Confirmed with the human
  2026-09-04.
- **`tsc --noEmit`** (standalone frontend type-check) — the frontend has its OWN tsconfig
  (Next.js JSX/ESM, distinct from the backend CommonJS `tsconfig.base.json`), so it is
  type-checked on its own via a `typecheck:frontend` script; the existing root `typecheck`
  only covers contract + backend.
- **`next/font` (Inter)** — self-hosts the Inter `_ds` token face with no layout shift and no
  external font request (aligns with the CSP-free, offline-friendly posture).
- **TanStack Query (React Query v5)** — the server-state layer, **directed by the human
  2026-09-04**. All backend reads/writes go through it: `me` hydration as a query, the OTP
  request/verify and logout as mutations — giving declarative loading/error/retry and cache
  invalidation instead of hand-rolled `useEffect`/`useState`. It wraps (does not replace) the
  `api.ts` fetch transport, which still owns `credentials:'include'` and the per-POST `3f_csrf`
  re-read. (Other TanStack libs — Table/Router — are NOT needed for shell+login: Next.js owns
  routing and there are no data grids yet; this lays the Query foundation for the later MIS
  screens.)
- **shadcn/ui** — component primitives owned in-tree (not a black-box dep), restyled to the
  `_ds` tokens. Directed by the human 2026-09-04.

## Design source (approved export + `_ds` tokens)
- **Shell = the interactive export** (`docs/design/3F-Financial-MIS/3F Financial MIS.dc.html`):
  Deep Forest left nav (200px expanded / 62px collapsed), 3F header, **5 nav labels exactly:
  `Dashboard`, `MIS Reports`, `Ask`, `Explore / Saved`, `Admin`** (the "Admin · Mapping
  master" string is a PAGE TITLE, not the nav label), + user block; white 56px top bar (page
  title, global search, data-freshness pill, avatar); off-white canvas.
- **Tokens** (`docs/design/3F-Financial-MIS/_ds/.../tokens/*.css`): Deep Forest `#0C3529` (nav),
  Emerald `#1C6B49` (on-light accent), Mint `#6AF1B0` (dark surfaces ONLY), Off-White `#F4F7F6`,
  White cards, Ink `#28332E`, Slate `#5F706A`, Line `#D9E1DD`; Inter (56/36/26/20 / 17/14/13;
  800/700/600/400); space 4..96; radius 6/10/14/999; btn 44px; container 1180.
- **Login is NET-NEW** (no mock) — designed here from the token system.

## Login design (net-new, per frontend-design + emil)
Split screen. **Left brand panel** (Deep Forest): "3F Financial MIS" wordmark + one quiet
value line ("Financial MIS, straight from SAP"); Mint only as a thin on-dark accent. **Right
white card** (on off-white): a two-step flow — step 1 email → Emerald "Send code" (44px,
radius-md); step 2 a single 6-digit code field → Emerald "Verify", with "Use a different
email" back link + "Resend code". Signature = the brand panel; everything else quiet. Inter;
Emerald focus rings; button `:active` scale(0.97); enter transitions ease-out ≤200ms;
`prefers-reduced-motion` respected; responsive (panel stacks above the card on mobile).
Copy in-voice: uniform ack "If that email has access, a code is on its way." (no account
enumeration); invalid/expired → "That code didn't match — check it or resend."

## Workflow
The end-to-end flow this task builds: an unauthenticated visitor is routed to the
two-step OTP login, and on success lands in the authenticated app shell; a stale
session (an access-token 401 that survives one refresh retry) drops them back to login; logout returns to login.

```mermaid
flowchart TD
  A[Visitor hits any /(app) route] --> B{authenticated?<br/>GET /api/auth/me}
  B -- 401 --> C[/login]
  B -- 200 AuthUser --> S[App shell:<br/>Deep Forest nav + white top bar]
  C --> D[Step 1: email]
  D -->|GET /api/auth/csrf then<br/>POST /api/auth/otp/request| E[Step 2: 6-digit code<br/>uniform ack, focus moves to code]
  E -->|client validates /^\d{6}$/ then<br/>POST /api/auth/otp/verify| F{verify}
  F -- invalid/expired --> E
  F -- AuthUser --> S
  S -->|only Dashboard active;<br/>other 4 nav items aria-disabled| S
  S -->|user block: POST /api/auth/logout| C
```

Every mutating POST reads the CURRENT `3f_csrf` cookie immediately before the call
and sends it as `x-csrf-token` (the guard rotates it per request), with
`credentials:'include'` and JSON body.

## Approach
0. **Consume the foundation** — frontend-foundation already shipped the `@3f/frontend` Next.js
   App Router workspace, the `_ds`-token Tailwind theme (Deep Forest/Emerald/Mint/Off-White via
   `--kl-*`), `next/font/local` Inter, the TanStack Query provider seam, an in-tree shadcn
   `button` + `cn()`, the Vitest+RTL+jsdom runner, and the widened three-workspace quality gate.
   Do NOT recreate any of that. Seed **`lucide-react`** (deferred from T7) on the host for the nav
   icons, and resolve the **D-0012** `--text-body`/`ink` token collision in BOTH places (map Tailwind `ink` to
   `var(--kl-ink)` AND change `frontend/app/globals.css`'s `color: var(--text-body)` to the ink token - `--text-body`
   is a 17px SIZE in typography.css, invalid as a colour) now that the theme is applied to real screens.
1. **Design fidelity first** — the shell mirrors the bound export `3F Financial MIS.dc.html`
   (the interactive one), the login is net-new per the spec's normative Login screen contract;
   both use ONLY the `_ds` `--kl-*` tokens (no raw hex in components). Apply the frontend design
   skills (emil-design-eng + frontend-design); the functional check verifies fidelity at
   1440x900 and 390x844.
5. **App shell** — `frontend/app/(app)/layout.tsx` + `frontend/src/components/shell/`:
   Deep Forest `LeftNav` (collapsible 200/62, 3F header, the 5 nav items, user block) + white
   `TopBar` (title, search, freshness pill, avatar) + off-white canvas + a placeholder
   Dashboard page. **Only Dashboard is an active route; the other 4 nav items render
   `aria-disabled` / non-navigable (no dead routes, no "coming soon" copy)** — later stories
   activate them. **The top-bar search is a disabled, `aria-disabled` placeholder** (no live
   behaviour) until a later capability owns search. Route-guarded: unauthenticated → `/login`;
   an access-token 401 triggers exactly ONE `POST /api/auth/refresh` then RETRIES the request; only if that
   retry also fails does it clear client auth state and redirect to `/login` (otp/verify 401s are EXCLUDED - no
   refresh loop). **Logout** is an accessible
   control in the user block → `POST /api/auth/logout` → redirect `/login`. Mobile: the left
   nav collapses to an off-canvas drawer with an accessible toggle.
6. **Login** — `frontend/app/login/page.tsx` + `frontend/src/features/auth/login-form.tsx`
   (the two-step design). A11y: email `type=email autocomplete=email`; code field
   `inputmode=numeric autocomplete="one-time-code"` with client-side `/^\d{6}$/` validation;
   errors/acks announced via `aria-live="polite"`; focus moves to the code field after "Send
   code" and to the first error on failure; real `<label>`s.
7. **Auth client** — `frontend/src/lib/api.ts`: `fetch` with `credentials:'include'` against
   `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:4000` per the spec loopback contract; NOT localhost). Routes live under `/api/auth`.
   POSTs send `Content-Type: application/json` + `JSON.stringify(body)` and set `x-csrf-token`
   to the **current `3f_csrf` cookie value read immediately before each request** (the guard
   rotates it every mutating request — do NOT cache); call `GET /api/auth/csrf` once to
   bootstrap the cookie. Endpoints: `POST /api/auth/otp/request {email}` →
   `POST /api/auth/otp/verify {email, code}` → **`AuthUser` imported from `@3f/contract`**
   (no duplicated shape); `GET /api/auth/me` hydrate; `POST /api/auth/logout`.
8. **Tests (Vitest + RTL, jsdom, hermetic — mocked fetch/cookie, no backend)** — an expanded
   suite that can actually falsify a broken login/shell (per the human's "expand hermetic
   coverage" choice):
   - `frontend/src/features/auth/login-form.test.tsx` — `"OTP login form validates a
     six-digit code before calling verify"` (rejects non-6-digit; calls a mocked client only
     with a valid code).
   - `frontend/src/lib/api.test.ts` — `"auth client sends credentials and re-reads the 3f_csrf
     cookie on every mutating request"` (asserts `credentials:'include'`, JSON content-type,
     the exact method+URL for csrf/otp-request/otp-verify/me/logout, and that `x-csrf-token`
     equals the CURRENT cookie re-read before each POST — catches a stale/cached CSRF).
   - `frontend/src/features/auth/session-guard.test.tsx` — `"the app redirects to /login when
     the session check returns 401"` (mock `me` → 401 clears state and routes to /login).
   - `frontend/src/components/shell/app-shell.test.tsx` — `"the app shell renders exactly the
     five nav labels with only Dashboard active"` (the 5 labels present; Dashboard is a link,
     the other 4 are `aria-disabled`/non-navigable; the search placeholder is disabled).
   `frontend/vitest.config.ts` pins `root` and a JUnit reporter that emits a `<testcase>` whose
   name matches the leaf id AND whose `file`/`classname` resolve to the declared path, so the
   stage runner (cwd = repo root) matches it. **Verify with a negative control** (decision
   0009): each command must FAIL when its assertion is broken and PASS otherwise.

## Acceptance criteria
- the app shell (top bar + left nav) renders in KnackLabs green, branded 3F, faithful to the bound design export docs/design/3F-Financial-MIS/3F Financial MIS.dc.html - Deep Forest (#0C3529) left nav (200px expanded / 62px collapsed, 3F header, user block) + white 56px top bar + Off-White (#F4F7F6) canvas, built ONLY from the _ds --kl-* tokens (no raw hex in components); on mobile (390x844) the left nav collapses to an off-canvas drawer behind a keyboard-focusable toggle that reports aria-expanded, closes on Escape, and returns focus to the toggle. Consumes the frontend-foundation scaffold (theme, next/font/local Inter, TanStack Query provider, shadcn primitives); the D-0012 --text-body/ink token collision is resolved as the theme is applied to real screens (Tailwind ink maps to --kl-ink)
- email+OTP login works end-to-end under the spec's local runtime contract: a successful verification lands in the shell, logout returns to /login, and an access-token 401 retries once through POST /api/auth/refresh before falling back to /login. The client (frontend/src/lib/api.ts) uses credentials:'include' against the auth allow-list (GET /api/auth/csrf bootstrap, POST otp/request, POST otp/verify, GET me, POST refresh, POST logout) and sends x-csrf-token re-read from the current 3f_csrf cookie immediately before EVERY mutating request (never cached); server state is TanStack Query (me as a query the route guard reads, otp/logout as mutations that prime/invalidate it)
- the login screen implements the spec's normative Login screen contract (docs/specs/app-platform-base.md §Login screen contract): a split screen from _ds tokens (left Deep Forest #0C3529 brand panel with the '3F Financial MIS' wordmark + one value line, Mint #6AF1B0 as a thin on-dark accent only; right a white card on the Off-White canvas; brand panel stacks above the card at 390x844), the two-step flow (email type=email autocomplete=email + Emerald #1C6B49 'Send code' 44px at radius-md; then a 6-digit field inputmode=numeric autocomplete=one-time-code client-validated /^\d{6}$/ with Emerald 'Verify', a 'Use a different email' back link and 'Resend code'), the load-bearing uniform copy ('If that email has access, a code is on its way.' / 'That code didn't match - check it or resend.'), and the accessibility (real <label>s, aria-live=polite acks/errors, focus to the code field after Send and to the first error on failure, :active feedback, ease-out <=200ms entry transitions, prefers-reduced-motion respected), verified by the user-facing functional check at 1440x900 and 390x844
- exactly five nav labels (Dashboard, MIS Reports, Ask, Explore / Saved, Admin) render with only Dashboard active (a real route); the other four, the top-bar global search and the data-freshness pill render visibly unavailable (aria-disabled / non-navigable, no dead routes, no 'coming soon' copy, the freshness pill reads as explicitly unavailable) and make NO feature API calls - these are the spec's intentional, enumerated divergences from the active design export, not fidelity failures

## Reviewer focus
Load-bearing constitution refs: `constitution/09-agent-conduct.md` (§9 no silent tooling
defaults — the Decisions section must justify every pick; §2 no over-building; surgical scope)
and `constitution/01-monorepo-standard.md` (workspace + shared-contract structure — the
npm-workspaces-vs-Nx deviation is documented, not silent). Beyond the law: fresh Next.js (no
reuse of any vendored frontend); tokens drive the theme (no hardcoded colors; Emerald on light,
Mint dark-only); shell matches the interactive export with EXACT nav labels, the 4 not-yet-built
items disabled and the top-bar search a disabled placeholder (no dead routes, no live-looking
inert control); login faithful to the token system; AuthUser imported from `@3f/contract`; server state via
TanStack Query (me query + OTP/logout mutations) wrapping — not replacing — the `api.ts`
transport; CSRF rotation-safe double-submit (current `3f_csrf` cookie re-read per POST) +
credentials:include + JSON content-type; me-401 → /login; logout wired; accessible (labels, one-time-code, aria-live,
focus transfer), responsive (mobile drawer), reduced-motion. A stack-appropriate lint + format +
type-check gate (ESLint + Prettier + `tsc --noEmit`) is wired into `verify_commands`, and the
required tests genuinely run from repo root against a LOCAL (pinned, non-downloading) Vitest with
a matching, attributable JUnit testcase (decision 0009, negative-control checked).

## Grill resolutions (all repo-answerable, applied)
The single cold read returned eight blocking contradictions; all are settled here (no shape change):
1. **Router topology** — routes live in the foundation's `frontend/app/`: the shell in `app/(app)/`, login in
   `app/login/`; the foundation placeholder `frontend/app/page.tsx` is REPLACED (`/` redirects to the shell when
   authed, else `/login`). Non-route code stays under `frontend/src/` (components/features/lib).
2. **Loopback** — `api.ts` defaults the API base to `http://127.0.0.1:4000` (spec runtime contract; localhost
   risks IPv6/CORS); Manual Verification uses `127.0.0.1` throughout and brings up `warehouse-seed` + the
   `WAREHOUSE_PG_*` config.
3. **Refresh-once** — an access-token 401 → exactly one CSRF-protected `POST /api/auth/refresh` → retry the
   original request; only a failed retry clears auth and routes to `/login`. `otp/verify` 401s (invalid code) are
   EXCLUDED (no loop, no stale-session misread). `refresh` is in the endpoint list and the api tests.
4. **Test coverage** — the seven required_tests falsify the load-bearing behaviours: 6-digit validation, csrf
   re-read, refresh-once-then-retry (and no-refresh-on-otp-401), redirect-only-after-retry-fails, five-nav /
   only-Dashboard / disabled-items-make-no-API-calls, resend+use-different-email, and the mobile drawer
   aria-expanded/Escape/focus. Live login E2E + audit + no-enumeration stay demonstrated Postgres evidence; the
   functional check (1440x900 + 390x844) verifies fidelity.
5. **D-0012** — fixed in both the Tailwind `ink` mapping and `globals.css`'s `color` rule (above).
6. **Secondary controls** — 'Resend code' re-calls `POST otp/request` for the same email and re-announces the
   uniform ack (focus stays on the code field); 'Use a different email' returns to step 1 and refocuses the email.
7. **lucide-react** — the shadcn/ui-standard, tree-shakeable, MIT icon set; best-fit nav icon source
   (constitution §9 justified), host-seeded (Codex sandbox has no network).
8. **Exact proof** — `npm exec --no -- vitest` everywhere (never bare `npm exec --`/npx); the plan's test names
   EQUAL the required_tests leaf ids (decision 0009, no false green).

## Verify
- `npm run build:contract && npm run build:backend && npm run typecheck && npm run
  typecheck:frontend && npm run lint:frontend && npm run format:check:frontend && npm run
  build:frontend` all green (builds + the frontend lint/format/type-check gate).
- Required hermetic tests pass AND genuinely run from repo root with matching, attributable
  JUnit testcases (negative-control checked, decision 0009), via a LOCAL pinned Vitest (no
  download): `npm exec --no -- vitest run --config frontend/vitest.config.ts --reporter=junit
  --outputFile={report} -t {id} {path}`.
- Demonstrated (host): app-db + warehouse-db up; backend with `AUTH_OTP_MOCK=true`,
  non-production `NODE_ENV`, `FRONTEND_ORIGIN=http://localhost:3000`; `npm run dev:frontend`
  (Next on :3000). The two-step login completes against the backend for the seeded admin
  (`admin@example.invalid`): CSRF bootstrap → request → verify `000000` → lands in the shell;
  `me` hydrates; shell renders KnackLabs green with the 5 nav items (4 disabled) + 3F brand;
  logout returns to `/login`.
- Functional check (user_facing): the functional-checker exercises login + shell + logout.

## Manual Verification
Steps a human runs to see it work, in order, with what they should observe:
1. Start Postgres: `docker compose up -d app-db warehouse-db`; then `npm install`,
   `npm run build`, `npm run db:migrate`.
2. Start the backend with mock OTP + CORS for the frontend:
   `AUTH_OTP_MOCK=true NODE_ENV=development FRONTEND_ORIGIN=http://localhost:3000 npm run dev:backend`
   → observe "3F backend listening" on :4000.
3. Start the frontend: `npm run dev:frontend` → Next.js serves on :3000.
4. Open `http://localhost:3000` → **observe** you are redirected to `/login`, a split
   screen: Deep Forest brand panel ("3F Financial MIS") on the left, white card on the right.
5. Enter `admin@example.invalid`, click **Send code** → **observe** the uniform ack, and
   focus moves to a single 6-digit code field (step 2).
6. Type `12345` → **observe** the client blocks verify (needs 6 digits); type `000000`,
   click **Verify** → **observe** you land in the app shell.
7. In the shell → **observe** KnackLabs green: Deep Forest left nav with exactly
   `Dashboard`, `MIS Reports`, `Ask`, `Explore / Saved`, `Admin` (only Dashboard active;
   the other 4 visibly disabled / non-navigable), the top-bar search visibly disabled, 3F
   brand in the header, a white 56px top bar (title, search, freshness pill, avatar),
   off-white canvas.
8. Narrow the window to mobile width → **observe** the left nav collapses to an off-canvas
   drawer with a working, keyboard-focusable toggle.
9. Click the user block → **Logout** → **observe** you return to `/login` and re-visiting
   an app route keeps you at `/login`.
