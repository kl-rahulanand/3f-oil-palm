---
status: accepted
confirmed_by: "Rahul Anand"
date: 2026-09-17
stories: [ask-measure-filter]
---

# Ask compares measures through a HAVING over verified expressions; only money measures compare, operands are made visible, totals follow the filter

## Context
During the 2026-09-16 demo, "show me list items where Actuals are more than the budget" came back
as every GL code with the verified badge. The selection contract can only compare a dimension to a
value (`SelectionFilter`, `eq | in | neq`), so the condition had nowhere to live; the model
emitted the nearest expressible selection and nothing downstream noticed the omission. Decision
0004 fixed the rule that measures are code-authored SQL expressions the model selects but never
writes. Any fix must keep the model away from SQL while letting it express "Actual greater than
Budget" and "Actual greater than ₹5,00,000".

Three shapes were weighed:
1. a post-filter in the executor over the returned rows (cheap, but wrong under `LIMIT`: rows
   dropped by the filter would have been ranked before the cutoff, so a page could come back
   short or empty while matching rows exist beyond it);
2. a heuristic that scans the question for comparison words and refuses (honest, but it answers
   nothing and would fire on questions the vocabulary can answer);
3. a typed comparison in the selection compiled to `HAVING` over the verified measure
   expressions (the database applies the condition before ranking and limiting; the model still
   only names measure ids).

## Decision
The selection contract gains an additive optional `measureFilters` list, each entry comparing a
measure with another measure of the same domain or with a fixed-scale decimal value using
`gt | gte | lt | lte`. The SQL builder compiles each entry to a `HAVING` clause over the operands'
**verified expressions**, in both the governed-financial query and the statement projection.

Six rules bound it:
- **Only `money` measures compare, as amounts.** The `%` measures are text `CASE` expressions
  carrying the nil-rule labels and are refused as not comparable; "over budget" and "over 100% of
  budget" are both expressed as `Actual gt Budget`. That agrees with the `%` column and its
  `over-budget` label whenever Budget is zero or positive, which is every budget the client has
  supplied; a negative budget is compared on amounts and the spec says so rather than claiming
  the two always reconcile (human ruling, 2026-09-17 spec grill).
- **Operands are made visible.** A measure named by a filter but absent from `measureIds` is added
  by the server before validation, so the answer always shows the columns it was filtered on and
  the chips say so.
- **Totals follow the filter.** The ungrouped totals query wraps the grouped, filtered query
  (without its `LIMIT`) as a derived table, so the total of "over-budget lines" is the total of
  every matching line, including those beyond the visible page.
- **Operands count for authorization.** Validation, saved and pinned runnable status, and the
  pin definition-version hash all cover the union of displayed and operand measures.
- **The statement projection honours filters too.** Alongside the `HAVING`, the projection now
  applies dimension filters (`leaf_key`), closing a pre-existing gap where they were silently
  dropped (human ruling, 2026-09-17 spec grill: fix here, not defer).
- **A condition that cannot be expressed is refused, never dropped.** The selector prompt maps the
  budget phrasings and Indian magnitudes onto the shape and sends anything else to
  `mark_unsupported`; the parser and validator refuse malformed or non-comparable entries with
  typed reasons.

## Consequences
- The deterministic SQL validator must accept a `HAVING` clause and a derived table without any
  new bypass; the object allowlist, no-`*`, and bounded-`LIMIT` checks keep firing.
- Saved queries, pins and the persisted turn accept the new field; selection identity includes it,
  so two selections differing only by the comparison are distinct.
- `viewInReport` is unavailable for a filtered answer, because the statement has no row filter and
  a link would silently drop the condition.
- Editing the comparison in the field editor, comparisons on `%` or on dimension values, and a
  `variance` measure are deferred with triggers.
- The heuristic word-scan (shape 2) is not built; the functional check proves the demo phrasings
  live instead.
