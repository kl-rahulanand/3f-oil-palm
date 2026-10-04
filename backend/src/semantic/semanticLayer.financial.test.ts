import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, Selection } from "@3f/contract";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { SemanticLayer } from "./semanticLayer";

test("the governed financial domain registers plant alongside GL code and month for every measure and exposes plant even when role dimension grants omit it", () => {
  const domain = new SemanticLayer().domain("governed-financial");

  assert.ok(domain);
  assert.deepEqual(domain.composed, {
    sources: ["actual_by_gl_month", "budget_by_gl_month"],
    joinKeys: ["gl_code", "month"],
  });
  assert.equal(domain.goldObject, "actual_by_gl_month");
  assert.equal(domain.scopeColumn, "plant");
  assert.deepEqual(domain.dimensions, [
    { id: "gl_code", label: "GL code", column: "gl_code" },
    { id: "month", label: "Month", column: "month" },
    { id: "plant", label: "Plant", column: "plant" },
  ]);
  assert.deepEqual(
    domain.measures.map(({ id, expr, goldObject, allowedDimensions, timeColumn, defaultTimeGrain, format }) => ({
      id,
      expr,
      goldObject,
      allowedDimensions,
      timeColumn,
      defaultTimeGrain,
      format,
    })),
    [
      {
        id: "governed-financial.actual",
        expr: "SUM(actual_net)",
        goldObject: "actual_by_gl_month",
        allowedDimensions: ["gl_code", "month", "plant"],
        timeColumn: "month",
        defaultTimeGrain: "month",
        format: "money",
      },
      {
        id: "governed-financial.budget",
        expr: "SUM(budget_net)",
        goldObject: "budget_by_gl_month",
        allowedDimensions: ["gl_code", "month", "plant"],
        timeColumn: "month",
        defaultTimeGrain: "month",
        format: "money",
      },
      {
        id: "governed-financial.percentage",
        expr: percentageExpression,
        goldObject: "actual_by_gl_month",
        allowedDimensions: ["gl_code", "month", "plant"],
        timeColumn: "month",
        defaultTimeGrain: "month",
        // The expression yields a ratio, so every surface must render it as a percentage.
        format: "percent",
      },
    ],
  );

  const allowed = new SemanticLayer().allowedFor({
    actions: ["report"],
    domains: ["governed-financial"],
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
  });
  assert.deepEqual(
    allowed[0]?.dimensions.map(({ id }) => id),
    ["gl_code", "plant"],
  );
});

test("building a selection over the governed financial domain inserts the percentage measure CASE expression verbatim as its aliased column and against a fake warehouse a matched key returns the ratio a zero budget zero actual key returns null as NA a zero budget positive actual key returns the over budget label and a zero budget negative actual key returns the credit label satisfying the full nil rule", async () => {
  const domain = new SemanticLayer().domain("governed-financial");
  assert.ok(domain);
  const warehouse = new FinancialWarehouse();
  const result = await new SelectionExecutor(new SqlBuilder(), new SqlValidator(), warehouse).run(
    user,
    domain,
    selection,
  );

  assert.ok(result.sql.includes(`${percentageExpression} AS percentage`));
  assert.deepEqual(result.result.rows, expectedFinancialRows);
});

const percentageExpression = `CASE
  WHEN SUM(budget_net) = 0 AND SUM(actual_net) = 0 THEN NULL
  WHEN SUM(budget_net) = 0 AND SUM(actual_net) > 0 THEN 'over-budget'
  WHEN SUM(budget_net) = 0 AND SUM(actual_net) < 0 THEN 'credit / negative actual'
  ELSE (SUM(actual_net) / SUM(budget_net))::text
END`;

const selection: Selection = {
  domain: "governed-financial",
  measureIds: ["governed-financial.percentage"],
  dimensionIds: ["gl_code"],
  filters: [],
};

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: {
    actions: ["report"],
    domains: ["governed-financial"],
    measureIds: selection.measureIds,
    dimensionIds: selection.dimensionIds,
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};

const financialInputs = [
  { gl_code: "matched", actual: 50, budget: 100 },
  { gl_code: "zero", actual: 0, budget: 0 },
  { gl_code: "positive", actual: 50, budget: 0 },
  { gl_code: "negative", actual: -50, budget: 0 },
];

const expectedFinancialRows = [
  { gl_code: "matched", percentage: "0.5" },
  { gl_code: "zero", percentage: null },
  { gl_code: "positive", percentage: "over-budget" },
  { gl_code: "negative", percentage: "credit / negative actual" },
];

class FinancialWarehouse implements Warehouse {
  async explain(): Promise<void> {}

  async execute(sql: string) {
    assert.ok(sql.includes(`${percentageExpression} AS percentage`));
    return {
      columns: [
        { name: "gl_code", numeric: false },
        { name: "percentage", numeric: false },
      ],
      rows: financialInputs.map(({ gl_code, actual, budget }) => ({
        gl_code,
        percentage:
          budget !== 0
            ? String(actual / budget)
            : actual === 0
              ? null
              : actual > 0
                ? "over-budget"
                : "credit / negative actual",
      })),
    };
  }

  async freshness(): Promise<string | null> {
    return null;
  }

  async distinctValues(): Promise<string[]> {
    return [];
  }
}
