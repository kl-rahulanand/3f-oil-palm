import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, Selection } from "@3f/contract";
import type { AuditService } from "../core/audit.service";
import type { AppDb } from "../db/pool";
import { SemanticLayer } from "../semantic/semanticLayer";
import { SavedService } from "./saved.service";

test("listing refuses a saved selection the caller may no longer run instead of dropping it or serving a cached figure", async () => {
  const refusals: unknown[] = [];
  const service = new SavedService(listDb(savedRow(SELECTION)), new SemanticLayer(), audit({ refusals }));

  const [saved] = await service.list({ ...USER, permissions: { ...USER.permissions, actions: ["save"] } }, SESSION_ID);

  assert.deepEqual(saved.selection, SELECTION);
  assert.deepEqual(saved.status, {
    runnable: false,
    reason: "grant_revoked",
    message: "You no longer have permission to run this selection.",
  });
  assert.equal("result" in saved, false);
  assert.equal("snapshot" in saved, false);
  assert.equal(refusals.length, 1);
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
  filters: [],
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
  scope: [],
};
