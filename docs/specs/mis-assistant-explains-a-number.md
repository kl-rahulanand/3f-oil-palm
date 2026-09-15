---
slug: mis-assistant-explains-a-number
title: The on-screen assistant explains a number on the MIS statement
status: draft
saved: 2026-09-15T19:52:14+00:00
---

# The on-screen assistant explains a number on the MIS statement

## Why

On the MIS Reports screen the docked assistant knows nothing about the report on screen.
`AskPanel` accepts exactly two props - `surface` and `onCollapse` - and `ask()` posts
`{ question }`. So asking "how is this 85000" while looking at Agriculture Nursery DUB for July
2026 is byte-for-byte the same request as asking it on `/ask` with nothing on screen.

Worse, the assistant actively refuses the question. `classifyCausalQuestion`
(`backend/src/chat/reconciliation-guard.ts:31`) fires before any routing and answers:

> Causal analysis is not configured. I can't infer why a result is high or low.

That guard is **correct with no context** - it stops the model inventing causes. But it answers
the wrong question. "How is this 85000" is not causal inference, it is **composition**: which
amounts add up to this figure, and why do they land on this line. The product already computes
both halves and already shows them to the same user through a different door:

- `POST /api/mis/statement/drill` returns every transaction behind a leaf - month, posting date,
  debit, credit, value, reference, memo - plus a footer that foots exactly, and it is audited
  under decision 0025. `statement-view.tsx:167` opens it when the user clicks an Actual.
- The mapping master already determines which (plant, cost centre, GL) triples fold into each
  statement leaf. That is how the number was built.

This capability is not new analysis. It lets the user ask, in words, for an explanation the
product already has, at the moment they are looking at the number.

**This is the follow-up decision 0037 named.** 0037 left the assistant untouched by multi-plant
and deferred `statementGrounding` to "the follow-up story". Decision 0038 scopes that follow-up
to the grounded explanation only: `/ask` is frozen, and 0035's plant-from-the-question half stays
deferred.

## Behaviour

### The grounding
The docked panel sends a typed `statementGrounding` carrying the rendered statement's
**department, function, plant and period** - exactly the shape decision 0035 specified and 0038
adopts - plus the **selected block** and, when the user has clicked one, the **focused node**
(`nodeKey` and block) and the statement's **pinned batches**. The block is part of the subject
because a July screen also carries a distinct FY-YTD block, so period alone cannot identify
"this 85,000".

The server **re-derives everything**. It never trusts the client: department and function come
from the master's selection for that plant, never from user scope; the plant is checked against
the user's current grants on every ask; and the pins are validated before any read. A plant the
user cannot see is refused, not answered.

### `/ask` is untouched
`/ask` sends no grounding and behaves byte-for-byte as today, proven by its shipped leaves
passing unmodified. Grounding is a branch the caller opts into - the same shape `continueTurn`'s
caller-stated failure policy took in `ask-reopen-saved-report` - never a change to shared
classification. Per 0037 and 0038, a user granted every plant still gets "not supported" for a
statement question on `/ask`, while the same user gets a full answer from the docked assistant.

### Click, then ask
Focus is explicit. The user clicks an Actual - the affordance the statement already ships - and
that node becomes the subject. Digits in the question are **never** used to choose a node, so
there is no ambiguity when two lines share a value and no disambiguation prompt. Focus is owned
by the report view, not by the drill modal, and is passed to both the drill panel and the
assistant. It is **cleared** whenever the report scope, the block or the pinned batches change,
because the subject no longer exists.

With no node focused, the assistant asks the user to click the line. Budget is never a subject,
matching the statement's shipped footnote that Budget is not drillable.

### What the answer contains
**A total and a leaf are answered differently, because the drill refuses a non-leaf and decision
0024 does not permit inventing an aggregate raw query.**

- A **leaf** gets both halves: the roll-up path - which GL codes and cost centres the mapping
  master folds into that leaf, through which bucket - then the transactions behind it.
- A **total or subtotal** gets the roll-up path only: which lines compose it, and which GLs and
  cost centres feed those lines. No raw rows, nothing refused.

Transactions are bounded and honest about it: the answer always carries the **exact footer** and
the **total row count**, shows the first rows inline, and offers the existing drill panel for
full paging. It never truncates silently. If the footer does not foot to the figure on screen,
that is a failure, not a rounding note.

### The model never sees the numbers
Decision 0027 forbids transaction rows, amounts, batch identifiers and result rows reaching
Bedrock. The explanation is therefore **composed deterministically on the server** and rendered
from a typed payload. The model's only role is classifying the question. No figure in the answer
is ever model-generated.

### Composition is answered; cause is not
The boundary is explicit and testable, not "equivalents":

- **Composition** - how a figure was built, what it contains, which GLs or lines feed it - is
  answered.
- **Causal** - why a figure is high or low, what caused a movement - is still declined, with
  today's copy. Grounding must not become a back door that lets the model invent reasons, which
  is exactly what `classifyCausalQuestion` exists to prevent.
- An ordinary **data question** asked with a statement on screen is still answered as a data
  question. Grounding narrows what a question may reach; it does not turn every question into an
  explanation.

### Freshness and staleness
A grounded answer reads the **same pinned batches** the on-screen number came from, so the answer
can never contradict the screen by quietly using fresher data. A replaced or missing batch is
refused in **typed** terms that name which source and period went stale - not through the global
HTTP error envelope, which flattens that detail into generic copy.

The answer also names the **mapping-master version** it resolved against, so an explanation that
was built under a different master than the on-screen figure is detectable rather than silently
wrong. Cross-deployment master drift remains D-0038's deferral.

### Plants and unmapped lines
Every plant the user is granted is supported by the docked assistant. A plant that is not the
budget owner carries decision 0034's **"Budget not loaded for this plant"** state, which is a
normal, expected answer and must never be presented as a stale or missing batch. An
`unmapped-GL` line is **provisional**, not an approved mapping path, and the explanation says so
rather than implying the master blesses it.

## Acceptance criteria

- **C1** The docked assistant sends `statementGrounding` - department, function, plant, period,
  block, pinned batches, and the focused node when one is clicked. `/ask` sends none of it and
  its shipped leaves pass **unmodified**.
- **C2** The server re-derives department and function from the master's selection for that plant
  and validates the plant against the user's current grants on every ask. A plant outside the
  user's grants is refused, never answered, and a leaf proves the client cannot widen its own
  scope by editing the payload.
- **C3** With a node focused, a composition question is answered with the explanation, NOT with
  `classifyCausalQuestion`'s "Causal analysis is not configured". Without grounding that guard
  fires exactly as today.
- **C4** A causal question is still declined even when grounded and focused. A leaf asserts the
  composition/causal boundary on both sides.
- **C5** The subject is the clicked node, identified by `nodeKey` **and block**. With no node
  focused the assistant asks for the line; digits in the question never choose a node. Focus
  clears when the scope, block or pinned batches change.
- **C6** A **leaf** answer names the roll-up path - the GL codes and cost centres the master folds
  into that leaf, and the bucket they arrive through - and lists transactions with an exact
  footer and the true total count, showing the first rows inline and offering the drill for the
  rest. The footer foots to the figure on screen.
- **C7** A **total or subtotal** answer names the lines that compose it and their GLs and cost
  centres, and returns **no raw rows**. It is not refused, and no aggregate raw query is added.
- **C8** Budget is never a valid subject, matching the shipped statement footnote.
- **C9** No transaction row, amount, batch identifier or result row is ever sent to the model. A
  leaf asserts the provider payload, not merely the rendered answer.
- **C10** The explanation writes the drill's governed-read protections, not the ordinary chat
  audit: inputs re-derived server-side, pins validated, current scope applied, the exact
  predicate audited **before** the query runs, and a failed audit fails closed. Per decisions
  0017, 0022 and 0025.
- **C11** A replaced or missing batch produces a **typed** refusal naming the source and period,
  reaching the user intact rather than flattened by the global error envelope.
- **C12** The answer names the mapping-master version it resolved against.
- **C13** A non-budget-owner plant returns decision 0034's "Budget not loaded for this plant"
  state, distinct from a stale or missing batch. An unmapped-GL line is described as provisional.
- **C14** Every criterion is proven by hermetic tests judged by the vitest discriminator -
  present AND NOT skipped AND NOT failed (D-0031) - across this matrix: no focus / composition /
  causal / ordinary data question; leaf / subtotal / grand total / unmapped; selected-period
  block / FY-YTD block; stale actual / stale budget / changed mapping version; plant outside
  grants; audit failure; provider payload exclusion; and footer-foots-to-screen with the true
  total count.
