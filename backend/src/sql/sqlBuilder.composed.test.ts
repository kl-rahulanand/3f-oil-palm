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
    { id: "plant", label: "Plant", column: "plant" },
  ],
};

const selection: Selection = {
  domain: domain.name,
  measureIds: domain.measures.map(({ id }) => id),
  dimensionIds: ["gl_code", "month"],
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

test("chosen plants filter the actual source and the budget owner joins at plant GL and month grain before every supported plant grouping", () => {
  const builder = new SqlBuilder();
  const chosen = {
    ...selection,
    filters: [{ dimensionId: "plant", op: "in" as const, value: ["CHIR", "DUB"] }],
  };
  const { sql } = builder.build(domain, chosen, multiPlantUser);
  const actualCte = sql.match(/actual_src AS \(([\s\S]*?)\n\), budget_src/)?.[1] ?? "";
  const budgetCte = sql.match(/budget_src AS \(([\s\S]*?)\n\), financial_relation/)?.[1] ?? "";
  const outerQuery = sql.slice(sql.indexOf("\nFROM financial_relation"));

  assert.match(actualCte, /SELECT plant, gl_code, month, actual_net/);
  assert.match(actualCte, /FROM actual_by_gl_month\n {2}WHERE plant IN \('CHIR', 'DUB'\)/);
  assert.match(budgetCte, /SELECT 'DUB'::text AS plant, gl_code, month/);
  assert.match(budgetCte, /FROM budget_by_gl_month\n {2}WHERE 'DUB' IN \('CHIR', 'DUB'\)/);
  assert.match(
    sql,
    /actual_src\.plant = budget_src\.plant AND actual_src\.gl_code = budget_src\.gl_code AND actual_src\.month = budget_src\.month/,
  );
  assert.doesNotMatch(outerQuery, /\bplant\b|\bWHERE\b/);
  assert.doesNotMatch(sql, /actual_by_gl_month AS \(|budget_by_gl_month AS \(/);

  for (const dimensionIds of [["plant"], ["gl_code", "plant"], ["month", "plant"], ["gl_code", "month", "plant"]]) {
    const grouped = builder.build(domain, { ...chosen, dimensionIds }, multiPlantUser).sql;
    assert.match(grouped, new RegExp(`GROUP BY ${dimensionIds.join(", ")}`));
  }

  const nonOwnerSql = builder.build(
    domain,
    { ...selection, filters: [{ dimensionId: "plant", op: "in", value: ["CHIR"] }] },
    multiPlantUser,
  ).sql;
  assert.match(nonOwnerSql, /budget_by_gl_month\n {2}WHERE 'DUB' IN \('CHIR'\)/);

  const mappedOwnerSql = builder.build(
    domain,
    { ...selection, filters: [{ dimensionId: "plant", op: "in", value: ["OWNER"] }] },
    { ...user, scope: [{ attribute: "plant", value: "OWNER" }] },
    true,
    undefined,
    { budgetOwnerPlant: "OWNER" },
  ).sql;
  assert.match(mappedOwnerSql, /SELECT 'OWNER'::text AS plant/);
  assert.match(mappedOwnerSql, /budget_by_gl_month\n {2}WHERE 'OWNER' IN \('OWNER'\)/);
  assert.doesNotMatch(mappedOwnerSql, /\bDUB\b/);
});

test("a budget comparison uses only caller-qualified plants inside both source CTEs before grouping ordering and the limit", () => {
  const selected: Selection = {
    ...selection,
    dimensionIds: ["gl_code"],
    filters: [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
    limit: 1,
  };
  const builder = new SqlBuilder();
  const queryContext = { budgetOwnerPlant: "DUB", budgetComparisonPlants: ["DUB"] };
  const sql = builder.build(domain, selected, multiPlantUser, true, undefined, queryContext).sql;

  assert.match(sql, /actual_by_gl_month\n {2}WHERE plant IN \('DUB'\)/);
  assert.match(sql, /budget_by_gl_month\n {2}WHERE 'DUB' IN \('DUB'\)/);
  assert.doesNotMatch(sql, /\bCHIR\b/);
  assert.match(sql, /GROUP BY gl_code\nHAVING[\s\S]*\nORDER BY actual DESC\nLIMIT 1$/);

  const totals = builder.buildTotals(domain, selected, multiPlantUser, undefined, queryContext).sql;
  assert.match(totals, /actual_by_gl_month\n {2}WHERE plant IN \('DUB'\)/);
  assert.doesNotMatch(totals, /\bCHIR\b|ORDER BY actual DESC|\nLIMIT 1\n\) AS filtered/);
  assert.match(totals, /\) AS filtered LIMIT 1$/);

  assert.throws(
    () =>
      builder.build(domain, selected, multiPlantUser, true, undefined, {
        budgetOwnerPlant: "DUB",
        budgetComparisonPlants: ["LON"],
      }),
    /requires at least one matching user scope value/i,
  );
});

function measure(id: string, goldObject: string, expr: string) {
  return {
    id,
    label: id,
    goldObject,
    expr,
    grain: "gl_code and month",
    impliedFilters: [],
    allowedDimensions: ["gl_code", "month", "plant"],
    piiSensitive: false,
  };
}

const multiPlantUser: AuthUser = {
  ...user,
  scope: [
    { attribute: "plant", value: "CHIR" },
    { attribute: "plant", value: "DUB" },
  ],
};
