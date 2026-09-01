import { createHash } from "crypto";
import type { MeasureSpec } from "@pulse/contract";

export function computeDefinitionVersion(measures: MeasureSpec[]): string {
  const payload = measures
    .map((measure) => ({
      id: measure.id,
      expr: measure.expr,
      impliedFilters: measure.impliedFilters,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}
