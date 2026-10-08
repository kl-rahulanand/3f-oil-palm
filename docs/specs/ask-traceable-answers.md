---
slug: ask-traceable-answers
title: Complete Ask questions stay complete and every live Actual is traceable
status: draft
saved: 2026-10-08T08:32:54+00:00
---

# Complete Ask questions stay complete and every live Actual is traceable

## Why

The client needs confidence that every number shown by Ask is both the number requested and the
number in the supplied financial data. In the live app, the complete question:

> Show Actual and Budget by month for DUB April 2026 to August 2026.

was reduced to April and carried an unstated Actual-over-Budget comparison. The resulting empty
answer was valid for the generated selection but not for the words the user entered. Current Ask
transaction links also cover only GL-code and statement-leaf rows, so monthly trend values and
totals cannot be checked against the SAP lines that produced them.

## Users

Finance and management asking governed financial questions and checking the answer against the
client's SAP and Budget workbooks during the demo.

## Behaviour

### Complete questions override conversation history

- Prior turns are supplied to the selector only when the current question begins with `and`,
  `also`, `now`, `then`, `what about` or `how about`, or contains one of the referential terms
  `these`, `those`, `them`, `same plant`, `same period`, `that result` or `those results`. The
  leading and referential signals are case-insensitive whole tokens; multiword signals require the
  complete phrase with only whitespace between its words. Substrings such as `theme` do not match
  `them`. `above`, `previous` and other ordinary financial words are never follow-up signals. These
  are the complete, deterministic follow-up signals; a question with none is selected without
  prior turns and therefore starts a new selection.
- A referential follow-up starts from the most recent successful prior selection only. It may
  inherit only a slot the current question does not state. An explicit plant replaces the plant
  filter; an explicit period replaces the time window; `now by X` replaces the dimensions while
  `and by X` adds X; explicitly named measures replace the displayed measures; and an explicit
  amount or comparison replaces the corresponding measure filter.
- If a question uses one of those follow-up signals but the conversation has no successful prior
  selection, Ask returns `ClarificationNeeded` with `interpretationIssue.reason` set to
  `follow-up-context-missing` and says "I don't have a previous successful answer to apply this
  to. Please restate the full question." The turn-entry audit occurs, but the selector, SQL,
  provenance and drill paths do not run and the response carries no result.
- In both a new question and a follow-up, `Actual and Budget` with no comparison words means a
  side-by-side answer and clears inherited Actual-versus-Budget filters, fixed-amount filters and
  limit. A question without a follow-up signal inherits no dimension filter, measure filter,
  period or limit, even if those fields were present in an earlier turn.
- The same complete question produces the same governed selection in a fresh conversation and
  after an unrelated or over-budget turn.

### Critical facts are reconciled before execution

- Bedrock continues to select from the governed vocabulary and never writes SQL.
- One server-side reconciliation step checks only facts that can be read deterministically from
  the current question: complete month endpoints, requested Actual/Budget measures, a named plant,
  "by month", and explicit comparison wording.
- For each checked fact, the current question is authoritative over a conflicting selector result:
  the server replaces an April-only window with both stated endpoints, replaces the selected plant
  with the explicitly named governed plant, replaces the displayed measures with the explicitly
  requested Actual/Budget set, replaces dimensions with exactly `[month]` for a bare `by month`,
  and adds, replaces or clears the comparison according to the current words. Other grouping
  wording stays with the governed selector. The server then runs ordinary
  catalog and grant validation on the reconciled selection. This correction is deterministic and
  does not call the selector again; if the words cannot produce one governed value, the typed
  clarification rules apply and nothing executes.
- Supported ranges include compact and spaced month-years (`Apr2026`, `Apr 2026`, `April 2026`),
  a dash or `to`, a shared year (`Apr-Aug 2026`) and ranges crossing a year boundary.
- A shared year applies to both endpoints. Therefore `Nov-Feb 2026` is reversed and receives the
  `period-reversed` clarification; a cross-year range must state both years, for example
  `Nov 2025 to Feb 2026`.
- Two stated endpoints remain two endpoints. Period parsing produces one of five stable typed
  issues before any data read:
  - `period-incomplete`: a connector such as `to` has no second endpoint; clarification says
    "The period after 'to' is missing. Which end month should I use?"
  - `period-malformed`: an endpoint is not a real month and year; clarification says "I couldn't
    understand that period. Use a month and year, for example April 2026 to August 2026."
  - `period-reversed`: the start is after the end; clarification says "The start month is after
    the end month. Which period should I use?"
  - `period-multiple`: more than one range is present; clarification says "I found more than one
    period range. Which one should I use?"
  - `period-domain-unsupported`: the selected domain permits only one offered month; the existing
    typed `periodChoice` says "Choose one month for this statement." It carries the reconciled base
    selection, the original question and only offered complete windows, and choosing one posts that
    selection with zero selector calls exactly as `ask-period-control.md` requires.
  When more than one issue applies, exactly one is returned using this precedence:
  `period-multiple`, `period-incomplete`, `period-malformed`, `period-reversed`, then
  `period-domain-unsupported`.
  Each is a `ClarificationNeeded` response carrying `interpretationIssue.reason`; it carries no
  result, SQL, provenance or drill metadata. The turn-entry audit still occurs.
- A measure comparison is kept or added only when the current question explicitly asks for one
  (for example over/under Budget, exceeds, greater/less than, or a comparison symbol), or a clearly
  referential follow-up inherits it. "Actual and Budget" means show both and does not mean Actual
  greater than Budget.
- A fixed comparison amount in the current question is parsed deterministically from a signed
  decimal with optional `₹`, `Rs` or `INR`. After removing that prefix, an amount is either
  ungrouped digits, Western grouping `\d{1,3}(,\d{3})+`, or Indian grouping
  `\d{1,2}(,\d{2})*,\d{3}`, with an optional decimal point followed by one or two digits. An
  optional `lakh`, `lac` or `crore` multiplier is accepted only on an ungrouped number. The parser
  multiplies with decimal arithmetic and converts exactly to the existing two-decimal fixed-scale
  string; it never rounds. Thus `and Actual above ₹5 lakh` replaces an inherited
  `Actual > ₹1,00,000` filter with `Actual > 500000.00`. Western `₹500,000` and Indian
  `₹5,00,000` are the same amount; malformed grouping such as `₹5,000,00`, more than two decimal
  places such as `₹1.234` are malformed. A comparison whose amount is present but malformed returns
  `ClarificationNeeded` with `interpretationIssue.reason` `comparison-amount-malformed`, says
  "I couldn't understand that comparison amount. Use a number such as ₹5 lakh or ₹5,00,000.",
  and performs no selector, SQL, provenance or drill work after the turn-entry audit.
- The reconciliation step does not become a second general natural-language parser. Language not
  covered by these safety rules stays with the governed selector; an irreconcilable conflict asks
  one question instead of executing.
- The existing answer readback shows the applied measures, plant scope, exact period, grouping and
  comparison. No second interpretation component is added.

### Every eligible live Actual is traceable

- In `governed-financial`, the supported row dimension sets are exactly `[gl_code]`, `[month]`,
  `[plant]`, `[gl_code, month]`, `[gl_code, plant]`, `[month, plant]` and
  `[gl_code, month, plant]`, independent of their order in the selection. Their canonical row key
  is the existing `askRowKey` order `gl_code|month|plant`. A GL coordinate constrains
  `txn.gl_code`, a month coordinate narrows the row predicate to that complete calendar month, and
  a plant coordinate narrows the executed effective plant set to that plant.
- In `mis-statement`, the supported sets stay exactly `[leaf_key]` and `[leaf_key, plant]`, with
  the existing `askRowKey` order `leaf_key|plant`; the pinned outline and resolved
  `(plant, cost centre, GL)` triples produce the raw predicate. Month is not a statement row
  dimension. No other dimension set receives drill metadata.
- A single ungrouped Actual KPI and an Actual total are distinct drill targets, separate from row
  metadata. `AskDrillMetadata.total` carries label `Actual total`, key `__actual_total__`, its own
  signed context and `drillable`; the reserved key is never accepted as a row key.
- The drill transport replaces the ambiguous `rowKey` request/response field with a required
  `target` discriminated union: `{ kind: "row", key: string }` or `{ kind: "total" }`. A row click
  sends its row context and row target; a KPI or total click sends its own context and the total
  target. The success response echoes the same target alongside the existing page, rows, footer
  and batch status. `__actual_total__` remains only the metadata identity used by the renderer and
  signed claims; submitting it as `{ kind: "row", key: "__actual_total__" }` is refused as
  `drill-target-unknown` before a warehouse read.
- The exported `buildAskDrillTargetPredicate` is the sole owner of selection/row-to-raw-line
  translation. Its input is the executed selection, effective plants, applied window, complete
  actual pins, optional result row and optional resolved statement triples; its output is one
  `DrillPredicate` or a typed inert reason. Row issuance, total issuance, summaries and click-time
  re-derivation all call it. `buildDrillPredicate` remains the sole `DrillPredicate`-to-SQL owner.
  Neither owner reads the natural-language question.
- `AtomicDrillPredicate` has exactly two variants over the common fields `actualBatchIds`, `plants`,
  `from` and `to`: `{ mode: "slice", filters: SelectionFilter[] }` for governed-financial, where
  filters are restricted to `gl_code` and `month` and may be empty; and
  `{ mode: "triples", triples: Array<{ plant, costCenter, glCode }> }` for statement leaves. The
  existing `gl-and-plants` predicate migrates to `slice`. A GL row adds a GL filter, a month row
  narrows `from`/`to`, a plant row narrows `plants`, and month-only, plant-only, month-plus-plant
  and ungrouped KPI targets therefore need no invented GL or triples field.
  `DrillPredicate` adds `{ mode: "union", members: AtomicDrillPredicate[] }`. Union members are
  canonicalized by sorting and de-duplicating batch ids, plants, filters and triples, then sorting
  and de-duplicating the members by that canonical representation. Empty unions are false. The SQL
  owner compiles a non-empty union as one parenthesized `OR` of complete atomic predicates; each
  member retains its pins, plants and range, so no common scope is inferred accidentally.
- An unfiltered total uses one broad predicate over the executed scope. A measure-filtered total
  is the union of every grouped row that contributed to the existing all-filtered-rows total,
  including matching rows beyond the display `LIMIT`. The selection executor obtains those group
  coordinates by reusing the same filtered inner query without its display limit; it does not
  reconstruct the `HAVING` rule. Rankings and top-N semantics are not added by this capability.
- A filtered total's signed union may disclose authorized group coordinates beyond the display
  limit, because they are required to reproduce the displayed all-filtered-groups total. It carries
  no hidden group amount, transaction row, name or memo. Those coordinates remain inside the signed
  context and never reach Bedrock. A proof decodes the context and asserts that only predicate
  coordinates, pins and the one displayed total amount are present.
- When an Actual-only answer has no time window, its drill range is derived from the contributing
  actual provenance pins: first day of the earliest pinned month through the last day of the latest
  pinned month. The predicate still restricts by the exact pinned batch ids, so a gap between months
  cannot pull in an unpinned month. A month row further narrows to its month and pin. No pins, an
  invalid pin period or more than the batch bound makes the affected targets inert.
- Every context binds the current user, exact Actual in paise, effective plants, complete time
  window, pinned actual batches and the row or total predicate. Context size and row count remain
  bounded by fixed rules: at most 100 displayed row targets, 100 total-union members, 24 monthly
  actual batch pins and 65,536 encoded characters per signed context. If the row context would
  exceed a bound, every row stays visible and all row Actuals are inert with reason
  `drill-context-too-large`; the independent total target may still be clickable. If only the
  total exceeds a bound, only the total is inert with that reason. A drill request whose decoded
  claims exceed a bound is refused before a transaction read.
- The HTTP request schema caps the encoded context at 65,536 characters before decoding. A request
  with 65,537 characters and otherwise valid row key and page is routed to the drill service's
  audited `drill-context-too-large` refusal without attempting signature verification or a
  warehouse read; it is not left to the generic request-validation response.
- Eligibility is established through the existing audited Ask read using an aggregate transaction
  summary. A value is clickable only when at least one feeding SAP line exists and all feeding
  lines sum to the displayed Actual in exact paise. An offsetting zero with feeding lines may be
  clickable; a zero with no lines is inert.
- Opening a drill reauthorizes the user's current domain, Actual-measure and complete plant access,
  writes the typed audit event before the read, reads only the pinned batches and returns fixed,
  stable pagination with an all-match footer equal to the clicked Actual.
- A retained replaced batch is read and identified as replaced. A missing batch, expired or
  altered context, revoked access, incomplete pin or non-footing result is refused with no rows.
- Every drill refusal uses a stable `details.reason` in the existing error envelope:
  `drill-context-missing`, `drill-context-altered`, `drill-context-expired`,
  `drill-context-too-large`, `drill-target-unknown`, `drill-access-revoked`,
  `drill-batch-incomplete`, `drill-batch-gone` or `drill-footer-mismatch`. The frontend maps that
  reason to its explanation; it never depends on the exception message replaced by the global
  exception filter.
- Only live Actual cells and the live Actual total are interactive. Budget, percentage, Roll-over,
  chart points and stored conversation snapshots are inert. A saved view or pin receives fresh
  links when it reruns.

### Demonstration

For "Show Actual and Budget by month for DUB April 2026 to August 2026", Ask selects
`governed-financial`, Actual and Budget, dimension `month`, plant DUB, 1 April through 31 August
2026, and no measure filter. It returns five monthly rows. Every monthly Actual opens only that
month's DUB SAP lines, and the Actual total opens the combined lines for the five displayed rows.
Each footer equals its displayed Actual in exact paise. Budget remains inert.

## Rules

- Numbers come only from governed warehouse rows; the model never authors SQL or figures.
- Existing RBAC, audit-before-read, batch pinning, exact-paise footing and pagination rules from
  `actuals-drill-down.md` and `ask-gl-names-and-transactions.md` continue to apply.
- The established period choice and period readback from `ask-period-control.md` remain intact.
- This capability supersedes only the Ask clauses in `ask-gl-names-and-transactions.md` that make
  totals and non-GL/non-leaf governed rows inert. It does not change aggregate behaviour on the MIS
  statement screen. Decision 0040's total remains the total of all filtered groups, including
  groups beyond the display limit; its drill covers that same set.
- No selector tool-schema or prompt change is made unless the backend guard cannot meet the
  behaviour; any such change requires before-and-after live probes in fresh conversations.

## Acceptance criteria

1. After an over-budget turn, the complete April-to-August trend question selects both measures,
   month, DUB, the full range and no comparison; the same question in a fresh conversation produces
   the same selection.
   Standalone questions using `above Budget` or `previous financial year` also receive no prior
   turns; each explicit comparison or period is interpreted from its own words. April-only,
   wrong-plant, wrong-measure, wrong-grouping and stale-comparison selector fixtures are corrected
   from the explicit current words before catalog validation and execution; the wrong-grouping
   fixture includes stale `gl_code` being removed from a bare `by month` request.
2. Compact, spaced, shared-year and cross-year ranges preserve both endpoints; malformed, reversed
   and domain-incompatible ranges never execute as a silently changed period. A shared-year range
   across December is reversed, while the same endpoints with both years stated is cross-year.
   Compound-invalid inputs return the single issue selected by the stated precedence.
3. Explicit over/under-budget questions keep the correct comparison, while side-by-side Actual and
   Budget questions never gain one. Referential follow-ups inherit only omitted slots. An explicit
   fixed comparison amount replaces an inherited amount exactly, and a malformed amount is
   clarified before the selector. A first-turn follow-up and a follow-up after only refused turns return the typed
   `follow-up-context-missing` clarification after the turn-entry audit and before the selector.
4. The existing readback shows the exact applied measures, plants, period, grouping and comparison,
   and every executed selection remains within the semantic catalog and the user's grants.
5. Live Actual values drill for every dimension set in the explicit matrix, and the canonical keys
   and raw predicates include exactly the row's GL, month and/or plant coordinates. Unsupported
   sets carry no drill metadata.
6. An ungrouped Actual KPI and a displayed Actual total use the distinct `__actual_total__` target.
   An unfiltered total covers its full executed scope; a comparison total covers every filtered
   group, including groups beyond the display limit. Budget, percentage, Roll-over, charts and
   stored answers remain inert.
7. Every clickable value has at least one feeding SAP line and its all-match footer equals the
   displayed Actual in exact paise, including negative values and an offsetting zero. No-line and
   mismatched values are inert.
   The existing signed-money bound applies identically to rows, an ungrouped KPI and the total:
   positive and negative `2^46 - 0.01` rupees remain eligible and sign exact paise, while positive
   and negative `2^46` rupees are inert and carry no signed amount.
8. The row, union, batch and encoded-context bounds have leaves at the value below, at and above
   each limit. Oversized issuance affects only the row set or total target described above; an
   oversized request fails closed. Tampered, expired, unauthorized, missing-batch and non-footing
   requests fail closed and are audited with the specified typed reason.
9. Replaced retained batches still foot to the displayed answer with a notice; deleted batches are
   refused. Saved views and pins obtain fresh links on rerun.
10. Named proofs cover: complete-after-over-budget and fresh-conversation parity; every accepted
    range spelling; incomplete, malformed, reversed, multiple and statement-incompatible ranges;
    each allowed and one disallowed dimension set; KPI, unfiltered total and comparison total
    clicks through the target union; a forged reserved row key; a comparison total beyond display
    limit; an unwindowed contiguous and non-contiguous Actual answer; the decoded
    total union carrying no hidden amount or transaction data; all four fixed bounds; negative and
    offsetting-zero Actuals; row, KPI and total values at both sides of the signed-money boundary;
    a 65,537-character request refused and audited before decode; stored and chart inertness; every
    typed drill refusal; first-turn and post-refusal missing follow-up context with zero selector
    calls; whole-token follow-up signals and a `theme` non-match; ungrouped, Western-grouped,
    Indian-grouped and lakh/crore amounts; malformed grouping,
    excess decimal places; compound period failures at each precedence boundary; saved/pinned
    rerun; and audit-before-read.
11. Hermetic selection tests, drill contract/service tests, frontend interaction tests, typecheck,
    structural build and quality checks pass. Gated warehouse proofs run only against the throwaway
    test database.
12. A live demo compares the five monthly values and the total with the supplied Excel/SAP data and
    records each transaction footer; current workbook values are evidence, not permanent literals
    in automated tests.

## Out of scope

- New semantic dimensions such as cost centre.
- Budget, percentage or Roll-over transaction drill-down.
- Clicking chart points, transaction export or editing.
- Ranking or top-N selection semantics; the existing bounded display limit remains unchanged.
- Model-authored SQL, a new datastore or a database schema migration.
- Persisting signed drill links in conversation snapshots.

## Success measure

- Metric: successful runs of the target trend question whose selection has five months and no
  comparison, and whose six drill targets (five monthly Actuals plus the Actual total) reconcile
  exactly to their SAP lines.
- Baseline: 0 successful runs on 2026-10-08; the question collapsed to April, retained Actual over
  Budget and returned no rows, so none of the six Actual drill targets was available.
- Target: 4 of 4 fresh-conversation runs and 4 of 4 runs after an over-budget turn return the same
  correct selection; all 6 of 6 Actual drill targets foot exactly in each checked answer.
- Check date: 2026-10-16

## Source

- Owner discussion and approved combined plan, 2026-10-08.
- `docs/specs/ask-period-control.md`.
- `docs/specs/ask-gl-names-and-transactions.md`.
- `docs/specs/actuals-drill-down.md`.

## Roadmap

- ASK-TRACEABLE-ANSWERS: Ask preserves complete questions and opens every live Actual transaction set
