# Cold-read grill — gate: task — task plan selection-ui

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
- Q: mis-selection delivery boundary: mis-statement (story 5) owns the finished hierarchical statement + Excel export, so this story must stop short of that or the two build conflicting report surfaces. But you want to put this in front of Srihari to get the unmapped-GL assignments back. How much should mis-selection visibly deliver?
  A: Selector + resolved scope + bucket list (Rec.)
- Q: mis-selection plan grill found a real bug: today the Budget side of the join admits EVERY active DUB budget GL, so a mapped selection can return Budget rows for GLs outside its resolved set — breaking acceptance criterion 1 ('exactly the DUB nursery slice'). The fix is to restrict Budget to the resolved master GL set. But that creates a mirror of the Actuals gap decision 0018 solved: Budget GLs present in the active budget batch but ABSENT from the mapping master would silently vanish from the report. How should unmapped BUDGET GLs be handled?
  A: Mirror the bucket for Budget (Rec.)
- Q: mis-selection decomposition: how many tasks should this story split into? My plan proposed 4. The harness asks for the fewest that stay bounded, since each task costs its own plan, grill, approval, review and PR — but an overloaded task grinds through review rounds instead (governed-joins task 4 took 4 rounds at comparable size).
  A: 3 tasks
- Q: mapping-master grill (blocker): the master must give each resolved triple an MIS line, but nothing states it mechanically. Sheet1 has only Plant, Cost Center, GL code and 'Revised GL name' — no S.No or line id — and Nursery MIS Format.xlsx's format sheet turns out to be Table-1 (Operational MIS), which the statement spec puts out of scope (Table-2 Financial MIS only). Without pinning this, a fixture could satisfy the 28-triple count while assigning triples to wrong or identical lines, breaking the future statement. What identifies an MIS line for the 66 resolved triples?
  A: Sheet1's 'Revised GL name' verbatim (Rec.)
- Q: selection-resolution grill (P1): these are the first FRESH routes in a vendored app, so the constitution applies to them — it requires /api/v1/<resource> paths, {success,data,error} envelopes on every endpoint, and forbids one domain module importing another directly (§8.1: Service Bus or /common only). But every existing route is unversioned 'api/<resource>' returning raw bodies, and the vendored code cross-imports modules freely (chat.service imports ../semantic). Decision 0012 does NOT cover versioning, envelopes or module boundaries. How should the new mis routes and module be shaped?
  A: Match house style + ledger a deviation (Rec.)

## The artifact under interrogation (task plan selection-ui)

# Task plan — selection-ui: the authenticated MIS Reports page

Story: mis-selection · Task 3 of 3 (FINAL) · **user_facing: true**

## Objective
Make the selection real for a person: an authenticated **MIS Reports** page where a user
picks Department → Function → Plant → period, presses **Generate**, and sees the resolved
scope, the governed numbers, the correct zero state, and — visibly, not absorbed — the
**unmapped-GL bucket**. This is the artifact we put in front of Srihari to get the
authoritative mapping back.

No backend change: tasks 1 and 2 shipped the master, the resolution, the governed narrowing
and the routes. This task **consumes** them.

## Mandatory for a user-facing task
`harness.yaml:113-116` — the recorder **refuses** a user-facing testing artifact unless
`skills_used` attests **both `emil-design-eng` and `frontend-design`**; both are installed
in the Codex runtime. A **functional check** is also required (owner
`codex:functional-checker`), recorded via `record_test_from_json.py --kind functional` — the
automated artifact alone does not satisfy this task.

## Acceptance criteria (plan_contracts)
- **t-ui-c1** — Department / Function / Plant / period as native selects populated from the
  options route, offering only the loaded actual months plus FY 26-27 YTD; **Generate** runs
  the selection through the run route, so Agriculture/Nursery/DUB returns exactly the DUB
  nursery slice.
- **t-ui-c2** — a resolved-scope readout naming the cost centres, GL codes and MIS format,
  and the **two zero states rendered distinctly**.
- **t-ui-c3** — the unmapped-GL bucket rendered as a **reviewable list** of its triples with
  amounts; the MIS Reports nav item and page title enabled in the shell.

## What already exists (grounding, file:line)
- **Task 2's contract, shipped** — `contract/src/api.ts:189-250`: `MisSelectionRunRequest`
  `{department, function, plant, period}`; `MisSelectionOptionsResponse` +
  `MisSelectionPeriodOption`; and the **discriminated union**
  `MisSelectionResolvedResponse | MisSelectionUnresolvableResponse` carrying
  `MisSelectionScopeReadout`, `MisSelectionBucketRow[]`, `MisSelectionTotals`.
- **Routes** — `backend/src/mis/mis-selection.controller.ts:28,33,55`:
  `GET api/mis/options`, `POST api/mis/run`, unversioned with raw typed bodies per
  decision **0019**.
- **API client** — `frontend/src/lib/api.ts` exposes **only 5 auth methods**; its
  cookie-credentialed fetch, CSRF bootstrap and one-shot 401 refresh live at `:18-37`, and
  it throws `ApiError`. These become the first **data** methods.
- **Shell** — `app/(app)/layout.tsx:7-9` gives `SessionGuard` + `AppShell` free to any page
  at `app/(app)/<route>/page.tsx`. `components/shell/app-shell.tsx:12-18` hard-codes
  `navItems`, rendering **"MIS Reports" as a disabled `<span aria-disabled="true">`**
  (`:110-115`), with the page title hard-coded at `:156`. `app-shell.test.tsx` and
  `nav-drawer.test.tsx` assert against that table.
- **Components/tokens** — only `components/ui/button.tsx` is reusable; there is **no**
  Select/Input/Table primitive. Tokens are CSS variables in `src/theme/*.css`
  (`--kl-emerald`, `--kl-line`, `--surface-card`, `--space-*`, `--radius-*`), guarded by
  `src/theme/tokens.test.ts`; layout classes live in `app/globals.css`.
- **Design prototype** — `docs/design/3F-Financial-MIS/3F Financial MIS.dc.html`: filter bar
  `:79-122` (four native selects, 34px, `--kl-line`, `--radius-sm`, then Generate); empty
  state `:126-140` ("Select Department, Function and Plant, then Generate"); provenance
  popover `:545` rendering scope in mono.
- **Frontend tests** — **vitest**, not `node --test`:
  `npm exec --no -- vitest run --config frontend/vitest.config.ts`.

## Design
### The page
`frontend/app/(app)/mis-reports/page.tsx` inherits `SessionGuard` + `AppShell` — no auth is
re-implemented. The feature lives in `src/features/mis/`.

### Branch on the union, never on emptiness
The two zero states are distinguished **by the response shape**:
- **unresolvable** → zeros **plus** the "no mapping configured" notice;
- **resolved with no transactions** → a configured zero result with **no** notice.

Conflating them is the exact defect this story exists to avoid, so both are tested.

### UI shape — no design system
Styled **native `<select>`** controls local to the MIS feature plus the existing `Button`.
**No** shared Select/Input/Table primitives: that serves no acceptance criterion and creates
a component API for one page (settled on the story plan grill). Styling uses the existing
CSS-variable tokens and `globals.css` classes — **no token is added or renamed**, since
`tokens.test.ts` guards the set.

### Period
Render **only what the options route returns** — the loaded actual months plus the derived
`fy26-27-ytd`. No client-side month computation, and not the prototype's June/May, which
have no Actual data; task 2 derives FY-YTD server-side from the latest active loaded month.

### The bucket (C3, decision 0018)
`MisSelectionBucketRow[]` renders as a **reviewable list** — each triple with its amount —
so the mapping gap is **visible rather than absorbed into a total**. A total that silently
included bucketed spend would defeat the purpose of the bucket.

### Shell
Enable the MIS Reports nav item to link to the new route and make the title reflect the
active page; `app-shell.test.tsx` and `nav-drawer.test.tsx` move with the nav table.

## Workflow
```mermaid
flowchart TD
  P["/mis-reports page · SessionGuard + AppShell inherited"] --> O[GET api/mis/options]
  O --> S["four native selects: Department · Function · Plant · Period<br/>(loaded months + FY 26-27 YTD, as returned)"]
  S --> G[Generate]
  G --> R["POST api/mis/run · ONLY the four selectors"]
  R --> U{response union}
  U -->|unresolvable| N["zeros + 'no mapping configured' notice"]
  U -->|resolved| V["scope readout (cost centres · GLs · format)<br/>+ governed numbers"]
  V --> Z{any transactions?}
  Z -->|no| C["configured zero result · NO notice"]
  Z -->|yes| T[the DUB nursery slice]
  V --> B["unmapped-GL bucket as a reviewable list of triples + amounts"]
```

## Manual Verification
1. `npm run test:hermetic` (includes `npm run test:frontend`) — the three required vitest
   leaves pass: selects populated from options with only loaded months + FY-YTD and Generate
   posting exactly four selectors; the scope readout plus **both** zero states rendered
   distinctly; the bucket rendered as a reviewable list.
2. `npm run typecheck && npm run lint && npm run format:check` — and `tokens.test.ts` still
   passes, proving no token was added or renamed.
3. **Functional check (mandatory, user_facing)**: with the backend running and the warehouse
   seeded, sign in, open **MIS Reports** from the nav, select Agriculture / Nursery / DUB /
   Jul 2026, press Generate, and confirm the DUB nursery slice, the scope readout, and the
   bucket list; then a selection with no mapping shows zeros **and** the notice.
4. The six existing gated warehouse proofs still pass — this task adds no query path.

## Decisions attested
0019 (vendored house style: the unversioned `api/mis` routes and raw bodies this page
consumes), 0018 (the bucket must stay visible), 0017 (the governed narrowing behind the
numbers), 0007 (Next.js), 0010 (3F branding), 0005/0011, 0009, 0012 (the vendored client
conventions this page reuses).

## Surface impact
- Frontend: `app/(app)/mis-reports/page.tsx` (NEW), `src/features/mis/` view + hook (NEW),
  `src/lib/api.ts` (first data methods), `src/components/shell/app-shell.tsx` (enable the
  nav item + title), `app/globals.css` (page classes).
- Tests: `src/features/mis/mis-report-view.test.tsx` (NEW),
  `app-shell.test.tsx` + `nav-drawer.test.tsx` (nav table moved).
- **Unchanged by design**: all backend code (tasks 1-2 shipped it), the contract types
  (consumed, not changed), the theme tokens (`tokens.test.ts` guards them), the six gated
  warehouse proofs, and `SessionGuard`/`AppShell` auth.

## Out of scope
The hierarchical statement and **Excel export** — the prototype's "Download Excel" button
belongs to `mis-statement`; actuals drill-down (`drill-down`); the prototype's Admin
mapping-master screen (in-app authoring is not in this PoC); shared design-system
primitives; any backend or query change.

## Task Decomposition
This is task 3 (FINAL) of the mis-selection story's 3-task decomposition
(`.factory/stories/mis-selection/decomposition.json`): (1) mapping-master [#25],
(2) selection-resolution [#26], (3) **selection-ui** [this task]. It is a single bounded
unit — one page consuming already-shipped routes — and is not further subdivided; its three
criteria are proven by the three vitest required_tests plus the mandatory functional check.
Shipping it completes the story.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
