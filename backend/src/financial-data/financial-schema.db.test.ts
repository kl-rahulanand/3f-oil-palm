import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Pool, PoolClient } from "pg";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";

test("the destructive financial schema proof refuses any target except the disposable warehouse", () => {
  for (const [host, port, database] of [
    ["warehouse.shared.example", "5434", "warehouse"],
    ["127.0.0.1", "5433", "warehouse"],
    ["localhost", "5434", "warehouse"],
    ["127.0.0.1", "5434", "not-the-disposable-database"],
  ]) {
    assert.throws(() => assertDisposableWarehouse(host, port, database), /financial schema proof requires/);
  }
});

test(
  "WAREHOUSE_DB_TEST stores labelled exact source facts while rejecting duplicates, orphans, cross-load references, owner mismatches, and active-generation extension, and migrates twice without changing legacy objects",
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
      const firstLegacyCatalog = await legacyCatalog(pool);
      await migrateWarehouse();
      assert.deepEqual(await legacyCatalog(pool), firstLegacyCatalog);
      assert.deepEqual(await financialTables(pool), [
        "actual_budget_mapping",
        "cost_center",
        "financial_actual",
        "gl_account",
        "ingestion_batch",
        "nursery_budget",
        "nursery_budget_component",
        "plant",
      ]);

      const key = randomUUID();
      const plantId = randomUUID();
      const otherPlantId = randomUUID();
      const costCenterId = randomUUID();
      const otherCostCenterId = randomUUID();
      const glAccountId = randomUUID();
      const lateGlAccountId = randomUUID();
      await pool.query(
        `INSERT INTO agent_financial.plant
           (id, code, name, source_aliases, created_by_actor)
         VALUES ($1, $2, 'DUB Nursery', ARRAY[$3], 'schema-proof'),
                ($4, $5, 'Other Nursery', ARRAY[]::text[], 'schema-proof')`,
        [plantId, `DUB-${key}`, `DUB-NUR-${key}`, otherPlantId, `OTHER-${key}`],
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.plant
             (code, name, source_aliases, created_by_actor)
           VALUES ($1, 'Alias collision', ARRAY[$2], 'schema-proof')`,
          [`COLLISION-${key}`, `DUB-NUR-${key}`],
        ),
        /plant aliases must resolve to one canonical target/,
      );
      await pool.query(
        `INSERT INTO agent_financial.cost_center
           (id, plant_id, source_system, code, name, source_aliases, created_by_actor)
         VALUES ($1, $2, 'SAP', $3, 'Primary', ARRAY[$4], 'schema-proof'),
                ($5, $6, 'SAP', $7, 'Other', ARRAY[]::text[], 'schema-proof')`,
        [
          costCenterId,
          plantId,
          `PRIMARY-${key}`,
          `PRIMARY-ALIAS-${key}`,
          otherCostCenterId,
          otherPlantId,
          `OTHER-${key}`,
        ],
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.cost_center
             (plant_id, source_system, code, name, source_aliases, created_by_actor)
           VALUES ($1, 'SAP', $2, 'Alias collision', ARRAY[$3], 'schema-proof')`,
          [plantId, `SECONDARY-${key}`, `PRIMARY-ALIAS-${key}`],
        ),
        /cost center aliases must resolve to one canonical target/,
      );
      await pool.query(
        `INSERT INTO agent_financial.gl_account
           (id, source_system, code, name, source_aliases, created_by_actor)
         VALUES ($1, 'SAP', $2, 'Sprout cost', ARRAY[$3], 'schema-proof'),
                ($4, 'SAP', $5, 'Late mapping proof', ARRAY[]::text[], 'schema-proof')`,
        [glAccountId, `GL-${key}`, `GL-ALIAS-${key}`, lateGlAccountId, `GL-LATE-${key}`],
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.gl_account
             (source_system, code, name, source_aliases, created_by_actor)
           VALUES ('SAP', $1, 'Alias collision', ARRAY[$2], 'schema-proof')`,
          [`GL-OTHER-${key}`, `GL-ALIAS-${key}`],
        ),
        /GL aliases must resolve to one canonical target/,
      );
      await proveConcurrentPlantAliasRefusal(pool, key);

      const firstBatchId = await insertBatch(pool, key, plantId, "first");
      const secondBatchId = await insertBatch(pool, key, plantId, "second");
      await assert.rejects(insertBatch(pool, key, plantId, "first"), /ingestion_batch_source_identity_unique/);
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.ingestion_batch
             (dataset_key, source_system, source_file_name, source_checksum_sha256,
              parser_version, mapping_version, budget_owner_plant_id, state, is_synthetic,
              source_reporting_months, actual_coverage, budget_coverage, source_counts,
              validation_result, reconciliation_result, errors, imported_by_actor,
              activated_at_utc)
           VALUES ($1, 'SAP_WORKBOOK', 'direct active.xlsx', $2, 'parser-v1', 'mapping-v1',
                   $3, 'active', true, ARRAY['2099-07-01'::date], '[]', '[]', '{}', '{}',
                   '{}', '[]', 'schema-proof', now())`,
          [`direct-active-${key}`, "c".repeat(64), plantId],
        ),
        /ingestion_batch must start staged/,
      );
      await assert.rejects(
        pool.query("UPDATE agent_financial.ingestion_batch SET source_file_name = 'changed.xlsx' WHERE id = $1", [
          firstBatchId,
        ]),
        /ingestion_batch source identity is immutable/,
      );
      await assert.rejects(
        pool.query("DELETE FROM agent_financial.ingestion_batch WHERE id = $1", [secondBatchId]),
        /ingestion_batch rows are immutable/,
      );
      const parentId = randomUUID();
      const leafId = randomUUID();
      await pool.query(
        `INSERT INTO agent_financial.nursery_budget_component
           (id, batch_id, component_key, s_no, component_name, depth, sort_order, is_leaf,
            source_row_number, source_row)
         VALUES ($1, $2, $3, '1', 'Materials', 0, 1, false, 480, '{"kind":"parent"}'),
                ($4, $2, $5, '1.1', 'Primary materials', 1, 2, true, 481, '{"kind":"leaf"}')`,
        [parentId, firstBatchId, `parent-${key}`, leafId, `leaf-${key}`],
      );

      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.nursery_budget_component
             (batch_id, component_key, parent_component_id, component_name, depth, sort_order,
              is_leaf, source_row_number, source_row)
           VALUES ($1, $2, $3, 'Cross-load child', 1, 3, true, 482, '{}')`,
          [secondBatchId, `cross-load-${key}`, parentId],
        ),
        /nursery_budget_component_parent_fk/,
      );

      const actual = await pool.query<{
        reporting_month: string;
        debit: string;
        credit: string;
        actual_amount: string;
        plant_id: string | null;
        cost_center_id: string | null;
      }>(
        `INSERT INTO agent_financial.financial_actual
           (batch_id, source_system, transaction_number, line_id, source_row_number,
            posting_date, section, source_plant_code, source_cost_center_code, source_gl_code,
            source_gl_name, consideration, short_name, contra_account, origin, location,
            debit, credit, line_memo, comment_1, comment_2, reference_1, source_row)
         VALUES ($1, 'SAP', $2, '1', 7, '2099-07-19', 'Nursery', NULL, NULL, $3,
                 'Sprout cost', 'Proof', 'Proof', NULL, 'Workbook', 'DUB',
                 '100.25', '0.05', 'memo', 'first', 'second', 'ref', '{"raw":"kept"}')
         RETURNING reporting_month::text, debit, credit, actual_amount, plant_id, cost_center_id`,
        [firstBatchId, `TX-${key}`, `GL-${key}`],
      );
      assert.deepEqual(actual.rows, [
        {
          reporting_month: "2099-07-01",
          debit: "100.25",
          credit: "0.05",
          actual_amount: "100.20",
          plant_id: null,
          cost_center_id: null,
        },
      ]);
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.financial_actual
             (batch_id, source_system, transaction_number, line_id, source_row_number,
              posting_date, cost_center_id, debit, credit, source_row)
           VALUES ($1, 'SAP', $2, '1', 8, '2099-07-20', $3, 1, 0, '{}')`,
          [firstBatchId, `ORPHAN-${key}`, costCenterId],
        ),
        /financial_actual_cost_center_requires_plant_check/,
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.financial_actual
             (batch_id, source_system, transaction_number, line_id, source_row_number,
              posting_date, debit, credit, source_row)
           VALUES ($1, 'SAP', $2, '1', 8, '2099-07-20', 1, 0, '{}')`,
          [firstBatchId, `TX-${key}`],
        ),
        /financial_actual_batch_source_line_unique/,
      );

      await pool.query(
        `INSERT INTO agent_financial.nursery_budget
           (batch_id, plant_id, budget_component_id, reporting_month, gl_account_id,
            payment_office, rollover_enabled, budget_amount, rollover_amount,
            source_row_number, source_row)
         VALUES ($1, $2, $3, '2099-07-01', NULL, 'HO', true, '250.00', '25.00', 481, '{}')`,
        [firstBatchId, plantId, leafId],
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.nursery_budget
             (batch_id, plant_id, budget_component_id, reporting_month, payment_office,
              rollover_enabled, budget_amount, rollover_amount, source_row_number, source_row)
           VALUES ($1, $2, $3, '2099-07-01', 'HO', true, 1, 0, 481, '{}')`,
          [firstBatchId, plantId, leafId],
        ),
        /nursery_budget_batch_leaf_month_unique/,
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.nursery_budget
             (batch_id, plant_id, budget_component_id, reporting_month, payment_office,
              rollover_enabled, budget_amount, rollover_amount, source_row_number, source_row)
           VALUES ($1, $2, $3, '2099-08-01', 'HO', false, 1, 0, 480, '{}')`,
          [firstBatchId, plantId, parentId],
        ),
        /nursery_budget facts must reference a leaf component/,
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.nursery_budget
             (batch_id, plant_id, budget_component_id, reporting_month, payment_office,
              rollover_enabled, budget_amount, rollover_amount, source_row_number, source_row)
           VALUES ($1, $2, $3, '2099-08-01', 'HO', false, 1, 0, 481, '{}')`,
          [firstBatchId, otherPlantId, leafId],
        ),
        /nursery_budget_batch_owner_fk/,
      );

      await pool.query(
        `INSERT INTO agent_financial.actual_budget_mapping
           (mapping_version_id, plant_id, cost_center_id, gl_account_id, budget_component_key,
            approval_status, approval_reason, approved_by, provenance)
         VALUES ($1, $2, $3, $4, $5, 'provisional', 'Recorded source mapping',
                 'schema-proof', '{"source":"fixture"}')`,
        [firstBatchId, plantId, costCenterId, glAccountId, `leaf-${key}`],
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.actual_budget_mapping
             (mapping_version_id, plant_id, cost_center_id, gl_account_id, budget_component_key,
              approval_status, approved_by, provenance)
           VALUES ($1, $2, $3, $4, $5, 'approved', 'schema-proof', '{}')`,
          [firstBatchId, plantId, costCenterId, glAccountId, `leaf-${key}`],
        ),
        /actual_budget_mapping_tuple_unique/,
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.actual_budget_mapping
             (mapping_version_id, plant_id, cost_center_id, gl_account_id, budget_component_key,
              approval_status, approved_by, provenance)
           VALUES ($1, $2, $3, $4, $5, 'approved', 'schema-proof', '{}')`,
          [secondBatchId, plantId, costCenterId, glAccountId, `leaf-${key}`],
        ),
        /actual_budget_mapping_component_fk/,
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO agent_financial.actual_budget_mapping
             (mapping_version_id, plant_id, cost_center_id, gl_account_id, budget_component_key,
              approval_status, approved_by, provenance)
           VALUES ($1, $2, $3, $4, $5, 'approved', 'schema-proof', '{}')`,
          [firstBatchId, otherPlantId, otherCostCenterId, glAccountId, `leaf-${key}`],
        ),
        /actual_budget_mapping_batch_owner_fk/,
      );
      await assert.rejects(
        pool.query("UPDATE agent_financial.financial_actual SET debit = 0 WHERE batch_id = $1", [firstBatchId]),
        /agent_financial source rows are immutable/,
      );
      await pool.query(
        `UPDATE agent_financial.ingestion_batch
            SET state = 'validated', validated_at_utc = now()
          WHERE id = $1`,
        [firstBatchId],
      );
      await assert.rejects(
        pool.query(
          `UPDATE agent_financial.ingestion_batch
              SET state = 'active', activated_at_utc = now(),
                  validation_result = '{"rewrittenAtActivation":true}'::jsonb
            WHERE id = $1`,
          [firstBatchId],
        ),
        /ingestion_batch validation evidence is immutable/,
      );
      await pool.query(
        `UPDATE agent_financial.ingestion_batch
            SET state = 'active', activated_at_utc = now()
          WHERE id = $1`,
        [firstBatchId],
      );
      const lateInserts: Array<[string, () => Promise<unknown>]> = [
        [
          "component",
          () =>
            pool.query(
              `INSERT INTO agent_financial.nursery_budget_component
                 (batch_id, component_key, component_name, depth, sort_order, is_leaf,
                  source_row_number, source_row)
               VALUES ($1, $2, 'Late component', 0, 99, true, 999, '{}')`,
              [firstBatchId, `late-${key}`],
            ),
        ],
        [
          "Actual",
          () =>
            pool.query(
              `INSERT INTO agent_financial.financial_actual
                 (batch_id, source_system, transaction_number, line_id, source_row_number,
                  posting_date, debit, credit, source_row)
               VALUES ($1, 'SAP', $2, '1', 999, '2099-09-01', 1, 0, '{}')`,
              [firstBatchId, `LATE-${key}`],
            ),
        ],
        [
          "Budget",
          () =>
            pool.query(
              `INSERT INTO agent_financial.nursery_budget
                 (batch_id, plant_id, budget_component_id, reporting_month, rollover_enabled,
                  budget_amount, rollover_amount, source_row_number, source_row)
               VALUES ($1, $2, $3, '2099-09-01', false, 1, 0, 999, '{}')`,
              [firstBatchId, plantId, leafId],
            ),
        ],
        [
          "mapping",
          () =>
            pool.query(
              `INSERT INTO agent_financial.actual_budget_mapping
                 (mapping_version_id, plant_id, cost_center_id, gl_account_id,
                  budget_component_key, approval_status, approved_by, provenance)
               VALUES ($1, $2, $3, $4, $5, 'approved', 'schema-proof', '{}')`,
              [firstBatchId, plantId, costCenterId, lateGlAccountId, `leaf-${key}`],
            ),
        ],
      ];
      for (const [sourceKind, insert] of lateInserts) {
        await assert.rejects(insert(), /ingestion batch must remain staged/, `${sourceKind} extended an active batch`);
      }
      const activeMetadataEdits = [
        "source_reporting_months = ARRAY['2099-08-01'::date]",
        `actual_coverage = '[{"plantId":"changed"}]'::jsonb`,
        `budget_coverage = '[{"plantId":"changed"}]'::jsonb`,
        `source_counts = '{"rows":999}'::jsonb`,
        `validation_result = '{"changed":true}'::jsonb`,
        `reconciliation_result = '{"changed":true}'::jsonb`,
        `errors = '[{"changed":true}]'::jsonb`,
        "validated_at_utc = validated_at_utc + interval '1 second'",
        "activated_at_utc = activated_at_utc + interval '1 second'",
      ];
      for (const edit of activeMetadataEdits) {
        await assert.rejects(
          pool.query(`UPDATE agent_financial.ingestion_batch SET ${edit} WHERE id = $1`, [firstBatchId]),
          /active ingestion_batch metadata is immutable/,
          `active batch accepted metadata edit: ${edit}`,
        );
      }
      const superseded = await pool.query<{ state: string }>(
        `UPDATE agent_financial.ingestion_batch
            SET state = 'superseded'
          WHERE id = $1
        RETURNING state`,
        [firstBatchId],
      );
      assert.equal(superseded.rows[0].state, "superseded");
      await assert.rejects(
        pool.query(
          `UPDATE agent_financial.ingestion_batch
              SET source_counts = '{"rows":1000}'::jsonb
            WHERE id = $1`,
          [firstBatchId],
        ),
        /active ingestion_batch metadata is immutable/,
      );

      const failedBatchId = await insertBatch(pool, randomUUID(), plantId, "failed");
      await pool.query(
        `UPDATE agent_financial.ingestion_batch
            SET state = 'failed', validated_at_utc = now(),
                validation_result = '{"valid":false}'::jsonb,
                errors = '[{"reason":"schema proof"}]'::jsonb
          WHERE id = $1`,
        [failedBatchId],
      );
      await assert.rejects(
        pool.query(
          `UPDATE agent_financial.ingestion_batch
              SET reconciliation_result = '{"rewrittenAfterFailure":true}'::jsonb
            WHERE id = $1`,
          [failedBatchId],
        ),
        /failed ingestion_batch metadata is immutable/,
      );

      const invalidTimestampCases: Array<[string, string]> = [
        ["staged batch with validation time", "SET validated_at_utc = now()"],
        ["staged batch with activation time", "SET activated_at_utc = now()"],
        ["validated batch without validation time", "SET state = 'validated'"],
        [
          "validated batch with activation time",
          "SET state = 'validated', validated_at_utc = now(), activated_at_utc = now()",
        ],
        ["failed batch without validation time", "SET state = 'failed'"],
        [
          "failed batch with activation time",
          "SET state = 'failed', validated_at_utc = now(), activated_at_utc = now()",
        ],
      ];
      for (const [label, assignment] of invalidTimestampCases) {
        const batchId = await insertBatch(pool, randomUUID(), plantId, label);
        await assert.rejects(
          pool.query(`UPDATE agent_financial.ingestion_batch ${assignment} WHERE id = $1`, [batchId]),
          /ingestion_batch timestamps are inconsistent for state/,
          label,
        );
      }
      const chronologyBatchId = await insertBatch(pool, randomUUID(), plantId, "chronology");
      await pool.query(
        `UPDATE agent_financial.ingestion_batch
            SET state = 'validated', validated_at_utc = now()
          WHERE id = $1`,
        [chronologyBatchId],
      );
      await assert.rejects(
        pool.query(
          `UPDATE agent_financial.ingestion_batch
              SET state = 'active', activated_at_utc = validated_at_utc - interval '1 second'
            WHERE id = $1`,
          [chronologyBatchId],
        ),
        /ingestion_batch timestamps are inconsistent for state/,
      );
    } finally {
      await pool.end();
    }
  },
);

async function insertBatch(pool: Pool, key: string, plantId: string, suffix: string): Promise<string> {
  const result = await pool.query<{ id: string; is_synthetic: boolean }>(
    `INSERT INTO agent_financial.ingestion_batch
       (dataset_key, source_system, source_file_name, source_checksum_sha256, parser_version,
        mapping_version, budget_owner_plant_id, state, is_synthetic, source_reporting_months,
        actual_coverage, budget_coverage, source_counts, validation_result,
        reconciliation_result, errors, imported_by_actor)
     VALUES ($1, 'SAP_WORKBOOK', 'schema proof.xlsx', $2, 'parser-v1', 'mapping-v1', $3,
             'staged', true, ARRAY['2099-07-01'::date], '[]', '[]', '{}', '{}', '{}', '[]',
             'schema-proof')
     RETURNING id, is_synthetic`,
    [`financial-chat-${key}`, key.replaceAll("-", "").padEnd(64, suffix === "first" ? "a" : "b"), plantId],
  );
  assert.equal(result.rows[0].is_synthetic, true, "generated schema-test batches must be labelled synthetic");
  return result.rows[0].id;
}

async function proveConcurrentPlantAliasRefusal(pool: Pool, key: string): Promise<void> {
  const first = await pool.connect();
  const second = await pool.connect();
  let firstCommitted = false;
  try {
    await first.query("BEGIN");
    await second.query("BEGIN");
    const secondPid = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    const sharedAlias = `RACE-${key}`;
    await insertPlantAlias(first, `RACE-FIRST-${key}`, sharedAlias);
    const secondOutcome = insertPlantAlias(second, `RACE-SECOND-${key}`, sharedAlias).then(
      () => ({ accepted: true as const, error: null }),
      (error: unknown) => ({ accepted: false as const, error }),
    );

    let waitingOnSerialization = false;
    for (let attempt = 0; attempt < 100 && !waitingOnSerialization; attempt += 1) {
      const result = await pool.query<{ waiting: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted) AS waiting",
        [secondPid],
      );
      waitingOnSerialization = result.rows[0].waiting;
    }
    assert.equal(waitingOnSerialization, true, "concurrent alias insert was not serialized");

    await first.query("COMMIT");
    firstCommitted = true;
    const outcome = await secondOutcome;
    assert.equal(outcome.accepted, false, "concurrent duplicate alias was accepted");
    assert.match(String(outcome.error), /plant aliases must resolve to one canonical target/);
  } finally {
    if (!firstCommitted) await rollback(first);
    await rollback(second);
    first.release();
    second.release();
  }
}

async function insertPlantAlias(client: PoolClient, code: string, alias: string): Promise<void> {
  await client.query(
    `INSERT INTO agent_financial.plant (code, name, source_aliases, created_by_actor)
     VALUES ($1, 'Concurrent alias proof', ARRAY[$2], 'schema-proof')`,
    [code, alias],
  );
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

async function financialTables(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'agent_financial' AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  return result.rows.map(({ table_name }) => table_name);
}

async function legacyCatalog(pool: Pool): Promise<unknown[]> {
  return (
    await pool.query(
      `SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner,
              COALESCE(pg_get_viewdef(c.oid, true), '') AS view_definition
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'v')
        ORDER BY c.relname`,
    )
  ).rows;
}

function assertDisposableWarehouse(
  host: string | undefined,
  port: string | undefined,
  database: string | undefined,
): void {
  assert.equal(
    `${host}:${port}/${database}`,
    "127.0.0.1:5434/warehouse",
    "financial schema proof requires 127.0.0.1:5434/warehouse",
  );
}
