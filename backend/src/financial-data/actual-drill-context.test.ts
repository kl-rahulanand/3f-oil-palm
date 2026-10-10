import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, FinancialQueryResult, FinancialSelection } from "@3f/contract";
import type { Pool, QueryConfig } from "pg";
import type { QueryResult, Warehouse } from "../warehouse/warehouse.interface";
import { ActualDrillContextService, type ActualDrillCandidate } from "./actual-drill-context.service";
import { FinancialAccessService } from "./financial-access.service";
import { FinancialDataService } from "./financial-data.service";
import { FinancialQueryRepository } from "./financial-query.repository";

const HOUR_MS = 60 * 60 * 1_000;

test("done-when 4: 200 distinct Actual scopes fit, 201 narrows, and identical scopes share one handle", () => {
  const contexts = new ActualDrillContextService(() => 0);
  const accepted = Array.from({ length: 200 }, (_, index) => candidate(`cell-${index}`, `GL-${index}`));

  const handles = contexts.issue("reader", "result-200", accepted);
  assert.equal(new Set(handles.values()).size, 200);

  assert.throws(
    () => contexts.issue("reader", "result-201", [...accepted, candidate("cell-200", "GL-200")]),
    hasReason("query_too_broad"),
  );

  const tableCell = candidate("table-cell", "GL-SHARED");
  const filteredTotal = {
    ...candidate("chart-point", "GL-SHARED"),
    scope: { ...candidate("chart-point", "GL-SHARED").scope, cellIdentity: {} },
  };
  const duplicateHandles = contexts.issue("reader", "result-deduplicated", [tableCell, filteredTotal]);
  assert.equal(duplicateHandles.get("table-cell"), duplicateHandles.get("chart-point"));
});

test("done-when 3: drill reads recheck owner and expire after one idle hour", async () => {
  let now = 1_000;
  const contexts = new ActualDrillContextService(() => now);
  const rbac = new FakeRbac(user("reader", ["DUB"]));
  const service = serviceWith(contexts, rbac, candidate("temporary", "GL-1"));
  const result = await service.query("reader", selection(["DUB"]));
  const handle = actualHandle(result);

  const otherUser = new FakeRbac(user("other", ["DUB"]));
  const otherService = serviceWith(contexts, otherUser, candidate("unused", "GL-1"));
  await assert.rejects(otherService.resolveActualDrillScope("other", handle), hasReason("access_denied"));

  now += HOUR_MS - 1;
  assert.equal((await service.resolveActualDrillScope("reader", handle)).ownerId, "reader");
  now += HOUR_MS;
  await assert.rejects(service.resolveActualDrillScope("reader", handle), hasReason("drill_expired"));
});

test("done-when 3 and 4: revoking one Plant denies the whole pinned multi-Plant scope", async () => {
  const contexts = new ActualDrillContextService(() => 0);
  const rbac = new FakeRbac(user("reader", ["CHIR", "DUB"]));
  const pinned = candidate("temporary", "GL-1", ["CHIR", "DUB"]);
  const service = serviceWith(contexts, rbac, pinned);
  const result = await service.query("reader", selection(["CHIR", "DUB"]));

  rbac.current = user("reader", ["DUB"]);
  await assert.rejects(
    service.resolveActualDrillScope("reader", actualHandle(result)),
    hasReason("permission_changed"),
  );
});

test("done-when 4: a handle keeps its immutable source and mapping identity", () => {
  const contexts = new ActualDrillContextService(() => 0);
  const sourceBatchIds = ["batch-original"];
  const pinned: ActualDrillCandidate = {
    ...candidate("temporary", "GL-1", ["DUB"], sourceBatchIds),
    kind: "availableActualSubtotal",
  };
  const handle = contexts.issue("reader", "result-source", [pinned]).get("temporary");
  assert.ok(handle);

  sourceBatchIds[0] = "batch-replacement";
  const resolved = contexts.resolve("reader", handle, ["DUB"]);
  assert.deepEqual(resolved.scope.sourceBatchIds, ["batch-original"]);
  assert.equal(resolved.scope.mappingVersionId, "batch-original");
  assert.equal(resolved.scope.cellIdentity.gl, "GL-1");
  assert.equal(resolved.kind, "availableActualSubtotal");
  assert.equal(resolved.expectedMatchingActualTotal, "1.00");
});

test("done-when 4: a filtered parent total and its matching grouped row share one prepared scope", async () => {
  const contexts = new ActualDrillContextService(() => 0);
  const rbac = new FakeRbac(user("reader", ["DUB"]));
  const service = new FinancialDataService(
    new FinancialAccessService(rbac, new FakeAudit()),
    new FakeWarehouse(),
    new FinancialQueryRepository(parentComponentDatabase()),
    contexts,
  );
  const result = await service.query("reader", {
    ...selection(["DUB"]),
    dimensionIds: ["nursery_component"],
    filters: [{ dimensionId: "nursery_component", operator: "eq", value: "parent" }],
  });
  const parent = result.rows.find(({ dimensions }) => dimensions.nursery_component === "parent");

  assert.ok(parent);
  assert.equal(parent.values.actual?.state, "available");
  assert.equal(parent.values.actual.drilldownId, actualHandle(result));
});

function serviceWith(contexts: ActualDrillContextService, rbac: FakeRbac, drillCandidate: ActualDrillCandidate) {
  const selected = selection([...drillCandidate.scope.plantIds]);
  const queryResult = result(selected);
  return new FinancialDataService(
    new FinancialAccessService(rbac, new FakeAudit()),
    new FakeWarehouse(),
    {
      async queryWithDrillScopes() {
        return { result: structuredClone(queryResult), drillCandidates: [drillCandidate] };
      },
    },
    contexts,
  );
}

function candidate(
  provisionalId: string,
  gl: string,
  plantIds: string[] = ["DUB"],
  sourceBatchIds: string[] = ["batch-original"],
): ActualDrillCandidate {
  return {
    provisionalId,
    kind: "actual",
    expectedMatchingActualTotal: "1.00",
    scope: {
      sourceBatchIds,
      mappingVersionId: sourceBatchIds[0]!,
      plantIds,
      plantRecordIds: plantIds.map((plantId) => `${plantId}-record`),
      from: "2026-04-01",
      to: "2026-04-30",
      grouping: ["gl"],
      cellIdentity: { gl },
      filters: [{ dimensionId: "gl", operator: "eq", values: [gl] }],
      componentKeys: [],
    },
  };
}

function selection(plantIds: string[]): FinancialSelection {
  return {
    measureIds: ["actual"],
    dimensionIds: [],
    plantIds,
    timeWindow: { kind: "month", from: "2026-04-01", to: "2026-04-30" },
    filters: [],
  };
}

function result(selected: FinancialSelection): FinancialQueryResult {
  return {
    resultId: "result-1",
    selection: selected,
    scope: { plantIds: selected.plantIds, from: "2026-04-01", to: "2026-04-30" },
    rows: [],
    totals: { actual: { state: "available", value: "1.00", label: "Actual", drilldownId: "temporary" } },
    coverage: selected.plantIds.map((plantId) => ({
      plantId,
      month: "2026-04-01",
      actual: "complete",
      budget: "not_loaded",
    })),
  };
}

function actualHandle(queryResult: FinancialQueryResult): string {
  assert.equal(queryResult.totals.actual?.state, "available");
  return queryResult.totals.actual.drilldownId;
}

function hasReason(reason: string) {
  return (error: unknown) => {
    if (!error || typeof error !== "object" || !("getResponse" in error)) return false;
    const response = (error as { getResponse(): unknown }).getResponse();
    return (
      typeof response === "object" &&
      response !== null &&
      "details" in response &&
      (response as { details?: { reason?: string } }).details?.reason === reason
    );
  };
}

function user(id: string, plants: string[]): AuthUser {
  return {
    id,
    email: `${id}@example.invalid`,
    display_name: id,
    is_active: true,
    roles: ["reader"],
    permissions: {
      actions: ["report"],
      domains: ["mis-statement"],
      measureIds: [
        "mis-statement.actual_net",
        "mis-statement.budget_net",
        "mis-statement.rollover_net",
        "mis-statement.percentage",
      ],
      dimensionIds: ["leaf_key"],
    },
    scope: plants.map((value) => ({ attribute: "plant", value })),
  };
}

class FakeRbac {
  constructor(public current: AuthUser | null) {}

  async resolveUser(): Promise<AuthUser | null> {
    return this.current;
  }
}

class FakeAudit {
  async writeRequestEvent(): Promise<number> {
    return 1;
  }
}

class FakeWarehouse implements Warehouse {
  async execute(): Promise<QueryResult> {
    return { columns: [], rows: [] };
  }
  async explain(): Promise<void> {}
  async freshness(): Promise<string | null> {
    return null;
  }
  async distinctValues(): Promise<string[]> {
    return [];
  }
}

function parentComponentDatabase(): Pick<Pool, "query"> {
  return {
    query: async (input: string | QueryConfig) => {
      const sql = typeof input === "string" ? input : input.text;
      if (sql.includes("dataset_key = $1 AND state = 'active'")) return { rows: [{ id: "batch-id" }] };
      if (sql.includes("FROM agent_financial.plant")) return { rows: [{ id: "plant-id", code: "DUB" }] };
      if (sql.includes("WITH RECURSIVE descendants")) {
        return {
          rows: [
            { root_key: "parent", component_key: "leaf" },
            { root_key: "parent", component_key: "parent" },
          ],
        };
      }
      if (sql.includes("source_reporting_months::text[]")) {
        return {
          rows: [
            {
              id: "batch-id",
              source_reporting_months: ["2026-04-01"],
              actual_coverage: [{ plantId: "plant-id", month: "2026-04-01", completeness: "confirmed" }],
              budget_coverage: [],
            },
          ],
        };
      }
      if (sql.includes("FROM contributing_actuals")) return { rows: [{ id: "actual-id" }] };
      if (sql.includes("WHERE a.id = ANY")) {
        return {
          rows: [
            {
              id: "actual-id",
              plant: "DUB",
              month: "2026-04-01",
              gl: "5001",
              cost_center: "DUB-CC",
              nursery_component: "leaf",
              section: null,
              consideration: null,
              short_name: null,
              contra_account: null,
              origin: null,
              location: null,
              actual_amount: "1.00",
            },
          ],
        };
      }
      if (sql.includes("WITH RECURSIVE ancestry")) {
        return {
          rows: [
            { component_key: "leaf", ancestor_key: "leaf" },
            { component_key: "leaf", ancestor_key: "parent" },
            { component_key: "parent", ancestor_key: "parent" },
          ],
        };
      }
      throw new Error(`Unexpected financial repository query: ${sql}`);
    },
  } as unknown as Pick<Pool, "query">;
}
