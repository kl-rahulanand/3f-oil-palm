---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-08-14
stories: []
---

# PoC / engagement scope for the 3F Oil Palm MIS

## Context

3F Oil Palm's monthly MIS is a hand-built Excel compiled by Srihari from SAP and
the Smart Palm SQL Server. In the kickoff walkthrough (recap email, Rahul Anand →
Devanshi) the client named the pain: data is not live, reports take significant
time to prepare, there is no clickable drill-down to verify how a number was
derived, and the two headline metrics — Yield per hectare and OER — are
distrusted because some input values are manually manipulated. The team also
liked budget tracking and alerting as a future idea. KnackLabs stated three next
steps and the client agreed to proceed via NDA (now in place).

Source: `docs/context/2026-08-14-kickoff-notes-and-emails.md`.

## Decision

KnackLabs will deliver an automated MIS for 3F Oil Palm with three committed
capabilities: (1) a more advanced MIS report with clickable drill-down, (2) the
report/data made live, and (3) a chatbot layer over the centralized data. Budget
tracking and alerting is an explicit **future** enhancement, not part of this
scope.

Refinements agreed later in office-hours (2026-08-14, see the design doc
`.gstack/projects/3oilpalm/caw-dev-master-design-20260814-110242.md`): v1 is
**read-only** over SAP + Smart Palm; the architecture lean is a **warehouse +
modeled metrics layer**; the **chatbot is sequenced as a fast-follow** after the
report slice; and **detecting/correcting the upstream manual manipulation is out
of scope for v1** (deferral **D-0001**), so v1 makes numbers live and traceable,
not certified-correct.

## Consequences

- The engagement's success rests on drill-down traceability and one governed
  metrics definition shared by the report and the chatbot.
- Budget/alerting and manipulation-detection are deferred, not promised for v1
  (manipulation parked as D-0001 with a revisit trigger).
- The client owes the inputs (MIS/Excel, SAP export, Smart Palm tables, Yield/ha
  + OER calculation rules) before PoC scope can be firmed — see Puneet's post-NDA
  email in the same source file.
- This record is **proposed**; a human confirms it. It is refined again at, and
  bound by, client sign-off.
