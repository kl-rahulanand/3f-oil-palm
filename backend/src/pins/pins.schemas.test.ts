import assert from "node:assert/strict";
import { test } from "node:test";
import { updatePinViewSchema } from "./pins.schemas";

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
