import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { AuthUser, MisDrillBatchStatus, MisDrillRequest, MisDrillResponse, ProvenanceBatch } from "@3f/contract";
import { AuditService } from "../core/audit.service";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import type { ISelectionResolverService, MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import { SelectionPeriodUnavailableError, SelectionResolverService } from "../mapping/selection-resolver.service";
import type { DrillBatch, IDrillTransactionsRepository } from "../warehouse/drill-transactions.interface";
import { DRILL_PAGE_SIZE, DrillTransactionsRepository } from "../warehouse/drill-transactions.repository";
import type { IPinnedStatementOutlineRepository } from "../warehouse/statement-outline.interface";
import { StatementOutlineRepository } from "../warehouse/statement-outline.repository";
import { AuditedDrillRefusalException, type IMisDrillService } from "./mis-drill.interface";
import type { IMisStatementDrillSupport } from "./mis-statement.interface";
import { MisStatementService } from "./mis-statement.service";

const UNMAPPED_GL = "unmapped-GL";

@Injectable()
export class MisDrillService implements IMisDrillService {
  constructor(
    @Inject(SelectionResolverService) private readonly resolver: ISelectionResolverService,
    @Inject(MisStatementService) private readonly statements: IMisStatementDrillSupport,
    @Inject(StatementOutlineRepository) private readonly outlines: IPinnedStatementOutlineRepository,
    @Inject(DrillTransactionsRepository) private readonly transactions: IDrillTransactionsRepository,
    private readonly audit: AuditService,
  ) {}

  async run(user: AuthUser, sessionId: string, request: MisDrillRequest): Promise<MisDrillResponse> {
    try {
      this.statements.authorize(user);
    } catch (error) {
      if (error instanceof HttpException) {
        return this.refuse(user, sessionId, request, error.getStatus(), "Drill access is not authorized");
      }
      throw error;
    }

    const canonicalPlant = this.resolver.canonicalPlant(request.plant);
    if (!canonicalPlant || !plantScope(user).includes(canonicalPlant)) {
      return this.refuse(user, sessionId, request, HttpStatus.FORBIDDEN, "Drill plant scope is not authorized");
    }

    let resolution;
    try {
      resolution = await this.resolver.resolve(request);
    } catch (error) {
      if (error instanceof SelectionPeriodUnavailableError) {
        return this.refuse(user, sessionId, request, HttpStatus.BAD_REQUEST, error.message);
      }
      throw error;
    }
    if (resolution.outcome !== "resolved") {
      return this.refuse(user, sessionId, request, HttpStatus.BAD_REQUEST, "Drill selection is not resolvable");
    }
    const block = this.statements.blocks(resolution).find(({ key }) => key === request.block);
    if (!block) return this.refuse(user, sessionId, request, HttpStatus.BAD_REQUEST, "Drill block is not available");

    const { statuses, actuals, budget } = await this.bindPins(user, sessionId, request, block.from, block.to);
    const outline = await this.outlines.findByBudgetBatchId(budget.batchId);
    const leafKey =
      request.nodeKey === UNMAPPED_GL
        ? UNMAPPED_GL
        : outline.find(({ nodeKey, leafKey }) => nodeKey === request.nodeKey && leafKey !== null)?.leafKey;
    if (!leafKey) {
      return this.refuse(user, sessionId, request, HttpStatus.BAD_REQUEST, "Drill node is not a statement leaf");
    }
    const triples = leafTriples(resolution, leafKey);
    const queries = this.transactions.buildQueries(
      {
        actualBatchIds: actuals.map(({ batchId }) => batchId),
        triples,
        plants: plantScope(user),
        from: block.from,
        to: block.to,
      },
      request.page,
    );
    await this.audit.writeDrillEvent({
      actorId: user.id,
      sessionId,
      nodeKey: request.nodeKey,
      leafKey,
      triples,
      monthRange: { from: block.from, to: block.to },
      pinnedActuals: actuals,
      pinnedBudgets: request.pinnedBatches.filter(({ source }) => source === "budget"),
      mappingMasterVersion: MAPPING_MASTER.version,
      generatedSql: `${queries.pageSql}\n\n${queries.footerSql}`,
      objectsTouched: queries.objectsTouched,
    });
    const result = await this.transactions.execute(queries);
    return {
      nodeKey: request.nodeKey,
      leafKey,
      ...result,
      page: request.page,
      pageSize: DRILL_PAGE_SIZE,
      actualBatchIds: actuals.map(({ batchId }) => batchId),
      budgetBatchId: budget.batchId,
      batchStatuses: statuses,
    };
  }

  private async bindPins(
    user: AuthUser,
    sessionId: string,
    request: MisDrillRequest,
    from: string,
    to: string,
  ): Promise<{ statuses: MisDrillBatchStatus[]; actuals: ProvenanceBatch[]; budget: ProvenanceBatch }> {
    const uniqueIds = new Set(request.pinnedBatches.map(({ batchId }) => batchId));
    if (uniqueIds.size !== request.pinnedBatches.length) {
      return this.refuse(user, sessionId, request, HttpStatus.BAD_REQUEST, "Pinned batches contain a duplicate");
    }
    const [found, active, actualPeriods] = await Promise.all([
      this.transactions.findBatchesByIds([...uniqueIds]),
      this.transactions.findActiveBatches(request.pinnedBatches),
      this.transactions.findActualPeriods(from, to),
    ]);
    const foundById = new Map(found.map((batch) => [batch.batchId, batch]));
    const activeByPeriod = new Map(active.map((batch) => [`${batch.source}\0${batch.period}`, batch]));
    const statuses = request.pinnedBatches.map((pin) => batchStatus(pin, foundById.get(pin.batchId), activeByPeriod));
    if (statuses.some(({ status }) => status === "gone")) {
      return this.refuse(user, sessionId, request, HttpStatus.CONFLICT, "A pinned batch is gone", statuses);
    }
    for (const pin of request.pinnedBatches) {
      const batch = foundById.get(pin.batchId)!;
      if (batch.source !== pin.source || batch.period !== pin.period) {
        return this.refuse(
          user,
          sessionId,
          request,
          HttpStatus.BAD_REQUEST,
          "A pinned batch has the wrong source or period",
          statuses,
        );
      }
    }

    const actuals = request.pinnedBatches.filter(
      ({ source, period }) => source === "actuals" && period >= from && period <= to,
    );
    if (actualPeriods.some((period) => actuals.filter((pin) => pin.period === period).length !== 1)) {
      return this.refuse(
        user,
        sessionId,
        request,
        HttpStatus.CONFLICT,
        "Pinned actuals do not cover the block range",
        statuses,
      );
    }
    const budgets = request.pinnedBatches.filter(({ source, period }) => source === "budget" && period === to);
    if (budgets.length !== 1) {
      return this.refuse(
        user,
        sessionId,
        request,
        HttpStatus.CONFLICT,
        "Pinned budget does not cover the block end",
        statuses,
      );
    }
    return { statuses, actuals, budget: budgets[0] };
  }

  private async refuse(
    user: AuthUser,
    sessionId: string,
    submitted: unknown,
    status: number,
    message: string,
    batchStatuses: MisDrillBatchStatus[] = [],
  ): Promise<never> {
    await this.audit.writeDrillRefusalEvent({ actorId: user.id, sessionId, submitted });
    throw new AuditedDrillRefusalException(status, message, batchStatuses);
  }
}

function leafTriples(resolution: MasterResolvedSelection, leafKey: string) {
  return (resolution.leafTargets ?? [])
    .filter(({ target }) =>
      leafKey === UNMAPPED_GL ? target.kind === "bucket" : target.kind === "leaf" && target.leafKey === leafKey,
    )
    .map(({ plant, costCenter, glCode }) => ({ plant, costCenter, glCode }));
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

function plantScope(user: AuthUser): string[] {
  return user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value);
}
