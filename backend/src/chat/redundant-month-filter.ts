import type { Selection } from "@3f/contract";

export function withoutRedundantMonthFilter(selection: Selection): Selection {
  const from = selection.timeWindow?.from;
  const to = selection.timeWindow?.to;
  const fromMonth = calendarMonth(from);
  const toMonth = calendarMonth(to);
  if (!from || !to || !fromMonth || fromMonth !== toMonth || from > to) {
    return selection;
  }

  const redundantValue = `${fromMonth}-01`;
  const filters = selection.filters.filter(
    (filter) =>
      !(
        filter.dimensionId === "month" &&
        filter.op === "eq" &&
        typeof filter.value === "string" &&
        filter.value === redundantValue
      ),
  );

  return filters.length === selection.filters.length ? selection : { ...selection, filters };
}

function calendarMonth(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? undefined : value.slice(0, 7);
}
