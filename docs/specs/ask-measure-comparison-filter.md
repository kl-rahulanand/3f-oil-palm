---
slug: ask-measure-comparison-filter
title: Ask filters by a comparison between measures
status: confirmed
saved: 2026-09-17T10:56:38+00:00
---

# Ask filters by a comparison between measures

## Why

On 2026-09-16, during the client demo, the human asked Ask "show me list items where Actuals are
more than the budget" and got a wrong answer. Reproduced locally against Bedrock on 2026-09-17:
the selector emitted `Actual` and `Budget` by GL code with `filters: []`, the executor ran it, and
the answer listed all 67 July GL codes with the verified badge, under-budget lines included
(GL 50001202 at ₹2,80,908 against ₹5,00,000). Every number was right; the list was not the list
asked for, and nothing said so.

The cause is structural, not a model slip. `SelectionFilter` (`contract/src/measure.ts:160`) is
the only filter shape and it compares a **dimension** to a value (`eq | in | neq`). There is no
way to say "one measure greater than another measure" or "a measure above a number", so the
selector's tool schema (`backend/src/llm/bedrock.provider.ts:88`) cannot carry the condition, the
SQL builder (`backend/src/sql/sqlBuilder.ts:93`) cannot compile it, and the model's only honest
options are `request_clarification` or `mark_unsupported`, which it did not take. The question is
the most natural one a finance reader asks of a budget-versus-actual table, and the screen already
answers it through the `%` column and its `over-budget` label.

This capability adds the missing filter shape end to end: contract, selector schema and prompt,
semantic validation, SQL, provenance readback, saved and pinned selections, and the chips a reader
sees. It does not touch `/ask`'s routing, grounding, or the statement screen.

## Users

Finance and management at 3F asking Ask "which lines are over budget", "which GL codes spent more
than ₹5 lakh", "where is actual below budget"; the demo audience; Srihari checking the same answer
against the `%` column of the statement.

## Behaviour

### The filter shape
- `Selection` gains an **additive, optional** `measureFilters` list. Each entry compares one
  measure of the selection's domain with either **another measure of the same domain** or a
  **number**:
  - `measureId`: the left operand, a measure id of the domain;
  - `op`: one of `gt`, `gte`, `lt`, `lte`;
  - `compareTo`: `{ kind: "measure", measureId }` or `{ kind: "value", value }`, where `value` is
    a rupee amount as a decimal string matching `^-?\d+(\.\d{1,2})?$` (so `500000`, `500000.5`
    and `-1200.00` are accepted; `5 lakh`, `₹5,00,000`, `1e5` and leading `+` are not). The
    server normalises an accepted value to the shipped `FixedScaleMoney` form with exactly two
    decimals before it is validated, stored, compared or echoed, so `500000` and `500000.00` are
    one value. Never a float.
- Several entries are combined with **AND**. Two entries that normalise to the same
  `(measureId, op, compareTo)` are a malformed selection, refused with a typed reason. Entries
  keep the order they were emitted in; that order is part of selection identity.
- Existing `filters` keep their shape and meaning; the two lists are independent and both may be
  present. Saved queries, pins, the persisted turn type and the conversation answer snapshot accept
  the new field; a stored selection without it is unchanged.

### What may be compared
- Only measures whose `format` is `money` are comparable, on either side, and they compare **as
  amounts**. The `%` measures in both domains are `CASE` expressions that yield text labels
  (`over-budget`, `credit / negative actual`) and are **not** comparable: a filter naming them is a
  typed refusal (`selectionMeasureNotComparable`), never a silent drop. "Over budget" and "over
  100% of budget" both mean `Actual gt Budget`, and the selector prompt says so. The two readings
  agree with the `%` column whenever Budget is zero or positive, which is every budget the client
  has supplied; for a **negative** budget the comparison is on amounts (Budget −100, Actual −150 is
  not over budget even though the column reads 150%), and the spec claims no reconciliation there
  (human ruling, 2026-09-17).
- Both operands must be measures of the selection's domain and within the user's measure
  permissions. Every check that today reads `measureIds` reads the **union of `measureIds` and the
  operand measures**: `validateSelectionForUser` (`selectionValidation.ts:15`), the executor's
  `authorize`, the saved-query and pin runnable status (`saved.service.ts:114`,
  `pins.service.ts:256`) and the pin definition-version hash. A measure outside the domain or the
  permissions is refused with the existing "not available" path; a persisted selection whose
  operand is no longer registered or permitted reports not runnable, exactly as a displayed measure
  would.
- Comparing a measure with itself is refused as malformed.

### How it runs
- The SQL builder compiles each measure filter to a `HAVING` clause over the measures' **verified
  expressions**, in both domains: the grouped governed-financial query and the statement projection
  (`buildStatementProjection`). The comparison is `<left expr> <op> <right expr | literal>`, the
  literal quoted through the builder's existing `lit`. A selection with no dimensions still works:
  the single aggregate row is kept or dropped by the comparison, which answers "is actual over
  budget this month" with one row or none. An answer with zero rows is a **successful, empty**
  answer ("No lines match Actual > Budget for July 2026"), never an error and never a refusal.
- The statement projection also applies the selection's **dimension filters** (`leaf_key`) as
  `WHERE` predicates on the relation. Today it silently drops them (`sqlBuilder.ts:203` never reads
  `selection.filters`); that pre-existing gap is closed in this story (human ruling, 2026-09-17:
  fix here, not defer), with a leaf proving a `leaf_key` filter narrows the projected rows and the
  golden statement proofs unchanged.
- Operand measures **not already in `measureIds` are appended by the server**, in the order of
  their first appearance in `measureFilters`, deterministically and before validation, so the
  answer always shows the columns it was filtered on. The addition is visible in the returned
  selection and its chips; it is never hidden. The first entry of `measureIds` is unchanged by the
  append, so result ordering (largest first by the first measure) is unchanged.
- `totals` are computed over **every group that passes the filter, not only the visible page**:
  the ungrouped totals query wraps the grouped, filtered query **without its `LIMIT`** as a derived
  table, so the total of "over-budget lines" is the total of all such lines even when more match
  than the page shows. The object allowlist still holds because the derived table reads only the
  approved objects.
- The deterministic SQL validator (`sqlValidator.ts`) accepts the `HAVING` clause and the derived
  totals query without any new bypass, and every existing check keeps firing: single `SELECT`, no
  `*`, approved objects only, blocked columns refused wherever they appear (a `HAVING` or a derived
  table included), bounded `LIMIT`. The validator has an object allowlist and a blocked-column
  list, not a general column allowlist; this story does not add one.
- Row ordering is unchanged (largest first by the first measure).

### What the model is told
- The selector tool schema gains `measureFilters` with the shape above; `measureId` enumerates the
  comparable measure ids only, so the model cannot name `%`.
- The system prompt states: a comparison between two metrics, or a metric against a threshold, goes
  in `measureFilters`, never in `filters`; "over budget" / "above budget" / "more than budget" is
  `Actual gt Budget`; "under budget" is `Actual lt Budget`; "over 100% of budget" is `Actual gt
  Budget`; Indian magnitudes are converted to plain numbers (`5 lakh` → `500000`, `1.2 crore` →
  `12000000`); a comparison the vocabulary cannot express is `mark_unsupported`, never an
  unfiltered answer.
- The provider's parser rejects a malformed `measureFilters` entry with a typed reason, the same
  way `filters` are rejected today.

### What the reader sees
- The answer's chips and the saved-selection label render each measure filter in words:
  `Actual > Budget`, `Actual > ₹5,00,000`, using the registered measure labels and the Indian
  digit grouping for values. Unregistered ids render as `(unavailable)` like today.
- The provenance readback names the condition: "... where Actual is greater than Budget".
- `AskResponse` gains an additive `appliedMeasureFilters` next to `appliedFilters`, and the
  conversation answer snapshot (`ConversationAnswerSnapshot`, written by
  `conversations.service.ts:294`) carries it too, so the field editor shows the comparison both on
  a fresh answer and after a conversation is reopened. Editing it in the editor is out of scope; it
  displays read-only.
- `viewInReport` is **unavailable** for an answer carrying a measure filter, with the reason "The
  MIS statement shows every line; open it and read the % column", because the statement has no
  row filter and a link would silently drop the condition.
- **Report grounding preserves the comparison.** When a question is answered against a pinned or
  saved report, `applyReportGroundingToSelection` (`chat.service.ts:638`) rebuilds the selection
  from the report's measures, dimensions and filters; it must carry the question's
  `measureFilters` through unchanged (the report itself carries none unless it was saved with
  them, in which case the report's are kept and the question's appended). A leaf proves a grounded
  "which are over budget" never returns the unfiltered report with the verified badge, which is
  the original failure mode.
- Reopening a saved or pinned selection that carries a measure filter re-runs it with the filter;
  selection identity (`selection-identity.helper.ts`) includes `measureFilters`, so two selections
  differing only in the comparison are distinct.
- Help's "what you can ask" lists comparison examples beside the dimension filter examples.

### What does not change
- `/ask` routing, grounding, period control, the causal guard, the docked explanation and the
  statement screen are untouched. A user granted every plant still gets "not supported" for a
  statement-domain question (decisions 0037, 0038); this capability changes what a **permitted**
  selection can express, not who may ask what.
- Dimension filters, time windows, limits and the `%` measure's nil rule keep their shipped
  semantics; the `over-budget` label and `Actual gt Budget` agree by construction.

## Rules
- A condition the vocabulary cannot express is refused or clarified; it is never dropped. The
  verified badge may only sit on an answer whose selection carries every condition it ran with.
- Comparisons compile only from verified measure expressions; the model never authors SQL and never
  names a column.
- Money values cross the contract as fixed-scale decimal strings, never floats.

## Out of scope (now)
- Editing measure filters in the field editor (display only here).
- Comparisons on `%` or on dimension values (`gl_code > 5000`).
- Sorting by a comparison or by variance; a separate "variance" measure.
- Statement-domain clarifications for multi-plant users (0037/0038 stand).
- A heuristic guard that scans question wording for comparison words; the schema and prompt carry
  the condition, and the functional check proves the two demo phrasings.

## Acceptance criteria

- **C1** `Selection.measureFilters` is an additive optional list of `{ measureId, op: gt|gte|lt|lte,
  compareTo: measure|value }`, combined with AND, order-preserving; `filters` is unchanged; the
  saved-query zod schema, the persisted turn type, the conversation answer snapshot and the Swagger
  DTOs accept it; every shipped leaf that builds or stores a selection passes unmodified.
- **C2** Validation refuses, with typed reasons, a filter whose operand is not a money measure of the
  selection's domain, is outside the user's measure permissions, compares a measure with itself,
  duplicates another entry, or carries a value outside `^-?\d+(\.\d{1,2})?$`; accepted values are
  normalised to two decimals. `%` measures are refused as not comparable. Every check that reads
  `measureIds` (validation, executor authorization, saved and pin runnable status, pin
  definition-version hash) reads the union with the operand measures, proven by leaves.
- **C3** The builder compiles each measure filter to `HAVING` over the verified expressions in both
  the governed-financial query and the statement projection, and the statement projection now also
  applies dimension filters as `WHERE` predicates; leaves assert the emitted SQL for
  measure-vs-measure, measure-vs-value, an ungrouped selection, the combination with a dimension
  filter and a time window, and a `leaf_key` filter on the projection, with the golden statement
  proofs unchanged.
- **C4** Operand measures missing from `measureIds` are appended by the server, in first-appearance
  order, before validation, and appear in the returned selection and chips; the first measure and
  therefore the row ordering are unchanged.
- **C5** `totals` are computed over every matching group via a derived table without the inner
  `LIMIT`; a leaf asserts, on a fixture with more matching groups than the limit, that the totals
  cover the groups beyond the visible page and differ from the unfiltered total.
- **C6** The SQL validator accepts the new shapes and every existing check still fires: a `HAVING`
  or derived table that references an unapproved object or a blocked column is refused, and the
  mandatory bounded `LIMIT` check still fires. An answer whose `HAVING` drops every row is a
  successful empty answer with the stated wording.
- **C7** The selector tool schema enumerates only comparable measure ids in `measureFilters`; the
  system prompt carries the mapping rules (over/under budget, over 100%, lakh/crore); the parser
  rejects malformed entries with a typed reason. Leaves assert schema, prompt text and parser
  behaviour against recorded provider outputs.
- **C8** Chips, saved-selection labels and the provenance readback render the comparison in words
  with registered labels and Indian digit grouping; `appliedMeasureFilters` is returned; selection
  identity includes the filter.
- **C9** `viewInReport` is unavailable with the stated reason when a measure filter is present, and
  report grounding carries the question's `measureFilters` through; a leaf proves a grounded
  over-budget question never returns the unfiltered report.
- **C10** Functional check, live against Bedrock and the July warehouse: "show me list items where
  Actuals are more than the budget" returns only lines with Actual above Budget and no others, with
  the chip `Actual > Budget`; "which GL codes spent more than 5 lakh in July 2026" returns only lines
  above ₹5,00,000; "GL codes over 100% of budget" returns the same lines as the first question; for
  DUB the first answer's lines are exactly the statement rows whose `%` is above 100 or reads
  `over-budget`, every July budget being zero or positive.

## Open items (non-blocking)
- Whether the field editor should let a reader change the threshold in place (a later story).
- Whether a `variance` measure (Actual − Budget) should join the vocabulary so "biggest overruns"
  sorts by it.

## Source
- Demo question and local reproduction, 2026-09-16/17 (`audit_events` holds no local record; the
  question was asked on the EC2 demo box; reproduction returned 67 unfiltered rows).
- `contract/src/measure.ts`, `backend/src/llm/bedrock.provider.ts`, `backend/src/llm/llm.constants.ts`,
  `backend/src/sql/sqlBuilder.ts`, `backend/src/sql/sqlValidator.ts`,
  `backend/src/semantic/selectionValidation.ts`, `backend/src/chat/chat.service.ts`,
  `backend/src/saved/saved.schemas.ts`, `frontend/src/features/exploration/selection-label.ts`.
- Decisions 0004 (governed joins, code-authored measures), 0037, 0038, and 0039 (this capability's
  comparison rules).
- Spec grill cold read, 2026-09-17: ten findings, eight settled from the repository (grounding,
  operand authorization, totals beyond the page, literal grammar, snapshot field, validator scope,
  AND semantics and order, the 0011 citation), two put to the human (signed budgets compare as
  amounts; the statement projection's dropped dimension filters are fixed here).
