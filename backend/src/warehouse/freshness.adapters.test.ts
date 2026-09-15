import assert from "node:assert/strict";
import { test } from "node:test";
import { StarRocksAdapter } from "./starrocks.adapter";
import { StarRocksMysqlAdapter } from "./starrocks-mysql.adapter";

test("both starrocks adapters report a typed unavailable rather than guessing or throwing", async () => {
  const expected = { status: "unsupported", freshnessKind: "load" };

  assert.deepEqual(await new StarRocksAdapter().loadFreshness(), expected);
  assert.deepEqual(await new StarRocksMysqlAdapter().loadFreshness(), expected);
});
