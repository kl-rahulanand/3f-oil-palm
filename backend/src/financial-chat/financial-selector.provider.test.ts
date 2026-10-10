import assert from "node:assert/strict";
import test from "node:test";
import { FINANCIAL_TOOL_DEFINITIONS, type FinancialSelection } from "@3f/contract";

import type { FinancialChatModelSettings } from "../config";
import {
  FinancialSelectorProvider,
  FinancialSelectorVendorError,
  type FinancialSelectorClient,
  type FinancialSelectorInvocation,
  type FinancialSelectorVendorResponse,
} from "./financial-selector.provider";
import { FINANCIAL_CHAT_TOOLS } from "./financial-chat.tools";

const settings: FinancialChatModelSettings = {
  provider: "anthropic",
  modelId: "claude-sonnet-5-5",
  apiKey: "test-only-key",
  maxRetries: 1,
  timeoutMs: 1_000,
};

const selection: FinancialSelection = {
  measureIds: ["actual"],
  dimensionIds: ["plant"],
  plantIds: ["DUB"],
  timeWindow: { kind: "month", from: "2026-08-01", to: "2026-08-31" },
  filters: [],
};

const validToolOutputs = [
  {
    measures: [{ id: "actual", label: "Actual", description: "Debit minus Credit from source transactions." }],
    dimensions: [
      {
        id: "plant",
        label: "Plant",
        description: "An authorized operating Plant.",
        supportedMeasureIds: ["actual"],
      },
    ],
    combinations: [{ measureIds: ["actual"], dimensionIds: ["plant"] }],
    timeWindows: ["month", "range", "financial_ytd"],
    fiscalYearStartMonth: 4,
    limits: {
      maxAggregateRows: 199,
      maxPreparedActualScopes: 200,
      preparedTransactionRows: 10,
      defaultContinuationRows: 20,
      maxContinuationRows: 100,
    },
  },
  { matches: [{ dimensionId: "plant", value: "DUB", label: "DUB", aliases: [] }] },
  {
    resultId: "result-1",
    selection,
    scope: { plantIds: ["DUB"], from: "2026-08-01", to: "2026-08-31" },
    rows: [],
    totals: {
      actual: { state: "available", value: "10.00", label: "Actual", drilldownId: "drill-1" },
    },
    coverage: [{ plantId: "DUB", month: "2026-08-01", actual: "complete", budget: "loaded" }],
  },
  {
    drilldownId: "drill-1",
    transactions: [],
    page: 1,
    limit: 10,
    totalItems: 0,
    totalPages: 1,
    matchingActualTotal: "0.00",
    preparedSize: 10,
    defaultContinuationLimit: 20,
    pinnedContinuationLimit: null,
  },
] as const;

function toolResponse(overrides: Partial<FinancialSelectorVendorResponse> = {}): FinancialSelectorVendorResponse {
  return {
    toolCalls: [{ name: "query_financials", input: selection }],
    usage: { inputTokens: 900, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    ...overrides,
  };
}

test("the four selector tools keep strict meaningful input and output contracts", () => {
  assert.deepEqual(
    FINANCIAL_CHAT_TOOLS.map(({ name }) => name),
    ["get_financial_catalog", "find_dimension_values", "query_financials", "get_actual_transactions"],
  );

  const validInputs = [
    {},
    { dimensionId: "plant", search: "DUB" },
    selection,
    { drilldownId: "opaque-handle", page: 1, limit: 10 },
  ];
  for (const [index, definition] of FINANCIAL_CHAT_TOOLS.entries()) {
    assert.ok(definition.description.length >= 60, `${definition.name} needs a meaningful description`);
    assert.equal(definition.inputSchema.safeParse(validInputs[index]).success, true);
    assert.equal(definition.inputSchema.safeParse({ ...validInputs[index], unexpected: true }).success, false);
    assert.equal(definition.outputSchema.safeParse(validToolOutputs[index]).success, true);
    assert.equal(definition.outputSchema.safeParse({ unexpected: true }).success, false);
    assert.equal(definition.inputSchema, FINANCIAL_TOOL_DEFINITIONS[index]?.inputSchema);
    assert.equal(definition.outputSchema, FINANCIAL_TOOL_DEFINITIONS[index]?.outputSchema);
    assert.doesNotMatch(JSON.stringify(definition.modelSchema), /DUB|AP-AGRI|permittedValues/);
  }
});

test("retained selections are runtime-validated and limited to current permitted vocabulary", async () => {
  const invocations: FinancialSelectorInvocation[] = [];
  const provider = new FinancialSelectorProvider(settings, {
    client: {
      invoke: async (invocation) => {
        invocations.push(invocation);
        return toolResponse();
      },
    },
  });
  const request = {
    userText: "question",
    confirmedSelection: null,
    pendingSelection: null,
    permittedVocabulary: [{ dimensionId: "plant", value: "AP-AGRI", label: "AP-AGRI" }],
  };

  await assert.rejects(
    provider.select({ ...request, confirmedSelection: selection }),
    (error: unknown) =>
      error instanceof FinancialSelectorVendorError && error.code === "FINANCIAL_MODEL_INVALID_RESPONSE",
  );
  await assert.rejects(
    provider.select({
      ...request,
      pendingSelection: { plantIds: ["DUB"] },
    }),
    (error: unknown) =>
      error instanceof FinancialSelectorVendorError && error.code === "FINANCIAL_MODEL_INVALID_RESPONSE",
  );
  await assert.rejects(
    provider.select({
      ...request,
      pendingSelection: {
        filters: [
          {
            dimensionId: "plant",
            operator: "in",
            values: Array.from({ length: 201 }, () => "AP-AGRI"),
          },
        ],
      } as Partial<FinancialSelection>,
    }),
    (error: unknown) =>
      error instanceof FinancialSelectorVendorError && error.code === "FINANCIAL_MODEL_INVALID_RESPONSE",
  );
  await provider.select({
    ...request,
    pendingSelection: {
      plantIds: ["AP-AGRI"],
      filters: [{ dimensionId: "plant", operator: "eq", value: "AP-AGRI" }],
    },
  });
  assert.deepEqual(JSON.parse(invocations.at(-1)?.dynamicContext ?? "").pendingSelection, {
    plantIds: ["AP-AGRI"],
    filters: [{ dimensionId: "plant", operator: "eq", value: "AP-AGRI" }],
  });

  assert.equal(invocations.length, 1);
});

test("the cached static prefix is byte-identical across grants and precedes dynamic context", async () => {
  const invocations: FinancialSelectorInvocation[] = [];
  const client: FinancialSelectorClient = {
    invoke: async (invocation) => {
      invocations.push(invocation);
      return toolResponse();
    },
  };
  const provider = new FinancialSelectorProvider(settings, { client });

  await provider.select({
    userText: "Actual for August",
    confirmedSelection: null,
    pendingSelection: null,
    permittedVocabulary: [{ dimensionId: "plant", value: "DUB", label: "DUB" }],
  });
  await provider.select({
    userText: "Actual for August",
    confirmedSelection: null,
    pendingSelection: null,
    permittedVocabulary: [{ dimensionId: "plant", value: "AP-AGRI", label: "AP-AGRI" }],
  });

  assert.equal(invocations.length, 2);
  assert.equal(invocations[0]?.staticPrefixBytes, invocations[1]?.staticPrefixBytes);
  assert.match(invocations[0]?.staticPrefixBytes ?? "", /factual comparisons/);
  assert.match(invocations[0]?.staticPrefixBytes ?? "", /monthly trends/);
  assert.match(invocations[0]?.staticPrefixBytes ?? "", /clarification/);
  assert.match(invocations[0]?.staticPrefixBytes ?? "", /transaction requests/);
  const prefix = invocations[0]?.staticPrefixBytes ?? "";
  const instructionText = (JSON.parse(prefix) as { instructions: Array<{ text: string }> }).instructions
    .map(({ text }) => text)
    .join("\n");
  assert.ok(instructionText.indexOf("factual comparisons") < instructionText.indexOf("monthly trends"));
  assert.ok(instructionText.indexOf("monthly trends") < instructionText.indexOf("clarification"));
  assert.ok(instructionText.indexOf("clarification") < instructionText.indexOf("transaction requests"));
  assert.match(invocations[0]?.staticPrefixBytes ?? "", /"ttl":"5m"/);
  assert.doesNotMatch(invocations[0]?.staticPrefixBytes ?? "", /DUB|AP-AGRI/);
  assert.match(invocations[0]?.dynamicContext, /DUB/);
  assert.match(invocations[1]?.dynamicContext, /AP-AGRI/);
});

test("the direct Anthropic request keeps cache and strict tool boundaries on the real wire payload", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        id: "message-1",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "tool_use", id: "tool-1", name: "query_financials", input: selection }],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: {
          input_tokens: 900,
          output_tokens: 20,
          cache_creation_input_tokens: 700,
          cache_read_input_tokens: 0,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const provider = new FinancialSelectorProvider({ ...settings, maxRetries: 0 });
    const result = await provider.select({
      userText: "Actual for August",
      confirmedSelection: null,
      pendingSelection: null,
      permittedVocabulary: [{ dimensionId: "plant", value: "DUB", label: "DUB" }],
      serverContext: {
        money: "₹98,765.43",
        rows: ["row-secret"],
        drilldownIds: ["drill-secret"],
        batchIds: ["batch-secret"],
        rawState: "raw-state",
        renderedAnswer: "rendered-answer",
      },
    });
    assert.equal(result.cache.status, "write");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(requestBody);
  assert.equal(requestBody.model, "claude-sonnet-5-5");
  assert.equal(requestBody.tool_choice, undefined);
  assert.equal(requestBody.temperature, undefined);
  assert.equal(requestBody.top_p, undefined);
  const system = requestBody.system as Array<Record<string, unknown>>;
  assert.deepEqual(system.at(-1)?.cache_control, { type: "ephemeral", ttl: "5m" });
  const tools = requestBody.tools as Array<Record<string, unknown>>;
  assert.equal(tools.length, 4);
  assert.ok(tools.every(({ strict }) => strict === true));
  const payload = JSON.stringify(requestBody);
  for (const marker of ["₹98,765.43", "row-secret", "drill-secret", "batch-secret", "raw-state", "rendered-answer"])
    assert.doesNotMatch(payload, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("retries, traces and logs never receive server financial results or raw state", async () => {
  const forbidden = ["₹98,765.43", "row-secret", "drill-secret", "batch-secret", "raw-state", "rendered-answer"];
  const invocations: FinancialSelectorInvocation[] = [];
  const traces: unknown[] = [];
  const logs: unknown[] = [];
  let attempt = 0;
  const client: FinancialSelectorClient = {
    invoke: async (invocation) => {
      invocations.push(invocation);
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error("provider payload echoed ₹98,765.43"), { status: 529 });
      return toolResponse();
    },
  };
  const provider = new FinancialSelectorProvider(settings, {
    client,
    trace: (event) => traces.push(event),
    log: (event) => logs.push(event),
  });

  const result = await provider.select({
    userText: "Show August Actual",
    confirmedSelection: selection,
    pendingSelection: null,
    permittedVocabulary: [{ dimensionId: "plant", value: "DUB", label: "DUB" }],
    serverContext: {
      money: forbidden[0],
      rows: [forbidden[1]],
      drilldownIds: [forbidden[2]],
      batchIds: [forbidden[3]],
      rawState: forbidden[4],
      renderedAnswer: forbidden[5],
    },
  });

  assert.equal(result.toolCalls[0]?.name, "query_financials");
  assert.equal(invocations.length, 2);
  const captured = JSON.stringify({ invocations, traces, logs });
  for (const marker of forbidden)
    assert.doesNotMatch(captured, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("cache misses are recorded only as aggregate counters and never change selection", async () => {
  const telemetry: unknown[] = [];
  const provider = new FinancialSelectorProvider(settings, {
    client: { invoke: async () => toolResponse() },
    recordTelemetry: (event) => telemetry.push(event),
  });

  const result = await provider.select({
    userText: "Actual for August",
    confirmedSelection: null,
    pendingSelection: null,
    permittedVocabulary: [],
  });

  assert.equal(result.cache.status, "miss");
  assert.equal(telemetry.length, 1);
  const [event] = telemetry as Array<Record<string, unknown>>;
  assert.deepEqual(
    { ...event, durationMs: 0 },
    {
      event: "financial_selector_model_call",
      attempts: 1,
      durationMs: 0,
      inputTokens: 900,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      cacheStatus: "miss",
    },
  );
  assert.equal(typeof event?.durationMs, "number");
  assert.doesNotMatch(JSON.stringify(telemetry), /Actual for August/);
});

test("timeouts and unavailable or malformed vendor replies become typed safe errors", async (t) => {
  await t.test("timeout", async () => {
    class APIConnectionTimeoutError extends Error {}
    const provider = new FinancialSelectorProvider(settings, {
      client: { invoke: async () => Promise.reject(new APIConnectionTimeoutError("secret timeout")) },
    });
    await assert.rejects(
      provider.select({
        userText: "question",
        confirmedSelection: null,
        pendingSelection: null,
        permittedVocabulary: [],
      }),
      (error: unknown) =>
        error instanceof FinancialSelectorVendorError &&
        error.code === "FINANCIAL_MODEL_TIMEOUT" &&
        error.message === "The financial question selector timed out. Please try again.",
    );
  });

  await t.test("unavailable", async () => {
    const provider = new FinancialSelectorProvider(
      { ...settings, maxRetries: 0 },
      {
        client: { invoke: async () => Promise.reject(Object.assign(new Error("secret unavailable"), { status: 503 })) },
      },
    );
    await assert.rejects(
      provider.select({
        userText: "question",
        confirmedSelection: null,
        pendingSelection: null,
        permittedVocabulary: [],
      }),
      (error: unknown) => error instanceof FinancialSelectorVendorError && error.code === "FINANCIAL_MODEL_UNAVAILABLE",
    );
  });

  await t.test("rate limit after bounded retry", async () => {
    let attempts = 0;
    const provider = new FinancialSelectorProvider(settings, {
      client: {
        invoke: async () => {
          attempts += 1;
          throw Object.assign(new Error("secret rate limit"), { status: 429 });
        },
      },
    });
    await assert.rejects(
      provider.select({
        userText: "question",
        confirmedSelection: null,
        pendingSelection: null,
        permittedVocabulary: [],
      }),
      (error: unknown) => error instanceof FinancialSelectorVendorError && error.code === "FINANCIAL_MODEL_RATE_LIMIT",
    );
    assert.equal(attempts, 2);
  });

  await t.test("malformed", async () => {
    const traces: unknown[] = [];
    const logs: unknown[] = [];
    const telemetry: unknown[] = [];
    const provider = new FinancialSelectorProvider(settings, {
      client: {
        invoke: async () =>
          ({
            toolCalls: [{ name: "query_financials", input: { payload: "secret-vendor-payload" } }],
          }) as unknown as FinancialSelectorVendorResponse,
      },
      trace: (event) => traces.push(event),
      log: (event) => logs.push(event),
      recordTelemetry: (event) => telemetry.push(event),
    });
    await assert.rejects(
      provider.select({
        userText: "question",
        confirmedSelection: null,
        pendingSelection: null,
        permittedVocabulary: [],
      }),
      (error: unknown) =>
        error instanceof FinancialSelectorVendorError && error.code === "FINANCIAL_MODEL_INVALID_RESPONSE",
    );
    assert.deepEqual(traces, [
      {
        event: "financial_selector_attempt",
        attempt: 1,
        outcome: "failure",
        errorCode: "FINANCIAL_MODEL_INVALID_RESPONSE",
      },
    ]);
    assert.deepEqual(logs, traces);
    assert.equal((telemetry[0] as { attempts?: number } | undefined)?.attempts, 1);
    assert.doesNotMatch(JSON.stringify({ traces, logs, telemetry }), /secret-vendor-payload/);
  });
});
