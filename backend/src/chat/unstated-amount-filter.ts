import type { MeasureFilter, Selection } from "@3f/contract";

const CURRENCY = String.raw`(?:₹|rs\.?|inr|rupees?)`;
const NUMBER = String.raw`(?:${CURRENCY}\s*)?(?:\d[\d,]*(?:\.\d+)?|zero|nil)`;
const COMPARISON = String.raw`(?:over|above|below|under|more\s+than|less\s+than|greater\s+than|fewer\s+than|at\s+least|at\s+most|exceed(?:s|ed|ing)?|beyond|up\s+to|between|within|>=?|<=?|≥|≤|=)`;
const THRESHOLD = String.raw`(?:cap(?:ped|s)?|limit(?:ed|s)?|threshold|ceiling|floor|minimum|maximum|min|max)(?:\s+(?:it|them|that|this|of|at|to|is|was))*`;
const MODIFIER = String.raw`(?:about|around|roughly|approximately|approx\.?|nearly|just|only|exactly)`;
const BOUNDARY_BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const STATED_AMOUNT = [
  new RegExp(String.raw`${BOUNDARY_BEFORE}(?:${COMPARISON}|${THRESHOLD})\s*(?:${MODIFIER}\s+)?${NUMBER}`, "iu"),
  new RegExp(
    String.raw`${BOUNDARY_BEFORE}\d[\d,]*(?:\.\d+)?\s*(?:lakhs?|crores?|k|thousand|million)(?![\p{L}\p{N}])`,
    "iu",
  ),
  new RegExp(String.raw`${CURRENCY}\s*\d`, "iu"),
  /(?<![\p{L}\p{N}])(?:positive|negative|non-?\s?zero)(?![\p{L}\p{N}])/iu,
];

export interface UnstatedAmountFilterResult {
  selection: Selection;
  dropped: MeasureFilter[];
}

/**
 * An amount comparison (a measure filter against a fixed value) applies only when the question states an amount
 * ("more than 5 lakh", "cap it at 200", "above zero", "non-zero") or the previous turn already carried it. The selector may not
 * add one on its own, for example to hide the zero lines of a "for each line" answer.
 */
export function withoutUnstatedAmountFilters(
  selection: Selection,
  question: string,
  priorSelection?: Selection,
): UnstatedAmountFilterResult {
  const measureFilters = selection.measureFilters ?? [];
  if (measureFilters.length === 0 || statesAmountComparison(question)) return { selection, dropped: [] };

  const carried = new Set((priorSelection?.measureFilters ?? []).map(filterKey));
  const kept: MeasureFilter[] = [];
  const dropped: MeasureFilter[] = [];
  for (const filter of measureFilters) {
    (filter.compareTo.kind === "value" && !carried.has(filterKey(filter)) ? dropped : kept).push(filter);
  }
  return dropped.length === 0 ? { selection, dropped } : { selection: { ...selection, measureFilters: kept }, dropped };
}

/**
 * A question states an amount comparison when a number follows a comparison or threshold word ("more than 5 lakh",
 * "cap it at 200", "above zero"), carries a currency or magnitude ("₹50,000", "5 lakh"), or names a sign
 * ("non-zero"). A bare number such as GL code 50001201, statement line 9.01 or a year is not an amount.
 */
export function statesAmountComparison(question: string): boolean {
  return STATED_AMOUNT.some((pattern) => pattern.test(question));
}

function filterKey(filter: MeasureFilter): string {
  const operand =
    filter.compareTo.kind === "value" ? `value:${filter.compareTo.value}` : `measure:${filter.compareTo.measureId}`;
  return `${filter.measureId}|${filter.op}|${operand}`;
}
