import assert from "node:assert/strict";
import { test } from "node:test";
import { ResponseClass, type AskStatementGrounding, type AuthUser, type MisSelectionRunRequest } from "@3f/contract";
import { ChatService } from "./chat.service";
import { StatementGroundingService } from "./statement-grounding.service";
import type { ISelectionResolverService, MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import type { IDrillTransactionsRepository, DrillBatch } from "../warehouse/drill-transactions.interface";
import type { IPinnedStatementOutlineRepository, StatementOutlineNode } from "../warehouse/statement-outline.interface";
import { StatementAttestationService } from "../mis/statement-attestation";
import { MAPPING_MASTER } from "../mapping/mapping-master";

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
  pinnedBatches: pins,
  mappingMasterVersion: MAPPING_MASTER.version,
  userId: "user-1",
});
const grounding: AskStatementGrounding = {
  attestedContext: context,
  department: "Agriculture",
  function: "Nursery",
  nodeKey: "leaf",
  block: "selected",
  nodeMetadata: metadata,
};

test("a node or block absent from the re read pinned outline is refused with its own typed reason", async () => {
  const service = fixture();
  assert.deepEqual(await service.verify(user, { ...grounding, nodeKey: "missing" }), {
    outcome: "refused",
    reason: "node-not-in-outline",
  });
  assert.deepEqual(await service.verify(user, { ...grounding, block: "missing" }), {
    outcome: "refused",
    reason: "block-not-in-outline",
  });
});

test("a plant outside the users current grants is refused and a pinned batch that does not validate is refused", async () => {
  assert.deepEqual(await fixture().verify({ ...user, scope: [] }, grounding), {
    outcome: "refused",
    reason: "plant-not-authorized",
  });
  assert.deepEqual(await fixture({ batches: [] }).verify(user, grounding), {
    outcome: "refused",
    reason: "pinned-batch-invalid",
  });
});

test("a department or function disagreeing with the master selection is a typed refusal not a silent substitution and not a no mapping answer", async () => {
  assert.deepEqual(await fixture().verify(user, { ...grounding, department: "Finance" }), {
    outcome: "refused",
    reason: "selection-mismatch",
  });
  assert.deepEqual(await fixture().verify(user, { ...grounding, function: "Accounts" }), {
    outcome: "refused",
    reason: "selection-mismatch",
  });
});

test("a verified grounded request does not fall through into the llm path", async () => {
  let llmCalls = 0;
  const audit = { writeRequestEvent: async () => undefined, writeResultEvent: async () => undefined };
  const service = new ChatService(
    {} as never,
    {} as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      select: async () => {
        llmCalls += 1;
        throw new Error("LLM must not run");
      },
    } as never,
    fixture(),
  );
  const response = await service.ask(
    user,
    "session-1",
    "How is this built?",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    grounding,
  );

  assert.equal(llmCalls, 0);
  assert.equal(response.responseClass, ResponseClass.NotSupported);
  assert.deepEqual(response.statementGrounding, { outcome: "verified-but-unanswered" });
});

function fixture(options: { batches?: DrillBatch[] } = {}): StatementGroundingService {
  return new StatementGroundingService(
    attestation,
    new Resolver(),
    {
      findByBudgetPeriod: async () => outline,
      findByBudgetBatchId: async () => outline,
    } as IPinnedStatementOutlineRepository,
    {
      findBatchesByIds: async () => options.batches ?? pins.map((pin) => ({ ...pin, isActive: true })),
    } as unknown as IDrillTransactionsRepository,
  );
}

class Resolver implements ISelectionResolverService {
  async options() {
    return { departments: [], functions: [], plants: [], periods: [] };
  }
  canonicalPlant(plant: string) {
    return plant;
  }
  async resolve(request: MisSelectionRunRequest): Promise<MasterResolvedSelection> {
    return {
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
      period: { value: request.period, from: "2026-07-01", to: "2026-07-01" },
    };
  }
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
