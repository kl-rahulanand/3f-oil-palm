# Cold-read grill — gate: plan — plan draft plan-multi-plant.md

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

The technique is Matt Pocock's `grilling` skill — the design tree, the
frontier, numbered questions with recommended answers. `doctor --fix` installs
it into BOTH runtimes, and `./forge grill run` also inlines it into the brief,
so a reader reaches it whether or not its runtime resolves skills. This
contract is the harness-side floor; `grilling` is the technique.

`grill-me` is the HUMAN entry point — you type `/grill-me` and it redirects to
`grilling`. It carries `disable-model-invocation: true`, so no model invokes it
and none should be told to.

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
Claude sub-agent, never grill your own work inline — then carry ALL of those
findings into your own AskUserQuestion rounds (the recorder rejects rounds not in
the ledger, so the top-level session must still ask). Read cold, as an adversary
who did not write it.

ONE COLD READ PER GATE — put every question to the human INSIDE it. The old
shape was Codex grill → your rounds → amend → Codex grill AGAIN, looping until
clean. That loop cannot converge: a fresh reader has no memory of what the last
one found, so it returns a DIFFERENT frontier rather than a shorter one, and the
artifact you amended to close round one becomes round two's input. Stories
reached eleven, twenty-six and forty rounds that way; the last cost six hours.
`forge grill run` now REFUSES a second unconstrained read on a gate that has
already been read since its last recorded pass.

So the WHOLE grill is:

1. `./forge grill run --gate <gate>` — one cold read. WATCH it.
2. Clean? Record the pass and approve. Nothing else happens.
3. Otherwise resolve every finding the REPOSITORY answers yourself — open the
   file and settle it. Take to the human only what the repository cannot
   answer: a decision nobody has made, a priority, a tradeoff between two
   workable shapes. Put those through AskUserQuestion with your recommended
   answer first, all of them, now. There is no later round to save the hard
   ones for, and a finding is not a menu.
4. Amend the artifact ONCE, to what they decided.
5. Record the pass against the AMENDED version, then approve exactly once.

The price is stated plainly, twice over: nothing independent re-reads the
amended version, and a gap this reader misses is not caught by a second reader
at this gate. Both surface at the next gate, or in review. That is the trade
for ending a loop that was costing whole days.

If the human's answers changed the artifact's SHAPE — a component dropped, a
different approach chosen — the amended artifact is not the one that was read
in any useful sense. Say so and read again: `./forge grill run --gate <gate>
--reread "<what changed shape>"`. It is a choice with a recorded reason, not a
way around the rule, and the five-read cap still backstops it. (EVERY gate is ledger-matched — signoff and epics no
longer excepted — so no gate can be recorded by a read-only Codex grill alone:
the top-level session asks the round and records it.)

FRESH CONTEXT, AND THE ANSWERS SO FAR. Every round is a NEW read-only Codex
session — that independence is the whole point. But a reader that knows nothing
of the earlier rounds does not re-find the same gaps, it finds DIFFERENT ones,
so the rounds never shrink and the grill has no natural end. `./forge grill run`
therefore carries every question already put to the human and the answer they
chose, read from the ledger the recorder validates against.

That gives the reader two obligations: do not re-raise settled questions, and
CHECK EACH ANSWER — that the artifact honours it, and that it contradicts no
other answer, accepted decision or constitution rule. An answer can be wrong, or
right and never applied; saying so is part of the read.

Do NOT tell the reader where to concentrate. A cold read is worth having because
it is unconstrained, and steering it toward the diff is how the thing nobody
looked at survives every round. More information, no direction.

END EVERY ROUND WITH AN EXPLICIT CONVERGENCE VERDICT, on its own line, so the
coordinator never has to guess whether to grill again or approve:

- `CONVERGED — no gaps, no contradictions, plan unchanged since the last round`
- `NOT CONVERGED — <the specific reason: open gaps, a contradiction, or the plan
  changed after the last clean round>`

`CONVERGED` on the cold read means there is nothing to amend: record and
approve. `NOT CONVERGED` does NOT mean read again — it means resolve what the
repository answers, put the rest to the human, amend once, and record the pass
against the amended version. Approval happens exactly once.

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
  stages. Hunt: assumed files or APIs that prior work did not produce, a
  `write_scope` whose AREAS miss where the work must land or reach into areas
  the task has no business in (scope is directory prefixes plus named new
  files — a missing existing file under a declared prefix, a drifted line
  number or a renamed module is a NON-BLOCKING note, never a blocking finding;
  `stage done` measures the exact paths), acceptance criteria not served by the proposed
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




## Already answered on this story — verify, do not re-ask

These questions were put to the human and answered. Two obligations:

1. Do NOT raise them again as open questions. They are settled.
2. DO check each answer still holds — that the artifact actually honours it, and that it does not contradict another answer, an accepted decision, or the constitution. An answer can be wrong, or right and never applied. Saying so is part of this read.

- Q: Where should the 3F app be built, given we're adapting Pulse?
  A: Build in this 3oilpalm repo
- Q: Financial MIS statement — period columns for the PoC?
  A: July + FY 26-27 YTD
- Q: Financial MIS statement — Excel export fidelity?
  A: Clean structured export
- Q: Financial MIS statement — reconciliation / demo-ready bar?
  A: SAP totals = demo-ready; filled month = validated
- Q: SAP ingestion — how does data get in for the PoC?
  A: Excel upload now (SAP export/API later)
- Q: SAP ingestion — how are budgets brought in?
  A: Ingest budgets from the MIS format, as a separate object
- Q: SAP ingestion — grain & raw retention?
  A: Monthly gold + retain raw transaction lines
- Q: SAP ingestion — re-loading a period?
  A: Idempotent replace per period
- Q: Governed joins — how to handle rows in one object but not the other (Budget with no Actual, or Actual with no Budget)?
  A: Full-outer, zero-fill the missing side
- Q: Governed joins — where are 3F financial measures authored?
  A: In code (repo domain files)
- Q: Governed joins — RBAC on a joined query?
  A: Inject scope on both objects
- Q: Governed joins — correctness gate?
  A: Golden-answer fixtures required
- Q: Mapping master — Srihari's Master Table definition is still outstanding. How do we proceed?
  A: Build a provisional master now, reconcile later
- Q: Mapping master — how is it edited in the PoC?
  A: Seed / config file for the PoC (admin UI later)
- Q: Mapping master — selection with no mapping entries?
  A: Empty statement (zeros) + 'no mapping configured' notice
- Q: Drill-down — levels for the PoC?
  A: 2-level now (group → sub-lines → transactions), confirm with Srihari
- Q: Drill-down — showing individual transactions vs Pulse's aggregate suppression?
  A: Show individual lines within the user's RBAC scope, audited
- Q: Drill-down — line-item columns?
  A: Month, Debit, Credit, Value + reference, memo, posting date
- Q: Assistant/exploration — in the first PoC release, or a fast-follow?
  A: Include in the first PoC release
- Q: Assistant — LLM & data residency?
  A: Decide later
- Q: Platform base — how do we bring Pulse's code in?
  A: Snapshot-copy into the repo (own it)
- Q: Platform base — warehouse engine for the PoC?
  A: Postgres for the PoC
- Q: Platform base — auth for the PoC?
  A: Keep Pulse's email+OTP passwordless auth
- Q: Sign-off gate — how do we unlock the build?
  A: Record an internal go-ahead now
- Q: Decision 0029 (every SAP plant selectable on the nursery format, provisional labels, absent budget as a dash) must be accepted before the spec can be confirmed. It supersedes decision 0016's 'single plant DUB' join scope while restating its join key (GL code + month, now within each granted plant) and its deferred mapping-master clause. Accept it as written, confirmed by Rahul Anand?
  A: Accept, confirmed by Rahul Anand (Recommended)
- Q: FY-YTD block on a plant whose budget covers only some of the months in the block: how should Budget and % render? (Today only July is loaded, so the DUB YTD block is unaffected either way.)
  A: Budget = loaded months, % = not loaded (Recommended)
- Q: While a clicked period is being fetched, should the rest of Ask stay usable — i.e. can someone type a new question before the continuation comes back?
  A: Lock the panel while it runs (Recommended)
- Q: If a clicked period fails (server refuses it, or the network drops), what should the user be left looking at?
  A: Keep the buttons, show why (Recommended)
- Q: A clicked period can come back as something other than a data answer — for example another clarification, or an informational glossary reply. Which of those should take over the turn?
  A: Only a successful answer (Recommended)

## The artifact under interrogation (plan draft plan-multi-plant.md)

---
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
  - 0013-backend-observability-built-in-poc
  - 0014-sap-ingestion-poc-no-master
  - 0015-warehouse-snake-case-deviation
  - 0017-mis-selection-composite-key-seam
  - 0018-mis-selection-unmapped-gl-bucket
  - 0019-fresh-routes-follow-vendored-house-style
  - 0020-mis-budget-leaf-grain
  - 0021-mis-statement-outline-snapshot
  - 0022-mis-statement-governed-projection
  - 0023-mis-statement-drift-reports-not-blocks
  - 0024-drill-down-aggregate-client-projection
  - 0025-drill-down-pinned-batch-raw-read
  - 0026-assistant-ships-in-the-poc
  - 0027-assistant-llm-bedrock-mumbai
  - 0028-saved-selections-not-snapshots
  - 0029-all-plants-provisional-scope
  - 0030-format-outline-object
  - 0031-master-generated-from-workbook
  - 0032-ask-typed-choice-continuation
---

# Plan — multi-plant: All plants in the MIS statement

Story: `multi-plant` (roadmap 9, epic reporting) · spec: `docs/specs/all-plants-statement.md`
(confirmed 2026-09-15; spec grill and requirements grill both recorded against its amended
digest). Decisions 0029-0032 are accepted.

## Problem
The shipped statement offers exactly one selection, Agriculture / Nursery / DUB, because the
product is pinned to the nursery in five places, each verified by reading the file:

1. `backend/src/mapping/mis-mapping-master.ts` holds one selection and the 28
   cost-centre-plus-GL pairs DUB used in July; the full mapping sheet has 95.
2. `backend/src/ingest/mis-budget.parser.ts:8-9` hard-codes the format id and `plant = "DUB"`.
3. `backend/src/warehouse/warehouse-schema.ts:43` makes exactly one budget batch active per
   period, with no plant on `ingest_batch`, so a second plant's July budget would deactivate
   the nursery's.
4. `warehouse-schema.ts:180-185` defines `actual_by_gl_month` with `'DUB'::text AS plant …
   WHERE plant = 'DUB'`, so Ask answers by GL code can never show another plant.
5. `backend/src/chat/chat.service.ts:726-737` (`statementRequest`) requires exactly one
   department, function and plant on the user, so a multi-plant user's statement question
   from Ask resolves to nothing.

The July extract already holds 4,113 lines across 31 plants, all retained. A measured read of
the client's two workbooks shows the nursery mapping generalises: one company-wide chart of
accounts (54 GL codes, 45 in the sheet), one cost-centre vocabulary everywhere, and the sheet's
dictionary classifying ₹10,21,80,290.32 of ₹11,02,73,718.00 (92.7%). The human decided
(decision 0029) to offer every plant on the nursery format with provisional labels, and to
show an absent budget as a dash.

## Scope / Non-goals

**In scope**
- A generated master covering every SAP plant in the data (decision 0031), the full mapping
  sheet applied per plant, bucket rows for the eleven unnamed pairs, provisional labels.
- The format outline as its own ingest object; plant-keyed budget batches; the budget upload
  taking an explicit plant (decision 0030).
- The absent-budget state through the statement, its export, the governed measures and the
  drill pins; the partial-FY-YTD rule.
- Ask across granted plants: `plant` as a governed-financial dimension, statement plant from
  report grounding or the question, a typed plant clarification (decision 0032); the demo
  user granted every plant.
- The MIS Reports and Ask surfaces rendering the above.

**Non-goals**
- A trimmed office or mill format (rejected by the human, 0029); Table-1 and Table-3.
- Budgets for any plant but the nursery; roll-over; live SAP; months beyond those uploaded.
- An in-app master editor; the authoritative Master Table reconciliation (still owned by
  `mis-selection-and-master`'s open item).
- The recoverable-period clarification: `ask-period-control` follows this story and builds
  `periodChoice` on the pattern 0032 sets.
- Re-planning shipped drill or statement behaviour beyond what the outline object requires.

## Acceptance Criteria
- **C1** Against the pinned July actuals batch, all 31 SAP plant codes are offered to a fully
  granted user, each renders, and the 31 Grand Total Actuals sum to ₹11,02,73,718.00 in exact
  paise. Proven by a gated warehouse fixture over the client extract, not by inspection.
- **C2** DUB is unchanged: Actual ₹1,15,12,712.07 and Budget ₹1,00,50,136.29 for July 2026,
  every parent footing to its leaves, `unmapped-GL` carrying its own Actual, the export
  matching. The existing statement-projection and golden proofs keep passing.
- **C3** Every `(plant, cost centre, GL)` triple in the July extract resolves exactly once via
  the generated master; classification is a pure function of the committed table and the
  extract's cost centres (the fourteen July nursery codes, `H.O` Corporate / Office, the rest
  Operations / Unit), proven hermetically; nothing dropped or fanned out; the eleven unnamed pairs resolve to
  `unmapped-GL` with reason "not in the mapping sheet"; DUB's nine existing bucket rows keep
  their reasons; every new row is `provisional: true` with a reason; the master version is 3;
  a hermetic test proves the checked-in master equals the generator's output.
- **C4** A plant with no active budget batch for a block renders `–` with the accessible label
  "Budget not loaded for this plant" in Budget, Roll-over and % on every row including the Grand
  Total, on screen and in the Excel export, with no over-budget or credit flag anywhere. H.O
  renders 100% of its July net inside sections 8 Manpower and 9 Admin and ₹0 Actual on every
  nursery-only section.
- **C5** Department and Function follow the classification rule (nursery plants Agriculture /
  Nursery; `H.O` Corporate / Office; others Operations / Unit), are stored `provisional` in the
  master, and the selection options and the statement header show a visible "provisional" mark.
- **C6** Budget batches are keyed by plant and period; the upload takes a canonical `plant`
  field and refuses a missing or unknown plant; leaves that differ from the active format
  outline **load and are named** in the validation result (0023), and only matching leaves
  attach; a second plant's July budget coexists with DUB's and re-uploading it replaces only
  itself. The nursery workbook re-imported with `plant=DUB` yields the format outline batch and
  DUB's budget batch in one transaction.
- **C7** The statement's provenance carries the outline batch under source `outline` and the
  mapping-master version; the drill requires exactly one outline pin covering the block end,
  accepts zero or more plant budget pins (one per loaded month), and refuses a master-version
  mismatch as "statement out of date" (closing D-0038); it foots in exact paise for a leaf and
  for `unmapped-GL` on a no-budget plant; its audit record names the pinned outline batch, the
  budget batches if any, and the master version.
- **C8** Ask: `plant` is a `governed-financial` dimension scoped by grants on both sides of the
  join, so "Show Actual by plant for July 2026" returns one row per granted plant summing to
  the company net for the seeded user; a user granted only DUB gets only DUB in options, Ask
  and drill with no row leaking. A statement question beside a report resolves the report's
  plant; one naming a granted plant resolves it; on the standalone page a multi-plant user with
  no plant named receives a `plantChoice` clarification whose pick re-runs with zero further
  selector calls, proven by counting `select()` on a fake provider.
- **C9** Partial FY-YTD: Budget sums the months that have a budget batch and the block heading
  names them; % renders the dash whenever any month with actuals in the block lacks a budget;
  a two-month fixture proves it. The two zero states, the three nil states and the absent
  state stay distinct in hermetic tests.
- **C10** `GET /api/mis/options` offers only master-configured selections within the user's
  grants; an actuals upload always activates (replace-per-period, human-decided) and its
  validation result names unknown plant codes and plants present in the previously active
  batch but absent from the new one; unknown plants never appear in the dropdowns.
- **C11** Every proof is judged by junit testcase name and executed count (D-0024, D-0031); new
  test files are registered in `backend/package.json` and `tools/quality-gate.test.mjs`; a
  D-0006-ignored file edited by this story (`backend/src/chat/chat.service.ts`,
  `backend/src/db/migrate.ts` is not ignored) is formatted and de-ignored in the same task.

## Technical Approach

### The master is generated, not typed (0031)
`tools/generate-mapping-master.mjs` reads Sheet1 and the SAP Report of
`docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx`, the `Plant list` of
`Nursery MIS Format.xlsx`, and a committed table `backend/src/mapping/plant-classification.ts`
(SAP code → canonical id, display, department, function, nursery flag, provisional). For each
plant it emits one selection: `plant_canonical` = SAP code (DUB keeps `DUB` + alias `DUB-NUR`),
`mis_format: "nursery-mis-financial-v1"`, `budget_gl_codes` = the format's leaf GL codes, and
entries = the 95 sheet pairs as `leaf` targets resolved to stable leaf keys via the format
outline's `S.No|GL|slug` identity (the same resolution `mis-budget.parser.ts` performs), plus a
`bucket` entry for every `(cost centre, GL)` pair the SAP Report books for that plant and the
sheet does not name. DUB's nine bucket rows and their two reasons are carried from the
classification table so nothing shipped changes. The generated file keeps the existing
`MappingMasterDefinition` shape; `mapping-master.ts` validation (duplicate keys, alias reuse,
provisional-without-reason) is unchanged and now guards 31 selections. `provisional_labels:
true` is added to the selection schema so the options response can surface the mark.

### The outline is an object; budgets belong to a plant (0030)
Migration `0004_outline_object_and_plant_budgets.sql`: `source_kind` check admits `outline`;
`ingest_batch.plant text NULL` with a check that it is set exactly when `source_kind = 'budget'`,
and `ingest_batch.outline_batch_id uuid NULL` naming the format outline a budget batch was
compared against; the partial unique index becomes `(source_kind, period, COALESCE(plant, ''))`;
the `mis_budget` → `mis_budget_outline` foreign key is unchanged; `budget_by_leaf_month` and
`budget_by_gl_month` add `plant`; `actual_by_gl_month` drops the DUB literal and groups by
`plant`. The actuals validation result gains `unknownPlants` and `missingPlants` (versus the
previously active batch for the period); activation is unchanged. Existing budget batches are deactivated by the migration (the
0003 precedent) and the nursery workbook is re-imported once. `IngestionRepository` gains
`replaceOutlineBatch` and `replaceBudgetBatch(metadata{plant, outlineBatchId}, rows, outline)`;
the budget batch keeps its own workbook outline snapshot (0021 unchanged) so its rows always
have a referential home, and the service compares its leaf keys with the active format outline,
naming unattached leaves in the validation result — never refusing (0023). The nursery workbook
upload (plant `DUB`) is the one that also writes the format outline batch; the statement
attaches budget rows to the format outline by leaf key.

### Absent budget is a fourth state
`MisStatementRunResponse` measures become `budget: FixedScaleMoney | null`,
`percentage: string | null | "not-loaded"` is avoided in favour of a typed
`budgetState: "loaded" | "not-loaded"` per block in the response, so the renderer never infers
from null. `buildStatementProjection` keeps the full-outer join; the service decides
`budgetState` from the active budget batches for `(plant, period range)`: none → `not-loaded`
for the block; some months missing → Budget summed over loaded months, heading carries
`budgetMonths`, `%` null with `percentageState: "not-loaded"`. Export writes `–` and the label
row; filename includes the canonical plant. Provenance adds `mappingMasterVersion`. Drill: `bindPins` requires one `outline` pin whose
period covers the block end, accepts zero or more budget pins (one per loaded month), and
refuses when the request's master version differs from the running master (409, the existing
"statement out of date" class). The statement and export routes stay un-audited (D-0036 stands).

### Ask across plants
`semanticLayer.ts` adds dimension `plant` (column `plant`) to `governed-financial`; the composed
CTEs already inject the scope predicate on both sides (`sqlBuilder.ts:92,133`), so grants hold.
`statementRequest` resolves the plant in this order: report grounding, an explicit plant filter
the selector emitted (the `plant` dimension is enumerable, so the model can select it), then the
user's single plant; several granted plants and no plant → `ClarificationNeeded` with
`plantChoice` (0032), whose pick posts `AskRequest.selection` and runs verbatim at
`chat.service.ts:146`. `migrate.ts` seeds the admin's plant scope from the generated master's
canonical ids. `chat.service.ts` is D-0006-ignored: the task formats it and drops its
`.prettierignore` and baseline entries.

### What stays exactly as built
One governed path (0017); parents derived (0020); statement projection at leaf grain (0022);
aggregate drill client-side (0024); raw drill under pinned predicate (0025); audit before read;
0027's model boundary; the two zero states.

## Decisions
- `docs/decisions/0029-all-plants-provisional-scope.md` — accepted; the product call.
- `docs/decisions/0030-format-outline-object.md` — accepted; the outline as an ingest object,
  plant-keyed budgets, drift reported per 0023. Rejected simpler shape: reuse DUB's budget batch as every plant's
  outline. It couples 30 plants' rows to one plant's budget upload and makes an H.O drill pin
  a DUB budget batch, which the spec grill called unpinnable.
- `docs/decisions/0031-master-generated-from-workbook.md` — accepted; generator plus
  classification table. Rejected: hand-authoring ~3,000 entries (misattribution risk) and a
  runtime master read from the warehouse (contradicts 0014 for the PoC).
- `docs/decisions/0032-ask-typed-choice-continuation.md` — accepted; typed `plantChoice`.
  Rejected: re-asking through the model with the plant appended (measured unreliable in the
  period-control spec) and refusing multi-plant users outright (fails C8).
- Tooling: no new dependency. `exceljs` (present) reads the workbooks; the generator is a Node
  script under `tools/` like the existing quality-gate tooling; migrations follow the
  generate-once, apply-only drizzle pattern of 0001-0003.
- Contradicted lesson, deliberately: "ingest_batch has no plant column — do not act on it
  again" described the old shape; 0030 changes it.

## Surface Impact
| Surface | Change | Owning task |
| --- | --- | --- |
| Mapping master constant + generator + classification table | **New / Changed** — 31 selections, version 3 | 1 |
| `GET /api/mis/options` | **Changed** — many plants, provisional mark, unknown plants never offered | 1 |
| Actuals upload validation result | **Changed** — names unknown plant codes | 1 |
| Warehouse schema + migration 0004 + views | **Changed** — outline source kind, batch plant, plant in GL views | 2 |
| `POST /api/ingest/budget` + DTOs + Swagger | **Changed** — `plant` field; outline comparison reported in the validation result | 2 |
| `POST /api/ingest/actuals` validation result | **Changed** — `unknownPlants`, `missingPlants`; activation unchanged | 2 |
| `IngestionRepository`, budget parser | **Changed** — outline batch, plant-keyed budget | 2 |
| Statement service, DTOs, projection, export | **Changed** — budgetState, partial-YTD, outline pin, master version, plant in filename | 3 |
| Drill service pins + audit payload | **Changed** — outline pin required, budget pins optional, master-version refusal | 3 |
| Statement/export audit | **Deferred** — D-0036 stands; out of this story's scope | — |
| MIS Reports selection UI + statement view + drill panel | **Changed** — provisional mark, dash cells, heading months, outline pin | 4 |
| Semantic layer, SQL builder, chat service, contract | **Changed** — plant dimension, plantChoice, plant resolution | 5 |
| App-DB seed (`migrate.ts`) | **Changed** — admin granted every canonical plant | 5 |
| Ask panel | **Changed** — plantChoice buttons post a selection; answer names the plant | 6 |
| `.prettierignore` + quality-gate baseline | **Changed** — D-0006 for `chat.service.ts` | 5 |
| `backend/package.json`, `tools/quality-gate.test.mjs` | **Changed** — new test registration | 1, 2, 3, 5 |
| `docs/specs/all-plants-statement.md` | **Unchanged** — confirmed contract | — |
| Model, region, audit shape, RBAC model | **Unchanged by design** — 0027, 0016's surviving clauses in 0029 | — |
| Roll-over calculation, Table-1/3, master editor | **Deferred** — out of scope per spec; existing deferrals stand | — |

## Task Decomposition
Sequential leaves, backend and frontend separate, each single-runtime.

1. **`master-all-plants`** (backend, `user_facing: false`) — C3, C5(server), C10. The generator,
   the classification table, the regenerated master (version 3), the drift test, the
   exactly-once and classification fixtures over the July extract, options filtered to
   configured selections with the provisional mark. Depends on nothing.
2. **`outline-object-and-plant-budgets`** (backend, `user_facing: false`) — C6, C1(data). The
   migration, the schema and views, the repository and parser changes, the `plant` upload field,
   outline comparison reported per 0023, the actuals validation result's `unknownPlants` and
   `missingPlants`, the nursery re-import proof, the second-plant coexistence proof. Depends on
   task 1 (canonical plant ids validate the upload).
3. **`statement-all-plants`** (backend, `user_facing: false`) — C1, C2, C4(server), C7, C9.
   `budgetState` and partial-YTD in the statement service and DTOs, the export dash and
   filename, the outline pin and master version in provenance and drill (D-0038 closed), the
   31-plant reconciliation fixture, the DUB regression, the two-month fixture. Depends on task 2.
4. **`statement-ui-all-plants`** (frontend, `user_facing: true`) — C4(client), C5(client).
   Dash cells with the accessible label, no drill affordance on dashed Budget/%, block heading
   with budget months, the provisional mark on options and header, drill panel sending the
   outline pin. Depends on task 3.
5. **`ask-all-plants`** (backend, `user_facing: false`) — C8(server), C11(D-0006). The `plant`
   dimension, plant resolution order in `statementRequest`, the `plantChoice` carrier in the
   contract and service, the zero-selector-call proof, the seeded scopes. Depends on task 1
   (canonical ids) and task 3 (statement response shape); sequenced after 4 so the report ships
   whole first.
6. **`ask-plant-ui`** (frontend, `user_facing: true`) — C8(client). `plantChoice` buttons that
   post the patched selection; the answer header naming the plant. Depends on task 5.

## Risks
- **Leaf-key resolution for the 95 sheet pairs.** Sheet1 names GLs the nursery outline lists
  under several S.No rows (e.g. 50001201 under 1.1, 2.1, 10.1, 11.1). The generator must apply
  the same disambiguation the shipped master used (cost centre → section) and refuse to emit an
  entry it cannot resolve to exactly one leaf; task 1's fixture proves exactly-once.
- **Row cap.** 31 plants × the format's leaves is far under the projection's `maxRows`, but the
  reconciliation fixture runs 31 statements; it must run per plant, not one 31-plant query.
- **Migration on live data.** 0004 deactivates existing budget batches; the re-import is a
  recorded proof step, as 0021 required, and the demo environment must run it before the demo.
- **Coordination with `ask-period-control`.** Its saved plan touches `statementRequest` and
  the clarification carriers. This story lands first; that plan re-grills against the new
  shape (0032 names the pattern it should follow).
- **Provisional labels on screen.** The mark must read as "awaiting the client's names", not as
  an error; the functional check on task 4 covers the copy.

## Verify Plan
- **Hermetic backend** — `mapping-master.test.ts` (31 selections validate; generator output
  equals the checked-in file; exactly-once over the July extract from `docs/context`),
  `selection-resolver.service.test.ts` (options filtered, provisional mark, unknown plant
  absent), `mis-budget.parser.test.ts` (plant required, outline fingerprint), `ingest.service.test.ts`
  (attach, drift reported, unknown and missing plants reported), `mis-statement.service.test.ts` (budgetState, partial-YTD
  two-month fixture, DUB unchanged), `mis-statement-export.test.ts` (dash, label, filename),
  `mis-drill.service.test.ts` (outline pin required, budget pins optional, master-version
  mismatch refused),
  `semanticLayer.financial.test.ts` + `sqlBuilder.composed.test.ts` (plant dimension, scope on
  both sides), `chat.service.test.ts` (plant resolution order; plantChoice; zero selector calls
  on the pick), `chat.schemas.test.ts`, `migrate.trim.test.ts` (seeded scopes).
- **Gated DB proofs (`test:db` / `test:warehouse-proof`, D-0008)** — migration 0004 applies;
  `statement-projection.db.test.ts` and `golden-financial.db.test.ts` unchanged and green;
  new `all-plants-reconciliation.db.test.ts` (31 statements sum to ₹11,02,73,718.00);
  `drill-transactions.db.test.ts` extended for a no-budget plant leaf and `unmapped-GL`.
- **Frontend (vitest)** — statement view dash cells and label, no pointer affordance on dashed
  cells, block heading months, provisional mark, drill panel pin payload; Ask panel plantChoice
  buttons post a selection.
- **Functional (tasks 4 and 6)** — live: generate H.O, CK and DUB statements; drill an H.O
  leaf; export H.O; ask "Show Actual by plant for July 2026"; ask a statement question on
  `/ask` and pick a plant.
- Commands: `npm run typecheck`, `npm run quality`, `npm run test:hermetic`, `npm run test:db`,
  `npm -w @3f/backend run test:warehouse-proof`; every artifact records the executed count and
  testcase name.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
