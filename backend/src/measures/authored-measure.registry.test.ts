import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppDb } from "../db/pool";
import { AuthoredMeasureRegistry } from "./authored-measure.registry";

test("authored measure registry starts empty when its feature table is absent", async () => {
  const postgresError = Object.assign(new Error("relation does not exist"), { code: "42P01" });
  const registry = new AuthoredMeasureRegistry(rejectingDb(new Error("query failed", { cause: postgresError })));

  await registry.onModuleInit();

  assert.deepEqual(registry.published("financial"), []);
});

test("authored measure registry rethrows non-undefined-table database failures", async () => {
  const databaseError = Object.assign(new Error("connection terminated"), { code: "08006" });
  const registry = new AuthoredMeasureRegistry(rejectingDb(databaseError));

  await assert.rejects(() => registry.onModuleInit(), (error: unknown) => error === databaseError);
});

function rejectingDb(error: Error): AppDb {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.reject(error),
        }),
      }),
    }),
  } as unknown as AppDb;
}
