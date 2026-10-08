---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# New financial chat starts with Claude Sonnet through Anthropic directly

## Context

After agreeing to the configurable direct-provider integration in decision 0045, the owner
selected Claude Sonnet first and deferred testing OpenAI until later. The preceding
recommendation named Claude Sonnet 5.5; its official API identifier is claude-sonnet-5-5.

## Decision

Use Claude Sonnet 5.5 (claude-sonnet-5-5) through the direct Anthropic API for the first new
LangGraph financial chat implementation, with ChatAnthropic from @langchain/anthropic inside
NestJS. Set FINANCIAL_CHAT_MODEL_PROVIDER=anthropic and
FINANCIAL_CHAT_MODEL_ID=claude-sonnet-5-5. ANTHROPIC_API_KEY is backend-only.

Keep the provider boundary and financial contracts independent of the model vendor. OpenAI
is a later explicit comparison using the same factual/clarification/permission test questions;
do not implement OpenAI in the initial PoC, install its adapter speculatively, require its API
key, auto-switch providers or run both on every question.

This resolves the previously open initial provider/model selection in decision 0045. It does
not change the warehouse, four tools, deterministic calculations, Plant access, prepared Actual
transaction pages or external-model data boundary. Historical decisions remain unchanged.

## Consequences

- Pin/test ChatAnthropic and LangGraph compatibility with the selected model before implementation.
  Sonnet 5.5 rejects forced tool use and non-default sampling settings; generic forced-function
  structured-output examples must not be copied without checking the model's supported API.
- Validate selections server-side; bound tokens, retries, rounds, thinking/effort and timeouts.
  Do not expose raw thinking as customer answers or send financial tool outputs back to the model.
- Final acceptance uses real Claude Sonnet 5.5, not a mock, and checks selection, clarification,
  follow-ups, payload exclusions, cancellation, latency and measured usage.
- Account/model unavailability is reported; do not silently substitute Bedrock or another generation.
- Check account access, billing, processing/retention and residency before real requests.
  Direct Anthropic does not inherit the existing chat's Mumbai-region guarantee.
- Later OpenAI evaluation is not an initial-stage dependency or runtime fallback.

## References

- [Claude Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview).
- [TypeScript ChatAnthropic](https://docs.langchain.com/oss/javascript/integrations/chat/anthropic).
