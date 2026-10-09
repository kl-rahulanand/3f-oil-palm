import { defineConfig, devices } from "@playwright/test";
import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

// Failure traces can contain financial rows; never save them in a checkout.
const proofOutput = join(tmpdir(), "3f-financial-legacy-ui-playwright");
mkdirSync(proofOutput, { recursive: true });
const outputDir = realpathSync(proofOutput);
const checkoutRelative = relative(resolve(__dirname, ".."), outputDir);
if (!isAbsolute(checkoutRelative) && !checkoutRelative.startsWith("..")) {
  throw new Error("Legacy financial browser proof artifacts must stay outside the repository");
}
if (process.env.LLM_PROVIDER !== "mock" || process.env.AUTH_OTP_MOCK !== "1") {
  throw new Error("Legacy financial browser proof requires mock model and OTP providers");
}

const expected = {
  FINANCIAL_CHAT_DUAL_DB_TEST: "1",
  WAREHOUSE_PG_HOST: "127.0.0.1",
  WAREHOUSE_PG_PORT: "5434",
  WAREHOUSE_PG_DATABASE: "financial_proof",
  PGHOST: "127.0.0.1",
  PGPORT: "5435",
  PGDATABASE: "financial_proof",
} as const;

if (process.env.CI) throw new Error("Legacy financial browser proof is local-only and must not run in immutable CI");
for (const [name, value] of Object.entries(expected)) {
  if (process.env[name] !== value) {
    throw new Error(`Legacy financial browser proof requires ${name}=${value} and refuses to start`);
  }
}
if (
  !process.env.PGUSER ||
  !process.env.PGPASSWORD ||
  !process.env.WAREHOUSE_PG_USER ||
  !process.env.WAREHOUSE_PG_PASSWORD
) {
  throw new Error("Legacy financial browser proof requires explicit disposable database credentials");
}
if (process.env.FINANCIAL_CHAT_E2E_DATASET !== "generated" && process.env.FINANCIAL_CHAT_E2E_DATASET !== "real") {
  throw new Error("Set FINANCIAL_CHAT_E2E_DATASET to generated or real");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "line",
  outputDir,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node node_modules/ts-node/dist/bin.js --project backend/tsconfig.json backend/src/main.ts",
      cwd: "..",
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node node_modules/next/dist/bin/next dev frontend -H 127.0.0.1 -p 3000",
      cwd: "..",
      url: "http://127.0.0.1:3000/login",
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
