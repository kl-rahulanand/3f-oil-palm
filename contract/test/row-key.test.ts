import assert from "node:assert/strict";
import { test } from "node:test";
import { askRowKey } from "../src";

test("askRowKey gives every allowed Ask grouping a stable key in semantic order", () => {
  const row = {
    gl_code: "50001201",
    leaf_key: "nursery-cost",
    month: "2026-07-19",
    plant: "CHIR",
  };

  for (const [dimensionIds, expected] of [
    [["plant"], "CHIR"],
    [["month"], "2026-07-01"],
    [["plant", "month"], "2026-07-01|CHIR"],
    [["gl_code"], "50001201"],
    [["plant", "gl_code"], "50001201|CHIR"],
    [["month", "gl_code"], "50001201|2026-07-01"],
    [["plant", "gl_code", "month"], "50001201|2026-07-01|CHIR"],
    [["leaf_key"], "nursery-cost"],
    [["plant", "leaf_key"], "nursery-cost|CHIR"],
  ] as const) {
    assert.equal(askRowKey(row, [...dimensionIds]), expected);
  }
});
