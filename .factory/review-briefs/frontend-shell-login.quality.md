# Review brief — frontend-shell-login — quality lens

You are one lens of a three-lens code review. You see ONLY the diff bundle for
this task (no repository access), so judge what the diff shows and say so when
something cannot be verified from it. Report every finding with its
file_path and line. Use ONLY these categories: bug, security, regression,
test_gap, maintainability. Priorities: P0/P1 block the task; P2/P3 must be
resolved or explicitly deferred with a reason before it ships.

LENS: QUALITY. Correctness, regressions, gaps in the implementer's tests,
API/contract drift, and maintainability. Check approved-deliverable presence and
reachability FIRST: every deliverable a plan contract, acceptance criterion, or
the reviewer focus names must be genuinely implemented AND reachable (registered,
invoked — not merely defined in a file nothing imports); an absent or unreachable
deliverable is a blocking finding even when the rest is clean. Flag
single-responsibility violations and incoherent file/folder organisation against
the reviewer focus (never a mandated layout). Structure-for-growth in shared
infrastructure is NOT over-engineering; reserve that finding for speculative
abstraction. Enforce the minimal-diff discipline (a new dependency where the
stdlib suffices, reimplementing an existing helper, sprawl where a surgical
change would do) — but a diff that drops validation, error handling, security, or
accessibility to look smaller is the OPPOSITE finding. The constitution's coding
standards are law: flag deviations you can see in the diff. Assess cyclomatic
complexity of every changed function; genuinely knotted control flow (roughly
>10 independent paths) is blocking and must name its decomposition.

LEFTOVERS (blocking): the diff must carry no code kept only for compatibility — no wrapper or shim over its replacement, no re-export or alias kept 'for callers', no renamed-but-retained symbol, no dead branch behind a removed feature, no 'legacy'/'deprecated'/'backward' naming or comment. Report each as a BLOCKING finding with file:line and verdict the contract it belongs to as partial; a clean diff says so in one line.
CONTRACT VERDICTS (mandatory, machine-parsed). In overall_explanation, emit ONE
line per plan contract listed under "Plan contracts" below, exactly in this form:

VERDICT <contract-id>: implemented|partial|missing — <file:line evidence>

Every listed contract must get a line. Do not rename contract ids.

For each contract, emit a verdict — implemented | partial | missing — with file:line evidence, recorded as contract_verdicts in the quality artifact. Then review the diff normally; the contract check does not replace the quality/performance/security lenses.

## Task frontend-shell-login

### Plan contracts

- **t8-c1**
  - Source: docs/specs/app-platform-base.md
  - Statement: the app shell (top bar + left nav) renders in KnackLabs green, branded 3F, faithful to the bound design export docs/design/3F-Financial-MIS/3F Financial MIS.dc.html - Deep Forest (#0C3529) left nav (200px expanded / 62px collapsed, 3F header, user block) + white 56px top bar + Off-White (#F4F7F6) canvas, built ONLY from the _ds --kl-* tokens (no raw hex in components); on mobile (390x844) the left nav collapses to an off-canvas drawer behind a keyboard-focusable toggle that reports aria-expanded, closes on Escape, and returns focus to the toggle. Consumes the frontend-foundation scaffold (theme, next/font/local Inter, TanStack Query provider, shadcn primitives); the D-0012 --text-body/ink token collision is resolved as the theme is applied to real screens (Tailwind ink maps to --kl-ink)
- **t8-c2**
  - Source: docs/specs/app-platform-base.md
  - Statement: email+OTP login works end-to-end under the spec's local runtime contract: a successful verification lands in the shell, logout returns to /login, and an access-token 401 retries once through POST /api/auth/refresh before falling back to /login. The client (frontend/src/lib/api.ts) uses credentials:'include' against the auth allow-list (GET /api/auth/csrf bootstrap, POST otp/request, POST otp/verify, GET me, POST refresh, POST logout) and sends x-csrf-token re-read from the current 3f_csrf cookie immediately before EVERY mutating request (never cached); server state is TanStack Query (me as a query the route guard reads, otp/logout as mutations that prime/invalidate it)
- **t8-c3**
  - Source: docs/specs/app-platform-base.md
  - Statement: the login screen implements the spec's normative Login screen contract (docs/specs/app-platform-base.md §Login screen contract): a split screen from _ds tokens (left Deep Forest #0C3529 brand panel with the '3F Financial MIS' wordmark + one value line, Mint #6AF1B0 as a thin on-dark accent only; right a white card on the Off-White canvas; brand panel stacks above the card at 390x844), the two-step flow (email type=email autocomplete=email + Emerald #1C6B49 'Send code' 44px at radius-md; then a 6-digit field inputmode=numeric autocomplete=one-time-code client-validated /^\d{6}$/ with Emerald 'Verify', a 'Use a different email' back link and 'Resend code'), the load-bearing uniform copy ('If that email has access, a code is on its way.' / 'That code didn't match - check it or resend.'), and the accessibility (real <label>s, aria-live=polite acks/errors, focus to the code field after Send and to the first error on failure, :active feedback, ease-out <=200ms entry transitions, prefers-reduced-motion respected), verified by the user-facing functional check at 1440x900 and 390x844
- **t8-c4**
  - Source: docs/specs/app-platform-base.md
  - Statement: exactly five nav labels (Dashboard, MIS Reports, Ask, Explore / Saved, Admin) render with only Dashboard active (a real route); the other four, the top-bar global search and the data-freshness pill render visibly unavailable (aria-disabled / non-navigable, no dead routes, no 'coming soon' copy, the freshness pill reads as explicitly unavailable) and make NO feature API calls - these are the spec's intentional, enumerated divergences from the active design export, not fidelity failures

### Reviewer focus

USER-FACING - design fidelity is acceptance-critical (the human reiterated: follow the imported Claude Design and its colour scheme). SHELL is faithful to the bound export docs/design/3F-Financial-MIS/'3F Financial MIS.dc.html' (the interactive one, not the v1 artboards): Deep Forest #0C3529 left nav (200/62px, 3F header, user block), white 56px top bar (title, search, freshness pill, avatar), Off-White #F4F7F6 canvas - built ONLY from the _ds --kl-* tokens (Deep Forest, Emerald #1C6B49, Mint #6AF1B0 on-dark only, Off-White), NO raw hex in components. The disabled nav (4 of 5), disabled search and unavailable freshness pill are the spec's INTENTIONAL enumerated divergences, not fidelity failures. LOGIN is net-new per the spec's normative Login screen contract (split screen, two-step email/OTP, exact copy, input semantics, focus order, aria-live, :active, ease-out <=200ms, prefers-reduced-motion) - the export has no login state, so the contract governs. NO-ENUMERATION is load-bearing: the uniform ack copy must not leak account existence. AUTH: api.ts credentials:'include', x-csrf-token re-read from the CURRENT 3f_csrf cookie before EVERY mutating POST (never cached; the guard rotates it), the six-route allow-list, AuthUser from @3f/contract (no duplicated shape); a 401 retries ONCE through refresh then falls back to /login; server state via TanStack Query (me query + otp/logout mutations). A11y + MOBILE: 390x844 off-canvas drawer (aria-expanded, Escape, focus return); real labels; keyboard reachable. TOKENS: resolve the D-0012 --text-body/ink collision (map Tailwind ink to --kl-ink) as the theme is applied. CONSUMES frontend-foundation (theme, next/font/local Inter, Query provider, shadcn button) - does NOT recreate the workspace; lucide-react (deferred from T7) is seeded here for nav icons (host-installed - Codex sandbox has no network). HERMETIC TESTS are DB-free RTL/jsdom (mocked fetch/cookie) with negative controls (0009); the live login E2E + audit row + no-enumeration are DEMONSTRATED evidence (real auth needs a Postgres pool) and the functional check screenshots at 1440x900 + 390x844 verify shell + login fidelity. DESIGN SKILLS (emil-design-eng + frontend-design) are MANDATORY for this user_facing task. Canon: 0006/0007 (fresh Next), 0010 (@3f/contract), 0011/D-0003 (deployment readiness deferred - local mock-OTP PoC), 0009 (tests). GRILL AMENDMENTS (all repo-answerable, resolved here): (1) ROUTER TOPOLOGY is the foundation's frontend/app/ (App Router) - the shell lives in an app/(app)/ route group and login in app/login/, and the foundation's placeholder frontend/app/page.tsx is REPLACED (/ redirects to the shell when authed, else /login) - NOT frontend/src/app. (2) LOOPBACK per the spec runtime contract: api.ts defaults the API base to http://127.0.0.1:4000 (NOT localhost; NEXT_PUBLIC_API_BASE_URL overrides), and the manual verification uses 127.0.0.1 throughout and brings up warehouse-seed + the WAREHOUSE_PG_* config. (3) REFRESH-ONCE: on an access-token 401 api.ts performs exactly ONE CSRF-protected POST /api/auth/refresh then RETRIES the original request; only if that retry also fails does it clear auth and route to /login - and otp/verify's intentional 401 (invalid/expired code) is EXCLUDED from refresh (no refresh loop, no stale-session misread). POST /api/auth/refresh is in the endpoint list. (4) D-0012 is fixed in BOTH places: Tailwind ink -> var(--kl-ink) AND globals.css's `color: var(--text-body)` -> the ink token (--text-body is a 17px size in typography.css, invalid as a colour). (5) SECONDARY CONTROLS: 'Resend code' re-calls POST otp/request for the same email and re-announces the uniform ack (focus stays on the code field); 'Use a different email' returns to step 1 and refocuses the email field. (6) lucide-react is the shadcn/ui-standard, tree-shakeable, MIT icon set - the best-fit nav icon source (constitution §9 justified, not a silent default). (7) EXACT proof: `npm exec --no -- vitest` (never bare `npm exec --`/npx) and the plan's test names EQUAL the required_tests leaf ids (decision 0009, no false green). The seven required_tests falsify the load-bearing behaviours; the live login E2E + audit row + no-enumeration stay demonstrated Postgres evidence and the functional check (1440x900 + 390x844) verifies shell + login fidelity.
