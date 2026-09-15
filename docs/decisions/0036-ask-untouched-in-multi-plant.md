---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-15
stories: [multi-plant]
supersedes: 0034-ask-plant-from-grounding-or-question
---

# The assistant is untouched by the multi-plant story; plant-aware Ask is the follow-up

## Context
Decision 0034 kept a plant-aware assistant inside the multi-plant story (plant from the docked
report's scope or from the question). The human then cut the story to its minimum
(2026-09-15): seed the master for every plant from the client's sheet, show a dash for Budget
and % on every plant that is not the budget owner, and leave transactions and drill-down as
they are. That minimum touches no assistant code.

## Decision
The multi-plant story **does not change the assistant**. `actual_by_gl_month` keeps its DUB
literal, `statementRequest` keeps requiring exactly one department, function and plant on the
user, and no `statementGrounding` or plant dimension is added. Consequence, stated so nobody
is surprised in a demo: a user granted every plant gets "not supported" for a statement
question in Ask (including the seeded chips), while GL-code questions keep answering for DUB.
The grounding-or-question design of 0034 and the typed-choice pattern of 0032 are carried
unchanged into the follow-up story that 0033's trigger opens, or into `ask-period-control` if
it lands first.

This record supersedes 0034 for this story.

## Consequences
- The story is two tasks: a backend task (generated master, budget-owner rule, export dash,
  seeded grants) and a frontend task (dash rendering).
- For demos that need both the all-plants report and a working Ask statement question, seed a
  second user granted DUB only; `SEED_USERS` already supports several users.
- `ask-period-control` proceeds against the shipped `statementRequest`, unchanged by this story.
