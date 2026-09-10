import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SqlBuilder } from "./sqlBuilder";

const domain: DomainSpec = {
  name: "governed-financial",
  label: "Governed financial",
  goldObject: "actual_by_gl_month",
  composed: {
    sources: ["actual_by_gl_month", "budget_by_gl_month"],
    joinKeys: ["gl_code", "month"],
  },
  routingHints: [],
  scopeColumn: "plant",
  measures: [
    measure("governed-financial.actual", "actual_by_gl_month", "SUM(actual_net)"),
    measure("governed-financial.budget", "budget_by_gl_month", "SUM(budget_net)"),
  ],
  dimensions: [
    { id: "gl_code", label: "GL code", column: "gl_code" },
    { id: "month", label: "Month", column: "month" },
  ],
};

const selection: Selection = {
  domain: domain.name,
  measureIds: domain.measures.map(({ id }) => id),
  dimensionIds: domain.dimensions.map(({ id }) => id),
  filters: [],
};

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};

test("the SQL builder composes a governed financial relation as WITH aliased actual and budget CTEs that select from the real rollup views and are full outer joined on gl_code and month, with COALESCE zero-fill in the relation so an all-budget-only key yields actual_net 0 and an all-actual-only key yields budget_net 0, instead of throwing the multi gold object error, and returns objectsTouched listing both source view leaf names", () => {
  const built = new SqlBuilder().build(domain, selection, user);

  assert.deepEqual(built.objectsTouched, [
    "actual_by_gl_month",
    "budget_by_gl_month",
    "ingest_batch",
    "actual_src",
    "budget_src",
    "financial_relation",
  ]);
  assert.match(
    built.sql,
    /SELECT gl_code AS gl_code, month AS month, SUM\(actual_net\) AS actual, SUM\(budget_net\) AS budget, jsonb_agg\(DISTINCT\(source_presence\)\)::text AS source_presence/,
  );
  assert.match(built.sql, /WITH actual_src AS \([\s\S]*FROM actual_by_gl_month/);
  assert.match(built.sql, /budget_src AS \([\s\S]*FROM budget_by_gl_month/);
  assert.match(built.sql, /FULL OUTER JOIN budget_src/);
  assert.match(built.sql, /actual_src\.gl_code = budget_src\.gl_code AND actual_src\.month = budget_src\.month/);
  assert.match(built.sql, /COALESCE\(actual_src\.actual_net, 0\)::numeric\(18,2\) AS actual_net/);
  assert.match(built.sql, /COALESCE\(budget_src\.budget_net, 0\)::numeric\(18,2\) AS budget_net/);
  assert.match(built.sql, /\nLIMIT \d+$/);
});

test("the row-scope constraint is applied INSIDE each source CTE and not on the outer query: the Actual CTE filters its plant column to DUB against the user validated scope and the Budget CTE is structurally DUB by construction with no plant predicate, asserted on the composed SQL text, and the CTE aliases differ from the view names so no view is shadowed", () => {
  const { sql } = new SqlBuilder().build(domain, selection, user);
  const actualCte = sql.match(/actual_src AS \(([\s\S]*?)\n\), budget_src/)?.[1] ?? "";
  const budgetCte = sql.match(/budget_src AS \(([\s\S]*?)\n\), financial_relation/)?.[1] ?? "";
  const outerQuery = sql.slice(sql.indexOf("\nFROM financial_relation"));

  assert.match(actualCte, /FROM actual_by_gl_month\n {2}WHERE plant IN \('DUB'\)/);
  assert.match(budgetCte, /FROM budget_by_gl_month\n {2}WHERE 'DUB' IN \('DUB'\)/);
  assert.doesNotMatch(budgetCte, /\bplant\b/);
  assert.doesNotMatch(outerQuery, /\bplant\b|\bWHERE\b/);
  assert.doesNotMatch(sql, /actual_by_gl_month AS \(|budget_by_gl_month AS \(/);

  const nonDubUser = { ...user, scope: [{ attribute: "plant", value: "LON" }] };
  const nonDubSql = new SqlBuilder().build(domain, selection, nonDubUser).sql;
  assert.match(nonDubSql, /budget_by_gl_month\n {2}WHERE 'DUB' IN \('LON'\)/);
});

function measure(id: string, goldObject: string, expr: string) {
  return {
    id,
    label: id,
    goldObject,
    expr,
    grain: "gl_code and month",
    impliedFilters: [],
    allowedDimensions: ["gl_code", "month"],
    piiSensitive: false,
  };
}
