---
status: accepted
confirmed_by: "kl-rahulanand"
date: 2026-09-12
stories: [assistant]
---

# The assistant ships in the PoC, superseding decision 0002's "later phases" clause

## Context
Three accepted product sources disagreed about when the assistant arrives.

- `docs/specs/assistant-and-exploration.md` (confirmed 2026-09-01, grilled the same day):
  **"Included in the first PoC release."**
- `docs/product/BRIEF.md`: the conversational layer is **"sequenced as a fast-follow."**
- Decision **0002**: *"The Operational MIS … and the chatbot remain later phases."*

The roadmap already encodes the spec's reading — `assistant` is story **7 of 7**, the last item
of the PoC, and stories 1–6 are done. But a planner reading the decision corpus would find the
opposite, and **D-0032** has flagged the BRIEF as drifted from the confirmed specs since
`mis-statement`.

The confirmed spec is the later, grilled, signed-off artifact. The BRIEF predates the spec
confirmations and decisions 0014–0025; 0002's clause was written when Phase 1 was still being
scoped.

## Decision
**The assistant ships in the PoC**, as story 7 of 7. This **supersedes the chatbot clause of
decision 0002** — and only that clause: 0002's Operational MIS deferral (Table-1, Yield/ha, OER,
nursery stock flow) stands untouched, as does its read-only rule. `docs/product/BRIEF.md`'s chatbot-timing
clause is amended to match.

This closes only the **timing half** of **D-0032**. The BRIEF still frames Smart Palm,
Yield-per-hectare and OER as v1's headline metrics, which decisions 0002 and 0014 replaced with
the SAP-only Financial MIS; that half of D-0032 stays open with its trigger intact.

## Consequences
- The PoC is not complete until the assistant ships; the roadmap's 7/7 is the real finish line.
- **D-0032 is not fully discharged.** Anyone handed this repo still reads a BRIEF whose headline
  metrics are the deferred Operational MIS. Rewriting that framing is a documentation task of its
  own, not a clause edit, and it keeps its revisit trigger.
- The residency question the spec parked as "OPEN — decide later" becomes blocking, because a
  live assistant sends user text off the machine. Decision **0027** settles it.
- The assistant is scoped to the governed vocabulary that now exists — the `governed-financial`
  and `mis-statement` domains over the proven DUB slice — not to everything SAP holds. It
  inherits, rather than reopens, decisions 0016 (all-or-nothing access), 0017, 0018 and 0022.
- 0002 keeps its authority everywhere else. A future reader must not take this as licence to
  reopen the Operational MIS deferral.
