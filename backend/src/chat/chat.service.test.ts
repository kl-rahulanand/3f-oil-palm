import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, Module, type InjectionToken } from "@nestjs/common";
import { ApplicationConfig } from "@nestjs/core/application-config";
import { NestContainer } from "@nestjs/core/injector/container";
import { InstanceLoader } from "@nestjs/core/injector/instance-loader";
import { Injector } from "@nestjs/core/injector/injector";
import { NoopGraphInspector } from "@nestjs/core/inspector/noop-graph-inspector";
import { MetadataScanner } from "@nestjs/core/metadata-scanner";
import { DependenciesScanner } from "@nestjs/core/scanner";
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
import { DRIZZLE_DB, WAREHOUSE, loadConfig } from "../config";
import { CoreModule } from "../core/core.module";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";
import { StatementAttestationService } from "../mis/statement-attestation";
import type { DrillPredicate, DrillSummary } from "../warehouse/drill-transactions.interface";
import { DrillTransactionsRepository } from "../warehouse/drill-transactions.repository";
import { GlNameRepository } from "../warehouse/gl-name.repository";
import {
  StatementOutlineRepository,
  StatementOutlineUnavailableError,
} from "../warehouse/statement-outline.repository";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { AskDrillContextService } from "./ask-drill-context";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import { ChatController } from "./chat.controller";
import { CHAT_MESSAGES } from "./chat.constants";
import { ChatModule } from "./chat.module";
import { askSchema } from "./chat.schemas";
import { ChatService, lastMonthBudgetPin, trimPriorTurnsToTokenBudget } from "./chat.service";
import { SelectionExecutor } from "./selectionExecutor";

test("a several-plant reader chooses plants before any figure or period read", async () => {
  const fixture = makeFixture({ selection: { ...statementSelection, filters: [] } });
  const adapterCalls = { execute: 0, freshness: 0 };
  let executorCalls = 0;
  const executor = new SelectionExecutor(new SqlBuilder(), new SqlValidator(), {
    async explain() {},
    async execute() {
      adapterCalls.execute += 1;
      return RESULT;
    },
    async freshness() {
      adapterCalls.freshness += 1;
      return null;
    },
  } as never);
  Reflect.set(fixture.service, "selectionExecutor", {
    async run(...args: Parameters<SelectionExecutor["run"]>) {
      executorCalls += 1;
      return executor.run(...args);
    },
    async freshness() {
      return executor.freshness(new SemanticLayer().domain("mis-statement")!);
    },
  });
  const response = await fixture.service.ask(
    userForPlants("mis-statement", ["DUB", "CHIR"], true),
    "session",
    "Show the MIS statement Actual",
  );

  assert.equal(response.responseClass, ResponseClass.ClarificationNeeded);
  assert.equal(response.periodChoice, undefined);
  assert.deepEqual(response.plantChoice, {
    prompt: "Which plants should this answer cover?",
    question: "Show the MIS statement Actual",
    selection: { ...statementSelection, filters: [], timeWindow: undefined },
    options: [
      { value: "CHIR", label: "Agriculture - Nursery - CHIR" },
      { value: "DUB", label: "Agri - Nursery - DUB" },
    ],
    allPlants: { label: "All plants", value: ["CHIR", "DUB"] },
  });
  assert.equal(executorCalls, 0);
  assert.deepEqual(adapterCalls, { execute: 0, freshness: 0 });
  assert.equal(fixture.names.glCalls.length, 0);
  assert.equal(fixture.names.statementCalls.length, 0);
  assert.equal(fixture.transactions.calls.length, 0);
  assert.equal(fixture.transactions.activePinCalls.length, 0);
  assert.equal(fixture.resolver.optionsCalls, 0);
  assert.equal(fixture.dimensions.plantCalls, 0);
});

test("a plant choice keeps the server-resolved period when the selector omits it", async () => {
  const fixture = makeFixture({ selection: { ...financialSelection, timeWindow: undefined } });
  const user = userForPlants("governed-financial", ["DUB", "CHIR"]);
  const question = "Actual by GL code for July 2026";

  const choice = await fixture.service.ask(user, "session", question);

  assert.deepEqual(choice.plantChoice?.selection.timeWindow, {
    grain: "day",
    from: "2026-07-01",
    to: "2026-07-31",
    column: "month",
  });
  assert.equal(fixture.executor.calls, 0);

  const selected = choice.plantChoice?.selection;
  assert.ok(selected);
  const answer = await fixture.service.ask(
    user,
    "session",
    question,
    {
      ...selected,
      filters: [...selected.filters, { dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }],
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "plant-choice",
  );

  assert.equal(answer.responseClass, ResponseClass.Success);
  assert.deepEqual(answer.selection?.timeWindow, {
    grain: "day",
    from: "2026-07-01",
    to: "2026-07-31",
    column: "month",
  });
});

test("a redundant month filter bypasses a loaded month vocabulary that lacks the selected month", async () => {
  const withoutMonth = makeFixture({ selection: financialSelection });
  const withMonth = makeFixture({
    selection: {
      ...financialSelection,
      filters: [{ dimensionId: "month", op: "eq", value: "2026-07-01" }],
    },
  });
  withoutMonth.dimensions.monthValues = ["2026-06-01"];
  withMonth.dimensions.monthValues = ["2026-06-01"];
  const user = userForPlants("governed-financial", ["DUB"]);

  const baseline = await withoutMonth.service.ask(user, "baseline-session", "Actual for July 2026 for DUB");
  const normalized = await withMonth.service.ask(user, "normalized-session", "Actual for July 2026 for DUB");

  assert.equal(baseline.responseClass, ResponseClass.Success);
  assert.equal(normalized.responseClass, ResponseClass.Success);
  assert.deepEqual(normalized.result?.rows, baseline.result?.rows);
  assert.deepEqual(withMonth.executor.selections[0]?.filters, withoutMonth.executor.selections[0]?.filters);
});

test("a redundant month filter produces the same rows through the real selection executor", async () => {
  const glCodeFilter = { dimensionId: "gl_code", op: "eq" as const, value: "DUB-01" };
  const withoutMonth = makeFixture({
    selection: { ...financialSelection, filters: [glCodeFilter] },
  });
  const withMonth = makeFixture({
    selection: {
      ...financialSelection,
      filters: [glCodeFilter, { dimensionId: "month", op: "eq", value: "2026-07-01" }],
    },
  });
  const withAnotherMonth = makeFixture({
    selection: {
      ...financialSelection,
      filters: [glCodeFilter, { dimensionId: "month", op: "eq", value: "2026-06-01" }],
    },
  });
  const fixtures = [withoutMonth, withMonth, withAnotherMonth];
  for (const fixture of fixtures) {
    const executor = new SelectionExecutor(new SqlBuilder(), new SqlValidator(), new FilterSensitiveWarehouse());
    Reflect.set(fixture.service, "selectionExecutor", {
      async run(...args: Parameters<SelectionExecutor["run"]>) {
        fixture.executor.selections.push(args[2]);
        return executor.run(...args);
      },
      async freshness(...args: Parameters<SelectionExecutor["freshness"]>) {
        return executor.freshness(...args);
      },
    });
  }
  const user = userForPlants("governed-financial", ["DUB"]);
  user.permissions.dimensionIds.push("month");

  const [baseline, normalized, kept] = await withQueryTimeout(100, () =>
    Promise.all([
      withoutMonth.service.ask(user, "baseline-session", "Actual by GL code for July 2026 for DUB"),
      withMonth.service.ask(user, "normalized-session", "Actual by GL code for July 2026 for DUB"),
      withAnotherMonth.service.ask(user, "kept-session", "Actual by GL code for July 2026 for DUB"),
    ]),
  );

  assert.equal(baseline.responseClass, ResponseClass.Success, JSON.stringify(baseline));
  assert.equal(normalized.responseClass, ResponseClass.Success, JSON.stringify(normalized));
  assert.equal(kept.responseClass, ResponseClass.Success, JSON.stringify(kept));
  assert.deepEqual(normalized.result?.rows, baseline.result?.rows);
  assert.notDeepEqual(kept.result?.rows, baseline.result?.rows);
  assert.deepEqual(withMonth.executor.selections[0]?.filters, withoutMonth.executor.selections[0]?.filters);
  assert.deepEqual(withMonth.executor.selections[0]?.filters, [
    glCodeFilter,
    { dimensionId: "plant", op: "in", value: ["DUB"] },
  ]);
  assert.deepEqual(withAnotherMonth.executor.selections[0]?.filters, [
    glCodeFilter,
    { dimensionId: "month", op: "eq", value: "2026-06-01" },
    { dimensionId: "plant", op: "in", value: ["DUB"] },
  ]);
});

test("a one-plant statement keeps the existing mapped statement resolution", async () => {
  const fixture = makeFixture({ selection: statementSelection });

  const response = await fixture.service.ask(
    userForPlants("mis-statement", ["DUB"], true),
    "session",
    "Show the MIS statement Actual for DUB in July 2026",
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(fixture.executor.resolvedScopes[0]?.triples, [
    { plant: "DUB", costCenter: "Primary", glCode: "5001" },
  ]);
  assert.deepEqual(response.viewInReport, {
    available: true,
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    activeBatchIds: [],
  });
});

test("a DUB and CHIR statement runs one combined mapped statement", async () => {
  const fixture = makeFixture({ selection: statementSelection });

  const response = await fixture.service.ask(
    userForPlants("mis-statement", ["DUB", "CHIR"], true),
    "session",
    "Show the MIS statement Actual for DUB and CHIR in July 2026",
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(fixture.resolver.resolveCalls, []);
  assert.deepEqual(fixture.resolver.resolvePlantsCalls, [{ plants: ["CHIR", "DUB"], period: "2026-07-01" }]);
  assert.deepEqual(fixture.executor.resolvedScopes[0]?.triples, [
    { plant: "CHIR", costCenter: "Primary", glCode: "5001" },
    { plant: "DUB", costCenter: "Primary", glCode: "5001" },
  ]);
  assert.deepEqual(fixture.executor.resolvedScopes[0]?.plantDisplayNames, {
    CHIR: "Agriculture - Nursery - CHIR",
    DUB: "Agri - Nursery - DUB",
  });
  assert.deepEqual(response.selection?.filters, [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }]);
  assert.deepEqual(response.plantNames, {
    CHIR: "Agriculture - Nursery - CHIR",
    DUB: "Agri - Nursery - DUB",
  });
  assert.equal(response.provenance?.scope, "plant=Agriculture - Nursery - CHIR, plant=Agri - Nursery - DUB");
  assert.deepEqual(response.viewInReport, {
    available: false,
    reason: "This answer covers several plants and cannot open one statement.",
  });
});

test("a narrowed DUB and CHIR statement comparison keeps the several-plants report reason", async () => {
  const selection: Selection = {
    ...statementSelection,
    measureIds: ["mis-statement.actual_net", "mis-statement.budget_net"],
    measureFilters: [
      {
        measureId: "mis-statement.actual_net",
        op: "gt",
        compareTo: { kind: "measure", measureId: "mis-statement.budget_net" },
      },
    ],
  };
  const fixture = makeFixture({ selection });
  const user = userForPlants("mis-statement", ["DUB", "CHIR"], true);
  user.permissions.measureIds.push("mis-statement.budget_net");

  const response = await fixture.service.ask(
    user,
    "session",
    "Show statement lines over Budget for DUB and CHIR in July 2026",
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(fixture.executor.selections[0]?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
  assert.deepEqual(response.selection?.filters, [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }]);
  assert.deepEqual(response.viewInReport, {
    available: false,
    reason: "This answer covers several plants and cannot open one statement.",
  });
});

test("an explicit 2016 to 2026 comparison stays not loaded when only July 2026 has Budget", async () => {
  const selection: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
    timeWindow: { grain: "month", from: "2016-01-01", to: "2026-07-31" },
  };
  const fixture = makeFixture({
    selection,
    loadedBudgetMonths: ["2026-07-01"],
  });
  const user = userForPlants("governed-financial", ["DUB"]);
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(
    user,
    "session",
    "Show Actual over Budget for DUB from 2016 to July 2026",
    selection,
  );

  assert.equal(response.responseClass, ResponseClass.Informational, JSON.stringify(response));
  assert.equal(response.message, "Budget is not loaded for any chosen plant, so nothing was compared.");
  assert.deepEqual(fixture.transactions.budgetPeriodCalls, [{ from: "2016-01-01", to: "2026-07-01" }]);
  assert.equal(fixture.executor.calls, 0);
});

test("a range starting after day one still includes its first Budget month", async () => {
  const selection: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
    timeWindow: { grain: "month", from: "2026-07-04", to: "2026-09-30" },
  };
  const fixture = makeFixture({
    selection,
    loadedBudgetMonths: ["2026-07-01", "2026-08-01", "2026-09-01"],
  });
  const user = userForPlants("governed-financial", ["DUB"]);
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(
    user,
    "session",
    "Show Actual over Budget for DUB from July to September",
    selection,
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(fixture.transactions.budgetPeriodCalls, [{ from: "2026-07-01", to: "2026-09-01" }]);
  assert.equal(fixture.executor.calls, 1);
});

test("an unwindowed statement comparison offers periods before judging July Budget", async () => {
  const selection: Selection = {
    ...statementSelection,
    timeWindow: undefined,
    measureIds: ["mis-statement.actual_net", "mis-statement.budget_net"],
    measureFilters: [
      {
        measureId: "mis-statement.actual_net",
        op: "gt",
        compareTo: { kind: "measure", measureId: "mis-statement.budget_net" },
      },
    ],
  };
  const fixture = makeFixture({
    selection,
    activeActualPins: [
      { source: "actuals", period: "2026-06-01", batchId: "actual-june" },
      { source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID },
    ],
    loadedBudgetMonths: ["2026-07-01"],
  });
  const user = userForPlants("mis-statement", ["DUB"], true);
  user.permissions.measureIds.push("mis-statement.budget_net");

  const choice = await fixture.service.ask(user, "session", "Which statement lines are over Budget?");

  assert.equal(choice.responseClass, ResponseClass.ClarificationNeeded, JSON.stringify(choice));
  assert.deepEqual(
    choice.periodChoice?.options.map(({ value }) => value),
    ["2026-07-01"],
  );
  assert.equal(fixture.transactions.budgetPeriodCalls.length, 0);
  assert.equal(fixture.executor.calls, 0);

  const july = await fixture.service.ask(user, "session", choice.periodChoice!.question, {
    ...choice.periodChoice!.selection,
    timeWindow: choice.periodChoice!.options[0]!.timeWindow,
  });

  assert.equal(july.responseClass, ResponseClass.Success, JSON.stringify(july));
  assert.deepEqual(fixture.executor.selections[0]?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
  assert.deepEqual(fixture.transactions.budgetPeriodCalls, [{ from: "2026-07-01", to: "2026-07-01" }]);
});

test("an unavailable statement period clarifies before judging Budget", async () => {
  const selection: Selection = {
    ...statementSelection,
    measureIds: ["mis-statement.actual_net", "mis-statement.budget_net"],
    measureFilters: [
      {
        measureId: "mis-statement.actual_net",
        op: "gt",
        compareTo: { kind: "measure", measureId: "mis-statement.budget_net" },
      },
    ],
    timeWindow: { grain: "month", from: "2026-08-01", to: "2026-08-31" },
  };
  const fixture = makeFixture({ selection, loadedBudgetMonths: ["2026-07-01"] });
  const user = userForPlants("mis-statement", ["DUB"], true);
  user.permissions.measureIds.push("mis-statement.budget_net");

  const response = await fixture.service.ask(user, "session", "Show August statement lines over Budget", selection);

  assert.equal(response.responseClass, ResponseClass.ClarificationNeeded, JSON.stringify(response));
  assert.deepEqual(
    response.periodChoice?.options.map(({ value }) => value),
    ["2026-07-01"],
  );
  assert.equal(fixture.transactions.budgetPeriodCalls.length, 0);
  assert.equal(fixture.executor.calls, 0);
});

test("a malformed explicit date is refused before any metadata lookup", async () => {
  const selection: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    timeWindow: { grain: "month", from: "2026-13-45", to: "2026-13-45" },
  };
  const fixture = makeFixture({ selection });
  const user = userForPlants("governed-financial", ["DUB"]);
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "Show Actual and Budget", selection);

  assert.equal(response.responseClass, ResponseClass.NotSupported);
  assert.equal(response.message, CHAT_MESSAGES.invalidDateRange);
  assert.equal(fixture.transactions.activePinCalls.length, 0);
  assert.equal(fixture.transactions.budgetPeriodCalls.length, 0);
  assert.equal(fixture.executor.calls, 0);
});

test("a DUB and CHIR budget comparison reads DUB only and names CHIR as left out", async () => {
  const comparison: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
  };
  const activeBatchIds: ProvenanceBatch[] = [
    { source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID },
    { source: "budget", period: "2026-07-01", batchId: BUDGET_BATCH_ID },
  ];
  const fixture = makeFixture({
    selection: comparison,
    activeBatchIds,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
        { key: "budget", label: "Budget", numeric: true, format: "money" },
      ],
      rows: [{ gl_code: "5001", actual: "12.00", budget: "10.00" }],
    },
    summaries: [{ rowKey: "5001", feedingLineCount: 1, value: "12.00" }],
  });
  const user = userForPlants("governed-financial", ["DUB", "CHIR"]);
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "Actual over Budget for DUB and CHIR in July 2026");

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(fixture.executor.selections[0]?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
  assert.deepEqual(response.selection?.filters, [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }]);
  assert.deepEqual(response.leftOut, {
    reason: "budget-not-loaded",
    plants: ["Agriculture - Nursery - CHIR"],
  });
  assert.deepEqual(response.plantNames, { DUB: "Agri - Nursery - DUB" });
  assert.equal(response.provenance?.scope, "plant=Agri - Nursery - DUB");
  assert.deepEqual(response.budgetStates, [
    { key: "5001", state: "loaded", plantsInRow: ["DUB"], plantsWithBudget: ["DUB"] },
  ]);
  assert.deepEqual(fixture.names.glCalls[0]?.rows[0]?.predicate.plants, ["DUB"]);
  const verified = fixture.contexts.verify(response.drill!.context, "user-1");
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") assert.deepEqual(verified.claims.plants, ["DUB"]);

  const rerun = await fixture.service.ask(
    user,
    "session",
    "Run the saved comparison",
    response.selection,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "saved-view",
  );
  assert.deepEqual(fixture.executor.selections[1]?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
  assert.deepEqual(rerun.selection?.filters, [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }]);
  assert.deepEqual(rerun.leftOut, response.leftOut);
});

test("a summed DUB and CHIR row stays partial when CHIR has no activity", async () => {
  const selection: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.actual", "governed-financial.budget", "governed-financial.percentage"],
  };
  const fixture = makeFixture({
    selection,
    totals: { actual: 12, budget: 10, percentage: 1.2 },
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
        { key: "budget", label: "Budget", numeric: true, format: "money" },
        { key: "percentage", label: "%", numeric: true, format: "percent" },
      ],
      rows: [{ gl_code: "5001", actual: "12.00", budget: "10.00", percentage: "1.2" }],
    },
  });
  const user = userForPlants("governed-financial", ["DUB", "CHIR"]);
  user.permissions.measureIds.push("governed-financial.budget", "governed-financial.percentage");

  const response = await fixture.service.ask(
    user,
    "session",
    "Actual Budget and percentage for DUB and CHIR in July 2026",
  );

  assert.deepEqual(response.budgetStates, [
    { key: "5001", state: "partial", plantsInRow: ["CHIR", "DUB"], plantsWithBudget: ["DUB"] },
  ]);
  assert.deepEqual(response.result?.rows[0], { gl_code: "5001", actual: "12.00", budget: null, percentage: null });
  assert.deepEqual(response.totals, { actual: 12 });
});

test("a budget comparison with no loaded plant returns the no-budget informational answer without a figure read", async () => {
  const comparison: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
  };
  const fixture = makeFixture({ selection: comparison });
  const user = userForPlants("governed-financial", ["CHIR"]);
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "Actual over Budget for CHIR in July 2026");

  assert.equal(response.responseClass, ResponseClass.Informational);
  assert.equal(response.message, "Budget is not loaded for any chosen plant, so nothing was compared.");
  assert.deepEqual(response.leftOut, {
    reason: "budget-not-loaded",
    plants: ["Agriculture - Nursery - CHIR"],
  });
  assert.deepEqual(response.selection?.filters, [{ dimensionId: "plant", op: "in", value: ["CHIR"] }]);
  assert.deepEqual(response.viewInReport, {
    available: false,
    reason: "Budget is not loaded for any chosen plant.",
  });
  assert.equal(response.result, undefined);
  assert.equal(response.provenance, undefined);
  assert.equal(response.plantNames, undefined);
  assert.equal(response.budgetStates, undefined);
  assert.equal(response.drill, undefined);
  assert.equal(fixture.executor.calls, 0);
  assert.equal(fixture.audit.requests, 1, "only the turn entry is audited; no execution audit is written");
});

test("an unwindowed DUB comparison uses active Actual months and reads no figures when one lacks Budget", async () => {
  const selection: Selection = {
    ...financialSelection,
    timeWindow: undefined,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
  };
  const fixture = makeFixture({
    selection,
    loadedBudgetMonths: ["2026-07-01"],
    activeActualPins: [
      { source: "actuals", period: "2026-06-01", batchId: "actual-june" },
      { source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID },
    ],
  });
  const user = userForPlants("governed-financial", ["DUB"]);
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "Show the selected comparison for DUB");

  assert.equal(response.responseClass, ResponseClass.Informational);
  assert.deepEqual(response.leftOut, { reason: "budget-not-loaded", plants: ["Agri - Nursery - DUB"] });
  assert.deepEqual(fixture.transactions.activePinCalls, [{ from: "0001-01-01", to: "9999-12-31" }]);
  assert.equal(fixture.executor.calls, 0);
  assert.equal(fixture.audit.requests, 1);
});

test("a DUB-only comparison with loaded Budget has no left-out notice", async () => {
  const selection: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
  };
  const fixture = makeFixture({ selection, result: { columns: [], rows: [] } });
  const user = userForPlants("governed-financial", ["DUB"]);
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(user, "session", "Actual over Budget for DUB in July 2026");

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.equal(response.leftOut, undefined);
  assert.deepEqual(fixture.executor.selections[0]?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
});

test("successful answers expose exactly the one three or four plants they read", async () => {
  const cases = [
    { plants: ["DUB"], scope: "plant=Agri - Nursery - DUB" },
    {
      plants: ["CHIR", "DUB", "VJM"],
      scope: "plant=Agriculture - Nursery - CHIR, plant=Agri - Nursery - DUB, plant=Operations - Unit - VJM",
    },
    {
      plants: ["AP-AGRI", "CHIR", "DUB", "VJM"],
      scope:
        "plant=Operations - Unit - AP-AGRI, plant=Agriculture - Nursery - CHIR, plant=Agri - Nursery - DUB, plant=Operations - Unit - VJM",
    },
  ];
  for (const entry of cases) {
    const fixture = makeFixture({ selection: financialSelection });
    const response = await fixture.service.ask(
      userForPlants("governed-financial", [...entry.plants, "CK"]),
      "session",
      `Show Actual for ${entry.plants.join(" and ")} in July 2026`,
    );
    assert.deepEqual(Object.keys(response.plantNames ?? {}), [...entry.plants].sort(), entry.plants.join(","));
    assert.equal(response.provenance?.scope, entry.scope, entry.plants.join(","));
    assert.doesNotMatch(response.provenance?.scope ?? "", /department=|function=|plant=CK/);
  }
});

test("edited saved pinned and continuation selections without a plant filter use the same plant rule", async () => {
  for (const origin of [undefined, "saved-view", "pin"] as const) {
    const fixture = makeFixture({ selection: financialSelection });
    const response = await fixture.service.ask(
      userForPlants("governed-financial", ["DUB", "CHIR"]),
      "session",
      "Show selected Actual",
      financialSelection,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      origin,
    );
    assert.equal(response.plantChoice?.prompt, "Which plants should this answer cover?", String(origin));
    assert.equal(fixture.executor.calls, 0, String(origin));
  }

  const singleton = makeFixture({ selection: financialSelection });
  const singletonResponse = await singleton.service.ask(
    userForPlants("governed-financial", ["DUB"]),
    "session",
    "Show selected Actual",
    financialSelection,
  );
  assert.equal(singletonResponse.responseClass, ResponseClass.Success);
  assert.deepEqual(singleton.executor.selections[0]?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
  assert.deepEqual(
    singletonResponse.availableFields?.dimensions.find(({ id }) => id === "plant"),
    {
      id: "plant",
      label: "Plant",
      values: ["DUB", "Agri - Nursery - DUB"],
    },
  );
});

test("named plants override the selector while no named plant discards it and one grant runs directly", async () => {
  const named = makeFixture({
    selection: {
      ...financialSelection,
      filters: [{ dimensionId: "plant", op: "in", value: ["VJM"] }],
    },
  });
  const namedResponse = await named.service.ask(
    userForPlants("governed-financial", ["DUB", "CHIR", "VJM"]),
    "session",
    "Show Actual for dub and CHIR",
  );
  assert.equal(namedResponse.responseClass, ResponseClass.Success);
  assert.deepEqual(named.executor.selections[0]?.filters, [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }]);
  assert.deepEqual(named.logs[0]?.context, {
    selectorPlantFilters: [{ dimensionId: "plant", op: "in", value: ["VJM"] }],
    authoritativePlants: ["CHIR", "DUB"],
  });

  const unnamed = makeFixture({
    selection: {
      ...financialSelection,
      filters: [{ dimensionId: "plant", op: "in", value: ["CHIR"] }],
    },
  });
  const unnamedResponse = await unnamed.service.ask(
    userForPlants("governed-financial", ["DUB", "CHIR"]),
    "session",
    "Show Actual",
  );
  assert.equal(unnamedResponse.responseClass, ResponseClass.ClarificationNeeded);
  assert.deepEqual(unnamedResponse.plantChoice?.selection.filters, []);

  const singleton = makeFixture({ selection: { ...financialSelection, filters: [] } });
  const singletonResponse = await singleton.service.ask(
    userForPlants("governed-financial", ["DUB"]),
    "session",
    "Show Actual",
  );
  assert.equal(singletonResponse.responseClass, ResponseClass.Success);
  assert.deepEqual(singleton.executor.selections[0]?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
});

test("an ungranted plant name is refused before the provider or any figure read and short codes stay case-sensitive", async () => {
  for (const question of [
    "Show Actual for CHIR",
    "Show Actual for Agriculture   - Nursery - CHIR",
    "Show Actual for CK",
  ]) {
    const fixture = makeFixture({ selection: financialSelection });
    const response = await fixture.service.ask(userForPlants("governed-financial", ["DUB"]), "session", question);
    assert.equal(response.responseClass, ResponseClass.BlockedByPolicy, question);
    assert.equal(response.refusal?.reason, "plant-not-granted", question);
    assert.equal(fixture.llm.inputs.length, 0, question);
    assert.equal(fixture.executor.calls, 0, question);
  }

  const lower = makeFixture({ selection: financialSelection });
  const response = await lower.service.ask(
    userForPlants("governed-financial", ["DUB", "CHIR"]),
    "session",
    "check actual for ck",
  );
  assert.equal(response.plantChoice?.prompt, "Which plants should this answer cover?");

  const noGrants = makeFixture({ selection: financialSelection });
  const noGrantResponse = await noGrants.service.ask(
    userForPlants("governed-financial", []),
    "session",
    "Show Actual for CHIR",
  );
  assert.equal(noGrantResponse.refusal?.reason, "no-plants-granted");
  assert.equal(noGrants.llm.inputs.length, 0);
  assert.equal(noGrants.executor.calls, 0);

  const noGrantCausal = makeFixture({ selection: financialSelection });
  const noGrantCausalResponse = await noGrantCausal.service.ask(
    userForPlants("governed-financial", []),
    "session",
    "Why is Actual high?",
  );
  assert.equal(noGrantCausalResponse.refusal?.reason, "no-plants-granted");
  assert.equal(noGrantCausal.help.calls, 0);
});

test("plant refusals run before informational shortcuts without forcing a picker", async () => {
  const ungrantedName = makeFixture({ selection: financialSelection });
  const ungrantedResponse = await ungrantedName.service.ask(
    userForPlants("governed-financial", ["DUB"]),
    "session",
    "Why is Actual high for CHIR?",
  );
  assert.equal(ungrantedResponse.refusal?.reason, "plant-not-granted");
  assert.equal(ungrantedName.help.calls, 0);
  assert.equal(ungrantedName.llm.inputs.length, 0);

  const invalidPrior = makeFixture({ selection: financialSelection });
  const invalidResponse = await invalidPrior.service.ask(
    userForPlants("governed-financial", ["DUB"]),
    "session",
    "Why is Actual high?",
    undefined,
    undefined,
    [
      {
        question: "Earlier",
        selection: {
          ...financialSelection,
          filters: [{ dimensionId: "plant", op: "eq", value: "DUB" }],
        },
      },
    ],
  );
  assert.equal(invalidResponse.refusal?.reason, "plant-filter-invalid");
  assert.equal(invalidPrior.help.calls, 0);

  const informational = makeFixture({ selection: financialSelection });
  const informationalResponse = await informational.service.ask(
    userForPlants("governed-financial", ["DUB", "CHIR"]),
    "session",
    "Why is Actual high?",
  );
  assert.equal(informationalResponse.responseClass, ResponseClass.Informational);
  assert.equal(informationalResponse.plantChoice, undefined);
});

test("every Ask ingress canonicalises valid plant filters and refuses invalid or revoked filters without a read", async () => {
  const canonical = makeFixture({ selection: financialSelection });
  const canonicalResponse = await canonical.service.ask(
    userForPlants("governed-financial", ["DUB", "CHIR"]),
    "session",
    "Show selected Actual",
    {
      ...financialSelection,
      filters: [{ dimensionId: "plant", op: "in", value: ["DUB", "CHIR", "DUB"] }],
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "plant-choice",
  );
  assert.equal(canonicalResponse.responseClass, ResponseClass.Success);
  assert.deepEqual(canonical.executor.selections[0]?.filters, [
    { dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] },
  ]);

  for (const [origin, reason] of [
    ["saved-view", "plants-revoked"],
    ["pin", "plants-revoked"],
    ["plant-choice", "choice-plants-revoked"],
    ["period-choice", "choice-plants-revoked"],
    [undefined, "plant-not-granted"],
  ] as const) {
    const fixture = makeFixture({ selection: financialSelection });
    const response = await fixture.service.ask(
      userForPlants("governed-financial", ["DUB"]),
      "session",
      "Show selected Actual",
      {
        ...financialSelection,
        filters: [{ dimensionId: "plant", op: "in", value: ["DUB", "CHIR"] }],
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      origin,
    );
    assert.equal(response.refusal?.reason, reason, String(origin));
    assert.equal(fixture.executor.calls, 0, String(origin));
  }

  const invalid = makeFixture({ selection: financialSelection });
  const invalidResponse = await invalid.service.ask(
    userForPlants("governed-financial", ["DUB", "CHIR"]),
    "session",
    "Show selected Actual",
    {
      ...financialSelection,
      filters: [
        { dimensionId: "plant", op: "in", value: ["DUB"] },
        { dimensionId: "plant", op: "in", value: ["CHIR"] },
      ],
    },
  );
  assert.equal(invalidResponse.refusal?.reason, "plant-filter-invalid");
  assert.equal(invalid.executor.calls, 0);

  for (const filter of [
    { dimensionId: "plant", op: "in" as const, value: ["dub"] },
    { dimensionId: "plant", op: "eq" as const, value: "DUB" },
    { dimensionId: "plant", op: "in" as const, value: [] },
    { dimensionId: "plant", op: "in" as const, value: ["DUB-NUR"] },
  ]) {
    const fixture = makeFixture({ selection: financialSelection });
    const response = await fixture.service.ask(
      userForPlants("governed-financial", ["DUB"]),
      "session",
      "Show selected Actual",
      { ...financialSelection, filters: [filter] },
    );
    assert.equal(response.refusal?.reason, "plant-filter-invalid", JSON.stringify(filter));
    assert.equal(fixture.executor.calls, 0, JSON.stringify(filter));
  }

  const prior = makeFixture({ selection: financialSelection });
  const priorResponse = await prior.service.ask(
    userForPlants("governed-financial", ["DUB"]),
    "session",
    "Show Actual",
    undefined,
    undefined,
    [
      {
        question: "Earlier",
        selection: {
          ...financialSelection,
          filters: [{ dimensionId: "plant", op: "in", value: ["CHIR"] }],
        },
      },
    ],
  );
  assert.equal(priorResponse.refusal?.reason, "plant-not-granted");
  assert.equal(prior.llm.inputs.length, 0);

  const ordered = makeFixture({ selection: financialSelection });
  const orderedResponse = await ordered.service.ask(
    userForPlants("governed-financial", ["DUB"]),
    "session",
    "Show Actual for CHIR",
    undefined,
    undefined,
    [
      {
        question: "Revoked first",
        selection: {
          ...financialSelection,
          filters: [{ dimensionId: "plant", op: "in", value: ["CHIR"] }],
        },
      },
      {
        question: "Invalid second",
        selection: {
          ...financialSelection,
          filters: [{ dimensionId: "plant", op: "eq", value: "DUB" }],
        },
      },
    ],
  );
  assert.equal(orderedResponse.refusal?.reason, "plant-filter-invalid");
  assert.equal(ordered.llm.inputs.length, 0);

  const grounded = makeFixture({
    selection: financialSelection,
    groundedSelection: {
      ...financialSelection,
      filters: [{ dimensionId: "plant", op: "in", value: ["CHIR"] }],
    },
  });
  const groundedResponse = await grounded.service.ask(
    userForPlants("governed-financial", ["DUB"]),
    "session",
    "Show Actual",
    undefined,
    { reportId: "report", timeWindow: { from: "2026-07-01", to: "2026-07-31" } },
  );
  assert.equal(groundedResponse.refusal?.reason, "plant-not-granted");
  assert.equal(grounded.executor.calls, 0);
});

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
  assert.deepEqual(input.dimensionValues?.plant, ["DUB", "Agri - Nursery - DUB"]);
  assert.equal(fixture.dimensions.plantCalls, 0);
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
  assert.ok(response.drill, JSON.stringify(response));
  assert.deepEqual(response.drill.rows, [
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
    filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }],
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
      { key: "50001201", plants: ["DUB"], glCode: "50001201", actualPaise: "839833900", drillable: true },
      { key: "50009999", plants: ["DUB"], glCode: "50009999", actualPaise: "0", drillable: false },
      { key: "50008888", plants: ["DUB"], glCode: "50008888", actualPaise: "0", drillable: true },
      { key: "50007777", plants: ["DUB"], glCode: "50007777", actualPaise: "100", drillable: false },
    ]);
  }
  assert.deepEqual(fixture.logs, [{ context: { rowKey: "50007777" } }]);
});

test("GL-code rows split by plant carry composite-keyed names budgets and drills for only that row's plant", async () => {
  const selection: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    dimensionIds: ["gl_code", "plant"],
  };
  const fixture = makeFixture({
    selection,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "plant", label: "Plant", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
        { key: "budget", label: "Budget", numeric: true, format: "money" },
      ],
      rows: [
        { gl_code: "50001201", plant: "DUB", actual: "1.00", budget: "1.00" },
        { gl_code: "50001201", plant: "CHIR", actual: "2.00", budget: null },
      ],
    },
    activeBatchIds: [{ source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID }],
    labels: [
      { key: "50001201|DUB", label: "DUB Sprout Cost", otherLabels: [] },
      { key: "50001201|CHIR", label: "CHIR Sprout Cost", otherLabels: [] },
    ],
    summaries: [
      { rowKey: "50001201|DUB", feedingLineCount: 1, value: "1.00" },
      { rowKey: "50001201|CHIR", feedingLineCount: 1, value: "2.00" },
    ],
  });
  const user = userForPlants("governed-financial", ["DUB", "CHIR"]);
  user.permissions.measureIds.push("governed-financial.budget");

  const response = await fixture.service.ask(
    user,
    "session",
    "Show Actual and Budget by GL code for DUB and CHIR in July 2026",
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(response.rowLabels, fixture.names.labels);
  assert.deepEqual(response.budgetStates, [
    { key: "50001201|DUB", state: "loaded", plantsInRow: ["DUB"], plantsWithBudget: ["DUB"] },
    { key: "50001201|CHIR", state: "not-loaded", plantsInRow: ["CHIR"], plantsWithBudget: [] },
  ]);
  assert.ok(response.drill, JSON.stringify(response));
  assert.deepEqual(response.drill.rows, [
    { key: "50001201|DUB", drillable: true },
    { key: "50001201|CHIR", drillable: true },
  ]);
  assert.deepEqual(
    fixture.names.glCalls[0]?.rows.map(({ key, predicate }) => ({ key, plants: predicate.plants })),
    [
      { key: "50001201|DUB", plants: ["DUB"] },
      { key: "50001201|CHIR", plants: ["CHIR"] },
    ],
  );
  assert.deepEqual(
    fixture.transactions.calls[0]?.map(({ rowKey, predicate }) => ({ rowKey, plants: predicate.plants })),
    [
      { rowKey: "50001201|DUB", plants: ["DUB"] },
      { rowKey: "50001201|CHIR", plants: ["CHIR"] },
    ],
  );
  const verified = fixture.contexts.verify(response.drill!.context, "user-1");
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") {
    assert.deepEqual(
      verified.claims.rows.map(({ key, plants }) => ({ key, plants })),
      [
        { key: "50001201|DUB", plants: ["DUB"] },
        { key: "50001201|CHIR", plants: ["CHIR"] },
      ],
    );
  }
});

test("statement rows split by plant carry composite keys and each plant's own triples", async () => {
  const selection: Selection = {
    ...statementSelection,
    measureIds: ["mis-statement.actual_net", "mis-statement.budget_net"],
    dimensionIds: ["leaf_key", "plant"],
  };
  const fixture = makeFixture({
    selection,
    result: {
      columns: [
        { key: "leaf_key", label: "Statement line", numeric: false },
        { key: "plant", label: "Plant", numeric: false },
        { key: "actual_net", label: "Actual", numeric: true, format: "money" },
        { key: "budget_net", label: "Budget", numeric: true, format: "money" },
      ],
      rows: [
        { leaf_key: "leaf", plant: "DUB", actual_net: "1.00", budget_net: "1.00" },
        { leaf_key: "leaf", plant: "CHIR", actual_net: "2.00", budget_net: null },
      ],
    },
    activeBatchIds: [
      { source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID },
      { source: "budget", period: "2026-07-01", batchId: BUDGET_BATCH_ID },
    ],
    labels: [
      { key: "leaf|DUB", label: "1.1 Sprout Cost", otherLabels: [] },
      { key: "leaf|CHIR", label: "1.1 Sprout Cost", otherLabels: [] },
    ],
    summaries: [
      { rowKey: "leaf|DUB", feedingLineCount: 1, value: "1.00" },
      { rowKey: "leaf|CHIR", feedingLineCount: 1, value: "2.00" },
    ],
  });

  const user = userForPlants("mis-statement", ["DUB", "CHIR"], true);
  user.permissions.measureIds.push("mis-statement.budget_net");
  const response = await fixture.service.ask(
    user,
    "session",
    "Show statement Actual by plant for DUB and CHIR in July 2026",
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(response.rowLabels, fixture.names.labels);
  assert.deepEqual(response.drill?.rows, [
    { key: "leaf|DUB", drillable: true },
    { key: "leaf|CHIR", drillable: true },
  ]);
  assert.deepEqual(response.budgetStates, [
    { key: "leaf|DUB", state: "loaded", plantsInRow: ["DUB"], plantsWithBudget: ["DUB"] },
    { key: "leaf|CHIR", state: "not-loaded", plantsInRow: ["CHIR"], plantsWithBudget: [] },
  ]);
  assert.deepEqual(
    fixture.transactions.calls[0]?.map(({ rowKey, predicate }) => ({
      rowKey,
      plants: predicate.plants,
      triples: predicate.triples,
    })),
    [
      {
        rowKey: "leaf|DUB",
        plants: ["DUB"],
        triples: [{ plant: "DUB", costCenter: "Primary", glCode: "5001" }],
      },
      {
        rowKey: "leaf|CHIR",
        plants: ["CHIR"],
        triples: [{ plant: "CHIR", costCenter: "Primary", glCode: "5001" }],
      },
    ],
  );
});

test("a mixed-grant summed row keeps names and drill context on the effective plant set", async () => {
  const fixture = makeFixture({
    selection: financialSelection,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
      ],
      rows: [{ gl_code: "50001201", actual: "3.00" }],
    },
    activeBatchIds: [{ source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID }],
    labels: [{ key: "50001201", label: "Shared Sprout Cost", otherLabels: [] }],
    summaries: [{ rowKey: "50001201", feedingLineCount: 2, value: "3.00" }],
  });

  const response = await fixture.service.ask(
    userForPlants("governed-financial", ["DUB", "CHIR", "VJM"]),
    "session",
    "Show Actual by GL code for DUB and CHIR in July 2026",
  );

  assert.deepEqual(response.rowLabels, fixture.names.labels);
  assert.deepEqual(fixture.names.glCalls[0]?.rows[0]?.predicate.plants, ["CHIR", "DUB"]);
  assert.equal(response.provenance?.scope.includes("VJM"), false);
  const verified = fixture.contexts.verify(response.drill!.context, "user-1");
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") {
    assert.deepEqual(verified.claims.plants, ["CHIR", "DUB"]);
    assert.deepEqual(verified.claims.rows[0]?.plants, ["CHIR", "DUB"]);
  }
});

test("month-bearing and plant-only shapes carry no names or drill metadata", async () => {
  const shapes = [
    { dimensions: ["plant"], row: { plant: "DUB", actual: "1.00" } },
    { dimensions: ["month"], row: { month: "2026-07-01", actual: "1.00" } },
    { dimensions: ["month", "plant"], row: { month: "2026-07-01", plant: "DUB", actual: "1.00" } },
    { dimensions: ["gl_code", "month"], row: { gl_code: "50001201", month: "2026-07-01", actual: "1.00" } },
    {
      dimensions: ["gl_code", "month", "plant"],
      row: { gl_code: "50001201", month: "2026-07-01", plant: "DUB", actual: "1.00" },
    },
  ];

  for (const { dimensions, row } of shapes) {
    const selection = { ...financialSelection, dimensionIds: dimensions };
    const fixture = makeFixture({
      selection,
      result: {
        columns: [
          ...dimensions.map((key) => ({ key, label: key, numeric: false })),
          { key: "actual", label: "Actual", numeric: true, format: "money" as const },
        ],
        rows: [row as Record<string, string | number | null>],
      },
      activeBatchIds: [{ source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID }],
    });

    const response = await fixture.service.ask(userFor("governed-financial"), "session", "Show Actual", selection);

    assert.equal(response.rowLabels, undefined, dimensions.join(" x "));
    assert.equal(response.drill, undefined, dimensions.join(" x "));
    assert.equal(fixture.names.glCalls.length, 0, dimensions.join(" x "));
    assert.equal(fixture.transactions.calls.length, 0, dimensions.join(" x "));
  }
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

test("a sparse multi-period GL answer signs every active Actual month in its executed window", async () => {
  const selection: Selection = {
    ...financialSelection,
    timeWindow: { grain: "month", from: "2026-04-01", to: "2026-07-31" },
  };
  const activeActualPins = [
    { source: "actuals" as const, period: "2026-04-01", batchId: "actual-april" },
    { source: "actuals" as const, period: "2026-05-01", batchId: "actual-may" },
    { source: "actuals" as const, period: "2026-06-01", batchId: "actual-june" },
    { source: "actuals" as const, period: "2026-07-01", batchId: ACTUAL_BATCH_ID },
  ];
  const fixture = makeFixture({
    selection,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
      ],
      rows: [{ gl_code: "50001201", actual: "125.01" }],
    },
    activeBatchIds: [activeActualPins[0]!, activeActualPins[3]!],
    activeActualPins,
    summaries: [{ rowKey: "50001201", feedingLineCount: 1, value: "125.01" }],
  });

  const response = await fixture.service.ask(
    userFor("governed-financial"),
    "session",
    "Show Actual by GL code from April to July 2026",
    selection,
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  const verified = fixture.contexts.verify(response.drill!.context, "user-1");
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") assert.deepEqual(verified.claims.pinnedActuals, activeActualPins);
  assert.deepEqual(fixture.transactions.activePinCalls, [
    { from: "2026-04-01", to: "2026-07-31" },
    { from: "2026-04-01", to: "2026-07-31" },
  ]);
  assert.deepEqual(fixture.transactions.calls[0]?.[0]?.predicate.actualBatchIds, [
    "actual-april",
    "actual-may",
    "actual-june",
    ACTUAL_BATCH_ID,
  ]);
});

test("a contributing month reload between the bracketed pin lookups leaves the answer inert", async () => {
  const executedPin = { source: "actuals" as const, period: "2026-07-01", batchId: ACTUAL_BATCH_ID };
  const reloadedPin = { source: "actuals" as const, period: "2026-07-01", batchId: "actual-july-reloaded" };
  const fixture = makeFixture({
    selection: financialSelection,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
      ],
      rows: [{ gl_code: "50001201", actual: "125.01" }],
    },
    activeBatchIds: [executedPin],
    activeActualPinSnapshots: [[executedPin], [reloadedPin]],
    summaries: [{ rowKey: "50001201", feedingLineCount: 1, value: "125.01" }],
  });

  const response = await fixture.service.ask(
    userFor("governed-financial"),
    "session",
    "Show Actual by GL code for July 2026",
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.equal(response.drill, undefined);
  assert.equal(fixture.transactions.calls.length, 0);
  assert.deepEqual(fixture.names.glCalls[0]?.rows[0]?.predicate.actualBatchIds, [ACTUAL_BATCH_ID]);
  assert.deepEqual(fixture.logs, [{ context: { rowKey: "50001201", reason: "active-actual-batch-changed" } }]);
});

test("a noncontributing month reload between the bracketed pin lookups leaves the answer inert", async () => {
  const aprilPin = { source: "actuals" as const, period: "2026-04-01", batchId: "actual-april" };
  const mayPin = { source: "actuals" as const, period: "2026-05-01", batchId: "actual-may" };
  const reloadedMayPin = { source: "actuals" as const, period: "2026-05-01", batchId: "actual-may-reloaded" };
  const junePin = { source: "actuals" as const, period: "2026-06-01", batchId: "actual-june" };
  const julyPin = { source: "actuals" as const, period: "2026-07-01", batchId: ACTUAL_BATCH_ID };
  const fixture = makeFixture({
    selection: {
      ...financialSelection,
      timeWindow: { grain: "month", from: "2026-04-01", to: "2026-07-31" },
    },
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "actual", label: "Actual", numeric: true, format: "money" },
      ],
      rows: [{ gl_code: "50001201", actual: "125.01" }],
    },
    activeBatchIds: [aprilPin, julyPin],
    activeActualPinSnapshots: [
      [aprilPin, mayPin, junePin, julyPin],
      [aprilPin, reloadedMayPin, junePin, julyPin],
    ],
    summaries: [{ rowKey: "50001201", feedingLineCount: 1, value: "125.01" }],
  });

  const response = await fixture.service.ask(
    userFor("governed-financial"),
    "session",
    "Show Actual by GL code from April to July 2026",
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.equal(response.drill, undefined);
  assert.equal(fixture.transactions.calls.length, 0);
  assert.deepEqual(fixture.names.glCalls[0]?.rows[0]?.predicate.actualBatchIds, [
    "actual-april",
    "actual-may",
    "actual-june",
    ACTUAL_BATCH_ID,
  ]);
  assert.deepEqual(fixture.logs, [{ context: { rowKey: "50001201", reason: "active-actual-batch-changed" } }]);
});

test("statement label batch selection chooses the last budget month from a multi-month window", () => {
  const window = { grain: "month" as const, from: "2026-06-01", to: "2026-07-01" };
  const julyBudget = { source: "budget" as const, period: "2026-07-01", batchId: BUDGET_BATCH_ID };

  assert.deepEqual(
    lastMonthBudgetPin([{ source: "budget", period: "2026-06-01", batchId: "budget-june" }, julyBudget], window.to),
    julyBudget,
  );
});

test("a saved multi-period statement re-run labels and binds the final month's budget outline and triples", async () => {
  const selection: Selection = {
    ...statementSelection,
    timeWindow: { grain: "month", from: "2026-04-01", to: "2026-07-31" },
  };
  const fixture = makeFixture({
    selection,
    statementPeriod: { value: "fy26-27-ytd", label: "FYTD", from: "2026-04-01", to: "2026-07-01" },
    result: {
      columns: [
        { key: "leaf_key", label: "Statement line", numeric: false },
        { key: "actual_net", label: "Actual", numeric: true, format: "money" },
      ],
      rows: [{ leaf_key: "leaf", actual_net: 125.01 }],
    },
    activeBatchIds: [
      { source: "actuals", period: "2026-04-01", batchId: "actual-april" },
      { source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID },
      { source: "budget", period: "2026-04-01", batchId: "budget-april" },
      { source: "budget", period: "2026-07-01", batchId: BUDGET_BATCH_ID },
    ],
    labels: [{ key: "leaf", label: "1.1 Sprout Cost", otherLabels: [] }],
    summaries: [{ rowKey: "leaf", feedingLineCount: 1, value: "125.01" }],
  });

  const response = await fixture.service.ask(
    userFor("mis-statement", true),
    "session",
    "Re-run saved statement",
    selection,
  );

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(fixture.names.statementCalls, [
    { keys: [{ key: "leaf", leafKey: "leaf" }], budgetBatchId: BUDGET_BATCH_ID },
  ]);
  const verified = fixture.contexts.verify(response.drill!.context, "user-1");
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") {
    assert.deepEqual(verified.claims.budget, {
      pin: { source: "budget", period: "2026-07-01", batchId: BUDGET_BATCH_ID },
      outlineDigest: "outline-digest",
    });
    assert.deepEqual(verified.claims.rows[0]?.triples, [{ plant: "DUB", costCenter: "Primary", glCode: "5001" }]);
  }
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

test("a reader without the Actual grant receives neither an Actual value nor drill metadata", async () => {
  const selection: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
  };
  const fixture = makeFixture({ selection });

  const response = await fixture.service.ask(
    userFor("governed-financial", false, ["governed-financial.budget"]),
    "session",
    "Show Actual and Budget by GL code",
  );

  assert.equal(response.responseClass, ResponseClass.NotSupported);
  assert.equal(response.result, undefined);
  assert.equal(response.drill, undefined);
  assert.doesNotMatch(JSON.stringify(response), /actualPaise|"actual"/);
  assert.equal(fixture.transactions.calls.length, 0);
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
    filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }],
    from: "2026-07-01",
    to: "2026-07-01",
  });
  assert.equal(fixture.transactions.calls.length, 0);
});

test("a budget-only all-data GL answer resolves its MIS fallback from the latest pinned budget", async () => {
  const selection: Selection = {
    ...financialSelection,
    measureIds: ["governed-financial.budget"],
    timeWindow: undefined,
  };
  const fixture = makeFixture({
    selection,
    result: {
      columns: [
        { key: "gl_code", label: "GL code", numeric: false },
        { key: "budget", label: "Budget", numeric: true, format: "money" },
      ],
      rows: [{ gl_code: "budget-only", budget: "10.00" }],
    },
    activeBatchIds: [
      { source: "budget", period: "2026-06-01", batchId: "budget-june" },
      { source: "budget", period: "2026-07-01", batchId: BUDGET_BATCH_ID },
    ],
    labels: [{ key: "budget-only", label: "Budget Components", otherLabels: [] }],
  });

  const response = await fixture.service.ask(
    userFor("governed-financial", false, ["governed-financial.budget"]),
    "session",
    "Show all Budget by GL code",
  );

  assert.deepEqual(response.rowLabels, fixture.names.labels);
  assert.equal(response.drill, undefined);
  assert.equal(fixture.names.glCalls[0]?.budgetBatchId, BUDGET_BATCH_ID);
  assert.deepEqual(fixture.names.glCalls[0]?.rows[0]?.predicate, {
    mode: "gl-and-plants",
    actualBatchIds: [],
    glCode: "budget-only",
    plants: ["DUB"],
    filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }],
    from: "2026-06-01",
    to: "2026-07-01",
  });
  assert.equal(fixture.transactions.calls.length, 0);
});

test("the real ChatModule graph resolves ChatService and its name and drill dependencies without startup hooks", async () => {
  @Module({ imports: [CoreModule, ChatModule] })
  class ChatResolutionTestModule {}

  const applicationConfig = new ApplicationConfig();
  const container = new NestContainer(applicationConfig);
  const scanner = new DependenciesScanner(container, new MetadataScanner(), NoopGraphInspector, applicationConfig);
  await scanner.scan(ChatResolutionTestModule);
  container.replace(DRIZZLE_DB, { isProvider: true, useValue: {} });
  container.replace(WAREHOUSE, { isProvider: true, useValue: {} });
  container.replace(AuthoredMeasureRegistry, { isProvider: true, useValue: { published: () => [] } });
  await new InstanceLoader(container, new Injector(), NoopGraphInspector).createInstancesOfDependencies();

  const resolved = <T>(token: InjectionToken): T => {
    for (const module of container.getModules().values()) {
      const instance = module.providers.get(token)?.instance;
      if (instance) return instance as T;
    }
    throw new Error(`Provider did not resolve: ${String(token)}`);
  };
  const chat = resolved<ChatService>(ChatService) as unknown as {
    glNames: GlNameRepository;
    drillTransactions: DrillTransactionsRepository;
    drillContexts: AskDrillContextService;
    outlines: StatementOutlineRepository;
    statementAttestation: StatementAttestationService;
  };

  assert.equal(chat.glNames, resolved(GlNameRepository));
  assert.equal(chat.drillTransactions, resolved(DrillTransactionsRepository));
  assert.equal(chat.drillContexts, resolved(AskDrillContextService));
  assert.equal(chat.outlines, resolved(StatementOutlineRepository));
  assert.equal(chat.statementAttestation, resolved(StatementAttestationService));
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
  const fixture = makeFixture({
    selection: { ...financialSelection, measureFilters },
    activeActualPins: [{ source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID }],
  });
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
  totals?: Record<string, number>;
  activeBatchIds?: ProvenanceBatch[];
  failEntryAudit?: boolean;
  labels?: Array<{ key: string; label: string; otherLabels: string[] }>;
  summaries?: DrillSummary[];
  activeActualPins?: Array<ProvenanceBatch & { source: "actuals" }>;
  activeActualPinSnapshots?: Array<Array<ProvenanceBatch & { source: "actuals" }>>;
  statementPeriod?: { value: string; label: string; from: string; to: string };
  loadedBudgetMonths?: string[];
  forbidOutlineBudgetLookups?: boolean;
}) {
  const llmResult: LlmSelectionResult =
    options.kind === "clarify"
      ? { kind: "clarify", prompt: "Which metric?", options: ["Actual"] }
      : options.kind === "no_tool_block" || options.kind === "backend_error"
        ? { kind: options.kind, reason: "Incomplete model response" }
        : { kind: "selection", selection: options.selection! };
  const fakeLlm = new FakeLlm(llmResult);
  const provider = options.llm ?? fakeLlm;
  const executor = new FakeExecutor(options.result ?? RESULT, options.activeBatchIds ?? [], options.totals);
  const audit = new FakeAudit(options.failEntryAudit ?? false);
  const dimensions = new FakeDimensions();
  const help = new FakeHelp();
  const semantic = new SemanticLayer();
  const names = new FakeNames(options.labels ?? []);
  const transactions = new FakeTransactions(
    options.summaries ?? [],
    options.activeActualPinSnapshots ?? [
      options.activeActualPins ??
        (options.activeBatchIds ?? []).filter(
          (pin): pin is ProvenanceBatch & { source: "actuals" } => pin.source === "actuals",
        ),
    ],
    options.loadedBudgetMonths ?? ["2026-07-01"],
  );
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
  const resolver = new FakeSelectionResolver(options.statementPeriod);
  const outlines = new FakeOutlines(
    options.loadedBudgetMonths ?? ["2026-07-01"],
    options.forbidOutlineBudgetLookups ?? false,
  );
  const service = new ChatService(
    semantic,
    executor as never,
    audit as never,
    dimensions as never,
    reports as never,
    help as never,
    resolver as never,
    provider,
    {} as never,
    names as never,
    transactions as never,
    contexts,
    outlines as never,
    { outlineDigest: () => "outline-digest" } as never,
  );
  Reflect.set(service, "logger", {
    log(_level: string, _message: string, fields: { context?: Record<string, unknown> }) {
      logs.push({ context: fields.context ?? {} });
    },
  });
  return { service, llm: fakeLlm, executor, audit, dimensions, help, logs, names, transactions, contexts, resolver };
}

class FakeNames {
  readonly glCalls: Array<{ rows: Array<{ key: string; predicate: DrillPredicate }>; budgetBatchId?: string }> = [];
  readonly statementCalls: Array<{
    keys: Array<{ key: string; leafKey: string }>;
    budgetBatchId?: string;
  }> = [];

  constructor(readonly labels: Array<{ key: string; label: string; otherLabels: string[] }>) {}

  async findGlCodeLabels(rows: Array<{ key: string; predicate: DrillPredicate }>, budgetBatchId?: string) {
    this.glCalls.push({ rows, budgetBatchId });
    return this.labels;
  }

  async findStatementLabels(keys: Array<{ key: string; leafKey: string }>, budgetBatchId?: string) {
    this.statementCalls.push({ keys, budgetBatchId });
    return this.labels;
  }
}

class FakeTransactions {
  readonly calls: Array<Array<{ rowKey: string; predicate: DrillPredicate }>> = [];
  readonly activePinCalls: Array<{ from: string; to: string }> = [];
  readonly batchStateCalls: ProvenanceBatch[][] = [];
  readonly budgetPeriodCalls: Array<{ from: string; to: string }> = [];

  constructor(
    private readonly summaries: DrillSummary[],
    private readonly activeActualPinSnapshots: Array<Array<ProvenanceBatch & { source: "actuals" }>>,
    private readonly loadedBudgetMonths: string[],
  ) {}

  async findActiveActualPins(from: string, to: string) {
    const snapshotIndex = this.activePinCalls.length;
    this.activePinCalls.push({ from, to });
    return this.activeActualPinSnapshots[snapshotIndex] ?? this.activeActualPinSnapshots.at(-1) ?? [];
  }

  async findBatchStates(pins: ProvenanceBatch[]) {
    this.batchStateCalls.push(pins);
    return pins
      .filter(({ source, period }) => source === "budget" && this.loadedBudgetMonths.includes(period))
      .map(({ source, period }) => ({ source, period, batchId: BUDGET_BATCH_ID, isActive: true }));
  }

  async findActiveBudgetPeriods(from: string, to: string) {
    this.budgetPeriodCalls.push({ from, to });
    return this.loadedBudgetMonths.filter((period) => period >= from && period <= to);
  }

  async summarize(rows: Array<{ rowKey: string; predicate: DrillPredicate }>) {
    this.calls.push(rows);
    return this.summaries;
  }
}

class FakeOutlines {
  constructor(
    private readonly loadedBudgetMonths: string[],
    private readonly forbidBudgetLookups: boolean,
  ) {}

  async findActiveBudgetOutline(period: string) {
    assert.equal(this.forbidBudgetLookups, false, "budget periods must use one bounded batch lookup");
    if (!this.loadedBudgetMonths.includes(period)) throw new StatementOutlineUnavailableError();
    return { batchId: BUDGET_BATCH_ID, nodes: [{ nodeKey: "leaf", leafKey: "leaf" }] };
  }

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
  freshnessCalls = 0;
  readonly selections: Selection[] = [];
  readonly resolvedScopes: Array<
    | {
        triples: Array<{ plant: string; costCenter: string; glCode: string }>;
        glCodes: string[];
        masterGlCodes: string[];
        plantDisplayNames?: Record<string, string>;
      }
    | undefined
  > = [];
  constructor(
    private readonly result: ResultTable,
    private readonly activeBatchIds: ProvenanceBatch[],
    private readonly totals?: Record<string, number>,
  ) {}
  async run(
    _user: unknown,
    _domain: unknown,
    selection: Selection,
    options: {
      beforeExecute?: Function;
      resolvedScope?: {
        triples: Array<{ plant: string; costCenter: string; glCode: string }>;
        glCodes: string[];
        masterGlCodes: string[];
        plantDisplayNames?: Record<string, string>;
      };
    },
  ) {
    this.calls += 1;
    this.selections.push(selection);
    this.resolvedScopes.push(options.resolvedScope);
    await options.beforeExecute?.({ selection, sql: "SELECT governed", objectsTouched: [selection.domain] });
    return {
      result: this.result,
      totals: this.totals,
      sql: "SELECT governed",
      activeBatchIds: this.activeBatchIds,
      budgetComponentLabels: [],
      rowSourcePresence: [],
    };
  }
  async freshness() {
    this.freshnessCalls += 1;
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
  plantCalls = 0;
  monthValues = Array.from({ length: 51 }, (_, index) => `month-${index}`);
  async values(_object: string, column: string) {
    this.calls += 1;
    if (column === "plant") this.plantCalls += 1;
    if (column === "month") return this.monthValues;
    return Array.from({ length: 50 }, (_, index) => `DUB-${String(index).padStart(2, "0")}`);
  }
}

class FilterSensitiveWarehouse implements Warehouse {
  async explain(): Promise<void> {}

  async execute(sql: string) {
    const keptMonthFilter = /\bmonth = '2026-06-01'/.test(sql);
    const rows = keptMonthFilter
      ? []
      : [
          {
            gl_code: "DUB-01",
            actual: "7.00",
            source_presence: '["actual-only"]',
            budget_component_labels: "[]",
            active_batch_ids: "[]",
          },
        ];
    if (!sql.includes("source_presence")) {
      return {
        columns: [{ name: "actual", numeric: true }],
        rows: keptMonthFilter ? [] : [{ actual: "7.00" }],
      };
    }
    return {
      columns: [
        { name: "gl_code", numeric: false },
        { name: "actual", numeric: true },
        { name: "source_presence", numeric: false },
        { name: "budget_component_labels", numeric: false },
        { name: "active_batch_ids", numeric: false },
      ],
      rows,
    };
  }

  async freshness(): Promise<string | null> {
    return null;
  }

  async distinctValues(): Promise<string[]> {
    return [];
  }
}

async function withQueryTimeout<T>(milliseconds: number, run: () => Promise<T>): Promise<T> {
  const previous = process.env.QUERY_TIMEOUT_MS;
  process.env.QUERY_TIMEOUT_MS = String(milliseconds);
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.QUERY_TIMEOUT_MS;
    else process.env.QUERY_TIMEOUT_MS = previous;
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
  optionsCalls = 0;
  readonly resolveCalls: Array<{ department: string; function: string; plant: string; period: string }> = [];
  readonly resolvePlantsCalls: Array<{ plants: string[]; period: string }> = [];
  constructor(private readonly statementPeriod?: { value: string; label: string; from: string; to: string }) {}

  hasMapping() {
    return true;
  }

  async options() {
    this.optionsCalls += 1;
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
      periods: [period, ...(this.statementPeriod ? [this.statementPeriod] : [])],
    };
  }

  async resolve(request: { department: string; function: string; plant: string; period: string }) {
    this.resolveCalls.push(request);
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

  async resolvePlants(plants: string[], period: string) {
    this.resolvePlantsCalls.push({ plants, period });
    if (plants.length === 1) {
      return this.resolve({ department: "Agriculture", function: "Nursery", plant: plants[0], period });
    }
    return {
      outcome: "resolved" as const,
      plants: plants.map((plant) => ({
        plant,
        plantDisplay: plant === "DUB" ? "Agri - Nursery - DUB" : `Agriculture - Nursery - ${plant}`,
        department: "Agriculture",
        function: "Nursery",
        provisional: false,
      })),
      budgetOwnerPlant: "DUB",
      period: { value: period, from: period, to: period },
      glCodes: ["5001"],
      masterGlCodes: ["5001"],
      misFormat: "nursery-mis-financial-v1",
      bucketRows: [],
      triples: plants.map((plant) => ({ plant, costCenter: "Primary", glCode: "5001" })),
      leafTargets: plants.map((plant) => ({
        plant,
        costCenter: "Primary",
        glCode: "5001",
        target: { kind: "leaf" as const, leafKey: "leaf" },
      })),
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

function userForPlants(
  domain: "governed-financial" | "mis-statement",
  plants: string[],
  statementScope = false,
): AuthUser {
  const user = userFor(domain, statementScope);
  user.scope = [
    ...user.scope.filter(({ attribute }) => attribute !== "plant"),
    ...plants.map((value) => ({ attribute: "plant", value })),
  ];
  return user;
}
