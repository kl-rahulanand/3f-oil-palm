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
const MONTH_NAMES =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
/**
 * Dates, years, identifiers and counts whose numbers are never amounts: ISO dates, a year after a month or FY, a GL
 * code or line, and a count of plants, lines, codes or months ("the 3 plants", "last 3 months").
 */
const NOT_AMOUNTS = [
  /\d{4}-\d{2}(?:-\d{2})?/gu,
  new RegExp(
    String.raw`(?<![\p{L}\p{N}])(?:${MONTH_NAMES}|fy|year|years|in|of|since|until|during)\s*,?\s*(?:(?:19|20)\d{2}(?:\s*(?:-|to|and|–)\s*(?:\d{2}|(?:19|20)\d{2}))?)`,
    "giu",
  ),
  new RegExp(
    String.raw`(?<![\p{L}\p{N}])(?:gl(?:\s+codes?)?|codes?|accounts?|lines?|statement\s+lines?|s\.?\s?no\.?|plants?|leaf)\s*#?\s*\d[\d.]*`,
    "giu",
  ),
  /(?<![\p{L}\p{N}.])\d[\d.]*\s+(?:gl\s+codes?|codes?|accounts?|lines?|statement\s+lines?|plants?|months?|quarters?|years?|days?|weeks?|rows?|items?)(?![\p{L}\p{N}])/giu,
];
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  hundred: 100,
};
const WORD_AMOUNT = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(${Object.keys(NUMBER_WORDS).join("|")})\s+(lakhs?|crores?|thousand|million|hundred)(?![\p{L}\p{N}])`,
  "giu",
);

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

/** Every amount the question names: its numbers and number words with any magnitude applied, and 0 for zero or
 * sign words; dates, years and identifiers (GL codes, statement lines) are not amounts. */
export function statedAmounts(question: string): number[] {
  const text = NOT_AMOUNTS.reduce((current, pattern) => current.replace(pattern, " "), question);
  const amounts: number[] = [];
  for (const match of text.matchAll(STATED_NUMBER)) {
    const [, sign, digits, magnitude] = match;
    const value = Number(digits.replace(/,/g, "")) * (magnitude ? MAGNITUDES[magnitude.toLowerCase()] : 1);
    if (Number.isFinite(value)) amounts.push(sign ? -value : value);
  }
  for (const [, word, magnitude] of text.matchAll(WORD_AMOUNT)) {
    amounts.push(
      NUMBER_WORDS[word.toLowerCase()] *
        (magnitude.toLowerCase() === "hundred" ? 100 : MAGNITUDES[magnitude.toLowerCase()]),
    );
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
