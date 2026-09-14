// Generic-ready seam #3 (eng review). The LLM only SELECTS from the semantic layer;
// it never authors SQL. Swappable: mock (offline) | bedrock (POC) | on-prem (prod,
// pending the residency decision). The measure-selection eval suite validates a swap.

import type { DomainSpec, Selection } from "@3f/contract";

export interface LlmPriorTurn {
  question: string;
  selection: Selection;
}

export interface LlmSelectionInput {
  question: string;
  /** The domains + measures/dimensions the user is permitted to use. */
  allowedDomains: DomainSpec[];
  /** Recent turns for follow-ups, ordered oldest-first and bounded by the caller. */
  priorTurns?: LlmPriorTurn[];
  /** Real low-cardinality dimension values, keyed by dimension id. */
  dimensionValues?: Record<string, string[]>;
}

export type LlmUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type LlmSelectionOutcome =
  | { kind: "selection"; selection: Selection }
  | { kind: "clarify"; prompt: string; options: string[]; defaultOption?: string }
  | { kind: "unsupported"; reason: string }
  | { kind: "no_tool_block"; reason: string }
  | { kind: "backend_error"; reason: string };

export type LlmSelectionResult = LlmSelectionOutcome & { usage?: LlmUsage };

export interface LlmProvider {
  /** Map a question to a constrained selection (strict enums), clarify, or unsupported. */
  select(input: LlmSelectionInput, signal?: AbortSignal): Promise<LlmSelectionResult>;
}
