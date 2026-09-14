import assert from "node:assert/strict";
import { test } from "node:test";
import { ResponseClass } from "@3f/contract";
import { loadConfig } from "../config";
import { SemanticLayer } from "../semantic/semanticLayer";
import { BedrockLlmProvider } from "./bedrock.provider";

test("the selector converse request carries an explicit max tokens cap", async () => {
  const fixture = providerWith([toolResponse("mark_unsupported", { reason: "Outside the governed vocabulary" })]);

  await fixture.provider.select(selectionInput());

  assert.equal(fixture.requests.length, 1);
  assert.equal(fixture.requests[0]?.inferenceConfig?.maxTokens, 2048);
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
    [2048, 4096],
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

type ConverseRequest = {
  inferenceConfig?: { temperature?: number; topP?: number; maxTokens?: number };
};

type ConverseOutput = {
  output?: { message?: { content?: Array<{ toolUse?: { name?: string; input?: unknown } }> } };
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
  const domain = new SemanticLayer().domain("governed-financial");
  assert.ok(domain);
  return { question: "Show Actual", allowedDomains: [domain] };
}

function noToolResponse(): ConverseOutput {
  return { output: { message: { content: [{}] } } };
}

function toolResponse(name: string | undefined, input: unknown): ConverseOutput {
  return { output: { message: { content: [{ toolUse: { name, input } }] } } };
}
