import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gte } from "drizzle-orm";
import { DRIZZLE_DB } from "../config";
import type { AppDb } from "../db/pool";
import { reconciliationRuns } from "../db/schema";

export type ReconStatus = "match" | "divergence" | "unavailable";

export interface ReconRunRecord {
  measureId: string;
  primaryValue: number | null;
  altValue: number | null;
  diff: number | null;
  withinTolerance: boolean;
  status: ReconStatus;
}

export interface ReconStore {
  record(run: ReconRunRecord): Promise<void>;
  divergenceCount(sinceIso?: string): Promise<number>;
}

@Injectable()
export class DrizzleReconStore implements ReconStore {
  constructor(@Inject(DRIZZLE_DB) private readonly db: AppDb) {}

  async record(run: ReconRunRecord): Promise<void> {
    await this.db.insert(reconciliationRuns).values({
      measureId: run.measureId,
      primaryValue: run.primaryValue === null ? null : String(run.primaryValue),
      altValue: run.altValue === null ? null : String(run.altValue),
      diff: run.diff,
      withinTolerance: run.withinTolerance,
      status: run.status,
    });
  }

  async divergenceCount(sinceIso?: string): Promise<number> {
    const filters = [
      eq(reconciliationRuns.withinTolerance, false),
      eq(reconciliationRuns.status, "divergence"),
    ];
    if (sinceIso) filters.push(gte(reconciliationRuns.ranAt, new Date(sinceIso)));
    const rows = await this.db
      .select({ count: count() })
      .from(reconciliationRuns)
      .where(and(...filters));
    return Number(rows[0]?.count ?? 0);
  }
}
