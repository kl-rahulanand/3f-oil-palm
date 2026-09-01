import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import type { AuthUser, SaveQueryRequest, SavedQuery, Selection } from "@pulse/contract";
import { DRIZZLE_DB } from "../config";
import type { AppDb } from "../db/pool";
import { savedQueries } from "../db/schema";
import { SemanticLayer } from "../semantic/semanticLayer";
import { validateSelectionForUser } from "../semantic/selectionValidation";

@Injectable()
export class SavedService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: AppDb,
    private readonly semantic: SemanticLayer,
  ) {}

  async create(user: AuthUser, req: SaveQueryRequest): Promise<SavedQuery> {
    validateSelectionForUser(this.semantic, user, req.selection);

    const inserted = await this.db
      .insert(savedQueries)
      .values({
        userId: user.id,
        selection: req.selection,
        chartType: req.chartType,
      })
      .returning();

    return toSavedQuery(inserted[0]);
  }

  async list(user: AuthUser): Promise<SavedQuery[]> {
    const rows = await this.db
      .select()
      .from(savedQueries)
      .where(eq(savedQueries.userId, user.id))
      .orderBy(desc(savedQueries.createdAt));
    return rows.map(toSavedQuery);
  }

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    const deleted = await this.db
      .delete(savedQueries)
      .where(and(eq(savedQueries.id, id), eq(savedQueries.userId, user.id)))
      .returning({ id: savedQueries.id });
    if (deleted.length === 0) throw new NotFoundException("Saved query not found");
    return { ok: true };
  }
}

type SavedQueryRow = typeof savedQueries.$inferSelect;

function toSavedQuery(row: SavedQueryRow): SavedQuery {
  if (!isSelection(row.selection)) throw new BadRequestException("Stored saved query selection is invalid");
  return {
    id: row.id,
    selection: row.selection,
    ...(row.chartType ? { chartType: row.chartType as SavedQuery["chartType"] } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function isSelection(value: unknown): value is Selection {
  return typeof value === "object" && value !== null && "domain" in value && "measureIds" in value && "dimensionIds" in value;
}
