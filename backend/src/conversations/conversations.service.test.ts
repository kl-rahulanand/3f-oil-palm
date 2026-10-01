import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConversationAnswerSnapshot, Selection } from "@3f/contract";
import { ConversationsService } from "./conversations.service";

test("a conversation answer snapshot keeps applied measure filters when a turn is appended", async () => {
  const measureFilters: NonNullable<Selection["measureFilters"]> = [
    {
      measureId: "governed-financial.actual",
      op: "gt",
      compareTo: { kind: "measure", measureId: "governed-financial.budget" },
    },
  ];
  const selection: Selection = {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual", "governed-financial.budget"],
    dimensionIds: ["gl_code"],
    filters: [],
    measureFilters,
  };
  const answer: ConversationAnswerSnapshot = {
    title: "Actual and Budget",
    appliedMeasureFilters: measureFilters,
  };
  const service = new ConversationsService(conversationDb() as never);

  const turn = await service.appendTurn("user-1", "conversation-1", {
    question: "Which lines are over budget?",
    selection,
    answer,
  });

  assert.deepEqual(turn.answer.appliedMeasureFilters, measureFilters);
});

function conversationDb(): object {
  return {
    transaction: async (run: (tx: object) => Promise<unknown>) => run(conversationTransaction()),
  };
}

function conversationTransaction(): object {
  let inserted: Record<string, unknown> = {};
  const ownedSelect = {
    from: () => ({
      where: () => ({
        limit: () => ({ for: async () => [{ id: "conversation-1" }] }),
      }),
    }),
  };
  const ordinalSelect = {
    from: () => ({
      innerJoin: () => ({ where: async () => [{ ordinal: 0 }] }),
    }),
  };
  let selectCount = 0;

  return {
    select: () => {
      selectCount += 1;
      return selectCount === 1 ? ownedSelect : ordinalSelect;
    },
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        inserted = value;
        return {
          returning: async () => [
            {
              id: "turn-1",
              ordinal: inserted.ordinal,
              question: inserted.question,
              selection: inserted.selection,
              answer: inserted.answerSnapshot,
              createdAt: new Date("2026-09-17T00:00:00.000Z"),
            },
          ],
        };
      },
    }),
    update: () => ({
      set: () => ({ where: async () => undefined }),
    }),
  };
}
