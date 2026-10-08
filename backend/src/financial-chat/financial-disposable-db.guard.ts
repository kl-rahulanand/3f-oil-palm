import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

export interface FinancialDatabaseTargets {
  warehouse: { host: string; port: number; database: string };
  app: { host: string; port: number; database: string };
}

type Environment = Record<string, string | undefined>;

export function assertDisposableFinancialDatabases(environment: Environment): FinancialDatabaseTargets {
  const required = [
    "FINANCIAL_CHAT_DUAL_DB_TEST",
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
  ] as const;
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length) {
    throw new Error(`Financial chat proof missing ${missing.join(", ")} and refuses database writes`);
  }

  const warehouse = target(
    environment.WAREHOUSE_PG_HOST!,
    environment.WAREHOUSE_PG_PORT!,
    environment.WAREHOUSE_PG_DATABASE!,
  );
  const app = target(environment.PGHOST!, environment.PGPORT!, environment.PGDATABASE!);
  if (
    environment.FINANCIAL_CHAT_DUAL_DB_TEST !== "1" ||
    warehouse.host !== "127.0.0.1" ||
    warehouse.port !== 5434 ||
    warehouse.database !== "financial_proof" ||
    app.host !== "127.0.0.1" ||
    app.port !== 5435 ||
    app.database !== "financial_proof"
  ) {
    throw new Error("Financial chat proof refuses database writes outside disposable 127.0.0.1:5434/:5435 targets");
  }
  return { warehouse, app };
}

export function assertTrustedFinancialBaselineDirectory(directory: string, checkout: string): string {
  const target = resolve(directory);
  const root = resolve(checkout);
  const temporaryRoot = resolve(tmpdir());
  const fromCheckout = relative(root, target);
  const fromTemporaryRoot = relative(temporaryRoot, target);
  const taskDirectory = fromTemporaryRoot.split(/[\\/]/, 1)[0];
  const isOutsideCheckout = isAbsolute(fromCheckout) || /^\.\.(?:[\\/]|$)/.test(fromCheckout);
  const isInsideTemporaryRoot =
    Boolean(fromTemporaryRoot) && !isAbsolute(fromTemporaryRoot) && !/^\.\.(?:[\\/]|$)/.test(fromTemporaryRoot);
  if (
    !isAbsolute(target) ||
    !isOutsideCheckout ||
    !isInsideTemporaryRoot ||
    !taskDirectory?.startsWith("3f-financial-")
  ) {
    throw new Error("Financial baseline artifacts require a trusted task temporary directory outside the Git checkout");
  }
  return target;
}

function target(host: string, port: string, database: string) {
  return { host: host.trim(), port: Number(port), database: database.trim() };
}
