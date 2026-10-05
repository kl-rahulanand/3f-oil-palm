import assert from "node:assert/strict";
import { test } from "node:test";
import type { Selection } from "@3f/contract";
import {
  comparisonPeriodOutcome,
  hasBudgetComparisonFilter,
  needsComparisonPeriod,
  type ComparisonPeriodInput,
} from "./ask-budget-period";

const ACTUAL = "governed-financial.actual";
const BUDGET = "governed-financial.budget";
const PERCENTAGE = "governed-financial.percentage";

test("Actual with Budget and percentage each require a comparison period", () => {
  const cases: Array<{ name: string; selection: Selection; expected: boolean }> = [
    { name: "Actual with Budget", selection: financialSelection([ACTUAL, BUDGET]), expected: true },
    { name: "percentage alone", selection: financialSelection([PERCENTAGE]), expected: true },
    { name: "Actual alone", selection: financialSelection([ACTUAL]), expected: false },
    { name: "Budget alone", selection: financialSelection([BUDGET]), expected: false },
    {
      name: "Actual against a fixed amount",
      selection: {
        ...financialSelection([ACTUAL]),
        measureFilters: [{ measureId: ACTUAL, op: "gt", compareTo: { kind: "value", value: "500000" } }],
      },
      expected: false,
    },
    {
      name: "Budget against a fixed amount",
      selection: {
        ...financialSelection([BUDGET]),
        measureFilters: [{ measureId: BUDGET, op: "gt", compareTo: { kind: "value", value: "500000" } }],
      },
      expected: false,
    },
    {
      name: "another domain with same measure suffixes",
      selection: {
        ...financialSelection([ACTUAL, BUDGET]),
        domain: "mis-statement",
      },
      expected: false,
    },
  ];

  for (const entry of cases) {
    assert.equal(needsComparisonPeriod(entry.selection), entry.expected, entry.name);
  }
});

test("all eight Actual and Budget comparison filters require a comparison period", () => {
  for (const op of ["gt", "gte", "lt", "lte"] as const) {
    for (const [left, right] of [
      [ACTUAL, BUDGET],
      [BUDGET, ACTUAL],
    ] as const) {
      const selection: Selection = {
        ...financialSelection([left, right]),
        measureFilters: [{ measureId: left, op, compareTo: { kind: "measure", measureId: right } }],
      };

      assert.equal(hasBudgetComparisonFilter(selection), true, `${left} ${op} ${right}`);
      assert.equal(needsComparisonPeriod(selection), true, `${left} ${op} ${right}`);
    }
  }
});

test("comparison filter detection rejects fixed amounts and other measure pairs", () => {
  const cases: Selection[] = [
    {
      ...financialSelection([ACTUAL]),
      measureFilters: [{ measureId: ACTUAL, op: "gt", compareTo: { kind: "value", value: "1" } }],
    },
    {
      ...financialSelection([ACTUAL, PERCENTAGE]),
      measureFilters: [{ measureId: ACTUAL, op: "gt", compareTo: { kind: "measure", measureId: PERCENTAGE } }],
    },
    {
      ...financialSelection([ACTUAL, BUDGET]),
      domain: "mis-statement",
      measureFilters: [{ measureId: ACTUAL, op: "gt", compareTo: { kind: "measure", measureId: BUDGET } }],
    },
  ];

  for (const selection of cases) assert.equal(hasBudgetComparisonFilter(selection), false);
});

test("period options are months newest first followed by financial year to date", () => {
  const outcome = comparisonPeriodOutcome(
    periodInput({ actualMonths: ["2026-05-01", "2026-07-01", "2026-06-01", "2026-07-01"] }),
  );

  assert.deepEqual(outcome, {
    kind: "choose",
    options: [
      monthOption("2026-07-01", "2026-07-31", "July 2026"),
      monthOption("2026-06-01", "2026-06-30", "June 2026"),
      monthOption("2026-05-01", "2026-05-31", "May 2026"),
      {
        value: "2026-04-01:2026-07-31",
        label: "Financial year to date (April – July 2026)",
        timeWindow: { grain: "month", column: "month", from: "2026-04-01", to: "2026-07-31" },
      },
    ],
  });
});

test("January belongs to the financial year that began the previous April", () => {
  const outcome = comparisonPeriodOutcome(periodInput({ actualMonths: ["2027-01-01"] }));

  assert.equal(outcome.kind, "choose");
  assert.deepEqual(outcome.kind === "choose" ? outcome.options.at(-1) : undefined, {
    value: "2026-04-01:2027-01-31",
    label: "Financial year to date (April 2026 – January 2027)",
    timeWindow: { grain: "month", column: "month", from: "2026-04-01", to: "2027-01-31" },
  });
});

test("April does not duplicate its month as financial year to date", () => {
  const outcome = comparisonPeriodOutcome(periodInput({ actualMonths: ["2026-04-01"] }));

  assert.deepEqual(outcome, {
    kind: "choose",
    options: [monthOption("2026-04-01", "2026-04-30", "April 2026")],
  });
});

test("a comparison uses budget-owner actuals and offers only fully budget-covered windows", () => {
  const outcome = comparisonPeriodOutcome(
    periodInput({
      chosenPlants: ["CHIR", "DUB"],
      actualMonths: ["2026-08-01", "2026-07-01"],
      budgetedPlants: ["DUB"],
      budgetedActualMonths: ["2026-08-01", "2026-07-01"],
      loadedBudgetMonths: ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"],
      comparisonFilter: true,
    }),
  );

  assert.deepEqual(outcome, {
    kind: "choose",
    options: [monthOption("2026-07-01", "2026-07-31", "July 2026")],
  });
});

test("a missing budget month removes year to date but keeps covered comparison months", () => {
  const outcome = comparisonPeriodOutcome(
    periodInput({
      actualMonths: ["2026-07-01", "2026-05-01"],
      budgetedActualMonths: ["2026-07-01", "2026-05-01"],
      loadedBudgetMonths: ["2026-04-01", "2026-05-01", "2026-07-01"],
      comparisonFilter: true,
    }),
  );

  assert.deepEqual(outcome, {
    kind: "choose",
    options: [
      monthOption("2026-07-01", "2026-07-31", "July 2026"),
      monthOption("2026-05-01", "2026-05-31", "May 2026"),
    ],
  });
});

test("a comparison without a measure filter offers actual months without a loaded budget", () => {
  assert.deepEqual(comparisonPeriodOutcome(periodInput({ actualMonths: ["2026-07-01"], loadedBudgetMonths: [] })), {
    kind: "choose",
    options: [
      monthOption("2026-07-01", "2026-07-31", "July 2026"),
      {
        value: "2026-04-01:2026-07-31",
        label: "Financial year to date (April – July 2026)",
        timeWindow: { grain: "month", column: "month", from: "2026-04-01", to: "2026-07-31" },
      },
    ],
  });
});

test("no actuals wins before the no-budget outcome", () => {
  assert.deepEqual(
    comparisonPeriodOutcome(
      periodInput({
        chosenPlants: ["CHIR"],
        actualMonths: [],
        budgetedPlants: [],
        budgetedActualMonths: [],
        loadedBudgetMonths: [],
        comparisonFilter: true,
      }),
    ),
    { kind: "no-actuals" },
  );
});

test("a comparison with no qualifying window reports every plant left out in sorted order", () => {
  assert.deepEqual(
    comparisonPeriodOutcome(
      periodInput({
        chosenPlants: ["DUB", "CHIR"],
        actualMonths: ["2026-07-01"],
        budgetedPlants: ["DUB"],
        budgetedActualMonths: ["2026-07-01"],
        loadedBudgetMonths: [],
        comparisonFilter: true,
      }),
    ),
    { kind: "no-budget", leftOut: ["CHIR", "DUB"] },
  );
});

test("a plant that is not a budget owner gets the no-budget outcome", () => {
  assert.deepEqual(
    comparisonPeriodOutcome(
      periodInput({
        chosenPlants: ["CHIR"],
        actualMonths: ["2026-07-01"],
        budgetedPlants: [],
        budgetedActualMonths: [],
        loadedBudgetMonths: ["2026-07-01"],
        comparisonFilter: true,
      }),
    ),
    { kind: "no-budget", leftOut: ["CHIR"] },
  );
});

function financialSelection(measureIds: string[]): Selection {
  return { domain: "governed-financial", measureIds, dimensionIds: ["gl_code"], filters: [] };
}

function periodInput(overrides: Partial<ComparisonPeriodInput> = {}): ComparisonPeriodInput {
  return {
    chosenPlants: ["DUB"],
    actualMonths: ["2026-07-01"],
    budgetedPlants: ["DUB"],
    budgetedActualMonths: ["2026-07-01"],
    loadedBudgetMonths: [],
    comparisonFilter: false,
    timeColumn: "month",
    ...overrides,
  };
}

function monthOption(from: string, to: string, label: string) {
  return {
    value: from,
    label,
    timeWindow: { grain: "month" as const, column: "month", from, to },
  };
}
