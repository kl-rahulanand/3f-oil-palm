import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { AuthUser, FinancialQueryResult } from "@3f/contract";
import type { PoolClient } from "pg";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { ActualDrillContextService } from "./actual-drill-context.service";
import { ActualTransactionsRepository } from "./actual-transactions.repository";
import { FinancialAccessService } from "./financial-access.service";
import { FinancialDataService } from "./financial-data.service";
import { FinancialQueryRepository } from "./financial-query.repository";

const REQUIRED_MEASURES = [
  "mis-statement.actual_net",
  "mis-statement.budget_net",
  "mis-statement.rollover_net",
  "mis-statement.percentage",
];

test("the destructive Actual drill proof refuses targets outside the disposable warehouse", () => {
  for (const [host, port, database] of [
    ["warehouse.shared.example", "5434", "warehouse"],
    ["127.0.0.1", "5433", "warehouse"],
    ["localhost", "5434", "warehouse"],
    ["127.0.0.1", "5434", "not-the-disposable-database"],
  ]) {
    assert.throws(() => assertDisposableWarehouse(host, port, database), /Actual drill proof requires/);
  }
});

test(
  "done-when 4: WAREHOUSE_DB_TEST traverses the exact partial zero-net set from prepared 10 to continuation 20",
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
      const fixture = await seedPartialZeroNetFixture(client);
      const rbac = new FakeRbac(user(fixture.plantCode));
      const service = new FinancialDataService(
        new FinancialAccessService(rbac, new FakeAudit()),
        new FakeWarehouse(),
        new FinancialQueryRepository(client),
        new ActualDrillContextService(() => 0),
        new ActualTransactionsRepository(client),
      );

      const result = await service.query("reader", {
        measureIds: ["actual"],
        dimensionIds: [],
        plantIds: [fixture.plantCode],
        timeWindow: { kind: "month", from: "2099-05-01", to: "2099-05-31" },
        filters: [],
      });
      const handle = partialHandle(result);
      assert.equal(result.totals.actual?.state, "not_loaded");
      assert.equal(result.totals.availableActualSubtotal?.value, "0.00");

      const prepared = await service.transactions("reader", handle, 1, 10);
      assert.deepEqual(
        prepared.transactions.map(({ transactionNumber }) => transactionNumber),
        fixture.ids.slice(0, 10),
      );
      assert.equal(prepared.totalItems, 31);
      assert.equal(prepared.totalPages, 3);
      assert.equal(prepared.matchingActualTotal, "0.00");
      assert.equal(prepared.pinnedContinuationLimit, null);

      await activateReplacement(client, fixture.plantId);
      const second = await service.transactions("reader", handle, 2);
      const third = await service.transactions("reader", handle, 3, 20);
      assert.equal(second.pinnedContinuationLimit, 20);
      assert.equal(third.pinnedContinuationLimit, 20);
      assert.deepEqual(
        [...prepared.transactions, ...second.transactions, ...third.transactions].map(
          ({ transactionNumber }) => transactionNumber,
        ),
        fixture.ids,
      );
      assert.equal(
        new Set([...prepared.transactions, ...second.transactions, ...third.transactions].map(({ id }) => id)).size,
        31,
      );
      assert.equal((await service.transactions("reader", handle, 1, 10)).pinnedContinuationLimit, 20);

      await rejectsWithReason(service.transactions("reader", handle, 0, 10), "invalid_pagination", {
        fieldErrors: [{ field: "page", reason: "must be an integer from 1" }],
      });
      await rejectsWithReason(service.transactions("reader", handle, 1, 20), "invalid_pagination", {
        fieldErrors: [{ field: "limit", reason: "page 1 uses 10 rows" }],
      });
      await rejectsWithReason(service.transactions("reader", handle, 2, 101), "invalid_pagination", {
        fieldErrors: [{ field: "limit", reason: "must be an integer from 1 to 100" }],
      });
      await rejectsWithReason(service.transactions("reader", handle, 2, 10), "page_size_changed", {
        pinnedContinuationLimit: 20,
      });
      await rejectsWithReason(service.transactions("reader", handle, 4, 20), "page_out_of_range");

      rbac.current = user("REVOKED");
      await rejectsWithReason(service.transactions("reader", handle, 1, 10), "permission_changed");
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  },
);

async function seedPartialZeroNetFixture(
  client: PoolClient,
): Promise<{ plantId: string; plantCode: string; ids: string[] }> {
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'superseded' WHERE dataset_key = 'financial-chat-workbook' AND state = 'active'",
  );
  const suffix = randomUUID();
  const plantId = randomUUID();
  const plantCode = `DRILL-${suffix}`;
  const glId = randomUUID();
  await client.query(
    `INSERT INTO agent_financial.plant (id, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'Actual drill Plant', '{}', 'actual-drill-proof')`,
    [plantId, plantCode],
  );
  await client.query(
    `INSERT INTO agent_financial.gl_account
       (id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, 'SAP', 'GL-DRILL', 'Actual drill GL', '{}', 'actual-drill-proof')`,
    [glId],
  );
  const batch = await client.query<{ id: string }>(
    `INSERT INTO agent_financial.ingestion_batch
       (dataset_key, source_system, source_file_name, source_checksum_sha256, parser_version,
        mapping_version, budget_owner_plant_id, state, is_synthetic, source_reporting_months,
        actual_coverage, budget_coverage, source_counts, validation_result, reconciliation_result,
        errors, imported_by_actor)
     VALUES ('financial-chat-workbook', 'SYNTHETIC', 'actual drill proof.xlsx', $1, 'drill-v1',
             'mapping-v1', $2, 'staged', true, ARRAY['2099-05-01'::date],
             $3::jsonb, '[]', '{}', '{"valid":true}', '{"reconciled":true}', '[]', 'actual-drill-proof')
     RETURNING id`,
    [
      suffix.replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      plantId,
      JSON.stringify([{ plantId, month: "2099-05-01", completeness: "unconfirmed" }]),
    ],
  );
  const batchId = batch.rows[0]!.id;
  const ids = Array.from({ length: 31 }, (_, index) => `TX-${String(index + 1).padStart(2, "0")}`);
  for (const [index, transactionNumber] of ids.entries()) {
    const debit = index < 15 ? "100.00" : "0.00";
    const credit = index >= 15 && index < 30 ? "100.00" : "0.00";
    await client.query(
      `INSERT INTO agent_financial.financial_actual
         (batch_id, source_system, transaction_number, line_id, source_row_number, posting_date,
          plant_id, gl_account_id, source_plant_code, debit, credit, line_memo, reference_1, source_row)
       VALUES ($1, 'SAP', $2, '1', $3, '2099-05-10', $4, $5, $6, $7, $8, $9, $10, '{}')`,
      [
        batchId,
        transactionNumber,
        index + 1,
        plantId,
        glId,
        plantCode,
        debit,
        credit,
        `Memo ${index + 1}`,
        `Ref ${index + 1}`,
      ],
    );
  }
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'validated', validated_at_utc = now() WHERE id = $1",
    [batchId],
  );
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'active', activated_at_utc = now() WHERE id = $1",
    [batchId],
  );
  return { plantId, plantCode, ids };
}

async function activateReplacement(client: PoolClient, plantId: string): Promise<void> {
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'superseded' WHERE dataset_key = 'financial-chat-workbook' AND state = 'active'",
  );
  const replacement = await client.query<{ id: string }>(
    `INSERT INTO agent_financial.ingestion_batch
       (dataset_key, source_system, source_file_name, source_checksum_sha256, parser_version,
        mapping_version, budget_owner_plant_id, state, is_synthetic, source_reporting_months,
        actual_coverage, budget_coverage, source_counts, validation_result, reconciliation_result,
        errors, imported_by_actor)
     VALUES ('financial-chat-workbook', 'SYNTHETIC', 'replacement.xlsx', $1, 'drill-v1',
             'mapping-v2', $2, 'staged', true, ARRAY[]::date[], '[]', '[]', '{}',
             '{"valid":true}', '{"reconciled":true}', '[]', 'actual-drill-proof')
     RETURNING id`,
    ["f".repeat(64), plantId],
  );
  const replacementId = replacement.rows[0]!.id;
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'validated', validated_at_utc = now() WHERE id = $1",
    [replacementId],
  );
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'active', activated_at_utc = now() WHERE id = $1",
    [replacementId],
  );
}

function partialHandle(result: FinancialQueryResult): string {
  const handle = result.totals.availableActualSubtotal?.drilldownId;
  assert.ok(handle);
  return handle;
}

function user(plantCode: string): AuthUser {
  return {
    id: "reader",
    email: "reader@example.invalid",
    display_name: "Reader",
    is_active: true,
    roles: ["reader"],
    permissions: {
      actions: ["report"],
      domains: ["mis-statement"],
      measureIds: REQUIRED_MEASURES,
      dimensionIds: ["leaf_key"],
    },
    scope: [{ attribute: "plant", value: plantCode }],
  };
}

async function rejectsWithReason(
  promise: Promise<unknown>,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error && typeof error === "object" && "getResponse" in error);
    const response = (error as { getResponse(): unknown }).getResponse();
    assert.ok(response && typeof response === "object" && "details" in response);
    assert.deepEqual((response as { details: unknown }).details, { reason, ...extra });
    return true;
  });
}

class FakeRbac {
  constructor(public current: AuthUser) {}

  async resolveUser(): Promise<AuthUser> {
    return this.current;
  }
}

class FakeAudit {
  async writeRequestEvent(): Promise<number> {
    return 1;
  }
}

class FakeWarehouse implements Warehouse {
  async execute(): Promise<QueryResult> {
    throw new Error("Actual drill must use its parameterized repository");
  }
  async explain(): Promise<void> {}
  async freshness(): Promise<string | null> {
    return null;
  }
  async distinctValues(): Promise<string[]> {
    return [];
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
    "Actual drill proof requires 127.0.0.1:5434/warehouse",
  );
}
