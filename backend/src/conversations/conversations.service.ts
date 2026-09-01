import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, max } from "drizzle-orm";
import type {
  ConversationAnswerSnapshot,
  ConversationDetail,
  ConversationSummary,
  ConversationTurnView,
  Selection,
} from "@pulse/contract";
import { DRIZZLE_DB, loadConfig } from "../config";
import type { AppDb } from "../db/pool";
import { conversations, conversationTurns } from "../db/schema";

const DEFAULT_TITLE = "New chat";
const NOT_FOUND = "Conversation not found";
const CONVERSATION_HYDRATE_LIMIT = Math.max(
  1,
  Math.floor(loadConfig().conversationHydrateLimit),
);

export interface AppendConversationTurn {
  question: string;
  selection: Selection;
  answer: ConversationAnswerSnapshot;
}

@Injectable()
export class ConversationsService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: AppDb) {}

  async listForUser(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt));
    return rows.map(toSummary);
  }

  async getForUser(userId: string, id: string): Promise<ConversationDetail> {
    const conversationRows = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .limit(1);
    const conversation = conversationRows[0];
    if (!conversation) throw new NotFoundException(NOT_FOUND);

    // Bound reload payloads: hydrate only the newest configured turn window,
    // then reverse it below so the UI still receives chronological order.
    const turns = await this.db
      .select({
        id: conversationTurns.id,
        ordinal: conversationTurns.ordinal,
        question: conversationTurns.question,
        selection: conversationTurns.selection,
        answer: conversationTurns.answerSnapshot,
        createdAt: conversationTurns.createdAt,
      })
      .from(conversationTurns)
      .innerJoin(conversations, eq(conversations.id, conversationTurns.conversationId))
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .orderBy(desc(conversationTurns.ordinal))
      .limit(CONVERSATION_HYDRATE_LIMIT);

    return {
      ...toSummary(conversation),
      turns: turns.reverse().map(toTurn),
    };
  }

  async create(userId: string, title?: string): Promise<ConversationSummary> {
    const rows = await this.db
      .insert(conversations)
      .values({ userId, title: title?.trim() || DEFAULT_TITLE })
      .returning();
    return toSummary(rows[0]);
  }

  async rename(userId: string, id: string, title: string): Promise<ConversationSummary> {
    const rows = await this.db
      .update(conversations)
      .set({ title: title.trim(), updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning();
    if (rows.length === 0) throw new NotFoundException(NOT_FOUND);
    return toSummary(rows[0]);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const rows = await this.db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning({ id: conversations.id });
    if (rows.length === 0) throw new NotFoundException(NOT_FOUND);
    return { ok: true };
  }

  async appendTurn(
    userId: string,
    conversationId: string,
    input: AppendConversationTurn,
  ): Promise<ConversationTurnView> {
    return this.db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
          ),
        )
        .limit(1)
        .for("update");
      if (owned.length === 0) throw new NotFoundException(NOT_FOUND);

      const ordinalRows = await tx
        .select({ ordinal: max(conversationTurns.ordinal) })
        .from(conversationTurns)
        .innerJoin(conversations, eq(conversations.id, conversationTurns.conversationId))
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
          ),
        );
      const ordinal = (ordinalRows[0]?.ordinal ?? 0) + 1;

      const rows = await tx
        .insert(conversationTurns)
        .values({
          conversationId,
          ordinal,
          question: input.question,
          selection: input.selection,
          answerSnapshot: answerSnapshot(input.answer),
        })
        .returning({
          id: conversationTurns.id,
          ordinal: conversationTurns.ordinal,
          question: conversationTurns.question,
          selection: conversationTurns.selection,
          answer: conversationTurns.answerSnapshot,
          createdAt: conversationTurns.createdAt,
        });

      await tx
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
          ),
        );

      return toTurn(rows[0]);
    });
  }

  async replaceTurn(
    userId: string,
    conversationId: string,
    turnId: string,
    question: string,
    selection: Selection,
    answer: ConversationAnswerSnapshot,
  ): Promise<ConversationTurnView> {
    return this.db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: conversationTurns.id })
        .from(conversationTurns)
        .innerJoin(conversations, eq(conversations.id, conversationTurns.conversationId))
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
            eq(conversationTurns.id, turnId),
          ),
        )
        .limit(1)
        .for("update");
      if (owned.length === 0) throw new NotFoundException(NOT_FOUND);

      const rows = await tx
        .update(conversationTurns)
        .set({
          question,
          selection,
          answerSnapshot: answerSnapshot(answer),
        })
        .where(
          and(
            eq(conversationTurns.id, turnId),
            eq(conversationTurns.conversationId, conversationId),
          ),
        )
        .returning({
          id: conversationTurns.id,
          ordinal: conversationTurns.ordinal,
          question: conversationTurns.question,
          selection: conversationTurns.selection,
          answer: conversationTurns.answerSnapshot,
          createdAt: conversationTurns.createdAt,
        });

      await tx
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
          ),
        );

      return toTurn(rows[0]);
    });
  }

  async getRecentTurns(
    userId: string,
    conversationId: string,
    limit: number,
  ): Promise<ConversationTurnView[]> {
    const boundedLimit = Math.max(0, Math.floor(limit));
    const owned = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      )
      .limit(1);
    if (owned.length === 0) throw new NotFoundException(NOT_FOUND);
    if (boundedLimit === 0) return [];

    const rows = await this.db
      .select({
        id: conversationTurns.id,
        ordinal: conversationTurns.ordinal,
        question: conversationTurns.question,
        selection: conversationTurns.selection,
        answer: conversationTurns.answerSnapshot,
        createdAt: conversationTurns.createdAt,
      })
      .from(conversationTurns)
      .innerJoin(conversations, eq(conversations.id, conversationTurns.conversationId))
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      )
      .orderBy(desc(conversationTurns.ordinal))
      .limit(boundedLimit);

    return rows.reverse().map(toTurn);
  }
}

type ConversationRow = typeof conversations.$inferSelect;

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTurn(row: {
  id: string;
  ordinal: number;
  question: string;
  selection: Selection;
  answer: ConversationAnswerSnapshot;
  createdAt: Date;
}): ConversationTurnView {
  return {
    id: row.id,
    ordinal: row.ordinal,
    question: row.question,
    selection: row.selection,
    answer: row.answer,
    createdAt: row.createdAt.toISOString(),
  };
}

function answerSnapshot(answer: ConversationAnswerSnapshot): ConversationAnswerSnapshot {
  return {
    ...(answer.title === undefined ? {} : { title: answer.title }),
    ...(answer.chips === undefined ? {} : { chips: answer.chips }),
    ...(answer.result === undefined ? {} : { result: answer.result }),
    ...(answer.totals === undefined ? {} : { totals: answer.totals }),
    ...(answer.chartType === undefined ? {} : { chartType: answer.chartType }),
    ...(answer.provenance === undefined ? {} : { provenance: answer.provenance }),
    ...(answer.usedPriorContext === undefined
      ? {}
      : { usedPriorContext: answer.usedPriorContext }),
    ...(answer.availableFields === undefined ? {} : { availableFields: answer.availableFields }),
    ...(answer.appliedFilters === undefined ? {} : { appliedFilters: answer.appliedFilters }),
    ...(answer.appliedTimeWindow === undefined ? {} : { appliedTimeWindow: answer.appliedTimeWindow }),
  };
}
