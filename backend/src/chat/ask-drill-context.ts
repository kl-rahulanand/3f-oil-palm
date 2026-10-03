import { createHmac, timingSafeEqual } from "node:crypto";
import type { ProvenanceBatch, Selection } from "@3f/contract";
import { z } from "zod";
import { selectionSchema } from "../saved/saved.schemas";

const pinSchema = z.object({ source: z.enum(["actuals", "budget"]), period: z.string(), batchId: z.string() }).strict();
const tripleSchema = z.object({ plant: z.string(), costCenter: z.string(), glCode: z.string() }).strict();
const rowSchema = z
  .object({
    key: z.string().min(1),
    actualPaise: z.string().regex(/^-?(?:0|[1-9]\d*)$/),
    drillable: z.boolean(),
    triples: z.array(tripleSchema).optional(),
  })
  .strict();
const claimsSchema = z
  .object({
    userId: z.string().min(1),
    selection: selectionSchema,
    plants: z.array(z.string().min(1)).min(1),
    pinnedActuals: z.array(pinSchema.extend({ source: z.literal("actuals") })).min(1),
    budget: z
      .object({
        pin: pinSchema.extend({ source: z.literal("budget") }),
        outlineDigest: z.string().min(1),
      })
      .strict()
      .optional(),
    mappingMasterVersion: z.number().int().positive().optional(),
    rows: z.array(rowSchema).min(1),
    exp: z.number().int().positive(),
  })
  .strict()
  .superRefine((claims, context) => {
    const statement = claims.selection.domain === "mis-statement";
    if (statement && claims.mappingMasterVersion === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["mappingMasterVersion"], message: "required" });
    }
    for (const [index, row] of claims.rows.entries()) {
      if (statement && row.triples === undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["rows", index, "triples"], message: "required" });
      }
      if (!statement && row.triples !== undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["rows", index, "triples"], message: "not allowed" });
      }
    }
  });

export interface AskDrillContextRow {
  key: string;
  actualPaise: string;
  drillable: boolean;
  triples?: Array<{ plant: string; costCenter: string; glCode: string }>;
}

export interface AskDrillContextInput {
  userId: string;
  selection: Selection;
  plants: string[];
  pinnedActuals: ProvenanceBatch[];
  budget?: { pin: ProvenanceBatch; outlineDigest: string };
  mappingMasterVersion?: number;
  rows: AskDrillContextRow[];
}

export type AskDrillContextClaims = AskDrillContextInput & { exp: number };
export type AskDrillContextVerification =
  | { outcome: "verified"; claims: AskDrillContextClaims }
  | { outcome: "refused"; reason: "invalid-signature" | "expired-context" | "wrong-user" };

export class AskDrillContextService {
  constructor(
    private readonly keys: string[],
    private readonly ttlMinutes: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!keys.length || keys.some((key) => !key.trim())) throw new Error("Ask drill signing keys must be non-empty");
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 240) {
      throw new Error("STATEMENT_ATTESTATION_TTL_MINUTES must be between 1 and 240");
    }
  }

  issue(input: AskDrillContextInput): string {
    const claims = claimsSchema.parse({ ...input, exp: Math.floor(this.now() / 1000) + this.ttlMinutes * 60 });
    const bytes = canonicalJson(claims);
    return `${Buffer.from(bytes).toString("base64url")}.${sign(bytes, this.keys[0]!)}`;
  }

  verify(context: string, userId: string): AskDrillContextVerification {
    const [payload, signature, extra] = context.split(".");
    if (!payload || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(payload + signature)) return invalid();
    const bytes = Buffer.from(payload, "base64url");
    if (!this.keys.some((key) => signaturesEqual(signature, sign(bytes, key)))) return invalid();
    const parsed = claimsSchema.safeParse(parseJson(bytes));
    if (!parsed.success) return invalid();
    if (parsed.data.exp <= Math.floor(this.now() / 1000)) return { outcome: "refused", reason: "expired-context" };
    if (parsed.data.userId !== userId) return { outcome: "refused", reason: "wrong-user" };
    return { outcome: "verified", claims: parsed.data as AskDrillContextClaims };
  }
}

export function createAskDrillContextFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): AskDrillContextService {
  const raw = environment.STATEMENT_ATTESTATION_SECRETS;
  if (!raw) throw new Error("STATEMENT_ATTESTATION_SECRETS is required");
  const keys = raw.split(";").map((key) => key.trim());
  if (keys.some((key) => !key)) throw new Error("STATEMENT_ATTESTATION_SECRETS contains an empty entry");
  const ttlRaw = environment.STATEMENT_ATTESTATION_TTL_MINUTES ?? "30";
  if (!/^\d+$/.test(ttlRaw)) throw new Error("STATEMENT_ATTESTATION_TTL_MINUTES must be between 1 and 240");
  return new AskDrillContextService(keys, Number(ttlRaw));
}

function parseJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return undefined;
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function sign(bytes: string | Buffer, key: string): string {
  return createHmac("sha256", key).update(bytes).digest("base64url");
}

function signaturesEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "base64url");
  const rightBytes = Buffer.from(right, "base64url");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function invalid(): AskDrillContextVerification {
  return { outcome: "refused", reason: "invalid-signature" };
}
