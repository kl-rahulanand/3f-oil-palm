import type { MeasureFilter, Selection } from "@3f/contract";

const ISO_DATE = /(?<![\p{L}\p{N}])\d{4}-\d{2}(?:-\d{2})?(?![\p{L}\p{N}])/gu;
const CALENDAR_YEAR = /(?<![\p{L}\p{N}.,])(?:19|20)\d{2}(?![\p{L}\p{N}]|[.,]\d)/gu;
const NUMBER = /(?<![\p{L}\p{N}])\d/u;
const AMOUNT_WORD =
  /(?<![\p{L}\p{N}])(?:₹|rs\.?|inr|rupees?|lakhs?|crores?|zero|nil|positive|negative|non-?\s?zero)(?![\p{L}\p{N}])/iu;

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

/** A question states an amount when it names a number other than a year or date, a currency, a magnitude or a sign. */
export function statesAmountComparison(question: string): boolean {
  const withoutDates = question.replace(ISO_DATE, " ").replace(CALENDAR_YEAR, " ");
  return NUMBER.test(withoutDates) || AMOUNT_WORD.test(question);
}

function filterKey(filter: MeasureFilter): string {
  const operand =
    filter.compareTo.kind === "value" ? `value:${filter.compareTo.value}` : `measure:${filter.compareTo.measureId}`;
  return `${filter.measureId}|${filter.op}|${operand}`;
}
