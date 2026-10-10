import type {
  FinancialDimensionId,
  FinancialMonthlyDelta,
  FinancialQueryResult,
  FinancialSelection,
} from "@3f/contract";

const MONEY_SCALE = 100n;
const PERCENTAGE_SCALE = 1_000_000n;
const DELTA_MEASURES = ["actual", "budget", "rollover"] as const;

export type FinancialCoordinates = Partial<Record<FinancialDimensionId, string | null>>;

export function completeMonthlyCoordinates(
  selection: FinancialSelection,
  coordinates: readonly FinancialCoordinates[],
  catalogCoordinates: readonly FinancialCoordinates[] = [],
): FinancialCoordinates[] {
  if (!selection.dimensionIds.includes("month")) return [...coordinates];

  const otherDimensions = selection.dimensionIds.filter((dimensionId) => dimensionId !== "month");
  const bases = new Map<string, FinancialCoordinates>();
  const addBase = (base: FinancialCoordinates) =>
    bases.set(coordinateKey(otherDimensions, base), Object.fromEntries(otherDimensions.map((id) => [id, base[id]])));

  coordinates.forEach((coordinate) => addBase(coordinate));
  catalogCoordinates.forEach((coordinate) => addBase(coordinate));
  if (!otherDimensions.length) addBase({});

  if (otherDimensions.length === 1) {
    const dimensionId = otherDimensions[0]!;
    for (const value of selectionValues(selection, dimensionId)) addBase({ [dimensionId]: value });
  }

  const result = [...bases.values()].flatMap((base) =>
    months(selection.timeWindow.from, selection.timeWindow.to).map((month) => ({ ...base, month })),
  );
  return result.sort((left, right) =>
    coordinateKey(selection.dimensionIds, left).localeCompare(coordinateKey(selection.dimensionIds, right)),
  );
}

export function buildFinancialMonthlyDeltas(result: FinancialQueryResult): FinancialMonthlyDelta[] {
  if (!result.selection.dimensionIds.includes("month")) return [];

  const otherDimensions = result.selection.dimensionIds.filter((dimensionId) => dimensionId !== "month");
  const series = new Map<string, FinancialQueryResult["rows"]>();
  for (const row of result.rows) {
    const key = coordinateKey(otherDimensions, row.dimensions);
    series.set(key, [...(series.get(key) ?? []), row]);
  }

  const deltas: FinancialMonthlyDelta[] = [];
  for (const rows of series.values()) {
    rows.sort((left, right) => String(left.dimensions.month).localeCompare(String(right.dimensions.month)));
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]!;
      const current = rows[index]!;
      if (nextMonth(String(previous.dimensions.month)) !== current.dimensions.month) continue;
      for (const measureId of DELTA_MEASURES.filter((candidate) => result.selection.measureIds.includes(candidate))) {
        deltas.push(monthlyDelta(result.resultId, measureId, previous, current));
      }
    }
  }
  return deltas;
}

export function sumClosingMonthRollover(
  facts: readonly { month: string; rollover: bigint }[],
  closingMonth: string,
): bigint {
  return facts.reduce((total, fact) => total + (fact.month === closingMonth ? fact.rollover : 0n), 0n);
}

function monthlyDelta(
  resultId: string,
  measureId: (typeof DELTA_MEASURES)[number],
  previous: FinancialQueryResult["rows"][number],
  current: FinancialQueryResult["rows"][number],
): FinancialMonthlyDelta {
  const identity = {
    resultId,
    measureId,
    previousRowKey: previous.key,
    currentRowKey: current.key,
  };
  const previousValue = availableValue(previous, measureId);
  const currentValue = availableValue(current, measureId);
  if (previousValue === null) {
    return { ...identity, amountChange: null, percentageChange: null, reason: "missing_previous" };
  }
  if (currentValue === null) {
    return { ...identity, amountChange: null, percentageChange: null, reason: "missing_current" };
  }

  const previousPaise = moneyToPaise(previousValue);
  const change = moneyToPaise(currentValue) - previousPaise;
  if (previousPaise === 0n) {
    return {
      ...identity,
      amountChange: paiseToMoney(change),
      percentageChange: null,
      reason: "previous_zero",
    };
  }
  if (previousPaise < 0n) {
    return {
      ...identity,
      amountChange: paiseToMoney(change),
      percentageChange: null,
      reason: "previous_negative",
    };
  }
  return {
    ...identity,
    amountChange: paiseToMoney(change),
    percentageChange: percentage(change, previousPaise),
    reason: "available",
  };
}

function availableValue(
  row: FinancialQueryResult["rows"][number],
  measureId: (typeof DELTA_MEASURES)[number],
): string | null {
  const value = row.values[measureId];
  return value?.state === "available" ? value.value : null;
}

function selectionValues(selection: FinancialSelection, dimensionId: FinancialDimensionId): Array<string | null> {
  let candidates: Set<string | null> | undefined = dimensionId === "plant" ? new Set(selection.plantIds) : undefined;
  const excluded = new Set<string | null>();
  for (const filter of selection.filters.filter((candidate) => candidate.dimensionId === dimensionId)) {
    if (filter.operator === "neq") {
      excluded.add(filter.value);
      continue;
    }
    const values =
      filter.operator === "in" ? new Set<string | null>(filter.values) : new Set<string | null>([filter.value]);
    candidates = candidates ? new Set([...candidates].filter((value) => values.has(value))) : values;
  }
  return candidates ? [...candidates].filter((value) => !excluded.has(value)) : [];
}

function coordinateKey(dimensions: readonly FinancialDimensionId[], coordinates: FinancialCoordinates): string {
  return JSON.stringify(dimensions.map((dimensionId) => coordinates[dimensionId] ?? null));
}

function months(from: string, to: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00.000Z`);
  while (cursor.toISOString().slice(0, 7) <= to.slice(0, 7)) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function nextMonth(month: string): string {
  const next = new Date(`${month}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString().slice(0, 10);
}

function moneyToPaise(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const paise = BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -paise : paise;
}

function paiseToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / MONEY_SCALE}.${String(absolute % MONEY_SCALE).padStart(2, "0")}`;
}

function percentage(numerator: bigint, denominator: bigint): string {
  const scaled = divideRounded(numerator * 100n * PERCENTAGE_SCALE, denominator);
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const fraction = String(absolute % PERCENTAGE_SCALE)
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / PERCENTAGE_SCALE}${fraction ? `.${fraction}` : ""}`;
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absoluteNumerator / absoluteDenominator;
  const rounded = absoluteNumerator % absoluteDenominator >= (absoluteDenominator + 1n) / 2n ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}
