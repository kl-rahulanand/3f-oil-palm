# Task — all-plants-statement-ui

Story: `multi-plant` · plan: `plans/active/multi-plant-all-plants-in-the-mis-statement.md`

## Objective
Widen the shared contract so a statement block can carry a **null** Budget with a
`budgetState`, and render that state: Budget, Roll-over and % show a dash with the accessible
label "Budget not loaded for this plant" on every row including the Grand Total, with no drill
affordance on those cells, while Actual cells stay drillable and unchanged. Make the client-side
aggregate drill null-safe. Show the provisional mark for non-DUB selections in the statement
header and on the plant options. This task lands FIRST (human-decided): the backend task then
sends null without breaking the build. DUB renders exactly as today.

## Workflow

```mermaid
flowchart TD
  C[contract/src/api.ts<br/>budget: FixedScaleMoney | null<br/>budgetState?: loaded | not-loaded<br/>scope.provisional? plantDisplay?<br/>plant option.provisional?] --> V[statement-view.tsx<br/>MeasureCells: dash + label when not-loaded<br/>header provisional mark]
  C --> P[drill-panel.tsx<br/>aggregate drill: null budget → dash, dashed footer, no toPaise on null]
  C --> O[mis-report-view.tsx<br/>plant option label carries the provisional mark]
  V --> T[vitest leaves]
  P --> T
  O --> T
  T --> B[backend task sends null + budgetState<br/>(not this task)]
```

This task starts at the contract and stops at the rendered cells. Until the backend task lands
every response still carries a loaded budget, so on screen nothing changes for DUB; the dash is
first seen live at the backend task's close.

## Read before you write
- `contract/src/api.ts:236` (`MisSelectionScopeReadout`), `:232` (plant option record),
  `:285` (`MisStatementMeasureBlock`). The backend's DTO classes `implements` these
  interfaces, so every NEW field must be **optional** and `budget` widens to
  `FixedScaleMoney | null` (a class property typed `FixedScaleMoney` still satisfies it). The
  backend build must stay green without any backend edit — run `npm run typecheck` for all
  three workspaces.
- `frontend/src/features/mis/statement-view.tsx:241-270` — `MeasureCells` renders
  `formatMoney(measure.budget)`, the empty Roll-over cell (`aria-label="Roll-over
  unavailable"`), the Actual button and `formatPercentage`. `:286` — `formatMoney` takes a
  non-null `FixedScaleMoney`; keep it that way and branch above it.
- `frontend/src/features/mis/drill-panel.tsx:394,438-445` — the aggregate view formats
  `measure.budget` per leaf and sums `toPaise(measure.budget)`; `foots` compares budget paise.
- `frontend/src/features/mis/mis-report-view.tsx:64-68` — plant options rendered from
  `{ value, label }`.

## Contract

### The contract change (this task owns `contract/src/api.ts`)
- `MisStatementMeasureBlock.budget: FixedScaleMoney | null`; new optional
  `budgetState?: "loaded" | "not-loaded"`. A missing `budgetState` means loaded (every
  response today).
- `MisSelectionScopeReadout` gains optional `provisional?: boolean` and `plantDisplay?: string`.
- The plant option record gains optional `provisional?: boolean`.
- No other contract change; no backend file is touched.

### Dash cells
- When a block's `budgetState` is `"not-loaded"` (or `budget` is null), Budget, Roll-over and
  % cells render `–` with `aria-label="Budget not loaded for this plant"`; they carry no
  button and no pointer affordance. This applies to leaf rows, parent rows and the Grand Total
  row alike. Actual cells are untouched: same button, same label, same drill.
- A loaded block, and a block with no `budgetState`, render exactly as today — the existing
  statement-view tests must pass unchanged.

### Null-safe aggregate drill
- In the aggregate view, a null budget renders as `–` per leaf; the footer's Budget and %
  render as `–`; no `toPaise` is called on a null; `foots` compares Actual paise only when the
  clicked block is not-loaded. Clicking any Actual on a not-loaded block opens the panel
  without throwing. The transactions view is unchanged.

### Provisional mark
- The statement header shows a small mark reading "Provisional labels" next to the
  function / plant line when `scope.provisional` is true; the plant option label appends the
  same mark when the option's `provisional` is true. DUB (provisional false or absent) shows
  nothing. The mark reads as "awaiting the client's names", never as an error (no error
  colour, no icon that reads as a warning).

### Design
`user_facing: true`: load `emil-design-eng` and `frontend-design` and attest both in the test
artifact's `skills_used`. The cells live in a dense financial grid: the dash must sit on the
same numeric baseline and column alignment as money (`data-numeric`), the label is for
assistive tech, and the provisional mark matches the surrounding type weight. Respect the
existing tokens in `frontend/app/globals.css`; add a class, not inline styles.

## Manual Verification
1. `npm run typecheck` (contract, backend, frontend) green with no backend edit.
2. Generate the DUB statement on `/mis-reports`: byte-identical rendering to before.
3. With a fixture-driven story (vitest), a not-loaded block shows dashes on every row
   including Grand total and the Actual buttons still open the drill.

## Out of scope
- Any backend or DTO file; the Ask panel; cascading selectors; anything deferred by 0033/0036.

## Proof
`python3 factory/scripts/verify.py` plus the required vitest leaves below, judged by testcase
name and executed count. None of the files in scope is in `.prettierignore` (checked).

<!-- forge:contract -->
## Contract (recorded)

Rendered by the harness from the recorded decomposition; edit the decomposition, not this block. It is excluded from the plan's approval and grill digests, so a re-render never stales either.

**Objective.** Widen the shared contract so a statement block can carry a null Budget with a budgetState flag, and render that state: Budget, Roll-over and % show a dash with the accessible label 'Budget not loaded for this plant' on every row including the Grand Total, with no drill affordance on those cells, while Actual cells stay drillable and unchanged. Make the client-side aggregate drill null-safe. Show the provisional mark for non-DUB selections in the statement header and on the plant options. Lands first (human-decided) so the backend task can send null without breaking the build; DUB renders exactly as today.

**Acceptance criteria**

- contract/src/api.ts: MisStatementMeasureBlock.budget becomes FixedScaleMoney | null with an optional budgetState ('loaded' | 'not-loaded', absent means loaded); MisSelectionScopeReadout gains optional provisional and plantDisplay; the plant option record gains optional provisional. No backend file changes and npm run typecheck stays green for all three workspaces.
- On a not-loaded block, Budget, Roll-over and % render a dash with the accessible label 'Budget not loaded for this plant' on every row including the Grand Total, with no button and no pointer affordance on those cells; Actual cells are unchanged and stay drillable; a loaded block and a block without budgetState render exactly as before and the existing statement-view tests pass unchanged.
- The client-side aggregate drill renders null budgets as dashes, shows a dashed Budget and % footer, calls no paise arithmetic on null, and foots Actual only for a not-loaded block, so clicking any Actual on a not-loaded block opens the panel without throwing; the transactions view is unchanged.
- The statement header and the plant option labels show a 'Provisional labels' mark when the scope readout or the option carries provisional true, nothing for DUB, styled to read as awaiting the client's names rather than as an error; emil-design-eng and frontend-design are loaded and attested.
- Vitest leaves cover the dash cells and label, the absent pointer affordance, the unchanged loaded rendering, the null-safe aggregate drill and the provisional mark, each judged by testcase name and executed count; the functional check confirms DUB renders unchanged (the dash is seen live at the backend task's close).

**Write scope** (what `stage done` measures the diff against)

- contract/src/api.ts
- frontend/src/features/mis
- frontend/app/globals.css

**Required tests** (run by `stage done`)

- `a not loaded block renders a dash with the not loaded label in budget rollover and percentage on every row including the grand total with no drill affordance on those cells` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)
- `a loaded block and a block without a budget state render exactly as before` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)
- `the statement header shows the provisional labels mark from the scope readout and nothing for DUB` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)
- `the aggregate drill renders null budgets as dashes with a dashed footer and performs no paise arithmetic on null` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/drill-panel.test.tsx)
- `a plant option carrying provisional renders the provisional labels mark in its label` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/mis-report-view.test.tsx)

**Verify commands**

- `python3 factory/scripts/verify.py`

**Review budget.** 8 files / 700 lines -- One additive contract change, a branch in MeasureCells, a null-safe aggregate drill, one small mark component with a class, five vitest leaves. No backend.
<!-- /forge:contract -->
