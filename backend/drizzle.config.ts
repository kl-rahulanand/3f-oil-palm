import { defineConfig } from "drizzle-kit";
import { loadConfig } from "./src/config";

const cfg = loadConfig();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: cfg.pg.host,
    port: cfg.pg.port,
    user: cfg.pg.user,
    password: cfg.pg.password,
    database: cfg.pg.database,
  },
});
