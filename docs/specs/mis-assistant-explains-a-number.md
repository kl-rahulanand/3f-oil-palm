---
slug: mis-assistant-explains-a-number
title: The on-screen assistant explains a number on the MIS statement
status: confirmed
saved: 2026-09-15T22:29:43+00:00
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

The grounding is **attested**. The **statement response itself** carries the context - an additive
field on the shipped contract - because the statement already computes everything the context
binds, so it can be signed and returned in the same round trip rather than re-derived by a second
endpoint that could drift from the statement actually on screen. It is an opaque context binding
the scope, the outline, the pinned batches, the master version, the user or session and an
expiry. The docked panel returns that context with the question, and focus may be any valid
Actual node **inside that attested statement**. This is what makes the guarantee honest:
re-deriving scope proves the user is entitled to the data, but only an attested context proves
the question is about the statement actually on screen. There is no per-click round trip.

The server **re-derives everything and trusts nothing from the client**: department and function
come from the master's selection for that plant, never from the client's copies and never from
user scope; the plant is checked against the user's current grants on every ask; and the pins are
validated before any read. The client's department and function are **verified context, never
authority** - if they disagree with the master's selection for that plant, the request is a typed
refusal rather than a silent substitution or an ordinary "no mapping" answer. A plant the user
cannot see is refused, not answered.

### `/ask` is untouched
`/ask` sends no grounding and behaves byte-for-byte as today, proven by its shipped leaves
passing unmodified. Isolation covers **rendering as well as sending**: the docked panel and `/ask`
share one `AskProvider`, so turns survive navigation and a grounded explanation would otherwise
appear on `/ask` - a turn type it has never rendered. Grounded turns are therefore partitioned to
the docked panel and are not shown on `/ask`. Grounding is a branch the caller opts into - the same shape `continueTurn`'s
caller-stated failure policy took in `ask-reopen-saved-report` - never a change to shared
classification. Per 0037 and 0038, a user granted every plant still gets "not supported" for a
statement question on `/ask`, while the same user gets a full answer from the docked assistant.

### Click, then ask
Focus is explicit. The user clicks an Actual - the affordance the statement already ships - and
that node becomes the subject. **Clicking still opens the drill panel exactly as it does today**:
focus is set as a side effect, never as a replacement, so drill-down does not regress. The user
may ask with the panel open or closed.

The **MIS report view owns** the shared statement context and the focused `{ nodeKey, block }`,
because `StatementView` owns the drill internally today while the assistant is its sibling. There
is **no independent selected block before focus** - the block is known only once an Actual is
clicked - so the block is always taken from the focused node. The assistant's "open the full
drill" control opens that same shipped panel on that node.

Three states, stated so neither arm can be read two ways:

| On screen | Composition question | Causal question | Ordinary data question |
| --- | --- | --- | --- |
| No statement, or no mapping for the scope | Dock says "Generate a mapped statement first" locally and submits no grounded ask | same | same |
| Statement rendered, nothing clicked | Asks the user to click an Actual | Declined, today's copy | Answered by the existing ungrounded path |
| An Actual focused | The explanation | Declined, today's copy | Answered by the existing ungrounded path | Digits in the question are **never** used to choose a node, so
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
- A **total or subtotal** is explained as a **client projection of the attested statement
  payload**, exactly as decision 0024 requires aggregate drill behaviour to be. It names the
  descendant lines that compose the figure **with their values**, plus the approved mapping
  metadata for those lines. Parent/child structure comes from the pinned **outline snapshot**,
  which is where it actually lives - not from the mapping master, which knows GL-to-leaf mapping
  and not the tree. No raw rows, no warehouse query, no governed-read audit, and nothing refused.
  A labels-only answer would not explain the number, so the child values are part of the
  requirement. Only the leaf transaction read is a governed read, and only it is audited.

Transactions are bounded and honest about it: the answer always carries the **exact footer** and
the **true total row count**, shows the **first 20 rows** inline, and offers a declared control
that opens the existing drill panel on that node for full paging. It never truncates silently.

Footing is asserted in **paise against the statement payload**, not against the rendered cell.
The statement displays rupees, and the shipped drill contract already permits an exact footer to
differ from the displayed cell by up to ₹1 while paise equality holds underneath; the assistant
inherits that rule rather than contradicting it, and uses the statement's own display formatting
so the two surfaces round identically.

### The model never sees the governed numbers
Decision 0027 forbids **server-sourced** transaction rows, amounts, batch identifiers, measure
values and result rows reaching Bedrock. The explanation is therefore **composed deterministically
on the server** and rendered from a typed payload; the model's only role is classifying the
question, and no figure in the answer is ever model-generated.

The rule is scoped deliberately: a **user-authored question may contain figures** - "how is this
85000" is the motivating example - and prior-turn text is already carried today, so an absolute
"no number ever reaches the model" would be unimplementable and would forbid the very question
this capability exists to answer. What must never be sent is data the SERVER read from the
warehouse.

### Composition is answered; cause is not
Intent is a closed enum - `composition`, `causal`, `data` - resolved server-side against a
**fixture table the tests own**, not by prose. "How is this", "what makes up", "break down" and
their listed variants resolve to `composition`; a causal cue **wins over** a composition cue when
both appear, because the safe reading wins; everything else falls through to the existing data
path. This matters because today's guard does NOT classify "how is this 85000" as causal at all -
it matches "why", "reason" and "explain" - so the boundary has to be built, not assumed.

- **Composition** - how a figure was built, what it contains, which GLs or lines feed it - is
  answered with the explanation.
- **Causal** - why a figure is high or low, what caused a movement - is still declined with
  today's copy. Grounding must not become a back door that lets the model invent reasons, which
  is exactly what `classifyCausalQuestion` exists to prevent.
- **Data** - an ordinary governed question - is answered by the EXISTING ungrounded path,
  unchanged. **Grounding attaches no pin or budget promise to it.** `SelectionExecutor` takes no
  pinned batches and does not apply the non-budget-owner suppression, so a grounded data question
  could otherwise silently read newer data than the figure on screen, or show the owner plant's
  budget on another plant. Rather than promise what the executor cannot honour, grounding means
  **explanation only**; threading pins through the governed executor is deferred with a trigger.

### The typed response
`AskResponse` has no explanation payload today, and the global exception path discards exactly the
detail this capability must convey. The explanation is therefore an **in-band typed response union
on the existing chat transport**, with a variant for each outcome: focus-required, leaf
explanation, aggregate explanation, replaced-batch, gone-batch refusal, and a safe audit-failure
refusal. A failed audit returns the safe refusal and **never runs the query**.

### Freshness and staleness
A grounded answer reads the **same pinned batches** the on-screen number came from, so it cannot
contradict the screen by quietly using fresher data.

Staleness follows **decision 0025 exactly**, because the same pinned line must not behave one way
in the drill panel and another in the assistant: a batch that has been **replaced but still
exists is read and reported as replaced**; only a batch that is **gone** is refused. The refusal
and the replaced notice are both **typed**, naming the source, the period and the batch status,
and reach the user intact - explicitly not routed through the global exception filter, which
flattens that detail into generic copy.

The answer records the **mapping-master version** it resolved against in the **audit record**.
This is attribution, not detection: the statement response carries batch provenance only, so
there is nothing to compare a version against, and the master is a compiled-in constant that
cannot drift inside a running process. Cross-deployment drift stays D-0038's deferral, which this
story does not close.

### Plants and unmapped lines
Every plant the user is granted is supported by the docked assistant. A plant that is not the
budget owner carries decision 0034's **"Budget not loaded for this plant"** state, which is a
normal, expected answer and must never be presented as a stale or missing batch. An
`unmapped-GL` line is **provisional**, not an approved mapping path, and the explanation says so
rather than implying the master blesses it.

## Acceptance criteria

- **C1** The statement response carries a server-issued **attested context** - an additive field
  on the shipped contract, whose existing consumers and leaves are re-proven - binding scope,
  outline, pins, master version, user/session and expiry. The docked assistant returns it with the
  question plus the focused node; `/ask` sends none of it, does not render grounded turns, and its
  shipped leaves pass **unmodified**.
- **C2** The server re-derives department and function from the master's selection for that plant
  and validates the plant against the user's current grants on every ask. Client-supplied
  department and function are verified context, never authority: a mismatch with the master's
  selection is a **typed refusal**, not a silent substitution and not an ordinary "no mapping"
  answer. A plant outside the user's grants is refused, never answered.
- **C3** Intent is a closed enum - `composition`, `causal`, `data` - with stated precedence: a
  question carrying both a composition and a causal cue resolves to `causal`. With a node focused,
  a `composition` question is answered with the explanation, NOT with `classifyCausalQuestion`'s
  "Causal analysis is not configured". Without grounding that guard fires exactly as today.
- **C4** A `causal` question is still declined even when grounded and focused, and a `data`
  question is answered by the existing ungrounded path with no pin or budget promise attached.
  Leaves assert all three arms and the mixed-wording precedence.
- **C5** The subject is the clicked node, identified by `nodeKey` **and block**. With no node
  focused the assistant asks for the line; digits in the question never choose a node. Focus
  clears when the scope, block or pinned batches change.
- **C6** A **leaf** answer names the roll-up path - the GL codes and cost centres the master folds
  into that leaf, and the bucket they arrive through - and lists transactions with an exact
  footer and the true total count, showing the first **20** rows inline and offering a declared
  control that opens the shipped drill panel on that node for the rest. The footer is asserted in
  **paise against the statement payload**, and may differ from the rupee-rounded cell by up to ₹1
  exactly as the shipped drill contract allows.
- **C7** A **total or subtotal** is explained as a **client projection of the attested statement
  payload** per decision 0024, naming the descendant lines **with their values** plus their
  approved mapping metadata. Structure comes from the pinned outline snapshot, not the mapping
  master. No raw rows, no warehouse query, and therefore no governed-read audit. A labels-only
  answer does not satisfy this criterion.
- **C8** Budget is never a valid subject, matching the shipped statement footnote.
- **C9** No **server-sourced** transaction row, amount, batch identifier, measure value or result
  row is ever sent to the model; a leaf asserts the PROVIDER PAYLOAD, not the rendered answer. The
  user's own question and prior-turn text may contain figures - the motivating question does - so
  the rule binds what the server read, not what the user typed.
- **C10** A **leaf** explanation writes the drill's governed-read protections, not the ordinary
  chat audit: inputs re-derived server-side, pins validated, current scope applied, the exact
  predicate audited **before** the query runs, and a failed audit returning a safe typed refusal
  without ever querying. Per decisions 0017, 0022 and 0025. Aggregates run no query and carry no
  governed-read audit.
- **C11** Staleness follows decision 0025: a **replaced but existing** batch is read and reported
  as replaced; only a **gone** batch is refused. Both are **typed**, naming source, period and
  batch status, and reach the user intact rather than flattened by the global error envelope.
- **C12** A **leaf** explanation's audit record names the mapping-master version it resolved
  against. Attribution only - no detection promise - and D-0038 stays open.
- **C12a** The explanation is an in-band **typed response union** on the existing chat transport
  with a variant per outcome: focus-required, leaf, aggregate, replaced, gone, and safe
  audit-failure. The stale detail reaches the user intact rather than through the global filter.
- **C13** Every grounded explanation carries a distinct `budgetState: not-loaded` when the plant
  is not the budget owner (decision 0034), distinct from a replaced or gone batch. Budget stays
  non-focusable with no composition answer, while the outline's budget pin is still attested and
  validated. An unmapped-GL line is described as provisional, not as an approved mapping.
- **C14** Every criterion is proven by hermetic tests judged by the discriminator for its own
  runner: **frontend** leaves by the vitest discriminator - present AND NOT skipped AND NOT failed
  (D-0031) - and **backend** leaves by the Node/JUnit discriminator, where a non-matching name
  yields a testcase named for the FILE PATH (D-0024). A vitest-only criterion could not prove the
  security, audit, provider-payload and tamper guarantees at all, because those are backend
  leaves. The matrix: no focus / composition /
  causal / ordinary data question; leaf / subtotal / grand total / unmapped; selected-period
  block / FY-YTD block; replaced-but-present batch versus gone batch, for actual and for budget;
  plant outside grants; department or function disagreeing with the master's selection; an
  INVALID, EXPIRED or OTHER-USER attested context, and a node or block absent from the attested
  outline, each refused rather than answered; the intent fixture table including mixed wording
  where the causal cue wins; audit failure returning the safe refusal without querying; provider
  payload exclusion; `/ask` neither sending grounding nor rendering a grounded turn; and
  paise-exact footing against the statement payload with the true total count.
