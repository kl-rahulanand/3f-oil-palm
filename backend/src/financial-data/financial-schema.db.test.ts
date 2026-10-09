import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Pool } from "pg";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";

test("the destructive financial schema proof refuses any target except the disposable warehouse", () => {
  for (const [host, port] of [
    ["warehouse.shared.example", "5434"],
    ["127.0.0.1", "5433"],
    ["localhost", "5434"],
  ]) {
    assert.throws(() => assertDisposableWarehouse(host, port), /127\.0\.0\.1:5434/);
  }
});

test(
  "WAREHOUSE_DB_TEST stores exact source facts while rejecting duplicates, orphans, and cross-load references, and migrates twice without changing legacy objects",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertDisposableWarehouse(process.env.WAREHOUSE_PG_HOST, process.env.WAREHOUSE_PG_PORT);
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
      const glAccountId = randomUUID();
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
         VALUES ($1, $2, 'SAP', $3, 'Primary', ARRAY[$4], 'schema-proof')`,
        [costCenterId, plantId, `PRIMARY-${key}`, `PRIMARY-ALIAS-${key}`],
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
         VALUES ($1, 'SAP', $2, 'Sprout cost', ARRAY[$3], 'schema-proof')`,
        [glAccountId, `GL-${key}`, `GL-ALIAS-${key}`],
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

      const firstBatchId = await insertBatch(pool, key, plantId, "first");
      const secondBatchId = await insertBatch(pool, key, plantId, "second");
      await assert.rejects(insertBatch(pool, key, plantId, "first"), /ingestion_batch_source_identity_unique/);
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
        pool.query("UPDATE agent_financial.financial_actual SET debit = 0 WHERE batch_id = $1", [firstBatchId]),
        /agent_financial source rows are immutable/,
      );
    } finally {
      await pool.end();
    }
  },
);

async function insertBatch(pool: Pool, key: string, plantId: string, suffix: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO agent_financial.ingestion_batch
       (dataset_key, source_system, source_file_name, source_checksum_sha256, parser_version,
        mapping_version, budget_owner_plant_id, state, source_reporting_months,
        actual_coverage, budget_coverage, source_counts, validation_result,
        reconciliation_result, errors, imported_by_actor)
     VALUES ($1, 'SAP_WORKBOOK', 'schema proof.xlsx', $2, 'parser-v1', 'mapping-v1', $3,
             'staged', ARRAY['2099-07-01'::date], '[]', '[]', '{}', '{}', '{}', '[]',
             'schema-proof')
     RETURNING id`,
    [`financial-chat-${key}`, key.replaceAll("-", "").padEnd(64, suffix === "first" ? "a" : "b"), plantId],
  );
  return result.rows[0].id;
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

function assertDisposableWarehouse(host: string | undefined, port: string | undefined): void {
  assert.equal(`${host}:${port}`, "127.0.0.1:5434", "financial schema proof requires 127.0.0.1:5434");
}
