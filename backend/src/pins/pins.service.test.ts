import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, Selection } from "@3f/contract";
import type { AuditService } from "../core/audit.service";
import type { AppDb } from "../db/pool";
import { dashboardPins } from "../db/schema";
import { computeDefinitionVersion } from "../semantic/definitionVersion";
import { SemanticLayer } from "../semantic/semanticLayer";
import { PlantFilterInvalidException } from "../semantic/plant-filter-invalid.exception";
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

test("one-plant and several-plant readers cannot pin a selection without a plant filter", async () => {
  for (const scope of [USER.scope, [...USER.scope, { attribute: "plant", value: "CHIR" }]]) {
    let stored = false;
    const db = {
      insert() {
        stored = true;
        throw new Error("invalid pin must not be stored");
      },
    } as unknown as AppDb;

    await assert.rejects(
      () =>
        new PinsService(db, new SemanticLayer(), audit()).create({ ...USER, scope }, SESSION_ID, {
          selection: { ...SELECTION, filters: [] },
        }),
      (error) => error instanceof PlantFilterInvalidException && error.reason === "plant-filter-invalid",
    );
    assert.equal(stored, false);
  }
});

test("pinning canonical plant codes deduplicates and sorts the stored snapshot", async () => {
  let stored: Selection | undefined;
  const db = {
    insert: () => ({
      values: (value: { selection: Selection }) => ({
        returning: async () => {
          stored = value.selection;
          return [pinRow(value.selection)];
        },
      }),
    }),
  } as unknown as AppDb;
  const user = { ...USER, scope: [...USER.scope, { attribute: "plant", value: "CHIR" }] };

  await new PinsService(db, new SemanticLayer(), audit()).create(user, SESSION_ID, {
    selection: {
      ...SELECTION,
      filters: [{ dimensionId: "plant", op: "in", value: ["DUB", "CHIR", "DUB"] }],
    },
  });

  assert.deepEqual(stored?.filters, [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }]);
});

test("pinning an invalid, duplicate, non-canonical or ungranted plant filter stores nothing and returns the typed reason", async () => {
  const cases: Array<{ filters: Selection["filters"]; reason: "plant-filter-invalid" | "plant-not-granted" }> = [
    { filters: [{ dimensionId: "plant", op: "eq", value: "DUB" }], reason: "plant-filter-invalid" },
    {
      filters: [
        { dimensionId: "plant", op: "in", value: ["DUB"] },
        { dimensionId: "plant", op: "in", value: ["CHIR"] },
      ],
      reason: "plant-filter-invalid",
    },
    { filters: [{ dimensionId: "plant", op: "in", value: ["DUB-NUR"] }], reason: "plant-filter-invalid" },
    { filters: [{ dimensionId: "plant", op: "in", value: ["CHIR"] }], reason: "plant-not-granted" },
  ];

  for (const testCase of cases) {
    let stored = false;
    const db = {
      insert() {
        stored = true;
        throw new Error("invalid pin must not be stored");
      },
    } as unknown as AppDb;

    await assert.rejects(
      () =>
        new PinsService(db, new SemanticLayer(), audit()).create(USER, SESSION_ID, {
          selection: { ...SELECTION, filters: testCase.filters },
        }),
      (error) => error instanceof PlantFilterInvalidException && error.reason === testCase.reason,
    );
    assert.equal(stored, false);
  }
});

test("a revoked plant disables a pin by name while later grants do not expand its stored snapshot", async () => {
  const snapshot: Selection = {
    ...SELECTION,
    filters: [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }],
  };
  const service = new PinsService(pinDb(pinRow(snapshot), []), new SemanticLayer(), audit());

  const [revoked] = await service.list(USER, SESSION_ID);
  assert.deepEqual(revoked.selection.filters, snapshot.filters);
  assert.deepEqual(revoked.status, {
    runnable: false,
    reason: "plants_revoked",
    message:
      "This view includes plants you no longer have access to: Agriculture - Nursery - CHIR. Edit its plants to run it.",
  });

  const [expanded] = await service.list(
    {
      ...USER,
      scope: [...USER.scope, { attribute: "plant", value: "CHIR" }, { attribute: "plant", value: "CK" }],
    },
    SESSION_ID,
  );
  assert.deepEqual(expanded.selection.filters, snapshot.filters);
  assert.deepEqual(expanded.status, { runnable: true });
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

test("a pin without the current row scope is refused before a view update can commit", async () => {
  let updated = false;
  const row = pinRow(SELECTION);
  const db = {
    select: () => ({ from: () => ({ where: async () => [row] }) }),
    update() {
      updated = true;
      throw new Error("update should not run");
    },
  } as unknown as AppDb;
  const failingAudit = {
    async writeExplorationRequestEvent() {
      return 1;
    },
    async writeExplorationRefusalEvent() {
      throw new Error("audit unavailable");
    },
  } as unknown as AuditService;
  const service = new PinsService(db, new SemanticLayer(), failingAudit);

  await assert.rejects(
    () => service.updateView({ ...USER, scope: [] }, SESSION_ID, row.id, { chartType: "line" }),
    /audit unavailable/,
  );
  assert.equal(updated, false);
});

test("a pin refusal is audited before a reorder can commit", async () => {
  let transactionStarted = false;
  const row = pinRow(SELECTION);
  const db = {
    select: () => ({ from: () => ({ where: async () => [row] }) }),
    async transaction() {
      transactionStarted = true;
      throw new Error("transaction should not run");
    },
  } as unknown as AppDb;
  const failingAudit = {
    async writeExplorationRequestEvent() {
      return 1;
    },
    async writeExplorationRefusalEvents(events: unknown[]) {
      assert.deepEqual(events, [
        {
          actorId: USER.id,
          sessionId: SESSION_ID,
          resource: "pins",
          action: "reorder",
          submitted: { id: row.id, reason: "plants_revoked" },
        },
      ]);
      throw new Error("audit unavailable");
    },
  } as unknown as AuditService;
  const service = new PinsService(db, new SemanticLayer(), failingAudit);

  await assert.rejects(() => service.reorder({ ...USER, scope: [] }, SESSION_ID, [row.id]), /audit unavailable/);
  assert.equal(transactionStarted, false);
});

test("pin runnable status and the definition version hash cover the operand measures", async () => {
  const semantic = new SemanticLayer();
  const filtered: Selection = {
    ...SELECTION,
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.budget" },
      },
    ],
  };
  const permitted = {
    ...USER,
    permissions: {
      ...USER.permissions,
      measureIds: ["governed-financial.actual", "governed-financial.budget"],
    },
  };
  let written: { selection: Selection; definitionVersion: string } | undefined;
  const createDb = {
    insert: () => ({
      values: (value: { selection: Selection; definitionVersion: string }) => ({
        returning: async () => {
          written = value;
          return [{ ...pinRow(value.selection), definitionVersion: value.definitionVersion }];
        },
      }),
    }),
  } as unknown as AppDb;
  await new PinsService(createDb, semantic, audit()).create(permitted, SESSION_ID, { selection: filtered });
  assert.deepEqual(written?.selection.measureIds, ["governed-financial.actual", "governed-financial.budget"]);
  assert.equal(
    written?.definitionVersion,
    computeDefinitionVersion([
      semantic.measure(filtered.domain, "governed-financial.actual")!,
      semantic.measure(filtered.domain, "governed-financial.budget")!,
    ]),
  );

  const staleRow = {
    ...pinRow(filtered),
    definitionVersion: computeDefinitionVersion([semantic.measure(filtered.domain, "governed-financial.actual")!]),
  };
  const [revoked] = await new PinsService(pinDb(staleRow, []), semantic, audit()).list(USER, SESSION_ID);
  assert.deepEqual(revoked.status, {
    runnable: false,
    reason: "grant_revoked",
    message: "You no longer have permission to run this selection.",
  });
  const [permittedPin] = await new PinsService(pinDb(staleRow, []), semantic, audit()).list(permitted, SESSION_ID);
  assert.equal(permittedPin.definitionChanged, true);
  assert.deepEqual(permittedPin.selection.measureIds, ["governed-financial.actual", "governed-financial.budget"]);
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
  filters: [{ dimensionId: "plant", op: "in", value: ["DUB"] }],
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
  scope: [{ attribute: "plant", value: "DUB" }],
};
