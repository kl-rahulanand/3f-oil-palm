import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, FinancialSelection } from "@3f/contract";
import type { AuditService } from "../core/audit.service";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { FinancialAccessService } from "./financial-access.service";
import { FinancialDataService } from "./financial-data.service";

const REQUIRED_MEASURES = [
  "mis-statement.actual_net",
  "mis-statement.budget_net",
  "mis-statement.rollover_net",
  "mis-statement.percentage",
];

test("catalog denies a user without current report permission", async () => {
  const rbac = new FakeRbac(user({ actions: [] }));
  const audit = new FakeAudit();
  const warehouse = new FakeWarehouse([]);
  const service = new FinancialDataService(new FinancialAccessService(rbac, audit), warehouse);

  await rejectsWithReason(service.getCatalog("reader"), "access_denied");
  assert.equal(warehouse.reads, 0);
  assert.equal(audit.events[0]?.question, "Financial catalog access refused: access_denied");
});

test("catalog guides a user who has report permission but no Plant grants", async () => {
  const audit = new FakeAudit();
  const warehouse = new FakeWarehouse([]);
  const service = new FinancialDataService(
    new FinancialAccessService(new FakeRbac(user({ scope: [] })), audit),
    warehouse,
  );

  await rejectsWithReason(service.getCatalog("reader"), "no_plant_access");
  assert.equal(warehouse.reads, 0);
  assert.equal(audit.events[0]?.question, "Financial catalog access refused: no_plant_access");
});

test("catalog rechecks permissions and denies a grant revoked after an earlier read", async () => {
  const rbac = new FakeRbac(user());
  const audit = new FakeAudit();
  const service = new FinancialDataService(new FinancialAccessService(rbac, audit), new FakeWarehouse([]));

  assert.equal((await service.getCatalog("reader")).fiscalYearStartMonth, 4);
  rbac.current = user({ actions: [] });
  await rejectsWithReason(service.getCatalog("reader"), "access_denied");
  assert.deepEqual(
    audit.events.map(({ question }) => question),
    ["Financial catalog access authorized", "Financial catalog access refused: access_denied"],
  );
});

test("dimension lookup returns only current Plant-scoped matches", async () => {
  const rbac = new FakeRbac(user());
  const audit = new FakeAudit();
  const warehouse = new FakeWarehouse([
    { plant_code: "DUB", value: "5001", label: "DUB Fertilizer", aliases: '["Fertilizer"]' },
    { plant_code: "CHIR", value: "5002", label: "CHIR Fertilizer", aliases: '["Fertilizer"]' },
    { plant_code: null, value: "9999", label: "Unknown Plant", aliases: "[]" },
  ]);
  const service = new FinancialDataService(new FinancialAccessService(rbac, audit), warehouse);

  assert.deepEqual(await service.findValues("reader", "gl", "fert"), [
    { dimensionId: "gl", value: "5001", label: "DUB Fertilizer", aliases: ["Fertilizer"] },
  ]);

  rbac.current = user({ scope: [{ attribute: "plant", value: "CHIR" }] });
  assert.deepEqual(await service.findValues("reader", "gl", "fert"), [
    { dimensionId: "gl", value: "5002", label: "CHIR Fertilizer", aliases: ["Fertilizer"] },
  ]);
});

test("selection validation rejects Budget grouped by Cost Center", async () => {
  const service = new FinancialDataService(
    new FinancialAccessService(new FakeRbac(user()), new FakeAudit()),
    new FakeWarehouse([]),
  );

  await rejectsWithReason(
    service.assertSelectionSupported("reader", selection({ measureIds: ["budget"], dimensionIds: ["cost_center"] })),
    "unsupported_selection",
  );
});

test("financial access audits actor, nonfinancial scope, opaque references and failure without prompt, amount or row payload", async () => {
  const rbac = new FakeRbac(user());
  const audit = new FakeAudit();
  const warehouse = new FakeWarehouse([
    {
      plant_code: "DUB",
      value: "DUB",
      label: "what did we spend transaction-row 123.45 drilldown-handle",
      aliases: "[]",
    },
  ]);
  const service = new FinancialDataService(new FinancialAccessService(rbac, audit), warehouse);

  assert.equal((await service.findValues("reader", "plant", "what did we spend")).length, 1);
  rbac.current = user({ domains: [] });
  await rejectsWithReason(service.getCatalog("reader"), "access_denied");

  assert.equal(audit.events[0]?.userId, "reader");
  assert.deepEqual(audit.events[0]?.selection?.filters, [{ dimensionId: "plant", op: "in", value: ["DUB"] }]);
  assert.deepEqual(audit.events[0]?.objectsTouched, ["dimension:plant"]);
  assert.deepEqual(audit.events[1]?.objectsTouched, ["financial-catalog:v1", "failure:access_denied"]);

  const serialized = JSON.stringify(audit.events);
  for (const forbidden of ["what did we spend", "123.45", "transaction-row", "drilldown-handle"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("audit failure prevents vocabulary reads", async () => {
  const audit = new FakeAudit();
  audit.fail = true;
  const warehouse = new FakeWarehouse([{ plant_code: "DUB", value: "DUB", label: "DUB", aliases: "[]" }]);
  const service = new FinancialDataService(new FinancialAccessService(new FakeRbac(user()), audit), warehouse);

  await rejectsWithReason(service.findValues("reader", "plant", "dub"), "data_unavailable");
  assert.equal(warehouse.reads, 0);
});

function selection(overrides: Partial<FinancialSelection> = {}): FinancialSelection {
  return {
    measureIds: ["actual"],
    dimensionIds: [],
    plantIds: ["DUB"],
    timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
    filters: [],
    ...overrides,
  };
}

function user(
  overrides: {
    actions?: string[];
    domains?: string[];
    measureIds?: string[];
    dimensionIds?: string[];
    scope?: AuthUser["scope"];
  } = {},
): AuthUser {
  return {
    id: "reader",
    email: "reader@example.invalid",
    display_name: "Reader",
    is_active: true,
    roles: ["reader"],
    permissions: {
      actions: overrides.actions ?? ["report"],
      domains: overrides.domains ?? ["mis-statement"],
      measureIds: overrides.measureIds ?? REQUIRED_MEASURES,
      dimensionIds: overrides.dimensionIds ?? ["leaf_key"],
    },
    scope: overrides.scope ?? [{ attribute: "plant", value: "DUB" }],
  };
}

async function rejectsWithReason(promise: Promise<unknown>, reason: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    if (!error || typeof error !== "object" || !("getResponse" in error)) return false;
    const response = (error as { getResponse(): unknown }).getResponse();
    return (
      typeof response === "object" &&
      response !== null &&
      "details" in response &&
      (response as { details?: { reason?: string } }).details?.reason === reason
    );
  });
}

class FakeRbac {
  constructor(public current: AuthUser | null) {}

  async resolveUser(): Promise<AuthUser | null> {
    return this.current;
  }
}

class FakeAudit {
  events: Array<Parameters<AuditService["writeRequestEvent"]>[0]> = [];
  fail = false;

  async writeRequestEvent(event: Parameters<AuditService["writeRequestEvent"]>[0]): Promise<number> {
    if (this.fail) throw new Error("audit unavailable");
    this.events.push(structuredClone(event));
    return this.events.length;
  }
}

class FakeWarehouse implements Warehouse {
  reads = 0;

  constructor(private readonly values: Array<Record<string, string | null>>) {}

  async execute(): Promise<QueryResult> {
    this.reads += 1;
    return { columns: [], rows: this.values };
  }

  async explain(): Promise<void> {}
  async freshness(): Promise<string | null> {
    return null;
  }
  async distinctValues(): Promise<string[]> {
    return [];
  }
}
