import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SqlBuilder, type GovernedSelectionScope } from "./sqlBuilder";

test("the statement projection full outer joins budget and actual at leaf and month grain filtering actuals by the resolved triples before aggregating and leaves the gl code and month relation untouched", () => {
  const builder = new SqlBuilder();
  const statement = builder.build(statementDomain, statementSelection, user, true, scope);
  const actualCte = statement.sql.match(/actual_by_leaf_month AS \(([\s\S]*?)\n\), budget_src/)?.[1] ?? "";
  const budgetCte = statement.sql.match(/budget_src AS \(([\s\S]*?)\n\), statement_relation/)?.[1] ?? "";

  assert.match(statement.sql, /leaf_targets\(plant, cost_center, gl_code, leaf_key\) AS/);
  assert.match(statement.sql, /\('DUB', 'Primary', '50001605', '4\.5\|50001605\|fertilizers-manures'\)/);
  assert.match(statement.sql, /\('DUB', 'Primary', '50001701', 'unmapped-GL'\)/);
  assert.match(actualCte, /FROM actual_by_key_month AS actual/);
  assert.match(actualCte, /target\.plant = actual\.plant/);
  assert.match(actualCte, /target\.cost_center = actual\.cost_center/);
  assert.match(actualCte, /target\.gl_code = actual\.gl_code/);
  assert.match(actualCte, /WHERE actual\.plant IN \('DUB'\)/);
  assert.match(actualCte, /actual\.month >= '2026-07-01' AND actual\.month < '2026-07-02'/);
  assert.ok(actualCte.indexOf("INNER JOIN leaf_targets") < actualCte.indexOf("GROUP BY target.leaf_key"));
  assert.match(budgetCte, /FROM budget_by_leaf_month/);
  assert.match(budgetCte, /WHERE 'DUB' IN \('DUB'\)/);
  assert.match(statement.sql, /FULL OUTER JOIN budget_src/);
  assert.match(statement.sql, /actual_src\.leaf_key = budget_src\.leaf_key AND actual_src\.month = budget_src\.month/);
  assert.match(statement.sql, /COALESCE\(actual_src\.actual_net, 0\)::numeric\(18,2\)/);
  assert.match(statement.sql, /COALESCE\(budget_src\.budget_net, 0\)::numeric\(18,2\)/);

  const shipped = builder.build(domain, selection, user, true, scope);
  assert.match(shipped.sql, /GROUP BY gl_code, month/);
  assert.match(shipped.sql, /actual_src\.gl_code = budget_src\.gl_code/);
  assert.doesNotMatch(shipped.sql, /leaf_targets|budget_by_leaf_month|statement_relation/);
});

const user: AuthUser = {
  id: "proof-user",
  email: "proof@example.com",
  display_name: "Proof",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};

const scope: GovernedSelectionScope = {
  triples: [
    { plant: "DUB", costCenter: "Primary", glCode: "50001605" },
    { plant: "DUB", costCenter: "Primary", glCode: "50001701" },
  ],
  glCodes: ["50001605", "50001701"],
  masterGlCodes: ["50001605", "50001701"],
  leafTargets: [
    {
      plant: "DUB",
      costCenter: "Primary",
      glCode: "50001605",
      target: { kind: "leaf", leafKey: "4.5|50001605|fertilizers-manures" },
    },
    { plant: "DUB", costCenter: "Primary", glCode: "50001701", target: { kind: "bucket" } },
  ],
};

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

const statementDomain: DomainSpec = { ...domain, name: "mis-statement", goldObject: "statement_relation" };
const statementSelection: Selection = {
  ...selection,
  domain: statementDomain.name,
  timeWindow: { column: "month", from: "2026-07-01", to: "2026-07-01" },
};
