# The on-screen assistant explains a number on the MIS statement

## What changes for you

**In scope.** An attested statement context; `statementGrounding` on `AskRequest`; server-side
re-derivation and typed refusals; a three-arm intent enum; leaf explanations (roll-up path +
transactions) and aggregate explanations (client projection); a typed response union; the drill's
governed-read protections on the leaf read; staleness per decision 0025; `budgetState`.

**Explicit non-goals.** `/ask` behaviour, in **sending and rendering** (0038). Plant-from-question
and the "name a plant" clarification (0035's deferred half). Threading pinned batches through
`SelectionExecutor` so ordinary grounded data questions inherit pin and budget guarantees - grounding
means **explanation only**, and that gap is deferred with a trigger. Closing D-0038's mapping-version
detection: C12 is attribution only. Answering causal questions. Making Budget focusable.

## Why

The docked assistant on the MIS Reports screen knows nothing about the report on screen. `AskPanel`
takes only `surface` and `onCollapse`, and `ask()` posts `{ question }` - so asking "how is this
85000" in front of Agriculture Nursery DUB for July is byte-for-byte the same request as asking it
on `/ask` with nothing rendered.

And the assistant refuses the question outright. `classifyCausalQuestion`
(`backend/src/chat/reconciliation-guard.ts:31`) answers "Causal analysis is not configured." That
guard is right with no context - it stops the model inventing causes - but it answers the wrong
question. "How is this 85000" is **composition**, not cause, and the product already computes it:
the drill returns the transactions behind a leaf with a footer that foots, audited under decision
0025, and the pinned outline snapshot plus the mapping master already know which lines and which
GL/cost-centre triples build a figure.

Decision 0037 named this capability as its follow-up. Decision 0038 scopes it: the grounded
explanation ships, `/ask` is frozen, and 0035's plant-from-question half stays deferred.

## Done when

C1-C14 of the confirmed spec, reproduced there in full. The four that a reader is most likely to
soften, and must not:

1. **C9** binds **server-sourced** data only. The user's own question carries the number - "how is
  this 85000" is the motivating example - so an absolute "no number reaches the model" would forbid
  the feature. What must never be sent is what the server read from the warehouse.
2. **C7** is a **client projection of the attested statement payload** (decision 0024), naming
  descendant lines **with their values**. Structure comes from the pinned outline snapshot, not the
  mapping master, which knows GL-to-leaf mapping and not the tree. A labels-only answer fails it.
3. **C11** follows decision 0025 exactly: a **replaced but present** batch is read and reported;
  only a **gone** batch is refused. The same pinned line must not behave one way in the drill panel
  and another in the assistant.
4. **C6** asserts footing in **paise against the statement payload**. The statement displays rupees
  and the shipped drill contract permits the exact footer to differ from the displayed cell by up
  to Rs 1; the assistant inherits that rule rather than contradicting it.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| EXPLAIN-GROUNDING-AND-ATTESTATION | Attest the statement, and let the dock ground a question against it | Make a grounded question provably about the statement on screen. The statement response gains a signed attested context and a readable node-metadata projection; AskRequest gains statementGrounding; the server re-derives every input and refuses what does not verify, with typed reasons. No explanation is produced yet and no UI changes. |  | `backend/package.json`, `backend/src/chat/ask-period.test.ts`, `backend/src/chat/chat.controller.test.ts`, `backend/src/chat/chat.controller.ts`, `backend/src/chat/chat.module.ts`, `backend/src/chat/chat.schemas.test.ts`, `backend/src/chat/chat.schemas.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/chat.service.ts`, `backend/src/chat/statement-grounding.service.test.ts`, `backend/src/chat/statement-grounding.service.ts`, `backend/src/mis/mis-statement.controller.test.ts`, `backend/src/mis/mis-statement.controller.ts`, `backend/src/mis/mis-statement.dto.ts`, `backend/src/mis/mis-statement.service.test.ts`, `backend/src/mis/mis-statement.service.ts`, `backend/src/mis/mis.module.ts`, `backend/src/mis/statement-attestation.test.ts`, `backend/src/mis/statement-attestation.ts`, `backend/src/warehouse/all-plants-reconciliation.db.test.ts`, `backend/src/warehouse/statement-outline.interface.ts`, `contract/src/api.ts`, `tools/quality-gate.test.mjs` | `backend/src/mis/statement-attestation.test.ts`, `backend/src/chat/statement-grounding.service.test.ts`, `backend/src/chat/chat.schemas.test.ts`, `backend/src/mis/mis-statement.service.test.ts` | none | no |
| EXPLAIN-THE-NUMBER | Answer a composition question about the focused figure | Turn an attested, grounded question into an explanation. Extract the drill's raw-read seam so the assistant and the drill controller share one sensitive query, classify intent deterministically, and answer a leaf with its roll-up path and transactions through a typed response union. Still no UI. |  | `backend/package.json`, `backend/src/chat/chat.controller.ts`, `backend/src/chat/chat.module.ts`, `backend/src/chat/chat.schemas.test.ts`, `backend/src/chat/chat.schemas.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/chat.service.ts`, `backend/src/chat/chat.sse.test.ts`, `backend/src/chat/reconciliation-guard.test.ts`, `backend/src/chat/reconciliation-guard.ts`, `backend/src/chat/statement-explanation.service.test.ts`, `backend/src/chat/statement-explanation.service.ts`, `backend/src/chat/statement-grounding.service.test.ts`, `backend/src/chat/statement-grounding.service.ts`, `backend/src/chat/statement-intent.test.ts`, `backend/src/chat/statement-intent.ts`, `backend/src/mis/mis-drill.controller.test.ts`, `backend/src/mis/mis-drill.controller.ts`, `backend/src/mis/mis-drill.interface.ts`, `backend/src/mis/mis-drill.service.test.ts`, `backend/src/mis/mis-drill.service.ts`, `backend/src/mis/mis-statement.service.ts`, `backend/src/mis/mis.module.ts`, `backend/src/mis/statement-attestation.test.ts`, `backend/src/mis/statement-attestation.ts`, `backend/src/swagger.test.ts`, `backend/src/warehouse/all-plants-reconciliation.db.test.ts`, `backend/src/warehouse/drill-transactions.db.test.ts`, `backend/src/warehouse/drill-transactions.interface.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/warehouse/drill-transactions.repository.ts`, `contract/src/api.ts`, `tools/quality-gate.test.mjs` | `backend/src/mis/mis-drill.service.test.ts`, `backend/src/chat/statement-explanation.service.test.ts`, `backend/src/chat/statement-intent.test.ts`, `backend/src/chat/reconciliation-guard.test.ts`, `backend/src/chat/statement-grounding.service.test.ts`, `backend/src/chat/chat.schemas.test.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/mis/mis-drill.controller.test.ts`, `backend/src/swagger.test.ts` | EXPLAIN-GROUNDING-AND-ATTESTATION | no |
| EXPLAIN-ON-SCREEN | Click a figure, ask, and see the explanation | Put the capability on screen: lift focus to the report view, wire the dock to send the attested context, project aggregates client-side, render every outcome, and keep /ask isolated by owning turns rather than branching on render. |  | `frontend/app/globals.css`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/statement-explanation.test.tsx`, `frontend/src/features/assistant/statement-explanation.tsx`, `frontend/src/features/assistant/use-ask.test.tsx`, `frontend/src/features/assistant/use-ask.ts`, `frontend/src/features/mis/aggregate-projection.helper.test.ts`, `frontend/src/features/mis/aggregate-projection.helper.ts`, `frontend/src/features/mis/drill-panel.test.tsx`, `frontend/src/features/mis/drill-panel.tsx`, `frontend/src/features/mis/mis-report-view.test.tsx`, `frontend/src/features/mis/mis-report-view.tsx`, `frontend/src/features/mis/statement-view.test.tsx`, `frontend/src/features/mis/statement-view.tsx`, `frontend/src/features/mis/use-mis-statement.ts`, `frontend/src/lib/api.test.ts`, `frontend/src/lib/api.ts` | `frontend/src/features/mis/statement-view.test.tsx`, `frontend/src/features/mis/mis-report-view.test.tsx`, `frontend/src/features/mis/aggregate-projection.helper.test.ts`, `frontend/src/features/assistant/statement-explanation.test.tsx`, `frontend/src/features/assistant/use-ask.test.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/lib/api.test.ts` | EXPLAIN-THE-NUMBER | yes |

New moving parts: none named in the old plan

## Risks

- **The attested context touches a shipped contract.** Additive, but the statement's existing
  consumers and leaves must be re-proven. Task 1 owns that.
- **Re-deriving scope is not the same as proving screen identity.** This is exactly why attestation
  exists; without it C14's tamper refusal is unprovable.
- **A weaker second raw-row route.** The leaf read must carry the drill's protections, not the
  ordinary chat audit, or this becomes a way around decisions 0017, 0022 and 0025.
- **The drill panel already diverges from decision 0025.** The service reads a replaced-but-present
  batch; the shipped panel hides those lines and tells the user to regenerate. The assistant follows
  0025 and reports them, so until D-0051 is picked up the two views will differ on the same line.
  This is a ledgered, deliberate divergence rather than an oversight - the alternative was editing a
  shipped surface outside this story.
- **Backend leaves can silently not run.** `backend/package.json`'s hermetic test list is an
  explicit allow-list, so a new test file does not execute until it is added. Every backend task
  updates that list and names real gated leaves.

## Notes

Converted from plans/active/mis-assistant-explains-a-number-the-on-screen-assistant-explains-a-number-on-the-mis-statement.md by forge migrate.

### Technical Approach

### Attestation — the executable design
The statement response gains an **additive** attested-context field. The statement already computes
everything it binds, so it signs and returns it in the same round trip; a second endpoint would
re-derive the scope and could drift from the statement on screen, defeating the point.

- **Envelope**: `<base64url(canonical JSON claims)>.<base64url(HMAC-SHA256)>`. Canonical JSON means
  sorted keys and no insignificant whitespace, so the same claims always sign to the same bytes.
- **Claims**: department, function, plant, period; a **digest of the outline** (leaf keys and their
  blocks) rather than the outline itself, so the token stays small; the pinned batch ids and their
  sources; the mapping-master version; the **user id**; and `exp`.
- **Binding**: to the **user id**, not the session, because the statement route has no session id
  today and a session-bound token would expire on refresh. Adding user id to the statement service
  is task 1's plumbing.
- **Key and TTL**: a new required config secret plus a TTL (default 30 minutes). Absent secret is a
  **startup failure**, never a silently unsigned token.
- **Rotation**: the verifier accepts a small ordered list of keys and signs with the first, so a key
  can be rotated without invalidating live statements.
- Focus may be any valid Actual **inside that attested statement**, so there is no per-click round
  trip. The node and block travel **unsigned** and are validated against the signed outline digest.

### What is signed, what is merely sent
Signed claims are authority. Everything else is **verified context**: the client's department and
function are sent so a mismatch with the master's selection can be **refused** rather than silently
substituted, and the node and block are sent unsigned and checked against the attested outline. The
chat request schema is `.strict()` today, so task 1 extends it deliberately rather than by accident.

**No focus is a server outcome, not a local guess.** With a statement rendered and nothing clicked,
the dock still sends the attested request and the server returns C12a's typed `focus-required`
variant, so the rule is server-owned and provable by a backend leaf. Only "no statement at all"
is local - there is nothing to attest.

### The node-metadata projection
C7 needs per-line approved mapping metadata that statement nodes do not carry today and an opaque
token cannot supply. Task 1 therefore adds an **additive, readable** node-metadata projection to the
statement response - the approved GL codes and cost centres per leaf - covered by the same
attestation digest. The aggregate chat variant is then an **instruction only**: the browser derives
descendants and their values from the rendered statement it already holds, which is exactly what
decision 0024 requires, and no new server projection crosses the network per aggregate ask.

### The raw-read seam
`MisDrillService` already has the pin validation, the pre-query audit and the predicate this
capability needs, but it is controller-oriented: it throws HTTP exceptions and is not exported to
`ChatModule`. Task 2 **extracts a domain seam** that returns typed outcomes - `ok`, `replaced`,
`gone`, `audit-failed` - instead of throwing, and both the drill controller and the assistant call
it. Without that extraction task 2 would either duplicate the sensitive query or lose the typed
outcomes to the global error filter. The assistant requests **20** rows; the drill panel keeps its
**100**-row page, so the seam takes the limit as an argument.

### Re-derivation
The server trusts nothing from the client. Department and function come from the master's selection
for that plant; the plant is checked against current grants on every ask; pins are validated before
any read. Client copies of department and function are **verified context, never authority** - a
mismatch is a typed refusal, not a silent substitution.

### Intent
A closed enum - `composition`, `causal`, `data` - resolved against a **fixture table the tests
own**. Today's guard does not classify "how is this" as causal at all, so this boundary is built,
not assumed. A causal cue **wins** when both appear.

### The two answer shapes
A **leaf** is a governed read: the drill's protections, the audit written before the query, the
roll-up path, transactions, paise footing, 20 rows inline, true total count, a control that opens
the shipped drill panel. An **aggregate** runs **no query at all**: a client projection of the
attested payload, no governed-read audit.

### The seam, and what `/ask` isolation really costs
Grounding is a branch the caller opts into - the same shape `continueTurn`'s caller-stated failure
policy took in `ask-reopen-saved-report` - never a change to shared classification.

Isolation is **turn ownership**, not a rendering `if`. Both panels share one `AskProvider`, every
turn renders from it, and successful turns feed the next request's `priorTurns`. Task 3 therefore
**tags each turn with its origin** and partitions grounded turns out of BOTH `/ask`'s rendering and
the `priorTurns` that `/ask` sends - otherwise a grounded explanation would leak into an ungrounded
request's context and `/ask`'s wire behaviour would change after all. The frontend request types
must also admit grounding on the buffered and streamed paths.

### Typed contracts (decision 0019)
0019 requires typed request/response contracts and Swagger documentation for the surfaces this
story changes. That work is explicit, not assumed: task 1 owns the Zod schema and OpenAPI for the
extended chat request and the statement response's new fields; task 2 owns the response union's
schema and documentation across **both** the buffered and streamed chat paths, which are separate
routes and must not drift.

### Decisions

Governed by **0038** (this story's scope), **0037** (which named it), **0024** (aggregate is a
client projection), **0025** (pinned-batch raw read and the replaced/gone rule), **0027** (what may
reach Bedrock), **0034**/**0036** (budget owner and all-plants), **0017**/**0022** (governed
projection and the composite-key seam), **0021** (the outline snapshot). All active decisions are
attested in the front matter.

### Verify Plan

`python3 factory/scripts/verify.py`. Leaves are judged by the discriminator for their own runner -
frontend by vitest (present AND NOT skipped AND NOT failed, D-0031), backend by Node/JUnit, where a
non-matching name yields a testcase named for the FILE PATH (D-0024). Named because each can pass
by accident:

- the **provider payload**, not the rendered answer, proving no server-sourced row reaches the model;
- an **invalid, expired or other-user** context, and a node or block **absent from the attested
  outline**, each refused;
- **department or function disagreeing** with the master's selection, refused;
- the **intent fixture table**, including mixed wording where the causal cue wins;
- **replaced-but-present** read and reported versus **gone** refused, for actual and for budget;
- a failed audit returning the safe refusal **without ever querying**;
- an aggregate answering with **child values** and running **no query**;
- **`/ask` neither sending grounding nor rendering a grounded turn**;
- **paise-exact footing** against the statement payload with the true total count.

Every hermetic leaf uses a **deterministic classifier and a fake provider**. Intent is a fixture
table, so the classification leaves need no model at all, and a Bedrock-backed assertion would be
neither hermetic nor reproducible. Bedrock appears only in the **live check**, as separate manual
evidence: render a statement, click an Actual, ask a composition question and a causal one, and
confirm the explanation foots to the figure on screen with `LLM_PROVIDER=bedrock` declared.

Each task must also **add its new test files to `backend/package.json`'s hermetic list** - the list
is an allow-list, so a leaf that is not named simply never runs and the gate goes green having
asserted nothing.

### Surface Impact

| Surface | Classification | Notes |
| --- | --- | --- |
| Runtime behavior | **Changed** | The docked assistant answers composition questions about a focused figure. |
| API | **Changed** | `AskRequest` gains `statementGrounding`; the statement response gains an additive attested context; the chat response gains a typed explanation union. |
| Data/schema | **Unchanged by design** | No storage change; the drill and the outline snapshot are read as they ship. |
| CLI/ops | **N-A** | No CLI or deployment surface. |
| UI | **Changed** | Focus lifts to the report view, the dock renders explanations, `/ask` is isolated. |
| Docs | **Unchanged by design** | The confirmed spec and decision 0038 are already committed; no task edits documentation. 0038's front matter names `ask-reopen-saved-report` because it was minted during that run - it governs this story, and task 1 corrects the `stories` field. |
| Tests | **Changed** | New backend and frontend leaves; the shipped statement and `/ask` leaves must pass unmodified. |

### Task Decomposition

Sequential; explicit dependencies. Three tasks.

1. **`explain-grounding-and-attestation`** (backend + contract, `user_facing: false`) — **C1, C2**,
   and C14's backend proof for both. The signed context (envelope, claims, user binding, config
   secret, TTL, rotation) on the statement response; the **readable node-metadata projection** C7
   needs; the user id plumbed into the statement service; `statementGrounding` on `AskRequest` with
   the `.strict()` chat schema extended deliberately; server-side re-derivation; and the typed
   refusals for an invalid, expired or other-user context, a node or block outside the attested
   outline, a plant outside grants, and a department/function mismatch. Owns the Zod/OpenAPI work
   for both changed requests under decision 0019, and corrects 0038's `stories` field. No UI and no
   explanation yet. **The shipped statement and export leaves must pass unmodified.** Depends on
   nothing.

2. **`explain-the-number`** (backend, `user_facing: false`) — **C3, C4, C6, C8, C9, C10, C11, C12,
   C12a, C13**, and C14's backend proof for them. Extracts the **raw-read domain seam** from
   `MisDrillService` returning typed `ok`/`replaced`/`gone`/`audit-failed` outcomes with a row-limit
   argument, so the drill controller and the assistant share one sensitive query; the intent fixture
   table with a deterministic classifier; the leaf explanation with the roll-up path, transactions,
   paise footing, 20 rows and the true count; the typed response union documented on **both** the
   buffered and streamed chat paths; `budgetState`; and the **backend refusal for a crafted Budget
   focus** (C8 cannot be a client-side rule). Depends on task 1.

3. **`explain-on-screen`** (frontend, `user_facing: true`) — **C5, C7**, C8's surface half, and
   C14's frontend proof. Focus ownership lifted to the MIS report view; the dock wired to send the
   attested context; the **aggregate client projection** deriving descendants and values from the
   rendered statement per decision 0024, driven by the aggregate variant as an instruction; the
   control that opens the shipped drill; **rendering every outcome variant** - leaf, aggregate,
   focus-required, replaced, gone, audit-failure and not-loaded; and `/ask` isolated by **turn
   ownership** in rendering *and* in `priorTurns`. Depends on task 2.
