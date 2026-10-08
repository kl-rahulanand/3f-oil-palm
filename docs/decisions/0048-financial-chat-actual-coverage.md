---
status: accepted
confirmed_by: "Project owner (confirmed in chat)"
date: 2026-10-08
stories: []
supersedes: ""
---

# Financial chat distinguishes confirmed zero Actual from data not loaded

## Context

A Plant with no transactions in a month may have genuine zero activity, or its data
may not have been loaded. The owner agreed that the new chat must distinguish these
cases rather than present missing data as zero.

## Decision

Show ₹0 for an empty matching transaction set only when complete Actual data for that
specific Plant/month has been confirmed and the validated generation is active.
Without that confirmation, show null with “Actual data not loaded”, not ₹0.

Loading a workbook or finding other Plants' rows for that month does not confirm every
Plant's coverage. Having some rows for a Plant/month does not by itself prove completeness.

## Consequences

Record explicit Plant/month completeness evidence with the load generation, separately
from transaction rows and Budget coverage. Activation and reconciliation must validate
declared coverage; neither the agent nor a query may infer completeness from row absence.

Queries and charts preserve unavailable months as gaps. An incomplete range must not
look like a complete total. A confirmed complete Plant/month with no matching lines
returns exact zero and honest empty transaction metadata.

Add independent acceptance cases for a Plant with no rows and confirmed coverage, the
same empty Plant/month without coverage, and a Plant with partial rows but no confirmation.
This affects only the new financial chat; existing reports and chat remain unchanged.

Related: [0042](0042-agent-ready-financial-warehouse.md) and
[0043](0043-langgraph-financial-chat-poc.md).
