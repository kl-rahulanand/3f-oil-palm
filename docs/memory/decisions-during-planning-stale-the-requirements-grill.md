---
name: decisions-during-planning-stale-the-requirements-grill
description: Accepting a decision while planning changes docs/decisions/, which stales the requirements grill that plan save then demands — mint decisions before recording the requirements pass.
metadata:
  type: project
---

`./forge next` step 3 during planning says "Record new decisions as you go". Doing so writes
`docs/decisions/`, which `product_tree_digest` hashes (`factory_lib.py`, everything tracked
except `.factory/` and `plans/`). `requirements_digest` is the confirmed spec's body plus that
tree digest, so a new or accepted decision **stales the requirements grill** — and
`forge plan save` refuses without a fresh one (`forge_cli/plans.py`).

Following the harness therefore invalidates a gate the harness then demands.

**Why:** hit on `drill-down` (2026-09-11). The plan grill settled two decisions (0024, 0025);
accepting them staled the requirements pass recorded minutes earlier, forcing a second cold
read and a second human round. The re-read was not wasted — it found a real footing hole (the
outline snapshot that maps `nodeKey` to a leaf is `is_active`-filtered, so a budget re-upload
would swap the mapping under a correctly pinned actuals batch) — but that was luck, not design.

**How to apply:** mint and accept a story's decisions *before* recording its requirements
grill, so one cold read covers the spec and the decisions together. If a decision is forced
later, expect the re-read and budget for it rather than discovering it at `plan save`. The
`plan` gate has the same shape for `docs/product/`, `docs/decisions/` and `docs/architecture/`
via `require_handover_grill`, and it checks the **working tree** too — commit before recording,
or the stamp is stale on arrival. Raised upstream as an open item on the drill-down
requirements grill.
