---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-01
stories: [platform-base]
---

# Pulse backend/contract vendored as a pinned snapshot

## Context
The `vendor-backend-contract` task snapshots Pulse's backend + contract (163 files
/ 19,253 lines). That exceeds the default per-task review budget (8 files / 400
lines), so Codex correctly paused with signal **S-0001-bfb3** rather than dumping
it. A wholesale vendor of our *own* existing code is a bulk import, not authored
line-by-line work; splitting a mechanical copy into ~20 tasks is pointless.

## Decision
Treat Pulse `backend` + `contract` as a **pinned vendored snapshot** — the same
model the harness uses for `constitution/` (`VENDORED_FROM`, re-vendor rather than
edit in place):
- Import wholesale; **review it as "Pulse @ <commit>"**, not line-by-line.
- The vendor task carries an **elevated `review_budget`** (with a reason naming this
  decision), so the worker imports the snapshot instead of refusing.
- The factory then **authors and line-reviews only the DELTAS** on top (strip MBS,
  wire the workspace, the Postgres adapter, the fresh frontend).
- Record the source commit so the snapshot is **re-vendorable**, never hand-edited
  wholesale.
- The **frontend workspace entry is deferred** to the frontend task; the vendor
  task brings in backend + contract only (workspaces `contract`, `backend`).

## Consequences
- The elevated budget is justified and reasoned; the harness records it explicitly.
- The reviewable surface stays the authored deltas, not 19k imported lines.
- Keeps the build in this repo (per the vendor-approach choice) without fighting
  the authored-diff model.

## Related
- Decisions: 0003 (custom + Pulse), 0006 (frontend fresh / backend-only vendor)
- Signal: `.factory/signals.jsonl` S-0001-bfb3; Spec: `docs/specs/app-platform-base.md`
