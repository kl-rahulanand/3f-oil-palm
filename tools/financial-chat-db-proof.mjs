import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const required = [
  "WAREHOUSE_PG_HOST",
  "WAREHOUSE_PG_PORT",
  "WAREHOUSE_PG_USER",
  "WAREHOUSE_PG_PASSWORD",
  "WAREHOUSE_PG_DATABASE",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "FINANCIAL_CHAT_SOURCE_FILE",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) fail(`Missing ${missing.join(", ")}; financial chat DB proof did not start.`);
if (
  process.env.WAREHOUSE_PG_HOST !== "127.0.0.1" ||
  process.env.WAREHOUSE_PG_PORT !== "5434" ||
  process.env.PGHOST !== "127.0.0.1" ||
  process.env.PGPORT !== "5435"
) {
  fail("Financial chat DB proof accepts only disposable 127.0.0.1:5434 warehouse and :5435 app targets.");
}
if (!existsSync(process.env.FINANCIAL_CHAT_SOURCE_FILE)) {
  fail("FINANCIAL_CHAT_SOURCE_FILE does not exist; financial chat DB proof did not start.");
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  [
    "--require",
    "ts-node/register",
    "--test",
    "--test-concurrency=1",
    "backend/src/financial-chat/financial-report-baseline.test.ts",
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      FINANCIAL_CHAT_DUAL_DB_TEST: "1",
      STATEMENT_ATTESTATION_SECRETS: "financial-chat-db-proof-secret",
      TS_NODE_PROJECT: "backend/tsconfig.json",
      TS_NODE_TRANSPILE_ONLY: "1",
    },
  },
);
if (result.error) fail(result.error.message);
process.exitCode = result.status ?? 1;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
