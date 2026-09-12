import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { AuthUser, ExplorationSelectionStatus, SaveQueryRequest, SavedQuery, Selection } from "@3f/contract";
import { DRIZZLE_DB } from "../config";
import { AuditService } from "../core/audit.service";
import type { AppDb } from "../db/pool";
import { savedQueries } from "../db/schema";
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
    validateSelectionForUser(this.semantic, user, req.selection);
    const status = selectionStatus(this.semantic, user, req.selection);
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
        selection: req.selection,
        chartType: req.chartType,
      })
      .returning();

    return toSavedQuery(inserted[0], status);
  }

  async list(user: AuthUser, sessionId: string): Promise<SavedQuery[]> {
    await this.audit.writeExplorationRequestEvent({ actorId: user.id, sessionId, resource: "saved", action: "list" });
    const rows = await this.db
      .select()
      .from(savedQueries)
      .where(eq(savedQueries.userId, user.id))
      .orderBy(desc(savedQueries.createdAt));
    const saved = rows.map((row) => toSavedQuery(row, selectionStatus(this.semantic, user, row.selection)));
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

function toSavedQuery(row: SavedQueryRow, status: ExplorationSelectionStatus): SavedQuery {
  const selection = storedSelection(row.selection);
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
  const dimensionIds = new Set([...selection.dimensionIds, ...selection.filters.map((filter) => filter.dimensionId)]);
  if (
    !domain ||
    selection.measureIds.some((id) => !semantic.measure(selection.domain, id)) ||
    [...dimensionIds].some((id) => !semantic.dimension(selection.domain, id))
  ) {
    return {
      runnable: false,
      reason: "definition_unregistered",
      message: "This selection uses a definition that is no longer registered.",
    };
  }
  if (
    (domain.composed && !user.permissions.actions.includes("report")) ||
    (domain.scopeColumn && !user.scope.some((scope) => scope.attribute === domain.scopeColumn)) ||
    !user.permissions.domains.includes(selection.domain) ||
    selection.measureIds.some((id) => !user.permissions.measureIds.includes(id)) ||
    [...dimensionIds].some((id) => !user.permissions.dimensionIds.includes(id))
  ) {
    return {
      runnable: false,
      reason: "grant_revoked",
      message: "You no longer have permission to run this selection.",
    };
  }
  return { runnable: true };
}
