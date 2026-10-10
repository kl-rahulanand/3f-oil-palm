import { FINANCIAL_TOOL_DEFINITIONS } from "@3f/contract";
import { toJsonSchema } from "@langchain/core/utils/json_schema";

export const FINANCIAL_CHAT_TOOLS = FINANCIAL_TOOL_DEFINITIONS.map((definition) => ({
  ...definition,
  modelSchema: definition.inputSchema,
  staticInputSchema: toJsonSchema(definition.inputSchema),
})) as typeof FINANCIAL_TOOL_DEFINITIONS extends readonly (infer Definition)[]
  ? readonly (Definition & {
      modelSchema: Definition extends { inputSchema: infer Schema } ? Schema : never;
      staticInputSchema: Record<string, unknown>;
    })[]
  : never;
