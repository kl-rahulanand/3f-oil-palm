# Task — measure-filter-foundation

Story: `ask-measure-filter` · plan: `plans/active/ask-measure-filter-ask-filters-by-a-comparison-between-measures.md`
· spec: `docs/specs/ask-measure-comparison-filter.md` · decision 0039.

## Objective
Give the selection contract an additive optional `measureFilters` list and build the trust spine
under it, backend only: one pure helper that normalises, canonicalises and appends operand
measures; one typed exception and its envelope branch; the operand union read by validation,
executor authorization, saved and pin runnable status and the pin definition-version hash; the
SQL builder compiling each filter to `HAVING` over verified expressions in both domains, the
statement projection now honouring dimension filters, and a builder-owned totals query over a
derived table; validator leaves proving every existing check still fires. No provider, chat,
Swagger, help or frontend change: those are tasks 2 and 3.

## Workflow

```mermaid
flowchart TD
  C[contract/src/measure.ts<br/>MeasureFilter, Selection.measureFilters,<br/>MeasureSpec.totalsOverAliases] --> H[measure-filter.helper.ts<br/>normalizeMeasureFilters · operandMeasureIds · canonicalizeSelection]
  H --> X[measure-filter-invalid.exception.ts<br/>reason enum, extends BadRequestException]
  X --> F[global-exception.filter.ts<br/>details.reason, userMessage]
  H --> V[selectionValidation.ts<br/>operand union]
  H --> A[selectionExecutor.authorize<br/>operand union]
  H --> S[saved.service.ts / pins.service.ts<br/>store + reopen canonicalise; status + hash over the union]
  V --> B[sqlBuilder.ts<br/>havingClause in build and buildStatementProjection;<br/>projection WHERE filters; buildTotals]
  B --> T[selectionExecutor.totalsFor<br/>calls buildTotals, builds no SQL]
  B --> Q[sqlValidator.ts<br/>no new rule; leaves prove HAVING and derived table]
  Q --> W[(Warehouse)]
```

This task starts at the contract and stops at the SQL the warehouse runs. The chat service, the
provider and every reader-facing surface are untouched here.

## Read before you write
- `contract/src/measure.ts:151-164` — `Selection` and `SelectionFilter`; add the new types beside
  them. `MeasureSpec` (line 11) gains `totalsOverAliases?: string`.
- `contract/src/api.ts:630-660` — `AskResponse` (`appliedFilters`, `totals: Record<string,
  number>`); line 730 `ConversationAnswerSnapshot`. Add `appliedMeasureFilters?: MeasureFilter[]`
  to both; totals stay numbers.
- `backend/src/semantic/selectionValidation.ts:5-30` — `validateSelectionForUser` reads
  `selection.measureIds`; it must read the operand union. **D-0006:** this file is listed in
  `.prettierignore` with a pinned hash in `tools/quality-gate.test.mjs` (`ignoredBaselineHashes`);
  before editing it, format it and remove it from BOTH lists in the same change, per the
  `.prettierignore` header. Same for `backend/src/sql/sqlValidator.ts` if you touch it (you should
  not need to: it gains no rule).
- `backend/src/semantic/semanticLayer.ts:52-80,110-130` — the `%` measures are text `CASE`
  expressions with `format: "percent"`; money measures carry `format: "money"`. Set
  `totalsOverAliases` on `governed-financial.percentage` and `mis-statement.percentage`.
- `backend/src/sql/sqlBuilder.ts:93-140` — `build`: user filters, time predicate, `GROUP BY`,
  `ORDER BY`, `LIMIT`; `HAVING` goes between `GROUP BY` and `ORDER BY`. Lines 203-260 —
  `buildStatementProjection`: today it never reads `selection.filters`; add the `WHERE`
  predicates on `relation.<column>` beside the period predicate and the `HAVING` after its
  grouping. `lit()` quotes every literal.
- `backend/src/chat/selectionExecutor.ts:109-119` — `authorize` reads `selection.measureIds`;
  lines 221-256 — `totalsFor` re-runs `executeResolved` with `dimensionIds: []` and reads the
  first row. Replace the query construction with `builder.buildTotals(...)`; keep the row
  reading and `Number()` conversion.
- `backend/src/sql/sqlValidator.ts:19-70` — object allowlist via `Parser.tableList`, blocked
  columns via `columnList`, mandatory bounded `LIMIT` read from the top-level statement.
- `backend/src/saved/saved.schemas.ts:18-45` — `selectionSchema` (zod, strict); add
  `measureFilters` as an optional strict array. `backend/src/saved/saved.service.ts:110-135` and
  `backend/src/pins/pins.service.ts:255-285` — `selectionStatus` builds `dimensionIds` from
  filters; do the same for measures through `operandMeasureIds`. `pins.service.ts:40,225` —
  `computeDefinitionVersion(selectedMeasures)` (`definitionVersion.ts`): feed it the operand
  union so a pin's hash changes when an operand's expression changes.
- `backend/src/common/global-exception.filter.ts:17-80` — `message` is fixed to "HTTP exception"
  for non-500s and `details` is `{}` unless zod validation; add the one branch.
- `backend/src/common/error-envelope.wiring.test.ts` — the pattern for asserting an envelope
  through `configureApp` + `app.init`.
- `backend/package.json:18` — `test:hermetic` is an explicit file list; add the new helper test.
  `tools/quality-gate.test.mjs:64,121,134` — the hermetic list is pinned there too; both must
  agree.
- `docs/decisions/0039-ask-measure-comparison-filter.md` — the six rules.

## Contract

### The shape (C1)
- `contract/src/measure.ts`: `MeasureFilterOp = "gt" | "gte" | "lt" | "lte"`;
  `MeasureFilterOperand = { kind: "measure"; measureId: string } | { kind: "value"; value: string }`;
  `MeasureFilter { measureId; op; compareTo }`; `Selection.measureFilters?: MeasureFilter[]`;
  `MeasureSpec.totalsOverAliases?: string`. `contract/src/api.ts`: `AskResponse.appliedMeasureFilters?`
  and `ConversationAnswerSnapshot.appliedMeasureFilters?`. `filters` unchanged. The saved-selection
  zod schema accepts the field. Every shipped leaf that builds or stores a selection passes
  unmodified; `npm run typecheck` green in all three workspaces.

### The helper — one seam, one canonicaliser (C2, C4)
- `backend/src/semantic/measure-filter.helper.ts` (suffix `helper`: pure, no IO, no Nest
  injection). Exports:
  - `normalizeMeasureFilters(domain: DomainSpec, filters: MeasureFilter[] | undefined): MeasureFilter[]`
    — value must match `^-?\d+(\.\d{1,2})?$` and is normalised to exactly two decimals
    (`500000` → `500000.00`, `-1200.5` → `-1200.50`); both operands must be measures of the
    domain with `format === "money"` (a `%` measure or an unknown id is refused); a measure
    compared with itself is refused; two entries identical after normalisation are refused; order
    is preserved.
  - `operandMeasureIds(selection: Selection): string[]` — `measureIds` followed by every operand
    measure id not already present, in first-appearance order across the filters.
  - `canonicalizeSelection(domain: DomainSpec, selection: Selection): Selection` — normalises the
    filters and returns the selection with `measureIds = operandMeasureIds(...)`; the first entry
    of `measureIds` is never moved, so the shipped ordering rule (largest first by the first
    measure) is unchanged. A selection without `measureFilters` is returned unchanged
    (byte-for-byte equal), so every shipped path is a no-op.
- Refusals raise `MeasureFilterInvalidException`
  (`backend/src/semantic/measure-filter-invalid.exception.ts`), which extends `BadRequestException`
  and carries `reason: MeasureFilterInvalidReason` — `not_comparable | unknown_measure |
  self_comparison | duplicate | malformed_value` — as a typed enum, never a string literal. It is
  the only exception the helper throws. An operand outside the **user's permissions** is NOT a
  helper concern: `validateSelectionForUser` and the executor's `authorize` read the operand union
  and refuse through their existing displayed-measure paths ("Measure not available: <id>",
  `SelectionExecutionBlockedError`).
- `global-exception.filter.ts` gains one branch: when the exception is a
  `MeasureFilterInvalidException`, `details = { reason }` and `userMessage` is the reader sentence
  for that reason (five sentences, in the exception file as a typed map); `code` stays `HTTP_400`
  and `type` is already the constructor name. Everything else in the filter is unchanged.

### Every non-chat ingress canonicalises and authorises the union (C2, C4)
- `saved.service.ts` and `pins.service.ts`: on store (`POST /api/saved`, `POST /api/pins`) the
  selection is canonicalised before it is validated and written; on reopen the stored selection
  is canonicalised again before status is computed and before it is re-run; `selectionStatus`
  checks every id in `operandMeasureIds` against the registry and the user's `measureIds`
  permissions, so an unregistered or unpermitted operand reports `definition_unregistered` /
  the existing not-permitted reason exactly as a displayed measure would.
- `computeDefinitionVersion` receives the measures for the operand union, so a pin whose filter
  operand's expression changes is flagged `definitionChanged`.
- `validateSelectionForUser` and `selectionExecutor.authorize` read `operandMeasureIds`.
- The chat service's own call sites (provider door, direct `AskRequest.selection`, grounded
  selection) belong to task 2; this task exposes the helper and must not edit
  `backend/src/chat/chat.service.ts`.

### SQL, built in one place (C3, C5, C6)
- `sqlBuilder.ts`: a private `havingClause(domain, measures, filters)` renders
  `<left.expr> <op> <right.expr | lit(value)>` joined by ` AND `, with `op` mapped `gt >`, `gte
  >=`, `lt <`, `lte <=`. In `build` it is appended after `GROUP BY` (and, with no dimensions,
  directly after `WHERE`, where the single aggregate row is kept or dropped). In
  `buildStatementProjection` it is appended after the projection's grouping. The projection also
  renders `selection.filters` as `WHERE` predicates on `relation.<column>` (`eq` =, `neq` <>,
  `in (...)`) beside the period predicate, only when a filter is present, so the golden
  statement proofs see identical SQL.
- New public `buildTotals(domain, selection, user, resolvedScope?)`: when `measureFilters` is
  empty it returns exactly what `totalsFor` builds today (the ungrouped query with
  `dimensionIds: []`); otherwise it wraps the grouped, filtered query **without its `LIMIT`** as
  `SELECT <totals> FROM (<grouped query>) AS filtered LIMIT 1`, where each selected measure totals
  as `SUM(<alias>) AS <alias>` when `format === "money"`, as `<totalsOverAliases> AS <alias>` when
  the measure declares one, and `NULL AS <alias>` otherwise. The semantic layer sets
  `totalsOverAliases` on both `%` measures to the same nil-rule `CASE` written over `SUM(actual)`
  and `SUM(budget)` (the group aliases). `objectsTouched` is unchanged.
- `selectionExecutor.totalsFor` calls `this.builder.buildTotals(...)` and runs the returned SQL
  through the same validator and warehouse path as `executeResolved`; it constructs no SQL.
- `sqlValidator.ts` is not edited. Leaves prove: a `HAVING` query and the derived totals query
  are accepted; an unapproved object referenced only inside the derived table is refused with the
  existing "unapproved object" reason; a blocked column referenced only inside `HAVING` is refused
  with the existing blocked-column reason; a derived query with no outer `LIMIT` is refused; and
  `Parser.tableList` on the derived query returns the base objects (pinned so a parser upgrade
  cannot widen the allowlist unnoticed).

### Design (code shape, constitution)
- Two new files, constitution suffixes: `measure-filter.helper.ts`, `measure-filter-invalid.exception.ts`.
  The reason enum and the reader sentences live in the exception file; no string literals for
  reasons anywhere else.
- No new dependency. No migration. `node-sql-parser` already parses `HAVING` and derived tables.
- Money on the wire: `compareTo.value` is a two-decimal string; totals stay numbers as shipped.
- Any D-0006-listed file this task edits (`selectionValidation.ts` is the one it must) is
  formatted and removed from `.prettierignore` and from `ignoredBaselineHashes` in the same
  commit; `tools/quality-gate.test.mjs` and `backend/package.json` both list the new helper test.

## Manual Verification
1. `npm run typecheck` green in `contract`, `backend`, `frontend`; `npm run test:hermetic` green.
2. `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node --require ts-node/register
   --test backend/src/semantic/measure-filter.helper.test.ts` lists the four helper leaves passing.
3. In `sqlBuilder.selection.test.ts` output, the rendered SQL for `Actual gt Budget` by `gl_code`
   for July shows `GROUP BY gl_code` followed by `HAVING SUM(actual_net) > SUM(budget_net)` and
   the totals SQL shows `FROM (` ... `) AS filtered LIMIT 1` with no inner `LIMIT`.
4. Backend up against the documented `WAREHOUSE_PG_*` with the July batches loaded: `POST
   /api/saved` with a selection carrying `{ measureId: "governed-financial.percentage", op: "gt",
   compareTo: { kind: "value", value: "1" } }` answers 400 with `type:
   "MeasureFilterInvalidException"` and `details.reason: "not_comparable"`; the same with
   `governed-financial.actual gt governed-financial.budget` is stored, and `GET /api/saved`
   reports it runnable with `measureIds` showing Budget appended.
5. `python3 factory/scripts/verify.py` passes.

## Out of scope
- The Bedrock schema, prompt and parser; the chat service's ingress call, refusal translation,
  chips, readback, `viewInReport`, grounding merge, `appliedMeasureFilters` population; Swagger;
  help; the warehouse proof — task 2.
- Labels, identity, the readout line, the empty state, the functional check — task 3.

## Proof
Every required leaf is named in the recorded decomposition; each is judged by its junit testcase
name present and executed, never skipped (decision 0009). `python3 factory/scripts/verify.py`
passes on the final tree.

<!-- forge:contract -->
## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Give the selection contract an additive optional measureFilters list (measure vs measure or vs a fixed-scale decimal value; gt, gte, lt, lte; AND; order-preserving) and build the trust spine under it: one pure helper that normalises, canonicalises and appends operand measures; one typed exception; the operand union read by validation, executor authorization, saved and pin runnable status and the pin definition-version hash; the SQL builder compiling each filter to HAVING over verified expressions in both the governed-financial query and the statement projection, the projection now applying dimension filters as WHERE predicates, and a builder-owned totals query over a derived table with an outer LIMIT 1; validator leaves proving every existing check still fires inside HAVING and the derived table. No provider, chat, Swagger, help or frontend change: those are the next two tasks.

**Acceptance criteria**

- contract/src/measure.ts: MeasureFilterOp (gt|gte|lt|lte), MeasureFilterOperand ({kind:'measure', measureId} | {kind:'value', value}), MeasureFilter and Selection.measureFilters?: MeasureFilter[]; contract/src/api.ts: AskResponse.appliedMeasureFilters?: MeasureFilter[] and the same optional field on ConversationAnswerSnapshot; filters is unchanged; the saved-selection zod schema accepts the field; every shipped leaf that builds or stores a selection passes unmodified and npm run typecheck stays green for all three workspaces.
- backend/src/semantic/measure-filter.helper.ts is the ONE seam and canonicaliser, a pure helper with no IO: normalizeMeasureFilters(domain, filters) enforces the value grammar ^-?\d+(\.\d{1,2})?$ normalised to exactly two decimals, comparability (measure.format === 'money' on both sides, so both domains' % measures are refused), unknown-measure, self-comparison and duplicate-after-normalisation refusal; operandMeasureIds(selection) returns the union of measureIds and every operand measure id; canonicalizeSelection(domain, selection) normalises and appends operand measures missing from measureIds in first-appearance order, leaving the first entry of measureIds unchanged so row ordering is unchanged.
- backend/src/semantic/measure-filter-invalid.exception.ts: MeasureFilterInvalidException extends BadRequestException with reason: MeasureFilterInvalidReason (not_comparable | unknown_measure | self_comparison | duplicate | malformed_value); it is the only shape refusal the helper raises, never a bare Error; an operand outside the user's permissions follows the existing displayed-measure path (validateSelectionForUser 'Measure not available', the executor's SelectionExecutionBlockedError) over the operand union; backend/src/common/global-exception.filter.ts gains one branch so a MeasureFilterInvalidException answers HTTP 400 with code HTTP_400, type 'MeasureFilterInvalidException', details { reason } and a reader userMessage, pinned by a leaf in error-envelope.wiring.test.ts.
- canonicalizeSelection runs at every non-chat ingress this task owns (saved query and pin on store and on reopen, prior-turn re-run) and validateSelectionForUser, the executor's authorize, saved.service.ts and pins.service.ts runnable status and the pin definition-version hash all read operandMeasureIds instead of selection.measureIds; a persisted selection whose operand measure is unregistered or outside the user's permissions reports not runnable exactly as a displayed measure would; leaves prove each site and that a stored selection with the same bad entry as a direct one is refused with the same reason.
- backend/src/sql/sqlBuilder.ts renders each measure filter as <left expr> <op> <right expr | lit(value)> joined by AND in a HAVING clause placed after GROUP BY in build and after the projection's grouping in buildStatementProjection; buildStatementProjection additionally renders selection.filters as WHERE predicates on relation.<column> (eq, neq, in) beside the period predicate, emitted only when a filter is present; leaves assert the emitted SQL for measure-vs-measure, measure-vs-value, an ungrouped selection (one aggregate row kept or dropped), the combination with a dimension filter and a time window, and a leaf_key filter on the projection; every existing sqlBuilder and golden statement leaf passes with its expectations unchanged.
- A new public SqlBuilder.buildTotals(domain, selection, user, resolvedScope) returns the ungrouped totals query: byte-for-byte today's shape when measureFilters is empty, and 'SELECT <totals over the aliases> FROM (<the grouped, filtered query with no LIMIT>) AS filtered LIMIT 1' when it is not, where a money measure totals as SUM(<alias>), a measure with the new optional MeasureSpec.totalsOverAliases (contract/src/measure.ts, additive) totals through that expression, and any other measure totals as NULL; backend/src/semantic/semanticLayer.ts sets totalsOverAliases on governed-financial.percentage and mis-statement.percentage to the same nil-rule CASE over SUM(actual) and SUM(budget) aliases; selectionExecutor.totalsFor calls buildTotals and constructs no SQL itself; leaves assert the unchanged shape, the money-only shape, the percent-display shape, and that the inner query carries no LIMIT.
- backend/src/sql/sqlValidator.ts gains no rule: leaves prove a query with HAVING and the derived-table totals query are accepted, that an unapproved object referenced inside the derived table and a blocked column referenced inside HAVING are refused with the existing reasons, that a missing or oversize outer LIMIT is still refused, and pin that Parser.tableList on the derived table returns the base objects.
- Hermetic proof: every required leaf below exists under its exact name, is executed (junit testcase present and executed, never skipped) and passes; python3 factory/scripts/verify.py passes; no file under backend/src/llm, backend/src/chat, backend/src/help, backend/src/conversations or frontend changes.

**Write scope** (what `stage done` measures the diff against)

- contract/src/measure.ts
- contract/src/api.ts
- backend/src/semantic
- backend/src/sql
- backend/src/saved
- backend/src/pins
- backend/src/chat/selectionExecutor.ts
- backend/src/chat/selectionExecutor.composed.test.ts
- backend/src/common/global-exception.filter.ts
- backend/src/common/error-envelope.wiring.test.ts
- backend/package.json
- tools/quality-gate.test.mjs
- .prettierignore

**Required tests** (run by `stage done`)

- `normalizeMeasureFilters accepts gt gte lt lte between two money measures and against a decimal value normalised to two decimals` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/semantic/measure-filter.helper.test.ts)
- `normalizeMeasureFilters refuses a percent operand an unknown measure a self comparison a duplicate entry and a malformed value with typed reasons` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/semantic/measure-filter.helper.test.ts)
- `canonicalizeSelection appends operand measures in first appearance order and leaves the first measure unchanged` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/semantic/measure-filter.helper.test.ts)
- `validateSelectionForUser refuses an operand measure outside the domain or the user permissions even when measureIds are permitted` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/semantic/measure-filter.helper.test.ts)
- `the builder renders a HAVING over the verified expressions for measure versus measure measure versus value and an ungrouped selection with a dimension filter and a time window` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/sql/sqlBuilder.selection.test.ts)
- `buildTotals is unchanged without measure filters and wraps the grouped query without its LIMIT as a derived table with an outer LIMIT 1 when filters are present` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/sql/sqlBuilder.selection.test.ts)
- `buildTotals totals a percent display measure through totalsOverAliases and a money measure as the sum of its alias` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/sql/sqlBuilder.selection.test.ts)
- `a MeasureFilterInvalidException answers HTTP 400 with its type its reason in details and a reader userMessage` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/common/error-envelope.wiring.test.ts)
- `the statement projection renders a HAVING for a measure filter and a WHERE predicate for a leaf key filter and is unchanged when neither is present` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/sql/sqlBuilder.statement.test.ts)
- `the validator accepts HAVING and a derived table totals query and still refuses an unapproved object inside the derived table a blocked column inside HAVING and a missing outer LIMIT` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/sql/sqlValidator.composed.test.ts)
- `saved query runnable status and the stored selection refusal cover the operand measures and answer HTTP 400 with type MeasureFilterInvalidException` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/saved/saved.service.test.ts)
- `pin runnable status and the definition version hash cover the operand measures` -- `TS_NODE_PROJECT=backend/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node tools/junit-run.mjs --file {path} --name {id} --report {report} --require ts-node/register` (backend/src/pins/pins.service.test.ts)

**Verify commands**

- `python3 factory/scripts/verify.py`

**Review budget.** 16 files / 1100 lines -- Two contract files, one new helper with its test, one new exception, validation and executor edits, the builder (two domains plus buildTotals), the validator's leaves, saved and pins status and hash with their tests, the composed executor test, and package and quality-gate registration.
<!-- /forge:contract -->
