import { existsSync } from "fs";
import { resolve } from "path";
import { config as loadDotenv } from "dotenv";

// Central config, read once from env. No secrets hardcoded.
for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), "../../.env"),
]) {
  if (existsSync(path)) {
    loadDotenv({ path });
    break;
  }
}

export interface Config {
  port: number;
  nodeEnv: string;
  authOtpMock: boolean;
  authJwtSecret: string;
  frontendOrigin: string;
  pg: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  sessionTtlHours: number;
  sessionTurnWindow: number;
  sessionConversationCap: number;
  conversationHydrateLimit: number;
  sessionSweepIntervalMs: number;
  reconIntervalMs: number;
  pinRefreshIntervalMs: number;
  pinRefreshMinIntervalMs: number;
  scopeValueCacheTtlMs: number;
  dimensionEnumMax: number;
  bcryptRounds: number;
  seedUsers: Array<{ email: string; displayName: string; roles: string[] }>;
  starrocks: {
    host: string;
    mysqlPort: number;
    httpUrl: string;
    username: string;
    password: string;
    catalog: string;
    database: string;
  };
  warehouse: {
    postgres: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    };
  };
  warehouseDriver: "postgres" | "mysql" | "http";
  queryTimeoutMs: number;
  maxRows: number;
  suppressionK: number;
  llmProvider: "mock" | "bedrock";
  bedrock: { region: string; modelId: string };
  swaggerEnabled: boolean;
}

const num = (v: string | undefined, d: number) => (v ? Number(v) : d);
const bool = (v: string | undefined) => v === "true" || v === "1";

export const DEFAULT_SEED_USERS = "admin@example.invalid|Pulse Admin|admin";

function parseSeedUsers(value: string | undefined): Config["seedUsers"] {
  // SEED_USERS format: email|display_name|role1+role2;email|display_name|role
  if (!value) return parseSeedUsers(DEFAULT_SEED_USERS);

  const parsed = value
    .split(";")
    .map((entry) => {
      const [emailValue, displayNameValue, rolesValue] = entry.split("|");

      const email = emailValue?.trim().toLowerCase();
      const displayName = displayNameValue?.trim();
      const roles = rolesValue
        ?.split("+")
        .map((role) => role.trim())
        .filter(Boolean);
      if (!email || !displayName || !roles?.length) return null;

      return { email, displayName, roles };
    })
    .filter((entry): entry is Config["seedUsers"][number] => entry !== null);

  return parsed.length ? parsed : parseSeedUsers(DEFAULT_SEED_USERS);
}

export function loadConfig(): Config {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const authOtpMock = bool(process.env.AUTH_OTP_MOCK);
  if (nodeEnv === "production" && authOtpMock) {
    throw new Error("AUTH_OTP_MOCK must not be enabled in production");
  }
  const authJwtSecret = process.env.AUTH_JWT_SECRET ?? "pulse-local-dev-auth-secret";
  if (nodeEnv === "production" && !process.env.AUTH_JWT_SECRET) {
    throw new Error("AUTH_JWT_SECRET is required in production");
  }

  return {
    port: num(process.env.PORT, 4000),
    nodeEnv,
    authOtpMock,
    authJwtSecret,
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    pg: {
      host: process.env.PGHOST ?? "localhost",
      port: num(process.env.PGPORT, 5432),
      user: process.env.PGUSER ?? "pulse",
      password: process.env.PGPASSWORD ?? "",
      database: process.env.PGDATABASE ?? "pulse",
    },
    sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 12),
    sessionTurnWindow: num(process.env.SESSION_TURN_WINDOW, 5),
    sessionConversationCap: num(process.env.SESSION_CONVERSATION_CAP, 20),
    conversationHydrateLimit: num(process.env.CONVERSATION_HYDRATE_LIMIT, 200),
    sessionSweepIntervalMs: num(process.env.SESSION_SWEEP_INTERVAL_MS, 300000),
    reconIntervalMs: num(process.env.RECON_INTERVAL_MS, 0),
    pinRefreshIntervalMs: num(process.env.PIN_REFRESH_INTERVAL_MS, 0),
    pinRefreshMinIntervalMs: num(process.env.PIN_REFRESH_MIN_INTERVAL_MS, 15000),
    scopeValueCacheTtlMs: num(process.env.SCOPE_VALUE_CACHE_TTL_MS, 300000),
    dimensionEnumMax: num(process.env.DIMENSION_ENUM_MAX, 50),
    bcryptRounds: num(process.env.BCRYPT_ROUNDS, 12),
    seedUsers: parseSeedUsers(process.env.SEED_USERS),
    starrocks: {
      host: process.env.STARROCKS_HOST ?? "",
      mysqlPort: num(process.env.STARROCKS_MYSQL_PORT, 9030),
      httpUrl: process.env.STARROCKS_HTTP_URL ?? "",
      username: process.env.STARROCKS_USERNAME ?? "",
      password: process.env.STARROCKS_PASSWORD ?? "",
      catalog: process.env.STARROCKS_CATALOG ?? "default_catalog",
      database: process.env.STARROCKS_DATABASE ?? "analytics",
    },
    warehouse: {
      postgres: {
        host: process.env.WAREHOUSE_PG_HOST ?? "",
        port: num(process.env.WAREHOUSE_PG_PORT, 5432),
        user: process.env.WAREHOUSE_PG_USER ?? "",
        password: process.env.WAREHOUSE_PG_PASSWORD ?? "",
        database: process.env.WAREHOUSE_PG_DATABASE ?? "",
      },
    },
    warehouseDriver:
      process.env.WAREHOUSE_DRIVER === "http" || process.env.WAREHOUSE_DRIVER === "mysql"
        ? process.env.WAREHOUSE_DRIVER
        : "postgres",
    queryTimeoutMs: num(process.env.QUERY_TIMEOUT_MS, 15000),
    maxRows: num(process.env.MAX_ROWS, 1000),
    suppressionK: num(process.env.SUPPRESSION_K, 5),
    llmProvider: (process.env.LLM_PROVIDER as "mock" | "bedrock") ?? "mock",
    bedrock: {
      region: process.env.AWS_REGION ?? "ap-south-1",
      modelId: process.env.BEDROCK_MODEL_ID ?? "",
    },
    swaggerEnabled:
      process.env.NODE_ENV !== "production" || process.env.ENABLE_SWAGGER === "true",
  };
}

export const DRIZZLE_DB = "DRIZZLE_DB";
export const LLM_PROVIDER = "LLM_PROVIDER";
export const WAREHOUSE = "WAREHOUSE";
export const RECON_STORE = "RECON_STORE";
export const ALARM_SINK = "ALARM_SINK";
