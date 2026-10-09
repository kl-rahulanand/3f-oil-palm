import { and, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import {
  financialActual,
  financialActualBudgetMapping,
  financialBudget,
  financialBudgetComponent,
  financialIngestionBatch,
} from "./financial-schema";

const INSERT_CHUNK_SIZE = 500;

type CoverageEntry = { plantId: string; month: string; completeness: "confirmed" | "unconfirmed" };
type FinancialSchema = {
  financialActual: typeof financialActual;
  financialActualBudgetMapping: typeof financialActualBudgetMapping;
  financialBudget: typeof financialBudget;
  financialBudgetComponent: typeof financialBudgetComponent;
  financialIngestionBatch: typeof financialIngestionBatch;
};
type FinancialDb = NodePgDatabase<FinancialSchema>;
type FinancialTransaction = Parameters<Parameters<FinancialDb["transaction"]>[0]>[0];

export interface FinancialGenerationMetadata {
  datasetKey: string;
  sourceSystem: string;
  sourceFileName: string;
  sourceChecksumSha256: string;
  parserVersion: string;
  mappingVersion: string;
  budgetOwnerPlantId: string | null;
  isSynthetic: boolean;
  sourceReportingMonths: string[];
  actualCoverage: CoverageEntry[];
  budgetCoverage: CoverageEntry[];
  sourceCounts: Record<string, unknown>;
  validationResult: Record<string, unknown>;
  reconciliationResult: Record<string, unknown>;
  errors?: Record<string, unknown>[];
  sourceModifiedAtUtc?: Date | null;
  importedByActor: string;
}

export type FinancialActualInput = Omit<
  typeof financialActual.$inferInsert,
  "id" | "batchId" | "reportingMonth" | "actualAmount" | "createdAtUtc"
>;

export type FinancialBudgetComponentInput = Omit<
  typeof financialBudgetComponent.$inferInsert,
  "id" | "batchId" | "parentComponentId" | "createdAtUtc"
> & { parentComponentKey: string | null };

export type FinancialBudgetInput = Omit<
  typeof financialBudget.$inferInsert,
  "id" | "batchId" | "budgetComponentId" | "createdAtUtc"
> & { componentKey: string };

export type FinancialMappingInput = Omit<
  typeof financialActualBudgetMapping.$inferInsert,
  "id" | "mappingVersionId" | "budgetComponentKey" | "createdAtUtc"
> & { componentKey: string };

export interface FinancialGenerationInput {
  metadata: FinancialGenerationMetadata;
  components: FinancialBudgetComponentInput[];
  actuals: FinancialActualInput[];
  budgets: FinancialBudgetInput[];
  mappings: FinancialMappingInput[];
}

export interface FinancialGenerationResult {
  batchId: string;
  activated: boolean;
  idempotent: boolean;
}

export class FinancialLoadRepository {
  private readonly db: FinancialDb;

  constructor(pool: Pool) {
    this.db = drizzle(pool, {
      schema: {
        financialActual,
        financialActualBudgetMapping,
        financialBudget,
        financialBudgetComponent,
        financialIngestionBatch,
      },
    });
  }

  activateGeneration(input: FinancialGenerationInput): Promise<FinancialGenerationResult> {
    return this.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('agent_financial_generation'), hashtext(${input.metadata.datasetKey}))`,
      );

      const existing = await this.findIdentity(transaction, input.metadata);
      if (existing) {
        if (existing.state === "active" || existing.state === "superseded") {
          return { batchId: existing.id, activated: false, idempotent: true };
        }
        throw new Error("Financial generation identity is not reusable");
      }

      const [batch] = await transaction
        .insert(financialIngestionBatch)
        .values({ ...input.metadata, errors: input.metadata.errors ?? [], state: "staged" })
        .returning({ id: financialIngestionBatch.id });
      if (!batch) throw new Error("Financial generation batch was not created");

      const componentIds = await this.insertComponents(transaction, batch.id, input.components);
      await insertInChunks(input.actuals, (rows) =>
        transaction.insert(financialActual).values(rows.map((row) => ({ ...row, batchId: batch.id }))),
      );
      await insertInChunks(input.budgets, (rows) =>
        transaction.insert(financialBudget).values(
          rows.map(({ componentKey, ...row }) => ({
            ...row,
            batchId: batch.id,
            budgetComponentId: requiredComponentId(componentIds, componentKey),
          })),
        ),
      );
      await insertInChunks(input.mappings, (rows) =>
        transaction.insert(financialActualBudgetMapping).values(
          rows.map(({ componentKey, ...row }) => ({
            ...row,
            mappingVersionId: batch.id,
            budgetComponentKey: requiredComponentKey(componentIds, componentKey),
          })),
        ),
      );

      const activatedAtUtc = new Date();
      await transaction
        .update(financialIngestionBatch)
        .set({ state: "validated", validatedAtUtc: activatedAtUtc })
        .where(eq(financialIngestionBatch.id, batch.id));
      await transaction
        .update(financialIngestionBatch)
        .set({ state: "superseded" })
        .where(
          and(
            eq(financialIngestionBatch.datasetKey, input.metadata.datasetKey),
            eq(financialIngestionBatch.state, "active"),
          ),
        );
      await transaction
        .update(financialIngestionBatch)
        .set({ state: "active", activatedAtUtc })
        .where(eq(financialIngestionBatch.id, batch.id));

      return { batchId: batch.id, activated: true, idempotent: false };
    });
  }

  private async findIdentity(
    transaction: FinancialTransaction,
    metadata: FinancialGenerationMetadata,
  ): Promise<{ id: string; state: string } | undefined> {
    const [existing] = await transaction
      .select({ id: financialIngestionBatch.id, state: financialIngestionBatch.state })
      .from(financialIngestionBatch)
      .where(
        and(
          eq(financialIngestionBatch.datasetKey, metadata.datasetKey),
          eq(financialIngestionBatch.sourceChecksumSha256, metadata.sourceChecksumSha256),
          eq(financialIngestionBatch.parserVersion, metadata.parserVersion),
          eq(financialIngestionBatch.mappingVersion, metadata.mappingVersion),
        ),
      )
      .limit(1);
    return existing;
  }

  private async insertComponents(
    transaction: FinancialTransaction,
    batchId: string,
    components: FinancialBudgetComponentInput[],
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const { parentComponentKey, ...component } of [...components].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    )) {
      const [inserted] = await transaction
        .insert(financialBudgetComponent)
        .values({
          ...component,
          batchId,
          parentComponentId: parentComponentKey ? requiredComponentId(ids, parentComponentKey) : null,
        })
        .returning({ id: financialBudgetComponent.id });
      if (!inserted) throw new Error("Financial Budget component was not created");
      ids.set(component.componentKey, inserted.id);
    }
    return ids;
  }
}

async function insertInChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
    await insert(rows.slice(offset, offset + INSERT_CHUNK_SIZE));
  }
}

function requiredComponentId(ids: Map<string, string>, componentKey: string): string {
  const id = ids.get(componentKey);
  if (!id) throw new Error("Financial fact references an unknown Budget component");
  return id;
}

function requiredComponentKey(ids: Map<string, string>, componentKey: string): string {
  requiredComponentId(ids, componentKey);
  return componentKey;
}
