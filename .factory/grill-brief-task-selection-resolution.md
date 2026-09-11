# Cold-read grill — gate: task — task plan selection-resolution

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
- Enforce at the DB level (a trigger, like the immutability trigger) that sap_transaction.month equals its ingest_batch.period and mis_budget.period equals its batch period; otherwise a mis-periodized row double-counts in actual_by_key_month, which groups by ROW month while active-uniqueness is keyed on BATCH period.
- The WAREHOUSE_PG_* separation guard must REJECT when the normalized host AND port match the app DB, regardless of database name (canonicalize localhost/127.0.0.1/::1 and equivalent aliases) — otherwise warehouse DDL can be applied to the application Postgres server under a different db name.
- The demonstrated warehouse proof must RUN migrate + the fixture against the warehouse DB via a committed, re-runnable warehouse:proof script that EXERCISES IngestionRepository's atomic candidate-load-then-flip; a hermetic test that only greps seed-proof.sql text is false-green. Do NOT build a controller/API here (that is the actuals-loader task) — exercise the repository directly.
- The WAREHOUSE_PG_* separation guard must RESOLVE both the warehouse host and the app pg host via dns.promises.lookup(host,{all:true}) and reject when their resolved IP sets INTERSECT and the ports match (normalize IPv4-mapped ::ffff: and IPv6 loopback). A hand-picked list of loopback spellings + isIP() cannot catch DNS aliases or IPv6-mapped aliases of the app host. This makes loadWarehousePostgresConfig async — make createWarehouseWritePool async and await it in warehouse:migrate/proof and the hermetic test.
- The D-0008 live warehouse proof must be a COMMITTED, reviewer-visible DB-backed test (e.g. backend/src/warehouse/warehouse-proof.db.test.ts calling proveWarehouse, registered in the backend package.json test:db script) so the required execution is provable from the diff itself — a tests.json narrative alone is invisible to the cold-diff reviewer and reads as an absent D-0008 record.
- Put the DB-backed warehouse proof in its OWN file backend/src/warehouse/warehouse-proof.db.test.ts registered ONLY in test:db (and the db list of tools/quality-gate.test.mjs); keep warehouse-schema.test.ts hermetic-only. NEVER register one test file in both test:hermetic and test:db — tools/quality-gate.test.mjs asserts exactly one suite per file and fails the whole verify if a file appears twice.
- SUPERSEDES the separate-file guidance for warehouse-schema: its write_scope does NOT include warehouse-proof.db.test.ts, so do NOT create that file. Keep the DB proof test INSIDE backend/src/warehouse/warehouse-schema.test.ts gated by WAREHOUSE_DB_TEST=1 (skips under plain test:hermetic, runs the migrate + IngestionRepository proof when the env + WAREHOUSE_PG_* are set), registered ONLY in test:hermetic. REMOVE warehouse-schema.test.ts from the test:db script and the db-list in tools/quality-gate.test.mjs, and drop the WAREHOUSE_DB_TEST env added to test:db — quality-gate requires each test file in exactly ONE suite and fails verify otherwise. This is the ONLY remaining fix.
- The sap_transaction 'raw' jsonb column is ADDITIVE - add it to warehouse-schema.ts + a NEW backend/drizzle-warehouse/0001_*.sql migration (generate-once, apply-only via warehouse:migrate). Do NOT modify backend/src/warehouse/warehouse-schema.test.ts (out of write_scope); its column/constraint assertions use .includes and are non-exhaustive and the 0000 migration is unchanged, so it stays green untouched. Assert the raw column IN-SCOPE: sap-actuals.parser.test.ts (parser emits the full raw row) and the WAREHOUSE_DB_TEST=1-gated ingest.service.test.ts (raw persists).
- tools/quality-gate.test.mjs validateIgnoredBaseline asserts .prettierignore's non-comment lines deep-equal the keys of its ignoredBaselineHashes map. So when D-0006 requires removing a file (e.g. backend/src/db/migrate.ts) from .prettierignore, you MUST also remove that path's entry from the ignoredBaselineHashes map in tools/quality-gate.test.mjs (both in write_scope) in the SAME change, and ensure the now-unignored file is prettier-formatted so format:check passes. Keep .prettierignore and ignoredBaselineHashes in sync.
- The pinned WAREHOUSE_DB_TEST=1 host command must be prefixed with TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1; without them 'node --require ts-node/register --test <file.ts>' loads the TypeScript file as a single empty testcase that FALSE-PASSES (tests 1/pass 1) even against a dead DB port — verified: with the prefix the good port gives tests 4/pass 4 and a bad port fails the 2 gated DB leaves (ECONNREFUSED); without it a bad port still 'passes'.
- autoreview blocks a PROOF task whose gated WAREHOUSE_DB_TEST=1 leaf is registered only in test:hermetic (where it self-skips) — from the diff there is no registered command that RUNS it. Add the gated test file to backend/package.json test:db (the DB-backed suite a Postgres/warehouse runner executes with WAREHOUSE_DB_TEST=1), alongside the committed tests.json execution record + the pinned host command in the plan. This makes the execution path provable from the diff itself; the demonstrated-host-evidence model (decision 0009 / D-0008) is unchanged — CI without a warehouse container still skips it.
- Registering the gated reconciliation test in test:db is NOT enough: test:db does not set WAREHOUSE_DB_TEST=1, so the leaf still self-skips there and autoreview reads it as an unrunnable proof. FIX: add a dedicated backend package.json script 'test:warehouse-proof' that itself sets WAREHOUSE_DB_TEST=1 and runs backend/src/warehouse/reconciliation.repository.test.ts (the WAREHOUSE_PG_*/PGHOST/PGPORT connection env is still supplied by the host/operator, NOT hardcoded), and REMOVE the file from test:db (it is a warehouse-DB test, not an app-DB test). Then the registered command actually EXECUTES the proof when run against a warehouse; the pinned host command in tests.json becomes 'WAREHOUSE_PG_*... npm --prefix backend run test:warehouse-proof'. Keep it in test:hermetic too (self-skips there). Still demonstrated-host-evidence (decision 0009/D-0008), NOT CI-enforced.
- Not a defect (Decisions): Factually incorrect and contradicts the settled D-0008 model. (1) The claim that the supplied evidence contains no invocation of test:warehouse-proof is false: the committed tests.json commands_run records 'npm --prefix backend run test:warehouse-proof -> tests 4 / pass 4 / fail 0 / skipped 0' (the gated warehouse leaf EXECUTES because the script sets WAREHOUSE_DB_TEST=1) plus a dead-port negative control (fail 1, ECONNREFUSED). Performance and security accepted this same evidence and approved this round. (2) The warehouse proof is committed, reviewer-visible and runnable via the registered test:warehouse-proof script. (3) The story plan Decisions section settles that DB-backed warehouse proofs run as DEMONSTRATED HOST EVIDENCE (docker warehouse, WAREHOUSE_PG_*) per D-0008, NOT inside the enforced hermetic path; demanding a non-skipped enforced execution is CI-enforcement the plan defers. — raised as "[P1] Record an execution of the gated warehouse proof (backend/src/warehouse/reconciliation.repository.test.ts:107): The only recorded execution is `npm run tes"
- The reconciliation D-0008 gated leaf TRUNCATEs ingest_batch + sap_transaction CASCADE on whatever DB WAREHOUSE_PG_* points at. Guard it: BEFORE truncating, assert the warehouse host (WAREHOUSE_PG_HOST) is loopback/local (127.0.0.1, ::1, or localhost) and THROW a clear error refusing to run against a non-local warehouse — so a misconfigured WAREHOUSE_PG_* can never wipe a shared/production warehouse. Also fix the P2: tools/quality-gate.test.mjs wrapping the declared test lists in new Set removes the gate's exactly-one-suite detection (a file registered in two suites is silently deduped) — compare with duplicate detection preserved (e.g. detect duplicates before dedup, or assert no file appears in more than one suite) instead of Set-then-compare.
- Not a defect (Decisions): Factually incorrect and contradicts the settled D-0008 model. (1) tests.json IS committed at f9c6b1d with the full host-execution record: 'npm --prefix backend run test:warehouse-proof -> tests 7 / pass 7 / fail 0 / skipped 0' plus a dead-port negative control (fail 2, ECONNREFUSED). The reviewer cannot see it only because the review bundle deliberately excludes .factory bookkeeping ('review tip excludes 9 harness bookkeeping paths; the bundle is the product delta only') - not because it is absent. (2) The runnable command that executes the proof (test:warehouse-proof, serialized) IS in the product delta at backend/package.json, and the gated test is committed and reviewer-visible. (3) The security lens accepted this identical evidence and approved. (4) The story plan Decisions section settles that the DB-backed warehouse proof is DEMONSTRATED HOST EVIDENCE (D-0008), not CI-enforced execution. — raised as "[P1] Commit the required host-execution evidence for the new proof (backend/package.json:19): The new `test:warehouse-proof` command is registered, but the chan"
- Not a defect (Decisions): Factually incorrect and contradicts the settled D-0008 model, same as the quality lens. tests.json IS committed at f9c6b1d with the host-execution record (test:warehouse-proof -> tests 7 / pass 7; dead-port negative control fail 2, ECONNREFUSED); the reviewer cannot see it only because the review bundle excludes .factory bookkeeping ('the bundle is the product delta only'). The runnable serialized test:warehouse-proof command IS in the product delta (backend/package.json) and the gated test is committed reviewer-visible; the security lens approved this identical evidence. The story plan Decisions section settles the warehouse proof as demonstrated host evidence (D-0008), not CI-enforced. — raised as "[P1] Commit the required warehouse-proof execution evidence (backend/src/warehouse/gl-month-rollups.db.test.ts:22): This DB-backed proof is skipped unless WAREH"
- The composed-relation gated proof failed only because month (a Postgres DATE) is read back by node-pg as a JS Date at LOCAL midnight, so in a non-UTC host timezone (IST) the ISO string shifts a day (2099-09-01 stored -> 2099-08-31T18:30:00Z read). The composed relation values were correct (matched key actual 125.00 + budget 200.00, zero-fill and no-fan-out work). FIX (test-only, backend/src/warehouse/composed-relation.db.test.ts): compare month as a DATE-ONLY value - either select month as text in the assertion query (to_char(month,'YYYY-MM-DD')), or normalize both sides to the yyyy-mm-dd date part - never compare the full Date/ISO across timezones. Do NOT change the composed relation SQL; the logic is proven correct.
- In the composed relation builder (backend/src/sql/sqlBuilder.ts composedCtes), the zero-fill COALESCE(actual_src.actual_net, 0) returns a scaleless numeric: for a key present on only one side the literal 0 prints as '0', while a real SUM(...)::numeric(18,2) prints as '125.00'. A governed financial relation MUST return consistent 2-decimal scale so downstream measures/% and golden fixtures compare deterministically. FIX: cast each zero-filled projection to numeric(18,2) - e.g. COALESCE(actual_src.actual_net, 0)::numeric(18,2) (and budget_net, rollover_net likewise). The gl-month rollups already cast their SUMs to numeric(18,2); the composed layer must preserve that scale through the FULL OUTER JOIN zero-fill. Proven by the D-0008 host proof: BUDGET-ONLY key returned actual '0' vs expected '0.00'.
- A structurally single-plant source in a FULL OUTER JOIN must still compare its trusted plant constant with the user's validated scope inside that source CTE; filtering only the other side exposes unauthorized one-sided rows.
- A review may flag editing backend/src/db/migrate.ts as needing the D-0006 de-ignore ritual (remove from .prettierignore + drop its ignoredBaselineHashes entry). This is FALSE for migrate.ts: it is NOT listed in .prettierignore (only migrate.trim.test.ts is), it is NOT a key in tools/quality-gate.test.mjs ignoredBaselineHashes, and Checking formatting...
All matched files use Prettier code style! passes clean. Task 2 (composed-relation, merged PR #21) edited migrate.ts to seed the 'report' action WITHOUT any D-0006 de-ignore and merged green. So editing migrate.ts requires NO .prettierignore or quality-gate baseline change — do NOT add/remove it there. The stale D-0006 deferral text lists ~71 historically-drifting files; migrate.ts has since been de-ignored, so a finding treating it as still-ignored contradicts the actual repo state and is not a defect.
- Unlike migrate.ts (which is NOT ignored), backend/src/chat/chat.service.ts IS a D-0006 vendored file: it is listed in .prettierignore AND is a key in tools/quality-gate.test.mjs ignoredBaselineHashes with a pinned baseline hash. The quality-gate test 'the four FACTORY commands ... / D-0006' fails with 'chat.service.ts changed while still excluded by D-0006' whenever its content changes but it stays ignored. FIX per the D-0006 protocol: (1) ensure the file is prettier-clean (npx prettier --write if needed), (2) REMOVE the 'backend/src/chat/chat.service.ts' line from .prettierignore, (3) REMOVE its '<hash> backend/src/chat/chat.service.ts' entry from the ignoredBaselineHashes map in tools/quality-gate.test.mjs — all in the same change. Do this for ANY D-0006-ignored file a task edits; check membership with  and . (.prettierignore is editable by the worker and is recorded via stage amend-scope at stage done.)
- In the composed builder (backend/src/sql/sqlBuilder.ts), adding source_presence / component-labels / batch-id / month to the outer GROUP BY forces every composed query to the (gl_code, month) grain: a caller who selects only gl_code (a YTD-style aggregation over months) then wrongly gets one row per month, changing measure semantics. FIX: the provenance columns are AGGREGATE expressions over the caller's selected-dimension groups, NOT grouping keys — remove them from GROUP BY and wrap them: source_presence -> a SET via json_agg(DISTINCT ...) (a singleton at the natural (gl_code,month) grain, a set for aggregate rows, matching C2's 'or a set for aggregate rows'); Budget-Components labels -> the distinct label set aggregated; active batch ids -> json_agg(DISTINCT jsonb_build_object('source',..,'period',month,'batchId',..)) so the (source,period,batchId) tuple key survives multi-period aggregates. Emit them as JSON (json_agg / to_json), NOT text[]: PostgresAdapter stringifies text[] as a comma-joined string (postgres.adapter.ts:112-117) which selectionExecutor then splits on every comma - ambiguous for a label like 'Admin, East'; a JSON string is unambiguously JSON.parse-able in the executor. So: aggregate provenance as JSON in the outer query (grain preserved) + JSON.parse it in SelectionExecutor (no comma-split). Update the golden fixture/test + hermetic SQL-shape tests for the aggregated JSON provenance.
- In the composed provenance aggregation (backend/src/sql/sqlBuilder.ts), jsonb_agg(DISTINCT(budget_component_labels)) over an Actual-only key (the budget side of the FULL OUTER JOIN is NULL) returns [null] (jsonb_agg includes the SQL NULL as a JSON null), but the correct provenance for a one-sided key is an EMPTY set []. This broke composed-relation.db.test.ts for the ACTUAL-ONLY case (actual [null] vs expected []). FIX: guard every provenance jsonb_agg against the missing FULL-OUTER-JOIN side with FILTER + COALESCE, e.g. COALESCE(jsonb_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL), '[]'::jsonb)::text. Apply the same to budget_component_labels AND to the active-batch-id tuple aggregates (a Budget-only key has NULL actual_batch_id, an Actual-only key may have NULL budget_batch_id per gl_code) so one-sided keys never carry a null-filled tuple or label. Re-run the composed-relation.db + golden D-0008 proofs.
- Putting source_presence on ResultTable rows caused three defects at once: (1) it leaked into the RENDERED column list (selectionExecutor.ts:137 filtered only budget_component_labels + active_batch_ids), showing a provenance column to users; (2) it rode into every composed execution.result.rows record and so into authored-measure SAMPLE persistence (selectionExecutor.ts:165) — the same pressure that kept dragging measures.service.ts into scope; (3) it made the API type UNSOUND (contract/src/api.ts:148): intersecting Record<string, string|number|null> with a possibly-array source_presence is invalid because the string index signature already declares every value scalar. FIX: do NOT put per-row provenance on ResultTable rows at all. Filter ALL provenance columns (source_presence, budget_component_labels, active_batch_ids) out of raw.columns AND out of the result rows, and carry per-row source-presence on the PROVENANCE payload instead, ROW-ALIGNED BY INDEX (e.g. provenance.rowSourcePresence: SourcePresence[] parallel to result.rows), alongside the query-level (source,period,batchId) tuple set + label set. This keeps ResultTable's row type exactly Record<string,string|number|null> (sound, no index-signature conflict), keeps provenance out of rendered columns and out of authored-measure sample persistence, and still satisfies C2's row-aligned source-presence.
- In the composed provenance (backend/src/sql/sqlBuilder.ts), the active actuals/budget batch-id subqueries are keyed only by (source_kind, COALESCEd month), so ANY row in a period where both an active Actual and an active Budget batch exist receives BOTH ids — including one-sided rows. An ACTUAL-ONLY row (no budget contribution for that gl_code) then falsely cites the budget batch as its provenance, and a BUDGET-ONLY row falsely cites the actuals batch. That breaks C2's attribution (a number must name only the batches that produced it). FIX: gate each batch id on the presence of ITS side of the FULL OUTER JOIN, e.g. CASE WHEN actual_src.gl_code IS NOT NULL THEN (SELECT id FROM ingest_batch WHERE source_kind='actuals' AND period=<month> AND is_active) END AS actual_batch_id, and the mirror for budget on budget_src.gl_code IS NOT NULL. The existing FILTER (WHERE ... IS NOT NULL) aggregation then drops the absent side naturally, so a one-sided row's active_batch_ids contains only the contributing tuple. Update the frozen golden fixture's ACTUAL-ONLY / BUDGET-ONLY expectations to carry only their own batch tuple.

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
- Q: mis-selection delivery boundary: mis-statement (story 5) owns the finished hierarchical statement + Excel export, so this story must stop short of that or the two build conflicting report surfaces. But you want to put this in front of Srihari to get the unmapped-GL assignments back. How much should mis-selection visibly deliver?
  A: Selector + resolved scope + bucket list (Rec.)
- Q: mis-selection plan grill found a real bug: today the Budget side of the join admits EVERY active DUB budget GL, so a mapped selection can return Budget rows for GLs outside its resolved set — breaking acceptance criterion 1 ('exactly the DUB nursery slice'). The fix is to restrict Budget to the resolved master GL set. But that creates a mirror of the Actuals gap decision 0018 solved: Budget GLs present in the active budget batch but ABSENT from the mapping master would silently vanish from the report. How should unmapped BUDGET GLs be handled?
  A: Mirror the bucket for Budget (Rec.)
- Q: mis-selection decomposition: how many tasks should this story split into? My plan proposed 4. The harness asks for the fewest that stay bounded, since each task costs its own plan, grill, approval, review and PR — but an overloaded task grinds through review rounds instead (governed-joins task 4 took 4 rounds at comparable size).
  A: 3 tasks
- Q: mapping-master grill (blocker): the master must give each resolved triple an MIS line, but nothing states it mechanically. Sheet1 has only Plant, Cost Center, GL code and 'Revised GL name' — no S.No or line id — and Nursery MIS Format.xlsx's format sheet turns out to be Table-1 (Operational MIS), which the statement spec puts out of scope (Table-2 Financial MIS only). Without pinning this, a fixture could satisfy the 28-triple count while assigning triples to wrong or identical lines, breaking the future statement. What identifies an MIS line for the 66 resolved triples?
  A: Sheet1's 'Revised GL name' verbatim (Rec.)

## The artifact under interrogation (task plan selection-resolution)

# Task plan — selection-resolution: master-driven resolution, governed narrowing, first governed-query routes

Story: mis-selection · Task 2 of 3 · user_facing: false

## Objective
Make a selection **resolve through the Mapping Master** and **narrow the single governed
query path** to it, exposed by the **first governed-query HTTP routes** — so a client can
never widen a report. This is the story's core: task 1 built the authority, task 3 renders
it; this task turns a selection into governed numbers.

## Standards
`constitution/03-modular-monolith-structure.md` + `pnp-coding-standards-modular-monolith.md`
(the new `backend/src/mis` module and the `mapping` module it consumes);
`constitution/pnp-api-standards.md` + `pnp-swagger-api-documentation-standards.md` — these
are **fresh** routes, so named request/response DTOs and documented error responses are
**required** (the 0012 vendored-API deviation covers only the vendored controllers);
`constitution/07-exception-handling.md`.

## Acceptance criteria (plan_contracts)
- **t-sr-c1** — resolving `(department, function, plant, period)` returns cost centres, GL
  set, `mis_format` and bucket rows, or an **unresolvable** outcome; the "no mapping
  configured" notice is decided by master resolution and **never** by row count; period
  options are the loaded actual months plus a server-derived `fy26-27-ytd`.
- **t-sr-c2** — the governed path is **narrowed, never forked**: the Actual side filters
  resolved triples on `actual_by_key_month` and re-aggregates to `(gl_code, month)` before
  the join; the Budget side is restricted to the resolved GL set at its unchanged grain;
  the new object is in `objectsTouched`; a demonstrated warehouse test proves no fan-out.
- **t-sr-c3** — two authenticated routes: **options** (master-derived choices) and **run**
  (accepts **only** the four selectors — never triples, GLs, format ids or scope), with
  named DTOs and documented errors, registered in the module + route allow-list, reusing
  the existing fail-closed governed authorization.

## What already exists (grounding, file:line)
- **Task 1, merged (#25)** — `backend/src/mapping/mapping-master.ts` exports
  `MAPPING_MASTER`, `resolveMappingTriple(triple, master)`, `canonicalPlantFromMaster()`,
  `UNMAPPED_GL_LINE`, and the `MappingResolution` / `MappingSelection` / `MappingEntry`
  types. Selection records carry `department`, `function`, `plant_canonical`,
  `plant_aliases`, `mis_format`, `budget_gl_codes`; entries carry `cost_center`, `gl_code`,
  `mis_line`, `provisional`, `reason`. **Resolution must go through these** — the master
  stays the single authority.
- **Cost-centre grain** — `warehouse-schema.ts:117-134` `actual_by_key_month`
  `(plant, cost_center, gl_code, month, actual_net)` with the active-batch filter **baked
  into the view**; index `idx_sap_transaction_month_plant_cost_center_gl_code` (`:77-82`).
- **Pre-rolled grain** — `warehouse-schema.ts:136-150` `actual_by_gl_month`: `plant` is a
  constant literal and `cost_center` is gone (hence 0017).
- **Budget** — `warehouse-schema.ts:152-169` `budget_by_gl_month` has **no plant column**
  and admits **every** active budget GL.
- **Builder** — `sqlBuilder.ts:124-166` `composedCtes`; `scopePredicate` built `:60-66` and
  injected inside the CTEs (`:65`); `objectsTouched` `:117-121`; `sqlValidator.ts:43-49`
  rejects unlisted leaves. **A filter whose `dimensionId` is not a declared dimension is
  silently dropped** (`sqlBuilder.ts:70`), and there is no `cost_center` dimension by
  design (`semanticLayer.ts:65-68`). Pinned assertions live at
  `sqlBuilder.composed.test.ts:73` and `sqlValidator.composed.test.ts`.
- **Governed gate** — `selectionExecutor.ts:109-117` fail-closed on the `report` action +
  domain + every selected measure/dimension; grants seeded to `admin` (`migrate.ts:19-29`).
- **Routing reality** — `app.module.ts:11-16` imports only Core/Health/Ingest;
  `app.routes.test.ts:20-30` is a `deepEqual` **allow-list of 9 routes**; Reports/Chat
  controllers exist but are **unrouted**. Template: `reports.controller.ts` +
  `reports.service.ts:69-92`. Guards: `auth.guard.ts` `AuthGuard`, `RequireAction` (`:77-90`),
  `@CurrentUser()` (`:92-98`); CSRF global (`app.module.ts:14`).

## Design
### Resolution (C1)
`(department, function, plant, period)` → the master's selection record → cost centres, GL
set, `mis_format`, and the bucket rows. The `plant` argument may arrive as **any** master
alias (canonical `DUB`, SAP `DUB-NUR`, display `Agri - Nursery - DUB`) and resolves via
`canonicalPlantFromMaster` — never a local table.

**Two zero states, decided by resolution — never by row count:**
- unresolvable → zeros + the "no mapping configured" notice;
- resolved but no transactions → a configured **zero** result with **no** notice.

**Period.** Options are the **loaded** actual months (from the active ingest batches — July
2026 today) **plus one derived `fy26-27-ytd`**. The server resolves FY-YTD as
`2026-04-01 → the latest active loaded month`, **never `Date.now()`** — otherwise the answer
changes with the calendar.

### Governed narrowing (C2 — decision 0017: filter before the roll-up, one path)
```sql
actual_src AS (
  SELECT gl_code, month, SUM(actual_net)::numeric(18,2) AS actual_net
  FROM actual_by_key_month
  WHERE <existing scopePredicate>                    -- plant IN (validated scope)
    AND (plant, cost_center, gl_code) IN (<resolved triples>)
  GROUP BY gl_code, month
),
budget_src AS ( ... FROM budget_by_gl_month
  WHERE 'DUB' IN (<scope values>)                    -- unchanged derived-constant guard
    AND gl_code IN (<resolved GL set>) )             -- NEW
```
`actual_src` **absorbs** the `GROUP BY` that `actual_by_gl_month` performed, so the
reduction to one row per `(gl_code, month)` still happens **before** the FULL OUTER JOIN —
the no-fan-out invariant holds. Restricting `budget_src` fixes a **real defect** the story
grill found: otherwise every active DUB budget GL flows through and budget-only rows outside
the selection appear, breaking "exactly the DUB nursery slice". Budget is **not** re-grained
and cost centre is **never** part of the Budget key (0016).

`actual_by_key_month` **must** join `objectsTouched` or the validator rejects the query. The
resolved triples travel as a **distinct resolved-scope input** on the build path — they
cannot ride in `selection.filters` (silently dropped). An **unselected** composed query keeps
its existing behaviour: the narrowing is additive. Everything governed-joins established
still holds — the fail-closed gate, two-sided scope, zero-fill, the `%` CASE nil rule, and
in-query provenance.

### The first governed-query routes (C3)
A new `mis` module + controller + service on the `reports.controller` template, registered in
`app.module.ts` and in the `app.routes.test.ts` allow-list (that test fails otherwise),
guarded by `AuthGuard` + `RequireAction("report")`.

- **options** — master-derived Department / Function / Plant / period choices.
- **run** — accepts **only** `{department, function, plant, period}`. It never accepts
  triples, GL codes, format ids or scope; a client able to supply resolved scope could
  **widen** a report, and a test must prove the DTO rejects the attempt. The server resolves,
  authorizes, and invokes the **existing** `SelectionExecutor`.

## Workflow
```mermaid
flowchart TD
  C[client] -->|GET options| O[master-derived selector choices]
  C -->|POST run · ONLY the 4 selectors| S[mis service]
  M[(Mapping Master · task 1)] --> O
  M --> S
  S --> R{resolve}
  R -->|unresolvable| N[zeros + 'no mapping configured' notice]
  R -->|resolved| T["cost centres + GL set + format + bucket rows"]
  T --> B["actual_src: triples on actual_by_key_month, GROUP BY gl_code+month<br/>budget_src: restricted to the resolved GL set"]
  B --> X[existing SelectionExecutor · fail-closed grants]
  X --> J[FULL OUTER JOIN · zero-fill · %-nil · provenance unchanged]
```

## Manual Verification
1. `npm run test:hermetic` — resolution returns the scope for Agriculture/Nursery/DUB and
   the unresolvable outcome for an uncovered selection; the notice never depends on row
   count; `fy26-27-ytd` derives from the latest loaded month, not the clock; the builder
   emits the triple-filtered `actual_src` and the GL-restricted `budget_src`, lists
   `actual_by_key_month` in `objectsTouched` and still passes the validator; an unselected
   composed query is unchanged; the run DTO rejects triples/GLs/format/scope; both routes
   refuse an unauthorised caller; `app.routes.test.ts` lists exactly the new routes.
2. `docker compose up -d warehouse-db`; `npm --prefix backend run warehouse:migrate`.
3. **D-0008 host proof**: `WAREHOUSE_PG_* … npm --prefix backend run test:warehouse-proof` —
   `tests N / pass N / fail 0 / skipped 0`; the new slice leaf proves a cost-centre-filtered
   selection returns **one row per `(gl_code, month)` with no fan-out and exact values**, and
   that a budget GL outside the resolved set does **not** appear.
4. Dead-port negative control (`WAREHOUSE_PG_PORT=5599`) — the gated leaves FAIL
   (`ECONNREFUSED`).
5. The five pre-existing gated proofs still pass — the narrowing must not regress
   governed-joins.

## Decisions attested
0017 (filter before the roll-up, ONE governed path), 0018 (the bucket rows this resolution
returns), 0016 (Budget's cost_center is an informational label — hence the GL-only Budget
restriction and no cost-centre Budget key), 0014 (this story fulfils its deferral), 0004
(one governed definition; the LLM selects, never authors SQL), 0012 (its vendored deviation
does **not** excuse these fresh routes from DTOs/Swagger), 0009, 0015.

## Surface impact
- Backend: `mapping/selection-resolver.ts` (NEW), `sql/sqlBuilder.ts` (selection-aware Actual
  CTE, restricted Budget CTE, `objectsTouched`), `chat/selectionExecutor.ts` (thread the
  resolved scope), `mis/` module + controller + service + DTOs (NEW), `app.module.ts`.
- Contract: `contract/src/api.ts` — the options/run request and response types.
- Tests: `selection-resolver.test.ts`, `sqlBuilder.selection.test.ts`,
  `mis-selection.controller.test.ts` (NEW hermetic); `selection-slice.db.test.ts` (NEW
  gated); updated `sqlBuilder.composed.test.ts`, `sqlValidator.composed.test.ts`,
  `selectionExecutor.composed.test.ts`, `app.routes.test.ts`; `backend/package.json` +
  `tools/quality-gate.test.mjs`.
- **Unchanged by design**: the warehouse views and migrations (the master filters, it does
  not re-shape data); Budget's grain; the `%` CASE, zero-fill and provenance; the executor's
  authorization rules (reused, never widened); ingestion; the mapping master itself (task 1).

## Out of scope
The MIS Reports page and its rendering of the bucket (task 3); the hierarchical statement and
Excel export (`mis-statement`); drill-down; in-app authoring of the master; plants beyond DUB;
the balanced budget allocation (0014/0016, still deferred).

## Task Decomposition
This is task 2 of the mis-selection story's 3-task decomposition
(`.factory/stories/mis-selection/decomposition.json`): (1) mapping-master [done, #25],
(2) **selection-resolution** [this task], (3) selection-ui (`user_facing: true`). It is a
single bounded unit — resolution, the governed narrowing it drives, and the routes that
expose it are inseparable — and is not further subdivided; its three criteria are proven by
the three hermetic required_tests plus the gated D-0008 slice proof.


## What to return

Findings only: contradictions, gaps, unstated assumptions, and anything a reader would have to guess. Say what would break and why. Do not record a gate — the coordinating session records it.

The round count below is a FLOOR, not a target. Keep grilling until a round comes back clean AND stays clean on the next one — hitting the floor is not the same as passing.
