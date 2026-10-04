import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResultTable, Selection } from "@3f/contract";
import { applyBudgetStates } from "./ask-budget-states";

const baseSelection: Selection = {
  domain: "governed-financial",
  measureIds: ["governed-financial.actual", "governed-financial.budget", "governed-financial.percentage"],
  dimensionIds: ["gl_code"],
  filters: [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }],
};

const columns: ResultTable["columns"] = [
  { key: "gl_code", label: "GL code", numeric: false },
  { key: "actual", label: "Actual", numeric: true, format: "money" },
  { key: "budget", label: "Budget", numeric: true, format: "money" },
  { key: "percentage", label: "%", numeric: true, format: "percent" },
];

test("summed and plant rows report honest loaded not-loaded and partial budget states", () => {
  const summed = applyBudgetStates({
    selection: baseSelection,
    result: { columns, rows: [{ gl_code: "5001", actual: "12.00", budget: "10.00", percentage: "1.2" }] },
    budgetOwnerPlant: "DUB",
    answerMonths: ["2026-07-01"],
    loadedBudgetMonths: ["2026-07-01"],
  });
  assert.deepEqual(summed.budgetStates, [
    { key: "5001", state: "partial", plantsInRow: ["CHIR", "DUB"], plantsWithBudget: ["DUB"] },
  ]);
  assert.deepEqual(summed.result.rows[0], { gl_code: "5001", actual: "12.00", budget: null, percentage: null });

  const byPlant = applyBudgetStates({
    selection: { ...baseSelection, dimensionIds: ["gl_code", "plant"] },
    result: {
      columns: [...columns, { key: "plant", label: "Plant", numeric: false }],
      rows: [
        { gl_code: "5001", plant: "DUB", actual: "0.00", budget: "0.00", percentage: null },
        { gl_code: "5001", plant: "CHIR", actual: "0.00", budget: "0.00", percentage: null },
      ],
    },
    budgetOwnerPlant: "DUB",
    answerMonths: ["2026-07-01"],
    loadedBudgetMonths: ["2026-07-01"],
  });
  assert.deepEqual(byPlant.budgetStates, [
    { key: "5001|DUB", state: "loaded", plantsInRow: ["DUB"], plantsWithBudget: ["DUB"] },
    { key: "5001|CHIR", state: "not-loaded", plantsInRow: ["CHIR"], plantsWithBudget: [] },
  ]);
  assert.equal(byPlant.result.rows[0]?.budget, "0.00", "a real zero budget remains visible");
  assert.equal(byPlant.result.rows[1]?.budget, null);
});

test("missing range months make a summed owner row not loaded while month rows use their own month", () => {
  const result: ResultTable = {
    columns: [...columns, { key: "month", label: "Month", numeric: false }],
    rows: [
      { gl_code: "5001", month: "2026-04-30", actual: "1.00", budget: "1.00", percentage: "1" },
      { gl_code: "5001", month: "2026-07-31", actual: "1.00", budget: "1.00", percentage: "1" },
    ],
  };
  const grouped = applyBudgetStates({
    selection: {
      ...baseSelection,
      dimensionIds: ["gl_code", "month"],
      filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }],
    },
    result,
    budgetOwnerPlant: "DUB",
    answerMonths: ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"],
    loadedBudgetMonths: ["2026-04-01", "2026-06-01", "2026-07-01"],
  });
  assert.deepEqual(
    grouped.budgetStates?.map(({ key, state }) => ({ key, state })),
    [
      { key: "5001|2026-04-01", state: "loaded" },
      { key: "5001|2026-07-01", state: "loaded" },
    ],
  );

  const summed = applyBudgetStates({
    selection: {
      ...baseSelection,
      filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }],
    },
    result: { columns, rows: [result.rows[0]!] },
    budgetOwnerPlant: "DUB",
    answerMonths: ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"],
    loadedBudgetMonths: ["2026-04-01", "2026-06-01", "2026-07-01"],
  });
  assert.equal(summed.budgetStates?.[0]?.state, "not-loaded");
  assert.equal(summed.result.rows[0]?.budget, null);
});

test("budget states follow the four requested measure sets without adding or dropping columns", () => {
  const cases = [
    { measureIds: ["governed-financial.actual"], state: false, nulled: [] },
    { measureIds: ["governed-financial.actual", "governed-financial.budget"], state: true, nulled: ["budget"] },
    { measureIds: ["governed-financial.percentage"], state: true, nulled: ["percentage"] },
    {
      measureIds: ["governed-financial.actual", "governed-financial.budget", "governed-financial.percentage"],
      state: true,
      nulled: ["budget", "percentage"],
    },
  ];
  for (const entry of cases) {
    const selectedTotals = Object.fromEntries(
      Object.entries({ actual: 1, budget: 2, percentage: 0.5 }).filter(([key]) =>
        entry.measureIds.some((measureId) => measureId.endsWith(`.${key}`)),
      ),
    );
    const selectedColumns = columns.filter(
      ({ key }) => key === "gl_code" || entry.measureIds.some((measureId) => measureId.endsWith(`.${key}`)),
    );
    const output = applyBudgetStates({
      selection: {
        ...baseSelection,
        measureIds: entry.measureIds,
        filters: [{ dimensionId: "plant", op: "in", value: ["CHIR"] }],
      },
      result: {
        columns: selectedColumns,
        rows: [{ gl_code: "5001", actual: "1.00", budget: "2.00", percentage: "0.5" }],
      },
      totals: selectedTotals,
      budgetOwnerPlant: "DUB",
      answerMonths: ["2026-07-01"],
      loadedBudgetMonths: ["2026-07-01"],
    });
    assert.equal(Boolean(output.budgetStates), entry.state, entry.measureIds.join(","));
    assert.deepEqual(output.result.columns, selectedColumns);
    for (const key of entry.nulled) assert.equal(output.result.rows[0]?.[key], null);
    const expectedTotals = Object.fromEntries(
      Object.entries(selectedTotals).filter(([key]) => !entry.nulled.includes(key)),
    );
    assert.deepEqual(output.totals, Object.keys(expectedTotals).length > 0 ? expectedTotals : undefined);
  }
});

test("statement Budget and percentage totals are omitted for a plant without Budget", () => {
  const output = applyBudgetStates({
    selection: {
      domain: "mis-statement",
      measureIds: ["mis-statement.actual_net", "mis-statement.budget_net", "mis-statement.percentage"],
      dimensionIds: ["leaf_key"],
      filters: [{ dimensionId: "plant", op: "in", value: ["CHIR"] }],
    },
    result: {
      columns: [
        { key: "leaf_key", label: "Statement line", numeric: false },
        { key: "actual_net", label: "Actual", numeric: true, format: "money" },
        { key: "budget_net", label: "Budget", numeric: true, format: "money" },
        { key: "percentage", label: "%", numeric: true, format: "percent" },
      ],
      rows: [{ leaf_key: "leaf", actual_net: "1.00", budget_net: "0.00", percentage: "over-budget" }],
    },
    totals: { actual_net: 1, budget_net: 0, percentage: 0 },
    budgetOwnerPlant: "DUB",
    answerMonths: ["2026-07-01"],
    loadedBudgetMonths: ["2026-07-01"],
  });

  assert.deepEqual(output.result.rows[0], {
    leaf_key: "leaf",
    actual_net: "1.00",
    budget_net: null,
    percentage: null,
  });
  assert.deepEqual(output.totals, { actual_net: 1 });
});
