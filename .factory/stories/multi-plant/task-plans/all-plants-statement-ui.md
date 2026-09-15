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
  interfaces and `mis-statement-export.service.ts:80` passes `block.budget` to
  `writeMoney(FixedScaleMoney)`, so every NEW field must be **optional** and `budget` must NOT
  be widened here. The backend build must stay green without any backend edit — run
  `npm run typecheck` for all three workspaces.
- `frontend/src/features/mis/statement-view.tsx:241-270` — `MeasureCells` renders
  `formatMoney(measure.budget)`, the empty Roll-over cell (`aria-label="Roll-over
  unavailable"`), the Actual button and `formatPercentage`. `:286` — `formatMoney` takes a
  non-null `FixedScaleMoney`; keep it that way and branch above it.
- `frontend/src/features/mis/drill-panel.tsx:394,438-445` — the aggregate view formats
  `measure.budget` per leaf and sums `toPaise(measure.budget)`; `foots` compares budget paise.
- `frontend/src/features/mis/mis-report-view.tsx:64-68,154` — plant options rendered as native
  `<option>` elements from `{ value, label }`; `statement-view.tsx:47` — the header renders
  `scope.plant` today and gains `plantDisplay`.

## Contract

### The contract change (this task owns `contract/src/api.ts`) — additive only
- `MisStatementMeasureBlock` gains `budgetState?: "loaded" | "not-loaded"`. **`budget` is NOT
  widened here**: the backend export passes it to `writeMoney(FixedScaleMoney)` and the
  backend DTO class implements the interface, so widening would break the backend typecheck
  that `verify.py` runs. The backend task turns the block into a discriminated union
  (`{ budgetState?: "loaded"; budget: FixedScaleMoney }` | `{ budgetState: "not-loaded";
  budget: null }`) and adapts its own call sites; this task's job is to make the frontend
  narrow correctly NOW so that later widening compiles unchanged.
- `MisSelectionScopeReadout` gains optional `provisional?: boolean` and `plantDisplay?: string`.
  The plant option record gains optional `provisional?: boolean`.
- No other contract change; no backend file is touched.

### Guard, never touch
- One shared helper `isBudgetNotLoaded(block)` (`block.budgetState === "not-loaded"`) is the
  only way the frontend decides. Every read of `budget`, and every `percentage` render for a
  block, happens in the `else` branch of that guard, so when the backend task narrows the
  union the loaded branch still sees `FixedScaleMoney`. Interim test fixtures for a not-loaded
  block are built through a small factory that casts (`as unknown as MisStatementMeasureBlock`)
  with a comment naming the backend task that removes the cast; the guard makes the amount
  irrelevant.
- Wire invariant, tested: absent or `"loaded"` state renders money; `"not-loaded"` renders the
  dash whatever the amount field holds; the backend task adds the DTO-side rejection of the
  two mismatches.

### Dash cells
- When `isBudgetNotLoaded(block)`, Budget, Roll-over and % cells render `–` with
  `aria-label="Budget not loaded for this plant"`; they carry no button and no pointer
  affordance. This applies to leaf rows, parent rows and the Grand Total row alike, proven
  separately for each. Actual cells are untouched: same button, same label, same drill.
- A loaded block, and a block with no `budgetState`, render exactly as today — the existing
  statement-view tests must pass unchanged.

### Null-safe aggregate drill
- Under the same guard the aggregate view renders `–` per leaf for Budget and %, the footer's
  Budget and % render `–`, no `toPaise` runs on the budget, and `foots` compares Actual paise
  only. Proven for a parent Actual (aggregate path) and the Grand Total (flattened roots);
  the leaf Actual (transactions path) is unchanged and asserted unchanged.

### Provisional labels
- Header: renders `scope.plantDisplay ?? scope.plant` and, when `scope.provisional` is true, a
  small styled mark "Provisional labels" beside the function / plant line (no error colour, no
  warning icon; a token class in `globals.css`). A native `<option>` cannot host a styled
  element, so the plant option label gets a plain text suffix ` — Provisional labels` when the
  option's `provisional` is true. DUB (false or absent) shows neither.

### Design
`user_facing: true`: load `emil-design-eng` and `frontend-design` and attest both in the test
artifact's `skills_used`. The cells live in a dense financial grid: the dash must sit on the
same numeric baseline and column alignment as money (`data-numeric`), the label is for
assistive tech, and the provisional mark matches the surrounding type weight. Respect the
existing tokens in `frontend/app/globals.css`; add a class, not inline styles.

## Manual Verification
1. `npm run typecheck` (contract, backend, frontend) green with no backend edit; then, as a
   local experiment only (not committed), widen `budget` to nullable in the contract and
   confirm the FRONTEND still typechecks — that is what the guard buys the backend task.
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

**Objective.** Add the additive half of the contract (an optional budgetState on the measure block, optional provisional/plantDisplay on the scope readout, optional provisional on the plant option) and make the frontend guard every budget access on budgetState, so the backend task can later turn the block into a discriminated union with budget null without breaking either build. Render the not-loaded state: Budget, Roll-over and % show a dash with the accessible label 'Budget not loaded for this plant' on every row including the Grand Total, with no drill affordance on those cells, while Actual cells stay drillable and unchanged; make the aggregate drill null-safe under the same guard; render the header from plantDisplay with a styled 'Provisional labels' mark and a plain text suffix on the native plant options. Lands first (human-decided); DUB renders exactly as today.

**Acceptance criteria**

- contract/src/api.ts: MisStatementMeasureBlock gains optional budgetState ('loaded' | 'not-loaded'); budget is NOT widened (the backend export and DTO would fail to typecheck); MisSelectionScopeReadout gains optional provisional and plantDisplay; the plant option record gains optional provisional. No backend file changes and npm run typecheck stays green for all three workspaces.
- One shared guard (budgetState === 'not-loaded') is the only way the frontend decides; every read of budget and every percentage render sits in its else-branch, so when the backend task narrows the union the loaded branch still sees FixedScaleMoney. Wire invariant tested: absent or loaded state renders money; not-loaded renders the dash whatever the amount field holds.
- On a not-loaded block, Budget, Roll-over and % render a dash with the accessible label 'Budget not loaded for this plant' with no button and no pointer affordance, proven separately for a leaf row, a parent row and the Grand Total row; Actual cells are unchanged and stay drillable; a loaded block and a block without budgetState render exactly as before and the existing statement-view tests pass unchanged.
- Under the same guard the aggregate drill renders dashes for Budget and %, shows a dashed Budget and % footer, calls no paise arithmetic on the budget and foots Actual only, proven for a parent Actual and for the Grand Total; the leaf Actual transactions path is asserted unchanged.
- The header renders scope.plantDisplay ?? scope.plant and, when scope.provisional is true, a styled 'Provisional labels' mark (token class, no error colour, no warning icon); a native plant option whose provisional is true gets the plain text suffix ' — Provisional labels'; DUB shows neither; emil-design-eng and frontend-design are loaded and attested.
- Vitest leaves cover each of the above, judged by testcase name and executed count; the functional check confirms DUB renders unchanged; the live dash is observed at the story closeout's functional check after the backend task.

**Write scope** (what `stage done` measures the diff against)

- contract/src/api.ts
- frontend/src/features/mis
- frontend/app/globals.css

**Required tests** (run by `stage done`)

- `a not loaded leaf row renders a dash with the not loaded label in budget rollover and percentage with no drill affordance on those cells while the actual stays a drill button` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)
- `a not loaded parent row and the grand total row render the same dashes and labels` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)
- `a loaded block and a block without a budget state render exactly as before whatever the amount holds only the state decides` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)
- `the header renders the plant display name and the provisional labels mark from the scope readout and nothing for DUB` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/statement-view.test.tsx)
- `the aggregate drill on a not loaded parent and on the grand total renders dashed budgets and a dashed footer and performs no paise arithmetic on the budget` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/drill-panel.test.tsx)
- `the leaf actual transactions path is unchanged for a not loaded block` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/drill-panel.test.tsx)
- `a plant option carrying provisional renders the plain text provisional labels suffix` -- `npm exec --no -- vitest run --config frontend/vitest.config.ts {path} -t {id} --reporter=junit --outputFile={report}` (frontend/src/features/mis/mis-report-view.test.tsx)

**Verify commands**

- `python3 factory/scripts/verify.py`

**Review budget.** 9 files / 800 lines -- One additive contract change, one guard helper, a branch in MeasureCells and in the aggregate drill, the header display name and mark, the option suffix, a token class, seven vitest leaves. No backend.
<!-- /forge:contract -->
