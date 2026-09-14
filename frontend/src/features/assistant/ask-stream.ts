import type { AskResponse, ChatStreamEvent } from "@3f/contract";

const PHASES = ["routing", "selecting", "querying", "summarizing"] as const;

export async function readAskStream(
  body: ReadableStream<Uint8Array> | null,
  onPhase: (phase: Extract<ChatStreamEvent, { type: "phase" }>["phase"]) => void,
): Promise<AskResponse> {
  if (!body) return backendError("The streamed answer ended before it completed. Try again.");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.replaceAll("\r\n", "\n").split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) continue;

      let event: ChatStreamEvent;
      try {
        event = JSON.parse(data) as ChatStreamEvent;
      } catch {
        void reader.cancel().catch(() => undefined);
        return backendError("The streamed answer could not be read. Try again.");
      }

      if (event.type === "result") {
        void reader.cancel().catch(() => undefined);
        return event.response;
      }
      if (event.type === "error") {
        void reader.cancel().catch(() => undefined);
        return {
          responseClass: event.responseClass,
          sessionId: "stream",
          message: event.message,
          viewInReport: { available: false, reason: "This answer cannot open a report." },
        };
      }
      if (event.type === "phase" && PHASES.includes(event.phase)) onPhase(event.phase);
    }

    if (done) return backendError("The streamed answer ended before it completed. Try again.");
  }
}

function backendError(message: string): AskResponse {
  return {
    responseClass: "backend_error" as AskResponse["responseClass"],
    sessionId: "stream",
    message,
    viewInReport: { available: false, reason: "This answer cannot open a report." },
  };
}
