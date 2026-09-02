import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const EXPECTED_TABLES = [
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

test("trimmed app-DB migrations declare only auth and audit tables", async () => {
  const migrationsDirectory = resolve(__dirname, "../../drizzle");
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const migrations = await Promise.all(
    migrationFiles.map(async (file) => ({
      file,
      sql: await readFile(resolve(migrationsDirectory, file), "utf8"),
    })),
  );
  const combinedSql = migrations.map(({ sql }) => sql).join("\n");

  const createdTables = [...combinedSql.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([a-z_]+)"?/gi)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(createdTables, EXPECTED_TABLES);

  const auditTable = combinedSql.match(
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?audit_events"?\s*\(([\s\S]*?)\n\);/i,
  );
  assert.ok(auditTable, "audit_events must be created by the migration set");
  for (const column of [
    "conversation_id",
    "model_id",
    "input_tokens",
    "output_tokens",
    "total_tokens",
  ]) {
    assert.match(auditTable[1], new RegExp(`(?:^|\\n)\\s*"?${column}"?\\s`, "i"));
  }

  const createdTableSet = new Set(createdTables);
  const referencedTables = [...combinedSql.matchAll(/REFERENCES\s+"?([a-z_]+)"?/gi)]
    .map((match) => match[1]);
  for (const referencedTable of referencedTables) {
    assert.ok(
      createdTableSet.has(referencedTable),
      `foreign key references missing table ${referencedTable}`,
    );
  }

  const journal = JSON.parse(
    await readFile(resolve(migrationsDirectory, "meta/_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  const journalTags = journal.entries.map((entry) => entry.tag).sort();
  const migrationTags = migrationFiles.map((file) => file.replace(/\.sql$/, "")).sort();
  assert.deepEqual(journalTags, migrationTags);
  assert.deepEqual(
    journal.entries.map((entry) => entry.idx),
    journal.entries.map((_, index) => index),
  );
});
