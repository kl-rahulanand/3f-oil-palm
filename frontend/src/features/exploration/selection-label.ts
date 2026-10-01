import { SEMANTIC_LABELS, type FixedScaleMoney, type MeasureFilter, type Selection } from "@3f/contract";
import { formatMoney } from "../mis/statement-view";

const MEASURE_FILTER_OPERATORS: Record<MeasureFilter["op"], string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

export interface SelectionLabel {
  title: string;
  summary: string;
}

export function selectionLabel(selection: Selection): SelectionLabel {
  const measures = selection.measureIds.map((id) => registeredLabel(SEMANTIC_LABELS.measures, id));
  const dimensions = selection.dimensionIds.map((id) => registeredLabel(SEMANTIC_LABELS.dimensions, id));
  const filters = selection.filters.map(({ dimensionId, value }) => {
    const values = Array.isArray(value) ? value.join(", ") : value;
    return `${registeredLabel(SEMANTIC_LABELS.dimensions, dimensionId)}: ${values}`;
  });
  const measureFilters = selection.measureFilters?.map(measureFilterLabel) ?? [];
  const time = selection.timeWindow
    ? `${SEMANTIC_LABELS.dimensions.month}: ${selection.timeWindow.from ?? selection.timeWindow.last ?? ""}${
        selection.timeWindow.to ? `–${selection.timeWindow.to}` : ""
      }`
    : undefined;

  return {
    title: measures.join(" · "),
    summary: [...dimensions, ...filters, ...measureFilters, ...(time ? [time] : [])].join(" · "),
  };
}

export function measureFilterLabel(filter: MeasureFilter): string {
  const left = registeredLabel(SEMANTIC_LABELS.measures, filter.measureId);
  const right =
    filter.compareTo.kind === "measure"
      ? registeredLabel(SEMANTIC_LABELS.measures, filter.compareTo.measureId)
      : formatMoney(filter.compareTo.value as FixedScaleMoney);
  return `${left} ${MEASURE_FILTER_OPERATORS[filter.op]} ${right}`;
}

function registeredLabel(catalog: Record<string, string>, id: string): string {
  return catalog[id] ?? `${id} (unavailable)`;
}
