import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { AuthUser } from "@3f/contract";
import { IngestService, type UploadedWorkbook } from "../ingest/ingest.service";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SqlBuilder } from "../sql/sqlBuilder";
import { SqlValidator } from "../sql/sqlValidator";
import { DrillTransactionsRepository } from "./drill-transactions.repository";
import { createWarehouseDb, createWarehouseWritePool, IngestionRepository } from "./ingestion.repository";
import { PostgresAdapter } from "./postgres.adapter";
import { migrateWarehouse } from "./warehouse-migrate";
import type { QueryResult, Warehouse } from "./warehouse.interface";

const JULY = "2026-07-01";
const LEAF_KEY = "1.1|50001201|sprout-cost";
const ACTUALS_PATH = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/SAP Entries Mapping.xlsx");
const BUDGET_PATH = join(__dirname, "../../../docs/context/2026-08-20-srihari-phase1-data/Nursery MIS Format.xlsx");

test("the destructive drill transactions proof refuses a non-local warehouse host", () => {
  assert.throws(() => assertLocalWarehouseHost("warehouse.shared.example"), /refuses a non-local warehouse/);
});

test(
  "WAREHOUSE_DB_TEST proves client July leaf and unmapped drill footing plus fixture based multi period footing in exact paise",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    assertLocalWarehouseHost(process.env.WAREHOUSE_PG_HOST);
    await migrateWarehouse();
    const pool = await createWarehouseWritePool();
    try {
      await pool.query("TRUNCATE sap_transaction, mis_budget, ingest_batch CASCADE");
      const ingest = new IngestService();
      const actual = await ingest.ingestActuals(upload(ACTUALS_PATH), "drill-proof");
      await ingest.ingestBudget(upload(BUDGET_PATH), "drill-proof");
      const resolution = await new SelectionResolverService(new PeriodWarehouse()).resolve({
        department: "Agriculture",
        function: "Nursery",
        plant: "DUB",
        period: JULY,
      });
      assert.equal(resolution.outcome, "resolved");
      if (resolution.outcome !== "resolved") return;
      const leafTargets = resolution.leafTargets ?? [];
      const repository = new DrillTransactionsRepository(new SqlValidator(), new PostgresAdapter());
      const statementRows = await pool.query<{ leaf_key: string; actual_net: string }>(
        new SqlBuilder().build(
          statementDomain,
          {
            domain: statementDomain.name,
            measureIds: statementDomain.measures.map(({ id }) => id),
            dimensionIds: ["leaf_key"],
            filters: [],
            timeWindow: { grain: "month", column: "month", from: JULY, to: JULY },
          },
          user,
          true,
          {
            triples: resolution.triples,
            glCodes: resolution.glCodes,
            masterGlCodes: resolution.masterGlCodes,
            leafTargets,
          },
        ).sql,
      );
      const statementByLeaf = new Map(statementRows.rows.map((row) => [row.leaf_key, row.actual_net]));

      const leafPredicate = {
        actualBatchIds: [actual.batchId],
        triples: leafTargets
          .filter(({ target }) => target.kind === "leaf" && target.leafKey === LEAF_KEY)
          .map(({ plant, costCenter, glCode }) => ({ plant, costCenter, glCode })),
        plants: ["DUB"],
        from: JULY,
        to: JULY,
      };
      const first = await repository.execute(repository.buildQueries(leafPredicate, 1));
      const repeated = await repository.execute(repository.buildQueries(leafPredicate, 1));
      assert.equal(first.footer.value, statementByLeaf.get(LEAF_KEY));
      assert.deepEqual(first.lines, repeated.lines);

      const bucket = await repository.execute(
        repository.buildQueries(
          {
            ...leafPredicate,
            triples: leafTargets
              .filter(({ target }) => target.kind === "bucket")
              .map(({ plant, costCenter, glCode }) => ({ plant, costCenter, glCode })),
          },
          1,
        ),
      );
      assert.equal(bucket.footer.value, statementByLeaf.get("unmapped-GL"));

      const fixture = new IngestionRepository(createWarehouseDb(pool));
      const april = await fixture.replaceActualsBatch(
        metadata("2026-04-01"),
        Array.from({ length: 101 }, (_, index) => fixtureRow(`APR-${index}`, "2026-04-01", "1.01")),
      );
      const may = await fixture.replaceActualsBatch(metadata("2026-05-01"), [fixtureRow("MAY", "2026-05-01", "2.02")]);
      const ytdStatementRows = await pool.query<{ leaf_key: string; actual_net: string }>(
        new SqlBuilder().build(
          statementDomain,
          {
            domain: statementDomain.name,
            measureIds: statementDomain.measures.map(({ id }) => id),
            dimensionIds: ["leaf_key"],
            filters: [],
            timeWindow: { grain: "month", column: "month", from: "2026-04-01", to: JULY },
          },
          user,
          true,
          {
            triples: resolution.triples,
            glCodes: resolution.glCodes,
            masterGlCodes: resolution.masterGlCodes,
            leafTargets,
          },
        ).sql,
      );
      const ytdStatementByLeaf = new Map(ytdStatementRows.rows.map((row) => [row.leaf_key, row.actual_net]));
      const paged = await repository.execute(
        repository.buildQueries({ ...leafPredicate, actualBatchIds: [april], from: "2026-04-01", to: "2026-04-01" }, 1),
      );
      assert.equal(paged.totalCount, 101);
      assert.equal(paged.lines.length, 100);
      const ytd = await repository.execute(
        repository.buildQueries(
          { ...leafPredicate, actualBatchIds: [april, may, actual.batchId], from: "2026-04-01" },
          1,
        ),
      );
      assert.equal(ytdStatementByLeaf.get(LEAF_KEY), addMoney(statementByLeaf.get(LEAF_KEY)!, "104.03"));
      assert.equal(ytd.footer.value, ytdStatementByLeaf.get(LEAF_KEY));
    } finally {
      await pool.end();
    }
  },
);

const statementDomain = (() => {
  const domain = new SemanticLayer().domain("mis-statement");
  if (!domain) throw new Error("MIS statement domain is not registered");
  return domain;
})();

const user: AuthUser = {
  id: "drill-proof",
  email: "proof@example.com",
  display_name: "Proof",
  is_active: true,
  roles: ["admin"],
  permissions: { domains: [], measureIds: [], dimensionIds: [], actions: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};

class PeriodWarehouse implements Warehouse {
  async explain() {}
  async execute(): Promise<QueryResult> {
    return { columns: [{ name: "period", numeric: false }], rows: [{ period: JULY }] };
  }
  async freshness() {
    return null;
  }
  async distinctValues() {
    return [];
  }
}

function metadata(period: string) {
  return {
    period,
    uploadedBy: "drill-proof",
    validationResult: { valid: true },
    reconciliationResult: { fixture: true },
  };
}

function fixtureRow(txnNo: string, month: string, debit: string) {
  return {
    txnNo,
    lineId: "1",
    postingDate: month,
    month,
    plant: "DUB",
    plantSrc: "DUB-NUR",
    costCenter: "Imported Sprouts",
    glCode: "50001201",
    acctName: "Fixture",
    debit,
    credit: "0.00",
    raw: {},
  };
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

function addMoney(left: string, right: string): string {
  const paise = (value: string) => {
    const [whole, fraction] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction);
  };
  const total = paise(left) + paise(right);
  return `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
}

function assertLocalWarehouseHost(host: string | undefined): void {
  assert.ok(
    host === "127.0.0.1" || host === "::1" || host === "localhost",
    "WAREHOUSE_DB_TEST refuses a non-local warehouse before destructive drill setup",
  );
}
