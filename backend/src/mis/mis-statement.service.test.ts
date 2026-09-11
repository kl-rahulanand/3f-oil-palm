import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser, MisSelectionRunRequest, ProvenanceBatch, SourcePresence } from "@3f/contract";
import type { SelectionExecutor } from "../chat/selectionExecutor";
import { loadConfig } from "../config";
import type { ISelectionResolverService, MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import { SemanticLayer } from "../semantic/semanticLayer";
import type { IStatementOutlineRepository, StatementOutlineNode } from "../warehouse/statement-outline.interface";
import { MisStatementService } from "./mis-statement.service";

test("the statement service builds the tree from the outline of the budget batch for the selected period with every parent derived from its leaves and the grand total footing in outline order", async () => {
  const { service, executor, outlines } = fixture();
  const response = await service.run(user, request("2026-07-01"));

  assert.equal(response.outcome, "resolved");
  if (response.outcome !== "resolved") return;
  assert.deepEqual(outlines.periods, ["2026-07-01"]);
  assert.deepEqual(
    response.tree.map(({ nodeKey }) => nodeKey),
    ["materials", "admin"],
  );
  assert.deepEqual(
    response.tree[1].children.map(({ nodeKey }) => nodeKey),
    ["vehicle"],
  );
  assert.deepEqual(
    response.tree[1].children[0].children.map(({ nodeKey }) => nodeKey),
    ["diesel", "repairs"],
  );
  assert.deepEqual(response.tree[1].measures[0], {
    key: "selected",
    label: "2026-07-01",
    from: "2026-07-01",
    to: "2026-07-01",
    budget: "30.30",
    rollover: null,
    actual: "15.15",
    percentage: "0.5",
    sourcePresence: ["matched"],
  });
  assert.deepEqual(
    response.grandTotal.measures.map(({ budget, actual, percentage }) => ({ budget, actual, percentage })),
    [
      { budget: "50.50", actual: "25.25", percentage: "0.5" },
      { budget: "101.00", actual: "50.50", percentage: "0.5" },
    ],
  );
  assert.equal(executor.calls.length, 2);
  assert.deepEqual(executor.includeTotals, [false, false]);
});

test("the statement returns both the selected month and the financial year to date blocks but a single block when the selected period is itself the financial year to date", async () => {
  const month = fixture();
  const monthResponse = await month.service.run(user, request("2026-07-01"));
  assert.equal(monthResponse.outcome, "resolved");
  if (monthResponse.outcome !== "resolved") return;
  assert.deepEqual(
    monthResponse.grandTotal.measures.map(({ key }) => key),
    ["selected", "fy26-27-ytd"],
  );
  assert.deepEqual(
    month.executor.calls.map(({ from, to }) => ({ from, to })),
    [
      { from: "2026-07-01", to: "2026-07-01" },
      { from: "2026-04-01", to: "2026-07-01" },
    ],
  );

  const ytd = fixture();
  const ytdResponse = await ytd.service.run(user, request("fy26-27-ytd"));
  assert.equal(ytdResponse.outcome, "resolved");
  if (ytdResponse.outcome !== "resolved") return;
  assert.deepEqual(
    ytdResponse.grandTotal.measures.map(({ key }) => key),
    ["fy26-27-ytd"],
  );
  assert.deepEqual(ytd.executor.calls, [{ from: "2026-04-01", to: "2026-07-01" }]);

  const fyStart = fixture();
  const fyStartResponse = await fyStart.service.run(user, request("2026-04-01"));
  assert.equal(fyStartResponse.outcome, "resolved");
  if (fyStartResponse.outcome !== "resolved") return;
  assert.deepEqual(
    fyStartResponse.grandTotal.measures.map(({ key }) => key),
    ["selected"],
  );
  assert.deepEqual(fyStart.executor.calls, [{ from: "2026-04-01", to: "2026-04-01" }]);
});

test("the unmapped GL line is present with its own actual and zero budget counted in the grand total and the response carries per row source presence with the contributing batch ids", async () => {
  const actualBatch: ProvenanceBatch = {
    source: "actuals",
    period: "2026-07-01",
    batchId: "00000000-0000-0000-0000-000000000001",
  };
  const budgetBatch: ProvenanceBatch = {
    source: "budget",
    period: "2026-07-01",
    batchId: "00000000-0000-0000-0000-000000000002",
  };
  const { service } = fixture({ includeUnmapped: true, activeBatchIds: [actualBatch, budgetBatch] });
  const response = await service.run(user, request("fy26-27-ytd"));

  assert.equal(response.outcome, "resolved");
  if (response.outcome !== "resolved") return;
  const unmapped = response.tree.at(-1);
  assert.equal(unmapped?.nodeKey, "unmapped-GL");
  assert.deepEqual(unmapped?.measures[0], {
    key: "fy26-27-ytd",
    label: "FY 26-27 YTD",
    from: "2026-04-01",
    to: "2026-07-01",
    budget: "0.00",
    rollover: null,
    actual: "3.33",
    percentage: "over-budget",
    sourcePresence: ["actual-only"],
  });
  assert.deepEqual(
    response.grandTotal.measures.map(({ budget, actual }) => ({ budget, actual })),
    [{ budget: "101.00", actual: "53.83" }],
  );
  assert.deepEqual(response.provenance.activeBatchIds, [actualBatch, budgetBatch]);
});

test("the statement fails closed when the governed projection reaches its configured row limit", async () => {
  const { service } = fixture({ rowCount: loadConfig().maxRows });

  await assert.rejects(service.run(user, request("fy26-27-ytd")), /exceeded the configured row limit/);
});

test("a zero-budget parent derives its percentage label from its aggregate actual", async () => {
  const { service } = fixture({ mixedZeroBudget: true });
  const response = await service.run(user, request("fy26-27-ytd"));

  assert.equal(response.outcome, "resolved");
  if (response.outcome !== "resolved") return;
  assert.equal(response.tree[1].measures[0].actual, "-10.00");
  assert.equal(response.tree[1].measures[0].percentage, "credit / negative actual");
});

function fixture(
  options: {
    includeUnmapped?: boolean;
    activeBatchIds?: ProvenanceBatch[];
    rowCount?: number;
    mixedZeroBudget?: boolean;
  } = {},
) {
  const resolver = new FakeResolver();
  const executor = new FakeExecutor(
    options.includeUnmapped ?? false,
    options.activeBatchIds ?? [],
    options.rowCount,
    options.mixedZeroBudget ?? false,
  );
  const outlines = new FakeOutlines();
  const service = new MisStatementService(
    resolver,
    new SemanticLayer(),
    executor as unknown as SelectionExecutor,
    outlines,
  );
  return { service, executor, outlines };
}

class FakeResolver implements ISelectionResolverService {
  async options() {
    return { departments: [], functions: [], plants: [], periods: [] };
  }

  canonicalPlant(plant: string): string | undefined {
    return plant;
  }

  async resolve(request: MisSelectionRunRequest): Promise<MasterResolvedSelection> {
    return {
      outcome: "resolved",
      department: request.department,
      function: request.function,
      plant: request.plant,
      costCentres: ["Primary"],
      glCodes: ["5001", "5002", "5003"],
      misFormat: "nursery-mis-financial-v1",
      bucketRows: [],
      triples: [{ plant: "DUB", costCenter: "Primary", glCode: "5001" }],
      leafTargets: [
        {
          plant: "DUB",
          costCenter: "Primary",
          glCode: "5001",
          target: { kind: "leaf", leafKey: "shade" },
        },
      ],
      masterGlCodes: ["5001", "5002", "5003"],
      period: {
        value: request.period,
        from: request.period === "fy26-27-ytd" ? "2026-04-01" : request.period,
        to: request.period === "fy26-27-ytd" ? "2026-07-01" : request.period,
      },
    };
  }
}

class FakeExecutor {
  calls: Array<{ from: string; to: string }> = [];
  includeTotals: Array<boolean | undefined> = [];

  constructor(
    private readonly includeUnmapped: boolean,
    private readonly activeBatchIds: ProvenanceBatch[],
    private readonly rowCount?: number,
    private readonly mixedZeroBudget = false,
  ) {}

  authorize(): void {}

  async run(
    _user: AuthUser,
    _domain: unknown,
    selection: { timeWindow?: { from: string; to: string } },
    options: { includeTotals?: boolean } = {},
  ) {
    const from = selection.timeWindow?.from ?? "";
    const to = selection.timeWindow?.to ?? "";
    this.calls.push({ from, to });
    this.includeTotals.push(options.includeTotals);
    const ytd = from === "2026-04-01";
    let rows: Array<Record<string, string | number | null>> = [
      {
        leaf_key: "shade",
        actual_net: ytd ? "20.20" : "10.10",
        budget_net: ytd ? "40.40" : "20.20",
        percentage: "0.5",
      },
      {
        leaf_key: "diesel",
        actual_net: ytd ? "20.20" : "10.10",
        budget_net: ytd ? "40.40" : "20.20",
        percentage: "0.5",
      },
      {
        leaf_key: "repairs",
        actual_net: ytd ? "10.10" : "5.05",
        budget_net: ytd ? "20.20" : "10.10",
        percentage: "0.5",
      },
    ];
    if (this.mixedZeroBudget) {
      rows = [
        { leaf_key: "shade", actual_net: "0.00", budget_net: "0.00", percentage: null },
        { leaf_key: "diesel", actual_net: "10.00", budget_net: "0.00", percentage: "over-budget" },
        {
          leaf_key: "repairs",
          actual_net: "-20.00",
          budget_net: "0.00",
          percentage: "credit / negative actual",
        },
      ];
    }
    const rowSourcePresence: SourcePresence[] = ["matched", "matched", "matched"];
    if (this.includeUnmapped) {
      rows.push({
        leaf_key: "unmapped-GL",
        actual_net: "3.33",
        budget_net: "0.00",
        percentage: "over-budget",
      });
      rowSourcePresence.push("actual-only");
    }
    if (this.rowCount !== undefined) {
      rows = Array.from({ length: this.rowCount }, (_, index) => ({
        leaf_key: `leaf-${index}`,
        actual_net: "0.00",
        budget_net: "0.00",
        percentage: null,
      }));
    }
    return {
      result: { columns: [], rows },
      rowSourcePresence: this.rowCount === undefined ? rowSourcePresence : Array(this.rowCount).fill("matched"),
      activeBatchIds: this.activeBatchIds,
    };
  }
}

class FakeOutlines implements IStatementOutlineRepository {
  periods: string[] = [];

  async findByBudgetPeriod(period: string): Promise<StatementOutlineNode[]> {
    this.periods.push(period);
    return [
      node("materials", null, 0, "4", "Materials", 1),
      node("shade", "materials", 1, "4.1", "Shade Net", 2, "5001", "shade"),
      node("admin", null, 0, "9", "Admin", 3),
      node("vehicle", "admin", 1, "9.1", "Vehicle", 4),
      node("diesel", "vehicle", 2, null, "Diesel", 5, "5002", "diesel"),
      node("repairs", "vehicle", 2, null, "Repairs", 6, "5003", "repairs"),
    ];
  }
}

function node(
  nodeKey: string,
  parentKey: string | null,
  depth: number,
  sNo: string | null,
  label: string,
  sortOrder: number,
  glCode: string | null = null,
  leafKey: string | null = null,
): StatementOutlineNode {
  return { nodeKey, parentKey, depth, sNo, label, sortOrder, glCode, leafKey };
}

function request(period: string): MisSelectionRunRequest {
  return { department: "Agriculture", function: "Nursery", plant: "DUB", period };
}

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: {
    actions: ["report"],
    domains: ["mis-statement"],
    measureIds: [
      "mis-statement.actual_net",
      "mis-statement.budget_net",
      "mis-statement.rollover_net",
      "mis-statement.percentage",
    ],
    dimensionIds: ["leaf_key", "month"],
  },
  scope: [{ attribute: "plant", value: "DUB" }],
};
