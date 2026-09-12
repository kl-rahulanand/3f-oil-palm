# Cold-read grill — gate: task — task plan assistant-governed-ask

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

## The contract as recorded (authoritative over any copy in the plan)

## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Make the vendored chat stack reachable and governed: register it, enforce the Bedrock input boundary by test, implement the response matrix and the out-of-catalog refusal, move the fail-closed audit onto every branch, and add the view-in-report field together with the statement-side pinned-batch validation that makes it mean something. Backend only.

**Acceptance criteria**

- The vendored chat module is REGISTERED and GOVERNED: a ChatModule (and the LLM provider module it needs) is imported by app.module.ts, POST /api/chat and POST /api/chat/stream appear in the strict allow-list in backend/src/app.routes.test.ts - the only thing that proves a route exists - and both sit behind AuthGuard, the globally registered CsrfGuard and RequireAction('report'), the same governed action the statement uses. No new grant action is minted: GRANT_ACTIONS already carries report, save and pin.
- The Bedrock input boundary is enforced BY TEST, not by inspection: a test asserts what the provider is called with. Permitted are the question, the prior turns, and the governed vocabulary INCLUDING dimension distinct values capped by dimensionEnumMax - which is chat.service.ts:167 calling dimensionValuesForAllowedDomains against the warehouse, permitted by decision 0027 as amended. Forbidden, and asserted absent, are amounts, measure values, transaction lines, batch contents and any row of a governed result. The provider is selected by LLM_PROVIDER; the mock only ever returns kind 'clarify' and is development-only.
- The response matrix holds in precedence order and each branch is proven: a DATA question is answered from the governed measures with provenance.verified true and every visible numeric character rendered from the deterministic result; a DEFINITION question is answered from the semantic layer's own labels; an AMBIGUOUS question returns exactly one clarifying question; a CAUSAL 'why' is DECLINED as out of scope and redirected to what the numbers show; and GENERAL CHAT is answered from DETERMINISTIC templates extending the existing smalltalk-guard - the model is never asked for prose and can emit no numeral, so 'never fabricates a number' holds structurally rather than by instruction.
- A question outside the governed catalog is REFUSED as unsupported and says so. The catalog is exactly the domains semanticLayer.ts registers - governed-financial and mis-statement - over the proven Agriculture / Nursery / DUB slice and the periods the statement offers. It is never answered with a zero: decision 0018 established that a zero is a meaningful value distinct from an absence, and conflating them here would teach the reader to distrust every zero on the statement.
- View-in-report works on BOTH sides. AskResponse gains an optional field carrying the statement's department, function, plant and period PLUS the answer's activeBatchIds, populated only when the selection maps to a statement and ABSENT WITH A REASON otherwise - the client links from it and never reconstructs a selection itself. POST /api/mis/statement ACCEPTS those pinned batch ids, VALIDATES them, and returns a typed 'the data was refreshed - ask again' outcome when they are no longer the active batches, following the drill's precedent rather than silently rendering different numbers. Its path is a CHANGE to a shipped, reviewed route that the report and the drill both depend on, so the existing statement and drill tests must still pass untouched.
- Authorization and audit are per-request on EVERY branch. The fail-closed request event currently guards only the final governed execution, while the denied and unsupported branches fall to writeResultEvent, which audit.service.ts documents as best-effort and never blocking. Every branch that consults governed data - including refusals and unsupported requests - now writes its record BEFORE the read and fails closed: if the audit write throws, no governed query is issued. Proven by a test that makes the insert fail and asserts the warehouse was never queried.
- The task leaves the rest of the system as it found it and registers what it adds. The semantic layer, the warehouse schema, every governed measure and the drill path are untouched; no saved, pins or conversations route is registered here; and D-0006 is honoured for every prettier-ignored file this task edits - chat.controller.ts and smalltalk-guard.ts are formatted and their .prettierignore entries removed in the same change. New hermetic tests are registered in backend/package.json test:hermetic AND tools/quality-gate.test.mjs, or CI runs none of them.

**Write scope** (what `stage done` measures the diff against)

- contract/src/api.ts
- backend/src/app.module.ts
- backend/src/app.routes.test.ts
- backend/src/chat/chat.module.ts
- backend/src/chat/chat.controller.ts
- backend/src/chat/chat.service.ts
- backend/src/chat/chat.service.test.ts
- backend/src/chat/smalltalk-guard.ts
- backend/src/chat/smalltalk-guard.test.ts
- backend/src/llm/llm.module.ts
- backend/src/mis/mis-statement.controller.ts
- backend/src/mis/mis-statement.controller.test.ts
- backend/src/mis/mis-statement.service.ts
- backend/src/mis/mis-statement.service.test.ts
- backend/src/mis/mis-statement.dto.ts
- backend/src/mis/mis-statement.interface.ts
- backend/package.json
- tools/quality-gate.test.mjs
- .prettierignore

**Required tests** (run by `stage done`)

- `the chat routes are registered behind the governed report action and appear in the strict route allow list` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/app.routes.test.ts)
- `the llm provider receives the question prior turns and dimension values and never an amount or a result row` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `a data question answers from the governed measures and a definition question answers from the semantic layer labels` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `an ambiguous question returns one clarifying question and a causal why is declined rather than answered` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `general chat is answered from deterministic templates that assert nothing about the data and contain no numeral` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/smalltalk-guard.test.ts)
- `a question outside the registered domains is refused as unsupported and never answered with a zero` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `the answer carries the statement selectors and batch ids when it maps to a statement and is absent with a reason when it does not` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `the statement route refuses a pinned batch that is no longer active with its typed refreshed data outcome` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mis/mis-statement.controller.test.ts)
- `a failing audit insert aborts a denied request and an unsupported request before any governed query is issued` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)

**Verify commands**

- `npm run build:contract`
- `npm run build:backend`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:hermetic`

**Review budget.** 19 files / 2600 lines -- Registration is small; everything around it is not. The task governs a 3,758-line vendored chat stack it did not write, enforces a provider boundary by test, implements and proves five response-matrix branches, moves a fail-closed audit boundary onto branches that currently use a best-effort writer, and changes a SHIPPED statement route to accept and validate pinned batch ids with a typed refusal - a change two merged stories depend on not breaking. It also carries two D-0006 reformats (chat.controller.ts, smalltalk-guard.ts) whose diffs are mechanical but large, and the four registration files without which the routes are unproven and the new tests unrun. No migration and no UI.

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
- Q: **Correction to what I told you.** When you approved decision 0027 I said "warehouse rows never leave the app". True for rows — but `chat.service.ts:167` calls `dimensionValuesForAllowedDomains`, which runs `SELECT DISTINCT` against the **warehouse** for each dimension and serializes those values into the Bedrock prompt. So today the model would receive your actual plant names, cost-centre names and GL codes. Not rows, not measure values — but warehouse contents, and I didn't know that when I wrote the decision.
  A: Permit distinct values, amend 0027 to say so (Recommended)
- Q: The vendored chat persists conversations and rehydrates stored `answerSnapshot` values — governed results and provenance at rest. That contradicts decision 0028's "nothing stored that the user could not re-derive". The prototype shows chat history; the confirmed spec and roadmap do not require it.
  A: Defer durable history (Recommended)
- Q: "View in report" is supposed to open the statement the answer came from. But the statement route takes only four selectors — it has no `pinnedBatches`; only the drill route does. So if SAP or budget batches change between asking and clicking, the link silently opens different numbers.
  A: Refuse a stale link and say so (Recommended)
- Q: The spec promises the assistant "converses like a normal agent" for general chat. But the Bedrock provider is a **selection-only tool interface** — it can select, clarify, or mark unsupported. It cannot return free prose. The existing small-talk handling is deterministic templates.
  A: Deterministic friendly templates (Recommended)
- Q: Closing the assistant plan grill. Your four calls are folded in, plus six repository blockers — three of which were wrong claims in my own draft. I had said the statement API was **unchanged**; it isn't, because it has no `pinnedBatches` and "view in report" cannot keep its promise without them. I had said `PinSnapshot` would sit **unused**; it doesn't, `pins.service.ts:50` persists and returns a `ResultTable` today, so the story has to *delete* that. And I had said **five** absent tables; it is seven, which is why the migration is now hand-scoped to the two this story actually needs rather than generated. Also fixed: the audit is now fail-closed on every branch, not just before the final execution; `Surface Impact` is properly classified per surface; and the decomposition dropped to four tasks — with the migration moved *into* exploration, since deferring history and forbidding snapshots left no tables the assistant itself needs. Any remaining gap before this goes to the board?
  A: No gaps — board it (Recommended)
- Q: Fifteen acceptance criteria. The plan's four tasks are: **governed-ask** (backend), **ask-surfaces** (frontend), **exploration-api** (backend), **exploration-view** (frontend). The question is whether task 1 is one bounded session: it registers and governs the chat module, wires Bedrock with a tested input boundary, implements the five-branch response matrix and the out-of-catalog refusal, moves the fail-closed audit onto every branch, adds the view-in-report field — *and* changes the shipped statement route to accept and validate pinned batch ids with a typed refusal.
  A: Four — as the plan says

## The artifact under interrogation (task plan assistant-governed-ask)

# Task plan — assistant-governed-ask: register and govern the vendored assistant

Story: assistant · Task 1 of 4 · **user_facing: false**

## Objective
Make the vendored chat stack **reachable and governed**, and give "view in report" both halves it
needs to mean anything.

Register the module, put it behind the governed action, enforce the Bedrock input boundary **by
test**, implement the five-branch response matrix and the out-of-catalog refusal, move the
fail-closed audit onto every branch, and add the view-in-report field **together with** the
statement-side pinned-batch validation.

Backend only. No migration, no UI, no saved/pins routes — those are tasks 2–4.

## Acceptance criteria (plan_contracts)
- **t-aga-c1** — registered and governed, with the routes in the strict allow-list.
- **t-aga-c2** — the Bedrock input boundary asserted on the provider's arguments.
- **t-aga-c3** — the five-branch response matrix, general chat deterministic.
- **t-aga-c4** — out-of-catalog questions refused, never answered zero.
- **t-aga-c5** — view-in-report on **both** sides, including the statement's typed stale refusal.
- **t-aga-c6** — fail-closed audit on every branch, including denials.
- **t-aga-c7** — nothing else disturbed; D-0006 and test registration honoured.

## What already exists (grounding, file:line)
- `backend/src/chat/` — eighteen files, 3,758 lines. `ChatService.ask()` (`chat.service.ts:59`)
  already does smalltalk classification (`:119`), ambiguity/clarify, the reconciliation guard,
  verified-selection checks, provenance assembly, SSE streaming, and a **fail-closed audit inside
  `beforeExecute`** (`:315`). Its collaborators all exist: `ConversationsService`,
  `ReportsService`, `HelpService`, `DimensionValuesService`.
- `backend/src/chat/chat.controller.ts:13` — `@Controller("api/chat")` with **`@UseGuards(AuthGuard)`
  only**. It authenticates; it does not authorize. Governing it means adding
  `RequireAction("report")`.
- `backend/src/app.module.ts:14` — imports `CoreModule`, `HealthModule`, `IngestModule`,
  `MisSelectionModule`, `MisModule`. **No chat, saved or pins.** There is no `ChatModule` file to
  import; it must be written.
- `backend/src/app.routes.test.ts:20` — the strict allow-list, fourteen routes, no `/api/chat`.
  **This is the only artifact that proves a route exists.**
- `backend/src/grants/grants.constants.ts:3` — `GRANT_ACTIONS = ["admin","save","pin","ingest","report"]`.
  **No new action is needed**; the assistant uses `report`, exactly as the statement does.
- `backend/src/chat/chat.service.ts:167` — `dimensionValuesForAllowedDomains(...)` →
  `dimensionValues.values(domain.goldObject, dimension.column)`: a `SELECT DISTINCT` against the
  **warehouse**, serialized into the prompt at `:172`. Decision **0027 as amended** permits these
  and requires a test asserting the provider's input.
- `backend/src/llm/mock.provider.ts` — `select()` always returns `kind: "clarify"`. It never
  selects. Development-only.
- `backend/src/core/audit.service.ts` — `writeRequestEvent` throws (fail-closed);
  `writeResultEvent` is documented **best-effort and never blocks**. The denied and unsupported
  branches currently use the latter.
- `contract/src/api.ts` — `AskResponse` already carries `selection`, `result`, `totals`,
  `chartType`, `provenance`, `appliedTimeWindow`, `chips`, `clarify`; `Provenance` carries
  `verified` and `activeBatchIds`. `AskReportGrounding { reportId, timeWindow }` grounds a question
  *in* a report — nothing carries an answer *back* to one.
- `backend/src/mis/mis-statement.controller.ts` — `POST api/mis/statement` takes
  `misSelectionRunRequestSchema`: four selectors, **no `pinnedBatches`**. Only `MisDrillRequest`
  has them. The drill's `MisDrillBatchStatus` is the precedent for the typed stale outcome.
- `.prettierignore` — contains `chat.controller.ts` and `smalltalk-guard.ts`, **not**
  `chat.service.ts`. D-0006 therefore applies to the first two only.

## Design

### Registration and governance
Write `ChatModule` (and the provider module that binds `LLM_PROVIDER`), import both in
`app.module.ts`, add `RequireAction("report")` to the controller, and add both routes to the
allow-list. Nothing about the vendored service's behaviour changes here — this step only makes it
reachable to an authorized user.

### The provider boundary
Permitted: the question, the prior turns, the governed vocabulary — names, labels **and dimension
distinct values capped by `dimensionEnumMax`**. Forbidden: amounts, measure values, transaction
lines, batch contents, result rows. The test asserts the provider's **arguments**, checking both
that the permitted things are present and that the forbidden ones are **absent**; a happy-path
assertion alone would not catch a later change that starts passing rows.

### The response matrix
In precedence order — data, definition, ambiguous, causal, general chat. The first four already
have machinery (`ambiguity.ts`, `HelpService`, the verified-selection path); this task makes the
precedence explicit and proves each branch. **General chat is deterministic**, extending
`smalltalk-guard.ts`: the model is never asked for prose, so "never fabricates a number" is
structural rather than instructed.

### Out of catalog
The catalog is what `semanticLayer.ts` registers: `governed-financial` and `mis-statement`. A
question outside it is refused as unsupported **and says so**. It must never resolve to an empty
governed result rendered as zero — decision **0018** made a zero mean something, and conflating
them here would teach the reader to distrust every zero on the statement.

### View in report, both halves
`AskResponse` gains an optional field with the four statement selectors plus the answer's
`activeBatchIds`, present only when the selection maps to a statement and **absent with a reason**
otherwise. `POST api/mis/statement` gains optional pinned batch ids, validates them, and returns a
typed *"the data was refreshed — ask again"* outcome when they are no longer active.

**When the ids are absent the route must behave exactly as it does today** — the report and the
drill both call it, and two merged stories depend on it not changing.

### Audit on every branch
Move the fail-closed boundary so every branch that consults governed data — including denials and
unsupported requests — writes its record **before** the read. The test makes the insert fail and
asserts **no governed query was issued**, not that an error was logged.

## Workflow
```mermaid
flowchart TD
  Q["POST /api/chat"] --> G{AuthGuard · CsrfGuard · RequireAction report}
  G -->|refused| AR["audit: fail-closed refusal record"] --> F403["403"]
  G --> M{"response matrix, in precedence order"}
  M -->|general chat| T["deterministic template · no numeral · no data claim"]
  M -->|causal why| DEC["declined, redirected to what the numbers show"]
  M -->|definition| DEF["answered from the semantic layer's labels"]
  M -->|ambiguous| CL["exactly one clarifying question"]
  M -->|data question| CAT{"in the registered catalog?"}
  CAT -->|no| UNS["refused as unsupported — NEVER a zero (0018)"] --> AR2["audit: fail-closed"]
  CAT -->|yes| LLM["Bedrock: question + prior turns + vocabulary incl. dimension VALUES<br/>never amounts, rows or batch contents"]
  LLM --> AUD["audit: fail-closed, BEFORE the read"]
  AUD -->|insert throws| STOP["error · no governed query issued"]
  AUD --> EX["SelectionExecutor → governed measures"]
  EX --> A["answer + provenance (verified, activeBatchIds)"]
  A --> V{"selection maps to a statement?"}
  V -->|no| NOLINK["no link, with a reason"]
  V -->|yes| LINK["view-in-report: 4 selectors + activeBatchIds"]
  LINK --> S["POST /api/mis/statement validates the pinned ids"]
  S -->|still active| OK["the statement the answer came from"]
  S -->|replaced| STALE["typed: data refreshed — ask again"]
```

## Manual Verification
1. `npm run build:contract && npm run build:backend && npm run typecheck && npm run lint &&
   npm run format:check && npm run test:hermetic` — the **nine** required leaves pass. Read each
   junit report's **testcase name and executed count**, never the exit code (D-0024, D-0031).
2. **The allow-list is the proof.** Confirm `app.routes.test.ts` now lists `POST /api/chat` and
   `POST /api/chat/stream`, and that the test fails if either is removed from the module.
3. **Against the live backend with `LLM_PROVIDER=bedrock` and `BEDROCK_MODEL_ID` set**, ask a real
   question of the July statement and confirm the answer's figures match the report, that
   `provenance.verified` is true, and that the view-in-report field carries the selectors and
   batch ids. Without the model id the assistant can only return a clarification — say so rather
   than reporting a pass.
4. **The regression that matters:** run the existing statement and drill suites unchanged and
   confirm `POST /api/mis/statement` with **no** pinned ids behaves exactly as before.
5. `SELECT event_type, question FROM audit_events ORDER BY ts DESC LIMIT 5` — a denied and an
   unsupported request each left a record.

## Decisions attested
0026 (the assistant ships in the PoC), 0027 (Bedrock `ap-south-1`; the permitted-input boundary as
amended), 0028 (no governed data at rest — this task registers no saved/pins route and stores
nothing), 0016 (all-or-nothing governed access), 0018 (a zero is not an absence), 0022 (the
statement projection the answers and the link agree with), 0019 (house style for the routes),
0012 (the vendored API's constitution deviation covers these controllers), 0011 (retention and
residency contracts ride with the pilot), 0006/0008/0010 (vendored backend, pinned snapshot, 3F
identifiers), 0009 (required tests name a real leaf and pin `TS_NODE_PROJECT`).

## Surface impact
- **New:** `chat.module.ts`, the LLM provider module, `chat.service.test.ts`, the view-in-report
  contract field.
- **Changed:** `app.module.ts` (two imports), `app.routes.test.ts` (the allow-list),
  `chat.controller.ts` (+`RequireAction`, +D-0006 reformat), `chat.service.ts` (matrix, catalog
  refusal, audit boundary, the link field), `smalltalk-guard.ts` (+templates, +D-0006 reformat),
  `mis-statement.{controller,service,dto,interface}.ts` (pinned ids and the typed stale outcome),
  `backend/package.json` and `tools/quality-gate.test.mjs` (test registration), `.prettierignore`
  (two entries removed).
- **Unchanged:** the semantic layer, the warehouse schema, every governed measure, the drill path,
  and every saved/pins/conversations route — none is registered here.

## Out of scope
The migration and the saved/pins routes (task 3); both UI surfaces (tasks 2 and 4); durable chat
history and `/api/conversations` (deferred at the plan grill); removing the pins snapshot
behaviour (task 3); historical statement rendering against arbitrary past batches (refused, not
rebuilt).

<!-- forge:contract -->
## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Make the vendored chat stack reachable and governed: register it, enforce the Bedrock input boundary by test, implement the response matrix and the out-of-catalog refusal, move the fail-closed audit onto every branch, and add the view-in-report field together with the statement-side pinned-batch validation that makes it mean something. Backend only.

**Acceptance criteria**

- The vendored chat module is REGISTERED and GOVERNED: a ChatModule (and the LLM provider module it needs) is imported by app.module.ts, POST /api/chat and POST /api/chat/stream appear in the strict allow-list in backend/src/app.routes.test.ts - the only thing that proves a route exists - and both sit behind AuthGuard, the globally registered CsrfGuard and RequireAction('report'), the same governed action the statement uses. No new grant action is minted: GRANT_ACTIONS already carries report, save and pin.
- The Bedrock input boundary is enforced BY TEST, not by inspection: a test asserts what the provider is called with. Permitted are the question, the prior turns, and the governed vocabulary INCLUDING dimension distinct values capped by dimensionEnumMax - which is chat.service.ts:167 calling dimensionValuesForAllowedDomains against the warehouse, permitted by decision 0027 as amended. Forbidden, and asserted absent, are amounts, measure values, transaction lines, batch contents and any row of a governed result. The provider is selected by LLM_PROVIDER; the mock only ever returns kind 'clarify' and is development-only.
- The response matrix holds in precedence order and each branch is proven: a DATA question is answered from the governed measures with provenance.verified true and every visible numeric character rendered from the deterministic result; a DEFINITION question is answered from the semantic layer's own labels; an AMBIGUOUS question returns exactly one clarifying question; a CAUSAL 'why' is DECLINED as out of scope and redirected to what the numbers show; and GENERAL CHAT is answered from DETERMINISTIC templates extending the existing smalltalk-guard - the model is never asked for prose and can emit no numeral, so 'never fabricates a number' holds structurally rather than by instruction.
- A question outside the governed catalog is REFUSED as unsupported and says so. The catalog is exactly the domains semanticLayer.ts registers - governed-financial and mis-statement - over the proven Agriculture / Nursery / DUB slice and the periods the statement offers. It is never answered with a zero: decision 0018 established that a zero is a meaningful value distinct from an absence, and conflating them here would teach the reader to distrust every zero on the statement.
- View-in-report works on BOTH sides. AskResponse gains an optional field carrying the statement's department, function, plant and period PLUS the answer's activeBatchIds, populated only when the selection maps to a statement and ABSENT WITH A REASON otherwise - the client links from it and never reconstructs a selection itself. POST /api/mis/statement ACCEPTS those pinned batch ids, VALIDATES them, and returns a typed 'the data was refreshed - ask again' outcome when they are no longer the active batches, following the drill's precedent rather than silently rendering different numbers. Its path is a CHANGE to a shipped, reviewed route that the report and the drill both depend on, so the existing statement and drill tests must still pass untouched.
- Authorization and audit are per-request on EVERY branch. The fail-closed request event currently guards only the final governed execution, while the denied and unsupported branches fall to writeResultEvent, which audit.service.ts documents as best-effort and never blocking. Every branch that consults governed data - including refusals and unsupported requests - now writes its record BEFORE the read and fails closed: if the audit write throws, no governed query is issued. Proven by a test that makes the insert fail and asserts the warehouse was never queried.
- The task leaves the rest of the system as it found it and registers what it adds. The semantic layer, the warehouse schema, every governed measure and the drill path are untouched; no saved, pins or conversations route is registered here; and D-0006 is honoured for every prettier-ignored file this task edits - chat.controller.ts and smalltalk-guard.ts are formatted and their .prettierignore entries removed in the same change. New hermetic tests are registered in backend/package.json test:hermetic AND tools/quality-gate.test.mjs, or CI runs none of them.

**Write scope** (what `stage done` measures the diff against)

- contract/src/api.ts
- backend/src/app.module.ts
- backend/src/app.routes.test.ts
- backend/src/chat/chat.module.ts
- backend/src/chat/chat.controller.ts
- backend/src/chat/chat.service.ts
- backend/src/chat/chat.service.test.ts
- backend/src/chat/smalltalk-guard.ts
- backend/src/chat/smalltalk-guard.test.ts
- backend/src/llm/llm.module.ts
- backend/src/mis/mis-statement.controller.ts
- backend/src/mis/mis-statement.controller.test.ts
- backend/src/mis/mis-statement.service.ts
- backend/src/mis/mis-statement.service.test.ts
- backend/src/mis/mis-statement.dto.ts
- backend/src/mis/mis-statement.interface.ts
- backend/package.json
- tools/quality-gate.test.mjs
- .prettierignore

**Required tests** (run by `stage done`)

- `the chat routes are registered behind the governed report action and appear in the strict route allow list` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/app.routes.test.ts)
- `the llm provider receives the question prior turns and dimension values and never an amount or a result row` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `a data question answers from the governed measures and a definition question answers from the semantic layer labels` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `an ambiguous question returns one clarifying question and a causal why is declined rather than answered` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `general chat is answered from deterministic templates that assert nothing about the data and contain no numeral` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/smalltalk-guard.test.ts)
- `a question outside the registered domains is refused as unsupported and never answered with a zero` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `the answer carries the statement selectors and batch ids when it maps to a statement and is absent with a reason when it does not` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)
- `the statement route refuses a pinned batch that is no longer active with its typed refreshed data outcome` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/mis/mis-statement.controller.test.ts)
- `a failing audit insert aborts a denied request and an unsupported request before any governed query is issued` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/chat/chat.service.test.ts)

**Verify commands**

- `npm run build:contract`
- `npm run build:backend`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test:hermetic`

**Review budget.** 19 files / 2600 lines -- Registration is small; everything around it is not. The task governs a 3,758-line vendored chat stack it did not write, enforces a provider boundary by test, implements and proves five response-matrix branches, moves a fail-closed audit boundary onto branches that currently use a best-effort writer, and changes a SHIPPED statement route to accept and validate pinned batch ids with a typed refusal - a change two merged stories depend on not breaking. It also carries two D-0006 reformats (chat.controller.ts, smalltalk-guard.ts) whose diffs are mechanical but large, and the four registration files without which the routes are unproven and the new tests unrun. No migration and no UI.
<!-- /forge:contract -->


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
