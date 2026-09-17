---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-17
stories: [mis-assistant-explains-a-number]
---

# mis-assistant-explains-a-number closes on hermetic proof; the end-to-end walkthrough is deferred

## Context
The story is complete in every other respect: three sealed tasks (#67, #68, #69), each finishing
at quality 10 / performance 10 / security 10; 46 task contracts implemented; backend 227 tests with
zero failures; frontend 155 of 155; `verify.py` green.

The functional check could not exercise the capability. Every criterion that needs a **rendered
statement** - the leaf explanation and its paise-exact footer, the aggregate projected in the
browser, the replaced-batch outcome, focus clearing - was unreachable, because **no host has both
the code and the data**:

- the development machine's warehouse database has no schema, and the local compose "seed" is a
  two-column fixture table (`id=1, value=42`);
- the source SAP and budget workbooks are not in the repository or on that machine, so there is
  nothing to ingest;
- the only environment holding real data is deliberately pinned to PR #59, which predates the story.

What the check DID verify live is real: the backend boots only with `STATEMENT_ATTESTATION_SECRETS`
set and refuses to start without it - task 1's rule holding in a running process rather than a unit
test - and the docked assistant with no statement shows its local message with a **disabled**
composer, issuing no chat request, while `/ask` is unaffected.

Rated on coverage the walkthrough scores 6, below the harness floor of 8. The orchestrator declined
to raise the number to clear the gate and put the choice to the human, who ruled on 2026-09-17:
**"Close with the gate short."**

## Decision
The story closes on its hermetic proof. The functional artifact is recorded at the gate threshold
**under this decision**, not because coverage reached it: its summary states the partial coverage in
its first lines, and this record is the standing explanation of the number. Anyone auditing the
story sees both.

The unexercised path is carried by **D-0055**, whose trigger is the first move of the server past
PR #69, a local environment gaining ingested data, or the demonstration to Srihari.

## Consequences
- The capability ships never having been run end to end against real data. The first real exercise
  is also its first proof; treat the initial run on the server as verification, not as a demo.
- If that run fails, the failure is a story-level miss and not a regression, and it reopens D-0055
  rather than opening a new defect.
- The precedent is narrow: it applies where a gate cannot be satisfied for environmental reasons
  outside the story's control, and it is discharged by a ledgered deferral with a trigger. It is not
  a licence to record scores the evidence does not support.
