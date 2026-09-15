# Cold-read grill — gate: task — task plan ask-period-contract-and-branch

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

- A required_tests entry must name a REAL leaf test (id = the string in test("...")), not the file path, and must pin TS_NODE_PROJECT=backend/tsconfig.json because forge runs it from repo root; otherwise junit-run's --test-name-pattern matches nothing and ts-node skips the workspace tsconfig, so the gate reports pass without running assertions. Always verify with a negative control (a required test whose negative control cannot fail is not proof).
- The demonstrated warehouse proof must RUN migrate + the fixture against the warehouse DB via a committed, re-runnable warehouse:proof script that EXERCISES IngestionRepository's atomic candidate-load-then-flip; a hermetic test that only greps seed-proof.sql text is false-green. Do NOT build a controller/API here (that is the actuals-loader task) — exercise the repository directly.
- The D-0008 live warehouse proof must be a COMMITTED, reviewer-visible DB-backed test (e.g. backend/src/warehouse/warehouse-proof.db.test.ts calling proveWarehouse, registered in the backend package.json test:db script) so the required execution is provable from the diff itself — a tests.json narrative alone is invisible to the cold-diff reviewer and reads as an absent D-0008 record.
- Put the DB-backed warehouse proof in its OWN file backend/src/warehouse/warehouse-proof.db.test.ts registered ONLY in test:db (and the db list of tools/quality-gate.test.mjs); keep warehouse-schema.test.ts hermetic-only. NEVER register one test file in both test:hermetic and test:db — tools/quality-gate.test.mjs asserts exactly one suite per file and fails the whole verify if a file appears twice.
- SUPERSEDES the separate-file guidance for warehouse-schema: its write_scope does NOT include warehouse-proof.db.test.ts, so do NOT create that file. Keep the DB proof test INSIDE backend/src/warehouse/warehouse-schema.test.ts gated by WAREHOUSE_DB_TEST=1 (skips under plain test:hermetic, runs the migrate + IngestionRepository proof when the env + WAREHOUSE_PG_* are set), registered ONLY in test:hermetic. REMOVE warehouse-schema.test.ts from the test:db script and the db-list in tools/quality-gate.test.mjs, and drop the WAREHOUSE_DB_TEST env added to test:db — quality-gate requires each test file in exactly ONE suite and fails verify otherwise. This is the ONLY remaining fix.
- tools/quality-gate.test.mjs validateIgnoredBaseline asserts .prettierignore's non-comment lines deep-equal the keys of its ignoredBaselineHashes map. So when D-0006 requires removing a file (e.g. backend/src/db/migrate.ts) from .prettierignore, you MUST also remove that path's entry from the ignoredBaselineHashes map in tools/quality-gate.test.mjs (both in write_scope) in the SAME change, and ensure the now-unignored file is prettier-formatted so format:check passes. Keep .prettierignore and ignoredBaselineHashes in sync.
- autoreview blocks a PROOF task whose gated WAREHOUSE_DB_TEST=1 leaf is registered only in test:hermetic (where it self-skips) — from the diff there is no registered command that RUNS it. Add the gated test file to backend/package.json test:db (the DB-backed suite a Postgres/warehouse runner executes with WAREHOUSE_DB_TEST=1), alongside the committed tests.json execution record + the pinned host command in the plan. This makes the execution path provable from the diff itself; the demonstrated-host-evidence model (decision 0009 / D-0008) is unchanged — CI without a warehouse container still skips it.
- Registering the gated reconciliation test in test:db is NOT enough: test:db does not set WAREHOUSE_DB_TEST=1, so the leaf still self-skips there and autoreview reads it as an unrunnable proof. FIX: add a dedicated backend package.json script 'test:warehouse-proof' that itself sets WAREHOUSE_DB_TEST=1 and runs backend/src/warehouse/reconciliation.repository.test.ts (the WAREHOUSE_PG_*/PGHOST/PGPORT connection env is still supplied by the host/operator, NOT hardcoded), and REMOVE the file from test:db (it is a warehouse-DB test, not an app-DB test). Then the registered command actually EXECUTES the proof when run against a warehouse; the pinned host command in tests.json becomes 'WAREHOUSE_PG_*... npm --prefix backend run test:warehouse-proof'. Keep it in test:hermetic too (self-skips there). Still demonstrated-host-evidence (decision 0009/D-0008), NOT CI-enforced.
- The reconciliation D-0008 gated leaf TRUNCATEs ingest_batch + sap_transaction CASCADE on whatever DB WAREHOUSE_PG_* points at. Guard it: BEFORE truncating, assert the warehouse host (WAREHOUSE_PG_HOST) is loopback/local (127.0.0.1, ::1, or localhost) and THROW a clear error refusing to run against a non-local warehouse — so a misconfigured WAREHOUSE_PG_* can never wipe a shared/production warehouse. Also fix the P2: tools/quality-gate.test.mjs wrapping the declared test lists in new Set removes the gate's exactly-one-suite detection (a file registered in two suites is silently deduped) — compare with duplicate detection preserved (e.g. detect duplicates before dedup, or assert no file appears in more than one suite) instead of Set-then-compare.
- Not a defect (Decisions): Factually incorrect and contradicts the settled D-0008 model. (1) tests.json IS committed at f9c6b1d with the full host-execution record: 'npm --prefix backend run test:warehouse-proof -> tests 7 / pass 7 / fail 0 / skipped 0' plus a dead-port negative control (fail 2, ECONNREFUSED). The reviewer cannot see it only because the review bundle deliberately excludes .factory bookkeeping ('review tip excludes 9 harness bookkeeping paths; the bundle is the product delta only') - not because it is absent. (2) The runnable command that executes the proof (test:warehouse-proof, serialized) IS in the product delta at backend/package.json, and the gated test is committed and reviewer-visible. (3) The security lens accepted this identical evidence and approved. (4) The story plan Decisions section settles that the DB-backed warehouse proof is DEMONSTRATED HOST EVIDENCE (D-0008), not CI-enforced execution. — raised as "[P1] Commit the required host-execution evidence for the new proof (backend/package.json:19): The new `test:warehouse-proof` command is registered, but the chan"
- A review may flag editing backend/src/db/migrate.ts as needing the D-0006 de-ignore ritual (remove from .prettierignore + drop its ignoredBaselineHashes entry). This is FALSE for migrate.ts: it is NOT listed in .prettierignore (only migrate.trim.test.ts is), it is NOT a key in tools/quality-gate.test.mjs ignoredBaselineHashes, and Checking formatting...
All matched files use Prettier code style! passes clean. Task 2 (composed-relation, merged PR #21) edited migrate.ts to seed the 'report' action WITHOUT any D-0006 de-ignore and merged green. So editing migrate.ts requires NO .prettierignore or quality-gate baseline change — do NOT add/remove it there. The stale D-0006 deferral text lists ~71 historically-drifting files; migrate.ts has since been de-ignored, so a finding treating it as still-ignored contradicts the actual repo state and is not a defect.
- Unlike migrate.ts (which is NOT ignored), backend/src/chat/chat.service.ts IS a D-0006 vendored file: it is listed in .prettierignore AND is a key in tools/quality-gate.test.mjs ignoredBaselineHashes with a pinned baseline hash. The quality-gate test 'the four FACTORY commands ... / D-0006' fails with 'chat.service.ts changed while still excluded by D-0006' whenever its content changes but it stays ignored. FIX per the D-0006 protocol: (1) ensure the file is prettier-clean (npx prettier --write if needed), (2) REMOVE the 'backend/src/chat/chat.service.ts' line from .prettierignore, (3) REMOVE its '<hash> backend/src/chat/chat.service.ts' entry from the ignoredBaselineHashes map in tools/quality-gate.test.mjs — all in the same change. Do this for ANY D-0006-ignored file a task edits; check membership with  and . (.prettierignore is editable by the worker and is recorded via stage amend-scope at stage done.)
- Putting source_presence on ResultTable rows caused three defects at once: (1) it leaked into the RENDERED column list (selectionExecutor.ts:137 filtered only budget_component_labels + active_batch_ids), showing a provenance column to users; (2) it rode into every composed execution.result.rows record and so into authored-measure SAMPLE persistence (selectionExecutor.ts:165) — the same pressure that kept dragging measures.service.ts into scope; (3) it made the API type UNSOUND (contract/src/api.ts:148): intersecting Record<string, string|number|null> with a possibly-array source_presence is invalid because the string index signature already declares every value scalar. FIX: do NOT put per-row provenance on ResultTable rows at all. Filter ALL provenance columns (source_presence, budget_component_labels, active_batch_ids) out of raw.columns AND out of the result rows, and carry per-row source-presence on the PROVENANCE payload instead, ROW-ALIGNED BY INDEX (e.g. provenance.rowSourcePresence: SourcePresence[] parallel to result.rows), alongside the query-level (source,period,batchId) tuple set + label set. This keeps ResultTable's row type exactly Record<string,string|number|null> (sound, no index-signature conflict), keeps provenance out of rendered columns and out of authored-measure sample persistence, and still satisfies C2's row-aligned source-presence.
- constitution/pnp-coding-standards-modular-monolith.md is explicit: the naming table (line 49) and the TypeScript suffix list (lines 103-105, 120) require an interface to live in its own '.interface.ts' file — e.g. user-repository.interface.ts, sms-provider.interface.ts. Declaring 'export interface IFooService' inside foo.service.ts satisfies 'an explicit interface' but NOT the file-naming rule, and §8 says a missing/misnamed interface is a PR reject. For selection-resolution specifically: ISelectionResolverService belongs in backend/src/mapping/selection-resolver.interface.ts and IMisSelectionService in backend/src/mis/mis-selection.interface.ts, with the .service.ts implementations importing and implementing them. Both files were explicitly authorized in scope (signal S-0015 resolution) as mechanically implied by the contract's own 'explicit service interface per the naming rules' requirement.
- Three fixes from the selection-resolution review. (1) BLOCKING: resolveMappingTriple(triple, master = MAPPING_MASTER) has a DEFAULTED second parameter, so calling it with only the triple compiles and silently resolves against the module-level default rather than the master the service was given. Always pass the master explicitly (selection-resolver.service.ts:95) — otherwise an injected/alternate master is ignored and the tests prove nothing about it. (2) SECURITY: the mis service authorizes the action, domain, measures and dimensions but never checks user.scope before returning mapping-master metadata (mis-selection.service.ts:45), so a user scoped away from DUB can still read DUB selector options and the resolved scope readout. Enforce the validated plant scope BEFORE exposing master metadata or a resolved scope — this is the same disclosure class as the composed-relation Budget-scope bug fixed in governed-joins. (3) PERFORMANCE: the selection's month range is applied to the JOINED relation while actual_src is filtered only by scope+triples and budget_src only by GL membership; push the period predicate INTO both source CTEs so each side filters before the full outer join, consistent with decision 0017's filter-before-the-rollup principle.
- RULING (settles the autoreview P1 and signals S-0021/S-0023): the bucket list must emit ONE row per unmapped GL CODE, never one per master bucket ENTRY, because GL/month is the grain of the only amounts that exist - do NOT add a warehouse query path and do NOT touch sqlBuilder.ts or selectionExecutor.ts to recover triple grain. Fold the master's bucket entries by gl_code in mis-selection.service.ts: costCentre keeps the single cost centre when that GL has exactly one bucket entry and is null when it has several (a GL booked across cost centres is no longer a triple, just as a Budget-only GL is not); provisional is true if any folded entry is provisional; reason names each folded entry's cost centre and reason so the list still says WHICH cost centre is wrong; actual and budget are that GL's totals assigned EXACTLY ONCE. This keeps the settled decision (both an Actual and a Budget amount per row, costCentre null where there is no single cost centre), keeps the gap visible rather than absorbed (decision 0018 as amended), and makes the list reconcilable against the slice totals because no amount is ever copied onto two rows. Acceptance criterion 3's word 'triples' means the reviewable identity of the gap, not one row per cost centre. Prove it in mis-selection.controller.test.ts with a master where ONE GL carries TWO bucket entries: expect a single row, costCentre null, and the GL total counted once.
- RULING (settles the autoreview P2/performance blocker at frontend/src/features/mis/mis-report-view.tsx:233): after folding the bucket to GL grain, costCentre === null means THREE different things - a Budget-only GL, a GL absent from the mapping master but carrying real Actual spend, and a GL whose master entries span several cost centres - so any UI label inferred from null (today 'Budget only') mislabels two of the three. FIX IN THE CONTRACT, not the renderer: replace MisSelectionBucketRow.costCentre (string | null) with costCentres: string[] - the master's cost centres for that GL, empty when the master names none. mis-selection.service.ts populates it (one entry when a single bucket entry, several when folded, empty for a Budget-only or master-absent GL) and the view renders exactly what it is given: the single name when there is one, 'N cost centres' when there are several (the reason line already names each), and 'No cost centre in master' when there are none. Never infer a row's kind from an absent field. Update mis-selection.controller.test.ts and mis-report-view.test.tsx accordingly, including the multi-cost-centre case with nonzero Actual.
- backend/src/mis/mis-selection.dto.ts exists solely to keep the typed Swagger response DTO aligned with the MisSelection* types in contract/src/api.ts, so ANY change to those types mechanically requires the matching change in the DTO in the SAME change. It is authorized in-scope for such a change (recorded on the stage with amend-scope) - do not raise a scope signal for it.
- THREE fixes from the second review round. (1) BLOCKING, and it defeats an explicit contract requirement: entryKeys in mapping-master.ts:114 is recreated inside the per-selection loop, so the loader only rejects a duplicate (cost_centre, gl_code) WITHIN one selection. The contract requires rejecting two entries that claim one triple for different targets ANYWHERE in the master - that is what makes a SAP triple resolve to exactly one statement leaf. Hoist the key set so uniqueness is enforced across the whole master, and add a test that two selections claiming the same triple for different targets is rejected. (2) BLOCKING fan-out risk: the active-batch provenance joins in sqlBuilder.ts:216 match on source_kind and period only, while active batches are also distinguished by PLANT - so a second plant's active batch for the same period multiplies the statement rows. Join on plant as well. This is the same defect class as the one-sided batch attribution fixed during golden-provenance: a provenance join that is not gated on every key of the batch's identity fans out silently. (3) P2: the expanded-row limit in mis-budget.parser.ts:196 counts outlineCount ONCE, but IngestService persists the snapshot per period, so a subtotal-heavy workbook still understates its true row cost - count the snapshot per period in the cap.
- contract/src/measure.ts:59 types DomainSpec.composed.joinKeys as the literal tuple ['gl_code', 'month']. The statement_relation domain that decision 0022 requires joins on leaf_key and month, so it cannot be declared until that type admits the statement grain. contract/src/measure.ts is AUTHORIZED in scope for statement-api. Widen it precisely - a readonly tuple union that admits ['leaf_key','month'] alongside ['gl_code','month'] - and do NOT loosen it to string[]: the literal type is what prevents a domain declaring a join the builder cannot honour. The existing composed governed-financial domain must still type-check unchanged, which is decision 0022's promise that the (gl_code, month) relation is untouched.
- THREE fixes. (1) URGENT despite its P2 label - the statement projection emits one row per (leaf_key, month) and then applies the global LIMIT of loadConfig().maxRows, which defaults to 1000 (backend/src/config.ts:176). The FY 26-27 YTD block spans 12 months over 80 leaves = 960 rows: FORTY rows from silently truncating a financial statement with no error, and one more budget line or one more month takes it over. Fix it at the source - the block needs one total per leaf per PERIOD RANGE, not a row per month, so aggregate over the range in SQL (GROUP BY leaf_key across the block's months) rather than returning 960 rows for the service to sum. That turns the FY-YTD block into ~80 rows and makes the LIMIT a real guard instead of a silent truncator. Additionally, make truncation LOUD: if a statement query returns exactly the limit, fail rather than return a short statement. (2) contract/src/api.ts:255 types FixedScaleMoney as , which accepts '1.2' and '1.234' - so a consumer satisfies the type without supplying paise, defeating the reason the type exists. Constrain it to exactly two decimal places. (3) mis-statement.service.ts:289 returns the FIRST child's percentage label for a zero-budget parent before checking the aggregate actual, so a parent whose children carry different labels can report the wrong one; derive the parent's label from its AGGREGATE budget and actual, the same CASE the governed measure applies.
- The two-decimal-place constraint on FixedScaleMoney was tightened in contract/src/api.ts into a union of template-literal types covering .00 through .99, but backend/src/mis/mis-statement.dto.ts still restates the old loose shape (number-dot-number), so the DTO no longer satisfies MisStatementMeasureBlock and build:backend fails with 'Types of property budget are incompatible'. The DTO must IMPORT FixedScaleMoney from the contract rather than restating its shape: a restated type drifts the moment the contract tightens, which is exactly what happened here. Same rule for every other money field crossing the wire.
- BLOCKING security defect. selectionExecutor.ts:110-111 authorizes a selection by checking that the user's permissions cover every measureId and dimensionId in it - that is the governed model decision 0016 rests on. But sqlBuilder's statement branch calls buildStatementProjection(user, {from,to}, resolvedScope) WITHOUT the selection, so it always projects leaf_key, month and every financial measure regardless of what was selected and authorized. The SQL therefore returns more than the grant covered. Pass the selection into the statement projection and project ONLY its measureIds and dimensionIds, exactly as the non-statement branch does at sqlBuilder.ts:50 onward - an unknown measure must still throw. Add a test proving a selection naming a subset of measures produces SQL projecting only that subset.
- SelectionExecutor runs a SECOND ungrouped query (totalsFor) whenever a selection names any dimension - selectionExecutor.ts:84-87. The statement selects leaf_key, so it would issue two queries per period block, four in all, contradicting its once-per-range criterion; and those totals are unused because the statement derives its grand total by folding leaves per decision 0020. backend/src/chat/selectionExecutor.ts is AUTHORIZED in scope for statement-api to gain a MINIMAL additive includeTotals option that DEFAULTS TO TODAY'S BEHAVIOUR, with mis-statement.service.ts passing it false. Do not change totalsFor, do not change the default, and the composed executor tests must pass unchanged - every other consumer still relies on the automatic totals.
- A top-level optional value narrowed after declaration is not kept narrowed inside later callbacks; resolve and validate it in an IIFE so the exported const is inferred as non-optional.
- tools/junit-run.mjs exits 0 and emits a testcase named after the FILE PATH when --name matches no leaf (D-0024), so a missing-name negative control cannot fail and is not the gate. The gate is that each report's testcase name equals the required leaf id verbatim - a report naming the file path asserted nothing. Verified both halves by hand: a real leaf name yields a testcase named for the leaf, a bogus one yields a testcase named backend/src/mis/mis-drill.service.test.ts. junit-run.mjs stays out of scope for feature tasks; fixing it is D-0024's own trigger.
- backend/src/chat/chat.sse.test.ts is now in this task's write_scope. It is mechanically implied by criterion t-aga-c5: making AskResponse.viewInReport a REQUIRED discriminated union forces every construction site of an AskResponse to supply it, and that test is one. Keep the field required - do NOT revert it to optional. The task grill demanded the union precisely because an absent optional field cannot carry the 'unavailable, and here is why' case, which is the whole point of the field. chat.sse.test.ts is also listed in .prettierignore, so D-0006 applies to it as it does to chat.controller.ts and smalltalk-guard.ts: format it and remove its entry in the same change. Nothing else about the contract changes.
- Two quality-lens P1s asked this task to implement frontend consumption of viewInReport and a client-side prior-turn store. Both are OUT OF SCOPE by the approved plan: assistant-governed-ask is declared user_facing: false and its Surface Impact lists no frontend path; the approved decomposition gives the docked Ask panel and the standalone Ask page to assistant-ask-surfaces (task 2), which owns rendering the link, its stale and absent states, and holding the thread in client state. WORKFLOW.md forbids a task spanning backend and frontend, so implementing them here would violate the decomposition the human approved. A backend task that lands a wire contract its consumer has not been written yet is the normal shape of a sequenced story, not a leftover. Do not re-raise these against this task.
- A security-lens finding claimed this patch must remove chat.service.ts from the D-0006 ignore baseline. It is not in that baseline. Verified three ways on 2026-09-12: 'grep chat.service.ts .prettierignore' returns nothing (the file lists chat/ambiguity.ts, chat.constants.ts, chat.controller.ts, chat.sse.ts, chat.sse.test.ts, smalltalk-guard.ts, suppression.ts and timeWindowParse.ts, but NOT chat.service.ts); it is absent from ignoredBaselineHashes in tools/quality-gate.test.mjs; and 'npx prettier --check backend/src/chat/chat.service.ts' reports it already conforms. There is nothing to remove and no baseline hash to update. D-0006 DOES apply to chat.controller.ts, smalltalk-guard.ts and chat.sse.test.ts, which this task edits and which ARE listed. Read .prettierignore rather than assuming a sibling file shares its neighbours' status.
- A security P1 called MisStatementRouteResponse a retained compatibility layer because it wraps the exported MisStatementRunResponse. It is not. MisStatementRunResponse has LIVE consumers, verified 2026-09-12: frontend/src/features/mis/statement-view.tsx:19 takes it as the shipped statement view's prop, its test builds it, and backend/src/mis/mis-statement-export.test.ts:31 uses it. It is the resolved-or-unresolvable union the report renders today; MisStatementRouteResponse COMPOSES it with the new refresh-required case, which is the normal way to extend a union without breaking its readers. Collapsing or removing it would break the shipped statement view - a frontend file this backend task must not touch (WORKFLOW.md forbids a task spanning both). Do not re-raise this as a leftover. The genuine leftovers in round 1 - conversationId, turnId and the unused ConversationsService injection - were removed.
- node_modules is fully installed in this worktree as of 2026-09-12: zod, typescript-eslint, prettier and recharts all resolve. The orchestrator ran npm install from the host, because a freshly created task worktree starts without node_modules and the sandbox can neither reach the registry nor read the host cache. No product file changed - node_modules is gitignored. Run the five verify commands directly and do NOT attempt npm install, npm ci or any --offline retry; those will fail in the sandbox and are not yours to fix. If a package is genuinely missing, raise a signal naming it rather than trying to install it.
- node_modules is fully installed in THIS worktree as of 2026-09-12: the orchestrator ran 'npm ci --offline --cache /Users/caw-dev-m4-5/.npm' from the host, because forge task start cuts a fresh worktree with no node_modules and the sandbox can neither reach the registry nor read the host cache. Verified after installing: tsc and recharts resolve, esbuild 0.25.12 runs despite skipped install scripts, npm run build:contract compiles, and npm run test:frontend passes 56 tests across 14 files. No product file changed - node_modules is gitignored, so no degraded window was needed. Run the five verify commands directly and do NOT attempt npm install, npm ci or any --offline retry; those are not yours to fix. If a package is genuinely missing, raise a signal naming it.
- backend/src/db/migrate.exploration.db.test.ts cannot reach 127.0.0.1:5432 from the sandbox (EPERM), which is the D-0008 demonstrated-host-evidence model working as designed, not a defect in the test. The orchestrator ran it from the host on 2026-09-12 against the app-db container: tests 1 / pass 1 / fail 0 / skipped 0, with a dead-port PGPORT=5599 control failing the same leaf on ECONNREFUSED, so the pass is real and not a silent skip (D-0024, D-0031). Do NOT weaken the assertions, add a self-skip guard, or point the test at a mock to make it green in the sandbox - and do not retry it there. The leaf stays in quality-gate.test.mjs dbTests and backend/package.json test:db; the host execution is recorded in tests.json as demonstrated evidence.
- node_modules is fully installed in THIS worktree as of 2026-09-12, BEFORE delegation: the orchestrator ran 'npm ci --offline --cache /Users/caw-dev-m4-5/.npm' from the host, because forge task start always cuts a fresh worktree without node_modules and the sandbox can neither reach the registry nor read the host cache. Verified after installing: tsc resolves and npm run test:frontend passes 56 tests across 14 files. No product file changed - node_modules is gitignored, so no degraded window was needed. Run the verify commands directly and do NOT attempt npm install, npm ci or any --offline retry; those fail in the sandbox and are not yours to fix. If a package is genuinely missing, raise a signal naming it rather than trying to install it.
- node_modules is fully installed in THIS worktree as of 2026-09-14: the orchestrator ran 'npm ci --offline --cache /Users/caw-dev-m4-5/.npm' from the host before delegating, because forge task start always cuts a fresh worktree without node_modules and the sandbox can neither reach the registry nor read the host cache. No product file changed - node_modules is gitignored. Run the verify commands directly and do NOT attempt npm install, npm ci or any --offline retry; those fail in the sandbox and are not yours to fix. If a package is genuinely missing, raise a signal naming it.
- NOT A DEFECT, raised as BLOCKING by both the quality and performance lenses in round 2 of assistant-bounded-generation: 'chat.controller.ts is modified here, but the patch removes only the three LLM files from .prettierignore and ignoredBaselineHashes'. Verified three independent ways and false in all three: (1) grep of .prettierignore for chat.controller returns nothing - the file was never ignored; (2) grep of tools/quality-gate.test.mjs for chat.controller matches ONLY 'backend/src/chat/chat.controller.test.ts' in the hermetic test registration, never the source file in any baseline map; (3) 'npx prettier --config .prettierrc.json --ignore-path .prettierignore --check backend/src/chat/chat.controller.ts' reports 'All matched files use Prettier code style' - so the file IS covered by the formatter and IS clean, which is also why npm run format:check passes. There is nothing to remove. The .prettierignore diff correctly removes exactly the three LLM files this task edited that WERE ignored (bedrock.provider.ts, llm.constants.ts, mock.provider.ts). Two lenses agreeing on the same misreading is not corroboration: check .prettierignore and the baseline map directly before acting on a D-0006 finding.
- node_modules is fully installed in THIS worktree as of 2026-09-14: the orchestrator ran 'npm ci --offline --cache /Users/caw-dev-m4-5/.npm' from the host before delegating, because forge task start always cuts a fresh worktree without node_modules and the sandbox can neither reach the registry nor read the host cache. No product file changed - node_modules is gitignored. Run the verify commands directly and do NOT attempt npm install, npm ci or any --offline retry. If a package is genuinely missing, raise a signal naming it.

## The contract as recorded (authoritative over any copy in the plan)

## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Turn a dead-end refusal into a recoverable clarification, on the server. Today four different causes - an absent or ambiguous scope triple, no mapping, no loaded periods, and a missing period - all collapse into one undefined in statementRequest and one NotSupported message, so the product cannot say which one happened. Add the two typed response carriers, the period-free mapping lookup the ordering needs, and the four ordered outcomes. Ships the recoverable clarification on its own; the UI is tasks 2 and 3.

**Acceptance criteria**

- AskResponse gains TWO optional fields sharing one entry type: periodChoice on a ClarificationNeeded response and periodControl on a successful data response. Two carriers, never one, so a recovery and a settled answer cannot be confused. The existing clarify { options: string[], resumesQuestion } at contract/src/api.ts:547 is UNTOUCHED - requiredTimeWindowClarify (ambiguity.ts:15) and domainRoutingAmbiguity still use it and must not regress.
- Each period entry carries a COMPLETE timeWindow - grain, column, from, to - plus value and label. The complete window is required, not a nicety: a period-less base selection has no timeWindow at all, and Selection.timeWindow (contract/src/measure.ts:155) requires grain, so an entry of only {value,label,from,to} would force the client to invent both the grain and the time column. periodChoice also carries the base Selection the selector already produced and the original question verbatim.
- Choosing an offered period issues EXACTLY ZERO selector calls, proven on the SERVER where the claim lives: a hermetic ChatService test over a fake LlmProvider counts one select() call for the original question and ZERO for a request carrying AskRequest.selection. chat.service.ts:146 already runs an edited selection verbatim; this task proves it, and a frontend test could never carry this claim.
- The four causes that today collapse into one undefined resolve in a fixed, first-match-wins order, each with its own response class and message, and ONLY THE LAST offers period options: (1) scope - any of department, function, plant absent OR ambiguous - BlockedByPolicy naming the first offending attribute in that order; (2) no mapping for the resolved triple - NotSupported, its own message; (3) no periods loaded at all - NotSupported, a message DISTINCT from a missing period; (4) period missing, unoffered, or spanning more than one - ClarificationNeeded carrying periodChoice.
- That order needs a seam the resolver does not have. SelectionResolverService.resolve() (selection-resolver.service.ts:57) finds the mapping first but is only reachable with a period supplied, and throws SelectionPeriodUnavailableError at :68 before it can report anything else - so today 'no mapping' and 'no periods loaded' are indistinguishable. This task adds a PERIOD-FREE mapping lookup over the same master data resolve() already uses, and chat.service.ts calls it before consulting periods. statementRequest (chat.service.ts:726) stops returning a bare undefined and returns a discriminated result naming which precondition failed.
- Eligible periods come from SelectionResolverService.options() (selection-resolver.service.ts:40) - the SAME source as the MIS Reports period dropdown, so Ask and the report screen can never disagree about which periods exist - filtered to those the asked question can actually resolve. Measured: offering the raw list would include FY 26-27 YTD, a twelve-month range, which is not_supported 4/4 for a statement because statementPeriod needs a single period point.
- A re-run's response carries the active batch ids that produced the displayed values. The determinism claim is about SELECTOR CALLS, not about values being stable across reloads: under decision 0028 a re-run re-authorizes and reads the currently active batches, so an identical choice may legitimately return different numbers after a batch replacement.
- Hermetic tests over a fake provider and warehouse cover the backend half of the whole matrix, not a sample: missing period; a same-day period that is NOT among the offered ones; a partial-month range; a multi-month range; an empty period list; each of department, function and plant absent AND ambiguous; no mapping; a successful statement answer; a successful governed answer with a window; a successful governed answer with no window. Judged by junit testcase NAME and executed count, never an exit code (D-0024, D-0031).
- New backend test files are registered in backend/package.json and tools/quality-gate.test.mjs, or CI runs none of them. The new failure messages belong in backend/src/chat/chat.constants.ts, which IS listed in .prettierignore, so under D-0006 this task formats it, removes the path, and drops its ignoredBaselineHashes entry in the same change. chat.service.ts, contract/src/api.ts and selection-resolver.service.ts are NOT ignored - checked against .prettierignore, not assumed.

**Write scope** (what `stage done` measures the diff against)

- .prettierignore
- backend/package.json
- backend/src/chat/chat.constants.ts
- backend/src/chat/chat.service.ts
- backend/src/chat/chat.service.test.ts
- backend/src/chat/ask-period.test.ts
- backend/src/mapping/selection-resolver.service.ts
- backend/src/mapping/selection-resolver.service.test.ts
- contract/src/api.ts
- tools/quality-gate.test.mjs

**Required tests** (run by `stage done`)

- `a statement question with no period clarifies with the offered periods instead of refusing` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `the period choice carries the base selection the original question and a complete time window per entry` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `a request carrying an edited selection makes zero selector calls` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `an unoffered same day period a partial month and a multi month range each clarify` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `each of department function and plant absent or ambiguous blocks by policy naming the first offender` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `no mapping and no periods loaded keep distinct outcomes and neither reads as a missing period` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `a successful answer carries a period control whose current entry is the window it ran on` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `a governed answer with no window carries no defaulted period control` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `a rerun response carries the active batch ids that produced its values` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `the period free mapping lookup reports a mapped triple without being given a period` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mapping/selection-resolver.service.test.ts)
- `eligible periods exclude a multi month range that a statement cannot resolve` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mapping/selection-resolver.service.test.ts)

**Verify commands**

- `python3 factory/scripts/verify.py`

**Review budget.** 10 files / 900 lines -- Two optional response fields and one shared entry type in the contract, statementRequest becoming a discriminated result, a period-free mapping lookup on the resolver so 'no mapping' and 'no periods loaded' can be told apart, the four-way ordered branch with its own message per cause in chat.constants.ts, and eligible-period filtering from options(). Eleven hermetic leaves. No UI. D-0006 de-listing of chat.constants.ts accounts for part of the line count because formatting an ignored file rewrites it.

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
- Q: The grill found that /api/chat documents its request body and error statuses but has no typed response DTO — its 201 carries only a description. Decision 0019 makes typed response DTOs mandatory for fresh routes; decision 0012 time-bounds the vendored deviation to the PoC. This story adds two new fields to that response. Pay the debt down now, or keep it inside the recorded deviation?
  A: Keep the deviation, log a deferral (Recommended)

## The artifact under interrogation (task plan ask-period-contract-and-branch)

# Task — ask-period-contract-and-branch

Story: `ask-period-control` · plan: `plans/active/ask-period-control-recoverable-periods-in-ask.md`

## Objective
Turn a dead-end refusal into a recoverable clarification, on the server. Today four different causes
collapse into one `undefined` in `statementRequest` (`backend/src/chat/chat.service.ts:726`) and one
`NotSupported` message, so the product cannot say which one happened. Measured 4/4 against the
running PoC: `Show the MIS statement Actual by statement leaf` returns
*"The answer does not resolve to one statement selector set and offered period."* The same question
with a period works 6/6 with 81 rows.

Backend only. No UI — that is tasks 2 and 3. This task ships the recoverable clarification on its own.

## Workflow

```mermaid
flowchart TD
  A[POST /api/chat] --> B{AskRequest.selection present?}
  B -- yes --> Z[run the edited selection verbatim<br/>chat.service.ts:146 — ZERO selector calls]
  B -- no --> C[selector produces a Selection]
  C --> D{domain == mis-statement?}
  D -- no --> Y[execute; attach periodControl]
  D -- yes --> E{scope triple: one department,<br/>one function, one plant?}
  E -- absent or ambiguous --> E1[BlockedByPolicy<br/>names first offender: department, function, plant<br/>NO period options]
  E -- ok --> F{mapping for the triple?<br/>period-free lookup}
  F -- none --> F1[NotSupported — its own message]
  F -- ok --> G{any periods loaded?}
  G -- none --> G1[NotSupported — distinct message]
  G -- yes --> H{period resolves to one offered period?}
  H -- no --> H1[ClarificationNeeded + periodChoice<br/>base selection, original question,<br/>complete timeWindow per entry]
  H -- yes --> Y
  Y --> X[response carries active batch ids]
```

## Contract

### The two carriers
`contract/src/api.ts` gains one entry type shared by both, and two OPTIONAL fields on `AskResponse`:

- `periodChoice` — on a `ClarificationNeeded` response. Carries the base `Selection` the selector
  already produced, the original question **verbatim**, and the eligible entries.
- `periodControl` — on a successful data response. Carries the same entries with the one matching
  the window the answer ran on marked current.

Each entry carries `value`, `label`, and a **complete** `timeWindow`: `grain`, `column`, `from`,
`to`. The complete window is load-bearing, not a nicety — a period-less base selection has **no**
`timeWindow` at all and `Selection.timeWindow` (`contract/src/measure.ts:155`) requires `grain`, so
an entry of only `{value,label,from,to}` would force the client to invent both the grain and the
time column. `MisSelectionPeriodOption` (`contract/src/api.ts:221`) is the existing `{value,label,
from,to}` shape and is the natural source to widen from, not to reuse as-is.

**`clarify: { options: string[], defaultOption?, resumesQuestion? }` (`contract/src/api.ts:547`) is
untouched.** `requiredTimeWindowClarify` (`ambiguity.ts:15`) and `domainRoutingAmbiguity` still use
it and must not regress. Two carriers, never one.

### The four outcomes, totally ordered
`statementRequest` stops returning a bare `undefined` and returns a discriminated result naming the
failed precondition. `chat.service.ts:318-338` maps each to its own outcome, first match wins:

| # | Cause | Response | Message |
|---|---|---|---|
| 1 | department, function or plant absent **or ambiguous** | `BlockedByPolicy` | names the first offender in that order; **no period options** |
| 2 | no mapping for the resolved triple | `NotSupported` | its own message |
| 3 | no periods loaded at all | `NotSupported` | **distinct** from a missing period |
| 4 | period missing, unoffered, or spanning more than one | `ClarificationNeeded` | carries `periodChoice` |

Note 1 uses `BlockedByPolicy`, not `NotSupported`: scope attributes are provisioned, not
user-selectable (decision 0016), so this is a policy state an administrator resolves.

### The seam this ordering needs
`SelectionResolverService.resolve()` (`selection-resolver.service.ts:57`) finds the mapping first —
but is only reachable with a period supplied, and throws `SelectionPeriodUnavailableError` at `:68`
before it can report anything else. **So today outcomes 2 and 3 are indistinguishable.** Add a
**period-free mapping lookup** over the same `this.master.selections` data `resolve()` already
uses — not a second copy of the rule — and call it from `chat.service.ts` before consulting periods.

### Eligible periods
From `SelectionResolverService.options()` (`selection-resolver.service.ts:40`) — the **same** source
as the MIS Reports period dropdown, so Ask and the report screen can never disagree about which
periods exist — filtered to those the asked question can resolve. Do **not** re-derive months;
re-derivation is how the two surfaces drift apart.

Measured: the raw list includes `FY 26-27 YTD`, a twelve-month range, which is `not_supported` 4/4
for a statement because `statementPeriod` needs a single period point. An eligible list that
contains it would offer a choice guaranteed to fail.

### Batch ids and determinism
The response carries the active batch ids that produced the displayed values. The determinism claim
is about **selector calls**, not stable values: under decision **0028** a re-run re-authorizes and
reads the currently active batches, so an identical choice may legitimately return different numbers
after a batch replacement. Do not write a test asserting values are stable across reloads.

## Manual Verification
1. Start the backend from this worktree with `LLM_PROVIDER=bedrock`, `BEDROCK_MODEL_ID`,
   `AWS_REGION=ap-south-1` and the documented `WAREHOUSE_PG_*`. The default provider is `mock`
   (`config.ts:178`) and `MockLlmProvider` **always** returns `clarify`, so a check against it would
   appear to pass and prove nothing.
2. Sign in as `admin@example.invalid` (OTP `000000`).
3. `POST /api/chat` with `Show the MIS statement Actual by statement leaf` — **before** this task it
   is `not_supported`; **after**, it is `clarification_needed` carrying `periodChoice` whose entries
   include `2026-07-01` and **exclude** `FY 26-27 YTD`.
4. `POST /api/chat` with `{question, selection}` cloned from that `periodChoice` with the July
   window. Expect `success` with 81 rows, and confirm the server made no selector call.
5. `POST /api/chat` with `Show the MIS statement Actual by statement leaf for July 2026` — still
   `success` 81 rows. Sample each of steps 3–5 at least 3 times; this surface's failures are
   intermittent and a single run proves nothing.

## Out of scope
- Any UI. No `ask-panel.tsx`, no `use-ask.ts`, no CSS.
- Letting a user choose among several granted plants, departments or functions.
- A typed response DTO for `/api/chat` — deferred as **D-0046** under decision 0012.
- `requiredTimeWindowClarify`'s day-range options.

## Proof
`python3 factory/scripts/verify.py`, plus the eleven hermetic leaves in `required_tests`. Judge every
one by its junit testcase **name** and **executed count**, never an exit code (D-0024, D-0031).
Register new test files in `backend/package.json` **and** `tools/quality-gate.test.mjs` or CI runs
none of them.

Under **D-0006**, `backend/src/chat/chat.constants.ts` is in `.prettierignore` with a pinned baseline
hash. The new messages belong there, so format it, remove the path from `.prettierignore`, and drop
its `ignoredBaselineHashes` entry in `tools/quality-gate.test.mjs` **in this same change**.
`chat.service.ts`, `contract/src/api.ts` and `selection-resolver.service.ts` are **not** ignored —
checked against the file, not assumed. Note `prettier --write` on a still-ignored path is a silent
no-op and `--check` reports it clean having matched nothing: remove the entry first, then format.

<!-- forge:contract -->
## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Turn a dead-end refusal into a recoverable clarification, on the server. Today four different causes - an absent or ambiguous scope triple, no mapping, no loaded periods, and a missing period - all collapse into one undefined in statementRequest and one NotSupported message, so the product cannot say which one happened. Add the two typed response carriers, the period-free mapping lookup the ordering needs, and the four ordered outcomes. Ships the recoverable clarification on its own; the UI is tasks 2 and 3.

**Acceptance criteria**

- AskResponse gains TWO optional fields sharing one entry type: periodChoice on a ClarificationNeeded response and periodControl on a successful data response. Two carriers, never one, so a recovery and a settled answer cannot be confused. The existing clarify { options: string[], resumesQuestion } at contract/src/api.ts:547 is UNTOUCHED - requiredTimeWindowClarify (ambiguity.ts:15) and domainRoutingAmbiguity still use it and must not regress.
- Each period entry carries a COMPLETE timeWindow - grain, column, from, to - plus value and label. The complete window is required, not a nicety: a period-less base selection has no timeWindow at all, and Selection.timeWindow (contract/src/measure.ts:155) requires grain, so an entry of only {value,label,from,to} would force the client to invent both the grain and the time column. periodChoice also carries the base Selection the selector already produced and the original question verbatim.
- Choosing an offered period issues EXACTLY ZERO selector calls, proven on the SERVER where the claim lives: a hermetic ChatService test over a fake LlmProvider counts one select() call for the original question and ZERO for a request carrying AskRequest.selection. chat.service.ts:146 already runs an edited selection verbatim; this task proves it, and a frontend test could never carry this claim.
- The four causes that today collapse into one undefined resolve in a fixed, first-match-wins order, each with its own response class and message, and ONLY THE LAST offers period options: (1) scope - any of department, function, plant absent OR ambiguous - BlockedByPolicy naming the first offending attribute in that order; (2) no mapping for the resolved triple - NotSupported, its own message; (3) no periods loaded at all - NotSupported, a message DISTINCT from a missing period; (4) period missing, unoffered, or spanning more than one - ClarificationNeeded carrying periodChoice.
- That order needs a seam the resolver does not have. SelectionResolverService.resolve() (selection-resolver.service.ts:57) finds the mapping first but is only reachable with a period supplied, and throws SelectionPeriodUnavailableError at :68 before it can report anything else - so today 'no mapping' and 'no periods loaded' are indistinguishable. This task adds a PERIOD-FREE mapping lookup over the same master data resolve() already uses, and chat.service.ts calls it before consulting periods. statementRequest (chat.service.ts:726) stops returning a bare undefined and returns a discriminated result naming which precondition failed.
- Eligible periods come from SelectionResolverService.options() (selection-resolver.service.ts:40) - the SAME source as the MIS Reports period dropdown, so Ask and the report screen can never disagree about which periods exist - filtered to those the asked question can actually resolve. Measured: offering the raw list would include FY 26-27 YTD, a twelve-month range, which is not_supported 4/4 for a statement because statementPeriod needs a single period point.
- A re-run's response carries the active batch ids that produced the displayed values. The determinism claim is about SELECTOR CALLS, not about values being stable across reloads: under decision 0028 a re-run re-authorizes and reads the currently active batches, so an identical choice may legitimately return different numbers after a batch replacement.
- Hermetic tests over a fake provider and warehouse cover the backend half of the whole matrix, not a sample: missing period; a same-day period that is NOT among the offered ones; a partial-month range; a multi-month range; an empty period list; each of department, function and plant absent AND ambiguous; no mapping; a successful statement answer; a successful governed answer with a window; a successful governed answer with no window. Judged by junit testcase NAME and executed count, never an exit code (D-0024, D-0031).
- New backend test files are registered in backend/package.json and tools/quality-gate.test.mjs, or CI runs none of them. The new failure messages belong in backend/src/chat/chat.constants.ts, which IS listed in .prettierignore, so under D-0006 this task formats it, removes the path, and drops its ignoredBaselineHashes entry in the same change. chat.service.ts, contract/src/api.ts and selection-resolver.service.ts are NOT ignored - checked against .prettierignore, not assumed.

**Write scope** (what `stage done` measures the diff against)

- .prettierignore
- backend/package.json
- backend/src/chat/chat.constants.ts
- backend/src/chat/chat.service.ts
- backend/src/chat/chat.service.test.ts
- backend/src/chat/ask-period.test.ts
- backend/src/mapping/selection-resolver.service.ts
- backend/src/mapping/selection-resolver.service.test.ts
- contract/src/api.ts
- tools/quality-gate.test.mjs

**Required tests** (run by `stage done`)

- `a statement question with no period clarifies with the offered periods instead of refusing` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `the period choice carries the base selection the original question and a complete time window per entry` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `a request carrying an edited selection makes zero selector calls` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `an unoffered same day period a partial month and a multi month range each clarify` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `each of department function and plant absent or ambiguous blocks by policy naming the first offender` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `no mapping and no periods loaded keep distinct outcomes and neither reads as a missing period` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `a successful answer carries a period control whose current entry is the window it ran on` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `a governed answer with no window carries no defaulted period control` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `a rerun response carries the active batch ids that produced its values` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/ask-period.test.ts)
- `the period free mapping lookup reports a mapped triple without being given a period` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mapping/selection-resolver.service.test.ts)
- `eligible periods exclude a multi month range that a statement cannot resolve` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mapping/selection-resolver.service.test.ts)

**Verify commands**

- `python3 factory/scripts/verify.py`

**Review budget.** 10 files / 900 lines -- Two optional response fields and one shared entry type in the contract, statementRequest becoming a discriminated result, a period-free mapping lookup on the resolver so 'no mapping' and 'no periods loaded' can be told apart, the four-way ordered branch with its own message per cause in chat.constants.ts, and eligible-period filtering from options(). Eleven hermetic leaves. No UI. D-0006 de-listing of chat.constants.ts accounts for part of the line count because formatting an ignored file rewrites it.
<!-- /forge:contract -->


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
