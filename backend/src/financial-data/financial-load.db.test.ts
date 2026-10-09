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

      const concurrentLeft = generation(fixture, "b", "20.00");
      const concurrentRight = generation(fixture, "c", "30.00");
      const [left, right] = await raceDistinctReplacements(pool, repository, concurrentLeft, concurrentRight);
      assert.notEqual(left.batchId, right.batchId);
      assert.deepEqual(
        [left, right].map(({ activated, idempotent }) => ({ activated, idempotent })),
        [
          { activated: true, idempotent: false },
          { activated: true, idempotent: false },
        ],
      );
      const racedStates = await selectedBatchStates(pool, [left.batchId, right.batchId]);
      assert.equal(racedStates.filter((state) => state === "active").length, 1);
      assert.equal(racedStates.filter((state) => state === "superseded").length, 1);
      const beforeFailure = await generationInventory(pool, fixture.datasetKey);
      assertInventoryComplete(beforeFailure, ["a", "b", "c"]);
      assert.equal(beforeFailure.filter(({ state }) => state === "active").length, 1);
      assert.equal(beforeFailure.filter(({ state }) => state === "superseded").length, 2);

      const failed = generation(fixture, "d", "40.00");
      failed.actuals.push({ ...failed.actuals[0]! });
      await assert.rejects(repository.activateGeneration(failed));
      assert.equal(await identityCount(pool, failed), 0, "a failed replacement must roll back its batch and rows");
      assert.deepEqual(await generationInventory(pool, fixture.datasetKey), beforeFailure);

      const replacement = generation(fixture, "e", "50.00");
      const replacementResult = await repository.activateGeneration(replacement);
      assert.equal(replacementResult.activated, true);
      const finalInventory = await generationInventory(pool, fixture.datasetKey);
      assertInventoryComplete(finalInventory, ["a", "b", "c", "e"]);
      assert.deepEqual(
        finalInventory.map(({ generation: suffix, state }) => [suffix, state]),
        [
          ["a", "superseded"],
          ["b", "superseded"],
          ["c", "superseded"],
          ["e", "active"],
        ],
      );
      assert.equal(finalInventory.find(({ state }) => state === "active")?.id, replacementResult.batchId);
    } finally {
      await pool.end();
    }
  },
);

interface Fixture {
  datasetKey: string;
  plantId: string;
  costCenterIds: [string, string];
  glAccountIds: [string, string];
}

async function seedFixture(pool: Pool): Promise<Fixture> {
  const key = randomUUID();
  const fixture: Fixture = {
    datasetKey: `financial-load-${key}`,
    plantId: randomUUID(),
    costCenterIds: [randomUUID(), randomUUID()],
    glAccountIds: [randomUUID(), randomUUID()],
  };
  await pool.query(
    `INSERT INTO agent_financial.plant (id, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'Load proof plant', ARRAY[]::text[], 'load-proof')`,
    [fixture.plantId, `DUB-${key}`],
  );
  await pool.query(
    `INSERT INTO agent_financial.cost_center
       (id, plant_id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'SAP', $3, 'Load proof cost center one', ARRAY[]::text[], 'load-proof'),
            ($4, $2, 'SAP', $5, 'Load proof cost center two', ARRAY[]::text[], 'load-proof')`,
    [fixture.costCenterIds[0], fixture.plantId, `CC-1-${key}`, fixture.costCenterIds[1], `CC-2-${key}`],
  );
  await pool.query(
    `INSERT INTO agent_financial.gl_account
       (id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, 'SAP', $2, 'Load proof GL one', ARRAY[]::text[], 'load-proof'),
            ($3, 'SAP', $4, 'Load proof GL two', ARRAY[]::text[], 'load-proof')`,
    [fixture.glAccountIds[0], `GL-1-${key}`, fixture.glAccountIds[1], `GL-2-${key}`],
  );
  return fixture;
}

function generation(fixture: Fixture, suffix: string, actualAmount: string): FinancialGenerationInput {
  const checksum = suffix.repeat(64);
  const amounts = {
    "10.00": { budget: "20.00", rollover: "30.00" },
    "20.00": { budget: "40.00", rollover: "60.00" },
    "30.00": { budget: "60.00", rollover: "90.00" },
    "40.00": { budget: "80.00", rollover: "120.00" },
    "50.00": { budget: "100.00", rollover: "150.00" },
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
      sourceCounts: { actual: 2, budget: 2, components: 2, mappings: 2 },
      validationResult: { valid: true },
      reconciliationResult: { reconciled: true },
      importedByActor: "load-proof",
    },
    components: [0, 1].map((index) => ({
      componentKey: `component-${suffix}-${index + 1}`,
      parentComponentKey: null,
      sNo: `${suffix}.${index + 1}`,
      componentName: `Concurrent ${suffix} ${index + 1}`,
      depth: 0,
      sortOrder: index,
      isLeaf: true,
      sourceRowNumber: index + 1,
      sourceRow: { generation: suffix },
    })),
    actuals: [0, 1].map((index) => ({
      sourceSystem: "SAP",
      transactionNumber: `TX-${suffix}-${index + 1}`,
      lineId: "1",
      sourceRowNumber: index + 1,
      postingDate: "2099-07-15",
      plantId: fixture.plantId,
      costCenterId: fixture.costCenterIds[index]!,
      glAccountId: fixture.glAccountIds[index]!,
      sourcePlantCode: "DUB",
      sourceCostCenterCode: `CC-${index + 1}`,
      sourceGlCode: `GL-${index + 1}`,
      debit: actualAmount,
      credit: "0.00",
      sourceRow: { generation: suffix },
    })),
    budgets: [0, 1].map((index) => ({
      plantId: fixture.plantId,
      componentKey: `component-${suffix}-${index + 1}`,
      reportingMonth: "2099-07-01",
      glAccountId: fixture.glAccountIds[index]!,
      rolloverEnabled: true,
      budgetAmount: amounts.budget,
      rolloverAmount: amounts.rollover,
      sourceRowNumber: index + 1,
      sourceRow: { generation: suffix },
    })),
    mappings: [0, 1].map((index) => ({
      plantId: fixture.plantId,
      costCenterId: fixture.costCenterIds[index]!,
      glAccountId: fixture.glAccountIds[index]!,
      componentKey: `component-${suffix}-${index + 1}`,
      approvalStatus: "provisional",
      approvalReason: "Synthetic load proof",
      approvedBy: "load-proof",
      provenance: { generation: suffix },
    })),
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

type ActivationResult = Awaited<ReturnType<FinancialLoadRepository["activateGeneration"]>>;

async function raceDistinctReplacements(
  pool: Pool,
  repository: FinancialLoadRepository,
  left: FinancialGenerationInput,
  right: FinancialGenerationInput,
): Promise<[ActivationResult, ActivationResult]> {
  await installInsertBlocker(pool);
  const blocker = await pool.connect();
  let released = false;
  let outcomesPromise: Promise<PromiseSettledResult<ActivationResult>[]> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(1700000001, 1700000002)");
    outcomesPromise = Promise.allSettled([repository.activateGeneration(left), repository.activateGeneration(right)]);
    assert.equal(
      await waitForInsertBlockerWaiters(pool),
      1,
      "only one distinct replacement may reach its insert while another load owns the dataset",
    );
    await blocker.query("COMMIT");
    released = true;
    const outcomes = await outcomesPromise;
    assert.equal(outcomes[0].status, "fulfilled");
    assert.equal(outcomes[1].status, "fulfilled");
    return [
      (outcomes[0] as PromiseFulfilledResult<ActivationResult>).value,
      (outcomes[1] as PromiseFulfilledResult<ActivationResult>).value,
    ];
  } finally {
    if (!released) {
      await blocker.query("ROLLBACK");
    }
    blocker.release();
    await outcomesPromise;
    await removeInsertBlocker(pool);
  }
}

async function installInsertBlocker(pool: Pool): Promise<void> {
  await removeInsertBlocker(pool);
  await pool.query(
    `CREATE FUNCTION agent_financial.load_proof_block_insert() RETURNS trigger
       LANGUAGE plpgsql AS $$
       BEGIN
         PERFORM pg_advisory_xact_lock(1700000001, 1700000002);
         RETURN NEW;
       END
       $$`,
  );
  await pool.query(
    `CREATE TRIGGER load_proof_block_insert
       BEFORE INSERT ON agent_financial.ingestion_batch
       FOR EACH ROW EXECUTE FUNCTION agent_financial.load_proof_block_insert()`,
  );
}

async function removeInsertBlocker(pool: Pool): Promise<void> {
  await pool.query("DROP TRIGGER IF EXISTS load_proof_block_insert ON agent_financial.ingestion_batch");
  await pool.query("DROP FUNCTION IF EXISTS agent_financial.load_proof_block_insert()");
}

async function waitForInsertBlockerWaiters(pool: Pool): Promise<number> {
  let waiting = 0;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM pg_locks
        WHERE locktype = 'advisory' AND NOT granted
          AND classid = 1700000001::oid
          AND objid = 1700000002::oid`,
    );
    waiting = Math.max(waiting, result.rows[0]!.count);
  }
  return waiting;
}

async function selectedBatchStates(pool: Pool, batchIds: string[]): Promise<string[]> {
  const result = await pool.query<{ state: string }>(
    `SELECT state FROM agent_financial.ingestion_batch
      WHERE id = ANY($1::uuid[]) ORDER BY state`,
    [batchIds],
  );
  return result.rows.map(({ state }) => state);
}

interface GenerationInventory {
  generation: string;
  id: string;
  state: string;
  sourceCounts: Record<string, number>;
  actualCount: number;
  budgetCount: number;
  componentCount: number;
  mappingCount: number;
  actualGenerations: string[];
  budgetGenerations: string[];
  componentGenerations: string[];
  mappingGenerations: string[];
  mappingComponentKeys: string[];
}

async function generationInventory(pool: Pool, datasetKey: string): Promise<GenerationInventory[]> {
  const result = await pool.query<{
    generation: string;
    id: string;
    state: string;
    source_counts: Record<string, number>;
    actual_count: number;
    budget_count: number;
    component_count: number;
    mapping_count: number;
    actual_generations: string[];
    budget_generations: string[];
    component_generations: string[];
    mapping_generations: string[];
    mapping_component_keys: string[];
  }>(
    `SELECT left(b.source_checksum_sha256, 1) AS generation, b.id, b.state, b.source_counts,
            (SELECT count(*)::int FROM agent_financial.financial_actual a
              WHERE a.batch_id = b.id) AS actual_count,
            (SELECT count(*)::int FROM agent_financial.nursery_budget n
              WHERE n.batch_id = b.id) AS budget_count,
            (SELECT count(*)::int FROM agent_financial.nursery_budget_component c
              WHERE c.batch_id = b.id) AS component_count,
            (SELECT count(*)::int FROM agent_financial.actual_budget_mapping m
              WHERE m.mapping_version_id = b.id) AS mapping_count,
            ARRAY(SELECT DISTINCT a.source_row->>'generation'
                    FROM agent_financial.financial_actual a
                   WHERE a.batch_id = b.id ORDER BY 1) AS actual_generations,
            ARRAY(SELECT DISTINCT n.source_row->>'generation'
                    FROM agent_financial.nursery_budget n
                   WHERE n.batch_id = b.id ORDER BY 1) AS budget_generations,
            ARRAY(SELECT DISTINCT c.source_row->>'generation'
                    FROM agent_financial.nursery_budget_component c
                   WHERE c.batch_id = b.id ORDER BY 1) AS component_generations,
            ARRAY(SELECT DISTINCT m.provenance->>'generation'
                    FROM agent_financial.actual_budget_mapping m
                   WHERE m.mapping_version_id = b.id ORDER BY 1) AS mapping_generations,
            ARRAY(SELECT m.budget_component_key
                    FROM agent_financial.actual_budget_mapping m
                   WHERE m.mapping_version_id = b.id ORDER BY m.budget_component_key) AS mapping_component_keys
       FROM agent_financial.ingestion_batch b
      WHERE b.dataset_key = $1
      ORDER BY generation`,
    [datasetKey],
  );
  return result.rows.map((row) => ({
    generation: row.generation,
    id: row.id,
    state: row.state,
    sourceCounts: row.source_counts,
    actualCount: row.actual_count,
    budgetCount: row.budget_count,
    componentCount: row.component_count,
    mappingCount: row.mapping_count,
    actualGenerations: row.actual_generations,
    budgetGenerations: row.budget_generations,
    componentGenerations: row.component_generations,
    mappingGenerations: row.mapping_generations,
    mappingComponentKeys: row.mapping_component_keys,
  }));
}

function assertInventoryComplete(inventory: GenerationInventory[], expectedGenerations: string[]): void {
  assert.deepEqual(
    inventory.map(({ generation: suffix }) => suffix),
    expectedGenerations,
  );
  for (const row of inventory) {
    const expectedCounts = { actual: 2, budget: 2, components: 2, mappings: 2 };
    assert.deepEqual(row.sourceCounts, expectedCounts);
    assert.deepEqual(
      {
        actual: row.actualCount,
        budget: row.budgetCount,
        components: row.componentCount,
        mappings: row.mappingCount,
      },
      expectedCounts,
    );
    assert.deepEqual(row.actualGenerations, [row.generation]);
    assert.deepEqual(row.budgetGenerations, [row.generation]);
    assert.deepEqual(row.componentGenerations, [row.generation]);
    assert.deepEqual(row.mappingGenerations, [row.generation]);
    assert.deepEqual(row.mappingComponentKeys, [`component-${row.generation}-1`, `component-${row.generation}-2`]);
  }
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
