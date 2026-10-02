import { Injectable } from "@nestjs/common";
import type { DomainSpec, MeasureFilter, Selection, SelectionFilter, TimeGrain } from "@3f/contract";
import { loadConfig, type Config } from "../config";
import type { LlmProvider, LlmSelectionInput, LlmSelectionResult } from "./llm.interface";
import { LLM_MESSAGES, LLM_SELECTOR_MAX_TOKENS, LLM_SELECTOR_RETRY_MAX_TOKENS } from "./llm.constants";

type JsonSchema = Record<string, unknown>;

export interface BedrockSelectionVocabulary {
  domains: Array<{
    name: string;
    label: string;
    measures: Array<{ id: string; label: string; synonyms?: string[] }>;
    dimensions: Array<{ id: string; label: string }>;
  }>;
}

export interface BedrockSelectionToolSpec {
  vocabulary: BedrockSelectionVocabulary;
  toolConfig: {
    tools: Array<{
      toolSpec: {
        name: string;
        description: string;
        inputSchema: { json: JsonSchema };
      };
    }>;
    toolChoice: { any: Record<string, never> };
  };
}

export interface BedrockToolUseLike {
  name?: string;
  input?: unknown;
}

interface BedrockRuntimeModule {
  BedrockRuntimeClient: new (config: BedrockClientConfig) => BedrockClientLike;
  ConverseCommand: new (input: BedrockConverseInput) => unknown;
}

interface BedrockClientConfig {
  region: string;
  token?: { token: string };
}

interface BedrockClientLike {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<BedrockConverseOutput>;
}

interface BedrockConverseInput {
  modelId: string;
  system: Array<{ text: string }>;
  messages: Array<{ role: "user"; content: Array<{ text: string }> }>;
  toolConfig: BedrockSelectionToolSpec["toolConfig"];
  inferenceConfig?: { temperature?: number; topP?: number; maxTokens?: number };
}

interface BedrockConverseOutput {
  output?: {
    message?: {
      content?: Array<{ toolUse?: BedrockToolUseLike }>;
    };
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export function buildBedrockSelectionToolSpec(
  allowedDomains: DomainSpec[],
  comparableMeasureIdsByDomain: Record<string, string[]>,
): BedrockSelectionToolSpec {
  const vocabulary: BedrockSelectionVocabulary = {
    domains: allowedDomains.map((domain) => ({
      name: domain.name,
      label: domain.label,
      measures: domain.measures.map((measure) => ({
        id: measure.id,
        label: measure.label,
        ...(measure.synonyms?.length ? { synonyms: measure.synonyms } : {}),
      })),
      dimensions: domain.dimensions.map((dimension) => ({
        id: dimension.id,
        label: dimension.label,
      })),
    })),
  };

  const domainNames = allowedDomains.map((domain) => domain.name);
  const measureIds = [...new Set(allowedDomains.flatMap((domain) => domain.measures.map((m) => m.id)))];
  const comparableMeasureIds = [...new Set(Object.values(comparableMeasureIdsByDomain).flat())];
  const dimensionIds = [...new Set(allowedDomains.flatMap((domain) => domain.dimensions.map((d) => d.id)))];

  const filterSchema: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["dimensionId", "op", "value"],
    properties: {
      dimensionId: { type: "string", enum: dimensionIds },
      op: { type: "string", enum: ["eq", "in", "neq"] },
      value: {
        anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
      },
    },
  };
  const measureFilterSchema: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["measureId", "op", "compareTo"],
    properties: {
      measureId: { type: "string", enum: comparableMeasureIds },
      op: { type: "string", enum: ["gt", "gte", "lt", "lte"] },
      compareTo: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "measureId"],
            properties: {
              kind: { type: "string", enum: ["measure"] },
              measureId: { type: "string", enum: comparableMeasureIds },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "value"],
            properties: {
              kind: { type: "string", enum: ["value"] },
              value: { type: "string" },
            },
          },
        ],
      },
    },
  };

  return {
    vocabulary,
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: "emit_selection",
            description: LLM_MESSAGES.emitSelectionDescription,
            inputSchema: {
              json: {
                type: "object",
                additionalProperties: false,
                required: ["domain", "measureIds", "dimensionIds"],
                properties: {
                  domain: { type: "string", enum: domainNames },
                  measureIds: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string", enum: measureIds },
                  },
                  dimensionIds: {
                    type: "array",
                    items: { type: "string", enum: dimensionIds },
                  },
                  filters: {
                    type: "array",
                    items: filterSchema,
                  },
                  measureFilters: {
                    type: "array",
                    items: measureFilterSchema,
                  },
                  timeWindow: {
                    type: "object",
                    additionalProperties: false,
                    required: ["grain"],
                    properties: {
                      grain: { type: "string", enum: ["day", "week", "month"] },
                      last: { type: "number" },
                      from: { type: "string" },
                      to: { type: "string" },
                    },
                  },
                  limit: { type: "number" },
                },
              },
            },
          },
        },
        {
          toolSpec: {
            name: "request_clarification",
            description: LLM_MESSAGES.requestClarificationDescription,
            inputSchema: {
              json: {
                type: "object",
                additionalProperties: false,
                required: ["prompt", "options"],
                properties: {
                  prompt: { type: "string" },
                  options: {
                    type: "array",
                    maxItems: 4,
                    items: { type: "string" },
                  },
                  defaultOption: { type: "string" },
                },
              },
            },
          },
        },
        {
          toolSpec: {
            name: "mark_unsupported",
            description: LLM_MESSAGES.markUnsupportedDescription,
            inputSchema: {
              json: {
                type: "object",
                additionalProperties: false,
                required: ["reason"],
                properties: {
                  reason: { type: "string" },
                },
              },
            },
          },
        },
      ],
      toolChoice: { any: {} },
    },
  };
}

export function buildBedrockSelectionSystemPrompt(
  input: LlmSelectionInput,
  vocabulary: BedrockSelectionVocabulary,
  dateIso = new Date().toISOString().slice(0, 10),
): string {
  const conversationContext = input.priorTurns?.length
    ? LLM_MESSAGES.conversationContext(JSON.stringify(input.priorTurns))
    : "";
  return [
    LLM_MESSAGES.systemPromptToday(dateIso),
    LLM_MESSAGES.systemPromptBank,
    LLM_MESSAGES.systemPromptVocabulary,
    LLM_MESSAGES.systemPromptDimensionsOnly,
    LLM_MESSAGES.systemPromptAnswerTotals,
    LLM_MESSAGES.systemPromptMultiMeasure,
    LLM_MESSAGES.systemPromptNoDateUnlessAsked,
    LLM_MESSAGES.systemPromptNoSql,
    LLM_MESSAGES.systemPromptFilterValues,
    LLM_MESSAGES.systemPromptMeasureFilters,
    LLM_MESSAGES.systemPromptConversational,
    LLM_MESSAGES.systemPromptUnsupported,
    input.dimensionValues ? LLM_MESSAGES.allowedDimensionValues(input.dimensionValues) : "",
    LLM_MESSAGES.allowedVocabularyJson(JSON.stringify(vocabulary), conversationContext),
  ]
    .filter(Boolean)
    .join("\n");
}

export function mapBedrockToolUseToSelectionResult(
  toolUse: BedrockToolUseLike | undefined,
  allowedDomains: DomainSpec[],
  comparableMeasureIdsByDomain: Record<string, string[]>,
): LlmSelectionResult {
  if (toolUse === undefined) {
    return { kind: "no_tool_block", reason: LLM_MESSAGES.noToolUse };
  }
  if (!toolUse.name) {
    return { kind: "unsupported", reason: LLM_MESSAGES.malformedSelectionToolResponse };
  }

  if (toolUse.name === "request_clarification") {
    const input = asRecord(toolUse.input);
    const prompt = typeof input?.prompt === "string" ? input.prompt : undefined;
    const options = Array.isArray(input?.options)
      ? input.options.filter((option): option is string => typeof option === "string").slice(0, 4)
      : undefined;
    const defaultOption = typeof input?.defaultOption === "string" ? input.defaultOption : undefined;

    if (!prompt || !options?.length) {
      return { kind: "unsupported", reason: LLM_MESSAGES.malformedClarificationToolResponse };
    }
    return { kind: "clarify", prompt, options, defaultOption };
  }

  if (toolUse.name === "mark_unsupported") {
    const input = asRecord(toolUse.input);
    const reason = typeof input?.reason === "string" ? input.reason : undefined;
    return { kind: "unsupported", reason: reason || LLM_MESSAGES.questionUnsupported };
  }

  if (toolUse.name !== "emit_selection") {
    return { kind: "unsupported", reason: LLM_MESSAGES.unsupportedBedrockTool(toolUse.name) };
  }

  const input = asRecord(toolUse.input);
  if (!input) {
    return { kind: "unsupported", reason: LLM_MESSAGES.malformedSelectionToolResponse };
  }

  const domainName = typeof input.domain === "string" ? input.domain : undefined;
  const domain = allowedDomains.find((candidate) => candidate.name === domainName);
  if (!domain) {
    return { kind: "unsupported", reason: LLM_MESSAGES.selectionDomainNotAllowed };
  }

  const measureIds = stringArray(input.measureIds);
  if (!measureIds?.length) {
    return { kind: "unsupported", reason: LLM_MESSAGES.selectionMissingMeasureIds };
  }
  const allowedMeasureIds = new Set(domain.measures.map((measure) => measure.id));
  const invalidMeasureId = measureIds.find((measureId) => !allowedMeasureIds.has(measureId));
  if (invalidMeasureId) {
    return {
      kind: "unsupported",
      reason: LLM_MESSAGES.selectionMeasureNotAllowed(invalidMeasureId),
    };
  }

  const dimensionIds = input.dimensionIds === undefined ? [] : stringArray(input.dimensionIds);
  if (!dimensionIds) {
    return { kind: "unsupported", reason: LLM_MESSAGES.selectionDimensionIdsMalformed };
  }
  const allowedDimensionIds = new Set(domain.dimensions.map((dimension) => dimension.id));
  const invalidDimensionId = dimensionIds.find((dimensionId) => !allowedDimensionIds.has(dimensionId));
  if (invalidDimensionId) {
    return {
      kind: "unsupported",
      reason: LLM_MESSAGES.selectionDimensionNotAllowed(invalidDimensionId),
    };
  }

  const filters = input.filters === undefined ? [] : parseFilters(input.filters);
  if (!filters) {
    return { kind: "unsupported", reason: LLM_MESSAGES.selectionFiltersMalformed };
  }
  const invalidFilter = filters.find((filter) => !allowedDimensionIds.has(filter.dimensionId));
  if (invalidFilter) {
    return {
      kind: "unsupported",
      reason: LLM_MESSAGES.selectionFilterDimensionNotAllowed(invalidFilter.dimensionId),
    };
  }

  const parsedMeasureFilters =
    input.measureFilters === undefined ? { measureFilters: [] } : parseMeasureFilters(input.measureFilters);
  if ("reason" in parsedMeasureFilters) {
    return { kind: "unsupported", reason: parsedMeasureFilters.reason };
  }
  const allowedComparableMeasureIds = new Set(comparableMeasureIdsByDomain[domain.name] ?? []);
  const invalidMeasureFilter = parsedMeasureFilters.measureFilters.find(
    (filter) => !allowedComparableMeasureIds.has(filter.measureId),
  );
  if (invalidMeasureFilter) {
    return {
      kind: "unsupported",
      reason: LLM_MESSAGES.selectionMeasureFilterMeasureNotAllowed(invalidMeasureFilter.measureId),
    };
  }
  const invalidMeasureOperand = parsedMeasureFilters.measureFilters.find(
    (filter) => filter.compareTo.kind === "measure" && !allowedComparableMeasureIds.has(filter.compareTo.measureId),
  );
  if (invalidMeasureOperand?.compareTo.kind === "measure") {
    return {
      kind: "unsupported",
      reason: LLM_MESSAGES.selectionMeasureFilterOperandNotAllowed(invalidMeasureOperand.compareTo.measureId),
    };
  }

  const timeWindow = input.timeWindow === undefined ? undefined : parseTimeWindow(input.timeWindow);
  if (input.timeWindow !== undefined && !timeWindow) {
    return { kind: "unsupported", reason: LLM_MESSAGES.selectionTimeWindowMalformed };
  }

  const limit = input.limit === undefined ? 100 : parseLimit(input.limit);
  if (limit === undefined) {
    return { kind: "unsupported", reason: LLM_MESSAGES.selectionLimitMalformed };
  }

  const selection: Selection = {
    domain: domain.name,
    measureIds,
    dimensionIds,
    filters,
    ...(input.measureFilters !== undefined ? { measureFilters: parsedMeasureFilters.measureFilters } : {}),
    ...(timeWindow ? { timeWindow } : {}),
    limit,
  };

  return { kind: "selection", selection };
}

export function mapBedrockConverseOutputToSelectionResult(
  output: BedrockConverseOutput,
  allowedDomains: DomainSpec[],
  comparableMeasureIdsByDomain: Record<string, string[]>,
  model: string,
): LlmSelectionResult {
  const result = mapBedrockToolUseToSelectionResult(firstToolUse(output), allowedDomains, comparableMeasureIdsByDomain);
  const usage = output.usage;
  if (!usage) return result;

  return {
    ...result,
    usage: {
      model,
      inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : 0,
      outputTokens: typeof usage.outputTokens === "number" ? usage.outputTokens : 0,
      totalTokens: typeof usage.totalTokens === "number" ? usage.totalTokens : 0,
    },
  };
}

@Injectable()
export class BedrockLlmProvider implements LlmProvider {
  private readonly cfg: Config = loadConfig();
  private readonly client: BedrockClientLike;
  private readonly ConverseCommand: BedrockRuntimeModule["ConverseCommand"];

  constructor() {
    const { BedrockRuntimeClient, ConverseCommand } =
      require("@aws-sdk/client-bedrock-runtime") as BedrockRuntimeModule;
    // AWS SDK v3 Bedrock Runtime reads AWS_BEARER_TOKEN_BEDROCK automatically for
    // bearer-token auth; this env fallback covers SDK versions that require explicit
    // token config. Never hardcode or log the token.
    const clientConfig: BedrockClientConfig = { region: this.cfg.bedrock.region };
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      clientConfig.token = { token: process.env.AWS_BEARER_TOKEN_BEDROCK };
    }
    this.client = new BedrockRuntimeClient(clientConfig);
    this.ConverseCommand = ConverseCommand;
  }

  async select(input: LlmSelectionInput, signal?: AbortSignal): Promise<LlmSelectionResult> {
    if (!this.cfg.bedrock.modelId) {
      throw new Error(LLM_MESSAGES.bedrockModelIdNotConfigured);
    }

    const toolSpec = buildBedrockSelectionToolSpec(input.allowedDomains, input.comparableMeasureIdsByDomain);
    const systemPrompt = buildBedrockSelectionSystemPrompt(input, toolSpec.vocabulary);

    try {
      const selectOnce = async (maxTokens: number): Promise<LlmSelectionResult> => {
        signal?.throwIfAborted();
        const output = await this.client.send(
          new this.ConverseCommand({
            modelId: this.cfg.bedrock.modelId,
            system: [{ text: systemPrompt }],
            messages: [
              {
                role: "user",
                content: [{ text: input.question }],
              },
            ],
            toolConfig: toolSpec.toolConfig,
            inferenceConfig: { temperature: 0, topP: 1, maxTokens },
          }),
          signal ? { abortSignal: signal } : undefined,
        );
        return mapBedrockConverseOutputToSelectionResult(
          output,
          input.allowedDomains,
          input.comparableMeasureIdsByDomain,
          this.cfg.bedrock.modelId,
        );
      };

      const first = await selectOnce(LLM_SELECTOR_MAX_TOKENS);
      if (first.kind !== "no_tool_block") return first;

      signal?.throwIfAborted();
      const second = await selectOnce(LLM_SELECTOR_RETRY_MAX_TOKENS);
      const usage =
        first.usage && second.usage
          ? {
              model: second.usage.model,
              inputTokens: first.usage.inputTokens + second.usage.inputTokens,
              outputTokens: first.usage.outputTokens + second.usage.outputTokens,
              totalTokens: first.usage.totalTokens + second.usage.totalTokens,
            }
          : (second.usage ?? first.usage);
      return second.kind === "no_tool_block"
        ? {
            kind: "backend_error",
            reason: LLM_MESSAGES.incompleteModelResponse,
            ...(usage ? { usage } : {}),
          }
        : { ...second, ...(usage ? { usage } : {}) };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(LLM_MESSAGES.bedrockSelectFailed(message));
    }
  }
}

function firstToolUse(output: BedrockConverseOutput): BedrockToolUseLike | undefined {
  return output.output?.message?.content?.find((block) => block.toolUse)?.toolUse;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value;
}

function parseFilters(value: unknown): SelectionFilter[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filters: SelectionFilter[] = [];
  for (const item of value) {
    const filter = asRecord(item);
    if (!filter || typeof filter.dimensionId !== "string" || !isFilterOp(filter.op)) {
      return undefined;
    }
    const parsedValue = typeof filter.value === "string" ? filter.value : stringArray(filter.value);
    if (parsedValue === undefined) return undefined;
    filters.push({ dimensionId: filter.dimensionId, op: filter.op, value: parsedValue });
  }
  return filters;
}

function parseMeasureFilters(
  value: unknown,
): { measureFilters: MeasureFilter[] } | { reason: typeof LLM_MESSAGES.selectionMeasureFiltersMalformed } {
  if (!Array.isArray(value)) return { reason: LLM_MESSAGES.selectionMeasureFiltersMalformed };
  const measureFilters: MeasureFilter[] = [];
  for (const item of value) {
    const filter = asRecord(item);
    const compareTo = asRecord(filter?.compareTo);
    if (!filter || typeof filter.measureId !== "string" || !isMeasureFilterOp(filter.op) || !compareTo) {
      return { reason: LLM_MESSAGES.selectionMeasureFiltersMalformed };
    }
    if (compareTo.kind === "measure" && typeof compareTo.measureId === "string") {
      measureFilters.push({
        measureId: filter.measureId,
        op: filter.op,
        compareTo: { kind: "measure", measureId: compareTo.measureId },
      });
      continue;
    }
    if (compareTo.kind === "value" && typeof compareTo.value === "string") {
      measureFilters.push({
        measureId: filter.measureId,
        op: filter.op,
        compareTo: { kind: "value", value: compareTo.value },
      });
      continue;
    }
    return { reason: LLM_MESSAGES.selectionMeasureFiltersMalformed };
  }
  return { measureFilters };
}

function parseTimeWindow(value: unknown): Selection["timeWindow"] | undefined {
  const timeWindow = asRecord(value);
  if (!timeWindow || !isTimeGrain(timeWindow.grain)) return undefined;

  const last = timeWindow.last;
  const from = timeWindow.from;
  const to = timeWindow.to;
  if (last !== undefined && typeof last !== "number") return undefined;
  if (from !== undefined && typeof from !== "string") return undefined;
  if (to !== undefined && typeof to !== "string") return undefined;

  return {
    grain: timeWindow.grain,
    ...(last !== undefined ? { last } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  };
}

function parseLimit(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isFilterOp(value: unknown): value is SelectionFilter["op"] {
  return value === "eq" || value === "in" || value === "neq";
}

function isMeasureFilterOp(value: unknown): value is MeasureFilter["op"] {
  return value === "gt" || value === "gte" || value === "lt" || value === "lte";
}

function isTimeGrain(value: unknown): value is TimeGrain {
  return value === "day" || value === "week" || value === "month";
}
