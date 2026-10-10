import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { AuthUser, FinancialSelection } from "@3f/contract";
import type { Pool } from "pg";
import type { AuditService } from "../core/audit.service";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { PostgresAdapter } from "../warehouse/postgres.adapter";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { FinancialAccessService } from "./financial-access.service";
import { FinancialDataService } from "./financial-data.service";

const REQUIRED_MEASURES = [
  "mis-statement.actual_net",
  "mis-statement.budget_net",
  "mis-statement.rollover_net",
  "mis-statement.percentage",
];

test("catalog denies a user without current report permission", async () => {
  const rbac = new FakeRbac(user({ actions: [] }));
  const audit = new FakeAudit();
  const warehouse = new FakeWarehouse([]);
  const service = new FinancialDataService(new FinancialAccessService(rbac, audit), warehouse);

  await rejectsWithReason(service.getCatalog("reader"), "access_denied");
  assert.equal(warehouse.reads, 0);
  assert.equal(audit.events[0]?.question, "Financial catalog access refused: access_denied");
});

test("catalog guides a user who has report permission but no Plant grants", async () => {
  const audit = new FakeAudit();
  const warehouse = new FakeWarehouse([]);
  const service = new FinancialDataService(
    new FinancialAccessService(new FakeRbac(user({ scope: [] })), audit),
    warehouse,
  );

  await rejectsWithReason(service.getCatalog("reader"), "no_plant_access");
  assert.equal(warehouse.reads, 0);
  assert.equal(audit.events[0]?.question, "Financial catalog access refused: no_plant_access");
});

test("catalog rechecks permissions and denies a grant revoked after an earlier read", async () => {
  const rbac = new FakeRbac(user());
  const audit = new FakeAudit();
  const service = new FinancialDataService(new FinancialAccessService(rbac, audit), new FakeWarehouse([]));

  assert.equal((await service.getCatalog("reader")).fiscalYearStartMonth, 4);
  rbac.current = user({ actions: [] });
  await rejectsWithReason(service.getCatalog("reader"), "access_denied");
  assert.deepEqual(
    audit.events.map(({ question }) => question),
    ["Financial catalog access authorized", "Financial catalog access refused: access_denied"],
  );
});

test(
  "WAREHOUSE_DB_TEST scoped vocabulary lookup reads current Actual and Budget values through Postgres",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertVocabularyTestWarehouse();
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await seedVocabulary(pool);
      const rbac = new FakeRbac(user());
      const service = new FinancialDataService(
        new FinancialAccessService(rbac, new FakeAudit()),
        new PostgresAdapter(),
      );

      assert.deepEqual(await service.findValues("reader", "gl", ""), [
        { dimensionId: "gl", value: "5001", label: "Actual supplies", aliases: ["Actual alias"] },
        { dimensionId: "gl", value: "5002", label: "Budget seedlings", aliases: ["Budget alias"] },
      ]);
      assert.deepEqual(await service.findValues("reader", "month", ""), [
        { dimensionId: "month", value: "2026-04-01", label: "2026-04-01", aliases: [] },
        { dimensionId: "month", value: "2026-05-01", label: "2026-05-01", aliases: [] },
      ]);
      assert.deepEqual(await service.findValues("reader", "cost_center", ""), [
        { dimensionId: "cost_center", value: "DUB-ACTIVE", label: "DUB active", aliases: [] },
      ]);

      rbac.current = user({ scope: [{ attribute: "plant", value: "CHIR" }] });
      assert.deepEqual(await service.findValues("reader", "gl", ""), [
        { dimensionId: "gl", value: "5003", label: "CHIR supplies", aliases: [] },
      ]);
    } finally {
      await pool.end();
    }
  },
);

test("selection validation rejects Budget grouped by Cost Center", async () => {
  const service = new FinancialDataService(
    new FinancialAccessService(new FakeRbac(user()), new FakeAudit()),
    new FakeWarehouse([]),
  );

  await rejectsWithReason(
    service.assertSelectionSupported("reader", selection({ measureIds: ["budget"], dimensionIds: ["cost_center"] })),
    "unsupported_selection",
  );
});

test("selection validation rejects an Actual GL and Cost Center grouping absent from the catalog", async () => {
  const service = new FinancialDataService(
    new FinancialAccessService(new FakeRbac(user()), new FakeAudit()),
    new FakeWarehouse([]),
  );

  await rejectsWithReason(
    service.assertSelectionSupported(
      "reader",
      selection({ measureIds: ["actual"], dimensionIds: ["gl", "cost_center"] }),
    ),
    "unsupported_selection",
  );
});

test("selection validation rejects a Budget Cost Center filter", async () => {
  const service = new FinancialDataService(
    new FinancialAccessService(new FakeRbac(user()), new FakeAudit()),
    new FakeWarehouse([]),
  );

  await rejectsWithReason(
    service.assertSelectionSupported(
      "reader",
      selection({
        measureIds: ["budget"],
        filters: [{ dimensionId: "cost_center", operator: "eq", value: "CC-01" }],
      }),
    ),
    "unsupported_selection",
  );
});

test("financial access audits actor, nonfinancial scope, opaque references and failure without prompt, amount or row payload", async () => {
  const rbac = new FakeRbac(user());
  const audit = new FakeAudit();
  const warehouse = new FakeWarehouse([
    {
      plant_code: "DUB",
      value: "DUB",
      label: "what did we spend transaction-row 123.45 drilldown-handle",
      aliases: "[]",
    },
  ]);
  const service = new FinancialDataService(new FinancialAccessService(rbac, audit), warehouse);

  assert.equal((await service.findValues("reader", "plant", "what did we spend")).length, 1);
  rbac.current = user({ domains: [] });
  await rejectsWithReason(service.getCatalog("reader"), "access_denied");

  assert.equal(audit.events[0]?.userId, "reader");
  assert.deepEqual(audit.events[0]?.selection?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
  assert.deepEqual(audit.events[0]?.objectsTouched, ["dimension:plant"]);
  assert.deepEqual(audit.events[1]?.objectsTouched, ["financial-catalog:v1", "failure:access_denied"]);

  const serialized = JSON.stringify(audit.events);
  for (const forbidden of ["what did we spend", "123.45", "transaction-row", "drilldown-handle"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("audit failure prevents vocabulary reads", async () => {
  const audit = new FakeAudit();
  audit.fail = true;
  const warehouse = new FakeWarehouse([{ plant_code: "DUB", value: "DUB", label: "DUB", aliases: "[]" }]);
  const service = new FinancialDataService(new FinancialAccessService(new FakeRbac(user()), audit), warehouse);

  await rejectsWithReason(service.findValues("reader", "plant", "dub"), "data_unavailable");
  assert.equal(warehouse.reads, 0);
});

async function seedVocabulary(pool: Pool): Promise<void> {
  const ids = {
    dub: randomUUID(),
    chir: randomUUID(),
    actualGl: randomUUID(),
    budgetGl: randomUUID(),
    chirGl: randomUUID(),
    historicalGl: randomUUID(),
    activeCostCenter: randomUUID(),
    chirCostCenter: randomUUID(),
    historicalCostCenter: randomUUID(),
    dubBatch: randomUUID(),
    chirBatch: randomUUID(),
    historicalBatch: randomUUID(),
    budgetComponent: randomUUID(),
  };
  await pool.query(
    `TRUNCATE agent_financial.actual_budget_mapping, agent_financial.nursery_budget,
       agent_financial.financial_actual, agent_financial.nursery_budget_component,
       agent_financial.cost_center, agent_financial.gl_account,
       agent_financial.ingestion_batch, agent_financial.plant CASCADE`,
  );
  await pool.query(
    `INSERT INTO agent_financial.plant (id, code, name, source_aliases, created_by_actor)
     VALUES ($1, 'DUB', 'DUB Nursery', ARRAY[]::text[], 'catalog-proof'),
            ($2, 'CHIR', 'CHIR Nursery', ARRAY[]::text[], 'catalog-proof')`,
    [ids.dub, ids.chir],
  );
  await pool.query(
    `INSERT INTO agent_financial.gl_account
       (id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, 'SAP', '5001', 'Actual supplies', ARRAY['Actual alias'], 'catalog-proof'),
            ($2, 'SAP', '5002', 'Budget seedlings', ARRAY['Budget alias'], 'catalog-proof'),
            ($3, 'SAP', '5003', 'CHIR supplies', ARRAY[]::text[], 'catalog-proof'),
            ($4, 'SAP', '5999', 'Historical supplies', ARRAY[]::text[], 'catalog-proof')`,
    [ids.actualGl, ids.budgetGl, ids.chirGl, ids.historicalGl],
  );
  await pool.query(
    `INSERT INTO agent_financial.cost_center
       (id, plant_id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'SAP', 'DUB-ACTIVE', 'DUB active', ARRAY[]::text[], 'catalog-proof'),
            ($3, $4, 'SAP', 'CHIR-ACTIVE', 'CHIR active', ARRAY[]::text[], 'catalog-proof'),
            ($5, $2, 'SAP', 'DUB-HISTORICAL', 'DUB historical', ARRAY[]::text[], 'catalog-proof')`,
    [ids.activeCostCenter, ids.dub, ids.chirCostCenter, ids.chir, ids.historicalCostCenter],
  );
  await pool.query(
    `INSERT INTO agent_financial.ingestion_batch
       (id, dataset_key, source_system, source_file_name, source_checksum_sha256,
        parser_version, mapping_version, budget_owner_plant_id, state, is_synthetic,
        source_reporting_months, actual_coverage, budget_coverage, source_counts,
        validation_result, reconciliation_result, errors, imported_by_actor)
     VALUES ($1, 'catalog-dub', 'GENERATED', 'dub.xlsx', $2, 'test-v1', 'test-v1', $3,
             'staged', true, ARRAY['2026-04-01'::date, '2026-05-01'::date], '[]', '[]',
             '{}', '{}', '{}', '[]', 'catalog-proof'),
            ($4, 'catalog-chir', 'GENERATED', 'chir.xlsx', $5, 'test-v1', 'test-v1', $6,
             'staged', true, ARRAY['2026-04-01'::date], '[]', '[]', '{}', '{}', '{}', '[]',
             'catalog-proof'),
            ($7, 'catalog-history', 'GENERATED', 'history.xlsx', $8, 'test-v1', 'test-v1', $3,
             'staged', true, ARRAY['2026-03-01'::date], '[]', '[]', '{}', '{}', '{}', '[]',
             'catalog-proof')`,
    [
      ids.dubBatch,
      "a".repeat(64),
      ids.dub,
      ids.chirBatch,
      "b".repeat(64),
      ids.chir,
      ids.historicalBatch,
      "c".repeat(64),
    ],
  );
  await pool.query(
    `INSERT INTO agent_financial.nursery_budget_component
       (id, batch_id, component_key, component_name, depth, sort_order, is_leaf,
        source_row_number, source_row)
     VALUES ($1, $2, 'seedlings', 'Seedlings', 0, 1, true, 1, '{}')`,
    [ids.budgetComponent, ids.dubBatch],
  );
  await pool.query(
    `INSERT INTO agent_financial.financial_actual
       (batch_id, source_system, transaction_number, line_id, source_row_number,
        posting_date, plant_id, cost_center_id, gl_account_id, debit, credit, source_row)
     VALUES ($1, 'SAP', 'DUB-1', '1', 1, '2026-04-15', $2, $3, $4, 10, 0, '{}'),
            ($5, 'SAP', 'CHIR-1', '1', 1, '2026-04-16', $6, $7, $8, 20, 0, '{}'),
            ($9, 'SAP', 'DUB-OLD', '1', 1, '2026-03-15', $2, $10, $11, 30, 0, '{}')`,
    [
      ids.dubBatch,
      ids.dub,
      ids.activeCostCenter,
      ids.actualGl,
      ids.chirBatch,
      ids.chir,
      ids.chirCostCenter,
      ids.chirGl,
      ids.historicalBatch,
      ids.historicalCostCenter,
      ids.historicalGl,
    ],
  );
  await pool.query(
    `INSERT INTO agent_financial.nursery_budget
       (batch_id, plant_id, budget_component_id, reporting_month, gl_account_id,
        rollover_enabled, budget_amount, rollover_amount, source_row_number, source_row)
     VALUES ($1, $2, $3, '2026-05-01', $4, true, 50, 5, 1, '{}')`,
    [ids.dubBatch, ids.dub, ids.budgetComponent, ids.budgetGl],
  );
  for (const batchId of [ids.dubBatch, ids.chirBatch]) {
    await pool.query(
      `UPDATE agent_financial.ingestion_batch
          SET state = 'validated', validated_at_utc = now()
        WHERE id = $1`,
      [batchId],
    );
    await pool.query(
      `UPDATE agent_financial.ingestion_batch
          SET state = 'active', activated_at_utc = now()
        WHERE id = $1`,
      [batchId],
    );
  }
}

function assertVocabularyTestWarehouse(): void {
  assert.equal(
    `${process.env.WAREHOUSE_PG_HOST}:${process.env.WAREHOUSE_PG_PORT}/${process.env.WAREHOUSE_PG_DATABASE}`,
    "127.0.0.1:5434/warehouse",
    "financial vocabulary proof requires 127.0.0.1:5434/warehouse",
  );
}

function selection(overrides: Partial<FinancialSelection> = {}): FinancialSelection {
  return {
    measureIds: ["actual"],
    dimensionIds: [],
    plantIds: ["DUB"],
    timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
    filters: [],
    ...overrides,
  };
}

function user(
  overrides: {
    actions?: string[];
    domains?: string[];
    measureIds?: string[];
    dimensionIds?: string[];
    scope?: AuthUser["scope"];
  } = {},
): AuthUser {
  return {
    id: "reader",
    email: "reader@example.invalid",
    display_name: "Reader",
    is_active: true,
    roles: ["reader"],
    permissions: {
      actions: overrides.actions ?? ["report"],
      domains: overrides.domains ?? ["mis-statement"],
      measureIds: overrides.measureIds ?? REQUIRED_MEASURES,
      dimensionIds: overrides.dimensionIds ?? ["leaf_key"],
    },
    scope: overrides.scope ?? [{ attribute: "plant", value: "DUB" }],
  };
}

async function rejectsWithReason(promise: Promise<unknown>, reason: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    if (!error || typeof error !== "object" || !("getResponse" in error)) return false;
    const response = (error as { getResponse(): unknown }).getResponse();
    return (
      typeof response === "object" &&
      response !== null &&
      "details" in response &&
      (response as { details?: { reason?: string } }).details?.reason === reason
    );
  });
}

class FakeRbac {
  constructor(public current: AuthUser | null) {}

  async resolveUser(): Promise<AuthUser | null> {
    return this.current;
  }
}

class FakeAudit {
  events: Array<Parameters<AuditService["writeRequestEvent"]>[0]> = [];
  fail = false;

  async writeRequestEvent(event: Parameters<AuditService["writeRequestEvent"]>[0]): Promise<number> {
    if (this.fail) throw new Error("audit unavailable");
    this.events.push(structuredClone(event));
    return this.events.length;
  }
}

class FakeWarehouse implements Warehouse {
  reads = 0;

  constructor(private readonly values: Array<Record<string, string | null>>) {}

  async execute(): Promise<QueryResult> {
    this.reads += 1;
    return { columns: [], rows: this.values };
  }

  async explain(): Promise<void> {}
  async freshness(): Promise<string | null> {
    return null;
  }
  async distinctValues(): Promise<string[]> {
    return [];
  }
}
