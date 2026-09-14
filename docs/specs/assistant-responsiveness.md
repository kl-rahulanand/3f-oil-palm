---
slug: assistant-responsiveness
title: Assistant responsiveness and shell truth
status: confirmed
saved: 2026-09-14T15:54:16+00:00
---

# Assistant responsiveness and shell truth

## Why
The assistant shipped and works, but live testing of the PoC found that a follow-up question could
take **39s**, **57s**, and in reproduction **214s**. The cause is a single missing request field.

`backend/src/llm/bedrock.provider.ts:394` sends `inferenceConfig: { temperature: 0, topP: 1 }` and
**no `maxTokens`**. Measured against Bedrock with our real system prompt, our real three-tool
schema and the same question and prior turn:

| request | latency | output tokens | stopReason | tool block |
| --- | --- | --- | --- | --- |
| no `maxTokens` | 214,222 ms | 24,313 | - | - |
| `maxTokens: 2048` | 1,429 ms | 168 | `tool_use` | yes |
| `maxTokens: 512` | 1,703 ms | 203 | `tool_use` | yes |

A selection is about 110 output tokens. Uncapped, the model emitted 24,313. Capped, it emits ~170
and stops at `tool_use` - **not** at `max_tokens` - so the cap does not truncate the answer; its
presence alone ends the runaway generation. The model and the region are not at fault: with no
prior turn the same call already returned in 0.8-1.3s.

**Two corrections to earlier drafts of this spec, both found by cold reads rather than by the
author.** First, an earlier draft claimed the server never bounds prior turns and that this was the
root cause. That is false: `trimPriorTurnsToTokenBudget` (`backend/src/chat/chat.service.ts:675`,
called at `:153`) already drops oldest turns until the serialized turns fit
`LLM_CONTEXT_CHAR_BUDGET`. Second, the reproduction used a SINGLE prior turn, well inside that
budget - so trimming further cannot help, because a follow-up cannot have fewer than one prior
turn. Bounding context is hardening, not the fix.

Two further defects make the product read as broken. The Ask surfaces call the buffered JSON route
and show one static pending state, so a slow answer is indistinguishable from a hang even though
the backend already emits ordered progress phases that nothing consumes. And the shell's top bar
renders a permanently disabled `Freshness unavailable` chip
(`frontend/src/components/shell/app-shell.tsx:174`), static text that computes nothing - while
`backend/src/warehouse/postgres.adapter.ts:56` returns null whenever no freshness column is
supplied and **no domain declares one**, so `provenance.dataAsOf` has always been null too.

## Behaviour

### A bounded selector generation
The Bedrock selector call carries an explicit `maxTokens`. This is the story's primary fix and the
only change needed to make a follow-up fast. The cap is chosen to sit far above a real selection
(~110 output tokens) and far below a runaway (24,313), so that a normal answer is never truncated
and a spiral is impossible.

### A retry that cannot hide a real refusal
Because the response is Converse TOOL USE rather than parsed free text, a cap that ever did
truncate before the tool block would yield no `toolUse`, which today maps to `unsupported`
(`backend/src/llm/bedrock.provider.ts:227`) - a silent downgrade from a slow success to a wrong
answer. The measured runs stop at `tool_use`, so this is a guard against a case not yet observed,
and it is scoped so it cannot mask genuine outcomes:

- It fires ONLY when the selector returned **no tool block at all**. A malformed tool input, and a
  valid `mark_unsupported`, are NOT retried - retrying those would hide a real refusal.
- The provider must therefore stop collapsing three different outcomes into one `unsupported`:
  absent tool use, malformed tool input, and a genuine `mark_unsupported` must remain
  distinguishable at the seam before any mapping.
- It fires ONLY on the Bedrock selector path. `routing` precedes selection
  (`backend/src/chat/chat.service.ts:103`), so deterministic smalltalk, glossary definitions,
  causal refusals and out-of-catalog answers never reach it, and the settled "the LLM selects,
  never authors" boundary is untouched.
- At most **two** selector calls for one question. If the second also returns no tool block, the
  answer is a `backend_error` naming an incomplete model response - NOT `not_supported`, which
  would assert the untrue thing this story exists to stop.
- A retry never repeats a governed warehouse query: selection precedes execution, so no data work
  is duplicated and no audit record is doubled.

### Prior turns bounded safely, order preserved
The existing trim is kept and hardened. It retains the NEWEST turns while preserving **oldest-first
transport order**, which must not change: `chat.service.ts:153` reads `priorTurns.at(-1)` to find
the latest selection, so reversing the order would silently select the wrong turn. Two gaps are
closed: `backend/src/chat/chat.schemas.ts:21` accepts an **unbounded** `priorTurns` array with
unbounded per-question length, so the request schema gains explicit limits and rejects oversize
input before any serialization; and the trim re-serializes the whole array on every iteration, so a
large payload is bounded before that loop rather than inside it. This is server resource safety,
not latency.

### Progress the reader can see
Both Ask surfaces consume the streaming route the backend already serves (`POST /api/chat/stream`,
registered and allow-listed) and render its ordered phases - `routing`, `selecting`, `querying`,
`summarizing` (`backend/src/chat/chat.sse.ts:5`).

- `routing` is emitted at `chat.service.ts:103` **before** the deterministic classifiers run, so a
  greeting, a definition and a policy refusal DO receive a phase today. The client therefore
  delays phase rendering by a short interval and skips it entirely for any answer that resolves
  within it, rather than the server suppressing a phase it has already emitted. Deterministic
  answers show no flicker; the producer is unchanged.
- Phases render in the order received; a phase never appears after the terminal frame. The client
  also handles the stream's failure modes rather than hanging: a **malformed JSON frame** and an
  **EOF with no `result` or `error`** each resolve the request as a backend error, so the shared
  provider can never be left indefinitely pending. Ordinary asks stream; the stored-selection re-run
  stays on buffered `POST /api/chat` and is unchanged.
- A terminal `error` frame renders through the SAME seven-class renderer as the buffered route, so
  a failure reads identically whichever transport delivered it.
- The streaming client preserves everything the buffered client does: the CSRF bootstrap, cookie
  credentials, the 401 refresh path, and ordinary HTTP-error rendering - pre-stream auth, CSRF and
  validation failures are HTTP responses, not SSE frames, and must not be mistaken for stream
  errors.
- Leaving the surface cancels the in-flight request, and the cancellation is **BOUNDED, not total** -
  human-decided 2026-09-14. Today the controller observes no client disconnect and passes no abort
  signal, so an abandoned request keeps selecting, querying and auditing. After this story: the
  server detects a PREMATURE response/socket close (not `IncomingMessage`'s `close`, which Node also
  emits on normal completion), stops writing frames, aborts the model call through an `AbortSignal`
  that reaches the AWS transport, and does NOT START a governed query once aborted. The abort is also checked at the executor seam immediately before
  `warehouse.execute()`: `SelectionExecutor.run` awaits `warehouse.explain()` first, so an abort
  arriving during that await must prevent the query from STARTING rather than be noticed only after.
  A query ALREADY IN FLIGHT is **not cancelled**: it expires under the existing Postgres `statement_timeout`, and a
  comment at the seam says so, because true cancellation would need `pg_cancel_backend` on a side
  connection and is deliberately out of scope. An expected abort is handled silently and is never
  recorded as `backend_error`. Collapsing the dock, and moving between the dock and the Ask page,
  share one provider and one thread and do NOT cancel; only leaving the assistant does.
- The buffered `POST /api/chat` route is unchanged and still serves the stored-selection re-run,
  which bypasses the model and needs no progress display.

### A freshness pill that tells the truth
The pill reports **load freshness**: the oldest `uploaded_at_utc` among the ACTIVE ingest batches
of the governed sources, labelled as when data was loaded rather than what period it covers.
Both halves matter. Active batches are unique per **source and period**
(`ingest_batch_active_source_period_unique` on `(source_kind, period)`), so many are active at once
and "the oldest active batch" alone would drift to the oldest period ever loaded; and a September
upload of July figures must not be announced as "data as of September" without saying it means the
load. The conservative oldest across sources - human-decided 2026-09-14 - means the pill never
claims the numbers are fresher than the stalest input behind them.

This is a definition, not a wire-up: the existing seam takes ONE domain and returns
`MAX(freshness column)` (`selectionExecutor.ts:102`), while this needs a **cross-source minimum
over ingest batches**, so the seam is extended rather than reused as-is. Period-scoped freshness
belongs to a report, not to a global shell chip, and is out of scope here. When no batch is active,
or the lookup fails, the pill says so plainly rather than showing a stale or invented timestamp -
and a live pill stops announcing itself as disabled.

### A dock that fills its column
The docked Ask panel fills the height of its column on desktop rather than stopping at its content:
`frontend/app/globals.css:1342` sets `max-height` - a ceiling, not a height - with
`align-self: flex-start`, so a short thread leaves a visible gap. The thread scrolls INSIDE the
panel while the composer stays reachable without scrolling the report. The existing mobile
behaviour at the current breakpoint is unchanged: the panel stacks and takes its natural height.

## Acceptance criteria
- The selector call sends `maxTokens: **2048**` - about 18x a real ~110-token selection and ~8% of the
  observed 24,313-token runaway - proven by a test asserting the field on the Converse REQUEST, never
  by timing: the uncapped call is already fast when there is no prior turn. A follow-up completes in
  **under 5 seconds** in the live check.
- A selector response with no tool block is retried at most once; a malformed tool input and a
  genuine `mark_unsupported` are NOT retried; a second tool-less response answers `backend_error`
  naming an incomplete model response, never `not_supported`.
- `priorTurns` is rejected by the request schema above **8 entries**, a **16,000-character** payload
  measured as `JSON.stringify(priorTurns)`, or **2,000 characters** in any single prior `question` -
  evaluated at ingress, BEFORE the trim and before Bedrock-prompt construction. Nested `selection`
  fields are inside that measured representation, so they cannot smuggle an oversized body past a
  count-only cap. The CLIENT trims to the SAME contract, newest-first, before sending - otherwise the
  ninth ask in a conversation becomes a 400 - and the retained order stays oldest-first so `at(-1)`
  is the latest turn. The shared limits live in `@3f/contract`, the only package the frontend imports.
- Both Ask surfaces render streamed phases in order, show NO phase for an answer that resolves
  within a **250 ms** client render delay, render a terminal error through the existing renderer, preserve
  CSRF/cookies/401-refresh/HTTP-error behaviour, and cancel on leaving the assistant - with the
  abort reaching the AWS transport and preventing a not-yet-started query, while an already-running
  query is bounded by `statement_timeout` rather than cancelled. Proof must distinguish a normal
  completion (which must NOT abort) from client abandonment (which must).
- The freshness pill shows the oldest active-batch `uploaded_at_utc` across governed sources,
  labelled as load freshness, says so plainly when none is available, and is no longer marked
  disabled; `provenance.dataAsOf` stops being null by using the SAME seam scoped to that answer's own domain and
  batches - never the shell's global minimum.
- The docked panel fills its column on desktop with the thread scrolling inside it, and the
  existing mobile stacking is unchanged.
- Every proof is judged by its junit testcase NAME and EXECUTED count, never an exit code
  (D-0024, D-0031).

## Out of scope (now)
Changing the model or the region - decision 0027 stands, and the evidence shows the model is fast
when the request is well formed. Durable conversation history (deferred at the assistant plan
grill; 0028 stands). Period-scoped or report-scoped freshness. Re-planning any shipped assistant
behaviour. The Pulse-inherited examples still in the selector system prompt ("leads and
appointments booked", "by state") and D-0040's unregistered `state` dimension in HelpService
suggestions.

## Source
Live testing of the shipped PoC on 2026-09-14, reproduced directly against Bedrock; the
`poc-responsiveness` roadmap item; and the requirements and spec cold reads of the same date, which
corrected the author's root-cause narrative twice.
