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

test("selection labels spell out measure comparisons with registered labels and Indian digit grouping", () => {
  const selection: Selection = {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    dimensionIds: ["gl_code"],
    filters: [],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "value", value: "500000.00" },
      },
    ],
  };

  expect(selectionLabel(selection)).toEqual({
    title: "Actual · Budget",
    summary: "GL code · Actual > Budget · Actual > ₹5,00,000",
  });
});

test("an unregistered comparison measure renders that operand as unavailable", () => {
  const comparison = (measureId: string, operandMeasureId: string): Selection => ({
    domain: "governed-financial",
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    dimensionIds: ["gl_code"],
    filters: [],
    measureFilters: [
      {
        measureId,
        op: "gt",
        compareTo: { kind: "measure", measureId: operandMeasureId },
      },
    ],
  });

  expect(selectionLabel(comparison("retired.actual", "governed-financial.budget")).summary).toBe(
    "GL code · (unavailable) > Budget",
  );
  expect(selectionLabel(comparison("governed-financial.actual", "retired.budget")).summary).toBe(
    "GL code · Actual > (unavailable)",
  );
});
