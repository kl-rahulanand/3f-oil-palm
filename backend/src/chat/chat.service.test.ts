import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  MeasureFilterInvalidReason,
  ResponseClass,
  type AskPriorTurn,
  type AuthUser,
  type ProvenanceBatch,
  type ResultTable,
  type Selection,
} from "@3f/contract";
import type { LlmProvider, LlmSelectionInput, LlmSelectionResult } from "../llm/llm.interface";
import { BedrockLlmProvider } from "../llm/bedrock.provider";
import { LLM_CONTEXT_CHAR_BUDGET, LLM_MESSAGES } from "../llm/llm.constants";
import { loadConfig } from "../config";
import { AppModule } from "../app.module";
import type { DrillPredicate, DrillSummary } from "../warehouse/drill-transactions.interface";
import { GlNameRepository } from "../warehouse/gl-name.repository";
import { AskDrillContextService } from "./ask-drill-context";
import { SemanticLayer } from "../semantic/semanticLayer";
import { ChatController } from "./chat.controller";
import { askSchema } from "./chat.schemas";
import { ChatService, lastMonthBudgetPin, trimPriorTurnsToTokenBudget } from "./chat.service";

test("trimming retains the newest turns in oldest first order", () => {
  const turns = ["oldest", "middle", "newest"].map((question) => ({
    question,
    selection: financialSelection,
  }));
  const budget = JSON.stringify(turns.slice(1)).length;

  assert.deepEqual(
    trimPriorTurnsToTokenBudget(turns, budget).map((turn) => turn.question),
    ["middle", "newest"],
  );
});

test("incomplete selector outcomes are handled explicitly as backend errors before execution", async () => {
  for (const kind of ["no_tool_block", "backend_error"] as const) {
    const fixture = makeFixture({ kind });
    const response = await fixture.service.ask(userFor("governed-financial"), "session", "Show Actual");

    assert.equal(response.responseClass, ResponseClass.BackendError);
    assert.match(response.message ?? "", /incomplete model response/i);
    assert.equal(fixture.executor.calls, 0);
  }
});

test("an expected abort is not recorded as a backend error", async () => {
  const fixture = makeFixture({ selection: financialSelection });
  const abort = new AbortController();
  abort.abort();

  await assert.rejects(
    fixture.service.ask(
      userFor("governed-financial"),
      "session",
      "Show Actual",
      undefined,
      undefined,
      undefined,
      undefined,
      abort.signal,
    ),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(fixture.audit.results, 0);
  assert.equal(fixture.executor.calls, 0);
});

test("the llm provider receives the question prior turns and dimension values and never an amount or a result row", async () => {
  const fixture = makeFixture({
    selection: financialSelection,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true },
      ],
      rows: [
        {
          gl_code: "50001201",
          actual: 123.45,
          secret_row_marker: "warehouse-row",
          transaction_line: "transaction-line",
          batch_contents: "batch-contents",
        },
      ],
    },
    activeBatchIds: [{ source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID }],
    labels: [{ key: "50001201", label: "Sprout Cost - Imp", otherLabels: [] }],
    summaries: [{ rowKey: "50001201", feedingLineCount: 1, value: "123.45" }],
  });
  const priorTurns: AskPriorTurn[] = [{ question: "Earlier question", selection: financialSelection }];

  await fixture.service.ask(
    userFor("governed-financial"),
    "session",
    "Show Actual by GL code",
    undefined,
    undefined,
    priorTurns,
  );

  assert.equal(fixture.llm.inputs.length, 1);
  const input = fixture.llm.inputs[0];
  assert.deepEqual(Object.keys(input).sort(), [
    "allowedDomains",
    "comparableMeasureIdsByDomain",
    "dimensionValues",
    "priorTurns",
    "question",
  ]);
  assert.equal(input.question, "Show Actual by GL code");
  assert.deepEqual(input.priorTurns, priorTurns);
  assert.equal(input.allowedDomains[0]?.name, "governed-financial");
  assert.equal(input.allowedDomains[0]?.measures[0]?.label, "Actual");
  assert.equal(input.allowedDomains[0]?.dimensions.find(({ id }) => id === "gl_code")?.label, "GL code");
  assert.equal(input.dimensionValues?.gl_code?.length, 50);
  assert.deepEqual(input.dimensionValues?.gl_code?.at(0), "DUB-00");
  assert.deepEqual(input.dimensionValues?.gl_code?.at(-1), "DUB-49");
  assert.equal("month" in (input.dimensionValues ?? {}), false);
  assert.deepEqual(input.comparableMeasureIdsByDomain, {
    "governed-financial": ["governed-financial.actual"],
  });
  const serialized = JSON.stringify(input);
  for (const forbidden of [
    "123.45",
    "warehouse-row",
    "transaction-line",
    "batch-contents",
    "Sprout Cost - Imp",
    "rowLabels",
    "drill",
    "actualPaise",
    ACTUAL_BATCH_ID,
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("a GL-code answer carries scoped names and only matching transaction-backed Actuals in its signed drill metadata", async () => {
  const activeBatchIds: ProvenanceBatch[] = [
    { source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID },
    { source: "budget", period: "2026-07-01", batchId: BUDGET_BATCH_ID },
  ];
  const fixture = makeFixture({
    selection: financialSelection,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
      ],
      rows: [
        { gl_code: "50001201", actual: "8398339.00" },
        { gl_code: "50009999", actual: "0.00" },
        { gl_code: "50008888", actual: "0.00" },
        { gl_code: "50007777", actual: "1.00" },
      ],
    },
    activeBatchIds,
    labels: [
      { key: "50001201", label: "Sprout Cost - Imp", otherLabels: ["Sprout cost imported"] },
      { key: "50009999", label: "Budget fallback", otherLabels: [] },
      { key: "50008888", label: "Zero net", otherLabels: [] },
      { key: "50007777", label: "Mismatch", otherLabels: [] },
    ],
    summaries: [
      { rowKey: "50001201", feedingLineCount: 3, value: "8398339.00" },
      { rowKey: "50009999", feedingLineCount: 0, value: "0.00" },
      { rowKey: "50008888", feedingLineCount: 2, value: "0.00" },
      { rowKey: "50007777", feedingLineCount: 1, value: "2.00" },
    ],
  });

  const response = await fixture.service.ask(
    userFor("governed-financial"),
    "session",
    "Show Actual by GL code for July 2026",
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(response.rowLabels, fixture.names.labels);
  assert.deepEqual(response.drill?.rows, [
    { key: "50001201", drillable: true },
    { key: "50009999", drillable: false },
    { key: "50008888", drillable: true },
    { key: "50007777", drillable: false },
  ]);
  assert.equal(fixture.names.glCalls.length, 1);
  assert.equal(fixture.transactions.calls.length, 1);
  assert.deepEqual(
    fixture.names.glCalls[0]?.rows.map(({ key, predicate }) => ({ rowKey: key, predicate })),
    fixture.transactions.calls[0],
  );
  assert.deepEqual(fixture.names.glCalls[0]?.rows[0]?.predicate, {
    mode: "gl-and-plants",
    actualBatchIds: [ACTUAL_BATCH_ID],
    glCode: "50001201",
    plants: ["DUB"],
    filters: [],
    from: "2026-07-01",
    to: "2026-07-31",
  });
  assert.equal(fixture.names.glCalls[0]?.budgetBatchId, BUDGET_BATCH_ID);
  const verified = fixture.contexts.verify(response.drill!.context, "user-1");
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") {
    assert.deepEqual(verified.claims.plants, ["DUB"]);
    assert.deepEqual(verified.claims.pinnedActuals, [activeBatchIds[0]]);
    assert.equal(verified.claims.budget?.pin.batchId, BUDGET_BATCH_ID);
    assert.deepEqual(verified.claims.rows, [
      { key: "50001201", actualPaise: "839833900", drillable: true },
      { key: "50009999", actualPaise: "0", drillable: false },
      { key: "50008888", actualPaise: "0", drillable: true },
      { key: "50007777", actualPaise: "100", drillable: false },
    ]);
  }
  assert.deepEqual(fixture.logs, [{ context: { rowKey: "50007777" } }]);
});

test("a multi-period GL-code answer passes the last month's budget batch to the name resolver", async () => {
  const selection: Selection = {
    ...financialSelection,
    timeWindow: { grain: "month", from: "2026-06-01", to: "2026-07-01" },
  };
  const fixture = makeFixture({
    selection,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
      ],
      rows: [{ gl_code: "50001201", actual: "125.01" }],
    },
    activeBatchIds: [
      { source: "actuals", period: "2026-06-01", batchId: "actual-june" },
      { source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID },
      { source: "budget", period: "2026-06-01", batchId: "budget-june" },
      { source: "budget", period: "2026-07-01", batchId: BUDGET_BATCH_ID },
    ],
    labels: [{ key: "50001201", label: "Sprout Cost - Imp", otherLabels: [] }],
    summaries: [{ rowKey: "50001201", feedingLineCount: 1, value: "125.01" }],
  });

  const response = await fixture.service.ask(
    userFor("governed-financial"),
    "session",
    "Show Actual by GL code from June to July 2026",
    selection,
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(response.rowLabels, fixture.names.labels);
  assert.equal(fixture.names.glCalls[0]?.budgetBatchId, BUDGET_BATCH_ID);
});

test("statement label batch selection chooses the last budget month from a multi-month window", () => {
  const window = { grain: "month" as const, from: "2026-06-01", to: "2026-07-01" };
  const julyBudget = { source: "budget" as const, period: "2026-07-01", batchId: BUDGET_BATCH_ID };

  assert.deepEqual(
    lastMonthBudgetPin([{ source: "budget", period: "2026-06-01", batchId: "budget-june" }, julyBudget], window.to),
    julyBudget,
  );
});

test("unsupported or unauthorized answer shapes never issue drill metadata or summarize transactions", async () => {
  const cases: Array<{ name: string; selection: Selection; user: AuthUser }> = [
    {
      name: "month breakdown",
      selection: { ...financialSelection, dimensionIds: ["month"] },
      user: userFor("governed-financial"),
    },
    {
      name: "no breakdown",
      selection: { ...financialSelection, dimensionIds: [] },
      user: userFor("governed-financial"),
    },
    {
      name: "Budget only",
      selection: { ...financialSelection, measureIds: ["governed-financial.budget"] },
      user: userFor("governed-financial", false, ["governed-financial.budget"]),
    },
    {
      name: "percentage only",
      selection: { ...financialSelection, measureIds: ["governed-financial.percentage"] },
      user: userFor("governed-financial", false, ["governed-financial.percentage"]),
    },
    {
      name: "no Actual grant",
      selection: { ...financialSelection, measureIds: ["governed-financial.budget"] },
      user: userFor("governed-financial", false, ["governed-financial.budget"]),
    },
  ];

  for (const example of cases) {
    const fixture = makeFixture({
      selection: example.selection,
      result: {
        columns: [{ key: example.selection.dimensionIds[0] ?? "actual", label: "value", numeric: false }],
        rows: [],
      },
      activeBatchIds: [{ source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID }],
    });
    const response = await fixture.service.ask(example.user, "session", example.name);
    assert.equal(response.drill, undefined, example.name);
    assert.equal(fixture.transactions.calls.length, 0, example.name);
  }
});

test("an all-data GL answer still resolves names from its pinned months but carries no drill without a fixed window", async () => {
  const fixture = makeFixture({
    selection: { ...financialSelection, timeWindow: undefined },
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
      ],
      rows: [{ gl_code: "50001201", actual: "10.00" }],
    },
    activeBatchIds: [{ source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID }],
    labels: [{ key: "50001201", label: "Sprout Cost - Imp", otherLabels: [] }],
  });

  const response = await fixture.service.ask(userFor("governed-financial"), "session", "Show Actual by GL code");

  assert.deepEqual(response.rowLabels, fixture.names.labels);
  assert.equal(response.drill, undefined);
  assert.deepEqual(fixture.names.glCalls[0]?.rows[0]?.predicate, {
    mode: "gl-and-plants",
    actualBatchIds: [ACTUAL_BATCH_ID],
    glCode: "50001201",
    plants: ["DUB"],
    filters: [],
    from: "2026-07-01",
    to: "2026-07-01",
  });
  assert.equal(fixture.transactions.calls.length, 0);
});

test("the real application module resolves ChatService with the name and drill repositories", async () => {
  const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    assert.ok(application.get(ChatService));
    assert.ok(application.get(GlNameRepository));
  } finally {
    await application.close();
  }
});

test("a grounded selector keeps the report display scope and receives every permitted money comparison operand", async () => {
  const fixture = makeFixture({ selection: financialSelection, groundedSelection: financialSelection });
  const user = userFor("governed-financial");
  user.permissions.measureIds.push("governed-financial.budget", "governed-financial.percentage");

  await fixture.service.ask(user, "session", "Which are over budget?", undefined, { reportId: "actual-report" });

  const input = fixture.llm.inputs[0];
  assert.deepEqual(
    input.allowedDomains[0]?.measures.map(({ id }) => id),
    ["governed-financial.actual"],
  );
  assert.deepEqual(input.comparableMeasureIdsByDomain, {
    "governed-financial": ["governed-financial.actual", "governed-financial.budget"],
  });
});

test("a recorded provider comparison reaches Ask execution canonical with its operand displayed", async () => {
  const provider = bedrockProviderWith({
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
    filters: [],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
    timeWindow: { grain: "month", from: "2026-07-01", to: "2026-07-01" },
  });
  const fixture = makeFixture({ llm: provider });
  const user = userFor("governed-financial");
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(
    user,
    "session",
    "Show GL codes where Actual is more than Budget for July 2026",
  );

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.deepEqual(fixture.executor.selections[0]?.measureIds, [
    "governed-financial.actual",
    "governed-financial.budget",
  ]);
  assert.deepEqual(fixture.executor.selections[0]?.measureFilters, [
    {
      measureId: "governed-financial.actual",
      op: "gt",
      compareTo: { kind: "measure", measureId: "governed-financial.budget" },
    },
  ]);
});

test("the provider door refuses the non-decimal value 5 lakh as malformed before execution", async () => {
  const provider = bedrockProviderWith({
    ...financialSelection,
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "value", value: "5 lakh" },
      },
    ],
  });
  const fixture = makeFixture({ llm: provider });

  const response = await fixture.service.ask(userFor("governed-financial"), "session", "Which spent over 5 lakh?");

  assert.equal(response.responseClass, ResponseClass.NotSupported);
  assert.match(response.message ?? "", /plain number/);
  assert.equal(fixture.executor.calls, 0);
  assert.equal(fixture.logs[0]?.context.reason, MeasureFilterInvalidReason.MalformedValue);
});

test("provider comparison refusals classify the rejected measure by why it is invalid", async () => {
  const cases = [
    {
      providerReason: LLM_MESSAGES.selectionMeasureFiltersMalformed,
      expectedReason: MeasureFilterInvalidReason.MalformedValue,
      message: /plain number/,
      permittedDomains: [],
      permittedMeasures: [],
    },
    {
      providerReason: LLM_MESSAGES.selectionMeasureFilterOperandNotAllowed("governed-financial.percentage"),
      expectedReason: MeasureFilterInvalidReason.NotComparable,
      message: /can't compare % with anything/,
      permittedDomains: [],
      permittedMeasures: ["governed-financial.percentage"],
    },
    {
      providerReason: LLM_MESSAGES.selectionMeasureFilterMeasureNotAllowed("unknown.amount"),
      expectedReason: MeasureFilterInvalidReason.UnknownMeasure,
      message: /unavailable/,
      permittedDomains: [],
      permittedMeasures: [],
    },
    {
      providerReason: LLM_MESSAGES.selectionMeasureFilterOperandNotAllowed("mis-statement.actual_net"),
      expectedReason: MeasureFilterInvalidReason.UnknownMeasure,
      message: /unavailable/,
      permittedDomains: ["mis-statement"],
      permittedMeasures: ["mis-statement.actual_net"],
    },
  ];

  for (const entry of cases) {
    const fixture = makeFixture({
      llm: new FakeLlm({ kind: "unsupported", reason: entry.providerReason }),
    });
    const user = userFor("governed-financial");
    user.permissions.domains.push(...entry.permittedDomains);
    user.permissions.measureIds.push(...entry.permittedMeasures);

    const response = await fixture.service.ask(user, "session", "Use this comparison");

    assert.equal(response.responseClass, ResponseClass.NotSupported, entry.expectedReason);
    assert.match(response.message ?? "", entry.message, entry.expectedReason);
    assert.equal(fixture.executor.calls, 0, entry.expectedReason);
    assert.equal(fixture.logs[0]?.context.reason, entry.expectedReason);
  }
});

test("a grounded provider comparison is canonical before the grounding merge can discard it", async () => {
  const provider = bedrockProviderWith({
    ...financialSelection,
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "value", value: "5 lakh" },
      },
    ],
  });
  const fixture = makeFixture({ llm: provider, groundedSelection: financialSelection });

  const response = await fixture.service.ask(
    userFor("governed-financial"),
    "session",
    "Which spent over 5 lakh?",
    undefined,
    { reportId: "actual-report" },
  );

  assert.equal(response.responseClass, ResponseClass.NotSupported);
  assert.equal(fixture.executor.calls, 0);
  assert.equal(fixture.logs[0]?.context.reason, MeasureFilterInvalidReason.MalformedValue);
});

test("report grounding keeps report comparisons first and deduplicates an identical question comparison", async () => {
  const reportFilter: NonNullable<Selection["measureFilters"]>[number] = {
    measureId: "governed-financial.actual",
    op: "gt",
    compareTo: { kind: "value", value: "100.00" },
  };
  const questionFilter: NonNullable<Selection["measureFilters"]>[number] = {
    measureId: "governed-financial.actual",
    op: "lt",
    compareTo: { kind: "value", value: "200.00" },
  };
  const fixture = makeFixture({
    selection: { ...financialSelection, measureFilters: [reportFilter, questionFilter] },
    groundedSelection: { ...financialSelection, measureFilters: [reportFilter] },
  });

  const response = await fixture.service.ask(
    userFor("governed-financial"),
    "session",
    "Keep the report threshold and cap it at 200",
    undefined,
    { reportId: "actual-report" },
  );

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.deepEqual(fixture.executor.selections[0]?.measureFilters, [reportFilter, questionFilter]);
});

test("report grounding normalises equivalent comparison values before deduplicating them", async () => {
  for (const [questionValue, reportValue] of [
    ["500000", "500000.00"],
    ["500000.00", "500000"],
  ]) {
    const fixture = makeFixture({
      selection: {
        ...financialSelection,
        measureFilters: [
          {
            measureId: "governed-financial.actual",
            op: "gt",
            compareTo: { kind: "value", value: questionValue },
          },
        ],
      },
      groundedSelection: {
        ...financialSelection,
        measureFilters: [
          {
            measureId: "governed-financial.actual",
            op: "gt",
            compareTo: { kind: "value", value: reportValue },
          },
        ],
      },
    });

    const response = await fixture.service.ask(
      userFor("governed-financial"),
      "session",
      "Keep lines over five lakh",
      undefined,
      { reportId: "actual-report" },
    );

    assert.equal(response.responseClass, ResponseClass.Success);
    assert.deepEqual(fixture.executor.selections[0]?.measureFilters, [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "value", value: "500000.00" },
      },
    ]);
  }
});

test("an Actual-only grounded report applies an over-budget comparison before appending Budget", async () => {
  const fixture = makeFixture({
    selection: {
      ...financialSelection,
      measureFilters: [
        {
          measureId: "governed-financial.actual",
          op: "gt",
          compareTo: { kind: "measure", measureId: "governed-financial.budget" },
        },
      ],
    },
    groundedSelection: financialSelection,
  });
  const user = userFor("governed-financial");
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "Which are over budget?", undefined, {
    reportId: "actual-report",
  });

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.deepEqual(fixture.executor.selections[0]?.measureIds, [
    "governed-financial.actual",
    "governed-financial.budget",
  ]);
  assert.deepEqual(fixture.executor.selections[0]?.measureFilters, [
    {
      measureId: "governed-financial.actual",
      op: "gt",
      compareTo: { kind: "measure", measureId: "governed-financial.budget" },
    },
  ]);
});

test("a direct Ask selection is canonical before authorization and execution", async () => {
  const fixture = makeFixture({ selection: financialSelection });
  const directSelection: Selection = {
    ...financialSelection,
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
      {
        measureId: "governed-financial.budget",
        op: "gte",
        compareTo: { kind: "value", value: "500000" },
      },
    ],
  };
  const user = userFor("governed-financial");
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "Show the selected lines", directSelection);

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.deepEqual(fixture.executor.selections[0]?.measureIds, [
    "governed-financial.actual",
    "governed-financial.budget",
  ]);
  assert.deepEqual(fixture.executor.selections[0]?.measureFilters?.[1]?.compareTo, {
    kind: "value",
    value: "500000.00",
  });
  assert.equal(fixture.llm.inputs.length, 0);
});

test("a filtered prior turn is canonical provider context and still supplies the inherited time window", async () => {
  const currentSelection: Selection = { ...financialSelection, timeWindow: undefined };
  const priorSelection: Selection = {
    ...financialSelection,
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
  };
  const fixture = makeFixture({ selection: currentSelection });
  const user = userFor("governed-financial");
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "And Actual now?", undefined, undefined, [
    { question: "Show lines over budget", selection: priorSelection },
  ]);

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.deepEqual(fixture.llm.inputs[0]?.priorTurns?.[0]?.selection.measureIds, [
    "governed-financial.actual",
    "governed-financial.budget",
  ]);
  assert.deepEqual(fixture.llm.inputs[0]?.priorTurns?.[0]?.selection.measureFilters, priorSelection.measureFilters);
  assert.deepEqual(fixture.executor.selections[0]?.timeWindow, {
    grain: "month",
    from: "2026-07-01",
    to: "2026-07-01",
    column: "month",
  });
  assert.deepEqual(fixture.executor.selections[0]?.measureFilters, undefined);
});

test("Ask selects the intended window across supported ambiguous and no-period phrasings", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-02T00:00:00Z") });

  const wrongModelWindow = {
    grain: "month" as const,
    from: "2026-09-01",
    to: "2026-09-30",
    column: "month",
  };
  const july2026 = { grain: "day" as const, from: "2026-07-01", to: "2026-07-31", column: "month" };
  const inheritedJuly = { grain: "month" as const, from: "2026-07-01", to: "2026-07-01", column: "month" };
  const july2025 = { grain: "day" as const, from: "2025-07-01", to: "2025-07-31", column: "month" };
  const year2024 = { grain: "day" as const, from: "2024-01-01", to: "2024-12-31", column: "month" };
  const year2025 = { grain: "day" as const, from: "2025-01-01", to: "2025-12-31", column: "month" };
  const years2024To2025 = { grain: "day" as const, from: "2024-01-01", to: "2025-12-31", column: "month" };
  const quarterThree2025 = { grain: "day" as const, from: "2025-07-01", to: "2025-09-30", column: "month" };
  const quarterThree2026 = { grain: "day" as const, from: "2026-07-01", to: "2026-09-30", column: "month" };
  const cases: Array<{
    question: string;
    prior?: boolean;
    expected: Selection["timeWindow"] | undefined;
  }> = [
    { question: "Show July 2025", prior: true, expected: july2025 },
    { question: "Show July of 2025", prior: true, expected: july2025 },
    { question: "Show July, 2025", prior: true, expected: july2025 },
    { question: "Show July/2025", prior: true, expected: july2025 },
    { question: "Show Jul/2025", prior: true, expected: july2025 },
    { question: "Show July.2025", prior: true, expected: july2025 },
    { question: "Show July_2025", prior: true, expected: july2025 },
    { question: "Show Jul-2025", prior: true, expected: july2025 },
    { question: "Show July '25", prior: true, expected: july2025 },
    { question: "Show 07/2025", prior: true, expected: july2025 },
    { question: "Show 2025-07", prior: true, expected: july2025 },
    {
      question: "Show Jul 25",
      prior: true,
      expected: { grain: "day", from: "2026-07-25", to: "2026-10-02", column: "month" },
    },
    {
      question: "Show since July 25, 2026",
      prior: true,
      expected: { grain: "day", from: "2026-07-25", to: "2026-10-02", column: "month" },
    },
    {
      question: "Show July 25, 2026 through August 3, 2026",
      prior: true,
      expected: { grain: "day", from: "2026-07-25", to: "2026-08-03", column: "month" },
    },
    { question: "Show July 2026", prior: true, expected: july2026 },
    {
      question: "What about August?",
      prior: true,
      expected: { grain: "day", from: "2026-08-01", to: "2026-08-31", column: "month" },
    },
    {
      question: "Show August",
      expected: { grain: "day", from: "2026-08-01", to: "2026-08-31", column: "month" },
    },
    {
      question: "Show December",
      expected: { grain: "day", from: "2025-12-01", to: "2025-12-31", column: "month" },
    },
    {
      question: "May?",
      prior: true,
      expected: { grain: "day", from: "2026-05-01", to: "2026-05-31", column: "month" },
    },
    {
      question: "Show May",
      prior: true,
      expected: { grain: "day", from: "2026-05-01", to: "2026-05-31", column: "month" },
    },
    {
      question: "What about May",
      prior: true,
      expected: { grain: "day", from: "2026-05-01", to: "2026-05-31", column: "month" },
    },
    { question: "May I see Actual by GL code?", expected: undefined },
    { question: "May I see Actual by GL code?", prior: true, expected: inheritedJuly },
    { question: "May show Actual by GL code", expected: undefined },
    { question: "Show Q3", prior: true, expected: quarterThree2026 },
    { question: "Show the third quarter", prior: true, expected: quarterThree2026 },
    {
      question: "Show Q4",
      expected: { grain: "day", from: "2026-10-01", to: "2026-12-31", column: "month" },
    },
    { question: "Show Q3 2025", prior: true, expected: quarterThree2025 },
    { question: "Show Q3, 2025", prior: true, expected: quarterThree2025 },
    { question: "Show Q3-2025", prior: true, expected: quarterThree2025 },
    { question: "Show Q3/2025", prior: true, expected: quarterThree2025 },
    { question: "Show Q3 '25", prior: true, expected: quarterThree2025 },
    { question: "Show Q3 of 2025", prior: true, expected: quarterThree2025 },
    { question: "Show the third quarter 2025", prior: true, expected: quarterThree2025 },
    { question: "Show the third quarter, 2025", prior: true, expected: quarterThree2025 },
    { question: "Show the third quarter of 2025", prior: true, expected: quarterThree2025 },
    { question: "2025?", prior: true, expected: year2025 },
    { question: "What about 2025?", prior: true, expected: year2025 },
    { question: "Show Actual in 2025", prior: true, expected: year2025 },
    { question: "Show Actual for 2025", prior: true, expected: year2025 },
    { question: "Show Actual during 2025", prior: true, expected: year2025 },
    { question: "Show Actual of 2025", prior: true, expected: year2025 },
    { question: "Show Actual since 2025", prior: true, expected: year2025 },
    { question: "Show Actual from 2025", prior: true, expected: year2025 },
    { question: "Show Actual until 2025", prior: true, expected: year2025 },
    { question: "Show Actual till 2025", prior: true, expected: year2025 },
    { question: "Show Actual through 2025", prior: true, expected: year2025 },
    { question: "Show Actual to 2025", prior: true, expected: year2025 },
    { question: "Show Actual by 2025", prior: true, expected: year2025 },
    { question: "Show Actual about 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual before 2025", prior: true, expected: year2025 },
    { question: "Show Actual after 2025", prior: true, expected: year2025 },
    { question: "Show year 2025", prior: true, expected: year2025 },
    { question: "Show calendar 2025", prior: true, expected: year2025 },
    { question: "Show CY 2025", prior: true, expected: year2025 },
    { question: "What were 2025 actuals?", prior: true, expected: year2025 },
    { question: "Show 2025 actual", prior: true, expected: year2025 },
    { question: "Show 2025 budget by GL code", prior: true, expected: year2025 },
    { question: "Show 2025 budgets", prior: true, expected: year2025 },
    { question: "Show 2025 spend", prior: true, expected: year2025 },
    { question: "Show 2025 spending", prior: true, expected: year2025 },
    { question: "Show 2025 figures", prior: true, expected: year2025 },
    { question: "Show 2025 numbers", prior: true, expected: year2025 },
    { question: "Show 2025 data", prior: true, expected: year2025 },
    { question: "Show 2025 results", prior: true, expected: year2025 },
    { question: "Show 2025 expenses", prior: true, expected: year2025 },
    { question: "Show 2025 costs", prior: true, expected: year2025 },
    { question: "Show 2025 statement", prior: true, expected: year2025 },
    { question: "Show 2025 MIS", prior: true, expected: year2025 },
    { question: "Show 2025 report", prior: true, expected: year2025 },
    { question: "Show 2025 GL", prior: true, expected: year2025 },
    { question: "Show 2025 totals", prior: true, expected: year2025 },
    { question: "Show Actuals 2025", prior: true, expected: year2025 },
    { question: "Show budget 2025", prior: true, expected: year2025 },
    { question: "Show costs 2025", prior: true, expected: year2025 },
    { question: "Show GL numbers 2025", prior: true, expected: year2025 },
    { question: "Show actuals of 2025", prior: true, expected: year2025 },
    { question: "Show budget for 2025", prior: true, expected: year2025 },
    { question: "What were the costs during 2025", prior: true, expected: year2025 },
    { question: "Show me 2025", prior: true, expected: year2025 },
    { question: "And 2024?", prior: true, expected: year2024 },
    { question: "GL codes 2025", prior: true, expected: year2025 },
    { question: "2025 please", prior: true, expected: year2025 },
    { question: "Show Actual totaling 2025", expected: undefined },
    { question: "Show amounts over 2025", expected: undefined },
    { question: "Which GL codes spent more than 2025?", expected: undefined },
    { question: "Show GL code 2025", expected: year2025 },
    { question: "Show Actual totaling 2025", prior: true, expected: inheritedJuly },
    { question: "Spent more than 2025", prior: true, expected: inheritedJuly },
    { question: "Worth 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual = 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual==2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual != 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual<>2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual < 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual>2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual <= 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual>=2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual ≤ 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual≥2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual ≠ 2025", prior: true, expected: inheritedJuly },
    { question: "Show an amount of 2025 rupees", prior: true, expected: inheritedJuly },
    { question: "Show an amount of 2025 rupee", prior: true, expected: inheritedJuly },
    { question: "Show an amount of 2025 rs", prior: true, expected: inheritedJuly },
    { question: "Show an amount of 2025 INR", prior: true, expected: inheritedJuly },
    { question: "Show Actual in 2025 lakh", prior: true, expected: inheritedJuly },
    { question: "Show Actual in 2025 lakhs", prior: true, expected: inheritedJuly },
    { question: "Show Actual for 2025 crore", prior: true, expected: inheritedJuly },
    { question: "Show Actual for 2025 crores", prior: true, expected: inheritedJuly },
    { question: "Show an amount of 2025 k", prior: true, expected: inheritedJuly },
    { question: "Show an amount of 2025 thousand", prior: true, expected: inheritedJuly },
    { question: "Show an amount of 2025.50", prior: true, expected: inheritedJuly },
    { question: "Show actual amount 2,025", prior: true, expected: inheritedJuly },
    { question: "Show 1,2025", prior: true, expected: inheritedJuly },
    { question: "spent 1,20,250", prior: true, expected: inheritedJuly },
    { question: "Actual 2025.50", prior: true, expected: inheritedJuly },
    { question: "amounts of 12,025", prior: true, expected: inheritedJuly },
    { question: "Show Actual over ₹2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual over Rs 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual over INR 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual above rupees 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual more than INR 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual is Rs. 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual is Re 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual is Rupee 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual is Rupees 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual is 2025 Rs.", prior: true, expected: inheritedJuly },
    { question: "Show Actual is 2025 ₹", prior: true, expected: inheritedJuly },
    { question: "Show amount of rupees 2,025", prior: true, expected: inheritedJuly },
    { question: "Show an amount of 2025", prior: true, expected: inheritedJuly },
    { question: "GL codes with a total of 2025", prior: true, expected: inheritedJuly },
    { question: "Show a value of 2025", prior: true, expected: inheritedJuly },
    { question: "Show a sum of 2025", prior: true, expected: inheritedJuly },
    { question: "Show a figure of 2025", prior: true, expected: inheritedJuly },
    { question: "Show a balance of 2025", prior: true, expected: inheritedJuly },
    { question: "Show spend of 2025", prior: true, expected: inheritedJuly },
    { question: "Show a limit of 2025", prior: true, expected: inheritedJuly },
    { question: "Show a threshold of 2025", prior: true, expected: inheritedJuly },
    { question: "Show actual amount 2025", prior: true, expected: inheritedJuly },
    { question: "Show amounts 2025", prior: true, expected: inheritedJuly },
    { question: "Show value 2025", prior: true, expected: inheritedJuly },
    { question: "Show values 2025", prior: true, expected: inheritedJuly },
    { question: "Show total 2025", prior: true, expected: inheritedJuly },
    { question: "Show totals 2025", prior: true, expected: inheritedJuly },
    { question: "Show sum 2025", prior: true, expected: inheritedJuly },
    { question: "Show sums 2025", prior: true, expected: inheritedJuly },
    { question: "Show figure 2025", prior: true, expected: inheritedJuly },
    { question: "Show figures 2025", prior: true, expected: inheritedJuly },
    { question: "Show balance 2025", prior: true, expected: inheritedJuly },
    { question: "Show balances 2025", prior: true, expected: inheritedJuly },
    { question: "Show limit 2025", prior: true, expected: inheritedJuly },
    { question: "Show limits 2025", prior: true, expected: inheritedJuly },
    { question: "Show threshold 2025", prior: true, expected: inheritedJuly },
    { question: "Show thresholds 2025", prior: true, expected: inheritedJuly },
    { question: "Show number 2025", prior: true, expected: inheritedJuly },
    { question: "Show numbers 2025", prior: true, expected: inheritedJuly },
    { question: "Show GL codes where Actual amount is 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual amount is 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual is 2025", prior: true, expected: inheritedJuly },
    { question: "Show budget was 2025", prior: true, expected: inheritedJuly },
    { question: "Show spend equals 2025", prior: true, expected: inheritedJuly },
    { question: "Show values are 2025", prior: true, expected: inheritedJuly },
    { question: "Show total of exactly 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual is exactly 2025", prior: true, expected: inheritedJuly },
    { question: "Show budget was about 2025", prior: true, expected: inheritedJuly },
    { question: "Show spend equals roughly 2025", prior: true, expected: inheritedJuly },
    { question: "Show values are around 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actuals were approximately 2025", prior: true, expected: inheritedJuly },
    { question: "Show budget is approx 2025", prior: true, expected: inheritedJuly },
    { question: "Show spending is nearly 2025", prior: true, expected: inheritedJuly },
    { question: "Show total was almost 2025", prior: true, expected: inheritedJuly },
    { question: "Show value is just 2025", prior: true, expected: inheritedJuly },
    { question: "Show expenses were only 2025", prior: true, expected: inheritedJuly },
    { question: "Show costs were precisely 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual is at least 2025", prior: true, expected: inheritedJuly },
    { question: "Show budget is at most 2025", prior: true, expected: inheritedJuly },
    { question: "Show spend is close to 2025", prior: true, expected: inheritedJuly },
    { question: "Show value is up to 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual equal to about 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual be around 2025", prior: true, expected: inheritedJuly },
    { question: "Show Actual more than approximately 2025", prior: true, expected: inheritedJuly },
    { question: "Show budget below about 2025", prior: true, expected: inheritedJuly },
    { question: "Show an amount around 2025", prior: true, expected: inheritedJuly },
    { question: "Show cost approximately 2025", prior: true, expected: inheritedJuly },
    { question: "Show expenses of about 2025", prior: true, expected: inheritedJuly },
    { question: "Show a total near 2025", prior: true, expected: inheritedJuly },
    { question: "Show an amount that is 2025", prior: true, expected: inheritedJuly },
    { question: "Show an amount that should be 2025", prior: true, expected: inheritedJuly },
    { question: "Show costs which were 2025", prior: true, expected: inheritedJuly },
    { question: "Show an amount totalling to 2025", prior: true, expected: inheritedJuly },
    { question: "Show an amount adds up to 2025", prior: true, expected: inheritedJuly },
    { question: "Show a total that may be 2025", prior: true, expected: inheritedJuly },
    { question: "Show between 2024 and 2025", prior: true, expected: years2024To2025 },
    { question: "Show from 2024 to 2025", prior: true, expected: years2024To2025 },
    { question: "Show 2024 to 2025", prior: true, expected: years2024To2025 },
    { question: "Show 2024-2025", prior: true, expected: years2024To2025 },
    { question: "Show Actual between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show Budget from 2024 to 2025", prior: true, expected: inheritedJuly },
    { question: "Show an amount between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show a value from 2024 to 2025", prior: true, expected: inheritedJuly },
    { question: "Show actuals between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show budgets between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show cost between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show costs between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show expense between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show expenses from 2024 to 2025", prior: true, expected: inheritedJuly },
    { question: "Show spend between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show spending between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show spent between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show amounts between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show values between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show total between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show totals between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show sum between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show balance between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show figure between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show figures between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show limit between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show threshold between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show rollover between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show variance between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show payment between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show payments between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show charge between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show charges between 2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show between ₹2024 and 2025", prior: true, expected: inheritedJuly },
    { question: "Show between 2024 and INR 2025", prior: true, expected: inheritedJuly },
    { question: "Show between 2024 rupees and 2025", prior: true, expected: inheritedJuly },
    { question: "Show between 2024 and 2025 lakh", prior: true, expected: inheritedJuly },
    { question: "Show over 2024-2025", prior: true, expected: inheritedJuly },
    { question: "Show between 1800 and 2025", prior: true, expected: inheritedJuly },
    {
      question: "GL codes whose Actual amount is between 2025 and 3000 rupees",
      prior: true,
      expected: inheritedJuly,
    },
    { question: "Show Actual by month", expected: undefined },
    { question: "Show Actual by month", prior: true, expected: inheritedJuly },
    { question: "Show Actual by day", prior: true, expected: inheritedJuly },
    { question: "Show Actual by week", prior: true, expected: inheritedJuly },
    { question: "Show Actual by quarter", prior: true, expected: inheritedJuly },
    { question: "Show Actual by year", prior: true, expected: inheritedJuly },
    { question: "Show Actual by FY", prior: true, expected: inheritedJuly },
    { question: "Show Actual by period", prior: true, expected: inheritedJuly },
    { question: "Show Actual per day", prior: true, expected: inheritedJuly },
    { question: "Show Actual per week", prior: true, expected: inheritedJuly },
    { question: "Show Actual per month", prior: true, expected: inheritedJuly },
    { question: "Show Actual per quarter", prior: true, expected: inheritedJuly },
    { question: "Show Actual per year", prior: true, expected: inheritedJuly },
    { question: "Show Actual per FY", prior: true, expected: inheritedJuly },
    { question: "Show Actual per period", prior: true, expected: inheritedJuly },
    { question: "Show Actual each day", prior: true, expected: inheritedJuly },
    { question: "Show Actual each week", prior: true, expected: inheritedJuly },
    { question: "Show Actual each month", prior: true, expected: inheritedJuly },
    { question: "Show Actual each quarter", prior: true, expected: inheritedJuly },
    { question: "Show Actual each year", prior: true, expected: inheritedJuly },
    { question: "Show Actual each FY", prior: true, expected: inheritedJuly },
    { question: "Show Actual each period", prior: true, expected: inheritedJuly },
    { question: "Show Actual every day", prior: true, expected: inheritedJuly },
    { question: "Show Actual every week", prior: true, expected: inheritedJuly },
    { question: "Show Actual every month", prior: true, expected: inheritedJuly },
    { question: "Show Actual every quarter", prior: true, expected: inheritedJuly },
    { question: "Show Actual every year", prior: true, expected: inheritedJuly },
    { question: "Show Actual every FY", prior: true, expected: inheritedJuly },
    { question: "Show Actual every period", prior: true, expected: inheritedJuly },
    { question: "Show Actual for each day", prior: true, expected: inheritedJuly },
    { question: "Show Actual for each week", prior: true, expected: inheritedJuly },
    { question: "Show Actual for each month", prior: true, expected: inheritedJuly },
    { question: "Show Actual for each quarter", prior: true, expected: inheritedJuly },
    { question: "Show Actual for each year", prior: true, expected: inheritedJuly },
    { question: "Show Actual for each FY", prior: true, expected: inheritedJuly },
    { question: "Show Actual for each period", prior: true, expected: inheritedJuly },
    { question: "Show Actual daily", prior: true, expected: inheritedJuly },
    { question: "Show Actual weekly", prior: true, expected: inheritedJuly },
    { question: "Show Actual monthly", prior: true, expected: inheritedJuly },
    { question: "Show Actual quarterly", prior: true, expected: inheritedJuly },
    { question: "Show Actual yearly", prior: true, expected: inheritedJuly },
    { question: "Show Actual annually", prior: true, expected: inheritedJuly },
    { question: "Show Actual annual", prior: true, expected: inheritedJuly },
    { question: "Show Actual month-wise", prior: true, expected: inheritedJuly },
    { question: "Show Actual quarter-wise", prior: true, expected: inheritedJuly },
    { question: "Show Actual year-wise", prior: true, expected: inheritedJuly },
    { question: "Show Actual monthwise", prior: true, expected: inheritedJuly },
    { question: "Show Actual quarterwise", prior: true, expected: inheritedJuly },
    { question: "Show a quarter breakdown of Actual", expected: undefined },
    { question: "Show a quarter breakdown of Actual", prior: true, expected: inheritedJuly },
    { question: "Show a day breakdown", prior: true, expected: inheritedJuly },
    { question: "Show a week breakdown", prior: true, expected: inheritedJuly },
    { question: "Show a month breakdown", prior: true, expected: inheritedJuly },
    { question: "Show a year breakdown", prior: true, expected: inheritedJuly },
    { question: "Show a period breakdown", prior: true, expected: inheritedJuly },
    { question: "Show days", prior: true, expected: inheritedJuly },
    { question: "Show weeks", prior: true, expected: inheritedJuly },
    { question: "Show months", prior: true, expected: inheritedJuly },
    { question: "Show quarters", prior: true, expected: inheritedJuly },
    { question: "Show years", prior: true, expected: inheritedJuly },
    { question: "Show periods", prior: true, expected: inheritedJuly },
    { question: "Show quarter wise", prior: true, expected: inheritedJuly },
    { question: "Show monthly split", prior: true, expected: inheritedJuly },
    { question: "Show year view", prior: true, expected: inheritedJuly },
    { question: "Show past week", prior: true, expected: wrongModelWindow },
    { question: "Show prior month", prior: true, expected: wrongModelWindow },
    { question: "Show current year", prior: true, expected: wrongModelWindow },
    { question: "Show next period", prior: true, expected: wrongModelWindow },
    { question: "Show 3 months", prior: true, expected: wrongModelWindow },
    { question: "Show 2 quarters", prior: true, expected: wrongModelWindow },
    { question: "Show fifth quarter", prior: true, expected: wrongModelWindow },
    { question: "Show Actual by month for July 2026", prior: true, expected: july2026 },
    { question: "Show quarter over quarter Actual", prior: true, expected: inheritedJuly },
    { question: "Show month over month Actual", prior: true, expected: inheritedJuly },
    { question: "Show year over year Actual", prior: true, expected: inheritedJuly },
    { question: "Show week over week Actual", prior: true, expected: inheritedJuly },
    { question: "Show quarter on quarter Actual", prior: true, expected: inheritedJuly },
    { question: "Show month on month Actual", prior: true, expected: inheritedJuly },
    { question: "Show year on year Actual", prior: true, expected: inheritedJuly },
    { question: "Show QoQ Actual", prior: true, expected: inheritedJuly },
    { question: "Show MoM Actual", prior: true, expected: inheritedJuly },
    { question: "Show YoY Actual", prior: true, expected: inheritedJuly },
    { question: "Show WoW Actual", prior: true, expected: inheritedJuly },
    { question: "Show period over period Actual", prior: true, expected: inheritedJuly },
    { question: "Show day trend", prior: true, expected: inheritedJuly },
    { question: "Show week trends", prior: true, expected: inheritedJuly },
    { question: "Show month trend", prior: true, expected: inheritedJuly },
    { question: "Show quarter trends", prior: true, expected: inheritedJuly },
    { question: "Show year trend", prior: true, expected: inheritedJuly },
    { question: "Show period trends", prior: true, expected: inheritedJuly },
    { question: "Show daily trend", prior: true, expected: inheritedJuly },
    { question: "Show weekly trends", prior: true, expected: inheritedJuly },
    { question: "Show monthly trend", prior: true, expected: inheritedJuly },
    { question: "Show quarterly trends", prior: true, expected: inheritedJuly },
    { question: "Show yearly trend", prior: true, expected: inheritedJuly },
    { question: "Show annual trends", prior: true, expected: inheritedJuly },
    { question: "Show annually trend", prior: true, expected: inheritedJuly },
    { question: "Show trend by month", prior: true, expected: inheritedJuly },
    { question: "Show quarter over quarter Actual for July 2026", prior: true, expected: july2026 },
    {
      question: "Show last month",
      expected: { grain: "day", from: "2026-09-01", to: "2026-09-30", column: "month" },
    },
    {
      question: "Show previous month",
      expected: { grain: "day", from: "2026-09-01", to: "2026-09-30", column: "month" },
    },
    {
      question: "Show this month",
      expected: { grain: "day", from: "2026-10-01", to: "2026-10-02", column: "month" },
    },
    { question: "Show last quarter", expected: quarterThree2026 },
    { question: "Show previous quarter", expected: quarterThree2026 },
    {
      question: "Show this quarter",
      expected: { grain: "day", from: "2026-10-01", to: "2026-10-02", column: "month" },
    },
    { question: "Show last year", expected: year2025 },
    { question: "Show previous year", expected: year2025 },
    {
      question: "Show this year",
      expected: { grain: "day", from: "2026-01-01", to: "2026-10-02", column: "month" },
    },
    {
      question: "Show last 30 days",
      prior: true,
      expected: { grain: "day", last: 30, from: "2026-09-02", to: "2026-10-02", column: "month" },
    },
    {
      question: "Show since 1 January",
      prior: true,
      expected: { grain: "day", from: "2026-01-01", to: "2026-10-02", column: "month" },
    },
    {
      question: "Show 2026-01-01 to 2026-07-09",
      prior: true,
      expected: { grain: "day", from: "2026-01-01", to: "2026-07-09", column: "month" },
    },
    {
      question: "Show Jan-Mar 2026",
      prior: true,
      expected: { grain: "day", from: "2026-01-01", to: "2026-03-31", column: "month" },
    },
    {
      question: "Show January to March 2026",
      prior: true,
      expected: { grain: "day", from: "2026-01-01", to: "2026-03-31", column: "month" },
    },
    { question: "Compare this FY", prior: true, expected: wrongModelWindow },
    { question: "Show FY", prior: true, expected: wrongModelWindow },
    { question: "Show F.Y.", prior: true, expected: wrongModelWindow },
    { question: "Show fiscal", prior: true, expected: wrongModelWindow },
    { question: "Show fiscal year", prior: true, expected: wrongModelWindow },
    { question: "Show financial year", prior: true, expected: wrongModelWindow },
    { question: "Show FYTD", prior: true, expected: wrongModelWindow },
    { question: "Show YTD", prior: true, expected: wrongModelWindow },
    { question: "Show FY2025", prior: true, expected: wrongModelWindow },
    { question: "Show FY 2025", prior: true, expected: wrongModelWindow },
    { question: "Show FY 2025-26", prior: true, expected: wrongModelWindow },
    { question: "Show FY25", prior: true, expected: wrongModelWindow },
    { question: "Show FY 25-26", prior: true, expected: wrongModelWindow },
    { question: "Show fiscal 2025", prior: true, expected: wrongModelWindow },
    { question: "Show financial year 2025-26", prior: true, expected: wrongModelWindow },
    { question: "Show FY Q1 2025", prior: true, expected: wrongModelWindow },
    { question: "Show FY 2025 Q3", prior: true, expected: wrongModelWindow },
    { question: "Show fiscal Q2", prior: true, expected: wrongModelWindow },
    { question: "Show YTD since 1 January", prior: true, expected: wrongModelWindow },
    { question: "Show financial year 2025-26 last 30 days", prior: true, expected: wrongModelWindow },
    { question: "Compare next month", prior: true, expected: wrongModelWindow },
    { question: "Try the previous week", prior: true, expected: wrongModelWindow },
    { question: "Show Actual by GL code", expected: undefined },
    { question: "And which GL codes spent more than 3 lakh?", prior: true, expected: inheritedJuly },
  ];

  for (const { question, prior, expected } of cases) {
    const fixture = makeFixture({
      selection: {
        ...financialSelection,
        timeWindow: { grain: "month", from: "2026-09-01", to: "2026-09-30" },
      },
    });
    const response = await fixture.service.ask(
      userFor("governed-financial"),
      "session",
      question,
      undefined,
      undefined,
      prior ? [{ question: "Show Actual by GL code for July 2026", selection: financialSelection }] : undefined,
    );

    assert.equal(response.responseClass, ResponseClass.Success, question);
    assert.deepEqual(response.selection?.timeWindow, expected, question);
  }
});

test("a period-control rerun keeps its edited August window when the question says July", async () => {
  const augustSelection: Selection = {
    ...financialSelection,
    timeWindow: { grain: "month", from: "2026-08-01", to: "2026-08-31" },
  };
  const fixture = makeFixture({ selection: financialSelection });

  const response = await fixture.service.ask(
    userFor("governed-financial"),
    "session",
    "Show Actual by GL code for July 2026",
    augustSelection,
  );

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.deepEqual(response.selection?.timeWindow, {
    grain: "month",
    from: "2026-08-01",
    to: "2026-08-31",
    column: "month",
  });
  assert.equal(fixture.llm.inputs.length, 0);
});

test("Ask translates every measure-filter refusal reason and records its typed reason", async () => {
  const cases: Array<{
    reason: MeasureFilterInvalidReason;
    filters: NonNullable<Selection["measureFilters"]>;
    message: RegExp;
  }> = [
    {
      reason: MeasureFilterInvalidReason.NotComparable,
      filters: [
        {
          measureId: "governed-financial.percentage",
          op: "gt",
          compareTo: { kind: "value", value: "100" },
        },
      ],
      message: /can't compare % with anything/,
    },
    {
      reason: MeasureFilterInvalidReason.UnknownMeasure,
      filters: [
        {
          measureId: "governed-financial.actual",
          op: "gt",
          compareTo: { kind: "measure", measureId: "outside.amount" },
        },
      ],
      message: /unavailable/,
    },
    {
      reason: MeasureFilterInvalidReason.SelfComparison,
      filters: [
        {
          measureId: "governed-financial.actual",
          op: "gt",
          compareTo: { kind: "measure", measureId: "governed-financial.actual" },
        },
      ],
      message: /itself/,
    },
    {
      reason: MeasureFilterInvalidReason.Duplicate,
      filters: [
        {
          measureId: "governed-financial.actual",
          op: "gt",
          compareTo: { kind: "value", value: "1" },
        },
        {
          measureId: "governed-financial.actual",
          op: "gt",
          compareTo: { kind: "value", value: "1.00" },
        },
      ],
      message: /same comparison more than once/,
    },
    {
      reason: MeasureFilterInvalidReason.MalformedValue,
      filters: [
        {
          measureId: "governed-financial.actual",
          op: "gt",
          compareTo: { kind: "value", value: "1.234" },
        },
      ],
      message: /plain number/,
    },
  ];

  for (const entry of cases) {
    const fixture = makeFixture({ selection: financialSelection });
    const user = userFor("governed-financial");
    user.permissions.measureIds.push("governed-financial.percentage");
    const response = await fixture.service.ask(user, "session", "Use this comparison", {
      ...financialSelection,
      measureFilters: entry.filters,
    });

    assert.equal(response.responseClass, ResponseClass.NotSupported, entry.reason);
    assert.match(response.message ?? "", entry.message, entry.reason);
    assert.equal(fixture.executor.calls, 0, entry.reason);
    assert.equal(fixture.logs[0]?.context.reason, entry.reason);
  }
});

test("an empty measure-filtered execution is a successful answer with a plain empty message", async () => {
  const filteredSelection: Selection = {
    ...financialSelection,
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
  };
  const fixture = makeFixture({ selection: filteredSelection, result: { columns: RESULT.columns, rows: [] } });
  const user = userFor("governed-financial");
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "Show lines over budget for July 2026");

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.deepEqual(response.result?.rows, []);
  assert.equal(response.message, "No lines match Actual > Budget for July 2026");
});

test("a measure-filtered answer records comparison chips readback and applied filters", async () => {
  const measureFilters: NonNullable<Selection["measureFilters"]> = [
    {
      measureId: "governed-financial.actual",
      op: "gt",
      compareTo: { kind: "measure", measureId: "governed-financial.budget" },
    },
    {
      measureId: "governed-financial.actual",
      op: "lte",
      compareTo: { kind: "value", value: "000500000.00" },
    },
  ];
  const fixture = makeFixture({ selection: { ...financialSelection, measureFilters } });
  const user = userFor("governed-financial");
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "Show the selected comparisons");

  assert.deepEqual(
    response.chips?.filter(({ kind }) => kind === "filter").map(({ label }) => label),
    ["Actual > Budget", "Actual <= ₹5,00,000"],
  );
  assert.match(
    response.provenance?.readback ?? "",
    /where Actual is greater than Budget and Actual is less than or equal to ₹5,00,000/,
  );
  assert.deepEqual(response.appliedMeasureFilters, measureFilters);
});

test("a data question answers from the governed measures and a definition question answers from the semantic layer labels", async () => {
  const data = makeFixture({ selection: financialSelection });
  const answer = await data.service.ask(
    userFor("governed-financial"),
    "session",
    "Why is Actual high?",
    financialSelection,
  );
  assert.equal(answer.responseClass, ResponseClass.Success);
  assert.equal(answer.provenance?.verified, true);
  assert.deepEqual(answer.result, RESULT);
  assert.deepEqual(numericTokens(answer.title), []);
  assert.deepEqual(numericTokens(answer.provenance?.readback), numericTokens(JSON.stringify(answer.appliedTimeWindow)));
  assert.deepEqual(numericTokens(JSON.stringify(answer.result)), numericTokens(JSON.stringify(RESULT)));
  assert.equal(data.llm.inputs.length, 0);

  const definition = makeFixture({ selection: financialSelection });
  const definitionAnswer = await definition.service.ask(
    userFor("governed-financial"),
    "session",
    "What is Actual and why is it high?",
  );
  assert.equal(definitionAnswer.responseClass, ResponseClass.Informational);
  assert.equal(definitionAnswer.title, "Actual");
  assert.match(definitionAnswer.definition ?? "", /Actual/);
  assert.equal(definition.llm.inputs.length, 0);

  const ambiguous = makeFixture({ kind: "clarify" });
  const ambiguousAnswer = await ambiguous.service.ask(
    userFor("governed-financial"),
    "session",
    "Hello, show performance",
  );
  assert.equal(ambiguousAnswer.responseClass, ResponseClass.ClarificationNeeded);
  assert.equal(typeof ambiguousAnswer.clarify?.prompt, "string");
  assert.equal(ambiguousAnswer.clarify?.prompt.match(/\?/g)?.length, 1);
  assert.equal(Array.isArray(ambiguousAnswer.clarify?.options), true);

  const generalCollision = makeFixture({ selection: financialSelection });
  const generalCollisionAnswer = await generalCollision.service.ask(
    userFor("governed-financial"),
    "session",
    "Hello, show Actual",
  );
  assert.equal(generalCollisionAnswer.responseClass, ResponseClass.Success);
});

test("a causal why question that is not discrepancy shaped is declined before it reaches the provider", async () => {
  const fixture = makeFixture({ selection: financialSelection });
  const response = await fixture.service.ask(userFor("governed-financial"), "session", "Why is labour high?");

  assert.equal(response.responseClass, ResponseClass.Informational);
  assert.match(response.definition ?? "", /can't infer why/);
  assert.equal(fixture.llm.inputs.length, 0);
  assert.equal(fixture.executor.calls, 0);
});

test("a selection naming a measure outside the registered domains is refused server side and never rendered as a zero", async () => {
  const invalidSelections: Array<[Selection, RegExp]> = [
    [{ ...financialSelection, measureIds: ["outside.amount"] }, /Measure not available/],
    [{ ...financialSelection, dimensionIds: ["outside.dimension"] }, /Dimension not available/],
  ];
  for (const [selection, expected] of invalidSelections) {
    const fixture = makeFixture({ selection });
    const response = await fixture.service.ask(userFor("governed-financial"), "session", "Show the selected metric");

    assert.equal(response.responseClass, ResponseClass.NotSupported);
    assert.match(response.message ?? "", expected);
    assert.equal((response.message ?? "").includes("0"), false);
    assert.equal(fixture.executor.calls, 0);
  }
});

test("the view in report field is available only for a statement domain answer resolving to one selector set and otherwise carries a reason", async () => {
  const activeBatchIds: ProvenanceBatch[] = [{ source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID }];
  const available = makeFixture({ selection: statementSelection, activeBatchIds });
  const answer = await available.service.ask(
    userFor("mis-statement", true),
    "session",
    "Show statement Actual for July 2026",
  );
  assert.deepEqual(answer.viewInReport, {
    available: true,
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    activeBatchIds,
  });

  const unavailable = makeFixture({ selection: financialSelection });
  const other = await unavailable.service.ask(userFor("governed-financial"), "session", "Show Actual");
  assert.equal(other.viewInReport?.available, false);
  if (other.viewInReport?.available === false) assert.match(other.viewInReport.reason, /not executed against/);

  const filteredStatement = makeFixture({
    selection: {
      ...statementSelection,
      measureFilters: [
        {
          measureId: "mis-statement.actual_net",
          op: "gt",
          compareTo: { kind: "value", value: "100" },
        },
      ],
    },
    activeBatchIds,
  });
  const filteredAnswer = await filteredStatement.service.ask(
    userFor("mis-statement", true),
    "session",
    "Show statement lines above 100 for July 2026",
  );
  assert.deepEqual(filteredAnswer.viewInReport, {
    available: false,
    reason: "The MIS statement cannot apply this comparison.",
  });
});

test("a failing entry audit aborts the request before any warehouse read including the dimension value lookup", async () => {
  const fixture = makeFixture({ selection: financialSelection, failEntryAudit: true });
  const response = await fixture.service.ask(userFor("governed-financial"), "session", "What is Actual?");

  assert.equal(response.responseClass, ResponseClass.BackendError);
  assert.equal(fixture.dimensions.calls, 0);
  assert.equal(fixture.help.calls, 0);
  assert.equal(fixture.executor.calls, 0);
  assert.equal(fixture.llm.inputs.length, 0);
});

test("a request carrying a conversation id is rejected and prior turns are read from the request body instead", async () => {
  let enteredStream = false;
  const controller = new ChatController({
    ask: async () => {
      enteredStream = true;
      throw new Error("unreachable");
    },
  } as never);
  await assert.rejects(
    controller.stream(
      userFor("governed-financial"),
      "session",
      { question: "Show Actual", conversationId: "00000000-0000-0000-0000-000000000099" } as never,
      {} as never,
    ),
    (error: unknown) => error instanceof BadRequestException && error.getStatus() === 400,
  );
  assert.equal(enteredStream, false);

  const priorTurns: AskPriorTurn[] = [{ question: "Earlier", selection: financialSelection }];
  const transported = makeFixture({ selection: financialSelection });
  await transported.service.ask(
    userFor("governed-financial"),
    "session",
    "Show Actual",
    undefined,
    undefined,
    priorTurns,
  );
  assert.deepEqual(transported.llm.inputs[0].priorTurns, priorTurns);
  assert.equal(askSchema.safeParse({ question: "x".repeat(LLM_CONTEXT_CHAR_BUDGET + 1) }).success, false);
});

const financialSelection: Selection = {
  domain: "governed-financial",
  measureIds: ["governed-financial.actual"],
  dimensionIds: ["gl_code"],
  filters: [],
  timeWindow: { grain: "month", from: "2026-07-01", to: "2026-07-01" },
};

const statementSelection: Selection = {
  domain: "mis-statement",
  measureIds: ["mis-statement.actual_net"],
  dimensionIds: ["leaf_key"],
  filters: [],
  timeWindow: { grain: "month", from: "2026-07-01", to: "2026-07-01" },
};

const RESULT: ResultTable = {
  columns: [{ key: "actual", label: "Actual", numeric: true }],
  rows: [{ actual: 42.5 }],
};
const ACTUAL_BATCH_ID = "00000000-0000-0000-0000-000000000001";
const BUDGET_BATCH_ID = "00000000-0000-0000-0000-000000000002";

function makeFixture(options: {
  selection?: Selection;
  kind?: "selection" | "clarify" | "no_tool_block" | "backend_error";
  llm?: LlmProvider;
  groundedSelection?: Selection;
  result?: ResultTable;
  activeBatchIds?: ProvenanceBatch[];
  failEntryAudit?: boolean;
  labels?: Array<{ key: string; label: string; otherLabels: string[] }>;
  summaries?: DrillSummary[];
}) {
  const llmResult: LlmSelectionResult =
    options.kind === "clarify"
      ? { kind: "clarify", prompt: "Which metric?", options: ["Actual"] }
      : options.kind === "no_tool_block" || options.kind === "backend_error"
        ? { kind: options.kind, reason: "Incomplete model response" }
        : { kind: "selection", selection: options.selection! };
  const fakeLlm = new FakeLlm(llmResult);
  const provider = options.llm ?? fakeLlm;
  const executor = new FakeExecutor(options.result ?? RESULT, options.activeBatchIds ?? []);
  const audit = new FakeAudit(options.failEntryAudit ?? false);
  const dimensions = new FakeDimensions();
  const help = new FakeHelp();
  const semantic = new SemanticLayer();
  const names = new FakeNames(options.labels ?? []);
  const transactions = new FakeTransactions(options.summaries ?? []);
  const contexts = new AskDrillContextService(["secret"], 30, () => 1_000_000);
  const logs: Array<{ context: Record<string, unknown> }> = [];
  const reports = options.groundedSelection
    ? {
        resolveAuthorizedSelection() {
          const domain = semantic.domain(options.groundedSelection!.domain);
          assert.ok(domain);
          return {
            report: { title: "Actual report" },
            selection: options.groundedSelection!,
            domain,
          };
        },
      }
    : {};
  const service = new ChatService(
    semantic,
    executor as never,
    audit as never,
    dimensions as never,
    reports as never,
    help as never,
    new FakeSelectionResolver() as never,
    provider,
    {} as never,
    names as never,
    transactions as never,
    contexts,
    new FakeOutlines() as never,
    { outlineDigest: () => "outline-digest" } as never,
  );
  Reflect.set(service, "logger", {
    log(_level: string, _message: string, fields: { context?: Record<string, unknown> }) {
      logs.push({ context: fields.context ?? {} });
    },
  });
  return { service, llm: fakeLlm, executor, audit, dimensions, help, logs, names, transactions, contexts };
}

class FakeNames {
  readonly glCalls: Array<{ rows: Array<{ key: string; predicate: DrillPredicate }>; budgetBatchId?: string }> = [];
  readonly statementCalls: Array<{ keys: string[]; budgetBatchId?: string }> = [];

  constructor(readonly labels: Array<{ key: string; label: string; otherLabels: string[] }>) {}

  async findGlCodeLabels(rows: Array<{ key: string; predicate: DrillPredicate }>, budgetBatchId?: string) {
    this.glCalls.push({ rows, budgetBatchId });
    return this.labels;
  }

  async findStatementLabels(keys: string[], budgetBatchId?: string) {
    this.statementCalls.push({ keys, budgetBatchId });
    return this.labels;
  }
}

class FakeTransactions {
  readonly calls: Array<Array<{ rowKey: string; predicate: DrillPredicate }>> = [];

  constructor(private readonly summaries: DrillSummary[]) {}

  async summarize(rows: Array<{ rowKey: string; predicate: DrillPredicate }>) {
    this.calls.push(rows);
    return this.summaries;
  }
}

class FakeOutlines {
  async findByBudgetBatchId() {
    return [{ nodeKey: "leaf", leafKey: "leaf" }];
  }
}

function numericTokens(value: unknown): string[] {
  return String(value ?? "").match(/\d+(?:\.\d+)?/g) ?? [];
}

class FakeLlm implements LlmProvider {
  readonly inputs: LlmSelectionInput[] = [];
  constructor(private readonly result: LlmSelectionResult) {}
  async select(input: LlmSelectionInput): Promise<LlmSelectionResult> {
    this.inputs.push(input);
    return this.result;
  }
}

class FakeExecutor {
  calls = 0;
  readonly selections: Selection[] = [];
  constructor(
    private readonly result: ResultTable,
    private readonly activeBatchIds: ProvenanceBatch[],
  ) {}
  async run(_user: unknown, _domain: unknown, selection: Selection, options: { beforeExecute?: Function }) {
    this.calls += 1;
    this.selections.push(selection);
    await options.beforeExecute?.({ selection, sql: "SELECT governed", objectsTouched: [selection.domain] });
    return {
      result: this.result,
      totals: undefined,
      sql: "SELECT governed",
      activeBatchIds: this.activeBatchIds,
      budgetComponentLabels: [],
      rowSourcePresence: [],
    };
  }
  async freshness() {
    return "2026-07-01";
  }
}

function bedrockProviderWith(selection: Selection): BedrockLlmProvider {
  class ConverseCommand {
    constructor(readonly input: unknown) {}
  }
  const provider = Object.create(BedrockLlmProvider.prototype) as BedrockLlmProvider;
  Reflect.set(provider, "cfg", {
    ...loadConfig(),
    bedrock: { region: "ap-south-1", modelId: "test-model" },
  });
  Reflect.set(provider, "ConverseCommand", ConverseCommand);
  Reflect.set(provider, "client", {
    async send() {
      return {
        output: {
          message: { content: [{ toolUse: { name: "emit_selection", input: selection } }] },
        },
      };
    },
  });
  return provider;
}

class FakeAudit {
  requests = 0;
  results = 0;
  constructor(private readonly failEntry: boolean) {}
  async writeRequestEvent(input: { selection?: Selection }) {
    this.requests += 1;
    if (this.failEntry && !input.selection) throw new Error("audit unavailable");
    return this.requests;
  }
  async writeResultEvent() {
    this.results += 1;
  }
}

class FakeDimensions {
  calls = 0;
  async values(_object: string, column: string) {
    this.calls += 1;
    if (column === "month") return Array.from({ length: 51 }, (_, index) => `month-${index}`);
    return Array.from({ length: 50 }, (_, index) => `DUB-${String(index).padStart(2, "0")}`);
  }
}

class FakeHelp {
  calls = 0;
  async buildIndex() {
    this.calls += 1;
    return {
      domains: [{ id: "governed-financial", label: "Governed financial" }],
      measures: [
        { id: "governed-financial.actual", label: "Actual", definition: "Actual - sums actual.", synonyms: [] },
      ],
      dimensions: [{ id: "gl_code", label: "GL code", definition: "GL code is a field." }],
      values: [],
      exampleQuestions: ["Show Actual"],
    };
  }
}

class FakeSelectionResolver {
  hasMapping() {
    return true;
  }

  async options() {
    const period = {
      value: "2026-07-01",
      label: "July 2026",
      from: "2026-07-01",
      to: "2026-07-01",
    };
    return {
      departments: ["Agriculture"],
      functions: ["Nursery"],
      plants: [{ value: "DUB", label: "DUB", aliases: ["DUB"] }],
      periods: [period],
    };
  }

  async resolve(request: { department: string; function: string; plant: string; period: string }) {
    return {
      outcome: "resolved" as const,
      ...request,
      period: { value: request.period, from: request.period, to: request.period },
      costCentres: ["Primary"],
      glCodes: ["5001"],
      masterGlCodes: ["5001"],
      misFormat: "nursery-mis-financial-v1",
      bucketRows: [],
      triples: [{ plant: request.plant, costCenter: "Primary", glCode: "5001" }],
      leafTargets: [
        {
          plant: request.plant,
          costCenter: "Primary",
          glCode: "5001",
          target: { kind: "leaf" as const, leafKey: "leaf" },
        },
      ],
    };
  }
}

function userFor(
  domain: "governed-financial" | "mis-statement",
  statementScope = false,
  measureIds?: string[],
): AuthUser {
  const statement = domain === "mis-statement";
  return {
    id: "user-1",
    email: "finance@example.com",
    display_name: "Finance",
    is_active: true,
    roles: ["admin"],
    permissions: {
      actions: ["report"],
      domains: [domain],
      measureIds: measureIds ?? [statement ? "mis-statement.actual_net" : "governed-financial.actual"],
      dimensionIds: [statement ? "leaf_key" : "gl_code"],
    },
    scope: statementScope
      ? [
          { attribute: "department", value: "Agriculture" },
          { attribute: "function", value: "Nursery" },
          { attribute: "plant", value: "DUB" },
        ]
      : [{ attribute: "plant", value: "DUB" }],
  };
}
