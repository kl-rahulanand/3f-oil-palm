import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { IngestService, type UploadedWorkbook } from "../ingest/ingest.service";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";
import { UNMAPPED_GL_LINE, resolveMappingTriple } from "./mapping-master";

const WORKBOOK_PATH = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx");

test(
  "WAREHOUSE_DB_TEST proves every ingested DUB mapping triple resolves exactly once with sixty six mapped and twenty two bucketed rows",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, ingest_batch CASCADE");
      const buffer = readFileSync(WORKBOOK_PATH);
      const upload: UploadedWorkbook = {
        originalname: "SAP Entries Mapping.xlsx",
        mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: buffer.length,
        buffer,
      };
      const { batchId } = await new IngestService().ingestActuals(upload, "mapping-master-proof");
      const ingested = await pool.query<{ plant_src: string; cost_center: string; gl_code: string }>(
        `SELECT plant_src, cost_center, gl_code
         FROM sap_transaction
         WHERE batch_id = $1::uuid AND plant = 'DUB'`,
        [batchId],
      );
      assert.equal(ingested.rows.length, 88);
      assert.equal(
        new Set(
          ingested.rows.map(
            ({ plant_src, cost_center, gl_code }) => `${plant_src}\u0000${cost_center}\u0000${gl_code}`,
          ),
        ).size,
        28,
      );

      let mapped = 0;
      let bucketed = 0;
      for (const row of ingested.rows) {
        const resolution = resolveMappingTriple({
          plant: row.plant_src,
          cost_center: row.cost_center,
          gl_code: row.gl_code,
        });
        assert.ok(resolution, `unresolved ${row.plant_src}/${row.cost_center}/${row.gl_code}`);
        if (resolution.mis_line === UNMAPPED_GL_LINE) bucketed += 1;
        else mapped += 1;
      }
      assert.deepEqual({ mapped, bucketed }, { mapped: 66, bucketed: 22 });
    } finally {
      await pool.end();
    }
  },
);

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive mapping proof setup",
  );
}
