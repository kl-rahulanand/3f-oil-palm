import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { FinancialSelection } from "@3f/contract";
import type { Pool, PoolClient } from "pg";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";
import { buildFinancialActualQuery, resolveFinancialScope } from "./financial-predicate";

test("the destructive financial predicate proof refuses any target except the disposable warehouse", () => {
  for (const [host, port, database] of [
    ["warehouse.shared.example", "5434", "warehouse"],
    ["127.0.0.1", "5433", "warehouse"],
    ["localhost", "5434", "warehouse"],
    ["127.0.0.1", "5434", "not-the-disposable-database"],
  ]) {
    assert.throws(() => assertDisposableWarehouse(host, port, database), /financial predicate proof requires/);
  }
});

test(
  "WAREHOUSE_DB_TEST pins the active source and mapping while one parameterized predicate applies filters and component descendants to summary and detail",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertDisposableWarehouse(
      process.env.WAREHOUSE_PG_HOST,
      process.env.WAREHOUSE_PG_PORT,
      process.env.WAREHOUSE_PG_DATABASE,
    );
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const scope = await resolveFinancialScope(
        client,
        selection(fixture.plantCode, fixture.parentKey, [{ dimensionId: "gl", operator: "eq", value: "GL-CHILD" }]),
        { section: "Included" },
      );

      assert.deepEqual(scope.sourceBatchIds, [fixture.firstBatchId]);
      assert.equal(scope.mappingVersionId, fixture.firstBatchId);
      assert.deepEqual(scope.componentKeys, [fixture.childKey, fixture.parentKey, fixture.siblingKey]);

      await replaceGeneration(client, fixture);
      const summaryQuery = buildFinancialActualQuery(scope, "summary");
      const detailQuery = buildFinancialActualQuery(scope, "detail");
      assert.equal(summaryQuery.text.includes(fixture.plantCode), false, "Plant values must not be SQL text");
      assert.equal(summaryQuery.text.includes(fixture.parentKey), false, "component values must not be SQL text");
      assert.equal(summaryQuery.text.includes("Included"), false, "filter values must not be SQL text");

      const summary = await client.query<{ row_count: string; actual_total: string }>(summaryQuery);
      const detail = await client.query<{ id: string; transaction_number: string; actual_amount: string }>(detailQuery);
      assert.deepEqual(summary.rows, [{ row_count: "1", actual_total: "70.00" }]);
      assert.deepEqual(
        detail.rows.map(({ id, transaction_number, actual_amount }) => ({ id, transaction_number, actual_amount })),
        [{ id: fixture.includedActualId, transaction_number: "TX-INCLUDED", actual_amount: "70.00" }],
      );

      const injected = await resolveFinancialScope(
        client,
        selection(fixture.plantCode, fixture.parentKey, [
          { dimensionId: "gl", operator: "eq", value: "GL-CHILD' OR TRUE --" },
        ]),
      );
      const injectedQuery = buildFinancialActualQuery(injected, "detail");
      assert.equal(injectedQuery.text.includes("GL-CHILD' OR TRUE --"), false);
      assert.deepEqual((await client.query(injectedQuery)).rows, []);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  },
);

interface Fixture {
  plantId: string;
  plantCode: string;
  costCenterId: string;
  glId: string;
  parentKey: string;
  childKey: string;
  siblingKey: string;
  firstBatchId: string;
  includedActualId: string;
}

async function seedFixture(client: PoolClient): Promise<Fixture> {
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'superseded' WHERE dataset_key = 'financial-chat-workbook' AND state = 'active'",
  );
  const suffix = randomUUID();
  const plantId = randomUUID();
  const otherPlantId = randomUUID();
  const costCenterId = randomUUID();
  const unrelatedCostCenterId = randomUUID();
  const otherCostCenterId = randomUUID();
  const glId = randomUUID();
  const otherGlId = randomUUID();
  const plantCode = `DUB-${suffix}`;
  const parentKey = `parent-${suffix}`;
  const childKey = `child-${suffix}`;
  const siblingKey = `sibling-${suffix}`;
  const unrelatedKey = `unrelated-${suffix}`;
  await client.query(
    `INSERT INTO agent_financial.plant (id, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'Predicate DUB', '{}', 'predicate-proof'),
            ($3, $4, 'Predicate other', '{}', 'predicate-proof')`,
    [plantId, plantCode, otherPlantId, `OTHER-${suffix}`],
  );
  await client.query(
    `INSERT INTO agent_financial.cost_center
       (id, plant_id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'SAP', $3, 'Predicate center', '{}', 'predicate-proof'),
            ($4, $2, 'SAP', $5, 'Unrelated center', '{}', 'predicate-proof'),
            ($6, $7, 'SAP', $8, 'Other center', '{}', 'predicate-proof')`,
    [
      costCenterId,
      plantId,
      `CC-${suffix}`,
      unrelatedCostCenterId,
      `UNRELATED-CC-${suffix}`,
      otherCostCenterId,
      otherPlantId,
      `OTHER-CC-${suffix}`,
    ],
  );
  await client.query(
    `INSERT INTO agent_financial.gl_account
       (id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, 'SAP', 'GL-CHILD', 'Predicate GL', '{}', 'predicate-proof'),
            ($2, 'SAP', 'GL-OTHER', 'Other GL', '{}', 'predicate-proof')`,
    [glId, otherGlId],
  );
  const firstBatchId = await insertBatch(client, plantId, "a");
  const components = await client.query<{ id: string; component_key: string }>(
    `INSERT INTO agent_financial.nursery_budget_component
       (batch_id, component_key, parent_component_id, component_name, depth, sort_order,
        is_leaf, source_row_number, source_row)
     VALUES ($1, $2, NULL, 'Parent', 0, 1, false, 1, '{}')
     RETURNING id, component_key`,
    [firstBatchId, parentKey],
  );
  const parentId = components.rows[0]!.id;
  await client.query(
    `INSERT INTO agent_financial.nursery_budget_component
       (batch_id, component_key, parent_component_id, component_name, depth, sort_order,
        is_leaf, source_row_number, source_row)
     VALUES ($1, $2, $3, 'Child', 1, 2, true, 2, '{}'),
            ($1, $4, $3, 'Sibling', 1, 3, true, 3, '{}'),
            ($1, $5, NULL, 'Unrelated', 0, 4, true, 4, '{}')`,
    [firstBatchId, childKey, parentId, siblingKey, unrelatedKey],
  );
  await client.query(
    `INSERT INTO agent_financial.actual_budget_mapping
       (mapping_version_id, plant_id, cost_center_id, gl_account_id, budget_component_key,
        approval_status, approval_reason, approved_by, provenance)
     VALUES ($1, $2, $3, $4, $5, 'provisional', 'Predicate proof', 'predicate-proof', '{}')`,
    [firstBatchId, plantId, costCenterId, glId, childKey],
  );
  await client.query(
    `INSERT INTO agent_financial.actual_budget_mapping
       (mapping_version_id, plant_id, cost_center_id, gl_account_id, budget_component_key,
        approval_status, approval_reason, approved_by, provenance)
     VALUES ($1, $2, $3, $4, $5, 'provisional', 'Predicate proof', 'predicate-proof', '{}')`,
    [firstBatchId, plantId, unrelatedCostCenterId, glId, unrelatedKey],
  );
  const includedActualId = randomUUID();
  await client.query(
    `INSERT INTO agent_financial.financial_actual
       (id, batch_id, source_system, transaction_number, line_id, source_row_number,
        posting_date, section, plant_id, cost_center_id, gl_account_id, debit, credit, source_row)
     VALUES ($1, $2, 'SAP', 'TX-INCLUDED', '1', 1, '2099-07-15', 'Included', $3, $4, $5, 100, 30, '{}'),
            ($6, $2, 'SAP', 'TX-WRONG-SECTION', '1', 2, '2099-07-16', 'Excluded', $3, $4, $5, 900, 0, '{}'),
            ($7, $2, 'SAP', 'TX-UNMAPPED', '1', 3, '2099-07-17', 'Included', $3, NULL, $5, 800, 0, '{}'),
            ($8, $2, 'SAP', 'TX-OTHER-COMPONENT', '1', 4, '2099-07-18', 'Included', $3, $9, $5, 600, 0, '{}'),
            ($10, $2, 'SAP', 'TX-OTHER-PLANT', '1', 5, '2099-07-19', 'Included', $11, $12, $13, 700, 0, '{}')`,
    [
      includedActualId,
      firstBatchId,
      plantId,
      costCenterId,
      glId,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      unrelatedCostCenterId,
      randomUUID(),
      otherPlantId,
      otherCostCenterId,
      otherGlId,
    ],
  );
  await activateBatch(client, firstBatchId);
  return {
    plantId,
    plantCode,
    costCenterId,
    glId,
    parentKey,
    childKey,
    siblingKey,
    firstBatchId,
    includedActualId,
  };
}

async function replaceGeneration(client: PoolClient, fixture: Fixture): Promise<void> {
  await client.query("UPDATE agent_financial.ingestion_batch SET state = 'superseded' WHERE id = $1", [
    fixture.firstBatchId,
  ]);
  const replacementId = await insertBatch(client, fixture.plantId, "b");
  await client.query(
    `INSERT INTO agent_financial.financial_actual
       (batch_id, source_system, transaction_number, line_id, source_row_number,
        posting_date, section, plant_id, cost_center_id, gl_account_id, debit, credit, source_row)
     VALUES ($1, 'SAP', 'TX-REPLACEMENT', '1', 1, '2099-07-15', 'Included', $2, $3, $4, 9999, 0, '{}')`,
    [replacementId, fixture.plantId, fixture.costCenterId, fixture.glId],
  );
  await activateBatch(client, replacementId);
}

async function insertBatch(client: PoolClient, plantId: string, checksumCharacter: string): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO agent_financial.ingestion_batch
       (dataset_key, source_system, source_file_name, source_checksum_sha256, parser_version,
        mapping_version, budget_owner_plant_id, state, is_synthetic, source_reporting_months,
        actual_coverage, budget_coverage, source_counts, validation_result, reconciliation_result,
        errors, imported_by_actor)
     VALUES ('financial-chat-workbook', 'SYNTHETIC', 'predicate proof.xlsx', $1, 'predicate-v1',
             'mapping-v1', $2, 'staged', true, ARRAY['2099-07-01'::date], '[]', '[]', '{}',
             '{"valid":true}', '{"reconciled":true}', '[]', 'predicate-proof')
     RETURNING id`,
    [checksumCharacter.repeat(64), plantId],
  );
  return result.rows[0]!.id;
}

async function activateBatch(client: PoolClient, batchId: string): Promise<void> {
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'validated', validated_at_utc = now() WHERE id = $1",
    [batchId],
  );
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'active', activated_at_utc = now() WHERE id = $1",
    [batchId],
  );
}

function selection(
  plantId: string,
  componentKey: string,
  filters: FinancialSelection["filters"] = [],
): FinancialSelection {
  return {
    measureIds: ["actual"],
    dimensionIds: ["nursery_component", "section"],
    plantIds: [plantId],
    timeWindow: { kind: "month", from: "2099-07-01", to: "2099-07-31" },
    filters: [{ dimensionId: "nursery_component", operator: "eq", value: componentKey }, ...filters],
  };
}

function assertDisposableWarehouse(
  host: string | undefined,
  port: string | undefined,
  database: string | undefined,
): void {
  assert.equal(
    `${host}:${port}/${database}`,
    "127.0.0.1:5434/warehouse",
    "financial predicate proof requires 127.0.0.1:5434/warehouse",
  );
}
