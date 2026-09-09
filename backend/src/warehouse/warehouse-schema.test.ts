import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PgDialect, getTableConfig, getViewConfig, isPgMaterializedView } from "drizzle-orm/pg-core";
import { loadWarehousePostgresConfig } from "../config";
import { actualByKeyMonth, ingestBatch, misBudget, sapTransaction } from "./warehouse-schema";

const dialect = new PgDialect();

function names(items: Array<{ name?: string; getName?: () => string | undefined }>): string[] {
  return items.map((item) => item.name ?? item.getName?.() ?? "");
}

function columnNames(items: Array<{ name: string }>): string[] {
  return items.map(({ name }) => name);
}

test("the warehouse schema declares ingest_batch with a one-active-per source_kind period and canonical_plant guarantee, sap_transaction with numeric debit and credit keyed to a batch and indexed, mis_budget, and the actual_by_key_month gold aggregation, without touching the read-only Warehouse query port", async () => {
  const batch = getTableConfig(ingestBatch);
  const transactions = getTableConfig(sapTransaction);
  const budgets = getTableConfig(misBudget);

  assert.deepEqual([batch.name, transactions.name, budgets.name], ["ingest_batch", "sap_transaction", "mis_budget"]);
  assert.deepEqual(names(batch.checks).sort(), [
    "ingest_batch_period_month_check",
    "ingest_batch_row_count_check",
    "ingest_batch_source_kind_check",
  ]);
  const sourceKindCheck = batch.checks.find(({ name }) => name === "ingest_batch_source_kind_check");
  assert.ok(sourceKindCheck);
  assert.match(dialect.sqlToQuery(sourceKindCheck.value).sql, /IN \('actuals', 'budget'\)/);

  const activeIndex = batch.indexes.find(({ config }) => config.name === "ingest_batch_active_source_period_unique");
  assert.ok(activeIndex?.config.unique);
  assert.deepEqual(columnNames(activeIndex.config.columns as Array<{ name: string }>), ["source_kind", "period"]);
  assert.ok(activeIndex.config.where, "the active-batch unique index must be partial");

  assert.equal(sapTransaction.plant.notNull, true, "plant is the canonical row-level plant");
  assert.equal(sapTransaction.plantSrc.notNull, true, "plant_src retains the source plant");
  assert.equal(sapTransaction.debit.getSQLType(), "numeric(18, 2)");
  assert.equal(sapTransaction.credit.getSQLType(), "numeric(18, 2)");
  assert.deepEqual(names(transactions.uniqueConstraints), ["sap_transaction_batch_source_line_unique"]);
  assert.deepEqual(
    transactions.uniqueConstraints[0].columns.map(({ name }) => name),
    ["batch_id", "txn_no", "line_id"],
  );
  assert.deepEqual(transactions.indexes.map(({ config }) => config.name).sort(), [
    "idx_sap_transaction_batch_id",
    "idx_sap_transaction_month_plant_cost_center_gl_code",
  ]);
  assert.deepEqual(columnNames(transactions.indexes[1].config.columns as Array<{ name: string }>), [
    "month",
    "plant",
    "cost_center",
    "gl_code",
  ]);
  assert.equal(transactions.foreignKeys.length, 1);

  assert.equal(misBudget.budgetAmount.getSQLType(), "numeric(18, 2)");
  assert.equal(misBudget.rolloverAmount.getSQLType(), "numeric(18, 2)");
  assert.deepEqual(
    budgets.indexes.map(({ config }) => config.name),
    ["idx_mis_budget_batch_id"],
  );
  assert.deepEqual(
    budgets.uniqueConstraints[0].columns.map(({ name }) => name),
    ["batch_id", "format_id", "period", "line_id", "gl_code", "cost_center"],
  );
  assert.equal(budgets.foreignKeys.length, 1);

  for (const table of [ingestBatch, sapTransaction, misBudget]) {
    const auditColumns = columnNames(getTableConfig(table).columns);
    assert.ok(auditColumns.includes("created_at_utc"));
    assert.ok(auditColumns.includes("updated_at_utc"));
  }

  assert.equal(isPgMaterializedView(actualByKeyMonth), false);
  const view = getViewConfig(actualByKeyMonth);
  assert.equal(view.name, "actual_by_key_month");
  assert.deepEqual(columnNames(Object.values(view.selectedFields) as Array<{ name: string }>), [
    "plant",
    "cost_center",
    "gl_code",
    "month",
    "actual_net",
  ]);
  assert.ok(view.query);
  const viewSql = dialect.sqlToQuery(view.query).sql.replaceAll(/\s+/g, " ").toLowerCase();
  assert.match(viewSql, /sum\(txn\.debit - txn\.credit\)::numeric\(18, 2\) as actual_net/);
  assert.match(viewSql, /batch\.source_kind = 'actuals' and batch\.is_active/);
  assert.match(viewSql, /group by txn\.plant, txn\.cost_center, txn\.gl_code, txn\.month/);

  const repositorySource = readFileSync(resolve(__dirname, "ingestion.repository.ts"), "utf8");
  assert.match(repositorySource, /this\.db\.transaction/);
  assert.match(repositorySource, /pg_advisory_xact_lock/);
  assert.match(repositorySource, /INSERT_CHUNK_SIZE = 1000/);
  assert.equal(repositorySource.match(/insertInChunks\(rows/g)?.length, 2);
  assert.ok(repositorySource.indexOf("insert(ingestBatch)") < repositorySource.indexOf("isActive: false"));
  assert.doesNotMatch(repositorySource, /postgres\.adapter|warehouse\.interface/);

  const migrationSource = readFileSync(resolve(__dirname, "../../drizzle-warehouse/0000_solid_ken_ellis.sql"), "utf8");
  assert.match(migrationSource, /CREATE TRIGGER ingest_batch_immutable/);
  assert.match(migrationSource, /CREATE TRIGGER sap_transaction_batch_period/);
  assert.match(migrationSource, /sap_transaction month must match its ingest_batch period/);
  assert.match(migrationSource, /CREATE TRIGGER mis_budget_batch_period/);
  assert.match(migrationSource, /mis_budget period must match its ingest_batch period/);
  assert.match(migrationSource, /CREATE VIEW "public"\."actual_by_key_month"/);
  const migrationRunner = readFileSync(resolve(__dirname, "warehouse-migrate.ts"), "utf8");
  assert.match(migrationRunner, /migrationsFolder/);
  assert.match(migrationRunner, /new IngestionRepository\(transaction\)/);
  assert.match(migrationRunner, /seed-proof\.sql/);
  assert.doesNotMatch(migrationRunner, /drizzle-kit|generate/);

  const seedProof = readFileSync(resolve(__dirname, "../../drizzle-warehouse/seed-proof.sql"), "utf8");
  assert.match(seedProof, /110\.25/);
  assert.match(seedProof, /999\.00/);
  assert.match(seedProof, /NOT batch\.is_active/);
  const backendPackage = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8"));
  assert.equal(backendPackage.scripts["warehouse:proof"], "ts-node -T src/warehouse/warehouse-migrate.ts --proof");

  const guardedEnv = [
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "WAREHOUSE_PG_HOST",
    "WAREHOUSE_PG_PORT",
    "WAREHOUSE_PG_USER",
    "WAREHOUSE_PG_PASSWORD",
    "WAREHOUSE_PG_DATABASE",
  ] as const;
  const original = Object.fromEntries(guardedEnv.map((name) => [name, process.env[name]]));
  const addresses: Record<string, string> = {
    "app-db.test": "10.0.0.2",
    "app-db-alias.test": "10.0.0.2",
    "warehouse-db.test": "10.0.0.3",
  };
  const lookup = async (hostname: string) => [
    { address: addresses[hostname] ?? hostname, family: hostname.includes(":") ? 6 : 4 },
  ];
  try {
    for (const name of guardedEnv) delete process.env[name];
    await assert.rejects(loadWarehousePostgresConfig(lookup), /Warehouse Postgres is not configured/);

    process.env.PGHOST = "app-db.test";
    process.env.WAREHOUSE_PG_HOST = "app-db-alias.test";
    process.env.PGPORT = process.env.WAREHOUSE_PG_PORT = "5432";
    process.env.PGDATABASE = "threef";
    process.env.WAREHOUSE_PG_DATABASE = "warehouse";
    process.env.WAREHOUSE_PG_USER = "warehouse";
    process.env.WAREHOUSE_PG_PASSWORD = "warehouse-local";
    await assert.rejects(loadWarehousePostgresConfig(lookup), /must be separate from the application database/);

    process.env.PGHOST = "127.0.0.1";
    for (const hostAlias of ["::1", "[::1]", "127.0.0.2", "::ffff:127.0.0.1"]) {
      process.env.WAREHOUSE_PG_HOST = hostAlias;
      await assert.rejects(loadWarehousePostgresConfig(lookup), /must be separate from the application database/);
    }

    process.env.PGHOST = "app-db.test";
    process.env.WAREHOUSE_PG_HOST = "warehouse-db.test";
    assert.equal((await loadWarehousePostgresConfig(lookup)).database, "warehouse");
  } finally {
    for (const name of guardedEnv) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});

test(
  "the warehouse proof migrates and atomically replaces an active actuals batch through IngestionRepository",
  { skip: process.env.WAREHOUSE_DB_TEST !== "1" },
  async () => {
    const { proveWarehouse } = await import("./warehouse-migrate");
    await proveWarehouse();
  },
);
