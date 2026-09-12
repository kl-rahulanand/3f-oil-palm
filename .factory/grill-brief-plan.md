# Cold-read grill — gate: plan — plan draft assistant.md

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
- Q: The confirmed spec says the assistant is "Included in the first PoC release". Your BRIEF calls the chatbot "sequenced as a fast-follow" and accepted decision **0002** says "the chatbot remain later phases". Those cannot all be true, and D-0032 already flags the BRIEF as drifted. A planner cannot size this story until you settle it.
  A: Assistant ships in the PoC (Recommended)
- Q: If the assistant ships with natural language: the only implemented provider is **Bedrock** (`bedrock.provider.ts`), and `MockLlmProvider` always returns "clarify" — it never selects, so it cannot answer a single question. Using a real model means the user's typed question, and conversation context, leave this machine. The spec parks LLM and data residency as "OPEN — decide later", and decision 0011 defers deployment readiness.
  A: Bedrock, and I'll name the region (Recommended)
- Q: The spec uses "saved queries", "saved report" and "pinned dashboards" interchangeably. The vendored contract already distinguishes a saved *selection* from a *snapshot* (`PinSnapshot` even carries an `access_revoked` status), so the code is more decided than the spec. These differ materially for confidentiality.
  A: Selections only, personal, re-run under current RBAC (Recommended)
- Q: The Bedrock region to record in the decision. `config.ts:180` already defaults `AWS_REGION` to **ap-south-1** (Mumbai), which keeps the question text in-country for an Indian client. `BEDROCK_MODEL_ID` has no default, so it must be set either way.
  A: ap-south-1, Mumbai (Recommended)
- Q: Closing the assistant requirements grill. Ten findings. Your three calls: the assistant ships in the PoC (I'll mint a decision superseding that clause of 0002 and amend the drifted BRIEF, closing D-0032); Bedrock as the provider; saves store selections only, personal, re-run under current RBAC. The seven I'm settling from the repo: the bounded data vocabulary is exactly what `semanticLayer.ts` registers (governed-financial + mis-statement) over the proven DUB slice, with out-of-catalog questions refused rather than answered zero; "no fabricated numbers" becomes falsifiable — every numeric character on screen, including prose and chart labels, is rendered from the deterministic result; the "view in report" deep link carries the selection *and* the answer's batch provenance, with a stated fallback when a question can't be represented as a statement; RBAC/audit inherit 0016's all-or-nothing with re-authorization on every ask, re-run and pin refresh, and a fail-closed audit as the chat path already does; the acceptance criteria are extended to cover every promised surface; a response matrix settles data / definition / ambiguous / causal / off-topic precedence; and the spec will state plainly that the vendored chat, saved and pin routes are **not registered** — `AppModule` imports none of them and the applied migration is auth/audit only — so this story owns restoring them. Any remaining gap?
  A: No gaps — amend and record (Recommended)

## The artifact under interrogation (plan draft assistant.md)

---
story: assistant
title: Assistant + exploration
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

# Assistant + exploration

## Problem
Six stories in, 3F can read the Financial MIS and trace any Actual to the transactions behind
it. What they still cannot do is **ask**. The last roadmap story adds the conversational and
exploration layer over the same governed measures — and closes the PoC.

Reading the system for this plan moved the problem twice, and both times away from "build an
assistant" toward "make the one we already have reachable, and give it somewhere to write."

**The assistant is vendored, complete-looking, and entirely unreachable.** `backend/src/chat/`
is 3,758 lines across eighteen files — `ChatService.ask()` with smalltalk classification,
ambiguity and clarify handling, a reconciliation guard, verified-selection checks, SSE
streaming, provenance assembly and a fail-closed audit write inside `beforeExecute`. Its
collaborators all exist: `ConversationsService`, `ReportsService`, `HelpService`,
`DimensionValuesService`. And **none of it is wired in**: `backend/src/app.module.ts` imports
`CoreModule`, `HealthModule`, `IngestModule`, `MisSelectionModule` and `MisModule` — not chat,
not saved, not pins. The registered-route allow-list in `backend/src/app.routes.test.ts` lists
fourteen routes and contains no `/api/chat`, `/api/saved` or `/api/pins`. This story's first job
is registration and governance, not authorship.

**The persistence it needs does not exist.** `backend/src/db/schema.ts` declares `conversations`,
`conversation_turns`, `saved_queries`, `dashboard_pins` and `pin_snapshots`. `backend/drizzle/`
contains exactly one migration, `0000_auth_audit.sql`, which creates `users`, `roles`,
`user_roles`, `role_perms`, `user_scope`, `sessions`, `otp_codes`, `refresh_tokens` and
`audit_events` — and `migrate.ts` runs that folder. So those five tables are **declared in
Drizzle and absent from the database**. Registering the chat module without a migration produces
an assistant that fails on its first durable turn. That is the single most load-bearing fact in
this plan, and it is invisible from the schema file alone.

**A third thing, smaller but fatal to a demo:** `MockLlmProvider.select()` always returns
`kind: "clarify"`. It never selects. Without `LLM_PROVIDER=bedrock` and a set `BEDROCK_MODEL_ID`
the assistant cannot answer a single question — it can only ask one back. Decision **0027**
settles the provider and region; the model id remains a deployment input with no default.

What the vendored code **does** already give us is most of the answer contract. `AskResponse`
carries `selection`, `result`, `totals`, `chartType`, `availableChartTypes`, `availableFields`,
`provenance`, `appliedTimeWindow`, `appliedFilters`, `chips` and `clarify`; `Provenance` carries
`verified`, the measure definitions, `readback`, `dataAsOf`, `sql` and — since `governed-joins` —
`activeBatchIds`. The governed vocabulary is narrow and real: `semanticLayer.ts` registers
exactly two domains, `governed-financial` and `mis-statement`.

**The one output-side gap is "view in report".** `AskReportGrounding { reportId, timeWindow }`
grounds a question *in* a report. Nothing carries an answer *back* to a statement: the MIS
statement needs Department, Function, Plant and period, and the spec settled that the link must
also preserve the answer's batch provenance so the statement it opens is the one the assistant
was talking about. That field does not exist and this story adds it.

## Scope / Non-goals

**In scope**
- Registering and governing the vendored chat, saved and pins modules, with their routes added to
  the strict allow-list that is the only thing proving a route exists.
- The **migration** creating the five declared-but-absent tables.
- Bedrock wired per decision **0027**, with the boundary enforced: the question, prior turns and
  governed vocabulary may leave; **warehouse rows never do**.
- The **docked Ask panel** on the report and the **standalone Ask page**, from the approved
  prototype, with suggested chips, the verified badge, provenance disclosure and **view in
  report**.
- **Saved selections** and **personal pins** per decision **0028**, re-authorizing on every open.
- The response matrix: data / definition / ambiguous / causal-declined / general chat.

**Non-goals**
- **Answer snapshots and shareable pins** (decision **0028**) — `PinSnapshot` stays in the
  contract unused rather than deleted.
- Any write-back, any SQL authored by the model, any number produced by the model.
- Causal "why" answers — declined by the response matrix, not attempted.
- Widening the governed vocabulary beyond the two registered domains, or beyond the proven
  Agriculture / Nursery / DUB slice.
- A contractual retention or NDA position for model inputs — that rides with the production
  pilot (decision **0011**).
- Rewriting the BRIEF's Smart Palm / Yield / OER framing — the timing half of **D-0032** is
  closed by decision 0026; that half stays open.

## Acceptance Criteria
1. **The routes exist and are governed.** `/api/chat`, `/api/chat/stream`, `/api/saved` and
   `/api/pins` are registered, appear in `app.routes.test.ts`'s allow-list, and sit behind
   `AuthGuard`, the global `CsrfGuard` and the governed grant — a user without it is refused.
2. **The tables exist.** A migration creates `conversations`, `conversation_turns`,
   `saved_queries`, `dashboard_pins` and `pin_snapshots`, and `db:migrate` applies cleanly on a
   database that has only `0000_auth_audit.sql`.
3. **A data question is answered from the governed measures**, with `provenance.verified` true,
   and every visible numeric character — prose, labels, chart axes, annotations — rendered from
   the deterministic result. The model emits no figure.
4. **Out-of-catalog questions are refused as unsupported** and say so; they are never answered
   with a zero, which decision **0018** established means something different.
5. **The response matrix holds** in precedence order: data question answered with provenance;
   definition answered from the semantic layer's labels; ambiguous gets one clarifying question;
   causal "why" declined and redirected; general chat answered naturally, claiming nothing about
   3F's data.
6. **View in report** carries the selection's Department, Function, Plant, period **and** the
   answer's `activeBatchIds`, so the statement it opens is the one the answer came from — and is
   **absent with a reason** when a question has no statement representation.
7. **Both surfaces work**: the docked panel beside the report and the standalone Ask page, with
   suggested chips, the verified badge and provenance disclosure, per the approved prototype.
8. **A saved selection re-runs under the current user's RBAC**, and a **pin opens by re-running**;
   a revoked grant produces a refusal, never a cached figure. Nothing is stored that the user
   could not re-derive by asking again.
9. **Authorization and audit are per-request**: every ask, every saved re-run and every pin open
   re-authorizes and writes its audit record **before** the read, failing closed; denials and
   unsupported requests are audited too.
10. **The Bedrock boundary is enforced and testable**: the provider receives the question, the
    prior turns and the governed vocabulary, and **no warehouse row, measure value or batch
    content** — proven by asserting the provider's input, not by inspection.

## Technical Approach

### Registration, not authorship
`AppModule` gains `ChatModule`, `SavedModule` and `PinsModule` (creating the module files the
vendored controllers lack), the routes join the allow-list, and the governed grant gates them the
way `RequireAction("report")` gates the statement. The vendored services are used as they are;
where they need to change it is to enforce this story's boundary, not to rewrite their behaviour.

### The migration
One Drizzle migration for the five declared tables, generated from `schema.ts` so the declaration
and the database stop disagreeing. It must apply on a database whose only prior migration is
`0000_auth_audit.sql`, which is what every existing environment has.

### The Bedrock boundary
`LLM_PROVIDER=bedrock`, `AWS_REGION=ap-south-1`, `BEDROCK_MODEL_ID` set. The enforceable part is
what `LlmSelectionInput` carries: the question, prior turns and the allowed domains' vocabulary.
The test asserts the provider's **input**, so a future change that starts passing result rows
fails rather than leaks.

### View in report
A new optional field on the success response carrying the four statement selectors plus the
answer's `activeBatchIds`, populated only when the selection maps to a statement, and absent —
with a reason — otherwise. The client links from it; it never reconstructs a selection itself.

### The surfaces
Both from `docs/design/3F-Financial-MIS`: the docked panel (eyebrow, "Ask about this report.
Answers are verified against the source.", suggested chips, the `✓ Verified` badge, the
collapsible provenance block, the "View in report" link and "⤢ Open in Ask") and the standalone
Ask page it opens. Saved views and pins follow the prototype's Explore surface and the dashboard's
"Pinned reports" list.

## Decisions
- **0026** — the assistant ships in the PoC, superseding only 0002's chatbot clause.
- **0027** — Bedrock in `ap-south-1`; question, prior turns and governed vocabulary may leave the
  app, warehouse rows never do.
- **0028** — saves store the selection, never the answer; pins are personal and re-authorize.
- Inherited and load-bearing: **0016** (all-or-nothing governed access), **0018** (a zero is not
  an absence — hence the out-of-catalog refusal), **0022** (the statement projection the answers
  and the report link agree with), **0019** (house style for the routes), **0011** (retention and
  residency contracts ride with the pilot), **0012** (the vendored API's constitution deviation
  still covers these controllers).

## Risks
- **The vendored chat code is large and was written for a different product.** Its smalltalk,
  ambiguity and reconciliation guards were tuned for Pulse's domains. They may misclassify 3F
  questions, and the response matrix is the contract they must now satisfy.
- **A demo cannot run without `BEDROCK_MODEL_ID`.** The mock provider only clarifies. This is a
  deployment input with no default and no fallback — worth confirming before any client session.
- **Model quality is not a gate we control.** The plan makes fabrication *structurally*
  impossible — numbers come only from the governed result — but a poor selection still produces a
  confidently wrong-looking answer to the right question. The clarify path is the mitigation.
- **Five new tables on the app database.** The migration is additive, but it is the first schema
  change to the app DB since platform-base, and it must apply to an environment that has only
  ever seen `0000_auth_audit.sql`.
- **Scope.** This is the largest remaining story: two backend module groups, a migration, a
  provider boundary, and three UI surfaces. The decomposition splits it accordingly.

## Verify Plan
- **Backend unit** — route registration and the allow-list; the governed grant refusing an
  ungranted user; the response matrix's five branches; the out-of-catalog refusal; the
  view-in-report field present with batch ids and absent-with-a-reason; the Bedrock input
  boundary asserted on the provider's arguments.
- **Backend DB-backed** (gated, **D-0008**) — the migration applying to a database holding only
  `0000_auth_audit.sql`; a saved selection re-running under a *revoked* grant producing a refusal
  rather than a cached figure.
- **Audit** — a failing audit insert aborts the read; denials and unsupported requests are
  recorded.
- **Frontend unit** — both surfaces render an answer with its verified badge and provenance; the
  report link appears only when the response carries one; chips issue asks; saved and pinned items
  re-run rather than replay.
- **Functional check** (`user_facing` tasks) — live against this worktree's servers with Bedrock
  configured: ask a real question of the July statement and confirm the answer matches the report,
  follow "view in report" and confirm it lands on the same figures, save and re-open, pin and
  re-open.
- Every automated artifact records the **executed count and testcase name**, never the exit code
  (D-0024, D-0031).

## Surface Impact
- **New:** module files for chat, saved and pins; one Drizzle migration; the view-in-report
  contract field; the docked Ask panel, the standalone Ask page, and the saved/pins surfaces in
  `frontend/`.
- **Changed:** `app.module.ts` (three imports), `app.routes.test.ts` (the allow-list),
  `backend/src/db/migrate.ts` only if grant seeding is needed for a new action, and
  `frontend/app/globals.css`.
- **Unchanged:** the semantic layer, the statement and drill paths, the warehouse schema, and
  every governed measure. The assistant reads what the report reads.

## Task Decomposition
Five bounded tasks, sequential. No task spans backend and frontend — `WORKFLOW.md` forbids it,
which is why exploration is two tasks rather than one.
1. **assistant-persistence** (backend, `user_facing: false`) — the migration for the five
   declared-but-absent tables, applied and proven against a database holding only the auth/audit
   migration.
2. **assistant-governed-ask** (backend, `user_facing: false`) — register and govern chat, wire
   Bedrock with its boundary enforced, the response matrix, the out-of-catalog refusal, and the
   view-in-report contract field.
3. **assistant-surfaces** (frontend, `user_facing: true`) — the docked Ask panel and the
   standalone Ask page from the prototype: chips, verified badge, provenance disclosure, view in
   report.
4. **assistant-exploration-api** (backend, `user_facing: false`) — the saved-selection and pin
   routes, storing selections only and re-authorizing on every open, with a revoked grant
   producing a refusal rather than a cached figure.
5. **assistant-exploration-view** (frontend, `user_facing: true`) — the Explore / saved-views
   surface and the dashboard's pinned-reports list, opening by re-running.

**Why five.** The migration is the hard dependency everything else needs and is provable on its
own. Registration-and-governance is where the security load sits and deserves its own review.
The two Ask surfaces share a payload and a design language, so they are one task. Exploration
splits in two only because `WORKFLOW.md` forbids a task spanning backend and frontend — and it
is last because it is the part most likely to be cut if the PoC deadline bites, which is an
argument for sequencing it late, not for skipping it.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
