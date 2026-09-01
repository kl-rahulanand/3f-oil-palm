import assert from "node:assert/strict";
import { test } from "node:test";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { DimensionValuesService } from "./dimension-values.service";

test("DimensionValuesService caches repeated lookups", async () => {
  const warehouse = new FakeWarehouse(["Serviceable", "Non-serviceable"]);
  const service = new DimensionValuesService(warehouse);

  assert.deepEqual(await service.values("gold", "serviceable_pincode"), [
    "Serviceable",
    "Non-serviceable",
  ]);
  assert.deepEqual(await service.values("gold", "serviceable_pincode"), [
    "Serviceable",
    "Non-serviceable",
  ]);
  assert.equal(warehouse.distinctValuesCalls, 1);
});

test("DimensionValuesService returns empty values on warehouse error", async () => {
  const warehouse = new FakeWarehouse(["Serviceable"]);
  warehouse.shouldThrow = true;
  const service = new DimensionValuesService(warehouse);

  assert.deepEqual(await service.values("gold", "serviceable_pincode"), []);
});

class FakeWarehouse implements Warehouse {
  distinctValuesCalls = 0;
  shouldThrow = false;

  constructor(private readonly values: string[]) {}

  async explain(): Promise<void> {
    return undefined;
  }

  async execute(): Promise<QueryResult> {
    return { columns: [], rows: [] };
  }

  async freshness(): Promise<string | null> {
    return null;
  }

  async distinctValues(): Promise<string[]> {
    this.distinctValuesCalls += 1;
    if (this.shouldThrow) throw new Error("warehouse unavailable");
    return this.values;
  }
}
