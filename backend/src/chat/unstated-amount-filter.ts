import type { MeasureFilter, Selection } from "@3f/contract";

const MAGNITUDES: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  lakh: 1e5,
  lakhs: 1e5,
  million: 1e6,
  mn: 1e6,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
};
const STATED_NUMBER =
  /(?<![\p{L}\p{N}.])(-?)\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(lakhs?|crores?|cr|k|thousand|million|mn)(?![\p{L}\p{N}]))?/giu;
const STATED_ZERO = /(?<![\p{L}\p{N}])(?:zero|nil|positive|negative|non-?\s?zero)(?![\p{L}\p{N}])/iu;

export interface UnstatedAmountFilterResult {
  selection: Selection;
  dropped: MeasureFilter[];
}

/**
 * An amount comparison (a measure filter against a fixed value) applies only when the question states that amount
 * ("more than 5 lakh", "below -100", "cap it at 200", "above zero", "non-zero") or the previous turn already carried
 * the same filter. Each filter is checked on its own, so one stated amount never keeps another the selector added,
 * for example "Actual > 0" hiding the zero lines of a "for each line" answer.
 */
export function withoutUnstatedAmountFilters(
  selection: Selection,
  question: string,
  priorSelection?: Selection,
): UnstatedAmountFilterResult {
  const measureFilters = selection.measureFilters ?? [];
  if (!measureFilters.some((filter) => filter.compareTo.kind === "value")) return { selection, dropped: [] };

  const amounts = statedAmounts(question);
  const carried = new Set((priorSelection?.measureFilters ?? []).map(filterKey));
  const kept: MeasureFilter[] = [];
  const dropped: MeasureFilter[] = [];
  for (const filter of measureFilters) {
    const stated =
      filter.compareTo.kind !== "value" ||
      carried.has(filterKey(filter)) ||
      amounts.some((amount) =>
        sameAmount(amount, Number(filter.compareTo.kind === "value" ? filter.compareTo.value : NaN)),
      );
    (stated ? kept : dropped).push(filter);
  }
  return dropped.length === 0 ? { selection, dropped } : { selection: { ...selection, measureFilters: kept }, dropped };
}

/** Every amount the question names: its numbers with any magnitude applied, and 0 for zero or sign words. */
export function statedAmounts(question: string): number[] {
  const amounts: number[] = [];
  for (const match of question.matchAll(STATED_NUMBER)) {
    const [, sign, digits, magnitude] = match;
    const value = Number(digits.replace(/,/g, "")) * (magnitude ? MAGNITUDES[magnitude.toLowerCase()] : 1);
    if (Number.isFinite(value)) amounts.push(sign ? -value : value);
  }
  if (STATED_ZERO.test(question)) amounts.push(0);
  return amounts;
}

function sameAmount(stated: number, filterValue: number): boolean {
  return Number.isFinite(filterValue) && Math.abs(stated - filterValue) < 0.005;
}

function filterKey(filter: MeasureFilter): string {
  const operand =
    filter.compareTo.kind === "value" ? `value:${filter.compareTo.value}` : `measure:${filter.compareTo.measureId}`;
  return `${filter.measureId}|${filter.op}|${operand}`;
}
