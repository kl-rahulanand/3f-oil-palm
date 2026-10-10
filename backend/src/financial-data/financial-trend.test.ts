import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialQueryResult, FinancialSelection } from "@3f/contract";
import { buildFinancialMonthlyDeltas, completeMonthlyCoordinates, sumClosingMonthRollover } from "./financial-trend";

test("done-when 2: April financial years and cross-year ranges retain every chronological month", () => {
  const financialYear = selection("2025-04-01", "2026-03-31", "financial_ytd");
  const coordinates = completeMonthlyCoordinates(financialYear, []);

  assert.equal(coordinates.length, 12);
  assert.equal(coordinates[0]?.month, "2025-04-01");
  assert.equal(coordinates[8]?.month, "2025-12-01");
  assert.equal(coordinates[9]?.month, "2026-01-01");
  assert.equal(coordinates[11]?.month, "2026-03-01");

  const crossYear = completeMonthlyCoordinates(selection("2025-12-01", "2026-02-28"), [{ month: "2026-01-01" }]);
  assert.deepEqual(
    crossYear.map(({ month }) => month),
    ["2025-12-01", "2026-01-01", "2026-02-01"],
  );

  const emptyPlants = completeMonthlyCoordinates(
    { ...selection("2026-04-01", "2026-05-31"), dimensionIds: ["plant", "month"], plantIds: ["DUB", "CHIR"] },
    [],
  );
  assert.deepEqual(
    emptyPlants.map(({ plant, month }) => `${plant}:${month}`),
    ["CHIR:2026-04-01", "CHIR:2026-05-01", "DUB:2026-04-01", "DUB:2026-05-01"],
  );
});

test("done-when 2: monthly changes keep exact money and reject zero, negative, or missing percentage baselines", () => {
  const result = trendResult([
    ["2025-04-01", available("100.00")],
    ["2025-05-01", available("125.25")],
    ["2025-06-01", available("0.00")],
    ["2025-07-01", available("5.00")],
    ["2025-08-01", available("-2.00")],
    ["2025-09-01", available("-4.00")],
    ["2025-10-01", available("3.00")],
    ["2025-11-01", unavailable()],
    ["2025-12-01", available("4.00")],
    ["2026-01-01", unavailable()],
  ]);

  assert.deepEqual(
    buildFinancialMonthlyDeltas(result).map(({ amountChange, percentageChange, reason }) => ({
      amountChange,
      percentageChange,
      reason,
    })),
    [
      { amountChange: "25.25", percentageChange: "25.25", reason: "available" },
      { amountChange: "-125.25", percentageChange: "-100", reason: "available" },
      { amountChange: "5.00", percentageChange: null, reason: "previous_zero" },
      { amountChange: "-7.00", percentageChange: "-140", reason: "available" },
      { amountChange: "-2.00", percentageChange: null, reason: "previous_negative" },
      { amountChange: "7.00", percentageChange: null, reason: "previous_negative" },
      { amountChange: null, percentageChange: null, reason: "missing_current" },
      { amountChange: null, percentageChange: null, reason: "missing_previous" },
      { amountChange: null, percentageChange: null, reason: "missing_current" },
    ],
  );
});

test("done-when 1 and 2: partial Actual subtotals stay table-only and never become changes", () => {
  const result = trendResult([
    ["2026-04-01", partial("40.00")],
    ["2026-05-01", available("50.00")],
    ["2026-06-01", partial("60.00")],
  ]);

  assert.deepEqual(
    buildFinancialMonthlyDeltas(result).map(({ amountChange, percentageChange, reason }) => ({
      amountChange,
      percentageChange,
      reason,
    })),
    [
      { amountChange: null, percentageChange: null, reason: "missing_previous" },
      { amountChange: null, percentageChange: null, reason: "missing_current" },
    ],
  );
});

test("done-when 2: a period Roll-over uses only the stored closing-month balances", () => {
  assert.equal(
    sumClosingMonthRollover(
      [
        { month: "2026-04-01", rollover: 10_000n },
        { month: "2026-05-01", rollover: -2_500n },
        { month: "2026-05-01", rollover: 4_000n },
      ],
      "2026-05-01",
    ),
    1_500n,
  );
  assert.equal(sumClosingMonthRollover([{ month: "2026-04-01", rollover: 10_000n }], "2026-05-01"), 0n);
});

function selection(from: string, to: string, kind: "range" | "financial_ytd" = "range"): FinancialSelection {
  return {
    measureIds: ["actual"],
    dimensionIds: ["month"],
    plantIds: ["DUB"],
    timeWindow: { kind, from, to },
    filters: [],
  };
}

function trendResult(values: Array<[string, TrendActual]>): FinancialQueryResult {
  const from = values[0]![0];
  const lastMonth = values.at(-1)![0];
  const end = new Date(`${lastMonth}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return {
    resultId: "trend-result",
    selection: selection(from, end.toISOString().slice(0, 10)),
    scope: { plantIds: ["DUB"], from, to: end.toISOString().slice(0, 10) },
    rows: values.map(([month, input], index) => ({
      key: `month-${index + 1}`,
      dimensions: { month },
      values: {
        actual: input.actual,
        ...(input.partial !== undefined
          ? {
              availableActualSubtotal: {
                value: input.partial,
                label: "Available-data Actual subtotal — completeness unconfirmed" as const,
                drilldownId: `partial-${index + 1}`,
              },
            }
          : {}),
      },
    })),
    totals: { actual: unavailable().actual },
    coverage: values.map(([month, input]) => ({
      plantId: "DUB",
      month,
      actual: input.coverage,
      budget: "not_loaded" as const,
    })),
  };
}

interface TrendActual {
  actual: NonNullable<FinancialQueryResult["rows"][number]["values"]["actual"]>;
  coverage: FinancialQueryResult["coverage"][number]["actual"];
  partial?: string;
}

function available(value: string) {
  return {
    actual: { state: "available", value, label: "Actual", drilldownId: `drill-${value}` } as const,
    coverage: "complete" as const,
  };
}

function unavailable() {
  return {
    actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null } as const,
    coverage: "not_loaded" as const,
  };
}

function partial(value: string) {
  return { ...unavailable(), coverage: "unconfirmed" as const, partial: value };
}
