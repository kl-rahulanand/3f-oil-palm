import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Pool } from "pg";
import { IngestService, type UploadedWorkbook } from "../ingest/ingest.service";
import { parseSapActualsWorkbook } from "../ingest/sap-actuals.parser";
import { createWarehouseWritePool } from "./ingestion.repository";
import { migrateWarehouse } from "./warehouse-migrate";
import {
  loadReconciliationExpectation,
  reconcileActualsByKeyMonth,
  type ReconciliationExpectation,
} from "./reconciliation.repository";

const FIXTURE_PATH = join(__dirname, "__fixtures__/july-dub-reconciliation.json");
const WORKBOOK_PATH = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx");

interface SyntheticBatch {
  id: string;
  sourceKind: "actuals" | "budget";
  isActive: boolean;
}

interface SyntheticTransaction {
  batchId: string;
  plant: string;
  month: string;
  debit: string;
  credit: string;
}

test("the reconciliation query computes a plant+period net two independent ways from the warehouse - SUM(debit-credit) over the active actuals batch's raw sap_transaction rows AND SUM(actual_net) over the actual_by_key_month gold view - and returns both as paise-exact numeric(18,2) strings with the contributing line count equal, proving criterion t-rp-c1's logic on a synthetic hermetic fixture", async () => {
  const db = syntheticWarehouse(
    [{ id: "active", sourceKind: "actuals", isActive: true }],
    [
      { batchId: "active", plant: "DUB", month: "2026-07-01", debit: "100.10", credit: "25.03" },
      { batchId: "active", plant: "DUB", month: "2026-07-01", debit: "0.00", credit: "0.07" },
    ],
  );

  assert.deepEqual(await reconcileActualsByKeyMonth(db, { plant: "DUB", period: "2026-07-01" }), {
    plant: "DUB",
    period: "2026-07-01",
    rawNet: "75.00",
    goldNet: "75.00",
    lineCount: 2,
  });
});

test("the reconciliation counts ONLY the active actuals batch - an inactive prior actuals batch for the same plant+period and a budget batch are both excluded from rawNet, goldNet and lineCount - so after a replace only the new active batch is reflected and the total is unchanged, proving criterion t-rp-c2's idempotency invariant at the read layer on a synthetic hermetic fixture", async () => {
  const db = syntheticWarehouse(
    [
      { id: "prior", sourceKind: "actuals", isActive: false },
      { id: "replacement", sourceKind: "actuals", isActive: true },
      { id: "budget", sourceKind: "budget", isActive: true },
    ],
    [
      { batchId: "prior", plant: "DUB", month: "2026-07-01", debit: "999.00", credit: "0.00" },
      { batchId: "replacement", plant: "DUB", month: "2026-07-01", debit: "80.00", credit: "5.00" },
      { batchId: "budget", plant: "DUB", month: "2026-07-01", debit: "500.00", credit: "0.00" },
    ],
  );

  assert.deepEqual(await reconcileActualsByKeyMonth(db, { plant: "DUB", period: "2026-07-01" }), {
    plant: "DUB",
    period: "2026-07-01",
    rawNet: "75.00",
    goldNet: "75.00",
    lineCount: 1,
  });
});

test("the frozen july-dub-reconciliation fixture pins plant DUB, period 2026-07-01, the DUB line count 88, and the expected net 11512712.07, and the reconciliation module's expectation loader reads it and rejects a fixture whose expected net is not a paise-exact numeric(18,2) decimal string", () => {
  assert.deepEqual(loadReconciliationExpectation(FIXTURE_PATH), {
    plant: "DUB",
    period: "2026-07-01",
    source: "SAP Entries Mapping.xlsx#SAP Report",
    lineCount: 88,
    expectedNetPaise: "11512712.07",
  });

  const invalidPath = join(tmpdir(), `invalid-reconciliation-${randomUUID()}.json`);
  try {
    writeFileSync(
      invalidPath,
      JSON.stringify({
        plant: "DUB",
        period: "2026-07-01",
        source: "fixture",
        lineCount: 1,
        expectedNetPaise: "1.2",
      }),
    );
    assert.throws(() => loadReconciliationExpectation(invalidPath), /Invalid reconciliation expectation fixture/);
  } finally {
    unlinkSync(invalidPath);
  }
});

test("the destructive warehouse proof refuses a non-local warehouse host", () => {
  assert.throws(() => assertLocalWarehouseHost("warehouse.shared.example"), /refuses a non-local warehouse/);
});

test(
  "WAREHOUSE_DB_TEST reconciles the frozen July DUB workbook and proves whole-upload idempotent replacement",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, ingest_batch CASCADE");
      const expectation = loadReconciliationExpectation(FIXTURE_PATH);
      const buffer = readFileSync(WORKBOOK_PATH);
      const parsed = await parseSapActualsWorkbook(buffer);
      const upload: UploadedWorkbook = {
        originalname: "SAP Entries Mapping.xlsx",
        mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: buffer.length,
        buffer,
      };
      const service = new IngestService();

      const first = await service.ingestActuals(upload, "july-dub-reconciliation-first");
      const firstBatchId = first.periods[0].batchId;
      const parsedRows = parsed.periods[0].rows;
      assert.equal(first.totalRowCount, parsedRows.length);
      await assertBatchIntegrity(pool, firstBatchId, parsedRows.length);
      assertReconciliation(await reconcileActualsByKeyMonth(pool, expectation), expectation);

      const replacement = await service.ingestActuals(upload, "july-dub-reconciliation-replacement");
      const replacementBatchId = replacement.periods[0].batchId;
      assert.notEqual(replacementBatchId, firstBatchId);
      await assertBatchIntegrity(pool, firstBatchId, parsedRows.length);
      await assertBatchIntegrity(pool, replacementBatchId, parsedRows.length);

      const batches = await pool.query<{ id: string; is_active: boolean }>(
        `SELECT id, is_active
         FROM ingest_batch
         WHERE id = ANY($1::uuid[])
         ORDER BY id`,
        [[firstBatchId, replacementBatchId]],
      );
      assert.equal(batches.rows.length, 2);
      assert.equal(batches.rows.find(({ id }) => id === firstBatchId)?.is_active, false);
      assert.equal(batches.rows.find(({ id }) => id === replacementBatchId)?.is_active, true);

      const active = await pool.query<{ id: string }>(
        `SELECT id
         FROM ingest_batch
         WHERE source_kind = 'actuals' AND period = $1::date AND is_active`,
        [expectation.period],
      );
      assert.deepEqual(active.rows, [{ id: replacementBatchId }]);
      assertReconciliation(await reconcileActualsByKeyMonth(pool, expectation), expectation);
    } finally {
      await pool.end();
    }
  },
);

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive reconciliation setup",
  );
}

function syntheticWarehouse(batches: SyntheticBatch[], transactions: SyntheticTransaction[]): Pick<Pool, "query"> {
  return {
    query: (async (text: string, values: [string, string]) => {
      assert.match(text, /SUM\(txn\.debit - txn\.credit\)/);
      assert.match(text, /batch\.source_kind = 'actuals'/);
      assert.match(text, /batch\.is_active/);
      assert.match(text, /SUM\(actual_net\)/);
      assert.match(text, /FROM actual_by_key_month/);
      const [plant, period] = values;
      const accepted = transactions.filter((transaction) => {
        const batch = batches.find(({ id }) => id === transaction.batchId);
        return (
          batch?.sourceKind === "actuals" &&
          batch.isActive &&
          transaction.plant === plant &&
          transaction.month === period
        );
      });
      const net = formatPaise(
        accepted.reduce((sum, transaction) => sum + toPaise(transaction.debit) - toPaise(transaction.credit), 0n),
      );
      return {
        rows: [{ plant, period, raw_net: net, gold_net: net, line_count: accepted.length }],
      };
    }) as Pool["query"],
  };
}

function toPaise(value: string): bigint {
  const [rupees, paise] = value.split(".");
  return BigInt(rupees) * 100n + BigInt(paise);
}

function formatPaise(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

async function assertBatchIntegrity(pool: Pool, batchId: string, expectedRows: number): Promise<void> {
  const result = await pool.query<{ row_count: number; unique_count: number }>(
    `SELECT COUNT(*)::integer AS row_count,
            COUNT(DISTINCT (txn_no, line_id))::integer AS unique_count
     FROM sap_transaction
     WHERE batch_id = $1::uuid`,
    [batchId],
  );
  assert.deepEqual(result.rows, [{ row_count: expectedRows, unique_count: expectedRows }]);
}

function assertReconciliation(
  actual: Awaited<ReturnType<typeof reconcileActualsByKeyMonth>>,
  expectation: ReconciliationExpectation,
): void {
  assert.deepEqual(actual, {
    plant: expectation.plant,
    period: expectation.period,
    rawNet: expectation.expectedNetPaise,
    goldNet: expectation.expectedNetPaise,
    lineCount: expectation.lineCount,
  });
}
