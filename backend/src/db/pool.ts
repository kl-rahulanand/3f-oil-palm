import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { loadConfig } from "../config";
import * as schema from "./schema";

export type AppDb = NodePgDatabase<typeof schema>;

/** Single shared PG pool for the app DB. */
export function createPool(): Pool {
  const cfg = loadConfig();
  return new Pool({
    host: cfg.pg.host,
    port: cfg.pg.port,
    user: cfg.pg.user,
    password: cfg.pg.password,
    database: cfg.pg.database,
    max: 10,
  });
}

/** Drizzle ORM client for the app DB, backed by node-postgres. */
export function createDb(pool = createPool()): AppDb {
  return drizzle(pool, { schema });
}
