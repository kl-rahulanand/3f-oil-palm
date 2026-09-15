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
    left.timeWindow?.grain === right.timeWindow?.grain &&
    left.timeWindow?.last === right.timeWindow?.last &&
    left.timeWindow?.from === right.timeWindow?.from &&
    left.timeWindow?.to === right.timeWindow?.to &&
    left.timeWindow?.column === right.timeWindow?.column &&
    left.limit === right.limit
  );
}

function equalArray<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
