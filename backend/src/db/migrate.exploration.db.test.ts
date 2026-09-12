import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Pool } from "pg";
import { loadConfig } from "../config";

test("the scoped migration creates exactly saved queries and dashboard pins on a database holding only the auth audit migration", async () => {
  const config = loadConfig().pg;
  assert.ok(["127.0.0.1", "::1", "localhost"].includes(config.host), "scratch database requires a local app DB");
  const database = `exploration_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ ...config, max: 1 });
  let scratch: Pool | undefined;

  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    scratch = new Pool({ ...config, database, max: 1 });
    await applyMigration(scratch, "0000_auth_audit.sql");
    assert.deepEqual(await tables(scratch), BASE_TABLES);
    await applyMigration(scratch, "0001_saved_and_pins.sql");
    assert.deepEqual(await tables(scratch), [...BASE_TABLES, "dashboard_pins", "saved_queries"].sort());
  } finally {
    await scratch?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
  }
});

async function applyMigration(pool: Pool, file: string): Promise<void> {
  const sql = await readFile(resolve(__dirname, `../../drizzle/${file}`), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await pool.query(statement);
  }
}

async function tables(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  return result.rows.map((row) => row.table_name);
}

const BASE_TABLES = [
  "audit_events",
  "otp_codes",
  "refresh_tokens",
  "role_perms",
  "roles",
  "sessions",
  "user_roles",
  "user_scope",
  "users",
];
