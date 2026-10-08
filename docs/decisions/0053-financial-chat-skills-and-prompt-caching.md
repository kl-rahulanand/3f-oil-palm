---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# Financial chat skills and prompt caching

## Context

The owner agreed to lightweight financial skills and static-prefix prompt caching
after distinguishing instructions, data-fetching tools and conversation memory.
Neither feature should widen model authority or add another agent framework.

## Decision

Keep small, code-authored financial instruction modules inside the new TypeScript
LangGraph agent for factual comparisons, monthly trends, clarification and
transaction requests. Enable explicit Claude prompt caching for the unchanged
static instructions and tool definitions only, through the selected direct
Anthropic provider; conversation state remains independently in memory.

## Consequences

Skills guide selection, not calculation or authorization. Core safety rules always
apply; the server validates scope, checks current permissions, calculates exact
financial amounts and prepares transactions through the four governed tools.
Use trusted bundled instructions, not user-uploaded skills, arbitrary filesystem
loading, generated code or a new Deep Agents/skill-execution framework.

Place the explicit cache breakpoint before user text, permitted vocabulary,
confirmed/pending selections and all other dynamic context. No financial answers,
rows, transactions, handles, permissions or conversation history belong in the
cached prefix. Static cache reuse never bypasses current permission checks or
validated warehouse reads; an existing pinned result/detail retains the agreed
source-generation and authorization rules.

Stage 1 proves the pinned ChatAnthropic cache-control API and usage counters.
Stage 6 owns instruction composition and provider cache settings; stage 9 proves
selection correctness and payload exclusion with caching on and off. Start with
the provider's five-minute explicit cache lifetime, not whole-conversation automatic
caching. Verify the selected model's minimum cacheable prefix and identical-prefix
requirements; never pad prompts merely to qualify. A miss, expiry or too-short
prefix processes the same authorized request normally, without fake cache-hit claims.
Record aggregate cache-write/read token usage and timing without prompt/result logs.

This agreement changes the draft plans, not their approval state, and does not
authorize real API calls before the vendor prerequisites in decision 0051.
Reports and existing chat remain unchanged.

Reference checked on 2026-10-08:
[Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
