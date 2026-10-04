import assert from "node:assert/strict";
import { test } from "node:test";
import type { Selection, SelectionFilter } from "@3f/contract";
import { withoutRedundantMonthFilter } from "./redundant-month-filter";

const julyWindow: NonNullable<Selection["timeWindow"]> = {
  grain: "day",
  from: "2026-07-01",
  to: "2026-07-31",
  column: "month",
};

test("removes a month equality filter already expressed by a single-calendar-month window", () => {
  const redundant = monthFilter("eq", "2026-07-01");

  assert.deepEqual(withoutRedundantMonthFilter(selection([redundant], julyWindow)).filters, []);
});

test("keeps month filters that are not the exact redundant shape", () => {
  const cases: Array<{
    name: string;
    filter: SelectionFilter;
    timeWindow?: Selection["timeWindow"];
  }> = [
    { name: "another month", filter: monthFilter("eq", "2026-06-01"), timeWindow: julyWindow },
    { name: "in", filter: monthFilter("in", ["2026-07-01"]), timeWindow: julyWindow },
    { name: "neq", filter: monthFilter("neq", "2026-07-01"), timeWindow: julyWindow },
    {
      name: "an array equality value",
      filter: monthFilter("eq", ["2026-07-01"]),
      timeWindow: julyWindow,
    },
    {
      name: "a multi-month window",
      filter: monthFilter("eq", "2026-07-01"),
      timeWindow: { ...julyWindow, to: "2026-08-31" },
    },
    { name: "no window", filter: monthFilter("eq", "2026-07-01") },
  ];

  for (const { name, filter, timeWindow } of cases) {
    assert.deepEqual(withoutRedundantMonthFilter(selection([filter], timeWindow)).filters, [filter], name);
  }
});

test("removes only the redundant month filter when another filter is present", () => {
  const glCodeFilter: SelectionFilter = { dimensionId: "gl_code", op: "eq", value: "50001201" };

  assert.deepEqual(
    withoutRedundantMonthFilter(selection([monthFilter("eq", "2026-07-01"), glCodeFilter], julyWindow)).filters,
    [glCodeFilter],
  );
});

function selection(filters: SelectionFilter[], timeWindow?: Selection["timeWindow"]): Selection {
  return {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
    filters,
    ...(timeWindow ? { timeWindow } : {}),
  };
}

function monthFilter(op: SelectionFilter["op"], value: SelectionFilter["value"]): SelectionFilter {
  return { dimensionId: "month", op, value };
}
