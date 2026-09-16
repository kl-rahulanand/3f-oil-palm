import { Inject, Injectable } from "@nestjs/common";
import type {
  AskStatementGrounding,
  AuthUser,
  MisDrillBatchStatus,
  ProvenanceBatch,
  StatementGroundingRefusalReason,
  StatementGroundingResponse,
} from "@3f/contract";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import type { ISelectionResolverService, MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import { SelectionResolverService } from "../mapping/selection-resolver.service";
import { StatementAttestationService } from "../mis/statement-attestation";
import type { DrillBatch, IDrillTransactionsRepository } from "../warehouse/drill-transactions.interface";
import { DrillTransactionsRepository } from "../warehouse/drill-transactions.repository";
import type { IPinnedStatementOutlineRepository } from "../warehouse/statement-outline.interface";
import { StatementOutlineRepository } from "../warehouse/statement-outline.repository";

const FY_START = "2026-04-01";

@Injectable()
export class StatementGroundingService {
  constructor(
    private readonly attestation: StatementAttestationService,
    @Inject(SelectionResolverService) private readonly resolver: ISelectionResolverService,
    @Inject(StatementOutlineRepository) private readonly outlines: IPinnedStatementOutlineRepository,
    @Inject(DrillTransactionsRepository) private readonly batches: IDrillTransactionsRepository,
  ) {}

  async verify(user: AuthUser, grounding: AskStatementGrounding): Promise<StatementGroundingResponse> {
    const verified = this.attestation.verify(grounding.attestedContext, user.id, grounding.nodeMetadata);
    if (verified.outcome === "refused") return verified;
    const { claims } = verified;
    const canonicalPlant = this.resolver.canonicalPlant(claims.plant);
    if (!canonicalPlant || !plantScope(user).includes(canonicalPlant)) return refused("plant-not-authorized");

    let resolution;
    try {
      resolution = await this.resolver.resolve({
        department: claims.department,
        function: claims.function,
        plant: claims.plant,
        period: claims.period,
      });
    } catch {
      return refused("selection-mismatch");
    }
    if (
      resolution.outcome !== "resolved" ||
      resolution.department !== grounding.department ||
      resolution.function !== grounding.function ||
      resolution.plant !== claims.plant ||
      claims.mappingMasterVersion !== MAPPING_MASTER.version
    ) {
      return refused("selection-mismatch");
    }

    const uniqueIds = new Set(claims.pinnedBatches.map(({ batchId }) => batchId));
    if (uniqueIds.size !== claims.pinnedBatches.length) return refused("pinned-batch-invalid");
    const [found, active] = await Promise.all([
      this.batches.findBatchesByIds([...uniqueIds]),
      this.batches.findActiveBatches(claims.pinnedBatches),
    ]);
    const foundById = new Map(found.map((batch) => [batch.batchId, batch]));
    const activeByPeriod = new Map(active.map((batch) => [`${batch.source}\0${batch.period}`, batch]));
    const batchStatuses = claims.pinnedBatches.map((pin) =>
      batchStatus(pin, foundById.get(pin.batchId), activeByPeriod),
    );
    if (batchStatuses.some(({ status }) => status === "gone")) {
      return refused("pinned-batch-gone", batchStatuses);
    }
    if (
      claims.pinnedBatches.some((pin) => {
        const batch = foundById.get(pin.batchId)!;
        return batch.source !== pin.source || batch.period !== pin.period;
      })
    ) {
      return refused("pinned-batch-invalid");
    }

    const budgetPins = claims.pinnedBatches.filter(
      ({ source, period }) => source === "budget" && period === resolution.period.to,
    );
    if (budgetPins.length !== 1) return refused("pinned-batch-invalid");
    const outline = await this.outlines.findByBudgetBatchId(budgetPins[0].batchId);
    const blocks = statementBlocks(resolution);
    if (this.attestation.outlineDigest(outline, blocks) !== claims.outlineDigest) return refused("outline-mismatch");
    if (!outline.some(({ nodeKey }) => nodeKey === grounding.nodeKey)) {
      return refused("node-not-in-outline");
    }
    if (!blocks.includes(grounding.block)) return refused("block-not-in-outline");
    return { outcome: "verified-but-unanswered", batchStatuses };
  }
}

function statementBlocks(resolution: MasterResolvedSelection): string[] {
  if (resolution.period.value === "fy26-27-ytd") return ["fy26-27-ytd"];
  return resolution.period.from === FY_START && resolution.period.from === resolution.period.to
    ? ["selected"]
    : ["selected", "fy26-27-ytd"];
}

function plantScope(user: AuthUser): string[] {
  return user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value);
}

function batchStatus(
  pin: ProvenanceBatch,
  found: DrillBatch | undefined,
  activeByPeriod: Map<string, DrillBatch>,
): MisDrillBatchStatus {
  const active = activeByPeriod.get(`${pin.source}\0${pin.period}`);
  return {
    source: pin.source,
    period: pin.period,
    requestedBatchId: pin.batchId,
    status: !found ? "gone" : found.isActive || active?.batchId === pin.batchId ? "current" : "replaced",
    activeBatchId: active?.batchId ?? (found?.isActive ? found.batchId : null),
  };
}

function refused(
  reason: StatementGroundingRefusalReason,
  batchStatuses?: MisDrillBatchStatus[],
): StatementGroundingResponse {
  return { outcome: "refused", reason, ...(batchStatuses ? { batchStatuses } : {}) };
}
