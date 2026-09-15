---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-15
stories: [multi-plant]
supersedes: 0032-ask-typed-choice-continuation
---

# A statement question takes its plant from the docked report or the question; the typed choice continuation is deferred to ask-period-control

## Context
Decision 0032 set the typed-continuation pattern for Ask clarifications and named `plantChoice`
as this story's first instance. After the plan was approved the human re-scoped the story
(2026-09-15) to the smallest shape that still lets the docked assistant work beside any plant's
statement. A typed plant picker is a clarification carrier plus panel work whose only user today
is the demo admin on the standalone page, and `ask-period-control` is already specified to build
the same carrier for periods.

## Decision
A statement question resolves its plant, in order, from a typed **`statementGrounding`**
(department, function, plant, period) that the docked Ask panel takes from the rendered statement
scope and the server re-resolves through the mapping master and the user's current grants on
every ask, or from a **plant the selector named in the question** (the `plant` dimension is
enumerable). Department and function come from the master's selection for that plant, never from
user scope, so a user granted many plants is no longer blocked. With several granted plants and
no plant named, the answer is a plain **"name a plant"** message that lists the granted plants —
never a zero, never DUB by default. A user granted exactly one plant is unchanged.

The typed `plantChoice` continuation is **deferred to `ask-period-control`**, which builds
0032's pattern once for periods and plants. This record supersedes 0032 for this story; the
pattern itself stands and is restated here: a clarification that resumes a selection carries the
base selection plus typed choices, and the pick posts a selection, not a sentence.

## Consequences
- `AskRequest` gains `statementGrounding`; no clarification carrier changes in this story.
- `ask-period-control`'s plan re-grills against the new `statementRequest` order and adds
  `plantChoice` beside `periodChoice`.
- The seeder grants the demo admin every plant and no department or function scope, since the
  master now supplies those for a statement.
