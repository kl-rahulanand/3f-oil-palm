import type { Selection } from "@3f/contract";
import { expect, test } from "vitest";
import { selectionsEqual } from "./selection-identity.helper";

const selection: Selection = {
  domain: "governed-financial",
  measureIds: ["actual", "budget"],
  dimensionIds: ["gl_code", "month"],
  filters: [{ dimensionId: "plant", op: "in", value: ["DUB", "JVR"] }],
  timeWindow: { grain: "month", last: 2, from: "2026-06-01", to: "2026-07-01", column: "month" },
  limit: 25,
};

const measureFilters: NonNullable<Selection["measureFilters"]> = [
  {
    measureId: "governed-financial.actual",
    op: "gt",
    compareTo: { kind: "measure", measureId: "governed-financial.budget" },
  },
  {
    measureId: "governed-financial.actual",
    op: "lte",
    compareTo: { kind: "value", value: "500000.00" },
  },
];

test("selections differing in any single field are not equal", () => {
  const variants: Selection[] = [
    { ...selection, domain: "mis-statement" },
    { ...selection, measureIds: ["actual"] },
    { ...selection, dimensionIds: ["gl_code"] },
    { ...selection, filters: [{ dimensionId: "department", op: "in", value: ["DUB", "JVR"] }] },
    { ...selection, filters: [{ dimensionId: "plant", op: "eq", value: ["DUB", "JVR"] }] },
    { ...selection, filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }] },
    { ...selection, timeWindow: { ...selection.timeWindow!, grain: "day" } },
    { ...selection, timeWindow: { ...selection.timeWindow!, last: 1 } },
    { ...selection, timeWindow: { ...selection.timeWindow!, from: "2026-05-01" } },
    { ...selection, timeWindow: { ...selection.timeWindow!, to: "2026-08-01" } },
    { ...selection, timeWindow: { ...selection.timeWindow!, column: "posting_date" } },
    { ...selection, timeWindow: undefined },
    { ...selection, limit: 50 },
    { ...selection, limit: undefined },
  ];

  expect(selectionsEqual(selection, { ...selection })).toBe(true);
  expect(variants.every((variant) => !selectionsEqual(selection, variant))).toBe(true);
});

test("selections differing only in array order are not equal", () => {
  expect(selectionsEqual(selection, { ...selection, measureIds: [...selection.measureIds].reverse() })).toBe(false);
  expect(selectionsEqual(selection, { ...selection, dimensionIds: [...selection.dimensionIds].reverse() })).toBe(false);
  expect(
    selectionsEqual(selection, {
      ...selection,
      filters: [{ ...selection.filters[0]!, value: ["JVR", "DUB"] }],
    }),
  ).toBe(false);
});

test("two reports sharing a label title but differing in dimensions are not the same selection", () => {
  const byGlCode = { ...selection, dimensionIds: ["gl_code"] };
  const byMonth = { ...selection, dimensionIds: ["month"] };

  expect(byGlCode.measureIds.join(" · ")).toBe(byMonth.measureIds.join(" · "));
  expect(selectionsEqual(byGlCode, byMonth)).toBe(false);
});

test("selections differing only in measure comparisons are not equal", () => {
  const filtered = { ...selection, measureFilters };

  expect(
    selectionsEqual(filtered, { ...filtered, measureFilters: measureFilters.map((filter) => ({ ...filter })) }),
  ).toBe(true);
  expect(selectionsEqual(filtered, selection)).toBe(false);
  expect(selectionsEqual(filtered, { ...filtered, measureFilters: [...measureFilters].reverse() })).toBe(false);
  expect(
    selectionsEqual(filtered, {
      ...filtered,
      measureFilters: [{ ...measureFilters[0]!, op: "gte" }, measureFilters[1]!],
    }),
  ).toBe(false);
  expect(
    selectionsEqual(filtered, {
      ...filtered,
      measureFilters: [measureFilters[0]!, { ...measureFilters[1]!, compareTo: { kind: "value", value: "600000.00" } }],
    }),
  ).toBe(false);
});
