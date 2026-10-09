import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

import {
  type ErrorPayload,
  financialChatCapabilitiesSchema,
  financialChatErrorDetailsSchema,
  financialChatErrorReasonSchema,
  financialChatEventSchema,
  financialChatResponseSchema,
} from "../src/index";

const selection = {
  measureIds: ["actual"],
  dimensionIds: ["month"],
  plantIds: ["DUB"],
  timeWindow: { kind: "range", from: "2026-03-01", to: "2026-04-30" },
  filters: [],
};

const result = {
  resultId: "result-1",
  selection,
  scope: { plantIds: ["DUB"], from: "2026-03-01", to: "2026-04-30" },
  rows: [
    {
      key: "month:2026-03-01",
      dimensions: { month: "2026-03-01" },
      values: {
        actual: {
          state: "available",
          value: "-900719925474099312345678.91",
          label: "Actual",
          drilldownId: "drill-march",
        },
      },
    },
    {
      key: "month:2026-04-01",
      dimensions: { month: "2026-04-01" },
      values: {
        actual: {
          state: "available",
          value: "-900719925474099312345678.90",
          label: "Actual",
          drilldownId: "drill-april",
        },
      },
    },
  ],
  totals: {
    actual: { state: "available", value: "-1801439850948198624691357.81", label: "Actual", drilldownId: "drill-total" },
  },
  coverage: [
    { plantId: "DUB", month: "2026-03-01", actual: "complete", budget: "loaded" },
    { plantId: "DUB", month: "2026-04-01", actual: "complete", budget: "loaded" },
  ],
};

const transaction = (
  drilldownId: string,
  actual: string,
  debit: string,
  credit: string,
  postingDate = "2026-04-15",
  reportingMonth = "2026-04-01",
) => ({
  id: `row-${drilldownId}`,
  transactionNumber: `TX-${drilldownId}`,
  lineId: "1",
  postingDate,
  reportingMonth,
  plantId: "DUB",
  plantLabel: "DUB",
  costCenterId: null,
  costCenterLabel: "Cost Center not assigned",
  glAccountId: "gl-1",
  glCode: "55010305",
  glName: "Example GL",
  debit,
  credit,
  actual,
  memo: null,
  reference: null,
});

const preparedPage = (
  drilldownId: string,
  matchingActualTotal: string,
  debit: string,
  credit: string,
  postingDate?: string,
  reportingMonth?: string,
) => ({
  drilldownId,
  transactions: [transaction(drilldownId, matchingActualTotal, debit, credit, postingDate, reportingMonth)],
  page: 1,
  limit: 10,
  totalItems: 1,
  totalPages: 1,
  matchingActualTotal,
  preparedSize: 10,
  defaultContinuationLimit: 20,
  pinnedContinuationLimit: null,
});

const marchPage = preparedPage(
  "drill-march",
  "-900719925474099312345678.91",
  "0.00",
  "900719925474099312345678.91",
  "2026-03-15",
  "2026-03-01",
);
const aprilPage = preparedPage("drill-april", "-900719925474099312345678.90", "0.00", "900719925474099312345678.90");
const totalPage = preparedPage("drill-total", "-1801439850948198624691357.81", "0.00", "1801439850948198624691357.81");

const answer = {
  version: 1,
  kind: "answer",
  conversationId: "conversation-1",
  turnId: "turn-1",
  answer: "DUB Actual for April 2026 is shown below.",
  scope: selection,
  dataSource: { kind: "synthetic", label: "Synthetic test data" },
  results: { "result-1": result },
  monthlyDeltas: [
    {
      resultId: "result-1",
      measureId: "actual",
      previousRowKey: "month:2026-03-01",
      currentRowKey: "month:2026-04-01",
      amountChange: "0.01",
      percentageChange: null,
      reason: "previous_negative",
    },
  ],
  ui: [
    {
      component: "FinancialTotal",
      props: { resultId: "result-1", title: "Actual", rowKey: null, valueKey: "actual" },
    },
  ],
  details: {
    "drill-march": { status: "ready", page: marchPage },
    "drill-april": { status: "ready", page: aprilPage },
    "drill-total": { status: "ready", page: totalPage },
  },
};

function assertResponseRejected(candidate: unknown, expectedMessage: string) {
  const parsed = financialChatResponseSchema.safeParse(candidate);
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.ok(
    parsed.error.issues.some(({ message }) => message === expectedMessage),
    expectedMessage,
  );
}

function assertResponseAccepted(candidate: unknown) {
  const parsed = financialChatResponseSchema.safeParse(candidate);
  assert.equal(parsed.success, true, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
}

function assertResponseSafelyRejected(candidate: unknown) {
  let parsed: ReturnType<typeof financialChatResponseSchema.safeParse> | undefined;
  assert.doesNotThrow(() => {
    parsed = financialChatResponseSchema.safeParse(candidate);
  });
  assert.equal(parsed?.success, false);
}

function compileErrorPayloadControls(sources: Record<string, string>) {
  const compilerOptions: ts.CompilerOptions = {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const rootNames = Object.keys(sources).map((name) => path.resolve("contract/test", name));
  const virtualSources = new Map(rootNames.map((name) => [name, sources[path.basename(name)]]));
  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (fileName) => virtualSources.has(path.resolve(fileName)) || ts.sys.fileExists(fileName);
  host.readFile = (fileName) => virtualSources.get(path.resolve(fileName)) ?? ts.sys.readFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const source = virtualSources.get(path.resolve(fileName));
    return source === undefined
      ? originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
      : ts.createSourceFile(fileName, source, languageVersion, true);
  };
  const program = ts.createProgram(rootNames, compilerOptions, host);
  return new Map(
    rootNames.map((fileName) => {
      const sourceFile = program.getSourceFile(fileName);
      assert.ok(sourceFile, `compiler loaded ${fileName}`);
      return [
        path.basename(fileName),
        [...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)].map(
          (diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
      ];
    }),
  );
}

test("final financial answers are strict, self-contained, and preserve tool money exactly", () => {
  assert.deepEqual(financialChatResponseSchema.parse(answer), answer);
  const parsed = financialChatResponseSchema.parse(answer);
  assert.equal(parsed.kind, "answer");
  if (parsed.kind !== "answer") return;
  assert.equal(parsed.results["result-1"].rows[1].values.actual?.value, "-900719925474099312345678.90");
  assert.equal(parsed.details["drill-total"].status, "ready");

  assert.throws(() => financialChatResponseSchema.parse({ ...answer, rawModelText: "trust me" }));
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...answer,
      ui: [
        {
          ...answer.ui[0],
          props: { ...answer.ui[0].props, serverMoney: "1.00" },
        },
      ],
    }),
  );
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...answer,
      dataSource: { kind: "synthetic", label: "Customer source data" },
    }),
  );
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...answer,
      ui: [{ component: "RemoteWidget", props: { resultId: "result-1" } }],
    }),
  );
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...answer,
      results: { "result-1": { ...result, unexpected: true } },
    }),
  );
});

test("comparison and clarification components accept valid strict props", () => {
  const comparisonSelection = { ...selection, measureIds: ["actual", "budget"] };
  const comparisonResult = {
    ...result,
    selection: comparisonSelection,
    rows: result.rows.map((row, index) => ({
      ...row,
      values: {
        ...row.values,
        budget: { state: "available", value: index === 0 ? "100.00" : "200.00", label: "Budget" },
      },
    })),
    totals: {
      ...result.totals,
      budget: { state: "available", value: "300.00", label: "Budget" },
    },
  };
  const comparison = {
    ...answer,
    scope: comparisonSelection,
    results: { "result-1": comparisonResult },
    ui: [
      {
        component: "FinancialComparison",
        props: {
          resultId: "result-1",
          title: "Actual and Budget",
          rowKeys: ["month:2026-03-01", "month:2026-04-01"],
          valueKeys: ["actual", "budget"],
        },
      },
    ],
  };
  assertResponseAccepted(comparison);
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...comparison,
      ui: [
        {
          ...comparison.ui[0],
          props: { ...comparison.ui[0].props, unexpected: true },
        },
      ],
    }),
  );

  const clarification = {
    version: 1,
    kind: "clarification",
    conversationId: "conversation-1",
    turnId: "turn-2",
    answer: "Which Plant should I use?",
    confirmedScope: null,
    ui: [
      {
        component: "ClarificationCard",
        props: {
          prompt: "Choose a permitted Plant.",
          missingFields: ["plant"],
          choices: [{ id: "DUB", label: "DUB", description: null }],
        },
      },
    ],
  };
  assertResponseAccepted(clarification);
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...clarification,
      ui: [
        {
          ...clarification.ui[0],
          props: { ...clarification.ui[0].props, unexpected: true },
        },
      ],
    }),
  );
});

test("presentation references must cross an included tool result and prepared page", () => {
  assert.throws(() => financialChatResponseSchema.parse({ ...answer, results: {} }));
  assert.throws(() => financialChatResponseSchema.parse({ ...answer, details: {} }));
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...answer,
      details: {
        ...answer.details,
        "drill-april": { status: "ready", page: { ...aprilPage, drilldownId: "different-drill" } },
      },
    }),
  );
});

test("result and detail references require owned dictionary entries", () => {
  const reservedHandleResult = {
    ...result,
    rows: [],
    totals: {
      actual: {
        state: "available",
        value: result.totals.actual.value,
        label: "Actual",
        drilldownId: "toString",
      },
    },
  };
  const reservedHandleAnswer = {
    ...answer,
    results: { "result-1": reservedHandleResult },
    monthlyDeltas: [],
    details: {},
  };
  assertResponseRejected(reservedHandleAnswer, "every advertised Actual needs a prepared detail outcome");
  assertResponseAccepted({
    ...reservedHandleAnswer,
    details: Object.fromEntries([
      ["toString", { status: "failed", reason: "preparation_timeout", message: "Try a narrower scope." }],
    ]),
  });

  assertResponseSafelyRejected({
    ...answer,
    ui: [
      {
        component: "FinancialTotal",
        props: { resultId: "constructor", title: "Actual", rowKey: null, valueKey: "actual" },
      },
    ],
  });
  assertResponseSafelyRejected({
    ...answer,
    monthlyDeltas: [{ ...answer.monthlyDeltas[0], resultId: "toString" }],
  });

  const reservedResult = { ...result, resultId: "toString" };
  assertResponseAccepted({
    ...answer,
    results: Object.fromEntries([["toString", reservedResult]]),
    monthlyDeltas: [{ ...answer.monthlyDeltas[0], resultId: "toString" }],
    ui: [
      {
        component: "FinancialTotal",
        props: { resultId: "toString", title: "Actual", rowKey: null, valueKey: "actual" },
      },
    ],
  });
});

test("included results must use the answer's confirmed scope", () => {
  assertResponseRejected(
    {
      ...answer,
      scope: { ...answer.scope, plantIds: ["OTHER"] },
    },
    "included results must use the confirmed answer scope",
  );

  const confirmedSelection = {
    measureIds: ["actual", "budget"],
    dimensionIds: ["month", "gl"],
    plantIds: ["DUB", "CHIR"],
    timeWindow: { kind: "range", from: "2026-04-01", to: "2026-04-30" },
    filters: [
      { dimensionId: "gl", operator: "in", values: ["55010305", "55010306"] },
      { dimensionId: "nursery_component", operator: "neq", value: "Labour" },
    ],
    comparisons: ["actual_vs_budget"],
  };
  const reorderedSelection = {
    ...confirmedSelection,
    measureIds: ["budget", "actual"],
    dimensionIds: ["gl", "month"],
    plantIds: ["CHIR", "DUB"],
    filters: [confirmedSelection.filters[1], { ...confirmedSelection.filters[0], values: ["55010306", "55010305"] }],
  };
  const multiPlantResult = {
    resultId: "set-result",
    selection: reorderedSelection,
    scope: { plantIds: ["CHIR", "DUB"], from: "2026-04-01", to: "2026-04-30" },
    rows: [],
    totals: {
      actual: { state: "available", value: "100.00", label: "Actual", drilldownId: "set-total" },
      budget: { state: "available", value: "80.00", label: "Budget" },
      percentage: { state: "available", value: "125", label: "Percentage" },
    },
    coverage: [
      { plantId: "DUB", month: "2026-04-01", actual: "complete", budget: "loaded" },
      { plantId: "CHIR", month: "2026-04-01", actual: "complete", budget: "loaded" },
    ],
  };
  const equivalentSetAnswer = {
    ...answer,
    scope: confirmedSelection,
    results: { "set-result": multiPlantResult },
    monthlyDeltas: [],
    ui: [
      {
        component: "FinancialTotal",
        props: { resultId: "set-result", title: "Actual", rowKey: null, valueKey: "actual" },
      },
    ],
    details: {
      "set-total": { status: "failed", reason: "preparation_timeout", message: "Try a narrower scope." },
    },
  };
  assertResponseAccepted(equivalentSetAnswer);

  for (const changedScope of [
    { ...confirmedSelection, plantIds: ["DUB", "OTHER"] },
    { ...confirmedSelection, timeWindow: { ...confirmedSelection.timeWindow, kind: "month" } },
    { ...confirmedSelection, timeWindow: { ...confirmedSelection.timeWindow, from: "2026-03-01" } },
    { ...confirmedSelection, timeWindow: { ...confirmedSelection.timeWindow, to: "2026-05-31" } },
    {
      ...confirmedSelection,
      filters: [{ dimensionId: "gl", operator: "eq", value: "55010305" }, confirmedSelection.filters[1]],
    },
    {
      ...confirmedSelection,
      filters: [
        { dimensionId: "nursery_component", operator: "in", values: ["55010305", "55010306"] },
        confirmedSelection.filters[1],
      ],
    },
    {
      ...confirmedSelection,
      filters: [
        { dimensionId: "gl", operator: "in", values: ["55010305", "DIFFERENT"] },
        confirmedSelection.filters[1],
      ],
    },
  ]) {
    assertResponseRejected(
      { ...equivalentSetAnswer, scope: changedScope },
      "included results must use the confirmed answer scope",
    );
  }
});

test("UI blocks reference unique rows and values present in a compatible result", () => {
  const monthlyTrend = {
    ...answer,
    ui: [
      {
        component: "MonthlyTrend",
        props: {
          resultId: "result-1",
          title: "Actual trend",
          rowKeys: ["month:2026-03-01", "month:2026-04-01"],
          series: [{ measureId: "actual", label: "Actual" }],
        },
      },
    ],
  };
  assertResponseAccepted(monthlyTrend);
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...monthlyTrend,
      ui: [
        {
          ...monthlyTrend.ui[0],
          props: { ...monthlyTrend.ui[0].props, unexpected: true },
        },
      ],
    }),
  );

  assertResponseRejected(
    {
      ...answer,
      ui: [
        {
          component: "FinancialTotal",
          props: { resultId: "result-1", title: "Budget", rowKey: null, valueKey: "budget" },
        },
      ],
    },
    "UI values must be present and requested in the referenced result",
  );
  assertResponseRejected(
    {
      ...answer,
      ui: [
        {
          component: "MonthlyTrend",
          props: {
            resultId: "result-1",
            title: "Actual trend",
            rowKeys: ["month:2026-03-01", "month:2026-03-01"],
            series: [{ measureId: "actual", label: "Actual" }],
          },
        },
      ],
    },
    "UI row references must be unique",
  );
  assertResponseRejected(
    (() => {
      const glSelection = { ...selection, dimensionIds: ["gl"] };
      const glResult = {
        ...result,
        selection: glSelection,
        rows: [
          {
            key: "gl:55010305",
            dimensions: { gl: "55010305" },
            values: {
              actual: { state: "available", value: "1.00", label: "Actual", drilldownId: "drill-gl" },
            },
          },
        ],
      };
      return {
        ...answer,
        scope: glSelection,
        results: { "result-1": glResult },
        monthlyDeltas: [],
        details: {
          "drill-gl": { status: "ready", page: preparedPage("drill-gl", "1.00", "1.00", "0.00") },
          "drill-total": answer.details["drill-total"],
        },
        ui: [
          {
            component: "MonthlyTrend",
            props: {
              resultId: "result-1",
              title: "Actual trend",
              rowKeys: ["gl:55010305"],
              series: [{ measureId: "actual", label: "Actual" }],
            },
          },
        ],
      };
    })(),
    "MonthlyTrend requires month-grouped results",
  );
});

test("monthly deltas keep exact money and distinguish unavailable percentage reasons", () => {
  const budgetAnswer = (
    previous: string | null,
    current: string | null,
    delta: { reason: string; amountChange: string | null; percentageChange: string | null },
  ) => {
    const budgetSelection = { ...selection, measureIds: ["budget"] };
    const budgetValue = (value: string | null) =>
      value === null
        ? { state: "not_loaded", value: null, label: "Budget not loaded for this Plant or month" }
        : { state: "available", value, label: "Budget" };
    const mixed = (previous === null) !== (current === null);
    const totals =
      previous !== null && current !== null
        ? { budget: budgetValue(current) }
        : {
            budget: budgetValue(null),
            ...(mixed
              ? {
                  availableBudgetSubtotal: {
                    value: previous ?? current,
                    label: "Available-only Budget subtotal — coverage incomplete",
                  },
                }
              : {}),
          };
    const budgetResult = {
      resultId: "budget-result",
      selection: budgetSelection,
      scope: { plantIds: ["DUB"], from: "2026-03-01", to: "2026-04-30" },
      rows: [
        { key: "budget-march", dimensions: { month: "2026-03-01" }, values: { budget: budgetValue(previous) } },
        { key: "budget-april", dimensions: { month: "2026-04-01" }, values: { budget: budgetValue(current) } },
      ],
      totals,
      coverage: [
        {
          plantId: "DUB",
          month: "2026-03-01",
          actual: "complete",
          budget: previous === null ? "not_loaded" : "loaded",
        },
        { plantId: "DUB", month: "2026-04-01", actual: "complete", budget: current === null ? "not_loaded" : "loaded" },
      ],
    };
    return {
      ...answer,
      scope: budgetSelection,
      results: { "budget-result": budgetResult },
      monthlyDeltas: [
        {
          resultId: "budget-result",
          measureId: "budget",
          previousRowKey: "budget-march",
          currentRowKey: "budget-april",
          ...delta,
        },
      ],
      ui: [
        {
          component: "MonthlyTrend",
          props: {
            resultId: "budget-result",
            title: "Budget trend",
            rowKeys: ["budget-march", "budget-april"],
            series: [{ measureId: "budget", label: "Budget" }],
          },
        },
      ],
      details: {},
    };
  };
  const cases = [
    ["available", budgetAnswer("2.00", "3.00", { reason: "available", amountChange: "1.00", percentageChange: "50" })],
    [
      "previous_zero",
      budgetAnswer("0.00", "1.00", { reason: "previous_zero", amountChange: "1.00", percentageChange: null }),
    ],
    ["previous_negative", answer],
    [
      "missing_previous",
      budgetAnswer(null, "1.00", { reason: "missing_previous", amountChange: null, percentageChange: null }),
    ],
    [
      "missing_current",
      budgetAnswer("1.00", null, { reason: "missing_current", amountChange: null, percentageChange: null }),
    ],
  ] as const;
  for (const [name, candidate] of cases) {
    assert.equal(financialChatResponseSchema.safeParse(candidate).success, true, name);
  }
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...answer,
      monthlyDeltas: [{ ...answer.monthlyDeltas[0], reason: "previous_negative", percentageChange: "-50" }],
    }),
  );
});

test("monthly deltas bind existing monthly rows and complete compatible measure values", () => {
  assertResponseRejected(
    {
      ...answer,
      monthlyDeltas: [{ ...answer.monthlyDeltas[0], previousRowKey: "month:2026-02-01" }],
    },
    "monthly deltas must reference ordered monthly rows for a requested measure",
  );
  assertResponseRejected(
    {
      ...answer,
      monthlyDeltas: [{ ...answer.monthlyDeltas[0], measureId: "budget" }],
    },
    "monthly deltas must reference ordered monthly rows for a requested measure",
  );
  const partialResult = {
    ...result,
    rows: result.rows.map((row, index) =>
      index === 0
        ? {
            ...row,
            values: {
              actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
              availableActualSubtotal: {
                value: "1.00",
                label: "Available-data Actual subtotal — completeness unconfirmed",
                drilldownId: "drill-partial",
              },
            },
          }
        : row,
    ),
    totals: {
      actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
      availableActualSubtotal: {
        value: "1.00",
        label: "Available-data Actual subtotal — completeness unconfirmed",
        drilldownId: "drill-partial-total",
      },
    },
    coverage: result.coverage.map((entry, index) => (index === 0 ? { ...entry, actual: "unconfirmed" } : entry)),
  };
  assertResponseRejected(
    {
      ...answer,
      results: { "result-1": partialResult },
      details: {
        "drill-partial": { status: "failed", reason: "data_unavailable", message: "Rerun this answer." },
        "drill-april": answer.details["drill-april"],
        "drill-partial-total": { status: "failed", reason: "data_unavailable", message: "Rerun this answer." },
      },
    },
    "numeric monthly deltas require complete source values",
  );
});

test("monthly deltas keep every non-month dimension coordinate unchanged", () => {
  const groupedSelection = { ...selection, dimensionIds: ["month", "gl"] };
  const groupedRows = result.rows.map((row, index) => ({
    ...row,
    key: `${row.key}:gl:${index}`,
    dimensions: { ...row.dimensions, gl: index === 0 ? "55010305" : "55010306" },
  }));
  assertResponseRejected(
    {
      ...answer,
      scope: groupedSelection,
      results: { "result-1": { ...result, selection: groupedSelection, rows: groupedRows } },
      monthlyDeltas: [
        {
          ...answer.monthlyDeltas[0],
          previousRowKey: groupedRows[0].key,
          currentRowKey: groupedRows[1].key,
        },
      ],
    },
    "monthly delta rows must share every non-month dimension coordinate",
  );
});

test("monthly deltas compare consecutive calendar months without gaps", () => {
  const gapSelection = {
    ...selection,
    timeWindow: { kind: "range", from: "2026-03-01", to: "2026-05-31" },
  };
  const gapRows = [
    result.rows[0],
    {
      ...result.rows[1],
      key: "month:2026-05-01",
      dimensions: { month: "2026-05-01" },
    },
  ];
  assertResponseRejected(
    {
      ...answer,
      scope: gapSelection,
      results: {
        "result-1": {
          ...result,
          selection: gapSelection,
          scope: { ...result.scope, to: "2026-05-31" },
          rows: gapRows,
          coverage: [...result.coverage, { plantId: "DUB", month: "2026-05-01", actual: "complete", budget: "loaded" }],
        },
      },
      monthlyDeltas: [
        {
          ...answer.monthlyDeltas[0],
          previousRowKey: gapRows[0].key,
          currentRowKey: gapRows[1].key,
        },
      ],
    },
    "monthly delta rows must be consecutive calendar months",
  );
});

test("monthly deltas accept the same coordinate from December to January", () => {
  const yearSelection = {
    ...selection,
    dimensionIds: ["month", "gl"],
    timeWindow: { kind: "range", from: "2025-12-01", to: "2026-01-31" },
  };
  const yearRows = result.rows.map((row, index) => ({
    ...row,
    key: index === 0 ? "month:2025-12-01:gl:55010305" : "month:2026-01-01:gl:55010305",
    dimensions: { month: index === 0 ? "2025-12-01" : "2026-01-01", gl: "55010305" },
  }));
  const yearAnswer = {
    ...answer,
    scope: yearSelection,
    results: {
      "result-1": {
        ...result,
        selection: yearSelection,
        scope: { ...result.scope, from: "2025-12-01", to: "2026-01-31" },
        rows: yearRows,
        coverage: [
          { plantId: "DUB", month: "2025-12-01", actual: "complete", budget: "loaded" },
          { plantId: "DUB", month: "2026-01-01", actual: "complete", budget: "loaded" },
        ],
      },
    },
    monthlyDeltas: [
      {
        ...answer.monthlyDeltas[0],
        previousRowKey: yearRows[0].key,
        currentRowKey: yearRows[1].key,
      },
    ],
  };
  assert.deepEqual(financialChatResponseSchema.parse(yearAnswer), yearAnswer);
});

test("ready details match advertised exact totals and remain prepared first pages", () => {
  assertResponseRejected(
    {
      ...answer,
      details: {
        ...answer.details,
        "drill-total": { status: "ready", page: { ...totalPage, matchingActualTotal: "0.00" } },
      },
    },
    "ready details must be the prepared first page with the advertised exact total",
  );
  assertResponseRejected(
    {
      ...answer,
      details: {
        ...answer.details,
        "drill-total": {
          status: "ready",
          page: {
            ...totalPage,
            transactions: Array.from({ length: 11 }, (_, index) => ({
              ...totalPage.transactions[0],
              id: `continuation-${index}`,
              transactionNumber: `CONT-${index}`,
              lineId: String(index),
            })),
            page: 2,
            limit: 20,
            totalItems: 21,
            totalPages: 2,
            pinnedContinuationLimit: 20,
          },
        },
      },
    },
    "ready details must be the prepared first page with the advertised exact total",
  );
});

test("reused handles cannot advertise conflicting exact values", () => {
  const conflictingResult = {
    ...result,
    resultId: "result-2",
    rows: [],
    totals: {
      actual: { state: "available", value: "1.00", label: "Actual", drilldownId: "drill-total" },
    },
  };
  assertResponseRejected(
    {
      ...answer,
      results: { ...answer.results, "result-2": conflictingResult },
    },
    "reused Actual handles must advertise one exact value",
  );
});

test("reused handles reject the same value at different cross-result coordinates", () => {
  const secondResult = {
    ...result,
    resultId: "result-2",
    rows: [
      {
        ...result.rows[1],
        values: {
          actual: {
            ...result.rows[1].values.actual,
            value: result.rows[0].values.actual.value,
            drilldownId: result.rows[0].values.actual.drilldownId,
          },
        },
      },
    ],
  };
  assertResponseRejected(
    { ...answer, results: { ...answer.results, "result-2": secondResult } },
    "reused Actual handles must identify one exact selection, coordinate, kind, and value",
  );
});

test("reused handles reject complete and available-subtotal kind aliases", () => {
  const partialResult = {
    ...result,
    resultId: "result-2",
    rows: [
      {
        ...result.rows[0],
        values: {
          actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
          availableActualSubtotal: {
            value: result.rows[0].values.actual.value,
            label: "Available-data Actual subtotal — completeness unconfirmed",
            drilldownId: result.rows[0].values.actual.drilldownId,
          },
        },
      },
    ],
    totals: {
      actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
      availableActualSubtotal: {
        value: "1.00",
        label: "Available-data Actual subtotal — completeness unconfirmed",
        drilldownId: "drill-partial-total-2",
      },
    },
    coverage: result.coverage.map((entry, index) => (index === 0 ? { ...entry, actual: "unconfirmed" } : entry)),
  };
  assertResponseRejected(
    {
      ...answer,
      results: { ...answer.results, "result-2": partialResult },
      details: {
        ...answer.details,
        "drill-partial-total-2": { status: "failed", reason: "data_unavailable", message: "Rerun this answer." },
      },
    },
    "reused Actual handles must identify one exact selection, coordinate, kind, and value",
  );
});

test("reused handles allow identical null coordinates and provably identical total-row scopes", () => {
  const nullGlSelection = { ...selection, dimensionIds: ["month", "gl"] };
  const nullGlResult = {
    ...result,
    selection: nullGlSelection,
    rows: [{ ...result.rows[0], dimensions: { month: "2026-03-01", gl: null } }],
  };
  assertResponseAccepted({
    ...answer,
    scope: nullGlSelection,
    results: {
      "result-1": nullGlResult,
      "result-2": {
        ...nullGlResult,
        resultId: "result-2",
        selection: { ...nullGlSelection, dimensionIds: ["gl", "month"] },
      },
    },
    monthlyDeltas: [],
    details: {
      "drill-march": answer.details["drill-march"],
      "drill-total": answer.details["drill-total"],
    },
  });

  const singleMonthSelection = {
    ...selection,
    timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
  };
  const sharedValue = { ...result.rows[1].values.actual, drilldownId: "shared-total-row" };
  const totalResult = {
    ...result,
    selection: singleMonthSelection,
    scope: { ...result.scope, from: "2026-04-01" },
    rows: [],
    totals: { actual: sharedValue },
    coverage: [result.coverage[1]],
  };
  const rowResult = {
    ...totalResult,
    resultId: "result-2",
    rows: [{ ...result.rows[1], values: { actual: sharedValue } }],
    totals: { actual: { ...sharedValue, drilldownId: "single-month-total" } },
  };
  assertResponseAccepted({
    ...answer,
    scope: singleMonthSelection,
    results: { "result-1": totalResult, "result-2": rowResult },
    monthlyDeltas: [],
    details: {
      "shared-total-row": { status: "failed", reason: "preparation_timeout", message: "Try again." },
      "single-month-total": { status: "failed", reason: "preparation_timeout", message: "Try again." },
    },
  });
});

test("aliased handles cannot bypass the 200 distinct Actual scope cap", () => {
  const glSelection = { ...selection, dimensionIds: ["gl"] };
  const aliasedResults = Object.fromEntries(
    Array.from({ length: 200 }, (_, index) => {
      const resultId = `alias-${index}`;
      return [
        resultId,
        {
          ...result,
          resultId,
          selection: glSelection,
          rows: [
            {
              key: `gl:${index}`,
              dimensions: { gl: String(index) },
              values: { actual: { state: "available", value: "1.00", label: "Actual", drilldownId: "alias" } },
            },
          ],
          totals: { actual: { state: "available", value: "200.00", label: "Actual", drilldownId: "alias-total" } },
        },
      ];
    }),
  );
  assertResponseRejected(
    {
      ...answer,
      scope: glSelection,
      results: aliasedResults,
      monthlyDeltas: [],
      ui: [
        {
          component: "FinancialTotal",
          props: { resultId: "alias-0", title: "Actual", rowKey: null, valueKey: "actual" },
        },
      ],
      details: {
        alias: { status: "failed", reason: "preparation_timeout", message: "Narrow the scope." },
        "alias-total": { status: "failed", reason: "preparation_timeout", message: "Narrow the scope." },
      },
    },
    "an answer cannot advertise more than 200 Actual scopes",
  );
});

test("an answer refuses more than 200 distinct Actual scopes", () => {
  const glSelection = { ...selection, dimensionIds: ["gl"] };
  const rows = Array.from({ length: 199 }, (_, index) => ({
    key: `gl:${index}`,
    dimensions: { gl: String(index) },
    values: {
      actual: { state: "available", value: "1.00", label: "Actual", drilldownId: `cap-${index}` },
    },
  }));
  const firstResult = {
    ...result,
    selection: glSelection,
    rows,
    totals: { actual: { state: "available", value: "199.00", label: "Actual", drilldownId: "cap-total" } },
  };
  const secondResult = {
    ...result,
    resultId: "result-2",
    selection: glSelection,
    rows: [],
    totals: { actual: { state: "available", value: "1.00", label: "Actual", drilldownId: "cap-201" } },
  };
  const details = Object.fromEntries(
    [...rows.map(({ values }) => values.actual.drilldownId), "cap-total", "cap-201"].map((handle) => [
      handle,
      { status: "failed", reason: "preparation_timeout", message: "Rerun with a narrower scope." },
    ]),
  );
  assertResponseRejected(
    {
      ...answer,
      scope: glSelection,
      results: { "result-1": firstResult, "result-2": secondResult },
      monthlyDeltas: [],
      ui: [
        {
          component: "FinancialTotal",
          props: { resultId: "result-1", title: "Actual", rowKey: null, valueKey: "actual" },
        },
      ],
      details,
    },
    "an answer cannot advertise more than 200 Actual scopes",
  );
});

test("capabilities are strict and explain every unavailable state", () => {
  const capabilities = {
    version: 1,
    enabled: true,
    available: true,
    reason: null,
    model: { provider: "anthropic", modelId: "claude-sonnet-5-5" },
    limits: {
      maxPreparedActualScopes: 200,
      preparedTransactionRows: 10,
      defaultContinuationRows: 20,
      maxContinuationRows: 100,
      conversationIdleMinutes: 60,
    },
  };
  assert.deepEqual(financialChatCapabilitiesSchema.parse(capabilities), capabilities);
  for (const reason of ["access_denied", "no_plant_access", "model_unavailable"] as const) {
    const unavailable = { ...capabilities, available: false, reason };
    assert.deepEqual(financialChatCapabilitiesSchema.parse(unavailable), unavailable);
  }
  const disabled = { ...capabilities, enabled: false, available: false, reason: "feature_disabled" as const };
  assert.deepEqual(financialChatCapabilitiesSchema.parse(disabled), disabled);

  assert.throws(() => financialChatCapabilitiesSchema.parse({ ...capabilities, enabled: false }));
  assert.throws(() =>
    financialChatCapabilitiesSchema.parse({
      ...capabilities,
      available: false,
      reason: "feature_disabled",
    }),
  );
  assert.throws(() => financialChatCapabilitiesSchema.parse({ ...capabilities, extra: true }));
  assert.throws(() =>
    financialChatCapabilitiesSchema.parse({
      ...capabilities,
      enabled: false,
      available: false,
      reason: "access_denied",
    }),
  );
});

test("paging and lifecycle failures have stable typed reasons", () => {
  for (const reason of [
    "invalid_pagination",
    "page_size_changed",
    "page_out_of_range",
    "context_expired",
    "permission_changed",
    "drill_expired",
    "preparation_timeout",
    "model_unavailable",
  ]) {
    assert.equal(financialChatErrorReasonSchema.parse(reason), reason);
  }
  assert.deepEqual(
    financialChatErrorDetailsSchema.parse({
      reason: "invalid_pagination",
      fieldErrors: [{ field: "page", reason: "must be an integer from 1" }],
    }).reason,
    "invalid_pagination",
  );
  assert.equal(
    financialChatErrorDetailsSchema.parse({
      reason: "page_size_changed",
      pinnedContinuationLimit: 20,
    }).pinnedContinuationLimit,
    20,
  );
  assert.throws(() => financialChatErrorDetailsSchema.parse({ reason: "invalid_pagination" }));
  assert.throws(() => financialChatErrorDetailsSchema.parse({ reason: "invalid_pagination", fieldErrors: [] }));
  assert.throws(() => financialChatErrorDetailsSchema.parse({ reason: "page_size_changed" }));
  assert.throws(() =>
    financialChatErrorDetailsSchema.parse({ reason: "page_size_changed", pinnedContinuationLimit: 101 }),
  );
  assert.throws(() =>
    financialChatErrorDetailsSchema.parse({
      reason: "invalid_pagination",
      fieldErrors: [{ field: "page", reason: "is invalid" }],
      pinnedContinuationLimit: 20,
    }),
  );
  assert.throws(() => financialChatErrorReasonSchema.parse("unknown_failure"));
  assert.throws(() => financialChatErrorDetailsSchema.parse({ reason: "unknown_failure" }));
  assert.deepEqual(financialChatErrorDetailsSchema.parse({ reason: "context_expired" }), {
    reason: "context_expired",
  });
  assert.throws(() =>
    financialChatErrorDetailsSchema.parse({
      reason: "context_expired",
      fieldErrors: [{ field: "page", reason: "is invalid" }],
    }),
  );
  assert.throws(() =>
    financialChatErrorDetailsSchema.parse({ reason: "page_size_changed", pinnedContinuationLimit: 20, extra: true }),
  );

  const pageSizeError: ErrorPayload = {
    errorId: "error-1",
    code: "BAD_REQUEST",
    type: "BadRequest",
    message: "Page size changed.",
    userMessage: "Use the original page size.",
    details: { reason: "page_size_changed", pinnedContinuationLimit: 20 },
    statusCode: 400,
    correlationId: "correlation-1",
    requestId: null,
    environment: "Local",
    timestampUtc: "2026-10-09T00:00:00.000Z",
  };
  assert.deepEqual(financialChatErrorDetailsSchema.parse(pageSizeError.details), pageSizeError.details);
});

test("standard error envelope types require paging metadata", () => {
  const source = (details: string) => `
    import type { ErrorPayload } from "../src/api";
    import { MeasureFilterInvalidReason } from "../src/api";
    const payload: ErrorPayload = {
      errorId: "error-1",
      code: "BAD_REQUEST",
      type: "BadRequest",
      message: "Request failed.",
      userMessage: "Check the request and try again.",
      details: ${details},
      statusCode: 400,
      correlationId: "correlation-1",
      requestId: null,
      environment: "Local",
      timestampUtc: "2026-10-09T00:00:00.000Z",
    };
    void payload;
    void MeasureFilterInvalidReason;
  `;
  const diagnostics = compileErrorPayloadControls({
    "invalid-pagination-missing.ts": source('{ reason: "invalid_pagination" }'),
    "page-size-missing.ts": source('{ reason: "page_size_changed" }'),
    "valid-invalid-pagination.ts": source(
      '{ reason: "invalid_pagination", fieldErrors: [{ field: "page", reason: "must be positive" }] }',
    ),
    "valid-page-size.ts": source('{ reason: "page_size_changed", pinnedContinuationLimit: 20 }'),
    "valid-financial-reason.ts": source('{ reason: "context_expired" }'),
    "valid-legacy-reason.ts": source("{ reason: MeasureFilterInvalidReason.NotComparable }"),
  });

  assert.ok(
    diagnostics.get("invalid-pagination-missing.ts")?.some((message) => message.includes("fieldErrors")),
    "invalid_pagination must require fieldErrors at compile time",
  );
  assert.ok(
    diagnostics.get("page-size-missing.ts")?.some((message) => message.includes("pinnedContinuationLimit")),
    "page_size_changed must require the pinned limit at compile time",
  );
  for (const name of [
    "valid-invalid-pagination.ts",
    "valid-page-size.ts",
    "valid-financial-reason.ts",
    "valid-legacy-reason.ts",
  ]) {
    assert.deepEqual(diagnostics.get(name), [], `${name} should compile`);
  }
});

test("the terminal stream frame repeats the complete answer", () => {
  const event = {
    version: 1,
    eventId: "event-3",
    sequence: 3,
    conversationId: "conversation-1",
    runId: "run-1",
    type: "final",
    response: answer,
  };
  assert.deepEqual(financialChatEventSchema.parse(event), event);
  assert.throws(() => financialChatEventSchema.parse({ ...event, response: undefined }));
  assert.throws(() => financialChatEventSchema.parse({ ...event, unknown: true }));
  assert.throws(() => financialChatEventSchema.parse({ ...event, conversationId: "OTHER" }));
});
