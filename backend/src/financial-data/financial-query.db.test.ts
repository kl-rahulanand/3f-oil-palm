import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { AuthUser, FinancialQueryResult, FinancialSelection } from "@3f/contract";
import type { PoolClient } from "pg";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { FinancialAccessService } from "./financial-access.service";
import { FinancialDataService } from "./financial-data.service";
import { FinancialQueryRepository } from "./financial-query.repository";

test("the destructive financial query proof refuses any target except the disposable warehouse", () => {
  for (const [host, port, database] of [
    ["warehouse.shared.example", "5434", "warehouse"],
    ["127.0.0.1", "5433", "warehouse"],
    ["localhost", "5434", "warehouse"],
    ["127.0.0.1", "5434", "not-the-disposable-database"],
  ]) {
    assert.throws(() => assertDisposableWarehouse(host, port, database), /financial query proof requires/);
  }
});

test(
  "WAREHOUSE_DB_TEST returns independent exact comparisons for every coverage state without fan-out or unknown Plants",
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
      const rbac = new FakeRbac(user(fixture));
      const repository = new FinancialQueryRepository(client);
      const service = new FinancialDataService(
        new FinancialAccessService(rbac, new FakeAudit()),
        new FakeWarehouse(),
        repository,
      );

      const april = await service.query(
        "reader",
        selection(fixture, {
          measureIds: ["actual", "budget", "rollover", "percentage"],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.deepEqual(april.totals, {
        actual: actual("145.00", drillId(april.totals.actual)),
        budget: availableBudget("125.00"),
        rollover: availableRollover("12.00"),
        percentage: availablePercentage("116"),
      });
      assert.deepEqual(april.scope, {
        plantIds: [fixture.dubCode],
        from: "2099-04-01",
        to: "2099-04-30",
      });

      const filteredGl = await service.query(
        "reader",
        selection(fixture, {
          measureIds: ["actual", "budget", "percentage"],
          filters: [{ dimensionId: "gl", operator: "eq", value: "GL-NO-BUDGET" }],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.deepEqual(filteredGl.totals, {
        actual: actual("20.00", drillId(filteredGl.totals.actual)),
        budget: { state: "no_gl_line", value: null, label: "No Budget line for this GL" },
        percentage: notApplicable(),
      });

      const filteredUnmapped = await service.query(
        "reader",
        selection(fixture, {
          measureIds: ["actual", "budget", "percentage"],
          filters: [{ dimensionId: "nursery_component", operator: "eq", value: "unmapped-GL" }],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.deepEqual(filteredUnmapped.totals, {
        actual: actual("55.00", drillId(filteredUnmapped.totals.actual)),
        budget: { state: "unmapped", value: null, label: "No Budget assigned to Unmapped" },
        percentage: notApplicable(),
      });

      const gl = await service.query(
        "reader",
        selection(fixture, {
          measureIds: ["actual", "budget", "percentage"],
          dimensionIds: ["gl"],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.deepEqual(row(gl, { gl: "GL-A" }).values, {
        actual: actual("120.00", drillId(row(gl, { gl: "GL-A" }).values.actual)),
        budget: availableBudget("100.00"),
        percentage: availablePercentage("120"),
      });
      assert.deepEqual(row(gl, { gl: "GL-NO-BUDGET" }).values, {
        actual: actual("20.00", drillId(row(gl, { gl: "GL-NO-BUDGET" }).values.actual)),
        budget: { state: "no_gl_line", value: null, label: "No Budget line for this GL" },
        percentage: notApplicable(),
      });
      assert.deepEqual(row(gl, { gl: null }).values, {
        actual: actual("5.00", drillId(row(gl, { gl: null }).values.actual)),
        budget: availableBudget("25.00"),
        percentage: availablePercentage("20"),
      });
      assert.deepEqual(row(gl, { gl: "GL-ZERO" }).values, {
        actual: actual("0.00", drillId(row(gl, { gl: "GL-ZERO" }).values.actual)),
        budget: availableBudget("0.00"),
        percentage: notApplicable(),
      });
      assert.equal(gl.totals.actual?.value, "145.00", "repeated Budget GL leaves must not multiply Actual");
      assert.equal(gl.totals.budget?.value, "125.00", "Budget must sum its leaves independently once");

      const components = await service.query(
        "reader",
        selection(fixture, {
          measureIds: ["actual", "budget", "percentage"],
          dimensionIds: ["nursery_component"],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.equal(row(components, { nursery_component: fixture.parentKey }).values.actual?.value, "90.00");
      assert.equal(row(components, { nursery_component: fixture.parentKey }).values.budget?.value, "125.00");
      assert.equal(row(components, { nursery_component: fixture.leafAKey }).values.actual?.value, "90.00");
      assert.deepEqual(row(components, { nursery_component: "unmapped-GL" }).values, {
        actual: actual("55.00", drillId(row(components, { nursery_component: "unmapped-GL" }).values.actual)),
        budget: { state: "unmapped", value: null, label: "No Budget assigned to Unmapped" },
        percentage: notApplicable(),
      });
      assert.equal(
        sumMoney(
          components.rows
            .filter(({ dimensions }) => dimensions.nursery_component !== fixture.parentKey)
            .map(({ values }) => values.actual?.value ?? "0.00"),
        ),
        "145.00",
        "leaf Actual plus Unmapped must reconcile without adding the parent subtotal",
      );
      assert.equal(
        sumMoney(
          components.rows
            .filter(({ dimensions }) => dimensions.nursery_component !== fixture.parentKey)
            .map(({ values }) => values.budget?.value ?? "0.00"),
        ),
        "125.00",
        "leaf Budget including missing GL must reconcile without adding the parent subtotal",
      );

      const parent = await service.query(
        "reader",
        selection(fixture, {
          measureIds: ["actual", "budget"],
          filters: [{ dimensionId: "nursery_component", operator: "eq", value: fixture.parentKey }],
        }),
      );
      assert.equal(parent.totals.actual?.value, "90.00", "parent Actual contains mapped descendants only");
      assert.equal(parent.totals.budget?.value, "125.00", "parent Budget is the sum of leaf facts once");

      const costCenters = await service.query(
        "reader",
        selection(fixture, {
          measureIds: ["actual"],
          dimensionIds: ["cost_center"],
        }),
      );
      assert.equal(row(costCenters, { cost_center: null }).values.actual?.value, "25.00");

      const allKnownPlants = await service.query(
        "reader",
        selection(fixture, {
          plantIds: [fixture.dubCode, fixture.chirCode],
          measureIds: ["actual", "budget", "percentage"],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.equal(allKnownPlants.totals.actual?.value, "145.00", "unknown-Plant source rows stay operator-only");
      assert.deepEqual(allKnownPlants.totals.budget, {
        state: "not_loaded",
        value: null,
        label: "Budget not loaded for this Plant or month",
      });
      assert.deepEqual(allKnownPlants.totals.availableBudgetSubtotal, {
        value: "125.00",
        label: "Available-only Budget subtotal — coverage incomplete",
      });
      assert.deepEqual(allKnownPlants.totals.percentage, notApplicable());

      const partial = await service.query(
        "reader",
        selection(fixture, {
          timeWindow: { kind: "month", from: "2099-05-01", to: "2099-05-31" },
          measureIds: ["actual", "budget", "percentage"],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.deepEqual(partial.totals.actual, {
        state: "not_loaded",
        value: null,
        label: "Actual data not loaded",
        drilldownId: null,
      });
      assert.equal(partial.totals.availableActualSubtotal?.value, "50.00");
      assert.equal(partial.totals.budget?.value, "100.00");
      assert.deepEqual(partial.totals.percentage, notApplicable());

      const emptyPartial = await service.query(
        "reader",
        selection(fixture, {
          plantIds: [fixture.chirCode],
          timeWindow: { kind: "month", from: "2099-05-01", to: "2099-05-31" },
          measureIds: ["actual"],
        }),
      );
      assert.equal(emptyPartial.totals.availableActualSubtotal?.value, "0.00");

      const outsideSource = await service.query(
        "reader",
        selection(fixture, {
          timeWindow: { kind: "month", from: "2099-06-01", to: "2099-06-30" },
          measureIds: ["actual"],
        }),
      );
      assert.equal(outsideSource.totals.actual?.state, "not_loaded");
      assert.equal(outsideSource.totals.availableActualSubtotal, undefined);

      const confirmedEmpty = await service.query(
        "reader",
        selection(fixture, {
          timeWindow: { kind: "month", from: "2099-07-01", to: "2099-07-31" },
          measureIds: ["actual", "budget", "percentage"],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.equal(confirmedEmpty.totals.actual?.value, "0.00");
      assert.equal(confirmedEmpty.totals.budget?.value, "0.00");
      assert.deepEqual(confirmedEmpty.totals.percentage, notApplicable());

      const deniedUser = user(fixture);
      deniedUser.permissions = { ...deniedUser.permissions, actions: [] };
      const deniedService = new FinancialDataService(
        new FinancialAccessService(new FakeRbac(deniedUser), new FakeAudit()),
        new FakeWarehouse(),
        repository,
      );
      await rejectsWithReason(deniedService.query("reader", selection(fixture)), "access_denied");

      const chirSelection = selection(fixture, { plantIds: [fixture.chirCode] });
      const beforeRevocation = await service.query("reader", chirSelection);
      assert.deepEqual(beforeRevocation.scope, {
        plantIds: [fixture.chirCode],
        from: "2099-04-01",
        to: "2099-04-30",
      });
      rbac.current = { ...user(fixture), scope: [{ attribute: "plant", value: fixture.dubCode }] };
      await rejectsWithReason(service.query("reader", chirSelection), "access_denied");
      await rejectsWithReason(
        service.query("reader", selection(fixture, { plantIds: [fixture.dubCode, "NOT-A-GRANTED-PLANT"] })),
        "access_denied",
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
    }
  },
);

interface Fixture {
  dubCode: string;
  chirCode: string;
  parentKey: string;
  leafAKey: string;
}

async function seedFixture(client: PoolClient): Promise<Fixture> {
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'superseded' WHERE dataset_key = 'financial-chat-workbook' AND state = 'active'",
  );
  const suffix = randomUUID();
  const dubId = randomUUID();
  const chirId = randomUUID();
  const dubCode = `DUB-${suffix}`;
  const chirCode = `CHIR-${suffix}`;
  const ccA = randomUUID();
  const ccB = randomUUID();
  const glA = randomUUID();
  const glNoBudget = randomUUID();
  const glZero = randomUUID();
  await client.query(
    `INSERT INTO agent_financial.plant (id, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'DUB query proof', '{}', 'query-proof'),
            ($3, $4, 'CHIR query proof', '{}', 'query-proof')`,
    [dubId, dubCode, chirId, chirCode],
  );
  await client.query(
    `INSERT INTO agent_financial.cost_center
       (id, plant_id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, $2, 'SAP', 'CC-A', 'Mapped center', '{}', 'query-proof'),
            ($3, $2, 'SAP', 'CC-B', 'Same GL but unmapped center', '{}', 'query-proof')`,
    [ccA, dubId, ccB],
  );
  await client.query(
    `INSERT INTO agent_financial.gl_account
       (id, source_system, code, name, source_aliases, created_by_actor)
     VALUES ($1, 'SAP', 'GL-A', 'Repeated Budget GL', '{}', 'query-proof'),
            ($2, 'SAP', 'GL-NO-BUDGET', 'Actual only GL', '{}', 'query-proof'),
            ($3, 'SAP', 'GL-ZERO', 'Zero Budget GL', '{}', 'query-proof')`,
    [glA, glNoBudget, glZero],
  );
  const batch = await client.query<{ id: string }>(
    `INSERT INTO agent_financial.ingestion_batch
       (dataset_key, source_system, source_file_name, source_checksum_sha256, parser_version,
        mapping_version, budget_owner_plant_id, state, is_synthetic, source_reporting_months,
        actual_coverage, budget_coverage, source_counts, validation_result, reconciliation_result,
        errors, imported_by_actor)
     VALUES ('financial-chat-workbook', 'SYNTHETIC', 'query proof.xlsx', $1, 'query-v1',
             'mapping-v1', $2, 'staged', true,
             ARRAY['2099-04-01'::date, '2099-05-01'::date, '2099-07-01'::date],
             $3::jsonb, $4::jsonb, '{}', '{"valid":true}', '{"reconciled":true}', '[]', 'query-proof')
     RETURNING id`,
    [
      suffix.replaceAll("-", "").padEnd(64, "0").slice(0, 64),
      dubId,
      JSON.stringify([
        { plantId: dubId, month: "2099-04-01", completeness: "confirmed" },
        { plantId: chirId, month: "2099-04-01", completeness: "confirmed" },
        { plantId: dubId, month: "2099-05-01", completeness: "unconfirmed" },
        { plantId: dubId, month: "2099-07-01", completeness: "confirmed" },
      ]),
      JSON.stringify([
        { plantId: dubId, month: "2099-04-01", completeness: "confirmed" },
        { plantId: dubId, month: "2099-05-01", completeness: "confirmed" },
        { plantId: dubId, month: "2099-07-01", completeness: "confirmed" },
      ]),
    ],
  );
  const batchId = batch.rows[0]!.id;
  const parentKey = `parent-${suffix}`;
  const leafAKey = `leaf-a-${suffix}`;
  const components = await client.query<{ id: string }>(
    `INSERT INTO agent_financial.nursery_budget_component
       (batch_id, component_key, component_name, depth, sort_order, is_leaf, source_row_number, source_row)
     VALUES ($1, $2, 'Parent', 0, 1, false, 1, '{}') RETURNING id`,
    [batchId, parentKey],
  );
  const parentId = components.rows[0]!.id;
  const leafKeys = [leafAKey, `leaf-b-${suffix}`, `leaf-missing-${suffix}`, `leaf-zero-${suffix}`];
  const leafIds = leafKeys.map(() => randomUUID());
  await client.query(
    `INSERT INTO agent_financial.nursery_budget_component
       (id, batch_id, component_key, parent_component_id, component_name, depth, sort_order,
        is_leaf, source_row_number, source_row)
     VALUES ($1, $2, $3, $4, 'Leaf A', 1, 2, true, 2, '{}'),
            ($5, $2, $6, $4, 'Leaf B', 1, 3, true, 3, '{}'),
            ($7, $2, $8, $4, 'GL not assigned leaf', 1, 4, true, 4, '{}'),
            ($9, $2, $10, $4, 'Zero leaf', 1, 5, true, 5, '{}')`,
    [
      leafIds[0],
      batchId,
      leafKeys[0],
      parentId,
      leafIds[1],
      leafKeys[1],
      leafIds[2],
      leafKeys[2],
      leafIds[3],
      leafKeys[3],
    ],
  );
  await client.query(
    `INSERT INTO agent_financial.actual_budget_mapping
       (mapping_version_id, plant_id, cost_center_id, gl_account_id, budget_component_key,
        approval_status, approval_reason, approved_by, provenance)
     VALUES ($1, $2, $3, $4, $5, 'provisional', 'Query proof only', 'query-proof', '{}')`,
    [batchId, dubId, ccA, glA, leafAKey],
  );
  await client.query(
    `INSERT INTO agent_financial.financial_actual
       (batch_id, source_system, transaction_number, line_id, source_row_number, posting_date,
        plant_id, cost_center_id, gl_account_id, source_plant_code, debit, credit, source_row)
     VALUES ($1, 'SAP', 'MAPPED', '1', 1, '2099-04-10', $2, $3, $4, $5, 100, 10, '{}'),
            ($1, 'SAP', 'SAME-GL-UNMAPPED', '1', 2, '2099-04-11', $2, $6, $4, $5, 30, 0, '{}'),
            ($1, 'SAP', 'NO-BUDGET-GL', '1', 3, '2099-04-12', $2, NULL, $7, $5, 20, 0, '{}'),
            ($1, 'SAP', 'MISSING-GL', '1', 4, '2099-04-13', $2, NULL, NULL, $5, 5, 0, '{}'),
            ($1, 'SAP', 'PARTIAL-MAY', '1', 5, '2099-05-10', $2, $3, $4, $5, 50, 0, '{}'),
            ($1, 'SAP', 'UNKNOWN-PLANT', '1', 6, '2099-04-14', NULL, NULL, $4, 'UNKNOWN', 999, 0, '{}')`,
    [batchId, dubId, ccA, glA, dubCode, ccB, glNoBudget],
  );
  await client.query(
    `INSERT INTO agent_financial.nursery_budget
       (batch_id, plant_id, budget_component_id, reporting_month, gl_account_id,
        rollover_enabled, budget_amount, rollover_amount, source_row_number, source_row)
     VALUES ($1, $2, $3, '2099-04-01', $4, true, 40, 3, 1, '{}'),
            ($1, $2, $5, '2099-04-01', $4, true, 60, 4, 2, '{}'),
            ($1, $2, $6, '2099-04-01', NULL, true, 25, 5, 3, '{}'),
            ($1, $2, $7, '2099-04-01', $8, true, 0, 0, 4, '{}'),
            ($1, $2, $3, '2099-05-01', $4, true, 100, 10, 5, '{}'),
            ($1, $2, $7, '2099-07-01', $8, true, 0, 0, 6, '{}')`,
    [batchId, dubId, leafIds[0], glA, leafIds[1], leafIds[2], leafIds[3], glZero],
  );
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'validated', validated_at_utc = now() WHERE id = $1",
    [batchId],
  );
  await client.query(
    "UPDATE agent_financial.ingestion_batch SET state = 'active', activated_at_utc = now() WHERE id = $1",
    [batchId],
  );
  return { dubCode, chirCode, parentKey, leafAKey };
}

function selection(fixture: Fixture, overrides: Partial<FinancialSelection> = {}): FinancialSelection {
  return {
    measureIds: ["actual"],
    dimensionIds: [],
    plantIds: [fixture.dubCode],
    timeWindow: { kind: "month", from: "2099-04-01", to: "2099-04-30" },
    filters: [],
    ...overrides,
  };
}

function row(result: FinancialQueryResult, dimensions: Record<string, string | null>) {
  const found = result.rows.find((candidate) =>
    Object.entries(dimensions).every(
      ([key, value]) => candidate.dimensions[key as keyof typeof candidate.dimensions] === value,
    ),
  );
  assert.ok(found, `missing row ${JSON.stringify(dimensions)}`);
  return found;
}

function actual(value: string, drilldownId: string) {
  return { state: "available", value, label: "Actual", drilldownId } as const;
}

function availableBudget(value: string) {
  return { state: "available", value, label: "Budget" } as const;
}

function availableRollover(value: string) {
  return { state: "available", value, label: "Roll-over" } as const;
}

function availablePercentage(value: string) {
  return { state: "available", value, label: "Percentage" } as const;
}

function notApplicable() {
  return { state: "not_applicable", value: null, label: "Not applicable" } as const;
}

function drillId(value: FinancialQueryResult["totals"]["actual"]): string {
  assert.equal(value?.state, "available");
  assert.equal(typeof value.drilldownId, "string");
  return value.drilldownId;
}

function sumMoney(values: string[]): string {
  const total = values.reduce((sum, value) => sum + BigInt(value.replace(".", "")), 0n);
  return `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
}

function user(fixture: Fixture): AuthUser {
  return {
    id: "reader",
    email: "reader@example.invalid",
    display_name: "Reader",
    is_active: true,
    roles: ["reader"],
    permissions: {
      actions: ["report"],
      domains: ["mis-statement"],
      measureIds: [
        "mis-statement.actual_net",
        "mis-statement.budget_net",
        "mis-statement.rollover_net",
        "mis-statement.percentage",
      ],
      dimensionIds: ["leaf_key"],
    },
    scope: [
      { attribute: "plant", value: fixture.dubCode },
      { attribute: "plant", value: fixture.chirCode },
    ],
  };
}

async function rejectsWithReason(promise: Promise<unknown>, reason: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error && typeof error === "object" && "getResponse" in error);
    const response = (error as { getResponse(): unknown }).getResponse();
    assert.ok(response && typeof response === "object" && "details" in response);
    assert.deepEqual((response as { details: unknown }).details, { reason });
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
    throw new Error("financial query must use its parameterized repository");
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
    "financial query proof requires 127.0.0.1:5434/warehouse",
  );
}
