import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { AskDrillRequest, AskDrillResponse, AuthUser, MisDrillBatchStatus, ProvenanceBatch } from "@3f/contract";
import { AuditService } from "../core/audit.service";
import type {
  DrillBatch,
  DrillPredicate,
  IDrillTransactionsRepository,
} from "../warehouse/drill-transactions.interface";
import { DRILL_PAGE_SIZE, DrillTransactionsRepository } from "../warehouse/drill-transactions.repository";
import { AskDrillContextService, type AskDrillContextClaims } from "./ask-drill-context";

const RELOADED_NOTICE =
  "This answer was built on data that has since been reloaded; these are the lines it was built from.";
const GONE_MESSAGE = "The data behind this answer is no longer available. Ask again to open its transactions.";
const EXPIRED_MESSAGE = "This answer is too old to open. Ask again to open its transactions.";
const ACCESS_MESSAGE = "Your access has changed since this answer was shown. Ask again.";
const INVALID_MESSAGE = "This answer link is invalid. Ask again to open its transactions.";

export type AskDrillOutcome =
  | { outcome: "ok" | "replaced"; response: AskDrillResponse }
  | {
      outcome: "refused" | "gone" | "audit-failed";
      status: number;
      message: string;
      batchStatuses?: MisDrillBatchStatus[];
    };

type DrillAudit = Pick<AuditService, "writeDrillEvent" | "writeDrillRefusalEvent">;

@Injectable()
export class AskDrillService {
  constructor(
    private readonly contexts: AskDrillContextService,
    @Inject(DrillTransactionsRepository) private readonly transactions: IDrillTransactionsRepository,
    @Inject(AuditService) private readonly audit: DrillAudit,
  ) {}

  async run(user: AuthUser, sessionId: string, request: AskDrillRequest): Promise<AskDrillOutcome> {
    const verification = this.contexts.verify(typeof request.context === "string" ? request.context : "", user.id);
    if (verification.outcome === "refused") {
      return this.refuse(
        user,
        sessionId,
        request,
        verification.reason === "expired-context" ? HttpStatus.GONE : HttpStatus.FORBIDDEN,
        verification.reason === "expired-context"
          ? EXPIRED_MESSAGE
          : verification.reason === "wrong-user"
            ? ACCESS_MESSAGE
            : INVALID_MESSAGE,
      );
    }
    const { claims } = verification;
    if (!currentlyAuthorized(user, claims)) {
      return this.refuse(user, sessionId, request, HttpStatus.FORBIDDEN, ACCESS_MESSAGE);
    }
    const row = claims.rows.find(({ key }) => key === request.rowKey);
    if (!row)
      return this.refuse(
        user,
        sessionId,
        request,
        HttpStatus.BAD_REQUEST,
        "This answer does not include that row. Ask again.",
      );
    if (!rowPlantsAuthorized(user, row.plants)) {
      return this.refuse(user, sessionId, request, HttpStatus.FORBIDDEN, ACCESS_MESSAGE);
    }
    if (!row.drillable) {
      return this.refuse(
        user,
        sessionId,
        request,
        HttpStatus.BAD_REQUEST,
        "There are no transactions behind this Actual.",
      );
    }
    const range = concreteRange(claims);
    if (!range)
      return this.refuse(
        user,
        sessionId,
        request,
        HttpStatus.BAD_REQUEST,
        "This answer has no fixed period. Ask again.",
      );
    const pins = await this.bindPins(claims, range);
    if (pins.outcome !== "bound") {
      return this.refuse(user, sessionId, request, pins.status, pins.message, pins.batchStatuses);
    }
    const predicate = predicateFor(claims, row, range);
    if (!predicate)
      return this.refuse(user, sessionId, request, HttpStatus.BAD_REQUEST, "This answer cannot be opened. Ask again.");
    const queries = this.transactions.buildQueries(predicate, request.page, DRILL_PAGE_SIZE);
    try {
      await this.audit.writeDrillEvent({
        actorId: user.id,
        sessionId,
        nodeKey: row.key,
        leafKey: row.key,
        triples: row.triples ?? [],
        monthRange: range,
        pinnedActuals: claims.pinnedActuals,
        pinnedBudgets: claims.budget ? [claims.budget.pin] : [],
        ...(claims.mappingMasterVersion === undefined ? {} : { mappingMasterVersion: claims.mappingMasterVersion }),
        generatedSql: `${queries.pageSql}\n\n${queries.footerSql}`,
        objectsTouched: queries.objectsTouched,
        questionLabel: "Ask transaction drill",
      });
    } catch {
      return {
        outcome: "audit-failed",
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: "The read could not be audited.",
      };
    }
    const result = await this.transactions.execute(queries);
    if (decimalToPaise(result.footer.value) !== canonicalPaise(row.actualPaise)) {
      await this.audit.writeDrillRefusalEvent({
        actorId: user.id,
        sessionId,
        submitted: { rowKey: request.rowKey, page: request.page, reason: "footing-mismatch" },
        questionLabel: "Ask transaction drill",
      });
      return {
        outcome: "refused",
        status: HttpStatus.CONFLICT,
        message: "The transactions no longer match this answer. Ask again.",
      };
    }
    const replaced = pins.batchStatuses.some(({ status }) => status === "replaced");
    const response: AskDrillResponse = {
      rowKey: row.key,
      ...result,
      page: request.page,
      pageSize: DRILL_PAGE_SIZE,
      batchStatuses: pins.batchStatuses,
      ...(replaced ? { notice: RELOADED_NOTICE } : {}),
    };
    return { outcome: replaced ? "replaced" : "ok", response };
  }

  private async bindPins(
    claims: AskDrillContextClaims,
    range: { from: string; to: string },
  ): Promise<
    | { outcome: "bound"; batchStatuses: MisDrillBatchStatus[] }
    | { outcome: "gone" | "refused"; status: number; message: string; batchStatuses: MisDrillBatchStatus[] }
  > {
    const requested = [...claims.pinnedActuals, ...(claims.budget ? [claims.budget.pin] : [])];
    if (new Set(requested.map(({ batchId }) => batchId)).size !== requested.length) {
      return {
        outcome: "refused",
        status: HttpStatus.BAD_REQUEST,
        message: "The answer has duplicate data pins. Ask again.",
        batchStatuses: [],
      };
    }
    const [states, actualPeriods] = await Promise.all([
      this.transactions.findBatchStates(requested),
      this.transactions.findActualPeriods(range.from, range.to),
    ]);
    const requestedIds = new Set(requested.map(({ batchId }) => batchId));
    const foundById = new Map(
      states.filter(({ batchId }) => requestedIds.has(batchId)).map((state) => [state.batchId, state]),
    );
    const activeByPeriod = new Map(
      states.filter(({ isActive }) => isActive).map((state) => [`${state.source}\0${state.period}`, state]),
    );
    const batchStatuses = requested.map((pin) => batchStatus(pin, foundById.get(pin.batchId), activeByPeriod));
    if (batchStatuses.some(({ status }) => status === "gone")) {
      return { outcome: "gone", status: HttpStatus.CONFLICT, message: GONE_MESSAGE, batchStatuses };
    }
    if (
      requested.some((pin) => {
        const found = foundById.get(pin.batchId)!;
        return found.source !== pin.source || found.period !== pin.period;
      })
    ) {
      return {
        outcome: "refused",
        status: HttpStatus.BAD_REQUEST,
        message: "The answer's data pins are invalid. Ask again.",
        batchStatuses,
      };
    }
    if (actualPeriods.some((period) => claims.pinnedActuals.filter((pin) => pin.period === period).length !== 1)) {
      return {
        outcome: "refused",
        status: HttpStatus.CONFLICT,
        message: "The answer's actuals pins are incomplete. Ask again.",
        batchStatuses,
      };
    }
    return { outcome: "bound", batchStatuses };
  }

  private async refuse(
    user: AuthUser,
    sessionId: string,
    submitted: AskDrillRequest,
    status: number,
    message: string,
    batchStatuses: MisDrillBatchStatus[] = [],
  ): Promise<AskDrillOutcome> {
    await this.audit.writeDrillRefusalEvent({
      actorId: user.id,
      sessionId,
      submitted: { rowKey: submitted.rowKey, page: submitted.page },
      questionLabel: "Ask transaction drill",
    });
    return {
      outcome: status === HttpStatus.CONFLICT && message === GONE_MESSAGE ? "gone" : "refused",
      status,
      message,
      batchStatuses,
    };
  }
}

function currentlyAuthorized(user: AuthUser, claims: AskDrillContextClaims): boolean {
  const actualMeasure =
    claims.selection.domain === "mis-statement" ? "mis-statement.actual_net" : "governed-financial.actual";
  return (
    user.permissions.actions.includes("report") &&
    user.permissions.domains.includes(claims.selection.domain) &&
    user.permissions.measureIds.includes(actualMeasure)
  );
}

function rowPlantsAuthorized(user: AuthUser, plants: string[]): boolean {
  const heldPlants = new Set(user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value));
  return plants.every((plant) => heldPlants.has(plant));
}

function concreteRange(claims: AskDrillContextClaims): { from: string; to: string } | null {
  const { from, to } = claims.selection.timeWindow ?? {};
  return from && to && from <= to ? { from, to } : null;
}

function predicateFor(
  claims: AskDrillContextClaims,
  row: AskDrillContextClaims["rows"][number],
  range: { from: string; to: string },
): DrillPredicate | null {
  const base = {
    actualBatchIds: claims.pinnedActuals.map(({ batchId }) => batchId),
    plants: row.plants,
    ...range,
  };
  if (
    claims.selection.domain === "governed-financial" &&
    isAllowedRowShape(claims.selection.dimensionIds, "gl_code") &&
    row.glCode
  ) {
    return { ...base, mode: "gl-and-plants", glCode: row.glCode, filters: claims.selection.filters };
  }
  if (
    claims.selection.domain === "mis-statement" &&
    isAllowedRowShape(claims.selection.dimensionIds, "leaf_key") &&
    row.triples
  ) {
    return { ...base, mode: "triples", triples: row.triples };
  }
  return null;
}

function isAllowedRowShape(dimensionIds: string[], identity: "gl_code" | "leaf_key"): boolean {
  return (
    (dimensionIds.length === 1 && dimensionIds[0] === identity) ||
    (dimensionIds.length === 2 && dimensionIds.includes(identity) && dimensionIds.includes("plant"))
  );
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

function decimalToPaise(value: string): string {
  const match = value.match(/^(-?)(\d+)\.(\d{2})$/);
  if (!match) throw new Error("Ask drill footer is not exact fixed-scale money");
  return canonicalPaise(`${match[1]}${match[2]}${match[3]}`);
}

function canonicalPaise(value: string): string {
  return BigInt(value).toString();
}
