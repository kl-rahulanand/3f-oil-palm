export type StatementIntent = "composition" | "causal" | "data";

const CAUSAL_CUES = /\b(why|how come|reason|caused?|high|low)\b/i;
const COMPOSITION_CUES =
  /\b(how is this|how (?:is|was) this built|what makes up|break down|compose[ds]? of|made up of)\b/i;

export function classifyStatementIntent(question: string): StatementIntent {
  if (CAUSAL_CUES.test(question)) return "causal";
  if (COMPOSITION_CUES.test(question)) return "composition";
  return "data";
}
