---
slug: assistant-and-exploration
title: Assistant & exploration
status: draft
saved: 2026-09-14T15:54:16+00:00
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
- **LLM & residency:** settled 2026-09-12 — Bedrock, `ap-south-1` (decision **0027**).
- **Guardrail:** conversational for chat; numbers only from governed measures
  (select-only, never authors SQL, never fabricates); guide back when diverging.

## Settled by the requirements grill (2026-09-12)
A cold read against the built repo found ten gaps. All are settled here; three were
human-decided and carry their own decision records.

- **Timing is settled, and the contradiction is closed.** The assistant **ships in the PoC** as
  story 7 of 7 (decision **0026**), superseding only the chatbot clause of decision 0002 and
  amending the chatbot-timing clause of `docs/product/BRIEF.md`. That closes only the **timing
  half** of **D-0032** — the BRIEF still frames Smart Palm, Yield/ha and OER as v1's headline
  metrics, and that half stays open. 0002's Operational MIS deferral stands. **Human-decided this grill.**
- **LLM and residency are no longer open.** AWS **Bedrock in `ap-south-1` (Mumbai)** (decision
  **0027**). Only the **question, the prior turns, and the governed vocabulary** may leave the
  app — names, labels, **and dimension distinct values** (capped by `dimensionEnumMax`), so 3F's
  plant, cost-centre and GL identifiers do reach AWS. **Amounts, transaction lines, batch
  contents and result rows never do**, and a test asserts the provider's input so the boundary is
  a control rather than a sentence. `MockLlmProvider`
  always returns `clarify` and never selects, so it is development-only and not a shippable
  fallback. **Human-decided this grill.**
- **A save stores the selection, never the answer** (decision **0028**): pins are personal and
  **re-authorize on every open**, so a revoked grant yields a refusal rather than a cached
  figure. Answer snapshots and shareable pins are out of scope. **Human-decided this grill.**
- **The data vocabulary is bounded and named.** The assistant may select only from the domains
  the semantic layer actually registers — **`governed-financial`** and **`mis-statement`** —
  over the proven Agriculture / Nursery / DUB slice and the periods the statement offers. A
  question outside that catalog is **refused as unsupported and says so**; it is never answered
  with a zero, which decision **0018** already established is a different and meaningful value.
- **"Verified" and "no fabricated numbers" are falsifiable.** **Every numeric character the user
  can see** — in prose, labels, chart axes and annotations, and follow-ups — is rendered from the
  deterministic governed result. The model never emits a figure. Rounding follows the statement's
  rules (Indian grouping, ₹, display-rounded after aggregation). An empty result says it is
  empty; an ambiguous question asks one clarifying question rather than guessing; and when no
  chart suits the shape of the answer, none is drawn.
- **"View in report" has a contract.** The link carries the selection's Department, Function,
  Plant and period **and the batch provenance of the answer that produced it**, so the statement
  it opens is the one the assistant was talking about. When a question cannot be represented as a
  statement selection, the link is **absent with a reason**, never a link to something else.
- **RBAC and audit have failure semantics.** The assistant inherits the all-or-nothing governed
  access of decision **0016** and **re-authorizes on every ask, every saved re-run and every pin
  open** — never on the strength of an earlier authorization. Every data answer writes its audit
  record **before** the read and **fails closed**, as the vendored chat path already does; denials
  and unsupported requests are audited too, following the drill-down precedent.
- **The response matrix is explicit**, in precedence order: a **data question** is answered from
  the governed measures with provenance; a **definition question** is answered from the semantic
  layer's own labels; an **ambiguous** question gets one clarifying question; a **causal "why"**
  is declined as out of scope (it stays out) and redirected to what the numbers do show; and
  **general chat** is answered naturally but claims nothing about 3F's data and guides back to
  the report.
- **Every promised surface is acceptance-covered** — see Acceptance criteria below, which now
  name the docked panel, the standalone Ask page, the chart, provenance, the report link, saved
  queries and pinned dashboards, rather than proving one generic answer.
- **DELIVERED 2026-09-12 - this paragraph described the pre-build state and is kept for the
  record, not as current requirements.** At the time of writing `AppModule` imported none of
  `chat`, `saved` or `pins`, the allow-list in `backend/src/app.routes.test.ts` contained no
  `/api/chat`, `/api/saved` or `/api/pins`, and the only applied migration
  `backend/drizzle/0000_auth_audit.sql` created auth and audit tables alone. **All of it now
  exists and is shipped** (PRs #42-#45, story closeout #46): the modules are registered and
  governed, the routes are allow-listed, and `backend/drizzle/0001_saved_and_pins.sql` adds
  `saved_queries` and `dashboard_pins`. A new story must NOT re-create any of it. Remediation of
  what shipped is specified separately in `docs/specs/assistant-responsiveness.md`.

## Rules
- RBAC + append-only audit on every data answer.
- Read-only: only SELECT against the warehouse, through the governed layer.

## Out of scope (now)
- Open-ended causal "why"; any write-back; the exact docked-panel placement is a
  nice-to-have, not a gate.

## Acceptance criteria
- An NL data question returns a **verified, provenanced** answer matching the report — **no
  fabricated numbers**, read-only only — with every visible numeric character traceable to the
  governed result.
- The answer is reachable from **both** surfaces: the **docked assistant** beside the report and
  the **standalone Ask page**.
- A **chart** is drawn when the answer's shape suits one, from the same result, and omitted
  rather than forced when it does not.
- **Provenance** is shown with the answer, and **"view in report"** opens the statement for that
  selection carrying the answer's batch provenance — or is absent with a reason when the question
  has no statement representation.
- A **saved query** stores the selection and **re-runs correctly under the current user's RBAC**;
  a **pinned dashboard** opens by re-running, and a revoked grant produces a refusal rather than
  a cached figure.
- A question **outside the governed catalog** is refused as unsupported, never answered zero.
- General chit-chat is handled naturally; off-topic questions get a helpful nudge back to the
  report; a causal **"why"** is declined rather than answered.
- Every data answer is **authorized and audited fail-closed**; a denial is audited too.

## Open items (non-blocking)
- The **Bedrock model id** (`BEDROCK_MODEL_ID`) is a deployment input with no default; the region
  is settled as `ap-south-1` by decision **0027**.
- A contractual **retention and NDA position** for model inputs rides with the production pilot
  (decision **0011**), not with this story.

## Source
Decision 0003; Pulse README (Metabot, saved queries, pin-to-dashboard).
