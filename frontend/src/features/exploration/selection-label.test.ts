import type { Selection } from "@3f/contract";
import { expect, test } from "vitest";
import { selectionLabel } from "./selection-label";

test("selection labels use the shared semantic catalog and preserve unavailable identifiers", () => {
  const selection: Selection = {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual", "removed.measure"],
    dimensionIds: ["gl_code"],
    filters: [{ dimensionId: "removed_dimension", op: "eq", value: "DUB" }],
  };

  expect(selectionLabel(selection)).toEqual({
    title: "Actual · removed.measure (unavailable)",
    summary: "GL code · removed_dimension (unavailable): DUB",
  });
});
