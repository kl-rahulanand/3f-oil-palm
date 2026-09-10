import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { SqlBuilder } from "../sql/sqlBuilder";
import { createWarehouseDb, createWarehouseWritePool, IngestionRepository } from "./ingestion.repository";
import { PostgresAdapter } from "./postgres.adapter";
import { migrateWarehouse } from "./warehouse-migrate";

const PERIOD = "2099-09-01";

test("the destructive composed relation proof refuses a non-local warehouse host", () => {
  assert.throws(() => assertLocalWarehouseHost("warehouse.shared.example"), /refuses a non-local warehouse/);
});

test(
  "WAREHOUSE_DB_TEST proves the composed relation zero-fills Budget-only and Actual-only keys and does not fan out Budget across multiple Actual cost centres",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
      const repository = new IngestionRepository(createWarehouseDb(pool));
      const actualBatchId = await repository.replaceActualsBatch(metadata("actuals"), [
        actualRow("M1", "CC-1", "100.00"),
        actualRow("M2", "CC-2", "25.00"),
        actualRow("A1", "CC-3", "50.00", "0.00", "ACTUAL-ONLY"),
      ]);
      const budgetBatchId = await repository.replaceBudgetBatch(metadata("budget"), [
        budgetRow("M1", "MATCHED", "200.00"),
        budgetRow("B1", "BUDGET-ONLY", "300.00", "BUDGET-ONLY"),
      ]);

      const built = new SqlBuilder().build(domain, selection, user);
      const rows: Array<Record<string, unknown>> = (await new PostgresAdapter().execute(built.sql)).rows.map((row) => ({
        ...row,
        month: dateOnly(row.month),
        source_presence: parseJson(row.source_presence)[0],
        budget_component_labels: parseJson(row.budget_component_labels).flat(),
        active_batch_ids: parseJson(row.active_batch_ids),
      }));
      const byGl = new Map(rows.map((row) => [row.gl_code, row]));

      assert.equal(rows.length, 3);
      assert.deepEqual(byGl.get("MATCHED"), {
        gl_code: "MATCHED",
        month: PERIOD,
        actual: "125.00",
        budget: "200.00",
        source_presence: "matched",
        budget_component_labels: ["MATCHED"],
        active_batch_ids: [
          { source: "actuals", period: PERIOD, batchId: actualBatchId },
          { source: "budget", period: PERIOD, batchId: budgetBatchId },
        ],
      });
      assert.deepEqual(byGl.get("BUDGET-ONLY"), {
        gl_code: "BUDGET-ONLY",
        month: PERIOD,
        actual: "0.00",
        budget: "300.00",
        source_presence: "budget-only",
        budget_component_labels: ["BUDGET-ONLY"],
        active_batch_ids: [{ source: "budget", period: PERIOD, batchId: budgetBatchId }],
      });
      assert.deepEqual(byGl.get("ACTUAL-ONLY"), {
        gl_code: "ACTUAL-ONLY",
        month: PERIOD,
        actual: "50.00",
        budget: "0.00",
        source_presence: "actual-only",
        budget_component_labels: [],
        active_batch_ids: [{ source: "actuals", period: PERIOD, batchId: actualBatchId }],
      });
    } finally {
      await pool.end();
    }
  },
);

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
    {
      id: "governed-financial.budget",
      label: "Budget",
      goldObject: "budget_by_gl_month",
      expr: "SUM(budget_net)",
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
  measureIds: domain.measures.map(({ id }) => id),
  dimensionIds: domain.dimensions.map(({ id }) => id),
  filters: [],
};

const user: AuthUser = {
  id: "proof-user",
  email: "proof@example.com",
  display_name: "Proof",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};

function metadata(fixture: string) {
  return {
    period: PERIOD,
    uploadedBy: "composed-relation-proof",
    validationResult: { valid: true },
    reconciliationResult: { fixture },
  };
}

function actualRow(txnNo: string, costCenter: string, debit: string, credit = "0.00", glCode = "MATCHED") {
  return {
    txnNo,
    lineId: "1",
    postingDate: "2099-09-07",
    month: PERIOD,
    plant: "DUB",
    plantSrc: "DUB-NUR",
    costCenter,
    glCode,
    acctName: "Composed relation proof",
    debit,
    credit,
  };
}

function budgetRow(lineId: string, costCenter: string, budgetAmount: string, glCode = "MATCHED") {
  return {
    formatId: "nursery",
    period: PERIOD,
    lineId,
    glCode,
    costCenter,
    budgetAmount,
    rolloverAmount: "0.00",
  };
}

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive composed relation setup",
  );
}

function dateOnly(value: string | number | null | Date): string | number | null {
  if (!(value instanceof Date) && typeof value !== "string") return value;
  const date = value instanceof Date ? value : new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, "0"))
    .join("-");
}

function parseJson(value: string | number | null): unknown[] {
  return typeof value === "string" ? JSON.parse(value) : [];
}
