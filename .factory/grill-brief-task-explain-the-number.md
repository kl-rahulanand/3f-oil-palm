# Cold-read grill — gate: task — task plan explain-the-number

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
- A warehouse DATE column read through pg and JSON-serialized arrives at the browser as an IST-shifted UTC timestamp (2026-07-01 becomes 2026-06-30T18:30:00.000Z), so a user-facing table shows the WRONG MONTH. Normalize month/date cells to a date-only YYYY-MM-DD string on the server before they enter a result row, and format them for display on the client.
- node-postgres parses a DATE column into a JS Date at LOCAL midnight of the process timezone, so the exact inverse is to read back the PROCESS-LOCAL date parts (getFullYear/getMonth/getDate). Formatting with a hardcoded timeZone such as Asia/Kolkata only happens to work on hosts at or west of that offset and silently returns the previous day on hosts east of it (e.g. Asia/Tokyo), so a date-only normalizer must never pin a timezone.
- RULING (settles the autoreview P1 and signals S-0021/S-0023): the bucket list must emit ONE row per unmapped GL CODE, never one per master bucket ENTRY, because GL/month is the grain of the only amounts that exist - do NOT add a warehouse query path and do NOT touch sqlBuilder.ts or selectionExecutor.ts to recover triple grain. Fold the master's bucket entries by gl_code in mis-selection.service.ts: costCentre keeps the single cost centre when that GL has exactly one bucket entry and is null when it has several (a GL booked across cost centres is no longer a triple, just as a Budget-only GL is not); provisional is true if any folded entry is provisional; reason names each folded entry's cost centre and reason so the list still says WHICH cost centre is wrong; actual and budget are that GL's totals assigned EXACTLY ONCE. This keeps the settled decision (both an Actual and a Budget amount per row, costCentre null where there is no single cost centre), keeps the gap visible rather than absorbed (decision 0018 as amended), and makes the list reconcilable against the slice totals because no amount is ever copied onto two rows. Acceptance criterion 3's word 'triples' means the reviewable identity of the gap, not one row per cost centre. Prove it in mis-selection.controller.test.ts with a master where ONE GL carries TWO bucket entries: expect a single row, costCentre null, and the GL total counted once.
- RULING (settles the autoreview P2/performance blocker at frontend/src/features/mis/mis-report-view.tsx:233): after folding the bucket to GL grain, costCentre === null means THREE different things - a Budget-only GL, a GL absent from the mapping master but carrying real Actual spend, and a GL whose master entries span several cost centres - so any UI label inferred from null (today 'Budget only') mislabels two of the three. FIX IN THE CONTRACT, not the renderer: replace MisSelectionBucketRow.costCentre (string | null) with costCentres: string[] - the master's cost centres for that GL, empty when the master names none. mis-selection.service.ts populates it (one entry when a single bucket entry, several when folded, empty for a Budget-only or master-absent GL) and the view renders exactly what it is given: the single name when there is one, 'N cost centres' when there are several (the reason line already names each), and 'No cost centre in master' when there are none. Never infer a row's kind from an absent field. Update mis-selection.controller.test.ts and mis-report-view.test.tsx accordingly, including the multi-cost-centre case with nonzero Actual.
- backend/src/mis/mis-selection.dto.ts exists solely to keep the typed Swagger response DTO aligned with the MisSelection* types in contract/src/api.ts, so ANY change to those types mechanically requires the matching change in the DTO in the SAME change. It is authorized in-scope for such a change (recorded on the stage with amend-scope) - do not raise a scope signal for it.
- contract/src/measure.ts:59 types DomainSpec.composed.joinKeys as the literal tuple ['gl_code', 'month']. The statement_relation domain that decision 0022 requires joins on leaf_key and month, so it cannot be declared until that type admits the statement grain. contract/src/measure.ts is AUTHORIZED in scope for statement-api. Widen it precisely - a readonly tuple union that admits ['leaf_key','month'] alongside ['gl_code','month'] - and do NOT loosen it to string[]: the literal type is what prevents a domain declaring a join the builder cannot honour. The existing composed governed-financial domain must still type-check unchanged, which is decision 0022's promise that the (gl_code, month) relation is untouched.
- backend/src/app.routes.test.ts holds a STRICT sanctioned-route allow-list (it already names 'GET /api/mis/options' and 'POST /api/mis/run'). Any task that adds an HTTP route must add that exact route string there in the same change or hermetic verification fails - the file is mechanically implied by the route, not separate scope, and is authorized for such a task. Add only the new route; never relax the list into a pattern and never drop an entry, because the list being exhaustive is what makes an accidentally-exposed route fail the build. This applies to statement-api (POST /api/mis/statement) and again to statement-export (POST /api/mis/statement/export).
- THREE fixes. (1) URGENT despite its P2 label - the statement projection emits one row per (leaf_key, month) and then applies the global LIMIT of loadConfig().maxRows, which defaults to 1000 (backend/src/config.ts:176). The FY 26-27 YTD block spans 12 months over 80 leaves = 960 rows: FORTY rows from silently truncating a financial statement with no error, and one more budget line or one more month takes it over. Fix it at the source - the block needs one total per leaf per PERIOD RANGE, not a row per month, so aggregate over the range in SQL (GROUP BY leaf_key across the block's months) rather than returning 960 rows for the service to sum. That turns the FY-YTD block into ~80 rows and makes the LIMIT a real guard instead of a silent truncator. Additionally, make truncation LOUD: if a statement query returns exactly the limit, fail rather than return a short statement. (2) contract/src/api.ts:255 types FixedScaleMoney as , which accepts '1.2' and '1.234' - so a consumer satisfies the type without supplying paise, defeating the reason the type exists. Constrain it to exactly two decimal places. (3) mis-statement.service.ts:289 returns the FIRST child's percentage label for a zero-budget parent before checking the aggregate actual, so a parent whose children carry different labels can report the wrong one; derive the parent's label from its AGGREGATE budget and actual, the same CASE the governed measure applies.
- The two-decimal-place constraint on FixedScaleMoney was tightened in contract/src/api.ts into a union of template-literal types covering .00 through .99, but backend/src/mis/mis-statement.dto.ts still restates the old loose shape (number-dot-number), so the DTO no longer satisfies MisStatementMeasureBlock and build:backend fails with 'Types of property budget are incompatible'. The DTO must IMPORT FixedScaleMoney from the contract rather than restating its shape: a restated type drifts the moment the contract tightens, which is exactly what happened here. Same rule for every other money field crossing the wire.
- TWO fixes. (1) The gated proof still exercises only July - a SINGLE month - so the range aggregation that the whole grain change exists for is UNPROVEN. Extend statement-projection.db.test.ts with a multi-month case over the FY 26-27 YTD range asserting that it returns one row per leaf (about 80) rather than one per leaf-month (about 960), and that each leaf's Actual and Budget equal the sum of its months. That is the assertion that would have caught the truncation hazard, and without it the fix is only asserted. Keep the existing July assertions unchanged. (2) mis-statement.service.ts:85 dedupes the two period blocks by comparing the selected PERIOD ID to the FY-YTD id, but the degenerate case is really RANGE equality: selecting 2026-04-01, the FY start, gives a selected block whose from/to equal the YTD block's, so the statement again prints the same figures twice under two headings - the exact outcome the human ruled against. Dedupe on (from, to) equality, not on the period identifier.
- BLOCKING security defect. selectionExecutor.ts:110-111 authorizes a selection by checking that the user's permissions cover every measureId and dimensionId in it - that is the governed model decision 0016 rests on. But sqlBuilder's statement branch calls buildStatementProjection(user, {from,to}, resolvedScope) WITHOUT the selection, so it always projects leaf_key, month and every financial measure regardless of what was selected and authorized. The SQL therefore returns more than the grant covered. Pass the selection into the statement projection and project ONLY its measureIds and dimensionIds, exactly as the non-statement branch does at sqlBuilder.ts:50 onward - an unknown measure must still throw. Add a test proving a selection naming a subset of measures produces SQL projecting only that subset.
- SelectionExecutor runs a SECOND ungrouped query (totalsFor) whenever a selection names any dimension - selectionExecutor.ts:84-87. The statement selects leaf_key, so it would issue two queries per period block, four in all, contradicting its once-per-range criterion; and those totals are unused because the statement derives its grand total by folding leaves per decision 0020. backend/src/chat/selectionExecutor.ts is AUTHORIZED in scope for statement-api to gain a MINIMAL additive includeTotals option that DEFAULTS TO TODAY'S BEHAVIOUR, with mis-statement.service.ts passing it false. Do not change totalsFor, do not change the default, and the composed executor tests must pass unchanged - every other consumer still relies on the automatic totals.
- A top-level optional value narrowed after declaration is not kept narrowed inside later callbacks; resolve and validate it in an IIFE so the exported const is inferred as non-optional.
- BLOCKING (contract verdict t-sa-c1 partial). The statement domain still declares a 'month' dimension, and sqlBuilder.ts:184 projects it as periodStart::date AS month. That was honest at leaf/MONTH grain, but the projection now aggregates over a period RANGE, so an April-to-July block returns a row labelled '2026-04-01' - the statement claims a single month for figures spanning four. A single date cannot represent a range. Remove 'month' from the statement domain's dimensions in semanticLayer.ts and drop the periodStart special case from the projection: the block already carries its own from and to in MisStatementMeasureBlock, which is where the period belongs. Leaf_key remains the only statement dimension. Update the statement tests and the gated proof to stop selecting a month dimension. A registered dimension that cannot be projected truthfully is worse than an absent one, because consumers will believe it.
- The generated workbook's row-1 block headers read '2026-07-01' and 'FY 26-27 YTD' - the payload's RAW label values - while the statement on screen shows 'July 2026' and 'FY 26-27 (YTD to Jul)'. That is export drift in the headings, the precise defect class this task exists to prevent: a sheet laid beside the screen must agree, headings included. statement-view derives the heading from each block's own from/to (same month gives 'July 2026'; a span gives 'FY 26-27 (YTD to <last month>)'), and the export must derive it the SAME way from the same fields rather than writing block.label. Assert the derived headings in the reopened-workbook test, including the single-block case. Everything else in the workbook is correct and must not move: worksheet 'Financial MIS', 109 rows, merged identity and per-block groups on row 1, column labels on row 2, preorder data from row 3 with outline levels 0-3, a merged Grand Total last row, amounts as NUMBERS rounded to the rupee with format rupee-hash-comma-zero, percentages as numbers with 0.00% format, NA for nulls, and the grand total reading 10050136 Budget against 11512712 Actual.
- BLOCKING, raised independently by the performance and security lenses: mis-statement.controller.ts:32 declares the export service as an OPTIONAL constructor parameter (exporter?) while the export route immediately dereferences it with this.exporter!.write(...). MisModule always provides it, so the optionality buys nothing and the non-null assertion turns a wiring mistake into a runtime crash on a user's download instead of a startup failure. Make it a required constructor dependency and delete the non-null assertion, so a missing provider fails at module construction where it belongs.
- Making MisStatementExportService a REQUIRED constructor dependency of MisStatementController - the blocking fix both the performance and security lenses raised - breaks backend/src/mis/mis-statement.controller.test.ts, whose construction passes only the statement service and now fails TS2554. That file is AUTHORIZED in scope for statement-export-api: add a minimal exporter stub to the constructor call and change NO assertion, because those assertions are statement-api's shipped evidence for the statement route and must still hold unchanged.
- tools/junit-run.mjs exits 0 and emits a testcase named after the FILE PATH when --name matches no leaf (D-0024), so a missing-name negative control cannot fail and is not the gate. The gate is that each report's testcase name equals the required leaf id verbatim - a report naming the file path asserted nothing. Verified both halves by hand: a real leaf name yields a testcase named for the leaf, a bogus one yields a testcase named backend/src/mis/mis-drill.service.test.ts. junit-run.mjs stays out of scope for feature tasks; fixing it is D-0024's own trigger.
- t-dta-c3's 'wrong-period id is a REFUSAL' means a pin whose CLAIMED period disagrees with the batch's real period, which mis-drill.service.ts:125-136 already refuses. It does NOT mean an actuals pin for a month outside the drilled block. mis-statement.service.ts:105 unions provenance.activeBatchIds across BOTH measure blocks, so a July statement carries April-July actuals batches, and the contract has the client send that array VERBATIM - a July-block drill therefore always receives out-of-range pins, and refusing them would break every selected-month drill. Filtering them at mis-drill.service.ts:139 is correct and safe: the SQL is independently month-bounded at drill-transactions.repository.ts:115, so a surplus batch id cannot widen the read, and every pin still appears in the per-batch statuses. Do not report this as a partial fulfilment of t-dta-c3.
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
- Two legitimate findings to fix; the D-0006 blocker is rejected separately with evidence. (1) performance P2, llm.constants.ts:5: LLM_SELECTOR_RETRY_MAX_TOKENS 4096 is too high now that the first cap is 512. Output saturates at whatever cap is set - measured repeatedly - so a tool-less first response makes the retry cost roughly eight times the first attempt, which is the opposite of this task's purpose. Lower it to 1536: still comfortably ABOVE 512 so attempt two genuinely differs as the contract requires, but bounded. Update any test asserting the number. (2) security P2, chat.controller.ts:65: once('close') only observes FUTURE events, so a response already destroyed before the listener registers never aborts. Check the destroyed/writableEnded state immediately after registering and abort at once if the connection is already gone, then keep the listener for the normal case. Cover both with a leaf: an already-destroyed response aborts, and a live one aborts only on a later close.
- node_modules is fully installed in THIS worktree as of 2026-09-14: the orchestrator ran 'npm ci --offline --cache /Users/caw-dev-m4-5/.npm' from the host before delegating, because forge task start always cuts a fresh worktree without node_modules and the sandbox can neither reach the registry nor read the host cache. No product file changed - node_modules is gitignored. Run the verify commands directly and do NOT attempt npm install, npm ci or any --offline retry. If a package is genuinely missing, raise a signal naming it.
- For all-plants-backend: making MisStatementMeasureBlock.budgetState required is the approved contract; the four frontend test fixtures that build blocks without it get budgetState: 'loaded' added — a FIXTURE-ONLY edit to frontend/src/features/mis/*.test.tsx, authorized (signal S-0014 resolved) and adopted by stage amend-scope at close. No frontend component or behaviour changes; frontend typecheck must be green.
- node_modules is fully installed in THIS worktree as of 2026-09-16: the orchestrator ran 'npm ci --offline --cache /Users/caw-dev-m4-5/.npm' from the host BEFORE delegating, because forge task start always cuts a fresh worktree without node_modules and the sandbox can neither reach the registry nor read the host cache. No product file changed - node_modules is gitignored. Run the verify commands directly and do NOT attempt npm install, npm ci or any --offline retry; those fail in the sandbox and are not yours to fix. If a package is genuinely missing, raise a signal naming it.
- RULING on signal S-0019-701b, already applied to the recorded contract: backend/src/chat/chat.controller.ts AND backend/src/mis/mis.module.ts are now in this task's write_scope. The controller is what forwards parsed request fields to ChatService on BOTH the buffered and the streamed path (chat.controller.ts:37-40 and :76-77), so forward statementGrounding on both - the server-side verification this task exists to build is unreachable otherwise, and the streamed path must not be forgotten. mis.module.ts is included because a Nest provider must be registered in the module that supplies it and the attestation provider has nowhere else to live. Nothing else is authorized: do NOT change classification, do NOT answer a grounded question, and do NOT reach the LLM path - a verified grounded request returns the verified-but-unanswered outcome that task 2 replaces, and a required leaf asserts exactly that. The scope was extended rather than escalated because both files are mechanically implied by the recorded criteria.
- RULING on S-0020-199d, taken from the repo's own conventions rather than invented: the signing keys are STATEMENT_ATTESTATION_SECRETS, ';'-separated (config.ts:98 already uses ';' for SEED_USERS, and AUTH_JWT_SECRET is the secret naming precedent). The FIRST key signs and ANY listed key verifies, so rotation does not invalidate live statements. Entries are trimmed and an empty or whitespace-only entry THROWS rather than being filtered out - silently skipping one could leave the list empty and yield an unsigned context, which is the exact failure this task exists to prevent. TTL is STATEMENT_ATTESTATION_TTL_MINUTES, default 30, bounded 1..240 inclusive, out-of-range throws. Read BOTH where the attestation provider is CONSTRUCTED, never inside loadConfig(), because loadConfig() runs throughout the backend and every existing hermetic leaf would fail for want of a secret; hermetic tests supply a fixture secret explicitly.
- THREE fixes; the review scored security 1, performance 3, quality 4 with ten blocking findings. (1) SECURITY P1, raised by all three lenses - statement-grounding.service.ts:62 validates a pinned batch by id, source and period only, while DrillBatch carries isActive and the fixtures deliberately populate it, so a batch that is no longer active passes verification. Do NOT simply 'reject inactive': that would contradict accepted decision 0025, which requires a REPLACED-but-still-present batch to be read and reported and refuses only a GONE one. CLASSIFY instead: not found => gone => typed refusal now; present but not active => replaced => NOT a grounding refusal, carry the classification forward for task 2 to report; present and active => active. Ignoring isActive is the defect, because it makes the three indistinguishable. (2) SECURITY P1 - mis-statement.service.ts:66 still silently constructs a StatementAttestationService from the environment when a caller omits the dependency. That is exactly the 'no development fallback' the contract forbids: it is a path on which an unverified or self-issued context can exist. Delete it and make the dependency required; the module owns construction. (3) SECURITY P1 and performance - chat.service.ts:64 keeps StatementGroundingService optional with an unreachable 'grounding unavailable' branch, purely for callers using the old constructor shape. ChatModule always registers it, so make it required and delete the branch. (4) QUALITY - chat.schemas.ts:37 leaves node and block optional and the pairwise refinement accepts a request where BOTH are absent, so grounding can arrive with no subject at all; require them together. Update the affected fixtures rather than keeping shim constructors, and add a leaf for the inactive/gone batch classification and one for the both-absent schema case.
- RULING on S-0021-e132, already applied to the recorded contract: backend/src/chat/ask-period.test.ts, chat.controller.test.ts, chat.service.test.ts, backend/src/mis/mis-statement.controller.test.ts and backend/src/warehouse/all-plants-reconciliation.db.test.ts are now in write_scope. They are the complete set that constructs ChatService or MisStatementService directly, so deleting the compatibility defaults - the review's binding P1 - means each must pass the new dependency or it will not compile. Do not forget all-plants-reconciliation.db.test.ts: it is DB-gated and SKIPPED in the hermetic run, so a missing argument there will not surface as a test failure, only as a typecheck failure in verify. Update constructor arguments only; do NOT change what those fixtures assert, and do not reintroduce an optional parameter or an environment-constructed fallback to avoid touching them - that fallback is the security finding.
- TWO non-blocking P2s from the clean round-2 review that are worth fixing rather than deferring, because both weaken a guarantee this task exists to make. (1) statement-grounding.service.test.ts:51 - the leaf that claims to prove the re-read outline digest check ALWAYS returns the same outline used to issue the attestation and then changes only the node, so the DIGEST MISMATCH path is never exercised. C7 is therefore unproven: the service could skip the digest comparison entirely and that leaf would still pass. This is the same false-green class as D-0024 and D-0031 - a test that asserts nothing about the path it names. Add a case that returns a DIFFERENT outline than the one attested and assert the typed refusal. (2) chat.schemas.ts:40 - nodeMetadata and its nested glCodes/costCentres arrays carry no .max() bounds, and that client-supplied structure is sorted and hashed during verification. Bound the array lengths and the string lengths in the schema so unbounded client input cannot drive the sort and hash; the route is authenticated and CSRF-protected so this is hardening rather than an open door, but hashing unbounded client input is not something to ship knowingly. Do NOT change any other behaviour: the batch classification, the required dependencies and the refusal set are all settled and reviewed clean.

## The contract as recorded (authoritative over any copy in the plan)

## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Turn an attested, grounded question into an explanation. Extract the drill's raw-read seam so the assistant and the drill controller share one sensitive query, classify intent deterministically, and answer a leaf with its roll-up path and transactions through a typed response union. Still no UI.

**Acceptance criteria**

- A domain seam is EXTRACTED from MisDrillService returning typed outcomes - ok, replaced, gone, audit-failed - instead of throwing HTTP exceptions, and takes the row limit as an argument. MisDrillService is controller-oriented today (mis-drill.service.ts:27) and unavailable to ChatModule, so without the extraction this task would either duplicate the sensitive pinned-batch query or lose its typed outcomes to the global error filter. The drill controller and the assistant both call the ONE seam; the assistant asks for 20 rows and the drill panel keeps its 100.
- Intent is a closed enum - composition, causal, data - resolved against a FIXTURE TABLE the tests own, with a causal cue WINNING when both appear. Today's guard does not classify 'how is this 85000' as causal at all (reconciliation-guard.ts:31); it matches why, reason and explain. Composition is answered, causal is still declined with today's copy, and data falls through to the existing ungrounded path with NO pin or budget promise attached.
- A LEAF explanation names the roll-up path - the GL codes and cost centres the master folds into that leaf, and the bucket they arrive through - and lists transactions with an exact footer, the true total count, and the first 20 rows.
- Footing is asserted in PAISE against the statement payload, not the rendered cell. The statement displays rupees and the shipped drill contract permits the exact footer to differ from the displayed cell by up to Rs 1 with paise equality underneath, so a leaf asserts paise equality and never rupee equality.
- The leaf read carries the drill's governed-read protections, not the ordinary chat audit: inputs re-derived, pins validated, current scope applied, the exact predicate audited BEFORE the query runs, and a failed audit returning a SAFE TYPED REFUSAL having never queried.
- Staleness follows decision 0025 exactly: a REPLACED but still present batch is READ AND REPORTED as replaced; only a GONE batch is refused. Both are typed, naming source, period and batch status. The shipped drill PANEL diverges from this by hiding the lines - that divergence is ledgered as D-0051 and is deliberately NOT fixed here.
- Budget is refused as a subject IN THE BACKEND, because a crafted focus on a Budget cell cannot be caught by a client-side rule.
- Every grounded explanation carries a distinct budgetState of not-loaded when the plant is not the budget owner (decision 0034), kept distinct from a replaced or gone batch. An unmapped-GL line is described as provisional, not as an approved mapping.
- The explanation is an in-band TYPED RESPONSE UNION on the existing chat transport with a variant per outcome: focus-required, leaf, aggregate, replaced, gone and safe audit-failure. 'No focus' is a SERVER outcome returning focus-required, not a local guess, and it extends the refusal variants task 1 already shipped rather than inventing a second union.
- No SERVER-SOURCED transaction row, amount, batch identifier, measure value or result row reaches the model. A leaf asserts the PROVIDER PAYLOAD, not the rendered answer. The user's own question and prior-turn text may carry figures - the motivating question does - so the rule binds what the server read, never what the user typed.
- The union is schema'd and documented on BOTH the buffered and the streamed chat route (decision 0019); they are separate routes and must not drift. Hermetic leaves use a deterministic classifier and a FAKE provider, never Bedrock, and every new test file is registered in BOTH backend/package.json's test:hermetic allow-list AND tools/quality-gate.test.mjs.
- D-0052, whose trigger is this task: the leaf that proves the re-read outline digest check must exercise the MISMATCH path by returning a DIFFERENT outline than the one attested, because today it returns the same outline and varies only the node - so the comparison could be skipped entirely and the leaf would still pass. Bound the client-supplied nodeMetadata arrays and their strings in chat.schemas.ts as well, since that structure is sorted and hashed during verification.
- D-0053, whose trigger is this task: read pinned-batch existence and the authoritative active-batch state in ONE query in statement-grounding.service.ts, so a stale row cannot be reconciled against an active-batch answer read at a different instant.

**Write scope** (what `stage done` measures the diff against)

- contract/src/api.ts
- backend/package.json
- tools/quality-gate.test.mjs
- backend/src/chat/chat.controller.ts
- backend/src/chat/chat.schemas.ts
- backend/src/chat/chat.schemas.test.ts
- backend/src/chat/chat.service.ts
- backend/src/chat/chat.service.test.ts
- backend/src/chat/chat.sse.test.ts
- backend/src/chat/reconciliation-guard.ts
- backend/src/chat/reconciliation-guard.test.ts
- backend/src/chat/statement-explanation.service.ts
- backend/src/chat/statement-explanation.service.test.ts
- backend/src/chat/statement-grounding.service.ts
- backend/src/chat/statement-grounding.service.test.ts
- backend/src/chat/statement-intent.ts
- backend/src/chat/statement-intent.test.ts
- backend/src/chat/chat.module.ts
- backend/src/mis/mis-drill.controller.ts
- backend/src/mis/mis-drill.service.ts
- backend/src/mis/mis-drill.service.test.ts
- backend/src/mis/mis.module.ts

**Required tests** (run by `stage done`)

- `the extracted seam returns a typed replaced outcome instead of throwing and the drill controller still maps it to its shipped response` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mis/mis-drill.service.test.ts)
- `the assistant asks the seam for twenty rows while the drill panel keeps its hundred row page` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mis/mis-drill.service.test.ts)
- `a gone batch is refused while a replaced but present batch is read and reported` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a failed audit returns a safe typed refusal and never runs the query` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a leaf explanation foots in paise against the statement payload and reports the true total count with twenty rows` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a leaf explanation names the gl codes and cost centres the master folds into that leaf` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a crafted budget focus is refused by the backend` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a non owner plant carries budgetState not loaded distinct from a replaced or gone batch` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `no server sourced row amount batch id or measure value appears in the provider payload while the users own question may carry a figure` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a grounded question with no focused node returns the focus required variant from the server` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `the intent fixture table resolves composition and causal and lets the causal cue win when both appear` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-intent.test.ts)
- `an ungrounded causal question still receives the shipped causal copy` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/reconciliation-guard.test.ts)
- `a re read outline that differs from the attested one is refused on the digest mismatch` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-grounding.service.test.ts)
- `oversized node metadata arrays are rejected by the schema before being sorted and hashed` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.schemas.test.ts)
- `pinned batch existence and the active batch are read in one query so a stale row cannot override the active one` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-grounding.service.test.ts)

**Verify commands**

- `python3 factory/scripts/verify.py`

**Review budget.** 22 files / 1400 lines -- A seam extraction with typed outcomes shared by two callers, a deterministic intent table, the explanation service, and the response union across two chat routes - plus D-0052 and D-0053, whose recorded trigger is this task and which open the same files. No UI. The largest of the three tasks, and the one where the governed-read protections live.

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
- Q: C14 says a tampered node/block/pin set must be refused. But the request is client-held, so the server cannot tell tampering from another perfectly valid line in the same statement. Re-deriving scope proves the user is allowed the data; it does NOT prove the question is about the screen. How strong should that guarantee be?
  A: Attested statement context (Recommended)
- Q: The docked assistant and /ask share one AskProvider, so turns survive navigation. A grounded explanation could therefore appear on /ask — which you said must stay exactly as today. What should happen to grounded turns when the user leaves the MIS screen?
  A: Keep /ask fully isolated (Recommended)
- Q: The attested context has to reach the client somehow. Adding it to the existing MIS statement response touches a contract the shipped report screen, its export and its tests already depend on. Where should it come from?
  A: Add it to the statement response (Recommended)
- Q: Decision 0025 says a replaced-but-still-present batch should be READ and reported. The drill service does that — but the shipped drill panel then HIDES the lines and tells the user to regenerate. So my rule that the same line can't behave two ways is already broken today. What should the assistant do?
  A: Assistant reports it; ledger the panel's divergence (Recommended)
- Q: The attested context and node metadata are new fields on the statement response. Making them REQUIRED breaks existing typed fixtures in the backend export test and the frontend statement/drill/report tests — all type-checked, all outside this task's scope. How should the contract declare them?
  A: Optional in the type, always populated, asserted by a leaf (Recommended)

## The artifact under interrogation (task plan explain-the-number)

# Task plan — explain-the-number

## What this task is
Turn an attested, verified grounding into an **explanation**. Task 1 ended at a
verified-but-unanswered outcome; this task replaces it with the answer, and does so through the
drill's existing governed-read protections rather than beside them.

Still no UI. Task 3 renders what this returns.

## Workflow

```mermaid
flowchart TD
    Q[Grounded question arrives, already verified by task 1] --> I{Intent, from the fixture table}
    I -->|causal cue present| D[Decline with today's copy]
    I -->|data| E[Existing ungrounded path, no pin or budget promise]
    I -->|composition| F{Focused node?}
    F -->|no| FR[focus-required variant]
    F -->|Budget cell| BR[Refused: Budget is not a subject]
    F -->|aggregate| AG[aggregate variant: an INSTRUCTION only<br/>task 3 projects it in the browser]
    F -->|leaf| S[Raw-read seam]

    S --> P{Pinned batches}
    P -->|gone| G[gone: refused, names source and period]
    P -->|replaced| R[replaced: READ AND REPORTED - decision 0025]
    P -->|current| A[Audit the exact predicate FIRST]
    R --> A
    A -->|audit fails| AF[Safe refusal - query never runs]
    A -->|audit written| QY[Query 20 rows + true count + exact footer]
    QY --> L[leaf variant: roll-up path + transactions]
```

## Approach

**Extract, do not copy.** `MisDrillService.run` (mis-drill.service.ts:27) already holds everything
this needs - authorize, canonical plant and scope, resolve, block, `bindPins`, outline lookup,
`leafTriples`, `buildQueries`, and the pre-query audit - but it is controller-oriented: it returns
HTTP-shaped refusals through `refuse(...)` and is not available to `ChatModule`. The seam moves
that body out and returns **typed outcomes** (`ok`, `replaced`, `gone`, `audit-failed`) with the
row limit as an argument. The drill controller maps those back to its shipped response so its
behaviour does not change; the assistant renders them as variants. **Exactly one pinned-batch
query may exist afterwards.**

**The roll-up path is already computed.** `leafTriples(resolution, leafKey)` yields the
(plant, cost centre, GL) triples the master folds into that leaf - that is the "how did it come to
be" half, and it needs no new query.

**Intent is a table, not prose.** Today's guard matches "why", "reason" and "explain" and does
**not** classify "how is this 85000" as causal at all, so the boundary is built here. A causal cue
wins when both appear, because the safe reading wins.

**Rows.** The assistant asks the seam for 20; the drill panel keeps its 100. The answer always
carries the exact footer and the **true** total count, so a bounded list never reads as the whole
list.

**Footing is paise.** Against the statement payload, never the rendered cell - the statement
rounds to rupees and the shipped drill contract already tolerates up to Rs 1 there.

**Staleness is decision 0025, not intuition.** Replaced-but-present is read and reported; only
gone is refused. The shipped drill panel hides those lines instead, which is D-0051's ledgered
divergence - do not "fix" the panel here.

**The two deferrals whose trigger is this task.** D-0052: the digest leaf must return a
**different** outline than the one attested, because today it returns the same one and varies only
the node, so the mismatch branch is unexercised and the comparison could be skipped entirely
without failing; also bound the client-supplied `nodeMetadata` arrays and strings, which are
sorted and hashed. D-0053: read batch existence and the active batch in **one** query.

## Manual Verification
1. Start the backend with `LLM_PROVIDER=bedrock` and a seeded admin, generate the Agriculture
   Nursery DUB statement for July 2026.
2. Click a leaf Actual and ask "how is this 85000" - expect the roll-up path naming GL codes and
   cost centres, then transactions with a footer that foots to the cell.
3. Ask "why is this so high?" on the same node - expect today's causal decline, not an explanation.
4. Ask "how is this built and why is it high" - expect the decline, because the causal cue wins.
5. Ask an ordinary data question with the statement on screen - expect the normal ungrounded answer.
6. Click a subtotal and ask - expect the aggregate variant carrying an instruction and no raw rows.
7. Click a Budget cell and craft the same request against the API - expect a backend refusal.
8. Re-ingest that period so the pinned actual batch is replaced, then ask again - expect the
   figures WITH a replaced notice naming source and period, not a refusal.
9. Check the audit table: the drill event is written before the query, and a forced audit failure
   returns the safe refusal with no query in the log.
10. Confirm `/ask` still answers an ordinary question exactly as before.

<!-- forge:contract -->
## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Turn an attested, grounded question into an explanation. Extract the drill's raw-read seam so the assistant and the drill controller share one sensitive query, classify intent deterministically, and answer a leaf with its roll-up path and transactions through a typed response union. Still no UI.

**Acceptance criteria**

- A domain seam is EXTRACTED from MisDrillService returning typed outcomes - ok, replaced, gone, audit-failed - instead of throwing HTTP exceptions, and takes the row limit as an argument. MisDrillService is controller-oriented today (mis-drill.service.ts:27) and unavailable to ChatModule, so without the extraction this task would either duplicate the sensitive pinned-batch query or lose its typed outcomes to the global error filter. The drill controller and the assistant both call the ONE seam; the assistant asks for 20 rows and the drill panel keeps its 100.
- Intent is a closed enum - composition, causal, data - resolved against a FIXTURE TABLE the tests own, with a causal cue WINNING when both appear. Today's guard does not classify 'how is this 85000' as causal at all (reconciliation-guard.ts:31); it matches why, reason and explain. Composition is answered, causal is still declined with today's copy, and data falls through to the existing ungrounded path with NO pin or budget promise attached.
- A LEAF explanation names the roll-up path - the GL codes and cost centres the master folds into that leaf, and the bucket they arrive through - and lists transactions with an exact footer, the true total count, and the first 20 rows.
- Footing is asserted in PAISE against the statement payload, not the rendered cell. The statement displays rupees and the shipped drill contract permits the exact footer to differ from the displayed cell by up to Rs 1 with paise equality underneath, so a leaf asserts paise equality and never rupee equality.
- The leaf read carries the drill's governed-read protections, not the ordinary chat audit: inputs re-derived, pins validated, current scope applied, the exact predicate audited BEFORE the query runs, and a failed audit returning a SAFE TYPED REFUSAL having never queried.
- Staleness follows decision 0025 exactly: a REPLACED but still present batch is READ AND REPORTED as replaced; only a GONE batch is refused. Both are typed, naming source, period and batch status. The shipped drill PANEL diverges from this by hiding the lines - that divergence is ledgered as D-0051 and is deliberately NOT fixed here.
- Budget is refused as a subject IN THE BACKEND, because a crafted focus on a Budget cell cannot be caught by a client-side rule.
- Every grounded explanation carries a distinct budgetState of not-loaded when the plant is not the budget owner (decision 0034), kept distinct from a replaced or gone batch. An unmapped-GL line is described as provisional, not as an approved mapping.
- The explanation is an in-band TYPED RESPONSE UNION on the existing chat transport with a variant per outcome: focus-required, leaf, aggregate, replaced, gone and safe audit-failure. 'No focus' is a SERVER outcome returning focus-required, not a local guess, and it extends the refusal variants task 1 already shipped rather than inventing a second union.
- No SERVER-SOURCED transaction row, amount, batch identifier, measure value or result row reaches the model. A leaf asserts the PROVIDER PAYLOAD, not the rendered answer. The user's own question and prior-turn text may carry figures - the motivating question does - so the rule binds what the server read, never what the user typed.
- The union is schema'd and documented on BOTH the buffered and the streamed chat route (decision 0019); they are separate routes and must not drift. Hermetic leaves use a deterministic classifier and a FAKE provider, never Bedrock, and every new test file is registered in BOTH backend/package.json's test:hermetic allow-list AND tools/quality-gate.test.mjs.
- D-0052, whose trigger is this task: the leaf that proves the re-read outline digest check must exercise the MISMATCH path by returning a DIFFERENT outline than the one attested, because today it returns the same outline and varies only the node - so the comparison could be skipped entirely and the leaf would still pass. Bound the client-supplied nodeMetadata arrays and their strings in chat.schemas.ts as well, since that structure is sorted and hashed during verification.
- D-0053, whose trigger is this task: read pinned-batch existence and the authoritative active-batch state in ONE query in statement-grounding.service.ts, so a stale row cannot be reconciled against an active-batch answer read at a different instant.

**Write scope** (what `stage done` measures the diff against)

- contract/src/api.ts
- backend/package.json
- tools/quality-gate.test.mjs
- backend/src/chat/chat.controller.ts
- backend/src/chat/chat.schemas.ts
- backend/src/chat/chat.schemas.test.ts
- backend/src/chat/chat.service.ts
- backend/src/chat/chat.service.test.ts
- backend/src/chat/chat.sse.test.ts
- backend/src/chat/reconciliation-guard.ts
- backend/src/chat/reconciliation-guard.test.ts
- backend/src/chat/statement-explanation.service.ts
- backend/src/chat/statement-explanation.service.test.ts
- backend/src/chat/statement-grounding.service.ts
- backend/src/chat/statement-grounding.service.test.ts
- backend/src/chat/statement-intent.ts
- backend/src/chat/statement-intent.test.ts
- backend/src/chat/chat.module.ts
- backend/src/mis/mis-drill.controller.ts
- backend/src/mis/mis-drill.service.ts
- backend/src/mis/mis-drill.service.test.ts
- backend/src/mis/mis.module.ts

**Required tests** (run by `stage done`)

- `the extracted seam returns a typed replaced outcome instead of throwing and the drill controller still maps it to its shipped response` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mis/mis-drill.service.test.ts)
- `the assistant asks the seam for twenty rows while the drill panel keeps its hundred row page` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mis/mis-drill.service.test.ts)
- `a gone batch is refused while a replaced but present batch is read and reported` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a failed audit returns a safe typed refusal and never runs the query` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a leaf explanation foots in paise against the statement payload and reports the true total count with twenty rows` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a leaf explanation names the gl codes and cost centres the master folds into that leaf` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a crafted budget focus is refused by the backend` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a non owner plant carries budgetState not loaded distinct from a replaced or gone batch` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `no server sourced row amount batch id or measure value appears in the provider payload while the users own question may carry a figure` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `a grounded question with no focused node returns the focus required variant from the server` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-explanation.service.test.ts)
- `the intent fixture table resolves composition and causal and lets the causal cue win when both appear` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-intent.test.ts)
- `an ungrounded causal question still receives the shipped causal copy` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/reconciliation-guard.test.ts)
- `a re read outline that differs from the attested one is refused on the digest mismatch` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-grounding.service.test.ts)
- `oversized node metadata arrays are rejected by the schema before being sorted and hashed` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.schemas.test.ts)
- `pinned batch existence and the active batch are read in one query so a stale row cannot override the active one` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/statement-grounding.service.test.ts)

**Verify commands**

- `python3 factory/scripts/verify.py`

**Review budget.** 22 files / 1400 lines -- A seam extraction with typed outcomes shared by two callers, a deterministic intent table, the explanation service, and the response union across two chat routes - plus D-0052 and D-0053, whose recorded trigger is this task and which open the same files. No UI. The largest of the three tasks, and the one where the governed-read protections live.
<!-- /forge:contract -->


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
