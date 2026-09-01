---
slug: assistant-and-exploration
title: Assistant & exploration
status: confirmed
saved: 2026-09-01T10:15:05+00:00
---

# Assistant & exploration

## Why
Beyond the fixed statement, people ask ad-hoc questions and want a natural way to
interrogate the data. A trustworthy assistant over the same governed layer answers
those without a developer, and reinforces the trust story (verified, provenanced).

## Users
Finance / management asking questions; analysts exploring beyond the fixed MIS.

## Behaviour
- Natural-language questions → a **verified answer (+ chart)**, grounded in the
  governed measures, with **provenance** and a **"view in report"** link.
- Two surfaces: a **docked assistant** beside the report and a **standalone Ask
  page**; plus **saved queries + pinned dashboards** for self-serve exploration.
- **Converses like a normal agent** for general chat.
- **Strict on numbers:** figures come **only from the governed measures**; the LLM
  **selects, never authors SQL**; it **never fabricates a number**; and it is
  **read-only (SELECT only)**.
- If the user **diverges** from the report/data scope, it answers naturally but
  **guides them back** to the report.
- **Included in the first PoC release.**

## Confirmed scope (grilled 2026-09-01)
- **Timing:** in the first PoC release (not a fast-follow).
- **LLM & residency:** **OPEN — decide later.**
- **Guardrail:** conversational for chat; numbers only from governed measures
  (select-only, never authors SQL, never fabricates); guide back when diverging.

## Rules
- RBAC + append-only audit on every data answer.
- Read-only: only SELECT against the warehouse, through the governed layer.

## Out of scope (now)
- Open-ended causal "why"; any write-back; the exact docked-panel placement is a
  nice-to-have, not a gate.

## Acceptance criteria
- An NL data question returns a **verified, provenanced** answer matching the
  report — **no fabricated numbers**, read-only only.
- General chit-chat is handled naturally; off-topic questions get a helpful nudge
  back to the report.
- A saved report re-runs correctly under the current user's RBAC.

## Open items (non-blocking)
- **LLM/model + data-residency** decision (deferred).

## Source
Decision 0003; Pulse README (Metabot, saved queries, pin-to-dashboard).
