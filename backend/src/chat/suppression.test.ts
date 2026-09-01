import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { ResultTable } from "@pulse/contract";
import { loadConfig } from "../config";
import { applyKSuppression } from "./suppression";

const originalSuppressionK = process.env.SUPPRESSION_K;

afterEach(() => {
  if (originalSuppressionK === undefined) {
    delete process.env.SUPPRESSION_K;
  } else {
    process.env.SUPPRESSION_K = originalSuppressionK;
  }
});

test("suppresses PII measure cells for groups smaller than k and strips helper counts", () => {
  const result = applyKSuppression(resultTable(), {
    countKey: "__group_count",
    measureKeys: ["lead_count"],
    k: 5,
  });

  assert.deepEqual(
    result.columns.map((column) => column.key),
    ["state", "lead_count", "revenue"],
  );
  assert.equal(result.rows[0].lead_count, null);
  assert.equal(result.rows[0].revenue, 1200);
  assert.equal(result.rows[1].lead_count, 7);
  assert.equal(result.rows[1].revenue, 2600);
  assert.deepEqual(result.suppressedCells, [{ row: 0, key: "lead_count" }]);
  assert.equal("__group_count" in result.rows[0], false);
  assert.equal("__group_count" in result.rows[1], false);
});

test("non-PII measures are not suppressed when omitted from measureKeys", () => {
  const result = applyKSuppression(resultTable(), {
    countKey: "__group_count",
    measureKeys: ["lead_count"],
    k: 5,
  });

  assert.equal(result.rows[0].revenue, 1200);
});

test("default suppression k is 5 and suppression uses the passed k", () => {
  delete process.env.SUPPRESSION_K;
  assert.equal(loadConfig().suppressionK, 5);

  const result = applyKSuppression(resultTable(), {
    countKey: "__group_count",
    measureKeys: ["lead_count"],
    k: 10,
  });

  assert.equal(result.rows[0].lead_count, null);
  assert.equal(result.rows[1].lead_count, null);
  assert.deepEqual(result.suppressedCells, [
    { row: 0, key: "lead_count" },
    { row: 1, key: "lead_count" },
  ]);
});

test("fails closed: string-typed and missing group counts are suppressed", () => {
  const result = applyKSuppression(
    {
      columns: [
        { key: "state", label: "state", numeric: false },
        { key: "lead_count", label: "lead_count", numeric: true },
        { key: "__group_count", label: "__group_count", numeric: true },
      ],
      rows: [
        { state: "KA", lead_count: 3, __group_count: "2" as unknown as number }, // string < k
        { state: "MH", lead_count: 9, __group_count: "9" as unknown as number }, // string >= k -> shown
        { state: "TN", lead_count: 4, __group_count: null }, // missing/non-numeric -> fail closed
      ],
    },
    { countKey: "__group_count", measureKeys: ["lead_count"], k: 5 },
  );

  assert.equal(result.rows[0].lead_count, null); // "2" -> 2 < 5 -> suppressed
  assert.equal(result.rows[1].lead_count, 9); // "9" -> 9 >= 5 -> shown
  assert.equal(result.rows[2].lead_count, null); // null -> NaN -> fail closed
  assert.deepEqual(result.suppressedCells, [
    { row: 0, key: "lead_count" },
    { row: 2, key: "lead_count" },
  ]);
});

function resultTable(): ResultTable {
  return {
    columns: [
      { key: "state", label: "state", numeric: false },
      { key: "lead_count", label: "lead_count", numeric: true },
      { key: "revenue", label: "revenue", numeric: true },
      { key: "__group_count", label: "__group_count", numeric: true },
    ],
    rows: [
      { state: "KA", lead_count: 3, revenue: 1200, __group_count: 3 },
      { state: "MH", lead_count: 7, revenue: 2600, __group_count: 7 },
    ],
  };
}
