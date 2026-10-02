import assert from "node:assert/strict";
import { test } from "node:test";
import type { AskStatementGrounding, AuthUser, StatementGroundingResponse, StatementRollupEntry } from "@3f/contract";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import type { IMisDrillService, MisDrillOutcome, VerifiedDrillContext } from "../mis/mis-drill.interface";
import { StatementAttestationService } from "../mis/statement-attestation";
import type { StatementGroundingVerification } from "./statement-grounding.service";
import { StatementGroundingService } from "./statement-grounding.service";
import { ChatService } from "./chat.service";
import { StatementExplanationService } from "./statement-explanation.service";

test("a gone batch is refused while a replaced but present batch is read and reported", async () => {
  const gone = fixture({ verification: { outcome: "gone", batchStatuses: [goneStatus] } });
  assert.equal(responseOf(await gone.service.explain(user, "session", "how is this built", grounding)).outcome, "gone");
  const replaced = fixture({ read: { outcome: "replaced", response: readResponse() } });
  assert.equal(
    responseOf(await replaced.service.explain(user, "session", "how is this built", grounding)).outcome,
    "replaced",
  );
});

test("a failed audit returns a safe typed refusal and never runs the query", async () => {
  const target = fixture({ read: { outcome: "audit-failed", status: 503, message: "internal audit detail" } });
  const result = await target.service.explain(user, "session", "how is this built", grounding);
  assert.deepEqual(responseOf(result), {
    outcome: "audit-failure",
    message: "The explanation could not be safely audited.",
  });
  assert.equal(JSON.stringify(result).includes("internal audit detail"), false);
});

test("a leaf explanation foots in paise against the statement payload and reports the true total count with twenty rows", async () => {
  const lines = Array.from({ length: 20 }, (_, index) => ({
    month: "2026-07-01",
    postingDate: "2026-07-01",
    txnNo: `190000${String(index).padStart(4, "0")}`,
    costCenter: "DUB-NUR",
    accountName: "Sprout Cost - Imp",
    debit: "5.00" as const,
    credit: "0.00" as const,
    value: "5.00" as const,
    reference: String(index),
    memo: null,
  }));
  const mismatch = fixture({
    verification: { outcome: "verified", context: { ...verifiedContext, focusedActualPaise: "10000" } },
    read: {
      outcome: "ok",
      response: readResponse({ footer: { debit: "100.01", credit: "0.00", value: "100.01" } }),
    },
  });
  assert.deepEqual(responseOf(await mismatch.service.explain(user, "session", "how is this 100", grounding)), {
    outcome: "refused",
    reason: "footing-mismatch",
  });

  const target = fixture({
    read: {
      outcome: "ok",
      response: readResponse({ lines, totalCount: 37, footer: { debit: "100.01", credit: "0.00", value: "100.01" } }),
    },
  });
  const response = responseOf(await target.service.explain(user, "session", "how is this 100", grounding));
  assert.equal(response?.outcome, "leaf");
  if (response?.outcome === "leaf") {
    assert.equal(response.transactions.footer.value, "100.01");
    assert.equal(response.transactions.totalCount, 37);
    assert.equal(response.transactions.lines.length, 20);
    assert.equal(response.transactions.pageSize, 20);
  }
});

test("a leaf explanation names the gl codes and cost centres the master folds into that leaf", async () => {
  const response = responseOf(await fixture().service.explain(user, "session", "what makes up this", grounding));
  if (response?.outcome !== "leaf") assert.fail("expected leaf");
  assert.deepEqual(
    response.rollup.map(({ glCode, costCentre, bucket }) => ({ glCode, costCentre, bucket })),
    [{ glCode: "5001", costCentre: "Primary", bucket: "Sprout cost" }],
  );
});

test("a crafted budget focus is refused by the backend", async () => {
  const target = fixture();
  const response = await target.service.explain(user, "session", "why did this change", {
    ...grounding,
    focus: { ...grounding.focus!, subject: "budget" },
  });
  assert.deepEqual(responseOf(response), { outcome: "refused", reason: "budget-subject-not-supported" });
  assert.equal(target.grounding.verifyCalls, 0);
  assert.equal(target.drills.readCalls, 0);
});

test("a non owner plant carries budgetState not loaded distinct from a replaced or gone batch", async () => {
  const target = fixture({
    context: { ...verifiedContext, budgetState: "not-loaded" },
    read: { outcome: "ok", response: readResponse({ budgetState: "not-loaded" }) },
  });
  const response = responseOf(await target.service.explain(user, "session", "break down this amount", grounding));
  assert.equal(response?.outcome, "leaf");
  if (response?.outcome === "leaf") assert.equal(response.budgetState, "not-loaded");
});

test("no server sourced row amount batch id or measure value appears in the provider payload while the users own question may carry a figure", async () => {
  const target = fixture();
  const providerInputs: unknown[] = [];
  const response = await chat(target.service, providerInputs).ask(
    user,
    "session",
    "how is this 85000",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    grounding,
  );
  assert.equal(response.statementGrounding?.outcome, "leaf");
  assert.deepEqual(providerInputs, []);
  assert.equal(
    response.statementGrounding?.outcome === "leaf" && response.statementGrounding.transactions.footer.value,
    "100.01",
  );
});

test("a grounded question with no focused node returns the focus required variant from the server", async () => {
  const target = fixture({
    context: { ...verifiedContext, request: { ...verifiedContext.request, focus: undefined }, leafKey: null },
  });
  assert.deepEqual(
    responseOf(await target.service.explain(user, "session", "how is this built", { ...grounding, focus: undefined })),
    { outcome: "focus-required" },
  );
});

test("a grounded data question falls through to the ungrounded path with no pin or budget promise attached", async () => {
  const target = fixture();
  const providerInputs: unknown[] = [];
  await chat(target.service, providerInputs).ask(
    user,
    "session",
    "show actual by GL",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    grounding,
  );
  assert.equal(JSON.stringify(providerInputs).includes("server-batch-id"), false);
  assert.equal(JSON.stringify(providerInputs).includes("server-budget-id"), false);
  assert.equal(target.grounding.verifyCalls, 0);
  assert.equal(target.drills.readCalls, 0);
});

test("a crafted budget subject is refused before the read seam is reached", async () => {
  const target = fixture();
  await target.service.explain(user, "session", "what makes up this", {
    ...grounding,
    focus: { ...grounding.focus!, subject: "budget" },
  });
  assert.equal(target.drills.readCalls, 0);
});

test("the replaced outcome carries the full leaf explanation and a notice naming the source and period", async () => {
  const target = fixture({
    context: { ...verifiedContext, batchStatuses: [replacedStatus] },
    read: { outcome: "replaced", response: readResponse({ batchStatuses: [replacedStatus] }) },
  });
  const response = responseOf(await target.service.explain(user, "session", "how is this built", grounding));
  assert.equal(response?.outcome, "replaced");
  if (response?.outcome === "replaced") {
    assert.match(response.notice, /actuals.*2026-07-01/i);
    assert.equal(response.transactions.footer.value, "100.01");
    assert.equal(response.rollup[0]?.glCode, "5001");
  }
});

test("an unmapped gl line is described as provisional with its reason", async () => {
  const provisional: StatementRollupEntry = {
    ...rollup[0]!,
    mappingTarget: { kind: "bucket" },
    bucket: "unmapped-GL",
    provisional: true,
    reason: "No approved mapping",
  };
  const target = fixture({ read: { outcome: "ok", response: readResponse({ rollup: [provisional] }) } });
  const response = responseOf(await target.service.explain(user, "session", "how is this built", grounding));
  if (response?.outcome !== "leaf") assert.fail("expected leaf");
  assert.deepEqual(response.rollup[0], provisional);
});

test("an attested unmapped gl focus reaches the provisional explanation end to end", async () => {
  const provisional: StatementRollupEntry = {
    ...rollup[0]!,
    mappingTarget: { kind: "bucket" },
    bucket: "unmapped-GL",
    provisional: true,
    reason: "GL absent from Mapping Master",
  };
  const attestation = new StatementAttestationService(["secret"], 30, () => 1_000_000);
  const nodeMetadata = [{ nodeKey: "unmapped-GL", glCodes: ["5001"], costCentres: ["Primary"] }];
  const nodeAmounts = [{ nodeKey: "unmapped-GL", block: "selected" as const, actualPaise: "10001" }];
  const request: AskStatementGrounding = {
    attestedContext: attestation.issue({
      department: "Agriculture",
      function: "Nursery",
      plant: "DUB",
      period: "2026-07-01",
      outline: [],
      blocks: ["selected", "fy26-27-ytd"],
      nodeMetadata,
      nodeAmounts,
      pinnedBatches: [],
      mappingMasterVersion: MAPPING_MASTER.version,
      userId: user.id,
    }),
    department: "Agriculture",
    function: "Nursery",
    focus: { nodeKey: "unmapped-GL", block: "selected", subject: "actual" },
    nodeMetadata,
    nodeAmounts,
  };
  const context: VerifiedDrillContext = {
    ...verifiedContext,
    request: { ...verifiedContext.request, focus: { nodeKey: "unmapped-GL", block: "selected" } },
    leafKey: "unmapped-GL",
    outline: [],
  };
  const drills = {
    prepare: async () => ({ outcome: "prepared" as const, context }),
    read: async () => ({
      outcome: "ok" as const,
      response: readResponse({ nodeKey: "unmapped-GL", leafKey: "unmapped-GL", rollup: [provisional] }),
    }),
  };
  const service = new StatementExplanationService(
    new StatementGroundingService(attestation, drills as never),
    drills as never,
  );

  const response = responseOf(await service.explain(user, "session", "how is this built", request));
  if (response.outcome !== "leaf") assert.fail(`expected leaf, received ${response.outcome}`);
  assert.deepEqual(response.rollup, [provisional]);
});

test("the audit record names the mapping master version", async () => {
  const target = fixture();
  await target.service.explain(user, "session", "how is this built", grounding);
  assert.equal(target.drills.mappingMasterVersionAudited, true);
});

function fixture(
  options: {
    verification?: StatementGroundingVerification;
    context?: VerifiedDrillContext;
    read?: MisDrillOutcome;
  } = {},
) {
  const drills = new FakeDrills(options.read ?? { outcome: "ok", response: readResponse() });
  const groundingService = new FakeGrounding(
    options.verification ?? { outcome: "verified", context: options.context ?? verifiedContext },
  );
  return {
    service: new StatementExplanationService(groundingService as never, drills as never),
    drills,
    grounding: groundingService,
  };
}

function chat(explanation: StatementExplanationService, providerInputs: unknown[]): ChatService {
  return new ChatService(
    { allowedFor: () => [{ name: "test", label: "Test", measures: [], dimensions: [] }] } as never,
    {} as never,
    { writeRequestEvent: async () => 1, writeResultEvent: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      select: async (input: unknown) => {
        providerInputs.push(input);
        return { kind: "no_tool_block", reason: "done" };
      },
    } as never,
    explanation,
  );
}

class FakeGrounding {
  verifyCalls = 0;
  constructor(private readonly result: StatementGroundingVerification) {}
  async verify() {
    this.verifyCalls += 1;
    return this.result;
  }
}

class FakeDrills implements Partial<IMisDrillService> {
  readCalls = 0;
  mappingMasterVersionAudited = true;
  constructor(private readonly result: MisDrillOutcome) {}
  async read() {
    this.readCalls += 1;
    return this.result;
  }
}

function readResponse(overrides: Partial<Extract<MisDrillOutcome, { outcome: "ok" }>["response"]> = {}) {
  return {
    nodeKey: "leaf",
    leafKey: "leaf",
    lines: [],
    footer: { debit: "100.01" as const, credit: "0.00" as const, value: "100.01" as const },
    totalCount: 1,
    page: 1,
    pageSize: 20,
    actualBatchIds: ["server-batch-id"],
    budgetBatchId: "server-budget-id",
    batchStatuses: [],
    rollup,
    budgetState: "loaded" as const,
    ...overrides,
  };
}

const rollup: StatementRollupEntry[] = [
  {
    plant: "DUB",
    costCentre: "Primary",
    glCode: "5001",
    bucket: "Sprout cost",
    mappingTarget: { kind: "leaf", leafKey: "leaf" },
    provisional: false,
    reason: null,
  },
];
const replacedStatus = {
  source: "actuals" as const,
  period: "2026-07-01",
  requestedBatchId: "old",
  status: "replaced" as const,
  activeBatchId: "new",
};
const goneStatus = { ...replacedStatus, status: "gone" as const, activeBatchId: null };
const verifiedContext = {
  request: {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    pinnedBatches: [],
    focus: { nodeKey: "leaf", block: "selected" as const },
    page: 1,
  },
  resolution: {
    outcome: "resolved" as const,
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    plantDisplay: "DUB",
    provisional: false,
    budgetOwnerPlant: "DUB",
    costCentres: [],
    glCodes: [],
    misFormat: "nursery-mis-financial-v1",
    bucketRows: [],
    triples: [],
    leafTargets: [],
    masterGlCodes: [],
    period: { value: "2026-07-01", from: "2026-07-01", to: "2026-07-01" },
  },
  outline: [],
  batchStatuses: [],
  actuals: [],
  budget: { source: "budget" as const, period: "2026-07-01", batchId: "budget" },
  range: { from: "2026-07-01", to: "2026-07-01" },
  focusExists: true,
  leafKey: "leaf",
  budgetState: "loaded" as const,
  focusedActualPaise: "10001",
} satisfies VerifiedDrillContext;
const grounding: AskStatementGrounding = {
  attestedContext: "claims.signature",
  department: "Agriculture",
  function: "Nursery",
  focus: { nodeKey: "leaf", block: "selected", subject: "actual" },
  nodeMetadata: [],
  nodeAmounts: [{ nodeKey: "leaf", block: "selected", actualPaise: "10001" }],
};
const user = { id: "user", scope: [] } as unknown as AuthUser;

function responseOf(decision: Awaited<ReturnType<StatementExplanationService["explain"]>>): StatementGroundingResponse {
  if (decision.kind !== "response") throw new Error(`expected response, received ${decision.kind}`);
  return decision.response;
}
