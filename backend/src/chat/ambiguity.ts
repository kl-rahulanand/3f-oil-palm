import type { DomainSpec, MeasureSpec } from "@3f/contract";

export interface ClarifyPayload {
  prompt: string;
  options: string[];
  defaultOption?: string;
  resumesQuestion?: boolean;
}

/**
 * D3 deterministic ambiguity signal: required parameter binding.
 * Confidence is judged from semantic metadata and whether required parameters are
 * bound, not from LLM self-reported confidence.
 */
export function requiredTimeWindowClarify(args: {
  selectedMeasures: MeasureSpec[];
  appliedTimeWindow?: { from: string; to: string; column: string };
}): ClarifyPayload | null {
  if (args.appliedTimeWindow) return null;

  const timeBoundMeasures = args.selectedMeasures.filter((measure) => measure.requiresTimeWindow === true);
  if (timeBoundMeasures.length === 0) return null;

  const labels = joinLabels(timeBoundMeasures.map((measure) => `"${measure.label}"`));
  return {
    prompt: `${labels} ${timeBoundMeasures.length === 1 ? "needs" : "need"} a time window (it counts activity over time). Which range?`,
    options: ["Last 7 days", "Last 30 days", "Last 90 days"],
    defaultOption: "Last 30 days",
    resumesQuestion: true,
  };
}

/**
 * D3 deterministic ambiguity signal: domain routing metadata-match strength.
 * Confidence is judged from routing-hint match strength, not from LLM
 * self-reported confidence.
 */
export function domainRoutingAmbiguity(args: {
  question: string;
  allowedDomains: DomainSpec[];
  chosenDomain: string;
}): ClarifyPayload | null {
  if (args.allowedDomains.length < 2) return null;

  const question = args.question.toLocaleLowerCase();
  const explicitChoice = args.allowedDomains.some((domain) =>
    question.includes(`(${domain.label.toLocaleLowerCase()})`),
  );
  // Frontend resumes clarifies as "<original question> (<domain label>)"; do not re-ask on that turn.
  if (explicitChoice) return null;

  const chosen = args.allowedDomains.find((domain) => domain.name === args.chosenDomain);
  if (!chosen) return null;

  const scores = args.allowedDomains.map((domain) => ({
    domain,
    score: domain.routingHints.reduce((sum, hint) => {
      const normalizedHint = hint.toLocaleLowerCase();
      return question.includes(normalizedHint) ? sum + wordCount(normalizedHint) : sum;
    }, 0),
  }));

  const chosenScore = scores.find((entry) => entry.domain.name === chosen.name)?.score ?? 0;
  const rival = scores
    .filter((entry) => entry.domain.name !== chosen.name)
    .sort((a, b) => b.score - a.score)[0];

  if (!rival || rival.score <= 0 || rival.score < chosenScore) return null;

  const options = dedupe([
    chosen.label,
    ...scores
      .filter((entry) => entry.score > 0 && entry.domain.name !== chosen.name)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.domain.label),
  ]);

  return {
    prompt: `Your question could mean ${chosen.label} or ${rival.domain.label}. Which did you mean?`,
    options,
    defaultOption: chosen.label,
    resumesQuestion: true,
  };
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 2) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
