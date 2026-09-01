import { ResponseClass, type AskResponse, type ChatStreamEvent } from "@pulse/contract";

type EventSink = (event: ChatStreamEvent) => void;

export const CHAT_STREAM_PHASES = ["routing", "selecting", "querying", "summarizing"] as const;

export function serializeSseFrame(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function runChatStream(
  ask: (onEvent: EventSink) => Promise<AskResponse>,
  emit: EventSink,
): Promise<void> {
  try {
    const response = await ask(emit);
    if (isTypedFailure(response)) {
      emit({
        type: "error",
        message: response.message ?? "The chat request failed.",
        responseClass: response.responseClass,
      });
      return;
    }
    emit({ type: "result", response });
  } catch (error) {
    emit({
      type: "error",
      message: error instanceof Error ? error.message : "The chat request failed.",
      responseClass: ResponseClass.BackendError,
    });
  }
}

function isTypedFailure(
  response: AskResponse,
): response is AskResponse & {
  responseClass: ResponseClass.ExecutionFailed | ResponseClass.BackendError;
} {
  return (
    response.responseClass === ResponseClass.ExecutionFailed ||
    response.responseClass === ResponseClass.BackendError
  );
}
