import { loadConfig } from "../config";
import { createDb, createPool } from "../db/pool";
import { SemanticLayer } from "../semantic/semanticLayer";
import { StarRocksAdapter } from "../warehouse/starrocks.adapter";
import { StarRocksMysqlAdapter } from "../warehouse/starrocks-mysql.adapter";
import type { Warehouse } from "../warehouse/warehouse.interface";
import { LoggerAlarmSink } from "./recon.alarm";
import { DrizzleReconStore } from "./recon.store";
import { ReconciliationService } from "./reconciliation.service";

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (cfg.warehouseDriver === "http" && !cfg.starrocks.httpUrl) {
    console.log("recon skipped: warehouse not configured");
    return;
  }
  if (cfg.warehouseDriver === "mysql" && !cfg.starrocks.host) {
    console.log("recon skipped: warehouse not configured");
    return;
  }

  const pool = createPool();
  try {
    const warehouse: Warehouse =
      cfg.warehouseDriver === "http" ? new StarRocksAdapter() : new StarRocksMysqlAdapter();
    const store = new DrizzleReconStore(createDb(pool));
    const service = new ReconciliationService(
      warehouse,
      new SemanticLayer(),
      store,
      new LoggerAlarmSink(),
    );

    const results = await service.reconcileAll();
    console.table(results);
    console.log(`Divergence count: ${await service.divergenceCount()}`);
  } finally {
    await pool.end();
  }
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
