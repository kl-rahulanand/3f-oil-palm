import assert from "node:assert/strict";
import { test } from "node:test";
import { ResponseClass } from "@3f/contract";
import { loadConfig } from "../config";
import { SemanticLayer } from "../semantic/semanticLayer";
import { BedrockLlmProvider } from "./bedrock.provider";
import { LLM_MESSAGES } from "./llm.constants";

test("measure filter enums use the separate comparable vocabulary while displayed measures stay scoped", async () => {
  const fixture = providerWith([toolResponse("mark_unsupported", { reason: "recorded response" })]);

  await fixture.provider.select(selectionInput());

  const request = fixture.requests[0];
  const emitSelection = request?.toolConfig?.tools[0]?.toolSpec.inputSchema.json;
  const properties = emitSelection?.properties as Record<string, Record<string, unknown>>;
  const measureFilterItems = properties.measureFilters.items as Record<string, unknown>;
  const measureFilterProperties = measureFilterItems.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(measureFilterProperties.measureId.enum, [
    "governed-financial.actual",
    "governed-financial.budget",
    "mis-statement.actual_net",
  ]);
  assert.deepEqual(measureFilterProperties.op.enum, ["gt", "gte", "lt", "lte"]);
  const compareTo = measureFilterProperties.compareTo as { oneOf: Array<Record<string, unknown>> };
  const measureOperand = compareTo.oneOf[0]?.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(measureOperand.measureId.enum, [
    "governed-financial.actual",
    "governed-financial.budget",
    "mis-statement.actual_net",
  ]);
  assert.deepEqual(properties.measureIds.items, {
    type: "string",
    enum: ["governed-financial.actual"],
  });
});

test("the selector prompt maps budget comparisons and Indian magnitudes or refuses them", async () => {
  const fixture = providerWith([toolResponse("mark_unsupported", { reason: "recorded response" })]);

  await fixture.provider.select(selectionInput());

  const request = fixture.requests[0];
  const prompt = request?.system?.map(({ text }) => text).join("\n") ?? "";
  assert.match(prompt, /over budget.*Actual.*gt.*Budget/i);
  assert.match(prompt, /under budget.*Actual.*lt.*Budget/i);
  assert.match(prompt, /over 100% of budget.*Actual.*gt.*Budget/i);
  assert.match(prompt, /5 lakh.*500000/i);
  assert.match(prompt, /1\.2 crore.*12000000/i);
  assert.match(prompt, /mark_unsupported/i);
});

test("the selector prompt gives named breakdowns precedence over the total default", async () => {
  const fixture = providerWith([toolResponse("mark_unsupported", { reason: "recorded response" })]);

  await fixture.provider.select(selectionInput());

  const prompt = fixture.requests[0]?.system?.map(({ text }) => text).join("\n") ?? "";
  for (const wording of ["by X", "per X", "for each X", "which X", "list X", "list items", "X where ..."]) {
    assert.match(prompt, new RegExp(wording.replace(/[.]/g, "\\."), "i"));
  }
  assert.match(prompt, /TOTAL with an EMPTY dimensionIds array only when the question names no breakdown/i);
});

test("the selector prompt groups item and line comparisons by the domain line dimension", async () => {
  const fixture = providerWith([toolResponse("mark_unsupported", { reason: "recorded response" })]);

  await fixture.provider.select(selectionInput());

  const prompt = fixture.requests[0]?.system?.map(({ text }) => text).join("\n") ?? "";
  assert.match(prompt, /comparison over items or lines.*selected domain's line dimension/i);
  assert.match(prompt, /gl_code in governed-financial.*leaf_key in mis-statement/i);
  assert.match(prompt, /unless the question explicitly asks for a single total/i);
});

test("recorded measure filters are parsed intact and malformed or cross-domain operands get typed reasons", async () => {
  const valid = providerWith([
    toolResponse("emit_selection", {
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
    }),
  ]);

  const result = await valid.provider.select(selectionInput());

  assert.equal(result.kind, "selection");
  if (result.kind === "selection") {
    assert.deepEqual(result.selection.measureFilters, [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ]);
  }

  const malformed = providerWith([
    toolResponse("emit_selection", {
      domain: "governed-financial",
      measureIds: ["governed-financial.actual"],
      measureFilters: [{ measureId: "governed-financial.actual", op: "gt", compareTo: { kind: "value" } }],
    }),
  ]);
  assert.deepEqual(await malformed.provider.select(selectionInput()), {
    kind: "unsupported",
    reason: LLM_MESSAGES.selectionMeasureFiltersMalformed,
  });

  const crossDomain = providerWith([
    toolResponse("emit_selection", {
      domain: "governed-financial",
      measureIds: ["governed-financial.actual"],
      measureFilters: [
        {
          measureId: "governed-financial.actual",
          op: "gt",
          compareTo: { kind: "measure", measureId: "mis-statement.actual_net" },
        },
      ],
    }),
  ]);
  assert.deepEqual(await crossDomain.provider.select(selectionInput()), {
    kind: "unsupported",
    reason: LLM_MESSAGES.selectionMeasureFilterOperandNotAllowed("mis-statement.actual_net"),
  });
});

test("the selector converse request carries an explicit max tokens cap", async () => {
  const fixture = providerWith([toolResponse("mark_unsupported", { reason: "Outside the governed vocabulary" })]);

  await fixture.provider.select(selectionInput());

  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0]?.inferenceConfig?.maxTokens, 512);
});

test("a response with no tool block retries once while a malformed input and a mark unsupported never retry", async () => {
  const retried = providerWith([
    noToolResponse(),
    toolResponse("request_clarification", { prompt: "Which metric?", options: ["Actual"] }),
  ]);
  const recovered = await retried.provider.select(selectionInput());
  assert.equal(recovered.kind, "clarify");
  assert.deepEqual(
    retried.requests.map((request) => request.inferenceConfig?.maxTokens),
    [512, 1536],
  );

  const malformed = providerWith([toolResponse(undefined, {})]);
  const malformedResult = await malformed.provider.select(selectionInput());
  assert.equal(malformedResult.kind, "unsupported");
  assert.equal(malformed.requests.length, 1);

  const unsupported = providerWith([toolResponse("mark_unsupported", { reason: "Outside the governed vocabulary" })]);
  const unsupportedResult = await unsupported.provider.select(selectionInput());
  assert.equal(unsupportedResult.kind, "unsupported");
  assert.equal(unsupported.requests.length, 1);

  const abort = new AbortController();
  const cancelled = providerWith([noToolResponse(), noToolResponse()], () => abort.abort());
  await assert.rejects(
    cancelled.provider.select(selectionInput(), abort.signal),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(cancelled.requests.length, 1);
});

test("a second response with no tool block answers backend error rather than not supported", async () => {
  const fixture = providerWith([noToolResponse(), noToolResponse()]);

  const result = await fixture.provider.select(selectionInput());

  assert.equal(result.kind, "backend_error");
  if (result.kind === "backend_error") assert.match(result.reason, /incomplete model response/i);
  assert.notEqual(result.kind, "unsupported");
  assert.equal(fixture.requests.length, 2);
});

test("a no tool block followed by a mark unsupported returns that refusal rather than masking it", async () => {
  const fixture = providerWith([
    noToolResponse(),
    toolResponse("mark_unsupported", { reason: "The requested figure is not available" }),
  ]);

  const result = await fixture.provider.select(selectionInput());

  assert.deepEqual(result, {
    kind: "unsupported",
    reason: "The requested figure is not available",
  });
  assert.equal(fixture.requests.length, 2);
});

test("a retried selector response preserves usage from both attempts", async () => {
  const fixture = providerWith([
    noToolResponse({ inputTokens: 10, outputTokens: 20, totalTokens: 30 }),
    toolResponse(
      "mark_unsupported",
      { reason: "The requested figure is not available" },
      { inputTokens: 40, outputTokens: 50, totalTokens: 90 },
    ),
  ]);

  const result = await fixture.provider.select(selectionInput());

  assert.deepEqual(result.usage, {
    model: "test-model",
    inputTokens: 50,
    outputTokens: 70,
    totalTokens: 120,
  });
});

type ConverseRequest = {
  inferenceConfig?: { temperature?: number; topP?: number; maxTokens?: number };
  system?: Array<{ text: string }>;
  toolConfig?: {
    tools: Array<{
      toolSpec: { inputSchema: { json: { properties?: Record<string, Record<string, unknown>> } } };
    }>;
  };
};

type ConverseOutput = {
  output?: { message?: { content?: Array<{ toolUse?: { name?: string; input?: unknown } }> } };
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

function providerWith(outputs: ConverseOutput[], onSend?: () => void) {
  const requests: ConverseRequest[] = [];
  class ConverseCommand {
    constructor(readonly input: ConverseRequest) {}
  }
  const provider = Object.create(BedrockLlmProvider.prototype) as BedrockLlmProvider;
  Reflect.set(provider, "cfg", {
    ...loadConfig(),
    bedrock: { region: "ap-south-1", modelId: "test-model" },
  });
  Reflect.set(provider, "ConverseCommand", ConverseCommand);
  Reflect.set(provider, "client", {
    async send(command: ConverseCommand) {
      requests.push(command.input);
      onSend?.();
      const output = outputs.shift();
      assert.ok(output, "unexpected Bedrock selector call");
      return output;
    },
  });
  return { provider, requests };
}

function selectionInput() {
  const semantic = new SemanticLayer();
  const domain = semantic.domain("governed-financial");
  const statementDomain = semantic.domain("mis-statement");
  assert.ok(domain && statementDomain);
  return {
    question: "Show Actual",
    allowedDomains: [{ ...domain, measures: domain.measures.filter(({ id }) => id === "governed-financial.actual") }],
    comparableMeasureIdsByDomain: {
      "governed-financial": ["governed-financial.actual", "governed-financial.budget"],
      "mis-statement": ["mis-statement.actual_net"],
    },
  };
}

function noToolResponse(usage?: ConverseOutput["usage"]): ConverseOutput {
  return { output: { message: { content: [{}] } }, usage };
}

function toolResponse(name: string | undefined, input: unknown, usage?: ConverseOutput["usage"]): ConverseOutput {
  return { output: { message: { content: [{ toolUse: { name, input } }] } }, usage };
}
