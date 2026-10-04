import { askRowKey, type AskBudgetState, type ResultTable, type Selection } from "@3f/contract";
import { comparePlantCodes } from "./plant-set";

interface BudgetStateInput {
  selection: Selection;
  result: ResultTable;
  budgetOwnerPlant: string;
  answerMonths: readonly string[];
  loadedBudgetMonths: readonly string[];
}

export function applyBudgetStates(input: BudgetStateInput): {
  result: ResultTable;
  budgetStates?: AskBudgetState[];
} {
  const budgetKey = measureOutputKey(input.selection.measureIds, ["budget", "budget_net"]);
  const percentageKey = measureOutputKey(input.selection.measureIds, ["percentage"]);
  if (!budgetKey && !percentageKey) return { result: input.result };

  const selectedPlants = selectedPlantCodes(input.selection);
  const loadedMonths = new Set(input.loadedBudgetMonths.map(monthStart));
  const includesPlant = input.selection.dimensionIds.includes("plant");
  const includesMonth = input.selection.dimensionIds.includes("month");
  const budgetStates = input.result.rows.map((row): AskBudgetState => {
    const plantsInRow = (includesPlant ? [String(row.plant)] : selectedPlants).sort(comparePlantCodes);
    const coveredMonths = includesMonth ? [monthStart(String(row.month))] : input.answerMonths.map(monthStart);
    const ownerIsLoaded = coveredMonths.length > 0 && coveredMonths.every((month) => loadedMonths.has(month));
    const plantsWithBudget =
      plantsInRow.includes(input.budgetOwnerPlant) && ownerIsLoaded ? [input.budgetOwnerPlant] : [];
    const state =
      plantsWithBudget.length === plantsInRow.length
        ? "loaded"
        : plantsWithBudget.length === 0
          ? "not-loaded"
          : "partial";
    return {
      key: askRowKey(row, input.selection.dimensionIds),
      state,
      plantsWithBudget,
      plantsInRow,
    };
  });
  const stateByKey = new Map(budgetStates.map((state) => [state.key, state]));
  return {
    budgetStates,
    result: {
      columns: input.result.columns,
      rows: input.result.rows.map((row) => {
        const state = stateByKey.get(askRowKey(row, input.selection.dimensionIds));
        if (!state || state.state === "loaded") return row;
        return {
          ...row,
          ...(budgetKey ? { [budgetKey]: null } : {}),
          ...(percentageKey ? { [percentageKey]: null } : {}),
        };
      }),
    },
  };
}

export function monthsInWindow(from: string, to: string): string[] {
  const start = new Date(`${monthStart(from)}T00:00:00.000Z`);
  const end = new Date(`${monthStart(to)}T00:00:00.000Z`);
  const months: string[] = [];
  for (const cursor = start; cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(cursor.toISOString().slice(0, 7) + "-01");
  }
  return months;
}

export function comparisonNeedsBudget(selection: Selection): boolean {
  return Boolean(
    selection.measureFilters?.some(
      (filter) =>
        isBudgetMeasure(filter.measureId) ||
        (filter.compareTo.kind === "measure" && isBudgetMeasure(filter.compareTo.measureId)),
    ),
  );
}

function selectedPlantCodes(selection: Selection): string[] {
  const filter = selection.filters.find(({ dimensionId }) => dimensionId === "plant");
  return filter?.op === "in" && Array.isArray(filter.value) ? [...new Set(filter.value)].sort(comparePlantCodes) : [];
}

function measureOutputKey(measureIds: readonly string[], names: readonly string[]): string | undefined {
  return measureIds.map((measureId) => measureId.split(".").at(-1)!).find((name) => names.includes(name));
}

function isBudgetMeasure(measureId: string): boolean {
  return ["budget", "budget_net", "percentage"].includes(measureId.split(".").at(-1)!);
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}
