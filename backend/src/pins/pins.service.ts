import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  AuthUser,
  ChartView,
  CreatePinRequest,
  MeasureSpec,
  Pin,
  PinSnapshot,
  Selection,
} from "@3f/contract";
import { DRIZZLE_DB } from "../config";
import type { AppDb } from "../db/pool";
import { dashboardPins, pinSnapshots } from "../db/schema";
import { computeDefinitionVersion } from "../semantic/definitionVersion";
import { SemanticLayer } from "../semantic/semanticLayer";
import { validateSelectionForUser } from "../semantic/selectionValidation";
import { PinRefreshService, toSnapshot } from "./pin-refresh.service";

@Injectable()
export class PinsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly semantic: SemanticLayer,
    @Optional() private readonly refresh?: PinRefreshService,
  ) {}

  async create(user: AuthUser, req: CreatePinRequest): Promise<Pin> {
    const selectedMeasures = validateSelectionForUser(this.semantic, user, req.selection);
    const definitionVersion = computeDefinitionVersion(selectedMeasures);
    const title = req.title?.trim() || this.defaultTitle(req.selection, selectedMeasures);

    const inserted = await this.db
      .insert(dashboardPins)
      .values({
        userId: user.id,
        title,
        selection: req.selection,
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

    const snapshot = await this.refresh?.refreshPin(inserted[0]).catch(() => undefined);
    return toPin(inserted[0], false, snapshot);
  }

  async list(user: AuthUser): Promise<Pin[]> {
    const rows = await this.db
      .select({ pin: dashboardPins, snapshot: pinSnapshots })
      .from(dashboardPins)
      .leftJoin(pinSnapshots, eq(pinSnapshots.pinId, dashboardPins.id))
      .where(eq(dashboardPins.userId, user.id))
      .orderBy(asc(dashboardPins.position), desc(dashboardPins.createdAt));

    return rows.map((row) =>
      toPin(
        row.pin,
        this.definitionChanged(row.pin),
        row.snapshot ? toSnapshot(row.snapshot) : undefined,
      ),
    );
  }

  async reorder(user: AuthUser, orderedIds: string[]): Promise<Pin[]> {
    const rows = await this.db
      .select({ id: dashboardPins.id })
      .from(dashboardPins)
      .where(eq(dashboardPins.userId, user.id));
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

    await this.db.transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx
          .update(dashboardPins)
          .set({ position: index })
          .where(and(eq(dashboardPins.id, id), eq(dashboardPins.userId, user.id)));
      }
    });

    return this.list(user);
  }

  async updateView(userId: string, id: string, view: ChartView): Promise<Pin> {
    const updated = await this.db
      .update(dashboardPins)
      .set({ viewPrefs: view })
      .where(and(eq(dashboardPins.id, id), eq(dashboardPins.userId, userId)))
      .returning();
    if (updated.length === 0) throw new NotFoundException("Pin not found");
    return toPin(updated[0], this.definitionChanged(updated[0]));
  }

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    const deleted = await this.db
      .delete(dashboardPins)
      .where(and(eq(dashboardPins.id, id), eq(dashboardPins.userId, user.id)))
      .returning({ id: dashboardPins.id });
    if (deleted.length === 0) throw new NotFoundException("Pin not found");
    return { ok: true };
  }

  private definitionChanged(row: DashboardPinRow): boolean {
    if (!row.definitionVersion) return false;
    const selection = row.selection;
    if (!isSelection(selection)) return true;

    const currentMeasures: MeasureSpec[] = [];
    for (const measureId of selection.measureIds) {
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

function toPin(row: DashboardPinRow, definitionChanged: boolean, snapshot?: PinSnapshot): Pin {
  return {
    id: row.id,
    title: row.title,
    selection: row.selection as Selection,
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
    ...(row.lastRefresh ? { lastRefresh: row.lastRefresh.toISOString() } : {}),
    ...(snapshot ? { snapshot } : {}),
  } as Pin;
}

function isSelection(value: unknown): value is Selection {
  return typeof value === "object" && value !== null && "domain" in value && "measureIds" in value && "dimensionIds" in value;
}
