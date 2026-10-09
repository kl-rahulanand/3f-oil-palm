import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import type { FinancialChatEvent } from "@3f/contract";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import {
  ANTHROPIC_CACHE_TTL,
  createFinancialChatEventStream,
  financialChatSdkMapping,
  financialChatTransportProtocol,
  staticCachedInstruction,
} from "./stream-adapter";

const finalEvent: FinancialChatEvent = {
  version: 1,
  eventId: "event-final",
  sequence: 1,
  conversationId: "conversation-1",
  runId: "run-1",
  type: "final",
  response: {
    version: 1,
    conversationId: "conversation-1",
    turnId: "turn-1",
    kind: "clarification",
    answer: "Choose a Plant before I query financial data.",
    confirmedScope: null,
    ui: [
      {
        component: "ClarificationCard",
        props: {
          prompt: "Which Plant?",
          missingFields: ["plant"],
          choices: [{ id: "DUB", label: "DUB", description: null }],
        },
      },
    ],
  },
};

const startedEvent: FinancialChatEvent = {
  version: 1,
  eventId: "event-started",
  sequence: 0,
  conversationId: "conversation-1",
  runId: "run-1",
  type: "run_started",
};

test("a Node 20 CommonJS stream emits contract-validated newline-delimited frames", async () => {
  assert.ok(Number(process.versions.node.split(".")[0]) >= 20);
  assert.deepEqual(financialChatTransportProtocol, {
    mediaType: "application/x-ndjson",
    commandsPath: "/api/v1/financial-conversations/:conversationId/commands",
    streamPath: "/api/v1/financial-conversations/:conversationId/stream",
    commandNames: ["start", "reply", "cancel"],
  });

  const stream = createFinancialChatEventStream(
    (async function* () {
      yield finalEvent;
    })(),
  );

  assert.ok(stream instanceof Readable);
  let wire = "";
  for await (const chunk of stream) wire += String(chunk);
  assert.deepEqual(
    wire
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line)),
    [finalEvent],
  );
});

test("the stream refuses an event outside the shared Zod frame contract", async () => {
  const stream = createFinancialChatEventStream(
    (async function* () {
      yield { ...finalEvent, unexpected: true };
    })(),
  );

  await assert.rejects(async () => {
    for await (const _chunk of stream) {
      // Consume the stream so validation errors surface at the transport boundary.
    }
  }, /unrecognized key/i);
});

test("the pinned Anthropic cache block is explicit five-minute static content", () => {
  assert.equal(ANTHROPIC_CACHE_TTL, "5m");
  assert.deepEqual(staticCachedInstruction("trusted static instruction"), {
    type: "text",
    text: "trusted static instruction",
    cache_control: { type: "ephemeral", ttl: "5m" },
  });
  assert.deepEqual(financialChatSdkMapping, {
    nodeMinimumMajor: 20,
    moduleFormat: "commonjs",
    graphPackage: "@langchain/langgraph@1.4.21",
    modelPackage: "@langchain/anthropic@1.5.12",
    corePackage: "@langchain/core@1.2.17",
    model: "claude-sonnet-5-5",
    cache: {
      placement: "explicit-static-prefix",
      ttl: "5m",
      minimumPrefixTokens: 512,
      match: "exact-prefix",
      shortPrefix: "uncached-no-padding",
    },
  });
});

test("direct Anthropic, LangGraph and strict Zod tools cross the CommonJS SDK boundary", async () => {
  let requestBody: unknown;
  const fakeVendorFetch: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        id: "message-1",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: "selection only" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 2,
          output_tokens: 1,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 50,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const selector = tool(async ({ plantId }) => ({ plantId }), {
    name: "select_plant",
    description: "Returns sanitized Plant selection metadata without financial values.",
    schema: z.object({ plantId: z.string().min(1) }).strict(),
  });
  const model = new ChatAnthropic({
    model: "claude-sonnet-5-5",
    apiKey: "test-only-key",
    maxRetries: 0,
    maxTokens: 16,
    clientOptions: { fetch: fakeVendorFetch },
  }).bindTools([selector]);

  const response = await model.invoke([
    new SystemMessage({ content: [staticCachedInstruction("trusted static instruction")] }),
    new HumanMessage("sanitized user text"),
  ]);
  assert.deepEqual(requestBody, {
    model: "claude-sonnet-5-5",
    stream: false,
    max_tokens: 16,
    messages: [{ role: "user", content: "sanitized user text" }],
    system: [staticCachedInstruction("trusted static instruction")],
    tools: [
      {
        name: "select_plant",
        description: "Returns sanitized Plant selection metadata without financial values.",
        input_schema: {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: { plantId: { type: "string", minLength: 1 } },
          required: ["plantId"],
          additionalProperties: false,
        },
      },
    ],
  });
  assert.deepEqual(response.usage_metadata?.input_token_details, { cache_creation: 100, cache_read: 50 });
  await assert.rejects(selector.invoke({ plantId: "DUB", sql: "select 1" }), /unrecognized key/i);

  const State = Annotation.Root({ selected: Annotation<string> });
  const graph = new StateGraph(State)
    .addNode("select", () => ({ selected: "DUB" }))
    .addEdge(START, "select")
    .addEdge("select", END)
    .compile();
  assert.deepEqual(await graph.invoke({ selected: "" }), { selected: "DUB" });
});

test("aborting the stream stops the backend iterator before another frame is emitted", async () => {
  const controller = new AbortController();
  let resumed = false;
  const stream = createFinancialChatEventStream(
    (async function* () {
      yield startedEvent;
      await new Promise<void>((resolve) =>
        controller.signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      resumed = true;
      yield finalEvent;
    })(),
    controller.signal,
  );
  const iterator = stream[Symbol.asyncIterator]();

  assert.equal((await iterator.next()).done, false);
  controller.abort();
  assert.equal((await iterator.next()).done, true);
  assert.equal(resumed, true);
});
