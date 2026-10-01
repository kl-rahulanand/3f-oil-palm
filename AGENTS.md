# AGENTS.md — 3oilpalm

## What This Repo Is

Symphony Forge is a dual-runtime software-factory template for turning in-repo architecture and decision docs into shipped applications.

It provides:
- planner-owned decomposition
- bounded implementation tasks
- deterministic verification
- schema-validated evidence recording
- autoreview-owned review
- PR-ready proof artifacts

## Mandatory Read Order

1. `WORKFLOW.md`
2. `docs/FACTORY.md`
3. `docs/QUALITY.md` and `docs/ROLES.md`
4. `harness.yaml`
5. `constitution/README.md`
6. `docs/product/BRIEF.md`
7. `docs/architecture/` and confirmed capability specs under `docs/specs/`
8. active decisions — `./forge decision list --active`, not raw `docs/decisions/`
9. the derived roadmap, active plan, and decomposition artifacts

## Runtime Modes

Claude Code coordinates discovery, planning, decisions, and orchestration through `codex-plugin-cc`. Its hook always denies product and canon writes; planning exploration is delegated to Codex read-only runs.

Codex executes exploration, implementation, testing, and review. `./forge delegate` is the sole normal write path; a five-file `forge mode degraded` window is the ledgered outage exception. The `.factory` artifacts are required in either route.

## Phase Contract

0a. run lightweight discovery without `.factory` ceremony
0b. prototype freely; save and confirm specs as capabilities emerge
0c. derive the roadmap from confirmed specs
1. record client sign-off (the spec/roadmap gate is checked now)
2. plan one roadmap story and generate its decomposition
3. wait for approval
4. implement one bounded task via `./forge delegate`; measure under decision 0018
5. run deterministic verify
6. run one autoreview pass (three lenses: quality, performance, security)
7. run the functional check when the decomposition says `user_facing: true`
8. record the shipped outcome, then mark PR ready

Recording sign-off requires confirmed specs plus a derived roadmap. Later
phases require sign-off; implementation also requires a plan and decomposition.

## Prompt and Agent Use

Prompt files under `factory/prompts/` are phase contracts. They are invoked explicitly by the parent session; hooks only load context and enforce gates.

Before delegating to subagents, read and follow [ROLE.md](ROLE.md) for model selection, delegation scope, and escalation. Default specialist set:
- `planner-high`
- `docs-decomposer`
- `functional-checker` (user-facing tasks only)
- the autoreview skill (review — all three lenses, one run)

Testing has no separate agent: the implementer writes and records the tests.

## Reasoning Defaults

- planning / decomposition / architecture reconciliation: `high`
- code exploration: `gpt-5.6-terra` @ `high` (`/codex:rescue`, read-only)
- implementation: `gpt-5.6-sol` @ `medium` (`high` for migrations/cross-domain/security)
- review and testing agents: explicit per-agent overrides

Do not default the entire repo to `high` reasoning for every task.

## Deterministic Commands

Devs speak intents; the `/forge` skill maps them to these commands.
Lost? `./forge next` prints the current phase and exact next actions.

```bash
python3 factory/scripts/intake.py --issue ENG-123 --title "Feature title"
python3 factory/scripts/record_decomposition_from_json.py --input /tmp/decomposition.json
python3 factory/scripts/update_run.py --phase awaiting-approval --plan-status awaiting-approval
python3 factory/scripts/verify.py
python3 factory/scripts/record_test_from_json.py --kind automated --input /tmp/automated.json
python3 factory/scripts/record_review_from_json.py --aspect quality --input /tmp/quality.json
./forge outcome set "<what changed and what someone can now do>"
python3 factory/scripts/pr_ready.py
```

## Hard Gates

A task is not PR-ready until all of these exist:
- approved plan
- `.factory/run.json`
- `.factory/decomposition.json`
- `.factory/verify.json`
- `.factory/tests.json`
- `.factory/reviews/{quality,performance,security}.json`
- `.factory/outcome.json` (what the story delivered — `./forge outcome set`)

## Non-Negotiables

- Keep tasks bounded and capability-driven; plans bind one roadmap story and attest all active decisions.
- The session write lock is always armed: delegate locked writes; use `forge mode degraded` only during a companion outage.
- Do not decompose by document file or arbitrary file count.
- Do not bypass `verify.py` with ad hoc validation commands.
- Evidence enters `.factory/` only via schema-validated recorders (pinned `generated_by`), never by hand.
- Narration budget (conduct §8): one line per state change; findings always; process chatter never.
- Review = ONE autoreview pass run by the orchestrating session directly —
  never a Codex review job (decision 0011), never nested reviewers.
- One worktree/story; sequential tasks; dependency-ready stories may parallelize (0002). Delegation/proof commands are trusted inputs; observed descendant cleanup is not hostile-code containment.
- Keep the template repo independent of any client-specific source repo.
- Do not keep long policy blocks in `AGENTS.md`; move them into docs.

<!-- forge:begin -->
<!-- Generated by forge sync. Edit outside the forge:begin and forge:end lines; sync rewrites this block. -->
## Working here with Forge

Forge takes each change from an approved plan to a merged pull request. Whenever you
are unsure, run `forge next`: it says where things stand and gives the exact next command.

If Forge started you with a brief, as a worker or a cold reader, that brief is your job: follow it
and the Rules below, and leave the flow and the approval steps to the agent coordinating the work.

### The flow

1. A story starts as one short doc: `forge story new <KEY> "<title>"`.
2. It gets rounds of cold read (`forge read <KEY>`) until one finds nothing, then one approval
   from the human.
3. Each task runs in its own branch and worktree: `forge task start <KEY>/<TASK>`, then
   `forge work <KEY>/<TASK>`.
4. `forge close <item>` closes it when the tests pass and the review finds no serious problem.
5. The human merges unless the default branch's `forge.toml` has `merge = "agent"`.
   Then, once close says Ready, the agent runs `forge merge <item>`. After the story's last merge,
   `forge story done <KEY> "<outcome>"`.

### The lanes

- **Story:** anything that changes an interface or needs more than five code files.
- **Fix:** a small change, started with `forge fix start "<why>" --done "<done when>"`.
  Specs, decisions, the roadmap and discovery notes ship as fixes.

### Rules

- Never commit to the default branch. Work happens on a story, task or fix branch, and the
  git hooks refuse anything else.
- Never run `gh pr merge` or use `--no-verify`. The agent merges only through
  `forge merge <item>` when the default branch allows it; `merge = "human"` is the default.
- Ask the human only to approve a story, to choose between options, or to merge when the repo
  keeps the human merge setting.
- No running commentary. Speak only when something lands, when a failure or finding needs the
  human, or when a decision is theirs, in a line or two.
- Write for humans in plain English: no IDs, hashes or jargon in questions, pull request
  summaries or the board.
- A story is approved through Plan Mode: exit Plan Mode with the text of the story doc that
  `forge next` names, unchanged, as the plan: from its title down to `## For the builders`, or the
  whole doc when it has no such heading. The approval matches its "What changes for you" and
  "Done when" sections exactly, so a summary or a rewrite records nothing, and an edit below
  `## For the builders` needs no new approval. There is no other approval step.
- Run long `forge work` runs in the background and keep watching them.
<!-- forge:end -->
