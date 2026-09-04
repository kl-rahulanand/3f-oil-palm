# Task plan — frontend-shell-login

## Context
platform-base tasks 1-3 delivered the backend (vendored NestJS + contract, Postgres
warehouse adapter, auth+audit boot with email+OTP login). This task builds the **fresh
frontend** (decisions 0006/0007): a Next.js App Router app — shadcn/ui + Tailwind themed by
the **KnackLabs `_ds` tokens** — with the **app shell** (Deep Forest left nav + white top
bar, branded 3F) and an **email+OTP login** wired to the backend auth API, faithful to the
approved Claude Design. Scope is **shell + login only**; MIS/drill-down/assistant screens
and the chatbot rail are later stories.

## Write scope
`frontend/`, `package.json`, `package-lock.json` (add the `frontend` workspace — decision 0008)

## Design source (approved export + `_ds` tokens)
- **Shell = the interactive export** (`docs/design/3F-Financial-MIS/3F Financial MIS.dc.html`):
  Deep Forest left nav (200px expanded / 62px collapsed), 3F header, **5 nav labels exactly:
  `Dashboard`, `MIS Reports`, `Ask`, `Explore / Saved`, `Admin`** (the "Admin · Mapping
  master" string is a PAGE TITLE, not the nav label), + user block; white 56px top bar (page
  title, global search, data-freshness pill, avatar); off-white canvas.
- **Tokens** (`_ds/.../tokens/*.css`): Deep Forest `#0C3529` (nav), Emerald `#1C6B49`
  (on-light accent), Mint `#6AF1B0` (dark surfaces ONLY), Off-White `#F4F7F6`, White cards,
  Ink `#28332E`, Slate `#5F706A`, Line `#D9E1DD`; Inter (56/36/26/20 / 17/14/13; 800/700/600/400);
  space 4..96; radius 6/10/14/999; btn 44px; container 1180.
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

## Approach
1. **Scaffold** `frontend/` — Next.js App Router + React + TypeScript, its OWN tsconfig
   (not the backend CommonJS `tsconfig.base.json`). Add `frontend` to root `package.json`
   workspaces + root scripts **`build:frontend` AND `dev:frontend`** (`npm -w frontend run …`);
   depend on `@pulse/contract` for shared types. `npm install`.
2. **Theme** — Tailwind so the `_ds` tokens ARE the theme: token CSS variables mapped into
   `tailwind.config` (colors/space/radius/font). Inter via `next/font`. No hardcoded colors.
3. **shadcn/ui in-tree** — Button, Input, Label, Field, Card, Avatar + nav/topbar primitives
   under `frontend/src/components/ui`, restyled to the tokens.
4. **App shell** — `frontend/src/app/(app)/layout.tsx`: Deep Forest `LeftNav` (collapsible
   200/62, 3F header, the 5 nav items, user block) + white `TopBar` (title, search, freshness
   pill, avatar) + off-white canvas + a placeholder Dashboard page. **Only Dashboard is an
   active route; the other 4 nav items render `aria-disabled` / non-navigable (no dead routes),
   marked "coming soon"** — later stories activate them. Route-guarded: unauthenticated →
   `/login`; a `me` 401 clears client auth state and redirects to `/login`. **Logout** is an
   accessible control in the user block → `POST /api/auth/logout` → redirect `/login`.
   Mobile: the left nav collapses to an off-canvas drawer with an accessible toggle.
5. **Login** — `frontend/src/app/login/page.tsx` + `frontend/src/features/auth/login-form.tsx`
   (the two-step design). A11y: email `type=email autocomplete=email`; code field
   `inputmode=numeric autocomplete="one-time-code"` with client-side `/^\d{6}$/` validation;
   errors/acks announced via `aria-live="polite"`; focus moves to the code field after "Send
   code" and to the first error on failure; real `<label>`s.
6. **Auth client** — `frontend/src/lib/api.ts`: `fetch` with `credentials:'include'` against
   `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`). POSTs send
   `Content-Type: application/json` + `JSON.stringify(body)` and set `x-csrf-token` to the
   **current `pulse_csrf` cookie value read immediately before each request** (the guard
   rotates it every mutating request — do NOT cache); call `GET /api/auth/csrf` once to
   bootstrap the cookie. Endpoints: `otp/request {email}` → `otp/verify {email, code}` →
   **`AuthUser` imported from `@pulse/contract`** (no duplicated shape); `me` hydrate; `logout`.
7. **Tests** — Vitest + RTL (jsdom): hermetic `frontend/src/features/auth/login-form.test.tsx`,
   test `"OTP login form validates a six-digit code before calling verify"` (rejects non-6-digit;
   calls a MOCKED client with a valid code; no backend). `frontend/vitest.config.ts` pins
   `root` and a JUnit reporter that emits a `<testcase>` whose name matches the leaf id AND
   whose `file`/`classname` attributes resolve to the declared path, so the stage runner
   (cwd = repo root) matches it. **Verify with a negative control** (decision 0009): the
   command must FAIL when the assertion is broken and PASS otherwise.

## Acceptance criteria
- the Next.js app builds and the app shell (top bar + left nav) renders in KnackLabs green, branded 3F
- the OTP login screen works against the backend
- components use shadcn/ui + Tailwind themed by the _ds tokens, faithful to the Claude Design

## Reviewer focus
Fresh Next.js (no Pulse frontend reuse); tokens drive the theme (no hardcoded colors; Emerald
on light, Mint dark-only); shell matches the interactive export with EXACT nav labels and the
4 not-yet-built items disabled (no dead routes); login faithful to the token system; AuthUser
imported from @pulse/contract; CSRF rotation-safe double-submit (current cookie per POST) +
credentials:include + JSON Content-Type; me-401 → /login; logout wired; accessible (labels,
one-time-code, aria-live, focus transfer), responsive (mobile drawer), reduced-motion;
frontend workspace + build:frontend/dev:frontend scripts added to root.

## Verify
- `npm run build:contract && npm run build:backend && npm run typecheck && npm run build:frontend` green.
- Required hermetic test passes AND genuinely runs from repo root with a matching, attributable
  JUnit testcase (negative-control checked, decision 0009):
  `npx vitest run --config frontend/vitest.config.ts --reporter=junit --outputFile={report} -t {id} {path}`.
- Demonstrated (host): app-db + warehouse-db up; backend with `AUTH_OTP_MOCK=true`,
  non-production `NODE_ENV`, `FRONTEND_ORIGIN=http://localhost:3000`; `npm run dev:frontend`
  (Next on :3000). The two-step login completes against the backend for the seeded admin
  (`admin@example.invalid`): CSRF bootstrap → request → verify `000000` → lands in the shell;
  `me` hydrates; shell renders KnackLabs green with the 5 nav items (4 disabled) + 3F brand;
  logout returns to `/login`.
- Functional check (user_facing): the functional-checker exercises login + shell + logout.
