import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import type { MeasureSpec } from "@pulse/contract";
import { desc, eq } from "drizzle-orm";
import { DRIZZLE_DB } from "../config";
import type { AppDb } from "../db/pool";
import { authoredMeasures } from "../db/schema";

@Injectable()
export class AuthoredMeasureRegistry implements OnModuleInit {
  private publishedByDomain = new Map<string, MeasureSpec[]>();

  constructor(@Inject(DRIZZLE_DB) private readonly db: AppDb) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  published(domain: string): MeasureSpec[] {
    return this.publishedByDomain.get(domain) ?? [];
  }

  async reload(): Promise<void> {
    let rows: Array<{ domain: string; measureKey: string; spec: MeasureSpec | null }>;
    try {
      rows = await this.db
        .select({ domain: authoredMeasures.domain, measureKey: authoredMeasures.measureKey, spec: authoredMeasures.compiledSpec })
        .from(authoredMeasures)
        .where(eq(authoredMeasures.status, "published"))
        .orderBy(desc(authoredMeasures.version));
    } catch (error) {
      if (!isUndefinedTableError(error)) throw error;
      this.publishedByDomain = new Map();
      return;
    }
    const latest = new Map<string, { domain: string; spec: MeasureSpec }>();
    for (const row of rows) {
      if (row.spec && !latest.has(row.measureKey)) latest.set(row.measureKey, { domain: row.domain, spec: row.spec });
    }
    const next = new Map<string, MeasureSpec[]>();
    for (const item of latest.values()) {
      next.set(item.domain, [...(next.get(item.domain) ?? []), item.spec]);
    }
    this.publishedByDomain = next;
  }
}

function isUndefinedTableError(error: unknown): boolean {
  let current = error;
  while (current instanceof Error) {
    if ((current as Error & { code?: string }).code === "42P01") return true;
    current = current.cause;
  }
  return false;
}
