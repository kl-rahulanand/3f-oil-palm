import assert from "node:assert/strict";
import { test } from "node:test";
import type { AskStatementGrounding, AuthUser, MisDrillBatchStatus } from "@3f/contract";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import type { IMisDrillService, MisDrillPreparationOutcome, VerifiedDrillContext } from "../mis/mis-drill.interface";
import { StatementAttestationService } from "../mis/statement-attestation";
import type { StatementOutlineNode } from "../warehouse/statement-outline.interface";
import { StatementGroundingService } from "./statement-grounding.service";

const attestation = new StatementAttestationService(["secret"], 30, () => 1_000_000);
const outline: StatementOutlineNode[] = [
  {
    nodeKey: "leaf",
    parentKey: null,
    depth: 0,
    sNo: "1",
    label: "Leaf",
    sortOrder: 1,
    glCode: "5001",
    leafKey: "leaf",
  },
];
const metadata = [{ nodeKey: "leaf", glCodes: ["5001"], costCentres: ["Primary"] }];
const amounts = [
  { nodeKey: "leaf", block: "selected" as const, actualPaise: "10001" },
  { nodeKey: "leaf", block: "fy26-27-ytd" as const, actualPaise: "20002" },
];
const pins = [
  { source: "actuals" as const, period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000001" },
  { source: "budget" as const, period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000002" },
];
const context = attestation.issue({
  department: "Agriculture",
  function: "Nursery",
  plant: "DUB",
  period: "2026-07-01",
  outline,
  blocks: ["selected", "fy26-27-ytd"],
  nodeMetadata: metadata,
  nodeAmounts: amounts,
  pinnedBatches: pins,
  mappingMasterVersion: MAPPING_MASTER.version,
  userId: "user-1",
});
const grounding: AskStatementGrounding = {
  attestedContext: context,
  department: "Agriculture",
  function: "Nursery",
  focus: { nodeKey: "leaf", block: "selected", subject: "actual" },
  nodeMetadata: metadata,
  nodeAmounts: amounts,
};

test("a re read outline that differs from the attested one is refused on the digest mismatch", async () => {
  const different = [{ ...outline[0]!, nodeKey: "different", leafKey: "different" }];
  assert.deepEqual(await fixture({ outline: different }).service.verify(user, grounding), {
    outcome: "refused",
    reason: "outline-mismatch",
  });
});

test("pinned batch existence and the active batch are read in one query so a stale row cannot override the active one", async () => {
  const replaced: MisDrillBatchStatus[] = [
    {
      source: "actuals",
      period: "2026-07-01",
      requestedBatchId: pins[0]!.batchId,
      status: "replaced",
      activeBatchId: "replacement",
    },
    {
      source: "budget",
      period: "2026-07-01",
      requestedBatchId: pins[1]!.batchId,
      status: "current",
      activeBatchId: pins[1]!.batchId,
    },
  ];
  const target = fixture({ batchStatuses: replaced });
  const result = await target.service.verify(user, grounding);
  assert.equal(target.drills.prepareCalls, 1);
  assert.equal(result.outcome, "verified");
  if (result.outcome === "verified") {
    assert.deepEqual(result.context.batchStatuses, replaced);
    assert.equal(result.context.focusedActualPaise, "10001");
  }
});

test("a node or block absent from the re read pinned outline is refused with its own typed reason", async () => {
  const target = fixture().service;
  assert.deepEqual(await target.verify(user, { ...grounding, focus: { ...grounding.focus!, nodeKey: "missing" } }), {
    outcome: "refused",
    reason: "node-not-in-outline",
  });
  assert.deepEqual(
    await target.verify(user, { ...grounding, focus: { ...grounding.focus!, block: "missing" as never } }),
    {
      outcome: "refused",
      reason: "block-not-in-outline",
    },
  );
});

test("a gone batch is carried as a typed grounding outcome while a selection mismatch is refused", async () => {
  const gone = fixture({ outcome: "gone" });
  assert.equal((await gone.service.verify(user, grounding)).outcome, "gone");
  assert.deepEqual(await fixture().service.verify(user, { ...grounding, department: "Finance" }), {
    outcome: "refused",
    reason: "selection-mismatch",
  });
});

test("a pinned batch source or period mismatch keeps the pinned batch invalid refusal reason", async () => {
  assert.deepEqual(
    await fixture({ refusedMessage: "A pinned batch has the wrong source or period" }).service.verify(user, grounding),
    {
      outcome: "refused",
      reason: "pinned-batch-invalid",
    },
  );
});

function fixture(
  options: {
    outline?: StatementOutlineNode[];
    batchStatuses?: MisDrillBatchStatus[];
    outcome?: "gone";
    refusedMessage?: string;
  } = {},
) {
  const drills = new FakeDrills(options);
  return { service: new StatementGroundingService(attestation, drills), drills };
}

class FakeDrills implements IMisDrillService {
  prepareCalls = 0;
  constructor(
    private readonly options: {
      outline?: StatementOutlineNode[];
      batchStatuses?: MisDrillBatchStatus[];
      outcome?: "gone";
      refusedMessage?: string;
    },
  ) {}
  async prepare(
    _user: AuthUser,
    request: Parameters<IMisDrillService["prepare"]>[1],
  ): Promise<MisDrillPreparationOutcome> {
    this.prepareCalls += 1;
    if (this.options.outcome === "gone") {
      return { outcome: "gone", status: 409, message: "gone", batchStatuses: [] };
    }
    if (this.options.refusedMessage) {
      return { outcome: "refused", status: 400, message: this.options.refusedMessage, batchStatuses: [] };
    }
    return { outcome: "prepared", context: prepared(request, this.options.outline, this.options.batchStatuses) };
  }
  async read(): Promise<never> {
    throw new Error("not used");
  }
  async run(): Promise<never> {
    throw new Error("not used");
  }
}

function prepared(
  request: Parameters<IMisDrillService["prepare"]>[1],
  reread = outline,
  batchStatuses: MisDrillBatchStatus[] = pins.map((pin) => ({
    source: pin.source,
    period: pin.period,
    requestedBatchId: pin.batchId,
    status: "current",
    activeBatchId: pin.batchId,
  })),
): VerifiedDrillContext {
  const normalized =
    "nodeKey" in request ? { ...request, focus: { nodeKey: request.nodeKey, block: request.block } } : request;
  return {
    request: normalized,
    resolution: {
      outcome: "resolved",
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      plantDisplay: "DUB",
      provisional: false,
      budgetOwnerPlant: "DUB",
      costCentres: ["Primary"],
      glCodes: ["5001"],
      misFormat: "nursery-mis-financial-v1",
      bucketRows: [],
      triples: [],
      leafTargets: [],
      masterGlCodes: ["5001"],
      period: { value: "2026-07-01", from: "2026-07-01", to: "2026-07-01" },
    },
    outline: reread,
    batchStatuses,
    actuals: [pins[0]!],
    budget: pins[1]!,
    range: { from: "2026-07-01", to: "2026-07-01" },
    focusExists: true,
    leafKey: "leaf",
    budgetState: "loaded",
  };
}

const user: AuthUser = {
  id: "user-1",
  email: "finance@example.com",
  display_name: "Finance",
  is_active: true,
  roles: ["admin"],
  permissions: { actions: ["report"], domains: ["mis-statement"], measureIds: [], dimensionIds: [] },
  scope: [{ attribute: "plant", value: "DUB" }],
};
