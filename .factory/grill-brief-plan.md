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
- Q: Actuals uploads replace the whole month. With 31 plants that is safe only if every SAP export is company-wide. What should happen when a later upload for a month is missing plants that the current active batch has, or contains a plant the master does not know?
  A: Activate and report (Recommended)
- Q: Three new decision records support this plan: 0030 (the format outline is its own ingest object; plant-keyed budget batches; drift reported per 0023, never blocked), 0031 (the master is generated by a committed script from the client's mapping sheet plus a plant classification table), 0032 (Ask clarifications resume a selection through a typed continuation, starting with plantChoice). Accept all three, confirmed by Rahul Anand?
  A: Accept all three (Recommended)
- Q: The plan assumed a docked Ask question could use the on-screen report's plant, but the rendered MIS Report passes nothing to the Ask panel, and the existing grounding only accepts a saved report ID (MIS Reports has none). How should the docked assistant learn which statement it sits beside?
  A: Send the statement scope (Recommended)
- Q: The options API returns independent department, function and plant lists, and the UI renders four independent selects, so with 31 plants a user could pick an impossible combination such as Corporate / Office / DUB. Which contract should the plan adopt?
  A: Return valid tuples, cascade client-side (Recommended)

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
  - 0031-master-generated-from-workbook
  - 0033-poc-budget-owner-plant
  - 0035-all-plants-scope-for-the-poc
  - 0036-ask-untouched-in-multi-plant
---

# Plan — multi-plant: All plants in the MIS statement

Story: `multi-plant` (roadmap 9, epic reporting) · spec: `docs/specs/all-plants-statement.md`
(confirmed 2026-09-15, re-scoped twice the same day at the human's request). This is the
**third** saved version: the six-task plan was approved and then cut, first to four tasks, then
to the minimum the human named — "for other plants show `–` on Budget and %, everything else
stays as it is". Decisions 0035, 0033 and 0036 supersede 0029, 0030 and 0032/0034; the roadmap
item's acceptance criteria were reduced in the same change.

## Problem
The shipped statement offers exactly one selection, Agriculture / Nursery / DUB, for two
reasons that matter at this scope, each verified by reading the file:

1. `backend/src/mapping/mis-mapping-master.ts` holds one selection and the 28
   cost-centre-plus-GL pairs DUB used in July; the client's mapping sheet has 95 pairs and
   the July extract has 31 plants, all already ingested and retained.
2. The budget batch is global per month with no plant on it (`mis_budget` has no plant
   column; `warehouse-schema.ts:43`), so a statement for any other plant would silently show
   DUB's nursery budget and percentages beside that plant's actuals.

The plant dropdown already renders whatever the master offers (`selection-resolver.service.ts:35`),
so exposing 31 plants is master data. The only code the scope needs is the rule that keeps
DUB's budget off every other plant's statement.

## Scope / Non-goals

**In scope**
- A generated master covering every SAP plant in the July extract (0031): the full mapping
  sheet applied per plant, bucket rows for the eleven unnamed pairs, provisional Department /
  Function labels from the classification table, and the format's budget owner (`DUB`).
- The not-loaded budget state for non-owner plants in the statement response and the Excel
  export, rendered as `–` with a label on screen (0033, 0035).
- The demo admin granted every plant in the master.

**Non-goals (deferred with decision 0033's trigger, and decision 0036)**
- Everything assistant-side: the plant dimension, grounding from the docked report, plant
  named in the question, the typed plant choice. Ask is untouched; a fully granted user gets
  "not supported" for statement questions in Ask (0036 says so plainly).
- Plant-keyed budget batches, the outline object, the `plant` upload field, the
  partial-FY-YTD rule, cascading selection tuples, upload plant reporting, the master-version
  pin (D-0038), audit on the statement route (D-0036).
- A trimmed office or mill format; Table-1 and Table-3; roll-over; live SAP; a master editor.

## Acceptance Criteria
- **C1** Against the pinned July actuals batch, all 31 SAP plant codes are offered to a fully
  granted user, each renders a statement, and the 31 Grand Total Actuals sum to
  ₹11,02,73,718.00 in exact paise. Proven by a gated warehouse fixture over the client
  extract, run per plant.
- **C2** DUB is unchanged: Actual ₹1,15,12,712.07 and Budget ₹1,00,50,136.29 for July 2026,
  every parent footing, `unmapped-GL` carrying its own Actual, the export matching; the
  existing statement-projection and golden proofs keep passing.
- **C3** Every `(plant, cost centre, GL)` triple in the July extract resolves exactly once via
  the generated master (version 3); classification is a pure function of the committed table
  and the extract's cost centres (fourteen July nursery codes, `H.O` Corporate / Office, the
  rest Operations / Unit); the eleven unnamed pairs resolve to `unmapped-GL` with reason "not
  in the mapping sheet"; DUB's nine bucket rows keep their reasons; every new row is
  provisional with a reason; a hermetic test proves the checked-in master equals the
  generator's output; the format names `DUB` as budget owner and a format without an owner
  fails validation. The validator's duplicate-pair rule (`mapping-master.ts:100`) is re-keyed
  to `(plant_canonical, cost_center, gl_code)`, since the same 95 pairs recur per plant.
- **C4** A non-owner plant's statement carries `budgetState: "not-loaded"` on every block;
  its Budget, Roll-over and % are null on every row including the Grand Total; no over-budget
  or credit label is computed; the Excel export writes `–` in those cells with a "Budget not
  loaded for this plant" note and names the plant in its filename. H.O renders 100% of its
  July net inside sections 8 Manpower and 9 Admin and ₹0 Actual on every nursery-only
  section. DUB carries `budgetState: "loaded"` and its cells are byte-for-byte unchanged.
- **C5** On screen, a not-loaded block renders `–` with the accessible label "Budget not
  loaded for this plant" in Budget, Roll-over and % on every row including the Grand Total,
  with no drill affordance on those cells; Actual cells stay drillable and unchanged.
- **C6** `MisSelectionScopeReadout` gains `provisional: boolean` and `plantDisplay`; the plant
  option labels and the statement header show a visible "provisional" mark for every non-DUB
  selection.
- **C7** Drill-down foots in exact paise for a leaf and for the `unmapped-GL` line of a
  non-owner plant with the shipped pin contract; the drill code is not edited.
- **C8** The seeder grants the admin every canonical plant in the master; a user granted only
  DUB sees only DUB in options and drill with no row leaking; the assistant's hermetic suite
  passes unchanged (0036).
- **C9** The two zero states and the three nil states stay distinct from the not-loaded state
  in hermetic tests; every proof is judged by junit testcase name and executed count
  (D-0024, D-0031); new test files are registered in `backend/package.json` and
  `tools/quality-gate.test.mjs`. No D-0006-listed file is edited (`.prettierignore` checked:
  `mis-statement.service.ts`, `mis-statement-export.service.ts`, `migrate.ts`,
  `mapping-master.ts` and the statement view are not listed).

## Technical Approach

### The master is generated, not typed (0031)
`tools/generate-mapping-master.mjs` reads Sheet1 and the SAP Report of
`docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx`, the Table-2 outline of
`Nursery MIS Format.xlsx` through the budget parser's outline and stable-leaf-key logic
(extracted into a shared `backend/src/ingest/mis-format-outline.ts` so generator and parser
cannot disagree), and a committed `backend/src/mapping/plant-classification.ts` (SAP code →
canonical id, display, department, function, nursery flag, provisional). It emits one selection
per plant: `plant_canonical` = SAP code (DUB keeps `DUB` + alias `DUB-NUR`),
`mis_format: "nursery-mis-financial-v1"`, `budget_gl_codes` = the format's leaf GL codes, the 95
sheet pairs as `leaf` targets resolved to stable leaf keys (a GL under several S.No rows is
disambiguated by the sheet's cost centre → section rule as the shipped master did; an entry that
cannot resolve to exactly one leaf is refused), plus a `bucket` entry for every pair the SAP
Report books for that plant and the sheet does not name. DUB's nine bucket rows and reasons are
carried from the classification table. The master schema gains `provisional_labels` on the
selection and a `formats` map naming `budget_owner_plant`; validation re-keys the duplicate-pair
guard per plant and refuses a format without an owner.

### Budget owner and the not-loaded state (0033)
`MisStatementService` asks the master for the format's owner; when the selection's plant is not
the owner, every block's `budgetState` is `"not-loaded"`, Budget and Roll-over are null, % is
null, and the over-budget / credit labels are not computed. `MisStatementRunResponse` gains
`budgetState` per block and `provisional` + `plantDisplay` on the scope readout. The projection
SQL is unchanged: the full-outer join still runs and the service discards the budget side for
non-owners, so row structure, zero-fill and DUB's output stay identical. The export writes `–`,
a note row, and the plant in its filename. Drill pins are unchanged: the active budget batch
still supplies the outline for every plant. `migrate.ts` seeds the admin's plant scope from the
master's canonical ids; it keeps `department` / `function` scope as today.

### The screen (frontend task)
`statement-view.tsx` renders a null Budget / Roll-over / % as `–` with the accessible label,
gives those cells no button and no pointer affordance, and shows the provisional mark from the
scope readout in the header; the plant option labels carry the mark from the options response.
No Ask surface changes.

### What stays exactly as built
Ingestion and the batch model; one governed path (0017); parents derived (0020); the statement
projection (0022); the drill (0024, 0025); the assistant (0036); the two zero states; the
statement and export routes un-audited (D-0036).

## Decisions
- `docs/decisions/0035-all-plants-scope-for-the-poc.md` — supersedes 0029; restates the product
  call with the PoC budget rule and the assistant left untouched.
- `docs/decisions/0031-master-generated-from-workbook.md` — accepted; generator plus
  classification table. Rejected: hand-authoring ~3,000 entries; a runtime master (0014).
- `docs/decisions/0033-poc-budget-owner-plant.md` — supersedes 0030. Rejected: plant-keyed
  batches and an outline object for a budget that does not exist.
- `docs/decisions/0036-ask-untouched-in-multi-plant.md` — supersedes 0034. Rejected: any
  assistant work in this story; the demo cost is stated in the record.
- Tooling: no new dependency; `exceljs` reads the workbooks; the generator is a Node script under
  `tools/`. No migration of any kind.
- Contradicted lesson, deliberately: none.

## Surface Impact
| Surface | Change | Owning task |
| --- | --- | --- |
| Mapping master constant + generator + classification table + shared outline helper | **New / Changed** — 31 selections, version 3, budget owner, per-plant duplicate guard | 1 |
| `GET /api/mis/options` | **Changed** — 31 plants with provisional display labels; shape unchanged | 1 |
| Statement service, DTOs, Swagger, export | **Changed** — `budgetState`, provisional scope readout, dash export, plant in filename | 1 |
| App-DB seed (`migrate.ts`) | **Changed** — admin granted every plant | 1 |
| `backend/package.json`, `tools/quality-gate.test.mjs` | **Changed** — new test registration | 1 |
| Statement view + options labels | **Changed** — dash cells with label, no drill affordance, provisional mark | 2 |
| Drill service, pins, audit; ingestion; batch model; warehouse schema | **Unchanged by design** — 0033, 0035 | — |
| Assistant (chat, semantic layer, SQL builder, Ask panel) | **Unchanged by design** — 0036 | — |
| `plans/roadmap.json` item `multi-plant` | **Changed** — acceptance criteria reduced (PR edit) | — |
| Deferred set (plant-keyed budgets, outline object, upload field, partial-YTD, cascade, upload reporting, D-0038, plant-aware Ask) | **Deferred** — decision 0033's trigger; 0036 | — |

## Task Decomposition
Two leaves, the minimum the harness allows (backend and frontend never share a task).

1. **`all-plants-backend`** (backend, `user_facing: false`) — C1, C2, C3, C4, C6(server), C7,
   C8, C9. The generator, classification table, shared outline helper, regenerated master with
   owner and re-keyed validator, the drift / exactly-once / classification fixtures, the
   budget-owner rule and `budgetState` in the statement service and DTOs, the export dash and
   filename, the seeded grants, the 31-plant reconciliation fixture, the DUB regression,
   controller and export tests. Depends on nothing.
2. **`all-plants-statement-ui`** (frontend, `user_facing: true`) — C5, C6(client). Dash cells
   with the accessible label and no drill affordance, the provisional mark on header and
   options. Depends on task 1.

## Risks
- **Task 1 is one session by design.** It spans the generator, the master and the statement
  service, all backend. If the task grill judges it unbounded, the split is the generator plus
  master first and the statement rule second — still no assistant work.
- **Leaf-key resolution for the 95 sheet pairs.** A GL under several S.No rows (50001201 under
  1.1, 2.1, 10.1, 11.1) must resolve by the cost centre → section rule; the exactly-once fixture
  proves it.
- **Demo-visible Ask cost.** A fully granted user cannot ask statement questions in Ask until
  the follow-up; 0036 names the second-user workaround.
- **Provisional labels on screen.** The mark must read as "awaiting the client's names", not as
  an error; the functional check on task 2 covers the copy.

## Verify Plan
- **Hermetic backend** — `mapping-master.test.ts` (31 selections; generator equals checked-in
  file; exactly-once and classification over the July extract; owner required; per-plant
  duplicate guard), `selection-resolver.service.test.ts` (options labels),
  `mis-statement.service.test.ts` (`budgetState`, non-owner discard, DUB unchanged, states
  distinct), `mis-statement-export.test.ts` (dash, note, filename),
  `mis-statement.controller.test.ts`, `mis-selection.controller.test.ts`, `swagger.test.ts`,
  `migrate.trim.test.ts` (seed), `app.routes.test.ts` unchanged; the chat suite unchanged.
- **Gated DB proofs (`test:db` / `test:warehouse-proof`, D-0008)** — new
  `all-plants-reconciliation.db.test.ts` (31 statements sum to ₹11,02,73,718.00);
  `statement-projection.db.test.ts` and `golden-financial.db.test.ts` unchanged and green;
  `drill-transactions.db.test.ts` extended for a non-owner leaf and `unmapped-GL`.
- **Frontend (vitest)** — dash cells and label, no pointer affordance on dashed cells,
  provisional mark.
- **Functional (task 2)** — live: generate H.O, CK and DUB statements; drill an H.O leaf;
  export H.O; confirm DUB is unchanged.
- Commands: `npm run typecheck`, `npm run quality`, `npm run test:hermetic`, `npm run test:db`,
  `npm -w @3f/backend run test:warehouse-proof`; every artifact records the executed count and
  testcase name.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
