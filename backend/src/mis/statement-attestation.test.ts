import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import type { MisStatementNodeMetadata, ProvenanceBatch } from "@3f/contract";
import { StatementAttestationService, createStatementAttestationFromEnvironment } from "./statement-attestation";

const pins: ProvenanceBatch[] = [
  { source: "actuals", period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000001" },
  { source: "budget", period: "2026-07-01", batchId: "00000000-0000-0000-0000-000000000002" },
];
const metadata: MisStatementNodeMetadata[] = [{ nodeKey: "shade", glCodes: ["5001"], costCentres: ["Primary"] }];
const input = {
  department: "Agriculture",
  function: "Nursery",
  plant: "DUB",
  period: "2026-07-01",
  outline: [{ nodeKey: "shade", leafKey: "shade" }],
  blocks: ["selected", "fy26-27-ytd"] as const,
  nodeMetadata: metadata,
  pinnedBatches: pins,
  mappingMasterVersion: 7,
  userId: "user-1",
};

test("the attested context binds scope outline digest metadata digest pins master version user and expiry", () => {
  const service = new StatementAttestationService(["new-secret"], 30, () => 1_000_000);
  const context = service.issue(input);
  assert.equal(context, service.issue({ ...input, pinnedBatches: [...pins].reverse() }));
  const verified = service.verify(context, "user-1", metadata);

  assert.equal(verified.outcome, "verified");
  if (verified.outcome !== "verified") return;
  assert.deepEqual(verified.claims, {
    department: "Agriculture",
    function: "Nursery",
    plant: "DUB",
    period: "2026-07-01",
    outlineDigest: service.outlineDigest(input.outline, input.blocks),
    nodeMetadataDigest: service.nodeMetadataDigest(metadata),
    pinnedBatches: pins,
    mappingMasterVersion: 7,
    userId: "user-1",
    exp: 2_800,
  });
});

test("a tampered claim fails verification because the signature no longer matches the canonical encoding", () => {
  const service = new StatementAttestationService(["secret"], 30, () => 1_000_000);
  const [payload, signature] = service.issue(input).split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  claims.plant = "H.O";
  const tampered = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;

  assert.deepEqual(service.verify(tampered, "user-1", metadata), {
    outcome: "refused",
    reason: "invalid-signature",
  });
});

test("altering the readable node metadata invalidates the context because its digest is signed", () => {
  const service = new StatementAttestationService(["secret"], 30, () => 1_000_000);
  const context = service.issue(input);

  assert.deepEqual(service.verify(context, "user-1", [{ ...metadata[0], glCodes: ["forged"] }]), {
    outcome: "refused",
    reason: "node-metadata-mismatch",
  });
});

test("an expired context and a context issued to another user are both refused", () => {
  let now = 1_000_000;
  const service = new StatementAttestationService(["secret"], 1, () => now);
  const context = service.issue(input);
  assert.deepEqual(service.verify(context, "user-2", metadata), { outcome: "refused", reason: "wrong-user" });
  now = 1_061_000;
  assert.deepEqual(service.verify(context, "user-1", metadata), { outcome: "refused", reason: "expired-context" });
});

test("constructing the provider without a secret throws and an empty key entry is rejected rather than skipped", () => {
  assert.throws(() => createStatementAttestationFromEnvironment({}), /STATEMENT_ATTESTATION_SECRETS/);
  assert.throws(
    () => createStatementAttestationFromEnvironment({ STATEMENT_ATTESTATION_SECRETS: "first; ;second" }),
    /empty entry/,
  );
  assert.throws(
    () =>
      createStatementAttestationFromEnvironment({
        STATEMENT_ATTESTATION_SECRETS: "secret",
        STATEMENT_ATTESTATION_TTL_MINUTES: "241",
      }),
    /between 1 and 240/,
  );
});

test("a context signed by a rotated older key still verifies while new ones are signed with the first key", () => {
  const old = new StatementAttestationService(["old"], 30, () => 1_000_000).issue(input);
  const rotating = new StatementAttestationService(["new", "old"], 30, () => 1_000_000);

  assert.equal(rotating.verify(old, "user-1", metadata).outcome, "verified");
  assert.equal(
    new StatementAttestationService(["new"], 30, () => 1_000_000).verify(rotating.issue(input), "user-1", metadata)
      .outcome,
    "verified",
  );
});
