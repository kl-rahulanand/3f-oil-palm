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
  timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
  filters: [],
};

const result = {
  resultId: "result-1",
  selection,
  scope: { plantIds: ["DUB"], from: "2026-04-01", to: "2026-04-30" },
  rows: [
    {
      key: "month:2026-04-01",
      dimensions: { month: "2026-04-01" },
      values: {
        actual: { state: "available", value: "-900719925474099312345678.90", label: "Actual", drilldownId: "drill-1" },
      },
    },
  ],
  totals: {
    actual: { state: "available", value: "-900719925474099312345678.90", label: "Actual", drilldownId: "drill-1" },
  },
  coverage: [{ plantId: "DUB", month: "2026-04-01", actual: "complete", budget: "loaded" }],
};

const page = {
  drilldownId: "drill-1",
  transactions: [],
  page: 1,
  limit: 10,
  totalItems: 0,
  totalPages: 1,
  matchingActualTotal: "-900719925474099312345678.90",
  preparedSize: 10,
  defaultContinuationLimit: 20,
  pinnedContinuationLimit: null,
};

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
      amountChange: "1.00",
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
  details: { "drill-1": { status: "ready", page } },
};

test("final financial answers are strict, self-contained, and preserve tool money exactly", () => {
  assert.deepEqual(financialChatResponseSchema.parse(answer), answer);
  const parsed = financialChatResponseSchema.parse(answer);
  assert.equal(parsed.kind, "answer");
  if (parsed.kind !== "answer") return;
  assert.equal(parsed.results["result-1"].totals.actual?.value, "-900719925474099312345678.90");
  assert.equal(parsed.details["drill-1"].status, "ready");

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
      details: { "drill-1": { status: "ready", page: { ...page, drilldownId: "different-drill" } } },
    }),
  );
});

test("monthly deltas keep exact money and distinguish unavailable percentage reasons", () => {
  const cases = [
    { reason: "available", amountChange: "1.00", percentageChange: "12.5" },
    { reason: "previous_zero", amountChange: "1.00", percentageChange: null },
    { reason: "previous_negative", amountChange: "1.00", percentageChange: null },
    { reason: "missing_previous", amountChange: null, percentageChange: null },
    { reason: "missing_current", amountChange: null, percentageChange: null },
  ];
  for (const delta of cases) {
    assert.equal(
      financialChatResponseSchema.safeParse({ ...answer, monthlyDeltas: [{ ...answer.monthlyDeltas[0], ...delta }] })
        .success,
      true,
      delta.reason,
    );
  }
  assert.throws(() =>
    financialChatResponseSchema.parse({
      ...answer,
      monthlyDeltas: [{ ...answer.monthlyDeltas[0], reason: "previous_negative", percentageChange: "-50" }],
    }),
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
});
