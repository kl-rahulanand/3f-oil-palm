import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/warehouse/warehouse-schema.ts",
  out: "./drizzle-warehouse",
});
