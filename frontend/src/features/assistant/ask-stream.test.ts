import type { AskResponse, ChatStreamEvent } from "@3f/contract";
import { expect, test, vi } from "vitest";
import { readAskStream } from "./ask-stream";

const result: AskResponse = {
  responseClass: "informational" as AskResponse["responseClass"],
  sessionId: "session",
  title: "Actual",
  definition: "The governed actual amount.",
  viewInReport: { available: false, reason: "Definitions do not open a report." },
};

function frame(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function stream(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

function cancellableStream(cancel: () => Promise<void>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(frame({ type: "result", response: result }));
    },
    cancel,
  });
}

test("an sse frame split across chunks and several frames in one chunk both parse", async () => {
  const phase = frame({ type: "phase", phase: "routing" });
  const combined = new Uint8Array([
    ...frame({ type: "phase", phase: "selecting" }),
    ...frame({ type: "result", response: result }),
  ]);
  const onPhase = vi.fn();

  await expect(readAskStream(stream(phase.slice(0, 8), phase.slice(8), combined), onPhase)).resolves.toEqual(result);
  expect(onPhase.mock.calls).toEqual([["routing"], ["selecting"]]);
});

test("a malformed frame and an eof without a terminal event resolve as a backend error instead of hanging", async () => {
  const malformed = new TextEncoder().encode("data: {not-json}\n\n");

  await expect(readAskStream(stream(malformed), vi.fn())).resolves.toMatchObject({
    responseClass: "backend_error",
    message: "The streamed answer could not be read. Try again.",
  });
  await expect(readAskStream(stream(frame({ type: "phase", phase: "routing" })), vi.fn())).resolves.toMatchObject({
    responseClass: "backend_error",
    message: "The streamed answer ended before it completed. Try again.",
  });
  await expect(
    readAskStream(
      stream(
        frame({
          type: "error",
          responseClass: "execution_failed" as AskResponse["responseClass"],
          message: "Query failed",
        }),
      ),
      vi.fn(),
    ),
  ).resolves.toMatchObject({
    responseClass: "execution_failed",
    sessionId: "stream",
    message: "Query failed",
    viewInReport: { available: false },
  });
});

test("a multi byte character split across chunks parses and no phase renders after the terminal frame", async () => {
  const response = { ...result, definition: "₹ governed actual" };
  const bytes = new Uint8Array([
    ...frame({ type: "result", response }),
    ...frame({ type: "phase", phase: "summarizing" }),
  ]);
  const rupeeStart = bytes.findIndex((byte) => byte === 0xe2);
  const onPhase = vi.fn();

  await expect(
    readAskStream(stream(bytes.slice(0, rupeeStart + 1), bytes.slice(rupeeStart + 1)), onPhase),
  ).resolves.toEqual(response);
  expect(onPhase).not.toHaveBeenCalled();
});

test("a terminal answer resolves without waiting for stream cancellation", async () => {
  let finishCancellation!: () => void;
  const slowCancellation = new Promise<void>((resolve) => {
    finishCancellation = resolve;
  });
  const blocked = Symbol("blocked by cancellation");

  await expect(
    Promise.race([
      readAskStream(
        cancellableStream(() => slowCancellation),
        vi.fn(),
      ),
      new Promise<typeof blocked>((resolve) => setTimeout(() => resolve(blocked), 0)),
    ]),
  ).resolves.toEqual(result);
  finishCancellation();

  await expect(
    readAskStream(
      cancellableStream(() => Promise.reject(new Error("cancel failed"))),
      vi.fn(),
    ),
  ).resolves.toEqual(result);
});
