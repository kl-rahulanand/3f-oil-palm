# Cold-read grill — gate: plan — plan draft gj-plan.md

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
- Q: governed-joins requirements grill (Finding 1 — the foundational one): mis_budget has NO plant and its cost_center is the MIS 'Budget Components' label, not a SAP cost center, so it can't join Actuals on Plant+CostCenter+GL+month. Decision 0014 deferred the Budget-label→cost-center mapping master to THIS story. How should the Budget⋈Actual join key be defined for the PoC?
  A: PoC-join on GL + month, single plant DUB (Rec.)
- Q: governed-joins RBAC (Finding 4): the spec says inject the row-scope predicate on BOTH objects for the full-outer join. For this PoC, what is the read-side RBAC model — which determines whether asymmetric one-sided visibility (user can see Actual but not Budget for a key) can even occur and needs a concrete zero-fill-vs-conceal policy + denial fixtures?
  A: Role-based all-or-nothing (Rec.)

## The artifact under interrogation (plan draft gj-plan.md)

# Story plan — governed-joins: Financial semantic layer + governed joins

Story: governed-joins · Epic: data-foundation · user_facing: false (a backend
capability the report / drill-down / assistant stories consume)

## Problem
3F needs `% = Actual ÷ Budget` where Actual (SAP) and Budget (MIS plan) are
separate, independently-revised objects. Decision 0004 requires ONE governed
semantic layer that composes measures across those objects so the report,
drill-down, and assistant read one source of truth with Pulse's trust guarantees.
Today none of that machinery is populated: the code-authored measure domains are
empty (`backend/src/semantic/semanticLayer.ts:11` `baseDomains = []`), and the SQL
builder explicitly **rejects** cross-object composition
(`backend/src/sql/sqlBuilder.ts:29-32` throws "cross-object composition not
implemented in scaffold"). sap-ingestion landed the two objects
(`actual_by_key_month`, `mis_budget`) but deferred the Budget↔Actual bridge here.

## Scope / Non-goals
**In scope:** a code-authored governed financial domain with **Actual, Budget, %**
measures; an **active-budget rollup** so retained batches never double-count; a
**code-composed, validated full-outer, zero-filled Budget⋈Actual join** on
`(gl_code, month)` within the single plant DUB; **role-based** RBAC with the scope
predicate injected on both objects; **golden-answer fixtures** proving no fan-out;
and **provenance** that carries both active source batch ids + per-row
source-presence. One governed definition, shared by all three consumers.

**Non-goals (deferred, per decision 0016 / 0014):** the Budget-label → SAP
cost-centre + plant **mapping master** and balanced allocation; the **Roll-over**
measure (pending Srihari's rule); multi-plant / cost-centre-grain reporting;
any **LLM- or user-authored joins** (the LLM only *selects* measures); and the
report / drill-down / assistant **UI** (their own stories consume this layer).

## Acceptance Criteria
1. A code-authored governed financial domain exposes **Actual**, **Budget**, and
   **%** measures over the ingested objects; Actual = `SUM(Debit − Credit)` and
   Budget = `SUM(budget_amount)`, each read from its **active** batch only, and
   `%` follows the settled nil rule (`0/0` → NA/blank; `Actual>0, Budget=0` →
   over-budget, no percentage). The LLM/runtime never authors the SQL.
2. Budget⋈Actual composes as a **code-composed, validated full-outer join** on
   `(gl_code, month)` within DUB that **zero-fills the missing side** (a
   budget-only key and an actual-only key both appear), with **no fan-out /
   double-counting**, proven by a golden-answer fixture whose cases (matched,
   Budget-only, Actual-only, duplicate/multi-line, reload/active-swap, %-edges)
   each assert **exact** expected values.
3. **RBAC** is role-based all-or-nothing (a domain/measure/action grant check),
   with the row-scope predicate injected on **both** objects of the join; no
   cross-object leak, and a denial case is covered.
4. **Provenance** for every governed number carries the measure definition + the
   composed SQL **plus** the two active source batch ids (actuals + budget) and the
   per-row source-presence (matched / budget-only / actual-only), so a reload's
   changed answer is attributable to a batch swap, not silent drift.

## Technical Approach
- **Active-budget rollup** (mirrors `actual_by_key_month`,
  `warehouse-schema.ts:117-134`): a `budget_by_key_month` view —
  `SUM(budget_amount)::numeric(18,2) AS budget_net` (and rollover carried but
  unpopulated) `FROM mis_budget b JOIN ingest_batch bt ON bt.id=b.batch_id WHERE
  bt.source_kind='budget' AND bt.is_active GROUP BY b.gl_code, b.period` — the
  budget month column is `period`, aliased to `month` to conform to Actual's key;
  plant `DUB` is a constant literal (mis_budget has no plant column).
- **Governed domain + measures** authored **in code** in
  `semanticLayer.ts` `baseDomains` as a `DomainSpec` whose `goldObject` is the
  composed join (below): `MeasureSpec`s Actual (`expr: SUM(actual_net)` /
  `SUM(debit-credit)`), Budget (`SUM(budget_net)`), and `%` (`format: "percent"`,
  a code-authored ratio expression guarding divide-by-zero per the nil rule) —
  two-column expressions are expressible on the code-authored path (the
  DB-authored compiler cannot do `SUM(a−b)`, so this must be code-authored).
- **Code-composed join**: extend the builder (or add a composed-object provider)
  so a governed financial `goldObject` resolves to a **full-outer join** of
  `actual_by_key_month` (filtered `plant='DUB'`) and `budget_by_key_month` on
  `(gl_code, month)`, `COALESCE`-zero-filling each side. The join is emitted by
  code (never the LLM), and `sqlValidator` (join-agnostic) allows it because both
  tables are allow-listed in `objectsTouched`.
- **RBAC**: role-based grant check via `SemanticLayer.allowedFor(perms)` +
  `RequireAction`; the scope predicate (`sqlBuilder.ts:52-59`) is injected on both
  sides of the composed join for defense-in-depth (plant scope enforced on the
  Actual side / at the join layer, since `mis_budget` has no plant).
- **Provenance**: extend the `Provenance` contract (`contract/src/api.ts:251-261`)
  and its construction (`chat.service.ts:377-394`) with `activeBatchIds`
  (actuals + budget) and per-row `sourcePresence`.
- **Golden fixtures**: a `WAREHOUSE_DB_TEST=1` gated test seeds known active
  actual + budget batches and asserts the composed % / zero-fill / no-fan-out /
  reload-swap / %-edges against exact values — **demonstrated host evidence
  (D-0008)** run via a dedicated flag-setting script, committed reviewer-visible.

## Decisions
- **0002** — Financial MIS; Actual = `Σ(Debit − Credit)` per key per period.
- **0004** — governed joins: correct join semantics, RBAC across both objects,
  validator support, golden fixtures, one shared definition (no split-brain).
- **0009** — required_tests name real leaves + pin `TS_NODE_PROJECT`.
- **0014** — sap-ingestion PoC: no mapping master (the deferral this story owns).
- **0015** — warehouse snake_case (the new rollup view conforms).
- **0016** — governed-joins PoC scope: join on `gl_code + month` within DUB;
  Budget-Components label informational; mapping master + roll-over + row-scoping
  deferred; role-based RBAC; the settled %-nil rule.
- **D-0008** — the golden-fixture warehouse proof is demonstrated host evidence.

## Task Decomposition (capability-driven; sequential unless noted)
1. **budget-rollup** — the active-budget gold rollup `budget_by_key_month` in the
   warehouse (view + migration, mirrors `actual_by_key_month`); hermetic schema
   test + a gated D-0008 proof that it reflects only the active budget batch.
2. **governed-domain** — the code-authored financial `DomainSpec` + Actual /
   Budget / % `MeasureSpec`s in `baseDomains`, with the %-nil semantics and
   allow-list/validator wiring; hermetic semantic-layer tests.
3. **composed-join** — the code-composed, validated full-outer zero-filled
   Budget⋈Actual join on `(gl_code, month)` in the builder/executor, RBAC injected
   on both sides; hermetic builder/validator tests + a gated D-0008 proof of
   correct zero-fill and no fan-out.
4. **golden-provenance** — the golden-answer reconciliation fixtures (matched /
   Budget-only / Actual-only / duplicate-no-fan-out / reload / %-edges, exact
   values, gated D-0008) **and** the provenance lineage (both active batch ids +
   per-row source-presence) that makes each number reproducible.

## Risks
- The composed join is **new SQL-builder surface** (today it throws); the primary
  risk is fan-out / double-counting if a key is not 1:1 — mitigated by joining the
  two **active rollups** (each already one row per key) and the golden fixtures.
- `%` divide-by-zero must match the statement spec **exactly** or report and
  assistant disagree; covered by %-edge golden cases.
- Provenance reproducibility across a budget reload (active-batch swap) — covered
  by the reload golden case + committed active batch ids.

## Surface Impact
- **Data:** a new `budget_by_key_month` **view** + its migration (warehouse; a
  read-only rollup, no new base table). No change to `sap_transaction` /
  `mis_budget` / actuals.
- **API/backend:** `semanticLayer.ts` (baseDomains), `sqlBuilder.ts` /
  `selectionExecutor.ts` (composed join), `sqlValidator` allow-list, `rbac` /
  auth guard wiring, `contract/src/api.ts` + `chat.service.ts` (provenance). No
  new endpoint (the report / drill-down / assistant stories add their routes).
- **Ops/docs/tests:** golden-fixture gated D-0008 proof + hermetic suites; decision
  0016; this plan.

## Verify Plan
Hermetic: `build:contract`, `build:backend`, `typecheck`, `lint`, `format:check`,
`test:hermetic`. Demonstrated host evidence (D-0008) against docker `warehouse-db`
(127.0.0.1:5433, `WAREHOUSE_PG_*`): the active-budget rollup proof and the
golden-answer join/zero-fill/no-fan-out/reload/%-edge proof, each via a dedicated
`WAREHOUSE_DB_TEST=1` flag-setting runnable script, loopback-host guarded,
committed reviewer-visible with a dead-port negative control (per the
sap-ingestion D-0008 lessons).

## Implementation Assumptions
- The governed financial domain's `goldObject` is the code-composed join result
  (not a persisted view); if a persisted joined view proves cleaner, that is a
  task-level call recorded in the task plan.
- Roll-over columns are carried through the rollup/measures but left unpopulated
  (deferred); the `%` measure and Actual/Budget are the shipped set.
- The report/drill-down/assistant consume this layer; their selection surfaces and
  any k-suppression tuning are their stories, not this one.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
