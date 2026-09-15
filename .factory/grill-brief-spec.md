# Cold-read grill — gate: spec — spec ask-period-control.md

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
- Q: **Correction to what I told you.** When I asked about the freshness pill I said the data already exists and just needs exposing. That was wrong. `postgres.adapter.ts:56` returns `null` when no freshness column is supplied, and **no domain declares one** — `grep -c freshnessColumn` in the semantic layer is **0**. So freshness is `null` everywhere today, and `dataAsOf` in answer provenance has always been null too. The grill also found there is no single truth to show: actuals and budget arrive as **separate ingest batches** with their own timestamps, so one pill cannot honestly imply one number without a rule. Wiring it means *defining* freshness first — bigger than the route-plus-render job I described.
  A: Define it from ingest batches, show the oldest (Recommended)
- Q: Closing the requirements grill for `poc-responsiveness`. The cold read returned **NOT CONVERGED** with two blockers and six under-specifications, and I've resolved them: a new spec `assistant-responsiveness.md` now contracts this story (it didn't exist — the story's requirements lived only in the roadmap item, so a plan could have satisfied the old spec and built none of it), and the assistant spec's stale "NOT wired in, this story owns wiring it" paragraph is marked **DELIVERED** so nobody re-creates shipped routes, migration and UI. Your freshness call is in. I also pinned the things the grill said were unfalsifiable: the retry is scoped to a selector call with **no tool block only**, at most **two calls total**, never on the deterministic smalltalk/definition/refusal paths (routing precedes selection), and never repeats a governed query; streaming specifies phase order, **no flicker** for answers that resolve without a model call, terminal errors through the existing renderer, and cancel-on-leave; "fills its column" means desktop full height with the thread scrolling inside, mobile stacking unchanged. Any gap before I write the plan?
  A: No gaps — write the plan (Recommended)
- Q: Closing the spec grill for `assistant-responsiveness`. The cold read returned NOT CONVERGED with seven findings and caught **two factual errors in my own spec**, which I've now corrected: I claimed the server never bounds prior turns (it does — `trimPriorTurnsToTokenBudget` at `chat.service.ts:675`), and I'd written that turns should be kept "most-recent-first", which would have reversed transport order and made `priorTurns.at(-1)` select the wrong turn. The rewritten spec leads with the measured root cause instead: **no `maxTokens` on the Converse call** — 214,222ms/24,313 tokens uncapped versus 1,429ms/168 tokens at `maxTokens: 2048`, stopping at `tool_use` rather than truncating. Also fixed from the read: the `routing` phase is emitted *before* the deterministic classifiers, so "no flicker" is now a client render-delay rule rather than a false claim; cancellation must actually abort the model and query work (today nothing does); `priorTurns` has no array bound in the schema; and freshness is defined as **load freshness** — oldest `uploaded_at_utc` across active batches, labelled as load time — because active batches are unique per source *and period*, so a September upload of July data must not read as "data as of September".
  A: Record the pass and plan it (Recommended)
- Q: One more round purely to close the **requirements** gate — the harness consumes each ledgered answer against a single gate, and I spent the earlier ones on the spec gate, so this needs its own. Nothing new to decide; confirming the record before I write the plan. What it will state: the story had no contracting spec (its requirements lived only in the roadmap item), now fixed by `assistant-responsiveness.md`, which is confirmed and linked — spec debt cleared. The assistant spec's stale "this story owns wiring it" paragraph is marked DELIVERED so the shipped routes, migration and UI can't be re-created. Your freshness decision is recorded, along with the correction that I first put it to you on a false premise. And the root cause is the measured one: no `maxTokens` on the Converse call, 214,222ms → 1,429ms.
  A: Record it and write the plan (Recommended)
- Q: **How far should cancellation go?** The grill found I promised it without a viable seam. Today: the stream controller observes no client disconnect, the LLM port takes no abort signal, and warehouse queries are bounded by Postgres `statement_timeout` (`postgres.adapter.ts:90`, error 57014) plus a `Promise.race` — a timeout, not a cancellation. Truly stopping an in-flight query means issuing `pg_cancel_backend` from a second connection, which is real design work for a polish story.
  A: Bounded: stop the model call and the stream, let the query expire (Recommended)
- Q: **Freshness is now a whole endpoint, not a wire-up.** The grill found the shell cannot consume a cross-source batch minimum without a new authenticated route with typed DTOs, Swagger contracts, allow-list registration, a client fetch/cache policy and tests — and the freshness port would need implementing or deliberately stubbing across **three** warehouse adapters (postgres, starrocks, starrocks-mysql). Plus `postgres.adapter.ts` is in `.prettierignore`, so D-0006 formatting comes with it. That is a bigger task than the latency fix you actually reported.
  A: Keep it, as its own task (Recommended)
- Q: Closing the plan grill. Eleven findings, all verified and folded in. The substantive ones: the plan wasn't saveable without frontmatter attesting all **28** active decisions; my task split put controller disconnect and query cancellation inside a task labelled *frontend*, so it's now **five single-runtime leaves** with explicit dependencies; and three limits I'd left silent are now named — `maxTokens: 2048`, `priorTurns` capped at 8 entries / 16,000 serialized chars / 2,000 chars per question, and a follow-up under **5s** in the live check. The retry moved **inside the provider boundary** so "no repeated governed query" is structural rather than promised, with a `no_tool_block` discriminant so it can't retry a genuine refusal. Your two calls are in: cancellation is bounded (model and stream stop; an in-flight query expires under `statement_timeout`, and the code says so), and freshness is its own backend task with the route, DTOs, allow-list and a deliberate *unavailable* on both starrocks adapters. D-0006 formatting for the two prettier-ignored files is now an explicit criterion rather than a surprise.
  A: Record the pass and board it (Recommended)
- Q: **How many tasks?** My plan proposed five after the grill forced backend and frontend apart, but the harness asks for the fewest that stay bounded — every extra task costs you a plan, a grill, an approval, a review and a PR. The work is: (a) backend LLM — `maxTokens`, the `no_tool_block` discriminant, provider-boundary retry, schema limits, abort signal, controller disconnect; (b) backend freshness — the port, three adapters, the new authenticated route, gated DB proof; (c) frontend — stream client with SSE parsing, render delay, cancel-on-leave, transport parity, plus the pill and the one-line dock fix. Task (a) alone fixes the slowness you reported.
  A: Three (Recommended)
- Q: **The confirmed spec now contradicts your cancellation decision.** `docs/specs/assistant-responsiveness.md:143` says cancellation must reach the query work and that the proof must demonstrate "model and query cancellation" — I wrote that *before* you chose bounded cancellation (model and stream stop; an in-flight query expires under `statement_timeout`). A future implementer reading the spec would build `pg_cancel_backend`. Amending a confirmed spec means another cold read and re-confirm, which is why I'm asking rather than just spending it. (Separately, the approved plan lists five tasks while the recorded decomposition has the three you chose — your choice is the later authority, so I'll record that supersession in the contract without re-opening the plan.)
  A: Amend and re-confirm the spec now (Recommended)
- Q: Closing the spec re-grill. It found a file I corrupted: re-saving a spec that already had frontmatter left **two header blocks** in each of the two specs I amended — the parser reads only the first, so digests were reviewing mixed revisions. Both are fixed. Six substantive findings are folded in, three of which would have shipped bugs: the **retry's second attempt was pointless as specified** (repeating an identical capped, temperature-zero request reproduces the same tool-less result, so attempt two now raises the cap); **"don't start a query once aborted" had no seam** (`SelectionExecutor.run` awaits `explain()` before `execute()`, so the abort must be checked immediately before the query starts); and **freshness conflated two truths** — the shell's global minimum is not the same as one answer's `provenance.dataAsOf`, and giving an answer the global value would let an unrelated stale batch make a fresh answer look old. The settled numbers (`maxTokens: 2048`, 8 turns / 16,000 chars / 2,000 per question, 250 ms, under 5s) are now in the spec rather than only the plan.
  A: Record, confirm, and board task 1 (Recommended)
- Q: Closing the task grill for `assistant-bounded-generation`. All nine findings verified and folded in — four would have shipped bugs. The port literally couldn't express the contract (`LlmSelectionOutcome` has no backend-error arm, and `chat.service.ts:177` treats anything that isn't clarify/unsupported as a *selection*), `!toolUse?.name` conflates an **absent** tool block with a **malformed** one so the retry could fire on exactly the case it must not, the retry as specified was a **no-op** (temperature 0, so repeating an identical capped request reproduces the same result — attempt two now raises the cap), and `request.on("close")` would have aborted **healthy** SSE requests because Node emits it on normal completion too. Also corrected: the abort must reach `send()` (the real seam passes no options, so a fake would false-green), a query must not *start* after an abort (`explain()` is awaited before `execute()`), D-0006 covers **four** prettier-ignored files rather than one, and two of my manual checks were impossible — `latency_ms`/`output_tokens` live in `audit_events`, not the log. Required leaves 6→8, scope 15→17 paths.
  A: No gaps — board it (Recommended)
- Q: **Should this task touch `provenance.dataAsOf` at all?** The grill found my "answer-scoped freshness" isn't implementable as written, and that it would mislabel existing UI. Two problems: both governed domains combine **Actuals and Budget**, and `chat.service.ts:426` passes only a `DomainSpec`, so "the answer's own source" is undefined for a percentage answer that uses both. And `dataAsOf` is already rendered to users as **"Data as of"** — data currency — while this task would fill it with **load** time; the report path uses the same null-producing helper, so relabelling means touching consumers beyond this task.
  A: Defer dataAsOf — ship only the shell route (Recommended)
- Q: Closing the `shell-freshness-api` grill. Nine findings, all verified, and three would have stopped the work dead. **Fourteen** files implement the `Warehouse` interface — mostly typed test fakes outside this scope — so a required new method would have failed typecheck before any behaviour existed; it's now optional. (I'd also named the interface `WarehouseAdapter`; it's `Warehouse`.) The **gated DB proof would have skipped**: a bare `junit-run` without `WAREHOUSE_DB_TEST=1` skips and `stage done` rejects a skipped leaf — it now runs under `test:warehouse-proof`, which sets the flag. And **the route had no name**, which the exact-match allow-list and task 3 both need — it's `GET /api/warehouse/freshness` with a discriminated body keeping five states apart rather than collapsing to null. Your `dataAsOf` call is recorded as **D-0041**. Also folded in: D-0006 covers all three adapters, the DB proof must assert per-source values *and* the overall minimum across several active periods, and the allow-list leaf must prove the guard set and typed Swagger responses rather than mere presence.
  A: No gaps — board it (Recommended)
- Q: **Where does "leaving the assistant" begin?** The `AskProvider` lives in the persistent authenticated shell, so the panel unmounting can't own cancellation — something has to define the boundary.
  A: Abort only when leaving /ask and /mis-reports (Recommended)
- Q: **What exactly does the freshness pill say?** The route distinguishes five server states, but nothing yet defines the visible copy, the timezone, or what happens when the *browser* fetch fails as opposed to the server reporting `lookup-failed`.
  A: Distinct copy per state, explicit timezone, separate 'could not check' (Recommended)
- Q: **How should the dock geometry be proven?** My contract promised a vitest leaf, but jsdom doesn't do layout — it cannot calculate flex sizing, so such a test would assert CSS source text and prove nothing about what a user sees.
  A: Prove it in the live functional check (Recommended)
- Q: **Which selector cap is governed, and what happens to the stale spec?** The confirmed spec still says `maxTokens: 2048` with a sub-5s live check, but task 1 shipped **512** after repeated measurement showed 2048 reaching 19.3s. The spec also still requires populating `provenance.dataAsOf`, which you deferred as **D-0041**. Amending a confirmed spec means another cold read and re-confirm — the third time this story.
  A: 512 governs; amend and re-confirm the spec (Recommended)
- Q: Closing the third spec grill. Seven findings: four were my amendment being **incomplete** — I replaced the Behaviour prose but left the stale acceptance criteria, so the spec still demanded `dataAsOf` be populated and still didn't name the five pill states, the `/ask` + `/mis-reports` boundary, or the retry's raised cap and summed usage. All now fixed. **Two were real gaps in already-merged code**, which I've recorded as deferrals rather than silently absorbing into a frontend-only task: **D-0042** — `postgres.adapter.ts` returns `available` when *either* source has an active batch, so the pill could show Budget's load time while Actuals has none, reading as "the data is this fresh" when half is missing; and **D-0043** — `chat.service.ts:170` starts `distinctValues` warehouse reads before checking the abort, so an abandoned stream can still start a pre-selection query, a hole in the promise task 1 made.
  A: Record, confirm, and board task 3 (Recommended)
- Q: Closing the `assistant-streaming-and-shell` grill — the last task. Six repo findings folded in, and one is a **live defect in merged code**: `use-ask.ts:31` sends every successful turn while task 1's schema rejects more than 8, so **the ninth question in a conversation 400s right now**. This task's client trim fixes it. Also caught: streaming everything would have moved the stored-selection re-run off the buffered route it must stay on (one `run()` serves both `ask()` and `rerun()`); an abort currently renders as an **error** via the generic catch; terminal SSE error frames don't carry the fields the seven-class renderer needs; and a multi-byte UTF-8 character split across chunks would corrupt a frame. Your four decisions are in — including that **dock geometry is proven by the live check**, since jsdom can't compute flex layout and a vitest leaf would just assert CSS text. Criteria 7→8, leaves 6→9.
  A: No gaps — board it (Recommended)

## The artifact under interrogation (spec ask-period-control.md)

---
slug: ask-period-control
title: Recoverable periods in Ask
status: draft
saved: 2026-09-15T05:31:35+00:00
---

# Recoverable periods in Ask

## Why

Live PoC testing asked a well-formed statement question with no period:

> Show the MIS statement Actual by statement leaf

and got a flat red failure: *"The answer does not resolve to one statement selector set and offered
period."* Measured 4/4 `not_supported`. Adding a period makes the same question work 6/6 with 81
rows, so the answer was one word away and the product said no instead of asking.

The refusal is a dead end in a surface that already knows how to recover. `chat.service.ts`
returns `ResponseClass.NotSupported` when `statementRequest` cannot build a request, even though
the reason is always knowable: either the signed-in user's scope does not pin exactly one
department, function and plant, or the question named no single whole calendar month.
`ClarificationNeeded` exists for exactly this, is already rendered by the Ask panel as clickable
option buttons (`ask-panel.tsx:131-147`), and is already used elsewhere in the same method.

Two measurements decide the design, and both contradict the obvious implementation.

**Re-asking through the model is unreliable.** The existing clarify UI appends the chosen option to
the question (`resumesQuestion`) and sends it back through the selector. Measured, 4 samples each:

| re-asked question | result |
| --- | --- |
| `Show the MIS statement Actual by statement leaf (2026-07-01)` | success 2/4, informational 2/4 |
| `Show the MIS statement Actual by statement leaf (July 2026)` | success 3/4, informational 1/4 |

A period the user has explicitly clicked must not then be re-guessed. The recovery has to be
deterministic.

**The MIS Reports period list contains an option that cannot answer a statement Ask.** Its
`periods` include `FY 26-27 YTD`, a twelve-month range. `statementPeriod` accepts only a window
naming one whole calendar month, so:

| re-asked question | result |
| --- | --- |
| `Show the MIS statement Actual by statement leaf (FY 26-27 YTD)` | `not_supported` 4/4 |

Offering the raw list would present a choice that is guaranteed to fail. Offered periods must be
filtered to those that can actually answer the question being recovered.

Separately, an answer gives the user no way to move it to another period. The backend already
sends interpretation `chips` with every answer - including a `timeWindow` chip - and the Ask panel
renders none of them. Re-running a period therefore means retyping the whole question, and the
retype goes back through the model with the reliability shown above.

A third measurement bounds the feature. A governed-financial question with no period succeeds 4/4
and returns **no time window at all**: `Show Actual and Budget by GL code` sums every loaded month
(budget 32,000,000 against July's 8,000,000) and its readback carries no period clause. Such an
answer has no period to default a control to, and nothing may invent one for it.

## Behaviour

**A statement question that cannot resolve a period asks instead of refusing.** The response names
which part is missing - the period, or the scope triple - and offers only choices that can answer
that question.

**Choosing an offered period answers deterministically.** The chosen period reaches the warehouse
as an explicit selection, not as words re-parsed by the model. `AskRequest.selection` already
carries an edited `Selection` that `chat.service.ts` runs verbatim, skipping the selector, so the
mechanism exists and is already exercised by the edited-chips path.

**Every answer that resolved to a period shows that period, and lets the user change it.** The
control defaults to the period the answer was computed on, and changing it re-runs through the same
deterministic path. An answer that resolved to no period says so plainly rather than showing an
empty control or a guessed default.

## Acceptance criteria

1. A statement question whose period cannot be resolved returns `ClarificationNeeded`, never
   `NotSupported`, and its prompt names the missing part in the user's words.
2. The offered options contain only periods that can answer that question - whole calendar months
   for a statement ask - and never an option that is guaranteed to fail, such as a multi-month
   range.
3. Choosing an offered period produces the answer without a second selector call, so the same
   choice always yields the same answer.
4. When the unresolvable part is the scope triple rather than the period, the response says which
   attribute is missing and does not offer periods, which cannot help.
5. An answer that resolved to a period displays that period and offers the other periods that could
   answer the same question; changing it re-runs deterministically and the new answer displays the
   new period.
6. An answer that resolved to no period states that it covers all loaded data, and offers no
   defaulted period control.
7. Every path above is proven by repeated sampling, not a single run, because this surface's
   failures are intermittent.

## Out of scope

- Changing which periods the warehouse offers, or the FY-YTD definition.
- Rendering the measure and dimension chips, or making them editable.
- The existing `requiredTimeWindowClarify` day-range options, which are wrong for a monthly
   statement but belong to a different gate.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
