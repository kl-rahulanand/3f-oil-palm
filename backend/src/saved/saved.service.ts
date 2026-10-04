import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { AuthUser, ExplorationSelectionStatus, SaveQueryRequest, SavedQuery, Selection } from "@3f/contract";
import { DRIZZLE_DB } from "../config";
import { AuditService } from "../core/audit.service";
import type { AppDb } from "../db/pool";
import { savedQueries } from "../db/schema";
import { plantChoiceOptions, PLANT_REFUSAL_MESSAGES, validatePlantFilter } from "../chat/plant-set";
import { canonicalizeSelection, operandMeasureIds } from "../semantic/measure-filter.helper";
import { PlantFilterInvalidException } from "../semantic/plant-filter-invalid.exception";
import { SemanticLayer } from "../semantic/semanticLayer";
import { validateSelectionForUser } from "../semantic/selectionValidation";
import { selectionSchema } from "./saved.schemas";

@Injectable()
export class SavedService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly semantic: SemanticLayer,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, sessionId: string, req: SaveQueryRequest): Promise<SavedQuery> {
    await this.audit.writeExplorationRequestEvent({
      actorId: user.id,
      sessionId,
      resource: "saved",
      action: "create",
      submitted: req,
    });
    const withPlants = canonicalPlantSelection(user, req.selection);
    const domain = this.semantic.domain(withPlants.domain);
    if (!domain) validateSelectionForUser(this.semantic, user, withPlants);
    const selection = canonicalizeSelection(domain!, withPlants);
    validateSelectionForUser(this.semantic, user, selection);
    const status = selectionStatus(this.semantic, user, selection);
    if (!status.runnable) {
      await this.audit.writeExplorationRefusalEvent({
        actorId: user.id,
        sessionId,
        resource: "saved",
        action: "create",
        submitted: { reason: status.reason },
      });
    }

    const inserted = await this.db
      .insert(savedQueries)
      .values({
        userId: user.id,
        selection,
        chartType: req.chartType,
      })
      .returning();

    return toSavedQuery(this.semantic, inserted[0], status);
  }

  async list(user: AuthUser, sessionId: string): Promise<SavedQuery[]> {
    await this.audit.writeExplorationRequestEvent({ actorId: user.id, sessionId, resource: "saved", action: "list" });
    const rows = await this.db
      .select()
      .from(savedQueries)
      .where(eq(savedQueries.userId, user.id))
      .orderBy(desc(savedQueries.createdAt));
    const saved = rows.map((row) => {
      const status = selectionStatus(this.semantic, user, row.selection);
      return toSavedQuery(this.semantic, row, status);
    });
    await this.audit.writeExplorationRefusalEvents(
      saved.flatMap((item) =>
        item.status.runnable
          ? []
          : [
              {
                actorId: user.id,
                sessionId,
                resource: "saved",
                action: "list",
                submitted: { id: item.id, reason: item.status.reason },
              },
            ],
      ),
    );
    return saved;
  }

  async remove(user: AuthUser, sessionId: string, id: string): Promise<{ ok: true }> {
    await this.audit.writeExplorationRequestEvent({
      actorId: user.id,
      sessionId,
      resource: "saved",
      action: "delete",
      submitted: { id },
    });
    const deleted = await this.db
      .delete(savedQueries)
      .where(and(eq(savedQueries.id, id), eq(savedQueries.userId, user.id)))
      .returning({ id: savedQueries.id });
    if (deleted.length === 0) throw new NotFoundException("Saved query not found");
    return { ok: true };
  }
}

type SavedQueryRow = typeof savedQueries.$inferSelect;

function toSavedQuery(semantic: SemanticLayer, row: SavedQueryRow, status: ExplorationSelectionStatus): SavedQuery {
  const stored = storedSelection(row.selection);
  const selection = status.runnable ? canonicalizeSelection(semantic.domain(stored.domain)!, stored) : stored;
  return {
    id: row.id,
    selection,
    status,
    ...(row.chartType ? { chartType: row.chartType as SavedQuery["chartType"] } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function storedSelection(value: unknown): Selection {
  const parsed = selectionSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Stored saved query selection is invalid");
  return parsed.data;
}

function selectionStatus(semantic: SemanticLayer, user: AuthUser, value: unknown): ExplorationSelectionStatus {
  const selection = storedSelection(value);
  const domain = semantic.domain(selection.domain);
  const measureIds = operandMeasureIds(selection);
  const dimensionIds = new Set([...selection.dimensionIds, ...selection.filters.map((filter) => filter.dimensionId)]);
  if (
    !domain ||
    measureIds.some((id) => !semantic.measure(selection.domain, id)) ||
    [...dimensionIds].some((id) => !semantic.dimension(selection.domain, id))
  ) {
    return {
      runnable: false,
      reason: "definition_unregistered",
      message: "This selection uses a definition that is no longer registered.",
    };
  }
  const revokedPlants = revokedPlantStatus(user, selection);
  if (revokedPlants) return revokedPlants;
  if (
    (domain.composed && !user.permissions.actions.includes("report")) ||
    (domain.scopeColumn && !user.scope.some((scope) => scope.attribute === domain.scopeColumn)) ||
    !user.permissions.domains.includes(selection.domain) ||
    measureIds.some((id) => !user.permissions.measureIds.includes(id)) ||
    [...dimensionIds].some((id) => id !== "plant" && !user.permissions.dimensionIds.includes(id))
  ) {
    return {
      runnable: false,
      reason: "grant_revoked",
      message: "You no longer have permission to run this selection.",
    };
  }
  return { runnable: true };
}

function canonicalPlantSelection(user: AuthUser, selection: Selection): Selection {
  const validation = validatePlantFilter({
    filters: selection.filters,
    grantedPlants: user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value),
  });
  if (!validation.ok) {
    if (validation.refusal.reason === "plant-not-granted") {
      throw new PlantFilterInvalidException("plant-not-granted", validation.refusal.plants);
    }
    throw new PlantFilterInvalidException("plant-filter-invalid");
  }
  return {
    ...selection,
    filters: selection.filters.map((filter) => (filter.dimensionId === "plant" ? validation.filter : filter)),
  };
}

function revokedPlantStatus(user: AuthUser, selection: Selection): ExplorationSelectionStatus | undefined {
  const plantFilter = selection.filters.find(({ dimensionId }) => dimensionId === "plant");
  if (!plantFilter || plantFilter.op !== "in" || !Array.isArray(plantFilter.value)) return undefined;
  const grants = new Set(user.scope.filter(({ attribute }) => attribute === "plant").map(({ value }) => value));
  const revoked = [...new Set(plantFilter.value)].filter((plant) => !grants.has(plant));
  if (revoked.length === 0) return undefined;
  const names = plantChoiceOptions(revoked).options.map(({ label }) => label);
  return {
    runnable: false,
    reason: "plants_revoked",
    message: PLANT_REFUSAL_MESSAGES["plants-revoked"](names),
  };
}
