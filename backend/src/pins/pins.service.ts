import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  AuthUser,
  ChartView,
  CreatePinRequest,
  ExplorationSelectionStatus,
  MeasureSpec,
  Pin,
  Selection,
} from "@3f/contract";
import { DRIZZLE_DB } from "../config";
import { AuditService } from "../core/audit.service";
import type { AppDb } from "../db/pool";
import { dashboardPins } from "../db/schema";
import { computeDefinitionVersion } from "../semantic/definitionVersion";
import { canonicalizeSelection, operandMeasureIds } from "../semantic/measure-filter.helper";
import { SemanticLayer } from "../semantic/semanticLayer";
import { validateSelectionForUser } from "../semantic/selectionValidation";
import { selectionSchema } from "../saved/saved.schemas";

@Injectable()
export class PinsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly semantic: SemanticLayer,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, sessionId: string, req: CreatePinRequest): Promise<Pin> {
    await this.audit.writeExplorationRequestEvent({
      actorId: user.id,
      sessionId,
      resource: "pins",
      action: "create",
      submitted: req,
    });
    const domain = this.semantic.domain(req.selection.domain);
    if (!domain) validateSelectionForUser(this.semantic, user, req.selection);
    const selection = canonicalizeSelection(domain!, req.selection);
    const selectedMeasures = validateSelectionForUser(this.semantic, user, selection);
    const status = selectionStatus(this.semantic, user, selection);
    await this.auditRefusal(user, sessionId, undefined, status, "create");
    const definitionVersion = computeDefinitionVersion(selectedMeasures);
    const title = req.title?.trim() || this.defaultTitle(selection, selectedMeasures);

    const inserted = await this.db
      .insert(dashboardPins)
      .values({
        userId: user.id,
        title,
        selection,
        chartType: req.chartType,
        viewPrefs: req.view ?? null,
        definitionVersion,
        position: sql<number>`(
          SELECT COALESCE(MAX(${dashboardPins.position}), -1) + 1
          FROM ${dashboardPins}
          WHERE ${dashboardPins.userId} = ${user.id}
        )`,
      })
      .returning();

    return toPin(this.semantic, inserted[0], status, false);
  }

  async list(user: AuthUser, sessionId: string): Promise<Pin[]> {
    await this.audit.writeExplorationRequestEvent({ actorId: user.id, sessionId, resource: "pins", action: "list" });
    return this.listRows(user, sessionId);
  }

  async reorder(user: AuthUser, sessionId: string, orderedIds: string[]): Promise<Pin[]> {
    await this.audit.writeExplorationRequestEvent({
      actorId: user.id,
      sessionId,
      resource: "pins",
      action: "reorder",
      submitted: { orderedIds },
    });
    const rows = await this.db.select().from(dashboardPins).where(eq(dashboardPins.userId, user.id));
    const ownedIds = rows.map((row) => row.id);
    const ownedSet = new Set(ownedIds);
    const orderedSet = new Set(orderedIds);

    if (
      orderedIds.length !== ownedIds.length ||
      orderedSet.size !== orderedIds.length ||
      ownedIds.some((id) => !orderedSet.has(id)) ||
      orderedIds.some((id) => !ownedSet.has(id))
    ) {
      throw new BadRequestException("Pin order must include exactly the current user's pins");
    }

    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const pins = orderedIds.map((id, position) => {
      const row = rowsById.get(id)!;
      return toPin(
        this.semantic,
        { ...row, position },
        selectionStatus(this.semantic, user, row.selection),
        this.definitionChanged(row),
      );
    });
    await this.audit.writeExplorationRefusalEvents(
      pins.flatMap((pin) =>
        pin.status.runnable
          ? []
          : [
              {
                actorId: user.id,
                sessionId,
                resource: "pins",
                action: "reorder",
                submitted: { id: pin.id, reason: pin.status.reason },
              },
            ],
      ),
    );

    await this.db.transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx
          .update(dashboardPins)
          .set({ position: index })
          .where(and(eq(dashboardPins.id, id), eq(dashboardPins.userId, user.id)));
      }
    });

    return pins;
  }

  async updateView(user: AuthUser, sessionId: string, id: string, view: ChartView): Promise<Pin> {
    await this.audit.writeExplorationRequestEvent({
      actorId: user.id,
      sessionId,
      resource: "pins",
      action: "update_view",
      submitted: { id, view },
    });
    const rows = await this.db
      .select()
      .from(dashboardPins)
      .where(and(eq(dashboardPins.id, id), eq(dashboardPins.userId, user.id)));
    if (rows.length === 0) throw new NotFoundException("Pin not found");
    const status = selectionStatus(this.semantic, user, rows[0].selection);
    await this.auditRefusal(user, sessionId, rows[0].id, status, "update_view");

    const updated = await this.db
      .update(dashboardPins)
      .set({ viewPrefs: view })
      .where(and(eq(dashboardPins.id, id), eq(dashboardPins.userId, user.id)))
      .returning();
    if (updated.length === 0) throw new NotFoundException("Pin not found");
    return toPin(this.semantic, updated[0], status, this.definitionChanged(updated[0]));
  }

  async remove(user: AuthUser, sessionId: string, id: string): Promise<{ ok: true }> {
    await this.audit.writeExplorationRequestEvent({
      actorId: user.id,
      sessionId,
      resource: "pins",
      action: "delete",
      submitted: { id },
    });
    const deleted = await this.db
      .delete(dashboardPins)
      .where(and(eq(dashboardPins.id, id), eq(dashboardPins.userId, user.id)))
      .returning({ id: dashboardPins.id });
    if (deleted.length === 0) throw new NotFoundException("Pin not found");
    return { ok: true };
  }

  private async listRows(user: AuthUser, sessionId: string): Promise<Pin[]> {
    const rows = await this.db
      .select()
      .from(dashboardPins)
      .where(eq(dashboardPins.userId, user.id))
      .orderBy(asc(dashboardPins.position), desc(dashboardPins.createdAt));
    const pins = rows.map((row) => {
      const status = selectionStatus(this.semantic, user, row.selection);
      return toPin(this.semantic, row, status, this.definitionChanged(row));
    });
    await this.audit.writeExplorationRefusalEvents(
      pins.flatMap((pin) =>
        pin.status.runnable
          ? []
          : [
              {
                actorId: user.id,
                sessionId,
                resource: "pins",
                action: "list",
                submitted: { id: pin.id, reason: pin.status.reason },
              },
            ],
      ),
    );
    return pins;
  }

  private async auditRefusal(
    user: AuthUser,
    sessionId: string,
    id: string | undefined,
    status: ExplorationSelectionStatus,
    action: "create" | "list" | "update_view",
  ): Promise<void> {
    if (status.runnable) return;
    await this.audit.writeExplorationRefusalEvent({
      actorId: user.id,
      sessionId,
      resource: "pins",
      action,
      submitted: { ...(id ? { id } : {}), reason: status.reason },
    });
  }

  private definitionChanged(row: DashboardPinRow): boolean {
    if (!row.definitionVersion) return false;
    const selection = row.selection;
    if (!isSelection(selection)) return true;

    const currentMeasures: MeasureSpec[] = [];
    for (const measureId of operandMeasureIds(selection)) {
      const measure = this.semantic.measure(selection.domain, measureId);
      if (!measure) return true;
      currentMeasures.push(measure);
    }

    return row.definitionVersion !== computeDefinitionVersion(currentMeasures);
  }

  private defaultTitle(selection: Selection, measures: MeasureSpec[]): string {
    const domainLabel = this.semantic.domain(selection.domain)?.label ?? selection.domain;
    const measureLabels = measures.map((measure) => measure.label).join(", ");
    return `${measureLabels || "Pinned query"} - ${domainLabel}`;
  }
}

type DashboardPinRow = typeof dashboardPins.$inferSelect;

function toPin(
  semantic: SemanticLayer,
  row: DashboardPinRow,
  status: ExplorationSelectionStatus,
  definitionChanged: boolean,
): Pin {
  const stored = row.selection as Selection;
  return {
    id: row.id,
    title: row.title,
    selection: status.runnable ? canonicalizeSelection(semantic.domain(stored.domain)!, stored) : stored,
    status,
    ...(row.chartType ? { chartType: row.chartType as Pin["chartType"] } : {}),
    ...(row.viewPrefs
      ? { view: row.viewPrefs }
      : row.chartType
        ? { view: { chartType: row.chartType as Pin["chartType"] } }
        : {}),
    definitionVersion: row.definitionVersion ?? "",
    definitionChanged,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  };
}

function selectionStatus(semantic: SemanticLayer, user: AuthUser, value: unknown): ExplorationSelectionStatus {
  const parsed = selectionSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException("Stored pin selection is invalid");
  const selection = parsed.data;
  const measureIds = operandMeasureIds(selection);
  const dimensionIds = new Set([...selection.dimensionIds, ...selection.filters.map((filter) => filter.dimensionId)]);
  const domain = semantic.domain(selection.domain);
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
  if (
    (domain.composed && !user.permissions.actions.includes("report")) ||
    (domain.scopeColumn && !user.scope.some((scope) => scope.attribute === domain.scopeColumn)) ||
    !user.permissions.domains.includes(selection.domain) ||
    measureIds.some((id) => !user.permissions.measureIds.includes(id)) ||
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

function isSelection(value: unknown): value is Selection {
  return selectionSchema.safeParse(value).success;
}
