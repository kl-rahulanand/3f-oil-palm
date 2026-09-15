---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-16
stories: [ask-reopen-saved-report]
---

# The grounded explanation ships without touching Ask; plant-from-question stays deferred

## Context
Decision 0037 left the assistant untouched by the multi-plant story and named the follow-up that
would add `statementGrounding`, carrying 0035's design forward "unchanged". 0035 has two halves:
a typed `statementGrounding` the docked panel takes from the rendered statement scope, and a
plant resolved **from the question** when the grounding is absent, with a "name a plant" message
when several are granted and none is named.

The human scoped the follow-up on 2026-09-16, in the same breath as requesting it: "ask screen
behaviour to remain same as earlier, this is only for on screen assistant." That is a direct
conflict with 0035's second half, which by definition changes what `/ask` does with a statement
question. Asked to choose, the human chose the frozen `/ask`.

## Decision
The follow-up story ships **only the grounded on-screen explanation**. `AskRequest` gains
`statementGrounding` and the docked MIS assistant sends it; `/ask` sends nothing and its
behaviour is byte-for-byte unchanged, proven by its shipped leaves passing unmodified.

0035's **plant-from-the-question** half and its "name a plant" clarification are **not** built
here and remain deferred. The consequence 0037 already stated therefore stands unchanged: a user
granted every plant still gets "not supported" for a statement question on `/ask`, while the same
user gets a full grounded answer from the docked assistant on a rendered statement.

0035's first half is adopted as written: the grounding carries department, function, plant and
period, the server **re-resolves it through the mapping master and the user's current grants on
every ask**, and department and function come from the master's selection for that plant, never
from user scope.

This record supersedes the plant-from-question half of 0035 for this story; the typed
`statementGrounding` half stands and is restated above.

## Consequences
- A multi-plant demo still needs the DUB-only second user for `/ask` statement questions, exactly
  as 0037 says. The docked assistant is the path that works for every granted plant.
- The deferred plant-from-question work keeps its own trigger and is not silently dropped.
- Because `/ask` is frozen, the grounded path must be a branch the caller opts into rather than a
  change to shared classification - the same shape `continueTurn`'s caller-stated failure policy
  took in `ask-reopen-saved-report`.
