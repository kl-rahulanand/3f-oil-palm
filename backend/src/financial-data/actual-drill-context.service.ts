import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, GoneException } from "@nestjs/common";
import type { Money } from "@3f/contract";
import type { ResolvedFinancialScope } from "./financial-predicate";

const MAX_PREPARED_ACTUAL_SCOPES = 200;
const DRILL_IDLE_EXPIRY_MS = 60 * 60 * 1_000;
export const ACTUAL_DRILL_CONTEXTS = "ACTUAL_DRILL_CONTEXTS";

export type ActualDrillKind = "actual" | "availableActualSubtotal";

export interface ActualDrillCandidate {
  readonly provisionalId: string;
  readonly kind: ActualDrillKind;
  readonly expectedMatchingActualTotal: Money;
  readonly scope: ResolvedFinancialScope;
}

export interface ActualDrillContext {
  readonly id: string;
  readonly ownerId: string;
  readonly resultId: string;
  readonly kind: ActualDrillKind;
  readonly expectedMatchingActualTotal: Money;
  readonly scope: ResolvedFinancialScope;
  readonly issuedAtUtc: string;
  readonly lastUsedAtUtc: string;
}

interface StoredActualDrillContext extends ActualDrillContext {
  readonly lastUsedAtMs: number;
}

export class ActualDrillContextService {
  private readonly contexts = new Map<string, StoredActualDrillContext>();

  constructor(private readonly now: () => number = Date.now) {}

  issue(ownerId: string, resultId: string, candidates: readonly ActualDrillCandidate[]): Map<string, string> {
    this.purgeExpired(this.now());
    const distinctScopes = new Map<string, ActualDrillCandidate>();
    const fingerprints = new Map<string, string>();
    for (const candidate of candidates) {
      const fingerprint = scopeFingerprint(candidate);
      const priorFingerprint = fingerprints.get(candidate.provisionalId);
      if (priorFingerprint && priorFingerprint !== fingerprint) throw queryTooBroad();
      fingerprints.set(candidate.provisionalId, fingerprint);
      if (!distinctScopes.has(fingerprint)) distinctScopes.set(fingerprint, candidate);
    }
    if (distinctScopes.size > MAX_PREPARED_ACTUAL_SCOPES) throw queryTooBroad();

    const issuedAtMs = this.now();
    const handleByFingerprint = new Map<string, string>();
    for (const [fingerprint, candidate] of distinctScopes) {
      const id = randomUUID();
      const timestamp = new Date(issuedAtMs).toISOString();
      this.contexts.set(
        id,
        deepFreeze({
          id,
          ownerId,
          resultId,
          kind: candidate.kind,
          expectedMatchingActualTotal: candidate.expectedMatchingActualTotal,
          scope: snapshotScope(candidate.scope),
          issuedAtUtc: timestamp,
          lastUsedAtUtc: timestamp,
          lastUsedAtMs: issuedAtMs,
        }),
      );
      handleByFingerprint.set(fingerprint, id);
    }
    return new Map(
      candidates.map((candidate) => [candidate.provisionalId, handleByFingerprint.get(scopeFingerprint(candidate))!]),
    );
  }

  resolve(ownerId: string, drilldownId: string, currentlyPermittedPlantIds: readonly string[]): ActualDrillContext {
    const context = this.contexts.get(drilldownId);
    if (!context) throw drillExpired();
    if (context.ownerId !== ownerId) throw accessDenied();
    const now = this.now();
    if (now - context.lastUsedAtMs >= DRILL_IDLE_EXPIRY_MS) {
      this.contexts.delete(drilldownId);
      throw drillExpired();
    }
    const permitted = new Set(currentlyPermittedPlantIds);
    if (context.scope.plantIds.some((plantId) => !permitted.has(plantId))) throw permissionChanged();

    const touched = deepFreeze({
      ...context,
      lastUsedAtUtc: new Date(now).toISOString(),
      lastUsedAtMs: now,
    });
    this.contexts.set(drilldownId, touched);
    return touched;
  }

  private purgeExpired(now: number): void {
    for (const [id, context] of this.contexts) {
      if (now - context.lastUsedAtMs >= DRILL_IDLE_EXPIRY_MS) this.contexts.delete(id);
    }
  }
}

function scopeFingerprint(candidate: ActualDrillCandidate): string {
  const { scope } = candidate;
  return JSON.stringify({
    kind: candidate.kind,
    expectedMatchingActualTotal: candidate.expectedMatchingActualTotal,
    sourceBatchIds: [...scope.sourceBatchIds].sort(),
    mappingVersionId: scope.mappingVersionId,
    plantIds: [...scope.plantIds].sort(),
    plantRecordIds: [...scope.plantRecordIds].sort(),
    from: scope.from,
    to: scope.to,
    filters: scope.filters
      .map(({ dimensionId, operator, values }) => ({ dimensionId, operator, values: [...values].sort() }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    componentKeys: [...scope.componentKeys].sort(),
  });
}

function snapshotScope(scope: ResolvedFinancialScope): ResolvedFinancialScope {
  return deepFreeze({
    sourceBatchIds: [...scope.sourceBatchIds],
    mappingVersionId: scope.mappingVersionId,
    plantIds: [...scope.plantIds],
    plantRecordIds: [...scope.plantRecordIds],
    from: scope.from,
    to: scope.to,
    grouping: [...scope.grouping],
    cellIdentity: { ...scope.cellIdentity },
    filters: scope.filters.map((filter) => ({ ...filter, values: [...filter.values] })),
    componentKeys: [...scope.componentKeys],
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function queryTooBroad(): BadRequestException {
  return new BadRequestException({
    message: "Narrow the financial question before preparing transaction details.",
    details: { reason: "query_too_broad" },
  });
}

function accessDenied(): ForbiddenException {
  return new ForbiddenException({ message: "Financial access denied.", details: { reason: "access_denied" } });
}

function permissionChanged(): ForbiddenException {
  return new ForbiddenException({
    message: "Plant access changed. Run the financial question again.",
    details: { reason: "permission_changed" },
  });
}

function drillExpired(): GoneException {
  return new GoneException({
    message: "Transaction details expired. Run the financial question again.",
    details: { reason: "drill_expired" },
  });
}
