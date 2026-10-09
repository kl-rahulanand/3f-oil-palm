import assert from "node:assert/strict";
import { test } from "node:test";

import {
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

test("included results must use the answer's confirmed scope", () => {
  assertResponseRejected(
    {
      ...answer,
      scope: { ...answer.scope, plantIds: ["OTHER"] },
    },
    "included results must use the confirmed answer scope",
  );
});

test("UI blocks reference unique rows and values present in a compatible result", () => {
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
  assert.throws(() => financialChatCapabilitiesSchema.parse({ ...capabilities, enabled: false }));
  assert.throws(() =>
    financialChatCapabilitiesSchema.parse({
      ...capabilities,
      available: false,
      reason: "feature_disabled",
    }),
  );
  assert.throws(() => financialChatCapabilitiesSchema.parse({ ...capabilities, extra: true }));
  assert.deepEqual(
    financialChatCapabilitiesSchema.parse({
      ...capabilities,
      available: false,
      reason: "access_denied",
    }).reason,
    "access_denied",
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
  assert.throws(() => financialChatErrorReasonSchema.parse("unknown_failure"));
  assert.throws(() =>
    financialChatErrorDetailsSchema.parse({ reason: "page_size_changed", pinnedContinuationLimit: 20, extra: true }),
  );
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
