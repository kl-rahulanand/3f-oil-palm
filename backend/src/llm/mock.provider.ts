import { Injectable } from "@nestjs/common";
import type { LlmProvider, LlmSelectionInput, LlmSelectionResult } from "./llm.interface";

/**
 * Deterministic development provider. Project domains supply their own realistic
 * selectors; the neutral snapshot only exposes allowed vocabulary as examples.
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  async select(input: LlmSelectionInput): Promise<LlmSelectionResult> {
    const options = input.allowedDomains
      .slice(0, 3)
      .map((domain) => `Show me a ${domain.label} metric`);

    return {
      kind: "clarify",
      prompt: "Choose a configured data domain to explore.",
      options,
      ...(options[0] ? { defaultOption: options[0] } : {}),
    };
  }
}
