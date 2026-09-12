---
status: accepted
confirmed_by: "kl-rahulanand"
date: 2026-09-12
stories: [assistant]
---

# The assistant's model is Bedrock in ap-south-1; only the question and the governed vocabulary leave the app

## Context
The confirmed spec parked **"LLM & residency: OPEN — decide later"** as non-blocking. It cannot
stay open for a story that ships: answering a natural-language question means sending the
user's typed text, and the conversation context, to a model.

What the repo already has:
- `backend/src/llm/bedrock.provider.ts` — the only implemented provider.
- `backend/src/llm/mock.provider.ts` — always returns `kind: "clarify"`. It **never selects**,
  so a mock-only assistant cannot answer a single question; it is a development stub, not a
  shippable fallback.
- `backend/src/config.ts:180` — `AWS_REGION` already defaults to **`ap-south-1`**;
  `BEDROCK_MODEL_ID` has no default and must be set.

The client's data is Indian financial records. Decision **0011** defers production deployment
readiness, so this decision covers the PoC and names its own revisit trigger.

## Decision
The assistant uses **AWS Bedrock in `ap-south-1` (Mumbai)**, keeping question text in-country.

**What may be sent:** the user's question, the prior turns of that conversation, and the
**governed vocabulary** — domain, measure and dimension names and labels, **and the distinct
values of those dimensions**, capped by `dimensionEnumMax`. **Warehouse rows, measure values and
batch contents never leave the app.** The model **selects** from that vocabulary; it never
authors SQL and never produces a number.

**Amended 2026-09-12, before any code was written.** The first draft of this decision said
"warehouse rows never leave" and stopped there, which read as a tighter boundary than the code
actually holds: `chat.service.ts:167` calls `dimensionValuesForAllowedDomains`, which runs
`SELECT DISTINCT` against the **warehouse gold objects** and serializes the result into the
Bedrock prompt. Those are not rows and not measure values, but they are warehouse **content** —
in this project, real plant names, cost-centre names and GL codes. The human was told the
narrower boundary when accepting this decision and chose, on being corrected, to permit them:
without a dimension's values the model can pick a dimension but never a value, so any question
naming a specific plant or cost centre falls to the clarify path and the assistant is
materially weaker.

So the boundary is stated honestly rather than aspirationally: **3F's plant, cost-centre and GL
identifiers do reach AWS Bedrock in `ap-south-1`.** What does not is any amount, any transaction
line, any batch content, and any row of a governed result.

**Retention** is AWS Bedrock's default for the PoC; a contractual retention and NDA position is
part of the production pilot (0011), not of this story.

## Consequences
- `LLM_PROVIDER=bedrock` plus a set `BEDROCK_MODEL_ID` become real deployment inputs; the PoC
  cannot demo the assistant without them, and `mock` remains development-only.
- Because only vocabulary and the question travel, a leak of the model's inputs discloses what
  someone **asked**, never what the warehouse **holds**. That is the boundary worth defending,
  and it is what makes the "numbers only from governed measures" rule enforceable rather than
  aspirational.
- Question text is user-authored and may contain anything the user types, including figures they
  paste. That is a residual risk of any assistant and is named rather than solved here.
- The permitted-vocabulary boundary is **enforceable by test**, and must be: a test asserts what
  the provider is called with, so a later change that starts passing measure values or result
  rows fails rather than leaks. A boundary that is only written down is not a control.
- A region change, a second region, or a non-AWS model is a new decision. Revisit when the
  production pilot (0011) sets a contractual retention and residency position, when 3F states a
  residency requirement of its own, or when the chosen model is unavailable in `ap-south-1`.
