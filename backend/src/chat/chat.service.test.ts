import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  ResponseClass,
  type AskPriorTurn,
  type AuthUser,
  type ProvenanceBatch,
  type ResultTable,
  type Selection,
} from "@3f/contract";
import type { LlmProvider, LlmSelectionInput, LlmSelectionResult } from "../llm/llm.interface";
import { LLM_CONTEXT_CHAR_BUDGET } from "../llm/llm.constants";
import { SemanticLayer } from "../semantic/semanticLayer";
import { ChatController } from "./chat.controller";
import { askSchema } from "./chat.schemas";
import { ChatService } from "./chat.service";

test("the llm provider receives the question prior turns and dimension values and never an amount or a result row", async () => {
  const fixture = makeFixture({
    selection: financialSelection,
    result: {
      columns: [{ key: "actual", label: "Actual", numeric: true }],
      rows: [
        {
          actual: 123.45,
          secret_row_marker: "warehouse-row",
          transaction_line: "transaction-line",
          batch_contents: "batch-contents",
        },
      ],
    },
    activeBatchIds: [{ source: "actuals", period: "2026-07-01", batchId: ACTUAL_BATCH_ID }],
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
  assert.deepEqual(Object.keys(input).sort(), ["allowedDomains", "dimensionValues", "priorTurns", "question"]);
  assert.equal(input.question, "Show Actual by GL code");
  assert.deepEqual(input.priorTurns, priorTurns);
  assert.equal(input.allowedDomains[0]?.name, "governed-financial");
  assert.equal(input.allowedDomains[0]?.measures[0]?.label, "Actual");
  assert.equal(input.allowedDomains[0]?.dimensions.find(({ id }) => id === "gl_code")?.label, "GL code");
  assert.equal(input.dimensionValues?.gl_code?.length, 50);
  assert.deepEqual(input.dimensionValues?.gl_code?.at(0), "DUB-00");
  assert.deepEqual(input.dimensionValues?.gl_code?.at(-1), "DUB-49");
  assert.equal("month" in (input.dimensionValues ?? {}), false);
  const serialized = JSON.stringify(input);
  for (const forbidden of ["123.45", "warehouse-row", "transaction-line", "batch-contents", ACTUAL_BATCH_ID]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
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
  const answer = await available.service.ask(userFor("mis-statement", true), "session", "Show statement Actual");
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

function makeFixture(options: {
  selection?: Selection;
  kind?: "selection" | "clarify";
  result?: ResultTable;
  activeBatchIds?: ProvenanceBatch[];
  failEntryAudit?: boolean;
}) {
  const llm = new FakeLlm(
    options.kind === "clarify"
      ? { kind: "clarify", prompt: "Which metric?", options: ["Actual"] }
      : { kind: "selection", selection: options.selection! },
  );
  const executor = new FakeExecutor(options.result ?? RESULT, options.activeBatchIds ?? []);
  const audit = new FakeAudit(options.failEntryAudit ?? false);
  const dimensions = new FakeDimensions();
  const help = new FakeHelp();
  const service = new ChatService(
    new SemanticLayer(),
    executor as never,
    audit as never,
    dimensions as never,
    {} as never,
    help as never,
    new FakeSelectionResolver() as never,
    llm,
  );
  return { service, llm, executor, audit, dimensions, help };
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
  constructor(
    private readonly result: ResultTable,
    private readonly activeBatchIds: ProvenanceBatch[],
  ) {}
  async run(_user: unknown, _domain: unknown, selection: Selection, options: { beforeExecute?: Function }) {
    this.calls += 1;
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

class FakeAudit {
  requests = 0;
  constructor(private readonly failEntry: boolean) {}
  async writeRequestEvent(input: { selection?: Selection }) {
    this.requests += 1;
    if (this.failEntry && !input.selection) throw new Error("audit unavailable");
    return this.requests;
  }
  async writeResultEvent() {}
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

function userFor(domain: "governed-financial" | "mis-statement", statementScope = false): AuthUser {
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
      measureIds: [statement ? "mis-statement.actual_net" : "governed-financial.actual"],
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
