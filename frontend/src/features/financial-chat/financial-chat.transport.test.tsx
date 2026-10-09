import type { FinancialChatEvent } from "@3f/contract";
import { render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { expect, test, vi } from "vitest";

import {
  readFinancialChatEventStream,
  sendFinancialChatCommand,
  subscribeToFinancialChat,
} from "./financial-chat.transport";

const startedEvent: FinancialChatEvent = {
  version: 1,
  eventId: "event-started",
  sequence: 0,
  conversationId: "conversation-1",
  runId: "run-1",
  type: "run_started",
};

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
    kind: "answer",
    answer: "Synthetic test data has no loaded Actual for April 2026.",
    scope: {
      measureIds: ["actual"],
      dimensionIds: ["month"],
      plantIds: ["DUB"],
      timeWindow: { kind: "range", from: "2026-04-01", to: "2026-04-30" },
      filters: [],
    },
    dataSource: { kind: "synthetic", label: "Synthetic test data" },
    results: {
      "result-1": {
        resultId: "result-1",
        selection: {
          measureIds: ["actual"],
          dimensionIds: ["month"],
          plantIds: ["DUB"],
          timeWindow: { kind: "range", from: "2026-04-01", to: "2026-04-30" },
          filters: [],
        },
        scope: { plantIds: ["DUB"], from: "2026-04-01", to: "2026-04-30" },
        rows: [],
        totals: {
          actual: { state: "not_loaded", value: null, label: "Actual data not loaded", drilldownId: null },
        },
        coverage: [{ plantId: "DUB", month: "2026-04-01", actual: "not_loaded", budget: "not_loaded" }],
      },
    },
    monthlyDeltas: [],
    ui: [
      {
        component: "FinancialTotal",
        props: { resultId: "result-1", title: "Synthetic Actual", rowKey: null, valueKey: "actual" },
      },
    ],
    details: {},
  },
};

function bytes(value: string) {
  return new TextEncoder().encode(value);
}

function chunkedStream(chunks: Uint8Array[], onCancel = () => undefined) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
    cancel: onCancel,
  });
}

function FrameView({ body }: { body: ReadableStream<Uint8Array> }) {
  const [answer, setAnswer] = useState("waiting");
  useEffect(() => {
    void readFinancialChatEventStream(body, (event) => {
      if (event.type !== "final" || event.response.kind !== "answer") return;
      const block = event.response.ui[0];
      if (block.component !== "FinancialTotal") return;
      const value = event.response.results[block.props.resultId].totals[block.props.valueKey];
      if (value && "label" in value) setAnswer(`${block.props.title}: ${value.label}`);
    });
  }, [body]);
  return <output>{answer}</output>;
}

test("split real frames cross the native ReadableStream and render a synthetic FinancialTotal once in React 19", async () => {
  const first = `${JSON.stringify(startedEvent)}\n`;
  const final = `${JSON.stringify(finalEvent)}\n`;
  const wire = bytes(first + first + final);
  const splitInsideRupeeSafeJson = first.length + 7;

  render(
    <FrameView body={chunkedStream([wire.slice(0, splitInsideRupeeSafeJson), wire.slice(splitInsideRupeeSafeJson)])} />,
  );

  expect(await screen.findByText("Synthetic Actual: Actual data not loaded")).toBeInTheDocument();
  expect(screen.getAllByText("Synthetic Actual: Actual data not loaded")).toHaveLength(1);
});

test("unknown frames fail shared Zod validation before they reach a renderer", async () => {
  const cancelled = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes('{"version":1,"type":"unknown"}\n'));
    },
    cancel: cancelled,
  });
  await expect(readFinancialChatEventStream(body, vi.fn())).rejects.toThrow(/financial chat stream frame/i);
  expect(cancelled).toHaveBeenCalledOnce();
});

test("a reconnect reuses replay identity so repeated frames do not duplicate UI", async () => {
  const delivered: FinancialChatEvent[] = [];
  const deliveredEventIds = new Set<string>();
  await readFinancialChatEventStream(
    chunkedStream([bytes(`${JSON.stringify(startedEvent)}\n`)]),
    (event) => delivered.push(event),
    undefined,
    deliveredEventIds,
  );
  await readFinancialChatEventStream(
    chunkedStream([
      bytes(`${JSON.stringify(startedEvent)}\n${JSON.stringify(finalEvent)}\n${JSON.stringify(finalEvent)}\n`),
    ]),
    (event) => delivered.push(event),
    undefined,
    deliveredEventIds,
  );

  expect(delivered).toEqual([startedEvent, finalEvent]);
});

test("abort cancels the native reader and prevents later frame delivery", async () => {
  const cancelled = vi.fn();
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      controller.enqueue(bytes(`${JSON.stringify(startedEvent)}\n`));
    },
    cancel: cancelled,
  });
  const abort = new AbortController();
  const delivered = vi.fn();
  const reading = readFinancialChatEventStream(body, delivered, abort.signal);

  await vi.waitFor(() => expect(delivered).toHaveBeenCalledTimes(1));
  abort.abort();
  await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  expect(cancelled).toHaveBeenCalledOnce();
  expect(() => streamController.enqueue(bytes(`${JSON.stringify(finalEvent)}\n`))).toThrow();
});

test("commands and subscriptions use credentialed native fetch with the pinned routes", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(new Response(chunkedStream([bytes(`${JSON.stringify(finalEvent)}\n`)]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await sendFinancialChatCommand(
    "conversation/1",
    { type: "start", commandId: "command-1", question: "Actual for DUB in April 2026" },
    "fresh-csrf",
  );
  await sendFinancialChatCommand(
    "conversation/1",
    { type: "reply", commandId: "command-2", pendingTurnId: "turn-pending", text: "DUB" },
    "fresh-csrf-2",
  );
  await sendFinancialChatCommand(
    "conversation/1",
    { type: "cancel", commandId: "command-3", runId: "run-1" },
    "fresh-csrf-3",
  );
  const received: FinancialChatEvent[] = [];
  await subscribeToFinancialChat("conversation/1", 17, (event) => received.push(event));

  expect(fetchMock.mock.calls.map(([input, init]) => [String(input), init])).toEqual([
    [
      "/api/v1/financial-conversations/conversation%2F1/commands",
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": "fresh-csrf" },
        body: JSON.stringify({ type: "start", commandId: "command-1", question: "Actual for DUB in April 2026" }),
      },
    ],
    [
      "/api/v1/financial-conversations/conversation%2F1/commands",
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": "fresh-csrf-2" },
        body: JSON.stringify({
          type: "reply",
          commandId: "command-2",
          pendingTurnId: "turn-pending",
          text: "DUB",
        }),
      },
    ],
    [
      "/api/v1/financial-conversations/conversation%2F1/commands",
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": "fresh-csrf-3" },
        body: JSON.stringify({ type: "cancel", commandId: "command-3", runId: "run-1" }),
      },
    ],
    [
      "/api/v1/financial-conversations/conversation%2F1/stream?after=17",
      { method: "GET", credentials: "include", headers: { accept: "application/x-ndjson" }, signal: undefined },
    ],
  ]);
  expect(received).toEqual([finalEvent]);
});
