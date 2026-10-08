# Stage 6: TypeScript LangGraph and Memory Implementation Plan

> **For agentic workers:** Follow Forge story/task approval and isolated worktrees. Use superpowers:executing-plans for inline execution; use subagent-driven-development only when authorized. Read this file, the master checklist, the spec and accepted decisions before implementation.

**Status:** Draft implementation detail; documentation only. This is not story approval.

**Goal:** Resolve factual questions safely, clarify ambiguity and assemble accurate UI-ready answers.
**Architecture:** A bounded selection loop uses catalog/lookup metadata; server graph nodes execute
financial reads and transaction preparation, then assemble numeric answers without an LLM.
**Tech Stack:** Pinned TypeScript LangGraph, in-memory checkpointer, NestJS and ChatAnthropic for direct Claude Sonnet 5.5 (claude-sonnet-5-5).
**Spec:** [Financial chat](../../specs/langgraph-financial-chat.md).
**Global constraints:** [Master](2026-10-08-financial-chat-master.md).
**Dependencies:** Stages 1, 4, 5.

## Files and ownership

- Create backend/src/financial-chat/financial-chat.module.ts, financial-chat.graph.ts,
  financial-chat.state.ts, financial-chat.tools.ts, financial-selector.provider.ts,
  financial-chat.service.ts, financial-chat.graph.test.ts and financial-selector.provider.test.ts.
- Create financial-answer.helper.ts only if deterministic assembly needs a distinct responsibility.
- Modify backend/package.json, package-lock.json and tools/quality-gate.test.mjs for pinned packages/leaves.
- Import exported FinancialDataService and existing auth/audit/config services; no old-chat logic.

## Interfaces and graph state

FinancialChatService.run(userId, conversationId, input, signal): AsyncIterable<FinancialChatEvent>
accepts typed user question or clarification reply from stage 1. Server owns conversation IDs.
State includes owner, sanitized user questions, confirmed FinancialSelection, pending candidate/
missing fields/choices, latest result identity, UI results and prepared details kept server-side,
run identity/status and expiry. External model serialization is a positive allowlist, not full state.

Tools are exactly get_financial_catalog, find_dimension_values, query_financials,
get_actual_transactions, with stage 1 schema and stage 4/5 service signatures. Server injects
user and handle context; model cannot supply authorization. Do not add general SQL/search/code tools.

## Tasks

### 6A: Clarification and confirmed context

- [ ] Write observable graph cases missing_scope_never_queries, ambiguous_component_clarifies,
      pending_reply_completes_candidate, now_by_gl_reuses_scope, august_updates_only_period,
      conflicting_reference_clarifies and fresh_conversation_no_scope.
- [ ] Route: current-authority/catalog -> select/resolve -> clarify OR validate -> query ->
      prepare distinct Actual pages -> deterministic answer/UI -> complete.
      Distinguish unsupported question from missing scope and malformed selector output.
- [ ] Candidate scope is not confirmed until valid and ambiguity resolved. A clarification reply
      updates its pending request; context failure asks for full scope instead of guessing.
      Explicit new Plant/time/measure overrides prior scope only after validation.
- [ ] Preserve confirmed scope for short follow-ups; do not let stale result money become a new
      warehouse answer. "Show transactions" resolves a prior Actual cell by identity; multiple
      candidates clarify. An opaque selected cell from UI still needs current permission.
- [ ] Reject forecasts, recommendations and causal "why" with plain supported alternatives.
      Facts about observed month changes remain supported, without inferred causes.

### 6B: Model boundary and bounded agent execution

Develop with a fake selector first and validated warehouse reads. Use synthetic questions
until the owner records application API/model access, billing and client data-handling
confirmation. No real new-chat Anthropic calls before that check; fake success cannot
substitute for live-Claude acceptance.

- [ ] Write marker-payload cases excludes_money_rows_handles_and_raw_state,
      lookup_vocab_is_current_grant_scoped, malformed_tool_call_denied, tool_loop_bounded,
      vendor_timeout_typed and injected_sql_or_code_never_executes.
- [ ] Build the fresh selector with ChatAnthropic from @langchain/anthropic. Configure
      FINANCIAL_CHAT_MODEL_PROVIDER=anthropic, FINANCIAL_CHAT_MODEL_ID=claude-sonnet-5-5 and
      backend-only ANTHROPIC_API_KEY. Keep one provider interface, without OpenAI implementation/
      key requirements or automatic fallback. No old prompts or AWS SDK/Mumbai setting.
      Mock vendor is development/hermetic only; final proof uses real Claude Sonnet 5.5.
- [ ] Test this model's supported tool API: avoid forced tool choice and non-default sampling
      parameters; validate ordinary tool/structured selections on the server. Pin supported
      thinking/effort/token settings and bound retries/latency. Never stream raw thinking blocks
      as financial answers. Model unavailability is an explicit failure, not silent substitution.
- [ ] Model sees user text, sanitized confirmed/pending selection and capped permitted vocabulary.
      Result/tool message history with money/transactions stays out of provider calls, retries,
      tracing and logs. User-pasted figures are user content, not server-result permission.
- [ ] Graph can call catalog/lookup while selecting; query and transaction results are internal.
      Subsequent external model round gets only permitted metadata, never raw tool output.
- [ ] Cap selection rounds at five; finite vendor retry/timeout policy cannot multiply without
      bound. Unknown tools/fields/values fail validation before data work.
- [ ] Invoke transactions for every distinct promised Actual; include ready/error bundle dictionary
      in final FinancialChatResponse and UI events. Detail failure must be honest, not synthetic data.
- [ ] Assemble answer text and financial components from service results; never ask LLM to narrate
      returned numeric financial records. Scope text is rendered from confirmed validated identifiers.

### 6C: In-memory lifecycle and cancellation

- [ ] Write owner_isolation, concurrent_run_refused, refresh_same_id_resumes,
      expiry_clears_pending_state, restart_loses_context, revoked_grants_invalidates_scope and
      cancelled_run_cannot_commit_answer. Use controlled clocks, not sleep-based tests.
- [ ] Compile with in-memory checkpointing keyed by server-owned conversation/thread identity.
      One active run per conversation; reject another without corrupting pending/confirmed state.
- [ ] Expire idle conversations/handles at one hour with bounded cleanup; clear associated result
      and replay caches. Memory limits include events/results, not only message count.
- [ ] Recheck grants before reuse and before emission of result data. After revocation, do not
      replay stored unauthorized rows; return permission-change outcome requiring permitted scope.
- [ ] Cancellation aborts provider, suppresses new data work and prevents late result/state writes.
      Existing in-flight SQL is statement-timeout bounded; cancellation never falsely claims DB abort.
- [ ] Unknown stale ID after restart gives typed context-expired/new-chat message. No silent empty
      replacement that makes user think previous confirmed scope survived.

## Verification and handoff

- [ ] Run registered graph/provider hermetic leaves, dead-port startup/module resolution using
      DependenciesScanner/InstanceLoader rather than booting real AppModule, then quality/typecheck/
      structural. Inspect named cases and provider payload exclusion evidence.
- [ ] Hand off graph transition examples, tool sequence and complete response. Stage 7 owns HTTP,
      stage 8 rendering; neither may recreate selection or financial calculations.

**Done when:** The graph answers only validated factual scope, prepares detail in the answer,
defends the model boundary and preserves isolated PoC memory behavior.
**Review focus:** Tool-result leakage through checkpoints; clarification replies detached from
pending request; authorization after cached result; cancellation races; accidental LLM arithmetic.
