import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { AuthUser, Selection } from "@3f/contract";
import type { Pool } from "pg";
import { SelectionExecutor } from "../chat/selectionExecutor";
import { IngestService, type UploadedWorkbook } from "../ingest/ingest.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import { createWarehouseWritePool } from "./ingestion.repository";
import { PostgresAdapter } from "./postgres.adapter";
import { migrateWarehouse } from "./warehouse-migrate";

const JULY = "2026-07-01";
const ACTUALS = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx");
const BUDGET = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/Nursery MIS Format.xlsx");

test("the destructive measure filter proof refuses a non-local warehouse host", () => {
  assert.throws(() => assertLocalWarehouseHost("warehouse.shared.example"), /refuses a non-local warehouse/);
});

test(
  "WAREHOUSE_DB_TEST proves the July over-budget GL set and totals cover every matching group beyond the page",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async (context) => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
      const ingest = new IngestService();
      await ingest.ingestActuals(upload(ACTUALS), "measure-filter-proof");
      await ingest.ingestBudget(upload(BUDGET), "measure-filter-proof");

      const expected = await overBudgetRelation(pool);
      assert.ok(
        expected.length >= 2,
        `July fixture must contain at least two over-budget GL groups; found ${expected.length}`,
      );

      const domain = new SemanticLayer().domain("governed-financial");
      assert.ok(domain);
      const executor = new SelectionExecutor(new SqlBuilder(), new SqlValidator(), new PostgresAdapter());
      const selection: Selection = {
        domain: domain.name,
        measureIds: ["governed-financial.actual", "governed-financial.budget"],
        dimensionIds: ["gl_code"],
        filters: [],
        measureFilters: [
          {
            measureId: "governed-financial.actual",
            op: "gt",
            compareTo: { kind: "measure", measureId: "governed-financial.budget" },
          },
        ],
        timeWindow: { grain: "month", column: "month", from: JULY, to: JULY },
      };

      const allMatches = await executor.run(user, domain, { ...selection, limit: 1000 });
      const actualSet = allMatches.result.rows.map(({ gl_code }) => String(gl_code)).sort();
      const expectedSet = expected.map(({ gl_code }) => gl_code);
      assert.deepEqual(actualSet, expectedSet);
      context.diagnostic(`July 2026 over-budget GL codes: ${expectedSet.join(", ")}`);

      const onePage = await executor.run(user, domain, { ...selection, limit: 1 });
      assert.equal(onePage.result.rows.length, 1);
      const expectedActualTotal = Number(sumMoney(expected.map(({ actual }) => actual)));
      assert.equal(onePage.totals?.actual, expectedActualTotal);
      assert.ok(
        expectedActualTotal > Number(onePage.result.rows[0].actual),
        "the filtered total must include over-budget groups beyond the one-row page",
      );

      const unfiltered = await executor.run(user, domain, {
        ...selection,
        measureFilters: [],
        limit: 1,
      });
      assert.notEqual(onePage.totals?.actual, unfiltered.totals?.actual);
    } finally {
      await pool.end();
    }
  },
);

const user: AuthUser = {
  id: "measure-filter-proof",
  email: "proof@example.test",
  display_name: "Proof",
  is_active: true,
  roles: ["admin"],
  permissions: {
    domains: ["governed-financial"],
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    dimensionIds: ["gl_code", "month"],
    actions: ["report"],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};

function upload(path: string): UploadedWorkbook {
  const buffer = readFileSync(path);
  return {
    originalname: path.endsWith("Nursery MIS Format.xlsx") ? "Nursery MIS Format.xlsx" : "SAP Entries Mapping.xlsx",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: buffer.length,
    buffer,
  };
}

async function overBudgetRelation(pool: Pool): Promise<Array<{ gl_code: string; actual: string; budget: string }>> {
  return (
    await pool.query<{ gl_code: string; actual: string; budget: string }>(
      `WITH actual AS (
         SELECT gl_code, actual_net
         FROM actual_by_gl_month
         WHERE plant = 'DUB' AND month = $1::date
       ), budget AS (
         SELECT gl_code, budget_net
         FROM budget_by_gl_month
         WHERE month = $1::date
       )
       SELECT COALESCE(actual.gl_code, budget.gl_code) AS gl_code,
         COALESCE(actual.actual_net, 0)::numeric(18,2)::text AS actual,
         COALESCE(budget.budget_net, 0)::numeric(18,2)::text AS budget
       FROM actual
       FULL OUTER JOIN budget ON budget.gl_code = actual.gl_code
       WHERE COALESCE(actual.actual_net, 0) > COALESCE(budget.budget_net, 0)
       ORDER BY gl_code`,
      [JULY],
    )
  ).rows;
}

function sumMoney(values: string[]): string {
  const total = values.reduce((sum, value) => sum + BigInt(value.replace(".", "")), 0n);
  const absolute = (total < 0n ? -total : total).toString().padStart(3, "0");
  return `${total < 0n ? "-" : ""}${absolute.slice(0, -2)}.${absolute.slice(-2)}`;
}

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive measure filter setup",
  );
}
