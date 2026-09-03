import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminUsageGranularity,
  AdminUsageRow,
  AdminUsageSeriesResponse,
} from "@3f/contract";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { DRIZZLE_DB } from "../config";
import type { AppDb } from "../db/pool";
import { auditEvents, users } from "../db/schema";

@Injectable()
export class UsageService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: AppDb) {}

  async list(query: { from?: string; to?: string } = {}): Promise<AdminUsageRow[]> {
    const conditions: SQL[] = [
      inArray(auditEvents.eventType, ["request", "result"]),
      isNotNull(auditEvents.userId),
    ];
    if (query.from) conditions.push(gte(auditEvents.ts, new Date(query.from)));
    if (query.to) conditions.push(lte(auditEvents.ts, new Date(query.to)));

    const queryCount = sql<number>`count(*) filter (where ${auditEvents.eventType} = 'request')`;
    const inputTokens = sql<number>`coalesce(sum(${auditEvents.inputTokens}) filter (where ${auditEvents.eventType} = 'result'), 0)`;
    const outputTokens = sql<number>`coalesce(sum(${auditEvents.outputTokens}) filter (where ${auditEvents.eventType} = 'result'), 0)`;
    const totalTokens = sql<number>`coalesce(sum(${auditEvents.totalTokens}) filter (where ${auditEvents.eventType} = 'result'), 0)`;
    const lastActivityAt = sql<Date | null>`max(${auditEvents.ts})`;

    const rows = await this.db
      .select({
        userId: auditEvents.userId,
        email: users.email,
        queryCount,
        inputTokens,
        outputTokens,
        totalTokens,
        lastActivityAt,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.userId))
      .where(and(...conditions))
      .groupBy(auditEvents.userId, users.email)
      .orderBy(desc(totalTokens), desc(queryCount));

    return rows.map((row) => ({
      userId: row.userId!,
      email: row.email,
      queryCount: Number(row.queryCount),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
      totalTokens: Number(row.totalTokens),
      lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
    }));
  }

  async series(query: {
    from?: string;
    to?: string;
    userId?: string;
  } = {}): Promise<AdminUsageSeriesResponse> {
    const conditions: SQL[] = [
      inArray(auditEvents.eventType, ["request", "result"]),
      isNotNull(auditEvents.userId),
    ];
    if (query.from) conditions.push(gte(auditEvents.ts, new Date(query.from)));
    if (query.to) conditions.push(lte(auditEvents.ts, new Date(query.to)));
    if (query.userId) conditions.push(eq(auditEvents.userId, query.userId));

    const granularity = usageGranularity(query);
    const bucketStart = granularity === "day"
      ? sql<Date>`date_trunc('day', ${auditEvents.ts})`
      : sql<Date>`date_trunc('month', ${auditEvents.ts})`;
    const queryCount = sql<number>`count(*) filter (where ${auditEvents.eventType} = 'request')`;
    const inputTokens = sql<number>`coalesce(sum(${auditEvents.inputTokens}) filter (where ${auditEvents.eventType} = 'result'), 0)`;
    const outputTokens = sql<number>`coalesce(sum(${auditEvents.outputTokens}) filter (where ${auditEvents.eventType} = 'result'), 0)`;
    const totalTokens = sql<number>`coalesce(sum(${auditEvents.totalTokens}) filter (where ${auditEvents.eventType} = 'result'), 0)`;

    const rows = await this.db
      .select({ bucketStart, queryCount, inputTokens, outputTokens, totalTokens })
      .from(auditEvents)
      .where(and(...conditions))
      .groupBy(sql.raw("1"))
      .orderBy(sql.raw("1"));

    return {
      granularity,
      points: rows.map((row) => ({
        bucketStart: new Date(row.bucketStart).toISOString(),
        queryCount: Number(row.queryCount),
        inputTokens: Number(row.inputTokens),
        outputTokens: Number(row.outputTokens),
        totalTokens: Number(row.totalTokens),
      })),
    };
  }
}

function usageGranularity(query: { from?: string; to?: string }): AdminUsageGranularity {
  if (!query.from) return "month";
  const from = Date.parse(query.from);
  const to = query.to ? Date.parse(query.to) : Date.now();
  const sixtyTwoDays = 62 * 24 * 60 * 60 * 1000;
  return to - from <= sixtyTwoDays ? "day" : "month";
}
