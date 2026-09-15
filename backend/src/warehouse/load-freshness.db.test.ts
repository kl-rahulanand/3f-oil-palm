import assert from "node:assert/strict";
import { test } from "node:test";
import { createWarehouseWritePool } from "./ingestion.repository";
import { PostgresAdapter } from "./postgres.adapter";
import { migrateWarehouse } from "./warehouse-migrate";

test(
  "the postgres load freshness returns per source oldest active uploads and their overall minimum across several active periods",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE ingest_batch CASCADE");
      await pool.query(
        `INSERT INTO ingest_batch
           (source_kind, period, uploaded_by, uploaded_at_utc, row_count, validation_result, reconciliation_result, is_active)
         VALUES
           ('actuals', '2099-07-01', 'freshness-proof', '2099-09-03T10:00:00Z', 0, '{}', '{}', true),
           ('actuals', '2099-08-01', 'freshness-proof', '2099-09-01T08:00:00Z', 0, '{}', '{}', true),
           ('actuals', '2099-09-01', 'freshness-proof', '2099-09-04T12:00:00Z', 0, '{}', '{}', true),
           ('budget', '2099-07-01', 'freshness-proof', '2099-08-31T06:30:00Z', 0, '{}', '{}', true),
           ('budget', '2099-08-01', 'freshness-proof', '2099-09-02T09:00:00Z', 0, '{}', '{}', true),
           ('budget', '2099-06-01', 'freshness-proof', '2099-01-01T00:00:00Z', 0, '{}', '{}', false)`,
      );

      assert.deepEqual(await new PostgresAdapter().loadFreshness(), {
        status: "available",
        freshnessKind: "load",
        oldestUploadedAtUtc: "2099-08-31T06:30:00.000Z",
        sources: [
          { source: "actuals", oldestUploadedAtUtc: "2099-09-01T08:00:00.000Z" },
          { source: "budget", oldestUploadedAtUtc: "2099-08-31T06:30:00.000Z" },
        ],
      });
    } finally {
      await pool.end();
    }
  },
);

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive load freshness setup",
  );
}
