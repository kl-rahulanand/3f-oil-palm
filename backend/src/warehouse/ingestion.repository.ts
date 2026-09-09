import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { loadConfig, loadWarehousePostgresConfig } from "../config";
import { ingestBatch, misBudget, sapTransaction } from "./warehouse-schema";
import * as warehouseSchema from "./warehouse-schema";

export type WarehouseDb = NodePgDatabase<typeof warehouseSchema>;
type WarehouseTransaction = Parameters<Parameters<WarehouseDb["transaction"]>[0]>[0];
type TransactionHost = Pick<WarehouseDb, "transaction">;

const INSERT_CHUNK_SIZE = 1000;

async function insertInChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
    await insert(rows.slice(offset, offset + INSERT_CHUNK_SIZE));
  }
}

export async function createWarehouseWritePool(): Promise<Pool> {
  const postgres = await loadWarehousePostgresConfig();
  const config = loadConfig();
  const poolConfig: PoolConfig = {
    ...postgres,
    max: 5,
    connectionTimeoutMillis: config.queryTimeoutMs,
    statement_timeout: config.queryTimeoutMs,
    query_timeout: config.queryTimeoutMs,
    allowExitOnIdle: true,
  };
  return new Pool(poolConfig);
}

export function createWarehouseDb(pool: Pool): WarehouseDb {
  return drizzle(pool, { schema: warehouseSchema });
}

export interface CandidateBatchMetadata {
  period: string;
  uploadedBy: string;
  uploadedAtUtc?: Date;
  validationResult: Record<string, unknown>;
  reconciliationResult: Record<string, unknown>;
}

export type SapTransactionInput = Omit<
  typeof sapTransaction.$inferInsert,
  "id" | "batchId" | "createdAtUtc" | "updatedAtUtc"
>;

export type MisBudgetInput = Omit<typeof misBudget.$inferInsert, "id" | "batchId" | "createdAtUtc" | "updatedAtUtc">;

export interface IIngestionRepository {
  replaceActualsBatch(metadata: CandidateBatchMetadata, rows: SapTransactionInput[]): Promise<string>;
  replaceBudgetBatch(metadata: CandidateBatchMetadata, rows: MisBudgetInput[]): Promise<string>;
}

export class IngestionRepository implements IIngestionRepository {
  constructor(private readonly db: TransactionHost) {}

  replaceActualsBatch(metadata: CandidateBatchMetadata, rows: SapTransactionInput[]): Promise<string> {
    return this.replaceBatch("actuals", metadata, rows.length, async (transaction, batchId) => {
      await insertInChunks(rows, async (chunk) => {
        await transaction.insert(sapTransaction).values(chunk.map((row) => ({ ...row, batchId })));
      });
    });
  }

  replaceBudgetBatch(metadata: CandidateBatchMetadata, rows: MisBudgetInput[]): Promise<string> {
    return this.replaceBatch("budget", metadata, rows.length, async (transaction, batchId) => {
      await insertInChunks(rows, async (chunk) => {
        await transaction.insert(misBudget).values(chunk.map((row) => ({ ...row, batchId })));
      });
    });
  }

  private async replaceBatch(
    sourceKind: "actuals" | "budget",
    metadata: CandidateBatchMetadata,
    rowCount: number,
    loadRows: (transaction: WarehouseTransaction, batchId: string) => Promise<void>,
  ): Promise<string> {
    return this.db.transaction(async (transaction) => {
      const [candidate] = await transaction
        .insert(ingestBatch)
        .values({ ...metadata, sourceKind, rowCount })
        .returning({ id: ingestBatch.id });

      await loadRows(transaction, candidate.id);
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${sourceKind}), hashtext(${metadata.period}))`,
      );
      const switchedAtUtc = new Date();
      await transaction
        .update(ingestBatch)
        .set({ isActive: false, updatedAtUtc: switchedAtUtc })
        .where(
          and(
            eq(ingestBatch.sourceKind, sourceKind),
            eq(ingestBatch.period, metadata.period),
            eq(ingestBatch.isActive, true),
          ),
        );
      await transaction
        .update(ingestBatch)
        .set({ isActive: true, updatedAtUtc: switchedAtUtc })
        .where(eq(ingestBatch.id, candidate.id));

      return candidate.id;
    });
  }
}
