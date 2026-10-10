import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { financialDimensionIdSchema, financialSelectionSchema, type FinancialSelection } from "@3f/contract";

import type { FinancialChatModelSettings } from "../config";
import { FINANCIAL_CHAT_TOOLS } from "./financial-chat.tools";
import { ANTHROPIC_CACHE_TTL, staticCachedInstruction } from "./stream-adapter";

const MAX_QUESTION_LENGTH = 2_000;
const MAX_VOCABULARY_ITEMS = 200;
const MAX_METADATA_LENGTH = 200;

const INSTRUCTION_MODULES = [
  "For factual comparisons, select governed measures and dimensions only. Never calculate or invent financial values.",
  "For monthly trends, resolve explicit calendar periods and select metadata only. Never infer causes or forecasts.",
  "For clarification, leave missing or ambiguous Plant, period, measure, or component unresolved and request clarification.",
  "For transaction requests, select only server-issued opaque references. Never author SQL, joins, code, or filters.",
] as const;

const CORE_INSTRUCTION =
  "You select questions for the governed financial chat. Return tool calls only. Authorization, calculations, results, and transaction data remain server-side.";

const pendingSelectionSchema = financialSelectionSchema.innerType().partial().strict();

type StaticInstructionBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral"; ttl: typeof ANTHROPIC_CACHE_TTL };
};

export interface FinancialSelectorVocabularyItem {
  dimensionId: string;
  value: string;
  label: string;
}

export interface FinancialSelectorRequest {
  userText: string;
  confirmedSelection: FinancialSelection | null;
  pendingSelection: Partial<FinancialSelection> | null;
  permittedVocabulary: readonly FinancialSelectorVocabularyItem[];
  serverContext?: unknown;
}

export interface FinancialSelectorToolCall {
  name: (typeof FINANCIAL_CHAT_TOOLS)[number]["name"];
  input: unknown;
}

export interface FinancialSelectorUsage {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface FinancialSelectorVendorResponse {
  toolCalls: Array<{ name: string; input: unknown }>;
  usage?: FinancialSelectorUsage;
}

export interface FinancialSelectorInvocation {
  staticPrefixBytes: string;
  staticInstructions: readonly StaticInstructionBlock[];
  dynamicContext: string;
  tools: typeof FINANCIAL_CHAT_TOOLS;
  signal?: AbortSignal;
}

export interface FinancialSelectorClient {
  invoke(invocation: FinancialSelectorInvocation): Promise<FinancialSelectorVendorResponse>;
}

export interface FinancialSelectorTelemetry {
  event: "financial_selector_model_call";
  attempts: number;
  durationMs: number;
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheStatus: "hit" | "write" | "miss" | "unavailable";
}

type SafeOperationalEvent = {
  event: "financial_selector_attempt";
  attempt: number;
  outcome: "success" | "retry" | "failure";
  errorCode?: FinancialSelectorVendorErrorCode;
};

export type FinancialSelectorVendorErrorCode =
  | "FINANCIAL_MODEL_TIMEOUT"
  | "FINANCIAL_MODEL_RATE_LIMIT"
  | "FINANCIAL_MODEL_UNAVAILABLE"
  | "FINANCIAL_MODEL_INVALID_RESPONSE"
  | "FINANCIAL_MODEL_CANCELLED";

export class FinancialSelectorVendorError extends Error {
  constructor(
    readonly code: FinancialSelectorVendorErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FinancialSelectorVendorError";
  }
}

export interface FinancialSelectorProviderOptions {
  client?: FinancialSelectorClient;
  trace?: (event: SafeOperationalEvent) => void;
  log?: (event: SafeOperationalEvent) => void;
  recordTelemetry?: (event: FinancialSelectorTelemetry) => void;
  now?: () => number;
}

export interface FinancialSelectorResult {
  toolCalls: FinancialSelectorToolCall[];
  cache: { status: FinancialSelectorTelemetry["cacheStatus"] };
}

class AnthropicFinancialSelectorClient implements FinancialSelectorClient {
  private readonly model: ChatAnthropic;

  constructor(settings: FinancialChatModelSettings) {
    this.model = new ChatAnthropic({
      model: settings.modelId,
      apiKey: settings.apiKey,
      maxRetries: 0,
      clientOptions: { timeout: settings.timeoutMs },
      maxTokens: 2_048,
      streaming: false,
    });
  }

  async invoke(invocation: FinancialSelectorInvocation): Promise<FinancialSelectorVendorResponse> {
    const tools = invocation.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.modelSchema,
    }));
    const response = await this.model.invoke(
      [new SystemMessage({ content: [...invocation.staticInstructions] }), new HumanMessage(invocation.dynamicContext)],
      { tools, strict: true, signal: invocation.signal },
    );
    const inputDetails = response.usage_metadata?.input_token_details;
    return {
      toolCalls: (response.tool_calls ?? []).map(({ name, args }) => ({ name, input: args })),
      usage: response.usage_metadata
        ? {
            inputTokens: response.usage_metadata.input_tokens,
            cacheCreationInputTokens: inputDetails?.cache_creation ?? 0,
            cacheReadInputTokens: inputDetails?.cache_read ?? 0,
          }
        : undefined,
    };
  }
}

function staticPrefix(): {
  bytes: string;
  instructions: readonly StaticInstructionBlock[];
} {
  const instructions: StaticInstructionBlock[] = [
    { type: "text", text: CORE_INSTRUCTION },
    ...INSTRUCTION_MODULES.slice(0, -1).map((text) => ({ type: "text" as const, text })),
    staticCachedInstruction(INSTRUCTION_MODULES.at(-1) ?? ""),
  ];
  const toolSchemas = FINANCIAL_CHAT_TOOLS.map(({ name, description, staticInputSchema }) => ({
    name,
    description,
    input_schema: staticInputSchema,
  }));
  return { bytes: JSON.stringify({ tools: toolSchemas, instructions }), instructions };
}

function boundedText(value: string, field: string, maximum = MAX_METADATA_LENGTH): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw invalidResponse(`${field} is invalid`);
  return normalized;
}

function permittedKey(dimensionId: string, value: string): string {
  return `${dimensionId}\u0000${value}`;
}

function assertCurrentlyPermitted(
  selection: Pick<FinancialSelection, "plantIds" | "filters"> | Partial<FinancialSelection>,
  permittedValues: ReadonlySet<string>,
): void {
  for (const plantId of selection.plantIds ?? []) {
    if (!permittedValues.has(permittedKey("plant", plantId))) throw invalidResponse("retained Plant is not permitted");
  }
  for (const filter of selection.filters ?? []) {
    const values = filter.operator === "in" ? filter.values : [filter.value];
    if (values.some((value) => !permittedValues.has(permittedKey(filter.dimensionId, value)))) {
      throw invalidResponse("retained filter value is not permitted");
    }
  }
}

function dynamicContext(request: FinancialSelectorRequest): string {
  const userText = boundedText(request.userText, "userText", MAX_QUESTION_LENGTH);
  if (request.permittedVocabulary.length > MAX_VOCABULARY_ITEMS) {
    throw invalidResponse("permittedVocabulary is too large");
  }
  const permittedVocabulary = request.permittedVocabulary.map(({ dimensionId, value, label }) => {
    const parsedDimension = financialDimensionIdSchema.safeParse(dimensionId);
    if (!parsedDimension.success) throw invalidResponse("dimensionId is invalid");
    return {
      dimensionId: parsedDimension.data,
      value: boundedText(value, "value"),
      label: boundedText(label, "label"),
    };
  });
  const permittedValues = new Set(
    permittedVocabulary.map(({ dimensionId, value }) => permittedKey(dimensionId, value)),
  );
  const confirmedParse = request.confirmedSelection
    ? financialSelectionSchema.safeParse(request.confirmedSelection)
    : null;
  if (confirmedParse && !confirmedParse.success) throw invalidResponse("confirmed selection is invalid");
  const confirmedSelection = confirmedParse?.data ?? null;
  const pendingParse = request.pendingSelection ? pendingSelectionSchema.safeParse(request.pendingSelection) : null;
  if (pendingParse && !pendingParse.success) throw invalidResponse("pending selection is invalid");
  const pendingSelection = pendingParse?.data ?? null;
  if (confirmedSelection) assertCurrentlyPermitted(confirmedSelection, permittedValues);
  if (pendingSelection) assertCurrentlyPermitted(pendingSelection, permittedValues);
  return JSON.stringify({
    userText,
    confirmedSelection,
    pendingSelection,
    permittedVocabulary,
  });
}

function invalidResponse(reason: string): FinancialSelectorVendorError {
  return new FinancialSelectorVendorError(
    "FINANCIAL_MODEL_INVALID_RESPONSE",
    "The financial question selector returned an invalid response. Please rephrase your question.",
    { cause: reason },
  );
}

function vendorErrorName(error: unknown): string {
  return error instanceof Error ? error.constructor.name : "";
}

function vendorStatus(error: unknown): number | null {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : null;
}

function errorCode(error: unknown, aborted = false): FinancialSelectorVendorErrorCode {
  if (error instanceof FinancialSelectorVendorError) return error.code;
  const name = vendorErrorName(error);
  if (aborted || (error instanceof Error && error.name === "AbortError") || name === "APIUserAbortError")
    return "FINANCIAL_MODEL_CANCELLED";
  if ((error instanceof Error && error.name === "TimeoutError") || name === "APIConnectionTimeoutError")
    return "FINANCIAL_MODEL_TIMEOUT";
  if (vendorStatus(error) === 429) return "FINANCIAL_MODEL_RATE_LIMIT";
  return "FINANCIAL_MODEL_UNAVAILABLE";
}

function safeError(error: unknown, aborted = false): FinancialSelectorVendorError {
  const code = errorCode(error, aborted);
  const messages: Record<FinancialSelectorVendorErrorCode, string> = {
    FINANCIAL_MODEL_TIMEOUT: "The financial question selector timed out. Please try again.",
    FINANCIAL_MODEL_RATE_LIMIT: "The financial question selector is busy. Please try again shortly.",
    FINANCIAL_MODEL_UNAVAILABLE: "The financial question selector is unavailable. Please try again.",
    FINANCIAL_MODEL_INVALID_RESPONSE:
      "The financial question selector returned an invalid response. Please rephrase your question.",
    FINANCIAL_MODEL_CANCELLED: "The financial question selection was cancelled.",
  };
  return error instanceof FinancialSelectorVendorError ? error : new FinancialSelectorVendorError(code, messages[code]);
}

function shouldRetry(error: unknown, aborted = false): boolean {
  if (error instanceof FinancialSelectorVendorError) return false;
  if (
    aborted ||
    (error instanceof Error && error.name === "AbortError") ||
    vendorErrorName(error) === "APIUserAbortError"
  )
    return false;
  if (
    (error instanceof Error && error.name === "TimeoutError") ||
    ["APIConnectionError", "APIConnectionTimeoutError"].includes(vendorErrorName(error))
  )
    return true;
  const status = vendorStatus(error);
  return status === 408 || status === 429 || (status !== null && status >= 500);
}

function validateToolCalls(response: FinancialSelectorVendorResponse): FinancialSelectorToolCall[] {
  if (
    typeof response !== "object" ||
    response === null ||
    !("toolCalls" in response) ||
    !Array.isArray(response.toolCalls) ||
    response.toolCalls.length === 0
  )
    throw invalidResponse("tool call missing");
  return response.toolCalls.map((call) => {
    if (
      typeof call !== "object" ||
      call === null ||
      !("name" in call) ||
      typeof call.name !== "string" ||
      !("input" in call)
    )
      throw invalidResponse("tool call malformed");
    const { name, input } = call;
    const tool = FINANCIAL_CHAT_TOOLS.find((candidate) => candidate.name === name);
    if (!tool) throw invalidResponse("unknown tool");
    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) throw invalidResponse("tool input invalid");
    return { name: tool.name, input: parsed.data };
  });
}

function cacheStatus(usage?: FinancialSelectorUsage): FinancialSelectorTelemetry["cacheStatus"] {
  if (!usage) return "unavailable";
  if (usage.cacheReadInputTokens > 0) return "hit";
  if (usage.cacheCreationInputTokens > 0) return "write";
  return "miss";
}

export class FinancialSelectorProvider {
  private readonly client: FinancialSelectorClient;
  private readonly prefix = staticPrefix();
  private readonly now: () => number;

  constructor(
    private readonly settings: FinancialChatModelSettings,
    private readonly options: FinancialSelectorProviderOptions = {},
  ) {
    this.client = options.client ?? new AnthropicFinancialSelectorClient(settings);
    this.now = options.now ?? Date.now;
  }

  async select(request: FinancialSelectorRequest, signal?: AbortSignal): Promise<FinancialSelectorResult> {
    const startedAt = this.now();
    const invocation: FinancialSelectorInvocation = {
      staticPrefixBytes: this.prefix.bytes,
      staticInstructions: this.prefix.instructions,
      dynamicContext: dynamicContext(request),
      tools: FINANCIAL_CHAT_TOOLS,
      signal,
    };
    let attempts = 0;
    let response: FinancialSelectorVendorResponse;
    let toolCalls: FinancialSelectorToolCall[] = [];
    while (true) {
      attempts += 1;
      try {
        response = await this.client.invoke(invocation);
        toolCalls = validateToolCalls(response);
        this.recordAttempt({ event: "financial_selector_attempt", attempt: attempts, outcome: "success" });
        break;
      } catch (error) {
        const retry = attempts <= this.settings.maxRetries && shouldRetry(error, signal?.aborted);
        const code = errorCode(error, signal?.aborted);
        this.recordAttempt({
          event: "financial_selector_attempt",
          attempt: attempts,
          outcome: retry ? "retry" : "failure",
          errorCode: code,
        });
        if (!retry) {
          this.options.recordTelemetry?.({
            event: "financial_selector_model_call",
            attempts,
            durationMs: Math.max(0, this.now() - startedAt),
            inputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            cacheStatus: "unavailable",
          });
          throw safeError(error, signal?.aborted);
        }
      }
    }

    const usage = response.usage;
    const status = cacheStatus(usage);
    this.options.recordTelemetry?.({
      event: "financial_selector_model_call",
      attempts,
      durationMs: Math.max(0, this.now() - startedAt),
      inputTokens: usage?.inputTokens ?? 0,
      cacheCreationInputTokens: usage?.cacheCreationInputTokens ?? 0,
      cacheReadInputTokens: usage?.cacheReadInputTokens ?? 0,
      cacheStatus: status,
    });
    return { toolCalls, cache: { status } };
  }

  private recordAttempt(event: SafeOperationalEvent): void {
    this.options.trace?.(event);
    this.options.log?.(event);
  }
}
