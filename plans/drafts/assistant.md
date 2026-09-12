---
story: assistant
title: Assistant + exploration
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

**The persistence it needs does not exist.** `backend/src/db/schema.ts` declares `conversations`,
`conversation_turns`, `saved_queries`, `dashboard_pins` and `pin_snapshots`. `backend/drizzle/`
contains exactly one migration, `0000_auth_audit.sql`, which creates `users`, `roles`,
`user_roles`, `role_perms`, `user_scope`, `sessions`, `otp_codes`, `refresh_tokens` and
`audit_events` — and `migrate.ts` runs that folder. So those five tables are **declared in
Drizzle and absent from the database**. Registering the chat module without a migration produces
an assistant that fails on its first durable turn. That is the single most load-bearing fact in
this plan, and it is invisible from the schema file alone.

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

**The one output-side gap is "view in report".** `AskReportGrounding { reportId, timeWindow }`
grounds a question *in* a report. Nothing carries an answer *back* to a statement: the MIS
statement needs Department, Function, Plant and period, and the spec settled that the link must
also preserve the answer's batch provenance so the statement it opens is the one the assistant
was talking about. That field does not exist and this story adds it.

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
- **Answer snapshots and shareable pins** (decision **0028**) — `PinSnapshot` stays in the
  contract unused rather than deleted.
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
2. **The tables exist.** A migration creates `conversations`, `conversation_turns`,
   `saved_queries`, `dashboard_pins` and `pin_snapshots`, and `db:migrate` applies cleanly on a
   database that has only `0000_auth_audit.sql`.
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
   answer's `activeBatchIds`, so the statement it opens is the one the answer came from — and is
   **absent with a reason** when a question has no statement representation.
7. **Both surfaces work**: the docked panel beside the report and the standalone Ask page, with
   suggested chips, the verified badge and provenance disclosure, per the approved prototype.
8. **A saved selection re-runs under the current user's RBAC**, and a **pin opens by re-running**;
   a revoked grant produces a refusal, never a cached figure. Nothing is stored that the user
   could not re-derive by asking again.
9. **Authorization and audit are per-request**: every ask, every saved re-run and every pin open
   re-authorizes and writes its audit record **before** the read, failing closed; denials and
   unsupported requests are audited too.
10. **The Bedrock boundary is enforced and testable**: the provider receives the question, the
    prior turns and the governed vocabulary, and **no warehouse row, measure value or batch
    content** — proven by asserting the provider's input, not by inspection.

## Technical Approach

### Registration, not authorship
`AppModule` gains `ChatModule`, `SavedModule` and `PinsModule` (creating the module files the
vendored controllers lack), the routes join the allow-list, and the governed grant gates them the
way `RequireAction("report")` gates the statement. The vendored services are used as they are;
where they need to change it is to enforce this story's boundary, not to rewrite their behaviour.

### The migration
One Drizzle migration for the five declared tables, generated from `schema.ts` so the declaration
and the database stop disagreeing. It must apply on a database whose only prior migration is
`0000_auth_audit.sql`, which is what every existing environment has.

### The Bedrock boundary
`LLM_PROVIDER=bedrock`, `AWS_REGION=ap-south-1`, `BEDROCK_MODEL_ID` set. The enforceable part is
what `LlmSelectionInput` carries: the question, prior turns and the allowed domains' vocabulary.
The test asserts the provider's **input**, so a future change that starts passing result rows
fails rather than leaks.

### View in report
A new optional field on the success response carrying the four statement selectors plus the
answer's `activeBatchIds`, populated only when the selection maps to a statement, and absent —
with a reason — otherwise. The client links from it; it never reconstructs a selection itself.

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
  view-in-report field present with batch ids and absent-with-a-reason; the Bedrock input
  boundary asserted on the provider's arguments.
- **Backend DB-backed** (gated, **D-0008**) — the migration applying to a database holding only
  `0000_auth_audit.sql`; a saved selection re-running under a *revoked* grant producing a refusal
  rather than a cached figure.
- **Audit** — a failing audit insert aborts the read; denials and unsupported requests are
  recorded.
- **Frontend unit** — both surfaces render an answer with its verified badge and provenance; the
  report link appears only when the response carries one; chips issue asks; saved and pinned items
  re-run rather than replay.
- **Functional check** (`user_facing` tasks) — live against this worktree's servers with Bedrock
  configured: ask a real question of the July statement and confirm the answer matches the report,
  follow "view in report" and confirm it lands on the same figures, save and re-open, pin and
  re-open.
- Every automated artifact records the **executed count and testcase name**, never the exit code
  (D-0024, D-0031).

## Surface Impact
- **New:** module files for chat, saved and pins; one Drizzle migration; the view-in-report
  contract field; the docked Ask panel, the standalone Ask page, and the saved/pins surfaces in
  `frontend/`.
- **Changed:** `app.module.ts` (three imports), `app.routes.test.ts` (the allow-list),
  `backend/src/db/migrate.ts` only if grant seeding is needed for a new action, and
  `frontend/app/globals.css`.
- **Unchanged:** the semantic layer, the statement and drill paths, the warehouse schema, and
  every governed measure. The assistant reads what the report reads.

## Task Decomposition
Five bounded tasks, sequential. No task spans backend and frontend — `WORKFLOW.md` forbids it,
which is why exploration is two tasks rather than one.
1. **assistant-persistence** (backend, `user_facing: false`) — the migration for the five
   declared-but-absent tables, applied and proven against a database holding only the auth/audit
   migration.
2. **assistant-governed-ask** (backend, `user_facing: false`) — register and govern chat, wire
   Bedrock with its boundary enforced, the response matrix, the out-of-catalog refusal, and the
   view-in-report contract field.
3. **assistant-surfaces** (frontend, `user_facing: true`) — the docked Ask panel and the
   standalone Ask page from the prototype: chips, verified badge, provenance disclosure, view in
   report.
4. **assistant-exploration-api** (backend, `user_facing: false`) — the saved-selection and pin
   routes, storing selections only and re-authorizing on every open, with a revoked grant
   producing a refusal rather than a cached figure.
5. **assistant-exploration-view** (frontend, `user_facing: true`) — the Explore / saved-views
   surface and the dashboard's pinned-reports list, opening by re-running.

**Why five.** The migration is the hard dependency everything else needs and is provable on its
own. Registration-and-governance is where the security load sits and deserves its own review.
The two Ask surfaces share a payload and a design language, so they are one task. Exploration
splits in two only because `WORKFLOW.md` forbids a task spanning backend and frontend — and it
is last because it is the part most likely to be cut if the PoC deadline bites, which is an
argument for sequencing it late, not for skipping it.
