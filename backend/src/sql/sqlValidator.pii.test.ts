import assert from "node:assert/strict";
import { test } from "node:test";
import { SqlValidator } from "./sqlValidator";

test("blocked columns are rejected case-insensitively by leaf column name", () => {
  const validator = new SqlValidator();

  const blocked = validator.validate(
    "SELECT customer_name FROM analytics.gold_customers WHERE state = 'KA' LIMIT 10",
    ["analytics.gold_customers"],
    100,
    ["CUSTOMER_NAME"],
  );
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason ?? "", /blocked column: customer_name/i);

  const allowed = validator.validate(
    "SELECT state FROM analytics.gold_customers WHERE state = 'KA' LIMIT 10",
    ["analytics.gold_customers"],
    100,
    ["customer_name"],
  );
  assert.equal(allowed.ok, true);
});

test("PostgreSQL aggregate FILTER syntax is accepted", () => {
  const validator = new SqlValidator();
  const result = validator.validate(
    "SELECT COUNT(*) FILTER (WHERE amount > 0) AS positive_count FROM WarehouseFixture LIMIT 10",
    ["WarehouseFixture"],
    100,
  );

  assert.equal(result.ok, true, result.reason);
});
