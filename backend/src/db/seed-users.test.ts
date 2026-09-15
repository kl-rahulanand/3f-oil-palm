import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSeedUsers } from "../config";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import { SeedUserPlantScopeError, desiredSeedPlants } from "./migrate";

test("seed users reconcile listed users plant scope to the list grant every master plant to an admin without one none to a non admin without one and never touch unlisted users", () => {
  const listed = parseSeedUsers("dub@example.test|DUB only|analyst|DUB;admin@example.test|Admin|admin");
  assert.deepEqual(desiredSeedPlants(listed[0]), ["DUB"]);
  assert.deepEqual(desiredSeedPlants({ roles: ["analyst"] }), []);
  assert.deepEqual(
    desiredSeedPlants(listed[1]),
    MAPPING_MASTER.selections.map(({ plant_canonical }) => plant_canonical).sort(),
  );
  assert.deepEqual(reconcile(["DUB", "H.O"], desiredSeedPlants(listed[0])), ["DUB"]);
  assert.deepEqual(reconcile(["DUB"], desiredSeedPlants(listed[0])), ["DUB"]);
  assert.deepEqual(reconcile(["UNLISTED"], undefined), ["UNLISTED"]);
  assert.throws(() => desiredSeedPlants({ roles: ["analyst"], plants: ["UNKNOWN"] }), SeedUserPlantScopeError);
});

function reconcile(current: string[], desired: string[] | undefined): string[] {
  return desired === undefined ? current : [...desired];
}
