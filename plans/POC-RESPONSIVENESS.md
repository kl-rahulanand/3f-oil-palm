# Assistant responsiveness and shell truth

## What changes for you

**In scope**
- `maxTokens` on the selector Converse call — the fix for the reported latency.
- A no-tool-block retry that cannot mask a genuine refusal, which requires un-collapsing three
  outcomes the provider maps to one `unsupported`.
- Bounded `priorTurns` input (server resource safety, explicitly **not** the latency fix).
- Both Ask surfaces consuming the existing stream, with a phase rule matching the producer,
  **bounded** cancellation, and transport parity with the buffered client.
- Freshness **defined** and served by a new authenticated route; the docked panel filling its column.
- D-0006 formatting for the two ignored files this story must edit.

**Non-goals**
- Changing the model or region. **0027** stands; the model is exonerated by measurement.
- Durable conversation history (**0028** stands).
- **True Postgres query cancellation.** Human-decided 2026-09-14: abandoned queries expire under
  the existing `statement_timeout`, they are not cancelled. Stated plainly so this is never
  mistaken for full cancellation.
- Period-scoped or report-scoped freshness; the shell chip is global.
- Re-planning shipped assistant behaviour; the Pulse-inherited selector prompt examples; D-0040.

## Why

The PoC shipped at 7/7 and the assistant answers correctly, but live testing found a follow-up
question could take **39s**, **57s**, and in reproduction **214s**. The product looks hung.

The cause is one missing request field. `backend/src/llm/bedrock.provider.ts:394` sends
`inferenceConfig: { temperature: 0, topP: 1 }` and **no `maxTokens`**. Measured directly against
Bedrock with the real system prompt, the real three-tool schema, the same question and the same
single prior turn:

| request | latency | output tokens | stopReason | tool block |
| --- | --- | --- | --- | --- |
| no `maxTokens` | 214,222 ms | 24,313 | - | - |
| `maxTokens: 2048` | 1,429 ms | 168 | `tool_use` | yes |
| `maxTokens: 512` | 1,703 ms | 203 | `tool_use` | yes |

A selection is ~110 output tokens. Capped, the model stops at `tool_use` — **not** `max_tokens` —
so the cap does not truncate; its presence alone ends the runaway. With no prior turn the same call
already returned in 0.8–1.3s, so neither the model nor `ap-south-1` is at fault.

**Two earlier diagnoses of mine were wrong and were corrected by others, not by me.** I first
blamed the model family; the human disproved it from experience with the same model in Pulse. I
then wrote that the server never bounds prior turns — it does, at `chat.service.ts:675`
(`trimPriorTurnsToTokenBudget`, called at `:153`) — and the reproduction used a *single* prior turn
well inside that budget, so trimming cannot be the fix. This plan records that history because both
wrong fixes (swap the model, trim harder) are expensive and neither would have worked.

Two further defects make the product read as broken in a demo. The Ask surfaces call the buffered
JSON route and show one static pending state, while `POST /api/chat/stream` is built, registered,
allow-listed and consumed by nothing. And the shell renders a permanently disabled
`Freshness unavailable` chip (`frontend/src/components/shell/app-shell.tsx:174`) that computes
nothing; underneath, `backend/src/warehouse/postgres.adapter.ts:56` returns null when no freshness
column is supplied and **no domain declares one**, so `provenance.dataAsOf` has always been null.

## Done when

1. **C1** The selector Converse request carries `maxTokens: 2048` — asserted on the request object
  the provider builds, not inferred from timing. 2048 is ~18× a real selection (~110 tokens) and
  ~8% of the observed runaway (24,313); both 512 and 2048 measured identically at `tool_use`, so
  the value is chosen for headroom, not tuning.
2. **C2** A selector response with **no tool block** is retried at most once. A **malformed** tool
  input and a genuine **`mark_unsupported`** are never retried. A second tool-less response answers
  `backend_error` naming an incomplete model response, **never `not_supported`**. To make this
  expressible, `mapBedrockToolUseToSelectionResult` (`bedrock.provider.ts:227`) stops collapsing the
  three outcomes: the result gains an explicit discriminant — `kind: "no_tool_block"` distinct from
  `kind: "unsupported"` — carried through the `LlmProvider` port and its mock/fake implementations.
  The retry happens **inside the provider boundary, before `chat.service` executes anything**, so
  "no repeated governed query" is structural rather than promised.
3. **C3** `chat.schemas.ts:21` rejects `priorTurns` exceeding **8 entries** or a **16,000-character
  serialized payload**, and any single prior `question` over **2,000 characters** — checked before
  serialization, so nested `selection` fields cannot smuggle an oversized body past a count-only
  cap. The client trims to the **same named budget** before sending, so a long normal conversation
  degrades rather than fails. Retained order stays **oldest-first**; `chat.service.ts:153` reads
  `priorTurns.at(-1)` as the latest turn and reversing it would select the wrong one.
4. **C4** Both Ask surfaces render streamed phases in order. An answer resolving within **250 ms**
  renders **no phase at all** — the server already emits `routing` at `chat.service.ts:103` *before*
  the deterministic classifiers, so this is a client render-delay rule, not a producer change. A
  terminal `error` frame renders through the existing seven-class renderer. The client parses SSE
  frames correctly when a frame is **split across chunks** and when **several arrive in one chunk**.
5. **C5** The streaming client preserves the buffered client's CSRF bootstrap, cookie credentials,
  401 refresh and HTTP-error rendering — pre-stream auth/CSRF/validation failures are HTTP
  responses, not SSE frames. Leaving the assistant aborts the request; the controller observes
  disconnect, stops writing frames, and aborts the **model** call. A query already in flight is
  **bounded by `statement_timeout`, not cancelled** — stated in the code comment and the task
  contract. Collapsing the dock does **not** cancel, and moving dock ↔ `/ask` does **not** cancel:
  one `AskProvider` holds one thread. Leaving the assistant area entirely cancels. Expected aborts
  are handled silently and never recorded as `backend_error`.
6. **C6** A new authenticated route serves load freshness: the oldest `uploaded_at_utc` among
  **active** ingest batches across governed sources. It follows decision **0019** (unversioned
  `api/...`, raw typed body, named DTOs, documented 400/401/403), is added to the
  `app.routes.test.ts` allow-list, and the shell renders it labelled as **load** freshness, no
  longer `aria-disabled`, with a plain unavailable state. `provenance.dataAsOf` is served by the
  same seam and stops being null.
7. **C7** The freshness port is implemented for **Postgres** and returns a deliberate, typed
  *unavailable* on `starrocks.adapter.ts` and `starrocks-mysql.adapter.ts` — named, not left to the
  implementer, so all three compile and none invents a value.
8. **C8** The docked panel fills its column on desktop with the thread scrolling **inside** it;
  mobile stacking at the current breakpoint is unchanged.
9. **C9** Under **D-0006**, `backend/src/llm/bedrock.provider.ts` and
  `backend/src/warehouse/postgres.adapter.ts` are formatted and removed from `.prettierignore` by
  the tasks that edit them, and `tools/quality-gate.test.mjs`'s baseline map is updated in the same
  change.
10. **C10** Every proof is judged by its junit testcase **name** and **executed count**, never an exit
  code (D-0024, D-0031); new backend test files are registered in `backend/package.json` and
  `tools/quality-gate.test.mjs` or CI runs none of them.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| ASSISTANT-BOUNDED-GENERATION | Cap the selector generation, scope its retry, and bound the request | Fix the reported latency at its measured cause: the selector Converse call sends no maxTokens, so a follow-up question can generate 24,313 output tokens over 214 seconds for a job that needs about 110. Add the cap, give the provider a no_tool_block discriminant so a guarded single retry cannot mask a genuine refusal, bound the priorTurns request for server resource safety, and wire bounded server-side cancellation. Backend only - the streaming client, the pill and the dock are task 3. |  | `.prettierignore`, `backend/package.json`, `backend/src/chat/chat.constants.ts`, `backend/src/chat/chat.controller.test.ts`, `backend/src/chat/chat.controller.ts`, `backend/src/chat/chat.schemas.test.ts`, `backend/src/chat/chat.schemas.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/chat.service.ts`, `backend/src/chat/selectionExecutor.ts`, `backend/src/llm/bedrock.provider.test.ts`, `backend/src/llm/bedrock.provider.ts`, `backend/src/llm/llm.constants.ts`, `backend/src/llm/llm.interface.ts`, `backend/src/llm/mock.provider.ts`, `contract/src/api.ts`, `tools/quality-gate.test.mjs` | `backend/src/llm/bedrock.provider.test.ts`, `backend/src/chat/chat.schemas.test.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/chat.controller.test.ts` | none | no |
| SHELL-FRESHNESS-API | Define load freshness and serve it from an authenticated route | Give the shell something true to show. Freshness returns null everywhere today because postgres.adapter.ts:56 returns null when no freshness column is supplied and no domain declares one, so provenance.dataAsOf has always been null too. Define load freshness as the oldest uploaded_at_utc among ACTIVE ingest batches across governed sources - active batches are unique per (source_kind, period), so many are active and the value must be scoped to load time, not period - implement the port for Postgres with a deliberate typed unavailable on both starrocks adapters, and serve it from a new authenticated route under decision 0019. Backend only. |  | `backend/src/warehouse/warehouse.interface.ts`, `backend/src/warehouse/postgres.adapter.ts`, `backend/src/warehouse/starrocks.adapter.ts`, `backend/src/warehouse/starrocks-mysql.adapter.ts`, `backend/src/warehouse/freshness.adapters.test.ts`, `backend/src/warehouse/load-freshness.db.test.ts`, `backend/src/warehouse/freshness.interface.ts`, `backend/src/warehouse/freshness.service.ts`, `backend/src/warehouse/freshness.controller.ts`, `backend/src/warehouse/freshness.dto.ts`, `backend/src/warehouse/warehouse.module.ts`, `backend/src/app.module.ts`, `backend/src/app.routes.test.ts`, `contract/src/api.ts`, `backend/package.json`, `tools/quality-gate.test.mjs`, `.prettierignore` | `backend/src/app.routes.test.ts`, `backend/src/warehouse/freshness.adapters.test.ts`, `backend/src/warehouse/load-freshness.db.test.ts` | none | no |
| ASSISTANT-STREAMING-AND-SHELL | Stream the answer, cancel on leave, and tell the truth in the shell | Make a slow answer look like work rather than a hang, and stop the shell showing a dead control. Both Ask surfaces consume the already-built POST /api/chat/stream and render its ordered phases; the freshness pill renders the real load-freshness value; and the docked panel fills its column. Frontend only. |  | `frontend/app/globals.css`, `frontend/src/components/shell/app-shell.test.tsx`, `frontend/src/components/shell/app-shell.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/ask-stream.test.ts`, `frontend/src/features/assistant/ask-stream.ts`, `frontend/src/features/assistant/use-ask.ts`, `frontend/src/features/exploration/pinned-reports.test.tsx`, `frontend/src/features/exploration/saved-views.test.tsx`, `frontend/src/features/shell/use-freshness.ts`, `frontend/src/lib/api.test.ts`, `frontend/src/lib/api.ts` | `frontend/src/features/assistant/ask-stream.test.ts`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/lib/api.test.ts`, `frontend/src/components/shell/app-shell.test.tsx` | ASSISTANT-BOUNDED-GENERATION, SHELL-FRESHNESS-API | yes |

New moving parts: none named in the old plan

## Risks

- **A cap that truncates.** Unobserved in measurement but the failure this design must not hide;
  mitigated by C2's retry and by refusing `not_supported` after a second tool-less response.
- **Retry masking a real refusal** — why C2 forbids retrying malformed input and `mark_unsupported`
  and requires the discriminant first.
- **Cancellation that only looks like cancellation.** The known, accepted limit: the query is
  bounded, not cancelled. Written into the code and the contract so it is not rediscovered as a bug.
- **A freshness pill that lies** — announcing an upload timestamp as data currency would be worse
  than the disabled chip; mitigated by labelling it load freshness.
- **D-0006 drag.** Both files this story must edit are prettier-ignored; de-ignoring without
  formatting leaves `format:check` red (a ledgered lesson from the assistant story).
- **The roadmap criteria predate the diagnosis** and name cap-and-retry as the remedy for slowness.
  They are write-once, so **this plan and the confirmed spec are authoritative**.

## Notes

Converted from plans/active/poc-responsiveness-assistant-responsiveness-and-shell-truth.md by forge migrate.

### Technical Approach

### The cap and the retry
`maxTokens: 2048` joins the single `inferenceConfig` the provider builds. The retry exists because
a cap *could* truncate before the tool block even though measured runs stop at `tool_use`. Today
that case is indistinguishable from a real refusal, so the port gains the `no_tool_block`
discriminant and the retry lives inside the provider — before `chat.service` reaches execution.
Routing precedes selection (`chat.service.ts:103`), so deterministic smalltalk, glossary, causal and
out-of-catalog paths never reach it and "the LLM selects, never authors" is untouched.

### Prior turns
`trimPriorTurnsToTokenBudget` is kept, with retention and oldest-first order unchanged. The schema
rejects oversize input before the trim loop, which re-serializes the whole array on every iteration; the
client trims to the same named budget so normal conversations degrade instead of erroring.

### Streaming and bounded cancellation
The client moves to `POST /api/chat/stream`. The controller observes `request.on("close")`, stops
writing, and aborts the model call through an `AbortSignal` threaded into the `LlmProvider` port.
The warehouse call is left to `statement_timeout`; the code says so where a reader would otherwise
assume cancellation. The buffered route stays for the stored-selection re-run, which bypasses the
model and needs no progress display.

### Freshness
A cross-source **minimum** over active ingest batches — which the existing seam cannot express: it
takes one domain and returns `MAX(column)` (`selectionExecutor.ts:102`). Active batches are unique
per `(source_kind, period)`, so many are active and the value is scoped to **load** time, not
period: a September upload of July figures is not "data as of September".

### Decisions

Every active decision is attested in the frontmatter. Load-bearing here: **0027** (Bedrock in
`ap-south-1` — explicitly *not* amended; the model is exonerated by measurement), **0028**
(selections not snapshots — untouched), **0019** (house style binds the new freshness route),
**0009** (required tests name a real leaf and pin `TS_NODE_PROJECT`), **0012**, **0011**. **No new
decision is required**: the cap is a defect fix, the freshness rule is in the confirmed spec, and
the cancellation boundary is recorded here as a human-decided scope limit.

### Verify Plan

- **Backend unit (hermetic)** — `bedrock.provider.test.ts`: the built Converse request contains
  `maxTokens`; a tool-less response retries exactly once; malformed input and `mark_unsupported` do
  **not** retry; a second tool-less response yields `backend_error`, not `not_supported`.
  `chat.schemas.test.ts`: oversize array, oversize serialized payload and oversize single question
  are each rejected; retained order is oldest-first.
- **Backend unit (hermetic)** — `chat.controller.test.ts`: disconnect stops frame writes and aborts
  the model call; an expected abort is not recorded as `backend_error`.
- **Frontend unit (vitest)** — SSE parsing across a split frame and a multi-frame chunk; phases in
  order; no phase for a sub-250 ms answer; terminal error through the existing renderer; leaving
  aborts; dock ↔ `/ask` does not; the pill's value and unavailable state.
- **Backend DB-backed (gated, D-0008)** — the cross-source minimum returns the oldest
  `uploaded_at_utc` with several active periods present; run on the host with a **dead-port
  negative control**, and the app-DB/warehouse proof registered in its group.
- **Functional (user-facing tasks)** — live with `BEDROCK_MODEL_ID` set: ask, then ask a
  **follow-up**, and confirm it returns **under 5 s** with phases visible; leave mid-flight and
  confirm the backend stops writing; read the pill.
- Commands are the story's existing ones (`npm run build:*`, `typecheck`, `lint`, `format:check`,
  `test:hermetic`), plus `test:db` for the gated proof. Every artifact records the **executed count
  and testcase name**.

### Surface Impact

| Surface | Change | Owning task |
| --- | --- | --- |
| Bedrock selector request | **Changed** — `maxTokens: 2048` | 1 |
| `LlmProvider` port + mock/fake | **Changed** — `no_tool_block` discriminant, `AbortSignal` | 1, 2 |
| Bedrock mapping seam | **Changed** — three outcomes no longer collapsed | 1 |
| `POST /api/chat` request schema | **Changed** — `priorTurns` limits | 1 |
| `POST /api/chat/stream` controller | **Changed** — disconnect observation, model abort | 2 |
| Ask panel + Ask page + `use-ask` | **Changed** — stream client, delay, cancel, parity | 2 |
| `frontend/src/lib/api.ts` | **Changed** — streaming method with CSRF/401 parity | 2 |
| **New** freshness route + DTOs + allow-list + Swagger | **New** | 3 |
| Warehouse port + 3 adapters | **Changed** — freshness port; starrocks deliberate unavailable | 3 |
| Shell top bar pill | **Changed** — real value, not `aria-disabled` | 3 |
| Answer provenance `dataAsOf` | **Changed** — stops being null | 3 |
| Docked panel CSS | **Changed** — fills column; mobile unchanged | 4 |
| `.prettierignore` + quality-gate baseline | **Changed** — D-0006 for the two files | 1, 3 |
| `backend/package.json`, `tools/quality-gate.test.mjs` | **Changed** — new test registration | 1, 2, 3 |
| `docs/specs/assistant-responsiveness.md` | **Unchanged** — confirmed contract | — |
| Model, region, stored data, shipped assistant behaviour | **Unchanged** — 0027, 0028 | — |

### Task Decomposition

Sequential; each leaf is single-runtime with explicit dependencies.

1. **`assistant-bounded-generation`** (backend, `user_facing: false`) — C1, C2, C3, C9(provider).
   The cap, the `no_tool_block` discriminant, the provider-boundary retry, the schema limits.
   **Ships the reported fix on its own.** Depends on nothing.
2. **`assistant-stream-cancel`** (backend, `user_facing: false`) — C5(server half). Disconnect
   observation, `AbortSignal` through the port, silent abort handling, the bounded-not-cancelled
   comment. Depends on task 1 (shares the `LlmProvider` port signature).
3. **`assistant-streaming-ui`** (frontend, `user_facing: true`) — C4, C5(client half). Stream
   client, SSE frame parsing, render delay, transport parity, cancel-on-leave. Depends on task 2.
4. **`shell-freshness-api`** (backend, `user_facing: false`) — C6(server), C7, C9(adapter). The
   freshness port, the three adapters, the new authenticated route and DTOs, allow-list and Swagger,
   and the gated DB proof. Depends on nothing; sequenced here so the latency fixes ship first.
5. **`shell-freshness-and-dock`** (frontend, `user_facing: true`) — C6(client), C8. The pill and the
   dock height. Depends on task 4.
