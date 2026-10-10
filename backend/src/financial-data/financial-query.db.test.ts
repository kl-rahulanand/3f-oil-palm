import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import type { FinancialQueryResult, FinancialSelection } from "@3f/contract";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";
import { AuditService } from "../core/audit.service";
import { RbacService } from "../core/rbac.service";
import { createDb, createPool, type AppDb } from "../db/pool";
import { rolePerms, roles, userRoles, users, userScope } from "../db/schema";
import { SemanticLayer } from "../semantic/semanticLayer";
import { createWarehouseWritePool } from "../warehouse/ingestion.repository";
import { migrateWarehouse } from "../warehouse/warehouse-migrate";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { FinancialAccessService } from "./financial-access.service";
import { FINANCIAL_CATALOG } from "./financial-catalog";
import { FinancialDataService } from "./financial-data.service";
import { FinancialQueryRepository } from "./financial-query.repository";

const REQUIRED_FINANCIAL_GRANTS = [
  { grantType: "action", grantId: "report" },
  { grantType: "domain", grantId: "mis-statement" },
  { grantType: "measure", grantId: "mis-statement.actual_net" },
  { grantType: "measure", grantId: "mis-statement.budget_net" },
  { grantType: "measure", grantId: "mis-statement.rollover_net" },
  { grantType: "measure", grantId: "mis-statement.percentage" },
  { grantType: "dimension", grantId: "leaf_key" },
] as const;

const ACTUAL_ONLY_DIMENSIONS = [
  "cost_center",
  "section",
  "consideration",
  "short_name",
  "contra_account",
  "origin",
  "location",
] as const;

test("the destructive financial query proof refuses targets outside the disposable databases", () => {
  for (const [host, port, database] of [
    ["warehouse.shared.example", "5434", "warehouse"],
    ["127.0.0.1", "5433", "warehouse"],
    ["localhost", "5434", "warehouse"],
    ["127.0.0.1", "5434", "not-the-disposable-database"],
  ]) {
    assert.throws(() => assertDisposableWarehouse(host, port, database), /financial query proof requires/);
  }
  for (const [host, port, database] of [
    ["app.shared.example", "5435", "threef"],
    ["127.0.0.1", "5432", "threef"],
    ["localhost", "5435", "threef"],
    ["127.0.0.1", "5435", "not-the-disposable-database"],
  ]) {
    assert.throws(() => assertDisposableAppDatabase(host, port, database), /financial query proof requires/);
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
    assertDisposableAppDatabase(process.env.PGHOST, process.env.PGPORT, process.env.PGDATABASE);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    const appPool = createPool();
    const appDb = createDb(appPool);
    const client = await pool.connect();
    try {
      await migrate(appDb, { migrationsFolder: join(__dirname, "../../drizzle") });
      await client.query("BEGIN");
      const fixture = await seedFixture(client);
      const identities = await seedRbac(appDb, fixture);
      const rbac = new RbacService(appDb, new FakeWarehouse(), new SemanticLayer());
      const repository = new FinancialQueryRepository(client);
      const service = new FinancialDataService(
        new FinancialAccessService(rbac, new AuditService(appDb)),
        new FakeWarehouse(),
        repository,
      );

      const april = await service.query(
        identities.readerId,
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

      const executedCatalogCombinations = new Set<string>();
      for (const combination of FINANCIAL_CATALOG.combinations) {
        const result = await service.query(
          identities.readerId,
          selection(fixture, {
            measureIds: [...combination.measureIds],
            dimensionIds: [...combination.dimensionIds],
            comparisons: combination.measureIds.includes("percentage") ? ["actual_vs_budget"] : undefined,
          }),
        );
        const signature = JSON.stringify([combination.measureIds, combination.dimensionIds]);
        executedCatalogCombinations.add(signature);
        assert.deepEqual(result.selection.measureIds, combination.measureIds, `${signature} must preserve measures`);
        assert.deepEqual(
          result.selection.dimensionIds,
          combination.dimensionIds,
          `${signature} must preserve dimensions`,
        );
        assert.equal(result.totals.actual?.value, "145.00", `${signature} must independently total Actual`);
        if (combination.measureIds.includes("budget")) {
          assert.equal(result.totals.budget?.value, "125.00", `${signature} must independently total Budget`);
          assert.equal(result.totals.rollover?.value, "12.00", `${signature} must use the closing Roll-over`);
          assert.equal(result.totals.percentage?.value, "116", `${signature} must calculate the exact percentage`);
        }
        assert.equal(result.rows.length === 0, combination.dimensionIds.length === 0);
        for (const resultRow of result.rows) {
          assert.deepEqual(
            Object.keys(resultRow.dimensions).sort(),
            [...combination.dimensionIds].sort(),
            `${signature} must return only the selected coordinates`,
          );
          assert.deepEqual(
            Object.keys(resultRow.values).sort(),
            [...combination.measureIds].sort(),
            `${signature} must return only the selected measures`,
          );
          if (combination.dimensionIds.includes("plant")) {
            assert.equal(resultRow.dimensions.plant, fixture.dubCode, `${signature} must group by permitted Plant`);
          }
          if (combination.dimensionIds.includes("month")) {
            assert.equal(resultRow.dimensions.month, "2099-04-01", `${signature} must group by source month`);
          }
        }
      }
      assert.equal(executedCatalogCombinations.size, FINANCIAL_CATALOG.combinations.length);
      assert.ok(
        [...executedCatalogCombinations].some((signature) => signature.includes('"plant","month"')),
        "Plant and month combinations must execute through the query service",
      );

      assert.deepEqual(
        FINANCIAL_CATALOG.dimensions
          .filter(({ supportedMeasureIds }) => supportedMeasureIds.length === 1)
          .map(({ id }) => id),
        ACTUAL_ONLY_DIMENSIONS,
      );
      for (const dimensionId of ACTUAL_ONLY_DIMENSIONS) {
        await rejectsWithReason(
          service.query(
            identities.readerId,
            selection(fixture, { measureIds: ["actual", "budget"], dimensionIds: [dimensionId] }),
          ),
          "unsupported_selection",
        );
      }

      const filteredGl = await service.query(
        identities.readerId,
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
        identities.readerId,
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
        identities.readerId,
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
        identities.readerId,
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
        identities.readerId,
        selection(fixture, {
          measureIds: ["actual", "budget"],
          filters: [{ dimensionId: "nursery_component", operator: "eq", value: fixture.parentKey }],
        }),
      );
      assert.equal(parent.totals.actual?.value, "90.00", "parent Actual contains mapped descendants only");
      assert.equal(parent.totals.budget?.value, "125.00", "parent Budget is the sum of leaf facts once");

      const costCenters = await service.query(
        identities.readerId,
        selection(fixture, {
          measureIds: ["actual"],
          dimensionIds: ["cost_center"],
        }),
      );
      assert.equal(costCenters.rows.length, 3);
      assert.equal(row(costCenters, { cost_center: "CC-A" }).values.actual?.value, "90.00");
      assert.equal(row(costCenters, { cost_center: "CC-B" }).values.actual?.value, "30.00");
      assert.equal(row(costCenters, { cost_center: null }).values.actual?.value, "25.00");

      for (const dimensionId of [
        "section",
        "consideration",
        "short_name",
        "contra_account",
        "origin",
        "location",
      ] as const) {
        const sourceDimension = await service.query(
          identities.readerId,
          selection(fixture, { dimensionIds: [dimensionId] }),
        );
        assert.equal(sourceDimension.rows.length, 1, `${dimensionId} must not gain a Budget-only row`);
        assert.equal(row(sourceDimension, { [dimensionId]: "SOURCE-VALUE" }).values.actual?.value, "145.00");
      }

      const allKnownPlants = await service.query(
        identities.readerId,
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
        identities.readerId,
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
        identities.readerId,
        selection(fixture, {
          plantIds: [fixture.chirCode],
          timeWindow: { kind: "month", from: "2099-05-01", to: "2099-05-31" },
          measureIds: ["actual"],
        }),
      );
      assert.equal(emptyPartial.totals.availableActualSubtotal?.value, "0.00");

      const outsideSource = await service.query(
        identities.readerId,
        selection(fixture, {
          timeWindow: { kind: "month", from: "2099-06-01", to: "2099-06-30" },
          measureIds: ["actual"],
        }),
      );
      assert.equal(outsideSource.totals.actual?.state, "not_loaded");
      assert.equal(outsideSource.totals.availableActualSubtotal, undefined);

      const confirmedEmpty = await service.query(
        identities.readerId,
        selection(fixture, {
          timeWindow: { kind: "month", from: "2099-07-01", to: "2099-07-31" },
          measureIds: ["actual", "budget", "percentage"],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.equal(confirmedEmpty.totals.actual?.value, "0.00");
      assert.equal(confirmedEmpty.totals.budget?.value, "0.00");
      assert.deepEqual(confirmedEmpty.totals.percentage, notApplicable());

      const emptyMissingGl = await service.query(
        identities.readerId,
        selection(fixture, {
          timeWindow: { kind: "month", from: "2099-07-01", to: "2099-07-31" },
          measureIds: ["actual", "budget", "rollover", "percentage"],
          filters: [{ dimensionId: "gl", operator: "eq", value: "GL-NO-BUDGET" }],
          comparisons: ["actual_vs_budget"],
        }),
      );
      assert.deepEqual(emptyMissingGl.totals, {
        actual: actual("0.00", drillId(emptyMissingGl.totals.actual)),
        budget: { state: "no_gl_line", value: null, label: "No Budget line for this GL" },
        rollover: { state: "no_gl_line", value: null, label: "No Roll-over line for this GL" },
        percentage: notApplicable(),
      });

      for (const grant of REQUIRED_FINANCIAL_GRANTS) {
        await appDb
          .delete(rolePerms)
          .where(
            and(
              eq(rolePerms.role, identities.readerRole),
              eq(rolePerms.grantType, grant.grantType),
              eq(rolePerms.grantId, grant.grantId),
            ),
          );
        await rejectsWithReason(service.query(identities.readerId, selection(fixture)), "access_denied");
        await appDb.insert(rolePerms).values({ role: identities.readerRole, ...grant });
      }

      const chirSelection = selection(fixture, { plantIds: [fixture.chirCode] });
      const beforeRevocation = await service.query(identities.readerId, chirSelection);
      assert.deepEqual(beforeRevocation.scope, {
        plantIds: [fixture.chirCode],
        from: "2099-04-01",
        to: "2099-04-30",
      });
      await appDb
        .delete(userScope)
        .where(
          and(
            eq(userScope.userId, identities.readerId),
            eq(userScope.attribute, "plant"),
            eq(userScope.value, fixture.chirCode),
          ),
        );
      await rejectsWithReason(service.query(identities.readerId, chirSelection), "access_denied");
      await rejectsWithReason(
        service.query(identities.readerId, selection(fixture, { plantIds: [fixture.dubCode, "NOT-A-GRANTED-PLANT"] })),
        "access_denied",
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await pool.end();
      await appPool.end();
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
        plant_id, cost_center_id, gl_account_id, source_plant_code, debit, credit,
        section, consideration, short_name, contra_account, origin, location, source_row)
     VALUES ($1, 'SAP', 'MAPPED', '1', 1, '2099-04-10', $2, $3, $4, $5, 100, 10,
             'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', '{}'),
            ($1, 'SAP', 'SAME-GL-UNMAPPED', '1', 2, '2099-04-11', $2, $6, $4, $5, 30, 0,
             'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', '{}'),
            ($1, 'SAP', 'NO-BUDGET-GL', '1', 3, '2099-04-12', $2, NULL, $7, $5, 20, 0,
             'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', '{}'),
            ($1, 'SAP', 'MISSING-GL', '1', 4, '2099-04-13', $2, NULL, NULL, $5, 5, 0,
             'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', '{}'),
            ($1, 'SAP', 'PARTIAL-MAY', '1', 5, '2099-05-10', $2, $3, $4, $5, 50, 0,
             'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', '{}'),
            ($1, 'SAP', 'UNKNOWN-PLANT', '1', 6, '2099-04-14', NULL, NULL, $4, 'UNKNOWN', 999, 0,
             'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', 'SOURCE-VALUE', '{}')`,
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

async function seedRbac(appDb: AppDb, fixture: Fixture): Promise<{ readerId: string; readerRole: string }> {
  const suffix = randomUUID();
  const readerRole = `financial-reader-${suffix}`;
  await appDb.insert(roles).values({ name: readerRole, label: "Financial query reader" });
  await appDb.insert(rolePerms).values(REQUIRED_FINANCIAL_GRANTS.map((grant) => ({ role: readerRole, ...grant })));
  const [{ id: readerId }] = await appDb
    .insert(users)
    .values({ email: `query-reader-${suffix}@example.invalid`, displayName: "Financial query reader" })
    .returning({ id: users.id });
  await appDb.insert(userRoles).values({ userId: readerId!, role: readerRole });
  await appDb.insert(userScope).values([
    { userId: readerId!, attribute: "plant", value: fixture.dubCode },
    { userId: readerId!, attribute: "plant", value: fixture.chirCode },
  ]);
  return { readerId: readerId!, readerRole };
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

function assertDisposableAppDatabase(
  host: string | undefined,
  port: string | undefined,
  database: string | undefined,
): void {
  assert.equal(
    `${host}:${port}/${database}`,
    "127.0.0.1:5435/threef",
    "financial query proof requires 127.0.0.1:5435/threef",
  );
}
