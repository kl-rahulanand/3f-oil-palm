import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, DomainSpec, Selection } from "@3f/contract";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { WAREHOUSE } from "../config";
import { AuthoredMeasureRegistry } from "../measures/authored-measure.registry";
import { pgOidIsNumeric, PostgresAdapter } from "./postgres.adapter";
import type { Warehouse } from "./warehouse.interface";

test("Postgres numeric field OIDs map without database access", () => {
  for (const oid of [20, 21, 23, 700, 701, 1700]) {
    assert.equal(pgOidIsNumeric(oid), true, `expected OID ${oid} to be numeric`);
  }
  for (const oid of [16, 25, 1043, 1082, 1114, 2950]) {
    assert.equal(pgOidIsNumeric(oid), false, `expected OID ${oid} not to be numeric`);
  }
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
