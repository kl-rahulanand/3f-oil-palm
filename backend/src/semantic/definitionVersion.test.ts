import assert from "node:assert/strict";
import { test } from "node:test";
import type { MeasureSpec } from "@pulse/contract";
import { computeDefinitionVersion } from "./definitionVersion";

test("computeDefinitionVersion is stable for the same measures", () => {
  assert.equal(computeDefinitionVersion([measure("a", "COUNT(*)")]), computeDefinitionVersion([measure("a", "COUNT(*)")]));
});

test("computeDefinitionVersion changes when a measure expression changes", () => {
  assert.notEqual(computeDefinitionVersion([measure("a", "COUNT(*)")]), computeDefinitionVersion([measure("a", "SUM(amount)")]));
});

test("computeDefinitionVersion is order-independent", () => {
  const first = computeDefinitionVersion([measure("b", "SUM(amount)"), measure("a", "COUNT(*)")]);
  const second = computeDefinitionVersion([measure("a", "COUNT(*)"), measure("b", "SUM(amount)")]);

  assert.equal(first, second);
});

function measure(id: string, expr: string): MeasureSpec {
  return {
    id,
    label: id,
    goldObject: "fixture.gold",
    expr,
    grain: "fixture",
    impliedFilters: ["record_type <> 'TEST'"],
    allowedDimensions: [],
    piiSensitive: false,
  };
}
