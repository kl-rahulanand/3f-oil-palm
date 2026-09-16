import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { MisStatementNodeMetadata, ProvenanceBatch, StatementGroundingRefusalReason } from "@3f/contract";
import { z } from "zod";

const pinSchema = z.object({ source: z.enum(["actuals", "budget"]), period: z.string(), batchId: z.string() }).strict();
const claimsSchema = z
  .object({
    department: z.string(),
    function: z.string(),
    plant: z.string(),
    period: z.string(),
    outlineDigest: z.string(),
    nodeMetadataDigest: z.string(),
    pinnedBatches: z.array(pinSchema),
    mappingMasterVersion: z.number().int().positive(),
    userId: z.string(),
    exp: z.number().int().positive(),
  })
  .strict();

export type StatementAttestationClaims = z.infer<typeof claimsSchema>;
export type StatementOutlineDigestNode = { nodeKey: string; leafKey: string | null };
export type StatementAttestationVerification =
  | { outcome: "verified"; claims: StatementAttestationClaims }
  | {
      outcome: "refused";
      reason: Extract<
        StatementGroundingRefusalReason,
        "invalid-signature" | "expired-context" | "wrong-user" | "node-metadata-mismatch"
      >;
    };

export class StatementAttestationService {
  constructor(
    private readonly keys: string[],
    private readonly ttlMinutes: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!keys.length || keys.some((key) => !key.trim()))
      throw new Error("Statement attestation keys must be non-empty");
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 240) {
      throw new Error("STATEMENT_ATTESTATION_TTL_MINUTES must be between 1 and 240");
    }
  }

  issue(input: {
    department: string;
    function: string;
    plant: string;
    period: string;
    outline: StatementOutlineDigestNode[];
    blocks: readonly string[];
    nodeMetadata: MisStatementNodeMetadata[];
    pinnedBatches: ProvenanceBatch[];
    mappingMasterVersion: number;
    userId: string;
  }): string {
    const claims: StatementAttestationClaims = {
      department: input.department,
      function: input.function,
      plant: input.plant,
      period: input.period,
      outlineDigest: this.outlineDigest(input.outline, input.blocks),
      nodeMetadataDigest: this.nodeMetadataDigest(input.nodeMetadata),
      pinnedBatches: sortedPins(input.pinnedBatches),
      mappingMasterVersion: input.mappingMasterVersion,
      userId: input.userId,
      exp: Math.floor(this.now() / 1000) + this.ttlMinutes * 60,
    };
    const bytes = canonicalJson(claims);
    return `${Buffer.from(bytes).toString("base64url")}.${sign(bytes, this.keys[0])}`;
  }

  verify(context: string, userId: string, nodeMetadata: MisStatementNodeMetadata[]): StatementAttestationVerification {
    const [payload, signature, extra] = context.split(".");
    if (!payload || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(payload + signature)) return invalid();
    let bytes: Buffer;
    try {
      bytes = Buffer.from(payload, "base64url");
    } catch {
      return invalid();
    }
    if (!this.keys.some((key) => signaturesEqual(signature, sign(bytes, key)))) return invalid();
    let claims: StatementAttestationClaims;
    try {
      claims = claimsSchema.parse(JSON.parse(bytes.toString("utf8")));
    } catch {
      return invalid();
    }
    if (claims.exp <= Math.floor(this.now() / 1000)) return { outcome: "refused", reason: "expired-context" };
    if (claims.userId !== userId) return { outcome: "refused", reason: "wrong-user" };
    if (claims.nodeMetadataDigest !== this.nodeMetadataDigest(nodeMetadata)) {
      return { outcome: "refused", reason: "node-metadata-mismatch" };
    }
    return { outcome: "verified", claims };
  }

  outlineDigest(outline: StatementOutlineDigestNode[], blocks: readonly string[]): string {
    return digest({
      nodes: [...outline]
        .map(({ nodeKey, leafKey }) => ({ nodeKey, leafKey }))
        .sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)),
      blocks: [...blocks].sort(),
    });
  }

  nodeMetadataDigest(metadata: MisStatementNodeMetadata[]): string {
    return digest(
      [...metadata]
        .map(({ nodeKey, glCodes, costCentres }) => ({
          nodeKey,
          glCodes: [...glCodes].sort(),
          costCentres: [...costCentres].sort(),
        }))
        .sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)),
    );
  }
}

export function createStatementAttestationFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): StatementAttestationService {
  const raw = environment.STATEMENT_ATTESTATION_SECRETS;
  if (!raw) throw new Error("STATEMENT_ATTESTATION_SECRETS is required");
  const keys = raw.split(";").map((key) => key.trim());
  if (keys.some((key) => !key)) throw new Error("STATEMENT_ATTESTATION_SECRETS contains an empty entry");
  const ttlRaw = environment.STATEMENT_ATTESTATION_TTL_MINUTES ?? "30";
  if (!/^\d+$/.test(ttlRaw)) throw new Error("STATEMENT_ATTESTATION_TTL_MINUTES must be between 1 and 240");
  return new StatementAttestationService(keys, Number(ttlRaw));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("base64url");
}

function sign(bytes: string | Buffer, key: string): string {
  return createHmac("sha256", key).update(bytes).digest("base64url");
}

function signaturesEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "base64url");
  const rightBytes = Buffer.from(right, "base64url");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function sortedPins(pins: ProvenanceBatch[]): ProvenanceBatch[] {
  return [...pins].sort((left, right) =>
    `${left.source}\0${left.period}\0${left.batchId}`.localeCompare(
      `${right.source}\0${right.period}\0${right.batchId}`,
    ),
  );
}

function invalid(): StatementAttestationVerification {
  return { outcome: "refused", reason: "invalid-signature" };
}
