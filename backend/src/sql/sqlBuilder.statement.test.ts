import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { SqlBuilder, type GovernedSelectionScope } from "./sqlBuilder";
import { SqlValidator } from "./sqlValidator";

test("the statement projection joins budget and actual at plant leaf and month grain filtering actuals by the resolved triples before aggregating and leaves the gl code and month relation untouched", () => {
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
  assert.match(actualCte, /GROUP BY target\.plant, target\.leaf_key, actual\.month/);
  assert.ok(actualCte.indexOf("INNER JOIN leaf_targets") < actualCte.indexOf("GROUP BY target.plant"));
  assert.match(budgetCte, /FROM budget_by_leaf_month/);
  assert.match(budgetCte, /WHERE 'DUB' IN \('DUB'\)/);
  assert.match(statement.sql, /LEFT JOIN actual_by_leaf_month AS actual_src/);
  assert.match(statement.sql, /actual_src\.plant = statement_key\.plant/);
  assert.match(statement.sql, /LEFT JOIN budget_src/);
  assert.match(statement.sql, /budget_src\.plant = statement_key\.plant/);
  assert.match(statement.sql, /COALESCE\(actual_src\.actual_net, 0\)::numeric\(18,2\)/);
  assert.match(statement.sql, /COALESCE\(budget_src\.budget_net, 0\)::numeric\(18,2\)/);
  assert.match(statement.sql, /outline\.batch_id/);
  assert.doesNotMatch(statement.sql, /actual_batch\.plant|budget_batch\.plant/);
  assert.match(statement.sql, /GROUP BY relation\.leaf_key, outline\.sort_order/);
  assert.match(statement.sql, /SUM\(actual_net\) AS actual_net/);
  assert.match(statement.sql, /array_agg\(DISTINCT\(relation\.source_presence\)\)/);
  assert.match(statement.sql, /ORDER BY outline\.sort_order NULLS LAST, relation\.leaf_key/);

  const shipped = builder.build(domain, selection, user, true, scope);
  assert.match(shipped.sql, /GROUP BY gl_code, month/);
  assert.match(shipped.sql, /actual_src\.gl_code = budget_src\.gl_code/);
  assert.doesNotMatch(shipped.sql, /leaf_targets|budget_by_leaf_month|statement_relation/);
});

test("the statement projection uses only the closing month's stored roll-over for a multi-month block", () => {
  const builder = new SqlBuilder();
  const sql = builder.build(
    statementDomain,
    {
      ...statementSelection,
      measureIds: ["mis-statement.rollover_net"],
      timeWindow: { grain: "month", column: "month", from: "2026-04-01", to: "2026-07-01" },
    },
    statementUser,
    true,
    scope,
  ).sql;

  assert.match(
    sql,
    /CASE WHEN statement_key\.month = '2026-07-01'\s+THEN COALESCE\(budget_src\.rollover_net, 0\)\s+ELSE 0\s+END::numeric\(18,2\) AS rollover_net/,
  );
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

test("the statement projection renders a HAVING for a measure filter and a WHERE predicate for a leaf key filter and is unchanged when neither is present", () => {
  const domain = new SemanticLayer().domain("mis-statement")!;
  const builder = new SqlBuilder();
  const base: Selection = {
    domain: domain.name,
    measureIds: ["mis-statement.actual_net", "mis-statement.budget_net"],
    dimensionIds: ["leaf_key"],
    filters: [],
    timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
  };
  const unchanged = builder.build(domain, base, statementUser, false, scope).sql;
  assert.doesNotMatch(unchanged, /\nWHERE relation\.|\nHAVING /);

  const filtered = builder.build(
    domain,
    {
      ...base,
      filters: [{ dimensionId: "leaf_key", op: "eq", value: "4.5|50001605|fertilizers-manures" }],
      measureFilters: [
        {
          measureId: "mis-statement.actual_net",
          op: "gt",
          compareTo: { kind: "measure", measureId: "mis-statement.budget_net" },
        },
      ],
    },
    statementUser,
    false,
    scope,
  ).sql;
  assert.match(filtered, /WHERE relation\.leaf_key = '4\.5\|50001605\|fertilizers-manures'/);
  assert.match(
    filtered,
    /GROUP BY relation\.leaf_key, outline\.sort_order\nHAVING SUM\(actual_net\) > SUM\(budget_net\)\nORDER BY/,
  );
});

test("the statement projection combines plants after joining budget to the owner plant and orders plant rows by statement then display name", () => {
  const builder = new SqlBuilder();
  const selected: Selection = {
    domain: statementDomain.name,
    measureIds: ["mis-statement.actual_net", "mis-statement.budget_net"],
    dimensionIds: ["leaf_key", "plant"],
    filters: [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }],
    timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
  };
  const sql = builder.build(statementDomain, selected, multiPlantUser, true, multiPlantScope).sql;
  const actualCte = sql.match(/actual_by_leaf_month AS \(([\s\S]*?)\n\), budget_src/)?.[1] ?? "";
  const budgetCte = sql.match(/budget_src AS \(([\s\S]*?)\n\), outline_order/)?.[1] ?? "";

  assert.match(actualCte, /SELECT target\.plant, target\.leaf_key, actual\.month/);
  assert.match(actualCte, /GROUP BY target\.plant, target\.leaf_key, actual\.month/);
  assert.match(budgetCte, /SELECT 'DUB'::text AS plant, leaf_key, month/);
  assert.match(budgetCte, /WHERE 'DUB' IN \('CHIR', 'DUB'\)/);
  assert.match(sql, /actual_src\.plant = statement_key\.plant/);
  assert.match(sql, /budget_src\.plant = statement_key\.plant/);
  assert.match(sql, /relation\.plant AS plant/);
  assert.match(sql, /GROUP BY relation\.leaf_key, relation\.plant, relation\.plant_display, outline\.sort_order/);
  assert.match(sql, /ORDER BY outline\.sort_order NULLS LAST, relation\.leaf_key, relation\.plant_display/);
});

test("a one-plant resolved statement does not expand to the reader's other granted plants", () => {
  const sql = new SqlBuilder().build(statementDomain, statementSelection, multiPlantUser, true, scope).sql;
  const selectedPlants = sql.match(/selected_plants AS \(([\s\S]*?)\n\), actual_by_leaf_month/)?.[1] ?? "";

  assert.match(selectedPlants, /VALUES \('DUB', 'DUB'\)/);
  assert.doesNotMatch(selectedPlants, /CHIR/);
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
  dimensionIds: ["leaf_key"],
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

const multiPlantUser: AuthUser = {
  ...statementUser,
  scope: [
    { attribute: "plant", value: "DUB" },
    { attribute: "plant", value: "CHIR" },
  ],
};

const multiPlantScope: GovernedSelectionScope = {
  triples: [
    { plant: "DUB", costCenter: "Primary", glCode: "50001605" },
    { plant: "CHIR", costCenter: "Manpower", glCode: "55021000" },
  ],
  glCodes: ["50001605", "55021000"],
  masterGlCodes: ["50001605", "55021000"],
  budgetOwnerPlant: "DUB",
  plantDisplayNames: { CHIR: "Chirala", DUB: "Agri - Nursery - DUB" },
  leafTargets: [
    {
      plant: "DUB",
      costCenter: "Primary",
      glCode: "50001605",
      target: { kind: "leaf", leafKey: "4.5|50001605|fertilizers-manures" },
    },
    {
      plant: "CHIR",
      costCenter: "Manpower",
      glCode: "55021000",
      target: { kind: "leaf", leafKey: "8.1|55021000|salaries" },
    },
  ],
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
