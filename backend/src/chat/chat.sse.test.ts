import assert from "node:assert/strict";
import test from "node:test";
import { ResponseClass, type AskResponse, type ChatStreamEvent } from "@3f/contract";
import { CHAT_STREAM_PHASES, runChatStream, serializeSseFrame } from "./chat.sse";

const bufferedResponse: AskResponse = {
  responseClass: ResponseClass.Success,
  sessionId: "session-1",
  viewInReport: { available: false, reason: "This answer is not from the MIS statement." },
  title: "lead_count — Sales",
  provenance: {
    verified: true,
    measureIds: ["sales.lead_count"],
    measures: [],
    impliedFilters: [],
    scope: "all permitted",
    readback: "Lead count for all permitted data",
    dataAsOf: null,
    sql: "SELECT COUNT(*) AS lead_count FROM sales",
  },
};

test("streaming success emits phases then token then result", async () => {
  const events: ChatStreamEvent[] = [];

  await runChatStream(
    async (onEvent) => {
      for (const phase of CHAT_STREAM_PHASES) onEvent({ type: "phase", phase });
      onEvent({ type: "token", text: bufferedResponse.provenance!.readback });
      return bufferedResponse;
    },
    (event) => events.push(event),
  );

  assert.deepEqual(
    events.map((event) => (event.type === "phase" ? event.phase : event.type)),
    [...CHAT_STREAM_PHASES, "token", "result"],
  );
  assert.deepEqual(events.at(-1), { type: "result", response: bufferedResponse });
  assert.equal(serializeSseFrame(events[0]!), `data: ${JSON.stringify(events[0])}\n\n`);
});

test("streamed result equals the buffered AskResponse", async () => {
  const events: ChatStreamEvent[] = [];
  await runChatStream(
    async () => bufferedResponse,
    (event) => events.push(event),
  );
  assert.deepEqual(events, [{ type: "result", response: bufferedResponse }]);
});

test("typed and thrown failures emit an error event", async () => {
  const typedEvents: ChatStreamEvent[] = [];
  await runChatStream(
    async () => ({
      responseClass: ResponseClass.ExecutionFailed,
      sessionId: "session-1",
      viewInReport: { available: false, reason: "The query failed." },
      message: "Query timed out",
    }),
    (event) => typedEvents.push(event),
  );
  assert.deepEqual(typedEvents, [
    {
      type: "error",
      message: "Query timed out",
      responseClass: ResponseClass.ExecutionFailed,
    },
  ]);

  const thrownEvents: ChatStreamEvent[] = [];
  await runChatStream(
    async () => {
      throw new Error("Warehouse unavailable");
    },
    (event) => thrownEvents.push(event),
  );
  assert.deepEqual(thrownEvents, [
    {
      type: "error",
      message: "Warehouse unavailable",
      responseClass: ResponseClass.BackendError,
    },
  ]);
});
