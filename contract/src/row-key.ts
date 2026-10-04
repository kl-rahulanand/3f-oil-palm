import type { ResultTable } from "./api";

const ROW_KEY_DIMENSIONS = ["gl_code", "leaf_key", "month", "plant"] as const;

export function askRowKey(row: ResultTable["rows"][number], dimensionIds: string[]): string {
  const groupedDimensions = new Set(dimensionIds);
  return ROW_KEY_DIMENSIONS.filter((dimensionId) => groupedDimensions.has(dimensionId))
    .map((dimensionId) => {
      const value = String(row[dimensionId]);
      return dimensionId === "month" ? `${value.slice(0, 7)}-01` : value;
    })
    .join("|");
}
