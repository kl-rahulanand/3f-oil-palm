import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const LEGACY_PRODUCT_NAME = new RegExp(["pu", "lse"].join(""), "i");

test("no Pulse product identifiers remain in backend and contract source", () => {
  const currentFile = resolve(__filename);
  const offenders = ["backend/src", "contract/src"]
    .flatMap(typescriptFiles)
    .filter((file) => resolve(file) !== currentFile)
    .filter((file) => LEGACY_PRODUCT_NAME.test(readFileSync(file, "utf8")));

  assert.deepEqual(offenders, []);
});

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}
