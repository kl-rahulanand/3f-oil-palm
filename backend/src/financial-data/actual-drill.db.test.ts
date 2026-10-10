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

const EXPECTED_IDENTITIES = [
  ["00000000-0000-4000-8000-000000000031", "2099-05-01", "TX-Z", "LINE-Z"],
  ["00000000-0000-4000-8000-000000000030", "2099-05-02", "TX-A", "LINE-Z"],
  ["00000000-0000-4000-8000-000000000029", "2099-05-02", "TX-B", "LINE-A"],
  ["00000000-0000-4000-8000-000000000028", "2099-05-02", "TX-B", "LINE-Z"],
  ["00000000-0000-4000-8000-000000000027", "2099-05-03", "TX-01", "LINE-1"],
  ["00000000-0000-4000-8000-000000000026", "2099-05-03", "TX-02", "LINE-1"],
  ["00000000-0000-4000-8000-000000000025", "2099-05-03", "TX-03", "LINE-1"],
  ["00000000-0000-4000-8000-000000000024", "2099-05-03", "TX-04", "LINE-1"],
  ["00000000-0000-4000-8000-000000000023", "2099-05-03", "TX-05", "LINE-1"],
  ["00000000-0000-4000-8000-000000000022", "2099-05-03", "TX-06", "LINE-1"],
  ["00000000-0000-4000-8000-000000000021", "2099-05-03", "TX-07", "LINE-1"],
  ["00000000-0000-4000-8000-000000000020", "2099-05-03", "TX-08", "LINE-1"],
  ["00000000-0000-4000-8000-000000000019", "2099-05-03", "TX-09", "LINE-1"],
  ["00000000-0000-4000-8000-000000000018", "2099-05-03", "TX-10", "LINE-1"],
  ["00000000-0000-4000-8000-000000000017", "2099-05-03", "TX-11", "LINE-1"],
  ["00000000-0000-4000-8000-000000000016", "2099-05-03", "TX-12", "LINE-1"],
  ["00000000-0000-4000-8000-000000000015", "2099-05-03", "TX-13", "LINE-1"],
  ["00000000-0000-4000-8000-000000000014", "2099-05-03", "TX-14", "LINE-1"],
  ["00000000-0000-4000-8000-000000000013", "2099-05-03", "TX-15", "LINE-1"],
  ["00000000-0000-4000-8000-000000000012", "2099-05-03", "TX-16", "LINE-1"],
  ["00000000-0000-4000-8000-000000000011", "2099-05-03", "TX-17", "LINE-1"],
  ["00000000-0000-4000-8000-000000000010", "2099-05-03", "TX-18", "LINE-1"],
  ["00000000-0000-4000-8000-000000000009", "2099-05-03", "TX-19", "LINE-1"],
  ["00000000-0000-4000-8000-000000000008", "2099-05-03", "TX-20", "LINE-1"],
  ["00000000-0000-4000-8000-000000000007", "2099-05-03", "TX-21", "LINE-1"],
  ["00000000-0000-4000-8000-000000000006", "2099-05-03", "TX-22", "LINE-1"],
  ["00000000-0000-4000-8000-000000000005", "2099-05-03", "TX-23", "LINE-1"],
  ["00000000-0000-4000-8000-000000000004", "2099-05-03", "TX-24", "LINE-1"],
  ["00000000-0000-4000-8000-000000000003", "2099-05-03", "TX-25", "LINE-1"],
  ["00000000-0000-4000-8000-000000000002", "2099-05-03", "TX-26", "LINE-1"],
  ["00000000-0000-4000-8000-000000000001", "2099-05-03", "TX-27", "LINE-1"],
] as const;

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
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("TRUNCATE agent_financial.ingestion_batch CASCADE");
      const fixture = await seedPartialZeroNetFixture(client);
      await client.query("COMMIT");
      transactionOpen = false;
      const rbac = new FakeRbac(user(fixture.plantCode));
      const service = new FinancialDataService(
        new FinancialAccessService(rbac, new FakeAudit()),
        new FakeWarehouse(),
        new FinancialQueryRepository(pool),
        new ActualDrillContextService(() => 0),
        new ActualTransactionsRepository(pool),
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
      assert.deepEqual(prepared.transactions.map(transactionIdentity), expectedIdentities().slice(0, 10));
      assert.equal(prepared.totalItems, 31);
      assert.equal(prepared.totalPages, 3);
      assert.equal(prepared.matchingActualTotal, "0.00");
      assert.equal(prepared.pinnedContinuationLimit, null);

      const raceHandle = partialHandle(
        await service.query("reader", {
          measureIds: ["actual"],
          dimensionIds: [],
          plantIds: [fixture.plantCode],
          timeWindow: { kind: "month", from: "2099-05-01", to: "2099-05-31" },
          filters: [],
        }),
      );
      await rejectsWithReason(service.transactions("reader", raceHandle, 2, 101), "invalid_pagination", {
        fieldErrors: [{ field: "limit", reason: "must be an integer from 1 to 100" }],
      });
      await rejectsWithReason(service.transactions("reader", raceHandle, 99, 7), "page_out_of_range");
      assert.equal((await service.transactions("reader", raceHandle, 1, 10)).pinnedContinuationLimit, null);
      const competing = await Promise.allSettled([
        service.transactions("reader", raceHandle, 2, 7),
        service.transactions("reader", raceHandle, 2, 20),
      ]);
      assert.equal(competing.filter(({ status }) => status === "fulfilled").length, 1);
      const winner = competing.find((entry) => entry.status === "fulfilled");
      assert.ok(winner?.status === "fulfilled");
      const losingLimit = winner.value.limit === 7 ? 20 : 7;
      const loser = competing.find((entry) => entry.status === "rejected");
      assert.ok(loser?.status === "rejected");
      assertReason(loser.reason, "page_size_changed", { pinnedContinuationLimit: winner.value.limit });
      await rejectsWithReason(service.transactions("reader", raceHandle, 2, losingLimit), "page_size_changed", {
        pinnedContinuationLimit: winner.value.limit,
      });
      assert.equal(
        (await service.transactions("reader", raceHandle, 1, 10)).pinnedContinuationLimit,
        winner.value.limit,
      );

      const tieBatchId = await seedInternalIdTie(client, fixture);
      const tied = await new ActualTransactionsRepository(pool).page(
        {
          sourceBatchIds: [fixture.batchId, tieBatchId],
          mappingVersionId: fixture.batchId,
          plantIds: [fixture.plantCode],
          plantRecordIds: [fixture.plantId],
          from: "2099-05-01",
          to: "2099-05-31",
          grouping: [],
          cellIdentity: {},
          filters: [],
          componentKeys: [],
        },
        0,
        2,
      );
      assert.deepEqual(tied.map(transactionIdentity), [
        {
          id: "00000000-0000-4000-8000-000000000000",
          postingDate: "2099-05-01",
          transactionNumber: "TX-Z",
          lineId: "LINE-Z",
        },
        expectedIdentities()[0],
      ]);

      await activateReplacement(client, fixture.plantId);
      const second = await service.transactions("reader", handle, 2);
      const third = await service.transactions("reader", handle, 3, 20);
      assert.equal(second.pinnedContinuationLimit, 20);
      assert.equal(third.pinnedContinuationLimit, 20);
      const traversed = [...prepared.transactions, ...second.transactions, ...third.transactions];
      assert.deepEqual(traversed.map(transactionIdentity), expectedIdentities());
      assert.equal(new Set(traversed.map(({ id }) => id)).size, 31);
      assert.match(traversed.at(-1)?.id ?? "", /000000000001$/);
      assert.deepEqual(pickMoney(traversed.at(-1)), { debit: "50.00", credit: "50.00", actual: "0.00" });
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
      if (transactionOpen) await client.query("ROLLBACK");
      else await pool.query("TRUNCATE agent_financial.ingestion_batch CASCADE");
      client.release();
      await pool.end();
    }
  },
);

async function seedPartialZeroNetFixture(
  client: PoolClient,
): Promise<{ batchId: string; glId: string; plantId: string; plantCode: string }> {
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
     VALUES ($1, 'SAP', $2, 'Actual drill GL', '{}', 'actual-drill-proof')`,
    [glId, `GL-DRILL-${suffix}`],
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
  for (const [index, [id, postingDate, transactionNumber, lineId]] of EXPECTED_IDENTITIES.entries()) {
    const debit = index < 15 ? "100.00" : "0.00";
    const credit = index >= 15 && index < 30 ? "100.00" : index === 30 ? "50.00" : "0.00";
    const adjustedDebit = index === 30 ? "50.00" : debit;
    await client.query(
      `INSERT INTO agent_financial.financial_actual
         (id, batch_id, source_system, transaction_number, line_id, source_row_number, posting_date,
          plant_id, gl_account_id, source_plant_code, debit, credit, line_memo, reference_1, source_row)
       VALUES ($1, $2, 'SAP', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, '{}')`,
      [
        id,
        batchId,
        transactionNumber,
        lineId,
        index + 1,
        postingDate,
        plantId,
        glId,
        plantCode,
        adjustedDebit,
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
  return { batchId, glId, plantId, plantCode };
}

async function seedInternalIdTie(
  client: PoolClient,
  fixture: { glId: string; plantId: string; plantCode: string },
): Promise<string> {
  const batch = await client.query<{ id: string }>(
    `INSERT INTO agent_financial.ingestion_batch
       (dataset_key, source_system, source_file_name, source_checksum_sha256, parser_version,
        mapping_version, budget_owner_plant_id, state, is_synthetic, source_reporting_months,
        actual_coverage, budget_coverage, source_counts, validation_result, reconciliation_result,
        errors, imported_by_actor)
     VALUES ('actual-drill-id-order', 'SYNTHETIC', 'actual drill id order.xlsx', $1, 'drill-v1',
             'mapping-v1', $2, 'staged', true, ARRAY['2099-05-01'::date],
             $3::jsonb, '[]', '{}', '{"valid":true}', '{"reconciled":true}', '[]', 'actual-drill-proof')
     RETURNING id`,
    [
      "e".repeat(64),
      fixture.plantId,
      JSON.stringify([{ plantId: fixture.plantId, month: "2099-05-01", completeness: "unconfirmed" }]),
    ],
  );
  const batchId = batch.rows[0]!.id;
  await client.query(
    `INSERT INTO agent_financial.financial_actual
       (id, batch_id, source_system, transaction_number, line_id, source_row_number, posting_date,
        plant_id, gl_account_id, source_plant_code, debit, credit, line_memo, reference_1, source_row)
     VALUES ('00000000-0000-4000-8000-000000000000', $1, 'SAP', 'TX-Z', 'LINE-Z', 1, '2099-05-01',
             $2, $3, $4, 0, 0, 'Internal ID tie', 'ID tie', '{}')`,
    [batchId, fixture.plantId, fixture.glId, fixture.plantCode],
  );
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'validated', validated_at_utc = now() WHERE id = $1",
    [batchId],
  );
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'active', activated_at_utc = now() WHERE id = $1",
    [batchId],
  );
  return batchId;
}

function expectedIdentities(): Array<{ id: string; postingDate: string; transactionNumber: string; lineId: string }> {
  return EXPECTED_IDENTITIES.map(([id, postingDate, transactionNumber, lineId]) => ({
    id,
    postingDate,
    transactionNumber,
    lineId,
  }));
}

function transactionIdentity(transaction: {
  id: string;
  postingDate: string;
  transactionNumber: string;
  lineId: string;
}): { id: string; postingDate: string; transactionNumber: string; lineId: string } {
  const { id, postingDate, transactionNumber, lineId } = transaction;
  return { id, postingDate, transactionNumber, lineId };
}

function pickMoney(
  transaction: { debit: string; credit: string; actual: string } | undefined,
): { debit: string; credit: string; actual: string } | undefined {
  if (!transaction) return undefined;
  const { debit, credit, actual } = transaction;
  return { debit, credit, actual };
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
    assertReason(error, reason, extra);
    return true;
  });
}

function assertReason(error: unknown, reason: string, extra: Record<string, unknown> = {}): void {
  assert.ok(error && typeof error === "object" && "getResponse" in error);
  const response = (error as { getResponse(): unknown }).getResponse();
  assert.ok(response && typeof response === "object" && "details" in response);
  assert.deepEqual((response as { details: unknown }).details, { reason, ...extra });
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
