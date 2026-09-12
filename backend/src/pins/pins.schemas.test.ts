import assert from "node:assert/strict";
import { test } from "node:test";
import { createPinSchema, updatePinViewSchema } from "./pins.schemas";

test("updatePinViewSchema rejects an invalid chart type", () => {
  const parsed = updatePinViewSchema.safeParse({
    view: { chartType: "scatter" },
  });

  assert.equal(parsed.success, false);
});

test("updatePinViewSchema rejects an invalid sort direction", () => {
  const parsed = updatePinViewSchema.safeParse({
    view: {
      sort: { key: "state", direction: "sideways" },
    },
  });

  assert.equal(parsed.success, false);
});

test("pin request schemas reject unknown fields at every object boundary", () => {
  assert.equal(createPinSchema.safeParse({ selection: selection(), unexpected: true }).success, false);
  assert.equal(createPinSchema.safeParse({ selection: { ...selection(), unexpected: true } }).success, false);
  assert.equal(
    createPinSchema.safeParse({
      selection: { ...selection(), filters: [{ dimensionId: "month", op: "eq", value: "2026-07", extra: true }] },
    }).success,
    false,
  );
});

function selection() {
  return {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["month"],
    filters: [],
  };
}
