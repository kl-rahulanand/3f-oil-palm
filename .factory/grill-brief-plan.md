# Cold-read grill — gate: plan — plan draft plan-draft.md

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
- Q: If someone asks "...for July 2026" and then switches the period control to August, the question on screen says July while the answer shows August. That's a visible contradiction in an audited transcript. How should it read?
  A: Keep their words, label the answer (Recommended)
- Q: The grill found that batch ids already travel in the API but the Ask panel never renders them — its provenance section shows only readback, measures, scope and freshness. My criterion says "provenance reports the batch ids". Should this story make them visible?
  A: Out of scope — reword the criterion (Recommended)

## The artifact under interrogation (plan draft plan-draft.md)

---
issue: ask-period-control
title: Recoverable periods in Ask
status: draft
story: ask-period-control
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
  - 0016-governed-joins-poc-scope
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
---

# Plan — ask-period-control: Recoverable periods in Ask

Story: `ask-period-control` (roadmap 9) · spec: `docs/specs/ask-period-control.md` (confirmed)

## Problem
A well-formed statement question with no period is a dead end. Measured 4/4 against the running
PoC, `Show the MIS statement Actual by statement leaf` returns a red
`The answer does not resolve to one statement selector set and offered period.` The same question
with a period works 6/6 with 81 rows. The answer was one word away and the product said no.

`ClarificationNeeded` exists for exactly this, is already rendered by the Ask panel as clickable
buttons (`ask-panel.tsx:131-147`), and is already used elsewhere in the same method. The refusal is
not a missing capability; it is the wrong response class.

Three measurements decide the design, and each rules out the obvious implementation.

**Re-asking through the model is unreliable.** Today's clarify carries `options: string[]` and the
panel appends the chosen string to the question, which goes back through the selector. 4 samples each:

| re-asked question | result |
| --- | --- |
| `... by statement leaf (2026-07-01)` | success 2/4, informational 2/4 |
| `... by statement leaf (July 2026)` | success 3/4, informational 1/4 |

A period the user has explicitly clicked must never be re-guessed. That kills `resumesQuestion` as
the continuation for this feature.

**The MIS Reports period list contains an option that cannot answer a statement ask.** `periods`
includes `FY 26-27 YTD`, a twelve-month range, while `statementPeriod` needs a single period point.
Measured: `... (FY 26-27 YTD)` is `not_supported` 4/4. Offering the raw list would present a choice
guaranteed to fail.

**A governed-financial answer can legitimately have no period at all.** `Show Actual and Budget by
GL code` succeeds 4/4 with **no time window**, summing every loaded month (budget 32,000,000 against
July's 8,000,000), and its readback carries no period clause. Nothing may invent a period for such
an answer, and its coverage must be stated rather than left implied.

**Four distinct causes share one dead end.** `chat.service.ts` returns `NotSupported` at `:322` (no
selector set OR no period), `:331` (`SelectionPeriodUnavailableError`) and `:335` (no mapping), and
`statementRequest` (`:726`) collapses missing *and ambiguous* department, function, plant and period
into one `undefined`. Only some of one of those is recoverable by the person asking.

## Scope / Non-goals

**In scope**
- A typed period choice on `ClarificationNeeded` and a typed period control on a successful data
  answer — two carriers, so a recovery and a settled answer never share one field.
- A deterministic continuation: the chosen period posts as `AskRequest.selection`, which
  `chat.service.ts:146` runs verbatim, skipping the selector entirely.
- A total, first-match-wins failure order across the four collapsed causes, each with its own
  response class and message.
- The period control in **both** semantic domains (human round 1), replacing the answer in place
  (human round 2) without rewriting the asked question (human round 3 of the requirements grill).

**Non-goals**
- Changing which periods the warehouse offers, or the FY-YTD definition.
- Letting a user choose among several granted plants, departments or functions — a new authorized
  selector capability no current data exercises (human round 3 of the spec grill).
- Rendering the measure and dimension chips, or making them editable.
- Showing batch ids in the provenance disclosure (human round 2 of the requirements grill). They
  travel in the response and C8 checks them there.
- `requiredTimeWindowClarify`'s day-range options, wrong for a monthly statement but a different gate.

## Acceptance Criteria
- **C1** A statement question whose period is missing, not among the offered periods, or spanning
  more than one of them returns `ClarificationNeeded` naming the missing part, never `NotSupported`.
- **C2** The clarification carries a typed period choice — the base `Selection` the selector already
  produced, the original question verbatim, and one entry per offered period with a **complete**
  `timeWindow` (`grain`, `column`, `from`, `to`) plus `value` and `label`. The complete window is
  required because a period-less base selection has no `timeWindow` while
  `Selection.timeWindow` (`contract/src/measure.ts:155`) requires a `grain`, so the client would
  otherwise have to invent both that and the time column. Entries contain only periods that can
  answer that question — never a multi-month range for a statement.
- **C3** Choosing an offered period issues **exactly zero** selector calls, proven by a hermetic test
  that counts calls on a fake `LlmProvider`: one for the original question, none for the continuation.
- **C4** The four causes resolve in a fixed, first-match-wins order, each with its own response class
  and message: **scope** (`BlockedByPolicy`, naming the first offending attribute in the order
  department, function, plant, no period options) → **no mapping** (`NotSupported`) → **no periods
  loaded** (`NotSupported`, distinct message) → **period** (`ClarificationNeeded`). The resolver's
  existing mapping-before-period order (`selection-resolver.service.ts:58,67`) is preserved.
- **C5** A successful data answer in either domain carries a period control whose current entry is
  the window the answer ran on; choosing another **replaces that answer in place**, the replacement's
  control shows the new period, and **the asked question is unchanged** — the transcript records
  what the user typed plus the period they chose, never a question they did not write.
- **C6** A successful answer that resolved to no window states it covers all loaded data **within the
  asker's access scope and any filters the question applied** — governed queries inject plant scope
  at `sqlBuilder.ts:88`, so bare "all loaded data" overclaims. Informational, clarification and
  failure responses carry no period control.
- **C7** A replacement in flight leaves the previous answer readable under a pending state; one that
  fails or is refused leaves the previous answer in place with the failure shown against it, never
  blanking it.
- **C8** A re-run's response carries the active batch ids that produced the displayed values. The
  determinism claim is about **selector calls**, not about values being stable across reloads —
  under decision 0028 a rerun re-authorizes and reads the currently active batches.
- **C9** Hermetic tests over a fake provider and warehouse cover the whole matrix, not a sample:
  missing period; a same-day period that is not offered; a partial-month range; a multi-month range;
  an empty period list; each of department, function and plant absent **and** ambiguous; no mapping;
  a successful statement answer; a successful governed answer with a window; a successful governed
  answer with no window; and a failed replacement. Any live-PoC claim names its sample count and no
  live claim rests on a single run (D-0024, D-0031: judged by junit testcase name and executed count).
- **C10** New backend test files are registered in `backend/package.json` and
  `tools/quality-gate.test.mjs`, or CI runs none of them. Any file this story edits that is still in
  `.prettierignore` is formatted and removed from it, with the `ignoredBaselineHashes` entry dropped
  in the same change (D-0006).

## Technical Approach

### The two carriers
`AskResponse` gains one optional `periodChoice` on the clarification path and one optional
`periodControl` on the success path, sharing an entry shape. The existing
`clarify: { options: string[], resumesQuestion }` is untouched — `requiredTimeWindowClarify` and
`domainRoutingAmbiguity` still use it, and this story must not regress them.

### Where the branch lives
`statementRequest` currently answers a boolean question ("can I build a request?"). It becomes a
discriminated result naming *which* precondition failed, so `chat.service.ts:318-338` can map each
to its own class. Period eligibility is computed from `SelectionResolverService.options()` — the
same source as the MIS Reports dropdown (`selection-resolver.service.ts:40`), so Ask and the report
screen can never disagree about which periods exist — filtered to those a statement can resolve.

### The continuation
`AskRequest.selection` already exists and `chat.service.ts:146` already runs it verbatim. The client
clones the base selection with the chosen entry's window. No new route, no new execution path.

### Replace in place
`use-ask.ts:84` appends unconditionally. A rerun carrying a period choice targets an existing turn
index instead, leaving the question string untouched.

## Decisions
No new decisions. The story is governed by **0028** (a rerun re-authorizes and reads current active
batches, so it is not a snapshot), **0016** (scope attributes are provisioned, not user-selectable —
why an ambiguous triple explains rather than offers), **0019** (house style for any touched route),
**0006** (prettier-ignored files are formatted and de-listed by the task that edits them), and
**0024/0031** (proofs judged by junit testcase name and executed count).

The requirements grill flagged the brief's "LLM/data residency: decide later" line as stale:
decision **0027** fixes Bedrock in `ap-south-1` and its data boundary. Corrected, not re-opened.

## Risks
- **The period control doubles the surface.** Human round 1 chose both domains; the governed side
  has no period concept of its own, so C6's no-window wording is the load-bearing part. Mitigated by
  C9 requiring both governed variants explicitly.
- **Replace-in-place can strand a user** if a replacement fails and the old answer is gone. C7 makes
  keeping it a criterion, not an implementation detail.
- **The eligible-period filter could drift from MIS Reports.** Mitigated by reading the same
  `options()` source rather than re-deriving months.

## Verify Plan
`python3 factory/scripts/verify.py` per task. Hermetic backend tests for C1–C4, C8 and the backend
half of C9 over a fake provider and warehouse; frontend tests for C5–C7 and the client half of C9.
The live functional check re-runs the three seed chips plus one recovery flow with a named sample
count, from this worktree against the documented `WAREHOUSE_PG_*` env.

## Surface Impact
`contract/src/api.ts` (two optional response fields, one shared entry type);
`backend/src/chat/chat.service.ts` (`statementRequest` result type, the four-way branch, period
eligibility); `backend/src/mapping/selection-resolver.service.ts` (read-only use of `options()`);
`frontend/src/features/assistant/ask-panel.tsx` (period choice buttons, period control, no-window
copy); `frontend/src/features/assistant/use-ask.ts` (targeted replace); `frontend/app/globals.css`.

## Task Decomposition
Sequential; each leaf is single-runtime with explicit dependencies.

1. **`ask-period-contract-and-branch`** (backend, `user_facing: false`) — C1, C2, C4, C8, C9(backend),
   C10. The shared entry type and the two optional response fields; `statementRequest` becomes a
   discriminated result; the four-way branch with its own class and message per cause; eligible-period
   filtering from `options()`. Depends on nothing. **Ships the recoverable clarification on its own.**
2. **`ask-period-continuation`** (frontend, `user_facing: true`) — C3, C5(clarification half), C7,
   C9(client half). Render the typed period choice, clone the base selection with the chosen window,
   post it as `AskRequest.selection`, and hold the previous answer through pending and failure.
   Depends on task 1.
3. **`ask-period-control-on-answers`** (frontend, `user_facing: true`) — C5(success half), C6.
   The period control on successful answers in both domains, replace-in-place against the existing
   turn without rewriting the question, and the no-window coverage copy. Depends on task 2.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
