---
slug: ask-measure-comparison-filter
title: Ask filters by a comparison between measures
status: draft
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
    a decimal string in whole rupees with at most two decimals (the same fixed-scale string every
    money value already uses; never a float).
- Existing `filters` keep their shape and meaning; the two lists are independent and both may be
  present. Saved queries, pins and the persisted turn type accept the new field; a stored selection
  without it is unchanged.

### What may be compared
- Only measures whose `format` is `money` are comparable, on either side. The `%` measures in both
  domains are `CASE` expressions that yield text labels (`over-budget`, `credit / negative actual`)
  and are **not** comparable: a filter naming them is a typed refusal
  (`selectionMeasureNotComparable`), never a silent drop. "Over 100% of budget" therefore means
  `Actual gt Budget`, and the selector prompt says so.
- Both operands must be measures of the selection's domain and within the user's measure
  permissions, exactly as `measureIds` are checked today (`selectionValidation.ts:15`). A measure
  outside either is refused with the existing "not available" path.
- Comparing a measure with itself is refused as malformed.

### How it runs
- The SQL builder compiles each measure filter to a `HAVING` clause over the measures' **verified
  expressions**, in both domains: the grouped governed-financial query and the statement projection
  (`buildStatementProjection`). The comparison is `<left expr> <op> <right expr | literal>`, the
  literal quoted through the builder's existing `lit`. A selection with no dimensions still works:
  the single aggregate row is kept or dropped by the comparison, which answers "is actual over
  budget this month" with one row or none.
- Operand measures **not already in `measureIds` are added by the server**, deterministically and
  before validation, so the answer always shows the columns it was filtered on. The addition is
  visible in the returned selection and its chips; it is never hidden.
- `totals` are computed over the **rows that pass the filter**: the ungrouped totals query wraps the
  grouped query (without its `LIMIT`) as a derived table, so the total of "over-budget lines" is the
  total of those lines, not of the whole domain. The SQL validator's object allowlist still holds
  because the derived table reads only the approved objects.
- The deterministic SQL validator (`sqlValidator.ts`) accepts the `HAVING` clause and the derived
  totals query without any new bypass: single `SELECT`, no `*`, approved objects only, bounded
  `LIMIT`. A leaf proves a `HAVING` that references an unapproved column or object is still refused.
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
- `AskResponse` gains an additive `appliedMeasureFilters` next to `appliedFilters`, so the field
  editor can show them; editing them in the editor is out of scope, they display read-only.
- `viewInReport` is **unavailable** for an answer carrying a measure filter, with the reason "The
  MIS statement shows every line; open it and read the % column", because the statement has no
  row filter and a link would silently drop the condition.
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
  compareTo: measure|value }`; `filters` is unchanged; the saved-query zod schema, the persisted turn
  type and the Swagger DTOs accept it; every shipped leaf that builds or stores a selection passes
  unmodified.
- **C2** Validation refuses, with typed reasons, a filter whose operand is not a money measure of the
  selection's domain, is outside the user's measure permissions, compares a measure with itself, or
  carries a non-decimal value. `%` measures are refused as not comparable.
- **C3** The builder compiles each measure filter to `HAVING` over the verified expressions in both
  the governed-financial query and the statement projection; leaves assert the emitted SQL for
  measure-vs-measure, measure-vs-value, an ungrouped selection, and the combination with a dimension
  filter and a time window.
- **C4** Operand measures missing from `measureIds` are added by the server before validation and
  appear in the returned selection and chips.
- **C5** `totals` are computed over the filtered rows via a derived table; a leaf asserts the totals
  equal the sum of the returned rows on a fixture where an unfiltered total would differ.
- **C6** The SQL validator accepts the new shapes and still refuses an unapproved object or column
  inside `HAVING` or the derived table; the mandatory bounded `LIMIT` check still fires.
- **C7** The selector tool schema enumerates only comparable measure ids in `measureFilters`; the
  system prompt carries the mapping rules (over/under budget, over 100%, lakh/crore); the parser
  rejects malformed entries with a typed reason. Leaves assert schema, prompt text and parser
  behaviour against recorded provider outputs.
- **C8** Chips, saved-selection labels and the provenance readback render the comparison in words
  with registered labels and Indian digit grouping; `appliedMeasureFilters` is returned; selection
  identity includes the filter.
- **C9** `viewInReport` is unavailable with the stated reason when a measure filter is present.
- **C10** Functional check, live against Bedrock and the July warehouse: "show me list items where
  Actuals are more than the budget" returns only lines with Actual above Budget and no others, with
  the chip `Actual > Budget`; "which GL codes spent more than 5 lakh in July 2026" returns only lines
  above ₹5,00,000; "GL codes over 100% of budget" returns the same lines as the first question; the
  three answers reconcile against the statement's `%` column for DUB.

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
- Decisions 0004 (governed joins, code-authored measures), 0011 (review), 0037, 0038.
