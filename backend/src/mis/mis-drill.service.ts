import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  AuthUser,
  MisDrillBatchStatus,
  MisDrillRequest,
  ProvenanceBatch,
  StatementRollupEntry,
} from "@3f/contract";
import { AuditService } from "../core/audit.service";
import { MAPPING_MASTER } from "../mapping/mapping-master";
import type { ISelectionResolverService, MasterResolvedSelection } from "../mapping/selection-resolver.interface";
import { SelectionPeriodUnavailableError, SelectionResolverService } from "../mapping/selection-resolver.service";
import type { DrillBatch, IDrillTransactionsRepository } from "../warehouse/drill-transactions.interface";
import { DRILL_PAGE_SIZE, DrillTransactionsRepository } from "../warehouse/drill-transactions.repository";
import type { IPinnedStatementOutlineRepository } from "../warehouse/statement-outline.interface";
import { StatementOutlineRepository } from "../warehouse/statement-outline.repository";
import type {
  IMisDrillService,
  MisDrillOutcome,
  MisDrillPreparationOutcome,
  MisDrillPreparationRequest,
  VerifiedDrillContext,
} from "./mis-drill.interface";
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

  async run(user: AuthUser, sessionId: string, request: MisDrillRequest): Promise<MisDrillOutcome> {
    const prepared = await this.prepare(user, request);
    if (prepared.outcome !== "prepared") {
      await this.audit.writeDrillRefusalEvent({ actorId: user.id, sessionId, submitted: request });
      return prepared;
    }
    return this.read(user, sessionId, prepared.context, DRILL_PAGE_SIZE);
  }

  async prepare(
    user: AuthUser,
    requestValue: MisDrillPreparationRequest | MisDrillRequest,
  ): Promise<MisDrillPreparationOutcome> {
    const request = preparationRequest(requestValue);
    try {
      this.statements.authorize(user);
    } catch (error) {
      if (error instanceof HttpException) return refused(error.getStatus(), "Drill access is not authorized");
      throw error;
    }
    const canonicalPlant = this.resolver.canonicalPlant(request.plant);
    if (!canonicalPlant || !plantScope(user).includes(canonicalPlant)) {
      return refused(HttpStatus.FORBIDDEN, "Drill plant scope is not authorized");
    }
    let resolution;
    try {
      resolution = await this.resolver.resolve(request);
    } catch (error) {
      if (error instanceof SelectionPeriodUnavailableError) return refused(HttpStatus.BAD_REQUEST, error.message);
      throw error;
    }
    if (resolution.outcome !== "resolved") return refused(HttpStatus.BAD_REQUEST, "Drill selection is not resolvable");
    const blocks = this.statements.blocks(resolution);
    const block = request.focus ? blocks.find(({ key }) => key === request.focus?.block) : blocks[0];
    if (!block) return refused(HttpStatus.BAD_REQUEST, "Drill block is not available");

    const pins = await this.bindPins(request, block.from, block.to);
    if (pins.outcome !== "bound") return pins;
    const outline = await this.outlines.findByBudgetBatchId(pins.budget.batchId);
    const focusedNode = request.focus ? outline.find(({ nodeKey }) => nodeKey === request.focus?.nodeKey) : undefined;
    const leafKey = request.focus?.nodeKey === UNMAPPED_GL ? UNMAPPED_GL : (focusedNode?.leafKey ?? null);
    return {
      outcome: "prepared",
      context: {
        request,
        resolution,
        outline,
        batchStatuses: pins.statuses,
        actuals: pins.actuals,
        budget: pins.budget,
        range: { from: block.from, to: block.to },
        focusExists: !request.focus || request.focus.nodeKey === UNMAPPED_GL || Boolean(focusedNode),
        leafKey,
        budgetState: resolution.plant === resolution.budgetOwnerPlant ? "loaded" : "not-loaded",
      },
    };
  }

  async read(
    user: AuthUser,
    sessionId: string,
    context: VerifiedDrillContext,
    rowLimit: number,
  ): Promise<MisDrillOutcome> {
    const focus = context.request.focus;
    if (!focus || !context.focusExists || !context.leafKey) {
      return refused(HttpStatus.BAD_REQUEST, "Drill node is not a statement leaf");
    }
    const rollup = leafRollup(context.resolution, context.leafKey);
    const triples = rollup.map(({ plant, costCentre, glCode }) => ({ plant, costCenter: costCentre, glCode }));
    const queries = this.transactions.buildQueries(
      {
        actualBatchIds: context.actuals.map(({ batchId }) => batchId),
        triples,
        plants: plantScope(user),
        from: context.range.from,
        to: context.range.to,
      },
      context.request.page,
      rowLimit,
    );
    try {
      await this.audit.writeDrillEvent({
        actorId: user.id,
        sessionId,
        nodeKey: focus.nodeKey,
        leafKey: context.leafKey,
        triples,
        monthRange: context.range,
        pinnedActuals: context.actuals,
        pinnedBudgets: [context.budget],
        mappingMasterVersion: MAPPING_MASTER.version,
        generatedSql: `${queries.pageSql}\n\n${queries.footerSql}`,
        objectsTouched: queries.objectsTouched,
      });
    } catch {
      return {
        outcome: "audit-failed",
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: "The read could not be audited.",
      };
    }
    const result = await this.transactions.execute(queries);
    const response = {
      nodeKey: focus.nodeKey,
      leafKey: context.leafKey,
      ...result,
      page: context.request.page,
      pageSize: rowLimit,
      actualBatchIds: context.actuals.map(({ batchId }) => batchId),
      budgetBatchId: context.budget.batchId,
      batchStatuses: context.batchStatuses,
      rollup,
      budgetState: context.budgetState,
    };
    return context.batchStatuses.some(({ status }) => status === "replaced")
      ? { outcome: "replaced", response }
      : { outcome: "ok", response };
  }

  private async bindPins(
    request: MisDrillPreparationRequest,
    from: string,
    to: string,
  ): Promise<
    | { outcome: "bound"; statuses: MisDrillBatchStatus[]; actuals: ProvenanceBatch[]; budget: ProvenanceBatch }
    | Exclude<MisDrillPreparationOutcome, { outcome: "prepared" }>
  > {
    const uniqueIds = new Set(request.pinnedBatches.map(({ batchId }) => batchId));
    if (uniqueIds.size !== request.pinnedBatches.length)
      return refused(HttpStatus.BAD_REQUEST, "Pinned batches contain a duplicate");
    const [states, actualPeriods] = await Promise.all([
      this.transactions.findBatchStates(request.pinnedBatches),
      this.transactions.findActualPeriods(from, to),
    ]);
    const requestedIds = new Set(request.pinnedBatches.map(({ batchId }) => batchId));
    const foundById = new Map(
      states.filter(({ batchId }) => requestedIds.has(batchId)).map((batch) => [batch.batchId, batch]),
    );
    const activeByPeriod = new Map(
      states.filter(({ isActive }) => isActive).map((batch) => [`${batch.source}\0${batch.period}`, batch]),
    );
    const statuses = request.pinnedBatches.map((pin) => batchStatus(pin, foundById.get(pin.batchId), activeByPeriod));
    if (statuses.some(({ status }) => status === "gone")) {
      return {
        outcome: "gone",
        status: HttpStatus.CONFLICT,
        message: "A pinned batch is gone",
        batchStatuses: statuses,
      };
    }
    if (
      request.pinnedBatches.some((pin) => {
        const batch = foundById.get(pin.batchId)!;
        return batch.source !== pin.source || batch.period !== pin.period;
      })
    )
      return refused(HttpStatus.BAD_REQUEST, "A pinned batch has the wrong source or period", statuses);
    const actuals = request.pinnedBatches.filter(
      ({ source, period }) => source === "actuals" && period >= from && period <= to,
    );
    if (actualPeriods.some((period) => actuals.filter((pin) => pin.period === period).length !== 1)) {
      return refused(HttpStatus.CONFLICT, "Pinned actuals do not cover the block range", statuses);
    }
    const budgets = request.pinnedBatches.filter(({ source, period }) => source === "budget" && period === to);
    if (budgets.length !== 1)
      return refused(HttpStatus.CONFLICT, "Pinned budget does not cover the block end", statuses);
    return { outcome: "bound", statuses, actuals, budget: budgets[0]! };
  }
}

function preparationRequest(request: MisDrillPreparationRequest | MisDrillRequest): MisDrillPreparationRequest {
  return "nodeKey" in request ? { ...request, focus: { nodeKey: request.nodeKey, block: request.block } } : request;
}

function leafRollup(resolution: MasterResolvedSelection, leafKey: string): StatementRollupEntry[] {
  const selection = MAPPING_MASTER.selections.find(
    ({ department, function: selectedFunction, plant_canonical }) =>
      department === resolution.department &&
      selectedFunction === resolution.function &&
      plant_canonical === resolution.plant,
  );
  return (resolution.leafTargets ?? [])
    .filter(({ target }) =>
      leafKey === UNMAPPED_GL ? target.kind === "bucket" : target.kind === "leaf" && target.leafKey === leafKey,
    )
    .map(({ plant, costCenter, glCode, target }) => {
      const entry = selection?.entries.find(
        ({ cost_center, gl_code }) => cost_center === costCenter && gl_code === glCode,
      );
      return {
        plant,
        costCentre: costCenter,
        glCode,
        bucket: entry?.mis_line ?? (target.kind === "leaf" ? target.leafKey : UNMAPPED_GL),
        mappingTarget: target,
        provisional: entry?.provisional ?? (target.kind === "bucket" || resolution.provisional),
        reason: entry?.reason ?? (target.kind === "bucket" ? "GL absent from Mapping Master" : null),
      };
    });
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
  status: number,
  message: string,
  batchStatuses: MisDrillBatchStatus[] = [],
): Extract<MisDrillOutcome, { outcome: "refused" }> {
  return { outcome: "refused", status, message, batchStatuses };
}

function plantScope(user: AuthUser): string[] {
  return user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value);
}
