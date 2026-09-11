import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, MisDrillRequest, ProvenanceBatch } from "@3f/contract";
import type { AuditService } from "../core/audit.service";
import type { ISelectionResolverService, MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import type {
  DrillBatch,
  DrillPredicate,
  DrillQueries,
  IDrillTransactionsRepository,
} from "../warehouse/drill-transactions.interface";
import type { IPinnedStatementOutlineRepository, StatementOutlineNode } from "../warehouse/statement-outline.interface";
import { AuditedDrillRefusalException } from "./mis-drill.interface";
import { MisDrillService } from "./mis-drill.service";
import type { IMisStatementDrillSupport, MisStatementBlockDefinition } from "./mis-statement.interface";

test("the drill resolves its leaf and triples server side rejecting a node key that is neither a snapshot leaf nor the reserved unmapped gl bucket", async () => {
  const fixture = makeFixture();
  await fixture.service.run(user, SESSION_ID, request());
  assert.deepEqual(fixture.transactions.predicates[0].triples, [TRIPLE]);

  const bucket = makeFixture();
  await bucket.service.run(user, SESSION_ID, { ...request(), nodeKey: "unmapped-GL" });
  assert.deepEqual(bucket.transactions.predicates[0].triples, [BUCKET_TRIPLE]);

  await assert.rejects(
    makeFixture().service.run(user, SESSION_ID, { ...request(), nodeKey: "parent-or-crafted-key" }),
    (error: unknown) => error instanceof AuditedDrillRefusalException && error.getStatus() === 400,
  );
});

test("the pinned batch set is refused when it does not cover every month in the block range and reports per batch status when a pinned batch is no longer active", async () => {
  const incomplete = makeFixture({ actualPeriods: ["2026-04-01", "2026-07-01"] });
  await assert.rejects(
    incomplete.service.run(user, SESSION_ID, { ...request(), block: "fy26-27-ytd" }),
    (error: unknown) => error instanceof AuditedDrillRefusalException && error.getStatus() === 409,
  );

  const replaced = makeFixture({ replacedActual: true });
  const response = await replaced.service.run(user, SESSION_ID, request());
  assert.deepEqual(
    response.batchStatuses.find(({ source }) => source === "actuals"),
    {
      source: ACTUAL.source,
      period: ACTUAL.period,
      requestedBatchId: ACTUAL.batchId,
      status: "replaced",
      activeBatchId: REPLACEMENT_ACTUAL.batchId,
    },
  );
  assert.deepEqual(response.actualBatchIds, [ACTUAL.batchId]);

  const gone = makeFixture({ goneActual: true });
  await assert.rejects(gone.service.run(user, SESSION_ID, request()), (error: unknown) => {
    assert.ok(error instanceof AuditedDrillRefusalException);
    assert.equal(error.getStatus(), 409);
    assert.deepEqual(error.getResponse(), {
      message: "A pinned batch is gone",
      batchStatuses: error.batchStatuses,
    });
    assert.deepEqual(
      error.batchStatuses.find(({ source }) => source === "actuals"),
      {
        source: ACTUAL.source,
        period: ACTUAL.period,
        requestedBatchId: ACTUAL.batchId,
        status: "gone",
        activeBatchId: REPLACEMENT_ACTUAL.batchId,
      },
    );
    return true;
  });
});

test("the drill takes its outline from the pinned budget batch whose period equals the block end rather than the currently active one", async () => {
  const fixture = makeFixture({ replacedBudget: true });
  const response = await fixture.service.run(user, SESSION_ID, request());

  assert.deepEqual(fixture.outlines.batchIds, [BUDGET.batchId]);
  assert.equal(response.leafKey, "leaf-a");
  assert.deepEqual(response.batchStatuses.find(({ source }) => source === "budget")?.status, "replaced");
});

test("a failing audit insert aborts the drill before any transaction query is issued", async () => {
  const fixture = makeFixture({ failAudit: true });
  await assert.rejects(fixture.service.run(user, SESSION_ID, request()), /audit unavailable/);
  assert.equal(fixture.transactions.executeCalls, 0);
});

function makeFixture(
  options: {
    actualPeriods?: string[];
    replacedActual?: boolean;
    replacedBudget?: boolean;
    goneActual?: boolean;
    failAudit?: boolean;
  } = {},
) {
  const transactions = new FakeTransactions(options);
  const outlines = new FakeOutlines();
  const audit = new FakeAudit(options.failAudit ?? false);
  const service = new MisDrillService(
    new FakeResolver(),
    new FakeStatements(),
    outlines,
    transactions,
    audit as unknown as AuditService,
  );
  return { service, transactions, outlines, audit };
}

class FakeResolver implements ISelectionResolverService {
  async options() {
    return { departments: [], functions: [], plants: [], periods: [] };
  }
  canonicalPlant(plant: string) {
    return plant;
  }
  async resolve(requestValue: MisDrillRequest): Promise<MasterResolvedSelection> {
    return {
      outcome: "resolved",
      department: requestValue.department,
      function: requestValue.function,
      plant: "DUB",
      costCentres: ["Primary", "Unknown"],
      glCodes: ["5001", "5999"],
      misFormat: "nursery-mis-financial-v1",
      bucketRows: [],
      triples: [TRIPLE, BUCKET_TRIPLE],
      leafTargets: [
        { ...TRIPLE, target: { kind: "leaf", leafKey: "leaf-a" } },
        { ...BUCKET_TRIPLE, target: { kind: "bucket" } },
      ],
      masterGlCodes: ["5001", "5999"],
      period: { value: requestValue.period, from: "2026-07-01", to: "2026-07-01" },
    };
  }
}

class FakeStatements implements IMisStatementDrillSupport {
  authorize() {
    return { domain: {} as never, selection: {} as never };
  }
  blocks(): MisStatementBlockDefinition[] {
    return [
      { key: "selected", label: "July", from: "2026-07-01", to: "2026-07-01" },
      { key: "fy26-27-ytd", label: "FY YTD", from: "2026-04-01", to: "2026-07-01" },
    ];
  }
}

class FakeOutlines implements IPinnedStatementOutlineRepository {
  batchIds: string[] = [];
  async findByBudgetPeriod(): Promise<StatementOutlineNode[]> {
    return this.rows();
  }
  async findByBudgetBatchId(batchId: string): Promise<StatementOutlineNode[]> {
    this.batchIds.push(batchId);
    return this.rows();
  }
  private rows(): StatementOutlineNode[] {
    return [
      {
        nodeKey: "parent",
        parentKey: null,
        depth: 0,
        sNo: "1",
        label: "Parent",
        sortOrder: 1,
        glCode: null,
        leafKey: null,
      },
      {
        nodeKey: "leaf-node",
        parentKey: "parent",
        depth: 1,
        sNo: "1.1",
        label: "Leaf",
        sortOrder: 2,
        glCode: "5001",
        leafKey: "leaf-a",
      },
    ];
  }
}

class FakeTransactions implements IDrillTransactionsRepository {
  predicates: DrillPredicate[] = [];
  executeCalls = 0;
  constructor(
    private readonly options: {
      actualPeriods?: string[];
      replacedActual?: boolean;
      replacedBudget?: boolean;
      goneActual?: boolean;
    },
  ) {}
  async findBatchesByIds(): Promise<DrillBatch[]> {
    return [
      ...(this.options.goneActual ? [] : [{ ...ACTUAL, isActive: !this.options.replacedActual }]),
      { ...BUDGET, isActive: !this.options.replacedBudget },
    ];
  }
  async findActiveBatches(): Promise<DrillBatch[]> {
    return [
      { ...(this.options.replacedActual || this.options.goneActual ? REPLACEMENT_ACTUAL : ACTUAL), isActive: true },
      { ...(this.options.replacedBudget ? REPLACEMENT_BUDGET : BUDGET), isActive: true },
    ];
  }
  async findActualPeriods() {
    return this.options.actualPeriods ?? ["2026-07-01"];
  }
  buildQueries(predicate: DrillPredicate): DrillQueries {
    this.predicates.push(predicate);
    return { pageSql: "SELECT page", footerSql: "SELECT footer", objectsTouched: ["sap_transaction", "ingest_batch"] };
  }
  async execute() {
    this.executeCalls += 1;
    return {
      lines: [],
      footer: { debit: "0.00" as const, credit: "0.00" as const, value: "0.00" as const },
      totalCount: 0,
    };
  }
}

class FakeAudit {
  requests: unknown[] = [];
  refusals: unknown[] = [];
  constructor(private readonly fail: boolean) {}
  async writeDrillEvent(event: unknown) {
    if (this.fail) throw new Error("audit unavailable");
    this.requests.push(event);
    return 1;
  }
  async writeDrillRefusalEvent(event: unknown) {
    this.refusals.push(event);
    return 1;
  }
}

function request(): MisDrillRequest {
  return {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    nodeKey: "leaf-node",
    block: "selected",
    pinnedBatches: [ACTUAL, BUDGET],
    page: 1,
  };
}

const TRIPLE = { plant: "DUB", costCenter: "Primary", glCode: "5001" };
const BUCKET_TRIPLE = { plant: "DUB", costCenter: "Unknown", glCode: "5999" };
const SESSION_ID = "00000000-0000-0000-0000-000000000099";
const ACTUAL: ProvenanceBatch = {
  source: "actuals",
  period: "2026-07-01",
  batchId: "00000000-0000-0000-0000-000000000001",
};
const BUDGET: ProvenanceBatch = {
  source: "budget",
  period: "2026-07-01",
  batchId: "00000000-0000-0000-0000-000000000002",
};
const REPLACEMENT_ACTUAL: ProvenanceBatch = { ...ACTUAL, batchId: "00000000-0000-0000-0000-000000000003" };
const REPLACEMENT_BUDGET: ProvenanceBatch = { ...BUDGET, batchId: "00000000-0000-0000-0000-000000000004" };

const user: AuthUser = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["finance"],
  permissions: { actions: ["report"], domains: ["mis-statement"], measureIds: [], dimensionIds: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};
