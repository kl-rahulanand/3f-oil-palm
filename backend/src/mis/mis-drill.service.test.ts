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
  const bucketOutcome = await bucket.service.run(user, SESSION_ID, { ...request(), nodeKey: "unmapped-GL" });
  assert.deepEqual(bucket.transactions.predicates[0].triples, [BUCKET_TRIPLE]);
  assert.equal(bucketOutcome.outcome, "ok");
  if (bucketOutcome.outcome === "ok") {
    assert.deepEqual(bucketOutcome.response.rollup[0], {
      plant: "DUB",
      costCentre: "Unknown",
      glCode: "5999",
      bucket: "unmapped-GL",
      mappingTarget: { kind: "bucket" },
      provisional: true,
      reason: "GL absent from Mapping Master",
    });
  }

  assert.equal(
    (await makeFixture().service.run(user, SESSION_ID, { ...request(), nodeKey: "parent-or-crafted-key" })).outcome,
    "refused",
  );
});

test("the pinned batch set is refused when it does not cover every month in the block range and reports per batch status when a pinned batch is no longer active", async () => {
  const incomplete = makeFixture({ actualPeriods: ["2026-04-01", "2026-07-01"] });
  assert.equal(
    (await incomplete.service.run(user, SESSION_ID, { ...request(), block: "fy26-27-ytd" })).outcome,
    "refused",
  );

  const replaced = makeFixture({ replacedActual: true });
  const response = await replaced.service.run(user, SESSION_ID, request());
  assert.equal(response.outcome, "replaced");
  if (response.outcome !== "replaced") return;
  assert.deepEqual(
    response.response.batchStatuses.find(({ source }) => source === "actuals"),
    {
      source: ACTUAL.source,
      period: ACTUAL.period,
      requestedBatchId: ACTUAL.batchId,
      status: "replaced",
      activeBatchId: REPLACEMENT_ACTUAL.batchId,
    },
  );
  assert.deepEqual(response.response.actualBatchIds, [ACTUAL.batchId]);

  const gone = makeFixture({ goneActual: true });
  const goneOutcome = await gone.service.run(user, SESSION_ID, request());
  assert.equal(goneOutcome.outcome, "gone");
  if (goneOutcome.outcome === "gone") {
    assert.deepEqual(
      goneOutcome.batchStatuses.find(({ source }) => source === "actuals"),
      {
        source: ACTUAL.source,
        period: ACTUAL.period,
        requestedBatchId: ACTUAL.batchId,
        status: "gone",
        activeBatchId: REPLACEMENT_ACTUAL.batchId,
      },
    );
  }
});

test("the drill takes its outline from the pinned budget batch whose period equals the block end rather than the currently active one", async () => {
  const fixture = makeFixture({ replacedBudget: true });
  const response = await fixture.service.run(user, SESSION_ID, request());

  assert.deepEqual(fixture.outlines.batchIds, [BUDGET.batchId]);
  assert.equal(response.outcome, "replaced");
  if (response.outcome !== "replaced") return;
  assert.equal(response.response.leafKey, "leaf-a");
  assert.deepEqual(response.response.batchStatuses.find(({ source }) => source === "budget")?.status, "replaced");
});

test("a failing audit insert aborts the drill before any transaction query is issued", async () => {
  const fixture = makeFixture({ failAudit: true });
  assert.equal((await fixture.service.run(user, SESSION_ID, request())).outcome, "audit-failed");
  assert.equal(fixture.transactions.executeCalls, 0);
});

test("the extracted seam returns a typed replaced outcome instead of throwing and the drill controller still maps it to its shipped response", async () => {
  const fixture = makeFixture({ replacedActual: true });
  const outcome = await fixture.service.run(user, SESSION_ID, request());
  assert.equal(outcome.outcome, "replaced");
  if (outcome.outcome === "replaced") {
    assert.equal(outcome.response.batchStatuses[0]?.status, "replaced");
    assert.equal(outcome.response.footer.value, "5.01");
  }
});

test("the assistant asks the seam for twenty rows while the drill panel keeps its hundred row page", async () => {
  const fixture = makeFixture();
  const prepared = await fixture.service.prepare(user, request());
  assert.equal(prepared.outcome, "prepared");
  if (prepared.outcome !== "prepared") return;
  await fixture.service.read(user, SESSION_ID, prepared.context, 20);
  await fixture.service.run(user, SESSION_ID, request());
  assert.deepEqual(fixture.transactions.limits, [20, 100]);
});

test("the statement drill response passes document number cost centre and account name through unchanged", async () => {
  const fixture = makeFixture();
  const outcome = await fixture.service.run(user, SESSION_ID, request());

  assert.equal(outcome.outcome, "ok");
  if (outcome.outcome !== "ok") return;
  assert.deepEqual(outcome.response.lines[0], TRANSACTION_LINE);
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
      plantDisplay: "Agri - Nursery - DUB",
      provisional: false,
      budgetOwnerPlant: "DUB",
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
  limits: number[] = [];
  executeCalls = 0;
  constructor(
    private readonly options: {
      actualPeriods?: string[];
      replacedActual?: boolean;
      replacedBudget?: boolean;
      goneActual?: boolean;
    },
  ) {}
  async findBatchStates(): Promise<DrillBatch[]> {
    return [
      ...(this.options.goneActual ? [] : [{ ...ACTUAL, isActive: !this.options.replacedActual }]),
      { ...BUDGET, isActive: !this.options.replacedBudget },
      { ...(this.options.replacedActual || this.options.goneActual ? REPLACEMENT_ACTUAL : ACTUAL), isActive: true },
      { ...(this.options.replacedBudget ? REPLACEMENT_BUDGET : BUDGET), isActive: true },
    ];
  }
  async findActualPeriods() {
    return this.options.actualPeriods ?? ["2026-07-01"];
  }
  buildQueries(predicate: DrillPredicate, _page: number, rowLimit: number): DrillQueries {
    this.predicates.push(predicate);
    this.limits.push(rowLimit);
    return { pageSql: "SELECT page", footerSql: "SELECT footer", objectsTouched: ["sap_transaction", "ingest_batch"] };
  }
  async execute() {
    this.executeCalls += 1;
    return {
      lines: [TRANSACTION_LINE],
      footer: { debit: "5.01" as const, credit: "0.00" as const, value: "5.01" as const },
      totalCount: 1,
    };
  }
  async summarize() {
    return [];
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
const TRANSACTION_LINE = {
  month: "2026-07-01",
  postingDate: "2026-07-02",
  txnNo: "1900001234",
  costCenter: "DUB-NUR",
  accountName: "Sprout Cost - Imp",
  debit: "5.01" as const,
  credit: "0.00" as const,
  value: "5.01" as const,
  reference: "REF-1",
  memo: "Diesel",
};

const user: AuthUser = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["finance"],
  permissions: { actions: ["report"], domains: ["mis-statement"], measureIds: [], dimensionIds: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};
