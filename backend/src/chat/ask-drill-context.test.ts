import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import {
  AskDrillContextService,
  createAskDrillContextFromEnvironment,
  type AskDrillContextInput,
} from "./ask-drill-context";

const input: AskDrillContextInput = {
  userId: "user-1",
  selection: {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
    filters: [],
    timeWindow: { grain: "month", column: "month", from: "2026-07-01", to: "2026-07-01" },
  },
  plants: ["DUB"],
  pinnedActuals: [{ source: "actuals", period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000001" }],
  rows: [
    { key: "one-paisa", actualPaise: "1", drillable: true },
    { key: "normal", actualPaise: "1234567", drillable: true },
    { key: "inert", drillable: false },
  ],
};

test("the Ask answer context signs exact-paise clickable rows and verifies a no-amount inert row", () => {
  const service = new AskDrillContextService(["secret"], 30, () => 1_000_000);
  const context = service.issue(input);
  const verified = service.verify(context, "user-1");

  assert.equal(verified.outcome, "verified");
  if (verified.outcome !== "verified") return;
  assert.deepEqual(verified.claims, {
    ...input,
    exp: 2_800,
  });
  assert.deepEqual(
    verified.claims.rows.map(({ actualPaise }) => actualPaise),
    ["1", "1234567", undefined],
  );
});

test("the Ask answer context rejects a clickable row without its exact-paise amount", () => {
  const service = new AskDrillContextService(["secret"], 30, () => 1_000_000);
  const malformed = {
    ...input,
    rows: [{ key: "missing-amount", drillable: true }],
  } as unknown as AskDrillContextInput;

  assert.throws(() => service.issue(malformed));
});

test("statement contexts bind each row's triples, mapping version, and optional pinned outline", () => {
  const service = new AskDrillContextService(["secret"], 30, () => 1_000_000);
  const statement: AskDrillContextInput = {
    ...input,
    selection: {
      ...input.selection,
      domain: "mis-statement",
      measureIds: ["mis-statement.actual_net"],
      dimensionIds: ["leaf_key"],
    },
    budget: {
      pin: { source: "budget", period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000002" },
      outlineDigest: "outline-digest",
    },
    mappingMasterVersion: 7,
    rows: [
      {
        key: "1.1|50001201|sprout-cost",
        actualPaise: "839833900",
        drillable: true,
        triples: [{ plant: "DUB", costCenter: "NURSERY", glCode: "50001201" }],
      },
    ],
  };

  const verified = service.verify(service.issue(statement), "user-1");
  assert.equal(verified.outcome, "verified");
  if (verified.outcome === "verified") assert.deepEqual(verified.claims, { ...statement, exp: 2_800 });

  const withoutBudget = { ...statement, budget: undefined };
  assert.equal(service.verify(service.issue(withoutBudget), "user-1").outcome, "verified");
});

test("tampered, expired, and other-user Ask answer contexts are refused without trusting their claims", () => {
  let now = 1_000_000;
  const service = new AskDrillContextService(["secret"], 1, () => now);
  const context = service.issue(input);
  const [payload, signature] = context.split(".");
  const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
  claims.plants = ["H.O"];
  const tampered = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;

  assert.deepEqual(service.verify(tampered, "user-1"), { outcome: "refused", reason: "invalid-signature" });
  assert.deepEqual(service.verify(context, "user-2"), { outcome: "refused", reason: "wrong-user" });
  now = 1_061_000;
  assert.deepEqual(service.verify(context, "user-1"), { outcome: "refused", reason: "expired-context" });
});

test("Ask answer signing uses the statement secret rotation and TTL environment", () => {
  const oldContext = new AskDrillContextService(["old"], 30, () => 1_000_000).issue(input);
  const rotating = new AskDrillContextService(["new", "old"], 30, () => 1_000_000);
  assert.equal(rotating.verify(oldContext, "user-1").outcome, "verified");
  assert.throws(() => createAskDrillContextFromEnvironment({}), /STATEMENT_ATTESTATION_SECRETS/);
  assert.throws(
    () =>
      createAskDrillContextFromEnvironment({
        STATEMENT_ATTESTATION_SECRETS: "secret",
        STATEMENT_ATTESTATION_TTL_MINUTES: "241",
      }),
    /between 1 and 240/,
  );
});
