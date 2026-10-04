import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { StructuredLogger } from "../common/structured.logger";
import { loadConfig } from "../config";
import {
  createWarehouseDb,
  createWarehouseWritePool,
  IngestionRepository,
  type SapTransactionInput,
  type WarehouseDb,
} from "./ingestion.repository";

const config = loadConfig();
const logger = new StructuredLogger(config);
const proofPeriod = "2099-07-01";

async function withWarehouseDb(run: (db: WarehouseDb) => Promise<void>): Promise<void> {
  const pool = await createWarehouseWritePool();
  try {
    await run(createWarehouseDb(pool));
  } finally {
    await pool.end();
  }
}

async function applyMigrations(db: WarehouseDb): Promise<void> {
  await migrate(db, { migrationsFolder: join(__dirname, "../../drizzle-warehouse") });
}

export async function migrateWarehouse(): Promise<void> {
  await withWarehouseDb(async (db) => applyMigrations(db));
  logger.log("info", "Warehouse migration complete", { module: "warehouse-migrate" });
}

export async function proveWarehouse(): Promise<void> {
  await withWarehouseDb(async (db) => {
    await applyMigrations(db);
    const proofRollback = new Error("warehouse proof rollback");
    let completed = false;

    try {
      await db.transaction(async (transaction) => {
        const repository = new IngestionRepository(transaction);
        const metadata = {
          period: proofPeriod,
          uploadedBy: "warehouse-proof",
          validationResult: { valid: true },
          reconciliationResult: { fixture: "seed-proof" },
        };
        const rows: SapTransactionInput[] = [
          {
            txnNo: "TXN-001",
            lineId: "1",
            postingDate: "2099-07-07",
            month: proofPeriod,
            plant: "DUB",
            plantSrc: "DUB-NUR",
            costCenter: "CC1",
            glCode: "50001701",
            acctName: "Sprout cost",
            debit: "100.50",
            credit: "0.25",
          },
          {
            txnNo: "TXN-002",
            lineId: "1",
            postingDate: "2099-07-08",
            month: proofPeriod,
            plant: "CHIR",
            plantSrc: "CHIR-NUR",
            costCenter: "CC1",
            glCode: "50001701",
            acctName: "Sprout transport",
            debit: "10.00",
            credit: "0.00",
          },
        ];

        await repository.replaceActualsBatch(metadata, rows);
        const first = await transaction.execute(
          sql`SELECT plant, actual_net FROM actual_by_gl_month WHERE gl_code = '50001701' AND month = ${proofPeriod} ORDER BY plant`,
        );
        const rollups = first.rows as Array<{ plant?: string; actual_net?: string }>;
        if (
          rollups.length !== 2 ||
          rollups[0]?.plant !== "CHIR" ||
          rollups[0]?.actual_net !== "10.00" ||
          rollups[1]?.plant !== "DUB" ||
          rollups[1]?.actual_net !== "100.25"
        ) {
          throw new Error("Warehouse proof expected separate CHIR and DUB GL month rollups");
        }

        await repository.replaceActualsBatch(metadata, [
          {
            ...rows[0],
            txnNo: "TXN-003",
            postingDate: "2099-07-09",
            acctName: "Replacement candidate",
            debit: "999.00",
            credit: "0.00",
          },
        ]);
        await transaction.execute(
          sql.raw(readFileSync(join(__dirname, "../../drizzle-warehouse/seed-proof.sql"), "utf8")),
        );
        completed = true;
        throw proofRollback;
      });
    } catch (error) {
      if (error !== proofRollback) throw error;
    }

    if (!completed) throw new Error("Warehouse proof did not complete");
  });
  logger.log("info", "Warehouse proof complete", { module: "warehouse-migrate" });
}

if (require.main === module) {
  const action = process.argv.includes("--proof") ? proveWarehouse : migrateWarehouse;
  void action().catch((error: unknown) => {
    logger.log("error", "Warehouse command failed", {
      module: "warehouse-migrate",
      context: { errorType: error instanceof Error ? error.name : "UnknownError" },
    });
    process.exitCode = 1;
  });
}
