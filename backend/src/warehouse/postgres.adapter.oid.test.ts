import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { WAREHOUSE } from "../config";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";
import { pgOidIsCalendarDate, pgOidIsNumeric, PostgresAdapter, toPostgresCell } from "./postgres.adapter";
import type { Warehouse } from "./warehouse.interface";

test("Postgres numeric field OIDs map without database access", () => {
  for (const oid of [20, 21, 23, 700, 701, 1700]) {
    assert.equal(pgOidIsNumeric(oid), true, `expected OID ${oid} to be numeric`);
  }
  for (const oid of [16, 25, 1043, 1082, 1114, 2950]) {
    assert.equal(pgOidIsNumeric(oid), false, `expected OID ${oid} not to be numeric`);
  }
});

test("Postgres date cells keep the calendar day the database stored", () => {
  // node-postgres materialises a `date` at LOCAL midnight. Under a positive UTC offset,
  // toISOString() on that Date reports the PREVIOUS day, which is what made July rows read
  // as 30 June and made an equality filter on month match nothing.
  const julyFirstLocalMidnight = new Date(2026, 6, 1, 0, 0, 0, 0);
  assert.equal(pgOidIsCalendarDate(1082), true);
  assert.equal(pgOidIsCalendarDate(1114), false);
  assert.equal(pgOidIsCalendarDate(1184), false);
  assert.equal(toPostgresCell(julyFirstLocalMidnight, 1082), "2026-07-01");
  // A true instant (timestamptz) still serialises as an instant.
  const instant = new Date(Date.UTC(2026, 6, 1, 18, 30, 0));
  assert.equal(toPostgresCell(instant, 1184), "2026-07-01T18:30:00.000Z");
  assert.equal(toPostgresCell(null, 1082), null);
  assert.equal(toPostgresCell("2026-07-01", 1082), "2026-07-01");
});

test(
  "app selection path validates, explains, and executes against Postgres",
  { skip: process.env.WAREHOUSE_E2E !== "1" },
  async () => {
    const user: AuthUser = {
      id: "warehouse-e2e",
      email: "warehouse-e2e@example.invalid",
      display_name: "Warehouse E2E",
      is_active: true,
      roles: [],
      permissions: { domains: ["fixture"], measureIds: ["fixture.total"], dimensionIds: [], actions: [] },
      scope: [],
    };
    const domain: DomainSpec = {
      name: "fixture",
      label: "Fixture",
      goldObject: "WarehouseFixture",
      routingHints: [],
      dimensions: [],
      measures: [
        {
          id: "fixture.total",
          label: "Total",
          goldObject: "WarehouseFixture",
          expr: "SUM(value)",
          grain: "fixture row",
          impliedFilters: [],
          allowedDimensions: [],
          piiSensitive: false,
        },
      ],
    };
    const selection: Selection = {
      domain: "fixture",
      measureIds: ["fixture.total"],
      dimensionIds: [],
      filters: [],
      limit: 10,
    };
    const originalInit = AuthoredMeasureRegistry.prototype.onModuleInit;
    AuthoredMeasureRegistry.prototype.onModuleInit = async () => {};
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
      const warehouse = app.get<Warehouse>(WAREHOUSE);
      const executor = app.get(SelectionExecutor);
      assert.ok(warehouse instanceof PostgresAdapter);

      const result = await executor.run(user, domain, selection);

      assert.equal(Number(result.result.rows[0]?.total), 42);
      assert.match(result.sql, /FROM WarehouseFixture/);
    } finally {
      AuthoredMeasureRegistry.prototype.onModuleInit = originalInit;
      await app.close();
    }
  },
);
