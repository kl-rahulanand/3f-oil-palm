import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
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
