import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { SqlBuilder, type GovernedSelectionScope } from "./sqlBuilder";
import { SqlValidator } from "./sqlValidator";

test("the statement projection full outer joins budget and actual at leaf and month grain filtering actuals by the resolved triples before aggregating and leaves the gl code and month relation untouched", () => {
  const builder = new SqlBuilder();
  const statement = builder.build(statementDomain, statementSelection, user, true, scope);
  const actualCte = statement.sql.match(/actual_by_leaf_month AS \(([\s\S]*?)\n\), budget_src/)?.[1] ?? "";
  const budgetCte = statement.sql.match(/budget_src AS \(([\s\S]*?)\n\), outline_order/)?.[1] ?? "";

  assert.match(statement.sql, /AS target\(plant, cost_center, gl_code, leaf_key\)/);
  assert.match(statement.sql, /\('DUB', 'Primary', '50001605', '4\.5\|50001605\|fertilizers-manures'\)/);
  assert.match(statement.sql, /\('DUB', 'Primary', '50001701', 'unmapped-GL'\)/);
  assert.match(actualCte, /FROM actual_by_key_month AS actual/);
  assert.match(actualCte, /target\.plant = actual\.plant/);
  assert.match(actualCte, /target\.cost_center = actual\.cost_center/);
  assert.match(actualCte, /target\.gl_code = actual\.gl_code/);
  assert.match(actualCte, /WHERE actual\.plant IN \('DUB'\)/);
  assert.match(actualCte, /actual\.month >= '2026-07-01' AND actual\.month < '2026-07-02'/);
  assert.match(actualCte, /GROUP BY target\.leaf_key, actual\.month/);
  assert.ok(actualCte.indexOf("INNER JOIN leaf_targets") < actualCte.indexOf("GROUP BY target.leaf_key"));
  assert.match(budgetCte, /FROM budget_by_leaf_month/);
  assert.match(budgetCte, /WHERE 'DUB' IN \('DUB'\)/);
  assert.match(statement.sql, /FULL OUTER JOIN budget_src/);
  assert.match(statement.sql, /actual_src\.leaf_key = budget_src\.leaf_key AND actual_src\.month = budget_src\.month/);
  assert.match(statement.sql, /COALESCE\(actual_src\.actual_net, 0\)::numeric\(18,2\)/);
  assert.match(statement.sql, /COALESCE\(budget_src\.budget_net, 0\)::numeric\(18,2\)/);
  assert.match(statement.sql, /outline\.batch_id/);
  assert.doesNotMatch(statement.sql, /actual_batch\.plant|budget_batch\.plant/);
  assert.match(statement.sql, /GROUP BY relation\.leaf_key, outline\.sort_order/);
  assert.match(statement.sql, /SUM\(actual_net\) AS actual_net/);
  assert.match(statement.sql, /array_agg\(DISTINCT\(relation\.source_presence\)\)/);
  assert.match(statement.sql, /ORDER BY outline\.sort_order NULLS LAST, relation\.leaf_key/);
  assert.doesNotMatch(statement.sql, /::date AS month/);

  const shipped = builder.build(domain, selection, user, true, scope);
  assert.match(shipped.sql, /GROUP BY gl_code, month/);
  assert.match(shipped.sql, /actual_src\.gl_code = budget_src\.gl_code/);
  assert.doesNotMatch(shipped.sql, /leaf_targets|budget_by_leaf_month|statement_relation/);
});

test("the statement query runs through the selection executor validate explain execute path with its mandatory bounded limit rather than being built by hand", async () => {
  const warehouse = new StatementWarehouse();
  const domain = new SemanticLayer().domain("mis-statement");
  assert.ok(domain);

  const result = await new SelectionExecutor(new SqlBuilder(), new SqlValidator(), warehouse).run(
    statementUser,
    domain,
    {
      domain: domain.name,
      measureIds: domain.measures.map(({ id }) => id),
      dimensionIds: ["leaf_key"],
      filters: [],
      timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
    },
    { includeTotals: false, resolvedScope: scope },
  );

  assert.equal(warehouse.explainCalls, 1);
  assert.equal(warehouse.executeCalls, 1);
  assert.match(result.sql, /LIMIT \d+$/);
  assert.deepEqual(result.result.rows, [
    {
      leaf_key: "4.5|50001605|fertilizers-manures",
      actual_net: "25.00",
      budget_net: "20.00",
      rollover_net: "0.00",
      percentage: "1.25",
    },
  ]);
});

test("the statement projection returns only the selected dimensions and measures", () => {
  const domain = new SemanticLayer().domain("mis-statement");
  assert.ok(domain);
  const builder = new SqlBuilder();
  const selected: Selection = {
    domain: domain.name,
    measureIds: ["mis-statement.actual_net"],
    dimensionIds: ["leaf_key"],
    filters: [],
    timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
  };
  const projection = builder.build(domain, selected, statementUser, true, scope).sql.split("\nSELECT ").at(-1) ?? "";

  assert.match(projection, /relation\.leaf_key AS leaf_key/);
  assert.match(projection, /SUM\(actual_net\) AS actual_net/);
  assert.doesNotMatch(projection, / AS month| AS budget_net| AS rollover_net| AS percentage/);
  assert.throws(
    () => builder.build(domain, { ...selected, measureIds: ["mis-statement.unknown"] }, statementUser, true, scope),
    /unknown measure mis-statement\.unknown/,
  );
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

const statementDomain = new SemanticLayer().domain("mis-statement")!;
const statementSelection: Selection = {
  ...selection,
  domain: statementDomain.name,
  measureIds: ["mis-statement.actual_net"],
  dimensionIds: statementDomain.dimensions.map(({ id }) => id),
  timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
};

const statementUser: AuthUser = {
  ...user,
  permissions: {
    actions: ["report"],
    domains: ["mis-statement"],
    measureIds: [
      "mis-statement.actual_net",
      "mis-statement.budget_net",
      "mis-statement.rollover_net",
      "mis-statement.percentage",
    ],
    dimensionIds: ["leaf_key"],
  },
};

class StatementWarehouse implements Warehouse {
  explainCalls = 0;
  executeCalls = 0;

  async explain(sql: string): Promise<void> {
    this.explainCalls += 1;
    assert.match(sql, /LIMIT \d+$/);
  }

  async execute(sql: string) {
    this.executeCalls += 1;
    assert.match(sql, /FROM statement_relation AS relation/);
    return {
      columns: [
        { name: "leaf_key", numeric: false },
        { name: "actual_net", numeric: true },
        { name: "budget_net", numeric: true },
        { name: "rollover_net", numeric: true },
        { name: "percentage", numeric: false },
        { name: "source_presence", numeric: false },
        { name: "active_batch_ids", numeric: false },
      ],
      rows: [
        {
          leaf_key: "4.5|50001605|fertilizers-manures",
          actual_net: "25.00",
          budget_net: "20.00",
          rollover_net: "0.00",
          percentage: "1.25",
          source_presence: '["matched"]',
          active_batch_ids: "[]",
        },
      ],
    };
  }

  async freshness(): Promise<string | null> {
    return null;
  }

  async distinctValues(): Promise<string[]> {
    return [];
  }
}
