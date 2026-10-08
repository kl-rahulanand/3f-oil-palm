import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDisposableFinancialDatabases } from "./financial-disposable-db.guard";

const disposableEnvironment = {
  FINANCIAL_CHAT_DUAL_DB_TEST: "1",
  WAREHOUSE_PG_HOST: "127.0.0.1",
  WAREHOUSE_PG_PORT: "5434",
  WAREHOUSE_PG_USER: "proof",
  WAREHOUSE_PG_PASSWORD: "proof",
  WAREHOUSE_PG_DATABASE: "financial_proof",
  PGHOST: "127.0.0.1",
  PGPORT: "5435",
  PGUSER: "proof",
  PGPASSWORD: "proof",
  PGDATABASE: "financial_proof",
};

test("the financial DB proof accepts only the two explicit disposable targets", () => {
  assert.deepEqual(assertDisposableFinancialDatabases(disposableEnvironment), {
    warehouse: { host: "127.0.0.1", port: 5434, database: "financial_proof" },
    app: { host: "127.0.0.1", port: 5435, database: "financial_proof" },
  });
});

test("the financial DB proof refuses wrong hosts and ports before writes", () => {
  for (const change of [
    { WAREHOUSE_PG_HOST: "localhost" },
    { WAREHOUSE_PG_PORT: "5433" },
    { PGHOST: "localhost" },
    { PGPORT: "5432" },
  ]) {
    assert.throws(
      () => assertDisposableFinancialDatabases({ ...disposableEnvironment, ...change }),
      /refuses database writes/,
    );
  }
});

test("the financial DB proof refuses either wrong database identity before writes", () => {
  for (const change of [{ WAREHOUSE_PG_DATABASE: "live_warehouse" }, { PGDATABASE: "live_app" }]) {
    assert.throws(
      () => assertDisposableFinancialDatabases({ ...disposableEnvironment, ...change }),
      /refuses database writes/,
    );
  }
});

test("the financial DB proof refuses missing target settings", () => {
  for (const name of ["WAREHOUSE_PG_HOST", "WAREHOUSE_PG_DATABASE", "PGHOST", "PGDATABASE"] as const) {
    const environment: Record<string, string | undefined> = { ...disposableEnvironment };
    delete environment[name];
    assert.throws(() => assertDisposableFinancialDatabases(environment), /missing .* refuses database writes/);
  }
});

test("a manually enabled proof flag cannot bypass target validation", () => {
  assert.throws(
    () =>
      assertDisposableFinancialDatabases({
        FINANCIAL_CHAT_DUAL_DB_TEST: "1",
        WAREHOUSE_PG_HOST: "127.0.0.1",
        WAREHOUSE_PG_PORT: "5433",
        WAREHOUSE_PG_DATABASE: "live_warehouse",
        PGHOST: "127.0.0.1",
        PGPORT: "5432",
        PGDATABASE: "live_app",
      }),
    /refuses database writes/,
  );
});
