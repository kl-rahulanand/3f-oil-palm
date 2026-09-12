---
issue: assistant
title: Assistant + exploration
status: approved
saved: 2026-09-12T07:26:33+00:00
story: assistant
decisions_reviewed:
  - 0001-poc-engagement-scope
  - 0002-phase1-financial-mis
  - 0003-mis-presentation-tool
  - 0004-pulse-governed-joins
  - 0005-client-signoff
  - 0006-frontend-fresh-backend-vendor
  - 0007-frontend-framework-nextjs
  - 0008-pulse-vendored-snapshot
  - 0009-required-tests-real-name-and-tsproject
  - 0010-rebrand-pulse-to-3f
  - 0011-deployment-readiness-poc-scope
  - 0012-vendored-api-constitution-deviation
  - 0013-backend-observability-built-in-poc
  - 0014-sap-ingestion-poc-no-master
  - 0015-warehouse-snake-case-deviation
  - 0016-governed-joins-poc-scope
  - 0017-mis-selection-composite-key-seam
  - 0018-mis-selection-unmapped-gl-bucket
  - 0019-fresh-routes-follow-vendored-house-style
  - 0020-mis-budget-leaf-grain
  - 0021-mis-statement-outline-snapshot
  - 0022-mis-statement-governed-projection
  - 0023-mis-statement-drift-reports-not-blocks
  - 0024-drill-down-aggregate-client-projection
  - 0025-drill-down-pinned-batch-raw-read
  - 0026-assistant-ships-in-the-poc
  - 0027-assistant-llm-bedrock-mumbai
  - 0028-saved-selections-not-snapshots
---

# Assistant + exploration

## Problem
Six stories in, 3F can read the Financial MIS and trace any Actual to the transactions behind
it. What they still cannot do is **ask**. The last roadmap story adds the conversational and
exploration layer over the same governed measures — and closes the PoC.

Reading the system for this plan moved the problem twice, and both times away from "build an
assistant" toward "make the one we already have reachable, and give it somewhere to write."

**The assistant is vendored, complete-looking, and entirely unreachable.** `backend/src/chat/`
is 3,758 lines across eighteen files — `ChatService.ask()` with smalltalk classification,
ambiguity and clarify handling, a reconciliation guard, verified-selection checks, SSE
streaming, provenance assembly and a fail-closed audit write inside `beforeExecute`. Its
collaborators all exist: `ConversationsService`, `ReportsService`, `HelpService`,
`DimensionValuesService`. And **none of it is wired in**: `backend/src/app.module.ts` imports
`CoreModule`, `HealthModule`, `IngestModule`, `MisSelectionModule` and `MisModule` — not chat,
not saved, not pins. The registered-route allow-list in `backend/src/app.routes.test.ts` lists
fourteen routes and contains no `/api/chat`, `/api/saved` or `/api/pins`. This story's first job
is registration and governance, not authorship.

**The persistence it needs does not exist — and it is seven tables, not five.** `backend/src/db/schema.ts` declares `conversations`,
`conversation_turns`, `saved_queries`, `dashboard_pins` and `pin_snapshots`. `backend/drizzle/`
contains exactly one migration, `0000_auth_audit.sql`, which creates `users`, `roles`,
`user_roles`, `role_perms`, `user_scope`, `sessions`, `otp_codes`, `refresh_tokens` and
`audit_events` — and `migrate.ts` runs that folder. Seven declared tables are therefore **absent
from the database**: `authored_measures`, `conversations`, `conversation_turns`,
`reconciliation_runs`, `saved_queries`, `dashboard_pins` and `pin_snapshots`. Registering the
chat module without a migration produces an assistant that fails on its first write. That is the
single most load-bearing fact in this plan, and it is invisible from the schema file alone.

It also means the migration must be **deliberately scoped, not generated**: a migration generated
from `schema.ts` would sweep in all seven, including two (`authored_measures`,
`reconciliation_runs`) that belong to features this story does not ship. This story creates
**two** — `saved_queries` and `dashboard_pins` — and neither `conversations`/`conversation_turns`
(durable history is deferred, below) nor `pin_snapshots` (decision **0028** forbids what it
stores).

**Two vendored behaviours actively contradict the decisions you just accepted.** Pins are not
merely snapshot-capable — `pins.service.ts:50` refreshes and persists a `ResultTable` on create,
and `list` left-joins `pin_snapshots` and returns it. That is governed data at rest, which
decision **0028** forbids. It is not enough to leave `PinSnapshot` unused; this story **removes
that behaviour**. Likewise the audit is not per-request as the spec now promises: the fail-closed
request event is written only immediately before the final governed execution, while the
unsupported and denied branches fall to `writeResultEvent`, which `audit.service.ts` documents as
best-effort and never blocking.

**A third thing, smaller but fatal to a demo:** `MockLlmProvider.select()` always returns
`kind: "clarify"`. It never selects. Without `LLM_PROVIDER=bedrock` and a set `BEDROCK_MODEL_ID`
the assistant cannot answer a single question — it can only ask one back. Decision **0027**
settles the provider and region; the model id remains a deployment input with no default.

What the vendored code **does** already give us is most of the answer contract. `AskResponse`
carries `selection`, `result`, `totals`, `chartType`, `availableChartTypes`, `availableFields`,
`provenance`, `appliedTimeWindow`, `appliedFilters`, `chips` and `clarify`; `Provenance` carries
`verified`, the measure definitions, `readback`, `dataAsOf`, `sql` and — since `governed-joins` —
`activeBatchIds`. The governed vocabulary is narrow and real: `semanticLayer.ts` registers
exactly two domains, `governed-financial` and `mis-statement`.

**The one output-side gap is "view in report", and it is deeper than a response field.**
`AskReportGrounding { reportId, timeWindow }` grounds a question *in* a report. Nothing carries an
answer *back* to a statement — and the statement route cannot receive it if it did: it takes four
selectors and has **no `pinnedBatches`**; only the drill route accepts those. So preserving the
answer's provenance means changing the **statement request** as well, to accept pinned batch ids,
validate them, and return a typed "the data was refreshed — ask again" result when they are no
longer active, exactly as the drill does. The statement API is therefore **Changed** by this
story, not unchanged as an earlier draft of this plan claimed.

## Scope / Non-goals

**In scope**
- Registering and governing the vendored chat, saved and pins modules, with their routes added to
  the strict allow-list that is the only thing proving a route exists.
- The **migration** creating the five declared-but-absent tables.
- Bedrock wired per decision **0027**, with the boundary enforced: the question, prior turns and
  governed vocabulary may leave; **warehouse rows never do**.
- The **docked Ask panel** on the report and the **standalone Ask page**, from the approved
  prototype, with suggested chips, the verified badge, provenance disclosure and **view in
  report**.
- **Saved selections** and **personal pins** per decision **0028**, re-authorizing on every open.
- The response matrix: data / definition / ambiguous / causal-declined / general chat.

**Non-goals**
- **Answer snapshots and shareable pins** (decision **0028**). The vendored snapshot-on-create
  and snapshot-on-list behaviour is **removed**, and `pin_snapshots` is not created.
- **Durable chat history.** The current thread lives in client state only; `conversations` and
  `conversation_turns` are not created and `/api/conversations` is not registered. The prototype
  shows history, but neither the confirmed spec nor the acceptance criteria require it, and the
  vendored implementation rehydrates stored answers — governed data at rest, which 0028 forbids.
  **Human-decided at the plan grill.**
- **Generative prose.** General chat is answered from deterministic templates that cannot assert
  anything about 3F's data or emit a numeral; the model stays strictly a selector.
  **Human-decided at the plan grill.**
- **Historical statement rendering.** A stale "view in report" link is refused, not reconstructed;
  teaching the statement projection to render against arbitrary past batches is a separate story.
  **Human-decided at the plan grill.**
- Any write-back, any SQL authored by the model, any number produced by the model.
- Causal "why" answers — declined by the response matrix, not attempted.
- Widening the governed vocabulary beyond the two registered domains, or beyond the proven
  Agriculture / Nursery / DUB slice.
- A contractual retention or NDA position for model inputs — that rides with the production
  pilot (decision **0011**).
- Rewriting the BRIEF's Smart Palm / Yield / OER framing — the timing half of **D-0032** is
  closed by decision 0026; that half stays open.

## Acceptance Criteria
1. **The routes exist and are governed.** `/api/chat`, `/api/chat/stream`, `/api/saved` and
   `/api/pins` are registered, appear in `app.routes.test.ts`'s allow-list, and sit behind
   `AuthGuard`, the global `CsrfGuard` and the governed grant — a user without it is refused.
2. **The tables exist, and only the ones this story needs.** A deliberately scoped migration
   creates exactly `saved_queries` and `dashboard_pins` — not `pin_snapshots`, not
   `conversations`/`conversation_turns`, and not the unrelated `authored_measures` or
   `reconciliation_runs` a generated migration would sweep in. `db:migrate` applies cleanly on a
   database holding only `0000_auth_audit.sql`.
3. **A data question is answered from the governed measures**, with `provenance.verified` true,
   and every visible numeric character — prose, labels, chart axes, annotations — rendered from
   the deterministic result. The model emits no figure.
4. **Out-of-catalog questions are refused as unsupported** and say so; they are never answered
   with a zero, which decision **0018** established means something different.
5. **The response matrix holds** in precedence order: data question answered with provenance;
   definition answered from the semantic layer's labels; ambiguous gets one clarifying question;
   causal "why" declined and redirected; general chat answered naturally, claiming nothing about
   3F's data.
6. **View in report** carries the selection's Department, Function, Plant, period **and** the
   answer's `activeBatchIds`; the statement route accepts and **validates** those ids and returns
   a typed "the data was refreshed — ask again" result when they are no longer active, rather than
   silently rendering different numbers. The link is **absent with a reason** when a question has
   no statement representation.
7. **Both surfaces work**: the docked panel beside the report and the standalone Ask page, with
   suggested chips, the verified badge and provenance disclosure, per the approved prototype.
8. **A saved selection re-runs under the current user's RBAC**, and a **pin opens by re-running**;
   a revoked grant produces a refusal, never a cached figure. Nothing is stored that the user
   could not re-derive by asking again — and creating or listing a pin **persists and returns no
   `ResultTable`**, which the vendored code does today and this story removes.
9. **Authorization and audit are per-request, on every branch**: every ask, saved re-run and pin
   open re-authorizes and writes a **fail-closed** record before the read. Denied and unsupported
   requests get a fail-closed record too — not the best-effort `writeResultEvent` the vendored
   path uses for them today — and a pin re-run goes through the same boundary rather than
   executing directly.
10. **The Bedrock boundary is enforced and testable**: the provider receives the question, the
    prior turns, and the governed vocabulary **including dimension distinct values capped by
    `dimensionEnumMax`** (decision **0027** as amended) — and **no amount, transaction line, batch
    content or result row**. Proven by asserting the provider's input, not by inspection.
11. **General chat is deterministic.** Small talk and off-topic nudges come from templates; the
    model is never asked for prose and can emit no numeral.

## Technical Approach

### Registration, not authorship
`AppModule` gains `ChatModule`, `SavedModule` and `PinsModule` (creating the module files the
vendored controllers lack), the routes join the allow-list, and the governed grant gates them the
way `RequireAction("report")` gates the statement. The vendored services are used as they are;
where they need to change it is to enforce this story's boundary, not to rewrite their behaviour.

### The migration
One **hand-scoped** Drizzle migration creating `saved_queries` and `dashboard_pins` only. Not
generated from `schema.ts`: that would sweep in all seven absent tables, including
`pin_snapshots` (which 0028 forbids storing into), `conversations`/`conversation_turns` (history
deferred) and `authored_measures`/`reconciliation_runs` (other features entirely). It must apply
on a database whose only prior migration is `0000_auth_audit.sql`, which is what every existing
environment has. The declaration-versus-database gap for the other five is left as it is and
named, not quietly closed by a migration nobody asked for.

### The Bedrock boundary
`LLM_PROVIDER=bedrock`, `AWS_REGION=ap-south-1`, `BEDROCK_MODEL_ID` set. The enforceable part is
what `LlmSelectionInput` carries: the question, the prior turns, and the allowed domains'
vocabulary **including dimension distinct values capped by `dimensionEnumMax`** — which is
`chat.service.ts:167` calling `dimensionValuesForAllowedDomains` against the warehouse, permitted
by 0027 as amended. The test asserts the provider's **input**, so a future change that starts
passing amounts or result rows fails rather than leaks.

### Pins lose their snapshot
`pins.service.ts:50` refreshes and persists a `ResultTable` on create and `list` left-joins
`pin_snapshots` to return it. Both are removed, along with the refresh routes, so a pin holds a
selection and nothing else. This is a **deletion** of shipped vendored behaviour, made because
decision 0028 forbids it — not a feature left switched off.

### Audit on every branch
The vendored fail-closed request event guards only the final governed execution; denied and
unsupported branches fall to `writeResultEvent`, which is documented best-effort and never
blocks. This story moves the fail-closed boundary so that **every** branch that consults governed
data — including refusals — writes its record first, and routes pin re-runs through the same
boundary instead of executing directly.

### View in report, on both sides
A new optional field on the success response carries the four statement selectors plus the
answer's `activeBatchIds`, populated only when the selection maps to a statement and absent —
with a reason — otherwise. The client links from it and never reconstructs a selection itself.

The **statement route accepts those ids and validates them**, returning a typed "the data was
refreshed — ask again" outcome when they are no longer the active batches, which is the drill's
established precedent rather than a new idea. Without that half, the link is a promise the
system cannot keep.

### General chat
Deterministic templates, extending the existing `smalltalk-guard`. The model is never asked for
prose, so "never fabricates a number" holds structurally rather than by instruction.

### The surfaces
Both from `docs/design/3F-Financial-MIS`: the docked panel (eyebrow, "Ask about this report.
Answers are verified against the source.", suggested chips, the `✓ Verified` badge, the
collapsible provenance block, the "View in report" link and "⤢ Open in Ask") and the standalone
Ask page it opens. Saved views and pins follow the prototype's Explore surface and the dashboard's
"Pinned reports" list.

## Decisions
- **0026** — the assistant ships in the PoC, superseding only 0002's chatbot clause.
- **0027** — Bedrock in `ap-south-1`; question, prior turns and governed vocabulary may leave the
  app, warehouse rows never do.
- **0028** — saves store the selection, never the answer; pins are personal and re-authorize.
- Inherited and load-bearing: **0016** (all-or-nothing governed access), **0018** (a zero is not
  an absence — hence the out-of-catalog refusal), **0022** (the statement projection the answers
  and the report link agree with), **0019** (house style for the routes), **0011** (retention and
  residency contracts ride with the pilot), **0012** (the vendored API's constitution deviation
  still covers these controllers).

## Risks
- **The vendored chat code is large and was written for a different product.** Its smalltalk,
  ambiguity and reconciliation guards were tuned for Pulse's domains. They may misclassify 3F
  questions, and the response matrix is the contract they must now satisfy.
- **A demo cannot run without `BEDROCK_MODEL_ID`.** The mock provider only clarifies. This is a
  deployment input with no default and no fallback — worth confirming before any client session.
- **Model quality is not a gate we control.** The plan makes fabrication *structurally*
  impossible — numbers come only from the governed result — but a poor selection still produces a
  confidently wrong-looking answer to the right question. The clarify path is the mitigation.
- **Five new tables on the app database.** The migration is additive, but it is the first schema
  change to the app DB since platform-base, and it must apply to an environment that has only
  ever seen `0000_auth_audit.sql`.
- **Scope.** This is the largest remaining story: two backend module groups, a migration, a
  provider boundary, and three UI surfaces. The decomposition splits it accordingly.

## Verify Plan
- **Backend unit** — route registration and the allow-list; the governed grant refusing an
  ungranted user; the response matrix's five branches; the out-of-catalog refusal; the
  view-in-report field present with batch ids and absent-with-a-reason; the statement route
  refusing a stale pinned batch with its typed outcome; pins creating and listing with **no**
  `ResultTable` in the payload; the fail-closed audit on the denied and unsupported branches; and
  the Bedrock input boundary asserted on the provider's arguments — permitting dimension values,
  rejecting amounts and rows.
- **Backend DB-backed** (gated, **D-0008**) — the scoped migration applying to a database holding
  only `0000_auth_audit.sql`, creating exactly `saved_queries` and `dashboard_pins` and leaving
  the other five declared tables absent; a saved selection re-running under a *revoked* grant
  producing a refusal rather than a cached figure.
- **Audit** — a failing audit insert aborts the read; denials and unsupported requests are
  recorded.
- **Frontend unit** — both surfaces render an answer with its verified badge and provenance; the
  report link appears only when the response carries one; chips issue asks; saved and pinned items
  re-run rather than replay.
- **Functional check** (`user_facing` tasks) — live against this worktree's servers with Bedrock
  configured: ask a real question of the July statement and confirm the answer matches the report,
  follow "view in report" and confirm it lands on the same figures, save and re-open, pin and
  re-open. If `BEDROCK_MODEL_ID` is unavailable at check time, that is a **blocked** functional
  check to be reported as such — never one quietly passed against the mock provider, which can
  only ever return a clarification.
- Every automated artifact records the **executed count and testcase name**, never the exit code
  (D-0024, D-0031).

## Surface Impact
| surface | classification | why |
|---|---|---|
| `POST /api/chat`, `/api/chat/stream` | **New** (route registration) | vendored controller exists but is unreachable; registering it is what makes the assistant real |
| `POST /api/saved`, `/api/pins` | **New** (route registration) | same, for exploration |
| `saved_queries`, `dashboard_pins` tables | **New** (migration) | declared in `schema.ts`, absent from the database |
| view-in-report field on `AskResponse` | **New** (contract) | nothing today carries an answer back to a statement |
| `POST /api/mis/statement` | **Changed** (request + outcome) | gains pinned batch ids, their validation, and a typed refreshed-data refusal; without it the link cannot keep its promise |
| `PinsService` create/list, pin refresh routes | **Changed** (behaviour removed) | persisting and returning a `ResultTable` violates decision 0028 |
| `ChatService` audit boundary | **Changed** | the fail-closed record must cover denied and unsupported branches, not only the final execution |
| `app.module.ts`, `app.routes.test.ts` | **Changed** | three module imports and the strict allow-list that is the only proof a route exists |
| `backend/src/db/migrate.ts` | **Changed** *if* a new governed action is seeded | the assistant may need its own grant alongside `report` |
| Docked Ask panel, standalone Ask page, Explore, pinned reports | **New** (UI) | none of these surfaces exist in `frontend/` today |
| `frontend/app/globals.css` | **Changed** | the single stylesheet every surface uses |
| Semantic layer, warehouse schema, governed measures, drill path | **Unchanged** | the assistant reads exactly what the report reads |
| `conversations`, `conversation_turns`, `pin_snapshots` | **Unchanged (deliberately absent)** | durable history deferred and snapshots forbidden; the declaration-versus-database gap is named, not silently closed |
| Docs | **Changed** | decision 0027 amended for the dimension-values boundary; the spec's boundary sentence amended to match |
| Tests | **New** | provider-input assertion, the five response-matrix branches, the stale-link refusal, the revoked-grant refusal, migration-applies-clean |
| Ops | **Changed** | `LLM_PROVIDER`, `AWS_REGION` and `BEDROCK_MODEL_ID` become required deployment inputs; without the model id the assistant cannot answer at all |

## Task Decomposition
Four bounded tasks, sequential. No task spans backend and frontend — `WORKFLOW.md` forbids it,
which is why exploration is two tasks rather than one.
1. **assistant-governed-ask** (backend, `user_facing: false`) — register and govern the chat
   module, wire Bedrock with its input boundary enforced by test, implement the response matrix
   and the out-of-catalog refusal, move the fail-closed audit to cover every branch, and add the
   view-in-report field **with its statement-side counterpart**: pinned batch ids on the
   statement request, their validation, and the typed refreshed-data refusal.
2. **assistant-ask-surfaces** (frontend, `user_facing: true`) — the docked Ask panel and the
   standalone Ask page from the prototype: suggested chips, the verified badge, provenance
   disclosure, and the view-in-report link including its stale and absent states.
3. **assistant-exploration-api** (backend, `user_facing: false`) — the scoped migration creating
   `saved_queries` and `dashboard_pins`; the saved and pin routes storing selections only and
   re-authorizing on every open; and the **removal** of the vendored snapshot-on-create and
   snapshot-on-list behaviour together with the refresh routes.
4. **assistant-exploration-view** (frontend, `user_facing: true`) — the Explore / saved-views
   surface and the dashboard's pinned-reports list, opening by re-running rather than replaying.

**Why the order changed from an earlier draft.** The migration is no longer a task of its own,
and no longer first. Once durable history was deferred and snapshots forbidden, the only tables
left are `saved_queries` and `dashboard_pins` — both used solely by exploration — so the
migration belongs *with* exploration rather than gating the assistant. Ask now leads because it
is the story's point and carries its security load, and because a working answer is what makes
the surfaces reviewable. The two Ask surfaces share a payload and a design language, so they are
one task. Exploration is last because it is the part most likely to be cut if the PoC deadline
bites — an argument for sequencing it late, not for skipping it.
