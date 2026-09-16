# Cold-read grill — gate: spec — spec mis-assistant-explains-a-number.md

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
- Q: Conflict with shipped code. The period control's contract says a refused period switch KEEPS the previous answer — you chose that two stories ago, and it's proven by a passing test. This story says a refusal CLEARS it. Both go through the same `continueTurn`. How should that be resolved?
  A: Clear only on saved-report reopens (Recommended)
- Q: Which kinds of refusal should wipe the old numbers? A lost domain grant doesn't come back as `blocked_by_policy` — it returns `not_supported`. An expired login is an HTTP 401/403. Others are plainly not access problems.
  A: Access-related only (Recommended)
- Q: Your access-only clearing rule can't actually be implemented today. A revoked domain or measure grant returns `not_supported` (chat.service.ts:245) — but so do 'no mapping configured' and 'no periods loaded', which aren't access problems at all. The response carries only a class and a message, no reason code. How do you want to handle that?
  A: Narrow it now, record the gap (Recommended)
- Q: The grill is right that I've created a governance problem. Decision 0028 says plainly: "a revoked grant produces a refusal rather than a cached figure." D-0048 permits exactly that cached figure for a revoked domain or measure grant. A deferral can't override an accepted decision — so one of them has to give. Which?
  A: Amend 0028 to record the limit (Recommended)
- Q: When a reopen fails with a terminal 401/403, the session itself is gone — not just that one report. The contract currently says show the refusal on that turn and stop. Should it do more?
  A: Show it on the turn, stay put (Recommended)
- Q: When you reopen a pin whose answer is ALREADY visible on screen — say it's the last thing in the thread — should the panel still scroll to it?
  A: Always scroll to it (Recommended)
- Q: How should the user point at the number they're asking about?
  A: Click the line first, then ask
- Q: What should 'how did this calculation come to be' actually return?
  A: Both transactions and roll-up path (Recommended)
- Q: Decision 0035 (carried forward by 0037) says a statement question in Ask should resolve its plant from the question, which WOULD change /ask. You said /ask must stay exactly as today. Which wins?
  A: /ask stays frozen; explanation only (Recommended)
- Q: Your example was 'how is total 85000'. But every Actual is clickable including subtotals and Grand Total, while the transaction drill REFUSES anything that isn't a leaf line. What should clicking a total do?
  A: Totals get roll-up path, leaves also get transactions (Recommended)
- Q: Decision 0027 forbids transaction rows ever reaching Bedrock, so the answer must be composed server-side, not written by the model. How many rows should the chat answer itself carry?
  A: Footer, counts, and first rows; drill for the rest (Recommended)
- Q: With a number focused, should 'why is this so high?' still be declined the way it is today?
  A: Yes — keep declining causal questions (Recommended)

## The artifact under interrogation (spec mis-assistant-explains-a-number.md)

---
slug: mis-assistant-explains-a-number
title: The on-screen assistant explains a number on the MIS statement
status: draft
saved: 2026-09-15T19:52:14+00:00
---

# The on-screen assistant explains a number on the MIS statement

## Why

On the MIS Reports screen the docked assistant knows nothing about the report on screen.
`AskPanel` accepts exactly two props - `surface` and `onCollapse` - and `ask()` posts
`{ question }`. So asking "how is this 85000" while looking at Agriculture Nursery DUB for July
2026 is byte-for-byte the same request as asking it on `/ask` with nothing on screen.

Worse, the assistant actively refuses the question. `classifyCausalQuestion`
(`backend/src/chat/reconciliation-guard.ts:31`) fires before any routing and answers:

> Causal analysis is not configured. I can't infer why a result is high or low.

That guard is **correct with no context** - it stops the model inventing causes. But it answers
the wrong question. "How is this 85000" is not causal inference, it is **composition**: which
amounts add up to this figure, and why do they land on this line. The product already computes
both halves and already shows them to the same user through a different door:

- `POST /api/mis/statement/drill` returns every transaction behind a leaf - month, posting date,
  debit, credit, value, reference, memo - plus a footer that foots exactly, and it is audited
  under decision 0025. `statement-view.tsx:167` opens it when the user clicks an Actual.
- The mapping master already determines which (plant, cost centre, GL) triples fold into each
  statement leaf. That is how the number was built.

This capability is not new analysis. It lets the user ask, in words, for an explanation the
product already has, at the moment they are looking at the number.

**This is the follow-up decision 0037 named.** 0037 left the assistant untouched by multi-plant
and deferred `statementGrounding` to "the follow-up story". Decision 0038 scopes that follow-up
to the grounded explanation only: `/ask` is frozen, and 0035's plant-from-the-question half stays
deferred.

## Behaviour

### The grounding
The docked panel sends a typed `statementGrounding` carrying the rendered statement's
**department, function, plant and period** - exactly the shape decision 0035 specified and 0038
adopts - plus the **selected block** and, when the user has clicked one, the **focused node**
(`nodeKey` and block) and the statement's **pinned batches**. The block is part of the subject
because a July screen also carries a distinct FY-YTD block, so period alone cannot identify
"this 85,000".

The server **re-derives everything**. It never trusts the client: department and function come
from the master's selection for that plant, never from user scope; the plant is checked against
the user's current grants on every ask; and the pins are validated before any read. A plant the
user cannot see is refused, not answered.

### `/ask` is untouched
`/ask` sends no grounding and behaves byte-for-byte as today, proven by its shipped leaves
passing unmodified. Grounding is a branch the caller opts into - the same shape `continueTurn`'s
caller-stated failure policy took in `ask-reopen-saved-report` - never a change to shared
classification. Per 0037 and 0038, a user granted every plant still gets "not supported" for a
statement question on `/ask`, while the same user gets a full answer from the docked assistant.

### Click, then ask
Focus is explicit. The user clicks an Actual - the affordance the statement already ships - and
that node becomes the subject. Digits in the question are **never** used to choose a node, so
there is no ambiguity when two lines share a value and no disambiguation prompt. Focus is owned
by the report view, not by the drill modal, and is passed to both the drill panel and the
assistant. It is **cleared** whenever the report scope, the block or the pinned batches change,
because the subject no longer exists.

With no node focused, the assistant asks the user to click the line. Budget is never a subject,
matching the statement's shipped footnote that Budget is not drillable.

### What the answer contains
**A total and a leaf are answered differently, because the drill refuses a non-leaf and decision
0024 does not permit inventing an aggregate raw query.**

- A **leaf** gets both halves: the roll-up path - which GL codes and cost centres the mapping
  master folds into that leaf, through which bucket - then the transactions behind it.
- A **total or subtotal** gets the roll-up path only: which lines compose it, and which GLs and
  cost centres feed those lines. No raw rows, nothing refused.

Transactions are bounded and honest about it: the answer always carries the **exact footer** and
the **total row count**, shows the first rows inline, and offers the existing drill panel for
full paging. It never truncates silently. If the footer does not foot to the figure on screen,
that is a failure, not a rounding note.

### The model never sees the numbers
Decision 0027 forbids transaction rows, amounts, batch identifiers and result rows reaching
Bedrock. The explanation is therefore **composed deterministically on the server** and rendered
from a typed payload. The model's only role is classifying the question. No figure in the answer
is ever model-generated.

### Composition is answered; cause is not
The boundary is explicit and testable, not "equivalents":

- **Composition** - how a figure was built, what it contains, which GLs or lines feed it - is
  answered.
- **Causal** - why a figure is high or low, what caused a movement - is still declined, with
  today's copy. Grounding must not become a back door that lets the model invent reasons, which
  is exactly what `classifyCausalQuestion` exists to prevent.
- An ordinary **data question** asked with a statement on screen is still answered as a data
  question. Grounding narrows what a question may reach; it does not turn every question into an
  explanation.

### Freshness and staleness
A grounded answer reads the **same pinned batches** the on-screen number came from, so the answer
can never contradict the screen by quietly using fresher data. A replaced or missing batch is
refused in **typed** terms that name which source and period went stale - not through the global
HTTP error envelope, which flattens that detail into generic copy.

The answer also names the **mapping-master version** it resolved against, so an explanation that
was built under a different master than the on-screen figure is detectable rather than silently
wrong. Cross-deployment master drift remains D-0038's deferral.

### Plants and unmapped lines
Every plant the user is granted is supported by the docked assistant. A plant that is not the
budget owner carries decision 0034's **"Budget not loaded for this plant"** state, which is a
normal, expected answer and must never be presented as a stale or missing batch. An
`unmapped-GL` line is **provisional**, not an approved mapping path, and the explanation says so
rather than implying the master blesses it.

## Acceptance criteria

- **C1** The docked assistant sends `statementGrounding` - department, function, plant, period,
  block, pinned batches, and the focused node when one is clicked. `/ask` sends none of it and
  its shipped leaves pass **unmodified**.
- **C2** The server re-derives department and function from the master's selection for that plant
  and validates the plant against the user's current grants on every ask. A plant outside the
  user's grants is refused, never answered, and a leaf proves the client cannot widen its own
  scope by editing the payload.
- **C3** With a node focused, a composition question is answered with the explanation, NOT with
  `classifyCausalQuestion`'s "Causal analysis is not configured". Without grounding that guard
  fires exactly as today.
- **C4** A causal question is still declined even when grounded and focused. A leaf asserts the
  composition/causal boundary on both sides.
- **C5** The subject is the clicked node, identified by `nodeKey` **and block**. With no node
  focused the assistant asks for the line; digits in the question never choose a node. Focus
  clears when the scope, block or pinned batches change.
- **C6** A **leaf** answer names the roll-up path - the GL codes and cost centres the master folds
  into that leaf, and the bucket they arrive through - and lists transactions with an exact
  footer and the true total count, showing the first rows inline and offering the drill for the
  rest. The footer foots to the figure on screen.
- **C7** A **total or subtotal** answer names the lines that compose it and their GLs and cost
  centres, and returns **no raw rows**. It is not refused, and no aggregate raw query is added.
- **C8** Budget is never a valid subject, matching the shipped statement footnote.
- **C9** No transaction row, amount, batch identifier or result row is ever sent to the model. A
  leaf asserts the provider payload, not merely the rendered answer.
- **C10** The explanation writes the drill's governed-read protections, not the ordinary chat
  audit: inputs re-derived server-side, pins validated, current scope applied, the exact
  predicate audited **before** the query runs, and a failed audit fails closed. Per decisions
  0017, 0022 and 0025.
- **C11** A replaced or missing batch produces a **typed** refusal naming the source and period,
  reaching the user intact rather than flattened by the global error envelope.
- **C12** The answer names the mapping-master version it resolved against.
- **C13** A non-budget-owner plant returns decision 0034's "Budget not loaded for this plant"
  state, distinct from a stale or missing batch. An unmapped-GL line is described as provisional.
- **C14** Every criterion is proven by hermetic tests judged by the vitest discriminator -
  present AND NOT skipped AND NOT failed (D-0031) - across this matrix: no focus / composition /
  causal / ordinary data question; leaf / subtotal / grand total / unmapped; selected-period
  block / FY-YTD block; stale actual / stale budget / changed mapping version; plant outside
  grants; audit failure; provider payload exclusion; and footer-foots-to-screen with the true
  total count.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
