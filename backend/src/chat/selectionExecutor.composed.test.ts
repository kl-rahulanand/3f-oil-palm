import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { MisSelectionService } from "../mis/mis-selection.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { SelectionExecutionBlockedError, SelectionExecutor } from "./selectionExecutor";

test("the resolved scope reaches BOTH executions so the ungrouped totals query is filtered by exactly the same triples and GL set as the grouped rows, and the full semantic authorization of the action the domain every measure and every dimension is enforced before any master metadata or unresolvable outcome is returned", async () => {
  const warehouse = new GovernedMisWarehouse();
  const builder = new RecordingSqlBuilder();
  const executor = new SelectionExecutor(builder, new SqlValidator(), warehouse);
  const service = new MisSelectionService(new SelectionResolverService(warehouse), new SemanticLayer(), executor);
  const governedMeasures = ["governed-financial.actual", "governed-financial.budget", "governed-financial.percentage"];
  const granted = user({
    actions: ["report"],
    domains: ["governed-financial"],
    measureIds: governedMeasures,
    dimensionIds: ["gl_code", "month"],
  });

  for (const denied of [
    user({ ...granted.permissions, actions: [] }),
    user({ ...granted.permissions, domains: [] }),
    user({ ...granted.permissions, measureIds: governedMeasures.slice(0, 2) }),
    user({ ...granted.permissions, dimensionIds: ["gl_code"] }),
  ]) {
    await assert.rejects(async () => service.options(denied), SelectionExecutionBlockedError);
    await assert.rejects(
      service.run(denied, { department: "Unknown", function: "Unknown", plant: "Unknown", period: "2026-07-01" }),
      SelectionExecutionBlockedError,
    );
  }
  assert.equal(warehouse.metadataExecutions, 0);
  assert.equal(warehouse.queryExecutions, 0);

  const outOfScope = user({ ...granted.permissions });
  outOfScope.scope = [{ attribute: "plant", value: "LON" }];
  assert.deepEqual(await service.options(outOfScope), { departments: [], functions: [], plants: [], periods: [] });
  await assert.rejects(
    service.run(outOfScope, {
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "2026-07-01",
    }),
    SelectionExecutionBlockedError,
  );
  assert.equal(warehouse.metadataExecutions, 0);
  assert.equal(warehouse.queryExecutions, 0);

  const result = await service.run(granted, {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB-NUR",
    period: "2026-07-01",
  });
  assert.equal(result.outcome, "resolved");
  assert.equal(warehouse.metadataExecutions, 1);
  assert.equal(warehouse.queryExecutions, 2);
  assert.equal(builder.resolvedScopes.length, 2);
  assert.deepEqual(builder.resolvedScopes[0], builder.resolvedScopes[1]);
  assert.ok(builder.sql.every((sql) => sql.includes("actual_by_key_month") && sql.includes("cost_center")));
  assert.match(builder.sql[0], /GROUP BY gl_code, month/);
  assert.doesNotMatch(builder.sql[1], /GROUP BY gl_code, month\nORDER BY/);
});

test("the selection executor surfaces composed provenance on the result the row aligned source presence on every row and on the provenance object the deterministic Budget Components label set together with the active source batch ids as source period batch id tuples gathered across the query rows", async () => {
  const executor = new SelectionExecutor(new SqlBuilder(), new SqlValidator(), new ProvenanceWarehouse());
  const result = await executor.run(
    user({
      actions: ["report"],
      domains: [domain.name],
      measureIds: selection.measureIds,
      dimensionIds: selection.dimensionIds,
    }),
    domain,
    selection,
  );

  assert.deepEqual(result.result.rows, [
    { gl_code: "5000", actual: "125.00", budget: "200.00" },
    { gl_code: "6000", actual: "0.00", budget: "50.00" },
  ]);
  assert.deepEqual(result.rowSourcePresence, ["matched", ["actual-only", "budget-only"]]);
  assert.deepEqual(result.activeBatchIds, [
    { source: "actuals", period: "2099-09-01", batchId: "actual-batch" },
    { source: "actuals", period: "2099-10-01", batchId: "actual-batch-2" },
    { source: "budget", period: "2099-09-01", batchId: "budget-batch" },
    { source: "budget", period: "2099-10-01", batchId: "budget-batch-2" },
  ]);
  assert.deepEqual(result.budgetComponentLabels, ["Admin, East", "Labour"]);
});

test("the selection executor authorizes measure filter operands through the displayed measure path", () => {
  const executor = new SelectionExecutor(new SqlBuilder(), new SqlValidator(), new ProvenanceWarehouse());
  const filtered: Selection = {
    ...selection,
    measureIds: ["governed-financial.actual"],
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
  };
  assert.throws(
    () =>
      executor.authorize(
        user({
          actions: ["report"],
          domains: [domain.name],
          measureIds: filtered.measureIds,
          dimensionIds: ["gl_code"],
        }),
        domain,
        filtered,
      ),
    SelectionExecutionBlockedError,
  );
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
      allowedDimensions: ["gl_code"],
      piiSensitive: false,
    },
    {
      id: "governed-financial.budget",
      label: "Budget",
      goldObject: "budget_by_gl_month",
      expr: "SUM(budget_net)",
      grain: "gl_code and month",
      impliedFilters: [],
      allowedDimensions: ["gl_code"],
      piiSensitive: false,
    },
  ],
  dimensions: [{ id: "gl_code", label: "GL code", column: "gl_code" }],
};

const selection: Selection = {
  domain: domain.name,
  measureIds: domain.measures.map(({ id }) => id),
  dimensionIds: domain.dimensions.map(({ id }) => id),
  filters: [],
};

function user(permissions: AuthUser["permissions"]): AuthUser {
  return {
    id: "user-1",
    email: "finance@example.com",
    display_name: "Finance",
    is_active: true,
    roles: ["admin"],
    permissions,
    scope: [{ attribute: "plant", value: "DUB" }],
  };
}

class RecordingSqlBuilder extends SqlBuilder {
  readonly resolvedScopes: unknown[] = [];
  readonly sql: string[] = [];

  override build(...args: Parameters<SqlBuilder["build"]>) {
    this.resolvedScopes.push(args[4]);
    const built = super.build(...args);
    this.sql.push(built.sql);
    return built;
  }
}

class GovernedMisWarehouse implements Warehouse {
  metadataExecutions = 0;
  queryExecutions = 0;

  async explain(): Promise<void> {}

  async execute(sql: string) {
    if (sql.startsWith("SELECT DISTINCT period")) {
      this.metadataExecutions += 1;
      return { columns: [{ name: "period", numeric: false }], rows: [{ period: "2026-07-01" }] };
    }
    this.queryExecutions += 1;
    if (!sql.includes("SELECT gl_code AS gl_code")) {
      return {
        columns: [
          { name: "actual", numeric: true },
          { name: "budget", numeric: true },
          { name: "percentage", numeric: true },
        ],
        rows: [{ actual: "125.00", budget: "200.00", percentage: "0.625" }],
      };
    }
    return {
      columns: [
        { name: "gl_code", numeric: false },
        { name: "month", numeric: false },
        { name: "actual", numeric: true },
        { name: "budget", numeric: true },
        { name: "percentage", numeric: true },
        { name: "source_presence", numeric: false },
        { name: "budget_component_labels", numeric: false },
        { name: "active_batch_ids", numeric: false },
      ],
      rows: [
        {
          gl_code: "50001701",
          month: "2026-07-01",
          actual: "125.00",
          budget: "200.00",
          percentage: "0.625",
          source_presence: '["matched"]',
          budget_component_labels: '[["Materials"]]',
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

class ProvenanceWarehouse implements Warehouse {
  async explain(): Promise<void> {}

  async execute(sql: string) {
    if (!sql.includes("source_presence")) {
      return { columns: [{ name: "actual", numeric: true }], rows: [{ actual: "125.00" }] };
    }
    return {
      columns: [
        { name: "gl_code", numeric: false },
        { name: "actual", numeric: true },
        { name: "budget", numeric: true },
        { name: "source_presence", numeric: false },
        { name: "budget_component_labels", numeric: false },
        { name: "active_batch_ids", numeric: false },
      ],
      rows: [
        {
          gl_code: "5000",
          actual: "125.00",
          budget: "200.00",
          source_presence: '["matched"]',
          budget_component_labels: '[["Labour","Admin, East"]]',
          active_batch_ids:
            '[{"source":"actuals","period":"2099-09-01","batchId":"actual-batch"},{"source":"budget","period":"2099-09-01","batchId":"budget-batch"}]',
        },
        {
          gl_code: "6000",
          actual: "0.00",
          budget: "50.00",
          source_presence: '["actual-only","budget-only"]',
          budget_component_labels: '[["Admin, East"]]',
          active_batch_ids:
            '[[{"source":"actuals","period":"2099-10-01","batchId":"actual-batch-2"}],[{"source":"budget","period":"2099-10-01","batchId":"budget-batch-2"}]]',
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
