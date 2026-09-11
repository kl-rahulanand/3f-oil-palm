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

      const built = new SqlBuilder().build(
        statementDomain,
        {
          domain: statementDomain.name,
          measureIds: [],
          dimensionIds: [],
          filters: [],
          timeWindow: { grain: "month", column: "month", from: resolution.period.from, to: resolution.period.to },
        },
        user,
        true,
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
        rows.map(({ leaf_key, actual_net, budget_net }) => [leaf_key, actual_net, budget_net]),
        EXPECTED_JULY_LEAVES,
      );
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

const EXPECTED_JULY_LEAVES = [
  ["1.1|50001201|sprout-cost", "8398339.00", "8000000.00"],
  ["1.2|50001202|clearing-forwarding", "280908.00", "500000.00"],
  ["1.3|50001203|transportation", "0.00", "50000.00"],
  ["2.1|50001201|sprout-cost-ind", "0.00", "0.00"],
  ["2.2|50001202|clearing-forwarding-ind", "0.00", "0.00"],
  ["2.3|50001203|transportation", "0.00", "0.00"],
  ["31|50001501|land-levelling", "0.00", "16000.00"],
  ["3.2|50001502|land-levelling", "51450.00", "0.00"],
  ["4.1|50001601|shade-net", "0.00", "0.00"],
  ["4.2|50001602|small-poly-bags", "0.00", "0.00"],
  ["4.3|50001603|protrays", "137500.00", "120370.37"],
  ["4.4|50001604|sand-soil", "0.00", "0.00"],
  ["4.5|50001605|fertilizers-manures", "140879.00", "173891.67"],
  ["4.5|50001606|pesticides-fungicides", "1100.00", "3826.67"],
  ["4.7|50001607|ground-cover", "0.00", "0.00"],
  ["4.8|50001608|misc-others", "0.00", "0.00"],
  ["5.1|50001602|big-poly-bags", "0.00", "0.00"],
  ["5.2|50001604|sand-soil", "0.00", "0.00"],
  ["5.3|50001605|fertilizers-manures", "0.00", "134729.67"],
  ["5.4|50001606|pesticides-fungicides", "0.00", "40275.75"],
  ["5.5|50001607|ground-cover", "0.00", "0.00"],
  ["5.6|50001608|misc-others", "0.00", "0.00"],
  ["6.1|50001605|fertilizers-manures", "0.00", "330.87"],
  ["6.2|50001606|pesticides-fungicides", "0.00", "0.00"],
  ["6.3|50001608|misc-others", "0.00", "0.00"],
  ["7.1|50001901|nursery-labour-primary", "41300.00", "81022.89"],
  ["7.2|50001901|nursery-labour-secondary", "0.00", "386774.80"],
  ["7.3|50001901|nursery-labour-tertiary", "0.00", "0.00"],
  ["7.4|50001902|nursery-labour-loading-unloading", "0.00", "53796.60"],
  ["7.5|50001903|nursery-labour-transportation-charges", "0.00", "85800.00"],
  ["8.1|55021000|salaries", "127381.34", "271317.00"],
  ["8.2|55021014|overtime", "0.00", "0.00"],
  ["8.3|55023001|staff-welfare", "3300.00", "0.00"],
  ["8.4|54022001|recruitment-expenses", "0.00", "0.00"],
  ["8.5|55023003|training-development", "0.00", "0.00"],
  ["9.01|55010901|petrol-and-diesel-charges", "22500.00", "18000.00"],
  ["9.01|55010902|repairs-maintenance-vehicles", "4000.00", "2000.00"],
  ["9.02|55011201|insurance-stocks", "0.00", "0.00"],
  ["9.02|55011202|insurance-assets", "0.00", "0.00"],
  ["9.03|55001001|internet-expenses", "0.00", "1000.00"],
  ["9.03|55001002|postage-courier-expenses", "0.00", "0.00"],
  ["9.03|55001003|telephone-expenses", "0.00", "0.00"],
  ["9.04|55010801|travelling-exp-management-domestic", "0.00", "0.00"],
  ["9.04|55010802|travelling-exp-management-foreign", "0.00", "0.00"],
  ["9.04|55010803|travelling-exp-employee-domestic", "0.00", "2000.00"],
  ["9.04|55010804|travelling-exp-employee-foreign", "0.00", "0.00"],
  ["9.04|55010805|travelling-expenses-others", "0.00", "0.00"],
  ["9.05|55011000|marketing-advertisement", "0.00", "0.00"],
  ["9.05|55012000|promotional-events", "0.00", "0.00"],
  ["9.05|55014000|sponsorships", "0.00", "0.00"],
  ["9.05|55010101|charities-donations", "0.00", "3000.00"],
  ["9.06|55010201|technical-consultancy", "0.00", "0.00"],
  ["9.06|55010202|legal-consultancy", "0.00", "0.00"],
  ["9.06|55010203|strategy-operations-consultancy", "0.00", "0.00"],
  ["9.07|54023002|computer-maintenance", "15500.00", "4000.00"],
  ["9.07|54023003|amc-renewal-charges", "0.00", "0.00"],
  ["9.08|55010501|rates-taxes", "0.00", "0.00"],
  ["9.09|55010601|office-rent", "0.00", "0.00"],
  ["9.09|55010603|land-lease-rent", "353938.00", "0.00"],
  ["9.09|55010602|guest-house-rent", "0.00", "0.00"],
  ["9.1|55011101|office-electricity-expenses", "22124.00", "15000.00"],
  ["9.1|55011102|guest-house-electricity-expenses", "0.00", "0.00"],
  ["9.11|55010401|printing-stationery", "6050.00", "1500.00"],
  ["9.12|55011301|subscriptions-membership-fee", "0.00", "0.00"],
  ["9.13|55010701|security-charges", "54958.00", "60000.00"],
  ["9.14|55010301|guest-house-maintenance", "0.00", "0.00"],
  ["9.14|55010302|repair-and-maintenance", "32281.00", "17000.00"],
  ["9.14|55010303|office-maintenance", "0.00", "4500.00"],
  ["9.14|55010305|miscellaneous-expenses", "3398.00", "3000.00"],
  ["9.14|55010306|lawn-garden-maintenance", "0.00", "1000.00"],
  ["9.14|55010307|covid-expenses", "0.00", "0.00"],
  ["9.14|55010310|5-s-expenses", "0.00", "0.00"],
  ["10.1|50001201|sapling-cost-ind", "0.00", "0.00"],
  ["10.2|50001202|clearing-forwardingind", "0.00", "0.00"],
  ["10.3|50001203|sapling-transportationind", "0.00", "0.00"],
  ["11.1|50001201|sapling-cost-imp", "0.00", "0.00"],
  ["11.2|50001202|clearing-forwardingimp", "0.00", "0.00"],
  ["11.3|50001203|sapling-transportationimp", "0.00", "0.00"],
  ["14|50001981|transportation-charges", "49000.00", "0.00"],
  ["15|11110000|capex-it-other-assets", "0.00", "0.00"],
  ["unmapped-GL", "1766805.73", "0.00"],
] as const;

const statementDomain = {
  name: "mis-statement",
  label: "MIS statement",
  goldObject: "statement_relation",
  routingHints: [],
  measures: [],
  dimensions: [],
};

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
