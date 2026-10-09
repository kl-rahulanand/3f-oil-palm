import { financialChatEventSchema, type FinancialChatEvent } from "@3f/contract";

const MEDIA_TYPE = "application/x-ndjson";

export type FinancialChatCommand =
  | { type: "start"; commandId: string; question: string }
  | { type: "reply"; commandId: string; pendingTurnId: string; text: string }
  | { type: "cancel"; commandId: string; runId: string };

function conversationPath(conversationId: string) {
  return `/api/v1/financial-conversations/${encodeURIComponent(conversationId)}`;
}

function abortError() {
  return new DOMException("The financial chat request was cancelled.", "AbortError");
}

export async function readFinancialChatEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: FinancialChatEvent) => void,
  signal?: AbortSignal,
  deliveredEventIds = new Set<string>(),
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let rejectAbort: ((reason: DOMException) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const cancel = () => {
    rejectAbort?.(abortError());
    void reader.cancel();
  };

  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) throw abortError();

    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      buffered += decoder.decode(value, { stream: !done });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      if (done && buffered.trim()) lines.push(buffered);

      for (const line of lines) {
        if (!line.trim()) continue;
        let candidate: unknown;
        try {
          candidate = JSON.parse(line);
        } catch {
          throw new Error("Invalid financial chat stream frame.");
        }
        const parsed = financialChatEventSchema.safeParse(candidate);
        if (!parsed.success) throw new Error("Invalid financial chat stream frame.");
        if (deliveredEventIds.has(parsed.data.eventId)) continue;
        deliveredEventIds.add(parsed.data.eventId);
        onEvent(parsed.data);
      }

      if (done) return;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

export async function sendFinancialChatCommand(
  conversationId: string,
  command: FinancialChatCommand,
  csrfToken: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${conversationPath(conversationId)}/commands`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify(command),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error("The financial chat command could not be sent.");
}

export async function subscribeToFinancialChat(
  conversationId: string,
  after: number | null,
  onEvent: (event: FinancialChatEvent) => void,
  signal?: AbortSignal,
  deliveredEventIds?: Set<string>,
): Promise<void> {
  const cursor = after === null ? "" : `?after=${after}`;
  const response = await fetch(`${conversationPath(conversationId)}/stream${cursor}`, {
    method: "GET",
    credentials: "include",
    headers: { accept: MEDIA_TYPE },
    signal,
  });
  if (!response.ok || !response.body) throw new Error("The financial chat stream could not be opened.");
  await readFinancialChatEventStream(response.body, onEvent, signal, deliveredEventIds);
}
