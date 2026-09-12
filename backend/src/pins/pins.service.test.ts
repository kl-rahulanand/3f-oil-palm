import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, Selection } from "@3f/contract";
import type { AuditService } from "../core/audit.service";
import type { AppDb } from "../db/pool";
import { dashboardPins } from "../db/schema";
import { SemanticLayer } from "../semantic/semanticLayer";
import { PinsService } from "./pins.service";

test("creating and listing a pin returns no stored result table and no snapshot is written", async () => {
  const insertedTables: unknown[] = [];
  const row = pinRow(SELECTION);
  const service = new PinsService(pinDb(row, insertedTables), new SemanticLayer(), audit());

  const created = await service.create(USER, SESSION_ID, { selection: SELECTION });
  const [listed] = await service.list(USER, SESSION_ID);

  assert.deepEqual(insertedTables, [dashboardPins]);
  for (const pin of [created, listed]) {
    assert.deepEqual(pin.status, { runnable: true });
    assert.equal("result" in pin, false);
    assert.equal("snapshot" in pin, false);
    assert.equal("lastRefresh" in pin, false);
  }
});

test("a selection naming a measure the semantic layer no longer registers is reported rather than returned as runnable", async () => {
  const selection = { ...SELECTION, measureIds: ["governed-financial.retired"] };
  const refusals: unknown[] = [];
  const service = new PinsService(pinDb(pinRow(selection), []), new SemanticLayer(), audit(refusals));
  const user = {
    ...USER,
    permissions: { ...USER.permissions, measureIds: ["governed-financial.retired"] },
  };

  const [pin] = await service.list(user, SESSION_ID);

  assert.deepEqual(pin.selection, selection);
  assert.deepEqual(pin.status, {
    runnable: false,
    reason: "definition_unregistered",
    message: "This selection uses a definition that is no longer registered.",
  });
  assert.equal("result" in pin, false);
  assert.equal(refusals.length, 1);
});

function pinDb(row: ReturnType<typeof pinRow>, insertedTables: unknown[]): AppDb {
  return {
    insert: (table: unknown) => {
      insertedTables.push(table);
      return { values: () => ({ returning: async () => [row] }) };
    },
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: async () => [row] }),
      }),
    }),
  } as unknown as AppDb;
}

function audit(refusals: unknown[] = []): AuditService {
  return {
    async writeExplorationRequestEvent() {
      return 1;
    },
    async writeExplorationRefusalEvents(events: unknown[]) {
      refusals.push(...events);
    },
  } as unknown as AuditService;
}

function pinRow(selection: Selection) {
  return {
    id: "00000000-0000-0000-0000-000000000031",
    userId: USER.id,
    title: "Actual by month",
    selection,
    chartType: "bar",
    viewPrefs: null,
    definitionVersion: "",
    refreshCadence: null,
    lastRefresh: null,
    position: 0,
    createdAt: new Date("2026-09-12T00:00:00.000Z"),
  };
}

const SESSION_ID = "00000000-0000-0000-0000-000000000099";
const SELECTION: Selection = {
  domain: "governed-financial",
  measureIds: ["governed-financial.actual"],
  dimensionIds: ["month"],
  filters: [],
};
const USER: AuthUser = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["finance"],
  permissions: {
    actions: ["pin", "report"],
    domains: ["governed-financial"],
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["month"],
  },
  scope: [],
};
