import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import type { AskResponse, ConversationAnswerSnapshot, Selection } from "@3f/contract";
import { inArray } from "drizzle-orm";
import { createDb, createPool } from "../db/pool";
import { users } from "../db/schema";
import { ConversationsService } from "./conversations.service";

const pool = createPool();
const db = createDb(pool);
const service = new ConversationsService(db);
const createdUserIds: string[] = [];
let createdConversationTables = false;

before(async () => {
  const existing = await pool.query<{ conversations: string | null }>(
    "SELECT TO_REGCLASS('public.conversations')::text AS conversations",
  );
  if (existing.rows[0]?.conversations) return;

  await pool.query(`
    CREATE TABLE conversations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE conversation_turns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      ordinal integer NOT NULL,
      question text NOT NULL,
      selection jsonb NOT NULL,
      answer_snapshot jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  createdConversationTables = true;
});

after(async () => {
  if (createdUserIds.length > 0) await db.delete(users).where(inArray(users.id, createdUserIds));
  if (createdConversationTables) await pool.query("DROP TABLE conversation_turns, conversations");
  await pool.end();
});

test("a saved conversation reload keeps row labels exactly and drops the ephemeral drill link", async () => {
  const userId = randomUUID();
  createdUserIds.push(userId);
  await db.insert(users).values({
    id: userId,
    email: `conversation-snapshot-${userId}@example.invalid`,
    displayName: "Conversation Snapshot Test",
  });
  const conversation = await service.create(userId, "GL labels");
  const selection: Selection = {
    domain: "governed-financial",
    measureIds: ["governed-financial.actual"],
    dimensionIds: ["gl_code"],
    filters: [],
  };
  const answer: ConversationAnswerSnapshot & Pick<AskResponse, "drill"> = {
    title: "Actual by GL code",
    rowLabels: [
      {
        key: "50001201",
        label: "Sprout Cost - Imp",
        otherLabels: ["Imported sprouts"],
        hiddenOtherLabelCount: 12,
      },
    ],
    drill: { context: "signed.answer", rows: [{ key: "50001201", drillable: true }] },
  };

  await service.appendTurn(userId, conversation.id, {
    question: "Show Actual by GL code",
    selection,
    answer,
  });
  const reloaded = await service.getForUser(userId, conversation.id);

  assert.deepEqual(reloaded.turns[0]?.answer.rowLabels, answer.rowLabels);
  assert.equal("drill" in (reloaded.turns[0]?.answer ?? {}), false);
});
