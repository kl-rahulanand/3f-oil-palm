# Cold-read grill — gate: plan — plan plans/active/platform-base-adapt-pulse-into-the-3f-app-base.md

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



## The artifact under interrogation (plan plans/active/platform-base-adapt-pulse-into-the-3f-app-base.md)

---
issue: platform-base
title: Adapt Pulse into the 3F app base
status: approved
saved: 2026-09-01T11:17:14+00:00
story: platform-base
decisions_reviewed:
  - 0001-poc-engagement-scope
  - 0002-phase1-financial-mis
  - 0003-mis-presentation-tool
  - 0004-pulse-governed-joins
  - 0005-client-signoff
  - 0006-frontend-fresh-backend-vendor
  - 0007-frontend-framework-nextjs
  - 0008-pulse-vendored-snapshot
  - 0009-required-tests-real-name-and-tsproject
  - 0010-rebrand-pulse-to-3f
  - 0011-deployment-readiness-poc-scope
  - 0012-vendored-api-constitution-deviation
---

# Plan — platform-base: Adapt Pulse into the 3F app base

## Problem
Before any capability (ingestion, metrics, reporting, assistant) can be built, the
app must exist in this repo, run on our stack, authenticate, talk to a Postgres
warehouse, and wear the 3F identity. We adapt Pulse (decisions 0003/0004/0006):
vendor its backend trust spine, and build a fresh frontend from the approved
Claude Design. This story unblocks the other six.

## Scope / Non-goals
**In:** vendor Pulse `backend` + `contract` (strip MBS specifics); a Postgres
warehouse adapter + validator dialect; backend boots + OTP auth on Postgres; a
repo-wide lint/format/typecheck baseline; a constrained API surface (auth, CSRF,
health only); a fresh frontend shell + OTP login (KnackLabs green, from the
design); harness build/verify wiring.
**Non-goals:** SAP ingestion, semantic layer/joins, the MIS screens, drill-down,
assistant (later stories); BigQuery; multi-tenant; hardening beyond boot.
The non-goals are enforced, not merely stated: the vendored capability modules
(chat, reports, saved queries, pins, measures, conversations, admin) stay
**unregistered** until their owning stories activate them, and every not-yet-built
navigation target in the shell renders visibly unavailable rather than as a dead
route.

## Acceptance Criteria
- App builds + boots on the npm workspace (backend/frontend/contract).
- Email+OTP login works; RBAC intact; audit is **application-enforced and
  fail-closed** (append-only by construction in the app layer — database-level
  immutability is deferred with the deployment hardening, decision 0011 / D-0003),
  proven by the observable login audit row.
- Only **auth, CSRF and an explicit health endpoint** are reachable on the API; the
  capability modules whose tables the trimmed migration removed are not registered,
  so an authenticated caller cannot reach a failing or misleading route.
- Frontend shell renders in KnackLabs green, branded 3F, per the Claude Design:
  exactly the five nav labels (`Dashboard`, `MIS Reports`, `Ask`, `Explore / Saved`,
  `Admin`) with **only Dashboard active**, the other four and the top-bar search
  visibly unavailable, and the data-freshness pill reading as **explicitly
  unavailable** until the ingestion capability owns a real value.
- A Postgres warehouse adapter runs a trivial query end-to-end via the app path
  (`validate → explain → execute`) returning the expected fixture result — demonstrated
  behind `WAREHOUSE_E2E=1`, with the pg field-OID → numeric mapping proven by a
  hermetic unit test and a negative control (decision 0009).
- A repo-wide quality gate (ESLint + Prettier + `tsc --noEmit`) covers **all three**
  workspaces and is enforced by `verify.py`, not merely declared.
- Harness intact: dual-runtime + vendor integrity clean; `verify.py` green.

## Technical Approach
- **Vendor** `backend/` + `contract/` from the Pulse repo as owned code (snapshot,
  decision 0006). Strip MBS-specific domains (`operations`, `leadActivity`) and MBS
  seeds/grants; keep the framework: auth, RBAC, session, audit, semantic-layer
  framework, SQL builder/validator, warehouse port. npm workspace at repo root
  (`workspaces: [contract, backend, frontend]`).
- **Warehouse:** a **separate Postgres container** (docker-compose), distinct from
  the app DB (grill decision). Implement `PostgresAdapter implements Warehouse`
  using `pg`; select it via `warehouseDriver=postgres`; flip the `sqlValidator`
  node-sql-parser dialect to `postgresql`.
- **Migrations:** **trim Pulse's Drizzle migrations to the auth + audit minimum**
  needed for first boot (grill decision); the rest come back with the stories that
  need them.
- **Auth:** keep Pulse email+OTP (mock OTP until SES), JWT cookies, RBAC, audit — as-is.
  "Append-only audit" means **application-enforced, fail-closed inserts**: the app
  never updates or deletes an audit row, and an audit write that cannot complete
  fails the operation rather than passing silently. Database-level immutability
  (triggers or a permission model refusing `UPDATE`/`DELETE`) is **not** built here —
  it is production hardening, deferred with decision 0011 (D-0003).
- **API surface:** the vendored `AppModule` registers Pulse's full capability set,
  but the trimmed migration removed several of those tables — so those routes are
  reachable and broken. Register **only auth, CSRF and an explicit health endpoint**;
  leave chat, reports, saved queries, pins, measures, conversations and admin
  **unregistered** until their owning stories bring them back with their tables. This
  makes the non-goals real rather than aspirational, and delivers the "health" surface
  the plan already promises.
- **Quality gate, front-loaded:** ESLint + Prettier reach `backend/` and `contract/`
  (which have neither today) and the four `FACTORY_*` commands `verify.py` reads are
  declared in `.envrc` **before** the frontend is written, so the gate constrains the
  new code as it lands instead of auditing it afterwards. The gate widens as the
  frontend workspace appears; only the final whole-workspace proof stays in the last
  task.
- **Frontend:** a new **Next.js (App Router) + React + TS** package (`frontend/`,
  decision 0007) using **shadcn/ui on Tailwind**, themed with the KnackLabs `_ds`
  tokens ported from `docs/design/3F-Financial-MIS/_ds`; build the **app shell**
  (top bar, left nav) and **OTP login** from the approved design; consume the
  backend REST API. The `.dc.html` export is a design reference, not a runtime —
  rebuild as React components. **Inter is vendored**: the licensed WOFF2 files live
  under `frontend/` with their OFL licence and load through `next/font/local`, so the
  build and the running app make **no external font request** — the `_ds` export's
  Google Fonts import is a design-reference artifact, not the runtime source.
- **Harness:** point `harness.yaml` build/verify/test/lint at the workspace scripts
  so `verify.py` and the gates run against the vendored app.

## Decisions
Reviewed at planning time: 0003 (custom + Pulse), 0004 (governed joins — framework
carried, joins built later), 0006 (frontend fresh / backend-only vendor), 0007
(frontend framework = Next.js/React + shadcn/ui + Tailwind, `_ds`-themed). Warehouse
= Postgres for the PoC is settled by the `app-platform-base` spec; the production
engine (Postgres vs BigQuery) stays a separate open decision.

**Accepted during implementation** (they govern their respective tasks and supersede
the original "no new decisions" scope note): **0008** (Pulse `backend`+`contract`
vendored as a pinned snapshot — provenance preserved), **0009** (required_tests must
name a real leaf test and pin the runner project, closing a false-green gate — applies
to every task's proof), and **0010** (rebrand every Pulse product identifier → 3F;
provenance history preserved). **0011** (deployment readiness deferred; PoC acceptance
is local + mock-OTP). The frontend tasks consume `@3f/contract` and the 3F auth wire
names per 0010, and prove themselves per 0009.

**Frontend tooling (conduct §9, confirmed with the client 2026-09-04 — best-fit, not
defaults):** **npm workspaces** (not Nx) — the vendored backend is already one; adding
`frontend` avoids re-tooling vendored code (`constitution/01-monorepo-standard.md`
deviation, decision 0008). **Vitest + React Testing Library + jsdom** — ESM/TS-native,
fast, minimal Next config (over Jest). **ESLint + Prettier +
`tsc --noEmit`** — the lint + format + type-check gate. The frontend uses
`eslint-config-next`, run by each frontend task's `verify_commands` (stage-done
enforcement); **backend + contract** get a base ESLint + Prettier config in the
**quality-gate-baseline task (T5)** — front-loaded, before any new code is written, so
the gate constrains what lands rather than auditing it afterwards — so ALL touched
TypeScript is linted+formatted. The repo-wide gate is wired into `verify.py` via `.envrc`
`FACTORY_STRUCTURAL_CMD` / `FACTORY_TYPECHECK_CMD` / `FACTORY_QUALITY_CMD` /
`FACTORY_TEST_CMD` (exact names read by `verify.py`) in T5, widened to the frontend in T7,
and proven whole-workspace in T9. **`pg` (node-postgres)** — the Postgres driver
behind `PostgresAdapter`: the standard, well-supported client already backing the
vendored Drizzle stack, so reusing it avoids a second Postgres client. **TanStack Query v5**
— server-state layer (me query + OTP/logout mutations) wrapping the `api.ts` transport.
**`next/font/local` (Inter)** — the `_ds` token face served from **licensed WOFF2 files
vendored under `frontend/`** with their OFL licence. `next/font/google` is deliberately
rejected: it needs network at build time and the exact files can drift between builds.
The `_ds` export's Google Fonts `@import` is a design-reference artifact — the runtime
makes no external font request, and an offline production build is the proof.

**Deployment (decision 0011):** platform-base is a **PoC** — local, single-tenant, mock
OTP. Production deployment readiness (real SES email, provisioning, secrets, CORS
allowlist, audit retention/encryption, residency) and the constitution's
`/deployment/<environment>` structure are **deliberately deferred** to a post-PoC story
(deferral D-0003) — not built or scaffolded here.

**Vendored API compliance (decision 0012):** the vendored backend does not meet two
constitution requirements — a global exception handler (`constitution/07-exception-handling.md`)
and structured JSON logging with a `correlationId` (`constitution/05-logging-and-observability.md`
§2.1) — and its typed response DTO coverage is uneven. These are accepted as a
**time-bounded deviation** for the PoC and ledgered as D-0004, revisited on the same
trigger as 0011. The deviation covers the **vendored** code only: anything written fresh
in this repo meets the standards as written. Swagger is **not** part of it — it is already
mounted at `api/docs` with error responses documented, and stays compliant.

## Surface Impact
| Surface | Class | Note |
|---|---|---|
| Runtime behavior | Changed | New app boots (backend API + frontend shell) |
| API | Changed | Surface deliberately **constrained** to auth + CSRF + an explicit health endpoint (T6); the vendored capability modules (chat, reports, saved queries, pins, measures, conversations, admin) stay unregistered until their owning stories, so no route is reachable without its tables |
| Data / schema | Changed | Trimmed auth+audit migrations; a separate Postgres warehouse container |
| CLI / ops | Changed | Repo-wide lint/format/typecheck baseline + the four `FACTORY_*` `.envrc` commands land in T5 (front-loaded), widen to the frontend in T7, and are wired into `harness.yaml` and proven whole-workspace in T9; docker-compose (app DB + warehouse) |
| UI | Changed | Fresh KnackLabs-green Next.js app — T7 builds the `_ds` theme + locally vendored Inter + shadcn/ui primitives (foundation), T8 the shell + OTP login (TanStack Query), with the four inactive nav items, the search box and the freshness pill all visibly unavailable |
| Docs | Unchanged-by-design (planning reconciliation only) | Spec + architecture build-plan were reconciled to the accepted decisions during re-planning (0006/0008/0010/0011) — completed planning governance, NOT a story task output; no task carries `docs/` in its write_scope |
| Tests | Changed | Vendored backend tests carried; add boot/login/query smoke tests + frontend Vitest+RTL hermetic tests and the lint/format/typecheck gate |

## Task Decomposition
1. **vendor-backend-contract** (backend, not user-facing) — snapshot `backend/` +
   `contract/`; strip MBS domains/seeds; set up the npm workspace; `npm install`;
   backend + contract build and typecheck. write_scope: `backend/`, `contract/`,
   `package.json`, `package-lock.json`, `tsconfig.base.json`.
2. **postgres-warehouse-adapter** (backend, not user-facing) — `PostgresAdapter`
   over the Warehouse port; validator dialect `postgresql`; warehouse config +
   a separate warehouse Postgres in docker-compose; a trivial query runs E2E.
   depends_on: 1. write_scope: `backend/src/warehouse/`, `backend/src/sql/`,
   `backend/src/config.ts`, `backend/src/core/core.module.ts`, `docker-compose.yml`.
3. **backend-boot-otp-auth** (backend, not user-facing) — trim migrations to
   auth+audit; app-DB migrations run; backend boots; email+OTP login works;
   RBAC/audit intact; boot/login smoke tests. depends_on: 1,2. write_scope:
   `backend/src/`, `backend/drizzle/`, `docker-compose.yml`.
4. **rebrand-pulse-to-3f** (backend, not user-facing) — rename every Pulse product
   identifier to 3F across the vendored backend + contract (packages `@3f/contract`/
   `@3f/backend`, auth wire names `3f_*` + JWT `3f-api`/`3f`, seed/strings), behaviour
   preserving; provenance history preserved (decision 0010). depends_on: 1,2,3. write_scope:
   `backend/`, `contract/`, `package.json`, `package-lock.json`, `docker-compose.yml`.
5. **quality-gate-baseline** (ops, not user-facing) — establish the repo-wide quality
   gate **before** new code is written: add ESLint + Prettier config and
   `lint`/`format:check` scripts to **backend and contract** (they have neither today),
   and declare the commands `verify.py` reads from `.envrc` under these exact names —
   `FACTORY_STRUCTURAL_CMD` (build + workspace/vendor integrity), `FACTORY_TYPECHECK_CMD`
   (contract + backend), `FACTORY_QUALITY_CMD` (ESLint + Prettier across the workspaces
   that exist), `FACTORY_TEST_CMD` (backend tests). The frontend joins each command as
   its workspace lands (T7). depends_on: 1,4. write_scope: `.envrc`, `package.json`,
   `backend/` + `contract/` (lint/format config + scripts only).
6. **api-surface-trim** (backend, not user-facing) — register **only** auth, CSRF and an
   explicit health endpoint in `AppModule`; leave the vendored capability modules (chat,
   reports, saved queries, pins, measures, conversations, admin) unregistered until their
   owning stories restore them with their tables. Removes the reachable-but-broken routes
   the trimmed migration left behind and delivers the health surface the plan promises.
   `GET /health` is fresh code, so it returns a **typed, Swagger-documented** liveness
   response (decision 0012's deviation covers vendored code only). Also fixes two inherited
   defaults: (a) `config.ts` defaults `frontendOrigin` to `http://localhost:5173` (Vite,
   from Pulse), which **CORS-rejects** credentialed calls from the Next dev server on
   `:3000` — default it to `:3000`, keeping `FRONTEND_ORIGIN` as the override; (b)
   `main.ts` calls `app.listen(port)` with **no host**, binding every interface — bind
   `127.0.0.1` whenever `AUTH_OTP_MOCK` is on, so a known mock code (`000000`) and a
   deterministic dev JWT secret are not an admin login for the whole local network.
   Proof: a route-registration test comparing the **complete** method/path allow-list, and
   a no-enumeration test (active / inactive / unknown emails return identical status and
   body; unknown and inactive verification fail identically and yield no session).
   depends_on: 3,4,5. write_scope: `backend/src/app.module.ts`, `backend/src/health/`,
   `backend/src/config.ts`, `backend/src/main.ts`, `backend/test/`.
7. **frontend-foundation** (frontend, not user-facing) — scaffold the fresh Next.js
   (App Router) `frontend/` npm workspace and its toolchain: the `_ds`-token Tailwind
   theme, **Inter vendored as local WOFF2 loaded via `next/font/local`** (no external
   font request at build or runtime), in-tree shadcn/ui primitives, the TanStack Query
   provider, and a stack-appropriate quality gate (ESLint `eslint-config-next` + Prettier
   + `tsc --noEmit`) run by the task's `verify_commands` plus a pinned, non-downloading
   Vitest runner; widen the `FACTORY_*` commands from T5 to include the frontend. No app
   screens yet — the reviewable foundation the shell/login builds on. depends_on: 1,4,5
   (consumes `@3f/contract`, decision 0010). write_scope: `frontend/`, `.envrc`,
   `package.json`, `package-lock.json`.
8. **frontend-shell-login** (frontend, **user_facing: true**) — the user-facing app
   shell (Deep Forest left nav + white top bar, branded 3F) + net-new email+OTP login
   wired to the backend auth API, per the Claude Design; server state via TanStack
   Query over an `api.ts` transport (credentials + per-POST `3f_csrf` re-read). Exactly
   five nav labels with only Dashboard active; the other four, the top-bar search and the
   data-freshness pill all render visibly unavailable. depends_on: 6,7. write_scope:
   `frontend/`, `package.json`, `package-lock.json`.
   (Design skills: emil-design-eng, frontend-design.)
9. **harness-wiring** (ops, not user-facing) — point `harness.yaml` at the workspace
   scripts and prove the **whole-workspace** gate: `verify.py` green across structure,
   typecheck, quality (ESLint + Prettier over frontend AND backend AND contract) and
   tests (backend AND frontend). `FACTORY_STRUCTURAL_CMD` must **explicitly invoke both**
   `check_dual_runtime.py` and `check_vendor_integrity.py` — `verify.py` runs only what the
   `FACTORY_*` variables declare, so "harness intact" is otherwise unfalsifiable — and the
   Pulse snapshot's provenance (`backend/VENDORED_FROM` naming repo + commit, decision
   0008) is asserted separately from harness integrity. The gate itself was established in T5 and widened
   in T7 — this task wires and proves it, it does not invent it. depends_on: 1,2,3,4,5,6,7,8.
   write_scope: `harness.yaml`, `.envrc`, `.github/` (project workflows only).

Every task traces to the acceptance criteria; no speculative tasks.

## Risks
- Vendoring drags MBS coupling → T1 strips domains/seeds; T3 smoke test proves boot.
- Trimming migrations too aggressively could break auth/audit → T3 keeps the auth+audit set and boots against it before trimming further.
- Postgres dialect gaps in node-sql-parser → T2 validates a real query, not a stub.
- Frontend design fidelity → shadcn/ui themed by `_ds` tokens; design review on T8.
- Layout mismatch — the vendored code uses npm workspaces (backend/frontend/contract),
  not the Nx layout `constitution/01-monorepo-standard.md` recommends. Deliberate,
  documented deviation (avoids re-tooling the vendored snapshot, decision 0008); T9
  wires the actual workspace scripts into harness.yaml/.envrc.
- Unregistering the capability modules (T6) could disturb auth, which shares the module
  graph → the task keeps a route-registration test asserting auth + CSRF + health answer
  and the removed routes 404, and the T3 login E2E is re-run before the task closes.
- A promise of "no external font request" is easy to state and easy to break → T7 proves
  it with an offline production build, not by inspection.

## Verify Plan
- **Per task:** build + typecheck + relevant tests green; T2 the app-path query proof
  (`validate → explain → execute` returning the fixture result, demonstrated behind
  `WAREHOUSE_E2E=1`, plus the hermetic pg-OID → numeric mapping test with a negative
  control); T3 login E2E (mock OTP) + the observable append-only login audit row;
  T4 rebrand proof (build/typecheck green under `@3f/*` + a **product-identifier**
  pulse-free scan that deliberately **excludes provenance records** — `VENDORED_FROM`,
  `VENDOR_MANIFEST.json` and commit history retain "Pulse" by design, decision 0010);
  T5 the backend+contract lint/format gate runs and `verify.py` reads all four
  `FACTORY_*` commands; T6 the capability routes are gone and `/health` answers, proven
  by a route-registration test; T7 the frontend quality gate (ESLint + Prettier +
  `tsc --noEmit`) + a themed-primitive test + an **offline** `build:frontend` green
  (no external font fetch); T8 design review + the shell renders in green + OTP login
  E2E (successful verify → shell, logout → login) + the mobile drawer + the user-facing
  functional check; T9 whole-workspace `verify.py` (structure, typecheck, quality
  lint+format, tests for frontend AND backend) + dual-runtime + vendor integrity clean.
- **Story:** the acceptance criteria demonstrated end-to-end — boot, OTP login, green
  shell, a Postgres query through the app, and a clean harness.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
