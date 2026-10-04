import assert from "node:assert/strict";
import { test } from "node:test";
import { DECORATORS } from "@nestjs/swagger/dist/constants";
import { PinResponseDto, createPinSchema, pinStatusSchema, updatePinViewSchema } from "./pins.schemas";

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

test("the pin status wire schema accepts revoked plants and rejects an unknown reason", () => {
  assert.equal(
    pinStatusSchema.safeParse({
      runnable: false,
      reason: "plants_revoked",
      message: "This view includes plants you no longer have access to: CHIR.",
    }).success,
    true,
  );
  assert.equal(
    pinStatusSchema.safeParse({
      runnable: false,
      reason: "unknown_reason",
      message: "Unavailable",
    }).success,
    false,
  );
});

test("the pin status Swagger enum documents every disabled reason", () => {
  const status = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, PinResponseDto.prototype, "status") as {
    oneOf: Array<{ properties: { reason?: { enum?: string[] } } }>;
  };

  assert.deepEqual(status.oneOf[1]?.properties.reason?.enum, [
    "grant_revoked",
    "definition_unregistered",
    "plants_revoked",
  ]);
});

function selection() {
  return {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["month"],
    filters: [],
  };
}
