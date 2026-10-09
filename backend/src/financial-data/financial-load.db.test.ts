import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Pool } from "pg";
import { FinancialLoadRepository, type FinancialGenerationInput } from "./financial-load.repository";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";

test("the destructive financial load proof refuses any target except the disposable warehouse", () => {
  for (const [host, port, database] of [
    ["warehouse.shared.example", "5434", "warehouse"],
    ["127.0.0.1", "5433", "warehouse"],
    ["localhost", "5434", "warehouse"],
    ["127.0.0.1", "5434", "not-the-disposable-database"],
  ]) {
    assert.throws(() => assertDisposableWarehouse(host, port, database), /financial load proof requires/);
  }
});

test(
  "WAREHOUSE_DB_TEST activates one complete generation while duplicate, concurrent, and failed replacements retain unmixed immutable generations",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertDisposableWarehouse(
      process.env.WAREHOUSE_PG_HOST,
      process.env.WAREHOUSE_PG_PORT,
      process.env.WAREHOUSE_PG_DATABASE,
    );
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      const fixture = await seedFixture(pool);
      const repository = new FinancialLoadRepository(pool);
      const first = generation(fixture, "a", "10.00");
      const firstResult = await repository.activateGeneration(first);

      const duplicateResult = await repository.activateGeneration(first);
      assert.deepEqual(duplicateResult, { batchId: firstResult.batchId, activated: false, idempotent: true });
      assert.equal(await identityCount(pool, first), 1);

      const concurrent = generation(fixture, "b", "20.00");
      const [left, right] = await Promise.all([
        repository.activateGeneration(concurrent),
        repository.activateGeneration(concurrent),
      ]);
      assert.equal(left.batchId, right.batchId);
      assert.equal([left, right].filter(({ idempotent }) => idempotent).length, 1);
      assert.equal(await identityCount(pool, concurrent), 1);
      assert.deepEqual(await batchStates(pool, fixture.datasetKey), [
        [firstResult.batchId, "superseded"],
        [left.batchId, "active"],
      ]);

      const failed = generation(fixture, "c", "30.00");
      failed.actuals.push({ ...failed.actuals[0]! });
      await assert.rejects(repository.activateGeneration(failed));
      assert.equal(await identityCount(pool, failed), 0, "a failed replacement must roll back its batch and rows");
      assert.deepEqual(await activeGeneration(pool, fixture.datasetKey), {
        id: left.batchId,
        checksum: concurrent.metadata.sourceChecksumSha256,
        actual: "20.00",
        budget: "40.00",
        component: "Concurrent b",
      });

      const replacement = generation(fixture, "d", "40.00");
      const replacementResult = await repository.activateGeneration(replacement);
      assert.equal(replacementResult.activated, true);
      assert.deepEqual(await activeGeneration(pool, fixture.datasetKey), {
        id: replacementResult.batchId,
        checksum: replacement.metadata.sourceChecksumSha256,
        actual: "40.00",
        budget: "80.00",
        component: "Concurrent d",
      });
      assert.deepEqual(await retainedFacts(pool, fixture.datasetKey), [
        ["a", "10.00", "20.00", "Concurrent a", "superseded"],
        ["b", "20.00", "40.00", "Concurrent b", "superseded"],
        ["d", "40.00", "80.00", "Concurrent d", "active"],
      ]);
    } finally {
      await pool.end();
    }
  },
);

interface Fixture {
  datasetKey: string;
  plantId: string;
  costCenterId: string;
  glAccountId: string;
}

async function seedFixture(pool: Pool): Promise<Fixture> {
  const key = randomUUID();
  const fixture = {
    datasetKey: `financial-load-${key}`,
    plantId: randomUUID(),
    costCenterId: randomUUID(),
    glAccountId: randomUUID(),
  };
  await pool.query(
    `INSERT INTO agent_financial.plant (id, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'Load proof plant', ARRAY[]::text[], 'load-proof')`,
    [fixture.plantId, `DUB-${key}`],
  );
  await pool.query(
    `INSERT INTO agent_financial.cost_center
       (id, plant_id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'SAP', $3, 'Load proof cost center', ARRAY[]::text[], 'load-proof')`,
    [fixture.costCenterId, fixture.plantId, `CC-${key}`],
  );
  await pool.query(
    `INSERT INTO agent_financial.gl_account
       (id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, 'SAP', $2, 'Load proof GL', ARRAY[]::text[], 'load-proof')`,
    [fixture.glAccountId, `GL-${key}`],
  );
  return fixture;
}

function generation(fixture: Fixture, suffix: string, actualAmount: string): FinancialGenerationInput {
  const checksum = suffix.repeat(64);
  const componentKey = `component-${suffix}`;
  const amounts = {
    "10.00": { budget: "20.00", rollover: "30.00" },
    "20.00": { budget: "40.00", rollover: "60.00" },
    "30.00": { budget: "60.00", rollover: "90.00" },
    "40.00": { budget: "80.00", rollover: "120.00" },
  }[actualAmount];
  assert.ok(amounts, "the load proof requires hand-checked expected amounts");
  return {
    metadata: {
      datasetKey: fixture.datasetKey,
      sourceSystem: "SAP_WORKBOOK",
      sourceFileName: `generation ${suffix}.xlsx`,
      sourceChecksumSha256: checksum,
      parserVersion: "parser-v1",
      mappingVersion: "mapping-v1",
      budgetOwnerPlantId: fixture.plantId,
      isSynthetic: true,
      sourceReportingMonths: ["2099-07-01"],
      actualCoverage: [],
      budgetCoverage: [{ plantId: fixture.plantId, month: "2099-07-01", completeness: "confirmed" }],
      sourceCounts: { actual: 1, budget: 1 },
      validationResult: { valid: true },
      reconciliationResult: { reconciled: true },
      importedByActor: "load-proof",
    },
    components: [
      {
        componentKey,
        parentComponentKey: null,
        sNo: suffix,
        componentName: `Concurrent ${suffix}`,
        depth: 0,
        sortOrder: 0,
        isLeaf: true,
        sourceRowNumber: 1,
        sourceRow: { component: suffix },
      },
    ],
    actuals: [
      {
        sourceSystem: "SAP",
        transactionNumber: `TX-${suffix}`,
        lineId: "1",
        sourceRowNumber: 1,
        postingDate: "2099-07-15",
        plantId: fixture.plantId,
        costCenterId: fixture.costCenterId,
        glAccountId: fixture.glAccountId,
        sourcePlantCode: "DUB",
        sourceCostCenterCode: "CC",
        sourceGlCode: "GL",
        debit: actualAmount,
        credit: "0.00",
        sourceRow: { generation: suffix },
      },
    ],
    budgets: [
      {
        plantId: fixture.plantId,
        componentKey,
        reportingMonth: "2099-07-01",
        glAccountId: fixture.glAccountId,
        rolloverEnabled: true,
        budgetAmount: amounts.budget,
        rolloverAmount: amounts.rollover,
        sourceRowNumber: 1,
        sourceRow: { generation: suffix },
      },
    ],
    mappings: [
      {
        plantId: fixture.plantId,
        costCenterId: fixture.costCenterId,
        glAccountId: fixture.glAccountId,
        componentKey,
        approvalStatus: "provisional",
        approvalReason: "Synthetic load proof",
        approvedBy: "load-proof",
        provenance: { fixture: true },
      },
    ],
  };
}

async function identityCount(pool: Pool, input: FinancialGenerationInput): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM agent_financial.ingestion_batch
      WHERE dataset_key = $1 AND source_checksum_sha256 = $2
        AND parser_version = $3 AND mapping_version = $4`,
    [
      input.metadata.datasetKey,
      input.metadata.sourceChecksumSha256,
      input.metadata.parserVersion,
      input.metadata.mappingVersion,
    ],
  );
  return Number(result.rows[0].count);
}

async function batchStates(pool: Pool, datasetKey: string): Promise<string[][]> {
  const result = await pool.query<{ id: string; state: string }>(
    `SELECT id, state FROM agent_financial.ingestion_batch
      WHERE dataset_key = $1 ORDER BY created_at_utc, id`,
    [datasetKey],
  );
  return result.rows.map(({ id, state }) => [id, state]);
}

async function activeGeneration(pool: Pool, datasetKey: string): Promise<Record<string, string>> {
  const result = await pool.query<Record<string, string>>(
    `SELECT b.id, b.source_checksum_sha256 AS checksum, a.actual_amount AS actual,
            n.budget_amount AS budget, c.component_name AS component
       FROM agent_financial.ingestion_batch b
       JOIN agent_financial.financial_actual a ON a.batch_id = b.id
       JOIN agent_financial.nursery_budget n ON n.batch_id = b.id
       JOIN agent_financial.nursery_budget_component c
         ON c.batch_id = n.batch_id AND c.id = n.budget_component_id
      WHERE b.dataset_key = $1 AND b.state = 'active'`,
    [datasetKey],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0]!;
}

async function retainedFacts(pool: Pool, datasetKey: string): Promise<string[][]> {
  const result = await pool.query<Record<string, string>>(
    `SELECT left(b.source_checksum_sha256, 1) AS generation, a.actual_amount AS actual,
            n.budget_amount AS budget, c.component_name AS component, b.state
       FROM agent_financial.ingestion_batch b
       JOIN agent_financial.financial_actual a ON a.batch_id = b.id
       JOIN agent_financial.nursery_budget n ON n.batch_id = b.id
       JOIN agent_financial.nursery_budget_component c
         ON c.batch_id = b.id AND c.id = n.budget_component_id
      WHERE b.dataset_key = $1 ORDER BY generation`,
    [datasetKey],
  );
  return result.rows.map(({ generation: suffix, actual, budget, component, state }) => [
    suffix,
    actual,
    budget,
    component,
    state,
  ]);
}

function assertDisposableWarehouse(
  host: string | undefined,
  port: string | undefined,
  database: string | undefined,
): void {
  assert.equal(
    `${host}:${port}/${database}`,
    "127.0.0.1:5434/warehouse",
    "financial load proof requires 127.0.0.1:5434/warehouse",
  );
}
