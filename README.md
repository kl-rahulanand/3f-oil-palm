# 3oilpalm

## Working in this repo — Symphony Forge

This repo runs on the [Symphony Forge](https://github.com/knacklabs/symphony-forge)
engineering harness: agents do the mechanical work, deterministic gates keep
the evidence honest, and humans make the decisions. Getting started is
conversational — open an agent session (Claude Code or Codex) in the repo
root, then:

- **The session checks your machine every time.** If tools are missing it
  says so on the spot — reply "set up my machine" and approve the installs;
  only logins stay manual.
- **Ask "what now?" whenever you are unsure.** The harness answers with the
  current phase and the exact next step. There is nothing to memorize.
- **Every feature starts with a plan the agent must defend.** Product writes
  require plan mode and an approved plan, or an explicit five-file quickfix;
  planned work then runs stage by stage with a local review
  before every commit, and shipping refuses until the evidence gates pass.
- **The map:** `AGENTS.md` is the contract and read order, `WORKFLOW.md` the
  doctrine, `docs/product/BRIEF.md` what this product is. Standards that are
  law live in `docs/architecture/` and `docs/decisions/`.
- **Humans own** accepting decisions, client sign-off, and merging PRs —
  agents draft and relay, never run those.

The vendored harness machinery (`factory/`, `constitution/`, gate scripts)
is frozen: never edit it here — improvements go to the harness repo and
arrive by re-vendoring.
