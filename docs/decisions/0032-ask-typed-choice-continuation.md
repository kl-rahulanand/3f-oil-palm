---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-15
stories: [multi-plant]
---

# Ask clarifications that resume a selection carry a typed continuation, never a re-asked sentence

## Context
The assistant's existing clarification carries `options: string[]` and `resumesQuestion`;
the chosen string is appended to the question and re-asked through the model. The
`ask-period-control` spec measured that path at 2/4 and 3/4 success for a period the user had
explicitly clicked. The all-plants spec grants the demo user many plants, so a statement
question on the standalone Ask page may need the user to pick a plant, and it requires that
the pick re-runs with **zero** further selector calls. `chat.service.ts:146` already runs an
edited `AskRequest.selection` verbatim; the missing piece is a typed carrier for the choice.

## Decision
A clarification that resumes a selection carries a **typed continuation**: the base
`Selection` the selector already produced plus a list of choices, each with `value`, `label`
and the exact patch to apply. The client clones the base selection with the chosen patch and
posts it as `AskRequest.selection`, skipping the selector. Each choice kind is its own optional
field on the ClarificationNeeded response (this story adds `plantChoice`; `ask-period-control`
adds `periodChoice` with the same philosophy), so a plant pick and a period pick can never be
confused, and the existing `options` / `resumesQuestion` path stays untouched for its current
users. A choice re-run re-authorizes and audits like any data answer (decision 0028).

## Consequences
- `contract/src/api.ts` gains the `plantChoice` carrier; the Ask panel renders its choices as
  buttons that post a selection, not a sentence.
- `ask-period-control` builds `periodChoice` on the same pattern; the two stories share a
  design, not a type, so neither blocks the other.
- Human acceptance of this record is sought at the multi-plant plan grill.
