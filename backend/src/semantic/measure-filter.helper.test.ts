import assert from "node:assert/strict";
import { test } from "node:test";
import { MeasureFilterInvalidReason, type AuthUser, type MeasureFilter, type Selection } from "@3f/contract";
import { canonicalizeSelection, normalizeMeasureFilters } from "./measure-filter.helper";
import { MeasureFilterInvalidException } from "./measure-filter-invalid.exception";
import { SemanticLayer } from "./semanticLayer";
import { validateSelectionForUser } from "./selectionValidation";

const semantic = new SemanticLayer();
const domain = semantic.domain("governed-financial")!;
const actual = "governed-financial.actual";
const budget = "governed-financial.budget";

test("normalizeMeasureFilters accepts gt gte lt lte between two money measures and normalises a decimal value lexically to two decimals including a value above MAX_SAFE_INTEGER and negative zero", () => {
  const comparisons = (["gt", "gte", "lt", "lte"] as const).map((op) => ({
    measureId: actual,
    op,
    compareTo: { kind: "measure" as const, measureId: budget },
  }));
  assert.deepEqual(normalizeMeasureFilters(domain, comparisons), comparisons);
  assert.deepEqual(normalizeMeasureFilters(domain, [valueFilter("12345678901234567.89"), valueFilter("-0", "lte")]), [
    valueFilter("12345678901234567.89"),
    valueFilter("0.00", "lte"),
  ]);
  assert.equal(normalizeMeasureFilters(domain, [valueFilter("12.3")])[0]!.compareTo.kind, "value");
  assert.deepEqual(normalizeMeasureFilters(domain, [valueFilter("12.3")])[0]!.compareTo, {
    kind: "value",
    value: "12.30",
  });
});

test("normalizeMeasureFilters refuses a percent operand an unknown measure a self comparison a duplicate entry and a malformed value with typed reasons", () => {
  const cases: Array<[MeasureFilter[], MeasureFilterInvalidReason]> = [
    [
      [{ measureId: "governed-financial.percentage", op: "gt", compareTo: { kind: "measure", measureId: budget } }],
      MeasureFilterInvalidReason.NotComparable,
    ],
    [
      [{ measureId: "governed-financial.unknown", op: "gt", compareTo: { kind: "measure", measureId: budget } }],
      MeasureFilterInvalidReason.UnknownMeasure,
    ],
    [
      [{ measureId: actual, op: "gt", compareTo: { kind: "measure", measureId: actual } }],
      MeasureFilterInvalidReason.SelfComparison,
    ],
    [[valueFilter("1"), valueFilter("1.00")], MeasureFilterInvalidReason.Duplicate],
    [[valueFilter("1.234")], MeasureFilterInvalidReason.MalformedValue],
  ];
  for (const [filters, reason] of cases) {
    assert.throws(
      () => normalizeMeasureFilters(domain, filters),
      (error) => error instanceof MeasureFilterInvalidException && error.reason === reason,
    );
  }
});

test("canonicalizeSelection appends operand measures in first appearance order leaves the first measure unchanged and returns a selection without filters unchanged", () => {
  const unchanged = selection();
  assert.equal(canonicalizeSelection(domain, unchanged), unchanged);

  const input = {
    ...selection(),
    measureFilters: [
      { measureId: actual, op: "gt" as const, compareTo: { kind: "measure" as const, measureId: budget } },
      valueFilter("100"),
    ],
  };
  const canonical = canonicalizeSelection(domain, input);
  assert.deepEqual(canonical.measureIds, [actual, budget]);
  assert.equal(canonical.measureIds[0], input.measureIds[0]);
  assert.equal((canonical.measureFilters?.[1]?.compareTo as { value: string }).value, "100.00");
});

test("validateSelectionForUser refuses an operand measure outside the domain or the user permissions even when measureIds are permitted", () => {
  const permitted = user([actual]);
  assert.throws(
    () =>
      validateSelectionForUser(semantic, permitted, {
        ...selection(),
        measureFilters: [{ measureId: actual, op: "gt", compareTo: { kind: "measure", measureId: budget } }],
      }),
    /Measure not available: governed-financial\.budget/,
  );
  assert.throws(
    () =>
      validateSelectionForUser(semantic, user([actual, "other.measure"]), {
        ...selection(),
        measureFilters: [{ measureId: actual, op: "gt", compareTo: { kind: "measure", measureId: "other.measure" } }],
      }),
    /Measure not available: other\.measure/,
  );
});

function valueFilter(value: string, op: MeasureFilter["op"] = "gt"): MeasureFilter {
  return { measureId: actual, op, compareTo: { kind: "value", value } };
}

function selection(): Selection {
  return { domain: domain.name, measureIds: [actual], dimensionIds: [], filters: [] };
}

function user(measureIds: string[]): AuthUser {
  return {
    id: "user-1",
    email: "finance@example.com",
    display_name: "Finance",
    is_active: true,
    roles: ["finance"],
    permissions: { actions: ["report"], domains: [domain.name], measureIds, dimensionIds: [] },
    scope: [{ attribute: "plant", value: "DUB" }],
  };
}
