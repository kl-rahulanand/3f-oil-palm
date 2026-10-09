import { Readable } from "node:stream";

import { financialChatEventSchema } from "@3f/contract";

export const ANTHROPIC_CACHE_TTL = "5m" as const;

export const financialChatSdkMapping = {
  nodeMinimumMajor: 20,
  moduleFormat: "commonjs",
  graphPackage: "@langchain/langgraph@1.4.21",
  modelPackage: "@langchain/anthropic@1.5.12",
  corePackage: "@langchain/core@1.2.17",
  model: "claude-sonnet-5-5",
  cache: {
    placement: "explicit-static-prefix",
    ttl: ANTHROPIC_CACHE_TTL,
    minimumPrefixTokens: 512,
    match: "exact-prefix",
    shortPrefix: "uncached-no-padding",
  },
} as const;

/**
 * Crossing contract for the later controller and client: commands are POSTed,
 * while replayable events are newline-delimited JSON on the stream route.
 * LangGraph remains in-process; no Agent Server wire protocol is involved.
 */
export const financialChatTransportProtocol = {
  mediaType: "application/x-ndjson",
  commandsPath: "/api/v1/financial-conversations/:conversationId/commands",
  streamPath: "/api/v1/financial-conversations/:conversationId/stream",
  commandNames: ["start", "reply", "cancel"],
} as const;

export function staticCachedInstruction(text: string) {
  return {
    type: "text" as const,
    text,
    cache_control: { type: "ephemeral" as const, ttl: ANTHROPIC_CACHE_TTL },
  };
}

export function createFinancialChatEventStream(events: AsyncIterable<unknown>, signal?: AbortSignal): Readable {
  async function* serialize() {
    const iterator = events[Symbol.asyncIterator]();
    const aborted = Symbol("aborted");
    let resolveAbort!: () => void;
    let cleanupStarted = false;
    let sourceDone = false;
    const abort = new Promise<typeof aborted>((resolve) => {
      resolveAbort = () => resolve(aborted);
    });
    const cleanup = () => {
      if (cleanupStarted || sourceDone) return;
      cleanupStarted = true;
      try {
        const result = iterator.return?.();
        if (result) void Promise.resolve(result).catch(() => undefined);
      } catch {
        // Cancellation must not be delayed or replaced by an iterator cleanup failure.
      }
    };
    const onAbort = () => {
      resolveAbort();
      cleanup();
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      if (signal?.aborted) {
        onAbort();
        return;
      }
      while (true) {
        const candidate = signal ? await Promise.race([iterator.next(), abort]) : await iterator.next();
        if (candidate === aborted || signal?.aborted) return;
        if (candidate.done) {
          sourceDone = true;
          return;
        }
        const event = financialChatEventSchema.parse(candidate.value);
        yield `${JSON.stringify(event)}\n`;
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      cleanup();
    }
  }

  return Readable.from(serialize(), { encoding: "utf8" });
}
