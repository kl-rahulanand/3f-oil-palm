import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AuthUser, FinancialDimensionId, Selection } from "@3f/contract";
import { AuditService } from "../core/audit.service";
import { RbacService } from "../core/rbac.service";

const REQUIRED_MEASURE_GRANTS = [
  "mis-statement.actual_net",
  "mis-statement.budget_net",
  "mis-statement.rollover_net",
  "mis-statement.percentage",
] as const;

type FinancialAudit = Pick<AuditService, "writeRequestEvent">;
type FinancialRbac = Pick<RbacService, "resolveUser">;
export type FinancialAccessReason = "access_denied" | "no_plant_access";

export interface AuthorizedFinancialAccess {
  actorId: string;
  plantIds: string[];
}

export type FinancialAccessAction =
  { kind: "catalog" } | { kind: "dimension_lookup"; dimensionId: FinancialDimensionId } | { kind: "selection" };

@Injectable()
export class FinancialAccessService {
  constructor(
    @Inject(RbacService) private readonly rbac: FinancialRbac,
    @Inject(AuditService) private readonly audit: FinancialAudit,
  ) {}

  async authorize(userId: string, action: FinancialAccessAction): Promise<AuthorizedFinancialAccess> {
    const user = await this.rbac.resolveUser(userId).catch(() => null);
    const failure = accessFailure(user);
    const plantIds = grantedPlants(user);
    await this.record(userId, action, plantIds, failure);
    if (failure) throw financialException(failure);
    return { actorId: userId, plantIds };
  }

  private async record(
    userId: string,
    action: FinancialAccessAction,
    plantIds: string[],
    failure: FinancialAccessReason | null,
  ): Promise<void> {
    const description = auditDescription(action);
    const selection: Selection = {
      domain: "mis-statement",
      measureIds: [...REQUIRED_MEASURE_GRANTS],
      dimensionIds: ["leaf_key"],
      filters: plantIds.length ? [{ dimensionId: "plant", op: "in", value: plantIds }] : [],
    };
    try {
      await this.audit.writeRequestEvent({
        userId,
        sessionId: userId,
        question: failure
          ? `${description.label} access refused: ${failure}`
          : `${description.label} access authorized`,
        selection,
        objectsTouched: failure ? [...description.references, `failure:${failure}`] : description.references,
      });
    } catch {
      throw new ServiceUnavailableException({
        message: "The financial request could not be audited.",
        details: { reason: "data_unavailable" },
      });
    }
  }
}

function auditDescription(action: FinancialAccessAction): { label: string; references: string[] } {
  if (action.kind === "catalog") return { label: "Financial catalog", references: ["financial-catalog:v1"] };
  if (action.kind === "selection") return { label: "Financial selection", references: ["financial-selection:v1"] };
  return { label: "Financial dimension lookup", references: [`dimension:${action.dimensionId}`] };
}

function accessFailure(user: AuthUser | null): FinancialAccessReason | null {
  if (!user?.is_active) return "access_denied";
  const { actions, domains, measureIds, dimensionIds } = user.permissions;
  if (
    !actions.includes("report") ||
    !domains.includes("mis-statement") ||
    !REQUIRED_MEASURE_GRANTS.every((grant) => measureIds.includes(grant)) ||
    !dimensionIds.includes("leaf_key")
  ) {
    return "access_denied";
  }
  return grantedPlants(user).length ? null : "no_plant_access";
}

function grantedPlants(user: AuthUser | null): string[] {
  return [
    ...new Set(
      user?.scope
        .filter(({ attribute, value }) => attribute === "plant" && value.trim())
        .map(({ value }) => value.trim()) ?? [],
    ),
  ].sort();
}

export function financialException(reason: FinancialAccessReason | "unsupported_selection") {
  if (reason === "unsupported_selection") {
    return new BadRequestException({
      message: "The requested financial grouping is not supported.",
      details: { reason },
    });
  }
  return new ForbiddenException({
    message: reason === "no_plant_access" ? "Request Plant access to use Financial Chat." : "Financial access denied.",
    details: { reason },
  });
}
