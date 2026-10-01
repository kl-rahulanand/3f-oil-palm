import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder, type GovernedSelectionScope } from "./sqlBuilder";
import { SqlValidator } from "./sqlValidator";

test("the composed builder narrows to a resolved selection by filtering the triples on actual by key month and re aggregating to gl code and month before the full outer join and by restricting the budget side to the resolved GL set at its unchanged grain, lists actual by key month among the objects touched so the validator still passes, and leaves an unselected composed query on its previous path", () => {
  const builder = new SqlBuilder();
  const unselected = builder.build(domain, selection, user);
  const selected = builder.build(
    domain,
    { ...selection, timeWindow: { grain: "month", from: "2026-04-01", to: "2026-07-01", column: "month" } },
    user,
    true,
    resolvedScope,
  );
  const actualCte = selected.sql.match(/actual_src AS \(([\s\S]*?)\n\), budget_src/)?.[1] ?? "";
  const budgetCte = selected.sql.match(/budget_src AS \(([\s\S]*?)\n\), financial_relation/)?.[1] ?? "";

  assert.match(actualCte, /SELECT gl_code, month, SUM\(actual_net\)::numeric\(18,2\) AS actual_net/);
  assert.match(actualCte, /FROM actual_by_key_month/);
  assert.match(actualCte, /WHERE plant IN \('DUB'\)/);
  assert.match(actualCte, /month >= '2026-04-01' AND month < '2026-07-02'/);
  assert.match(actualCte, /\(plant, cost_center, gl_code\) IN \(\('DUB', 'Primary', '5000'\)\)/);
  assert.match(actualCte, /GROUP BY gl_code, month$/);
  assert.match(budgetCte, /FROM budget_by_gl_month/);
  assert.match(budgetCte, /month >= '2026-04-01' AND month < '2026-07-02'/);
  assert.match(budgetCte, /gl_code IN \('5000'\) OR gl_code NOT IN \('5000', '6000'\)/);
  assert.doesNotMatch(budgetCte, /cost_center|GROUP BY/);
  assert.ok(selected.objectsTouched.includes("actual_by_key_month"));
  assert.deepEqual(new SqlValidator().validate(selected.sql, selected.objectsTouched, 1000), { ok: true });

  assert.match(unselected.sql, /FROM actual_by_gl_month\n {2}WHERE plant IN \('DUB'\)/);
  assert.doesNotMatch(unselected.sql, /actual_by_key_month|cost_center/);
  assert.doesNotMatch(unselected.sql, /gl_code IN/);
  assert.ok(!unselected.objectsTouched.includes("actual_by_key_month"));
});

test("the builder renders a HAVING over the verified expressions for measure versus measure measure versus value and an ungrouped selection with a dimension filter and a time window", () => {
  const builder = new SqlBuilder();
  const semanticDomain = new SemanticLayer().domain("governed-financial")!;
  const filtered: Selection = {
    domain: semanticDomain.name,
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    dimensionIds: ["gl_code"],
    filters: [{ dimensionId: "gl_code", op: "eq", value: "5000" }],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
      { measureId: "governed-financial.actual", op: "lte", compareTo: { kind: "value", value: "500000.00" } },
    ],
    timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-31" },
  };
  const grouped = builder.build(semanticDomain, filtered, user).sql;
  assert.match(grouped, /WHERE gl_code = '5000'/);
  assert.match(grouped, /month >= '2026-07-01' AND month < '2026-08-01'/);
  assert.match(
    grouped,
    /GROUP BY gl_code\nHAVING SUM\(actual_net\) > SUM\(budget_net\) AND SUM\(actual_net\) <= '500000\.00'/,
  );

  const ungrouped = builder.build(semanticDomain, { ...filtered, dimensionIds: [], filters: [] }, user).sql;
  assert.match(ungrouped, /WHERE[\s\S]*\nHAVING SUM\(actual_net\) > SUM\(budget_net\)/);
  assert.doesNotMatch(ungrouped, /GROUP BY/);
});

test("buildTotals is unchanged without measure filters and wraps the grouped query without its LIMIT as a derived table with an outer LIMIT 1 when filters are present", () => {
  const builder = new SqlBuilder();
  const semanticDomain = new SemanticLayer().domain("governed-financial")!;
  const base: Selection = {
    domain: semanticDomain.name,
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
    filters: [],
    limit: 5,
  };
  assert.deepEqual(
    builder.buildTotals(semanticDomain, base, user),
    builder.build(semanticDomain, { ...base, dimensionIds: [] }, user, false),
  );

  const totals = builder.buildTotals(
    semanticDomain,
    { ...base, measureFilters: [valueFilter("governed-financial.actual")] },
    user,
  );
  assert.match(totals.sql, /^SELECT SUM\(actual\) AS actual FROM \(/);
  assert.match(totals.sql, /GROUP BY gl_code\nHAVING SUM\(actual_net\) > '1\.00'[\s\S]*\) AS filtered LIMIT 1$/);
  assert.doesNotMatch(totals.sql.match(/FROM \(([\s\S]*)\) AS filtered/)?.[1] ?? "", /\nLIMIT \d+/);
  assert.deepEqual(new SqlValidator().validate(totals.sql, totals.objectsTouched, 1000), { ok: true });
});

test("buildTotals totals a percent display measure through totalsOverAliases in both domains and a money measure as the sum of its alias", () => {
  const builder = new SqlBuilder();
  const semantic = new SemanticLayer();
  const financial = semantic.domain("governed-financial")!;
  const financialTotals = builder.buildTotals(
    financial,
    {
      domain: financial.name,
      measureIds: ["governed-financial.actual", "governed-financial.percentage"],
      dimensionIds: ["gl_code"],
      filters: [],
      measureFilters: [valueFilter("governed-financial.actual")],
    },
    user,
  ).sql;
  assert.match(financialTotals, /SELECT SUM\(actual\) AS actual, CASE[\s\S]*SUM\(budget\)[\s\S]*AS percentage FROM \(/);

  const statement = semantic.domain("mis-statement")!;
  const statementTotals = builder.buildTotals(
    statement,
    {
      domain: statement.name,
      measureIds: ["mis-statement.actual_net", "mis-statement.percentage"],
      dimensionIds: ["leaf_key"],
      filters: [],
      measureFilters: [valueFilter("mis-statement.actual_net")],
      timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
    },
    user,
    statementScope,
  ).sql;
  assert.match(
    statementTotals,
    /SELECT SUM\(actual_net\) AS actual_net, CASE[\s\S]*SUM\(budget_net\)[\s\S]*AS percentage FROM \(/,
  );
});

function valueFilter(measureId: string) {
  return { measureId, op: "gt" as const, compareTo: { kind: "value" as const, value: "1.00" } };
}

const domain: DomainSpec = {
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
  ],
  dimensions: [
    { id: "gl_code", label: "GL code", column: "gl_code" },
    { id: "month", label: "Month", column: "month" },
  ],
};

const selection: Selection = {
  domain: domain.name,
  measureIds: [domain.measures[0].id],
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

const resolvedScope: GovernedSelectionScope = {
  triples: [{ plant: "DUB", costCenter: "Primary", glCode: "5000" }],
  glCodes: ["5000"],
  masterGlCodes: ["5000", "6000"],
};

const statementScope: GovernedSelectionScope = {
  ...resolvedScope,
  leafTargets: [{ plant: "DUB", costCenter: "Primary", glCode: "5000", target: { kind: "leaf", leafKey: "leaf-1" } }],
};
