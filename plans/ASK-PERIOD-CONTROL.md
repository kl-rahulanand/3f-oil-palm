# Recoverable periods in Ask

## What changes for you

**In scope**
- A typed period choice on `ClarificationNeeded` and a typed period control on a successful data
  answer — two carriers, so a recovery and a settled answer never share one field.
- A deterministic continuation: the chosen period posts as `AskRequest.selection`, which
  `chat.service.ts:146` runs verbatim, skipping the selector entirely.
- A total, first-match-wins failure order across the four collapsed causes, each with its own
  response class and message.
- The period control in **both** semantic domains (human round 1), replacing the answer in place
  (human round 2) without rewriting the asked question (human round 3 of the requirements grill).

**Non-goals**
- Changing which periods the warehouse offers, or the FY-YTD definition.
- Letting a user choose among several granted plants, departments or functions — a new authorized
  selector capability no current data exercises (human round 3 of the spec grill).
- Rendering the measure and dimension chips, or making them editable.
- Showing batch ids in the provenance disclosure (human round 2 of the requirements grill). They
  travel in the response and C8 checks them there.
- `requiredTimeWindowClarify`'s day-range options, wrong for a monthly statement but a different gate.

## Why

A well-formed statement question with no period is a dead end. Measured 4/4 against the running
PoC, `Show the MIS statement Actual by statement leaf` returns a red
`The answer does not resolve to one statement selector set and offered period.` The same question
with a period works 6/6 with 81 rows. The answer was one word away and the product said no.

`ClarificationNeeded` exists for exactly this, is already rendered by the Ask panel as clickable
buttons (`ask-panel.tsx:131-147`), and is already used elsewhere in the same method. The refusal is
not a missing capability; it is the wrong response class.

Three measurements decide the design, and each rules out the obvious implementation.

**Re-asking through the model is unreliable.** Today's clarify carries `options: string[]` and the
panel appends the chosen string to the question, which goes back through the selector. 4 samples each:

| re-asked question | result |
| --- | --- |
| `... by statement leaf (2026-07-01)` | success 2/4, informational 2/4 |
| `... by statement leaf (July 2026)` | success 3/4, informational 1/4 |

A period the user has explicitly clicked must never be re-guessed. That kills `resumesQuestion` as
the continuation for this feature.

**The MIS Reports period list contains an option that cannot answer a statement ask.** `periods`
includes `FY 26-27 YTD`, a twelve-month range, while `statementPeriod` needs a single period point.
Measured: `... (FY 26-27 YTD)` is `not_supported` 4/4. Offering the raw list would present a choice
guaranteed to fail.

**A governed-financial answer can legitimately have no period at all.** `Show Actual and Budget by
GL code` succeeds 4/4 with **no time window**, summing every loaded month (budget 32,000,000 against
July's 8,000,000), and its readback carries no period clause. Nothing may invent a period for such
an answer, and its coverage must be stated rather than left implied.

**Four distinct causes share one dead end.** `chat.service.ts` returns `NotSupported` at `:322` (no
selector set OR no period), `:331` (`SelectionPeriodUnavailableError`) and `:335` (no mapping), and
`statementRequest` (`:726`) collapses missing *and ambiguous* department, function, plant and period
into one `undefined`. Only some of one of those is recoverable by the person asking.

## Done when

1. **C1** A statement question whose period is missing, not among the offered periods, or spanning
  more than one of them returns `ClarificationNeeded` naming the missing part, never `NotSupported`.
2. **C2** The clarification carries a typed period choice — the base `Selection` the selector already
  produced, the original question verbatim, and one entry per offered period with a **complete**
  `timeWindow` (`grain`, `column`, `from`, `to`) plus `value` and `label`. The complete window is
  required because a period-less base selection has no `timeWindow` while
  `Selection.timeWindow` (`contract/src/measure.ts:155`) requires a `grain`, so the client would
  otherwise have to invent both that and the time column. Entries contain only periods that can
  answer that question — never a multi-month range for a statement.
3. **C3** Choosing an offered period issues **exactly zero** selector calls. Proven on the **server**,
  where the claim actually lives: a hermetic `ChatService` test over a fake `LlmProvider` counts one
  call for the original question and none for a request carrying `AskRequest.selection`. The client
  separately proves it posts the exact continuation body; a frontend test alone could never prove
  the server made no call.
4. **C4** The four causes resolve in a fixed, first-match-wins order, each with its own response class
  and message, and **none of them offers period options except the last**:
  1. **Scope** — any of department, function, plant absent or ambiguous → `BlockedByPolicy`, naming
     the first offending attribute in that order.
  2. **No mapping** for the resolved triple → `NotSupported`, its own message.
  3. **No periods loaded at all** → `NotSupported`, a message distinct from a missing period.
  4. **Period** missing, unoffered, or spanning more than one → `ClarificationNeeded` with C2's choice.

  This order needs a seam the resolver does not have today: `resolve()`
  (`selection-resolver.service.ts:57`) finds the mapping first but only reaches that code path when
  a period is supplied, and throws `SelectionPeriodUnavailableError` before it can report anything
  else. So `SelectionResolverService` gains a **period-free mapping lookup** over the same master
  data that `resolve()` already uses, and `chat.service.ts` calls it before consulting periods.
  Without that seam, "no mapping" and "no periods loaded" are indistinguishable.
5. **C5** A successful data answer in either domain carries a period control whose current entry is
  the window the answer ran on; choosing another **replaces that answer in place**, the replacement's
  control shows the new period, and **the asked question is unchanged** — the transcript records
  what the user typed plus the period they chose, never a question they did not write.
6. **C6** A successful answer that resolved to no window states it covers all loaded data **within the
  asker's access scope and any filters the question applied** — governed queries inject plant scope
  at `sqlBuilder.ts:88`, so bare "all loaded data" overclaims. Informational, clarification and
  failure responses carry no period control.
7. **C7** A replacement in flight leaves the previous answer readable under a pending state; one that
  fails or is refused leaves the previous answer in place with the failure shown against it, never
  blanking it.
8. **C8** A re-run's response carries the active batch ids that produced the displayed values. The
  determinism claim is about **selector calls**, not about values being stable across reloads —
  under decision 0028 a rerun re-authorizes and reads the currently active batches.
9. **C9** Hermetic tests over a fake provider and warehouse cover the whole matrix, not a sample:
  missing period; a same-day period that is not offered; a partial-month range; a multi-month range;
  an empty period list; each of department, function and plant absent **and** ambiguous; no mapping;
  a successful statement answer; a successful governed answer with a window; a successful governed
  answer with no window; and a failed replacement. Any live-PoC claim names its sample count and no
  live claim rests on a single run (D-0024, D-0031: judged by junit testcase name and executed count).
10. **C10** New backend test files are registered in `backend/package.json` and
  `tools/quality-gate.test.mjs`, or CI runs none of them. The new failure messages belong in
  `backend/src/chat/chat.constants.ts`, which **is** in `.prettierignore`, so under D-0006 the task
  that edits it formats it, removes the path, and drops its `ignoredBaselineHashes` entry in the
  same change. `chat.service.ts`, `contract/src/api.ts`, `ask-panel.tsx` and `use-ask.ts` are **not**
  ignored and need no such treatment - checked against `.prettierignore`, not assumed.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| ASK-PERIOD-CONTRACT-AND-BRANCH | Two typed carriers and a four-way ordered branch | Turn a dead-end refusal into a recoverable clarification, on the server. Today four different causes - an absent or ambiguous scope triple, no mapping, no loaded periods, and a missing period - all collapse into one undefined in statementRequest and one NotSupported message, so the product cannot say which one happened. Add the two typed response carriers, the period-free mapping lookup the ordering needs, and the four ordered outcomes. Ships the recoverable clarification on its own; the UI is tasks 2 and 3. |  | `.prettierignore`, `backend/package.json`, `backend/src/chat/ask-period.test.ts`, `backend/src/chat/chat.constants.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/chat.service.ts`, `backend/src/mapping/selection-resolver.service.test.ts`, `backend/src/mapping/selection-resolver.service.ts`, `contract/src/api.ts`, `tools/quality-gate.test.mjs` | `backend/src/chat/ask-period.test.ts`, `backend/src/mapping/selection-resolver.service.test.ts` | none | no |
| ASK-PERIOD-CONTINUATION | Render the period choice and continue deterministically | Let a clicked period reach the warehouse as data rather than as words. Render the typed periodChoice, clone its base selection with the chosen window, post it as AskRequest.selection, and give use-ask.ts the per-turn state that holding a previous answer through pending and failure requires. |  | `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/features/assistant/use-ask.ts`, `frontend/src/features/assistant/use-ask.test.tsx`, `frontend/app/globals.css` | `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/src/features/assistant/use-ask.test.tsx` | ASK-PERIOD-CONTRACT-AND-BRANCH | yes |
| ON-ANSWERS | A period control on every successful answer | Let any settled answer move to another period without retyping the question. Show the period each successful answer ran on in both domains, replace in place on change without rewriting the asked question, and state honest coverage for an answer that resolved to no window at all. |  | `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/app/globals.css` | `frontend/src/features/assistant/ask-panel.test.tsx` | ASK-PERIOD-CONTINUATION | yes |

New moving parts: none named in the old plan

## Risks

- **The period control doubles the surface.** Human round 1 chose both domains; the governed side
  has no period concept of its own, so C6's no-window wording is the load-bearing part. Mitigated by
  C9 requiring both governed variants explicitly.
- **Replace-in-place can strand a user** if a replacement fails and the old answer is gone. C7 makes
  keeping it a criterion, not an implementation detail.
- **The eligible-period filter could drift from MIS Reports.** Mitigated by reading the same
  `options()` source rather than re-deriving months.

## Notes

Converted from plans/active/ask-period-control-recoverable-periods-in-ask.md by forge migrate.

### Technical Approach

### The two carriers
`AskResponse` gains one optional `periodChoice` on the clarification path and one optional
`periodControl` on the success path, sharing an entry shape. The existing
`clarify: { options: string[], resumesQuestion }` is untouched — `requiredTimeWindowClarify` and
`domainRoutingAmbiguity` still use it, and this story must not regress them.

### Where the branch lives
`statementRequest` currently answers a boolean question ("can I build a request?"). It becomes a
discriminated result naming *which* precondition failed, so `chat.service.ts:318-338` can map each
to its own class. Period eligibility is computed from `SelectionResolverService.options()` — the
same source as the MIS Reports dropdown (`selection-resolver.service.ts:40`), so Ask and the report
screen can never disagree about which periods exist — filtered to those a statement can resolve.

### The continuation
`AskRequest.selection` already exists and `chat.service.ts:146` already runs it verbatim. The client
clones the base selection with the chosen entry's window. No new route, no new execution path.

### Replace in place needs per-turn state
`use-ask.ts:60-90` appends unconditionally and holds ONE global `isPending` and ONE global `error`,
so today a failed rerun would either blank the answer or surface its failure somewhere else on the
page. The turn state becomes indexed: a rerun names the turn it is replacing, only that turn is
marked pending, its previous successful response is retained throughout, and BOTH a typed refusal
(a `ResponseClass` the server returns) and a thrown transport failure attach to that turn rather
than to the panel. The question string is never touched.

### The chat response and decision 0019
`/api/chat` documents its request body and error statuses (`chat.controller.ts:19-27`) but its 201
carries only a description - there is no typed response DTO. Adding two optional fields does not
change that posture. Human round: the fields ship inside the deviation decision **0012** already
records, and this story logs a deferral with a revisit trigger so the untyped chat response stays on
the ledger rather than quietly growing.

### Decisions

No new decisions. The story is governed by **0028** (a rerun re-authorizes and reads current active
batches, so it is not a snapshot), **0016** (scope attributes are provisioned, not user-selectable —
why an ambiguous triple explains rather than offers), **0019** (house style for any touched route),
**0006** (prettier-ignored files are formatted and de-listed by the task that edits them), and
**0024/0031** (proofs judged by junit testcase name and executed count).

The requirements grill flagged the brief's "LLM/data residency: decide later" line as stale:
decision **0027** fixes Bedrock in `ap-south-1` and its data boundary. Corrected, not re-opened.

### Verify Plan

`python3 factory/scripts/verify.py` per task. Hermetic backend tests for C1-C4, C8 and the backend
half of C9 over a fake provider and warehouse; frontend tests for C5-C7 and the client half of C9.

The live functional check runs from this worktree and **must declare its provider**: the default is
`llmProvider: "mock"` (`config.ts:178`), and `MockLlmProvider` always returns `clarify`, so a check
run against it would appear to pass the clarification criteria while proving nothing. It therefore
requires `LLM_PROVIDER=bedrock`, `BEDROCK_MODEL_ID`, `AWS_REGION=ap-south-1` (decision 0027) and the
documented `WAREHOUSE_PG_*`, or it reports itself **blocked** rather than green. It re-runs the three
seed chips plus one recovery flow and one period switch, each with a named sample count.

### Surface Impact

| Surface | Classification | Notes |
| --- | --- | --- |
| Runtime behavior | **Changed** | Four collapsed failure causes become four ordered outcomes; a recoverable period returns `ClarificationNeeded`; a chosen period runs without a selector call. |
| API | **Changed** | `AskResponse` gains two optional fields (`periodChoice`, `periodControl`) sharing one entry type. `AskRequest` is unchanged - `selection` already exists. No new route. |
| Data/schema | **Unchanged by design** | No migration and no new warehouse read: eligible periods come from `SelectionResolverService.options()`, already used by MIS Reports. |
| CLI/ops | **N-A** | No CLI, config or deployment surface. |
| UI | **Changed** | Period-choice buttons on a clarification, a period control on successful answers, replace-in-place, and the no-window coverage sentence. |
| Docs | **Changed** | The confirmed spec is the contract; no architecture note asserts the old refusal. |
| Tests | **Changed** | New hermetic backend tests (C1-C4, C8) and frontend tests (C5-C7), registered per C10. |
| Swagger typed response DTO for `/api/chat` | **Deferred** | Decision 0012's recorded deviation. Trigger: the first story that changes the Ask answer shape for a non-PoC release. Logged with `./forge defer add`. |

### Task Decomposition

Sequential; each leaf is single-runtime with explicit dependencies.

1. **`ask-period-contract-and-branch`** (backend, `user_facing: false`) — C1, C2, **C3(server proof)**,
   C4, C8, C9(backend), C10. The shared entry type and the two optional response fields; `statementRequest` becomes a
   discriminated result; the period-free mapping lookup C4 names; the four-way branch with its own
   class and message per cause; eligible-period filtering from `options()`. Depends on nothing. **Ships the recoverable clarification on its own.**
2. **`ask-period-continuation`** (frontend, `user_facing: true`) — **C3(request body only)**,
   C5(clarification half), C7, C9(client half). Render the typed period choice, clone the base selection with the chosen window,
   post it as `AskRequest.selection`, and hold the previous answer through pending and failure.
   Depends on task 1.
3. **`ask-period-control-on-answers`** (frontend, `user_facing: true`) — C5(success half), C6.
   The period control on successful answers in both domains, replace-in-place against the existing
   turn without rewriting the question, and the no-window coverage copy. Depends on task 2.
