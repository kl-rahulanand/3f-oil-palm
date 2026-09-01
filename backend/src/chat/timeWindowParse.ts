import type { Selection } from "@pulse/contract";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_PATTERN =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_PATTERN = `(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+(?:${MONTH_PATTERN})(?:\\s+\\d{4})?|(?:${MONTH_PATTERN})\\s+\\d{1,2}(?:,?\\s+\\d{4})?)`;

export function parseTimeWindow(text: string, now: Date): Selection["timeWindow"] | null {
  const input = normalize(text);
  if (!input) return null;

  const relative = input.match(/\b(?:last|past)\s+([1-9]\d*)\s+(day|days|week|weeks|month|months|year|years)\b/i);
  if (relative) {
    const last = Number(relative[1]);
    const unit = relative[2].toLocaleLowerCase();
    if (unit.startsWith("day")) return { grain: "day", last };
    if (unit.startsWith("week")) return { grain: "week", last };
    if (unit.startsWith("month")) return { grain: "month", last };
    if (unit.startsWith("year")) return { grain: "month", last: last * 12 };
  }

  const today = isoDate(dateOnlyUtc(now));
  if (/\bthis\s+year\b/i.test(input)) {
    return { grain: "day", from: `${now.getUTCFullYear()}-01-01`, to: today };
  }
  if (/\bthis\s+month\b/i.test(input)) {
    return { grain: "day", from: isoDate(utcDate(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), to: today };
  }
  if (/\btoday\b/i.test(input)) {
    return { grain: "day", from: today, to: today };
  }
  if (/\byesterday\b/i.test(input)) {
    const yesterday = dateOnlyUtc(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const value = isoDate(yesterday);
    return { grain: "day", from: value, to: value };
  }

  const monthRange = input.match(new RegExp(`\\b(${MONTH_PATTERN})\\s*(?:-|–|—|to)\\s*(${MONTH_PATTERN})\\s+(\\d{4})\\b`, "i"));
  if (monthRange) {
    const fromMonth = monthNumber(monthRange[1]);
    const toMonth = monthNumber(monthRange[2]);
    const year = Number(monthRange[3]);
    if (fromMonth && toMonth) {
      const [startMonth, endMonth] = fromMonth <= toMonth ? [fromMonth, toMonth] : [toMonth, fromMonth];
      return {
        grain: "day",
        from: isoDate(utcDate(year, startMonth, 1)),
        to: isoDate(lastDayOfMonth(year, endMonth)),
      };
    }
  }

  const quarter = input.match(/\bq([1-4])\s+(\d{4})\b/i);
  if (quarter) {
    const q = Number(quarter[1]);
    const year = Number(quarter[2]);
    const startMonth = (q - 1) * 3 + 1;
    return {
      grain: "day",
      from: isoDate(utcDate(year, startMonth, 1)),
      to: isoDate(lastDayOfMonth(year, startMonth + 2)),
    };
  }

  const monthYear = input.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{4})\\b`, "i"));
  if (monthYear) {
    const month = monthNumber(monthYear[1]);
    const year = Number(monthYear[2]);
    if (month) {
      return {
        grain: "day",
        from: isoDate(utcDate(year, month, 1)),
        to: isoDate(lastDayOfMonth(year, month)),
      };
    }
  }

  const dateRange = input.match(new RegExp(`(${DATE_PATTERN})\\s*(?:to|through|until|-|–|—)\\s*(${DATE_PATTERN})`, "i"));
  if (dateRange) {
    const first = parseDate(dateRange[1], now);
    const second = parseDate(dateRange[2], now);
    if (first && second) {
      const [from, to] = first <= second ? [first, second] : [second, first];
      return { grain: "day", from, to };
    }
  }

  const since = input.match(new RegExp(`\\b(?:since|from)\\s+(${DATE_PATTERN})\\b`, "i"));
  if (since) {
    const from = parseDate(since[1], now);
    if (from) return { grain: "day", from, to: today };
  }

  const loneDate = input.match(new RegExp(`\\b(${DATE_PATTERN})\\b`, "i"));
  if (loneDate) {
    const from = parseDate(loneDate[1], now);
    if (from) return { grain: "day", from, to: today };
  }

  return null;
}

function parseDate(token: string, now: Date): string | null {
  const value = token.trim().replace(/^[\s([{"']+|[\s)\].,;:!?}"']+$/g, "").replace(/\s+/g, " ");
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dayMonth = value.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?$`, "i"));
  if (dayMonth) {
    const month = monthNumber(dayMonth[2]);
    const year = dayMonth[3] ? Number(dayMonth[3]) : now.getUTCFullYear();
    return month ? validIso(year, month, Number(dayMonth[1])) : null;
  }

  const monthDay = value.match(new RegExp(`^(${MONTH_PATTERN})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?$`, "i"));
  if (monthDay) {
    const month = monthNumber(monthDay[1]);
    const year = monthDay[3] ? Number(monthDay[3]) : now.getUTCFullYear();
    return month ? validIso(year, month, Number(monthDay[2])) : null;
  }

  return null;
}

function normalize(text: string): string {
  return text.trim().replace(/^[\s([{"']+|[\s)\].,;:!?}"']+$/g, "").replace(/\s+/g, " ");
}

function monthNumber(value: string): number | undefined {
  return MONTHS[value.toLocaleLowerCase()];
}

function validIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const date = utcDate(year, month, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return isoDate(date);
}

function dateOnlyUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
