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
**governed vocabulary** — domain, measure and dimension names and labels the user is already
authorized to see. **Warehouse rows never leave the app**: no transaction lines, no measure
values, no batch contents. The model **selects** from that vocabulary; it never authors SQL and
never produces a number.

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
- A region change, a second region, or a non-AWS model is a new decision. Revisit when the
  production pilot (0011) sets a contractual retention and residency position, when 3F states a
  residency requirement of its own, or when the chosen model is unavailable in `ap-south-1`.
