export interface ReconciliationInfo {
  title: string;
  definitionKind: "meta";
  definition: string;
  suggestedQuestions: string[];
}

const INTENT_RE = /\b(why|how come|reason|explain)\b/i;
const RECONCILE_INTENT_RE = /\breconcile\b/i;
const DISCREPANCY_RE =
  /\b(different|difference|mismatch|discrepanc\w*|reconcile|doesn'?t match|do(?:es)? not match|not match|changed?|earlier|before|previously|previous|last time|used to)\b/i;
const NUMBER_COMPARISON_RE = /\d[\d,]{2,}.*\b(?:vs|and|to|now|then)\b.*\d[\d,]{2,}/i;
const NUMBER_RE = /\d[\d,]{2,}/g;

export function classifyReconciliationQuestion(question: string): ReconciliationInfo | null {
  const hasIntent = INTENT_RE.test(question) || RECONCILE_INTENT_RE.test(question);
  if (!hasIntent) return null;

  const hasDiscrepancy = DISCREPANCY_RE.test(question) || hasTwoDistinctComparedNumbers(question);
  if (!hasDiscrepancy) return null;

  return {
    title: "Comparing two results",
    definitionKind: "meta",
    definition:
      "I answer questions about defined metrics, so I can't infer why two results differ or reconcile them without a configured reconciliation rule. Try asking for a specific metric or breakdown and I'll run it.",
    suggestedQuestions: ["Show an available metric", "Break down an available metric"],
  };
}

export function classifyCausalQuestion(question: string): ReconciliationInfo | null {
  if (!INTENT_RE.test(question)) return null;
  return {
    title: "Causal analysis is not configured",
    definitionKind: "meta",
    definition:
      "I can't infer why a result is high or low. Ask what the governed numbers show for a specific metric or breakdown.",
    suggestedQuestions: ["Show an available metric", "Break down an available metric"],
  };
}

function hasTwoDistinctComparedNumbers(question: string): boolean {
  if (!NUMBER_COMPARISON_RE.test(question)) return false;

  const numbers = question.match(NUMBER_RE) ?? [];
  const distinctNumbers = new Set(numbers.map((number) => number.replaceAll(",", "")));
  return distinctNumbers.size >= 2;
}
