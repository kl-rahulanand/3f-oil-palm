import assert from "node:assert/strict";
import { test } from "node:test";
import { ResponseClass, type AuthUser, type ProvenanceBatch, type ResultTable, type Selection } from "@3f/contract";
import type { LlmProvider, LlmSelectionInput, LlmSelectionResult } from "../llm/llm.interface";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { CHAT_MESSAGES } from "./chat.constants";
import { ChatService } from "./chat.service";

test("a statement question with no period clarifies with the offered periods instead of refusing", async () => {
  const fixture = makeFixture(statementSelection(), ["2026-07-01"]);

  const response = await fixture.service.ask(statementUser(), "session", STATEMENT_QUESTION);

  assert.equal(response.responseClass, ResponseClass.ClarificationNeeded);
  assert.deepEqual(
    response.periodChoice?.options.map(({ value }) => value),
    ["2026-07-01"],
  );
  assert.equal(response.periodControl, undefined);
  assert.equal(response.clarify, undefined);
});

test("the period choice carries the base selection the original question and a complete time window per entry", async () => {
  const selection = statementSelection();
  const response = await makeFixture(selection, ["2026-07-01"]).service.ask(
    statementUser(),
    "session",
    STATEMENT_QUESTION,
  );

  assert.deepEqual(response.periodChoice?.selection, {
    ...selection,
    filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }],
  });
  assert.equal(response.periodChoice?.question, STATEMENT_QUESTION);
  assert.deepEqual(response.periodChoice?.options[0], {
    value: "2026-07-01",
    label: "2026-07-01",
    timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-31" },
  });
});

test("a request carrying an edited selection makes zero selector calls", async () => {
  const fixture = makeFixture(statementSelection(), ["2026-07-01"]);
  const clarification = await fixture.service.ask(statementUser(), "session", STATEMENT_QUESTION);
  assert.equal(fixture.llm.calls, 1);
  const choice = clarification.periodChoice!;

  const response = await fixture.service.ask(statementUser(), "session", choice.question, {
    ...choice.selection,
    timeWindow: choice.options[0].timeWindow,
  });

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.equal(fixture.llm.calls, 1);
});

test("a plant choice is carried into the statement period choice and its continuation", async () => {
  const fixture = makeFixture(statementSelection(), ["2026-07-01"]);
  const user = statementUser();
  user.scope.push({ attribute: "plant", value: "CHIR" });

  const plantChoice = await fixture.service.ask(user, "session", STATEMENT_QUESTION);
  const selectedPlants: Selection = {
    ...plantChoice.plantChoice!.selection,
    filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }],
  };
  const periodChoice = await fixture.service.ask(
    user,
    "session",
    plantChoice.plantChoice!.question,
    selectedPlants,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "plant-choice",
  );

  assert.equal(periodChoice.responseClass, ResponseClass.ClarificationNeeded);
  assert.deepEqual(periodChoice.periodChoice?.selection.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);

  const answer = await fixture.service.ask(
    user,
    "session",
    periodChoice.periodChoice!.question,
    {
      ...periodChoice.periodChoice!.selection,
      timeWindow: periodChoice.periodChoice!.options[0].timeWindow,
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "period-choice",
  );

  assert.equal(answer.responseClass, ResponseClass.Success, JSON.stringify(answer));
  assert.deepEqual(answer.selection?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
});

test("a revoked plant on a statement period continuation is refused as choice-plants-revoked", async () => {
  const fixture = makeFixture(statementSelection(), ["2026-07-01"]);
  const response = await fixture.service.ask(
    statementUser(),
    "session",
    STATEMENT_QUESTION,
    {
      ...statementSelection(JULY_WINDOW),
      filters: [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }],
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    "period-choice",
  );

  assert.equal(response.responseClass, ResponseClass.BlockedByPolicy);
  assert.equal(response.refusal?.reason, "choice-plants-revoked");
  assert.deepEqual(response.refusal?.plants, ["Agriculture - Nursery - CHIR"]);
  assert.equal(fixture.executor.calls, 0);
});

test("an unoffered same day period a partial month and a multi month range each clarify", async () => {
  const windows = [
    { grain: "month" as const, from: "2026-08-01", to: "2026-08-01" },
    { grain: "month" as const, from: "2026-07-01", to: "2026-07-15" },
    { grain: "month" as const, from: "2026-07-01", to: "2026-08-31" },
  ];

  for (const timeWindow of windows) {
    const response = await makeFixture(statementSelection(timeWindow), ["2026-07-01"]).service.ask(
      statementUser(),
      "session",
      STATEMENT_QUESTION,
    );
    assert.equal(response.responseClass, ResponseClass.ClarificationNeeded);
    assert.deepEqual(
      response.periodChoice?.options.map(({ value }) => value),
      ["2026-07-01"],
    );
  }
});

test("legacy department and function scope neither selects nor blocks the chosen plant mapping", async () => {
  for (const attribute of ["department", "function"] as const) {
    for (const ambiguous of [false, true]) {
      const user = statementUser();
      user.scope = user.scope.filter((scope) => scope.attribute !== attribute);
      if (ambiguous) {
        user.scope.push({ attribute, value: "one" }, { attribute, value: "two" });
      }

      const response = await makeFixture(statementSelection(JULY_WINDOW), ["2026-07-01"]).service.ask(
        user,
        "session",
        `${STATEMENT_QUESTION} for July 2026`,
      );
      assert.equal(response.responseClass, ResponseClass.Success, `${attribute}:${ambiguous}`);
      assert.equal(response.viewInReport.available && response.viewInReport.department, "Agriculture");
      assert.equal(response.viewInReport.available && response.viewInReport.function, "Nursery");
    }
  }

  const noPlant = statementUser();
  noPlant.scope = noPlant.scope.filter(({ attribute }) => attribute !== "plant");
  const refused = await makeFixture(statementSelection(), []).service.ask(noPlant, "session", STATEMENT_QUESTION);
  assert.equal(refused.refusal?.reason, "no-plants-granted");

  const severalPlants = statementUser();
  severalPlants.scope.push({ attribute: "plant", value: "CHIR" });
  const choice = await makeFixture(statementSelection(), ["2026-07-01"]).service.ask(
    severalPlants,
    "session",
    STATEMENT_QUESTION,
  );
  assert.equal(choice.plantChoice?.prompt, "Which plants should this answer cover?");
  assert.equal(choice.periodChoice, undefined);
});

test("a chosen H.O statement uses its Corporate Office mapping instead of the reader's legacy Nursery scope", async () => {
  const fixture = makeFixture(statementSelection(JULY_WINDOW), ["2026-07-01"]);
  const user = statementUser();
  user.scope = user.scope.map((scope) => (scope.attribute === "plant" ? { attribute: "plant", value: "H.O" } : scope));

  const response = await fixture.service.ask(user, "session", "Show the H.O statement for July 2026", {
    ...statementSelection(JULY_WINDOW),
    filters: [{ dimensionId: "plant", op: "in", value: ["H.O"] }],
  });

  assert.equal(response.responseClass, ResponseClass.Success, JSON.stringify(response));
  assert.deepEqual(response.viewInReport, {
    available: true,
    department: "Corporate",
    function: "Office",
    plant: "H.O",
    period: "2026-07-01",
    activeBatchIds: [],
  });
  assert.ok(fixture.executor.resolvedScopes[0]?.triples.length);
  assert.ok(fixture.executor.resolvedScopes[0]?.triples.every(({ plant }) => plant === "H.O"));
});

test("no statement periods loaded is reported as missing periods", async () => {
  const noPeriods = await makeFixture(statementSelection(), []).service.ask(
    statementUser(),
    "session",
    STATEMENT_QUESTION,
  );

  assert.equal(noPeriods.responseClass, ResponseClass.NotSupported);
  assert.equal(noPeriods.message, CHAT_MESSAGES.statementPeriodsMissing);
  assert.equal(noPeriods.periodChoice, undefined);
});

test("a successful answer carries a period control whose current entry is the window it ran on", async () => {
  for (const timeWindow of [
    { grain: "month" as const, from: "2026-07-01", to: "2026-07-01" },
    { grain: "month" as const, from: "2026-07-01", to: "2026-07-31" },
  ]) {
    const response = await makeFixture(statementSelection(timeWindow), ["2026-07-01"]).service.ask(
      statementUser(),
      "session",
      `${STATEMENT_QUESTION} for July 2026`,
    );
    assert.equal(response.responseClass, ResponseClass.Success);
    assert.equal(response.periodControl?.current, "2026-07-01");
    assert.deepEqual(response.periodControl?.options[0].timeWindow, {
      grain: "month",
      column: "month",
      from: "2026-07-01",
      to: "2026-07-31",
    });
    assert.equal(response.periodChoice, undefined);
  }

  const governed = financialSelection(JULY_WINDOW);
  const response = await makeFixture(governed, ["2026-07-01"]).service.ask(
    financialUser(),
    "session",
    "Show Actual by GL code for July 2026",
    governed,
  );
  assert.equal(response.responseClass, ResponseClass.Success);
  assert.equal(response.periodControl?.current, "2026-07-01");
});

test("a governed answer with no window carries no defaulted period control", async () => {
  const response = await makeFixture(financialSelection(), ["2026-07-01"]).service.ask(
    financialUser(),
    "session",
    "Show Actual by GL code",
    financialSelection(),
  );

  assert.equal(response.responseClass, ResponseClass.Success);
  assert.equal(response.periodControl?.current, null);
  assert.match(response.periodControl?.coverage ?? "", /access scope.*filters/i);
  assert.equal(response.selection?.timeWindow, undefined);
});

test("a rerun response carries the active batch ids that produced its values", async () => {
  const activeBatchIds: ProvenanceBatch[] = [
    { source: "actuals", period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000099" },
  ];
  const fixture = makeFixture(statementSelection(JULY_WINDOW), ["2026-07-01"], activeBatchIds);

  const response = await fixture.service.ask(
    statementUser(),
    "session",
    STATEMENT_QUESTION,
    statementSelection(JULY_WINDOW),
  );

  assert.deepEqual(response.provenance?.activeBatchIds, activeBatchIds);
  assert.deepEqual(response.viewInReport.available && response.viewInReport.activeBatchIds, activeBatchIds);
});

const STATEMENT_QUESTION = "Show the MIS statement Actual by statement leaf";
const JULY_WINDOW = { grain: "month" as const, from: "2026-07-01", to: "2026-07-31" };
const RESULT: ResultTable = {
  columns: [{ key: "actual_net", label: "Actual", numeric: true }],
  rows: [{ actual_net: 42 }],
};

function statementSelection(timeWindow?: Selection["timeWindow"]): Selection {
  return {
    domain: "mis-statement",
    measureIds: ["mis-statement.actual_net"],
    dimensionIds: ["leaf_key"],
    filters: [],
    ...(timeWindow ? { timeWindow } : {}),
  };
}

function financialSelection(timeWindow?: Selection["timeWindow"]): Selection {
  return {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
    filters: [],
    ...(timeWindow ? { timeWindow } : {}),
  };
}

function makeFixture(selection: Selection, periods: string[], activeBatchIds: ProvenanceBatch[] = []) {
  const llm = new FakeLlm({ kind: "selection", selection });
  const executor = new FakeExecutor(activeBatchIds);
  const activeActualPins = activeBatchIds.filter(
    (pin): pin is ProvenanceBatch & { source: "actuals" } => pin.source === "actuals",
  );
  const service = new ChatService(
    new SemanticLayer(),
    executor as never,
    new FakeAudit() as never,
    new FakeDimensions() as never,
    {} as never,
    {} as never,
    new SelectionResolverService(new PeriodWarehouse(periods)),
    llm,
    {} as never,
    {} as never,
    { findActiveActualPins: async () => activeActualPins } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, llm, executor };
}

class FakeLlm implements LlmProvider {
  calls = 0;
  constructor(private readonly result: LlmSelectionResult) {}
  async select(_input: LlmSelectionInput): Promise<LlmSelectionResult> {
    this.calls += 1;
    return this.result;
  }
}

class FakeExecutor {
  calls = 0;
  readonly resolvedScopes: Array<
    | {
        triples: Array<{ plant: string; costCenter: string; glCode: string }>;
        plantDisplayNames?: Record<string, string>;
      }
    | undefined
  > = [];
  constructor(private readonly activeBatchIds: ProvenanceBatch[]) {}
  async run(
    _user: unknown,
    _domain: unknown,
    selection: Selection,
    options: {
      beforeExecute?: Function;
      resolvedScope?: {
        triples: Array<{ plant: string; costCenter: string; glCode: string }>;
        plantDisplayNames?: Record<string, string>;
      };
    },
  ) {
    this.calls += 1;
    this.resolvedScopes.push(options.resolvedScope);
    await options.beforeExecute?.({ selection, sql: "SELECT governed", objectsTouched: [selection.domain] });
    return {
      result: RESULT,
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

class FakeAudit {
  async writeRequestEvent() {}
  async writeResultEvent() {}
}

class FakeDimensions {
  async values() {
    return [];
  }
}

class PeriodWarehouse implements Warehouse {
  constructor(private readonly periods: string[]) {}
  async explain(): Promise<void> {}
  async execute(): Promise<QueryResult> {
    return {
      columns: [{ name: "period", numeric: false }],
      rows: this.periods.map((period) => ({ period })),
    };
  }
  async freshness(): Promise<string | null> {
    return null;
  }
  async distinctValues(): Promise<string[]> {
    return [];
  }
}

function statementUser(): AuthUser {
  return userFor(
    "mis-statement",
    ["mis-statement.actual_net"],
    ["leaf_key"],
    [
      { attribute: "department", value: "Agriculture" },
      { attribute: "function", value: "Nursery" },
      { attribute: "plant", value: "DUB" },
    ],
  );
}

function financialUser(): AuthUser {
  return userFor(
    "governed-financial",
    ["governed-financial.actual"],
    ["gl_code"],
    [{ attribute: "plant", value: "DUB" }],
  );
}

function userFor(domain: string, measureIds: string[], dimensionIds: string[], scope: AuthUser["scope"]): AuthUser {
  return {
    id: "user-1",
    email: "finance@example.com",
    display_name: "Finance",
    is_active: true,
    roles: ["admin"],
    permissions: { actions: ["report"], domains: [domain], measureIds, dimensionIds },
    scope,
  };
}
