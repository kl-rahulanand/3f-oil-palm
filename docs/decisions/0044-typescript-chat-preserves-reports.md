---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# TypeScript LangGraph and separate warehouse tables preserve existing reports

## Context
After accepting decisions 0042 and 0043, the owner selected TypeScript for LangGraph and
asked how the new warehouse design affects report generation. The owner chose the recommended
PoC approach of preserving existing report tables and adding new chat tables alongside them.
The owner then requested an implementation plan on 2026-10-08.

## Decision
Implement LangGraph in TypeScript inside the NestJS backend. Next.js/React renders the new
chat using adapted shadcn template components and the Generative UI pattern. Shared contracts
live in `contract/`. Conversation checkpoints remain in memory in one backend instance.

Create the new Actual, Budget, dimensions, hierarchy, mappings and load metadata in a separate
`agent_financial` namespace in the same warehouse Postgres database. Existing report tables,
views, ingestion behavior, statement generation, exports and report drill-down keep their
current contracts. The new chat is authored independently of the existing chat implementation.

Both data paths originate in the same supplied source workbooks. The new loader must read
the originals, not treat existing ingested rows as complete evidence: that older path can omit
rows missing Plant or Cost Center. Reconcile complete-source totals for the new path, and
compare existing-report totals only at the same supported scope and inclusion rules.

New financial tables are not a new database server or a new financial source. A later switch
of report generation to them requires its own implementation scope and proof. No existing data
is dropped or renamed by this PoC. The shared typed response carries answer text, approved
scope, result components, clarification choices and prepared Actual transaction pages.

## Consequences
- Some source data is duplicated for the PoC; each consumer has one explicit read path and
  the loaders' reconciliation evidence explains differences in scope rather than forcing equality.
- Implementation first proves compatible TypeScript/Node packages and streaming inside the
  existing CommonJS backend and React 19 frontend. No standalone Agent Server is required.
- Regression proof covers existing statements, exports and report transaction drill-down
  before and after adding and loading the new tables.
- This extends the new-chat target decisions 0042 and 0043; it does not supersede the legacy
  report decisions or authorize moving their reads to the new schema.
