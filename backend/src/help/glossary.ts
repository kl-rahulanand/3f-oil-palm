// ASK-HELP-SUGGESTIONS-STILL-CARRY-MBS-Q (2026-10-04): formatted here and removed this file from .prettierignore.
import type { DomainSpec, MeasureSpec, MisSelectionPeriodOption } from "@3f/contract";

export type DefinitionKind = "measure" | "dimension" | "value" | "meta";

export interface TermIndexMeasure {
  id: string;
  label: string;
  definition: string;
  synonyms: string[];
}

export interface TermIndexDimension {
  id: string;
  label: string;
  definition: string;
}

export interface TermIndexValue {
  dimensionId: string;
  dimensionLabel: string;
  value: string;
}

export interface TermIndex {
  domains: Array<{ id: string; label: string }>;
  measures: TermIndexMeasure[];
  dimensions: TermIndexDimension[];
  values: TermIndexValue[];
  exampleQuestions: string[];
  latestPeriodLabel?: string;
}

export interface GlossaryLookupResult {
  definitionKind: DefinitionKind;
  term: string;
  title: string;
  definition: string;
  suggestedQuestions: string[];
}

export function definitionFor(measure: MeasureSpec): string {
  const aggregation = aggregationPhrase(measure.expr);
  const noun = measure.label.toLocaleLowerCase();
  const grain = sentenceFragment(measure.grain);
  const filters = measure.impliedFilters.length ? ` Always applies: ${measure.impliedFilters.join("; ")}.` : "";
  return `${measure.label} - ${aggregation} ${noun} (${grain}).${filters}`;
}

export function classifyMeta(question: string): boolean {
  return (
    /^\s*(what\s+is|what\s+are|what's|define|meaning of)\b/i.test(question) ||
    /\bwhat does .+ mean\b/i.test(question) ||
    /\bwhat can (you|i) (ask|do)\b/i.test(question) ||
    /^\s*help\b/i.test(question)
  );
}

export function glossaryLookup(question: string, index: TermIndex): GlossaryLookupResult | null {
  if (/\bwhat can (you|i) (ask|do)\b/i.test(question) || /^\s*help\b/i.test(question)) {
    const domains = index.domains.map((domain) => domain.label).join(", ") || "your permitted data";
    return {
      definitionKind: "meta",
      term: "help",
      title: "What 3F can answer",
      definition: `3F can answer questions about ${domains} using the metrics and fields granted to your role.`,
      suggestedQuestions: index.exampleQuestions.slice(0, 3),
    };
  }

  const normalizedQuestion = normalize(question);
  const candidates: Array<GlossaryLookupResult & { score: number }> = [];
  for (const measure of index.measures) {
    const terms = [measure.label, measure.id, ...measure.synonyms];
    const matched = bestTermMatch(normalizedQuestion, terms);
    if (!matched) continue;
    candidates.push({
      definitionKind: "measure",
      term: matched.term,
      title: measure.label,
      definition: measure.definition,
      suggestedQuestions: index.exampleQuestions.slice(0, 3),
      score: 300 + matched.score,
    });
  }

  for (const dimension of index.dimensions) {
    const matched = bestTermMatch(normalizedQuestion, [dimension.label, dimension.id]);
    if (!matched) continue;
    candidates.push({
      definitionKind: "dimension",
      term: matched.term,
      title: dimension.label,
      definition: dimension.definition,
      suggestedQuestions: index.exampleQuestions.slice(0, 3),
      score: 200 + matched.score,
    });
  }

  for (const value of index.values) {
    const matched = bestTermMatch(normalizedQuestion, [value.value]);
    if (!matched) continue;
    candidates.push({
      definitionKind: "value",
      term: value.value,
      title: value.value,
      definition: `${value.value} is a value of the ${value.dimensionLabel} field.`,
      suggestedQuestions: index.exampleQuestions.slice(0, 3),
      score: 400 + matched.score,
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best) return null;
  const { score: _score, ...result } = best;
  return result;
}

export function unsupportedFallbackMessage(index: TermIndex): string {
  const domains = index.domains.map((domain) => domain.label).join(", ") || "your permitted data";
  const examples = index.exampleQuestions.slice(0, 3).join("; ") || "ask for an allowed metric by an allowed field";
  return `I can answer questions about ${domains}. Try one of: ${examples}. I don't have that as a metric or field.`;
}

export function buildTermIndex(
  domains: DomainSpec[],
  dimensionValues: Record<string, string[]>,
  latestPeriod?: MisSelectionPeriodOption,
): TermIndex {
  const measures = domains.flatMap((domain) =>
    domain.measures.map((measure) => ({
      id: measure.id,
      label: measure.label,
      definition: definitionFor(measure),
      synonyms: measure.synonyms ?? [],
    })),
  );
  const dimensions = dedupeById(
    domains.flatMap((domain) =>
      domain.dimensions.map((dimension) => ({
        id: dimension.id,
        label: dimension.label,
        definition: `${dimension.label} is a field in ${domain.label}.`,
      })),
    ),
  );
  const dimensionLabels = new Map(dimensions.map((dimension) => [dimension.id, dimension.label]));
  const values = Object.entries(dimensionValues).flatMap(([dimensionId, dimensionValueList]) => {
    const dimensionLabel = dimensionLabels.get(dimensionId);
    if (!dimensionLabel) return [];
    return dimensionValueList.map((value) => ({ dimensionId, dimensionLabel, value }));
  });
  const suggestionDomain = domains.find((domain) => domain.measures.length > 0 && domain.dimensions.length > 0);
  const firstMeasure = suggestionDomain?.measures[0];
  const secondMeasure = suggestionDomain?.measures[1];
  const firstDimensionSpec =
    suggestionDomain?.dimensions.find((dimension) => dimension.id === "gl_code") ??
    suggestionDomain?.dimensions.find((dimension) => dimension.id === "leaf_key") ??
    suggestionDomain?.dimensions[0];
  const firstDimension = dimensions.find((dimension) => dimension.id === firstDimensionSpec?.id);
  const actual = suggestionDomain?.measures.find(
    (measure) => measure.format === "money" && /(?:^|\.)(?:actual|actual_net)$/.test(measure.id),
  );
  const budget = suggestionDomain?.measures.find(
    (measure) => measure.format === "money" && /(?:^|\.)(?:budget|budget_net)$/.test(measure.id),
  );
  const latestPeriodLabel = latestPeriod ? displayMonth(latestPeriod.value, latestPeriod.label) : undefined;
  const periodClause = latestPeriodLabel ? ` for ${latestPeriodLabel}` : "";
  const exampleQuestions = [
    firstMeasure && firstDimension ? `${firstMeasure.label} by ${firstDimension.label}${periodClause}` : undefined,
    firstMeasure && secondMeasure && firstDimension
      ? `${firstMeasure.label} and ${secondMeasure.label} by ${firstDimension.label}${periodClause}`
      : undefined,
    actual && budget && firstDimension
      ? `Which ${pluralize(firstDimension.label)} had ${actual.label} over ${budget.label}${
          latestPeriodLabel ? ` in ${latestPeriodLabel}` : ""
        }?`
      : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    domains: domains.map((domain) => ({ id: domain.name, label: domain.label })),
    measures,
    dimensions,
    values,
    exampleQuestions: [...new Set(exampleQuestions)],
    ...(latestPeriodLabel ? { latestPeriodLabel } : {}),
  };
}

function displayMonth(value: string, fallback: string): string {
  const match = /^(\d{4})-(\d{2})-01$/.exec(value);
  if (!match) return fallback;
  const month = Number(match[2]);
  const monthName = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][month - 1];
  return monthName ? `${monthName} ${match[1]}` : fallback;
}

function pluralize(label: string): string {
  return label.endsWith("s") ? label : `${label}s`;
}

function aggregationPhrase(expr: string): string {
  const normalized = expr.replace(/\s+/g, " ").toLocaleUpperCase();
  if (/COUNT\s*\(\s*DISTINCT\b/.test(normalized)) return "counts distinct";
  if (/COUNT\s*\(/.test(normalized)) return "counts";
  if (/SUM\s*\(/.test(normalized)) return "sums";
  if (/AVG\s*\(/.test(normalized)) return "averages";
  if (/MIN\s*\(/.test(normalized)) return "takes the minimum of";
  if (/MAX\s*\(/.test(normalized)) return "takes the maximum of";
  return "calculates";
}

function sentenceFragment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "semantic grain not specified";
  return trimmed.replace(/\.$/, "");
}

function bestTermMatch(normalizedQuestion: string, terms: string[]): { term: string; score: number } | null {
  const matches = terms
    .map((term) => ({ term, normalized: normalize(term) }))
    .filter(({ normalized }) => normalized.length > 0)
    .filter(({ normalized }) => containsTerm(normalizedQuestion, normalized))
    .map(({ term, normalized }) => ({ term, score: normalized.length }));
  matches.sort((left, right) => right.score - left.score);
  return matches[0] ?? null;
}

function containsTerm(question: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(question);
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
