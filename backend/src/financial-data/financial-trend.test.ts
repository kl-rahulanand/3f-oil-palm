import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialQueryResult, FinancialSelection } from "@3f/contract";
import type { Pool, QueryConfig } from "pg";
import { FinancialQueryRepository } from "./financial-query.repository";
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

  const selectedGls = completeMonthlyCoordinates(
    {
      ...selection("2026-04-01", "2026-05-31"),
      dimensionIds: ["gl", "month"],
      filters: [{ dimensionId: "gl", operator: "in", values: ["5001", "5002"] }],
    },
    [{ gl: "5001", month: "2026-04-01" }],
  );
  assert.deepEqual(
    selectedGls.map(({ gl, month }) => `${gl}:${month}`),
    ["5001:2026-04-01", "5001:2026-05-01", "5002:2026-04-01", "5002:2026-05-01"],
  );

  const plantCostCenters = completeMonthlyCoordinates(
    {
      ...selection("2026-04-01", "2026-05-31"),
      dimensionIds: ["plant", "cost_center", "month"],
      plantIds: ["DUB", "CHIR"],
      filters: [{ dimensionId: "cost_center", operator: "in", values: ["DUB-CC", "CHIR-CC"] }],
    },
    [
      { plant: "DUB", cost_center: "DUB-CC", month: "2026-04-01" },
      { plant: "CHIR", cost_center: "CHIR-CC", month: "2026-04-01" },
    ],
  );
  assert.deepEqual(
    plantCostCenters.map(({ plant, cost_center, month }) => `${plant}:${cost_center}:${month}`),
    ["CHIR:CHIR-CC:2026-04-01", "CHIR:CHIR-CC:2026-05-01", "DUB:DUB-CC:2026-04-01", "DUB:DUB-CC:2026-05-01"],
  );
});

test("done-when 1 and 2: repository keeps every explicitly selected GL gap without inventing values", async () => {
  const result = await new FinancialQueryRepository(selectedGlGapDatabase()).query({
    ...selection("2026-04-01", "2026-05-31"),
    dimensionIds: ["gl", "month"],
    filters: [{ dimensionId: "gl", operator: "in", values: ["5001", "5002"] }],
  });

  assert.deepEqual(
    result.rows.map(({ dimensions, values }) => ({
      dimensions,
      actual: values.actual && {
        state: values.actual.state,
        value: values.actual.value,
        label: values.actual.label,
        hasDrilldown: values.actual.drilldownId !== null,
      },
    })),
    [
      { dimensions: { gl: "5001", month: "2026-04-01" }, actual: exactActual("12.00") },
      { dimensions: { gl: "5001", month: "2026-05-01" }, actual: exactActual("0.00") },
      { dimensions: { gl: "5002", month: "2026-04-01" }, actual: exactActual("0.00") },
      { dimensions: { gl: "5002", month: "2026-05-01" }, actual: exactActual("0.00") },
    ],
  );
});

test("done-when 1 and 2: repository retains a catalog-valid empty coordinate across noncontinuous source months", async () => {
  const result = await new FinancialQueryRepository(catalogGapDatabase()).query({
    ...selection("2026-04-01", "2026-06-30"),
    dimensionIds: ["plant", "cost_center", "month"],
    filters: [{ dimensionId: "cost_center", operator: "eq", value: "DUB-EMPTY" }],
  });

  assert.deepEqual(
    result.rows.map(({ dimensions, values }) => ({
      dimensions,
      actual: values.actual?.state,
      value: values.actual?.value,
      availableSubtotal: values.availableActualSubtotal?.value,
    })),
    [
      {
        dimensions: { plant: "DUB", cost_center: "DUB-EMPTY", month: "2026-04-01" },
        actual: "available",
        value: "0.00",
        availableSubtotal: undefined,
      },
      {
        dimensions: { plant: "DUB", cost_center: "DUB-EMPTY", month: "2026-05-01" },
        actual: "not_loaded",
        value: null,
        availableSubtotal: undefined,
      },
      {
        dimensions: { plant: "DUB", cost_center: "DUB-EMPTY", month: "2026-06-01" },
        actual: "not_loaded",
        value: null,
        availableSubtotal: "0.00",
      },
    ],
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

test("done-when 2: a period Roll-over uses only the stored closing-month balances", async () => {
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

  const result = await new FinancialQueryRepository(missingClosingMonthDatabase()).query({
    ...selection("2026-04-01", "2026-05-31"),
    measureIds: ["rollover"],
  });
  assert.deepEqual(result.totals.rollover, {
    state: "not_loaded",
    value: null,
    label: "Budget not loaded for this Plant or month",
  });

  const storedClosing = await new FinancialQueryRepository(storedClosingRolloverDatabase()).query({
    ...selection("2026-04-01", "2026-05-31"),
    measureIds: ["rollover"],
  });
  assert.deepEqual(storedClosing.totals.rollover, {
    state: "available",
    value: "15.00",
    label: "Roll-over",
  });
});

function missingClosingMonthDatabase(): Pick<Pool, "query"> {
  return {
    query: async (input: string | QueryConfig) => {
      const sql = typeof input === "string" ? input : input.text;
      if (sql.includes("dataset_key = $1 AND state = 'active'")) return rows([{ id: "batch-id" }]);
      if (sql.includes("FROM agent_financial.plant")) return rows([{ id: "plant-id", code: "DUB" }]);
      if (sql.includes("source_reporting_months::text[]")) {
        return rows([
          {
            id: "batch-id",
            source_reporting_months: ["2026-04-01"],
            actual_coverage: [],
            budget_coverage: [{ plantId: "plant-id", month: "2026-04-01", completeness: "confirmed" }],
          },
        ]);
      }
      if (sql.includes("FROM contributing_actuals")) return rows([]);
      if (sql.includes("FROM agent_financial.nursery_budget n")) {
        return rows([
          {
            plant: "DUB",
            month: "2026-04-01",
            gl: null,
            nursery_component: "seedlings",
            budget_amount: "10.00",
            rollover_amount: "10.00",
          },
        ]);
      }
      if (sql.includes("WITH RECURSIVE ancestry")) return rows([]);
      throw new Error(`Unexpected financial repository query: ${sql}`);
    },
  } as unknown as Pick<Pool, "query">;
}

function selectedGlGapDatabase(): Pick<Pool, "query"> {
  return financialRepositoryDatabase({
    sourceMonths: ["2026-04-01", "2026-05-01"],
    actualCoverage: [
      { plantId: "plant-id", month: "2026-04-01", completeness: "confirmed" },
      { plantId: "plant-id", month: "2026-05-01", completeness: "confirmed" },
    ],
    actualRows: [
      {
        id: "actual-id",
        plant: "DUB",
        month: "2026-04-01",
        gl: "5001",
        cost_center: null,
        nursery_component: null,
        section: null,
        consideration: null,
        short_name: null,
        contra_account: null,
        origin: null,
        location: null,
        actual_amount: "12.00",
      },
    ],
  });
}

function catalogGapDatabase(): Pick<Pool, "query"> {
  return financialRepositoryDatabase({
    sourceMonths: ["2026-04-01", "2026-06-01"],
    actualCoverage: [{ plantId: "plant-id", month: "2026-04-01", completeness: "confirmed" }],
    actualRows: [],
    catalogRows: [
      {
        plant: "DUB",
        gl: null,
        cost_center: "DUB-EMPTY",
        nursery_component: null,
        section: null,
        consideration: null,
        short_name: null,
        contra_account: null,
        origin: null,
        location: null,
      },
    ],
  });
}

function storedClosingRolloverDatabase(): Pick<Pool, "query"> {
  return financialRepositoryDatabase({
    sourceMonths: [],
    actualCoverage: [],
    actualRows: [],
    budgetCoverage: [
      { plantId: "plant-id", month: "2026-04-01", completeness: "confirmed" },
      { plantId: "plant-id", month: "2026-05-01", completeness: "confirmed" },
    ],
    budgetRows: [
      budgetRow("2026-04-01", "100.00"),
      budgetRow("2026-05-01", "-25.00"),
      budgetRow("2026-05-01", "40.00"),
    ],
  });
}

function financialRepositoryDatabase(input: {
  sourceMonths: string[];
  actualCoverage: Array<{ plantId: string; month: string; completeness: "confirmed" }>;
  actualRows: Array<Record<string, unknown> & { id: string }>;
  catalogRows?: Array<Record<string, string | null>>;
  budgetCoverage?: Array<{ plantId: string; month: string; completeness: "confirmed" }>;
  budgetRows?: Array<Record<string, unknown>>;
}): Pick<Pool, "query"> {
  return {
    query: async (query: string | QueryConfig) => {
      const sql = typeof query === "string" ? query : query.text;
      if (sql.includes("dataset_key = $1 AND state = 'active'")) return rows([{ id: "batch-id" }]);
      if (sql.includes("FROM agent_financial.plant")) return rows([{ id: "plant-id", code: "DUB" }]);
      if (sql.includes("source_reporting_months::text[]")) {
        return rows([
          {
            id: "batch-id",
            source_reporting_months: input.sourceMonths,
            actual_coverage: input.actualCoverage,
            budget_coverage: input.budgetCoverage ?? [],
          },
        ]);
      }
      if (sql.includes("FROM contributing_actuals")) return rows(input.actualRows.map(({ id }) => ({ id })));
      if (sql.includes("WHERE a.id = ANY")) return rows(input.actualRows);
      if (sql.includes("financial coordinate catalog")) return rows(input.catalogRows ?? []);
      if (sql.includes("FROM agent_financial.nursery_budget n")) return rows(input.budgetRows ?? []);
      if (sql.includes("WITH RECURSIVE ancestry")) return rows([]);
      throw new Error(`Unexpected financial repository query: ${sql}`);
    },
  } as unknown as Pick<Pool, "query">;
}

function budgetRow(month: string, rolloverAmount: string) {
  return {
    plant: "DUB",
    month,
    gl: null,
    nursery_component: "seedlings",
    budget_amount: "0.00",
    rollover_amount: rolloverAmount,
  };
}

function exactActual(value: string) {
  return { state: "available", value, label: "Actual", hasDrilldown: true };
}

function rows<T>(items: T[]) {
  return { rows: items };
}

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
