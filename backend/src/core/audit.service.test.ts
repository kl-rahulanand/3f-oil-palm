import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { ResponseClass } from "@pulse/contract";
import { inArray } from "drizzle-orm";
import { createDb, createPool } from "../db/pool";
import { auditEvents } from "../db/schema";
import { AuditService } from "./audit.service";

const pool = createPool();
const db = createDb(pool);
const service = new AuditService(db);
const createdIds: number[] = [];

after(async () => {
  if (createdIds.length > 0) {
    await db.delete(auditEvents).where(inArray(auditEvents.id, createdIds));
  }
  await pool.end();
});

test("writeRequestEvent persists an optional conversationId without changing existing callers", async () => {
  const conversationId = randomUUID();
  const withConversation = await service.writeRequestEvent({
    userId: randomUUID(),
    sessionId: randomUUID(),
    conversationId,
    question: "Show leads by state",
  });
  const withoutConversation = await service.writeRequestEvent({
    userId: randomUUID(),
    sessionId: randomUUID(),
    question: "Show total leads",
  });
  createdIds.push(withConversation, withoutConversation);

  const rows = await db
    .select({
      id: auditEvents.id,
      conversationId: auditEvents.conversationId,
    })
    .from(auditEvents)
    .where(inArray(auditEvents.id, [withConversation, withoutConversation]));
  const byId = new Map(rows.map((row) => [row.id, row.conversationId]));

  assert.equal(byId.get(withConversation), conversationId);
  assert.equal(byId.get(withoutConversation), null);
});

test("writeResultEvent persists optional token usage columns", async () => {
  const userId = randomUUID();
  const sessionId = randomUUID();

  await service.writeResultEvent({
    userId,
    sessionId,
    responseClass: ResponseClass.Success,
    latencyMs: 123,
    usage: {
      model: "anthropic.claude-test",
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
  });

  const rows = await db
    .select({
      id: auditEvents.id,
      modelId: auditEvents.modelId,
      inputTokens: auditEvents.inputTokens,
      outputTokens: auditEvents.outputTokens,
      totalTokens: auditEvents.totalTokens,
    })
    .from(auditEvents)
    .where(inArray(auditEvents.userId, [userId]));
  createdIds.push(...rows.map((row) => row.id));

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: rows[0].id,
    modelId: "anthropic.claude-test",
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  });
});

test("writeResultEvent leaves token columns null when usage is omitted", async () => {
  const userId = randomUUID();
  const sessionId = randomUUID();

  await service.writeResultEvent({
    userId,
    sessionId,
    responseClass: ResponseClass.ClarificationNeeded,
    latencyMs: 45,
  });

  const rows = await db
    .select({
      id: auditEvents.id,
      modelId: auditEvents.modelId,
      inputTokens: auditEvents.inputTokens,
      outputTokens: auditEvents.outputTokens,
      totalTokens: auditEvents.totalTokens,
    })
    .from(auditEvents)
    .where(inArray(auditEvents.userId, [userId]));
  createdIds.push(...rows.map((row) => row.id));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].modelId, null);
  assert.equal(rows[0].inputTokens, null);
  assert.equal(rows[0].outputTokens, null);
  assert.equal(rows[0].totalTokens, null);
});
