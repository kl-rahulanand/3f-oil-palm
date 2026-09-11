import assert from "node:assert/strict";
import { test } from "node:test";
import { SqlValidator } from "../sql/sqlValidator";
import type { Warehouse } from "./warehouse.interface";
import { DrillTransactionsRepository, normalizeDateOnly } from "./drill-transactions.repository";

test("the drill page and footer queries share one predicate and emit the deterministic order with a bounded limit the validator accepts", async () => {
  const warehouse = new FakeWarehouse();
  const repository = new DrillTransactionsRepository(new SqlValidator(), warehouse);
  const queries = repository.buildQueries(
    {
      actualBatchIds: ["00000000-0000-0000-0000-000000000001"],
      triples: [{ plant: "DUB", costCenter: "Primary", glCode: "5001" }],
      plants: ["DUB"],
      from: "2026-04-01",
      to: "2026-07-01",
    },
    2,
  );

  const where = (sql: string) => sql.match(/WHERE ([\s\S]+?)\n(?:ORDER BY|LIMIT)/)?.[1];
  assert.equal(where(queries.pageSql), where(queries.footerSql));
  assert.match(
    queries.pageSql,
    /ORDER BY \(txn\.debit - txn\.credit\) DESC, txn\.month DESC, txn\.posting_date DESC, txn\.txn_no, txn\.line_id\nLIMIT 100 OFFSET 100$/,
  );
  assert.equal(new SqlValidator().validate(queries.pageSql, queries.objectsTouched, 1000).ok, true);
  assert.equal(new SqlValidator().validate(queries.footerSql, queries.objectsTouched, 1000).ok, true);

  await repository.execute(queries);
  assert.deepEqual(warehouse.explained, [queries.pageSql, queries.footerSql]);
  assert.deepEqual(warehouse.executed, [queries.pageSql, queries.footerSql]);
});

test("drill line dates are normalized to date only strings under a non utc timezone", () => {
  const original = process.env.TZ;
  process.env.TZ = "Asia/Kolkata";
  try {
    const adapterValue = new Date(2026, 6, 1).toISOString();
    assert.equal(adapterValue.startsWith("2026-06-30"), true);
    assert.equal(normalizeDateOnly(adapterValue), "2026-07-01");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

class FakeWarehouse implements Warehouse {
  explained: string[] = [];
  executed: string[] = [];

  async explain(sql: string) {
    this.explained.push(sql);
  }

  async execute(sql: string) {
    this.executed.push(sql);
    return sql.includes("COUNT(*)")
      ? { columns: [], rows: [{ total_count: "0", debit: "0.00", credit: "0.00", value: "0.00" }] }
      : { columns: [], rows: [] };
  }

  async freshness() {
    return null;
  }
  async distinctValues() {
    return [];
  }
}
