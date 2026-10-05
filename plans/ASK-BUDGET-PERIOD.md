# Actual-versus-Budget answers ask for the period and every answer shows its dates

5 parts · Risks: none one-way · New moving parts: none

## What changes for you

When a question sets Actual against Budget (side by side, as a percentage of budget, or "over" or
"under" budget) and names no period, Ask now asks which period to use, after the plant choice. It
offers each month that has actuals for the chosen plants, newest first, plus the financial year to
date. Over- and under-budget questions offer only periods a chosen plant has a budget for. So a
comparison never again sets one month of actuals against a whole year's budget. Questions that name
a period, or show only Actual or only Budget, answer straight away as today. Every answer also shows
its period under the title as exact dates ("1 Jul 2026 – 31 Jul 2026"), or says it covers all loaded
data, and the line changes when you switch the period.

## Why

In the post-merge check on 2026-10-05, "Which GL codes had Actual over Budget?" with no period
compared July's actuals with the full year's budget and returned 8 codes instead of July's 21. The
owner chose on 2026-10-05 that such questions ask for the period, that the rule covers every answer
showing Actual and Budget together, and that every answer shows its dates. The amended spec
`docs/specs/ask-period-control.md` is confirmed.

## Done when

1. **A question that sets Actual against Budget and names no period asks which period to use after the plant choice, offering each month with actuals for the chosen plants plus the financial year to date, and nothing is read before the choice.**
2. **Over- and under-budget questions offer only periods a chosen plant has a budget for, and chosen plants with no actuals, or with nothing to compare, get a plain answer instead of an empty choice.**
3. **Questions that name a period, or show only Actual or only Budget, answer straight away as today, and DUB's July 2026 over-budget answer is unchanged: 21 codes, with 50001201 at ₹83,98,339.**
4. **Every answer shows its period under the title as exact from and to dates, or says it covers all loaded data, and switching the period updates that line.**
5. **A live check asks the three no-period comparison questions four times each and every run shows the period choice and then July's expected answer, while "Show Actual by GL code" still answers straight away.**

## Risks

Risks: none

## For the builders

### Done-when details

1. Spec `docs/specs/ask-period-control.md` behaviour "An Actual-versus-Budget answer with no period
   asks for the period" and acceptance criterion 10.
   - Trigger, read from the selection after the server has applied its plant set, governed-financial
     only: `measureIds` contain `governed-financial.actual` and `governed-financial.budget`, or
     contain `governed-financial.percentage`; or a `measureFilters` entry compares those two
     measures (either direction, any operator). One leaf each: Actual with Budget; percentage
     alone; and a table-driven leaf over all eight comparison filters, Actual gt, gte, lt and lte
     Budget and Budget gt, gte, lt and lte Actual, each triggering.
   - Order: plant choice first (`ask-multi-plant.md`); then this check; nothing reads a figure
     before either choice. The leaf asserts zero executor runs and zero figure reads, as the
     existing "a several-plant reader chooses plants before any figure or period read" leaf does;
     the month and budget-period lookups below are not figure reads.
   - Options: months with at least one actual row in an active actual batch for the chosen plant
     set (the lookup from BP-ACTUAL-MONTHS), newest first, labelled like "July 2026"; plus one
     year-to-date option from 1 April of the financial year containing the newest month through the
     last day of that month, labelled like "Financial year to date (April – July 2026)". The
     financial year starts on 1 April: January 2027 belongs to the year starting 1 April 2026. The
     year-to-date option is left out when it equals a month option (the newest month is April);
     leaf for that. Each option is a complete `AskPeriodOption` window
     `{ grain: "month", column: "month", from, to }`.
   - The response is `ClarificationNeeded` with `periodChoice`: `prompt` "Which period should this
     comparison cover?", the base selection without `timeWindow` and with the server's plant
     filter, the question verbatim, and the options. Choosing an option posts
     `origin: "period-choice"` and runs with zero selector calls (leaf counts the fake provider's
     calls: 1 for the question, 0 for the continuation).
   - The answer after the choice carries a period control over the same options, so switching
     works; its current entry is the chosen window.
   - A follow-up turn whose selection carries no period inherits the previous turn's window, as
     today (`chat.service.ts` copies the prior `timeWindow` before this check), and answers with it
     without a period choice, because the previous answer already ran on a chosen or stated period;
     the check fires only when no window remains after that inheritance (leaf: a follow-up to a July
     comparison answers for July; a follow-up to an answer with no window asks).
2. Spec acceptance criterion 10 (budget part) and the ordered outcomes.
   - With a comparison filter, an option is offered only if at least one chosen plant has both
     actuals in its window and a loaded budget for every month of it, by the rule
     `ask-multi-plant.md` uses to leave plants out: the budgeted chosen plants are those that are
     the budget owner plant from the mapping master (DUB today); their months with actuals come
     from the same lookup restricted to them; a window qualifies only when
     `findActiveBudgetPeriods` covers every month of it. So DUB and CHIR chosen offers DUB's
     comparable months; CHIR alone has no comparable window and gets the no-budget answer (leaf). Side by side and percentage alone offer every month with actuals and answer
     with "Budget not loaded" dashes where needed.
   - Outcomes after the plant choice, before any figure read, first match wins: (1) the chosen
     plants have no month of actuals: `NotSupported`, "No actuals are loaded for the chosen plants,
     so there is nothing to compare against Budget.", no period choice; (2) a comparison filter and
     no option left: the existing Informational no-budget answer ("Budget is not loaded for any
     chosen plant, so nothing was compared.", with `leftOut` and `viewInReport` unavailable); (3)
     the period choice.
   - Leaves: a month with actuals but no budget batch (not offered for a comparison filter; offered
     for side by side and for percentage alone); a year to date containing a month with no budget
     batch (not offered for a comparison filter); no comparable window (the no-budget answer); no
     month of actuals (the `NotSupported` copy).
3. Spec acceptance criterion 11.
   - A question that names a period answers directly with no period choice, including "Which GL
     codes had Actual over Budget in July 2026?" for DUB (leaf through the service with the July
     window: no period choice, the executor runs once).
   - No period choice, answers over all loaded data, one leaf each: Actual alone, Budget alone,
     "Actual more than 5 lakh" (an Actual-only filter against a fixed amount) and "Budget more than
     5 lakh".
   - Statement questions keep their own period choice unchanged; a statement for a chosen plant
     with no actual rows in an offered period while another plant has some answers with its lines
     at ₹0 (leaf).
   - Saved views and pins saved with no period keep running as saved (spec Out of scope): an edited
     selection never gets this period choice (leaf).
4. Spec criterion 12 and the "Every successful data answer shows its period under the title"
   paragraph.
   - Under the title, beside the plant readout, one line: the exact dates of
     `response.appliedTimeWindow`, formatted like "1 Jul 2026 – 31 Jul 2026" (en-IN, numeric day,
     short month, numeric year, UTC), or, with no window, the coverage sentence from
     `periodControl.coverage`.
   - The coverage sentence renders once: the lower `ask-period-coverage` paragraph goes away.
   - The over- and under-budget readout (`appliedComparisonReadout`) no longer appends the period;
     the empty-comparison message keeps its "for <period>" wording.
   - Leaves in `ask-panel.test.tsx`: a July answer shows "1 Jul 2026 – 31 Jul 2026"; a
     year-to-date answer shows "1 Apr 2026 – 31 Jul 2026"; a no-window answer shows the coverage
     sentence exactly once; a comparison answer's readout carries no period; switching the period
     through the control re-renders the line with the new dates.
5. Spec Success measure, run by the coordinator after BP-ASK-WIRING and BP-PERIOD-LINE merge, on
   master, live Bedrock and the July warehouse, as the seeded DUB-only reader, each question in a
   fresh conversation, 4 runs each: "Which GL codes had Actual over Budget?" (choice shown; choosing
   July gives 21 codes, 50001201 at 83,98,339), "Show Actual and Budget by GL code" (choice shown;
   Budget for July only), "Which GL codes are under budget?" (choice shown; July on both sides);
   each answer shows "1 Jul 2026 – 31 Jul 2026" under its title. "Show Actual by GL code" answers at
   once 4 of 4. Recorded in `docs/memory/ask-budget-period-live-check.md` with each run's full
   selection, and in the part's last commit under `Functional check:`.

### The rules contract (pinned by BP-PERIOD-POLICY, used by BP-ASK-WIRING)

`backend/src/chat/ask-budget-period.ts` exports, with no service dependency:

```ts
/** True when a governed-financial selection sets Actual against Budget (Done-when 1 trigger). */
export function needsComparisonPeriod(selection: Selection): boolean;
/** True when a measureFilters entry compares governed-financial.actual and governed-financial.budget. */
export function hasBudgetComparisonFilter(selection: Selection): boolean;

export interface ComparisonPeriodInput {
  /** The server's plant set, canonical codes, sorted. */
  chosenPlants: string[];
  /** findActiveActualMonthsForPlants(chosenPlants): first-of-month dates, newest first. */
  actualMonths: string[];
  /** The chosen plants that are their format's budget owner plant (DUB today), sorted. */
  budgetedPlants: string[];
  /** findActiveActualMonthsForPlants(budgetedPlants), or [] when budgetedPlants is empty. */
  budgetedActualMonths: string[];
  /** findActiveBudgetPeriods over the span of actualMonths: first-of-month dates. */
  loadedBudgetMonths: string[];
  /** hasBudgetComparisonFilter(selection). */
  comparisonFilter: boolean;
  /** The selection's time column, "month" for governed-financial. */
  timeColumn: string;
}

export type ComparisonPeriodOutcome =
  | { kind: "no-actuals" }
  | { kind: "no-budget"; leftOut: string[] }
  | { kind: "choose"; options: AskPeriodOption[] };

export function comparisonPeriodOutcome(input: ComparisonPeriodInput): ComparisonPeriodOutcome;
```

- `no-actuals` when `actualMonths` is empty. The wiring answers `NotSupported` with the copy in
  Done-when detail 2.
- `no-budget` when `comparisonFilter` is true and no window qualifies; `leftOut` holds the chosen
  plants' canonical codes not in `budgetedPlants` plus any budgeted plant with no qualifying
  window, sorted. The wiring maps them to display names and returns the existing Informational
  no-budget answer (`leftOut: { reason: "budget-not-loaded", plants }`, `viewInReport` unavailable).
- `choose` otherwise. With `comparisonFilter`, the months come from `budgetedActualMonths` and a
  window qualifies only when every month in it is in `loadedBudgetMonths`; without it, the months
  come from `actualMonths`. Options are those months newest first, then the year-to-date option
  (left out when it equals a month option), each a complete `AskPeriodOption`.

## Tasks

| ID | Name | What it delivers | Covers | Scope | Tests | After | User-facing |
|---|---|---|---|---|---|---|---|
| BP-ACTUAL-MONTHS | Months with actuals per plant set | A warehouse lookup returning the months that have at least one actual row in an active actual batch for a given plant set, newest first, as first-of-month dates; it pins the interface `findActiveActualMonthsForPlants(plants: string[]): Promise<string[]>` on `DrillTransactionsRepository`. | 1 | `backend/src/warehouse/drill-transactions.repository.ts`, `backend/src/warehouse/drill-transactions.repository.test.ts`, `backend/src/warehouse/drill-transactions.db.test.ts` | SQL-shape leaves (plant list quoted, active batches only, newest first) in the repository test; a gated leaf in the db test where CHIR has July rows and VJM none | none | no |
| BP-PERIOD-POLICY | The comparison period rules | A pure module with the trigger, the option builder (months newest first, the financial year to date and its April rule, the budget-coverage rule for comparison filters) and the ordered outcome, with no service dependency; it pins the rules contract above (`needsComparisonPeriod`, `hasBudgetComparisonFilter`, `ComparisonPeriodInput`, `ComparisonPeriodOutcome`, `comparisonPeriodOutcome`) for BP-ASK-WIRING. | 1, 2 | `backend/src/chat/ask-budget-period.ts`, `backend/src/chat/ask-budget-period.test.ts`, `backend/package.json`, `tools/quality-gate.test.mjs` | `ask-budget-period.test.ts`: the trigger table, options, year to date, April, budget coverage per plant, outcome order; the file registered in `test:hermetic` and in the quality gate's pinned list | none | no |
| BP-ASK-WIRING | Ask asks for the comparison period | The Ask service calls the rules after the plant step for governed-financial questions with no window left after follow-up inheritance, returns the period choice or the plain outcomes, reads no figure before the choice, and gives the answer a period control over the same options. | 1, 2, 3 | `backend/src/chat/chat.service.ts`, `backend/src/chat/chat.service.test.ts`, `backend/src/chat/chat.constants.ts` | `chat.service.test.ts` flow leaves under Done-when 1-3 (no figure read before the choice, zero selector calls on the continuation, follow-up inheritance, named-period and Actual-only or Budget-only answers, edited selections, the statement plant with no rows) | BP-ACTUAL-MONTHS, BP-PERIOD-POLICY | yes |
| BP-PERIOD-LINE | The answer's period line | The exact-dates or coverage line under every answer's title, the coverage sentence rendered once, and the comparison readout without the period. | 4 | `frontend/src/features/assistant/ask-panel.tsx`, `frontend/src/features/assistant/ask-panel.test.tsx`, `frontend/app/globals.css` | `ask-panel.test.tsx` leaves under Done-when 4 | none | yes |
| BP-LIVE | The live check | The Success measure run on master and its record. | 5 | `docs/memory/ask-budget-period-live-check.md` | none (a recorded live check) | BP-ASK-WIRING, BP-PERIOD-LINE | yes |

New moving parts: none

## Notes

- No selector schema or prompt change: the trigger reads the selection the selector already
  produces, so the live model's choices should not shift (AGENTS.md Known traps). BP-LIVE re-runs
  the ASK-MULTI-PLANT success questions once as a guard.
- Gated warehouse tests run only against the throwaway Postgres on 5434 (AGENTS.md Known traps).
- Every code part runs `npm run test:hermetic`, `npm run typecheck`, `npm run structural` and
  `npm run quality` (formatting and lint for backend and frontend) before its last commit; Forge's
  own test command does not include `quality`.
- New moving parts stays "none": the lookup is one more query on the existing warehouse repository
  and the rules are a pure module in the existing chat feature, like `plant-set.ts` and
  `ask-budget-states.ts`; neither is a new dependency, service, datastore, queue, job or layer. The
  rules are a separate module so their many cases are proven without the Ask service's
  dependencies.
- The browser and running-API proof for user-facing parts is the coordinator's live run recorded in
  each part's `Functional check:` paragraph; the repo has no browser test harness for Ask.
