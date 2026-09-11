# Cold-read grill — gate: plan — plan draft drill-down.md

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
- Q: The spec promises a '2-level drill' (group → sub-lines → transactions), but the statement we shipped mirrors the workbook's outline at ARBITRARY depth — Admin Expenses is three levels deep. So clicking an Actual at the top of Admin has two levels below it, not one. What should clicking an aggregate Actual do?
  A: Any aggregate opens its leaf sub-lines (Recommended)
- Q: The statement's acceptance criterion is that line items foot EXACTLY to the clicked Actual. But if someone re-uploads the July actuals while a statement is on screen, the drill would read the newly active batch and no longer foot. What should the drill read?
  A: Pin to the statement's batch (Recommended)
- Q: The statement spec says a bundled transactions sheet arrives 'with the drill-down capability', but the drill-down spec itself describes no export at all. Should this story include exporting transactions to Excel?
  A: No — keep this story UI-only (Recommended)

## The artifact under interrogation (plan draft drill-down.md)

---
story: drill-down
title: Actuals drill-down to transactions
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
---

# Actuals drill-down to transactions

## Problem
`mis-statement` ships the Financial MIS as a hierarchy of budget components with derived
subtotals and a grand total. Srihari can now read the number. He still cannot answer the
question that motivated the whole engagement — *how was this number built?* — because every
Actual on that screen is an aggregate over transactions the screen never shows.

This story makes Actuals interactive: click a group and see the leaves that make it up,
click a leaf and see the SAP transaction lines behind it, footing to the paise.

Reading the system for this plan moved the crux twice, and neither place is where the spec
implied it would be.

**The governed relation cannot be pinned to a batch.** The grill settled that a drill must
read the *exact* actual-batch ids the displayed statement was built from — otherwise a
re-upload between render and click silently changes the answer under the user's finger. But
the statement's Actual comes from the `actual_by_key_month` view
(`backend/src/warehouse/warehouse-schema.ts:154`):

```sql
SELECT plant, cost_center, gl_code, month, SUM(debit - credit)::numeric(18,2) AS actual_net
FROM sap_transaction AS txn
INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
WHERE batch.source_kind = 'actuals' AND batch.is_active
GROUP BY ...
```

There is no batch-id parameter. The view *is* "whatever is active now", and
`ingest_batch_active_source_period_unique` guarantees exactly one active actuals batch per
period — so a re-upload flips the whole view with no seam to hold on to. A pinned drill
therefore cannot be a lower-grain read of the same relation; it has to read `sap_transaction`
with an explicit `batch_id IN (…)`. That is not a workaround, it is what makes the required
"the batch was replaced" notice *possible*: pinned ids versus currently-active ids for the
same months is a comparison only the raw path can make.

**Footing is a predicate problem, not an arithmetic one.** `sap_transaction.debit` and
`.credit` are `numeric(18,2)` (`warehouse-schema.ts:67-68`), so the view's `::numeric(18,2)`
cast is a no-op: the statement's paise *are* these rows' paise, summed. The drill and the
statement can only disagree by reading a **different set of rows** — a different batch, a
different triple set, a different month range. So "foots in exact paise" is testable as an
identity between two predicates, and the tests should assert equality, never a tolerance.

**Most of the drill does not need the server at all.** The grill settled that a non-leaf
opens *its descendant leaves*, not transactions. `MisStatementNode` already carries `sNo`,
`budgetComponent`, `glCode` and `children`; each `MisStatementMeasureBlock` carries `budget`,
`actual` and `percentage`; and `FixedScaleMoney` is a fixed two-decimal string, so summing
descendants in exact paise is decidable on the payload the browser already holds. The
approved prototype agrees — its L1 panel is *S.No · Sub-line · GL code · Budget · Actual · %*
plus a Total row, which is precisely a flatten of the clicked node. One click crosses the
network in this story: **leaf → transactions** (decision **0024**).

That matters for the security load. The leaf step is the only place raw rows are exposed —
the documented exception to the aggregate-only / k-anonymity rules the governed layer
(`backend/src/chat/suppression.ts`) enforces everywhere else — so it is the only place that
needs the RBAC re-check and the audit record, and it gets all of the review attention.

**And it has no audit to inherit.** `AuditService.writeRequestEvent` — the fail-closed
writer, documented "if the request event cannot be written, the query MUST NOT execute" —
has exactly one caller in the repo: `backend/src/chat/chat.service.ts:317`. `POST
api/mis/statement` writes nothing. The drill cannot point at the statement's audit; it must
establish the pattern. The statement's own gap is recorded as **D-0036**, not widened into
this story.

## Scope / Non-goals

**In scope**
- One new backend route returning the transaction lines behind a **leaf**, pinned to the
  statement's actual-batch ids, server-paginated, with an exact full-result footer.
- A pre-query, **fail-closed** audit record for every drill.
- The drill panel from the approved prototype: scrim, breadcrumb, title, total + meta, sort
  chips, close, and both body states (leaf list / transactions).
- The Actual-only affordance on the statement: every Actual cell in the tree **and** in the
  grand-total footer is activatable; Budget, Roll-over and % are inert.
- The batch-replaced notice.

**Non-goals**
- **Excel export of transactions** — the statement spec's bundled sheet is deferred as
  **D-0035**; this story is UI-only, as the grill settled.
- Drilling Budget, Roll-over or % — inert by acceptance criterion, not by omission.
- Any write path, and any drill below the transaction line.
- Auditing the statement and export routes (**D-0036**).
- Any change to `actual_by_key_month`, to the statement projection, to `MisStatementNode`, or
  to the k-anon suppression used by the aggregate paths.
- Any schema migration: `sap_transaction` and `audit_events` already carry everything needed.

## Acceptance Criteria
1. **Leaf foots in exact paise.** For a leaf line on the July statement, the panel's footer
   `Value` total equals that leaf's `actual` `FixedScaleMoney` string exactly — compared as
   paise, never as the display-rounded rupee.
2. **Derived group foots.** Opening a non-leaf lists **all** descendant leaves (not just
   immediate children) and its Total row equals the clicked node's `actual` exactly.
   Demonstrated at a three-level node (`9 Admin Expenses` → `9.01 Vehicle Maintenance` →
   leaf), where "one level per click" would have been wrong.
3. **Grand Total behaves the same way** — it opens the flattened leaf list, and its total
   equals the statement's grand total.
4. **FY-YTD drill spans batches.** A leaf drilled on the FY 26-27 YTD block foots across
   several monthly actuals batches, and the panel names each contributing batch.
5. **`unmapped-GL` drills.** The bucket line (decision **0018**) opens its transactions and
   foots, like any other leaf.
6. **Sort and tie-break are deterministic.** Default order is `Value` ↓ then `Month` ↓, then
   `posting_date` ↓, `txn_no`, `line_id`; requesting the same page twice returns the same
   rows in the same order.
7. **Budget, Roll-over and % do nothing on click** — no handler, no cursor affordance, no
   focusable control.
8. **Scope is enforced and nothing leaks.** A user without the target plant in scope is
   refused, and the refusal body carries **no** transaction rows, counts or totals. A user
   without the `mis-statement` domain grant or the `report` action is refused identically.
9. **Audit is pre-query and fail-closed.** Each drill writes an `audit_events` row naming the
   actor, the predicate (leaf, triples, month range) and the pinned batch ids **before** any
   warehouse read; with the audit insert failing, the endpoint errors and **no** warehouse
   query is issued.
10. **Re-upload after display.** With the statement on screen and its period re-uploaded, the
    drill still foots to the displayed number *and* states that the batch was replaced.
11. **Pagination is server-side and the footer is not.** With a result larger than one page,
    the response carries the total matching count and totals over **all** matches; the footer
    on screen never equals a page subtotal.

## Technical Approach

### The predicate, once
Everything the drill does is one predicate, derived **server-side** on every request:

| term | source | never from |
|---|---|---|
| leaf key | `nodeKey` → outline snapshot for the budget period | the client's idea of the leaf |
| `(plant, cost centre, GL)` triples | `SelectionResolverService.resolve(request).leafTargets` filtered to that leaf (`target.kind === "leaf"` and matching `leafKey`; `kind === "bucket"` for `unmapped-GL`) | the client |
| month range | the block key re-run through the statement's own `blockDefinitions` | the client's dates |
| plant scope | `user.scope` where `attribute === "plant"` | the client |
| pinned batch ids | the request, **validated** to be actuals batches whose period falls in range | — |

Only the last row comes from the browser, and it can only **narrow** the read. That is what
makes accepting it safe.

### Request and response
The request extends the shape the export control already round-trips successfully
(`department`, `function`, `plant`, `period` — see `use-mis-statement.ts`) with `nodeKey`,
the measure `block` key (`"selected" | "fy26-27-ytd"`), the pinned `actualBatchIds`, and
`page`. **No change to `MisStatementNode` or to the statement response is required** — the
statement already puts `nodeKey`, `scope` and `provenance.activeBatchIds` on the wire.

The response carries the page of lines (`month`, `debit`, `credit`, `value`, `reference`,
`memo`, `postingDate`), the **total matching count**, exact full-result totals as
`FixedScaleMoney`, the batch ids actually read, and a batch-replaced flag. Money stays a
fixed-scale string end to end — the statement's `FixedScaleMoney` discipline — so no value
ever passes through a JS `number`.

Column semantics are fixed by the grill: `Value = Debit − Credit`, `reference` is SAP
**Reference 1**, `memo` is **LineMemo** — which is exactly what `sap-ingestion` already wrote
into `sap_transaction.reference` and `.memo`.

### The read path
A dedicated repository beside the governed executor (decision **0025**), following the house
precedent set by `StatementOutlineRepository` — string SQL over `Warehouse.execute` — but
reusing the governed guards rather than reimplementing them: `SelectionExecutor.authorize`
plus the statement's plant-scope check, then `SqlValidator.validate` (object allowlist, no
`SELECT *`, mandatory bounded `LIMIT` ≤ `maxRows`), then `warehouse.explain`, then execution
under the configured timeout.

Two statements per drill, under one audit record: the page (`ORDER BY (debit - credit) DESC,
month DESC, posting_date DESC, txn_no, line_id` with `LIMIT`/`OFFSET`) and the footer
(`COUNT(*)` and the three `SUM`s, `LIMIT 1`). Both read `sap_transaction` joined to
`ingest_batch`, under the identical predicate, so the footer cannot drift from the page.

The composite index `idx_sap_transaction_month_plant_cost_center_gl_code` covers the
selective part of the predicate.

### The audit record
Written inside the same "before execute" discipline chat uses: build the SQL, write the
record, and let a throw abort before the warehouse is touched. `audit_events` already has the
columns — `question` for the human-readable drill description, `selection` (jsonb) for the
predicate and pinned ids, `generated_sql`, `objects_touched`, and `session_id` from the
existing `@SessionId()` decorator (`backend/src/auth/auth.guard.ts:100`). **No migration.**

### The panel
The approved prototype's drill overlay, rendered from `docs/design/3F-Financial-MIS`: scrim,
eyebrow "Drill-down", breadcrumb (group › sub-line), title, total + meta line, "Sorted"
chips, and a close control. Body is one of two states — the client-side leaf list (decision
**0024**), whose Total row foots by construction; or the transactions table with its Total
row and the prototype's "Matches the Actual in the report" note. The prototype's guidance
copy ("Click any Actual to see its transactions. Budget is not drillable.") is kept.

Each Actual cell becomes a real `<button>` inside its `gridcell` so the `role="treegrid"`
table keeps a valid structure and the affordance is keyboard-reachable; Escape closes, focus
returns to the cell that opened the panel.

## Decisions
- **0024 — Drill Down Aggregate Client Projection** (proposed with this plan): the aggregate
  drill is a client-side projection of the statement payload; only the leaf drill crosses the
  network. Rationale: the payload already carries every field the prototype's leaf list
  shows, in exact-paise strings.
- **0025 — Drill Down Pinned Batch Raw Read** (proposed with this plan): the transaction
  drill reads `sap_transaction` directly under a pinned `batch_id` predicate, beside the
  governed executor but reusing its authorization, validator, explain and timeout, with a
  pre-query fail-closed audit record. Rationale: `actual_by_key_month` takes no batch
  parameter and the governed executor is measure-shaped.
- Inherited and load-bearing here: **0017** (triples filter the Actual side before roll-up),
  **0018** (`unmapped-GL` is explicit and visible — so it drills), **0020** (Actuals attach at
  the GL leaf; parents are derived — so an aggregate has descendant leaves to flatten),
  **0021** (the outline snapshot is what maps `nodeKey` → leaf), **0022** (the statement's own
  projection, whose numbers the drill must foot to), **0019** (unversioned route, raw
  response, direct module imports).

## Risks
- **Pinned ids that no longer exist.** A batch id can be deleted or deactivated between
  render and click. The drill must distinguish "replaced" from "gone" and still refuse to
  substitute the active batch silently. Covered by criterion 10 and tested both ways.
- **Trusting the client's node key.** If `nodeKey` were taken at face value, a crafted value
  could widen the triple set. Mitigated by re-deriving the leaf and its triples from the
  outline snapshot and the resolver on every request, and by rejecting a `nodeKey` that is
  not a leaf in the current snapshot.
- **`SqlValidator` is a parser gate.** It astifies the SQL with `node-sql-parser`; a
  construct it cannot parse blocks the read rather than allowing it. Keep the drill SQL to
  the shapes already proven by the statement projection.
- **Sorting is not indexed.** `ORDER BY (debit - credit) DESC` has no supporting index; the
  filter is selective enough that this is a sort of a small set, but the plan should be
  checked with `EXPLAIN` on the real July batch rather than assumed.
- **Offset pagination.** Stable only because the total order is fully deterministic
  (criterion 6). If the tie-break were ever relaxed, pages would overlap.
- **The panel is an overlay on a `treegrid`.** Focus management and the Escape/scrim
  behaviour are the parts most likely to regress silently; the functional check covers them.

## Verify Plan
- **Backend unit** — predicate derivation (leaf mapping, triple filtering, block → range,
  batch-id validation and the replaced/gone distinction), and refusal shapes carrying no rows.
- **Backend DB-backed** (gated host evidence, **D-0008**) against the pinned July batch:
  exact-paise footing for a leaf, an FY-YTD leaf spanning batches, and `unmapped-GL`;
  deterministic ordering across repeated page requests; page-vs-footer totals on a result
  larger than one page.
- **Audit** — a test that makes the audit insert fail and asserts the warehouse was never
  queried, plus one asserting the written row's predicate and batch ids.
- **Frontend unit** — the aggregate flatten sums descendant leaves to the clicked node's
  `FixedScaleMoney` for a three-level node and for the grand total; Budget/Roll-over/% expose
  no control; the batch-replaced notice renders.
- **Functional check** (`user_facing` tasks) — live, against this worktree's servers: open the
  statement, drill a group, drill a leaf from within it, compare the footer to the statement
  cell, page a large result, and confirm design parity with the prototype panel.
- Every automated artifact records the **executed count and the testcase name**, not the exit
  code (D-0024, D-0031).

## Surface Impact
- **New:** one route under `api/mis`, its DTOs beside `mis-statement.dto.ts`, contract types
  for the drill request/response, a transactions repository in `backend/src/warehouse/`, and
  the drill panel plus its hook and styles in `frontend/src/features/mis/`.
- **Changed:** `statement-view.tsx` — Actual cells become activatable and own the panel state.
- **Unchanged:** the statement response contract, the statement projection, the semantic
  layer, `actual_by_key_month`, the suppression path, and the database schema. No migration.

## Task Decomposition
Three bounded tasks, sequential. No task spans backend and frontend — `WORKFLOW.md` forbids
it, and only the frontend tasks are `user_facing`.

1. **drill-transactions-api** (backend, `user_facing: false`) — the pinned, audited,
   paginated leaf read: predicate derivation, the repository, the route and its DTOs,
   contract types, and the batch-replaced determination.
2. **drill-panel** (frontend, `user_facing: true`) — the prototype's overlay and the Actual
   affordance, with the aggregate state rendered entirely from the statement payload. Needs
   no network, so it is demonstrable the moment it lands.
3. **drill-transactions-view** (frontend, `user_facing: true`) — the leaf state: wire the
   endpoint, the transactions table and its footer, pagination, and the batch-replaced notice.

**Why the frontend is two tasks.** The aggregate state and the leaf state share only the
panel shell; one is a pure projection of data already on screen, the other is the consumer of
a new network path with its own failure and pagination states. Splitting them keeps the
second task's review focused on the part that can actually be wrong.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
