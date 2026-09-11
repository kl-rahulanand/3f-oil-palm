# Task plan — statement-export-control: the Download Excel control

Story: mis-statement · Task 5 of 5 (FINAL) · **user_facing: true**

## Objective
Give the statement a **Download Excel** control. The route and the workbook already ship
(`statement-export-api`, PR #35); this task is the button, the binary fetch that carries
it, and the one clear thing that happens when it fails.

Shipping it completes the **mis-statement** story.

## Acceptance criteria (plan_contracts)
- **t-sec-c1** — the control sits in the **statement's own header**, not the filter bar,
  in the prototype's **secondary** treatment, present only with a resolved statement; the
  request is built from the **resolved response's scope**, never the mutable selectors, so
  the file always matches the statement on screen.
- **t-sec-c2** — a **binary** client path keeping cookie credentials, CSRF bootstrap and
  the one-shot 401 refresh, proven as **401 → exactly one refresh → exactly one retry**.
- **t-sec-c3** — **only** the exact xlsx media type (parameters allowed) may be saved; a
  200 carrying `application/json` shows the **notice** and saves nothing; any other
  content type takes the **error** path.
- **t-sec-c4** — the filename comes from the server's `Content-Disposition` (CORS-exposed),
  with a single fixed fallback **`financial-mis-statement.xlsx`**; the object URL is
  **revoked**, asserted rather than intended.
- **t-sec-c5** — a failure is **one clear state**, never a silent no-op, nothing left
  pending.

## Mandatory for a user-facing task
`harness.yaml` — the recorder **refuses** a user-facing testing artifact unless
`skills_used` attests both `emil-design-eng` and `frontend-design`; both are inlined into
the composed brief. A **functional check** is also required — and for a download, that
means **actually downloading a file and opening it**, not watching a button change colour.

## What already exists (grounding, file:line)
- **The route, shipped** — `backend/src/mis/mis-statement.controller.ts:73-124`:
  `POST api/mis/statement/export` sets `Content-Type` to the xlsx MIME type and
  `Content-Disposition: attachment; filename="…"`, and returns **200 `application/json`**
  for an unresolvable selection with **no file headers**.
- **CORS already exposes the filename** — `backend/src/main.ts:32`
  `exposedHeaders: ["Content-Disposition"]`. That entry exists *because* this task needs
  it; deriving the filename client-side instead would make it pointless and let the two
  drift.
- **The client cannot currently carry bytes** — `frontend/src/lib/api.ts:30` `post<T>`
  ends in `response.json()`. Its CSRF bootstrap, cookie credentials and **one-shot 401
  refresh** (`:43-44`) are the parts worth keeping; the JSON parse is the part that cannot
  be reused. Hence a binary sibling, not a reuse.
- **The view** — `frontend/src/features/mis/statement-view.tsx` renders the statement
  inline and already distinguishes resolved from unresolvable. This view is also where a
  failure once rendered **alongside** the empty state; `constitution/07-exception-handling.md`'s
  one-clear-state rule is load-bearing here.
- **The prototype's control** — `docs/design/…dc.html:117`: *Download Excel* as a
  **secondary** button beside the primary Generate — white ground, emerald border and
  text, 34px, 6px radius.

## Design
### The control belongs to the statement, not the selectors
**Human-decided this grill.** The prototype puts Download beside Generate, but the filter
selectors are **mutable**: generate July, change Plant, press Download, and you get a file
that silently disagrees with the statement in front of you — on a document people forward.
So the control lives in the **statement's header** and the request is built from the
**resolved response's scope**. A button in the filter bar would also *read* as "download
what I've selected" when it means "download what's shown".

### A binary sibling, not a reuse
`post<T>` parses JSON and cannot carry a workbook. The new helper does everything `post`
does **except** the parse: CSRF bootstrap, `credentials: "include"`, and the one-shot 401
refresh — dropping that last one would silently break the download for anyone whose access
token has just expired, which is the most ordinary case there is.

### Three outcomes, classified by media type
"Inspect what came back" is not a rule, so here is the rule: **only the exact xlsx media
type (parameters allowed) enters the save path.**
- **xlsx** → save under the server's filename;
- **200 + `application/json`** (unresolvable) → **not a file**: show the **notice**, save
  nothing;
- **anything else**, including an unexpected 200 → the **error** path.

Anything looser puts a corrupt `.xlsx` on someone's disk.

### The filename comes from the server
`Content-Disposition` is readable only because the route exposes it through CORS. The
control parses the header and falls back to a **single fixed name**,
`financial-mis-statement.xlsx`, only when it is absent — deriving the scope-and-range slug
client-side would duplicate a grammar the server owns and let the two drift.

### Housekeeping
An object URL created for a download is **revoked** after use; a page people click
repeatedly should not leak one per click.

## Workflow
```mermaid
flowchart TD
  S["resolved statement on screen"] --> B["Download Excel · in the STATEMENT header"]
  B --> Q["request built from the RESOLVED scope, not the selectors"]
  Q --> F["binary fetch: CSRF bootstrap · cookie credentials · one-shot 401 refresh"]
  F --> R{media type}
  R -->|exact xlsx type| N["filename from Content-Disposition (CORS-exposed)"]
  N --> SV["save · revoke the object URL"]
  R -->|200 + application/json| NF["NOT a file — show the notice, save nothing"]
  R -->|anything else| E["one clear failure state · nothing left pending"]
```

## Manual Verification
1. `npm run typecheck && npm run lint && npm run format:check && npm run test:frontend &&
   npm run build:frontend` — the **five** required leaves pass. Check each leaf's **executed
   count**: vitest exits 0 when `-t` matches nothing (D-0031).
2. **Functional check (mandatory, user_facing)** — a download is only proven by a file:
   sign in, generate Agriculture / Nursery / DUB / Jul 2026, press **Download Excel**,
   then **open the saved file** and confirm it is the real workbook — worksheet
   `Financial MIS`, the hierarchy, and the grand total **₹1,00,50,136** Budget against
   **₹1,15,12,712** Actual — and that the saved filename is the server's, not a
   browser-generated one.
3. Force a failure (stop the backend) and confirm **one** clear state, nothing pending,
   and no file written.

## Decisions attested
**0019** (the route's house style), **0016** (the grant the download inherits), **0018**,
**0020/0021/0022** (the numbers behind the sheet), **0023**, **0007** (Next.js),
**0010** (3F branding), **0031** (a required leaf must really execute), **0002/0003**,
**0012/0015**.

## Surface impact
- **Frontend**: the Download Excel control and its failure state on `statement-view.tsx`,
  the binary export helper on `src/lib/api.ts`, the hook, `app/globals.css`.
- **Unchanged by design**: every backend file (the route and workbook ship in PR #35),
  `contract/src/api.ts`, the theme tokens, the statement's own rendering.

## Out of scope
A transactions sheet (drill-down), the roll-over calculation, any backend change.

## Task Decomposition
Task 5 (FINAL) of the mis-statement story: (1) statement-model [#30], (2) statement-api
[#32], (3) statement-view [#34], (4) statement-export-api [#35],
(5) **statement-export-control** [this task]. Frontend-only by construction — `WORKFLOW.md`
forbids a task spanning backend and frontend, which is why the export was split in two.
Proven by four vitest leaves plus a functional check that opens a really-downloaded file.
Shipping it completes the story.

<!-- forge:contract -->
## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Give the statement a Download Excel control in the prototype's secondary-button treatment, which surfaces a failure legibly and never leaves the page pending. Frontend only.

**Acceptance criteria**

- The Download Excel control sits in the STATEMENT's own header - not in the filter bar - in the prototype's secondary treatment (white ground, emerald border and text, sharing the Generate button's height and radius), and is present only when a resolved statement is on screen. The export request is built from the RESOLVED response's scope, never from the mutable filter selectors, so the file always matches the statement being looked at even if someone changes a dropdown after generating.
- Pressing it fetches the workbook through a BINARY client path that keeps the cookie credentials, the CSRF bootstrap and the one-shot 401 refresh - proven as: an initial export returning 401 triggers EXACTLY ONE refresh and EXACTLY ONE retried export - since the existing post<T> helper ends in response.json() and cannot carry bytes.
- Only the exact xlsx media type, allowing parameters, may enter the save path. A 200 carrying application/json - the unresolvable outcome - is NOT saved and the notice is shown instead; any other unexpected content type takes the clear-error path rather than being written to disk, so a corrupt file can never reach the user.
- The saved filename comes from the server's Content-Disposition header, which main.ts exposes through CORS, with a single fixed fallback of financial-mis-statement.xlsx used only when the header is absent; the object URL created for the download is revoked afterwards, asserted rather than merely intended.
- A failure surfaces as ONE clear state - never a silent no-op, which is worse than an error because the person believes they have the file - and leaves neither the control nor the statement stuck pending.

**Write scope** (what `stage done` measures the diff against)

- frontend/src/features/mis/statement-view.tsx
- frontend/src/features/mis/statement-view.test.tsx
- frontend/src/features/mis/use-mis-statement.ts
- frontend/src/lib/api.ts
- frontend/src/lib/api.test.ts
- frontend/app/globals.css

**Required tests** (run by `stage done`)

- `the download control appears in the statement header only with a resolved statement and builds its request from the resolved scope rather than the filter selectors` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)
- `an export returning unauthorized triggers exactly one refresh and exactly one retried export carrying the csrf header and cookie credentials` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/lib/api.test.ts)
- `only the xlsx media type is saved while a json unresolvable response shows the notice without saving and any other content type takes the error path` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)
- `the saved filename comes from the content disposition header with a single fixed fallback when it is absent and the object url is revoked afterwards` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/lib/api.test.ts)
- `a failed download surfaces one clear error state and leaves neither the control nor the statement pending` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)

**Verify commands**

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:frontend`
- `npm run build:frontend`

**Review budget.** 6 files / 900 lines -- One control and its failure state on an existing view, plus a binary fetch helper the JSON-only post<T> cannot provide, with media-type classification, filename handling and object-URL cleanup. Small by construction: the route and the workbook shipped in statement-export-api.
<!-- /forge:contract -->
