import assert from "node:assert/strict";
import { test } from "node:test";
import { SemanticLayer } from "./semanticLayer";

test("the statement semantic domain registers the governed leaf month measures and dimensions", () => {
  const domain = new SemanticLayer().domain("mis-statement");

  assert.ok(domain);
  assert.equal(domain.goldObject, "statement_relation");
  assert.equal(domain.scopeColumn, "plant");
  assert.deepEqual(
    domain.measures.map(({ id }) => id),
    [
      "mis-statement.actual_net",
      "mis-statement.budget_net",
      "mis-statement.rollover_net",
      "mis-statement.percentage",
    ],
  );
  assert.deepEqual(
    domain.dimensions.map(({ id }) => id),
    ["leaf_key", "month"],
  );
});
