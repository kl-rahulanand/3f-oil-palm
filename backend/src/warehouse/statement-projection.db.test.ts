import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { IngestService, type UploadedWorkbook } from "../ingest/ingest.service";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { SqlBuilder } from "../sql/sqlBuilder";
import { createWarehouseWritePool } from "./ingestion.repository";
import { migrateWarehouse } from "./warehouse-migrate";
import type { QueryResult, Warehouse } from "./warehouse.interface";

const PERIOD = "2026-07-01";
const ACTUALS_PATH = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx");
const BUDGET_PATH = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/Nursery MIS Format.xlsx");

test("the destructive statement projection proof refuses a non-local warehouse host", () => {
  assert.throws(() => assertLocalWarehouseHost("warehouse.shared.example"), /refuses a non-local warehouse/);
});

test(
  "WAREHOUSE_DB_TEST proves the July statement projection has exact leaf month rows totals and no fan out while splitting repeated GLs and retaining the unmapped bucket",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
      const service = new IngestService();
      await service.ingestActuals(upload(ACTUALS_PATH), "statement-proof");
      await service.ingestBudget(upload(BUDGET_PATH), "statement-proof");

      const resolution = await new SelectionResolverService(new PeriodWarehouse()).resolve({
        department: "Agriculture",
        function: "Nursery",
        plant: "DUB",
        period: PERIOD,
      });
      assert.equal(resolution.outcome, "resolved");
      if (resolution.outcome !== "resolved") return;
      assert.ok(resolution.leafTargets);

      const built = new SqlBuilder().buildStatementProjection(
        user,
        { from: resolution.period.from, to: resolution.period.to },
        {
          triples: resolution.triples,
          glCodes: resolution.glCodes,
          masterGlCodes: resolution.masterGlCodes,
          leafTargets: resolution.leafTargets,
        },
      );
      const result = await pool.query<StatementRow>(built.sql);
      const rows = result.rows.map((row) => ({ ...row, month: dateOnly(row.month) }));

      assert.equal(rows.length, 81);
      assert.equal(new Set(rows.map(({ leaf_key, month }) => `${leaf_key}\0${month}`)).size, rows.length);
      assert.equal(sumMoney(rows.map(({ actual_net }) => actual_net)), "11512712.07");
      assert.equal(sumMoney(rows.map(({ budget_net }) => budget_net)), "10050136.29");
      assert.deepEqual(
        rows
          .filter(({ leaf_key }) => ["50001605", "50001606", "50001901"].includes(leaf_key.split("|")[1] ?? ""))
          .map(({ leaf_key }) => leaf_key)
          .sort(),
        [
          "4.5|50001605|fertilizers-manures",
          "4.5|50001606|pesticides-fungicides",
          "5.3|50001605|fertilizers-manures",
          "5.4|50001606|pesticides-fungicides",
          "6.1|50001605|fertilizers-manures",
          "6.2|50001606|pesticides-fungicides",
          "7.1|50001901|nursery-labour-primary",
          "7.2|50001901|nursery-labour-secondary",
          "7.3|50001901|nursery-labour-tertiary",
        ],
      );
      const bucket = rows.find(({ leaf_key }) => leaf_key === "unmapped-GL");
      assert.ok(bucket);
      assert.equal(bucket.budget_net, "0.00");
      assert.notEqual(bucket.actual_net, "0.00");
    } finally {
      await pool.end();
    }
  },
);

interface StatementRow {
  leaf_key: string;
  month: Date;
  actual_net: string;
  budget_net: string;
}

const user = {
  id: "statement-proof",
  email: "proof@example.com",
  display_name: "Proof",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};

class PeriodWarehouse implements Warehouse {
  async explain(): Promise<void> {}
  async execute(): Promise<QueryResult> {
    return { columns: [{ name: "period", numeric: false }], rows: [{ period: PERIOD }] };
  }
  async freshness(): Promise<string | null> {
    return null;
  }
  async distinctValues(): Promise<string[]> {
    return [];
  }
}

function upload(path: string): UploadedWorkbook {
  const buffer = readFileSync(path);
  return {
    originalname: path.endsWith("Nursery MIS Format.xlsx") ? "Nursery MIS Format.xlsx" : "SAP Entries Mapping.xlsx",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: buffer.length,
    buffer,
  };
}

function sumMoney(values: string[]): string {
  const paise = values.reduce((total, value) => {
    const sign = value.startsWith("-") ? -1n : 1n;
    const [rupees, fraction] = value.replace("-", "").split(".");
    return total + sign * (BigInt(rupees) * 100n + BigInt(fraction));
  }, 0n);
  const absolute = paise < 0 ? -paise : paise;
  return `${paise < 0 ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

function dateOnly(value: Date): string {
  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, "0"))
    .join("-");
}

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive statement projection setup",
  );
}
