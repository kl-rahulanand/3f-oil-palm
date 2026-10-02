import type { Selection } from "@3f/contract";

export function selectionsEqual(left: Selection, right: Selection): boolean {
  return (
    left.domain === right.domain &&
    equalArray(left.measureIds, right.measureIds) &&
    equalArray(left.dimensionIds, right.dimensionIds) &&
    left.filters.length === right.filters.length &&
    left.filters.every((filter, index) => {
      const other = right.filters[index];
      return (
        other !== undefined &&
        filter.dimensionId === other.dimensionId &&
        filter.op === other.op &&
        (Array.isArray(filter.value) && Array.isArray(other.value)
          ? equalArray(filter.value, other.value)
          : filter.value === other.value)
      );
    }) &&
    equalMeasureFilters(left.measureFilters, right.measureFilters) &&
    left.timeWindow?.grain === right.timeWindow?.grain &&
    left.timeWindow?.last === right.timeWindow?.last &&
    left.timeWindow?.from === right.timeWindow?.from &&
    left.timeWindow?.to === right.timeWindow?.to &&
    left.timeWindow?.column === right.timeWindow?.column &&
    left.limit === right.limit
  );
}

function equalMeasureFilters(left: Selection["measureFilters"], right: Selection["measureFilters"]): boolean {
  const leftFilters = left ?? [];
  const rightFilters = right ?? [];
  return (
    leftFilters.length === rightFilters.length &&
    leftFilters.every((filter, index) => {
      const other = rightFilters[index];
      return (
        other !== undefined &&
        filter.measureId === other.measureId &&
        filter.op === other.op &&
        filter.compareTo.kind === other.compareTo.kind &&
        (filter.compareTo.kind === "measure" && other.compareTo.kind === "measure"
          ? filter.compareTo.measureId === other.compareTo.measureId
          : filter.compareTo.kind === "value" &&
            other.compareTo.kind === "value" &&
            filter.compareTo.value === other.compareTo.value)
      );
    })
  );
}

function equalArray<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
