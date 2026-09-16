import { Inject, Injectable } from "@nestjs/common";
import type {
  AskStatementGrounding,
  AuthUser,
  MisDrillBatchStatus,
  StatementGroundingRefusalReason,
} from "@3f/contract";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import { MisDrillService } from "../mis/mis-drill.service";
import type { IMisDrillService, VerifiedDrillContext } from "../mis/mis-drill.interface";
import { StatementAttestationService } from "../mis/statement-attestation";

const FY_START = "2026-04-01";

export type StatementGroundingVerification =
  | { outcome: "verified"; context: VerifiedDrillContext }
  | { outcome: "gone"; batchStatuses: MisDrillBatchStatus[] }
  | { outcome: "refused"; reason: StatementGroundingRefusalReason; batchStatuses?: MisDrillBatchStatus[] };

@Injectable()
export class StatementGroundingService {
  constructor(
    private readonly attestation: StatementAttestationService,
    @Inject(MisDrillService) private readonly drills: IMisDrillService,
  ) {}

  async verify(user: AuthUser, grounding: AskStatementGrounding): Promise<StatementGroundingVerification> {
    const verified = this.attestation.verify(grounding.attestedContext, user.id, grounding.nodeMetadata);
    if (verified.outcome === "refused") return verified;
    const { claims } = verified;
    const prepared = await this.drills.prepare(user, {
      department: claims.department,
      function: claims.function,
      plant: claims.plant,
      period: claims.period,
      pinnedBatches: claims.pinnedBatches,
      ...(grounding.focus ? { focus: { nodeKey: grounding.focus.nodeKey, block: grounding.focus.block } } : {}),
      page: 1,
    });
    if (prepared.outcome === "gone") return { outcome: "gone", batchStatuses: prepared.batchStatuses };
    if (prepared.outcome === "refused") return refused(preparationReason(prepared.message), prepared.batchStatuses);
    const { context } = prepared;
    if (
      context.resolution.department !== grounding.department ||
      context.resolution.function !== grounding.function ||
      context.resolution.plant !== claims.plant ||
      claims.mappingMasterVersion !== MAPPING_MASTER.version
    )
      return refused("selection-mismatch");
    const blocks = statementBlocks(context.resolution.period.value, context.resolution.period.from);
    if (this.attestation.outlineDigest(context.outline, blocks) !== claims.outlineDigest)
      return refused("outline-mismatch");
    if (grounding.focus && !context.outline.some(({ nodeKey }) => nodeKey === grounding.focus?.nodeKey)) {
      return refused("node-not-in-outline");
    }
    if (grounding.focus && !blocks.includes(grounding.focus.block)) return refused("block-not-in-outline");
    return { outcome: "verified", context };
  }
}

function statementBlocks(period: string, from: string): string[] {
  if (period === "fy26-27-ytd") return ["fy26-27-ytd"];
  return from === FY_START ? ["selected"] : ["selected", "fy26-27-ytd"];
}

function preparationReason(message: string): StatementGroundingRefusalReason {
  if (message.includes("plant scope") || message.includes("access is not authorized")) return "plant-not-authorized";
  if (message.includes("node")) return "node-not-in-outline";
  if (message.includes("block")) return "block-not-in-outline";
  if (message.includes("Pinned")) return "pinned-batch-invalid";
  return "selection-mismatch";
}

function refused(
  reason: StatementGroundingRefusalReason,
  batchStatuses?: MisDrillBatchStatus[],
): StatementGroundingVerification {
  return { outcome: "refused", reason, ...(batchStatuses?.length ? { batchStatuses } : {}) };
}
