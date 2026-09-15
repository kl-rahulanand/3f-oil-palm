# Cold-read grill — gate: task — task plan assistant-streaming-and-shell

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


## Lessons already in force for these paths

The plan must design AROUND these. A plan that ignores one is not merely unlucky later — it is wrong now, and saying so is part of this read.

- A warehouse DATE column read through pg and JSON-serialized arrives at the browser as an IST-shifted UTC timestamp (2026-07-01 becomes 2026-06-30T18:30:00.000Z), so a user-facing table shows the WRONG MONTH. Normalize month/date cells to a date-only YYYY-MM-DD string on the server before they enter a result row, and format them for display on the client.
- The governed-financial percentage measure deliberately returns LABELS ('over-budget', 'credit / negative actual') when the budget is zero, so a renderer that pushes every numeric/percent cell through Number() turns the designed semantics into NaN. A cell formatter must render a non-numeric measure value verbatim.
- Measured against docs/design/3F-Financial-MIS/3F Financial MIS.dc.html, the live MIS Reports filter row drifts from the prototype in four ways: (1) the Generate button uses the shared shell Button's font-h2 (16px) and rounded-md (10px) beside 13px/6px selects, where the prototype's filter-bar Generate is 12.5px type on a 6px radius at the same 34px height; (2) the four filter labels render at 13px ink instead of the prototype's 11px --kl-slate, so a label reads as loudly as its value; (3) the empty state is a single sentence, dropping the prototype's 44px ruled icon block, its 19px deep-forest title and its 13px slate supporting line ('Actuals are read from SAP for the selected period. Nothing is written back - this report is read-only.'); (4) the prototype hides the native select arrow with appearance:none. A filter row and its action button are ONE control group - match their height, radius and type size to each other and to the prototype, and keep .eyebrow at 10px/.22em mono.
- RULING (settles the autoreview P1 and signals S-0021/S-0023): the bucket list must emit ONE row per unmapped GL CODE, never one per master bucket ENTRY, because GL/month is the grain of the only amounts that exist - do NOT add a warehouse query path and do NOT touch sqlBuilder.ts or selectionExecutor.ts to recover triple grain. Fold the master's bucket entries by gl_code in mis-selection.service.ts: costCentre keeps the single cost centre when that GL has exactly one bucket entry and is null when it has several (a GL booked across cost centres is no longer a triple, just as a Budget-only GL is not); provisional is true if any folded entry is provisional; reason names each folded entry's cost centre and reason so the list still says WHICH cost centre is wrong; actual and budget are that GL's totals assigned EXACTLY ONCE. This keeps the settled decision (both an Actual and a Budget amount per row, costCentre null where there is no single cost centre), keeps the gap visible rather than absorbed (decision 0018 as amended), and makes the list reconcilable against the slice totals because no amount is ever copied onto two rows. Acceptance criterion 3's word 'triples' means the reviewable identity of the gap, not one row per cost centre. Prove it in mis-selection.controller.test.ts with a master where ONE GL carries TWO bucket entries: expect a single row, costCentre null, and the GL total counted once.
- RULING (settles the autoreview P2/performance blocker at frontend/src/features/mis/mis-report-view.tsx:233): after folding the bucket to GL grain, costCentre === null means THREE different things - a Budget-only GL, a GL absent from the mapping master but carrying real Actual spend, and a GL whose master entries span several cost centres - so any UI label inferred from null (today 'Budget only') mislabels two of the three. FIX IN THE CONTRACT, not the renderer: replace MisSelectionBucketRow.costCentre (string | null) with costCentres: string[] - the master's cost centres for that GL, empty when the master names none. mis-selection.service.ts populates it (one entry when a single bucket entry, several when folded, empty for a Budget-only or master-absent GL) and the view renders exactly what it is given: the single name when there is one, 'N cost centres' when there are several (the reason line already names each), and 'No cost centre in master' when there are none. Never infer a row's kind from an absent field. Update mis-selection.controller.test.ts and mis-report-view.test.tsx accordingly, including the multi-cost-centre case with nonzero Actual.
- TWO fixes. (1) BLOCKING - dead API surface: the page now imports useMisStatement (mis-report-view.tsx:7,11), so use-mis-selection.ts and the runMisSelection client method it wraps are orphaned, still exposing the replaced /api/mis/run flow. Remove the client method and the dead hook, and drop their now-pointless api.test.ts case. Leave the BACKEND route alone - /api/mis/run is mis-selection's shipped contract and drill-down may consume it; this is about the frontend's dead entry point only. Note use-mis-selection.ts also wrapped the options query, so move nothing: useMisStatement already provides options. (2) P2, and it was observed live during the functional check: when the first statement request rejects, mis-report-view.tsx:71 renders the 'could not be generated' error AND the 'Select Department, Function and Plant, then Generate' empty state together, because run.data is absent and isPending is false. A failure and an invitation to start are contradictory on screen - render the error state INSTEAD of the empty state, per constitution/07-exception-handling.md's one-clear-state rule.
- frontend/src/features/mis/use-mis-selection.ts is the sole caller of the orphaned runMisSelection client method - the page now uses useMisStatement - so it is AUTHORIZED in scope for statement-view and must be DELETED together with the method and its api.test.ts case; removing the method alone will not compile. Do not touch the backend /api/mis/run route: it is mis-selection's shipped contract and drill-down may consume it. This is the frontend's dead entry point only.
- BLOCKING (contract verdict t-sv-c3). formatBlockHeading in statement-view.tsx:161 branches on the block KEY - treating anything keyed 'selected' as a single month and formatting only its 'to'. That breaks the exact degenerate case the human ruled on: when the selected period IS the FY-YTD, the route returns ONE block keyed 'selected' whose from/to span April to July, and the view heads four months as 'July 2026'. Derive the heading from the RANGE, as the criterion says: when from and to fall in the same month, 'July 2026'; when they span months, 'FY 26-27 (YTD to <last month>)'. The block key says which slot it is, not what period it covers. Extend the single-block required leaf to assert the heading of that deduped block, not just that one block renders - the existing leaf passed while the heading was wrong, which is why this reached review.
- tools/junit-run.mjs exits 0 and emits a testcase named after the FILE PATH when --name matches no leaf (D-0024), so a missing-name negative control cannot fail and is not the gate. The gate is that each report's testcase name equals the required leaf id verbatim - a report naming the file path asserted nothing. Verified both halves by hand: a real leaf name yields a testcase named for the leaf, a bogus one yields a testcase named backend/src/mis/mis-drill.service.test.ts. junit-run.mjs stays out of scope for feature tasks; fixing it is D-0024's own trigger.
- t-dp-c5 requires matching the approved prototype, and the prototype's drill overlay carries motion the implementation omitted: the scrim has 'animation: fadein .2s ease' (from opacity 0) and the panel has 'animation: slidein .25s cubic-bezier(.4,0,.2,1)' where slidein is 'from { transform: translateX(24px); opacity: 0 }' - both defined in docs/design/3F-Financial-MIS/3F Financial MIS.dc.html. .mis-drill-scrim and .mis-drill-panel currently have no transition or animation at all, so a drawer covering 86 percent of the viewport simply appears. Add BOTH, using the prototype's own values and keyframe shapes rather than invented ones, and add .mis-drill-scrim and .mis-drill-panel to the existing prefers-reduced-motion block at globals.css:1075 with animation: none, as login-enter already does - the static prototype cannot express reduced motion, so that part is ours. Do not animate from scale(0) and do not use transition: all. The rest of the panel's craft is already right: scale(0.97) on :active, the strong ease-out curve, hover gated behind (hover: hover) and (pointer: fine), named transition properties and focus-visible rings.
- globals.css:768 gives .mis-drill-pagination button the same :active transform scale(0.97) as .mis-actual-action, .mis-drill-close and .mis-drill-back, but .mis-drill-pagination button (globals.css:1041) declares no transition, so its press feedback jumps instantly while every other pressable in the same panel eases. Add the transform transition the close button already uses - transform 140ms cubic-bezier(0.23, 1, 0.32, 1) - naming the property explicitly, never transition: all. Press feedback belongs in the 100-160ms band; an un-eased snap next to eased neighbours reads as an unfinished control.
- The sandbox has no npm registry access (ENOTFOUND), but the orchestrator warmed the shared npm cache from the host on 2026-09-12: recharts@3.10.1 and its full 42-package closure are present, and 'npm install recharts@3.10.1 --offline' was verified to succeed in 675ms from cache alone. Install with the --offline (or --prefer-offline) flag and it will resolve without touching the network. Pin 3.10.1: its peerDependencies accept react ^19, which frontend/package.json:19 sets to 19.0.0. Do not switch charting libraries, hand-roll SVG charts, or treat the dependency as unavailable - decision 0007 names recharts specifically, and frontend/package.json plus the root lockfile are already in this task's write_scope.
- ENOTCACHED in the sandbox is a cache-PATH problem, not a missing package. Verified on the host 2026-09-12: 'npm install recharts@3.10.1 --offline --dry-run -w @3f/frontend' succeeds and resolves 565 packages, so the whole workspace tree including recharts@3.10.1 and its 42-package closure is present in the cache at /Users/caw-dev-m4-5/.npm. The sandbox evidently resolves a different cache directory. Run the install with the cache named explicitly: 'npm install recharts@3.10.1 --offline --cache /Users/caw-dev-m4-5/.npm -w @3f/frontend'. If that still reports ENOTCACHED the sandbox cannot read that path at all - say so in the signal and name the path it DID try (npm config get cache), and the orchestrator will install from the host instead. Do not switch charting libraries or hand-roll SVG: decision 0007 names recharts, and pin 3.10.1 for its react ^19 peer range.
- recharts@3.10.1 is ALREADY INSTALLED and resolving. The orchestrator installed it from the host under ledgered degraded window Q-0032-fcc8 on 2026-09-12, because the sandbox has neither registry access nor a readable npm cache (signals S-0003, S-0004, S-0005). frontend/package.json:21 now carries "recharts": "^3.10.1" and package-lock.json is updated; require.resolve finds it from ./frontend. Do NOT run npm install for it, do not retry --offline, and do not treat the dependency as unavailable - just import and use it. Everything else in the task is untouched and remains yours: the two surfaces, the seven-class renderer, the view-in-report union and its statement-side branch, the in-memory thread, the api client method and its direct test, and the catalog-drawn seed chips.
- node_modules is fully installed in this worktree as of 2026-09-12: zod, typescript-eslint, prettier and recharts all resolve. The orchestrator ran npm install from the host, because a freshly created task worktree starts without node_modules and the sandbox can neither reach the registry nor read the host cache. No product file changed - node_modules is gitignored. Run the five verify commands directly and do NOT attempt npm install, npm ci or any --offline retry; those will fail in the sandbox and are not yours to fix. If a package is genuinely missing, raise a signal naming it rather than trying to install it.
- node_modules is fully installed in THIS worktree as of 2026-09-12, BEFORE delegation: the orchestrator ran 'npm ci --offline --cache /Users/caw-dev-m4-5/.npm' from the host, because forge task start always cuts a fresh worktree without node_modules and the sandbox can neither reach the registry nor read the host cache. Verified after installing: tsc resolves and npm run test:frontend passes 56 tests across 14 files. No product file changed - node_modules is gitignored, so no degraded window was needed. Run the verify commands directly and do NOT attempt npm install, npm ci or any --offline retry; those fail in the sandbox and are not yours to fix. If a package is genuinely missing, raise a signal naming it rather than trying to install it.
- This task is user_facing, so harness.yaml requires emil-design-eng AND frontend-design to be loaded, USED and attested - the test recorder refuses a user-facing automated artifact without both in skills_used. The first run did neither: the job log shows frontend-design mentioned ZERO times anywhere, and emil-design-eng only reached by 'wc -l' on its SKILL.md, never read or applied. Do not attest a skill that was not used. READ both SKILL.md files in full and APPLY them to the two new surfaces - frontend/app/(app)/explore/page.tsx, the saved-views and pinned-reports components, their rules in frontend/app/globals.css, and the new Save view / Pin report controls in ask-panel.tsx - then fix what they find. Precedent from drill-panel: these skills find real defects (dropped prototype motion, a render-time throw with no error boundary, an unformatted paise line), so a pass that changes nothing is a sign the skills were not applied rather than evidence the UI was already right. The surfaces are already functionally verified end to end; this pass is about the design quality the contract promises.
- TWO design skills are mandatory for this user_facing task and only ONE has been used across two runs. emil-design-eng was properly read in the second run (sed -n '321,760p'), but frontend-design has ZERO occurrences in both job logs. Read it explicitly by absolute path: /Users/caw-dev-m4-5/.codex/skills/frontend-design/SKILL.md - read the WHOLE file, then apply it to frontend/app/(app)/explore/page.tsx, frontend/src/features/exploration/*.tsx, the new Save view and Pin report controls in frontend/src/features/assistant/ask-panel.tsx, and the rules those surfaces use in frontend/app/globals.css. The test recorder REFUSES a user-facing automated artifact unless BOTH skill names appear in skills_used, and the orchestrator will not attest a skill whose SKILL.md was never opened - it checks the job log. If after reading it you genuinely find nothing to change, say so explicitly and name at least two specific rules from that file you checked the surfaces against, so the attestation rests on evidence rather than silence.
- Three verified findings, all confirmed in the code. (1) BLOCKING, t-aev-c3: both Open handlers - pinned-reports.tsx:60 and the saved-views equivalent - call 'void rerun(...)' and then router.push('/ask') UNCONDITIONALLY, while use-ask.ts:29 early-returns 'if (!trimmed || isPending) return;'. So when another Ask request is already in flight the re-run silently never happens and the user is still navigated to /ask, landing on a page with no new answer - the open did not re-run, which is exactly what t-aev-c3 forbids. Make the re-run report whether it was accepted (return a boolean or await it) and navigate ONLY when it actually started; if it was rejected as pending, do not navigate and say so on the row. (2) P2, ask-panel.tsx:154: the Save/Pin notice uses 'error instanceof Error ? error.message : <good copy>' - the SAME inverted pattern already fixed in use-exploration.ts, so an ApiError renders 'API request failed with status 500' in the user-facing Ask panel while the correctly-written copy sits unused in the fallback branch. Put the human copy on the Error branch too, distinguishing save from pin, and do NOT change ApiError itself - it is shared by every surface and other tests assert on it. (3) Cover both in tests: a rerun rejected as pending must not navigate, and a failed save or pin must show human copy rather than the raw message.
- MEASURED on 2026-09-14 with repeated sampling, correcting a single-sample claim in the approved contract. The cap NEVER truncates: at 256, 512 and 2048 every run returned stopReason tool_use with a valid tool block. The model emits the tool call and THEN keeps producing text, so output saturates at whatever cap is set - which means a LOWER cap is strictly better and C1's 'headroom' justification for 2048 is inverted. Latency with one prior turn: cap 2048 -> 5370ms, 4610ms, 19299ms (1153, 1170, 2048 output tokens); cap 512 -> 5610ms, 2667ms, 5833ms (512 every time); cap 256 -> 1162ms and 2681ms. The story's live check expects a follow-up under 5 SECONDS, which 2048 will not meet reliably. Task 3's functional check must therefore expect 5-20s unless LLM_SELECTOR_MAX_TOKENS is lowered - a one-constant change. Do NOT conclude anything from a single sample of this model: run-to-run output length varies from 124 to 24,313 tokens for the same prompt at temperature 0, which is exactly how the orchestrator's original 1,429ms claim came to be wrong.

## The contract as recorded (authoritative over any copy in the plan)

## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Make a slow answer look like work rather than a hang, and stop the shell showing a dead control. Both Ask surfaces consume the already-built POST /api/chat/stream and render its ordered phases; the freshness pill renders the real load-freshness value; and the docked panel fills its column. Frontend only.

**Acceptance criteria**

- Both Ask surfaces consume POST /api/chat/stream and render its ordered phases - routing, selecting, querying, summarizing (contract/src/api.ts:552) - instead of one static pending state. The client parses SSE correctly in both directions the transport actually produces: a single frame SPLIT ACROSS CHUNKS and SEVERAL frames arriving in ONE chunk. It also handles the stream's failure modes rather than hanging: a MALFORMED JSON frame and an EOF carrying neither result nor error each resolve the request as a backend error, because AskProvider is shared by the dock and the page and an unresolved promise leaves BOTH surfaces pending forever. A phase never renders after the terminal frame.
- An answer that resolves within 250ms renders NO PHASE AT ALL. This is a CLIENT render delay, not a producer change: chat.service.ts:103 emits routing BEFORE the deterministic classifiers run, so a greeting, a glossary definition and a policy refusal DO receive a phase today and do not resolve before the first one. Suppressing it server-side would mean not emitting a phase the server has already decided to emit; delaying it client-side leaves the producer untouched and still removes the flicker.
- The streaming client preserves EVERYTHING the buffered client does, because pre-stream failures are ordinary HTTP responses and not SSE frames: the CSRF bootstrap and x-csrf-token header, credentials: include, the 401 refresh-and-retry path, and HTTP-error rendering (frontend/src/lib/api.ts:22-40 is the existing behaviour). A 401 on the stream must refresh and retry exactly as a buffered post does, not surface as a stream error. The buffered POST /api/chat route is UNCHANGED and still serves the stored-selection re-run, which bypasses the model and needs no progress display.
- Leaving the assistant cancels the in-flight request, and the cancellation is BOUNDED as task 1 built it: the client aborts, the server stops writing frames and aborts the model call, and a query already running expires under statement_timeout rather than being cancelled. Collapsing the dock does NOT cancel, and moving between the dock and the Ask page does NOT cancel - one AskProvider holds one thread, so a valid transition must not discard a question in flight. Only leaving the assistant area does. An expected abort is never rendered as an error.
- The shell's freshness pill shows the real value from GET /api/warehouse/freshness and is no longer aria-disabled. app-shell.tsx:174 renders static text with aria-disabled=true today, beside a disabled search box. It renders all FIVE states the route distinguishes - available, no-active-batches, unsupported, unconfigured, lookup-failed - and never collapses them into one blank or one 'unavailable'. It is labelled as LOAD freshness, matching the payload's freshnessKind, because a September upload of July figures must not read as September data. provenance.dataAsOf remains null and untouched (D-0041); the pill is the only freshness surface this task ships.
- The docked Ask panel fills its column on desktop with the thread scrolling INSIDE it. globals.css:1346 sets max-height: calc(100vh - 98px) with align-self: flex-start - a CEILING, not a height - so a short thread leaves the visible gap the human reported. The composer stays reachable without scrolling the report. The existing mobile behaviour at the current breakpoint is unchanged: the panel stacks and takes its natural height.
- The surfaces are proven by vitest leaves covering: an SSE frame split across chunks and several frames in one chunk; phases rendering in order; NO phase for an answer resolving within 250ms; a malformed frame and an EOF without a terminal event each resolving as a backend error rather than hanging; a 401 refreshing and retrying; leaving the assistant aborting while dock collapse and dock-to-Ask navigation do NOT; the pill rendering each of the five states; and the dock filling its column. The task is user_facing, so emil-design-eng AND frontend-design are loaded, USED and attested - the recorder REFUSES a user-facing automated artifact without both, and the orchestrator checks the job log for an actual read rather than taking the run's word for it. The functional check runs LIVE with BEDROCK_MODEL_ID set: ask, then ask a FOLLOW-UP and confirm phases appear and it returns in a FEW SECONDS - measured 1.0-5.4s after task 1, so the check expects a few seconds with occasional excursions, NOT a hard sub-5s bound. Every artifact is judged by its junit testcase NAME and EXECUTED count, never an exit code (D-0024, D-0031).

**Write scope** (what `stage done` measures the diff against)

- frontend/src/features/assistant/ask-stream.ts
- frontend/src/features/assistant/ask-stream.test.ts
- frontend/src/features/assistant/use-ask.ts
- frontend/src/features/assistant/ask-panel.tsx
- frontend/src/features/assistant/ask-panel.test.tsx
- frontend/src/lib/api.ts
- frontend/src/lib/api.test.ts
- frontend/src/components/shell/app-shell.tsx
- frontend/src/components/shell/app-shell.test.tsx
- frontend/src/features/shell/use-freshness.ts
- frontend/app/globals.css

**Required tests** (run by `stage done`)

- `an sse frame split across chunks and several frames in one chunk both parse` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/assistant/ask-stream.test.ts)
- `a malformed frame and an eof without a terminal event resolve as a backend error instead of hanging` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/assistant/ask-stream.test.ts)
- `an answer resolving within the render delay shows no phase while a slower one shows them in order` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/assistant/ask-panel.test.tsx)
- `leaving the assistant aborts while collapsing the dock and moving to the ask page do not` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/assistant/ask-panel.test.tsx)
- `the streaming client sends the csrf header and refreshes once on a 401` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/lib/api.test.ts)
- `the freshness pill renders each of the five states and is no longer disabled` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/components/shell/app-shell.test.tsx)

**Verify commands**

- `npm run build:contract`
- `npm run build:frontend`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:hermetic`

**Review budget.** 11 files / 1500 lines -- An SSE client with real framing edge cases and terminal-failure handling on a provider shared by two surfaces, a client-side render delay that removes phase flicker without touching the producer, full transport parity with the buffered client including the 401 refresh, cancellation that distinguishes leaving from valid in-app transitions, a five-state freshness pill, and the dock height. Six required vitest leaves plus a live functional check and the two mandatory design skills.

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

## The artifact under interrogation (task plan assistant-streaming-and-shell)

# Task plan — assistant-streaming-and-shell: show the work, tell the truth, fill the column

Story: `poc-responsiveness` · Task 3 of 3 · **user_facing: true** · frontend only

## Objective
Tasks 1 and 2 made the assistant fast and gave the shell something true to show. Neither is
visible yet: the Ask surfaces still call the buffered route and show one static pending state, and
the top bar still renders a hard-coded disabled chip. This task makes both real.

## Acceptance criteria (plan_contracts)
- **t-ass-c1** — both surfaces stream; SSE framing and terminal failures handled, never hanging.
- **t-ass-c2** — no phase at all for an answer resolving within **250 ms** (a *client* rule).
- **t-ass-c3** — full transport parity: CSRF, credentials, the **401 refresh**, HTTP errors.
- **t-ass-c4** — leaving cancels; dock collapse and dock ↔ Ask do **not**.
- **t-ass-c5** — the pill renders **all five** states, labelled **load** freshness.
- **t-ass-c6** — the dock fills its column; mobile unchanged.
- **t-ass-c7** — six vitest leaves, both design skills, a live check.

## What already exists (grounding, file:line)
- `contract/src/api.ts:552` — `ChatStreamEvent` is `phase | token | result | error`; the phases are
  `routing → selecting → querying → summarizing`.
- `backend/src/chat/chat.service.ts:103` — `routing` is emitted **before** the deterministic
  classifiers, so greetings, glossary answers and policy refusals **do** receive a phase today.
  That is why no-flicker is a client delay, not a producer change.
- `frontend/src/lib/api.ts:125` — `ask` posts to the **buffered** `/api/chat`; nothing references
  `/api/chat/stream`. `:22-40` is the transport the stream client must match: the CSRF bootstrap,
  the `x-csrf-token` header, `credentials: "include"`, and the **401 refresh-and-retry**.
- `frontend/src/features/assistant/use-ask.ts:12` — one `AskContextValue` shared by the dock and
  the page, with `ask` and `rerun`. A promise that never resolves hangs **both** surfaces.
- `frontend/src/components/shell/app-shell.tsx:174` — the `Freshness unavailable` chip, static text
  with `aria-disabled="true"`.
- `GET /api/warehouse/freshness` (task 2, merged) — five states: `available`, `no-active-batches`,
  `unsupported`, `unconfigured`, `lookup-failed`, each carrying `freshnessKind: "load"`.
- `frontend/app/globals.css:1346` — `max-height: calc(100vh - 98px)` with `align-self: flex-start`:
  a **ceiling**, not a height, which is the reported gap.
- Task 1 measured the follow-up at **1.0–5.4s** after the cap change — the live check must expect a
  few seconds with occasional excursions, **not** a hard sub-5s bound.

## Workflow
```mermaid
flowchart TD
  A["ask() — dock or page, one shared AskProvider"] --> S["POST /api/chat/stream<br/>CSRF header · credentials · 401 refresh+retry"]
  S --> P{"SSE frames"}
  P -->|"split across chunks"| BUF["buffer and re-join"]
  P -->|"several in one chunk"| SPL["split and emit each"]
  BUF --> PH["phase events"]
  SPL --> PH
  PH --> D{"resolved within 250ms?"}
  D -->|"yes — greeting, glossary, refusal"| NONE["render NO phase (no flicker)"]
  D -->|"no"| SHOW["routing → selecting → querying → summarizing"]
  P -->|"result"| R["render via the existing seven-class renderer"]
  P -->|"error"| R
  P -->|"malformed JSON"| BE["resolve as backend error — never hang"]
  P -->|"EOF, no terminal event"| BE
  X["leaving the assistant"] --> AB["abort — server stops frames, aborts the model;<br/>a running query expires under statement_timeout"]
  Y["dock collapse · dock ↔ /ask"] --> KEEP["do NOT cancel — one provider, one thread"]
  F["GET /api/warehouse/freshness"] --> PILL["pill: all 5 states, labelled LOAD freshness<br/>no longer aria-disabled"]
  CSS["globals.css:1346 max-height + flex-start"] --> FILL["height, so the dock fills its column;<br/>thread scrolls INSIDE · mobile unchanged"]
```

## Manual Verification
1. Ask a question on the docked panel: phases appear in order and the answer renders through the
   existing renderer.
2. Ask a **follow-up** — the case that took 39s before task 1. It returns in **a few seconds**
   (measured 1.0–5.4s) with phases visible. Report the number you observe; do not assert a bound.
3. Say `hello`: it answers immediately and **no phase flashes** — the server still emits `routing`,
   so this proves the client delay, not a server change.
4. In DevTools → Network, confirm the request is `POST /api/chat/stream` and carries
   `x-csrf-token` with credentials. Force a 401 and confirm it refreshes and retries rather than
   rendering a stream error.
5. Start a question, then **collapse the dock** and **navigate dock → /ask**: the question is still
   running and its answer still arrives. Then **leave the assistant** mid-flight and confirm the
   backend stops writing frames.
6. Read the top bar: a real load-freshness value, not `aria-disabled`. Stop the warehouse and
   confirm the pill shows the **specific** state rather than a blank.
7. Open a report with the dock: the panel **fills the column**, the thread scrolls inside it, and
   the composer is reachable without scrolling the report. Narrow to mobile: stacking is unchanged.
8. `npm run build:contract && npm run build:frontend && npm run typecheck && npm run lint &&
   npm run format:check && npm run test:hermetic` — six leaves, each confirmed by its junit
   testcase **name** and **executed count**, never the exit code (D-0024, D-0031).

## Out of scope
`provenance.dataAsOf`, which stays null under **D-0041**. Changing the buffered `/api/chat` route,
which still serves the stored-selection re-run. True Postgres query cancellation. The Pulse-inherited
selector prompt examples and D-0040.

<!-- forge:contract -->
## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Make a slow answer look like work rather than a hang, and stop the shell showing a dead control. Both Ask surfaces consume the already-built POST /api/chat/stream and render its ordered phases; the freshness pill renders the real load-freshness value; and the docked panel fills its column. Frontend only.

**Acceptance criteria**

- Both Ask surfaces consume POST /api/chat/stream and render its ordered phases - routing, selecting, querying, summarizing (contract/src/api.ts:552) - instead of one static pending state. The client parses SSE correctly in both directions the transport actually produces: a single frame SPLIT ACROSS CHUNKS and SEVERAL frames arriving in ONE chunk. It also handles the stream's failure modes rather than hanging: a MALFORMED JSON frame and an EOF carrying neither result nor error each resolve the request as a backend error, because AskProvider is shared by the dock and the page and an unresolved promise leaves BOTH surfaces pending forever. A phase never renders after the terminal frame.
- An answer that resolves within 250ms renders NO PHASE AT ALL. This is a CLIENT render delay, not a producer change: chat.service.ts:103 emits routing BEFORE the deterministic classifiers run, so a greeting, a glossary definition and a policy refusal DO receive a phase today and do not resolve before the first one. Suppressing it server-side would mean not emitting a phase the server has already decided to emit; delaying it client-side leaves the producer untouched and still removes the flicker.
- The streaming client preserves EVERYTHING the buffered client does, because pre-stream failures are ordinary HTTP responses and not SSE frames: the CSRF bootstrap and x-csrf-token header, credentials: include, the 401 refresh-and-retry path, and HTTP-error rendering (frontend/src/lib/api.ts:22-40 is the existing behaviour). A 401 on the stream must refresh and retry exactly as a buffered post does, not surface as a stream error. The buffered POST /api/chat route is UNCHANGED and still serves the stored-selection re-run, which bypasses the model and needs no progress display.
- Leaving the assistant cancels the in-flight request, and the cancellation is BOUNDED as task 1 built it: the client aborts, the server stops writing frames and aborts the model call, and a query already running expires under statement_timeout rather than being cancelled. Collapsing the dock does NOT cancel, and moving between the dock and the Ask page does NOT cancel - one AskProvider holds one thread, so a valid transition must not discard a question in flight. Only leaving the assistant area does. An expected abort is never rendered as an error.
- The shell's freshness pill shows the real value from GET /api/warehouse/freshness and is no longer aria-disabled. app-shell.tsx:174 renders static text with aria-disabled=true today, beside a disabled search box. It renders all FIVE states the route distinguishes - available, no-active-batches, unsupported, unconfigured, lookup-failed - and never collapses them into one blank or one 'unavailable'. It is labelled as LOAD freshness, matching the payload's freshnessKind, because a September upload of July figures must not read as September data. provenance.dataAsOf remains null and untouched (D-0041); the pill is the only freshness surface this task ships.
- The docked Ask panel fills its column on desktop with the thread scrolling INSIDE it. globals.css:1346 sets max-height: calc(100vh - 98px) with align-self: flex-start - a CEILING, not a height - so a short thread leaves the visible gap the human reported. The composer stays reachable without scrolling the report. The existing mobile behaviour at the current breakpoint is unchanged: the panel stacks and takes its natural height.
- The surfaces are proven by vitest leaves covering: an SSE frame split across chunks and several frames in one chunk; phases rendering in order; NO phase for an answer resolving within 250ms; a malformed frame and an EOF without a terminal event each resolving as a backend error rather than hanging; a 401 refreshing and retrying; leaving the assistant aborting while dock collapse and dock-to-Ask navigation do NOT; the pill rendering each of the five states; and the dock filling its column. The task is user_facing, so emil-design-eng AND frontend-design are loaded, USED and attested - the recorder REFUSES a user-facing automated artifact without both, and the orchestrator checks the job log for an actual read rather than taking the run's word for it. The functional check runs LIVE with BEDROCK_MODEL_ID set: ask, then ask a FOLLOW-UP and confirm phases appear and it returns in a FEW SECONDS - measured 1.0-5.4s after task 1, so the check expects a few seconds with occasional excursions, NOT a hard sub-5s bound. Every artifact is judged by its junit testcase NAME and EXECUTED count, never an exit code (D-0024, D-0031).

**Write scope** (what `stage done` measures the diff against)

- frontend/src/features/assistant/ask-stream.ts
- frontend/src/features/assistant/ask-stream.test.ts
- frontend/src/features/assistant/use-ask.ts
- frontend/src/features/assistant/ask-panel.tsx
- frontend/src/features/assistant/ask-panel.test.tsx
- frontend/src/lib/api.ts
- frontend/src/lib/api.test.ts
- frontend/src/components/shell/app-shell.tsx
- frontend/src/components/shell/app-shell.test.tsx
- frontend/src/features/shell/use-freshness.ts
- frontend/app/globals.css

**Required tests** (run by `stage done`)

- `an sse frame split across chunks and several frames in one chunk both parse` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/assistant/ask-stream.test.ts)
- `a malformed frame and an eof without a terminal event resolve as a backend error instead of hanging` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/assistant/ask-stream.test.ts)
- `an answer resolving within the render delay shows no phase while a slower one shows them in order` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/assistant/ask-panel.test.tsx)
- `leaving the assistant aborts while collapsing the dock and moving to the ask page do not` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/assistant/ask-panel.test.tsx)
- `the streaming client sends the csrf header and refreshes once on a 401` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/lib/api.test.ts)
- `the freshness pill renders each of the five states and is no longer disabled` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/components/shell/app-shell.test.tsx)

**Verify commands**

- `npm run build:contract`
- `npm run build:frontend`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:hermetic`

**Review budget.** 11 files / 1500 lines -- An SSE client with real framing edge cases and terminal-failure handling on a provider shared by two surfaces, a client-side render delay that removes phase flicker without touching the producer, full transport parity with the buffered client including the 401 refresh, cancellation that distinguishes leaving from valid in-app transitions, a five-state freshness pill, and the dock height. Six required vitest leaves plus a live functional check and the two mandatory design skills.
<!-- /forge:contract -->


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
