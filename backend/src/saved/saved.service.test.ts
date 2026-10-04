import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { MeasureFilterInvalidReason, type AuthUser, type Selection } from "@3f/contract";
import type { AuditService } from "../core/audit.service";
import type { AppDb } from "../db/pool";
import { SemanticLayer } from "../semantic/semanticLayer";
import { MeasureFilterInvalidException } from "../semantic/measure-filter-invalid.exception";
import { PlantFilterInvalidException } from "../semantic/plant-filter-invalid.exception";
import { SavedService } from "./saved.service";

test("listing refuses a saved selection the caller may no longer run instead of dropping it or serving a cached figure", async () => {
  const refusals: unknown[] = [];
  const service = new SavedService(listDb(savedRow(SELECTION)), new SemanticLayer(), audit({ refusals }));

  const [saved] = await service.list({ ...USER, scope: [] }, SESSION_ID);

  assert.deepEqual(saved.selection, SELECTION);
  assert.deepEqual(saved.status, {
    runnable: false,
    reason: "plants_revoked",
    message: "This view includes plants you no longer have access to: Agri - Nursery - DUB. Edit its plants to run it.",
  });
  assert.equal("result" in saved, false);
  assert.equal("snapshot" in saved, false);
  assert.equal(refusals.length, 1);
});

test("one-plant and several-plant readers cannot save a view without a plant filter", async () => {
  for (const scope of [USER.scope, [...USER.scope, { attribute: "plant", value: "CHIR" }]]) {
    let stored = false;
    const db = {
      insert() {
        stored = true;
        throw new Error("invalid view must not be stored");
      },
    } as unknown as AppDb;
    const service = new SavedService(db, new SemanticLayer(), audit({ refusals: [] }));

    await assert.rejects(
      () => service.create({ ...USER, scope }, SESSION_ID, { selection: { ...SELECTION, filters: [] } }),
      (error) => error instanceof PlantFilterInvalidException && error.reason === "plant-filter-invalid",
    );
    assert.equal(stored, false);
  }
});

test("saving canonical plant codes deduplicates and sorts the stored snapshot", async () => {
  let stored: Selection | undefined;
  const db = {
    insert: () => ({
      values: (value: { selection: Selection }) => ({
        returning: async () => {
          stored = value.selection;
          return [savedRow(value.selection)];
        },
      }),
    }),
  } as unknown as AppDb;
  const user = { ...USER, scope: [...USER.scope, { attribute: "plant", value: "CHIR" }] };

  await new SavedService(db, new SemanticLayer(), audit({ refusals: [] })).create(user, SESSION_ID, {
    selection: {
      ...SELECTION,
      filters: [{ dimensionId: "plant", op: "in", value: ["DUB", "CHIR", "DUB"] }],
    },
  });

  assert.deepEqual(stored?.filters, [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }]);
});

test("saving an invalid, duplicate, non-canonical or ungranted plant filter stores nothing and returns the typed reason", async () => {
  const cases: Array<{ filters: Selection["filters"]; reason: "plant-filter-invalid" | "plant-not-granted" }> = [
    { filters: [{ dimensionId: "plant", op: "eq", value: "DUB" }], reason: "plant-filter-invalid" },
    {
      filters: [
        { dimensionId: "plant", op: "in", value: ["DUB"] },
        { dimensionId: "plant", op: "in", value: ["CHIR"] },
      ],
      reason: "plant-filter-invalid",
    },
    { filters: [{ dimensionId: "plant", op: "in", value: ["dub"] }], reason: "plant-filter-invalid" },
    { filters: [{ dimensionId: "plant", op: "in", value: ["CHIR"] }], reason: "plant-not-granted" },
  ];

  for (const testCase of cases) {
    let stored = false;
    const db = {
      insert() {
        stored = true;
        throw new Error("invalid view must not be stored");
      },
    } as unknown as AppDb;

    await assert.rejects(
      () =>
        new SavedService(db, new SemanticLayer(), audit({ refusals: [] })).create(USER, SESSION_ID, {
          selection: { ...SELECTION, filters: testCase.filters },
        }),
      (error) => error instanceof PlantFilterInvalidException && error.reason === testCase.reason,
    );
    assert.equal(stored, false);
  }
});

test("an all-plants saved view remains the stored snapshot when the reader gains another plant", async () => {
  const snapshot: Selection = {
    ...SELECTION,
    filters: [{ dimensionId: "plant", op: "in", value: ["CHIR", "DUB"] }],
  };
  const user = {
    ...USER,
    scope: [...USER.scope, { attribute: "plant", value: "CHIR" }, { attribute: "plant", value: "CK" }],
  };

  const [saved] = await new SavedService(listDb(savedRow(snapshot)), new SemanticLayer(), audit({ refusals: [] })).list(
    user,
    SESSION_ID,
  );

  assert.deepEqual(saved.selection.filters, snapshot.filters);
  assert.deepEqual(saved.status, { runnable: true });
});

test("a failing audit insert aborts a saved query write before it happens", async () => {
  let databaseTouched = false;
  const db = {
    insert() {
      databaseTouched = true;
      throw new Error("database write should not run");
    },
  } as unknown as AppDb;
  const failingAudit = {
    async writeExplorationRequestEvent() {
      throw new Error("audit unavailable");
    },
  } as unknown as AuditService;
  const service = new SavedService(db, new SemanticLayer(), failingAudit);

  await assert.rejects(() => service.create(USER, SESSION_ID, { selection: SELECTION }), /audit unavailable/);
  assert.equal(databaseTouched, false);
});

test("creating a saved query reports and audits its current refusal status before writing", async () => {
  const order: string[] = [];
  const row = savedRow(SELECTION);
  const db = {
    insert: () => ({
      values: () => ({
        returning: async () => {
          order.push("write");
          return [row];
        },
      }),
    }),
  } as unknown as AppDb;
  const trackingAudit = {
    async writeExplorationRequestEvent() {
      order.push("request");
      return 1;
    },
    async writeExplorationRefusalEvent() {
      order.push("refusal");
      return 2;
    },
  } as unknown as AuditService;
  const service = new SavedService(db, new SemanticLayer(), trackingAudit);

  const saved = await service.create({ ...USER, permissions: { ...USER.permissions, actions: ["save"] } }, SESSION_ID, {
    selection: SELECTION,
  });

  assert.deepEqual(saved.status, {
    runnable: false,
    reason: "grant_revoked",
    message: "You no longer have permission to run this selection.",
  });
  assert.deepEqual(order, ["request", "refusal", "write"]);
});

test("saved query store refuses a bad measure filter with its reason canonicalises a good one and reports an unregistered operand as definition unregistered on reopen", async () => {
  const semantic = new SemanticLayer();
  const badService = new SavedService({} as AppDb, semantic, audit({ refusals: [] }));
  await assert.rejects(
    () =>
      badService.create(USER, SESSION_ID, {
        selection: { ...SELECTION, measureFilters: [valueFilter("1.234")] },
      }),
    (error) =>
      error instanceof MeasureFilterInvalidException && error.reason === MeasureFilterInvalidReason.MalformedValue,
  );

  let stored: Selection | undefined;
  const db = {
    insert: () => ({
      values: (value: { selection: Selection }) => ({
        returning: async () => {
          stored = value.selection;
          return [savedRow(value.selection)];
        },
      }),
    }),
  } as unknown as AppDb;
  const permitted = {
    ...USER,
    permissions: {
      ...USER.permissions,
      measureIds: ["governed-financial.actual", "governed-financial.budget"],
    },
  };
  const good = await new SavedService(db, semantic, audit({ refusals: [] })).create(permitted, SESSION_ID, {
    selection: {
      ...SELECTION,
      measureFilters: [
        {
          measureId: "governed-financial.actual",
          op: "gt",
          compareTo: { kind: "measure", measureId: "governed-financial.budget" },
        },
      ],
    },
  });
  assert.deepEqual(stored?.measureIds, ["governed-financial.actual", "governed-financial.budget"]);
  assert.deepEqual(good.selection, stored);

  const unavailable: Selection = {
    ...SELECTION,
    measureFilters: [
      {
        measureId: "governed-financial.actual",
        op: "gt",
        compareTo: { kind: "measure", measureId: "governed-financial.retired" },
      },
    ],
  };
  const [reopened] = await new SavedService(listDb(savedRow(unavailable)), semantic, audit({ refusals: [] })).list(
    {
      ...permitted,
      permissions: {
        ...permitted.permissions,
        measureIds: [...permitted.permissions.measureIds, "governed-financial.retired"],
      },
    },
    SESSION_ID,
  );
  assert.deepEqual(reopened.selection, unavailable);
  assert.deepEqual(reopened.status, {
    runnable: false,
    reason: "definition_unregistered",
    message: "This selection uses a definition that is no longer registered.",
  });
});

function valueFilter(value: string) {
  return {
    measureId: "governed-financial.actual",
    op: "gt" as const,
    compareTo: { kind: "value" as const, value },
  };
}

function listDb(row: ReturnType<typeof savedRow>): AppDb {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: async () => [row] }),
      }),
    }),
  } as unknown as AppDb;
}

function audit({ refusals }: { refusals: unknown[] }): AuditService {
  return {
    async writeExplorationRequestEvent() {
      return 1;
    },
    async writeExplorationRefusalEvents(events: unknown[]) {
      refusals.push(...events);
    },
  } as unknown as AuditService;
}

function savedRow(selection: Selection) {
  return {
    id: "00000000-0000-0000-0000-000000000021",
    userId: USER.id,
    selection,
    chartType: "bar",
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
    actions: ["save", "report"],
    domains: ["governed-financial"],
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["month"],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};
