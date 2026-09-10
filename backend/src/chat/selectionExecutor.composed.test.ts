import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { SelectionExecutionBlockedError, SelectionExecutor } from "./selectionExecutor";

test("the selection executor enforces authorization at the shared executeResolved boundary for a governed financial domain: it throws a fail-closed error when the user lacks the governed financial read action, OR lacks the domain grant, OR lacks a grant for any selected measure or dimension, and allows a user holding the read action plus the domain and all selected measure and dimension grants", async () => {
  const warehouse = new FakeWarehouse();
  const executor = new SelectionExecutor(new SqlBuilder(), new SqlValidator(), warehouse);
  const granted = user({
    actions: ["report"],
    domains: [domain.name],
    measureIds: selection.measureIds,
    dimensionIds: selection.dimensionIds,
  });

  for (const denied of [
    user({ ...granted.permissions, actions: [] }),
    user({ ...granted.permissions, domains: [] }),
    user({ ...granted.permissions, measureIds: [selection.measureIds[0]] }),
    user({ ...granted.permissions, dimensionIds: [] }),
  ]) {
    await assert.rejects(executor.run(denied, domain, selection), SelectionExecutionBlockedError);
  }
  assert.equal(warehouse.executions, 0);

  const result = await executor.run(granted, domain, selection);
  assert.deepEqual(result.result.rows, [{ gl_code: "5000", actual: "125.00", budget: "200.00" }]);
  assert.equal(warehouse.executions, 2);
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
    { gl_code: "5000", actual: "125.00", budget: "200.00", source_presence: "matched" },
    { gl_code: "6000", actual: "0.00", budget: "50.00", source_presence: "budget-only" },
  ]);
  assert.deepEqual(result.activeBatchIds, [
    { source: "actuals", period: "2099-09-01", batchId: "actual-batch" },
    { source: "budget", period: "2099-09-01", batchId: "budget-batch" },
  ]);
  assert.deepEqual(result.budgetComponentLabels, ["Admin", "Labour"]);
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

class FakeWarehouse implements Warehouse {
  executions = 0;

  async explain(): Promise<void> {}

  async execute() {
    this.executions += 1;
    return {
      columns: [
        { name: "gl_code", numeric: false },
        { name: "actual", numeric: true },
        { name: "budget", numeric: true },
      ],
      rows: [{ gl_code: "5000", actual: "125.00", budget: "200.00" }],
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
        { name: "actual_batch_id", numeric: false },
        { name: "budget_batch_id", numeric: false },
        { name: "provenance_period", numeric: false },
      ],
      rows: [
        {
          gl_code: "5000",
          actual: "125.00",
          budget: "200.00",
          source_presence: "matched",
          budget_component_labels: "Labour,Admin",
          actual_batch_id: "actual-batch",
          budget_batch_id: "budget-batch",
          provenance_period: "2099-09-01",
        },
        {
          gl_code: "6000",
          actual: "0.00",
          budget: "50.00",
          source_presence: "budget-only",
          budget_component_labels: "Admin",
          actual_batch_id: "actual-batch",
          budget_batch_id: "budget-batch",
          provenance_period: "2099-09-01",
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
