import assert from "node:assert/strict";
import { test } from "node:test";
import { Parser } from "node-sql-parser";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SqlBuilder } from "./sqlBuilder";
import { SqlValidator } from "./sqlValidator";

test("the composed WITH full-outer-join query passes sqlValidator when the two source view leaf names AND the builder deterministic CTE alias names are all in the allowed objects, and is rejected when a source view leaf is removed from the allow-list, proving the base view allow-list is the enforced security check while the code-fixed CTE alias names are not a data-source bypass", () => {
  const { sql, objectsTouched } = new SqlBuilder().build(composedDomain, composedSelection, scopedUser);
  const validator = new SqlValidator();
  const tables = new Parser().tableList(sql, { database: "postgresql" }).map((entry) => entry.split("::").pop());

  assert.deepEqual(tables.sort(), [
    "actual_by_gl_month",
    "actual_src",
    "budget_by_gl_month",
    "budget_src",
    "financial_relation",
    "ingest_batch",
  ]);
  assert.deepEqual(objectsTouched, [
    "actual_by_gl_month",
    "budget_by_gl_month",
    "ingest_batch",
    "actual_src",
    "budget_src",
    "financial_relation",
  ]);
  assert.deepEqual(validator.validate(sql, objectsTouched, 1000), { ok: true });
  assert.deepEqual(
    validator.validate(
      sql,
      objectsTouched.filter((object) => object !== "actual_src"),
      1000,
    ),
    { ok: false, reason: "unapproved object: actual_src" },
  );
  assert.deepEqual(
    validator.validate(
      sql,
      objectsTouched.filter((object) => object !== "budget_by_gl_month"),
      1000,
    ),
    {
      ok: false,
      reason: "unapproved object: budget_by_gl_month",
    },
  );
});

const composedDomain: DomainSpec = {
  name: "governed-financial",
  label: "Governed financial",
  goldObject: "actual_by_gl_month",
  composed: { sources: ["actual_by_gl_month", "budget_by_gl_month"], joinKeys: ["gl_code", "month"] },
  routingHints: [],
  scopeColumn: "plant",
  measures: [
    {
      id: "governed-financial.actual",
      label: "Actual",
      goldObject: "actual_by_gl_month",
      expr: "SUM(actual_net)",
      grain: "gl_code and month",
      impliedFilters: [],
      allowedDimensions: ["gl_code", "month"],
      piiSensitive: false,
    },
    {
      id: "governed-financial.budget",
      label: "Budget",
      goldObject: "budget_by_gl_month",
      expr: "SUM(budget_net)",
      grain: "gl_code and month",
      impliedFilters: [],
      allowedDimensions: ["gl_code", "month"],
      piiSensitive: false,
    },
  ],
  dimensions: [
    { id: "gl_code", label: "GL code", column: "gl_code" },
    { id: "month", label: "Month", column: "month" },
  ],
};

const composedSelection: Selection = {
  domain: composedDomain.name,
  measureIds: composedDomain.measures.map(({ id }) => id),
  dimensionIds: composedDomain.dimensions.map(({ id }) => id),
  filters: [],
};

const scopedUser: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};
