# Cold-read grill — gate: requirements — requirements for platform-base (docs/specs/app-platform-base.md)

You did NOT write what follows. Read it cold, as an adversary trying to break the handover, never as its author defending it. You are READ-ONLY: return findings, change nothing.

## Interrogation technique

Run the interrogation this way. The harness contract above is the floor; this is the technique.

---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.


## Harness grill contract

# Griller Prompt — adversarial handover interrogation

You run BEFORE a handover gate, interrogating the humans in rounds until the
handover has no gaps or contradictions that would surface downstream as
rework. You are not reviewing code — you are stress-testing
what one role is about to hand the next. The gate scripts REFUSE without
your fresh, passing record.

**Independence is the whole point.** A grill has value only when the party
running it did NOT author the artifact under interrogation — a self-grill
inherits the author's blind spots and rubber-stamps the very gap it was meant to
catch (a plan that promised an API surface can pass its own grill precisely
because its author never scoped that surface). So if the coordinating session
authored the plan, the JIT task contract, or the decomposition, it MUST run that
grill in a SEPARATE agent that did not author the artifact — a read-only Codex
pass reading the plan/contract cold, released with
`./forge grill run --gate <gate>` (ledgered, so a killed launcher is still
visible to `forge codex status`; it pins gpt-5.6-terra @ xhigh from
harness.yaml) — rather than certify its own work inline. Codex on `gpt-5.6-terra` @ xhigh
is the required cold reader for planning grills: a fresh model context fully
independent of the authoring session, and because it is read-only it never
writes, so the write-lock that gates the write companion does not apply. Do NOT
use a Claude sub-agent for the grill, and never grill your own work inline.
Interrogate as an adversary trying to break the handover, never as its author
defending it.

RELEASE IT THROUGH THE HARNESS. `./forge grill run --gate <gate>` composes the cold-read brief (this contract plus the artifact) and releases Codex through the SAME ledgered launcher a delegation uses: the pid is recorded before the wait, so a grill whose launcher is killed still shows up in `forge codex status` instead of vanishing. It is read-only, so it takes no delegation lock and can never satisfy `stage done`. Recording the gate stays yours — the cold read only returns findings.

The read-only Codex cold-reader LOADS and RUNS the `grill-me` skill (Matt
Pocock's, installed into `~/.codex/skills/grill-me` by `./forge doctor --fix`)
to structure its interrogation; this contract is the harness-side floor, the
skill is the technique. In Claude, the `/grill-me` skill satisfies the same.

WHICH RUNTIME CAN RECORD WHICH GATE — get this wrong and you will chase a
refusal you cannot satisfy. ALL SIX gates match the AskUserQuestion ledger and
are therefore CLAUDE-ONLY, each with a floor of ONE logged round: `--gate spec`,
`--gate signoff`, `--gate epics`, `--gate requirements`, `--gate plan` and
`--gate task` — the floors live in `grill_gates.GATES`, one row per gate.
`signoff` and `epics` used to sit outside that check and so recorded with ZERO
rounds behind them; they now answer to it like every other gate.

ONE round is a FLOOR, never a target. Keep going until a round comes back clean
AND the next one stays clean — a single quiet round after a noisy one is a
coincidence, not convergence. The ledger files are written ONLY by `post_tool_use.py` on a
Claude Code AskUserQuestion event; `.codex/hooks.json` registers no PostToolUse
hook, so Codex cannot produce them and neither can a subagent. Delegating a
ledger-matched grill to Codex returns a well-formed payload that the recorder
then refuses, with nothing you can do to satisfy it — the payload was never the
problem, the runtime was.

For those four ledger-matched gates, independence is a COLD READ,
not necessarily a separate process. The recorder accepts ONLY rounds that match a
logged AskUserQuestion record (`record_grill_from_json.py`), and only the
top-level Claude session produces those log entries — a subagent or
read-only Codex pass cannot. So for those grills the top-level session drives
the rounds through AskUserQuestion itself — but because the coordinating session
authored the plan, the independent cold-read pass is MANDATORY, not optional: on
EVERY round release a fresh READ-ONLY Codex pass with
`./forge grill run --gate <gate> [--task <id>]` that reads the plan/contract
cold and returns findings — never a
Claude sub-agent, never grill your own work inline — then carry ONLY those
findings into your own AskUserQuestion rounds (the recorder rejects rounds not in
the ledger, so the top-level session must still ask). Loop Codex grill → your
AskUserQuestion rounds → answers → Codex grill again, until a round is clean AND
the plan is stable; only then, approve exactly once. Read cold, as an adversary
who did not write it. (EVERY gate is ledger-matched — signoff and epics no
longer excepted — so no gate can be recorded by a read-only Codex grill alone:
the top-level session asks the round and records it.)

FRESH CONTEXT, NOT FRESH READING. Every round is a NEW read-only Codex session —
that independence is the whole point, and it is why the reader has no memory of
what it already blessed. It does NOT mean re-deriving the plan from scratch every
round: after the FIRST round, hand the fresh reader the plan AND what changed
since the last round (the resolutions you just folded in, and which sections they
touched), and tell it to concentrate there while still refusing anything it can
see is wrong elsewhere. Same cold judgement, a fraction of the tokens.

END EVERY ROUND WITH AN EXPLICIT CONVERGENCE VERDICT, on its own line, so the
coordinator never has to guess whether to grill again or approve:

- `CONVERGED — no gaps, no contradictions, plan unchanged since the last round`
- `NOT CONVERGED — <the specific reason: open gaps, a contradiction, or the plan
  changed after the last clean round>`

Converged means BOTH: this round is clean AND the plan did not change after the
round that made it clean. A clean round on a plan you have just edited is not
convergence — it is an unreviewed edit. Only `CONVERGED` authorises asking the
human for approval, and approval happens exactly once.

Five gates, five scopes:

- `--gate spec` (prototype → confirmed capability) — interrogate the exact
  `docs/specs/<slug>.md` file against BRIEF, architecture, decisions, and the
  prototype. Hunt: behavior the prototype proved but the spec omitted,
  implementation choices masquerading as requirements, vague acceptance
  language, and conflicts with active decisions.
- `--gate signoff` (client → PM, before `record_signoff.py`) — interrogate
  `docs/product/DISCOVERY.md`, `BRIEF.md`, confirmed specs, the spec-linked
  roadmap, `docs/decisions/`, and prototype notes. Hunt: unanswered
  stakeholder/constraint questions, scope
  the client saw vs. scope the BRIEF claims, decisions that contradict the
  BRIEF, acceptance criteria that are vibes instead of checks, non-functional
  requirements nobody asked about (auth, data retention, environments).
- `--gate epics` (PM → EM, before `forge roadmap import`) — interrogate the
  proposed epics + stories against BRIEF and decisions. Hunt: BRIEF
  capabilities with no epic (coverage), stories whose acceptance criteria
  contradict a decision record, dependency order that can't work
  (`dependencies` edges), stories too big for one implementation session,
  missing `skill` tags that will stall distribution.
- `--gate plan` (dev, before `forge plan save` — once per story plan) —
  interrogate the draft plan against the roadmap item's `acceptance_criteria`, the
  active decision corpus (`forge decision list --active`), and
  `docs/architecture/`. Hunt: acceptance criteria the plan never addresses,
  scope creep beyond the story, a SIMPLER SHAPE the plan ignores — fewer
  states, fewer components, one less moving part, an existing utility
  instead of a new abstraction; ask "which acceptance criterion does this
  task serve?" and flag every task with no answer (conduct §2 applies to
  plans: over-building fails the grill BEFORE code exists), compatibility
  work with no named consumer — shims, deprecation paths, migration flows
  the BRIEF and decisions justify for NOBODY (conduct §5: a breaking
  replacement deletes the old path unless live users are named), choices missing
  from the plan's Decisions section — INCLUDING any technology, framework,
  package-manager, test-runner, library, data-access, or build-tool pick that
  appears in the plan or tasks as an ecosystem default with no stated best-fit
  justification and no raised open question (conduct §9: silent tooling defaults
  are prohibited — a pick whose fit is unclear must be asked of the human, not
  defaulted; fail the plan on any tooling choice reached for on autopilot).
  Also flag a MISSING quality-gate baseline: any codebase the plan touches must
  wire a stack-APPROPRIATE static-analysis gate — a linter AND formatter, plus a
  type-checker where the language has one — into CI/verify, not merely a test
  runner. Name the CAPABILITY, never a fixed tool: ESLint/Biome for JS-TS,
  Ruff/flake8 for Python, golangci-lint for Go, Clippy for Rust, Checkstyle/
  Spotbugs for Java, and so on — the requirement is generic to every backend, not
  one ecosystem's tool. Fail the plan when code ships with no configured lint/
  format/static-analysis gate that an automated check enforces on every push; an
  absent linter is a silent quality default exactly like an unjustified tool pick.
  Also hold the plan against the CONSTITUTION's coding standards
  (`constitution/README.md` index — read the references it maps to the plan's
  surfaces). The constitution is law, so a plan whose SHAPE omits or contradicts a
  mandated standard is a GAP, not a style preference: HTTP surfaces with no typed
  request AND response DTOs (`pnp-api-standards`, `pnp-swagger-api-documentation-
  standards`), a module ignoring the modular-monolith layout or file-suffix
  standards (`pnp-coding-standards-modular-monolith`, `03`), missing structured
  logging (`05`/`06`) or domain exception handling (`07`), an external integration
  that skips the provider/port pattern (`08`, `pnp-provider-pattern-for-
  integration`), or database work ignoring `pnp-database-standards`. Flag each and
  require the plan to conform or record a deliberate, written deviation — never
  wave it through as "the implementer will follow standards later"; a plan must not
  design AGAINST the law. (`constitution/` is on disk in every environment, so the
  read-only Codex cold-read has the law available — hold the plan to it.)
  Reconcile the plan explicitly against
  EVERY ID from `forge decision list --active`; a conflict becomes a
  contradiction signal or a superseding decision, never a silent exception.
  Also hunt unbounded tasks and a Verify Plan that can't actually falsify the
  work, a `## Surface Impact` row left implicit (every Deferred /
  Unchanged-by-design entry needs a reason), and — CRITICALLY — every row
  classified `Changed` that NO task owns: cross-check each Changed surface
  (runtime behaviour, API, data/schema, CLI/ops, UI, docs, tests) against the
  Task Decomposition and FAIL the plan on any promised surface with no task
  whose contract actually PRODUCES it. A Surface Impact that promises "API
  endpoints" or "a UI" with no owning task is exactly how a half-feature ships —
  domain services no caller can reach, or a frontend wired to a backend that was
  never built. Also flag any RECURRING finding
  class (`./forge findings patterns`) in this story's area the plan neither
  consolidates nor tripwires. In Claude Code the
  `/grill-me` skill run against the plan satisfies this contract. The payload
  carries `"issue"`; the recorder stamps it against the active task.
- `--gate task` (orchestrator → implementer) — the workflow contract places
  this grill before `forge stage start`; the subsequent write `forge delegate`
  is the hard refusal point. Interrogate the next leaf task's just-authored
  contract in the re-recorded decomposition against the approved story plan,
  active decisions, and the actual repository state left by completed prior
  stages. Hunt: assumed files or APIs that prior work did not produce, stale
  or over-broad `write_scope`, acceptance criteria not served by the proposed
  work, a task that OWNS a plan `## Surface Impact` surface but whose
  `write_scope`/`required_tests` do not actually PRODUCE it (owns the API row but
  builds only domain services with no HTTP controllers/DTOs/routes; owns the UI
  row but ships no components) — reachability is part of "done", not a later
  task's problem, required tests that do not prove those criteria, verify commands that
  cannot falsify the change, reviewer focus that misses the risky seam OR that
  re-states shape rules the constitution already sets instead of CITING the
  load-bearing `constitution/` references for the task (the contract points at the
  law, never re-derives or contradicts it), and a
  `user_facing` flag that misclassifies the task — a UI task left `false` (its
  mandatory design skills and design review would be skipped) or a backend task
  marked `true` (forced to attest UI design skills it has no use for).
  This is the JIT task-planning gate from decision 0032, not a repeat of the
  story-level plan grill. Record it for the exact task id and contract digest;
  the digest covers `write_scope`, `required_tests`, `verify_commands`, and
  `acceptance_criteria`. A changed field makes the old task grill stale, and a
  write delegation refuses it; read-only delegation is unaffected.

Method:

1. Read the artifacts in scope FIRST; derive your question list from actual
   text, citing it (`BRIEF.md says X; decision 0003 says Y — which wins?`).
2. Interrogate in ROUNDS until the frontier is empty — not one pass. Each
   round, put the questions whose prerequisites are already settled to the
   human (PM or EM) with your recommended answer; their answers reshape the
   tree and unblock the next round's questions. Stop a single question when it
   would only confirm what a document already states; stop the grill only when
   no gap or contradiction remains unasked. In Claude Code, deliver each
   round's frontier through the AskUserQuestion tool (recommended answer
   first), not prose. For every ledger-matched gate (`spec`, `requirements`,
   `plan`, `task`) the recorder requires
   the FINAL round in the payload to carry `"frontier_empty": true` — that flag
   is how it confirms you stopped because the frontier closed, not because you
   ran out of patience; it is set by hand on the last `rounds` entry, never by
   the ledger. A zero-gap contract still needs at least one such round (every
   gate's floor is 1, and a floor is not a target), so ask a genuine closing
   question
   (e.g. "any remaining gap before we hand off?") and mark it `frontier_empty`.
3. Every finding lands somewhere real before the verdict: a doc edit, a
   `./forge decision new <slug>` record, or an explicit non-blocking entry
   in `open_items`. An `open_items` entry that PARKS scope also gets a
   deferral row with a revisit trigger (`./forge defer add`) — parked scope
   without a trigger is scope silently dropped. Unresolved blocking
   findings ⇒ verdict `blocked`.
4. Record the outcome (schema: `factory/schemas/grill.json`,
   `"generated_by": "griller"`):

   A task-grill input uses this recorded shape (the recorder adds its own
   task id, digests, commit, and timestamps):

```json
{
  "generated_by": "griller",
  "verdict": "pass",
  "gaps": [],
  "contradictions": [],
  "resolutions": ["What was sanctioned"],
  "inspected_refs": ["path/or/path:symbol"],
  "current_flow": "What the repository does now",
  "criteria_map": {"criterion": "proof"},
  "decision": "keep",
  "new_abstractions": ["None"],
  "rounds": [{"question": "Finding or choice", "options": ["Recommended", "Alternative"], "chosen": "Recommended", "frontier_empty": true}],
  "citations": [{"finding": "Repo-answerable finding", "source": "path:symbol"}],
  "open_items": []
}
```

   Each `rounds` entry has a non-empty `question`, two to four non-empty
   string `options`, and a `chosen` value equal to one option. Each citation
   is `{finding, source}`. Every string in `gaps` must be covered by an equal
   `rounds[].question` or `citations[].finding`.

   For every gate — all six are ledger-matched — extra recorder rules bind
   (this is what makes an otherwise well-formed payload fail):
   - Rounds must match the AskUserQuestion ledger and meet the gate floor
     (1 for every gate, and a floor is not a target); the final round carries
     `"frontier_empty": true`. A
     zero-gap grill still records its floor of real rounds — never zero.
   - `--gate task` only: `criteria_map` is a THREE-WAY equality — its KEYS must
     equal the frontier task's `acceptance_criteria` set AND the set of its
     `plan_contracts[].statement` values, exactly (no extra key, none missing);
     each value is the non-empty proof for that criterion. Author the task's
     `acceptance_criteria` and its `plan_contracts` statements as the SAME
     strings so there is one coherent key set to satisfy.

```bash
python3 factory/scripts/record_grill_from_json.py --gate <spec|signoff|epics|requirements|plan|task> --input <json> [--input-digest <artifact>] [--task <id>]
```

5. For every gate except task, commit the resolution edits
   BEFORE recording the grill — those gates check freshness against BOTH
   committed history and the working tree: any guarded doc changing after the
   grill (even uncommitted) stales it. (The sign-off / epics-approved decision
   records themselves are expected afterwards and don't stale it.) The task
   gate instead binds directly to the re-recorded task contract digest; the JIT
   sequence does not require a commit between re-recording and grilling. But that
   digest still folds in the product tree, so record the task grill LAST — after
   any docs/ or factory/scripts commits: a tracked change outside .factory/ and
   plans/ that lands between grilling and `task approve`/`stage start` re-stales
   it and forces a re-grill.
6. `--input-digest` is REQUIRED for the spec, epics, and plan gates: pass the
   exact spec / roadmap input / plan draft you interrogated. The gate verifies the
   digest — grilling version A never approves an edited version B; if the
   artifact changes, re-grill it. For `--gate task`, pass `--task <id>` and NO
   `--task-digest` — that flag was removed and the recorder rejects it; the
   recorder derives the grounding digest itself from the protected contract,
   approved plan, and product tree, and stores the result at
   `.factory/grills/tasks/<id>.json`.

A `pass` with unresolved findings is refused by the recorder. Grill hard;
downstream implementation inherits whatever you let through.



## The artifact under interrogation (requirements for platform-base (docs/specs/app-platform-base.md))

---
slug: app-platform-base
title: App platform base
status: confirmed
saved: 2026-09-01T10:31:50+00:00
---

# App platform base

## Why
We're building 3F by adapting Pulse (decisions 0003, 0004). Before any capability
can land, the Pulse app must live in this repo, run on our stack, and wear the
3F identity. This is the foundation every other story depends on.

## Users
The development team (foundation); indirectly every end user, via the running app.

## Behaviour
- **Vendor** Pulse's **backend + contract** (with build config) into this repo as a
  **snapshot copy we own** — no upstream link; adapt freely. The frontend is **built
  fresh**, not vendored (decision 0006); `backend/VENDORED_FROM` records `excluded: frontend/`.
- Set up an **npm workspace** (`backend`, `contract`, and a fresh `frontend`) and keep
  the vendored **email+OTP passwordless auth + RBAC + session + audit** stack as-is.
- Build a **fresh Next.js frontend** (decision 0007) from the approved Claude Design —
  scope is the **app shell + OTP login + placeholder Dashboard only**; MIS, drill-down,
  assistant, and search are later stories and render unavailable/disabled.
- Stand up a **Postgres** warehouse adapter (the Postgres-vs-BigQuery production
  engine decision stays open); flip the SQL validator dialect to `postgresql`.
- **Rebrand** every Pulse product identifier to **3F** (decision 0010; provenance
  history preserved) and reskin to the KnackLabs green design system.
- Keep the API surface **honest**: only **auth, CSRF and an explicit health endpoint**
  are registered. The vendored capability routes (chat, reports, saved queries, pins,
  measures, conversations, admin) stay **absent / 404** until their owning stories bring
  them back with their tables — leaving them mounted would ship endpoints that fail at
  runtime, since the trimmed migration removed what they read.
- The app builds, boots, authenticates (mock OTP for the PoC), and serves the shell.
- **PoC profile:** runs locally, single-tenant, **mock OTP**; production
  deployment-readiness (real SES email, provisioning, secrets, CORS allowlist, audit
  retention/encryption, residency, `/deployment/<env>`) is **deferred** (decision 0011).

## Local runtime contract (the PoC profile, defined)
"Builds and boots" means this exact profile — anything vaguer is not reproducible:
- **Node 20+**; app-DB and warehouse Postgres both up **and the fixture seeded**:
  `docker compose up -d app-db warehouse-db warehouse-seed`, waiting for
  `warehouse-seed` to complete — it is a separate service, and without it the warehouse
  E2E has no fixture to return. App-DB migrations run.
- **Warehouse connection** (all `WAREHOUSE_PG_*` default to empty, so the adapter returns
  nothing until these are set): `WAREHOUSE_DRIVER=postgres`, `WAREHOUSE_PG_HOST=127.0.0.1`,
  `WAREHOUSE_PG_PORT=5433`, `WAREHOUSE_PG_USER=warehouse`,
  `WAREHOUSE_PG_PASSWORD=warehouse-local`, `WAREHOUSE_PG_DATABASE=warehouse`. The expected
  E2E result is `SUM(WarehouseFixture.value) = 42`.
- **How the warehouse E2E runs without a forbidden route:** the allow-list has no query
  endpoint, and it must not gain one. The `validate → explain → execute` proof therefore
  runs through an **in-process integration harness** that exposes **no runtime HTTP
  route**. Crucially it must **resolve `WAREHOUSE` and `SelectionExecutor` from the
  application module's own DI container** — the current test hand-constructs
  `new SelectionExecutor(new SqlBuilder(), new SqlValidator(), new PostgresAdapter())`,
  which passes even if the runtime provider would resolve a different adapter entirely.
  That is an assembly look-alike, not the app path. Testing the adapter alone would skip
  validation and likewise fails the criterion.
- **Backend on `:4000`, frontend (Next.js) on `:3000`.**
- **The whole mock-OTP profile is loopback, and standardises on the literal `127.0.0.1`
  — not the name `localhost`.** Both dev servers bind `127.0.0.1` whenever
  `AUTH_OTP_MOCK=true`; both Postgres ports are published to `127.0.0.1` in
  docker-compose (they currently publish on every interface); and every URL in this
  profile — the API base, the CORS origin, the warehouse host — is written `127.0.0.1`.
  The name matters: `localhost` can resolve to IPv6 `::1` and then fail against an
  IPv4-only listener, which looks like a broken app rather than a resolution mismatch.
  The reason for loopback: Nest currently calls `app.listen(port)` with no host, binding
  every interface; with a publicly-known mock code (`000000`) and a deterministic
  development JWT secret, that puts an admin login on the local network. CORS does not
  prevent this — it is a browser policy, not a network control. Making the mock profile
  LAN-reachable requires its own explicitly scoped security decision; it is not
  sanctioned here.
- **Frontend transport:** the browser calls the backend **directly** at
  `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000` with `credentials: 'include'` — no Next
  proxy for this PoC. Every mutating POST is preceded by the CSRF sequence: `GET
  /api/auth/csrf` to bootstrap the `3f_csrf` cookie, then the **current** cookie value
  re-read and sent as `x-csrf-token` on each POST (the guard rotates it per request).
  Without this, a correctly-rendered login still 403s on both OTP calls.
- **The canonical startup sequence** lives with the frontend task plan's Manual
  Verification section and is the one a reviewer runs: compose up (including
  `warehouse-seed`) → `npm install` → `npm run build` → `npm run db:migrate` to completion
  → backend with the mock/origin/warehouse env above, readiness being the
  `3F backend listening on :4000` line → `npm run dev:frontend`, readiness being Next
  serving `:3000`. Equivalent-looking substitutes are not the contract.
- **`FRONTEND_ORIGIN=http://127.0.0.1:3000` must be set**, and the app-DB variables with
  it: `PGHOST=127.0.0.1`, `PGPORT=5432`, `PGUSER`/`PGPASSWORD`/`PGDATABASE` per
  docker-compose. `PGHOST` also defaults to `localhost` today, so migrations inherit the
  same resolution trap. **`127.0.0.1` is authoritative everywhere in this profile** —
  browser URL, API base, CORS origin and its default, `PGHOST`, warehouse host, the
  Docker port bindings, and both dev-server hosts. A browser served at `127.0.0.1:3000`
  sends that Origin, and a backend configured for `localhost` rejects it. The vendored
  origin default is
  `http://localhost:5173` (Vite's port, inherited from Pulse), so a credentialed request
  from the Next dev server is rejected by CORS under the defaults. The base task that
  constrains the API surface also changes this default to `:3000`, since this repo's
  frontend is Next — but the variable stays the contract.
- **`AUTH_OTP_MOCK=true` and a non-production `NODE_ENV`.** Mock OTP is refused outright
  when `NODE_ENV=production`; the code `000000` alone does not reproduce a login.
- **A seeded, active, provisioned admin principal** (`SEED_USERS`-overridable). Only a
  provisioned user can complete verification: an unknown email receives the deliberately
  uniform acknowledgement (no account enumeration) but can never verify. "Single tenant"
  means no tenant selector and no tenant-isolation feature — it does **not** mean any
  email can sign in.

## Confirmed scope (grilled 2026-09-01; reconciled 2026-09-04 to decisions 0006/0008/0010/0011)
- **Vendor method:** snapshot-copy **backend + contract** into the repo (own it),
  cherry-pick upstream fixes manually; the **frontend is fresh** (decision 0006).
- **Warehouse (PoC):** Postgres; production engine decision remains open.
- **Auth:** keep the vendored email+OTP passwordless auth/RBAC/session as-is; **mock
  OTP** for the PoC (real SES delivery deferred, decision 0011). "As-is" is not
  self-proving — see the observable auth guarantees in the acceptance criteria.
- **API boundary — the sanctioned PoC allow-list**, complete and comparable by test:
  `GET /api/auth/csrf`, `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`,
  `GET /api/auth/me`, `POST /api/auth/logout`, **`POST /api/auth/refresh`**, and
  `GET /health`. Plus the Swagger documentation routes **as a non-production exception
  only**: the UI at `/api/docs` **and its generated document route** (`/api/docs-json`) —
  a UI route alone is not the whole surface, so a route-registration test naming only
  `/api/docs` would either fail against the real app or silently ignore framework-mounted
  routes. Swagger must be **unconditionally absent when `NODE_ENV=production`**: today
  `swaggerEnabled` still honours `ENABLE_SWAGGER=true` in production, which is a hole to
  close, not a toggle to document. Every other vendored route is unregistered until its
  owning story; the route-registration test compares the full method/path list, not a
  sample.
  **Refresh is in the list deliberately:** the vendored session stack pairs a 15-minute
  access cookie with a 7-day refresh cookie, so dropping `refresh` would silently turn
  "keep the session stack as-is" into "log in again every 15 minutes". Its CSRF flow is
  tested like the other mutating POSTs.
  The existing `/api/auth/*` paths stay **unversioned** for the PoC — a deliberate
  deviation from the constitution's versioning requirement, scoped to the vendored
  surface alongside decision 0012. `GET /health` is **fresh** code and would therefore owe
  full compliance, so it carries its own **narrow, explicit exception**: an infrastructure
  liveness probe sits outside the versioned API surface by convention. It returns a typed,
  Swagger-documented `200` carrying **the constitution's standard response envelope** with
  `status: "ok"` in its data — the Swagger standard says "Never return raw objects", so an
  unwrapped body would contradict the same compliance claim this exception is narrowing.
  Liveness only: no dependency health, which is a later concern.
- **Binding design:** the shell is bound to **one** named export —
  `docs/design/3F-Financial-MIS/3F Financial MIS.dc.html` (the interactive export, not
  the older v1 artboards). A generic green page does not satisfy this. That export shows
  an *active* MIS shell with live-looking search and freshness data; the disabled nav,
  disabled search and unavailable freshness pill required here are **intentional,
  enumerated divergences** from it, not fidelity failures. The export contains **no login
  state**, so the login screen is designed here from the `_ds` token system and its
  binding definition is the **Login screen contract** section below — normative here, at
  the requirements gate, rather than authored inside a task plan that can still change.
  The task plan implements that contract; it does not invent it. Shell fidelity is checked by
  the user-facing functional check at **1440×900 desktop** and **390×844 mobile** — not by
  "looks green". At the mobile viewport the left nav collapses to an off-canvas drawer
  behind a keyboard-focusable toggle that reports `aria-expanded`, closes on Escape, and
  returns focus to the toggle.
- **Deployment:** local, single-tenant, PoC-only; production readiness deferred (0011).
- **Vendored API compliance:** the snapshot does not meet two constitution requirements —
  a global exception handler (`07-exception-handling.md`) and structured JSON logging with
  a `correlationId` (`05-logging-and-observability.md` §2.1) — and its typed response DTO
  coverage is uneven. Accepted as a **time-bounded deviation** for the PoC (decision 0012,
  deferral D-0004). "Harness machinery intact" is **not** a claim of full constitution
  compliance. Swagger is already compliant and excluded from the deviation.

## Rules
- Harness-owned files (factory, constitution, forge, harness) stay 3oilpalm's — do
  not overwrite them with Pulse's harness.
- `harness.yaml` is updated so build/verify/test know the vendored app.

## Out of scope (now)
- BigQuery; multi-tenant hosting; any capability feature (statement, ingestion,
  joins, drill-down, assistant) — those are their own stories.
- **Production deployment readiness** (real SES email/non-mock auth, user provisioning/
  roles, secret & config ownership, production CORS allowlist, audit access/retention/
  encryption, data residency, `/deployment/<environment>` structure) — deferred to a
  post-PoC story (decision 0011).

## Login screen contract (normative)
The bound design export carries no login state, so the login screen is specified here.
It is acceptance-critical and user-facing; leaving it to a task plan would let an
acceptance-critical screen stay mutable after this gate.

**Layout.** A split screen built only from `_ds` tokens. Left: a Deep Forest (`#0C3529`)
brand panel carrying the "3F Financial MIS" wordmark and one quiet value line; Mint
(`#6AF1B0`) appears only as a thin on-dark accent, never as text on light. Right: a white
card on the Off-White (`#F4F7F6`) canvas. At the 390×844 mobile viewport the brand panel
stacks above the card.

**Flow.** Two steps. Step 1: an email field (`type=email`, `autocomplete=email`) and an
Emerald (`#1C6B49`) "Send code" button, 44px tall at radius-md. Step 2: a single 6-digit
code field (`inputmode=numeric`, `autocomplete="one-time-code"`, client-validated
`/^\d{6}$/`) with an Emerald "Verify", a "Use a different email" back link, and "Resend
code".

**Copy** (in voice, and load-bearing for the no-enumeration criterion): the acknowledgement
is uniform — "If that email has access, a code is on its way." A failed verification reads
"That code didn't match — check it or resend."

**Behaviour and accessibility.** Real `<label>`s throughout; acknowledgements and errors
announced via `aria-live="polite"`; focus moves to the code field after "Send code" and to
the first error on failure; button `:active` feedback; entry transitions ease-out ≤200ms;
`prefers-reduced-motion` respected.

**Visual check.** The user-facing functional check covers both steps at 1440×900 and
390×844.

## Acceptance criteria
> **Normative:** this section is the binding acceptance set for platform-base, in full.
> `plans/roadmap.json` carries an abbreviated summary for backlog display — it is a
> pointer, never a substitute, and its brevity does not narrow this list. A planner or
> implementer working from the roadmap entry alone is working from an incomplete
> contract and must read this section.

- App builds and boots on this repo's stack (npm workspace: `backend`, `contract`, and
  a fresh `frontend`).
- **Login works via email+OTP** under the local runtime contract above (seeded admin,
  `AUTH_OTP_MOCK=true`, non-production `NODE_ENV`, code `000000`). The retained auth
  guarantees are proven observably, not asserted: verification creates the 3F session
  cookies, `GET /api/auth/me` resolves the principal **and its role**, logout clears the
  session, and an `auth.otp_verified` row is **appended** to the audit log. A screen that
  merely looks logged in does not satisfy this.
- Only **auth, CSRF and health** answer on the API (plus non-production `/api/docs`); the
  unowned capability routes are absent (404), proven by a route-registration test that
  compares the complete method/path allow-list.
- **Session continuity is observable, not merely registered.** Keeping `refresh` in the
  allow-list is pointless if nothing exercises it: after CSRF bootstrap, `POST
  /api/auth/refresh` rotates the session cookies and a subsequent `GET /api/auth/me`
  succeeds; and the frontend, on an access-token 401, retries **once** through refresh
  before falling back to `/login`. Without this the endpoint can stay mounted while
  continuity quietly regresses to a 15-minute session.
- **No account enumeration**, as a release criterion rather than an incidental behaviour:
  OTP requests for active, inactive and unknown emails return an identical status and
  body; verification fails identically for unknown and inactive principals; and neither
  ever yields a usable OTP or session. Covered by a required test, so a later regression
  cannot pass the story.
- The **fresh** shell renders in KnackLabs green, branded 3F, faithful to the bound
  design export: exactly the five nav labels (`Dashboard`, `MIS Reports`, `Ask`,
  `Explore / Saved`, `Admin`) with **only Dashboard active**; the other four and the
  top-bar search are visibly disabled, non-navigable, and **make no feature API calls**;
  the data-freshness pill reads as explicitly unavailable. The frontend delivers the app
  shell + login + placeholder Dashboard only.
- With `WAREHOUSE_PG_*` configured, the Postgres warehouse adapter runs a trivial
  `SELECT` **end-to-end through the app path** (validate → explain → execute) returning
  the expected fixture result. This is falsifiable: the live E2E is demonstrated evidence
  gated behind `WAREHOUSE_E2E=1` (fixture result observed on the host), and the pg-OID →
  numeric mapping is proven by a hermetic unit test with a negative control (decision
  0009). (When `WAREHOUSE_PG_*` is unset the adapter returns an empty result rather than
  failing fast — a known PoC behaviour; fail-fast on missing configuration is a robustness
  item folded into the deferred deployment-readiness work, decision 0011.)
- A **repo-wide quality baseline** covers `backend`, `contract` and `frontend`: ESLint,
  Prettier and TypeScript checking across all three, enforced by root verification via
  `FACTORY_QUALITY_CMD` and `FACTORY_TYPECHECK_CMD`. Root `verify.py` treats quality as
  optional unless it is declared, so an undeclared gate is an absent gate.
- The 3oilpalm harness machinery is intact — meaning, specifically: a **root-level
  `verify.py` run whose `FACTORY_STRUCTURAL_CMD` explicitly invokes both
  `check_dual_runtime.py` and `check_vendor_integrity.py`**. `verify.py` runs only the
  commands the `FACTORY_*` variables declare; it does not itself guarantee either check is
  among them, so "clean" is otherwise unfalsifiable. Separately, the **Pulse snapshot
  carries its own provenance**: `backend/VENDORED_FROM` names the source repository **and
  the exact commit** it was taken from (decision 0008) — asserted on its own, since the
  harness integrity check protects harness assets and says nothing about the snapshot.

## Open items (non-blocking)
- Production warehouse engine (Postgres vs BigQuery) — separate open decision.
- LLM/model + residency — deferred (assistant spec).
- Production deployment readiness — deferred (decision 0011; deferral D-0003).

## Source
Decisions 0003, 0004; `docs/architecture/30-financial-mis-build-plan.md`; Pulse repo `~/Desktop/pulse`.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
