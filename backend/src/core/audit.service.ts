import { Inject, Injectable } from "@nestjs/common";
import type { ResponseClass, Selection } from "@3f/contract";
import { DRIZZLE_DB } from "../config";
import type { AppDb } from "../db/pool";
import { auditEvents } from "../db/schema";
import type { LlmUsage } from "../llm/llm.interface";

type DbExecutor =
  | AppDb
  | Parameters<Parameters<AppDb["transaction"]>[0]>[0];

export type AdminAuditAction =
  | "user.create"
  | "user.update"
  | "user.deactivate"
  | "grant.add"
  | "grant.remove"
  | "measure.create"
  | "measure.update"
  | "measure.validate"
  | "measure.publish";

export type AdminAuditTarget =
  | { type: "user"; id: string }
  | { type: "measure"; id: string; measureId: string; version: number }
  | {
      type: "grant";
      role: string;
      grantType: string;
      grantId: string;
    };

/**
 * Append-only audit EVENT log (eng review G1). Fail-closed: if the request event
 * cannot be written, the query MUST NOT execute - no audit, no query.
 * Note (G2): this store holds raw question text (possible PII); govern under DPDP
 * (encryption at rest, retention TTL, restricted access) - TODO before production.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: AppDb) {}

  /** Write the request event BEFORE execution. Throws on failure (caller fails closed). */
  async writeRequestEvent(e: {
    userId: string;
    sessionId: string;
    conversationId?: string;
    question: string;
    selection?: Selection;
    generatedSql?: string;
    objectsTouched?: string[];
  }): Promise<number> {
    const rows = await this.db
      .insert(auditEvents)
      .values({
        eventType: "request",
        userId: e.userId,
        sessionId: e.sessionId,
        conversationId: e.conversationId ?? null,
        question: e.question,
        selection: e.selection ?? null,
        generatedSql: e.generatedSql ?? null,
        objectsTouched: e.objectsTouched ?? null,
      })
      .returning({ id: auditEvents.id });
    return rows[0].id;
  }

  /** Write the result/error event AFTER execution. Best-effort (never blocks the answer). */
  async writeResultEvent(e: {
    userId: string;
    sessionId: string;
    responseClass: ResponseClass;
    latencyMs: number;
    usage?: LlmUsage;
  }): Promise<void> {
    try {
      await this.db.insert(auditEvents).values({
        eventType: "result",
        userId: e.userId,
        sessionId: e.sessionId,
        responseClass: e.responseClass,
        latencyMs: e.latencyMs,
        modelId: e.usage?.model ?? null,
        inputTokens: e.usage?.inputTokens ?? null,
        outputTokens: e.usage?.outputTokens ?? null,
        totalTokens: e.usage?.totalTokens ?? null,
      });
    } catch {
      // A missing result event is a monitoring gap, not a correctness/safety failure.
    }
  }

  async writeAuthEvent(e: {
    eventType: "auth.otp_requested" | "auth.otp_verified" | "auth.otp_failed";
    userId?: string;
    sessionId?: string;
  }): Promise<void> {
    await this.db.insert(auditEvents).values({
      eventType: e.eventType,
      userId: e.userId,
      sessionId: e.sessionId,
    });
  }

  /** Write an attributable admin mutation using the caller's transaction when provided. */
  async writeAdminEvent(e: {
    actorId: string;
    action: AdminAuditAction;
    target: AdminAuditTarget;
    detail: Record<string, unknown>;
  }, executor?: DbExecutor): Promise<void> {
    const db = executor ?? this.db;
    await db.insert(auditEvents).values({
      eventType: "admin.mutation",
      userId: e.actorId,
      selection: {
        action: e.action,
        target: e.target,
        detail: e.detail,
      },
    });
  }
}
