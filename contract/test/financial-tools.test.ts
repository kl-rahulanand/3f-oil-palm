import assert from "node:assert/strict";
import { test } from "node:test";
import { ZodError } from "zod";

import {
  FINANCIAL_TOOL_DEFINITIONS,
  actualTransactionPageSchema,
  financialCatalogSchema,
  financialQueryResultSchema,
  financialSelectionSchema,
  moneySchema,
} from "../src/index";

const selection = {
  measureIds: ["actual", "budget"],
  dimensionIds: ["gl"],
  plantIds: ["DUB"],
  timeWindow: { kind: "range", from: "2026-04-01", to: "2026-08-31" },
  filters: [{ dimensionId: "gl", operator: "in", values: ["55010305"] }],
  comparisons: ["actual_vs_budget"],
};

const catalog = {
  measures: [
    { id: "actual", label: "Actual", description: "Debit minus Credit from authorized source transactions." },
    { id: "budget", label: "Budget", description: "Loaded monthly Nursery Budget leaf amounts." },
  ],
  dimensions: [
    {
      id: "plant",
      label: "Plant",
      description: "An authorized operating Plant.",
      supportedMeasureIds: ["actual", "budget"],
    },
  ],
  combinations: [{ measureIds: ["actual", "budget"], dimensionIds: ["plant"] }],
  timeWindows: ["month", "range", "financial_ytd"],
  fiscalYearStartMonth: 4,
  limits: {
    maxAggregateRows: 199,
    maxPreparedActualScopes: 200,
    preparedTransactionRows: 10,
    defaultContinuationRows: 20,
    maxContinuationRows: 100,
  },
};

const result = {
  resultId: "result-1",
  selection,
  scope: { plantIds: ["DUB"], from: "2026-04-01", to: "2026-08-31" },
  rows: [
    {
      key: "gl:55010305",
      dimensions: { gl: "55010305" },
      values: {
        actual: {
          state: "available",
          value: "900719925474099312345678.90",
          label: "Actual",
          drilldownId: "drill-1",
        },
        budget: { state: "available", value: "100.00", label: "Budget" },
        percentage: { state: "available", value: "900719925474099312345.6789", label: "Percentage" },
      },
    },
  ],
  totals: {
    actual: {
      state: "available",
      value: "900719925474099312345678.90",
      label: "Actual",
      drilldownId: "drill-total",
    },
    budget: { state: "available", value: "100.00", label: "Budget" },
    percentage: { state: "available", value: "900719925474099312345.6789", label: "Percentage" },
  },
  coverage: ["04", "05", "06", "07", "08"].map((month) => ({
    plantId: "DUB",
    month: `2026-${month}-01`,
    actual: "complete",
    budget: "loaded",
  })),
};

const page = {
  drilldownId: "drill-1",
  transactions: [
    {
      id: "row-1",
      transactionNumber: "TX-1",
      lineId: "1",
      postingDate: "2026-04-15",
      reportingMonth: "2026-04-01",
      plantId: "DUB",
      plantLabel: "DUB",
      costCenterId: null,
      costCenterLabel: "Cost Center not assigned",
      glAccountId: "gl-1",
      glCode: "55010305",
      glName: "Example GL",
      debit: "100.00",
      credit: "25.00",
      actual: "75.00",
      memo: null,
      reference: null,
    },
  ],
  page: 1,
  limit: 10,
  totalItems: 1,
  totalPages: 1,
  matchingActualTotal: "75.00",
  preparedSize: 10,
  defaultContinuationLimit: 20,
  pinnedContinuationLimit: null,
};

function assertOnlyZodIssue(run: () => unknown, path: string, message: string) {
  assert.throws(run, (error: unknown) => {
    if (!(error instanceof ZodError)) {
      return false;
    }
    assert.deepEqual(
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      [{ path, message }],
    );
    return true;
  });
}

test("exact money preserves large signed paise strings without numeric coercion", () => {
  for (const value of ["0.00", "-0.01", "900719925474099312345678.90"]) {
    assert.equal(moneySchema.parse(value), value);
  }
  for (const value of [0, "1", "1.0", "1.000", "01.00", "1e3"]) {
    assert.throws(() => moneySchema.parse(value));
  }
});

test("selection accepts only governed vocabulary and rejects SQL or unknown fields", () => {
  assert.deepEqual(financialSelectionSchema.parse(selection), selection);
  const percentageOnlySelection = {
    ...selection,
    measureIds: ["percentage"],
    timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
  };
  const partialMonthRange = {
    ...selection,
    timeWindow: { kind: "range", from: "2026-04-15", to: "2026-05-06" },
  };
  assert.deepEqual(
    [percentageOnlySelection, partialMonthRange].map(
      (candidate) => financialSelectionSchema.safeParse(candidate).success,
    ),
    [true, false],
  );
  assert.throws(() => financialSelectionSchema.parse({ ...selection, plantIds: ["DUB", "DUB"] }));
  assert.throws(() =>
    financialSelectionSchema.parse({ ...selection, measureIds: ["percentage"], comparisons: undefined }),
  );
  assert.throws(() => financialSelectionSchema.parse({ ...selection, sql: "select * from financial_actual" }));
  assert.throws(() => financialSelectionSchema.parse({ ...selection, measureIds: ["forecast"] }));
  assert.throws(() =>
    financialSelectionSchema.parse({
      ...selection,
      filters: [{ dimensionId: "gl", operator: "in", values: "55010305" }],
    }),
  );
  assert.throws(() =>
    financialSelectionSchema.parse({
      ...selection,
      filters: [{ dimensionId: "cost_center", operator: "eq", value: "CC-1" }],
    }),
  );
  assert.throws(() =>
    financialSelectionSchema.parse({
      ...selection,
      timeWindow: { kind: "month", from: "2026-04-01", to: "2026-05-31" },
    }),
  );
  assert.throws(() =>
    financialSelectionSchema.parse({
      ...selection,
      timeWindow: { kind: "financial_ytd", from: "2026-05-01", to: "2026-08-31" },
    }),
  );
});

test("catalog validates governed combinations, fiscal rules, and hard limits", () => {
  assert.deepEqual(financialCatalogSchema.parse(catalog), catalog);
  assert.throws(() => financialCatalogSchema.parse({ ...catalog, fiscalYearStartMonth: 1 }));
  assert.throws(() =>
    financialCatalogSchema.parse({
      ...catalog,
      combinations: [{ measureIds: ["budget"], dimensionIds: ["cost_center"] }],
    }),
  );
  assert.throws(() =>
    financialCatalogSchema.parse({
      ...catalog,
      dimensions: [{ ...catalog.dimensions[0], supportedMeasureIds: ["actual"] }],
    }),
  );
  assert.throws(() =>
    financialCatalogSchema.parse({ ...catalog, measures: [...catalog.measures, catalog.measures[0]] }),
  );
  assert.throws(() =>
    financialCatalogSchema.parse({
      ...catalog,
      measures: [catalog.measures[0]],
      combinations: [{ measureIds: ["actual"], dimensionIds: ["plant"] }],
    }),
  );
  const repeatedCombinationMeasure = {
    ...catalog,
    combinations: [{ measureIds: ["actual", "actual"], dimensionIds: ["plant"] }],
  };
  const repeatedCombinationDimension = {
    ...catalog,
    combinations: [{ measureIds: ["actual"], dimensionIds: ["plant", "plant"] }],
  };
  assert.deepEqual(
    [repeatedCombinationMeasure, repeatedCombinationDimension].map(
      (candidate) => financialCatalogSchema.safeParse(candidate).success,
    ),
    [false, false],
  );
});

test("query results preserve exact values and reject incomplete or ungoverned shapes", () => {
  assert.deepEqual(financialQueryResultSchema.parse(result), result);
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...result,
      totals: { ...result.totals, actual: { ...result.totals.actual, value: 75 } },
    }),
  );
  assert.throws(() => financialQueryResultSchema.parse({ ...result, rawRows: [] }));
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...result,
      totals: {
        ...result.totals,
        actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
      },
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...result,
      totals: { rollover: { state: "available", value: "10.00", label: "Roll-over" } },
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...result,
      coverage: result.coverage.map((entry, index) => (index === 0 ? { ...entry, actual: "unconfirmed" } : entry)),
    }),
  );

  const mixedCoverageResult = {
    resultId: "result-mixed",
    selection: {
      measureIds: ["actual"],
      dimensionIds: ["month"],
      plantIds: ["DUB"],
      timeWindow: { kind: "range", from: "2026-04-01", to: "2026-05-31" },
      filters: [],
    },
    scope: { plantIds: ["DUB"], from: "2026-04-01", to: "2026-05-31" },
    rows: [
      {
        key: "month:2026-04-01",
        dimensions: { month: "2026-04-01" },
        values: {
          actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
          availableActualSubtotal: {
            value: "25.00",
            label: "Available-data Actual subtotal — completeness unconfirmed",
            drilldownId: "drill-april",
          },
        },
      },
      {
        key: "month:2026-05-01",
        dimensions: { month: "2026-05-01" },
        values: { actual: { state: "available", value: "50.00", label: "Actual", drilldownId: "drill-may" } },
      },
    ],
    totals: { actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null } },
    coverage: [
      { plantId: "DUB", month: "2026-04-01", actual: "unconfirmed", budget: "loaded" },
      { plantId: "DUB", month: "2026-05-01", actual: "complete", budget: "loaded" },
    ],
  };
  mixedCoverageResult.totals.availableActualSubtotal = {
    value: "75.00",
    label: "Available-data Actual subtotal — completeness unconfirmed",
    drilldownId: "drill-mixed-total",
  };
  assert.deepEqual(financialQueryResultSchema.parse(mixedCoverageResult), mixedCoverageResult);
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...mixedCoverageResult,
      rows: mixedCoverageResult.rows.map((row, index) =>
        index === 0
          ? {
              ...row,
              values: { actual: { state: "available", value: "25.00", label: "Actual", drilldownId: "drill-april" } },
            }
          : row,
      ),
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...result,
      scope: { ...result.scope, plantIds: ["CHIR"] },
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...result,
      selection: { ...result.selection, plantIds: ["DUB", "CHIR"] },
      scope: { ...result.scope, plantIds: ["DUB", "DUB"] },
      coverage: [...result.coverage, ...result.coverage.map((entry) => ({ ...entry, plantId: "CHIR" }))],
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...result,
      rows: result.rows.map((row) => ({ ...row, dimensions: { ...row.dimensions, month: "2026-04-01" } })),
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...result,
      coverage: result.coverage.map((entry) => ({ ...entry, budget: "not_loaded" })),
      rows: result.rows.map((row) => ({
        ...row,
        values: {
          ...row.values,
          budget: { state: "no_gl_line", value: null, label: "No Budget line for this GL" },
          percentage: { state: "not_applicable", value: null, label: "Not applicable" },
        },
      })),
      totals: {
        ...result.totals,
        budget: { state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" },
        percentage: { state: "not_applicable", value: null, label: "Not applicable" },
      },
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...mixedCoverageResult,
      coverage: mixedCoverageResult.coverage.map((entry, index) =>
        index === 0 ? { ...entry, actual: "not_loaded" } : entry,
      ),
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...mixedCoverageResult,
      rows: mixedCoverageResult.rows.map((row, index) => (index === 0 ? { ...row, dimensions: { month: null } } : row)),
    }),
  );

  const unavailableRollover = {
    resultId: "result-rollover",
    selection: {
      measureIds: ["rollover"],
      dimensionIds: ["month"],
      plantIds: ["DUB"],
      timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
      filters: [],
    },
    scope: { plantIds: ["DUB"], from: "2026-04-01", to: "2026-04-30" },
    rows: [
      {
        key: "month:2026-04-01",
        dimensions: { month: "2026-04-01" },
        values: { rollover: { state: "available", value: "10.00", label: "Roll-over" } },
      },
    ],
    totals: { rollover: { state: "available", value: "10.00", label: "Roll-over" } },
    coverage: [{ plantId: "DUB", month: "2026-04-01", actual: "complete", budget: "not_loaded" }],
  };
  assert.throws(() => financialQueryResultSchema.parse(unavailableRollover));

  const closingRollover = {
    ...unavailableRollover,
    selection: {
      ...unavailableRollover.selection,
      timeWindow: { kind: "range", from: "2026-04-01", to: "2026-05-31" },
    },
    scope: { plantIds: ["DUB"], from: "2026-04-01", to: "2026-05-31" },
    rows: [
      {
        key: "month:2026-05-01",
        dimensions: { month: "2026-05-01" },
        values: { rollover: { state: "available", value: "12.00", label: "Roll-over" } },
      },
    ],
    totals: { rollover: { state: "available", value: "12.00", label: "Roll-over" } },
    coverage: [
      { plantId: "DUB", month: "2026-04-01", actual: "complete", budget: "not_loaded" },
      { plantId: "DUB", month: "2026-05-01", actual: "complete", budget: "loaded" },
    ],
  };
  assert.deepEqual(financialQueryResultSchema.parse(closingRollover), closingRollover);

  const missingGlActual = {
    resultId: "result-null-gl",
    selection: {
      measureIds: ["actual"],
      dimensionIds: ["gl"],
      plantIds: ["DUB"],
      timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
      filters: [],
    },
    scope: { plantIds: ["DUB"], from: "2026-04-01", to: "2026-04-30" },
    rows: [
      {
        key: "gl:missing",
        dimensions: { gl: null },
        values: { actual: { state: "available", value: "5.00", label: "Actual", drilldownId: "drill-null-gl" } },
      },
    ],
    totals: { actual: { state: "available", value: "5.00", label: "Actual", drilldownId: "drill-null-gl-total" } },
    coverage: [{ plantId: "DUB", month: "2026-04-01", actual: "complete", budget: "not_loaded" }],
  };
  assert.deepEqual(financialQueryResultSchema.parse(missingGlActual), missingGlActual);
});

test("mixed Budget coverage keeps only its exact available subtotal and unavailable percentage", () => {
  const mixedBudgetResult = {
    resultId: "result-mixed-budget",
    selection: {
      measureIds: ["actual", "budget"],
      dimensionIds: ["month"],
      plantIds: ["DUB", "CHIR"],
      timeWindow: { kind: "range", from: "2026-04-01", to: "2026-05-31" },
      filters: [],
      comparisons: ["actual_vs_budget"],
    },
    scope: { plantIds: ["DUB", "CHIR"], from: "2026-04-01", to: "2026-05-31" },
    rows: [
      {
        key: "month:2026-04-01",
        dimensions: { month: "2026-04-01" },
        values: {
          actual: { state: "available", value: "30.00", label: "Actual", drilldownId: "drill-april" },
          budget: { state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" },
          availableBudgetSubtotal: {
            value: "10.00",
            label: "Available-only Budget subtotal — coverage incomplete",
          },
          percentage: { state: "not_applicable", value: null, label: "Not applicable" },
        },
      },
      {
        key: "month:2026-05-01",
        dimensions: { month: "2026-05-01" },
        values: {
          actual: { state: "available", value: "40.00", label: "Actual", drilldownId: "drill-may" },
          budget: { state: "available", value: "20.00", label: "Budget" },
          percentage: { state: "available", value: "200", label: "Percentage" },
        },
      },
    ],
    totals: {
      actual: { state: "available", value: "70.00", label: "Actual", drilldownId: "drill-total" },
      budget: { state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" },
      availableBudgetSubtotal: {
        value: "30.00",
        label: "Available-only Budget subtotal — coverage incomplete",
      },
      percentage: { state: "not_applicable", value: null, label: "Not applicable" },
    },
    coverage: [
      { plantId: "DUB", month: "2026-04-01", actual: "complete", budget: "loaded" },
      { plantId: "CHIR", month: "2026-04-01", actual: "complete", budget: "not_loaded" },
      { plantId: "DUB", month: "2026-05-01", actual: "complete", budget: "loaded" },
      { plantId: "CHIR", month: "2026-05-01", actual: "complete", budget: "loaded" },
    ],
  };
  assert.deepEqual(financialQueryResultSchema.parse(mixedBudgetResult), mixedBudgetResult);

  const allLoaded = {
    ...mixedBudgetResult,
    rows: mixedBudgetResult.rows.map((row, index) =>
      index === 0
        ? {
            ...row,
            values: {
              actual: row.values.actual,
              budget: { state: "available", value: "10.00", label: "Budget" },
              percentage: { state: "available", value: "300", label: "Percentage" },
            },
          }
        : row,
    ),
    totals: {
      actual: mixedBudgetResult.totals.actual,
      budget: { state: "available", value: "30.00", label: "Budget" },
      percentage: { state: "available", value: "233.333333", label: "Percentage" },
    },
    coverage: mixedBudgetResult.coverage.map((entry) => ({ ...entry, budget: "loaded" })),
  };
  assert.deepEqual(financialQueryResultSchema.parse(allLoaded), allLoaded);

  const noneLoaded = {
    ...mixedBudgetResult,
    rows: mixedBudgetResult.rows.map((row) => ({
      ...row,
      values: {
        actual: row.values.actual,
        budget: { state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" },
        percentage: { state: "not_applicable", value: null, label: "Not applicable" },
      },
    })),
    totals: {
      actual: mixedBudgetResult.totals.actual,
      budget: { state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" },
      percentage: { state: "not_applicable", value: null, label: "Not applicable" },
    },
    coverage: mixedBudgetResult.coverage.map((entry) => ({ ...entry, budget: "not_loaded" })),
  };
  assert.deepEqual(financialQueryResultSchema.parse(noneLoaded), noneLoaded);

  const { availableBudgetSubtotal: omittedBudgetSubtotal, ...totalsWithoutBudgetSubtotal } = mixedBudgetResult.totals;
  assert.ok(omittedBudgetSubtotal);
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...mixedBudgetResult,
      totals: totalsWithoutBudgetSubtotal,
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...mixedBudgetResult,
      totals: {
        ...mixedBudgetResult.totals,
        budget: { state: "available", value: "30.00", label: "Budget" },
      },
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...mixedBudgetResult,
      totals: {
        ...mixedBudgetResult.totals,
        percentage: { state: "available", value: "233.333333", label: "Percentage" },
      },
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...allLoaded,
      totals: {
        ...allLoaded.totals,
        availableBudgetSubtotal: mixedBudgetResult.totals.availableBudgetSubtotal,
      },
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...noneLoaded,
      totals: {
        ...noneLoaded.totals,
        availableBudgetSubtotal: mixedBudgetResult.totals.availableBudgetSubtotal,
      },
    }),
  );
});

test("query results reject every unrequested financial value", () => {
  const actualOnly = {
    ...result,
    selection: { ...result.selection, measureIds: ["actual"], comparisons: undefined },
    rows: result.rows.map((row) => ({ ...row, values: { actual: row.values.actual } })),
    totals: { actual: result.totals.actual },
  };
  assert.deepEqual(financialQueryResultSchema.parse(actualOnly), actualOnly);
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...actualOnly,
      totals: { ...actualOnly.totals, budget: result.totals.budget },
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...actualOnly,
      rows: actualOnly.rows.map((row) => ({
        ...row,
        values: { ...row.values, rollover: { state: "available", value: "1.00", label: "Roll-over" } },
      })),
    }),
  );
  assert.throws(() =>
    financialQueryResultSchema.parse({
      ...result,
      selection: { ...result.selection, comparisons: undefined },
    }),
  );
});

test("financial boundary matrix keeps only source-covered partials and provable ratios", () => {
  const actualMonthResult = (resultId: string, actual: string, totals: object) => ({
    resultId,
    selection: {
      measureIds: ["actual"],
      dimensionIds: [],
      plantIds: ["DUB"],
      timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
      filters: [],
    },
    scope: { plantIds: ["DUB"], from: "2026-04-01", to: "2026-04-30" },
    rows: [],
    totals,
    coverage: [{ plantId: "DUB", month: "2026-04-01", actual, budget: "not_loaded" }],
  });
  const completeActual = actualMonthResult("actual-complete", "complete", {
    actual: { state: "available", value: "10.00", label: "Actual", drilldownId: "drill-complete" },
  });
  const unconfirmedActual = actualMonthResult("actual-unconfirmed", "unconfirmed", {
    actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
    availableActualSubtotal: {
      value: "10.00",
      label: "Available-data Actual subtotal — completeness unconfirmed",
      drilldownId: "drill-unconfirmed",
    },
  });
  const missingActual = actualMonthResult("actual-missing", "not_loaded", {
    actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
  });
  const missingActualWithSubtotal = actualMonthResult("actual-missing-with-subtotal", "not_loaded", {
    actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
    availableActualSubtotal: {
      value: "0.00",
      label: "Available-data Actual subtotal — completeness unconfirmed",
      drilldownId: "drill-missing",
    },
  });
  const partialRangeActual = {
    ...completeActual,
    resultId: "actual-partial-range",
    selection: {
      ...completeActual.selection,
      timeWindow: { kind: "range", from: "2026-04-01", to: "2026-05-31" },
    },
    scope: { plantIds: ["DUB"], from: "2026-04-01", to: "2026-05-31" },
    totals: {
      actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
      availableActualSubtotal: {
        value: "10.00",
        label: "Available-data Actual subtotal — completeness unconfirmed",
        drilldownId: "drill-partial-range",
      },
    },
    coverage: [
      { plantId: "DUB", month: "2026-04-01", actual: "complete", budget: "not_loaded" },
      { plantId: "DUB", month: "2026-05-01", actual: "not_loaded", budget: "not_loaded" },
    ],
  };
  const partialRangeWithoutSubtotal = {
    ...partialRangeActual,
    totals: {
      actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
    },
  };

  const fullComparisonNotApplicable = {
    ...result,
    totals: {
      ...result.totals,
      percentage: { state: "not_applicable", value: null, label: "Not applicable" },
    },
  };
  const zeroBudgetComparison = {
    ...result,
    rows: result.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        budget: { state: "available", value: "0.00", label: "Budget" },
        percentage: { state: "not_applicable", value: null, label: "Not applicable" },
      },
    })),
    totals: {
      ...result.totals,
      budget: { state: "available", value: "0.00", label: "Budget" },
      percentage: { state: "not_applicable", value: null, label: "Not applicable" },
    },
  };
  const negativeBudgetComparison = {
    ...result,
    rows: result.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        budget: { state: "available", value: "-100.00", label: "Budget" },
        percentage: { state: "available", value: "-900719925474099312345.6789", label: "Percentage" },
      },
    })),
    totals: {
      ...result.totals,
      budget: { state: "available", value: "-100.00", label: "Budget" },
      percentage: { state: "available", value: "-900719925474099312345.6789", label: "Percentage" },
    },
  };
  const percentageOnly = {
    ...result,
    selection: { ...result.selection, measureIds: ["percentage"] },
    rows: result.rows.map((row) => ({ ...row, values: { percentage: row.values.percentage } })),
    totals: { percentage: result.totals.percentage },
  };
  const percentageOnlyNotApplicable = {
    ...percentageOnly,
    rows: percentageOnly.rows.map((row) => ({
      ...row,
      values: { percentage: { state: "not_applicable", value: null, label: "Not applicable" } },
    })),
    totals: { percentage: { state: "not_applicable", value: null, label: "Not applicable" } },
  };

  const unmappedMixedBudget = {
    resultId: "unmapped-mixed-budget",
    selection: {
      measureIds: ["actual", "budget"],
      dimensionIds: ["nursery_component"],
      plantIds: ["DUB", "CHIR"],
      timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
      filters: [],
      comparisons: ["actual_vs_budget"],
    },
    scope: { plantIds: ["DUB", "CHIR"], from: "2026-04-01", to: "2026-04-30" },
    rows: [
      {
        key: "nursery_component:unmapped-GL",
        dimensions: { nursery_component: "unmapped-GL" },
        values: {
          actual: { state: "available", value: "15.00", label: "Actual", drilldownId: "drill-unmapped" },
          budget: { state: "unmapped", value: null, label: "No Budget assigned to Unmapped" },
          percentage: { state: "not_applicable", value: null, label: "Not applicable" },
        },
      },
    ],
    totals: {
      actual: { state: "available", value: "15.00", label: "Actual", drilldownId: "drill-total" },
      budget: { state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" },
      availableBudgetSubtotal: {
        value: "10.00",
        label: "Available-only Budget subtotal — coverage incomplete",
      },
      percentage: { state: "not_applicable", value: null, label: "Not applicable" },
    },
    coverage: [
      { plantId: "DUB", month: "2026-04-01", actual: "complete", budget: "loaded" },
      { plantId: "CHIR", month: "2026-04-01", actual: "complete", budget: "not_loaded" },
    ],
  };
  const mappedClaimingUnmapped = {
    ...unmappedMixedBudget,
    rows: unmappedMixedBudget.rows.map((row) => ({
      ...row,
      dimensions: { nursery_component: "Mapped nursery" },
    })),
  };
  const unmappedMissingBudget = {
    ...unmappedMixedBudget,
    totals: {
      actual: unmappedMixedBudget.totals.actual,
      budget: { state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" },
      percentage: { state: "not_applicable", value: null, label: "Not applicable" },
    },
    coverage: unmappedMixedBudget.coverage.map((entry) => ({ ...entry, budget: "not_loaded" })),
  };
  const glWithoutBudget = {
    ...result,
    rows: result.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        budget: { state: "no_gl_line", value: null, label: "No Budget line for this GL" },
        percentage: { state: "not_applicable", value: null, label: "Not applicable" },
      },
    })),
  };

  const cases = [
    ["complete Actual", completeActual, true],
    ["unconfirmed Actual", unconfirmedActual, true],
    ["missing Actual", missingActual, true],
    ["missing Actual cannot invent a subtotal", missingActualWithSubtotal, false],
    ["partial range Actual", partialRangeActual, true],
    ["partial range Actual requires its subtotal", partialRangeWithoutSubtotal, false],
    ["complete nonzero comparison cannot be unavailable", fullComparisonNotApplicable, false],
    ["zero Budget comparison", zeroBudgetComparison, true],
    ["negative nonzero Budget comparison", negativeBudgetComparison, true],
    ["percentage-only comparison", percentageOnly, true],
    ["percentage-only unavailable comparison", percentageOnlyNotApplicable, true],
    ["Unmapped under mixed Budget coverage", unmappedMixedBudget, true],
    ["Unmapped under missing Budget coverage", unmappedMissingBudget, true],
    ["mapped component cannot claim Unmapped", mappedClaimingUnmapped, false],
    ["GL without a Budget line", glWithoutBudget, true],
  ] as const;

  assert.deepEqual(
    cases.map(([name, candidate]) => ({ name, valid: financialQueryResultSchema.safeParse(candidate).success })),
    cases.map(([name, , valid]) => ({ name, valid })),
  );

  for (const timeWindow of [
    { kind: "month", from: "2026-04-01", to: "2026-04-30" },
    { kind: "range", from: "2026-04-01", to: "2026-05-31" },
    { kind: "financial_ytd", from: "2026-04-01", to: "2026-08-31" },
  ]) {
    assert.doesNotThrow(() => financialSelectionSchema.parse({ ...selection, timeWindow }));
  }
  assert.deepEqual(actualTransactionPageSchema.parse(page), page);
});

test("transaction results keep full-total identity and strict exact-money rows", () => {
  const transaction = (number: number) => ({
    ...page.transactions[0],
    id: `row-${number}`,
    transactionNumber: `TX-${number}`,
    lineId: String(number),
  });
  const preparedPage = {
    ...page,
    transactions: Array.from({ length: 10 }, (_, index) => transaction(index + 1)),
    totalItems: 21,
    totalPages: 2,
  };
  const continuationPage = {
    ...preparedPage,
    transactions: Array.from({ length: 11 }, (_, index) => transaction(index + 11)),
    page: 2,
    limit: 20,
    pinnedContinuationLimit: 20,
  };
  assert.deepEqual(actualTransactionPageSchema.parse(preparedPage), preparedPage);
  assert.deepEqual(actualTransactionPageSchema.parse(continuationPage), continuationPage);
  assert.throws(() => actualTransactionPageSchema.parse({ ...page, matchingActualTotal: 75 }));
  assert.throws(() => actualTransactionPageSchema.parse({ ...page, sql: "select *" }));
  assert.throws(() => actualTransactionPageSchema.parse({ ...page, limit: 100 }));
  assertOnlyZodIssue(
    () => actualTransactionPageSchema.parse({ ...preparedPage, totalPages: 1 }),
    "totalPages",
    "totalPages does not match the prepared-page formula",
  );
  assertOnlyZodIssue(
    () =>
      actualTransactionPageSchema.parse({
        ...continuationPage,
        transactions: continuationPage.transactions.slice(1),
      }),
    "transactions",
    "transaction count does not match page metadata",
  );
  assertOnlyZodIssue(
    () =>
      actualTransactionPageSchema.parse({
        ...continuationPage,
        pinnedContinuationLimit: null,
      }),
    "limit",
    "continuation pages use the pinned limit",
  );

  const fiveRowContinuation = {
    ...continuationPage,
    transactions: Array.from({ length: 5 }, (_, index) => transaction(index + 11)),
    limit: 5,
    totalItems: 15,
    totalPages: 2,
    pinnedContinuationLimit: 5,
  };
  assert.deepEqual(actualTransactionPageSchema.parse(fiveRowContinuation), fiveRowContinuation);
  assertOnlyZodIssue(
    () =>
      actualTransactionPageSchema.parse({
        ...fiveRowContinuation,
        limit: 6,
      }),
    "limit",
    "continuation pages use the pinned limit",
  );
});

test("the four financial tools have meaningful strict input and output contracts", () => {
  assert.deepEqual(
    FINANCIAL_TOOL_DEFINITIONS.map(({ name }) => name),
    ["get_financial_catalog", "find_dimension_values", "query_financials", "get_actual_transactions"],
  );

  const validInputs = [
    {},
    { dimensionId: "plant", search: "DUB" },
    selection,
    { drilldownId: "drill-1", page: 1, limit: 10 },
  ];
  const validOutputs = [
    catalog,
    { matches: [{ dimensionId: "plant", value: "DUB", label: "DUB", aliases: [] }] },
    result,
    page,
  ];

  FINANCIAL_TOOL_DEFINITIONS.forEach((tool, index) => {
    assert.ok(tool.description.length >= 60, `${tool.name} needs a meaningful description`);
    assert.ok(tool.inputSchema.description, `${tool.name} input needs a description`);
    assert.ok(tool.outputSchema.description, `${tool.name} output needs a description`);
    assert.deepEqual(tool.inputSchema.parse(validInputs[index]), validInputs[index]);
    assert.deepEqual(tool.outputSchema.parse(validOutputs[index]), validOutputs[index]);
    assert.throws(() => tool.inputSchema.parse({ ...validInputs[index], unexpected: true }));
    assert.throws(() => tool.outputSchema.parse({ ...validOutputs[index], unexpected: true }));
  });
});
