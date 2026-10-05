import type { AskPeriodOption, Selection } from "@3f/contract";

const DOMAIN = "governed-financial";
const ACTUAL = "governed-financial.actual";
const BUDGET = "governed-financial.budget";
const PERCENTAGE = "governed-financial.percentage";
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** True when a governed-financial selection sets Actual against Budget. */
export function needsComparisonPeriod(selection: Selection): boolean {
  if (selection.domain !== DOMAIN) return false;
  const measures = new Set(selection.measureIds);
  return (
    measures.has(PERCENTAGE) || (measures.has(ACTUAL) && measures.has(BUDGET)) || hasBudgetComparisonFilter(selection)
  );
}

/** True when a filter compares governed-financial Actual and Budget. */
export function hasBudgetComparisonFilter(selection: Selection): boolean {
  if (selection.domain !== DOMAIN) return false;
  return Boolean(
    selection.measureFilters?.some(
      ({ measureId, compareTo }) =>
        compareTo.kind === "measure" &&
        ((measureId === ACTUAL && compareTo.measureId === BUDGET) ||
          (measureId === BUDGET && compareTo.measureId === ACTUAL)),
    ),
  );
}

export interface ComparisonPeriodInput {
  chosenPlants: string[];
  actualMonths: string[];
  budgetedPlants: string[];
  budgetedActualMonths: string[];
  loadedBudgetMonths: string[];
  comparisonFilter: boolean;
  timeColumn: string;
}

export type ComparisonPeriodOutcome =
  { kind: "no-actuals" } | { kind: "no-budget"; leftOut: string[] } | { kind: "choose"; options: AskPeriodOption[] };

export function comparisonPeriodOutcome(input: ComparisonPeriodInput): ComparisonPeriodOutcome {
  if (input.actualMonths.length === 0) return { kind: "no-actuals" };

  const months = newestFirst(input.comparisonFilter ? input.budgetedActualMonths : input.actualMonths);
  const options = periodOptions(months, input.timeColumn).filter(
    (option) => !input.comparisonFilter || hasBudgetForEveryMonth(option, input.loadedBudgetMonths),
  );

  if (input.comparisonFilter && options.length === 0) {
    return { kind: "no-budget", leftOut: [...new Set(input.chosenPlants)].sort() };
  }
  return { kind: "choose", options };
}

function periodOptions(months: string[], column: string): AskPeriodOption[] {
  const options = months.map((month) => monthOption(month, column));
  const newest = months[0];
  if (!newest || monthNumber(newest) === 4) return options;

  const startYear = monthNumber(newest) < 4 ? year(newest) - 1 : year(newest);
  const from = `${startYear}-04-01`;
  const to = monthEnd(newest);
  return [
    ...options,
    {
      value: `${from}:${to}`,
      label: financialYearToDateLabel(from, newest),
      timeWindow: { grain: "month", column, from, to },
    },
  ];
}

function monthOption(month: string, column: string): AskPeriodOption {
  return {
    value: month,
    label: `${MONTH_NAMES[monthNumber(month) - 1]} ${year(month)}`,
    timeWindow: { grain: "month", column, from: month, to: monthEnd(month) },
  };
}

function financialYearToDateLabel(from: string, newest: string): string {
  const startYear = year(from);
  const endYear = year(newest);
  const endMonth = MONTH_NAMES[monthNumber(newest) - 1];
  const range =
    startYear === endYear ? `April – ${endMonth} ${endYear}` : `April ${startYear} – ${endMonth} ${endYear}`;
  return `Financial year to date (${range})`;
}

function hasBudgetForEveryMonth(option: AskPeriodOption, loadedBudgetMonths: readonly string[]): boolean {
  const loaded = new Set(loadedBudgetMonths);
  return monthsBetween(option.timeWindow.from, option.timeWindow.to).every((month) => loaded.has(month));
}

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  const end = new Date(`${to}T00:00:00Z`);
  const cursor = new Date(`${from}T00:00:00Z`);
  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7) + "-01");
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function newestFirst(months: readonly string[]): string[] {
  return [...new Set(months)].sort((left, right) => right.localeCompare(left));
}

function monthEnd(month: string): string {
  const date = new Date(Date.UTC(year(month), monthNumber(month), 0));
  return date.toISOString().slice(0, 10);
}

function year(month: string): number {
  return Number(month.slice(0, 4));
}

function monthNumber(month: string): number {
  return Number(month.slice(5, 7));
}
