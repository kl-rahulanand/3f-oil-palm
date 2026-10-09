import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

const expected = {
  FINANCIAL_CHAT_DUAL_DB_TEST: "1",
  BIND_HOST: "127.0.0.1",
  WAREHOUSE_DRIVER: "postgres",
  WAREHOUSE_PG_HOST: "127.0.0.1",
  WAREHOUSE_PG_PORT: "5434",
  WAREHOUSE_PG_DATABASE: "financial_proof",
  PGHOST: "127.0.0.1",
  PGPORT: "5435",
  PGDATABASE: "financial_proof",
  NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4000",
  FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  PORT: "4000",
} as const;

export function assertLegacyProofRuntime(environment: NodeJS.ProcessEnv): void {
  if (environment.CI) throw new Error("Legacy financial browser proof is local-only and must not run in immutable CI");
  if (environment.LLM_PROVIDER !== "mock" || environment.AUTH_OTP_MOCK !== "1") {
    throw new Error("Legacy financial browser proof requires mock model and OTP providers");
  }
  for (const [name, value] of Object.entries(expected)) {
    if (environment[name] !== value) {
      throw new Error(`Legacy financial browser proof requires ${name}=${value} and refuses to start`);
    }
  }
  if (
    !environment.PGUSER ||
    !environment.PGPASSWORD ||
    !environment.WAREHOUSE_PG_USER ||
    !environment.WAREHOUSE_PG_PASSWORD
  ) {
    throw new Error("Legacy financial browser proof requires explicit disposable database credentials");
  }
  if (environment.FINANCIAL_CHAT_E2E_DATASET !== "generated" && environment.FINANCIAL_CHAT_E2E_DATASET !== "real") {
    throw new Error("Set FINANCIAL_CHAT_E2E_DATASET to generated or real");
  }
}

export function trustedTaskDirectory(directory: string, checkout: string): string {
  const temporaryRoot = realpathSync(tmpdir());
  const checkoutRoots = gitWorktreeRoots(checkout);
  const requested = resolve(directory);
  const taskRoot = assertTrustedLocation(requested, temporaryRoot, checkoutRoots);
  mkdirSync(requested, { recursive: true });
  const canonicalTaskRoot = realpathSync(taskRoot);
  if (!samePath(canonicalTaskRoot, taskRoot)) {
    throw new Error("Financial proof artifacts require a trusted task temporary directory outside the checkout");
  }
  const canonical = realpathSync(requested);
  assertDescendant(canonical, canonicalTaskRoot);
  assertOutsideCheckouts(canonical, checkoutRoots);
  return canonical;
}

function assertTrustedLocation(target: string, temporaryRoot: string, checkoutRoots: string[]): string {
  const fromTemporaryRoot = relative(temporaryRoot, target);
  const taskDirectory = fromTemporaryRoot.split(/[\\/]/, 1)[0];
  const insideTemporaryRoot =
    Boolean(fromTemporaryRoot) && !isAbsolute(fromTemporaryRoot) && !/^\.\.(?:[\\/]|$)/.test(fromTemporaryRoot);
  if (!insideTemporaryRoot || !taskDirectory?.startsWith("3f-financial-")) {
    throw new Error("Financial proof artifacts require a trusted task temporary directory outside the checkout");
  }
  assertOutsideCheckouts(target, checkoutRoots);
  return join(temporaryRoot, taskDirectory);
}

function gitWorktreeRoots(checkout: string): string[] {
  return execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: checkout, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => realpathSync(line.slice("worktree ".length)));
}

function assertDescendant(target: string, root: string): void {
  const fromRoot = relative(root, target);
  if (isAbsolute(fromRoot) || /^\.\.(?:[\\/]|$)/.test(fromRoot)) {
    throw new Error("Financial proof artifacts require a trusted task temporary directory outside the checkout");
  }
}

function assertOutsideCheckouts(target: string, checkoutRoots: string[]): void {
  if (checkoutRoots.some((root) => isInside(target, root))) {
    throw new Error("Financial proof artifacts require a trusted task temporary directory outside the checkout");
  }
}

function isInside(target: string, root: string): boolean {
  const fromRoot = relative(root, target);
  return !isAbsolute(fromRoot) && !/^\.\.(?:[\\/]|$)/.test(fromRoot);
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

assertLegacyProofRuntime(process.env);
// Failure traces and downloads can contain financial rows; keep both under one canonical task directory.
const checkout = resolve(__dirname, "..");
const proofDirectory = trustedTaskDirectory(
  process.env.FINANCIAL_CHAT_E2E_EVIDENCE_DIR ?? join(tmpdir(), "3f-financial-legacy-ui-evidence"),
  checkout,
);
const outputDir = trustedTaskDirectory(join(proofDirectory, "playwright"), checkout);
const downloadsPath = trustedTaskDirectory(join(proofDirectory, "downloads"), checkout);
const webServerEnvironment: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ),
  NEXT_PUBLIC_API_BASE_URL: expected.NEXT_PUBLIC_API_BASE_URL,
  FRONTEND_ORIGIN: expected.FRONTEND_ORIGIN,
  PORT: expected.PORT,
};

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
    launchOptions: { downloadsPath },
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
      env: webServerEnvironment,
    },
    {
      command: "node node_modules/next/dist/bin/next dev frontend -H 127.0.0.1 -p 3000",
      cwd: "..",
      url: "http://127.0.0.1:3000/login",
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: webServerEnvironment,
    },
  ],
});
