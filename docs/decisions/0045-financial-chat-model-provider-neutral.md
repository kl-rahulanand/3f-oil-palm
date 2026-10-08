---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# New financial chat integrates a configurable direct model provider

## Context

The owner explicitly rejected carrying the existing chat's AWS Bedrock choice into the new
LangGraph design, then agreed to the direct-provider integration explained in this chat.
The earlier new-chat draft inherited that provider choice without explicit approval.
This record corrects that assumption; it does not select Claude or OpenAI or a specific model.

## Decision

Integrate the selected model inside NestJS using the supported TypeScript LangChain adapter:
ChatAnthropic for direct Anthropic Claude API, or ChatOpenAI for direct OpenAI API. Keep provider
and model configurable, with credentials only on the server. Start implementation with one
chosen provider; do not build two simultaneous integrations or automatic cross-vendor fallback
unless separately requested. Exact provider/model selection remains open.

The model interprets questions, selects governed tools and asks for clarification. LangGraph
validates scope/current Plant permissions before server tools execute. The warehouse and
financial service calculate amounts and prepare transaction pages; React renders those verified
results. The database schema, four tool contracts and UI do not depend on the model vendor.

Keep server-sourced money, result rows, transaction data, batch contents and drill handles out
of external model calls. Only user-authored text, sanitized selection/context and permitted
capped vocabulary may be sent. No change to this boundary is approved.

For the NEW chat only, this replaces the Bedrock/Mumbai/AWS SDK provider assumption carried
from decision 0027 into decision 0043 and the draft plans. Decision 0027 continues to govern
the existing shipped chat unchanged. Do not rewrite its accepted historical record.

## Consequences

- Update the draft spec and affected plans to remove mandatory Bedrock and Mumbai model hosting.
- The selected provider must be tested for supported tool/structured-output APIs, SDK compatibility,
  bounded retries/timeouts, cancellation and safe payload serialization before financial reads.
- Provider account access, billing, data processing/retention and residency must be checked before
  enabling real requests. Direct APIs do not automatically preserve Mumbai processing.
- Recommend candidate models using current documentation and representative question evaluations;
  a recommendation is not owner approval of a specific provider or model.
- Secrets stay in backend configuration; no frontend key, direct browser model call or source-data upload.
- This locks integration design, not implementation/story approval, additional services or report changes.
