import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import {
  createWarehouseDb,
  createWarehouseWritePool,
  IngestionRepository,
  type MisBudgetInput,
  type SapTransactionInput,
} from "./ingestion.repository";
import { migrateWarehouse } from "./warehouse-migrate";

const PERIOD = "2099-08-01";

test("the destructive GL month rollup proof refuses a non-local warehouse host", () => {
  assert.throws(() => assertLocalWarehouseHost("warehouse.shared.example"), /refuses a non-local warehouse/);
});

test(
  "WAREHOUSE_DB_TEST proves actual_by_gl_month and budget_by_gl_month retain prior batches but reflect only each active replacement and a budget reload leaves actuals unchanged",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
      const repository = new IngestionRepository(createWarehouseDb(pool));
      const actualPrior = await repository.replaceActualsBatch(metadata("actual-prior"), [
        actualRow("P1", "DUB", "CC-OLD", "999.00"),
      ]);
      const actualReplacement = await repository.replaceActualsBatch(metadata("actual-replacement"), [
        actualRow("R1", "DUB", "Primary", "100.00"),
        actualRow("R2", "DUB", "Secondary", "30.00", "5.00"),
        actualRow("R3", "CHIR", "Primary", "75.00"),
      ]);

      await assertBatchState(pool, actualPrior, false);
      await assertBatchState(pool, actualReplacement, true);
      assert.deepEqual(await actualRollup(pool), [
        { plant: "CHIR", gl_code: "50001701", month: PERIOD, actual_net: "75.00" },
        { plant: "DUB", gl_code: "50001701", month: PERIOD, actual_net: "125.00" },
      ]);

      const priorRows = [budgetRow("P1", "Legacy", "9999.00", "999.00")];
      const budgetPrior = await repository.replaceBudgetBatch(
        metadata("budget-prior"),
        priorRows,
        budgetOutline(priorRows),
      );
      const actualBeforeBudgetReload = await actualRollup(pool);
      const replacementRows = [
        budgetRow("R1", "Labour", "250.00", "20.00"),
        budgetRow("R2", "Admin", "1000.00", "10.00"),
      ];
      const budgetReplacement = await repository.replaceBudgetBatch(
        metadata("budget-replacement"),
        replacementRows,
        budgetOutline(replacementRows),
      );

      await assertBatchState(pool, budgetPrior, false);
      await assertBatchState(pool, budgetReplacement, true);
      assert.deepEqual(await budgetRollup(pool), [
        {
          gl_code: "50001701",
          month: PERIOD,
          budget_net: "1250.00",
          rollover_net: "30.00",
          budget_component_labels: ["Admin", "Labour"],
        },
      ]);
      assert.deepEqual(await actualRollup(pool), actualBeforeBudgetReload);
    } finally {
      await pool.end();
    }
  },
);

function metadata(fixture: string) {
  return {
    period: PERIOD,
    uploadedBy: "gl-month-rollups-proof",
    validationResult: { valid: true },
    reconciliationResult: { fixture },
  };
}

function actualRow(
  txnNo: string,
  plant: string,
  costCenter: string,
  debit: string,
  credit = "0.00",
): SapTransactionInput {
  return {
    txnNo,
    lineId: "1",
    postingDate: "2099-08-07",
    month: PERIOD,
    plant,
    plantSrc: `${plant}-NUR`,
    costCenter,
    glCode: "50001701",
    acctName: "GL month rollup proof",
    debit,
    credit,
  };
}

function budgetRow(lineId: string, costCenter: string, budgetAmount: string, rolloverAmount: string): MisBudgetInput {
  return {
    formatId: "nursery",
    period: PERIOD,
    lineId,
    leafKey: lineId,
    glCode: "50001701",
    costCenter,
    budgetAmount,
    rolloverAmount,
  };
}

function budgetOutline(rows: MisBudgetInput[]) {
  return rows.map(({ lineId, leafKey, costCenter: label, glCode }, sortOrder) => ({
    nodeKey: `leaf:${leafKey}`,
    depth: 0,
    label,
    sortOrder,
    glCode,
    leafKey,
  }));
}

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive GL month rollup setup",
  );
}

async function assertBatchState(pool: Pool, id: string, isActive: boolean): Promise<void> {
  const result = await pool.query<{ id: string; is_active: boolean }>(
    "SELECT id, is_active FROM ingest_batch WHERE id = $1::uuid",
    [id],
  );
  assert.deepEqual(result.rows, [{ id, is_active: isActive }]);
}

async function actualRollup(pool: Pool) {
  return (
    await pool.query<{ plant: string; gl_code: string; month: string; actual_net: string }>(
      "SELECT plant, gl_code, month::text, actual_net FROM actual_by_gl_month WHERE month = $1::date ORDER BY plant, gl_code",
      [PERIOD],
    )
  ).rows;
}

async function budgetRollup(pool: Pool) {
  return (
    await pool.query<{
      gl_code: string;
      month: string;
      budget_net: string;
      rollover_net: string;
      budget_component_labels: string[];
    }>(
      "SELECT gl_code, month::text, budget_net, rollover_net, budget_component_labels FROM budget_by_gl_month WHERE month = $1::date ORDER BY gl_code",
      [PERIOD],
    )
  ).rows;
}
