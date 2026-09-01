import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTimeWindow } from "./timeWindowParse";

const now = new Date("2026-07-09T00:00:00Z");

test("parses relative time windows", () => {
  assert.deepEqual(parseTimeWindow("last 1 year", now), { grain: "month", last: 12 });
  assert.deepEqual(parseTimeWindow("Last 30 days", now), { grain: "day", last: 30 });
  assert.deepEqual(parseTimeWindow("last 30 days", now), { grain: "day", last: 30 });
  assert.deepEqual(parseTimeWindow("(Last 30 days)", now), { grain: "day", last: 30 });
  assert.deepEqual(parseTimeWindow("last 2 weeks", now), { grain: "week", last: 2 });
  assert.deepEqual(parseTimeWindow("last 6 months", now), { grain: "month", last: 6 });
});

test("parses since and lone date expressions", () => {
  assert.deepEqual(parseTimeWindow("since 1 january", now), {
    grain: "day",
    from: "2026-01-01",
    to: "2026-07-09",
  });
  assert.deepEqual(parseTimeWindow("1 january", now), {
    grain: "day",
    from: "2026-01-01",
    to: "2026-07-09",
  });
  assert.deepEqual(parseTimeWindow("january 1", now), {
    grain: "day",
    from: "2026-01-01",
    to: "2026-07-09",
  });
});

test("parses explicit date ranges and normalizes inverted ranges", () => {
  assert.deepEqual(parseTimeWindow("2026-01-01 to 2026-07-09", now), {
    grain: "day",
    from: "2026-01-01",
    to: "2026-07-09",
  });
  assert.deepEqual(parseTimeWindow("2026-07-09 to 2026-01-01", now), {
    grain: "day",
    from: "2026-01-01",
    to: "2026-07-09",
  });
});

test("parses named month and quarter ranges", () => {
  assert.deepEqual(parseTimeWindow("january 2026", now), {
    grain: "day",
    from: "2026-01-01",
    to: "2026-01-31",
  });
  assert.deepEqual(parseTimeWindow("Jan-Mar 2026", now), {
    grain: "day",
    from: "2026-01-01",
    to: "2026-03-31",
  });
  assert.deepEqual(parseTimeWindow("Q1 2026", now), {
    grain: "day",
    from: "2026-01-01",
    to: "2026-03-31",
  });
});

test("parses current named periods", () => {
  assert.deepEqual(parseTimeWindow("this year", now), {
    grain: "day",
    from: "2026-01-01",
    to: "2026-07-09",
  });
  assert.deepEqual(parseTimeWindow("this month", now), {
    grain: "day",
    from: "2026-07-01",
    to: "2026-07-09",
  });
  assert.deepEqual(parseTimeWindow("today", now), {
    grain: "day",
    from: "2026-07-09",
    to: "2026-07-09",
  });
});

test("returns null when no clear time expression is present", () => {
  assert.equal(parseTimeWindow("leads by state", now), null);
  assert.equal(parseTimeWindow("how many active agents", now), null);
  assert.equal(parseTimeWindow("", now), null);
  assert.equal(parseTimeWindow("banana", now), null);
});
