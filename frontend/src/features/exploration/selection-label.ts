import { SEMANTIC_LABELS, type Selection } from "@3f/contract";

export interface SelectionLabel {
  title: string;
  summary: string;
}

export function selectionLabel(selection: Selection): SelectionLabel {
  const label = (catalog: Record<string, string>, id: string) => {
    const registered = catalog[id];
    if (registered) return registered;
    return `${id} (unavailable)`;
  };
  const measures = selection.measureIds.map((id) => label(SEMANTIC_LABELS.measures, id));
  const dimensions = selection.dimensionIds.map((id) => label(SEMANTIC_LABELS.dimensions, id));
  const filters = selection.filters.map(({ dimensionId, value }) => {
    const values = Array.isArray(value) ? value.join(", ") : value;
    return `${label(SEMANTIC_LABELS.dimensions, dimensionId)}: ${values}`;
  });
  const time = selection.timeWindow
    ? `${SEMANTIC_LABELS.dimensions.month}: ${selection.timeWindow.from ?? selection.timeWindow.last ?? ""}${
        selection.timeWindow.to ? `–${selection.timeWindow.to}` : ""
      }`
    : undefined;

  return {
    title: measures.join(" · "),
    summary: [...dimensions, ...filters, ...(time ? [time] : [])].join(" · "),
  };
}
